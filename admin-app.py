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
import hashlib, hmac, html, ipaddress, json, os, re, secrets, shutil, subprocess, time
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
]

if not TOKEN_FILE.exists():
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(secrets.token_urlsafe(24) + "\n")
    TOKEN_FILE.chmod(0o600)
TOKEN = TOKEN_FILE.read_text().strip()


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
    """[(start, end, umgebendes Tag)] für jede Textstelle mit Inhalt."""
    out, pos, skip, stack = [], 0, 0, []
    for m in TAG_RE.finditer(src):
        if skip == 0 and src[pos:m.start()].strip():
            out.append((pos, m.start(), stack[-1] if stack else "?"))
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
                if stack and stack[-1] == name:
                    stack.pop()
            elif not selfclose:
                stack.append(name)
    if skip == 0 and src[pos:].strip():
        out.append((pos, len(src), stack[-1] if stack else "?"))
    return out


def glatt(t: str) -> str:
    """Zeilenumbrüche und Einrückung der Datei zu einfachen Leerzeichen.

    Im Feld soll ein Satz als Satz stehen, nicht als Quelltext mit
    Einzügen. Beim Zurückschreiben bleibt eine unberührte Stelle trotzdem
    buchstabengleich: page_write vergleicht geglättet und lässt sie dann
    in Ruhe."""
    return re.sub(r"\s+", " ", t).strip()


def page_read(name):
    src = (APP / name).read_text(encoding="utf-8")
    return src, [{"i": i, "tag": t, "text": glatt(src[a:b])}
                 for i, (a, b, t) in enumerate(spans(src))]


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
    for i, (a, b, _t) in enumerate(sp):
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
    for i, (a, b, _t) in reversed(list(enumerate(spans(src)))):
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


def page_write(name, neu: list):
    """neu = Liste der Texte in derselben Reihenfolge wie page_read."""
    f = APP / name
    src = f.read_text(encoding="utf-8")
    sp = spans(src)
    if len(neu) != len(sp):
        raise ValueError(f"{len(neu)} Texte für {len(sp)} Stellen — abgelehnt")
    out = src
    geaendert = []
    for i in range(len(sp) - 1, -1, -1):          # von hinten, sonst wandern die Positionen
        a, b, tag = sp[i]
        t = neu[i]
        if "<" in t or ">" in t:
            raise ValueError(f"Stelle {i + 1}: < und > sind nicht erlaubt, hier steht nur Text")
        alt = src[a:b]
        if glatt(alt) == t.strip():
            continue                               # unberührt: Datei bleibt wie sie ist
        geaendert.append((f"Stelle {i + 1} · <{tag}>", glatt(alt), t.strip()))
        vor = alt[:len(alt) - len(alt.lstrip())]   # Einrückung erhalten
        nach = alt[len(alt.rstrip()):]
        out = out[:a] + vor + t.strip() + nach + out[b:]
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
FIELDS = ("title", "who", "lede", "about", "note", "meta")
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
.bar{position:sticky;bottom:0;background:#1B1E24;border-top:1px solid #323843;padding:1rem 0;margin-top:1.5rem}"""


def page(title, body):
    return (f"<!DOCTYPE html><html lang=de><head><meta charset=utf-8>"
            f"<meta name=viewport content='width=device-width,initial-scale=1'>"
            f"<title>{html.escape(title)}</title><style>{CSS}</style></head>"
            f"<body><div class='wrap'>{body}</div></body></html>")


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
        "Attribute bleiben unberührt; wer spitze Klammern eintippt, bekommt eine Ablehnung.</p>"
        f"<table>{zeilen}</table>"
        "<h2>Katalog</h2>"
        "<p class='note'>Die Karten für Tools und Modules aus <span class='mono'>assets/catalogue.js</span>. "
        "Diese Texte erscheinen auf der Übersicht und auf der Detailseite des Eintrags.</p>"
        f"<table>{krows}</table>"
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
        passend = [e for e in katalog
                   if e["felder"] and (not gleis or e.get("gleis") in (None, gleis))]
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
                    "about": "Beschreibung", "note": "Zusatz", "meta": "Fussnote"}
    felder = ""
    for k in FIELDS:
        if k not in e["felder"]:
            continue
        wert = e["felder"][k][2]
        kurz = k in ("title", "meta")
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


class H(BaseHTTPRequestHandler):
    server_version = "entrosana-app-admin"

    def log_message(self, *a):
        pass

    def _src_ok(self):
        ip = self.client_address[0]
        if ip in ("127.0.0.1", "::1"):
            return True
        try:
            return ipaddress.ip_address(ip) in ipaddress.ip_network("100.64.0.0/10")
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
            if u.path == "/api/page":
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
            else:
                self._json({"ok": False, "error": "unbekannter Pfad"}, 404)
        except Exception as e:
            self._json({"ok": False, "error": str(e)}, 400)


if __name__ == "__main__":
    srv = ThreadingHTTPServer((HOST, PORT), H)
    print(f"entrosana.app admin auf http://{HOST}:{PORT}/ — Schlüssel in {TOKEN_FILE}")
    srv.serve_forever()
