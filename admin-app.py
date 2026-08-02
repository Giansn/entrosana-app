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


def page_read(name):
    src = (APP / name).read_text(encoding="utf-8")
    return src, [{"i": i, "tag": t, "text": src[a:b].strip()}
                 for i, (a, b, t) in enumerate(spans(src))]


def page_write(name, neu: list):
    """neu = Liste der Texte in derselben Reihenfolge wie page_read."""
    f = APP / name
    src = f.read_text(encoding="utf-8")
    sp = spans(src)
    if len(neu) != len(sp):
        raise ValueError(f"{len(neu)} Texte für {len(sp)} Stellen — abgelehnt")
    out = src
    for i in range(len(sp) - 1, -1, -1):          # von hinten, sonst wandern die Positionen
        a, b, _ = sp[i]
        t = neu[i]
        if "<" in t or ">" in t:
            raise ValueError(f"Stelle {i + 1}: < und > sind nicht erlaubt, hier steht nur Text")
        alt = src[a:b]
        vor = alt[:len(alt) - len(alt.lstrip())]   # Einrückung erhalten
        nach = alt[len(alt.rstrip()):]
        out = out[:a] + vor + t.strip() + nach + out[b:]
    if out == src:
        return None
    b_name = backup(f)
    f.write_text(out, encoding="utf-8")
    return b_name


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
    for m in STR_RE.finditer(src):
        gehoert = None
        for pos, slug in slugs:
            if pos < m.start():
                gehoert = slug
            else:
                break
        if gehoert is None:
            continue
        e = eintraege.setdefault(gehoert, {"slug": gehoert, "felder": {}})
        e["felder"][m.group(1)] = (m.start(2), m.end(2), json.loads('"' + m.group(2) + '"'))
    return src, list(eintraege.values())


def cat_write(slug, werte: dict):
    src, eintraege = cat_entries()
    e = next((x for x in eintraege if x["slug"] == slug), None)
    if not e:
        raise ValueError(f"Eintrag {slug} nicht gefunden")
    orte = sorted(((v[0], v[1], k) for k, v in e["felder"].items()), reverse=True)
    out = src
    for a, b, key in orte:
        if key not in werte:
            continue
        neu = json.dumps(werte[key], ensure_ascii=False)[1:-1]
        out = out[:a] + neu + out[b:]
    if out == src:
        return None
    b_name = backup(CATALOGUE)
    CATALOGUE.write_text(out, encoding="utf-8")
    return b_name


# ── Design ────────────────────────────────────────────────────────────────
DESIGN_START = "/* === ENTROSANA-DESIGN-OVERRIDES (managed by admin /design; do not hand-edit) === */"
DESIGN_END = "/* === END ENTROSANA-DESIGN-OVERRIDES === */"
# Die Vorgaben sind die Werte, die heute in app.css stehen — nicht die von
# entrosana.com. Sonst würde ein Speichern mit unveränderten Feldern die
# Arbeitsfläche wieder abdunkeln (--paper steht dort bewusst heller).
DESIGN_DEFAULTS = {
    "seal": "#2BD4E8", "paper": "#21252C", "ink": "#E9EBE7",
    "light_seal": "#077183", "light_paper": "#F5FFFE", "light_ink": "#16181D",
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
    b = backup(APP_CSS)
    APP_CSS.write_text(css, encoding="utf-8")
    return b


# ── Oberfläche ────────────────────────────────────────────────────────────
CSS = """body{margin:0;background:#1B1E24;color:#E9EBE7;font-family:Calibri,Carlito,'Segoe UI',sans-serif;padding:2rem}
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
.f{display:grid;grid-template-columns:5.5rem 1fr;gap:.8rem;align-items:start;margin:.7rem 0;padding-bottom:.7rem;border-bottom:1px solid #262b33}
.f .k{color:#8F95A1;font-family:'Geist Mono',ui-monospace,monospace;font-size:.74rem;padding-top:.55em}
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


def page_editor(name, msg="", err=""):
    label = next((l for n, l, _ in PAGES if n == name), name)
    _, stellen = page_read(name)
    felder = ""
    for s in stellen:
        kurz = len(s["text"]) <= 24
        felder += (f"<div class='f'><div class='k'>{html.escape(s['tag'])}</div>"
                   f"<div>{'<input type=text' if kurz else '<textarea'} data-i='{s['i']}' "
                   + (f"value=\"{html.escape(s['text'], quote=True)}\">"
                      if kurz else f">{html.escape(s['text'])}</textarea>")
                   + "</div></div>")
    return page(f"{label} · entrosana.app",
        f"<p><a href='/'>&larr; Übersicht</a></p><h1>{html.escape(label)}</h1>"
        f"<p class='mono'>{name} &middot; {len(stellen)} Textstellen, in der Reihenfolge der Seite</p>"
        + (f"<p class='ok'>{html.escape(msg)}</p>" if msg else "")
        + (f"<p class='err'>{html.escape(err)}</p>" if err else "")
        + f"<div id='fs'>{felder}</div>"
        "<div class='bar'><button class='btn' id='save'>Speichern</button> "
        "<a class='btn ghost' href='/'>Zurück</a> <span id='m' class='mono' style='margin-left:1rem'></span></div>"
        "<script>document.getElementById('save').onclick=function(){"
        "var n=document.querySelectorAll('#fs [data-i]'),t=[];"
        "for(var i=0;i<n.length;i++)t.push(n[i].value);"
        "var m=document.getElementById('m');m.textContent='speichere…';"
        "fetch('/api/page',{method:'POST',headers:{'Content-Type':'application/json'},"
        "body:JSON.stringify({name:" + json.dumps(name) + ",texts:t})})"
        ".then(function(r){return r.json()}).then(function(j){"
        "m.textContent=j.ok?('gespeichert ✓ Sicherung '+j.backup+' · in ≤5 s live'):('Fehler: '+j.error);})"
        ".catch(function(e){m.textContent='Fehler: '+e});};</script>")


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
        + f"<div id='fs' style='max-width:70ch'>{felder}</div>"
        "<div class='bar'><button class='btn' id='save'>Speichern</button> "
        "<a class='btn ghost' href='/'>Zurück</a> <span id='m' class='mono' style='margin-left:1rem'></span></div>"
        "<script>document.getElementById('save').onclick=function(){"
        "var n=document.querySelectorAll('#fs [data-k]'),v={};"
        "for(var i=0;i<n.length;i++)v[n[i].getAttribute('data-k')]=n[i].value;"
        "var m=document.getElementById('m');m.textContent='speichere…';"
        "fetch('/api/catalogue',{method:'POST',headers:{'Content-Type':'application/json'},"
        "body:JSON.stringify({slug:" + json.dumps(slug) + ",values:v})})"
        ".then(function(r){return r.json()}).then(function(j){"
        "m.textContent=j.ok?('gespeichert ✓ Sicherung '+j.backup+' · in ≤5 s live'):('Fehler: '+j.error);})"
        ".catch(function(e){m.textContent='Fehler: '+e});};</script>")


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
