#!/usr/bin/env python3
"""Admin für entrosana.app — das Gegenstück zu admin.py auf :8393.

Drei Bereiche, wie auf der .com-Seite:

  Seiten    die Fliesstexte der ausgelieferten Seiten. Geändert wird
            ausschliesslich Text zwischen den Tags; Markup, Klassen und
            Attribute bleiben Zeichen für Zeichen stehen. Wer < oder >
            eintippt, bekommt eine Ablehnung statt eines kaputten Gerüsts.
  Katalog   die Karten für Tools und Modules aus assets/catalogue.js.
            Auch hier nur Werte, nie Struktur.
  Design    Farben und Masse als verwalteter Block am Ende von app.css,
            nach demselben Muster wie auf entrosana.com.

Kein Neustart nötig: serve.mjs liest geänderte Dateien alle fünf Sekunden
neu ein. Was hier gespeichert wird, steht binnen Sekunden auf der Seite.

Gebunden wird auf die Tailscale-Adresse, nicht auf 0.0.0.0 — im WLAN ist
davon nichts zu sehen. Zusätzlich lässt der Quellcheck nur Loopback und
das Tailnet durch.
"""
import hmac, html, ipaddress, json, os, re, secrets, shutil, subprocess, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

HOME = Path.home()
APP = HOME / "entrosana-app"
CATALOGUE = APP / "assets" / "catalogue.js"
APP_CSS = APP / "assets" / "app.css"
BACKUPS = HOME / "entrosana-app-backups"
TOKEN_FILE = HOME / ".config" / "entrosana-app-admin.token"
# 8393 gehoert der Admin von entrosana.com, 8394 und 8395 sind belegt
# (ad-hoc http.server bzw. ein anderer Dienst) — deshalb 8396.
PORT = int(os.environ.get("PORT", 8396))
HOST = os.environ.get("HOST", "100.115.236.97")

# Reihenfolge und Beschriftung der Seiten. Die Liste ist bewusst von Hand
# gepflegt: sie bestimmt, was die Startseite anbietet, und hält
# Hilfsdateien wie detail.html (nur eine Hülle für den Katalog) heraus.
PAGES = [
    ("index.html", "Workspace", "/"),
    ("tools.html", "Tools", "/tools"),
    ("modules.html", "Modules", "/modules"),
    ("contribute.html", "Contribute", "/contribute"),
    ("projects.html", "Projects", "/projects"),
    ("records.html", "Record trail", "/records"),
    ("services.html", "Running services", "/services"),
    ("guidelines.html", "Guidelines", "/guidelines"),
]

if not TOKEN_FILE.exists():
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(secrets.token_urlsafe(24) + "\n")
    TOKEN_FILE.chmod(0o600)
TOKEN = TOKEN_FILE.read_text().strip()
TAILNET_OPEN = True   # Konsole im Tailnet ohne Schlüssel; _src_ok() lässt nur Loopback und 100.64.0.0/10 durch
# 2026-10-31 (Gap 2.1): im Tailnet nur Geräte des eigenen Kontos, nicht geteilte oder getaggte Knoten.
TAILNET_LOGINS = {x.strip() for x in os.environ.get("ADMIN_TAILNET_LOGINS", "Giansn@github").split(",") if x.strip()}
_WHOIS = {}   # ip -> (zeit, erlaubt)


def _tailnet_owner(ip: str) -> bool:
    hit = _WHOIS.get(ip)
    if hit and time.time() - hit[0] < 300:
        return hit[1]
    ok = False
    try:
        r = subprocess.run(["tailscale", "whois", "--json", ip], capture_output=True, text=True, timeout=5)
        w = json.loads(r.stdout) if r.returncode == 0 else {}
        ok = (w.get("UserProfile") or {}).get("LoginName") in TAILNET_LOGINS and not (w.get("Node") or {}).get("Tags")
    except Exception:
        ok = False
    _WHOIS[ip] = (time.time(), ok)
    return ok


def backup(p: Path) -> str:
    BACKUPS.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    dest = BACKUPS / f"{p.name}.{ts}"
    # Zwei Speicherungen in derselben Sekunde duerfen sich nicht ueberschreiben.
    k = 0
    while dest.exists():
        k += 1
        dest = BACKUPS / f"{p.name}.{ts}-{k}"
    shutil.copy2(p, dest)
    for old in sorted(BACKUPS.glob(f"{p.name}.*"))[:-20]:
        old.unlink()
    return dest.name


AENDERUNGEN = BACKUPS / "aenderungen"


def aenderungen_schreiben(quelle: str, eintraege: list) -> str:
    """Eine Datei je Speicherung, die nur das Geänderte enthält.

    eintraege = [(bezeichnung, vorher, nachher)]. Die vollständige Kopie
    macht backup(); hier steht, was sich unterscheidet — lesbar, damit man
    ohne Werkzeug sieht, was eine Speicherung angerichtet hat.
    """
    if not eintraege:
        return ""
    AENDERUNGEN.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    ziel = AENDERUNGEN / f"{quelle}.{ts}.txt"
    k = 0
    while ziel.exists():
        k += 1
        ziel = AENDERUNGEN / f"{quelle}.{ts}-{k}.txt"
    zeilen = [f"{quelle} · {time.strftime('%Y-%m-%d %H:%M:%S')} · "
              f"{len(eintraege)} Änderung{'en' if len(eintraege) != 1 else ''}", ""]
    for bez, vorher, nachher in eintraege:
        zeilen += [f"[{bez}]", f"- {vorher}", f"+ {nachher}", ""]
    ziel.write_text("\n".join(zeilen), encoding="utf-8")
    return ziel.name


# ── Textstellen in HTML ───────────────────────────────────────────────────
# Ein Durchlauf über die Datei: alles zwischen zwei Tags ist Text, ausser
# innerhalb von script, style, svg und Verwandten. Die Spannen werden als
# Positionen geführt, nie als Kopien — deshalb kann das Zurückschreiben die
# Datei nicht umbauen, es tauscht nur Ausschnitte.
TAG_RE = re.compile(
    r"<!--.*?-->|<![^>]*>|<(/?)([a-zA-Z][\w:-]*)((?:\"[^\"]*\"|'[^']*'|[^>\"'])*)(/?)>", re.S)
SKIP = {"script", "style", "svg", "noscript", "template"}


def spans(src):
    """[(start, end, umgebendes Tag, open_tag_start)] für jede Textstelle mit Inhalt.

    open_tag_start is the index of the enclosing element's opening '<'
    (or -1 if none), used to set per-field letter-size classes.
    """
    out, pos, skip, stack = [], 0, 0, []  # stack: [(name, open_start)]
    for m in TAG_RE.finditer(src):
        if skip == 0 and src[pos:m.start()].strip():
            parent = stack[-1][0] if stack else "?"
            open_start = stack[-1][1] if stack else -1
            out.append((pos, m.start(), parent, open_start))
        pos = m.end()
        name = (m.group(2) or "").lower()
        if not name:
            continue
        closing, selfclose = m.group(1) == "/", m.group(4) == "/"
        if name in SKIP:
            if closing:
                skip = max(0, skip - 1)
            elif not selfclose:
                skip += 1
        if skip == 0 and name not in ("br", "img", "input", "meta", "link", "hr"):
            if closing:
                if stack and stack[-1][0] == name:
                    stack.pop()
            elif not selfclose:
                stack.append((name, m.start()))
    if skip == 0 and src[pos:].strip():
        parent = stack[-1][0] if stack else "?"
        open_start = stack[-1][1] if stack else -1
        out.append((pos, len(src), parent, open_start))
    return out


def glatt(t: str) -> str:
    """Zeilenumbrüche und Einrückung der Datei zu einfachen Leerzeichen.

    Im Feld soll ein Satz als Satz stehen, nicht als Quelltext mit
    Einzügen. Beim Zurückschreiben bleibt eine unberührte Stelle trotzdem
    buchstabengleich: page_write vergleicht geglättet und lässt sie dann
    in Ruhe."""
    return re.sub(r"\s+", " ", t).strip()


# Per-field letter size. Each box gets its own <span class="fs-…"> so two
# fields in one <p> (e.g. split by <br>) can differ. CSP forbids inline styles.
FS_KEYS = ("xs", "sm", "md", "lg", "xl", "2xl")
FS_CLASS = {k: f"fs-{k}" for k in FS_KEYS}
FS_CLASS_RE = re.compile(r"\bfs-(?:xs|sm|md|lg|xl|2xl)\b")


def fs_from_open_tag(tag_html: str) -> str:
    m = FS_CLASS_RE.search(tag_html or "")
    if not m:
        return "md"
    return m.group(0)[3:]  # strip "fs-"


def _class_list(tag_html: str) -> list[str]:
    cm = re.search(r'\sclass=(["\'])(.*?)\1', tag_html or "", re.S)
    if not cm:
        return []
    return cm.group(2).split()


def is_fs_wrap_tag(tag_html: str) -> bool:
    """True if this is our dedicated size wrapper (<span class="fs-lg"> only)."""
    if not tag_html:
        return False
    m = re.match(r"<\s*([a-zA-Z][\w:-]*)", tag_html)
    if not m or m.group(1).lower() != "span":
        return False
    classes = _class_list(tag_html)
    return bool(classes) and all(FS_CLASS_RE.fullmatch(c) for c in classes)


def field_sized_html(text: str, size: str) -> str:
    """Plain text (+ optional <br>) wrapped so this box alone has a size."""
    size = size if size in FS_KEYS else "md"
    if size == "md":
        return text
    return f'<span class="{FS_CLASS[size]}">{text}</span>'


def page_read(name):
    src = (APP / name).read_text(encoding="utf-8")
    stellen = []
    for i, (a, b, t, open_start) in enumerate(spans(src)):
        size = "md"
        if open_start >= 0:
            m = TAG_RE.match(src, open_start)
            if m:
                size = fs_from_open_tag(m.group(0))
        stellen.append({
            "i": i,
            "tag": t,
            "text": glatt(src[a:b]),
            "size": size,
            "open_start": open_start,
        })
    return src, stellen


def bereiche(src):
    """[(start, ende, art)] für aside, header und section — ohne Verschachtelung."""
    out = []
    for tag in ("aside", "header", "section"):
        tiefe, offen = 0, None
        for m in re.finditer(rf"</?{tag}\b[^>]*>", src):
            if m.group(0).startswith("</"):
                tiefe -= 1
                if tiefe == 0 and offen is not None:
                    out.append((offen, m.end(), tag))
                    offen = None
            else:
                if tiefe == 0:
                    offen = m.start()
                tiefe += 1
    return out


def gruppiere(src, stellen):
    """[(titel, zu, [stelle,…], [hinweis,…])] — Stellen nach Abschnitt der Seite.

    Der Titel ist die erste Zeile des Abschnitts: auf diesen Seiten ist das
    die Augenbraue, also genau das Wort, unter dem man den Abschnitt sucht.
    Die Leiste kommt zugeklappt, sie ist auf allen Seiten dieselbe.
    """
    body = src.lower().find("<body")
    ber = bereiche(src)
    sp = spans(src)
    zuordnung = []
    for i, (a, b, _t, _open) in enumerate(sp):
        if a < body:
            zuordnung.append("kopf")
            continue
        passend = [(e - s2, k) for k, (s2, e, _art) in enumerate(ber) if s2 <= a < e]
        zuordnung.append(min(passend)[1] if passend else "rest")

    # Wo erzeugt JavaScript den Inhalt? Dort gibt es nichts zu tippen.
    js_orte = []
    for m in re.finditer(r'data-(cards|tabs|tabpanel)="([a-z-]+)"(?:[^>]*data-track="([a-z-]+)")?', src):
        js_orte.append((m.start(), m.group(2), m.group(3)))

    gruppen, gesehen = [], {}
    for i, st in enumerate(stellen):
        k = zuordnung[i]
        if k not in gesehen:
            if k == "kopf":
                titel, zu = "Kopfbereich · Titel und Beschreibung", True
            elif k == "rest":
                titel, zu = "Seitentext ausserhalb der Abschnitte", False
            else:
                s2, e, art = ber[k]
                titel = st["text"][:60] if st["text"] else art
                if art == "aside":
                    titel, zu = "Leiste · auf allen Seiten gleich", True
                elif art == "header":
                    titel, zu = "Kopfzeile der Seite", True
                else:
                    zu = False
            gesehen[k] = len(gruppen)
            hinweise = []
            if isinstance(k, int):
                s2, e, _art = ber[k]
                hinweise = [(abt, gleis) for pos, abt, gleis in js_orte if s2 <= pos < e]
            gruppen.append({"titel": titel, "zu": zu, "stellen": [], "js": hinweise})
        gruppen[gesehen[k]]["stellen"].append(st)
    return gruppen


LIVE = "https://entrosana.app"
# Root-absolute Verweise zeigen im Vorschaurahmen sonst auf den Editor und
# laufen ins Leere. Sie werden auf die Live-Adresse umgebogen, damit Stile,
# Schriften und Skripte dieselben sind wie auf der Seite.
ABS_RE = re.compile(r'(\s(?:href|src)=")/(?!/)')

PREVIEW_JS = """
<style>
.__ed{ outline:1px dashed rgba(43,212,232,.30); outline-offset:2px; cursor:pointer }
.__ed:hover{ outline-color:#2BD4E8; background:rgba(43,212,232,.10) }
.__ed.is-sel{ outline:2px solid #2BD4E8; background:rgba(43,212,232,.18) }
</style>
<script>
document.addEventListener("click", function (e) {
  var n = e.target.closest ? e.target.closest(".__ed") : null;
  if (!n) return;
  e.preventDefault(); e.stopPropagation();
  if (parent && parent.__waehle) parent.__waehle(n.getAttribute("data-i"));
}, true);
</script>
"""


def preview_html(name):
    """Die Seite, wie sie ist — nur jede Textstelle umschlossen und markiert."""
    src = (APP / name).read_text(encoding="utf-8")
    body = src.lower().find("<body")
    out = src
    for i, (a, b, _t, _open) in reversed(list(enumerate(spans(src)))):
        if a < body:                       # Kopfbereich bleibt unangetastet
            continue
        roh = src[a:b]
        vor = roh[:len(roh) - len(roh.lstrip())]
        nach = roh[len(roh.rstrip()):]
        kern = roh.strip()
        out = (out[:a] + vor + f'<span class="__ed" data-i="{i}">' + kern + "</span>"
               + nach + out[b:])
    out = ABS_RE.sub(r"\1" + LIVE + "/", out)
    # Die Vorschau holt Stile und Daten von der Live-Adresse. Ohne Frischemarke
    # zeigt sie den zwischengespeicherten Stand des Browsers — und damit unter
    # Umständen Texte, die längst geändert sind. Der Server ignoriert die
    # Abfrage (serve.mjs schneidet sie ab), der Browser nicht.
    marke = str(int(time.time()))
    out = re.sub(r'(' + re.escape(LIVE) + r'/assets/[^"?]+)"', r'\1?v=' + marke + '"', out)
    return out.replace("</body>", PREVIEW_JS + "</body>", 1)


# Line breaks in plain text fields: only these tokens may use angle brackets.
# Written into the HTML as real <br> so the page shows a break.
_BR_TOKEN = re.compile(r"<br\s*/?>", re.I)


def text_allows_markup(t: str) -> None:
    """Reject HTML except <br> / <br/> / <br /> (case-insensitive)."""
    cleaned = _BR_TOKEN.sub("", t)
    if "<" in cleaned or ">" in cleaned:
        raise ValueError(
            "Only line breaks with <br> are allowed; other < or > markup is rejected"
        )


def normalize_breaks(t: str) -> str:
    """Canonicalise break tokens to <br> before writing into the page."""
    return _BR_TOKEN.sub("<br>", t)


def apply_fs_class_strip(tag_html: str) -> str:
    """Remove fs-* classes from a tag (legacy parent-level sizes)."""
    cm = re.search(r'\sclass=(["\'])(.*?)\1', tag_html, re.S)
    if not cm:
        return tag_html
    quote, classes = cm.group(1), cm.group(2)
    parts = [c for c in classes.split() if not FS_CLASS_RE.fullmatch(c)]
    if parts:
        new_class = f' class={quote}{" ".join(parts)}{quote}'
    else:
        new_class = ""
    return tag_html[: cm.start()] + new_class + tag_html[cm.end() :]


def page_write(name, neu: list, sizes: dict | None = None):
    """neu = texts in page_read order. sizes = optional {index: xs|sm|md|lg|xl|2xl}.

    Each field gets its own <span class="fs-…"> so every box is independent
    (two text nodes in one <p> can have different sizes).
    """
    f = APP / name
    src = f.read_text(encoding="utf-8")
    sp = spans(src)
    if len(neu) != len(sp):
        raise ValueError(f"{len(neu)} Texte für {len(sp)} Stellen — abgelehnt")
    sizes = {str(k): v for k, v in (sizes or {}).items()}
    out = src
    geaendert = []

    for i in range(len(sp) - 1, -1, -1):
        a, b, tag, open_start = sp[i]
        t = neu[i]
        text_allows_markup(t)
        t = normalize_breaks(t.strip())
        alt = out[a:b]

        wrap_m = TAG_RE.match(out, open_start) if open_start >= 0 else None
        in_wrap = bool(wrap_m and is_fs_wrap_tag(wrap_m.group(0)))
        cur_size = fs_from_open_tag(wrap_m.group(0)) if wrap_m else "md"

        new_size = sizes[str(i)] if str(i) in sizes else cur_size
        if new_size not in FS_KEYS:
            new_size = "md"

        plain_same = (
            ("<br>" not in t and glatt(alt) == t)
            or normalize_breaks(alt.strip()) == t
            or alt.strip() == t
        )
        # Already correct: plain text + matching size, or sized wrap with same size+text
        if plain_same and new_size == cur_size:
            if in_wrap and new_size != "md":
                continue
            if not in_wrap and new_size == "md":
                continue

        new_html = field_sized_html(t, new_size)
        vor = alt[: len(alt) - len(alt.lstrip())]
        nach = alt[len(alt.rstrip()) :]

        if in_wrap:
            close = out.find("</span>", b)
            if close < 0:
                raise ValueError(f"Stelle {i + 1}: size wrapper not closed")
            start, end = open_start, close + len("</span>")
            out = out[:start] + new_html + out[end:]
        else:
            out = out[:a] + vor + new_html + nach + out[b:]
            # Remove legacy fs-* on the real parent (shared by siblings)
            if open_start >= 0:
                pm = TAG_RE.match(out, open_start)
                if pm and not is_fs_wrap_tag(pm.group(0)) and FS_CLASS_RE.search(pm.group(0)):
                    cleaned = apply_fs_class_strip(pm.group(0))
                    if cleaned != pm.group(0):
                        out = (
                            out[:open_start]
                            + cleaned
                            + out[open_start + len(pm.group(0)) :]
                        )

        if not plain_same:
            geaendert.append(
                (f"Stelle {i + 1} · <{tag}>", glatt(alt), glatt(_BR_TOKEN.sub(" ↵ ", t)))
            )
        if new_size != cur_size or (in_wrap != (new_size != "md")):
            geaendert.append((f"Stelle {i + 1} · size", cur_size, new_size))

    if out == src:
        return None
    b_name = backup(f)
    d_name = aenderungen_schreiben(name, list(reversed(geaendert)))
    f.write_text(out, encoding="utf-8")
    return f"{b_name} · Änderungen: {d_name}" if d_name else b_name


# ── Katalog ───────────────────────────────────────────────────────────────
# catalogue.js ist JavaScript mit Kommentaren, also nicht als JSON zu lesen
# und zurückzuschreiben, ohne die Kommentare zu verlieren. Deshalb dieselbe
# Technik wie bei den Seiten: Werte über ihre Position austauschen.
FIELDS = ("title", "who", "lede", "about", "note", "meta", "state", "area", "updated")
AREAS_UI = [("nature-based", "Nature"), ("social", "Social"), ("technical", "Technical"), ("other", "Other")]
# Stand eines Eintrags (2026-09-09): drei Worte für die Karte; die alten Werte bleiben gültig.
STATES = [("idea", "nur eine Idee · only an idea"), ("development", "noch in Entwicklung · still in development"), ("finished", "fertig · finished")]
STATE_LEGACY = {"available": "finished (bisher «available»)", "running": "running (Dienst)", "draft": "draft (Beitrag, alt)"}
STR_RE = re.compile(r'"(' + "|".join(FIELDS) + r')"\s*:\s*"((?:[^"\\]|\\.)*)"')
SLUG_RE = re.compile(r'"slug"\s*:\s*"([^"]*)"')


def cat_entries():
    src = CATALOGUE.read_text(encoding="utf-8")
    slugs = [(m.start(), m.group(1)) for m in SLUG_RE.finditer(src)]
    eintraege = {}
    # Grenzen: ein Feld gehört zum letzten Slug davor — aber nur, wenn zwischen
    # beiden kein Abschnittskopf liegt. Sonst schlägt der Titel des Abschnitts
    # «Tools» dem letzten Modules-Eintrag zu, und ein Speichern benennt den
    # Abschnitt um statt den Eintrag.
    koepfe = [m.start() for m in re.finditer(r'\n {1,2}"[a-z-]+":\s*\{', src)]
    for m in STR_RE.finditer(src):
        gehoert, seit = None, -1
        for pos, slug in slugs:
            if pos < m.start():
                gehoert, seit = slug, pos
            else:
                break
        if gehoert is None:
            continue
        if any(seit < k < m.start() for k in koepfe):
            continue
        e = eintraege.setdefault(gehoert, {"slug": gehoert, "felder": {}})
        e["felder"][m.group(1)] = (m.start(2), m.end(2), json.loads('"' + m.group(2) + '"'))
    # Abteilung und Gleis mitführen: der Seiteneditor blendet die Karten dort
    # ein, wo die Seite sie erzeugt, und muss dafür wissen, welche dazugehören.
    # Die Abschnitte stehen mit ein bis zwei Leerzeichen eingerückt (modules 1,
    # tools 2) — das Muster muss beides fassen, sonst fallen die Tools unter
    # Modules und die Karten erscheinen auf der falschen Seite.
    abschnitte = [(m.start(), m.group(1))
                  for m in re.finditer(r'\n {1,2}"([a-z-]+)":\s*\{', src)]
    for e in eintraege.values():
        pos = next(p for p, sl in slugs if sl == e["slug"])
        vor = [n for p, n in abschnitte if p < pos]
        e["abteilung"] = vor[-1] if vor else ""
        g = re.search(r'"track"\s*:\s*"([a-z-]+)"', src[pos:pos + 400])
        e["gleis"] = g.group(1) if g else ""
    return src, list(eintraege.values())


def cat_write(slug, werte: dict):
    src, eintraege = cat_entries()
    e = next((x for x in eintraege if x["slug"] == slug), None)
    if not e:
        raise ValueError(f"Eintrag {slug} nicht gefunden")
    if "state" in werte and werte["state"] not in dict(STATES) and werte["state"] not in STATE_LEGACY:
        raise ValueError("Stand unbekannt")
    if "area" in werte and werte["area"] not in dict(AREAS_UI):
        raise ValueError("Gebiet unbekannt")
    # Letzte Änderung: wird beim Speichern gesetzt, sofern der Eintrag das Feld trägt und sich sonst etwas ändert.
    if "updated" in e["felder"] and any(k in werte and werte[k] != e["felder"][k][2] for k in e["felder"] if k != "updated"):
        werte["updated"] = time.strftime("%Y-%m-%d")
    orte = sorted(((v[0], v[1], k) for k, v in e["felder"].items()), reverse=True)
    out = src
    geaendert = []
    for a, b, key in orte:
        if key not in werte:
            continue
        alt_wert = e["felder"][key][2]
        if alt_wert != werte[key]:
            geaendert.append((f"{slug} · {key}", alt_wert, werte[key]))
        neu = json.dumps(werte[key], ensure_ascii=False)[1:-1]
        out = out[:a] + neu + out[b:]
    if out == src:
        return None
    b_name = backup(CATALOGUE)
    d_name = aenderungen_schreiben(f"catalogue-{slug}", list(reversed(geaendert)))
    CATALOGUE.write_text(out, encoding="utf-8")
    return f"{b_name} · Änderungen: {d_name}" if d_name else b_name


# ── Design ────────────────────────────────────────────────────────────────
DESIGN_START = "/* === ENTROSANA-DESIGN-OVERRIDES (managed by admin /design; do not hand-edit) === */"
DESIGN_END = "/* === END ENTROSANA-DESIGN-OVERRIDES === */"
# Die Vorgaben sind die Werte, die heute in app.css stehen — nicht die von
# entrosana.com. Sonst würde ein Speichern mit unveränderten Feldern die
# Arbeitsfläche wieder abdunkeln (--paper steht dort bewusst heller).
DESIGN_DEFAULTS = {
    "seal": "#2BD4E8", "paper": "#21252C", "ink": "#E9EBE7",
    "light_seal": "#066675", "light_paper": "#CFE6EA", "light_ink": "#16181D",
    "wrap": 1140, "gutter": 3.0, "radius": 4, "size": 100,
}
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def design_read():
    css = APP_CSS.read_text(encoding="utf-8")
    m = re.search(r"/\* @design (\{.*?\}) \*/", css)
    if m:
        try:
            v = dict(DESIGN_DEFAULTS)
            v.update(json.loads(m.group(1)))
            return v
        except Exception:
            pass
    return dict(DESIGN_DEFAULTS)


def design_check(d):
    v = {}
    for k in ("seal", "paper", "ink", "light_seal", "light_paper", "light_ink"):
        c = str(d.get(k, DESIGN_DEFAULTS[k]))
        if not _HEX.match(c):
            raise ValueError(f"{k} muss #rrggbb sein")
        v[k] = c

    def num(k, lo, hi, cast):
        x = cast(d.get(k, DESIGN_DEFAULTS[k]))
        if not (lo <= x <= hi):
            raise ValueError(f"{k} ausserhalb {lo}..{hi}")
        return x

    v["wrap"] = num("wrap", 800, 1680, int)
    v["gutter"] = round(num("gutter", 0.0, 6.0, float), 2)
    v["radius"] = num("radius", 0, 40, int)
    v["size"] = num("size", 70, 140, int)
    return v


def design_css(v):
    gutter = f"clamp(1.25rem, .8rem + 2.5vw, {v['gutter']}rem)"
    return (DESIGN_START + "\n"
            + "/* @design " + json.dumps(v) + " */\n"
            + ":root{\n"
            + f"  --seal: {v['seal']};\n  --paper: {v['paper']};\n  --ink: {v['ink']};\n"
            + f"  --wrap: {v['wrap']}px;\n  --gutter: {gutter};\n  --radius: {v['radius']}px;\n"
            + f"  font-size: {v['size']}%;\n"
            + "}\n"
            + ':root[data-theme="light"]{\n'
            + f"  --seal: {v['light_seal']};\n  --paper: {v['light_paper']};\n  --ink: {v['light_ink']};\n"
            + "}\n"
            + DESIGN_END + "\n")


def design_write(v):
    css = APP_CSS.read_text(encoding="utf-8")
    i = css.find(DESIGN_START)
    if i != -1:
        j = css.find(DESIGN_END, i)
        if j == -1:
            raise ValueError("Der verwaltete Block hat keine Endmarke — bitte von Hand richten")
        css = css[:i].rstrip() + "\n" + css[j + len(DESIGN_END):].lstrip()
    css = css.rstrip() + "\n\n" + design_css(v)
    frueher = design_read()
    geaendert = [(k, str(frueher.get(k)), str(v[k])) for k in v if str(frueher.get(k)) != str(v[k])]
    b = backup(APP_CSS)
    d_name = aenderungen_schreiben("design", geaendert)
    APP_CSS.write_text(css, encoding="utf-8")
    return f"{b} · Änderungen: {d_name}" if d_name else b


# ── Oberfläche ────────────────────────────────────────────────────────────
CSS = """*{box-sizing:border-box}
body{margin:0;background:#1B1E24;color:#E9EBE7;font-family:Calibri,Carlito,'Segoe UI',sans-serif;padding:2rem}
.wrap{max-width:74rem;margin:0 auto}
h1,h2{font-weight:600;letter-spacing:-.02em} h1{font-size:1.9rem} h2{font-size:1.25rem;margin:2.4rem 0 .8rem}
.mono{font-family:'Geist Mono',ui-monospace,Menlo,monospace;font-size:.82rem;color:#8F95A1}
a{color:#2BD4E8;text-decoration:none} a:hover{text-decoration:underline}
table{width:100%;border-collapse:collapse;margin-top:.6rem}
td,th{padding:.6em .7em;border-bottom:1px solid #323843;vertical-align:top;text-align:left}
th{color:#8F95A1;font-weight:400;font-size:.82rem}
.btn{background:#2BD4E8;color:#071316;border:1px solid #2BD4E8;border-radius:999px;padding:.5em 1.1em;font:inherit;font-weight:600;cursor:pointer}
.btn.ghost{background:none;color:#C6CAD1;border-color:#5A6273}
.note{color:#8F95A1;font-size:.9rem;max-width:70ch;line-height:1.55}
.err{color:#DC7A6E} .ok{color:#35B36B}
.desc{color:#8F95A1;font-size:.86rem;line-height:1.45} .act{white-space:nowrap}
/* Entscheiden (2026-09-09): ein Block in Lesebreite, Auswahl in Textgrösse, Feld voll breit; auf dem Telefon dasselbe. */
.decide{display:grid;gap:.7rem;max-width:44rem;margin:.6rem 0}
.decide select{font:inherit;font-size:.95rem;padding:.5em .8em;background:#101318;color:#E9EBE7;border:1px solid #323843;border-radius:8px;width:max-content;min-width:16rem;max-width:100%}
.decide textarea{min-height:6rem}
select.stand{font:inherit;font-size:.95rem;padding:.5em .8em;background:#101318;color:#E9EBE7;border:1px solid #323843;border-radius:8px;min-width:18rem;max-width:100%}
textarea,input[type=text]{width:100%;background:#101318;color:#E9EBE7;border:1px solid #323843;border-radius:8px;padding:.55em .7em;font:inherit;font-size:.95rem}
textarea{min-height:3.4rem;resize:vertical}
label{display:block;margin:.9rem 0}
.f{display:grid;grid-template-columns:4.2rem minmax(0,1fr);gap:.7rem;align-items:start;margin:.35rem 0;padding-bottom:.35rem;border-bottom:1px solid #262b33}
.f .k{color:#8F95A1;font-family:'Geist Mono',ui-monospace,monospace;font-size:.7rem;padding-top:.5em}
.f.is-sel{background:rgba(43,212,232,.07);border-radius:6px}
.f.is-sel .k{color:#2BD4E8}
.f textarea,.f input{font-size:.9rem;padding:.35em .55em}
.f textarea{min-height:2.2rem}
.f.zeichen input{width:5rem;text-align:center}
/* Zwei Spalten: links die Felder, rechts die Seite. Die Vorschau bleibt
   stehen, waehrend die Felder scrollen. */
.zwei{display:grid;grid-template-columns:minmax(24rem,40%) 10px minmax(0,1fr);gap:.7rem;align-items:start}
/* Zugeklappt bekommen die Felder die ganze Breite. */
.zwei.zu{grid-template-columns:minmax(0,1fr)}
.zwei.zu .vorschau{display:none}
.zwei.zu .felder{max-height:none}
/* Teilung mit der Maus verschiebbar. */
.griff{width:10px;cursor:col-resize;align-self:stretch;position:relative}
.griff::after{content:"";position:absolute;left:4px;top:0;bottom:0;width:2px;background:#323843;border-radius:2px}
.griff:hover::after{background:#2BD4E8}
.zwei.zu .griff{display:none}
/* Gruppen: der Aufbau der Seite, nicht eine Reihe von Feldern. */
.grp{border:1px solid #262b33;border-radius:10px;margin:.5rem 0;background:rgba(255,255,255,.015)}
.grp>summary{cursor:pointer;padding:.55rem .8rem;font-size:.92rem;color:#C6CAD1;list-style:none}
.grp>summary::-webkit-details-marker{display:none}
.grp>summary::before{content:"▸ ";color:#2BD4E8}
.grp[open]>summary::before{content:"▾ "}
.grp>summary b{color:#E9EBE7;font-weight:600}
.grp>summary .n{color:#8F95A1;font-family:'Geist Mono',ui-monospace,monospace;font-size:.74rem;margin-left:.4rem}
.grp>div{padding:0 .8rem .5rem}
.js-hinweis{margin:.5rem 0;padding:.55rem .7rem;border:1px dashed #5A6273;border-radius:8px;
  font-size:.86rem;color:#8F95A1}
.js-hinweis a{margin-right:.6rem}
.kat{border-left:2px solid #2BD4E8;padding-left:.7rem;margin:.5rem 0}
.kat__t{color:#2BD4E8;font-size:.74rem;margin-bottom:.2rem}
.felder{max-height:calc(100vh - 15rem);overflow-y:auto;overflow-x:hidden;min-width:0;padding-right:.6rem}
.vorschau{position:sticky;top:1rem;height:calc(100vh - 13rem);border:1px solid #323843;border-radius:12px;overflow:hidden;background:#21252C}
.vorschau iframe{width:100%;height:100%;border:0;display:block}
@media(max-width:1100px){.zwei{grid-template-columns:1fr}.vorschau{position:static;height:60vh}}
.entwurf{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin:.8rem 0;
  padding:.7rem .9rem;border:1px solid #2BD4E8;border-radius:10px;
  background:rgba(43,212,232,.08);font-size:.92rem}
.entwurf[hidden]{display:none}
.fehler{margin:.8rem 0;padding:.7rem .9rem;border:1px solid #DC7A6E;border-radius:10px;
  background:rgba(220,122,110,.10);color:#F0B3AA;font-size:.92rem}
.fehler[hidden]{display:none}
.bar{position:sticky;bottom:0;background:#1B1E24;border-top:1px solid #323843;padding:1rem 0;margin-top:1.5rem}
/* Telefon (2026-09-08): Tabellen werden Blöcke, Kopfzeilen verschwinden, Knöpfe
   und Felder bekommen Fingerhöhe. */
@media (max-width:760px){
  body{padding:1rem .9rem}
  h1{font-size:1.35rem;line-height:1.25} h2{font-size:1.1rem;margin:1.6rem 0 .6rem}
  table,tbody,tr,td{display:block;width:100%}
  thead,th,tr:has(th):not(:has(td)){display:none}
  tr{border-bottom:1px solid #323843;padding:.7rem 0}
  tr:last-child{border-bottom:0}
  td{border:0;padding:.2rem 0}
  td:empty{display:none}
  td.mono:first-child{color:#2BD4E8}
  .btn{padding:.75em 1.3em;margin:.25rem .25rem .25rem 0;min-height:44px}
  .bar{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
  .f{grid-template-columns:1fr}
  pre{white-space:pre-wrap;word-break:break-word;font-size:.95rem}
  .mono{overflow-wrap:anywhere}
  select,textarea,input[type=text]{font-size:1rem}
}
"""


def page(title, body):
    return (f"<!DOCTYPE html><html lang=de><head><meta charset=utf-8>"
            f"<meta name=viewport content='width=device-width,initial-scale=1'>"
            f"<title>{html.escape(title)}</title><style>{CSS}</style></head>"
            f"<body><div class='wrap'>{body}</div></body></html>")


def _beitraege_kurz():
    code, j = api_call("GET", "/api/contributions")
    if code != 200:
        return f"<p class='err'>api/: {html.escape(str(j.get('error', code)))}</p>"
    offen = [c for c in j.get("items", []) if c["status"] in ("received", "confirmed", "reviewing")]
    acode, aj = api_call("GET", "/api/applications")
    bew = len(aj.get("items", [])) if acode == 200 else "?"
    kcode, kj = api_call("GET", "/api/actors")
    konten = len([a for a in kj.get("items", []) if a.get("kind") == "email"]) if kcode == 200 else "?"
    rcode, rj = api_call("GET", "/api/requests")
    anfragen = len(rj.get("items", [])) if rcode == 200 else "?"
    icode, ij = api_call("GET", "/api/invites")
    einl = len(ij.get("items", [])) if icode == 200 else "?"
    einl_offen = len([i for i in ij.get("items", []) if not i.get("accepted")]) if icode == 200 else "?"
    mcode, mj = api_call("GET", "/api/modules/meta")
    module = len(mj.get("items", {})) if mcode == 200 else "?"
    punkte = sum(v.get("points", 0) for v in mj.get("items", {}).values()) if mcode == 200 else "?"
    kdateien = sum(int(a.get("files") or 0) for a in kj.get("items", [])) if kcode == 200 else "?"
    kbytes = sum(int(a.get("files_bytes") or 0) for a in kj.get("items", [])) if kcode == 200 else 0
    scode, sj = api_call("GET", "/api/services")
    dienste = len(sj.get("items", [])) if scode == 200 else "?"
    dienste_ab = len([s for s in sj.get("items", []) if s.get("state") in ("warn", "off")]) if scode == 200 else "?"
    maschine = len((sj.get("machine") or {}).get("services", [])) if scode == 200 else "?"
    return (f"<table><tr><td><b>Schlange</b><br><span class='mono'>{len(offen)} offen · {len(j.get('items', []))} gesamt</span></td>"
            "<td><a href='/contributions'>öffnen</a></td><td></td><td></td></tr>"
            f"<tr><td><b>Bewerbungen</b><br><span class='mono'>{bew} offen</span></td>"
            "<td><a href='/applications'>öffnen</a></td><td></td><td></td></tr>"
            f"<tr><td><b>Konten</b><br><span class='mono'>{konten} Personen</span></td>"
            "<td><a href='/accounts'>öffnen</a></td><td></td><td></td></tr>"
            f"<tr><td><b>Anfragen</b><br><span class='mono'>{anfragen} offen · gingen an info@</span></td>"
            "<td><a href='/requests'>öffnen</a></td><td></td><td></td></tr>"
            f"<tr><td><b>Einladungen</b><br><span class='mono'>{einl_offen} offen · {einl} gesamt</span></td>"
            "<td><a href='/invites'>öffnen</a></td><td></td><td></td></tr>"
            f"<tr><td><b>Module aus Beiträgen</b><br><span class='mono'>{module} Module · {punkte} Punkte</span></td>"
            "<td><a href='/modules'>öffnen</a></td><td></td><td></td></tr>"
            f"<tr><td><b>Dienste</b><br><span class='mono'>{dienste} in Konten, {dienste_ab} gestört · {maschine} auf der Maschine</span></td>"
            "<td><a href='/services'>öffnen</a></td><td></td><td></td></tr>"
            f"<tr><td><b>Dateien der Konten</b><br><span class='mono'>{kdateien} Dateien, {_mb(kbytes)} · je Konto {_mb(kj.get('quota') or 0) if kcode == 200 else '?'}</span></td>"
            "<td><a href='/accounts'>Konten</a></td><td></td><td></td></tr></table>")


def dash():
    zeilen = ""
    for name, label, pfad in PAGES:
        if not (APP / name).exists():
            continue
        _, stellen = page_read(name)
        zeilen += (f"<tr><td><b>{label}</b><br><span class='mono'>{pfad}</span></td>"
                   f"<td class='mono'>{len(stellen)} Textstellen</td>"
                   f"<td><a href='/page/{name}'>Texte bearbeiten</a></td>"
                   f"<td><a href='https://entrosana.app{pfad}' target='_blank'>ansehen</a></td></tr>")
    _, eintraege = cat_entries()
    krows = ""
    for e in sorted(eintraege, key=lambda x: x["slug"]):
        titel = e["felder"].get("title", (0, 0, e["slug"]))[2]
        krows += (f"<tr><td><b>{html.escape(titel)}</b><br><span class='mono'>{e['slug']}</span></td>"
                  f"<td class='mono'>{len(e['felder'])} Felder</td>"
                  f"<td><a href='/catalogue/{e['slug']}'>bearbeiten</a></td><td></td></tr>")
    act = subprocess.run(["systemctl", "--user", "is-active", "entrosana-app"],
                         capture_output=True, text=True).stdout.strip() or "unbekannt"
    return page("entrosana.app admin",
        "<h1>entro<span style='color:#2BD4E8'>sana</span>.app admin</h1>"
        f"<p class='mono'>Dienst entrosana-app: {act} &middot; serve.mjs liest Änderungen alle 5 Sekunden neu ein</p>"
        "<h2>Seiten</h2>"
        "<p class='note'>Geändert wird ausschliesslich Text zwischen den Tags. Markup, Klassen und "
        "Attribute bleiben unberührt. Zeilenumbruch: <span class='mono'>&lt;br&gt;</span> ist erlaubt; "
        "andere spitze Klammern werden abgelehnt.</p>"
        f"<table>{zeilen}</table>"
        "<h2>Docs</h2>"
        "<p class='note'>docs.entrosana.app aus <span class='mono'>docs-site/</span>, die Entwicklungskopie auf atrium.entrosana.com/docs aus <span class='mono'>docs-dev/</span>; "
        "gerendert von serve.mjs, Änderungen sind sofort da. «dev → live übernehmen» kopiert eine Seite mit Sicherung.</p>"
        + docs_rows() +
        "<h2>Katalog</h2>"
        "<p class='note'>Die Karten für Tools und Modules aus <span class='mono'>assets/catalogue.js</span>. "
        "Diese Texte erscheinen auf der Übersicht und auf der Detailseite des Eintrags.</p>"
        f"<table>{krows}</table>"
        "<h2>Checklisten</h2>"
        "<p class='note'>Die Vorlagen der Projektverwaltung aus <span class='mono'>assets/seeds.js</span>: Titel, Schritte, Kartenzeilen, "
        "Details und die Prompts des Vorschlagsformulars.</p>"
        "<table><tr><td><b>Checklisten</b><br><span class='mono'>tools · modules · hub</span></td>"
        "<td><a href='/checklists'>öffnen</a></td><td></td><td></td></tr></table>"
        "<h2>Beiträge, Bewerbungen, Konten, Anfragen</h2>"
        + _beitraege_kurz() +
        "<h2>Abgleich</h2>"
        + (lambda r: f"<table><tr><td><b>Stündlich mit GitHub</b><br><span class='mono'>zuletzt {html.escape(str(r.get('t', ''))[:16].replace('T', ' ')) + ' UTC · ' + html.escape(str(r.get('text', ''))) if r else 'noch kein Lauf'}</span></td>"
                     "<td><a href='/sync'>öffnen</a></td><td></td><td></td></tr></table>")(sync_last()) +
        "<h2>Gestaltung</h2>"
        "<table><tr><td><b>Design controls</b><br><span class='mono'>Farbe &middot; Raster &middot; Schriftgrösse</span></td>"
        "<td class='mono'>assets/app.css</td>"
        "<td><a href='/design'>öffnen</a></td><td></td></tr></table>"
        "<p class='note' style='margin-top:2rem'>Jede Speicherung legt vorher eine Kopie in "
        "<span class='mono'>~/entrosana-app-backups</span> ab, die letzten 20 je Datei.</p>")


def entwurf_js(key: str, sel: str, attr: str) -> str:
    """Entwurf im Browser halten, anbieten, nach erfolgreicher Speicherung löschen.

    key  Speicherschlüssel, je Seite oder Katalogeintrag einer.
    sel  Behälter der Felder. attr  das Attribut, das ein Feld kennzeichnet.
    """
    return (
        "var KEY=" + json.dumps("entrosana-admin-draft:" + key) + ";"
        "var FELDER=function(){return document.querySelectorAll(" + json.dumps(sel + " [" + attr + "]") + ")};"
        "function sammle(){var n=FELDER(),v={};"
        "for(var i=0;i<n.length;i++)v[n[i].getAttribute(" + json.dumps(attr) + ")]=n[i].value;return v;}"
        "var GESPEICHERT=JSON.stringify(sammle());"
        "function schmutzig(){return JSON.stringify(sammle())!==GESPEICHERT;}"
        "function entwurfSchreiben(){try{if(schmutzig())"
        "localStorage.setItem(KEY,JSON.stringify({t:new Date().toISOString(),v:sammle()}));"
        "else localStorage.removeItem(KEY);}catch(e){}}"
        "function entwurfLoeschen(){try{localStorage.removeItem(KEY)}catch(e){}}"
        "function einsetzen(v){var n=FELDER();for(var i=0;i<n.length;i++){"
        "var k=n[i].getAttribute(" + json.dumps(attr) + ");if(k in v)n[i].value=v[k];}}"
        # Beim Öffnen: liegt ein Entwurf vor, der von der Datei abweicht, wird er angeboten.
        "(function(){var roh=null;try{roh=localStorage.getItem(KEY)}catch(e){}"
        "if(!roh)return;var d=null;try{d=JSON.parse(roh)}catch(e){entwurfLoeschen();return;}"
        "if(!d||!d.v)return;"
        "var gleich=JSON.stringify(d.v)===JSON.stringify(sammle());"
        "if(gleich){entwurfLoeschen();return;}"
        "var bar=document.getElementById('entwurf');if(!bar)return;"
        "var wann=d.t?new Date(d.t).toLocaleString():'unbekannt';"
        "bar.innerHTML='<b>Ungesicherter Entwurf gefunden</b> <span class=mono>'+wann+"
        "'</span> &mdash; die Datei zeigt einen anderen Stand.';"
        "var a=document.createElement('button');a.className='btn';a.textContent='Entwurf übernehmen';"
        "a.onclick=function(){einsetzen(d.v);bar.hidden=true;};"
        "var b=document.createElement('button');b.className='btn ghost';b.textContent='verwerfen';"
        "b.onclick=function(){entwurfLoeschen();bar.hidden=true;};"
        "bar.appendChild(a);bar.appendChild(b);bar.hidden=false;})();"
        # Jede Eingabe hält den Entwurf nach.
        "(function(){var n=FELDER();for(var i=0;i<n.length;i++){"
        "n[i].addEventListener('input',entwurfSchreiben);}})();"
        "window.addEventListener('beforeunload',function(e){if(schmutzig()){"
        "entwurfSchreiben();e.preventDefault();e.returnValue='';}});"
        "function fehlerZeigen(t){var f=document.getElementById('fehler');if(!f)return;"
        "f.innerHTML='<b>Nicht gespeichert:</b> '+t+'<br>Der Text steht weiterhin in den Feldern "
        "und liegt als Entwurf im Browser. Nochmal auf Speichern drücken genügt.';f.hidden=false;}"
        "function fehlerWeg(){var f=document.getElementById('fehler');if(f)f.hidden=true;}"
    )


def page_editor(name, msg="", err=""):
    label = next((l for n, l, _ in PAGES if n == name), name)
    pfad = next((p for n, _, p in PAGES if n == name), "/")
    src, stellen = page_read(name)
    _, katalog = cat_entries()

    def feld(st):
        text = st["text"]
        zeichen = len(text) <= 2
        kurz = len(text) <= 60
        rows = max(2, min(8, len(text) // 60 + 1))
        eingabe = (f"<input type=text data-i='{st['i']}' data-key='p:{st['i']}' "
                   f"value=\"{html.escape(text, quote=True)}\">"
                   if kurz else
                   f"<textarea data-i='{st['i']}' data-key='p:{st['i']}' rows='{rows}'>"
                   f"{html.escape(text)}</textarea>")
        return (f"<div class='f{' zeichen' if zeichen else ''}' id='f{st['i']}'>"
                f"<div class='k'>{html.escape(st['tag'])}</div><div>{eingabe}</div></div>")

    schon_da = set()

    def katalogfelder(abteilung, gleis):
        """Die Karten stehen nicht in der Datei, sondern in catalogue.js.
        Sie gehören trotzdem hierher: wer die Seite bearbeitet, will jede
        Zeile ändern können, die er sieht — nicht nur die aus dem Markup."""
        # Zuordnung über den Abschnitt im Katalog: der Slug der Seite ist die
        # Abteilung (modules, tools), das Gleis unterscheidet fertig von auf Anfrage.
        passend = [e for e in katalog if e["abteilung"] == abteilung
                   and (not gleis or e["gleis"] == gleis)]
        # Ein Behälter ohne Gleis (die Tafel der Gebiete) fasst dieselben
        # Einträge nochmals: jeder Eintrag erscheint nur beim ersten Mal.
        passend = [e for e in passend if e["slug"] not in schon_da]
        for e in passend:
            schon_da.add(e["slug"])
        if not passend:
            return ""
        out = ("<div class='js-hinweis'>Diese Texte stehen in "
               "<span class='mono'>assets/catalogue.js</span> und werden beim Laden erzeugt. "
               "Hier bearbeitbar, gespeichert wird mit derselben Schaltfläche.</div>")
        namen = {"title": "Titel", "who": "Kurzkennung", "lede": "Kernsatz",
                 "about": "Beschreibung", "note": "Zusatz", "meta": "Fussnote"}
        for e in sorted(passend, key=lambda x: x["slug"]):
            out += f"<div class='kat'><div class='kat__t mono'>{html.escape(e['slug'])}</div>"
            for k in FIELDS:
                if k not in e["felder"]:
                    continue
                wert = e["felder"][k][2]
                schl = f"c:{e['slug']}:{k}"
                lang = len(wert) > 60
                eing = (f"<textarea data-key='{schl}' rows='{max(2, min(8, len(wert)//60+1))}'>"
                        f"{html.escape(wert)}</textarea>" if lang else
                        f"<input type=text data-key='{schl}' "
                        f"value='{html.escape(wert, quote=True)}'>")
                out += (f"<div class='f'><div class='k'>{namen[k]}</div><div>{eing}</div></div>")
            out += "</div>"
        return out

    bloecke = ""
    gruppen = gruppiere(src, stellen)
    # Die Leiste ist auf jeder Seite dieselbe: eigener Block, ganz unten,
    # damit sie den Inhalt der Seite nicht auseinanderschiebt.
    gruppen = [g for g in gruppen if "Leiste" not in g["titel"]] +               [g for g in gruppen if "Leiste" in g["titel"]]
    for g in gruppen:
        inhalt = "".join(feld(st) for st in g["stellen"])
        for abt, gleis in g["js"]:
            inhalt += katalogfelder(abt, gleis)
        bloecke += (f"<details class='grp'{'' if g['zu'] else ' open'}>"
                    f"<summary><b>{html.escape(g['titel'])}</b>"
                    f"<span class='n'>{len(g['stellen'])} Felder</span></summary>"
                    f"<div>{inhalt}</div></details>")

    return page(f"{label} · entrosana.app",
        f"<p><a href='/'>&larr; Übersicht</a></p><h1>{html.escape(label)}</h1>"
        f"<p class='mono'>{name} &middot; {len(stellen)} Textstellen &middot; "
        f"Klick in die Seite rechts springt ins Feld, Tippen ändert die Vorschau sofort</p>"
        + (f"<p class='ok'>{html.escape(msg)}</p>" if msg else "")
        + (f"<p class='err'>{html.escape(err)}</p>" if err else "")
        + "<div id='entwurf' class='entwurf' hidden></div>"
        + "<div id='fehler' class='fehler' hidden></div>"
        + "<div class='zwei'>"
        + f"<div class='felder' id='fs'>{bloecke}</div>"
        + "<div class='griff' id='griff' title='Teilung verschieben'></div>"
        + f"<div class='vorschau'><iframe id='pv' src='/preview/{name}'></iframe></div>"
        + "</div>"
        "<div class='bar'><button class='btn' id='save'>Speichern</button> "
        "<button class='btn ghost' id='klapp'>Vorschau ausblenden</button> "
        f"<a class='btn ghost' href='https://entrosana.app{pfad}' target='_blank'>Seite öffnen</a> "
        "<a class='btn ghost' href='/'>Zurück</a> "
        "<span id='m' class='mono' style='margin-left:1rem'></span></div>"
        "<script>"
        + entwurf_js(name, "#fs", "data-key") +
        "var ZU='entrosana-admin-vorschau-zu',BR='entrosana-admin-breite';"
        "var zwei=document.querySelector('.zwei'),kb=document.getElementById('klapp');"
        "function breiteSetzen(){var w=null;try{w=localStorage.getItem(BR)}catch(e){}"
        "if(w)zwei.style.gridTemplateColumns=w+' 10px minmax(0,1fr)';}"
        "function klappStand(){var zu=false;try{zu=localStorage.getItem(ZU)==='1'}catch(e){}"
        "zwei.className='zwei'+(zu?' zu':'');"
        "if(zu)zwei.style.gridTemplateColumns='';else breiteSetzen();"
        "kb.textContent=zu?'Vorschau einblenden':'Vorschau ausblenden';}"
        "kb.onclick=function(){var zu=zwei.className.indexOf('zu')<0;"
        "try{localStorage.setItem(ZU,zu?'1':'0')}catch(e){}klappStand();};"
        "klappStand();"
        # Teilung ziehen: waehrend des Ziehens keine Textauswahl, sonst markiert
        # der Zeiger die halbe Seite.
        "var griff=document.getElementById('griff'),zieht=false;"
        "griff.addEventListener('mousedown',function(e){zieht=true;e.preventDefault();"
        "document.body.style.userSelect='none';});"
        "window.addEventListener('mousemove',function(e){if(!zieht)return;"
        "var links=zwei.getBoundingClientRect().left;"
        "var w=Math.max(280,Math.min(e.clientX-links,zwei.clientWidth-320));"
        "zwei.style.gridTemplateColumns=w+'px 10px minmax(0,1fr)';"
        "try{localStorage.setItem(BR,w+'px')}catch(x){}});"
        "window.addEventListener('mouseup',function(){zieht=false;document.body.style.userSelect='';});"
        "var pv=document.getElementById('pv');"
        "function doc(){try{return pv.contentDocument}catch(e){return null}}"
        "function stelle(i){var d=doc();return d?d.querySelector('.__ed[data-i=\"'+i+'\"]'):null;}"
        "function feldVon(i){return document.querySelector('#fs [data-i=\"'+i+'\"]');}"
        "function zeige(i){"
        "var d=doc();if(d){var alt=d.querySelectorAll('.__ed.is-sel');"
        "for(var k=0;k<alt.length;k++)alt[k].classList.remove('is-sel');"
        "var n=stelle(i);if(n){n.classList.add('is-sel');"
        "n.scrollIntoView({block:'center',behavior:'smooth'});}}"
        "var zeilen=document.querySelectorAll('#fs .f');"
        "for(var j=0;j<zeilen.length;j++)zeilen[j].classList.remove('is-sel');"
        "var z=document.getElementById('f'+i);if(z)z.classList.add('is-sel');}"
        # Klick in der Vorschau: die Gruppe aufklappen, dann ins Feld springen.
        "window.__waehle=function(i){var f=feldVon(i);if(!f)return;"
        "var g=f.closest('details');if(g)g.open=true;"
        "f.scrollIntoView({block:'center'});f.focus();zeige(i);};"
        "var alle=document.querySelectorAll('#fs [data-i]');"
        "for(var i=0;i<alle.length;i++){(function(el){"
        "var idx=el.getAttribute('data-i');"
        "el.addEventListener('focus',function(){zeige(idx)});"
        "el.addEventListener('input',function(){var n=stelle(idx);if(n)n.textContent=el.value;});"
        "})(alle[i]);}"
        "document.getElementById('save').onclick=function(){"
        "var m=document.getElementById('m');m.textContent='speichere…';"
        "var t=[],kat={};"
        "var n=document.querySelectorAll('#fs [data-key]');"
        "for(var i=0;i<n.length;i++){var k=n[i].getAttribute('data-key');"
        "if(k.indexOf('p:')===0)t[parseInt(k.slice(2),10)]=n[i].value;"
        "else{var teil=k.split(':');(kat[teil[1]]=kat[teil[1]]||{})[teil[2]]=n[i].value;}}"
        "var auftraege=[fetch('/api/page',{method:'POST',headers:{'Content-Type':'application/json'},"
        "body:JSON.stringify({name:" + json.dumps(name) + ",texts:t})}).then(function(r){return r.json()})];"
        "for(var slug in kat){(function(sl){auftraege.push("
        "fetch('/api/catalogue',{method:'POST',headers:{'Content-Type':'application/json'},"
        "body:JSON.stringify({slug:sl,values:kat[sl]})}).then(function(r){return r.json()}));})(slug);}"
        "Promise.all(auftraege).then(function(js){"
        "var schlecht=js.filter(function(j){return !j.ok});"
        "if(schlecht.length){m.textContent='nicht gespeichert';"
        "fehlerZeigen(schlecht.map(function(j){return j.error}).join(' · '));entwurfSchreiben();return;}"
        "GESPEICHERT=JSON.stringify(sammle());entwurfLoeschen();fehlerWeg();"
        "var w=js.filter(function(j){return j.backup&&j.backup.indexOf('keine')<0});"
        "m.textContent='gespeichert ✓ '+(w.length?w.length+' Datei(en)':'keine Änderung')+' · in ≤5 s live';"
        "setTimeout(function(){pv.src=pv.src},5200);})"
        ".catch(function(e){m.textContent='nicht gespeichert';fehlerZeigen(String(e));entwurfSchreiben();});};"
        "</script>")


def cat_editor(slug, msg="", err=""):
    _, eintraege = cat_entries()
    e = next((x for x in eintraege if x["slug"] == slug), None)
    if not e:
        return page("nicht gefunden", f"<p><a href='/'>&larr; Übersicht</a></p><h1>{html.escape(slug)}</h1>"
                                      "<p class='err'>Kein Eintrag mit diesem Kürzel.</p>")
    beschriftung = {"title": "Titel", "who": "Kurzkennung", "lede": "Kernsatz",
                    "about": "Beschreibung", "note": "Zusatz", "meta": "Fussnote", "state": "Stand", "area": "Gebiet", "updated": "Letzte Änderung"}
    felder = ""
    for k in FIELDS:
        if k not in e["felder"]:
            continue
        wert = e["felder"][k][2]
        if k == "state":
            opts = "".join(f"<option value='{v}'{' selected' if v == wert else ''}>{html.escape(l)}</option>" for v, l in STATES)
            if wert not in dict(STATES):
                opts = f"<option value='{html.escape(wert)}' selected>{html.escape(STATE_LEGACY.get(wert, wert))}</option>" + opts
            felder += (f"<label>Stand <span class='mono'>state</span><br><select data-k='state' class='stand'>{opts}</select>"
                       "<br><span class='note'>Erscheint als Punkt mit Wort auf der Karte: «only an idea», «still in development», «finished».</span></label>")
            continue
        if k == "area":
            opts = "".join(f"<option value='{v}'{' selected' if v == wert else ''}>{html.escape(l)}</option>" for v, l in AREAS_UI)
            felder += (f"<label>Gebiet <span class='mono'>area</span><br><select data-k='area' class='stand'>{opts}</select>"
                       "<br><span class='note'>Bestimmt den Abschnitt auf der Modulseite: Nature, Social, Technical.</span></label>")
            continue
        kurz = k in ("title", "meta", "updated")
        felder += (f"<label>{beschriftung[k]} <span class='mono'>{k}</span><br>"
                   + (f"<input type=text data-k='{k}' value=\"{html.escape(wert, quote=True)}\">"
                      if kurz else f"<textarea data-k='{k}'>{html.escape(wert)}</textarea>")
                   + "</label>")
    titel = e["felder"].get("title", (0, 0, slug))[2]
    return page(f"{titel} · Katalog",
        f"<p><a href='/'>&larr; Übersicht</a></p><h1>{html.escape(titel)}</h1>"
        f"<p class='mono'>catalogue.js &middot; {slug}</p>"
        + (f"<p class='ok'>{html.escape(msg)}</p>" if msg else "")
        + (f"<p class='err'>{html.escape(err)}</p>" if err else "")
        + "<div id='entwurf' class='entwurf' hidden></div>"
        + "<div id='fehler' class='fehler' hidden></div>"
        + f"<div id='fs' style='max-width:70ch'>{felder}</div>"
        "<div class='bar'><button class='btn' id='save'>Speichern</button> "
        "<a class='btn ghost' href='/'>Zurück</a> <span id='m' class='mono' style='margin-left:1rem'></span></div>"
        "<script>"
        + entwurf_js("cat:" + slug, "#fs", "data-k") +
        "document.getElementById('save').onclick=function(){"
        "var n=document.querySelectorAll('#fs [data-k]'),v={};"
        "for(var i=0;i<n.length;i++)v[n[i].getAttribute('data-k')]=n[i].value;"
        "var m=document.getElementById('m');m.textContent='speichere…';"
        "fetch('/api/catalogue',{method:'POST',headers:{'Content-Type':'application/json'},"
        "body:JSON.stringify({slug:" + json.dumps(slug) + ",values:v})})"
        ".then(function(r){return r.json()}).then(function(j){"
        "if(j.ok){GESPEICHERT=JSON.stringify(sammle());entwurfLoeschen();fehlerWeg();"
        "m.textContent='gespeichert ✓ Sicherung '+j.backup+' · in ≤5 s live';}"
        "else{m.textContent='nicht gespeichert';fehlerZeigen(j.error);entwurfSchreiben();}})"
        ".catch(function(e){m.textContent='nicht gespeichert';fehlerZeigen(String(e));entwurfSchreiben();});};</script>")


def design_editor():
    v = design_read()
    def farbe(k, label):
        return (f"<div class='f'><div class='k'>{label}</div><div>"
                f"<input type='color' data-k='{k}' value='{v[k]}' style='width:4rem;height:2.2rem;background:none;border:1px solid #323843;border-radius:6px'> "
                f"<span class='mono'>{v[k]}</span></div></div>")
    def zahl(k, label, lo, hi, step, einheit):
        return (f"<div class='f'><div class='k'>{label}</div><div>"
                f"<input type='number' data-k='{k}' value='{v[k]}' min='{lo}' max='{hi}' step='{step}' "
                f"style='width:8rem'> <span class='mono'>{einheit}</span></div></div>")
    return page("Design · entrosana.app",
        "<p><a href='/'>&larr; Übersicht</a></p><h1>Design</h1>"
        "<p class='note'>Die Werte werden als verwalteter Block ans Ende von "
        "<span class='mono'>assets/app.css</span> geschrieben und gewinnen dadurch gegen die "
        "Vorgaben weiter oben. Nur diese zehn Grössen werden verwaltet, der Rest der Datei "
        "bleibt unangetastet. Vorgaben sind die Werte, die heute gelten.</p>"
        "<h2>Dunkel</h2>"
        + farbe("seal", "Akzent") + farbe("paper", "Grund") + farbe("ink", "Schrift")
        + "<h2>Hell</h2>"
        + farbe("light_seal", "Akzent") + farbe("light_paper", "Grund") + farbe("light_ink", "Schrift")
        + "<h2>Masse</h2>"
        + zahl("wrap", "Satzbreite", 800, 1680, 10, "px")
        + zahl("gutter", "Rand", 0, 6, 0.25, "rem (Höchstwert der Klammer)")
        + zahl("radius", "Rundung", 0, 40, 1, "px")
        + zahl("size", "Schriftgrösse", 70, 140, 1, "%")
        + "<div class='bar'><button class='btn' id='save'>Speichern</button> "
        "<a class='btn ghost' href='/'>Zurück</a> <span id='m' class='mono' style='margin-left:1rem'></span></div>"
        "<script>document.getElementById('save').onclick=function(){"
        "var n=document.querySelectorAll('[data-k]'),v={};"
        "for(var i=0;i<n.length;i++){var k=n[i].getAttribute('data-k');"
        "v[k]=n[i].type==='number'?parseFloat(n[i].value):n[i].value;}"
        "var m=document.getElementById('m');m.textContent='speichere…';"
        "fetch('/api/design',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)})"
        ".then(function(r){return r.json()}).then(function(j){"
        "m.textContent=j.ok?('gespeichert ✓ Sicherung '+j.backup+' · in ≤5 s live'):('Fehler: '+j.error);})"
        ".catch(function(e){m.textContent='Fehler: '+e});};</script>")


# ── Beiträge (Phase 5) ──────────────────────────────────────────────────────
# Die Verwaltung entscheidet nicht selbst; sie ruft api/ auf :4324 als
# Dienstakteur (Rolle reviewer) auf. Jede Entscheidung braucht eine Begründung,
# und die Prüfung darauf steht hier UND im Dienst (docs/contributions.md).
API_URL = "http://127.0.0.1:4324"
API_TOKEN_FILE = HOME / ".config" / "entrosana-api.token"

def api_call(method, path, body=None):
    import urllib.request, urllib.error
    tok = API_TOKEN_FILE.read_text().strip() if API_TOKEN_FILE.exists() else ""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(API_URL + path, data=data, method=method, headers={
        "X-Entrosana-Token": tok, "Content-Type": "application/json", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {"error": str(e)}
    except Exception as e:
        return 0, {"error": f"API nicht erreichbar: {e}"}

STATUS_DE = {"received": "eingegangen, unbestätigt", "confirmed": "bestätigt, wartet auf Prüfung",
             "reviewing": "in Prüfung", "admitted": "angenommen, nicht veröffentlicht", "published": "veröffentlicht (Entwurf im Katalog)",
             "rejected": "abgelehnt", "withdrawn": "zurückgezogen"}
NEXT = {"confirmed": [("reviewing", "in Prüfung nehmen")],
        # 2026-09-09, Entscheid des Eigentümers: Annahme und Veröffentlichung in einem Schritt; «nur annehmen» bleibt als zweite Wahl.
        "reviewing": [("published", "annehmen und veröffentlichen"), ("admitted", "annehmen, noch nicht veröffentlichen"), ("rejected", "ablehnen")],
        "admitted": [("published", "veröffentlichen")],
        "published": [("admitted", "aus dem Katalog zurücknehmen")]}
ALLE_STATI = ["received", "confirmed", "reviewing", "admitted", "published", "rejected", "withdrawn"]

def _wann(iso):
    return html.escape((iso or "")[:16].replace("T", " ")) if iso else "—"

def contrib_list(status_filter=""):
    if status_filter and status_filter not in ALLE_STATI:
        status_filter = ""
    code, j = api_call("GET", "/api/contributions" + (f"?status={status_filter}" if status_filter else ""))
    kopf = "<h1>entro<span style='color:#2BD4E8'>sana</span>.app admin · Beiträge</h1><p class='mono'><a href='/'>← Übersicht</a></p>"
    if code != 200:
        return page("Beiträge", kopf + f"<p class='err'>{html.escape(str(j.get('error', code)))}</p>")
    filt = " · ".join(("<b>alle</b>" if not status_filter else "<a href='/contributions'>alle</a>"),) + " · " + " · ".join(
        (f"<b>{s}</b>" if s == status_filter else f"<a href='/contributions?status={s}'>{s}</a>") for s in ALLE_STATI)
    zeilen = ""
    for c in j.get("items", []):
        tr = {1: "geprüft", 0: "stimmt nicht", None: "—"}.get(c.get("trail_ok"), "—")
        zeilen += (f"<tr><td class='mono'>#{c['id']}<br>{_wann(c.get('created'))}</td>"
                   f"<td><b>{html.escape(c['title'])}</b><br><span class='mono'>{html.escape(c['area'])}</span></td>"
                   f"<td>{html.escape(STATUS_DE.get(c['status'], c['status']))}</td><td class='mono'>Trail: {tr}</td>"
                   f"<td><a href='/contributions/{c['id']}'>öffnen</a></td></tr>")
    if not zeilen:
        zeilen = "<tr><td colspan='5' class='mono'>keine Beiträge in dieser Auswahl</td></tr>"
    return page("Beiträge", kopf + f"<p class='mono'>{filt}</p>"
        "<p class='note'>Die Schlange kommt aus <span class='mono'>api/</span>, nicht aus einer Datei. "
        "Entschieden wird auf der Detailseite, immer mit Begründung.</p>"
        f"<table>{zeilen}</table>")

def contrib_detail(cid):
    code, j = api_call("GET", f"/api/contributions/{cid}")
    kopf = f"<h1>entro<span style='color:#2BD4E8'>sana</span>.app admin · Beitrag #{cid}</h1><p class='mono'><a href='/contributions'>← Beiträge</a></p>"
    if code != 200:
        return page(f"Beitrag #{cid}", kopf + f"<p class='err'>{html.escape(str(j.get('error', code)))}</p>")
    c = j["item"]
    fakten = "".join(f"<tr><td class='mono'>{k}</td><td>{v}</td></tr>" for k, v in [
        ("Titel", html.escape(c["title"])), ("Bereich", html.escape(c["area"])),
        ("Stand", html.escape(STATUS_DE.get(c["status"], c["status"]))),
        ("eingegangen", _wann(c.get("created"))), ("bestätigt", _wann(c.get("confirmed"))),
        ("entschieden", _wann(c.get("decided")) + (f" · Akteur {c['decided_by']}" if c.get("decided_by") else "")),
        ("Begründung", html.escape(c.get("reason") or "—")),
        ("veröffentlicht", _wann(c.get("published")) + (f" · Akteur {c['published_by']}" if c.get("published_by") else "")
                          + (f" · <a href='https://entrosana.app/modules/{html.escape(c['slug'])}' target='_blank'>modules/{html.escape(c['slug'])}</a>" if c.get("slug") else "")),
        ("Namensnennung", "bleibt beim Löschen der Daten stehen" if c.get("attribution") == "keep" else "geht beim Löschen der Daten mit"),
        ("Akteur", f"<span class='mono'>{c['actor_id']}</span>"),
        ("Trail", {1: "<span class='ok'>serverseitig geprüft</span>", 0: "<span class='err'>stimmt nicht</span>"}.get(c.get("trail_ok"), "nichts mitgeschickt"))])
    dateien = "".join(f"<li><a href='{html.escape(f['url'])}' rel='noopener' target='_blank'>{html.escape(f['label'])}</a> <span class='mono'>{html.escape(f['url'])}</span></li>"
                      for f in c.get("files", [])) or "<li class='mono'>keine</li>"
    recs = "".join(f"<tr><td class='mono'>{r.get('i')}</td><td class='mono'>{_wann(r.get('t'))}</td><td class='mono'>{html.escape(r.get('kind',''))}</td>"
                   f"<td>{html.escape(r.get('text',''))}</td><td class='mono'>{html.escape((r.get('h') or '')[:10])}</td></tr>"
                   for r in c.get("records", [])) or "<tr><td colspan='5' class='mono'>keine Zeilen</td></tr>"
    form = ""
    if c["status"] in ("admitted", "reviewing"):
        fails = c.get("checks") or []
        if fails:
            form += "<h2>Vor der Veröffentlichung</h2><p class='err'>Das Tor ist zu: " + "; ".join(html.escape(x) for x in fails) + "</p>"
            if any("not approved as contributor" in x for x in fails):
                form += "<p class='note'>Die Person ist Sammler. Freigabe als Beitragende unter <a href='/applications'>Bewerbungen</a>, sofern sie sich beworben hat.</p>"
        else:
            form += "<h2>Vor der Veröffentlichung</h2><p class='ok'>Alle Prüfungen bestanden: Name, Annahme, Trail, Bereich, Titel, Vorschlag, Dateiverweise.</p>"
        if c.get("decided_by") == 1:
            form += "<p class='note'>Zweite Lesung: der Dienstakteur hat angenommen. Veröffentlicht dieselbe Rolle, steht das so in der Kette.</p>"
    if c["status"] == "published" and c.get("published_by") == c.get("decided_by"):
        form += "<p class='note'>Ohne zweite Lesung veröffentlicht: dieselbe Person hat angenommen und veröffentlicht. Die Kette hält es fest.</p>"
    if c["status"] in NEXT:
        opts = "".join(f"<option value='{s}'>{l}</option>" for s, l in NEXT[c["status"]])
        form += ("<h2>Entscheiden</h2>"
                "<p class='note'>Ohne Begründung geht nichts hinaus: die Verwaltung schickt es nicht ab, und der Dienst würde es abweisen.</p>"
                f"<div class='decide'><select id='next'>{opts}</select>"
                "<textarea id='reason' rows='4' placeholder='Begründung, mindestens drei Zeichen; sie geht per Mail an die Person'></textarea></div>"
                "<div class='bar'><button class='btn' id='decide'>Entscheiden</button> <span id='msg' class='mono'></span></div>"
                "<script>"
                "document.getElementById('decide').addEventListener('click',function(){"
                "var r=document.getElementById('reason').value.trim(),m=document.getElementById('msg');"
                "if(r.length<3){m.textContent='Begründung fehlt.';m.className='err';return;}"
                "m.textContent='…';m.className='mono';"
                f"fetch('/api/contributions/{cid}/decide',{{method:'POST',headers:{{'Content-Type':'application/json'}},"
                "body:JSON.stringify({status:document.getElementById('next').value,reason:r})}).then(function(x){return x.json()})"
                ".then(function(j){if(j.ok){location.reload();}else{m.textContent=j.error||'Fehler';m.className='err';}})"
                ".catch(function(){m.textContent='Dienst nicht erreichbar';m.className='err';});});"
                "</script>")
    kcode, kj = api_call("GET", "/api/audit/verify")
    kette = (f"<span class='ok'>in Ordnung, {kj.get('n')} Zeilen</span>" if kcode == 200 and kj.get("ok")
             else f"<span class='err'>{html.escape(str(kj))}</span>")
    return page(f"Beitrag #{cid}", kopf + f"<table>{fakten}</table>"
        f"<h2>Vorschlag</h2><pre style='white-space:pre-wrap'>{html.escape(c.get('summary',''))}</pre>"
        f"<h2>Dateien</h2><ul>{dateien}</ul>"
        f"<h2>Aufzeichnungen der einreichenden Person</h2><table>{recs}</table>"
        f"<h2>Datei als Text</h2><pre style='white-space:pre-wrap'>{html.escape(c.get('trail') or '—')}</pre>"
        + form + f"<p class='mono' style='margin-top:1.5rem'>Kette des Dienstes: {kette}</p>")

def applications_list():
    """Bewerbungen als Beitragende: offene mit Entscheidformular, entschiedene darunter."""
    code, j = api_call("GET", "/api/applications?all=1")
    kopf = ("<h1>entro<span style='color:#2BD4E8'>sana</span>.app admin · Bewerbungen</h1>"
            "<p class='mono'><a href='/'>← Übersicht</a> · <a href='/contributions'>Beiträge</a></p>"
            "<p class='note'>Sammler registrieren sich frei. Beitragende wird, wen das Team hier freigibt: die Rolle "
            "<span class='mono'>contributor</span> entsteht, die Person erhält eine Mail, und das Tor lässt ihre "
            "angenommenen Beiträge zur Veröffentlichung.</p>")
    if code != 200:
        return page("Bewerbungen", kopf + f"<p class='err'>api/: {html.escape(str(j.get('error', code)))}</p>")
    items = j.get("items", [])
    offen = [a for a in items if not a.get("decided")]
    alt = [a for a in items if a.get("decided")]
    rows = ""
    for a in offen:
        aid = a["id"]
        rows += (f"<tr><td class='mono'>#{aid}</td><td><b>{html.escape(a.get('actor_name') or '—')}</b><br>"
                 f"<span class='mono'>{html.escape(a.get('actor_email') or '')}</span></td>"
                 f"<td class='mono'>{_wann(a.get('created'))}</td>"
                 f"<td><pre style='white-space:pre-wrap;margin:0'>{html.escape(a.get('text', ''))}</pre></td></tr>"
                 f"<tr><td></td><td colspan='3'><div class='f'><textarea id='r{aid}' rows='2' placeholder='Begründung, mindestens drei Zeichen; sie geht per Mail an die Person'></textarea></div>"
                 f"<div class='bar'><button class='btn' data-app='{aid}' data-out='approved'>freigeben</button> "
                 f"<button class='btn' data-app='{aid}' data-out='declined'>ablehnen</button> <span id='m{aid}' class='mono'></span></div></td></tr>")
    tab_offen = (f"<h2>Offen ({len(offen)})</h2><table><tr><th></th><th>Person</th><th>eingegangen</th><th>Bewerbung</th></tr>{rows}</table>"
                 if offen else "<h2>Offen</h2><p class='mono'>keine</p>")
    rows2 = "".join(f"<tr><td class='mono'>#{a['id']}</td><td>{html.escape(a.get('actor_name') or '—')}<br><span class='mono'>{html.escape(a.get('actor_email') or '')}</span></td>"
                    f"<td class='{'ok' if a.get('outcome') == 'approved' else 'err'}'>{'freigegeben' if a.get('outcome') == 'approved' else 'abgelehnt'}</td>"
                    f"<td class='mono'>{_wann(a.get('decided'))} · Akteur {a.get('decided_by')}</td><td>{html.escape(a.get('reason') or '')}</td></tr>" for a in alt)
    tab_alt = (f"<h2>Entschieden ({len(alt)})</h2><table><tr><th></th><th>Person</th><th>Ausgang</th><th>wann</th><th>Begründung</th></tr>{rows2}</table>" if alt else "")
    script = ("<script>"
              "document.querySelectorAll('button[data-app]').forEach(function(b){b.addEventListener('click',function(){"
              "var id=b.getAttribute('data-app'),out=b.getAttribute('data-out'),r=document.getElementById('r'+id).value.trim(),m=document.getElementById('m'+id);"
              "if(r.length<3){m.textContent='Begründung fehlt.';m.className='err';return;}"
              "m.textContent='…';m.className='mono';"
              "fetch('/api/applications/'+id+'/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({outcome:out,reason:r})})"
              ".then(function(x){return x.json()}).then(function(j){if(j.ok){location.reload();}else{m.textContent=j.error||'Fehler';m.className='err';}})"
              ".catch(function(){m.textContent='Dienst nicht erreichbar';m.className='err';});});});"
              "</script>")
    return page("Bewerbungen", kopf + tab_offen + tab_alt + script)


def application_decide(aid, data):
    outcome = data.get("outcome", "")
    reason = str(data.get("reason", "")).strip()
    if len(reason) < 3:
        raise ValueError("Begründung fehlt")
    code, j = api_call("PATCH", f"/api/applications/{aid}", {"outcome": outcome, "reason": reason})
    if code != 200:
        raise ValueError(str(j.get("error", code)))
    return j


def contrib_decide(cid, data):
    status = str(data.get("status", ""))
    reason = str(data.get("reason", "")).strip()
    if status not in ("reviewing", "admitted", "rejected", "published"):
        raise ValueError("unbekannter Zielzustand")
    if len(reason) < 3:
        raise ValueError("Begründung fehlt")
    code, j = api_call("PATCH", f"/api/contributions/{cid}", {"status": status, "reason": reason[:2000]})
    if code != 200:
        raise ValueError(j.get("error", f"API {code}"))
    return j



# ── Hub-Verwaltung (2026-09-09, aus der .com-Konsole hierher gezogen): Konten, Anfragen, Checklisten ──
# Der Dienst api/ trägt die Daten; hier steht nur die Ansicht. Bewerbungen und Beiträge stehen oben.
SEEDS_FILE = APP / "assets" / "seeds.js"


def _hub_kopf(titel):
    return (f"<h1>entro<span style='color:#2BD4E8'>sana</span>.app admin · {titel}</h1>"
            "<p class='mono'><a href='/'>← Übersicht</a> · <a href='/contributions'>Beiträge</a> · <a href='/applications'>Bewerbungen</a> · "
            "<a href='/accounts'>Konten</a> · <a href='/requests'>Anfragen</a> · <a href='/invites'>Einladungen</a> · "
            "<a href='/modules'>Module</a> · <a href='/services'>Dienste</a> · <a href='/checklists'>Checklisten</a></p>")


STANDING_DE = {"collector": "Sammler", "contributor": "Beitragende", "reviewer": "Team", "owner": "Eigentümer", "service": "Dienst"}


ROLE_DE = {"teacher": "Lehrperson", "student": "Lernende", "parent": "Eltern", "social-worker": "Soziale Arbeit", "developer": "Entwicklung", "researcher": "Forschung", "other": "andere"}


def _hub_wann(iso):
    return html.escape(str(iso).replace("T", " ")[:16]) if iso else "—"


def seeds_read():
    """seeds.js ist ein Kommentarkopf plus `window.__seeds = {...};` mit striktem JSON."""
    raw = SEEDS_FILE.read_text(encoding="utf-8")
    m = re.search(r"window\.__seeds\s*=\s*(\{.*\})\s*;?\s*$", raw, re.S)
    if not m:
        raise ValueError("seeds.js: Zuweisung window.__seeds nicht gefunden")
    return raw[:m.start()], json.loads(m.group(1))


def seeds_write(head, seeds):
    """Sicherung, dann Datei neu schreiben, dann die Version in allen Seiten heben (Kante hält 4 h)."""
    BACKUPS.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    bak = BACKUPS / f"seeds.js.{stamp}.admin"
    bak.write_text(SEEDS_FILE.read_text(encoding="utf-8"), encoding="utf-8")
    body = json.dumps(seeds, ensure_ascii=False, indent=1)
    SEEDS_FILE.write_text(head + "window.__seeds = " + body + ";\n", encoding="utf-8")
    ver = time.strftime("%Y%m%d%H%M")
    n = 0
    for f in APP.glob("*.html"):
        s = f.read_text(encoding="utf-8")
        s2 = re.sub(r"/assets/seeds\.js(\?v=[0-9a-z]+)?\"", f"/assets/seeds.js?v={ver}\"", s)
        if s2 != s:
            f.write_text(s2, encoding="utf-8")
            n += 1
    # Bestmöglicher Commit der betroffenen Dateien (nur diese Pfade; Fehler brechen das Speichern nicht ab).
    try:
        paths = ["assets/seeds.js"] + sorted(str(f.relative_to(APP)) for f in APP.glob("*.html"))
        subprocess.run(["git", "-C", str(APP), "commit", "-q", "-m",
                        f"seeds: checkliste aus der konsole bearbeitet ({stamp})\n\nCo-Authored-By: entrosana-admin <sygnif@entrosana.com>",
                        "--"] + paths, capture_output=True, text=True, timeout=20)
    except Exception:
        pass
    return str(bak), n


def invites_list():
    code, j = api_call("GET", "/api/invites")
    if code != 200:
        return page("Einladungen", _hub_kopf("Einladungen") + f"<p class='err'>{html.escape(str(j.get('error', code)))}</p>")
    items = j.get("items", [])
    rows = "".join(f"<tr><td class='mono'>#{i['id']}</td><td><b>{html.escape(i.get('inviter_name') or '—')}</b><br><span class='mono'>{html.escape(i.get('inviter_email') or '')}</span></td>"
                   f"<td class='mono'>{html.escape(i.get('email') or '')}</td><td>{html.escape(i.get('message') or '')}</td>"
                   f"<td class='mono'>{_hub_wann(i.get('created'))}</td><td class='{'ok' if i.get('accepted') else 'mono'}'>{('angenommen ' + _hub_wann(i.get('accepted')) + ' · Konto ' + str(i.get('accepted_id'))) if i.get('accepted') else 'offen'}</td></tr>" for i in items)
    offen = len([i for i in items if not i.get("accepted")])
    return page("Einladungen", _hub_kopf("Einladungen") + f"<p class='note'>{len(items)} Einladungen, {offen} offen. Jedes Konto lädt auf seiner Kontoseite ein; der Link gilt sieben Tage, "
                "unbeantwortete Einladungen räumt die Wartung nach 180 Tagen weg.</p>"
                + (f"<table><tr><th></th><th>von</th><th>an</th><th>Nachricht</th><th>gesendet</th><th>Stand</th></tr>{rows}</table>" if items else "<p class='mono'>keine</p>"))


SVC_STATE_DE = {"ok": "läuft", "warn": "gestört", "off": "aus", "wait": "wartet"}
SVC_KIND_DE = {"url": "Adresse", "mcp": "MCP", "webhook": "Lebenszeichen", "tcp": "Port", "tls": "Zertifikat"}


def services_list():
    """Dienste aller Konten (Tabelle services) und der Schnappschuss der Maschine; nur lesen, Änderungen macht jedes Konto selbst."""
    code, j = api_call("GET", "/api/services")
    if code != 200:
        return page("Dienste", _hub_kopf("Dienste") + f"<p class='err'>{html.escape(str(j.get('error', code)))}</p>")
    items = j.get("items", [])
    rows = ""
    for s in items:
        st = s.get("state") or "wait"
        cls = "ok" if st == "ok" else ("err" if st in ("warn", "off") else "mono")
        wann = s.get("checked") or s.get("last_checked") or s.get("last_beat") or ""
        rows += (f"<tr><td class='mono'>#{s.get('id')}</td><td><b>{html.escape(s.get('actor_name') or '—')}</b><br><span class='mono'>{html.escape(s.get('actor_email') or '')}</span></td>"
                 f"<td><b>{html.escape(s.get('name') or '')}</b><br><span class='desc'>{html.escape(s.get('what') or '')}</span></td>"
                 f"<td class='mono'>{html.escape(SVC_KIND_DE.get(s.get('kind'), s.get('kind') or ''))}<br>{html.escape(s.get('target') or '—')}</td>"
                 f"<td class='mono'>{html.escape(str(s.get('group') or ''))} · {html.escape(str(s.get('place') or ''))}<br>alle {s.get('interval')} min</td>"
                 f"<td class='{cls}'>{html.escape(SVC_STATE_DE.get(st, st))}<br><span class='mono'>{html.escape(str(s.get('status') or ''))}</span></td>"
                 f"<td class='mono'>{_hub_wann(wann) if wann else '—'}</td></tr>")
    m = j.get("machine") or {}
    mrows = "".join(f"<tr><td class='mono'>{html.escape(x.get('group') or '')}</td><td><b>{html.escape(x.get('name') or '')}</b><br><span class='desc'>{html.escape(x.get('what') or '')}</span></td>"
                    f"<td class='mono'>{html.escape(x.get('where') or '')}</td><td class='{'ok' if x.get('state') == 'ok' else ('err' if x.get('state') in ('warn', 'off') else 'mono')}'>{html.escape(SVC_STATE_DE.get(x.get('state'), x.get('state') or ''))}<br><span class='mono'>{html.escape(x.get('status') or '')}</span>"
                    + (f"<br><span class='err'>{html.escape(x.get('flag'))}</span>" if x.get("flag") else "") + "</td></tr>" for x in m.get("services", []))
    return page("Dienste", _hub_kopf("Dienste")
        + f"<p class='note'>{len(items)} Dienste in Konten. Jedes Konto pflegt seine Liste auf <span class='mono'>/services</span> selbst; der Dienst prüft Adresse, MCP, Port und Zertifikat im gewählten Takt, Lebenszeichen zählen beim Eintreffen. "
          "Ziele privater Netze darf nur der Eigentümer eintragen.</p>"
        + (f"<table><tr><th></th><th>Konto</th><th>Dienst</th><th>Art · Ziel</th><th>Gruppe · Ort · Takt</th><th>Stand</th><th>zuletzt</th></tr>{rows}</table>" if items else "<p class='mono'>keine</p>")
        + f"<h2>Die Maschine {html.escape(m.get('host') or '')}</h2><p class='note'>Aus <span class='mono'>tools/services-snapshot.sh</span>, gelesen {html.escape(m.get('read') or '—')}; alle zehn Minuten neu. Auf entrosana.app sieht nur der Eigentümer diese Zeilen, in seiner eigenen Liste.</p>"
        + (f"<table><tr><th>Gruppe</th><th>Dienst</th><th>wo</th><th>Stand</th></tr>{mrows}</table>" if mrows else "<p class='mono'>kein Schnappschuss</p>"))


def modules_list():
    """Veröffentlichte Module der Spur «contributed»: Stand, Gebiet, Beitragende, Punkte; Beitragende hier ein- und austragen."""
    mcode, meta = api_call("GET", "/api/modules/meta")
    meta = meta.get("items", {}) if mcode == 200 else {}
    _, eintraege = cat_entries()
    mods = [e for e in eintraege if e.get("abteilung") == "modules" and e.get("gleis") == "contributed"]
    rows = ""
    for e in mods:
        f = {k: v[2] for k, v in e["felder"].items()}
        m = meta.get(e["slug"], {"contributors": [], "points": 0})
        leute = "".join(f"<span class='mono'>{html.escape(c.get('name') or ('Konto ' + str(c.get('id'))))}</span> "
                        f"<button class='btn ghost' data-rm='{e['slug']}' data-id='{c.get('id')}'>austragen</button><br>" for c in m.get("contributors", [])) or "<span class='mono'>—</span>"
        form = (f"<input type='email' data-add='{e['slug']}' placeholder='E-Mail eines freigegebenen Kontos' style='width:16rem'> "
                f"<button class='btn' data-addb='{e['slug']}'>eintragen</button> <span id='m-{e['slug']}' class='mono'></span>")
        rows += (f"<tr><td><b>{html.escape(f.get('title', e['slug']))}</b><br><span class='mono'>{e['slug']}</span></td>"
                 f"<td class='mono'>{html.escape(f.get('area', '—'))}<br>{html.escape(f.get('state', '—'))}<br>{html.escape(f.get('updated', '—'))}</td>"
                 f"<td>{leute}{form}</td><td class='mono'>{m.get('points', 0)} Punkte</td>"
                 f"<td><a href='/catalogue/{e['slug']}'>Text</a> · <a href='https://entrosana.app/modules/{e['slug']}' target='_blank'>ansehen</a></td></tr>")
    script = ("<script>document.querySelectorAll('button[data-rm]').forEach(function(b){b.addEventListener('click',function(){var s=b.getAttribute('data-rm'),m=document.getElementById('m-'+s);m.textContent='…';"
              "fetch('/api/modules/'+s+'/contributors/'+b.getAttribute('data-id')+'/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})"
              ".then(function(x){return x.json()}).then(function(j){if(j.ok){location.reload();}else{m.textContent=j.error||'Fehler';m.className='err';}});});});"
              "document.querySelectorAll('button[data-addb]').forEach(function(b){b.addEventListener('click',function(){var s=b.getAttribute('data-addb'),i=document.querySelector('input[data-add=\"'+s+'\"]'),m=document.getElementById('m-'+s);"
              "if(!i.value.trim()){m.textContent='Adresse fehlt';return;}m.textContent='…';m.className='mono';"
              "fetch('/api/modules/'+s+'/contributors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:i.value.trim()})})"
              ".then(function(x){return x.json()}).then(function(j){if(j.ok){location.reload();}else{m.textContent=j.error||'Fehler';m.className='err';}});});});</script>")
    return page("Module", _hub_kopf("Module") + "<p class='note'>Module, die aus Beiträgen entstanden sind. Jede eingetragene Person bearbeitet Text und Stand auf entrosana.app/me/modules; "
                "hier trägt das Team Beitragende ein oder aus (mindestens eine Person bleibt). Die Karten der Modulseite nennen alle.</p>"
                + (f"<table><tr><th>Modul</th><th>Gebiet · Stand · Änderung</th><th>Beitragende</th><th>Punkte</th><th></th></tr>{rows}</table>" if mods else "<p class='mono'>keine</p>") + script)


def checklists_list():
    try:
        _, seeds = seeds_read()
    except Exception as e:
        return page("Checklisten", _hub_kopf("Checklisten") + f"<p class='err'>{html.escape(str(e))}</p>")
    rows = "".join(f"<tr><td class='mono'>{html.escape(k)}</td><td><b>{html.escape(v.get('title', ''))}</b><br><span class='desc'>{html.escape(v.get('who', ''))}</span></td>"
                   f"<td class='mono'>{len(v.get('steps', []))} Schritte{(' · ' + str(len(v['prompts'])) + ' Prompts') if v.get('prompts') else ''}</td>"
                   f"<td><a class='act' href='/checklists/{html.escape(k)}'>bearbeiten</a></td>"
                   f"<td><a class='act' href='https://entrosana.app/project?p={html.escape(k)}' target='_blank'>ansehen</a></td></tr>" for k, v in seeds.items())
    return page("Checklisten", _hub_kopf("Checklisten") + "<p class='note'>Die Checklisten der Projektverwaltung (assets/seeds.js). Jede Änderung wird gesichert und geht binnen 5 s live; die Seiten laden die neue Fassung mit frischer Version. "
                "Wer eine Liste schon geöffnet hat, behält seine Kopie auf dem Gerät.</p>" + f"<table><tr><th>Schlüssel</th><th>Titel</th><th>Umfang</th><th></th><th></th></tr>{rows}</table>")


def checklist_edit(key):
    try:
        _, seeds = seeds_read()
    except Exception as e:
        return page("Checkliste", _hub_kopf("Checkliste") + f"<p class='err'>{html.escape(str(e))}</p>")
    s = seeds.get(key)
    if not s:
        return page("Checkliste", _hub_kopf("Checkliste") + f"<p class='err'>unbekannt: {html.escape(key)}</p>")
    def fld(label, name, value, rows=None, hint=""):
        inner = (f"<textarea name='{name}' rows='{rows}' style='width:100%;box-sizing:border-box'>{html.escape(value)}</textarea>" if rows
                 else f"<input name='{name}' value='{html.escape(value)}' style='width:100%;box-sizing:border-box'>")
        return f"<p><label><span class='mono'>{label}</span><br>{inner}</label>{('<br><span class=desc>' + hint + '</span>') if hint else ''}</p>"
    steps = s.get("steps", []) + [{}, {}]
    step_html = "".join(f"<fieldset style='border:1px solid #323843;border-radius:8px;padding:.6rem .9rem;margin:.6rem 0'><legend class='mono'>Schritt {i + 1}{'' if st else ' (leer = wird nicht gespeichert)'}</legend>"
                        + fld("Titel (t)", f"t{i}", st.get("t", "")) + fld("Zeile auf der Karte (n)", f"n{i}", st.get("n", ""), 2)
                        + fld("Details im Popup (i)", f"i{i}", st.get("i", ""), 3) + "</fieldset>" for i, st in enumerate(steps))
    form = (f"<form id='ck' data-key='{html.escape(key)}'>" + fld("Titel", "title", s.get("title", "")) + fld("Untertitel (who)", "who", s.get("who", ""))
            + fld("Prompts fürs Vorschlagsformular, eine je Zeile (leer lassen, wenn keine)", "prompts", "\n".join(s.get("prompts", [])), 6,
                  "Nur die Liste contribute/000 braucht sie: aus ihnen wird der vorbelegte Vorschlagstext.")
            + f"<h2>Schritte ({len(s.get('steps', []))})</h2><p class='note'>Reihenfolge wie hier. Ein Schritt ohne Titel fällt weg; zwei leere Blöcke stehen zum Anfügen bereit.</p>" + step_html
            + f"<div class='bar'><button class='btn' type='submit'>Speichern</button> <a class='act' href='/checklists'>zurück</a> <span id='msg' class='mono'></span></div></form>"
            "<script>document.getElementById('ck').addEventListener('submit',function(e){e.preventDefault();var f=e.target,m=document.getElementById('msg');var steps=[];"
            f"for(var i=0;i<{len(steps)};i++){{var t=f['t'+i].value.trim();if(!t)continue;steps.push({{t:t,n:f['n'+i].value.trim(),i:f['i'+i].value.trim()}});}}"
            "var prompts=f.prompts.value.split('\\n').map(function(x){return x.trim()}).filter(Boolean);m.textContent='…';"
            "fetch('/api/checklists/'+f.getAttribute('data-key'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:f.title.value.trim(),who:f.who.value.trim(),prompts:prompts,steps:steps})})"
            ".then(function(x){return x.json()}).then(function(j){if(j.ok&&j.unchanged){m.textContent='nichts geändert';m.className='mono';}else if(j.ok){m.textContent='gespeichert · Sicherung '+j.backup+' · '+j.pages+' Seiten neu versioniert'+(j.commit?' · Commit '+j.commit:'');m.className='ok';}else{m.textContent=j.error||'Fehler';m.className='err';}})"
            ".catch(function(){m.textContent='nicht erreichbar';m.className='err';});});</script>")
    return page("Checkliste " + key, _hub_kopf("Checkliste · " + html.escape(key)) + form)


def checklist_save(key, data):
    head, seeds = seeds_read()
    if key not in seeds:
        raise ValueError("unbekannte Checkliste")
    title = str(data.get("title", "")).strip()
    if len(title) < 2:
        raise ValueError("Titel fehlt")
    steps = []
    for st in data.get("steps", []):
        t = str(st.get("t", "")).strip()
        if not t:
            continue
        one = {"t": t[:200], "n": str(st.get("n", "")).strip()[:600]}
        if str(st.get("i", "")).strip():
            one["i"] = str(st.get("i", "")).strip()[:2000]
        steps.append(one)
    if not steps:
        raise ValueError("mindestens ein Schritt")
    new = dict(seeds[key])
    new["title"], new["who"], new["steps"] = title[:120], str(data.get("who", "")).strip()[:200], steps
    prompts = [str(x).strip()[:200] for x in data.get("prompts", []) if str(x).strip()]
    if prompts:
        new["prompts"] = prompts
    else:
        new.pop("prompts", None)
    if new == seeds[key]:
        return {"ok": True, "unchanged": True, "backup": None, "pages": 0, "commit": None}
    seeds[key] = new
    bak, n = seeds_write(head, seeds)
    sha = subprocess.run(["git", "-C", str(APP), "log", "-1", "--format=%h", "--", "assets/seeds.js"], capture_output=True, text=True).stdout.strip()
    return {"ok": True, "backup": bak.split("/")[-1], "pages": n, "commit": sha}


DOCS_DIR = APP / "docs-site"
DOCS_DEV = APP / "docs-dev"   # Entwicklungskopie, live auf atrium.entrosana.com/docs (2026-09-10)


def docs_pages():
    """Die Seiten aus docs-site/pages.json: [(key, label, group)] in Reihenfolge."""
    try:
        m = json.loads((DOCS_DIR / "pages.json").read_text(encoding="utf-8"))
    except Exception:
        return []
    return [(it["key"], it.get("label", it["key"]), g.get("title", "")) for g in m.get("groups", []) for it in g.get("items", [])]


def docs_url(key, dev=False):
    base = "https://atrium.entrosana.com/docs" if dev else "https://docs.entrosana.app"
    return base + ("/" if not dev and key == "index" else ("" if key == "index" else "/" + key))


def docs_rows():
    rows, last = "", None
    for key, label, group in docs_pages():
        p, d = DOCS_DIR / (key + ".md"), DOCS_DEV / (key + ".md")
        live = p.read_text(encoding="utf-8") if p.exists() else ""
        dev = d.read_text(encoding="utf-8") if d.exists() else ""
        gleich = live == dev
        if group != last:
            rows += f"<tr><td colspan='4'><b>{html.escape(group)}</b></td></tr>"; last = group
        rows += (f"<tr><td>{html.escape(label)}<br><span class='mono'>{html.escape(key)}.md</span></td>"
                 f"<td class='mono'>live {len(live.splitlines())} Z · dev {len(dev.splitlines())} Z<br><span class='{'ok' if gleich else 'err'}'>{'gleich' if gleich else ('dev fehlt' if not dev else 'dev weicht ab')}</span></td>"
                 f"<td><a href='/docs/edit/{key}'>live bearbeiten</a><br><a href='/docs/dev/{key}'>dev bearbeiten</a></td>"
                 f"<td><a href='{docs_url(key)}' target='_blank' rel='noopener'>live ansehen</a><br><a href='{docs_url(key, True)}' target='_blank' rel='noopener'>dev ansehen</a>"
                 + ("" if gleich else f"<br><a class='act' href='#' data-promote='{key}'>dev → live übernehmen</a><br><a class='act' href='#' data-pull='{key}'>live → dev holen</a>") + "</td></tr>")
    js = ("<script>document.querySelectorAll('[data-promote],[data-pull]').forEach(function(a){a.addEventListener('click',async function(e){e.preventDefault();"
          "var name=a.dataset.promote||a.dataset.pull, op=a.dataset.promote?'promote':'pull';if(!confirm((op==='promote'?'dev → live: ':'live → dev: ')+name+'?'))return;"
          "var r=await fetch('/api/docs/'+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name})});var j=await r.json();"
          "if(j.ok)location.reload();else alert('Fehler: '+j.error);});});</script>")
    return (f"<p class='note'>Aufbau in <span class='mono'>docs-site/pages.json</span> (Gruppen und Reihenfolge); je Seite eine Markdown-Datei. "
            "Neue Seite: Eintrag in pages.json und Datei anlegen, beides über den Abgleich oder direkt im Baum.</p><table>{rows}</table>" + js)


def docs_copy(data, direction):
    key = str(data.get("name", ""))
    if not any(key == k for k, _, _ in docs_pages()):
        raise ValueError("unbekannte Seite")
    src, dst = (DOCS_DEV / (key + ".md"), DOCS_DIR / (key + ".md")) if direction == "promote" else (DOCS_DIR / (key + ".md"), DOCS_DEV / (key + ".md"))
    if not src.exists():
        raise ValueError("Quelle fehlt")
    if dst.exists() and dst.read_text(encoding="utf-8") == src.read_text(encoding="utf-8"):
        return {"ok": True, "backup": "keine Änderung"}
    b = backup(dst) if dst.exists() else None
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    return {"ok": True, "backup": b}


def docs_editor(key, msg="", err="", where="live"):
    """Markdown-Quelle einer Docs-Seite, live (docs-site) oder dev (docs-dev). Speichern legt eine Kopie ab; serve.mjs rendert beim nächsten Aufruf neu."""
    label = next((l for k, l, _ in docs_pages() if k == key), key)
    url = docs_url(key, where == "dev")
    base = DOCS_DEV if where == "dev" else DOCS_DIR
    text = (base / (key + ".md")).read_text(encoding="utf-8") if (base / (key + ".md")).exists() else ""
    body = (f"<p><a href='/'>&larr; Übersicht</a> · <a href='/docs'>Docs</a></p><h1>Docs {'in Entwicklung' if where == 'dev' else 'live'} · {html.escape(label)}</h1>"
            f"<p class='note'>Markdown, wie in <span class='mono'>{'docs-dev' if where == 'dev' else 'docs-site'}/{html.escape(key)}.md</span>. Erste Überschrift (#) ist der Titel, der erste Absatz die Unterzeile; "
            "## gliedert und erscheint in «On this page». Erlaubt: Listen (eine Unterebene), ``` Zäune, | Tabellen |, > Zitate, > **Note:** / **Tip:** / **Warning:** / **Owner:** als Kasten, **fett**, *kursiv*, `Code`, [Verweise](/pfad). "
            f"Live unter <a href='{url}' target='_blank' rel='noopener'>{html.escape(url)}</a>, ohne Neustart.</p>"
            f"<textarea id='md' spellcheck='false' style='width:100%;min-height:62vh;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9rem;line-height:1.45;box-sizing:border-box'>{html.escape(text)}</textarea>"
            "<p><button class='btn' id='save'>Speichern</button> <span class='mono' id='out'></span></p>"
            "<script>document.getElementById('save').addEventListener('click',async function(){var o=document.getElementById('out');o.textContent='…';"
            "try{var r=await fetch('/api/docs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:" + json.dumps(key) + ",where:" + json.dumps(where) + ",text:document.getElementById('md').value})});"
            "var j=await r.json();o.textContent=j.ok?('gespeichert · Kopie '+j.backup):('Fehler: '+j.error);}catch(e){o.textContent='Fehler: '+e;}});</script>")
    return page("Docs · " + label, body)


def docs_save(data):
    key = str(data.get("name", ""))
    if not any(key == k for k, _, _ in docs_pages()):
        raise ValueError("unbekannte Seite")
    text = str(data.get("text", "")).replace("\r\n", "\n")
    if len(text) > 200000:
        raise ValueError("zu lang")
    if not text.lstrip().startswith("# "):
        raise ValueError("die erste Zeile muss die Überschrift sein (# Titel)")
    p = (DOCS_DEV if data.get("where") == "dev" else DOCS_DIR) / (key + ".md")
    if p.exists() and p.read_text(encoding="utf-8") == text:
        return {"ok": True, "backup": "keine Änderung"}
    b = backup(p) if p.exists() else None
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text if text.endswith("\n") else text + "\n", encoding="utf-8")
    return {"ok": True, "backup": b}


SYNC_LOG = HOME / ".sygnif" / "logs" / "entrosana-hub-sync.log"


def sync_rows(limit=40):
    """Die letzten Zeilen des Abgleichs (tools/hub-sync.sh), jüngste zuerst."""
    if not SYNC_LOG.exists():
        return []
    rows = []
    for line in SYNC_LOG.read_text(encoding="utf-8").splitlines()[-limit:]:
        try:
            rows.append(json.loads(line))
        except Exception:
            continue
    return list(reversed(rows))


def sync_last():
    for r in sync_rows(60):
        if r.get("step") == "done":
            return r
    return None


def sync_page():
    timer = subprocess.run(["systemctl", "--user", "list-timers", "entrosana-hub-sync.timer", "--no-pager"], capture_output=True, text=True).stdout.splitlines()
    naechster = html.escape(timer[1].split("  ")[0].strip()) if len(timer) > 1 else "unbekannt"
    rows = "".join(f"<tr><td class='mono'>{html.escape(str(r.get('t', ''))[:19].replace('T', ' '))}</td><td class='mono'>{html.escape(str(r.get('step', '')))}</td>"
                   f"<td class='{'ok' if r.get('ok') else 'err'}'>{'ok' if r.get('ok') else 'Fehler'}</td><td>{html.escape(str(r.get('text', '')))}</td></tr>" for r in sync_rows())
    body = ("<p><a href='/'>&larr; Übersicht</a></p><h1>Abgleich</h1>"
            "<p class='note'>Jede Stunde läuft <span class='mono'>tools/hub-sync.sh</span>: Texte aus dieser Konsole (Seiten, Katalog, Checklisten, Docs) werden eingecheckt, "
            "das Neueste kommt von GitHub, eigene Commits gehen hoch, und Dienste starten neu, wenn Code dazukam (api nach bestandenen Tests, app bei serve.mjs, "
            "die Konsole nur ohne offene Verbindung). Was andere Sitzungen ungespeichert im Baum haben, bleibt liegen (Autostash).</p>"
            f"<p class='mono'>Nächster Lauf: {naechster}</p>"
            "<p><button class='btn' id='run'>Jetzt abgleichen</button> <span class='mono' id='out'></span></p>"
            "<script>document.getElementById('run').addEventListener('click',async function(){var o=document.getElementById('out');o.textContent='läuft…';"
            "try{var r=await fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});var j=await r.json();"
            "o.textContent=j.ok?'gestartet, Seite lädt gleich neu':('Fehler: '+j.error);if(j.ok)setTimeout(function(){location.reload();},6000);}catch(e){o.textContent='Fehler: '+e;}});</script>"
            + (f"<table><tr><th>wann (UTC)</th><th>Schritt</th><th></th><th>Text</th></tr>{rows}</table>" if rows else "<p class='mono'>noch kein Lauf</p>"))
    return page("Abgleich", body)


def sync_start():
    r = subprocess.run(["systemctl", "--user", "start", "--no-block", "entrosana-hub-sync.service"], capture_output=True, text=True)
    if r.returncode != 0:
        raise ValueError(r.stderr.strip() or "start fehlgeschlagen")
    return {"ok": True}


def _mb(n):
    n = int(n or 0)
    return f"{n / 1048576:.1f} MB" if n >= 1048576 else (f"{n / 1024:.0f} kB" if n >= 1024 else f"{n} B")


def accounts_list():
    code, j = api_call("GET", "/api/actors")
    if code != 200:
        return page("Konten", _hub_kopf("Konten") + f"<p class='err'>{html.escape(str(j.get('error', code)))}</p>")
    quota = j.get("quota") or 0
    rows = ""
    for a in j.get("items", []):
        pr = a.get("profile") or {}
        profil = " · ".join(x for x in [ROLE_DE.get(pr.get("role"), pr.get("role") or ""), pr.get("org") or "", ", ".join(pr.get("langs") or [])] if x)
        about = f"<br><span class='desc'>{html.escape(pr.get('about'))}</span>" if pr.get("about") else ""
        web = f"<br><a class='act' href='{html.escape(pr.get('website'))}' target='_blank' rel='noopener'>{html.escape(pr.get('website'))}</a>" if pr.get("website") else ""
        rollen = ", ".join(a.get("roles") or []) or "—"
        rows += (f"<tr><td class='mono'>#{a['id']}</td><td><b>{html.escape(a.get('name') or '—')}</b><br><span class='mono'>{html.escape(a.get('email') or a.get('kind'))}</span>{about}{web}</td>"
                 f"<td>{html.escape(STANDING_DE.get(a.get('standing'), a.get('standing')))}<br><span class='mono'>{html.escape(rollen)}</span></td>"
                 f"<td class='desc'>{html.escape(profil) or '—'}</td>"
                 f"<td class='mono'>{a.get('contributions')} Beiträge<br>{a.get('open_applications')} Bewerbungen<br>{a.get('devices')} Geräte<br>{a.get('invites_sent', 0)} Einladungen, {a.get('invites_accepted', 0)} angenommen<br>{a.get('services', 0)} Dienste<br>{a.get('files', 0)} Dateien, {_mb(a.get('files_bytes', 0))}" + (f" von {_mb(quota)}" if quota else "")
                 + (f"<br><span class='err'>ruhend, Hinweis {_hub_wann(a.get('dormant_notice'))}</span>" if a.get("dormant_notice") else "") + "</td>"
                 f"<td class='mono'>{_hub_wann(a.get('created'))}</td></tr>")
    hinweis = ("<p class='note'>Rollen vergibt der Eigentümer auf dem Server: <span class='mono'>node ~/entrosana-app/api/admin.mjs grant &lt;email&gt; reviewer</span>. "
               "Beitragende entstehen über <a href='/applications'>Bewerbungen</a>.</p>")
    return page("Konten", _hub_kopf("Konten") + hinweis + f"<table><tr><th></th><th>Person</th><th>Stand · Rollen</th><th>Profil</th><th>Zahlen</th><th>seit</th></tr>{rows}</table>")


def requests_list(alle=False):
    code, j = api_call("GET", "/api/requests" + ("?all=1" if alle else ""))
    if code != 200:
        return page("Anfragen", _hub_kopf("Anfragen") + f"<p class='err'>{html.escape(str(j.get('error', code)))}</p>")
    items = j.get("items", [])
    rows = ""
    for r in items:
        rid = r["id"]
        knopf = (f"<button class='btn' data-req='{rid}' data-h='0'>wieder öffnen</button>" if r.get("handled")
                 else f"<button class='btn' data-req='{rid}' data-h='1'>erledigt</button>")
        rows += (f"<tr><td class='mono'>#{rid}</td><td><b>{html.escape(r.get('name') or '')}</b><br><span class='mono'>{html.escape(r.get('email') or '')}</span>"
                 f"{('<br>' + html.escape(r.get('org'))) if r.get('org') else ''}</td><td class='mono'>{html.escape(r.get('kind') or '')}</td>"
                 f"<td><pre style='white-space:pre-wrap;margin:0'>{html.escape(r.get('text') or '')}</pre></td>"
                 f"<td class='mono'>{_hub_wann(r.get('created'))}<br>{'Mail an info@ ' + _hub_wann(r.get('mailed')) if r.get('mailed') else '<span class=\'err\'>Mail nicht belegt</span>'}"
                 f"{('<br>erledigt ' + _hub_wann(r.get('handled'))) if r.get('handled') else ''}</td><td>{knopf} <span id='m{rid}' class='mono'></span></td></tr>")
    umschalter = ("<p class='mono'>" + ("<a href='/requests'>nur offene</a>" if alle else "<a href='/requests?all=1'>alle, auch erledigte</a>") + "</p>")
    tab = f"<table><tr><th></th><th>Person</th><th>Art</th><th>Anfrage</th><th>wann</th><th></th></tr>{rows}</table>" if items else "<p class='mono'>keine</p>"
    script = ("<script>document.querySelectorAll('button[data-req]').forEach(function(b){b.addEventListener('click',function(){"
              "var id=b.getAttribute('data-req'),h=b.getAttribute('data-h')==='1',m=document.getElementById('m'+id);m.textContent='…';"
              "fetch('/api/requests/'+id+'/handled',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handled:h})})"
              ".then(function(x){return x.json()}).then(function(j){if(j.ok){location.reload();}else{m.textContent=j.error||'Fehler';m.className='err';}})"
              ".catch(function(){m.textContent='Dienst nicht erreichbar';m.className='err';});});});</script>")
    return page("Anfragen", _hub_kopf("Anfragen") + "<p class='note'>Anfragen gingen als Mail an info@entrosana.com; hier steht der Eingang 180 Tage. «erledigt» ist eine Marke, keine Löschung.</p>" + umschalter + tab + script)


class H(BaseHTTPRequestHandler):
    server_version = "entrosana-app-admin"

    def log_message(self, *a):
        pass

    def _src_ok(self):
        ip = self.client_address[0]
        if ip in ("127.0.0.1", "::1"):
            return True
        try:
            return ipaddress.ip_address(ip) in ipaddress.ip_network("100.64.0.0/10") and _tailnet_owner(ip)
        except ValueError:
            return False

    def _send(self, code, body, ctype="text/html; charset=utf-8", extra=None):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj), "application/json")

    def _authed(self):
        if TAILNET_OPEN and self._src_ok():   # Entscheid des Eigentümers, 2026-09-08: im Tailnet reicht das Tailnet
            return True
        c = self.headers.get("Cookie", "")
        m = re.search(r"eaa=([^;]+)", c)
        return bool(m and TOKEN and hmac.compare_digest(m.group(1), TOKEN))

    def do_GET(self):
        if not self._src_ok():
            self._send(403, "forbidden", "text/plain")
            return
        u = urlparse(self.path)
        if u.path == "/login":
            key = parse_qs(u.query).get("key", [""])[0]
            if TOKEN and hmac.compare_digest(key, TOKEN):
                self._send(302, "", extra={
                    "Set-Cookie": f"eaa={TOKEN}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000",
                    "Location": "/"})
            else:
                self._send(200, page("entrosana.app admin · login",
                    "<h1>entro<span style='color:#2BD4E8'>sana</span>.app admin</h1>"
                    "<form action='/login'><input name='key' type='password' placeholder='Zugangsschlüssel' "
                    "style='width:20rem'> <button class='btn'>Weiter</button></form>"))
            return
        if not self._authed():
            self._send(302, "", extra={"Location": "/login"})
            return
        if u.path == "/":
            self._send(200, dash())
            return
        m = re.match(r"^/preview/([a-z0-9-]+\.html)$", u.path)
        if m and any(m.group(1) == n for n, _, _ in PAGES):
            self._send(200, preview_html(m.group(1)))
            return
        m = re.match(r"^/page/([a-z0-9-]+\.html)$", u.path)
        if m and any(m.group(1) == n for n, _, _ in PAGES):
            self._send(200, page_editor(m.group(1)))
            return
        m = re.match(r"^/catalogue/([a-z0-9-]+)$", u.path)
        if m:
            self._send(200, cat_editor(m.group(1)))
            return
        if u.path == "/design":
            self._send(200, design_editor())
            return
        if u.path == "/applications":
            self._send(200, applications_list())
            return
        if u.path == "/accounts":
            self._send(200, accounts_list())
            return
        if u.path == "/requests":
            self._send(200, requests_list(parse_qs(u.query).get("all", [""])[0] == "1"))
            return
        if u.path == "/invites":
            self._send(200, invites_list())
            return
        if u.path == "/modules":
            self._send(200, modules_list())
            return
        if u.path == "/services":
            self._send(200, services_list())
            return
        if u.path == "/docs":
            self._send(200, page("Docs", "<p><a href='/'>&larr; Übersicht</a></p><h1>Docs</h1>" + docs_rows()))
            return
        if u.path == "/sync":
            self._send(200, sync_page())
            return
        m = re.match(r"^/docs/(edit|dev)/([a-z0-9-]+(?:/[a-z0-9-]+)?)$", u.path)
        if m and any(m.group(2) == k for k, _, _ in docs_pages()):
            self._send(200, docs_editor(m.group(2), where="dev" if m.group(1) == "dev" else "live"))
            return
        if u.path == "/checklists":
            self._send(200, checklists_list())
            return
        m = re.match(r"^/checklists/([a-z]+/\d{3})$", u.path)
        if m:
            self._send(200, checklist_edit(m.group(1)))
            return
        if u.path == "/contributions":
            self._send(200, contrib_list(parse_qs(u.query).get("status", [""])[0]))
            return
        m = re.match(r"^/contributions/(\d{1,12})$", u.path)
        if m:
            self._send(200, contrib_detail(int(m.group(1))))
            return
        self._send(404, "not found", "text/plain")

    def do_POST(self):
        if not self._src_ok() or not self._authed():
            self._json({"ok": False, "error": "forbidden"}, 403)
            return
        u = urlparse(self.path)
        try:
            n = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(n) or b"{}")
        except Exception as e:
            self._json({"ok": False, "error": f"unlesbar: {e}"}, 400)
            return
        try:
            if u.path == "/api/sync":
                self._json(sync_start())
            elif u.path in ("/api/docs/promote", "/api/docs/pull"):
                self._json(docs_copy(data, u.path.rsplit("/", 1)[1]))
            elif u.path == "/api/docs":
                self._json(docs_save(data))
            elif u.path == "/api/page":
                name = data.get("name", "")
                if not any(name == p for p, _, _ in PAGES):
                    raise ValueError("unbekannte Seite")
                b = page_write(name, data.get("texts", []))
                self._json({"ok": True, "backup": b or "keine Änderung"})
            elif u.path == "/api/catalogue":
                b = cat_write(data.get("slug", ""), data.get("values", {}))
                self._json({"ok": True, "backup": b or "keine Änderung"})
            elif u.path == "/api/design":
                b = design_write(design_check(data))
                self._json({"ok": True, "backup": b})
            elif re.match(r"^/api/applications/\d{1,12}/decide$", u.path):
                aid = int(u.path.split("/")[3])
                self._json({"ok": True, "application": application_decide(aid, data).get("application")})
            elif re.match(r"^/api/requests/\d{1,12}/handled$", u.path):
                rid = int(u.path.split("/")[3])
                code, res = api_call("PATCH", f"/api/requests/{rid}", {"handled": bool(data.get("handled", True))})
                if code != 200:
                    raise ValueError(str(res.get("error", code)))
                self._json({"ok": True})
            elif re.match(r"^/api/modules/[a-z0-9-]+/contributors$", u.path):
                slug = u.path.split("/")[3]
                code, res = api_call("POST", f"/api/me/modules/{slug}/contributors", {"email": data.get("email", "")})
                if code != 200:
                    raise ValueError(str(res.get("error", code)))
                self._json({"ok": True})
            elif re.match(r"^/api/modules/[a-z0-9-]+/contributors/\d{1,12}/remove$", u.path):
                parts = u.path.split("/")
                code, res = api_call("DELETE", f"/api/me/modules/{parts[3]}/contributors/{parts[5]}")
                if code != 200:
                    raise ValueError(str(res.get("error", code)))
                self._json({"ok": True})
            elif re.match(r"^/api/checklists/[a-z]+/\d{3}$", u.path):
                key = u.path[len("/api/checklists/"):]
                self._json(checklist_save(key, data))
            elif re.match(r"^/api/contributions/\d{1,12}/decide$", u.path):
                cid = int(u.path.split("/")[3])
                self._json({"ok": True, "item": contrib_decide(cid, data).get("item")})
            else:
                self._json({"ok": False, "error": "unbekannter Pfad"}, 404)
        except Exception as e:
            self._json({"ok": False, "error": str(e)}, 400)


if __name__ == "__main__":
    srv = ThreadingHTTPServer((HOST, PORT), H)
    print(f"entrosana.app admin auf http://{HOST}:{PORT}/ — Schlüssel in {TOKEN_FILE}")
    srv.serve_forever()
