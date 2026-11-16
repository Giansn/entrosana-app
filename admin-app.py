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

Gespeichert wird in die Kopie auf diesem Rechner. Live auf entrosana.app
(Metanet) ist ein Text, sobald der Abgleich ihn eingecheckt und hochgeladen
und Metanet ihn gezogen hat. Jeder Editor zeigt diesen Stand, siehe stand().

Gebunden wird auf die Tailscale-Adresse, nicht auf 0.0.0.0 — im WLAN ist
davon nichts zu sehen. Zusätzlich lässt der Quellcheck nur Loopback und
das Tailnet durch.
"""
import hmac, html, ipaddress, json, os, re, secrets, shutil, subprocess, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, quote

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
    ("start.html", "Start", "/start"),          # Landeseite (2026-09-11), in der Liste seit 2026-11-16
    ("index.html", "Workspace", "/workspace"),  # bis 2026-10-31 auf "/", das leitet heute auf /start
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
# Geleertes Feld (2026-11-16): an der Stelle bleibt diese Marke stehen. So behält die Seite ihre Zahl
# von Textstellen (ein offener Editor passt weiter zur Datei), und der Text lässt sich später wieder
# hineinschreiben. Steht die Marke allein in ihrem Element, bekommt es LEER_ATTR und erscheint nicht
# auf der Seite (assets/app.css: [data-leer]{display:none}).
LEER = "<!--leer-->"
LEER_ATTR = " hidden data-leer"


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
            if skip == 0 and m.group(0) == LEER:      # geleertes Feld: die Marke selbst ist die Stelle
                out.append((m.start(), m.end(), stack[-1][0] if stack else "?", stack[-1][1] if stack else -1))
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
            "text": "" if src[a:b] == LEER else glatt(src[a:b]),
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
            gruppen.append({"titel": titel, "zu": zu, "stellen": [], "js": hinweise,
                            "art": k if isinstance(k, str) else ber[k][2]})
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
    out = out.replace(LEER_ATTR, "")
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
        raise ValueError(f"Die Seite hat {len(sp)} Textstellen, dieser Editor kennt {len(neu)}: sie wurde verändert, "
                         "seit du ihn geöffnet hast. Öffne den Editor in einem neuen Tab und trage die Änderung "
                         "dort ein; in diesem Tab bleibt dein Text stehen.")
    sizes = {str(k): v for k, v in (sizes or {}).items()}
    out = src
    geaendert = []

    for i in range(len(sp) - 1, -1, -1):
        a, b, tag, open_start = sp[i]
        t = neu[i]
        text_allows_markup(t)
        t = normalize_breaks(t.strip())
        alt = out[a:b]
        alt_leer = alt == LEER
        if alt_leer and not t:
            continue                      # war leer und bleibt leer

        wrap_m = TAG_RE.match(out, open_start) if open_start >= 0 else None
        in_wrap = bool(wrap_m and is_fs_wrap_tag(wrap_m.group(0)))
        cur_size = fs_from_open_tag(wrap_m.group(0)) if wrap_m else "md"

        new_size = sizes[str(i)] if str(i) in sizes else cur_size
        if new_size not in FS_KEYS:
            new_size = "md"

        plain_same = (not alt_leer) and (
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

        new_html = field_sized_html(t, new_size) if t else LEER
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

        # Geleert: steht das Feld allein in seinem Element, wird das Element ausgeblendet (die Zeile
        # verschwindet von der Seite). Kommt wieder Text hinein, fällt das Ausblenden weg.
        if not in_wrap and open_start >= 0:
            pm = TAG_RE.match(out, open_start)
            if pm and pm.group(2):
                tag_html, innen = pm.group(0), pm.end()
                if not t and LEER_ATTR not in tag_html:
                    wo = out.find(LEER, innen)
                    allein = (wo >= 0 and not out[innen:wo].strip()
                              and re.match(r"\s*</" + re.escape(pm.group(2)) + r"\s*>", out[wo + len(LEER):], re.I))
                    if allein:
                        out = out[:innen - 1] + LEER_ATTR + out[innen - 1:]
                elif t and alt_leer and LEER_ATTR in tag_html:
                    out = out[:open_start] + tag_html.replace(LEER_ATTR, "", 1) + out[innen:]

        if not plain_same:
            geaendert.append(
                (f"Stelle {i + 1} · <{tag}>", "" if alt_leer else glatt(alt), glatt(_BR_TOKEN.sub(" ↵ ", t)))
            )
        if new_size != cur_size or (in_wrap != (new_size != "md")):
            geaendert.append((f"Stelle {i + 1} · size", cur_size, new_size))

    if out == src:
        return None
    b_name = backup(f)
    d_name = aenderungen_schreiben(name, list(reversed(geaendert)))
    f.write_text(out, encoding="utf-8")
    return f"{b_name} · Änderungen: {d_name}" if d_name else b_name


def _fruehere_texte(name, n):
    """Je Stelle die Texte, die sie in den letzten Sicherungen trug (nur Fassungen mit derselben Zahl von Stellen)."""
    frueher = [set() for _ in range(n)]
    for f in BACKUPS.glob(f"{name}.*"):
        if not f.is_file():
            continue
        try:
            src = f.read_text(encoding="utf-8")
        except Exception:
            continue
        sp = spans(src)
        if len(sp) != n:
            continue
        for i, (a, b, _t, _o) in enumerate(sp):
            frueher[i].add("" if src[a:b] == LEER else glatt(src[a:b]))
    return frueher


def page_abgleich(name, texte=None, aenderungen=None, n=None):
    """Legt, was ein Editor geändert hat, auf den heutigen Stand der Datei: (alle Texte zum Schreiben, geänderte Nummern).

    Ein Editor-Tab kann lange offen sein. Schickte er beim Speichern alle Felder, schriebe er auch die
    unberührten zurück und überschriebe damit, was inzwischen an anderer Stelle geändert wurde (2026-11-16:
    eine Korrektur von Tippfehlern wäre beim nächsten Speichern aus dem offenen Tab verschwunden).

    aenderungen  {Nummer: Text} mit n, der Zahl der Felder im Editor: nur diese Felder werden gesetzt.
    texte        alle Felder (Tabs von vor dem 2026-11-16, admin-modules-ux): ein Feld gilt als unberührt, wenn sein
                 Text dem heutigen oder einem früheren Stand dieser Stelle gleicht; nur neuer Text wird gesetzt."""
    _, stellen = page_read(name)
    jetzt = [s["text"] for s in stellen]

    def passt(zahl):
        if int(zahl) != len(jetzt):
            raise ValueError(f"Die Seite hat {len(jetzt)} Textstellen, dieser Editor kennt {int(zahl)}: sie wurde verändert, "
                             "seit du ihn geöffnet hast. Öffne den Editor in einem neuen Tab und trage die Änderung "
                             "dort ein; in diesem Tab bleibt dein Text stehen.")
    ziel, nummern = list(jetzt), []
    if aenderungen is not None:
        if n is not None:
            passt(n)
        for k, t in aenderungen.items():
            i = int(k)
            if not 0 <= i < len(jetzt):
                raise ValueError("Feldnummer ausserhalb der Seite")
            ziel[i] = str(t)
            nummern.append(i)
        return ziel, sorted(nummern)
    if texte is None:
        raise ValueError("keine Texte geschickt")
    passt(len(texte))
    frueher = _fruehere_texte(name, len(jetzt))
    for i, t in enumerate(texte):
        g = glatt(normalize_breaks(str(t)))
        if g == jetzt[i] or g in frueher[i]:
            continue
        ziel[i] = str(t)
        nummern.append(i)
    return ziel, nummern


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
    _design_einchecken()
    return f"{b} · Änderungen: {d_name}" if d_name else b


# ── Stand: gespeichert, veröffentlicht, live ───────────────────────────────
# Seit dem Umzug nach Metanet (2026-11-05) schreibt die Konsole in die Kopie
# auf e14. Live ist ein Text erst, wenn der Abgleich (tools/hub-sync.sh) ihn
# eingecheckt und nach GitHub hochgeladen hat und Metanet ihn gezogen hat
# (dort alle zwei Minuten). Die frühere Meldung «in ≤5 s live» galt nur,
# solange serve.mjs auf e14 die Besucher bediente. stand() misst die drei
# Stufen je Datei, statt sie zu versprechen (2026-11-16).
# Dieselben Pfade wie TEXT in tools/hub-sync.sh: was der Abgleich von selbst eincheckt.
SYNC_PFADE = [":(glob)*.html", "assets/catalogue.js", "assets/seeds.js", "assets/catalogue-sizes.js",
              ":(glob)docs-site/pages.json", ":(glob)docs-site/*.md", ":(glob)docs-site/*/*.md",
              ":(glob)docs-dev/pages.json", ":(glob)docs-dev/*.md", ":(glob)docs-dev/*/*.md", ":(glob)atrium-site/*.md"]


def _git(*args, timeout=15):
    return subprocess.run(["git", "-C", str(APP), *args], capture_output=True, text=True, timeout=timeout)


def _lokal(iso) -> str:
    """UTC-Zeit aus dem Protokoll als Ortszeit: «heute 20:54», «gestern 07:10» oder «14.11. 20:54»."""
    import datetime as _d
    try:
        d = _d.datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone()
    except Exception:
        return str(iso)[:16].replace("T", " ")
    tage = (_d.datetime.now().astimezone().date() - d.date()).days
    if tage == 0:
        return "heute " + d.strftime("%H:%M")
    if tage == 1:
        return "gestern " + d.strftime("%H:%M")
    return d.strftime("%d.%m. %H:%M")


def _datei_erlaubt(pfad: str) -> bool:
    if pfad in ("assets/catalogue.js", "assets/seeds.js", "assets/app.css"):
        return True
    if any(pfad == n for n, _, _ in PAGES):
        return True
    m = re.match(r"^(?:docs-site|docs-dev)/([a-z0-9-]+(?:/[a-z0-9-]+)?)\.md$", pfad)
    return bool(m and any(m.group(1) == k for k, _, _ in docs_pages()))


_MAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


def _dicht(texte) -> str:
    """Alle Texte einer Seite als eine Zeichenkette ohne Leerraum.

    Cloudflare ersetzt Mailadressen im ausgelieferten Quelltext durch
    «[email protected]» und kann dabei eine Textstelle in mehrere teilen.
    Deshalb wird nicht Stelle für Stelle verglichen, und Adressen werden auf
    beiden Seiten gleich maskiert."""
    # Je Stelle maskieren, erst dann fügen: sonst greift das Muster über die Stellengrenze
    # («…@entrosana.com» + «.» + «Accounts» läse sich als eine Adresse).
    t = "".join(_MAIL_RE.sub("[email protected]", html.unescape(x)) for x in texte)
    return re.sub(r"\s+", "", t)


def _hole_live(url, timeout=8):
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "entrosana-admin-stand/1", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _live_gleich(pfad):
    """True oder False; None, wenn es sich nicht prüfen lässt (kein Netz, gerenderte Docs)."""
    try:
        seite = next((p for n, _, p in PAGES if n == pfad), None)
        if seite:
            lokal = (APP / pfad).read_text(encoding="utf-8")
            live = _hole_live(LIVE + seite).decode("utf-8", "replace")
            return (_dicht(lokal[a:b] for a, b, _t, _o in spans(lokal) if lokal[a:b] != LEER)
                    == _dicht(live[a:b] for a, b, _t, _o in spans(live) if live[a:b] != LEER))
        if pfad.startswith("assets/"):
            # Die Kante hält Assets vier Stunden; die Abfrage mit Marke geht am Zwischenspeicher vorbei.
            return (APP / pfad).read_bytes() == _hole_live(f"{LIVE}/{pfad}?stand={int(time.time())}")
    except Exception:
        return None
    return None


def _abgleich_stand():
    """(Ortszeit des letzten fertigen Laufs oder "", Fehler des jüngsten Laufs oder "")."""
    rows = sync_rows(40)
    lauf = []
    for i, r in enumerate(rows):          # jüngste zuerst; der jüngste Lauf reicht bis zum «done» davor
        if r.get("step") == "done" and i > 0:
            break
        lauf.append(r)
    fehler = next((r for r in lauf if r.get("ok") is False and r.get("step") in ("branch", "commit", "pull", "push")), None)
    fertig = next((r for r in rows if r.get("step") == "done"), None)
    return (_lokal(fertig.get("t", "")) if fertig else "",
            f"{fehler.get('step')}: {str(fehler.get('text', ''))[:200]}" if fehler else "")


def stand(pfade):
    """Stufe der genannten Dateien: gespeichert, veroeffentlicht oder live.

    gespeichert      die Datei weicht vom Stand auf GitHub ab (noch nicht eingecheckt oder nicht hochgeladen)
    veroeffentlicht  sie steht so auf GitHub; Metanet zieht alle zwei Minuten
    live             entrosana.app liefert denselben Text aus (nachgemessen, nicht angenommen)"""
    dateien = []
    for p in pfade:
        if not _datei_erlaubt(p):
            raise ValueError("unbekannte Datei")
        offen = bool(_git("status", "--porcelain", "--", p).stdout.strip())
        hoch = (not offen) and _git("diff", "--quiet", "origin/master", "--", p).returncode == 0
        dateien.append({"pfad": p, "offen": offen, "hoch": hoch, "live": _live_gleich(p) if hoch else False})
    if not dateien:
        raise ValueError("keine Datei genannt")
    if not all(d["hoch"] for d in dateien):
        stufe = "gespeichert"
    elif all(d["live"] is True for d in dateien):
        stufe = "live"
    else:
        stufe = "veroeffentlicht"
    letzter, fehler = _abgleich_stand()
    return {"stufe": stufe, "alles": False, "warten": [d["pfad"] for d in dateien if not d["hoch"]], "voraus": 0,
            "live_pruefbar": all(d["live"] is not None for d in dateien), "abgleich": letzter, "fehler": fehler}


def stand_alle():
    """Überblick über alles, was der Abgleich mitnimmt: was aufs Einchecken wartet und was aufs Hochladen."""
    offen = sorted({l[3:].strip().strip('"') for l in
                    _git("status", "--porcelain", "--untracked-files=no", "--", *SYNC_PFADE).stdout.splitlines() if l.strip()})
    r = _git("rev-list", "--count", "origin/master..master")
    voraus = int(r.stdout.strip()) if r.returncode == 0 and r.stdout.strip().isdigit() else 0
    letzter, fehler = _abgleich_stand()
    return {"stufe": "gespeichert" if (offen or voraus) else "veroeffentlicht", "alles": True, "warten": offen,
            "voraus": voraus, "live_pruefbar": False, "abgleich": letzter, "fehler": fehler}


STAND_JS = r"""
(function(){
var box=document.getElementById('stand');if(!box)return;
var t=document.getElementById('stand-t'),knopf=document.getElementById('stand-b');
var q=box.getAttribute('data-q'),ansehen=box.getAttribute('data-ansehen')||'';
var REIHE=['gespeichert','veroeffentlicht','live'];
var letzter=null,ungesp=0,laeuft=false,seit=0,uhr=null;
function male(n,warte){var li=box.querySelectorAll('.spur li');
  for(var i=0;i<li.length;i++){li[i].className=(i<=n?'ist':'')+(i===2?' ziel':'')+(warte&&i===n+1?' wartet':'');}}
function sag(text,fehler){t.textContent=text;t.className='lage__t'+(fehler?' err':'');}
function stopp(){laeuft=false;if(uhr){clearTimeout(uhr);uhr=null;}}
function warte(){if(uhr)return;if(!seit)seit=Date.now();
  uhr=setTimeout(function(){uhr=null;hole();},Date.now()-seit<40000?3000:7000);}
function wartetext(j){
  var s=[];
  if(j.warten.length)s.push((j.warten.length===1?'1 Datei ist':j.warten.length+' Dateien sind')+' gespeichert, aber noch nicht veröffentlicht ('+j.warten.slice(0,4).join(', ')+(j.warten.length>4?' und weitere':'')+').');
  if(j.voraus)s.push((j.voraus===1?'1 Commit wartet':j.voraus+' Commits warten')+' auf das Hochladen nach GitHub.');
  return s.join(' ');}
function zeige(){
  if(ungesp>0){male(-1,false);knopf.hidden=true;
    sag(ungesp===1?'1 Änderung ist noch nicht gespeichert.':ungesp+' Änderungen sind noch nicht gespeichert.');return;}
  var j=letzter;
  if(!j){male(-1,false);knopf.hidden=true;sag('Stand wird gelesen …');return;}
  if(!j.ok){male(-1,false);knopf.hidden=true;sag('Der Stand lässt sich gerade nicht lesen: '+j.error,true);return;}
  if(j.stufe==='gespeichert'){
    if(!laeuft){male(0,false);knopf.hidden=false;
      sag(j.alles?wartetext(j):'Noch nicht auf entrosana.app. Das geht von selbst, spätestens in zehn Minuten, oder sofort mit dem Knopf.');return;}
    male(0,true);knopf.hidden=true;
    if(j.fehler&&Date.now()-seit>15000){stopp();knopf.hidden=false;
      sag('Der Abgleich meldet einen Fehler ('+j.fehler+'). Das Protokoll steht unter «Abgleich».',true);return;}
    if(Date.now()-seit>70000){stopp();knopf.hidden=false;
      sag('Der Abgleich ist gelaufen, aber diese Datei wartet noch. Das Protokoll steht unter «Abgleich».',true);return;}
    sag('Wird veröffentlicht …');warte();return;}
  laeuft=false;knopf.hidden=true;
  if(j.stufe==='veroeffentlicht'){
    if(j.alles){male(1,false);stopp();sag('Alles Gespeicherte ist veröffentlicht.'+(j.abgleich?' Letzter Abgleich '+j.abgleich+'.':''));return;}
    if(!j.live_pruefbar){male(1,false);stopp();sag('Veröffentlicht. Die Seite übernimmt es innert zwei Minuten.');return;}
    if(seit&&Date.now()-seit>300000){male(1,false);stopp();
      sag('Veröffentlicht, aber auf entrosana.app steht nach fünf Minuten noch der alte Stand. Das Protokoll steht unter «Abgleich».',true);return;}
    male(1,true);sag('Veröffentlicht. entrosana.app übernimmt es innert zwei Minuten.');warte();return;}
  male(2,false);stopp();t.className='lage__t';t.textContent='Live auf entrosana.app. ';
  if(ansehen){var a=document.createElement('a');a.href=ansehen;a.target='_blank';a.rel='noopener';a.textContent='Ansehen';t.appendChild(a);}
}
function hole(){return fetch('/api/stand?'+q,{cache:'no-store'}).then(function(r){return r.json()})
  .then(function(j){letzter=j;zeige();}).catch(function(e){letzter={ok:false,error:String(e)};zeige();});}
knopf.addEventListener('click',function(){
  stopp();laeuft=true;seit=Date.now();knopf.hidden=true;male(0,true);sag('Wird veröffentlicht …');
  fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(function(r){return r.json()})
  .then(function(j){
    if(!j.ok){laeuft=false;knopf.hidden=false;sag('Der Abgleich liess sich nicht starten: '+j.error,true);return;}
    uhr=setTimeout(function(){uhr=null;hole();},2500);})
  .catch(function(e){laeuft=false;knopf.hidden=false;sag('Die Konsole ist nicht erreichbar: '+e,true);});});
window.standNeu=function(){ungesp=0;seit=0;stopp();hole();};
window.standUngespeichert=function(n){if(n===ungesp)return;ungesp=n;zeige();};
hole();
})();
"""


def stand_block(dateien=None, ansehen="", block=False, knopf=True):
    """Die Spur mit Satz und Knopf. dateien=None: alles, was der Abgleich mitnimmt (Übersicht, zwei Stufen).
    knopf=False: nur anzeigen (die Abgleich-Seite hat ihren eigenen Knopf)."""
    if dateien is None:
        q, stufen = "alles=1", "<li>Gespeichert</li><li>Veröffentlicht</li>"
    else:
        q = "&".join("datei=" + quote(d, safe="") for d in dateien)
        stufen = "<li>Gespeichert</li><li>Veröffentlicht</li><li>Live</li>"
    return (f"<div class='lage{' lage--block' if block else ''}' id='stand' data-q='{q}' "
            f"data-ansehen='{html.escape(ansehen, quote=True)}'>"
            f"<ol class='spur' aria-label='Stand'>{stufen}</ol>"
            "<span class='lage__t' id='stand-t' role='status' aria-live='polite'>Stand wird gelesen …</span>"
            f"<button class='btn sm{'' if knopf else ' aus'}' id='stand-b' type='button' hidden>Veröffentlichen</button></div>"
            "<script>" + STAND_JS + "</script>")


def _design_einchecken():
    """assets/app.css einchecken, wenn sie sich vom letzten Commit nur im verwalteten Block unterscheidet.

    Der Abgleich nimmt app.css nicht von selbst mit (Code anderer Sitzungen bleibt liegen); ohne Commit käme
    ein gespeichertes Design nie auf entrosana.app. Liegt daneben anderes Ungespeichertes in der Datei, bleibt
    alles liegen, und die Spur zeigt weiter «gespeichert»."""
    def ohne_block(css):
        i = css.find(DESIGN_START)
        if i < 0:
            return css.rstrip()
        j = css.find(DESIGN_END, i)
        return css.rstrip() if j < 0 else (css[:i].rstrip() + "\n" + css[j + len(DESIGN_END):].lstrip()).rstrip()
    try:
        kopf = _git("show", "HEAD:assets/app.css")
        if kopf.returncode != 0 or ohne_block(kopf.stdout) != ohne_block(APP_CSS.read_text(encoding="utf-8")):
            return False
        r = _git("commit", "-q", "-m",
                 f"design: werte aus der konsole ({time.strftime('%Y%m%d-%H%M%S')})\n\nCo-Authored-By: entrosana-admin <sygnif@entrosana.com>",
                 "--", "assets/app.css", timeout=20)
        return r.returncode == 0
    except Exception:
        return False


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
/* ── Bedienung (2026-11-16) ───────────────────────────────────────────────
   Kopf mit Wegweiser auf jeder Seite, Zeilenlisten mit dem Knopf neben dem
   Namen, Feldnamen in Worten, und die Spur gespeichert, veröffentlicht, live.
   Steht am Ende, damit es gegen die Regeln weiter oben gewinnt. */
[hidden]{display:none!important}
:root{color-scheme:dark}
body{padding:0}
.wrap{max-width:78rem;padding:1.4rem 2rem 2rem}
h1{margin:.2rem 0 .5rem}
h2[id]{scroll-margin-top:4.5rem}
.kopf{position:sticky;top:0;z-index:30;background:rgba(27,30,36,.97);border-bottom:1px solid #323843}
.kopf__in{max-width:78rem;margin:0 auto;padding:.55rem 2rem;display:flex;align-items:center;gap:1.6rem}
.marke{color:#E9EBE7;font-weight:600;font-size:1.05rem;letter-spacing:-.01em;white-space:nowrap}
.marke b{color:#2BD4E8;font-weight:600}
.marke span{color:#8F95A1;font-weight:400}
.marke:hover{text-decoration:none}
.weg{display:flex;gap:.15rem;overflow-x:auto;scrollbar-width:none}
.weg::-webkit-scrollbar{display:none}
.weg a{color:#C6CAD1;padding:.32rem .75rem;border-radius:999px;white-space:nowrap;font-size:.95rem}
.weg a:hover{text-decoration:none;background:rgba(255,255,255,.07)}
.weg a[aria-current]{color:#071316;background:#2BD4E8;font-weight:600}
.unterweg{display:flex;flex-wrap:wrap;gap:.2rem 1.1rem;margin:.2rem 0 1rem;font-size:.95rem}
a.btn{display:inline-block;text-align:center}
/* Felder ohne Typangabe (Checklisten) und das Schlüsselfeld sahen aus wie vom Browser, hell auf dunklem Grund. */
input:not([type]),input[type=password]{width:100%;background:#101318;color:#E9EBE7;border:1px solid #323843;border-radius:8px;padding:.55em .7em;font:inherit;font-size:.95rem}
a.btn:hover{text-decoration:none}
.btn.sm{padding:.32em .95em;font-size:.88rem}
.btn[disabled]{opacity:.55;cursor:default}
.btn:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #2BD4E8;outline-offset:2px}
/* Zeilenliste: Name und Nebenangabe links, der Knopf gleich daneben statt eine Tabellenbreite entfernt. */
.zl{list-style:none;margin:.5rem 0 0;padding:0;max-width:50rem;border-top:1px solid #323843}
.zl>li{position:relative;display:flex;align-items:center;gap:1rem;padding:.6rem .15rem;border-bottom:1px solid #323843}
.zl>li:hover{background:rgba(255,255,255,.03)}
/* Die ganze Zeile führt zum Ziel des Namens; «Ansehen» liegt darüber und bleibt ein eigener Verweis. */
.zl__n .t::after{content:"";position:absolute;inset:0}
.zl__n .t:hover{text-decoration:none}
.zl__a a:not(.btn){position:relative;z-index:1}
.zl__n{flex:1;min-width:0}
.zl__n .t{color:#E9EBE7;font-weight:600}
.zl__n .m{display:block;color:#8F95A1;font-size:.86rem;margin-top:.12rem;overflow-wrap:anywhere}
.zl__n .m .mono{font-size:.8rem}
.zl__n .m.offen{color:#E2B04A}
.zl__n .m:empty{display:none}
.zl__a{display:flex;gap:.9rem;align-items:center;flex-shrink:0}
.zl__h{margin:1.3rem 0 0;color:#8F95A1;font-size:.9rem;font-weight:400}
.tun{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:1rem 0 0;max-width:50rem}
.tun__w{color:#8F95A1;margin-right:.3rem}
/* Stand: drei Stufen, gefüllt bis dorthin, wo der Text wirklich ist. */
.lage{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1rem;min-width:0}
.lage--block{margin:1rem 0 0;padding:.75rem .9rem;border:1px solid #323843;border-radius:10px;max-width:50rem;background:rgba(255,255,255,.015)}
.spur{display:flex;list-style:none;margin:0;padding:0;font-size:.88rem;color:#8F95A1}
.spur li{display:flex;align-items:center;white-space:nowrap}
.spur li::before{content:"";width:.62rem;height:.62rem;border-radius:50%;border:1.5px solid #5A6273;margin-right:.4rem}
.spur li::after{content:"";width:1.4rem;height:1.5px;background:#323843;margin:0 .5rem}
.spur li:last-child::after{display:none}
.spur li.ist{color:#E9EBE7}
.spur li.ist::before{background:#2BD4E8;border-color:#2BD4E8}
.spur li.ist:has(+li.ist)::after{background:#2BD4E8}
.spur li.ist.ziel::before{background:#35B36B;border-color:#35B36B}
.spur li.wartet::before{border-color:#E2B04A;animation:puls 1.3s ease-in-out infinite}
@keyframes puls{50%{opacity:.3}}
@media (prefers-reduced-motion:reduce){.spur li.wartet::before{animation:none}}
.lage__t{color:#C6CAD1;font-size:.92rem;line-height:1.4}
.lage__t.err{color:#F0B3AA}
.lage .aus{display:none!important}
/* Der Knopf steht bei der Stufe, zu der er führt; der Satz folgt und bricht als Ganzes um. */
.lage .btn{order:2}
.lage__t{order:3}
/* Felder: der Name in Worten über dem Feld; geändert und noch nicht gespeichert trägt einen Strich links. */
.f{display:block;margin:.65rem 0;padding:0 0 0 .7rem;border-bottom:0;border-left:2px solid transparent}
.f .k{font-family:inherit;font-size:.82rem;color:#8F95A1;padding:0 0 .22rem}
.f.is-neu{border-left-color:#E2B04A}
.f .k .leer{color:#E2B04A}
.f.is-sel{background:none}
.f.is-sel .k{color:#2BD4E8}
/* Jedes Feld zeigt seinen ganzen Text und wächst mit ihm (wachse() im Editor), auch auf dem Telefon. */
.f textarea{min-height:0;overflow:hidden;resize:none;line-height:1.4;display:block}
.felder{scrollbar-width:thin;scrollbar-color:#3a414d transparent}
.f.zeichen{display:flex;align-items:center;gap:.7rem}
.f.zeichen .k{padding:0;min-width:10rem}
.kat:not(:has(.f:not([hidden]))){display:none}
.such{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:.7rem;margin:0;padding:.15rem 0 .6rem;background:#1B1E24}
.such input{max-width:22rem}
.such span{color:#8F95A1;font-size:.86rem;white-space:nowrap}
.ed-kopf{display:flex;flex-wrap:wrap;align-items:baseline;gap:.3rem 1.2rem;margin-bottom:.7rem}
.ed-kopf h1{margin:0}
.ed-kopf p{margin:0;color:#8F95A1;font-size:.92rem}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem 1rem;z-index:5}
.bar__m{color:#8F95A1;font-size:.9rem}
.bar__r{margin-left:auto;display:flex;flex-wrap:wrap;gap:.45rem}
.bar .lage{flex:1 1 22rem}
.bar__m:empty{display:none}
.knapp{display:none}
/* Breit: der Editor füllt das Fenster, Felder und Vorschau scrollen je für sich, die Leiste unten bleibt stehen. */
@media (min-width:1101px){
  body.ed{height:100vh;display:flex;flex-direction:column;overflow:hidden}
  body.ed .wrap{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;padding-bottom:0}
  body.ed .zwei{flex:1;min-height:0;grid-template-rows:minmax(0,1fr);align-items:stretch}
  body.ed .felder{max-height:none;min-height:0}
  body.ed .vorschau{position:static;height:auto;min-height:0}
  body.ed .bar{position:static;margin-top:.7rem;padding:.7rem 0}
}
/* Schmal: die Seite scrollt als Ganzes (kein Kasten im Kasten); die Vorschau kommt auf Knopfdruck an die Stelle der Felder. */
@media (max-width:1100px){
  .felder{max-height:none;overflow:visible;padding-right:0}
  .such{position:static}
  .zwei .griff,.zwei .vorschau{display:none}
  .zwei.vs .felder{display:none}
  .zwei.vs .vorschau{display:block;position:static;height:calc(100vh - 13rem);min-height:22rem}
  .bar{padding:.7rem 0 calc(.7rem + env(safe-area-inset-bottom))}
}
@media (max-width:760px){
  .wrap{padding:1rem .9rem 1.2rem}
  .kopf__in{padding:.45rem .9rem;gap:.7rem}
  .marke span{display:none}
  .zl>li{gap:.8rem;padding:.7rem .15rem}
  .zl__a .btn{display:none}
  .zl>li::after{content:"›";color:#5A6273;font-size:1.2rem;line-height:1}
  .btn.sm{min-height:40px;padding:.5em 1.1em;margin:0}
  .bar{gap:.45rem .5rem}
  .bar .btn{margin:0;padding:.6em .95em}
  /* erste Zeile die Knöpfe, darunter die Spur mit ihrem Satz */
  .bar__r{margin-left:0;order:2;flex-wrap:nowrap}
  .bar .lage{order:3;flex-basis:100%}
  .bar__m{order:4;flex-basis:100%}
  .lang{display:none}
  .knapp{display:inline}
  .spur li::after{width:.8rem;margin:0 .35rem}
  .f textarea,.f input{font-size:1rem;padding:.55em .7em}
  .f.zeichen .k{min-width:0;flex:1}
}
"""


# Wegweiser im Kopf jeder Seite (2026-11-16): Beschriftung, Ziel, und die Pfadanfänge, bei denen der Eintrag
# als «hier» markiert wird. Markiert wird im Browser, damit kein Aufrufer seinen Ort mitgeben muss.
WEG = [("Seiten", "/#seiten", "/page/"), ("Katalog", "/#katalog", "/catalogue/"),
       ("Checklisten", "/checklists", "/checklists"), ("Docs", "/docs", "/docs"),
       ("Eingänge", "/contributions", "/contributions,/applications,/accounts,/requests,/invites,/modules,/services"),
       ("Abgleich", "/sync", "/sync"), ("Gestaltung", "/design", "/design")]
WEG_JS = ("(function(){var p=location.pathname,a=document.querySelectorAll('.weg a');"
          "for(var i=0;i<a.length;i++){var h=a[i].getAttribute('data-p').split(',');"
          "for(var k=0;k<h.length;k++){if(p.indexOf(h[k])===0){a[i].setAttribute('aria-current','page');"
          "var w=a[i].parentNode;w.scrollLeft=Math.max(0,a[i].offsetLeft-w.offsetLeft-24);}}}})();")


# Jedes Textfeld zeigt seinen ganzen Text und wächst mit ihm; nur der grosse Docs-Editor (#md) scrollt.
WACHS_JS = ("(function(){function w(el){if(!el.offsetParent)return;el.style.overflow='hidden';el.style.height='auto';"
            "el.style.height=(el.scrollHeight+2)+'px';}"
            "var ta=document.querySelectorAll('textarea:not(#md)');"
            "for(var i=0;i<ta.length;i++){w(ta[i]);ta[i].addEventListener('input',function(){w(this);});}})();")


def page(title, body, klasse=""):
    weg = "".join(f"<a href='{h}' data-p='{p}'>{l}</a>" for l, h, p in WEG)
    return (f"<!DOCTYPE html><html lang=de><head><meta charset=utf-8>"
            f"<meta name=viewport content='width=device-width,initial-scale=1'>"
            f"<title>{html.escape(title)}</title><style>{CSS}</style></head>"
            f"<body class='{klasse}'><header class='kopf'><div class='kopf__in'>"
            "<a class='marke' href='/'>entro<b>sana</b>.app <span>admin</span></a>"
            f"<nav class='weg' aria-label='Bereiche der Konsole'>{weg}</nav></div></header>"
            f"<div class='wrap'>{body}</div><script>{WEG_JS}{WACHS_JS}</script></body></html>")


def _zahlen():
    """Zahlen für die Übersicht aus der API (über den Tunnel nach Metanet). Wo keine Antwort kam, steht None."""
    def hol(pfad):
        code, j = api_call("GET", pfad)
        return (j, None) if code == 200 else (None, str(j.get("error", code)))
    z = {}
    b, z["fehler"] = hol("/api/contributions")
    items = (b or {}).get("items", [])
    z["beitraege"] = len(items) if b is not None else None
    z["beitraege_offen"] = (len([c for c in items if c.get("status") in ("received", "confirmed", "reviewing")])
                            if b is not None else None)
    a, _ = hol("/api/applications")
    z["bewerbungen"] = len(a.get("items", [])) if a is not None else None
    k, _ = hol("/api/actors")
    kitems = (k or {}).get("items", [])
    z["konten"] = len([x for x in kitems if x.get("kind") == "email"]) if k is not None else None
    z["dateien"] = sum(int(x.get("files") or 0) for x in kitems) if k is not None else None
    z["dateien_bytes"] = sum(int(x.get("files_bytes") or 0) for x in kitems)
    z["quota"] = (k or {}).get("quota") or 0
    r, _ = hol("/api/requests")
    z["anfragen"] = len(r.get("items", [])) if r is not None else None
    i, _ = hol("/api/invites")
    iitems = (i or {}).get("items", [])
    z["einladungen"] = len(iitems) if i is not None else None
    z["einladungen_offen"] = len([x for x in iitems if not x.get("accepted")]) if i is not None else None
    m, _ = hol("/api/modules/meta")
    mitems = (m or {}).get("items", {})
    z["module"] = len(mitems) if m is not None else None
    z["punkte"] = sum(v.get("points", 0) for v in mitems.values()) if m is not None else None
    s, _ = hol("/api/services")
    sitems = (s or {}).get("items", [])
    z["dienste"] = len(sitems) if s is not None else None
    z["dienste_ab"] = len([x for x in sitems if x.get("state") in ("warn", "off")]) if s is not None else None
    z["maschine"] = len(((s or {}).get("machine") or {}).get("services", [])) if s is not None else None
    return z


def _zeile(name, meta, ziel, knopf="Öffnen", ansehen="", warn=False):
    """Eine Zeile der Übersicht: der Name führt zum selben Ziel wie der Knopf daneben."""
    return ("<li><div class='zl__n'>"
            f"<a class='t' href='{ziel}'>{name}</a><span class='m{' offen' if warn else ''}'>{meta}</span></div>"
            f"<div class='zl__a'><a class='btn ghost sm' href='{ziel}'>{knopf}</a>"
            + (f"<a href='{ansehen}' target='_blank' rel='noopener'>Ansehen</a>" if ansehen else "")
            + "</div></li>")


def dash():
    def n(z, k):
        return "?" if z.get(k) is None else str(z[k])

    def mz(zahl, ein, mehr):
        return f"1 {ein}" if zahl == 1 else f"{zahl} {mehr}"

    seiten = ""
    for name, label, pfad in PAGES:
        if not (APP / name).exists():
            continue
        _, stellen = page_read(name)
        seiten += _zeile(html.escape(label), f"<span class='mono'>entrosana.app{pfad}</span> &nbsp; {len(stellen)} Texte",
                         f"/page/{name}", "Bearbeiten", LIVE + pfad)

    _, eintraege = cat_entries()
    abteilungen = [("modules", "Modules"), ("tools", "Tools"), ("contribute", "Contribute")]
    bekannt = {a for a, _ in abteilungen}
    stand_worte = {"idea": "nur eine Idee", "development": "noch in Entwicklung", "finished": "fertig",
                   "available": "fertig", "running": "läuft", "draft": "Entwurf"}
    gleis_worte = {"available": "verfügbar", "onrequest": "auf Anfrage", "contributed": "aus einem Beitrag",
                   "running": "läuft", "checklist": "Checkliste zum Starten", "start": "Aufgabe zum Mitmachen"}
    katalog = ""
    for abt, titel_abt in abteilungen + [("", "Weitere")]:
        gruppe = [e for e in eintraege if (e.get("abteilung") == abt if abt else e.get("abteilung") not in bekannt)]
        if not gruppe:
            continue
        zeilen = ""
        for e in sorted(gruppe, key=lambda x: x["felder"].get("title", (0, 0, x["slug"]))[2].lower()):
            titel = e["felder"].get("title", (0, 0, e["slug"]))[2]
            wort = stand_worte.get(e["felder"].get("state", (0, 0, ""))[2]) or gleis_worte.get(e.get("gleis"), "")
            zeilen += _zeile(html.escape(titel), wort, f"/catalogue/{e['slug']}", "Bearbeiten")
        katalog += f"<h3 class='zl__h'>{titel_abt}</h3><ul class='zl'>{zeilen}</ul>"

    z = _zahlen()
    tun = []
    if z.get("beitraege_offen"):
        tun.append((mz(z["beitraege_offen"], "Beitrag prüfen", "Beiträge prüfen"), "/contributions"))
    if z.get("bewerbungen"):
        tun.append((mz(z["bewerbungen"], "Bewerbung entscheiden", "Bewerbungen entscheiden"), "/applications"))
    if z.get("anfragen"):
        tun.append((mz(z["anfragen"], "Anfrage beantworten", "Anfragen beantworten"), "/requests"))
    if z.get("dienste_ab"):
        tun.append((mz(z["dienste_ab"], "gestörten Dienst ansehen", "gestörte Dienste ansehen"), "/services"))
    if z["fehler"]:
        zu_tun = ("<p class='fehler'><b>Die Hub-API antwortet nicht</b> (" + html.escape(z["fehler"]) + "). "
                  "Beiträge, Bewerbungen, Anfragen und Konten lassen sich gerade nicht lesen. Die Konsole erreicht die API "
                  "über den Tunnel nach Metanet; der Dienst heisst <span class='mono'>entrosana-api-tunnel</span>.</p>")
    elif tun:
        zu_tun = ("<p class='tun'><span class='tun__w'>Zu tun</span>"
                  + "".join(f"<a class='btn sm' href='{h}'>{t}</a>" for t, h in tun) + "</p>")
    else:
        zu_tun = "<p class='tun'><span class='tun__w'>Zu tun</span> Kein Beitrag, keine Bewerbung und keine Anfrage wartet.</p>"

    eingang = (
        _zeile("Beiträge", f"{n(z, 'beitraege_offen')} offen, {n(z, 'beitraege')} insgesamt", "/contributions", warn=bool(z.get("beitraege_offen")))
        + _zeile("Bewerbungen", f"{n(z, 'bewerbungen')} offen", "/applications", warn=bool(z.get("bewerbungen")))
        + _zeile("Anfragen", f"{n(z, 'anfragen')} offen; sie gingen auch an info@", "/requests", warn=bool(z.get("anfragen")))
        + _zeile("Einladungen", f"{n(z, 'einladungen_offen')} noch nicht angenommen, {n(z, 'einladungen')} insgesamt", "/invites")
        + _zeile("Konten", f"{n(z, 'konten')} Personen; {n(z, 'dateien')} Dateien, {_mb(z['dateien_bytes'])} von {_mb(z['quota'])} je Konto", "/accounts")
        + _zeile("Module aus Beiträgen", f"{n(z, 'module')} Module, {n(z, 'punkte')} Punkte", "/modules")
        + _zeile("Dienste", f"{n(z, 'dienste')} in Konten, {n(z, 'dienste_ab')} gestört; {n(z, 'maschine')} auf der Maschine", "/services",
                 warn=bool(z.get("dienste_ab"))))

    letzter = sync_last()
    return page("Übersicht · entrosana.app admin",
        "<h1>Übersicht</h1>"
        + stand_block(None, block=True)
        + zu_tun
        + "<h2 id='seiten'>Seiten</h2>"
        "<p class='note'>Du änderst nur den Text. Aufbau, Gestaltung und Verweise einer Seite bleiben, wie sie sind.</p>"
        f"<ul class='zl'>{seiten}</ul>"
        "<h2 id='katalog'>Katalog</h2>"
        "<p class='note'>Die Karten für Module, Tools und Mitmach-Aufgaben. Ihr Text erscheint auf der Übersicht "
        "und auf der Detailseite des Eintrags.</p>"
        + katalog
        + "<h2 id='weitere'>Checklisten und Docs</h2><ul class='zl'>"
        + _zeile("Checklisten", "Die Schritte der Projektvorlagen für Tools, Module und den Hub", "/checklists")
        + _zeile("Docs", f"{len(docs_pages())} Seiten auf docs.entrosana.app, je eine live und eine in Entwicklung", "/docs")
        + "</ul>"
        "<h2 id='eingang'>Eingänge und Konten</h2>"
        f"<ul class='zl'>{eingang}</ul>"
        "<h2 id='betrieb'>Abgleich und Gestaltung</h2><ul class='zl'>"
        + _zeile("Abgleich mit GitHub",
                 ("Zuletzt " + html.escape(_lokal(letzter.get("t", ""))) + ", " + html.escape(str(letzter.get("text", ""))))
                 if letzter else "Noch kein Lauf", "/sync")
        + _zeile("Gestaltung", "Farben, Satzbreite, Rundung und Schriftgrösse des Hubs", "/design")
        + "</ul>"
        "<p class='note' style='margin-top:2rem'>Vor jeder Speicherung legt die Konsole eine Kopie der Datei ab und behält "
        "die letzten zwanzig je Datei (<span class='mono'>~/entrosana-app-backups</span>).</p>")


ENTWURF_JS = r"""
var KEY=__KEY__;
var FELDER=function(){return document.querySelectorAll(__SEL__)};
function sammle(){var n=FELDER(),v={};for(var i=0;i<n.length;i++)v[n[i].getAttribute(__ATTR__)]=n[i].value;return v;}
var GESPEICHERT=JSON.stringify(sammle());
function schmutzig(){return JSON.stringify(sammle())!==GESPEICHERT;}
// Der Entwurf hält nur, was vom gespeicherten Stand abweicht, je Feld mit dem Text, von dem es ausging.
// So dreht er später kein Feld zurück, das inzwischen an anderer Stelle geändert wurde.
function entwurfSchreiben(){try{
  var alt=JSON.parse(GESPEICHERT),v=sammle(),d={},zahl=0;
  for(var k in v){if(v[k]!==alt[k]){d[k]=[alt[k],v[k]];zahl++;}}
  if(zahl)localStorage.setItem(KEY,JSON.stringify({t:new Date().toISOString(),n:FELDER().length,d:d}));
  else localStorage.removeItem(KEY);}catch(e){}}
function entwurfLoeschen(){try{localStorage.removeItem(KEY)}catch(e){}}
function einsetzen(v){var n=FELDER();for(var i=0;i<n.length;i++){var k=n[i].getAttribute(__ATTR__);if(k in v)n[i].value=v[k];}}
function entwurfAnbieten(wann,neu,uebergangen){
  var bar=document.getElementById('entwurf');if(!bar)return;
  var zahl=Object.keys(neu).length;
  if(!zahl&&!uebergangen){entwurfLoeschen();return;}
  bar.textContent='';
  var b=document.createElement('b');b.textContent=zahl?'Ungesicherter Entwurf gefunden':'Ein Entwurf passt nicht mehr zu dieser Seite';bar.appendChild(b);
  var s=document.createElement('span'),satz=' vom '+wann+(zahl?': '+(zahl===1?'1 Feld':zahl+' Felder')+'.':'.');
  if(uebergangen)satz+=' '+(uebergangen===1?'1 Feld wurde inzwischen anders gespeichert und bleibt, wie es ist.'
    :uebergangen+' Felder wurden inzwischen anders gespeichert und bleiben, wie sie sind.');
  s.textContent=satz;bar.appendChild(s);
  if(zahl){var a=document.createElement('button');a.className='btn';a.textContent='Entwurf übernehmen';
    a.onclick=function(){einsetzen(neu);bar.hidden=true;if(window.nachEntwurf)window.nachEntwurf();};bar.appendChild(a);}
  var c=document.createElement('button');c.className='btn ghost';c.textContent=zahl?'verwerfen':'Entwurf verwerfen';
  c.onclick=function(){entwurfLoeschen();bar.hidden=true;};bar.appendChild(c);bar.hidden=false;}
(function(){var roh=null;try{roh=localStorage.getItem(KEY)}catch(e){}
  if(!roh)return;var d=null;try{d=JSON.parse(roh)}catch(e){entwurfLoeschen();return;}
  if(!d||(!d.d&&!d.v))return;
  var wann=d.t?new Date(d.t).toLocaleString('de-CH'):'unbekannter Zeit',jetzt=sammle(),k;
  if(d.d){var neu={},ueb=0;
    for(k in d.d){if(!(k in jetzt)){ueb++;continue;}
      if(jetzt[k]===d.d[k][0])neu[k]=d.d[k][1];else if(jetzt[k]!==d.d[k][1])ueb++;}
    entwurfAnbieten(wann,neu,ueb);return;}
  // Entwurf der früheren Fassung: alle Felder nach Nummer, ohne den Text, von dem sie ausgingen.
  var zahl=(d.n!==undefined)?d.n:Object.keys(d.v).length;
  if(zahl!==FELDER().length){entwurfAnbieten(wann,{},1);return;}
  if(window.entwurfAlt){window.entwurfAlt(d.v,function(neu){entwurfAnbieten(wann,neu,0);});return;}
  var neu2={};for(k in d.v){if(k in jetzt&&d.v[k]!==jetzt[k])neu2[k]=d.v[k];}
  entwurfAnbieten(wann,neu2,0);})();
(function(){var n=FELDER();for(var i=0;i<n.length;i++){n[i].addEventListener('input',entwurfSchreiben);}})();
window.addEventListener('beforeunload',function(e){if(schmutzig()){entwurfSchreiben();e.preventDefault();e.returnValue='';}});
// «Nochmal drücken genügt» stimmt nur, wenn die Konsole nicht erreichbar war. Lehnt sie ab, sagt ihr Grund, was zu tun ist.
function fehlerZeigen(t,nochmal){var f=document.getElementById('fehler');if(!f)return;
  f.innerHTML='<b>Nicht gespeichert:</b> '+t+'<br>Der Text steht weiterhin in den Feldern und liegt als Entwurf im Browser.'
    +(nochmal?' Nochmal auf Speichern drücken genügt.':'');f.hidden=false;}
function fehlerWeg(){var f=document.getElementById('fehler');if(f)f.hidden=true;}
"""


def entwurf_js(key: str, sel: str, attr: str) -> str:
    """Entwurf im Browser halten, anbieten, nach erfolgreicher Speicherung löschen.

    key  Speicherschlüssel, je Seite oder Katalogeintrag einer.
    sel  Behälter der Felder. attr  das Attribut, das ein Feld kennzeichnet.
    Seit 2026-11-16 hält der Entwurf nur die geänderten Felder samt ihrem Ausgangstext; die frühere Fassung
    (alle Felder nach Nummer) wird beim Öffnen noch gelesen und über window.entwurfAlt geprüft."""
    return (ENTWURF_JS.replace("__KEY__", json.dumps("entrosana-admin-draft:" + key))
            .replace("__SEL__", json.dumps(sel + " [" + attr + "]")).replace("__ATTR__", json.dumps(attr)))


def feld_name(tag: str, klassen: list, text: str) -> str:
    """Der Name eines Feldes in Worten statt des HTML-Tags (2026-11-16).

    Wer Text ändert, sucht «die Überschrift» oder «den Knopf», nicht <h1> oder <a>. Die Klassen der Hub-Seiten
    geben die Rolle meist genauer an als das Tag; was hier nicht steht, bekommt den Namen seines Tags."""
    k = " ".join(klassen)

    def hat(*teile):
        return any(t in k for t in teile)
    if tag == "title":
        return "Titel im Browser-Tab"
    if tag == "kbd":
        return "Tastenkürzel"
    if 0 < len(text) <= 2 and tag not in ("h1", "h2", "h3", "p", "li"):
        return "Zeichen"
    if tag == "button" or hat("btn"):
        return "Knopf"
    if hat("eyebrow"):
        return "Dachzeile"
    if tag == "h1":
        return "Hauptüberschrift"
    if tag == "h2":
        return "Überschrift"
    if tag in ("h3", "h4") or "h3" in klassen:
        return "Zwischentitel"
    if hat("rail__item", "rail__plus"):
        return "Menüpunkt"
    if hat("rail__group"):
        return "Menügruppe"
    if hat("rail__"):
        return "Text in der Seitenleiste"
    if hat("brand__word"):
        return "Wortmarke"
    if "vh" in klassen:
        return "Sprungmarke für Screenreader"
    if hat("lede"):
        return "Einleitung"
    if hat("__sub"):
        return "Unterzeile"
    if hat("__cap"):
        return "Bildlegende"
    if hat("__go"):
        return "Verweistext"
    if hat("chip"):
        return "Etikett"
    if hat("fine", "note", "help", "__lic"):
        return "Hinweis"
    return {"p": "Absatz", "a": "Link", "li": "Listenpunkt", "b": "Hervorhebung", "strong": "Hervorhebung",
            "label": "Feldname", "option": "Auswahlpunkt", "span": "Kurztext", "div": "Text", "i": "Zeichen",
            "summary": "Aufklapptitel", "th": "Spaltentitel", "td": "Tabellenzelle", "figcaption": "Bildlegende",
            "small": "Kleingedrucktes"}.get(tag, "Text")


def _gruppen_anzeige(src, gruppen):
    """Die Gruppen von gruppiere() für den Editor: Titel in Worten, in der Reihenfolge der Seite.

    gruppiere() bleibt, wie es ist (admin-modules-ux.py sortiert nach seinen Titeln). Hier wird nur die
    Anzeige gebaut: «ausserhalb der Abschnitte» zerfällt in Kopfleiste, Fusszeile und Übriges, und ein
    Abschnitt heisst nach seiner Überschrift statt nach seinen ersten sechzig Zeichen."""
    tief = src.lower()
    m_a, m_e = tief.find("<main"), tief.rfind("</main>")
    pos = {i: a for i, (a, _b, _t, _o) in enumerate(spans(src))}
    dialoge = [(m.start(), tief.find("</dialog>", m.start())) for m in re.finditer(r"<dialog\b", tief)]

    def im_dialog(p):
        return any(a <= p < (e if e >= 0 else len(src)) for a, e in dialoge)

    def kurz(t, n=52):
        t = glatt(t)
        return t if len(t) <= n else t[:n].rsplit(" ", 1)[0].rstrip(",;:.") + " …"
    out = []
    for g in gruppen:
        art = g.get("art", "section")
        if art == "kopf":
            out.append(dict(g, titel="Titel im Browser-Tab", zu=True, hinweis=""))
        elif art == "aside":
            out.append(dict(g, titel="Seitenleiste", zu=True,
                            hinweis="Die Leiste steht auf jeder Seite mit Arbeitsfläche. Eine Änderung hier gilt nur für diese "
                                    "Seite; soll sie überall gleich lauten, ändere sie auf jeder."))
        elif art == "header":
            out.append(dict(g, titel="Kopfzeile der Seite", zu=True, hinweis=""))
        elif art == "rest":
            oben = [s for s in g["stellen"] if m_a < 0 or pos[s["i"]] < m_a]
            unten = [s for s in g["stellen"] if m_a >= 0 and m_e >= 0 and pos[s["i"]] > m_e]
            mitte = [s for s in g["stellen"] if s not in oben and s not in unten]
            if oben:
                out.append(dict(g, titel="Ganz oben: Sprungmarke und Kopfleiste", zu=True, stellen=oben, js=[], hinweis=""))
            if mitte:
                out.append(dict(g, titel="Weitere Texte der Seite", zu=False, stellen=mitte, hinweis=""))
            fenster = [s for s in unten if im_dialog(pos[s["i"]])]
            fuss = [s for s in unten if s not in fenster]
            if fuss:
                out.append(dict(g, titel="Fusszeile", zu=True, stellen=fuss, js=[], hinweis=""))
            if fenster:
                out.append(dict(g, titel="Fenster «" + kurz(fenster[0]["text"], 36) + "»", zu=True, stellen=fenster, js=[],
                                hinweis="Dieses Fenster öffnet sich erst auf einen Knopf der Seite. Die Vorschau zeigt es nicht."))
        else:
            # Die erste Zeile ist auf diesen Seiten die Dachzeile, also das Wort, unter dem man den Abschnitt
            # sucht. Beginnt er mit einem langen Absatz, trägt eine Überschrift weiter unten besser.
            erste = next((s for s in g["stellen"] if len(s["text"]) > 2), g["stellen"][0] if g["stellen"] else None)
            kopf = next((s for s in g["stellen"] if s["tag"] in ("h1", "h2", "h3")), None)
            waehle = kopf if (kopf and erste and len(erste["text"]) > 52) else erste
            out.append(dict(g, titel=kurz(waehle["text"]) if waehle else "Abschnitt", hinweis=""))
    # Reihenfolge der Seite; die Leiste zuletzt, sie ist überall dieselbe.
    out = [g for g in out if g["stellen"] or g["js"]]
    out.sort(key=lambda g: (g.get("art") == "aside", pos.get(g["stellen"][0]["i"], 0) if g["stellen"] else 0))
    return out


# Ein Entwurf der früheren Fassung nennt alle Felder. Der Server sagt, welche davon wirklich neuer Text sind
# (page_abgleich, «probe»); nur die werden angeboten. Steht vor entwurf_js, das den Haken beim Laden ruft.
ENTWURF_ALT_JS = r"""
window.entwurfAlt=function(v,cb){
  var f=document.querySelectorAll('#fs [data-i]'),t=[];
  for(var i=0;i<f.length;i++){var idx=f[i].getAttribute('data-i');t[+idx]=(('p:'+idx) in v)?v['p:'+idx]:f[i].value;}
  fetch('/api/page',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:NAME,texts:t,probe:true})})
  .then(function(r){return r.json()}).then(function(j){
    var neu={},k;if(j.ok){for(k in j.aenderungen)neu['p:'+k]=j.aenderungen[k];}
    var kf=document.querySelectorAll('#fs [data-key^="c:"]');
    for(var q=0;q<kf.length;q++){k=kf[q].getAttribute('data-key');if((k in v)&&v[k]!==kf[q].value)neu[k]=v[k];}
    cb(neu);}).catch(function(){cb({});});};
"""

EDITOR_JS = r"""
var zwei=document.querySelector('.zwei'),kb=document.getElementById('klapp'),m=document.getElementById('m');
var such=document.getElementById('such'),suchN=document.getElementById('such-n');
var ZU='entrosana-admin-vorschau-zu',BR='entrosana-admin-breite';
var schmal=window.matchMedia('(max-width:1100px)');
function breiteSetzen(){var w=null;try{w=localStorage.getItem(BR)}catch(e){}
  zwei.style.gridTemplateColumns=(w&&!schmal.matches)?w+' 10px minmax(0,1fr)':'';}
function klappStand(){
  if(schmal.matches){zwei.classList.remove('zu');zwei.style.gridTemplateColumns='';
    kb.textContent=zwei.classList.contains('vs')?'Zu den Feldern':'Vorschau zeigen';return;}
  zwei.classList.remove('vs');
  var zu=false;try{zu=localStorage.getItem(ZU)==='1'}catch(e){}
  zwei.classList.toggle('zu',zu);
  if(zu)zwei.style.gridTemplateColumns='';else breiteSetzen();
  kb.textContent=zu?'Vorschau einblenden':'Vorschau ausblenden';if(window.wachseAlle)wachseAlle();}
kb.onclick=function(){
  if(schmal.matches){zwei.classList.toggle('vs');klappStand();window.scrollTo(0,0);return;}
  var zu=!zwei.classList.contains('zu');try{localStorage.setItem(ZU,zu?'1':'0')}catch(e){}klappStand();};
if(schmal.addEventListener)schmal.addEventListener('change',klappStand);
klappStand();
// Teilung ziehen: während des Ziehens keine Textauswahl, sonst markiert der Zeiger die halbe Seite.
var griff=document.getElementById('griff'),zieht=false;
griff.addEventListener('mousedown',function(e){zieht=true;e.preventDefault();document.body.style.userSelect='none';});
window.addEventListener('mousemove',function(e){if(!zieht)return;
  var links=zwei.getBoundingClientRect().left;
  var w=Math.max(280,Math.min(e.clientX-links,zwei.clientWidth-320));
  zwei.style.gridTemplateColumns=w+'px 10px minmax(0,1fr)';
  try{localStorage.setItem(BR,w+'px')}catch(x){}});
window.addEventListener('mouseup',function(){if(zieht)wachseAlle();zieht=false;document.body.style.userSelect='';});
var pv=document.getElementById('pv');
function doc(){try{return pv.contentDocument}catch(e){return null}}
function stelle(i){var d=doc();return d?d.querySelector('.__ed[data-i="'+i+'"]'):null;}
function feldVon(i){return document.querySelector('#fs [data-i="'+i+'"]');}
function zeige(i){
  var d=doc();if(d){var alt=d.querySelectorAll('.__ed.is-sel');
    for(var k=0;k<alt.length;k++)alt[k].classList.remove('is-sel');
    var n=stelle(i);if(n){n.classList.add('is-sel');n.scrollIntoView({block:'center',behavior:'smooth'});}}
  var zeilen=document.querySelectorAll('#fs .f');
  for(var j=0;j<zeilen.length;j++)zeilen[j].classList.remove('is-sel');
  var z=document.getElementById('f'+i);if(z)z.classList.add('is-sel');}
// Ein Feld ist so hoch wie sein Text. Verborgene Felder (zugeklappte Gruppe) haben keine Höhe und kommen beim Aufklappen dran.
function wachse(el){if(el.tagName!=='TEXTAREA'||!el.offsetParent)return;el.style.height='auto';el.style.height=(el.scrollHeight+2)+'px';}
function wachseAlle(){var ta=document.querySelectorAll('#fs textarea');for(var i=0;i<ta.length;i++)wachse(ta[i]);}
document.getElementById('fs').addEventListener('toggle',wachseAlle,true);
window.addEventListener('resize',wachseAlle);
// Suche: nur Felder zeigen, deren Text oder Name den Begriff enthält; leere Gruppen verschwinden.
function filtere(){
  var q=such.value.trim().toLowerCase(),g=document.querySelectorAll('#fs details.grp'),treffer=0;
  for(var i=0;i<g.length;i++){
    var z=g[i].querySelectorAll('.f'),sicht=0;
    for(var k=0;k<z.length;k++){
      var el=z[k].querySelector('[data-key]'),lab=z[k].querySelector('.k');
      var ok=!q||((el?el.value:'')+' '+(lab?lab.textContent:'')).toLowerCase().indexOf(q)>=0;
      z[k].hidden=!ok;if(ok)sicht++;}
    treffer+=sicht;
    if(q){if(!g[i].hasAttribute('data-offen'))g[i].setAttribute('data-offen',g[i].open?'1':'0');
      g[i].hidden=!sicht;if(sicht)g[i].open=true;}
    else{g[i].hidden=false;
      if(g[i].hasAttribute('data-offen')){g[i].open=g[i].getAttribute('data-offen')==='1';g[i].removeAttribute('data-offen');}}}
  suchN.textContent=q?(treffer===0?'Kein Feld enthält das.':treffer===1?'1 Feld':treffer+' Felder'):'';wachseAlle();}
such.addEventListener('input',filtere);
// Klick in der Vorschau: Suche lösen, zu den Feldern wechseln, Gruppe aufklappen, ins Feld springen.
window.__waehle=function(i){var f=feldVon(i);if(!f)return;
  if(such.value){such.value='';filtere();}
  if(zwei.classList.contains('vs')){zwei.classList.remove('vs');klappStand();}
  var g=f.closest('details');if(g)g.open=true;
  wachseAlle();f.scrollIntoView({block:'center'});f.focus();zeige(i);};
// Was vom gespeicherten Stand abweicht, trägt einen Strich; die Spur unten nennt die Zahl.
function markiere(){
  var alt=JSON.parse(GESPEICHERT),f=FELDER(),n=0;
  for(var i=0;i<f.length;i++){var neu=f[i].value!==alt[f[i].getAttribute('data-key')];
    var z=f[i].closest('.f');if(z)z.classList.toggle('is-neu',neu);if(neu)n++;}
  if(window.standUngespeichert)window.standUngespeichert(n);
  return n;}
// Die Vorschau lädt die gespeicherte Datei. Was in den Feldern schon anders steht, wird nachgezogen:
// nach dem Laden der Vorschau und wenn ein Entwurf übernommen wird.
function spiegle(){var alt=JSON.parse(GESPEICHERT),f=document.querySelectorAll('#fs [data-i]');
  for(var i=0;i<f.length;i++){var idx=f[i].getAttribute('data-i');
    if(f[i].value!==alt['p:'+idx]){var n=stelle(idx);if(n)n.textContent=f[i].value;}}}
pv.addEventListener('load',spiegle);
window.nachEntwurf=function(){spiegle();wachseAlle();markiere();};
var alle=document.querySelectorAll('#fs [data-key]');
for(var i=0;i<alle.length;i++){(function(el){
  var idx=el.getAttribute('data-i');
  if(idx!==null)el.addEventListener('focus',function(){zeige(idx)});
  el.addEventListener('input',function(){if(idx!==null){var n=stelle(idx);if(n)n.textContent=el.value;}wachse(el);markiere();});
})(alle[i]);}
function speichern(){
  var sb=document.getElementById('save');if(sb.disabled)return;
  sb.disabled=true;m.textContent='Speichert …';
  // Nur was hier geändert wurde, geht hinaus. Ein Tab, der länger offen ist, schriebe sonst seine alten
  // Texte über das, was inzwischen an anderer Stelle gespeichert wurde.
  var alt=JSON.parse(GESPEICHERT),gesendet=sammle(),aend={},kat={},n=document.querySelectorAll('#fs [data-key]');
  for(var i=0;i<n.length;i++){var k=n[i].getAttribute('data-key');
    if(n[i].value===alt[k])continue;
    if(k.indexOf('p:')===0)aend[k.slice(2)]=n[i].value;
    else{var teil=k.split(':');(kat[teil[1]]=kat[teil[1]]||{})[teil[2]]=n[i].value;}}
  var auftraege=[fetch('/api/page',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:NAME,n:document.querySelectorAll('#fs [data-i]').length,aenderungen:aend})}).then(function(r){return r.json()})];
  for(var slug in kat){(function(sl){auftraege.push(
    fetch('/api/catalogue',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({slug:sl,values:kat[sl]})}).then(function(r){return r.json()}));})(slug);}
  Promise.all(auftraege).then(function(js){
    sb.disabled=false;
    var schlecht=js.filter(function(j){return !j.ok});
    if(schlecht.length){m.textContent='Nicht gespeichert.';
      fehlerZeigen(schlecht.map(function(j){return j.error}).join(' · '));entwurfSchreiben();return;}
    // Die Antwort trägt den Stand der Datei. Felder, die seit dem Abschicken nicht weiter getippt wurden,
    // zeigen ihn: auch das, was inzwischen an anderer Stelle geändert wurde.
    var t=js[0].texte,geholt=0;
    if(t){var f=document.querySelectorAll('#fs [data-i]');
      for(var q=0;q<f.length;q++){var idx=f[q].getAttribute('data-i');
        if(t[+idx]!==undefined&&f[q].value===gesendet['p:'+idx]&&f[q].value!==t[+idx]){
          if(!(idx in aend))geholt++;
          f[q].value=t[+idx];}}}
    GESPEICHERT=JSON.stringify(sammle());entwurfLoeschen();fehlerWeg();
    // Hat die Seite jetzt eine andere Zahl von Feldern als dieser Editor, lädt er sich neu statt später abgelehnt zu werden.
    if(js[0].stellen!==undefined&&js[0].stellen!==document.querySelectorAll('#fs [data-i]').length){location.reload();return;}
    var w=js.filter(function(j){return j.backup&&j.backup.indexOf('keine')<0});
    m.textContent=(w.length?'':'Nichts geändert.')+(geholt?(w.length?'':' ')+(geholt===1?'1 Feld wurde':geholt+' Felder wurden')+' inzwischen an anderer Stelle geändert und '+(geholt===1?'zeigt':'zeigen')+' jetzt den neuen Text.':'');
    markiere();wachseAlle();pv.src=pv.src;if(window.standNeu)window.standNeu();})
  .catch(function(e){sb.disabled=false;m.textContent='Nicht gespeichert.';fehlerZeigen('Die Konsole ist gerade nicht erreichbar ('+e+').',true);entwurfSchreiben();});}
document.getElementById('save').onclick=speichern;
document.addEventListener('keydown',function(e){
  if((e.ctrlKey||e.metaKey)&&(e.key==='s'||e.key==='S')){e.preventDefault();speichern();}});
markiere();wachseAlle();
"""


def page_editor(name, msg="", err=""):
    label = next((l for n, l, _ in PAGES if n == name), name)
    pfad = next((p for n, _, p in PAGES if n == name), "/")
    src, stellen = page_read(name)
    _, katalog = cat_entries()

    def feld(st):
        text = st["text"]
        zeichen = 0 < len(text) <= 2
        m = TAG_RE.match(src, st["open_start"]) if st["open_start"] >= 0 else None
        offen = m.group(0) if m else f"<{st['tag']}>"
        bez = feld_name(st["tag"], _class_list(offen) if m else [], text)
        eingabe = (f"<input type=text data-i='{st['i']}' data-key='p:{st['i']}' aria-label=\"{html.escape(bez, quote=True)}\" "
                   f"value=\"{html.escape(text, quote=True)}\">"
                   if zeichen else
                   f"<textarea data-i='{st['i']}' data-key='p:{st['i']}' aria-label=\"{html.escape(bez, quote=True)}\" rows='1'"
                   + ("" if text else " placeholder='Leer. Mit Text erscheint die Zeile wieder auf der Seite.'") + ">"
                   f"{html.escape(text)}</textarea>")
        return (f"<div class='f{' zeichen' if zeichen else ''}' id='f{st['i']}'>"
                f"<div class='k' title=\"{html.escape(offen, quote=True)}\">{html.escape(bez)}"
                + ("" if text else " <span class='leer'>leer, steht nicht auf der Seite</span>")
                + f"</div><div>{eingabe}</div></div>")

    schon_da = set()
    hat_katalog = False

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
        out = ("<div class='js-hinweis'>Diese Karten kommen aus dem Katalog und erscheinen beim Laden der Seite. "
               "Du kannst sie hier ändern; gespeichert wird mit demselben Knopf.</div>")
        namen = {"title": "Titel", "who": "Kurzkennung", "lede": "Kernsatz",
                 "about": "Beschreibung", "note": "Zusatz", "meta": "Fussnote"}
        for e in sorted(passend, key=lambda x: x["slug"]):
            kopf = e["felder"].get("title", (0, 0, e["slug"]))[2]
            out += f"<div class='kat'><div class='kat__t'>Karte «{html.escape(kopf)}»</div>"
            for k in FIELDS:
                if k not in e["felder"] or k not in namen:
                    continue
                wert = e["felder"][k][2]
                schl = f"c:{e['slug']}:{k}"
                eing = f"<textarea data-key='{schl}' aria-label='{namen[k]}' rows='1'>{html.escape(wert)}</textarea>"
                out += (f"<div class='f'><div class='k'>{namen[k]}</div><div>{eing}</div></div>")
            out += "</div>"
        return out

    bloecke = ""
    for g in _gruppen_anzeige(src, gruppiere(src, stellen)):
        inhalt = (f"<div class='js-hinweis'>{g['hinweis']}</div>" if g.get("hinweis") else "")
        inhalt += "".join(feld(st) for st in g["stellen"])
        for abt, gleis in g["js"]:
            karten = katalogfelder(abt, gleis)
            hat_katalog = hat_katalog or bool(karten)
            inhalt += karten
        anzahl = len(g["stellen"])
        bloecke += (f"<details class='grp'{'' if g['zu'] else ' open'}>"
                    f"<summary><b>{html.escape(g['titel'])}</b>"
                    f"<span class='n'>{'1 Feld' if anzahl == 1 else str(anzahl) + ' Felder'}</span></summary>"
                    f"<div>{inhalt}</div></details>")

    dateien = [name] + (["assets/catalogue.js"] if hat_katalog else [])
    return page(f"{label} · entrosana.app",
        f"<div class='ed-kopf'><h1>{html.escape(label)}</h1>"
        "<p>Ein Klick auf einen Text in der Vorschau springt zu seinem Feld. Was du tippst, zeigt die Vorschau sofort.</p></div>"
        + (f"<p class='ok'>{html.escape(msg)}</p>" if msg else "")
        + (f"<p class='err'>{html.escape(err)}</p>" if err else "")
        + "<div id='entwurf' class='entwurf' hidden></div>"
        + "<div id='fehler' class='fehler' hidden></div>"
        + "<div class='zwei'>"
        + "<div class='felder' id='fs'>"
          "<div class='such'><input type='text' id='such' placeholder='Text suchen, zum Beispiel ein Wort von der Seite' "
          "aria-label='In den Feldern suchen' autocomplete='off'><span id='such-n' role='status'></span></div>"
        + bloecke + "</div>"
        + "<div class='griff' id='griff' title='Teilung verschieben'></div>"
        + f"<div class='vorschau'><iframe id='pv' src='/preview/{name}' title='Vorschau der Seite'></iframe></div>"
        + "</div>"
        "<div class='bar'><button class='btn' id='save' title='Strg+S'>Speichern</button>"
        "<span id='m' class='bar__m' role='status'></span>"
        + stand_block(dateien)
        + "<div class='bar__r'><button class='btn ghost' id='klapp'>Vorschau ausblenden</button>"
        f"<a class='btn ghost' href='{LIVE}{pfad}' target='_blank' rel='noopener'><span class='lang'>Live-Seite ansehen</span>"
        "<span class='knapp'>Ansehen</span></a></div></div>"
        "<script>var NAME=" + json.dumps(name) + ";"
        + ENTWURF_ALT_JS + entwurf_js(name, "#fs", "data-key")
        + EDITOR_JS + "</script>", klasse="ed")


def cat_editor(slug, msg="", err=""):
    _, eintraege = cat_entries()
    e = next((x for x in eintraege if x["slug"] == slug), None)
    if not e:
        return page("nicht gefunden", f"<h1>{html.escape(slug)}</h1>"
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
            felder += (f"<label>Stand<br><select data-k='state' class='stand'>{opts}</select>"
                       "<br><span class='note'>Erscheint als Punkt mit Wort auf der Karte: «only an idea», «still in development», «finished».</span></label>")
            continue
        if k == "area":
            opts = "".join(f"<option value='{v}'{' selected' if v == wert else ''}>{html.escape(l)}</option>" for v, l in AREAS_UI)
            felder += (f"<label>Gebiet<br><select data-k='area' class='stand'>{opts}</select>"
                       "<br><span class='note'>Bestimmt den Abschnitt auf der Modulseite: Nature, Social, Technical.</span></label>")
            continue
        kurz = k in ("title", "meta", "updated")
        felder += (f"<label>{beschriftung[k]}<br>"
                   + (f"<input type=text data-k='{k}' value=\"{html.escape(wert, quote=True)}\">"
                      if kurz else f"<textarea data-k='{k}'>{html.escape(wert)}</textarea>")
                   + "</label>")
    titel = e["felder"].get("title", (0, 0, slug))[2]
    return page(f"{titel} · Katalog",
        f"<h1>{html.escape(titel)}</h1>"
        "<p class='note'>Eine Karte aus dem Katalog. Ihr Text erscheint auf der Übersicht und auf der Detailseite des Eintrags.</p>"
        + (f"<p class='ok'>{html.escape(msg)}</p>" if msg else "")
        + (f"<p class='err'>{html.escape(err)}</p>" if err else "")
        + "<div id='entwurf' class='entwurf' hidden></div>"
        + "<div id='fehler' class='fehler' hidden></div>"
        + f"<div id='fs' style='max-width:70ch'>{felder}</div>"
        "<div class='bar'><button class='btn' id='save'>Speichern</button><span id='m' class='bar__m' role='status'></span>"
        + stand_block(["assets/catalogue.js"]) +
        "<div class='bar__r'><a class='btn ghost' href='/#katalog'>Zurück zum Katalog</a></div></div>"
        "<script>"
        + entwurf_js("cat:" + slug, "#fs", "data-k") +
        "document.getElementById('save').onclick=function(){"
        # Nur was hier geändert wurde, geht hinaus; ein länger offener Tab schriebe sonst alte Werte über neuere.
        "var n=document.querySelectorAll('#fs [data-k]'),v={},alt=JSON.parse(GESPEICHERT);"
        "for(var i=0;i<n.length;i++){var k=n[i].getAttribute('data-k');if(n[i].value!==alt[k])v[k]=n[i].value;}"
        "var m=document.getElementById('m');m.textContent='speichere…';"
        "fetch('/api/catalogue',{method:'POST',headers:{'Content-Type':'application/json'},"
        "body:JSON.stringify({slug:" + json.dumps(slug) + ",values:v})})"
        ".then(function(r){return r.json()}).then(function(j){"
        "if(j.ok){GESPEICHERT=JSON.stringify(sammle());entwurfLoeschen();fehlerWeg();"
        "m.textContent=String(j.backup).indexOf('keine')<0?'Gespeichert.':'Nichts geändert.';if(window.standNeu)window.standNeu();}"
        "else{m.textContent='nicht gespeichert';fehlerZeigen(j.error);entwurfSchreiben();}})"
        ".catch(function(e){m.textContent='nicht gespeichert';fehlerZeigen('Die Konsole ist gerade nicht erreichbar ('+e+').',true);entwurfSchreiben();});};</script>")


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
        "<h1>Gestaltung</h1>"
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
        + "<div class='bar'><button class='btn' id='save'>Speichern</button><span id='m' class='bar__m' role='status'></span>"
        + stand_block(["assets/app.css"], LIVE + "/start") +
        "</div>"
        "<script>document.getElementById('save').onclick=function(){"
        "var n=document.querySelectorAll('[data-k]'),v={};"
        "for(var i=0;i<n.length;i++){var k=n[i].getAttribute('data-k');"
        "v[k]=n[i].type==='number'?parseFloat(n[i].value):n[i].value;}"
        "var m=document.getElementById('m');m.textContent='speichere…';"
        "fetch('/api/design',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)})"
        ".then(function(r){return r.json()}).then(function(j){"
        "m.textContent=j.ok?'Gespeichert.':('Nicht gespeichert: '+j.error);if(j.ok&&window.standNeu)window.standNeu();})"
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
    kopf = _hub_kopf("Beiträge")
    if code != 200:
        return page("Beiträge", kopf + f"<p class='err'>{html.escape(str(j.get('error', code)))}</p>")
    filt = ("<b>alle</b>" if not status_filter else "<a href='/contributions'>alle</a>") + " · " + " · ".join(
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
    kopf = f"<p class='unterweg'><a href='/contributions'>Zurück zu den Beiträgen</a></p><h1>Beitrag #{cid}</h1>"
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
    kopf = (_hub_kopf("Bewerbungen") +
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
    return (f"<h1>{titel}</h1>"
            "<p class='unterweg'><a href='/contributions'>Beiträge</a> <a href='/applications'>Bewerbungen</a> "
            "<a href='/requests'>Anfragen</a> <a href='/invites'>Einladungen</a> <a href='/accounts'>Konten</a> "
            "<a href='/modules'>Module</a> <a href='/services'>Dienste</a> <a href='/checklists'>Checklisten</a></p>")


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
    return page("Checklisten", _hub_kopf("Checklisten") + "<p class='note'>Die Checklisten der Projektverwaltung (assets/seeds.js). Jede Änderung wird gesichert und geht mit dem Abgleich live; die Seiten laden die neue Fassung mit frischer Version. "
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
            + "<div class='bar'><button class='btn' type='submit'>Speichern</button><span id='msg' class='bar__m' role='status'></span>"
            + stand_block(["assets/seeds.js"])
            + "<div class='bar__r'><a class='btn ghost' href='/checklists'>Zurück zur Liste</a></div></div></form>"
            "<script>document.getElementById('ck').addEventListener('submit',function(e){e.preventDefault();var f=e.target,m=document.getElementById('msg');var steps=[];"
            f"for(var i=0;i<{len(steps)};i++){{var t=f['t'+i].value.trim();if(!t)continue;steps.push({{t:t,n:f['n'+i].value.trim(),i:f['i'+i].value.trim()}});}}"
            "var prompts=f.prompts.value.split('\\n').map(function(x){return x.trim()}).filter(Boolean);m.textContent='…';"
            "fetch('/api/checklists/'+f.getAttribute('data-key'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:f.title.value.trim(),who:f.who.value.trim(),prompts:prompts,steps:steps})})"
            ".then(function(x){return x.json()}).then(function(j){if(j.ok&&j.unchanged){m.textContent='nichts geändert';m.className='mono';}else if(j.ok){m.textContent='Gespeichert.';m.className='bar__m';if(window.standNeu)window.standNeu();}else{m.textContent=j.error||'Fehler';m.className='err';}})"
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
            f"Neue Seite: Eintrag in pages.json und Datei anlegen, beides über den Abgleich oder direkt im Baum.</p><table>{rows}</table>" + js)


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
    body = (f"<p class='unterweg'><a href='/docs'>Zurück zur Docs-Liste</a></p><h1>Docs {'in Entwicklung' if where == 'dev' else 'live'} · {html.escape(label)}</h1>"
            f"<p class='note'>Markdown, wie in <span class='mono'>{'docs-dev' if where == 'dev' else 'docs-site'}/{html.escape(key)}.md</span>. Erste Überschrift (#) ist der Titel, der erste Absatz die Unterzeile; "
            "## gliedert und erscheint in «On this page». Erlaubt: Listen (eine Unterebene), ``` Zäune, | Tabellen |, > Zitate, > **Note:** / **Tip:** / **Warning:** / **Owner:** als Kasten, **fett**, *kursiv*, `Code`, [Verweise](/pfad). "
            f"Live unter <a href='{url}' target='_blank' rel='noopener'>{html.escape(url)}</a>.</p>"
            f"<textarea id='md' spellcheck='false' style='width:100%;min-height:62vh;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9rem;line-height:1.45;box-sizing:border-box'>{html.escape(text)}</textarea>"
            "<div class='bar'><button class='btn' id='save'>Speichern</button><span class='bar__m' id='out' role='status'></span>"
            + stand_block([("docs-dev" if where == "dev" else "docs-site") + "/" + key + ".md"], url) + "</div>"
            "<script>document.getElementById('save').addEventListener('click',async function(){var o=document.getElementById('out');o.textContent='…';"
            "try{var r=await fetch('/api/docs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:" + json.dumps(key) + ",where:" + json.dumps(where) + ",text:document.getElementById('md').value})});"
            "var j=await r.json();o.textContent=j.ok?(String(j.backup).indexOf('keine')<0?'Gespeichert.':'Nichts geändert.'):('Nicht gespeichert: '+j.error);if(j.ok&&window.standNeu)window.standNeu();}catch(e){o.textContent='Fehler: '+e;}});</script>")
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
    # Die Zeile von list-timers trennt nicht mehr mit zwei Leerzeichen; gefragt wird der eine Wert.
    roh = subprocess.run(["systemctl", "--user", "show", "entrosana-hub-sync.timer", "-p", "NextElapseUSecRealtime", "--value"],
                         capture_output=True, text=True).stdout
    wann = re.search(r"(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)", roh)
    naechster = "unbekannt"
    if wann:
        import datetime as _d
        d = _d.datetime(*map(int, wann.groups()))
        tage = (d.date() - _d.date.today()).days
        naechster = ("heute " if tage == 0 else "morgen " if tage == 1 else d.strftime("%d.%m. ")) + d.strftime("%H:%M")
    worte = {"commit": "eingecheckt", "pull": "geholt", "push": "hochgeladen", "restart": "Neustart", "done": "fertig",
             "beat": "Lebenszeichen", "branch": "Zweig"}
    rows = "".join(f"<tr><td class='mono'>{html.escape(_lokal(r.get('t', '')))}</td><td>{html.escape(worte.get(str(r.get('step', '')), str(r.get('step', ''))))}</td>"
                   f"<td class='{'ok' if r.get('ok') else 'err'}'>{'ok' if r.get('ok') else 'Fehler'}</td><td>{html.escape(str(r.get('text', '')))}</td></tr>" for r in sync_rows())
    body = ("<h1>Abgleich</h1>"
            "<p class='note'>Der Abgleich bringt, was du in dieser Konsole speicherst, auf entrosana.app: er checkt die Texte ein "
            "(Seiten, Katalog, Checklisten, Docs), holt das Neueste von GitHub und lädt die eigenen Commits hoch. "
            "entrosana.app läuft auf Metanet und zieht den Stand von GitHub alle zwei Minuten. "
            "Der Abgleich läuft von selbst alle fünf bis zehn Minuten; der Knopf startet ihn sofort.</p>"
            + stand_block(None, block=True, knopf=False)
            + "<p><button class='btn' id='run'>Jetzt abgleichen</button> <span class='bar__m' id='out' role='status'></span></p>"
            "<script>document.getElementById('run').addEventListener('click',async function(){var o=document.getElementById('out');o.textContent='Läuft …';"
            "try{var r=await fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});var j=await r.json();"
            "o.textContent=j.ok?'Gestartet. Die Seite lädt gleich neu.':('Nicht gestartet: '+j.error);if(j.ok)setTimeout(function(){location.reload();},6000);}catch(e){o.textContent='Nicht gestartet: '+e;}});</script>"
            + f"<p class='note'>Nächster Lauf von selbst: {naechster}.</p>"
            "<p class='note'>Kam mit dem Abgleich neuer Code, starten auf diesem Rechner die betroffenen Dienste neu "
            "(die Konsole nur, wenn niemand verbunden ist). Was andere Sitzungen ungespeichert im Baum haben, bleibt liegen.</p>"
            + (f"<table><tr><th>wann</th><th>Schritt</th><th></th><th>Text</th></tr>{rows}</table>" if rows else "<p class='mono'>Noch kein Lauf.</p>"))
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
                    "<h1>Zugang</h1>"
                    "<form action='/login'><input name='key' type='password' placeholder='Zugangsschlüssel' "
                    "style='width:20rem'> <button class='btn'>Weiter</button></form>"))
            return
        if not self._authed():
            self._send(302, "", extra={"Location": "/login"})
            return
        if u.path == "/api/stand":
            q = parse_qs(u.query)
            try:
                self._json({"ok": True, **(stand_alle() if q.get("alles") else stand(q.get("datei", [])))})
            except Exception as e:
                self._json({"ok": False, "error": str(e)}, 400)
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
            self._send(200, page("Docs", "<h1>Docs</h1>" + docs_rows()))
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
                ziel, nummern = page_abgleich(name, data.get("texts"), data.get("aenderungen"), data.get("n"))
                if data.get("probe"):       # nur fragen, was ein alter Entwurf wirklich ändern würde
                    self._json({"ok": True, "aenderungen": {str(i): ziel[i] for i in nummern}})
                else:
                    b = page_write(name, ziel)
                    _, st = page_read(name)
                    self._json({"ok": True, "backup": b or "keine Änderung", "stellen": len(st),
                                "texte": [x["text"] for x in st]})
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
