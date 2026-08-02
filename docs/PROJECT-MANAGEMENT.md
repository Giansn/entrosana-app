# Hub project management — Claude ingest guide

**Purpose:** read this file end-to-end before changing project, section, or task
behaviour on **entrosana.app**. Do not call the Todoist API. Mirror **structure
and interaction patterns** only; keep localStorage + sealed record trail.

**Code:** `assets/app.js` · `assets/app.css` · page shell `project.html`  
**State key:** `localStorage["entrosana-app:v1"]`  
**Server:** static GET only (`serve.mjs`); all writes are client-side.

---

## 1. Mental model (Todoist-shaped, local-only)

```
Project
 ├── prefs: view_style (list|board), sort (manual|due|priority), show_completed
 ├── sections[]     ordered by section_order; optional
 └── steps[]       tasks (and subtasks)
      ├── section_id → section or null ("No section")
      ├── parent_id  → another step or null (subtask tree, one level UI)
      ├── child_order among siblings (same section_id + parent_id)
      ├── priority   API scale: 1 = lowest … 4 = highest
      ├── due        { date, string, is_recurring, lang, timezone } | null
      ├── labels[]   strings
      ├── checked, completed_at, note, content, description
```

Hub **does not** model workspaces, folders, sharing, or roles.  
Hub **does** write a hash-chained **record** on meaningful actions (add, move, edit, done, …).

### Priority scale (do not invert)

| UI chip | Meaning | Stored `priority` |
|---------|---------|-------------------|
| p1 | highest | 4 |
| p2 | high | 3 |
| p3 | normal | 2 |
| p4 / · | lowest (default) | 1 |

Template CSV uses the **UI** scale (empty = p1). Storage always uses the API scale. Helpers: `uiPrio(s)`, `cyclePriority`, `setPriority`.

---

## 2. What “fully managed” means in this app

| Capability | How it works now | Implementation notes |
|------------|------------------|----------------------|
| Create project | Seed open or own title | `openProject`, `createOwn` |
| Rename project | toolbar “rename” | `record("rename", …)` |
| Sections | “+ section”; drag section headers to reorder | `section_order`; `reorderSections` |
| Empty sections | Always rendered as drop zones | `sec__body` / board columns |
| Add task | Quick-add line | `parseQuick` · `#Section` `@label` `p1–p4` dates `every …` · leading `>` = subtask |
| Complete | Checkbox | Recurring: advance due, stay open (`nextDue`) |
| Priority | Click chip cycles p1→…→p4; context menu sets p1–p4 | List + board |
| Reorder | Drag **handle** (⠿), not whole row | HTML5 DnD on `.grip` only |
| Move section | Drop task on section header or empty body | `dropTask(…, sectionId)` |
| Nest / unnest | Drop on **right half** of row = nest; ↳ / ↰ buttons | `mode === "nest"`; `indent` / `outdent` |
| Sort modes | manual / due / priority | Drag **forces** `sort = "manual"` so order sticks |
| Views | list \| board | `view_style` |
| Hide done | toolbar toggle | `show_completed` |
| Edit | ✎ → quick syntax line | `taskToQuick` / `applyQuick` |
| Delete | ✕ (subs deleted with parent) | `removeTask` |
| Export | Markdown + Todoist CSV template | `markdown`, `toTemplate` |
| Import | CSV template | `fromTemplate` |
| Audit | sealed trail | `record(kind, text, projectSeed)` |

---

## 3. Drag-and-drop contract (keep when changing)

1. **Only `.grip` starts a drag** for tasks (and section headers). Buttons stay clickable.
2. **`dragKind`:** `"task"` | `"section"`. Drop handlers ignore the wrong kind.
3. **Task drop modes on a row:**
   - left/top half → `before`
   - left/bottom half → `after`
   - **right ~38%** → `nest` (become child of target; visual class `drop-nest`)
4. **Drop on section header / empty zone / board column** → top-level in that section (`parent_id = null`).
5. **`ensureManual(p)`** on any reorder that persists `child_order`.
6. **Children follow parent `section_id`** when parent moves.
7. **No self-nest / no cycle:** `isAncestor` guards.
8. Every successful structural change → `record("move"|…)` then `drawProject` + `paintRail`.

Do not reintroduce “drag only if sort === manual” without auto-switching — that made reordering feel broken.

---

## 4. Rendering rules

### List (`renderList`)

- Walk `No section` + `orderedSections(p)`.
- Show **empty** named sections (drop targets).
- Subtasks immediately under parent (one visual level via `step--sub`).
- Grid columns: grip · checkbox · body · actions (+ note on row 2).

### Board (`renderBoard`)

- One column per section (+ No section).
- Cards: grip, checkbox, title, priority button, due, labels, sub-count.
- Empty columns show “Drop here”.

### Toolbar (`toolbar`)

- view_style segment: list | board  
- sort select: manual | due | priority  
- hide/show done · + section · rename  
- Hint text documents drag / nest / priority.

---

## 5. Quick-add grammar (`parseQuick`)

```
[> ] <content>  [#Section]  [@label …]  [p1|p2|p3|p4]  [today|tomorrow|mon..sun|YYYY-MM-DD]  [every day|week|month]
```

- `#name` creates the section if missing.
- `>` nests under the last top-level task.
- Default priority is lowest (API 1 / UI p4).

---

## 6. Storage shape (example)

```json
{
  "created": "2026-08-02T12:00:00.000Z",
  "projects": {
    "tools/000": {
      "id": "tools/000",
      "seed": "tools/000",
      "title": "Set up an auditable back-office",
      "opened": "…",
      "view_style": "list",
      "sort": "manual",
      "show_completed": true,
      "sections": [
        { "id": "sec…", "project_id": "tools/000", "name": "Prep", "section_order": 0 }
      ],
      "steps": [
        {
          "id": "t…",
          "content": "Describe the process",
          "description": "…",
          "priority": 1,
          "due": null,
          "labels": [],
          "parent_id": null,
          "section_id": null,
          "child_order": 0,
          "checked": false,
          "added_at": "…",
          "completed_at": null,
          "note": ""
        }
      ]
    }
  },
  "records": [
    { "t": "…", "kind": "open|add|move|edit|done|…", "text": "…", "project": "tools/000", "h": "<sha256>" }
  ]
}
```

Migration: `normTask` + `migrate()` fill missing fields. Never break old projects.

---

## 7. Record trail kinds used by PM

| kind | When |
|------|------|
| `open` | Project opened / created |
| `add` | Task added |
| `edit` | Content or priority change |
| `move` | Reorder, section change, nest/unnest, section reorder |
| `done` / `undone` | Checkbox (recurring uses `done` with “next date”) |
| `note` | Decision note field |
| `delete` | Task removed |
| `section` | Section created |
| `rename` | Project title |
| `import` | CSV import |
| `reset` | Back to seed |

Seal: `h = sha256(prev_h + "|" + t + "|" + kind + "|" + project + "|" + text)`.

---

## 8. CSS hooks to preserve

| Class | Role |
|-------|------|
| `.grip` | Drag handle only |
| `.drop-before` / `.drop-after` / `.drop-nest` | Drop feedback |
| `.is-dragging` / `.is-over` | Drag state |
| `.prio--1…4` + `.prio--btn` | Priority chip (p4 visible only as button) |
| `.sec__body` / `.sec__empty` | Empty drop zones |
| `.step--sub` | Nested indent |
| `.board` / `.col` / `.card2` | Board view |

---

## 9. Improvement backlog (safe next steps)

When extending further, prefer this order:

1. **Keyboard:** Tab / Shift-Tab for indent/outdent; Alt+↑↓ reorder; 1–4 set priority.  
2. **Pointer/touch polyfill** if mobile drag is required (HTML5 DnD is weak on touch).  
3. **Multi-level nesting** deeper than one parent (data already allows; list renderer is flat one level).  
4. **Due date picker** UI (today data model exists; only quick-add parses dates).  
5. **Filter chips** by label / overdue (views, not new storage).  
6. **Calendar `view_style`** (Todoist third mode) — optional.  
7. **Do not** add server sync without an account design; keep “this device” honest.  
8. **Do not** ship Lehrplan content or Todoist branding as product name.

---

## 10. Test checklist (manual, no API)

Open any project on `/project?p=…` (or create own):

1. Add tasks with `p1`, `@tag`, `#Section`, `tomorrow`, `every week`.  
2. Drag by ⠿ within a section; order persists after reload.  
3. Drag onto another section header / empty body.  
4. Drop on the **right side** of a task → becomes subtask; ↰ undoes.  
5. Click priority chip until p1…p4 cycle; right-click set exact p.  
6. Switch sort to due, then drag → toast “sort set to manual”, order sticks.  
7. Board view: drag between columns.  
8. Drag section headers to reorder.  
9. Export CSV → re-import; structure intact.  
10. Finish a step → record trail gains a sealed line.

---

## 11. Invariants (break these = bug)

- Priority storage is **API scale** (1 low … 4 high).  
- Reorder always updates **sibling** `child_order` only within the same `(section_id, parent_id)`.  
- Completing a recurring task must not leave it checked permanently.  
- Mutations that change meaning of work call **`record(...)`** before claiming success.  
- No network write path for tasks; CSP and `serve.mjs` stay GET-only for the app shell.

---

## 12. File map for agents

| Path | Change when… |
|------|----------------|
| `assets/app.js` | behaviour, model, DnD, quick-add |
| `assets/app.css` | layout of steps, grips, drop marks |
| `assets/seeds.js` / `tools/build.py` | default Hub checklists only |
| `project.html` | chrome only (crumb, export); logic stays in app.js |
| `docs/PROJECT-MANAGEMENT.md` | this contract (update when behaviour changes) |
| `docs/handoff-design.md` | visual system / deploy, not PM logic |

---

*Last updated: 2026-08-02 — Hub PM pass (drag handles, nest drop, priority cycle, empty section zones, section reorder).*
