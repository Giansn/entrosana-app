#!/usr/bin/env python3
"""ACHTUNG (2026-09-08): Die Seiten auf der Platte sind die Quelle. Sie werden von
admin-app.py (:8396) und admin-modules-ux.py (:8397) direkt beschrieben und tragen
SEO-Köpfe, die dieses Skript nicht kennt. Ein Lauf überschreibt acht von neun Seiten
(geprüft mit cmp am 2026-09-08). Vor einem Lauf: in einen Scratch-Ordner bauen und
gegen die Live-Seiten diffen. Nie direkt gegen ~/entrosana-app laufen lassen.

Erzeugt die Seiten von entrosana.app aus einer einzigen Quelle.

Die Leiste, der Kopf und die Saatdateien stehen genau einmal hier. Aufruf:

    python3 tools/build.py

Geschrieben werden die HTML-Seiten im Wurzelverzeichnis und assets/seeds.js.
Der Server liest die Routentabelle beim Start, also nach einer *neuen* Datei
einmal neu starten (docs/handoff-design.md §2).
"""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------- Saatdateien
# Jede Saat ist die Datei, mit der jeder Besucher desselben Abschnitts anfängt.
SEEDS = {
    "tools/000": {
        "section": "tools", "title": "Set up an auditable back-office",
        "who": "for administrative responsibilities and process efficiency",
        "steps": [
            ("Describe the process you want to hand over", "In your own words, the way you would explain it to a new colleague."),
            ("Pick the first routine", "One only: bookings, a payroll run, or document filing."),
            ("Define what a correct result looks like", "Written down before the first run, not after it."),
            ("Decide who reviews, and when", "A named person and a point in the process where they look."),
            ("Run it once by hand and keep the record", "The manual run is the reference the machine is measured against."),
        ]},
    "tools/001": {
        "section": "tools", "title": "Prepare a payroll run",
        "who": "for payroll runs, contracts, and attestations",
        "steps": [
            ("List everyone the run covers", "Including the ones who joined or left mid-month."),
            ("Collect what changed since last month", "Hours, absences, one-off payments."),
            ("Name the source for every figure", "A figure without a source cannot be checked."),
            ("Agree who signs the run off", "One person, before the payment date."),
        ]},
    "tools/002": {
        "section": "tools", "title": "Ask for a second opinion",
        "who": "for second opinions that show their work",
        "steps": [
            ("State the decision you already lean towards", "So the review can disagree with something concrete."),
            ("Write down what would change your mind", "Before you read the answer."),
            ("Attach the numbers the decision rests on", "With their source."),
            ("Record what the review actually said", "Including the parts you did not follow."),
        ]},
    "modules/000": {
        "section": "modules", "title": "Plan a module for your group",
        "who": "social work driven · social skills · community building",
        "steps": [
            ("Choose the area", "Social, nature-based or technical, or say which parts of each."),
            ("Describe the group", "Age, size, and anything that changes how the day has to run."),
            ("Say what they should be able to do afterwards", "One sentence. It decides everything else in the plan."),
            ("Fix the place and what it needs", "Room or forest, travel, materials, and who supplies them."),
            ("Set the dates and the person leading", "A named lead, so the module has someone answerable for it."),
        ]},
    "modules/001": {
        "section": "modules", "title": "Take a group outdoors",
        "who": "nature driven · ecology · outdoor learning",
        "steps": [
            ("Pick the place and walk it first", "Once, before the group ever sees it."),
            ("Write down the weather you would cancel in", "Decided in advance, not on the morning."),
            ("List what each person carries", "Short enough that a parent can read it in one go."),
            ("Name who holds the first-aid kit", "A person, not a rucksack."),
        ]},
    "modules/002": {
        "section": "modules", "title": "Teach how a machine actually works",
        "who": "code · computing · data features",
        "steps": [
            ("Choose one machine the group already uses", "The one in their pocket usually works."),
            ("Find the point where it decides something", "That point is the lesson."),
            ("Make the decision visible without code", "Paper, cards, a whiteboard."),
            ("Let them change the input and watch it turn", "The turn is what they remember."),
        ]},
    "contribute/000": {
        "section": "contribute", "title": "Propose a track",
        "who": "for something you want to build or teach",
        "steps": [
            ("Name the thing you want to build or teach", "Short enough to say out loud in one breath."),
            ("Say who it is for", "A group specific enough that you could name three of them."),
            ("Link what already exists", "Yours or someone else's. If nothing exists, write that down too."),
            ("State what you need from the Hub", "Review, time, compute, hosting, or a person who knows the subject."),
            ("Agree how it gets reviewed", "Who reads it, against what, and when they say yes or no."),
        ]},
    "contribute/001": {
        "section": "contribute", "title": "Review someone else's work",
        "who": "for reading someone else's work carefully",
        "steps": [
            ("Write down what it claims to do", "In your words, before you judge it."),
            ("Check the claim against the thing itself", "Run it, read it, try it on a real case."),
            ("Say plainly where it does not hold", "With the case that breaks it."),
            ("Separate what is wrong from what you would do differently", "Only the first blocks."),
        ]},
    "contribute/002": {
        "section": "contribute", "title": "Ask for runway",
        "who": "for work that needs time and machines",
        "steps": [
            ("Say what the work needs to run", "Compute, hosting, review time, or a person."),
            ("Say for how long", "An end date, even a rough one."),
            ("Show what got through review already", "Runway follows review, not the other way round."),
            ("Name what happens if it is not granted", "Sometimes the honest answer is: nothing changes."),
        ]},
}

ICONS = {
    'tools': '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.40" cy="9.20" r="4.10"/><circle cx="8.40" cy="9.20" r="1.75"/><path d="M11.45 11.94L12.49 12.88"/><path d="M8.61 13.29L8.69 14.69"/><path d="M5.66 12.25L4.72 13.29"/><path d="M4.31 9.41L2.91 9.49"/><path d="M5.35 6.46L4.31 5.52"/><path d="M8.19 5.11L8.11 3.71"/><path d="M11.14 6.15L12.08 5.11"/><path d="M12.49 8.99L13.89 8.91"/><circle cx="14.49" cy="14.69" r="2.90"/><circle cx="14.49" cy="14.69" r="1.25"/><path d="M13.60 11.93L13.17 10.60"/><path d="M16.43 12.53L17.37 11.49"/><path d="M17.33 15.29L18.70 15.58"/><path d="M15.39 17.44L15.82 18.78"/><path d="M12.55 16.84L11.62 17.88"/><path d="M11.66 14.08L10.29 13.79"/></svg>',
    'modules': '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.4 8H6.3A1.55 1.55 0 1 1 9.3 8H11.2V11.95A1.65 1.65 0 0 1 11.2 15.35V18H3.4Z"/><path d="M13.2 8H21V18H13.2V15.35A1.65 1.65 0 0 0 13.2 11.95Z"/></svg>',
    'contribute': '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5.14 9.50A7.3 7.3 0 0 1 18.86 9.50"/><path d="M17.07 10.15L19.89 12.32L20.65 8.85Z" fill="currentColor" stroke="none"/><path d="M18.86 14.50A7.3 7.3 0 0 1 5.14 14.50"/><path d="M6.93 13.85L4.11 11.68L3.35 15.15Z" fill="currentColor" stroke="none"/></svg>',
}

# Werkzeuge, die wirklich laufen. Was nicht läuft, steht hier nicht.
# Keine internen Pfade und keine Ports: die Seite ist öffentlich erreichbar.
REAL_TOOLS = {
    "tools": [
        {"name": "Lehrplan 21 — citation and navigation",
         "who": "reads the Bern cantonal edition, resolves a competence code to its exact wording",
         "state": "running", "cls": "ok",
         "text": "Builds a local index of be.lehrplan.ch and answers from it, so a citation can be "
                 "checked against the source instead of being trusted. Python, standard library only, "
                 "no dependencies.",
         "next": "Not published yet. Once it is on GitHub it becomes reachable as an MCP tool, "
                 "so an assistant can cite the curriculum without a human copying text across."},
        {"name": "Lehrplan 21 data interface — stand-in",
         "who": "lets the import be built before access to the official interface is granted",
         "state": "running", "cls": "ok",
         "text": "A stand-in for the official data interface, with fixed test data and an acceptance "
                 "script that says plainly whether the import still matches.",
         "next": "Access to the official interface has been requested. The stand-in stays afterwards, "
                 "as the thing the real interface is measured against."},
    ],
}

SECTIONS = {
    "tools": ("Tools", "▣", "What actually runs, starting with the Lehrplan 21 citation tool.",
              "Routine work handed to a machine, on the condition that every figure stays traceable to "
              "where it came from. Two tools run today. Everything else in this section is a checklist, "
              "and says so."),
    "modules": ("Modules", "◫", "Human-led lessons, adapted to the school and the age group.",
                "Taught by people, in different depths, for the school and the age group that asks for them."),
    "contribute": ("Contribute", "◇", "Propose a track, review someone's work, take a place on the runway.",
                   "The Hub is open to students, parents, teachers and outside contributors, under AGPL-3.0."),
}

# ---------------------------------------------------------------- Zeichen (§5)
PATHS = re.findall(r'<path[^>]*d="([^"]+)"', (ROOT / "assets/mark.svg").read_text(encoding="utf-8"))
assert len(PATHS) == 2, "mark.svg soll genau zwei Pfade haben"
MARK = ('<svg class="brand__logo" viewBox="0 0 100 100" aria-hidden="true">'
        + "".join(f'<path fill="currentColor" d="{d}"/>' for d in PATHS) + "</svg>")


def rail(active, variant="hub"):
    def item(href, key, glyph, label, count="", cid=""):
        cls = "rail__item is-active" if key == active else "rail__item"
        cur = ' aria-current="page"' if key == active else ""
        c = f' <span class="rail__count"{f" id={cid}" if cid else ""}>{count}</span>' if count or cid else ""
        return f'    <a class="{cls}" href="{href}"{cur}><span class="rail__glyph">{glyph}</span> {label}{c}</a>'

    out = ['  <aside class="rail seam">',
           f'    <a class="brand rail__brand" href="/" aria-label="entrosana, workspace">{MARK}'
           f'<span class="brand__word">entrosana</span></a>',
           '    <div class="rail__rule"></div>', '',
           item("/", "home", """<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.3" y="4.5" width="17.4" height="15" rx="2.2"/><path d="M3.3 9.3h17.4"/></svg>""", "Workspace"),
           item("/projects", "overview", """<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.6" y="3.6" width="7.1" height="7.1" rx="1.7"/><rect x="13.3" y="3.6" width="7.1" height="7.1" rx="1.7"/><rect x="3.6" y="13.3" width="7.1" height="7.1" rx="1.7"/><rect x="13.3" y="13.3" width="7.1" height="7.1" rx="1.7"/></svg>""", "Projects"),
           item("/services", "services",
                '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" '
                'stroke="currentColor" stroke-width="1.4" stroke-linecap="round" '
                'stroke-linejoin="round"><path d="M4.2 12H15.4"/>'
                '<path d="M14.9 8.2L20.4 12L14.9 15.8Z" fill="currentColor" stroke="none"/></svg>',
                "Running Services", "", "svc-count"),
           '', '    <div class="rail__group">Sections</div>']
    for key, (label, glyph, _, _) in SECTIONS.items():
        n = sum(1 for s in SEEDS.values() if s["section"] == key)
        out.append(item(f"/{key}", key, ICONS.get(key, glyph), label, str(n)))
    if variant == "project":
        # Die Projektseite beherbergt die Kopie aus ~/entrosana-todo-demo.
        # Deren JS sucht #projects, #filters und #btn-add-project, also stehen
        # sie hier an derselben Stelle wie sonst die Liste des Hubs.
        out += ['', '    <div class="rail__group rail__group--act">Projects'
                '<button class="iconbtn rail__plus" type="button" id="btn-add-project"'
                ' title="Add project">+</button></div>',
                '    <nav class="nav__projects" id="projects"></nav>',
                '', '    <div class="rail__group">Lanes</div>',
                '    <nav class="nav__filters" id="filters"></nav>',]
    else:
        # Dieselbe Quelle wie auf der Verwaltungsseite, damit die Leiste nicht
        # je nach Seite andere Projekte zeigt. Gefuellt von rail-projects.js.
        out += ['', '    <div class="rail__group rail__group--act">Projects'
                '<a class="rail__plus" href="/project" title="New project"'
                ' aria-label="New project">+</a></div>',
                '    <nav class="nav__projects" id="projects"></nav>',]
    out += [
            '', '    <div class="rail__group">Record trail</div>',
            item("/records", "records", """<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.3"/><path d="M12 7.3V12l3.1 1.9"/></svg>""", "All records", "", "rec-count"),
            item("/records?when=today", "today", """<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.7" y="5.3" width="16.6" height="15" rx="2.2"/><path d="M3.7 9.9h16.6M8.3 3.5v3.2M15.7 3.5v3.2"/><circle cx="12" cy="14.9" r="1.45" fill="currentColor" stroke="none"/></svg>""", "Today", "", "rec-today"),
            '    <a class="rail__item" href="#" data-act="verify"><span class="rail__glyph"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.3"/><path d="M8.3 12.3l2.6 2.5 4.9-5.3"/></svg></span> Verify chain</a>',
            '    <a class="rail__item" href="#" data-act="export"><span class="rail__glyph"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10.2"/><path d="M8.3 10.6L12 14.3l3.7-3.7"/><path d="M4.8 16.3v2.1a1.7 1.7 0 0 0 1.7 1.7h11a1.7 1.7 0 0 0 1.7-1.7v-2.1"/></svg></span> Export trail</a>',
            '', '    <div class="rail__foot">', '      <div class="rail__acct">',
            '        <span class="rail__avatar">?</span>', '        <span>',
            '          <span class="rail__acctname">Not signed in</span>',
            '          <span class="rail__acctsub">local device only</span>',
            '        </span>', '      </div>', '    </div>', '  </aside>']
    return "\n".join(out)


def page(name, title, active, crumb, body, actions=""):
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/assets/mark.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/app.css">
<script src="/assets/theme.js"></script>
</head>
<body>
<a class="vh" href="#main">Skip to content</a>
<div class="app">

{rail(active)}
  <!-- Fuellt die Projektliste noch waehrend des Parsens: sonst zeichnet der
       Browser die leere Gruppe und die Leiste springt bei jedem Wechsel. -->
  <script src="/assets/services.js"></script>
  <script src="/assets/rail-projects.js"></script>

  <main id="main">
    <header class="top">
      <span class="crumb">{crumb}</span>
      <span class="search">⌕ Search is not built yet <kbd>⌘K</kbd></span>
      <button class="iconbtn" type="button" data-theme-toggle aria-label="Dark or light">◐</button>
      {actions}
    </header>
    <div class="work">
{body}
    </div>
  </main>

</div>

<dialog class="pick" id="pick">
  <div class="pick__box">
    <span class="eyebrow">New project</span>
    <p class="h3">Start from the Hub, or from nothing.</p>
    <div id="pick-seeds"></div>
    <div class="field">
      <label for="pick-own">Or your own title</label>
      <input id="pick-own" type="text" placeholder="What is the project called?">
      <span class="help">An empty file with your name on it. Steps are added as you go, and every
        one of them leaves the same record as a Hub file does.</span>
    </div>
    <div class="actions">
      <button class="btn" type="button" data-act="new-own">Create</button>
      <button class="btn btn--ghost" type="button" data-act="pick-close">Cancel</button>
    </div>
  </div>
</dialog>

<script src="/assets/seeds.js"></script>
<script src="/assets/services.js"></script>
<script src="/assets/app.js"></script>
</body>
</html>
"""
    (ROOT / name).write_text(html, encoding="utf-8")
    return name, len(html)


def build():
    written = []

    # ---- seeds.js: einzige Quelle für die Anwendung
    js = "window.__seeds = " + json.dumps(
        {k: {"section": v["section"], "title": v["title"], "who": v["who"],
             "steps": [{"t": t, "n": n} for t, n in v["steps"]]} for k, v in SEEDS.items()},
        ensure_ascii=False, indent=1) + ";\n"
    (ROOT / "assets/seeds.js").write_text(js, encoding="utf-8")
    written.append(("assets/seeds.js", len(js)))

    # ---- Arbeitsfläche
    tiles = "\n".join(
        f"""          <a class="card tile" href="/{key}">
            <div class="tile__glyph">{ICONS.get(key, glyph)}</div>
            <p class="h3">{label}</p>
            <p>{blurb}</p>
            <div class="tile__foot">{sum(1 for s in SEEDS.values() if s['section'] == key)} starting files
              <span class="tile__go">Open &rarr;</span></div>
          </a>""" for key, (label, glyph, blurb, _) in SECTIONS.items())

    written.append(page("index.html", "Workspace", "home", "<b>Workspace</b>", f"""      <section class="block hair">
        <span class="eyebrow">Pick up where you stopped</span>
        <h1 class="work__h" id="greeting">Welcome.</h1>
        <p class="work__sub" id="lede">Nothing open yet. Every section has a file you can start from.</p>
        <div id="resume"></div>
      </section>

      <section class="block hair">
        <span class="eyebrow">Start something</span>
        <div class="grid">
{tiles}
        </div>
      </section>

      <section class="block hair">
        <span class="eyebrow">The record</span>
        <div class="split">
          <div>
            <p class="work__sub work__sub--narrow">Every step you finish writes one line, and each
              line is sealed against the one before it. Recomputing the chain is what makes it a record
              rather than a list.</p>
            <p class="note note--idle" id="chain-note">Nothing recorded yet.</p>
          </div>
          <div id="chain-receipt"></div>
        </div>
      </section>"""))

    # ---- Abschnitte
    for key, (label, glyph, blurb, lede) in SECTIONS.items():
        cards = "\n".join(
            f"""          <article class="card">
            <p class="h3">{s['title']}</p>
            <span class="tool__who">{s['who']}</span>
            <p class="muted fine">{len(s['steps'])} steps &middot; seed <span class="mono">{sid}</span></p>
            <a class="btn" href="/project?p={sid}">Open project</a>
          </article>""" for sid, s in SEEDS.items() if s["section"] == key)

        real = ""
        if REAL_TOOLS.get(key):
            items = "\n".join(
                f"""          <article class="card">
            <div class="tool__head"><p class="h3">{t['name']}</p>
              <span class="note note--{t['cls']}"><span class="led"></span> {t['state']}</span></div>
            <span class="tool__who">{t['who']}</span>
            <p>{t['text']}</p>
            <p class="muted fine--tight">{t['next']}</p>
          </article>""" for t in REAL_TOOLS[key])
            real = f"""
      <section class="block hair">
        <span class="eyebrow">What actually runs</span>
        <p class="work__sub work__sub--wide">Only tools that are running are listed here. Anything
          still being talked about is not on this page.</p>
        <div class="grid grid--2">
{items}
        </div>
      </section>
"""

        written.append(page(f"{key}.html", label, key, f"<b>{label}</b>", f"""      <section class="block hair">
        <span class="eyebrow">{label}</span>
        <h1 class="work__h">{blurb}</h1>
        <p class="work__sub work__sub--wide">{lede}</p>
      </section>
{real}
      <section class="block hair">
        <span class="eyebrow">Checklists you can start from</span>
        <p class="work__sub">These are checklists, not software. Every visitor opens the same one, and
          opening it makes a copy that is yours.</p>
        <div class="grid">
{cards}
        </div>
      </section>"""))

    # ---- Projektdatei: NICHT erzeugen.
    # project.html beherbergt die Kopie aus ~/entrosana-todo-demo und wird
    # von Hand gepflegt. Wer sie hier wieder erzeugt, überschreibt die Demo.


    # ---- Aufzeichnungsspur
    written.append(page("records.html", "Record trail", "records", "<b>Record trail</b>",
                        """      <section class="block hair">
        <span class="eyebrow">What this device recorded</span>
        <h1 class="work__h">Record trail.</h1>
        <p class="work__sub">Append-only. Each line is sealed against the one before it.</p>
        <div id="trail"></div>
      </section>"""))

    # ---- Dienste
    written.append(page("services.html", "Running services", "services", "<b>Running Services</b>",
                        """      <section class="block hair">
        <span class="eyebrow">What is actually up</span>
        <h1 class="work__h">Running services.</h1>
        <p class="work__sub">Read from the machine by <span class="mono">tools/services-snapshot.sh</span>,
          not from a config file.</p>
        <div id="services"></div>
      </section>"""))

    return written



def patch_handmade(name, active, variant):
    """Schreibt nur den Leistenblock in eine von Hand gepflegte Seite.

    project.html beherbergt die Kopie aus ~/entrosana-todo-demo, projects.html
    die Uebersicht. Beide werden sonst nicht erzeugt. Ersetzt wird
    ausschliesslich der Bereich zwischen <aside class="rail seam"> und
    </aside>, damit Kopf, Skripte und Koerper unangetastet bleiben.
    """
    p = ROOT / name
    if not p.exists():
        return None
    t = p.read_text(encoding="utf-8")
    block = re.search(r'  <aside class="rail seam">.*?  </aside>', t, re.S)
    if not block:
        return None
    neu = rail(active, variant)
    if block.group(0) != neu:
        p.write_text(t[:block.start()] + neu + t[block.end():], encoding="utf-8")
    return (name, len(p.read_text(encoding="utf-8")))


if __name__ == "__main__":
    for name, n in build():
        print(f"{name:24} {n:6} B")
    for name, active, variant in [("project.html", "", "project"),
                                  ("projects.html", "overview", "hub")]:
        r = patch_handmade(name, active, variant)
        if r:
            print(f"{r[0]:24} {r[1]:6} B   (nur die Leiste ersetzt)")
