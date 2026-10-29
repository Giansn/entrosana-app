#!/usr/bin/env python3
"""UX-friendly full-page editor for entrosana.app — parallel to admin-app.py (:8396).

  http://100.115.236.97:8397/

Same mechanics: cookie eaa, page_write, cat_write, backups, preview spans.
UX: every text span is editable; Header and Sidebar are separate first-class
sections (not buried). Multi-page dashboard + per-page split editor.

Does not replace admin-app.py.
"""
from __future__ import annotations

import html
import hmac
import importlib.util
import ipaddress
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

_ROOT = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("entrosana_admin_app", _ROOT / "admin-app.py")
aa = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(aa)

HOST = os.environ.get("HOST", "100.115.236.97")
PORT = int(os.environ.get("PORT", "8397"))
LIVE = "https://entrosana.app"
PAGES = list(aa.PAGES)  # (file, label, path)

CAT_LABELS = {
    "title": ("Title", "Card heading"),
    "who": ("Who it's for", "One-line audience line"),
    "lede": ("Lead sentence", "Short pitch under the title"),
    "about": ("About", "Longer description on the detail view"),
    "note": ("Note", "Extra closing note"),
    "meta": ("Footnote / status", "Small meta line"),
}

# Map gruppiere titles → UX buckets
BUCKET_HEADER = "header"
BUCKET_SIDEBAR = "sidebar"
BUCKET_META = "meta"
BUCKET_OVERLAY = "overlay"
BUCKET_CONTENT = "content"


def _esc(s: str) -> str:
    return html.escape(s, quote=True)


def _bucket_for_group(title: str) -> str:
    if "Leiste" in title or title.startswith("Leiste"):
        return BUCKET_SIDEBAR
    if "Kopfzeile" in title:
        return BUCKET_HEADER
    if "Kopfbereich" in title or "Titel und Beschreibung" in title:
        return BUCKET_META
    if "ausserhalb" in title or "Seitentext" in title:
        return BUCKET_OVERLAY
    return BUCKET_CONTENT


def _friendly_title(bucket: str, raw: str) -> str:
    if bucket == BUCKET_HEADER:
        return "Header"
    if bucket == BUCKET_SIDEBAR:
        return "Sidebar"
    if bucket == BUCKET_META:
        return "Browser tab"
    if bucket == BUCKET_OVERLAY:
        return "Dialogs & overlays"
    # content: use page eyebrow/section name as-is when short
    return raw


def _field_label(st: dict) -> tuple[str, str | None]:
    """Human label + optional help for a text span."""
    tag, text, i = st["tag"], st["text"], st["i"]
    t = text.strip()
    # Workspace oversight: two states — empty vs resume (when projects are open)
    if t == "Welcome":
        return ("Empty state — title", "Shown when no active project is open.")
    if t.startswith("Nothing open yet"):
        return ("Empty state — subtitle", "Shown when no active project is open.")
    if t == "Pick up where you stopped." or t.startswith("Pick up where"):
        return ("Resume — title", "Shown when you have active (not archived) projects.")
    if t == "One project open.":
        return ("Resume — one project", "Subtitle when exactly one active project is open.")
    if "{n}" in t and "project" in t.lower():
        return ("Resume — many projects", "Subtitle when 2+ active projects are open. {n} becomes the count.")
    # Single-glyph / icon-ish
    if len(t) <= 2 and not t.isalpha():
        return (f"Icon / mark ({t!r})", "Visual glyph in the chrome — change only if intentional.")
    if tag == "title":
        return ("Browser tab title", "Title bar and search snippets.")
    if tag == "kbd":
        return (f"Keyboard hint: {t}", "Displayed shortcut badge.")
    if tag == "button" and t in ("◐", "▶", "×", "+"):
        return (f"Control button ({t})", "UI control label.")
    if tag == "a" and t == "Skip to content":
        return ("Skip link", "Accessibility link at the top of the page.")
    if tag in ("h1", "h2", "h3"):
        return (f"Heading ({tag})", None)
    if tag == "label":
        return ("Form label", None)
    if tag == "li":
        return ("List item", None)
    if tag == "b" and len(t) < 40:
        return (f"Header title: {t}", "Page name in the top bar.")
    # Default: use truncated text as label so every field is identifiable
    preview = t if len(t) <= 48 else t[:45] + "…"
    return (preview or f"Empty <{tag}>", f"<{tag}> · field #{i}")


def _organise(src: str, stellen: list) -> dict:
    """Split groups into header / sidebar / meta / overlay / content (ordered)."""
    groups = aa.gruppiere(src, stellen)
    out = {
        BUCKET_META: [],
        BUCKET_HEADER: [],
        BUCKET_SIDEBAR: [],
        BUCKET_CONTENT: [],
        BUCKET_OVERLAY: [],
    }
    for g in groups:
        out[_bucket_for_group(g["titel"])].append(g)
    return out


def _cat_for_hints(katalog, js_hints, already: set, page_abteilung: str | None = None):
    out = []
    for abt, gleis in js_hints:
        for e in katalog:
            if e["slug"] in already:
                continue
            if e.get("abteilung") != abt:
                continue
            if gleis and e.get("gleis") != gleis:
                continue
            already.add(e["slug"])
            out.append(e)
    # Page-level fallback: if a section has (abteilung, None), grab remaining
    for abt, gleis in js_hints:
        if gleis is not None:
            continue
        for e in katalog:
            if e["slug"] in already:
                continue
            if e.get("abteilung") == abt:
                already.add(e["slug"])
                out.append(e)
    return out


def _page_meta(name: str) -> tuple[str, str]:
    for n, label, path in PAGES:
        if n == name:
            return label, path
    return name, "/"


def _valid_page(name: str) -> bool:
    return any(n == name for n, _, _ in PAGES) and (aa.APP / name).exists()


def _page_merge_write(name: str, fields: dict, sizes: dict | None = None) -> str | None:
    """Merge edited fields (+ optional letter sizes) into the page and save.

    The UX form only shows a subset of spans (no shared sidebar). Sending a
    partial `texts` array was rejected by page_write — always merge by index.
    """
    _, stellen = aa.page_read(name)
    texts = [st["text"] for st in stellen]
    for key, val in (fields or {}).items():
        i = int(key)
        if i < 0 or i >= len(texts):
            raise ValueError(f"field index {i} out of range (0..{len(texts) - 1})")
        if not isinstance(val, str):
            raise ValueError(f"field {i} must be text")
        texts[i] = val
    return aa.page_write(name, texts, sizes=sizes or None)


SIDEBAR_CANON = "index.html"


def _sidebar_stellen(name: str) -> tuple[list, list]:
    """Return (all page stellen, sidebar-only stellen) for a file."""
    src, stellen = aa.page_read(name)
    for g in aa.gruppiere(src, stellen):
        if "Leiste" in g["titel"] or g["titel"].startswith("Leiste"):
            return stellen, g["stellen"]
    return stellen, []


def _apply_sidebar_to_all(new_values: list[str]) -> list[str]:
    """Write sidebar labels to every Hub page. Backups via page_write each time.

    Canonical order is index.html. Pages with the same field count get a
    positional update. Pages with extras (e.g. modules.html glyph) match by
    text queue so unique items are left alone.
    """
    _, canon = _sidebar_stellen(SIDEBAR_CANON)
    if len(new_values) != len(canon):
        raise ValueError(
            f"expected {len(canon)} sidebar fields, got {len(new_values)}"
        )
    from collections import defaultdict, deque

    reports = []
    for name, _, _ in PAGES:
        if not (aa.APP / name).exists():
            continue
        full, side = _sidebar_stellen(name)
        if not side:
            continue
        texts = [st["text"] for st in full]
        if len(side) == len(new_values):
            for st, nv in zip(side, new_values):
                texts[st["i"]] = nv
        else:
            queues: dict[str, deque] = defaultdict(deque)
            for old, nv in zip(canon, new_values):
                queues[aa.glatt(old["text"])].append(nv)
            for st in side:
                q = queues.get(aa.glatt(st["text"]))
                if q:
                    texts[st["i"]] = q.popleft()
        b = aa.page_write(name, texts)
        if b:
            reports.append(f"{name} → {b}")
    return reports


# ── CSS ───────────────────────────────────────────────────────────────────
CSS = r"""
:root{
  --bg:#12151a; --panel:#1B1E24; --panel2:#21252C; --ink:#E9EBE7; --muted:#8F95A1;
  --line:#323843; --line2:#262b33; --seal:#2BD4E8; --seal-ink:#071316;
  --ok:#35B36B; --err:#DC7A6E; --warn:#E0A354;
  --sidebar-accent:#7FE7F3; --header-accent:#C4B5FD;
  --radius:12px; --font:Calibri,Carlito,"Segoe UI",system-ui,sans-serif;
  --mono:ui-monospace,"Geist Mono",Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{background:var(--bg);color:var(--ink);font-family:var(--font);font-size:15px;line-height:1.45}
a{color:var(--seal);text-decoration:none} a:hover{text-decoration:underline}
button,input,textarea,select{font:inherit}
.shell{display:grid;grid-template-rows:auto 1fr auto;height:100vh;min-height:0}
.top{
  display:flex;flex-wrap:wrap;align-items:center;gap:.6rem 1rem;
  padding:.65rem 1.1rem;background:var(--panel);border-bottom:1px solid var(--line);
}
.brand{font-weight:600;letter-spacing:-.02em}
.brand b{color:var(--seal);font-weight:600}
.pill{
  display:inline-flex;align-items:center;gap:.35rem;padding:.18rem .55rem;
  border-radius:999px;border:1px solid var(--line);color:var(--muted);font-size:.75rem;
  font-family:var(--mono);
}
.pill strong{color:var(--ink);font-weight:600}
.top .sp{flex:1}
.top nav{display:flex;flex-wrap:wrap;gap:.55rem;align-items:center;font-size:.86rem}
.top nav a{color:var(--muted)} .top nav a:hover{color:var(--seal)}
/* Dashboard */
.dash{max-width:56rem;margin:0 auto;padding:1.5rem 1.2rem 3rem}
.dash h1{font-size:1.55rem;margin:0 0 .4rem;letter-spacing:-.02em}
.dash .lead{color:var(--muted);max-width:48ch;margin:0 0 1.4rem;font-size:.95rem}
.table{width:100%;border-collapse:collapse}
.table th,.table td{text-align:left;padding:.65rem .7rem;border-bottom:1px solid var(--line);vertical-align:top}
.table th{color:var(--muted);font-weight:500;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em}
.table td b{font-size:1.02rem}
.mono{font-family:var(--mono);font-size:.8rem;color:var(--muted)}
.btn{
  background:var(--seal);color:var(--seal-ink);border:1px solid var(--seal);
  border-radius:999px;padding:.45em 1.1em;font-weight:600;cursor:pointer;
  display:inline-block;text-decoration:none;
}
.btn:hover{text-decoration:none;filter:brightness(1.05)}
.btn:disabled{opacity:.55;cursor:wait}
.btn.ghost{background:transparent;color:var(--ink);border-color:#5A6273}
.btn.ghost:hover{border-color:var(--seal);color:var(--seal)}
.btn.sm{padding:.28em .75em;font-size:.85rem}
/* Editor layout */
.main{
  display:grid;grid-template-columns:minmax(22rem,40%) 8px minmax(0,1fr);
  min-height:0;height:100%;
}
.main.zu{grid-template-columns:1fr}
.main.zu .preview,.main.zu .split{display:none}
.fields{min-width:0;overflow:auto;padding:0;background:var(--panel);border-right:1px solid var(--line2)}
.fields-inner{padding:1rem 1rem 2.5rem}
.page-nav{
  display:flex;flex-wrap:wrap;gap:.4rem;padding:.75rem 1rem;border-bottom:1px solid var(--line2);
  background:var(--panel2);position:sticky;top:0;z-index:2;
}
.page-nav a{
  font-size:.78rem;padding:.28rem .55rem;border-radius:999px;border:1px solid var(--line);
  color:var(--muted);text-decoration:none;
}
.page-nav a:hover{border-color:var(--seal);color:var(--seal)}
.page-nav a.on{background:rgba(43,212,232,.12);border-color:var(--seal);color:var(--seal);font-weight:600}
.intro{margin:0 0 1rem;color:var(--muted);font-size:.88rem;max-width:46ch}
.intro strong{color:var(--ink)}
/* Sections */
.sec{
  border:1px solid var(--line2);border-radius:var(--radius);background:var(--panel2);
  margin:0 0 .9rem;overflow:hidden;
}
.sec>header{
  display:flex;align-items:baseline;justify-content:space-between;gap:.6rem;
  padding:.7rem .9rem;border-bottom:1px solid var(--line2);
}
.sec>header h2{margin:0;font-size:.95rem;font-weight:600;letter-spacing:-.01em}
.sec>header .hint{color:var(--muted);font-size:.72rem;font-family:var(--mono)}
.sec .body{padding:.5rem .9rem .85rem}
.sec--header{border-color:rgba(196,181,253,.35)}
.sec--header>header{background:rgba(196,181,253,.08)}
.sec--header>header h2{color:var(--header-accent)}
.sec--sidebar{border-color:rgba(127,231,243,.35)}
.sec--sidebar>header{background:rgba(127,231,243,.07)}
.sec--sidebar>header h2{color:var(--sidebar-accent)}
.sec--meta>header h2{color:var(--muted)}
.sec--overlay{border-style:dashed}
.subhead{
  font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);
  margin:1rem 0 .45rem;font-weight:600;
}
.field{margin:.5rem 0 .7rem}
.field label{
  display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;
  font-size:.8rem;font-weight:600;color:var(--ink);margin:0 0 .28rem;
}
.field .help{display:block;width:100%;color:var(--muted);font-size:.72rem;font-weight:400;margin:.1rem 0 .3rem}
.field .tag{font-family:var(--mono);font-size:.68rem;color:var(--muted);font-weight:400}
.field .row-tools{
  display:flex;flex-wrap:wrap;align-items:center;gap:.45rem;margin:0 0 .35rem;
}
.field .row-tools label.size-lab{
  display:inline-flex;align-items:center;gap:.35rem;margin:0;font-size:.72rem;
  font-weight:500;color:var(--muted);
}
.field select.size-sel{
  background:#101318;color:var(--ink);border:1px solid var(--line);border-radius:6px;
  padding:.2rem .4rem;font-size:.75rem;font-family:var(--mono);
}
.field .snip{
  font-weight:400;color:var(--muted);font-size:.75rem;max-width:100%;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.field input,.field textarea{
  width:100%;background:#101318;color:var(--ink);border:1px solid var(--line);
  border-radius:8px;padding:.5rem .65rem;resize:vertical;
}
.field input:focus,.field textarea:focus{
  outline:none;border-color:var(--seal);box-shadow:0 0 0 2px rgba(43,212,232,.18);
}
.field.is-sel input,.field.is-sel textarea{
  border-color:var(--seal);background:rgba(43,212,232,.06);
}
.field.is-sel label{color:var(--seal)}
.field.glyph input{max-width:6rem;text-align:center;font-size:1.1rem}
.card{
  border-left:3px solid var(--seal);background:rgba(43,212,232,.05);
  border-radius:0 10px 10px 0;padding:.55rem .75rem .7rem;margin:.7rem 0;
}
.card h3{margin:0 0 .1rem;font-size:.88rem}
.card .slug{font-family:var(--mono);font-size:.72rem;color:var(--muted);margin-bottom:.4rem}
.cat-note{font-size:.8rem;color:var(--muted);margin:.2rem 0 .5rem}
.split{width:8px;cursor:col-resize;background:var(--bg);position:relative}
.split::after{
  content:"";position:absolute;left:3px;top:0;bottom:0;width:2px;background:var(--line);border-radius:2px;
}
.split:hover::after{background:var(--seal)}
.preview{min-width:0;min-height:0;display:flex;flex-direction:column;background:#0d0f13}
.preview .pvbar{
  display:flex;align-items:center;gap:.6rem;padding:.45rem .75rem;
  border-bottom:1px solid var(--line);background:var(--panel);font-size:.8rem;color:var(--muted);
}
.preview iframe{flex:1;width:100%;border:0;background:#21252C;min-height:0}
.bar{
  display:flex;flex-wrap:wrap;align-items:center;gap:.55rem 1rem;
  padding:.6rem 1.1rem;background:var(--panel);border-top:1px solid var(--line);
}
#status{font-family:var(--mono);font-size:.8rem;color:var(--muted);min-height:1.2em}
#status.ok{color:var(--ok)} #status.err{color:var(--err)} #status.busy{color:var(--seal)}
.banner{
  margin:0 0 .85rem;padding:.65rem .8rem;border-radius:10px;font-size:.9rem;
  display:flex;flex-wrap:wrap;gap:.55rem;align-items:center;
}
.banner[hidden]{display:none!important}
.banner.draft{border:1px solid var(--seal);background:rgba(43,212,232,.1)}
.banner.err{border:1px solid var(--err);background:rgba(220,122,110,.12);color:#F0B3AA}
.toast-backup{font-family:var(--mono);font-size:.75rem;color:var(--muted)}
.count-chip{
  display:inline-block;min-width:1.4em;text-align:center;padding:.05em .4em;
  border-radius:999px;background:rgba(255,255,255,.06);font-family:var(--mono);font-size:.72rem;color:var(--muted);
}
@media(max-width:1000px){
  .main{grid-template-columns:1fr;grid-template-rows:1fr 42vh}
  .split{display:none}
  .fields{border-right:0;border-bottom:1px solid var(--line)}
}
"""


_SIZE_OPTS = (
    ("xs", "XS — smaller"),
    ("sm", "S — small"),
    ("md", "M — default"),
    ("lg", "L — large"),
    ("xl", "XL — larger"),
    ("2xl", "2XL — biggest"),
)


def _field_html(st: dict) -> str:
    i, text, tag = st["i"], st["text"], st["tag"]
    size = st.get("size") or "md"
    if size not in dict(_SIZE_OPTS):
        size = "md"
    label, help_ = _field_label(st)
    glyph = len(text.strip()) <= 2
    kurz = len(text) <= 60
    rows = max(2, min(12, len(text) // 50 + 1))
    help_html = f'<span class="help">{_esc(help_)}</span>' if help_ else ""
    opts = "".join(
        f'<option value="{k}"{" selected" if k == size else ""}>{_esc(lab)}</option>'
        for k, lab in _SIZE_OPTS
    )
    size_ctrl = (
        f'<div class="row-tools">'
        f'<label class="size-lab">Letter size '
        f'<select class="size-sel" data-size-for="{i}" title="Letter size for field #{i}">'
        f"{opts}</select></label>"
        f'<span class="tag">#{i}</span></div>'
    )
    ctrl = (
        f'<input type="text" data-i="{i}" data-key="p:{i}" value="{_esc(text)}">'
        if kurz
        else f'<textarea data-i="{i}" data-key="p:{i}" rows="{rows}">{html.escape(text)}</textarea>'
    )
    cls = "field glyph" if glyph else "field"
    return (
        f'<div class="{cls}" id="f{i}" data-field="{i}">'
        f'<label>{_esc(label)}'
        f'<span class="tag">&lt;{html.escape(tag)}&gt; · #{i}</span></label>'
        f"{help_html}{size_ctrl}{ctrl}</div>"
    )


CAT_SIZES_FILE = aa.APP / "assets" / "catalogue-sizes.js"


def cat_sizes_read() -> dict:
    """slug → { field: size } from catalogue-sizes.js."""
    if not CAT_SIZES_FILE.exists():
        return {}
    text = CAT_SIZES_FILE.read_text(encoding="utf-8")
    m = re.search(r"window\.__catalogueSizes\s*=\s*(\{[\s\S]*\})\s*;?\s*$", text)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return {}


def cat_sizes_write(data: dict) -> str | None:
    """Rewrite catalogue-sizes.js (backup first)."""
    clean = {}
    for slug, fields in (data or {}).items():
        if not isinstance(fields, dict):
            continue
        row = {}
        for k, v in fields.items():
            if k in aa.FIELDS and v in dict(_SIZE_OPTS) and v != "md":
                row[k] = v
        if row:
            clean[str(slug)] = row
    new_body = (
        "/* Per-field letter sizes for catalogue cards. Managed by the UX admin.\n"
        "   Keys: slug → { title|who|lede|about|note|meta: xs|sm|md|lg|xl|2xl } */\n"
        "window.__catalogueSizes = "
        + json.dumps(clean, ensure_ascii=False, indent=1)
        + ";\n"
    )
    old = CAT_SIZES_FILE.read_text(encoding="utf-8") if CAT_SIZES_FILE.exists() else ""
    if old == new_body:
        return None
    b = aa.backup(CAT_SIZES_FILE)
    CAT_SIZES_FILE.write_text(new_body, encoding="utf-8")
    return b


def _cat_html(entries: list) -> str:
    if not entries:
        return ""
    sizes_all = cat_sizes_read()
    chunks = [
        '<p class="cat-note">Catalogue cards (<span class="mono">catalogue.js</span>) — '
        "each field has its own letter size. Same Save button; each write makes a backup.</p>"
    ]
    for e in sorted(entries, key=lambda x: x["slug"]):
        title = e["felder"].get("title", (0, 0, e["slug"]))[2]
        slug = e["slug"]
        row_sizes = sizes_all.get(slug) or {}
        body = ""
        for k in aa.FIELDS:
            if k not in e["felder"]:
                continue
            wert = e["felder"][k][2]
            lab, help_ = CAT_LABELS.get(k, (k, None))
            size = row_sizes.get(k) or "md"
            if size not in dict(_SIZE_OPTS):
                size = "md"
            kurz = k in ("title", "meta") or len(wert) <= 60
            rows = max(2, min(10, len(wert) // 50 + 1))
            help_html = f'<span class="help">{_esc(help_)}</span>' if help_ else ""
            opts = "".join(
                f'<option value="{sk}"{" selected" if sk == size else ""}>{_esc(slab)}</option>'
                for sk, slab in _SIZE_OPTS
            )
            size_ctrl = (
                f'<div class="row-tools">'
                f'<label class="size-lab">Letter size '
                f'<select class="size-sel" data-csize="{_esc(slug)}:{k}" '
                f'title="Letter size for {html.escape(lab)}">'
                f"{opts}</select></label>"
                f'<span class="tag">{_esc(k)}</span></div>'
            )
            ctrl = (
                f'<input type="text" data-key="c:{_esc(slug)}:{k}" value="{_esc(wert)}">'
                if kurz
                else f'<textarea data-key="c:{_esc(slug)}:{k}" rows="{rows}">{html.escape(wert)}</textarea>'
            )
            body += (
                f'<div class="field"><label>{_esc(lab)}</label>'
                f"{help_html}{size_ctrl}{ctrl}</div>"
            )
        track = e.get("gleis") or ""
        chunks.append(
            f'<div class="card" data-slug="{_esc(slug)}">'
            f"<h3>{_esc(title)}</h3>"
            f'<div class="slug">{_esc(slug)}'
            f'{(" · " + html.escape(track)) if track else ""}</div>{body}</div>'
        )
    return "".join(chunks)


def _section_block(css_mod: str, title: str, hint: str, body_html: str) -> str:
    return (
        f'<section class="sec sec--{css_mod}">'
        f"<header><h2>{_esc(title)}</h2>"
        f'<span class="hint">{_esc(hint)}</span></header>'
        f'<div class="body">{body_html}</div></section>'
    )


def build_dashboard() -> str:
    act = ""
    try:
        import subprocess

        act = (
            subprocess.run(
                ["systemctl", "--user", "is-active", "entrosana-app"],
                capture_output=True,
                text=True,
            ).stdout.strip()
            or "?"
        )
    except Exception:
        act = "?"
    _, side = _sidebar_stellen(SIDEBAR_CANON)
    rows = []
    rows.append(
        f"<tr><td><b style='color:var(--sidebar-accent)'>Sidebar</b><br>"
        f"<span class='mono'>shared left rail · all pages</span></td>"
        f"<td><span class='count-chip'>{len(side)}</span> text fields</td>"
        f"<td><a class='btn sm' href='/sidebar'>Edit</a></td>"
        f"<td><a class='btn ghost sm' href='{LIVE}/' target='_blank' rel='noopener'>Live</a></td></tr>"
    )
    for name, label, path in PAGES:
        if not (aa.APP / name).exists():
            continue
        src, stellen = aa.page_read(name)
        bags = _organise(src, stellen)
        # Count without sidebar (edited on /sidebar)
        n = len(stellen) - sum(len(g["stellen"]) for g in bags[BUCKET_SIDEBAR])
        rows.append(
            f"<tr><td><b>{_esc(label)}</b><br><span class='mono'>{_esc(path)}</span></td>"
            f"<td><span class='count-chip'>{n}</span> text fields "
            f"<span class='mono'>(+ sidebar separate)</span></td>"
            f"<td><a class='btn sm' href='/page/{_esc(name)}'>Edit</a></td>"
            f"<td><a class='btn ghost sm' href='{LIVE}{_esc(path)}' target='_blank' rel='noopener'>Live</a></td></tr>"
        )
    body = f"""
<div class="dash">
  <h1>entro<span style="color:var(--seal)">sana</span>.app editor</h1>
  <p class="lead">UX editor on Tailscale · page content per screen ·
  <strong style="color:var(--sidebar-accent)">Sidebar is one shared page</strong>
  (not repeated) · every save writes a backup.
  Hub service: <span class="mono">{_esc(act)}</span></p>
  <table class="table">
    <thead><tr><th>Page</th><th>Fields</th><th></th><th></th></tr></thead>
    <tbody>{"".join(rows)}</tbody>
  </table>
  <p class="lead" style="margin-top:2rem">Classic admin still at
  <a class="mono" href="http://{HOST}:8396/">http://{HOST}:8396/</a></p>
</div>"""
    return _shell("entrosana.app editor", body, bare=True)


def build_page_editor(name: str) -> str:
    label, path = _page_meta(name)
    src, stellen = aa.page_read(name)
    bags = _organise(src, stellen)
    _, katalog = aa.cat_entries()
    already: set = set()

    # Page switcher
    nav = []
    for n, lab, p in PAGES:
        if not (aa.APP / n).exists():
            continue
        on = " on" if n == name else ""
        nav.append(f'<a class="{on.strip()}" href="/page/{_esc(n)}">{_esc(lab)}</a>')

    def fields_from_groups(groups, attach_cat=True):
        html_parts = []
        for g in groups:
            if len(groups) > 1 and g["titel"] not in (
                "Kopfzeile der Seite",
                "Leiste · auf allen Seiten gleich",
                "Kopfbereich · Titel und Beschreibung",
                "Seitentext ausserhalb der Abschnitte",
            ):
                html_parts.append(f'<div class="subhead">{_esc(g["titel"])}</div>')
            for st in g["stellen"]:
                html_parts.append(_field_html(st))
            if attach_cat:
                entries = _cat_for_hints(katalog, g.get("js") or [], already)
                html_parts.append(_cat_html(entries))
        return "".join(html_parts)

    # Ensure every span index appears exactly once
    covered = set()
    for bag in bags.values():
        for g in bag:
            for st in g["stellen"]:
                covered.add(st["i"])
    orphans = [st for st in stellen if st["i"] not in covered]
    if orphans:
        bags[BUCKET_OVERLAY].append(
            {"titel": "Other text", "zu": False, "stellen": orphans, "js": []}
        )

    n_header = sum(len(g["stellen"]) for g in bags[BUCKET_HEADER])
    n_sidebar = sum(len(g["stellen"]) for g in bags[BUCKET_SIDEBAR])
    n_content = sum(len(g["stellen"]) for g in bags[BUCKET_CONTENT])
    n_meta = sum(len(g["stellen"]) for g in bags[BUCKET_META])
    n_overlay = sum(len(g["stellen"]) for g in bags[BUCKET_OVERLAY])
    # Sidebar is edited on /sidebar — exclude from this page's field set
    n_all = len(stellen) - n_sidebar
    # Drop sidebar spans from INITIAL_TEXTS overlay: still need full array for page_write
    # but UI must not list them. page save only overwrites indices present in the form;
    # INITIAL_TEXTS keeps sidebar values so they are not blanked.

    sections = []
    # Order: Header, Content…, Dialogs, Browser tab  (Sidebar → /sidebar only)
    if bags[BUCKET_HEADER]:
        sections.append(
            _section_block(
                "header",
                "Header",
                f"{n_header} fields · top bar of the page",
                fields_from_groups(bags[BUCKET_HEADER], attach_cat=False),
            )
        )
    if bags[BUCKET_CONTENT]:
        for g in bags[BUCKET_CONTENT]:
            entries = _cat_for_hints(katalog, g.get("js") or [], already)
            n = len(g["stellen"]) + sum(len(e["felder"]) for e in entries)
            body = "".join(_field_html(st) for st in g["stellen"]) + _cat_html(entries)
            sections.append(
                _section_block(
                    "content",
                    _friendly_title(BUCKET_CONTENT, g["titel"]),
                    f"{n} fields",
                    body,
                )
            )
    if bags[BUCKET_OVERLAY]:
        sections.append(
            _section_block(
                "overlay",
                "Dialogs & overlays",
                f"{n_overlay} fields · modals, skip link, picker copy",
                fields_from_groups(bags[BUCKET_OVERLAY], attach_cat=False),
            )
        )
    if bags[BUCKET_META]:
        sections.append(
            _section_block(
                "meta",
                "Browser tab",
                f"{n_meta} fields · document title",
                fields_from_groups(bags[BUCKET_META], attach_cat=False),
            )
        )

    # Final safety: any catalogue still not shown for this page's abteilung
    page_abt = {
        "tools.html": "tools",
        "modules.html": "modules",
        "contribute.html": "contribute",
    }.get(name)
    if page_abt:
        leftover = [
            e
            for e in katalog
            if e.get("abteilung") == page_abt and e["slug"] not in already
        ]
        if leftover:
            for e in leftover:
                already.add(e["slug"])
            sections.append(
                _section_block(
                    "content",
                    "Catalogue (remaining)",
                    f"{len(leftover)} cards",
                    _cat_html(leftover),
                )
            )

    texts = [st["text"] for st in stellen]

    # Page switcher also links shared sidebar
    nav_bar = (
        f'<a href="/sidebar" style="border-color:rgba(127,231,243,.5);color:var(--sidebar-accent)">'
        f"Sidebar</a>" + "".join(nav)
    )

    editor_body = f"""
<div class="shell">
  <header class="top">
    <div class="brand">entro<b>sana</b>.app · {_esc(label)}</div>
    <span class="pill"><strong>{n_all}</strong> text fields</span>
    <span class="pill">save → <strong>backup</strong></span>
    <span class="sp"></span>
    <nav>
      <a href="/">All pages</a>
      <a href="/sidebar">Sidebar</a>
      <a href="{LIVE}{_esc(path)}" target="_blank" rel="noopener">Live</a>
      <a href="http://{HOST}:8396/page/{_esc(name)}">Classic</a>
    </nav>
  </header>
  <div class="main" id="main">
    <div class="fields" id="fs">
      <div class="page-nav">{nav_bar}</div>
      <div class="fields-inner">
        <p class="intro">
          <strong>Page content &amp; header</strong> for {_esc(label)}.
          The shared left rail is edited once on
          <a href="/sidebar">Sidebar</a> (not listed here).
          Click highlighted text in the preview to jump here. Ctrl/Cmd+S saves.
          {"<br><strong>Workspace · Oversight:</strong> two states — "
           "<em>Empty</em> (Welcome / Nothing open yet) and "
           "<em>Resume</em> (Pick up where you stopped / project count). "
           "Both are listed below and editable. The live page toggles which block is shown; "
           "the count only includes active projects (not archived or deleted)."
           if name == "index.html" else ""}
        </p>
        <div id="draft" class="banner draft" hidden></div>
        <div id="fehler" class="banner err" hidden></div>
        {"".join(sections)}
        <p class="intro" style="margin-top:1.2rem">
          Header {n_header} · Content {n_content} ·
          Dialogs {n_overlay} · Tab {n_meta} · on this page {n_all}
          · <a href="/sidebar">Sidebar separate ({n_sidebar} fields)</a>
        </p>
      </div>
    </div>
    <div class="split" id="split" title="Drag to resize"></div>
    <div class="preview">
      <div class="pvbar">
        <span>Preview · click a dashed phrase to open its field</span>
        <span class="sp"></span>
        <button type="button" class="btn ghost sm" id="reloadPv">Reload</button>
      </div>
      <iframe id="pv" title="Preview" src="/preview/{_esc(name)}"></iframe>
    </div>
  </div>
  <footer class="bar">
    <button type="button" class="btn" id="save">Save changes</button>
    <button type="button" class="btn ghost" id="togglePv">Hide preview</button>
    <a class="btn ghost" href="{LIVE}{_esc(path)}" target="_blank" rel="noopener">Open live</a>
    <span id="status">Ready</span>
    <span class="sp"></span>
    <span class="toast-backup" id="lastBackup"></span>
  </footer>
</div>
<script>var PAGE_NAME={json.dumps(name)}; var INITIAL_TEXTS={json.dumps(texts, ensure_ascii=False)};
var SAVE_MODE='page';</script>
<script>{editor_js()}</script>
"""
    return _shell(f"{label} · editor", editor_body, bare=True)


def build_sidebar_editor() -> str:
    """Shared left-rail editor — one place for all Hub pages."""
    full, side = _sidebar_stellen(SIDEBAR_CANON)
    if not side:
        return _shell(
            "Sidebar",
            "<div class='dash'><h1>Sidebar</h1><p class='lead'>No rail found on index.html.</p>"
            "<p><a href='/'>← All pages</a></p></div>",
            bare=True,
        )
    # Map form order: data-key s:0..n for sidebar-only save (not page span index list)
    # Re-tag keys as s:ordinal while keeping data-i for preview on index
    # Rebuild fields with s: keys for clear save payload
    field_chunks = []
    for ord_i, st in enumerate(side):
        i, text, tag = st["i"], st["text"], st["tag"]
        label, help_ = _field_label(st)
        glyph = len(text.strip()) <= 2
        kurz = len(text) <= 60
        rows = max(2, min(8, len(text) // 50 + 1))
        help_html = f'<span class="help">{_esc(help_)}</span>' if help_ else ""
        ctrl = (
            f'<input type="text" data-i="{i}" data-key="s:{ord_i}" value="{_esc(text)}">'
            if kurz
            else f'<textarea data-i="{i}" data-key="s:{ord_i}" rows="{rows}">{html.escape(text)}</textarea>'
        )
        cls = "field glyph" if glyph else "field"
        field_chunks.append(
            f'<div class="{cls}" id="f{i}" data-field="{i}">'
            f'<label>{_esc(label)}'
            f'<span class="tag">&lt;{html.escape(tag)}&gt; · #{i}</span></label>'
            f"{help_html}{ctrl}</div>"
        )
    section = _section_block(
        "sidebar",
        "Sidebar (shared)",
        f"{len(side)} fields · saves to every Hub page · each file backed up",
        "".join(field_chunks),
    )
    nav = []
    for n, lab, p in PAGES:
        if not (aa.APP / n).exists():
            continue
        nav.append(f'<a href="/page/{_esc(n)}">{_esc(lab)}</a>')
    nav_bar = (
        f'<a class="on" href="/sidebar" style="border-color:var(--sidebar-accent);'
        f'color:var(--sidebar-accent);font-weight:600">Sidebar</a>' + "".join(nav)
    )
    side_texts = [st["text"] for st in side]
    body = f"""
<div class="shell">
  <header class="top">
    <div class="brand">entro<b>sana</b>.app · Sidebar</div>
    <span class="pill" style="border-color:rgba(127,231,243,.4);color:var(--sidebar-accent)">
      <strong>shared</strong> rail</span>
    <span class="pill"><strong>{len(side)}</strong> labels</span>
    <span class="pill">save → <strong>all pages + backup</strong></span>
    <span class="sp"></span>
    <nav>
      <a href="/">All pages</a>
      <a href="{LIVE}/" target="_blank" rel="noopener">Live</a>
    </nav>
  </header>
  <div class="main" id="main">
    <div class="fields" id="fs">
      <div class="page-nav">{nav_bar}</div>
      <div class="fields-inner">
        <p class="intro">
          <strong style="color:var(--sidebar-accent)">One sidebar for the whole Hub.</strong>
          Edit labels here once; save writes the same rail text into every page file
          (each write makes a backup). Page-specific content is under each page editor.
        </p>
        <div id="draft" class="banner draft" hidden></div>
        <div id="fehler" class="banner err" hidden></div>
        {section}
      </div>
    </div>
    <div class="split" id="split" title="Drag to resize"></div>
    <div class="preview">
      <div class="pvbar">
        <span>Preview (Workspace) · rail on the left</span>
        <span class="sp"></span>
        <button type="button" class="btn ghost sm" id="reloadPv">Reload</button>
      </div>
      <iframe id="pv" title="Preview" src="/preview/{SIDEBAR_CANON}"></iframe>
    </div>
  </div>
  <footer class="bar">
    <button type="button" class="btn" id="save">Save sidebar to all pages</button>
    <button type="button" class="btn ghost" id="togglePv">Hide preview</button>
    <a class="btn ghost" href="{LIVE}/" target="_blank" rel="noopener">Open live</a>
    <span id="status">Ready</span>
    <span class="sp"></span>
    <span class="toast-backup" id="lastBackup"></span>
  </footer>
</div>
<script>var PAGE_NAME={json.dumps(SIDEBAR_CANON)};
var INITIAL_TEXTS={json.dumps(side_texts, ensure_ascii=False)};
var SAVE_MODE='sidebar';</script>
<script>{editor_js()}</script>
"""
    return _shell("Sidebar · editor", body, bare=True)


def _shell(title: str, body: str, bare: bool = False) -> str:
    wrap = body if bare else f'<div class="dash">{body}</div>'
    return (
        f"<!DOCTYPE html><html lang=en><head><meta charset=utf-8>"
        f"<meta name=viewport content='width=device-width,initial-scale=1'>"
        f"<meta name=robots content='noindex,nofollow'>"
        f"<title>{_esc(title)}</title><style>{CSS}</style></head>"
        f"<body>{wrap}</body></html>"
    )


def editor_js() -> str:
    return r"""
(function(){
  var KEY='entrosana-admin-draft:ux:'+((typeof SAVE_MODE!=='undefined'&&SAVE_MODE==='sidebar')?'sidebar':PAGE_NAME);
  var BR='entrosana-admin-ux-breite';
  var ZU='entrosana-admin-ux-vorschau-zu';
  var main=document.getElementById('main');
  var fs=document.getElementById('fs');
  var pv=document.getElementById('pv');
  var status=document.getElementById('status');
  var lastBackup=document.getElementById('lastBackup');
  var draftBar=document.getElementById('draft');
  var errBar=document.getElementById('fehler');

  function fieldEls(){ return fs.querySelectorAll('[data-key]'); }
  function collect(){
    var v={}; fieldEls().forEach(function(el){ v[el.getAttribute('data-key')]=el.value; });
    fs.querySelectorAll('[data-size-for]').forEach(function(el){
      v['size:'+el.getAttribute('data-size-for')]=el.value;
    });
    fs.querySelectorAll('[data-csize]').forEach(function(el){
      v['csize:'+el.getAttribute('data-csize')]=el.value;
    });
    return v;
  }
  var SAVED=JSON.stringify(collect());
  function dirty(){ return JSON.stringify(collect())!==SAVED; }
  function setStatus(t, kind){ status.textContent=t; status.className=kind||''; }
  function writeDraft(){
    try{
      if(dirty()) localStorage.setItem(KEY, JSON.stringify({t:new Date().toISOString(), v:collect()}));
      else localStorage.removeItem(KEY);
    }catch(e){}
  }
  function clearDraft(){ try{ localStorage.removeItem(KEY); }catch(e){} }
  function apply(v){
    fieldEls().forEach(function(el){
      var k=el.getAttribute('data-key');
      if(k in v) el.value=v[k];
    });
  }
  (function restoreDraft(){
    var raw=null; try{ raw=localStorage.getItem(KEY); }catch(e){}
    if(!raw) return;
    var d; try{ d=JSON.parse(raw); }catch(e){ clearDraft(); return; }
    if(!d||!d.v) return;
    if(JSON.stringify(d.v)===JSON.stringify(collect())){ clearDraft(); return; }
    var when=d.t? new Date(d.t).toLocaleString():'unknown';
    draftBar.innerHTML='<b>Unsaved draft</b> <span class="mono">'+when+
      '</span> — differs from the file on disk.';
    var a=document.createElement('button'); a.className='btn sm'; a.type='button'; a.textContent='Restore draft';
    a.onclick=function(){ apply(d.v); draftBar.hidden=true; syncPreview(); setStatus('Draft restored — not saved yet'); };
    var b=document.createElement('button'); b.className='btn ghost sm'; b.type='button'; b.textContent='Discard';
    b.onclick=function(){ clearDraft(); draftBar.hidden=true; };
    draftBar.appendChild(a); draftBar.appendChild(b); draftBar.hidden=false;
  })();

  fieldEls().forEach(function(el){
    el.addEventListener('input', function(){ writeDraft(); setStatus('Unsaved changes'); });
  });
  window.addEventListener('beforeunload', function(e){
    if(dirty()){ writeDraft(); e.preventDefault(); e.returnValue=''; }
  });

  function doc(){ try{ return pv.contentDocument; }catch(e){ return null; } }
  function stelle(i){ var d=doc(); return d? d.querySelector('.__ed[data-i="'+i+'"]'): null; }
  function highlight(i){
    var d=doc();
    if(d){
      d.querySelectorAll('.__ed.is-sel').forEach(function(n){ n.classList.remove('is-sel'); });
      var n=stelle(i);
      if(n){ n.classList.add('is-sel'); n.scrollIntoView({block:'center', behavior:'smooth'}); }
    }
    fs.querySelectorAll('.field.is-sel').forEach(function(n){ n.classList.remove('is-sel'); });
    var f=document.getElementById('f'+i); if(f) f.classList.add('is-sel');
  }
  window.__waehle=function(i){
    var el=fs.querySelector('[data-i="'+i+'"]');
    if(!el) return;
    el.scrollIntoView({block:'center'}); el.focus(); highlight(i);
  };
  function paintPreviewNode(n, v){
    if(!n) return;
    var parts=String(v).split(/<br\s*\/?\s*>/i), safe='';
    for(var pi=0; pi<parts.length; pi++){
      if(pi) safe+='<br>';
      safe+=parts[pi].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    n.innerHTML=safe;
  }
  function syncPreview(){
    fs.querySelectorAll('[data-i]').forEach(function(el){
      paintPreviewNode(stelle(el.getAttribute('data-i')), el.value);
    });
  }
  fs.querySelectorAll('[data-i]').forEach(function(el){
    var i=el.getAttribute('data-i');
    el.addEventListener('focus', function(){ highlight(i); });
    el.addEventListener('input', function(){
      paintPreviewNode(stelle(i), el.value);
    });
  });
  document.getElementById('reloadPv').onclick=function(){
    pv.src='/preview/'+PAGE_NAME+'?t='+Date.now();
  };

  function applyWidth(){
    var w=null; try{ w=localStorage.getItem(BR); }catch(e){}
    if(w && main.className.indexOf('zu')<0)
      main.style.gridTemplateColumns=w+' 8px minmax(0,1fr)';
  }
  function applyCollapse(){
    var zu=false; try{ zu=localStorage.getItem(ZU)==='1'; }catch(e){}
    main.className=zu? 'main zu':'main';
    if(zu) main.style.gridTemplateColumns=''; else applyWidth();
    document.getElementById('togglePv').textContent=zu? 'Show preview':'Hide preview';
  }
  document.getElementById('togglePv').onclick=function(){
    var zu=main.className.indexOf('zu')<0;
    try{ localStorage.setItem(ZU, zu?'1':'0'); }catch(e){}
    applyCollapse();
  };
  applyCollapse();
  var dragging=false;
  document.getElementById('split').addEventListener('mousedown', function(e){
    dragging=true; e.preventDefault(); document.body.style.userSelect='none';
  });
  window.addEventListener('mousemove', function(e){
    if(!dragging) return;
    var left=main.getBoundingClientRect().left;
    var w=Math.max(280, Math.min(e.clientX-left, main.clientWidth-280));
    main.style.gridTemplateColumns=w+'px 8px minmax(0,1fr)';
    try{ localStorage.setItem(BR, w+'px'); }catch(x){}
  });
  window.addEventListener('mouseup', function(){
    dragging=false; document.body.style.userSelect='';
  });

  function showErr(t){
    errBar.hidden=false;
    errBar.innerHTML='<b>Not saved:</b> '+String(t).replace(/</g,'&lt;')+
      '<br>Text stays in the fields and as a browser draft. '
      +'Line break: type <span class="mono">&lt;br&gt;</span> — other tags are blocked.';
  }
  function hideErr(){ errBar.hidden=true; errBar.textContent=''; }

  function readJson(r){
    return r.text().then(function(raw){
      var j=null;
      try{ j=JSON.parse(raw); }catch(e){
        throw new Error((r.status?('HTTP '+r.status+': '):'')+(raw||'empty response').slice(0,200));
      }
      if(!r.ok && (!j || j.ok!==false)){
        throw new Error((j && j.error) || ('HTTP '+r.status));
      }
      return j;
    });
  }

  function doSave(){
    var btn=document.getElementById('save');
    btn.disabled=true; setStatus('Saving… writing backup…', 'busy'); hideErr();
    var mode=(typeof SAVE_MODE!=='undefined')? SAVE_MODE : 'page';

    if(mode==='sidebar'){
      var nSide=0;
      fs.querySelectorAll('[data-key]').forEach(function(el){
        if(el.getAttribute('data-key').indexOf('s:')===0) nSide++;
      });
      var ordered=new Array(nSide);
      fs.querySelectorAll('[data-key]').forEach(function(el){
        var k=el.getAttribute('data-key');
        if(k.indexOf('s:')===0){
          ordered[parseInt(k.slice(2),10)]=el.value;
        }
      });
      for(var si=0; si<ordered.length; si++){
        if(typeof ordered[si]!=='string'){
          btn.disabled=false; setStatus('Not saved','err');
          showErr('Sidebar field s:'+si+' is missing'); writeDraft(); return;
        }
      }
      fetch('/api/sidebar',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({texts:ordered}), credentials:'same-origin'})
      .then(readJson)
      .then(function(j){
        btn.disabled=false;
        if(!j.ok){ setStatus('Not saved','err'); showErr(j.error||'error'); writeDraft(); return; }
        SAVED=JSON.stringify(collect()); clearDraft(); hideErr();
        var msg=j.backups && j.backups.length
          ? ('Saved · '+j.backups.length+' file backup(s) · live within ~5s')
          : (j.message||'Saved · no file changes');
        setStatus(msg, 'ok');
        lastBackup.textContent=(j.backups&&j.backups[0])||'';
        setTimeout(function(){ pv.src='/preview/'+PAGE_NAME+'?t='+Date.now(); }, 5200);
      }).catch(function(e){
        btn.disabled=false; setStatus('Not saved','err'); showErr(String(e.message||e)); writeDraft();
      });
      return;
    }

    // Partial form → one server request (page + catalogue together) to avoid
    // races and false "Not saved" when the HTML already wrote a backup.
    var fields={};
    fs.querySelectorAll('[data-i]').forEach(function(el){
      fields[el.getAttribute('data-i')]=el.value;
    });
    var sizes={};
    fs.querySelectorAll('[data-size-for]').forEach(function(el){
      sizes[el.getAttribute('data-size-for')]=el.value;
    });
    var kat={};
    fs.querySelectorAll('[data-key]').forEach(function(el){
      var k=el.getAttribute('data-key');
      if(k.indexOf('c:')===0){
        var p=k.split(':');
        (kat[p[1]]=kat[p[1]]||{})[p[2]]=el.value;
      }
    });
    // Catalogue card letter sizes (slug → field → size)
    var catSizes={};
    fs.querySelectorAll('[data-csize]').forEach(function(el){
      var p=el.getAttribute('data-csize').split(':');
      if(p.length<2) return;
      (catSizes[p[0]]=catSizes[p[0]]||{})[p[1]]=el.value;
    });
    var hasBr=Object.keys(fields).some(function(k){
      return /<br\s*\/?\s*>/i.test(fields[k]||'');
    });
    fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        name:PAGE_NAME, fields:fields, sizes:sizes,
        catalogue:kat, catalogue_sizes:catSizes
      }),
      credentials:'same-origin'})
    .then(readJson)
    .then(function(j){
      btn.disabled=false;
      if(!j || !j.ok){
        setStatus('Not saved', 'err');
        showErr((j && j.error) || 'unknown error');
        if(j && j.backup) lastBackup.textContent=j.backup;
        writeDraft();
        return;
      }
      SAVED=JSON.stringify(collect());
      clearDraft(); hideErr();
      var backs=(j.backups||[]).filter(function(b){
        return b && String(b).indexOf('keine')<0;
      });
      if(j.backup && backs.indexOf(j.backup)<0) backs.unshift(j.backup);
      var msg=backs.length
        ? ('Saved ✓ · '+backs.length+' backup(s) · live within ~5s')
        : 'Saved ✓ · no file changes';
      setStatus(msg, 'ok');
      if(j.warnings && j.warnings.length){
        errBar.hidden=false;
        errBar.innerHTML='<b>Saved with notes:</b> '+j.warnings.join(' · ').replace(/</g,'&lt;');
      }
      lastBackup.textContent=backs.length? backs[0] : '';
      // <br> splits text nodes — reload form so field indices stay correct
      if(hasBr || j.reload){
        setStatus(msg+' · reloading editor…', 'ok');
        setTimeout(function(){ location.reload(); }, 600);
        return;
      }
      setTimeout(function(){ pv.src='/preview/'+PAGE_NAME+'?t='+Date.now(); }, 5200);
    }).catch(function(e){
      btn.disabled=false;
      setStatus('Not saved', 'err');
      showErr(String(e.message||e));
      writeDraft();
    });
  }
  document.getElementById('save').onclick=doSave;
  window.addEventListener('keydown', function(e){
    if((e.metaKey||e.ctrlKey) && e.key==='s'){ e.preventDefault(); doSave(); }
  });
})();
"""


LOGIN_HTML = f"""<!DOCTYPE html><html lang=en><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>entrosana.app editor · login</title>
<style>{CSS}
.login{{max-width:24rem;margin:12vh auto;padding:1.5rem;background:var(--panel);
  border:1px solid var(--line);border-radius:var(--radius)}}
.login h1{{font-size:1.25rem;margin:0 0 .4rem}}
.login p{{color:var(--muted);font-size:.9rem;margin:0 0 1rem}}
.login input{{width:100%;margin:.4rem 0 1rem;background:#101318;color:var(--ink);
  border:1px solid var(--line);border-radius:8px;padding:.55rem .7rem}}
</style></head><body>
<div class="login">
  <h1>entro<span style="color:var(--seal)">sana</span>.app</h1>
  <p>Full page editor (UX) · Tailscale · same key as app admin</p>
  <form action="/login" method="get">
    <label for="key" style="font-size:.85rem;color:var(--muted)">Access key</label>
    <input id="key" name="key" type="password" autocomplete="current-password" autofocus>
    <button class="btn" type="submit">Continue</button>
  </form>
</div>
</body></html>"""


class H(BaseHTTPRequestHandler):
    server_version = "entrosana-ux-admin"

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
        return bool(m and aa.TOKEN and hmac.compare_digest(m.group(1), aa.TOKEN))

    def do_GET(self):
        if not self._src_ok():
            self._send(403, "forbidden", "text/plain")
            return
        u = urlparse(self.path)
        if u.path == "/healthz":
            self._send(200, "ok\n", "text/plain")
            return
        if u.path == "/login":
            key = parse_qs(u.query).get("key", [""])[0]
            if aa.TOKEN and hmac.compare_digest(key, aa.TOKEN):
                self._send(
                    302,
                    "",
                    extra={
                        "Set-Cookie": f"eaa={aa.TOKEN}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000",
                        "Location": "/",
                    },
                )
            else:
                self._send(200, LOGIN_HTML)
            return
        if not self._authed():
            self._send(302, "", extra={"Location": "/login"})
            return
        if u.path == "/":
            self._send(200, build_dashboard())
            return
        if u.path == "/sidebar":
            self._send(200, build_sidebar_editor())
            return
        m = re.match(r"^/page/([a-z0-9.-]+\.html)$", u.path)
        if m and _valid_page(m.group(1)):
            self._send(200, build_page_editor(m.group(1)))
            return
        # legacy modules shortcut
        if u.path in ("/modules", "/edit"):
            self._send(302, "", extra={"Location": "/page/modules.html"})
            return
        m = re.match(r"^/preview/([a-z0-9.-]+\.html)$", u.path)
        if m and _valid_page(m.group(1)):
            self._send(200, aa.preview_html(m.group(1)))
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
            self._json({"ok": False, "error": f"unreadable: {e}"}, 400)
            return
        try:
            if u.path == "/api/save":
                # Atomic-ish: page first, then each catalogue slug sequentially
                # (avoids parallel catalogue.js races that looked like failed saves).
                name = data.get("name", "")
                if not _valid_page(name):
                    raise ValueError("unknown page")
                backups = []
                warnings = []
                b = _page_merge_write(
                    name,
                    data.get("fields") or {},
                    sizes=data.get("sizes") or {},
                )
                if b:
                    backups.append(b)
                cat = data.get("catalogue") or {}
                if not isinstance(cat, dict):
                    raise ValueError("catalogue must be an object")
                _, entries = aa.cat_entries()
                known = {e["slug"] for e in entries}
                for slug, values in cat.items():
                    if slug not in known:
                        warnings.append(f"skip unknown card {slug}")
                        continue
                    try:
                        cb = aa.cat_write(slug, values or {})
                        if cb:
                            backups.append(f"{slug}: {cb}")
                    except Exception as ce:
                        warnings.append(f"{slug}: {ce}")
                # Catalogue field letter sizes (per card, per field)
                try:
                    cs_in = data.get("catalogue_sizes") or {}
                    if isinstance(cs_in, dict) and cs_in:
                        merged = cat_sizes_read()
                        for slug, fmap in cs_in.items():
                            if slug not in known:
                                continue
                            if not isinstance(fmap, dict):
                                continue
                            # merge this slug’s fields; md drops override
                            row = dict(merged.get(slug) or {})
                            for fk, fv in fmap.items():
                                if fk not in aa.FIELDS:
                                    continue
                                if fv in dict(_SIZE_OPTS) and fv != "md":
                                    row[fk] = fv
                                elif fk in row:
                                    del row[fk]
                            if row:
                                merged[slug] = row
                            elif slug in merged:
                                del merged[slug]
                        sb = cat_sizes_write(merged)
                        if sb:
                            backups.append(f"catalogue-sizes: {sb}")
                except Exception as se:
                    warnings.append(f"catalogue sizes: {se}")
                # Page write already succeeded → ok true even if a card warned
                self._json({
                    "ok": True,
                    "backup": backups[0] if backups else "keine Änderung",
                    "backups": backups,
                    "warnings": warnings,
                    "reload": any(
                        re.search(r"<br\s*/?>", str(v), re.I)
                        for v in (data.get("fields") or {}).values()
                    ),
                })
            elif u.path == "/api/page":
                name = data.get("name", "")
                if not _valid_page(name):
                    raise ValueError("unknown page")
                # Prefer partial `fields` map (UX editor). Full `texts` still works
                # for classic-compatible callers.
                if "fields" in data and data["fields"] is not None:
                    b = _page_merge_write(
                        name,
                        data.get("fields") or {},
                        sizes=data.get("sizes") or {},
                    )
                else:
                    b = aa.page_write(
                        name,
                        data.get("texts", []),
                        sizes=data.get("sizes") or None,
                    )
                self._json({"ok": True, "backup": b or "keine Änderung"})
            elif u.path == "/api/sidebar":
                texts = data.get("texts", [])
                if not isinstance(texts, list):
                    raise ValueError("texts must be a list")
                # dense list (may contain null holes if sparse) — compact
                ordered = []
                for i, v in enumerate(texts):
                    if v is None:
                        raise ValueError(f"missing sidebar field {i}")
                    ordered.append(v)
                backs = _apply_sidebar_to_all(ordered)
                self._json({
                    "ok": True,
                    "backups": backs,
                    "message": (
                        f"Updated {len(backs)} page file(s)" if backs
                        else "no file changes"
                    ),
                })
            elif u.path == "/api/catalogue":
                slug = data.get("slug", "")
                _, entries = aa.cat_entries()
                if not any(x["slug"] == slug for x in entries):
                    raise ValueError(f"unknown catalogue slug {slug!r}")
                b = aa.cat_write(slug, data.get("values", {}))
                self._json({"ok": True, "backup": b or "keine Änderung"})
            else:
                self._json({"ok": False, "error": "unknown path"}, 404)
        except Exception as e:
            self._json({"ok": False, "error": str(e)}, 400)


def main():
    srv = ThreadingHTTPServer((HOST, PORT), H)
    print(
        f"entrosana UX page editor → http://{HOST}:{PORT}/  "
        f"(classic :8396; token {aa.TOKEN_FILE})"
    )
    srv.serve_forever()


if __name__ == "__main__":
    main()
