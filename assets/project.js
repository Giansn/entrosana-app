/* Vertical sections (workflow lanes) + drag between them.
 * Default: list stacked top→bottom
 *   Pending
 *   In progress
 *   To be audited
 *   Done
 * Drag a task onto another section to move it.
 * Board = same sections side-by-side (optional).
 */
(function () {
  "use strict";
  var KEY = "entrosana-todo-demo:v3";

  // Fixed workflow sections — vertical lanes
  var LANES = [
    { id: "pending",     name: "Pending",        color: "#8F95A1" },
    { id: "in_progress", name: "In progress",    color: "#2BD4E8" },
    { id: "audit",       name: "To be audited",  color: "#7FE7F3" },
    { id: "done",        name: "Done",           color: "#2FB89E" }
  ];

  var drag = { id: null };

  function uid(p) { return (p || "x") + Math.random().toString(36).slice(2, 9); }
  // Fälligkeit in Worten: heute, morgen, in n Tagen, n Tage überfällig.
  function dueWord(date) {
    var t0 = new Date(today() + "T00:00:00Z").getTime(), t1 = new Date(date + "T00:00:00Z").getTime(), n = Math.round((t1 - t0) / 86400e3);
    if (n === 0) return { text: "due today", today: true, over: false };
    if (n === 1) return { text: "due tomorrow", today: false, over: false };
    if (n < 0) return { text: (-n) + (n === -1 ? " day overdue" : " days overdue"), today: false, over: true };
    return { text: n <= 14 ? "due in " + n + " days" : "due " + date, today: false, over: false };
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
  }
  function uiPrio(t) { return 5 - (t.priority || 1); }
  function laneOf(task) {
    var id = task.section_id || task.status || "pending";
    if (LANES.some(function (l) { return l.id === id; })) return id;
    return task.checked ? "done" : "pending";
  }
  function laneMeta(id) {
    return LANES.filter(function (l) { return l.id === id; })[0] || LANES[0];
  }

  function taskObj(o) {
    var sec = o.section_id || o.status || "pending";
    if (!LANES.some(function (l) { return l.id === sec; })) sec = "pending";
    return {
      id: o.id,
      content: o.content || "",
      description: o.description || "",       // short blurb on the card
      instructions: o.instructions || "",     // longer detail in the popup
      priority: o.priority != null ? o.priority : 1,
      section_id: sec,
      parent_id: o.parent_id || null,
      order: o.order != null ? o.order : 0,
      labels: o.labels || [],
      due: o.due || null,
      checked: sec === "done" || !!o.checked,
      completed_at: o.completed_at || null
    };
  }

  function ensureLanes(p) {
    // Project always has the four workflow sections in order
    p.sections = LANES.map(function (l, i) {
      return { id: l.id, name: l.name, order: i, color: l.color, fixed: true };
    });
  }

  function seed() {
    var p = {
      id: "demo",
      name: "Demo project",
      color: "#2BD4E8",
      view: "board",
      sort: "manual",
      showDone: true,
      sections: [],
      tasks: [
        taskObj({
          id: "a", content: "Drag this card into In progress",
          description: "Try dragging by the ⠿ handle into the next column.",
          instructions: "1. Grab the drag handle on the left rail.\n2. Drop the card on In progress.\n3. The status dropdown should update to match.",
          priority: 4, section_id: "pending", order: 0
        }),
        taskObj({
          id: "a2", content: "Set priority with the coloured flag",
          description: "Square p# changes priority — not the circle.",
          instructions: "Click the coloured flag (p1–p4) to cycle:\n• p1 red = highest\n• p2 orange\n• p3 blue\n• p4 grey = lowest\n\nThe circle tick only marks Done.",
          priority: 3, section_id: "pending", order: 1
        }),
        taskObj({
          id: "b", content: "I'm being worked on",
          description: "Short description stays on the card.",
          instructions: "Open Details for longer step-by-step instructions without crowding the board.",
          priority: 3, section_id: "in_progress", order: 0
        }),
        taskObj({
          id: "c", content: "Ready for audit / review",
          description: "Hand off for review before Done.",
          instructions: "Checklist for the auditor:\n• Title is clear\n• Description is accurate\n• Priority is correct\n• Evidence attached if needed",
          priority: 2, section_id: "audit", order: 0,
          labels: ["demo"], due: { date: today(), string: "today", is_recurring: false }
        }),
        taskObj({ id: "d", content: "Already finished", description: "Completed example.", priority: 1, section_id: "done", order: 0, checked: true })
      ]
    };
    ensureLanes(p);
    return { active: "demo", projects: { demo: p } };
  }

  function migrate(raw) {
    if (!raw || !raw.projects) return seed();
    Object.keys(raw.projects).forEach(function (id) {
      var p = raw.projects[id];
      ensureLanes(p);
      if (!p.view) p.view = "board";
      (p.tasks || []).forEach(function (t, i) {
        // map old status field → section
        if (t.status && LANES.some(function (l) { return l.id === t.status; })) {
          t.section_id = t.status;
        }
        if (!t.section_id || !LANES.some(function (l) { return l.id === t.section_id; })) {
          t.section_id = t.checked ? "done" : "pending";
        }
        if (t.order == null) t.order = i;
        if (t.priority == null) t.priority = 1;
        if (!t.labels) t.labels = [];
        if (t.description == null) t.description = "";
        if (t.instructions == null) t.instructions = "";
        t.checked = t.section_id === "done";
      });
    });
    return raw;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return migrate(JSON.parse(raw));
      var v2 = localStorage.getItem("entrosana-todo-demo:v2");
      if (v2) return migrate(JSON.parse(v2));
      var v1 = localStorage.getItem("entrosana-todo-demo:v1");
      if (v1) return migrate(JSON.parse(v1));
    } catch (e) {}
    return seed();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  var state = load();

  function project() { return state.projects[state.active] || null; }
  function sections(p) {
    ensureLanes(p);
    return p.sections.slice().sort(function (a, b) { return a.order - b.order; });
  }
  function sortList(list, mode) {
    var a = list.slice();
    if (mode === "priority") a.sort(function (x, y) { return y.priority - x.priority || x.order - y.order; });
    else if (mode === "due") a.sort(function (x, y) {
      var dx = x.due ? x.due.date : "9999", dy = y.due ? y.due.date : "9999";
      return dx < dy ? -1 : dx > dy ? 1 : x.order - y.order;
    });
    else a.sort(function (x, y) { return x.order - y.order; });
    return a;
  }
  function tops(p, secId) {
    var list = p.tasks.filter(function (x) {
      return !x.parent_id && laneOf(x) === secId;
    });
    if (!p.showDone && secId === "done") return [];
    return sortList(list, p.sort);
  }
  function kids(p, parentId) {
    return sortList(p.tasks.filter(function (x) { return x.parent_id === parentId; }), "manual");
  }
  function progress(p) {
    var top = p.tasks.filter(function (x) { return !x.parent_id; });
    var done = top.filter(function (x) { return laneOf(x) === "done"; }).length;
    return done + "/" + top.length;
  }
  function reindex(group) { group.forEach(function (x, i) { x.order = i; }); }
  // UI p1 = highest (red) … p4 = lowest (grey). Stored as API scale 4…1.
  function cyclePriority(p, task) {
    var ui = uiPrio(task);
    var next = ui >= 4 ? 1 : ui + 1;
    task.priority = 5 - next;
    save(); paint();
    toast("Priority p" + next);
  }

  function moveToSection(p, task, sectionId, beforeTask, after) {
    task.section_id = sectionId;
    task.checked = sectionId === "done";
    task.completed_at = task.checked ? (task.completed_at || new Date().toISOString()) : null;
    task.parent_id = null; // top-level when changing lane
    var group = p.tasks.filter(function (x) {
      return x !== task && !x.parent_id && laneOf(x) === sectionId;
    }).sort(function (a, b) { return a.order - b.order; });
    if (beforeTask && beforeTask !== task && laneOf(beforeTask) === sectionId) {
      var i = group.indexOf(beforeTask);
      if (i < 0) i = group.length;
      group.splice(after ? i + 1 : i, 0, task);
    } else {
      group.push(task);
    }
    reindex(group);
  }

  /* Eigenes Eingabefenster statt prompt(): der Browserdialog gehoert dem
   * Browser, nicht der Seite. Gleiche Form wie das Details-Fenster.
   * Asynchron, deshalb bekommt jeder Aufrufer einen Rueckruf. */
  function ask(frage, vorgabe, weiter) {
    var alt = document.getElementById("ask-modal");
    if (alt) alt.remove();
    var back = el("div", "modal-back");
    back.id = "ask-modal";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-modal", "true");
    var box = el("div", "modal modal--ask");
    box.addEventListener("click", function (ev) { ev.stopPropagation(); });

    var head = el("div", "modal__head");
    head.appendChild(el("h2", "modal__title", frage));
    var x = el("button", "modal__x", "\u2715");
    x.type = "button"; x.title = "Close";
    box.appendChild(head);

    var inp = el("input", "modal__input");
    inp.type = "text";
    inp.value = vorgabe || "";
    box.appendChild(inp);

    var foot = el("div", "modal__foot");
    var cancel = el("button", "btn-cancel", "Cancel");
    cancel.type = "button";
    var ok = el("button", "btn-primary", "Create");
    ok.type = "button";
    foot.appendChild(cancel); foot.appendChild(ok);
    box.appendChild(foot);
    head.appendChild(x);

    function close() {
      document.removeEventListener("keydown", onKey);
      back.remove();
    }
    function onKey(ev) {
      if (ev.key === "Escape") close();
      if (ev.key === "Enter" && document.activeElement === inp) submit();
    }
    function submit() {
      var v = inp.value.trim();
      if (!v) { inp.focus(); return; }
      close();
      weiter(v);
    }
    x.addEventListener("click", close);
    cancel.addEventListener("click", close);
    back.addEventListener("click", close);
    ok.addEventListener("click", submit);

    back.appendChild(box);
    document.body.appendChild(back);
    document.addEventListener("keydown", onKey);
    setTimeout(function () { inp.focus(); inp.select(); }, 0);
  }

  function toast(msg) {
    var n = document.getElementById("toast");
    if (!n) {
      n = document.createElement("div");
      n.id = "toast"; n.className = "toast"; document.body.appendChild(n);
    }
    n.textContent = msg;
    n.classList.add("on");
    clearTimeout(n._t);
    n._t = setTimeout(function () { n.classList.remove("on"); }, 2000);
  }

  /** Modal: short description + longer step-by-step instructions */
  function openDetails(p, task) {
    closeDetails();
    var backdrop = el("div", "modal-back");
    backdrop.id = "task-modal";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Task details");

    var box = el("div", "modal");
    box.addEventListener("click", function (ev) { ev.stopPropagation(); });

    var head = el("div", "modal__head");
    head.appendChild(el("h2", "modal__title", task.content || "Task"));
    var x = el("button", "modal__x", "✕");
    x.type = "button";
    x.title = "Close";
    x.addEventListener("click", closeDetails);
    head.appendChild(x);
    box.appendChild(head);

    var meta = el("p", "modal__meta",
      laneMeta(laneOf(task)).name + " · priority p" + uiPrio(task));
    box.appendChild(meta);

    // Title edit
    box.appendChild(el("label", "modal__label", "Title"));
    var titleIn = el("input", "modal__input");
    titleIn.type = "text";
    titleIn.value = task.content;
    titleIn.placeholder = "Task title";
    box.appendChild(titleIn);

    // Short description (shown on card)
    box.appendChild(el("label", "modal__label", "Description (on card)"));
    var descIn = el("textarea", "modal__area");
    descIn.rows = 3;
    descIn.value = task.description || "";
    descIn.placeholder = "Short summary visible on the board card…";
    box.appendChild(descIn);

    // Detailed instructions (popup only)
    box.appendChild(el("label", "modal__label", "Detailed instructions"));
    var instIn = el("textarea", "modal__area modal__area--tall");
    instIn.rows = 10;
    instIn.value = task.instructions || "";
    instIn.placeholder = "Step-by-step instructions, checklist, links, notes for the person doing the work…";
    box.appendChild(instIn);

    // Fälligkeit (2026-09-09): Datum setzen oder leeren; die Karte zeigt es als Pille.
    box.appendChild(el("label", "modal__label", "Due date"));
    var dueRow = el("div", "modal__row");
    var dueIn = el("input", "modal__input modal__input--date"); dueIn.type = "date"; dueIn.value = task.due && task.due.date ? task.due.date : "";
    var dueClear = el("button", "btn-cancel", "Clear"); dueClear.type = "button"; dueClear.addEventListener("click", function () { dueIn.value = ""; });
    dueRow.appendChild(dueIn); dueRow.appendChild(dueClear); box.appendChild(dueRow);

    var foot = el("div", "modal__foot");
    var cancel = el("button", "btn-cancel", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", closeDetails);
    var saveBtn = el("button", "btn-primary", "Save");
    saveBtn.type = "button";
    saveBtn.addEventListener("click", function () {
      var t = titleIn.value.trim();
      if (!t) { toast("Title can’t be empty"); return; }
      task.content = t;
      task.description = descIn.value.trim();
      task.instructions = instIn.value; // keep internal newlines
      task.due = dueIn.value ? { date: dueIn.value, string: dueIn.value, is_recurring: false } : null;
      save();
      closeDetails();
      paint();
      toast("Details saved");
    });
    foot.appendChild(cancel);
    foot.appendChild(saveBtn);
    box.appendChild(foot);

    backdrop.appendChild(box);
    backdrop.addEventListener("click", closeDetails);
    document.body.appendChild(backdrop);
    document.addEventListener("keydown", onModalKey);
    setTimeout(function () { descIn.focus(); }, 0);
  }
  function onModalKey(ev) {
    if (ev.key === "Escape") closeDetails();
  }
  function closeDetails() {
    document.removeEventListener("keydown", onModalKey);
    var m = document.getElementById("task-modal");
    if (m) m.remove();
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clearMarks() {
    document.querySelectorAll(".drop-before,.drop-after,.is-over,.is-dragging,.sec--over").forEach(function (n) {
      n.classList.remove("drop-before", "drop-after", "is-over", "is-dragging", "sec--over");
    });
  }

  /* ---------- parse ---------- */
  function parseQuick(raw, p) {
    var text = raw;
    var out = { content: "", priority: 1, labels: [], section_id: null, due: null };
    text = text.replace(/\b(pending|in.?progress|doing|audit|review|done)\b/i, function (m) {
      var k = m.toLowerCase().replace(/\s+/g, "");
      if (k === "pending") out.section_id = "pending";
      else if (k === "inprogress" || k === "doing") out.section_id = "in_progress";
      else if (k === "audit" || k === "review") out.section_id = "audit";
      else if (k === "done") out.section_id = "done";
      return " ";
    });
    text = text.replace(/\bp([1-4])\b/i, function (_, n) { out.priority = 5 - (+n); return " "; });
    text = text.replace(/@([^\s@#]+)/g, function (_, l) { out.labels.push(l); return " "; });
    text = text.replace(/\b(\d{4}-\d{2}-\d{2})\b/, function (_, d) {
      out.due = { date: d, string: d, is_recurring: false }; return " ";
    });
    if (!out.due) text = text.replace(/\b(today|tomorrow)\b/i, function (_, w) {
      var d = new Date();
      if (w.toLowerCase() === "tomorrow") d.setDate(d.getDate() + 1);
      var iso = d.toISOString().slice(0, 10);
      out.due = { date: iso, string: w.toLowerCase(), is_recurring: false };
      return " ";
    });
    out.content = text.replace(/\s+/g, " ").trim();
    return out;
  }

  /* ---------- paint ---------- */
  function paint() {
    paintNav();
    var main = document.getElementById("main");
    main.textContent = "";
    var p = project();
    if (!p) {
      main.appendChild(el("div", "view", "No project."));
      return;
    }
    ensureLanes(p);
    var view = el("div", "view");
    view.appendChild(head(p));
    if (p.view === "board") { var board = boardView(p); view.appendChild(laneBar(p, board)); view.appendChild(board); }
    else view.appendChild(listView(p));
    view.appendChild(addBar(p));
    main.appendChild(view);
  }

  function paintNav() {
    var filters = document.getElementById("filters");
    var projects = document.getElementById("projects");
    if (!filters || !projects) return;

    filters.textContent = "";
    // jump-to-section anchors (vertical structure)
    var p = project();
    LANES.forEach(function (lane) {
      var n = 0;
      if (p) n = p.tasks.filter(function (t) { return !t.parent_id && laneOf(t) === lane.id; }).length;
      var b = el("button", "navitem" + (state.focus === lane.id ? " is-on" : ""));
      b.type = "button";
      var ico = el("span", "ico");
      ico.textContent = "≡";
      b.appendChild(ico);
      b.appendChild(document.createTextNode(lane.name));
      b.appendChild(el("span", "cnt", n ? String(n) : ""));
      b.addEventListener("click", function () {
        state.focus = state.focus === lane.id ? null : lane.id;
        save(); paint();
        if (state.focus) {
          setTimeout(function () {
            var eln = document.getElementById("sec-" + state.focus);
            if (eln) eln.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 50);
        }
      });
      filters.appendChild(b);
    });

    projects.textContent = "";
    Object.keys(state.projects).forEach(function (id) {
      var pr = state.projects[id];
      // Abweichung vom Original: abgelegte Projekte stehen nicht in der
      // Leiste, sondern im Archiv auf /projects. Das gerade offene bleibt
      // sichtbar, sonst zeigt die Leiste nicht, wo man sich befindet.
      if (pr.is_archived && id !== state.active) return;
      var b = el("button", "navitem" + (id === state.active ? " is-on" : ""));
      b.type = "button";
      b.appendChild(el("span", "pdot"));
      b.appendChild(el("span", "navitem__t", pr.name));
      b.appendChild(el("span", "cnt", progress(pr)));
      b.addEventListener("click", function () {
        state.active = id; state.focus = null; save(); paint();
      });
      projects.appendChild(b);
    });
  }

  function head(p) {
    var h = el("div", "view__head");
    var title = el("h1", "view__title");
    title.appendChild(el("span", "view__hash", "#"));
    var inp = el("input");
    inp.value = p.name;
    inp.addEventListener("change", function () {
      p.name = inp.value.trim() || p.name; save(); paintNav();
    });
    title.appendChild(inp);
    h.appendChild(title);

    var tools = el("div", "view__tools");
    var seg = el("div", "seg");
    [["list", "List"], ["board", "Board"]].forEach(function (v) {
      var b = el("button", p.view === v[0] ? "is-on" : "", v[1]);
      b.type = "button";
      b.addEventListener("click", function () { p.view = v[0]; save(); paint(); });
      seg.appendChild(b);
    });
    tools.appendChild(seg);

    var sel = el("select");
    [["manual", "Manual order"], ["priority", "Priority"], ["due", "Due date"]].forEach(function (o) {
      var op = el("option", null, o[1]); op.value = o[0];
      if (p.sort === o[0]) op.selected = true;
      sel.appendChild(op);
    });
    sel.addEventListener("change", function () { p.sort = sel.value; save(); paint(); });
    tools.appendChild(sel);

    var hide = el("button", "ghost", p.showDone ? "Hide done" : "Show done");
    hide.type = "button";
    hide.addEventListener("click", function () { p.showDone = !p.showDone; save(); paint(); });
    tools.appendChild(hide);

    h.appendChild(tools);
    return h;
  }

  /* ===== VERTICAL SECTIONS (primary) ===== */
  function listView(p) {
    var wrap = el("div", "lanes");
    sections(p).forEach(function (sec) {
      if (sec.id === "done" && !p.showDone) return;
      if (state.focus && state.focus !== sec.id) return;

      var block = el("section", "sec sec--" + sec.id);
      block.id = "sec-" + sec.id;

      var h = el("div", "sec__h");
      var badge = el("span", "sec__badge");
      badge.setAttribute("data-lane", sec.id);
      h.appendChild(badge);
      h.appendChild(el("span", "sec__name", sec.name));
      var mine = tops(p, sec.id);
      h.appendChild(el("span", "sec__n", String(mine.length)));
      // collapse toggle
      var chev = el("button", "sec__chev", "▾");
      chev.type = "button";
      chev.title = "Collapse section";
      chev.addEventListener("click", function () {
        block.classList.toggle("is-collapsed");
        chev.textContent = block.classList.contains("is-collapsed") ? "▸" : "▾";
      });
      h.insertBefore(chev, h.firstChild);
      block.appendChild(h);

      var body = el("div", "sec__body");
      body.dataset.section = sec.id;
      wireSectionDrop(body, block, p, sec.id);

      if (!mine.length) {
        body.appendChild(el("div", "sec__empty", "Drop tasks here · or add below"));
      }
      mine.forEach(function (task) {
        body.appendChild(taskRow(p, task, false));
        kids(p, task.id).forEach(function (c) {
          body.appendChild(taskRow(p, c, true));
        });
      });

      // add in this section
      var add = el("button", "sec__add", "+ Add task");
      add.type = "button";
      add.addEventListener("click", function () {
        openInlineAdd(body, p, sec.id);
      });
      body.appendChild(add);

      block.appendChild(body);
      wrap.appendChild(block);
    });
    return wrap;
  }

  function openInlineAdd(body, p, sectionId) {
    if (body.querySelector(".inline-add")) return;
    var box = el("div", "inline-add");
    var inp = el("input");
    inp.type = "text";
    inp.placeholder = "Task name · Enter to add · Esc cancel";
    var row = el("div", "inline-add__row");
    var ok = el("button", "btn-primary", "Add task");
    ok.type = "button";
    var cancel = el("button", "btn-cancel", "Cancel");
    cancel.type = "button";
    function commit() {
      var q = parseQuick(inp.value, p);
      if (!q.content) return;
      p.tasks.push(taskObj({
        id: uid("t"), content: q.content, priority: q.priority,
        labels: q.labels, due: q.due,
        section_id: q.section_id || sectionId,
        order: p.tasks.length
      }));
      save(); paint(); toast("Added");
    }
    ok.addEventListener("click", commit);
    cancel.addEventListener("click", function () { box.remove(); });
    inp.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") commit();
      if (ev.key === "Escape") box.remove();
    });
    box.appendChild(inp);
    row.appendChild(ok);
    row.appendChild(cancel);
    box.appendChild(row);
    body.insertBefore(box, body.querySelector(".sec__add"));
    inp.focus();
  }

  /* Bahnenleiste für Telefone (2026-09-08): ein Tipp rollt das Brett zur Bahn,
     die sichtbare Bahn ist markiert. Auf dem Schreibtisch versteckt (CSS). */
  function laneBar(p, board) {
    var bar = el("div", "lanebar");
    var lanes = sections(p).filter(function (s) { return s.id !== "done" || p.showDone; });
    lanes.forEach(function (sec) {
      var b = el("button", "lanebar__b", sec.name + " "); b.type = "button"; b.dataset.section = sec.id;
      b.appendChild(el("span", "lanebar__n", String(tops(p, sec.id).length)));
      b.addEventListener("click", function () {
        var col = board.querySelector('.col[data-section="' + sec.id + '"]');
        if (col) col.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      });
      bar.appendChild(b);
    });
    function markLane() {
      var cols = board.querySelectorAll(".col"); if (!cols.length) return;
      var bl = board.getBoundingClientRect().left, best = null, bestD = 1e9;
      cols.forEach(function (c) { var d = Math.abs(c.getBoundingClientRect().left - bl); if (d < bestD) { bestD = d; best = c.dataset.section; } });
      bar.querySelectorAll(".lanebar__b").forEach(function (b) { b.classList.toggle("is-on", b.dataset.section === best); });
    }
    board.addEventListener("scroll", markLane, { passive: true });
    setTimeout(markLane, 0);
    return bar;
  }

  /* board = same sections horizontal */
  function boardView(p) {
    var wrap = el("div", "board");
    sections(p).forEach(function (sec) {
      if (sec.id === "done" && !p.showDone) return;
      var col = el("div", "col");
      col.dataset.section = sec.id;
      var h = el("div", "col__h");
      var badge = el("span", "sec__badge");
      badge.setAttribute("data-lane", sec.id);
      h.appendChild(badge);
      h.appendChild(document.createTextNode(sec.name));
      var mine = tops(p, sec.id);
      h.appendChild(el("span", "col__cnt", String(mine.length)));
      col.appendChild(h);
      var body = el("div", "col__body");
      wireSectionDrop(body, col, p, sec.id);
      mine.forEach(function (task) { body.appendChild(taskRow(p, task, false)); });
      if (!mine.length) body.appendChild(el("div", "sec__empty", "Drop here"));
      var add = el("button", "col__add", "+ Add");
      add.type = "button";
      add.addEventListener("click", function () {
        ask("Task in " + sec.name, "", function (name) {
          p.tasks.push(taskObj({ id: uid("t"), content: name, section_id: sec.id, order: p.tasks.length }));
          save(); paint();
        });
      });
      body.appendChild(add);
      col.appendChild(body);
      wrap.appendChild(col);
    });
    return wrap;
  }

  function taskRow(p, task, isSub) {
    var row = el("div", "task" + (laneOf(task) === "done" ? " done" : "") + (isSub ? " task--sub" : ""));
    row.dataset.id = task.id;

    // Left rail: grip + priority flag + done tick (stacked) so title gets full width
    var rail = el("div", "task__rail");

    var grip = el("span", "grip", "⠿");
    grip.title = "Drag to another column";
    grip.draggable = true;
    grip.setAttribute("aria-label", "Drag handle");
    grip.addEventListener("dragstart", function (ev) {
      if (p.sort !== "manual") { p.sort = "manual"; toast("Sort → manual"); }
      drag.id = task.id;
      row.classList.add("is-dragging");
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = "move";
        try { ev.dataTransfer.setData("text/plain", task.id); } catch (e) {}
      }
      ev.stopPropagation();
    });
    grip.addEventListener("dragend", function () { drag.id = null; clearMarks(); });
    rail.appendChild(grip);

    // Ziehen an der ganzen Karte, nicht nur am Griff. Bedienelemente und Text
    // bleiben ausgenommen, sonst kann man weder tippen noch auswählen.
    row.draggable = true;
    row.addEventListener("dragstart", function (ev) {
      var el0 = ev.target;
      if (el0 && el0.closest && el0.closest("input,textarea,select,button,option,label")) {
        ev.preventDefault();
        return;
      }
      if (p.sort !== "manual") { p.sort = "manual"; toast("Sort → manual"); }
      drag.id = task.id;
      row.classList.add("is-dragging");
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = "move";
        try { ev.dataTransfer.setData("text/plain", task.id); } catch (e) {}
      }
    });
    row.addEventListener("dragend", function () {
      drag.id = null;
      row.classList.remove("is-dragging");
      clearMarks();
    });

    // Priority FLAG (square + p#) — click cycles. Not a tick.
    var ui = uiPrio(task);
    var prio = el("button", "prio prio--" + ui, "p" + ui);
    prio.type = "button";
    prio.title = "Priority — click for p1 red → p2 orange → p3 blue → p4 grey";
    prio.setAttribute("aria-label", "Priority p" + ui + ", click to change");
    prio.addEventListener("click", function (ev) {
      ev.stopPropagation();
      cyclePriority(p, task);
    });
    rail.appendChild(prio);

    // Done TICK (circle) — grey until complete
    var check = el("button", "check" + (task.checked ? " on" : ""));
    check.type = "button";
    check.title = laneOf(task) === "done" ? "Done — click to reopen" : "Mark done (moves to Done column)";
    check.setAttribute("aria-label", task.checked ? "Mark not done" : "Mark done");
    check.addEventListener("click", function () {
      if (laneOf(task) === "done") moveToSection(p, task, "pending");
      else moveToSection(p, task, "done");
      save(); paint();
    });
    rail.appendChild(check);
    row.appendChild(rail);

    var body = el("div", "task__body");
    var name = el("textarea", "task__content");
    name.rows = 1;
    name.value = task.content;
    name.setAttribute("aria-label", "Task title");
    // Don't start a drag when selecting text in the title
    name.draggable = false;
    name.addEventListener("mousedown", function (ev) { ev.stopPropagation(); });
    function fitRows() {
      // Grow rows until scrollHeight fits (no inline style — CSP).
      // Start from 1 so we never keep a stale oversized rows from a previous task.
      if (!name.value) { name.rows = 1; return; }
      name.rows = 1;
      var guard = 0;
      while (name.scrollHeight > name.clientHeight + 1 && name.rows < 24 && guard++ < 24) {
        name.rows = name.rows + 1;
      }
      // one extra line of air so descenders/last line never feel clipped
      if (name.rows < 24 && name.scrollHeight >= name.clientHeight - 1) {
        name.rows = name.rows + 1;
      }
    }
    name.placeholder = "Task title";
    name.addEventListener("input", function () { task.content = name.value; fitRows(); });
    name.addEventListener("change", function () {
      var v = name.value.trim();
      if (!v) {
        name.value = task.content || "";
        fitRows();
        toast("Title can’t be empty");
        return;
      }
      task.content = v;
      name.value = v;
      save();
      fitRows();
    });
    name.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        name.blur();
      }
      if (ev.key === "Escape") {
        name.value = task.content;
        fitRows();
        name.blur();
      }
    });
    body.appendChild(name);
    requestAnimationFrame(function () { requestAnimationFrame(fitRows); });

    // Short description preview on the card
    if (task.description) {
      var descPrev = el("p", "task__desc", task.description);
      descPrev.title = "Open Details for full instructions";
      descPrev.addEventListener("click", function (ev) {
        ev.stopPropagation();
        openDetails(p, task);
      });
      body.appendChild(descPrev);
    }

    var meta = el("div", "task__meta");
    // Compact move control (avoids 3 full-width pills cluttering the card)
    var move = el("select", "move-sel");
    move.setAttribute("aria-label", "Move to column");
    move.title = "Move to column";
    LANES.forEach(function (lane) {
      var op = el("option", null, lane.name);
      op.value = lane.id;
      if (lane.id === laneOf(task)) op.selected = true;
      move.appendChild(op);
    });
    move.addEventListener("change", function () {
      var dest = move.value;
      if (dest === laneOf(task)) return;
      moveToSection(p, task, dest);
      save(); paint();
      toast("→ " + laneMeta(dest).name);
    });
    // stop drag/select quirks
    move.addEventListener("mousedown", function (ev) { ev.stopPropagation(); });
    meta.appendChild(move);

    // Details / instructions popup
    var hasDetail = !!(task.description || task.instructions);
    var det = el("button", "pill pill--detail" + (hasDetail ? " has-text" : ""), hasDetail ? "Details" : "+ Details");
    det.type = "button";
    det.title = "Description & detailed instructions";
    det.addEventListener("click", function (ev) {
      ev.stopPropagation();
      openDetails(p, task);
    });
    meta.appendChild(det);

    if (task.due && task.due.date) {
      var done = laneOf(task) === "done", d = dueWord(task.due.date);
      var pd = el("span", "pill " + (done ? "pill--due" : d.over ? "pill--over" : d.today ? "pill--today" : "pill--due"), d.text);
      pd.title = "Due " + task.due.date; meta.appendChild(pd);
    }
    (task.labels || []).forEach(function (l) {
      meta.appendChild(el("span", "pill pill--lbl", l));
    });
    body.appendChild(meta);
    row.appendChild(body);

    var acts = el("div", "task__actions");
    var up = el("button", null, "↑");
    up.type = "button"; up.title = "Move up";
    up.setAttribute("aria-label", "Move up");
    up.addEventListener("click", function () { nudge(p, task, -1); });
    var down = el("button", null, "↓");
    down.type = "button"; down.title = "Move down";
    down.setAttribute("aria-label", "Move down");
    down.addEventListener("click", function () { nudge(p, task, 1); });
    var det2 = el("button", null, "ⓘ");
    det2.type = "button"; det2.title = "Details & instructions";
    det2.setAttribute("aria-label", "Open details");
    det2.addEventListener("click", function (ev) {
      ev.stopPropagation();
      openDetails(p, task);
    });
    var del = el("button", null, "✕");
    del.type = "button"; del.title = "Delete";
    del.setAttribute("aria-label", "Delete task");
    del.addEventListener("click", function () {
      if (!confirm("Delete “" + task.content + "”?")) return;
      p.tasks = p.tasks.filter(function (x) { return x.id !== task.id && x.parent_id !== task.id; });
      save(); paint();
    });
    acts.appendChild(up);
    acts.appendChild(down);
    acts.appendChild(det2);
    acts.appendChild(del);
    row.appendChild(acts);

    // drop on task = reorder within / take target's section
    row.addEventListener("dragover", function (ev) {
      if (!drag.id || drag.id === task.id) return;
      ev.preventDefault();
      var r = row.getBoundingClientRect();
      var after = (ev.clientY - r.top) > r.height / 2;
      row.classList.toggle("drop-after", after);
      row.classList.toggle("drop-before", !after);
    });
    row.addEventListener("dragleave", function () {
      row.classList.remove("drop-before", "drop-after");
    });
    row.addEventListener("drop", function (ev) {
      if (!drag.id || drag.id === task.id) return;
      ev.preventDefault(); ev.stopPropagation();
      var after = row.classList.contains("drop-after");
      clearMarks();
      var moving = p.tasks.filter(function (x) { return x.id === drag.id; })[0];
      if (!moving) return;
      moveToSection(p, moving, laneOf(task), task, after);
      save(); paint();
      toast("→ " + laneMeta(laneOf(task)).name);
    });

    wireTouch(p, task, row, grip);
    return row;
  }

  /* ---- Berührung (2026-09-08) ----
     HTML5-Drag feuert auf Telefonen nicht. Nach Android-Konvention (Material):
     der Griff hebt die Karte sofort, ein langer Druck auf die Karte ebenso; ein
     Schatten folgt dem Finger, die Bahn unter dem Finger nimmt die Karte an,
     das Brett rollt am Rand mit. Wischen quer über die Karte schiebt sie eine
     Bahn weiter. Kurzes Vibrieren beim Aufnehmen, wo der Browser es erlaubt. */
  var touch = { id: null, lifted: false, ghost: null, timer: null, x: 0, y: 0, startX: 0, startY: 0, moved: false, gx: 0, gy: 0 };
  function laneOrder(p) {
    return sections(p).filter(function (s) { return s.id !== "done" || p.showDone; }).map(function (s) { return s.id; });
  }
  function shiftLane(p, task, dir) {
    var order = laneOrder(p), i = order.indexOf(laneOf(task)), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) { toast(dir > 0 ? "Already in the last lane" : "Already in the first lane"); return; }
    if (p.sort !== "manual") p.sort = "manual";
    moveToSection(p, task, order[j], null, false);
    save(); paint(); toast("→ " + laneMeta(order[j]).name);
  }
  function wireTouch(p, task, row, grip) {
    function lift(x, y, pointerId) {
      touch.lifted = true;
      row.classList.add("is-dragging");
      var r = row.getBoundingClientRect();
      var g = row.cloneNode(true); g.className = "task task--ghost";
      g.style.width = r.width + "px"; g.style.left = r.left + "px"; g.style.top = r.top + "px";
      document.body.appendChild(g); touch.ghost = g; touch.gx = r.left - x; touch.gy = r.top - y;
      try { row.setPointerCapture(pointerId); } catch (e) {}
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
    }
    function unlift() {
      touch.lifted = false;
      if (touch.ghost) { touch.ghost.remove(); touch.ghost = null; }
      row.classList.remove("is-dragging"); clearMarks();
    }
    function target(x, y) {
      if (touch.ghost) touch.ghost.style.display = "none";
      var at = document.elementFromPoint(x, y);
      if (touch.ghost) touch.ghost.style.display = "";
      if (!at || !at.closest) return null;
      var col = at.closest(".col"); if (!col) return null;
      var over = at.closest(".task"); if (over === row) over = null;
      var after = false;
      if (over) { var rr = over.getBoundingClientRect(); after = (y - rr.top) > rr.height / 2; }
      return { col: col, section: col.dataset.section, row: over, after: after };
    }
    function mark(tg) {
      clearMarks(); row.classList.add("is-dragging");
      if (!tg) return;
      tg.col.classList.add("sec--over");
      if (tg.row) tg.row.classList.add(tg.after ? "drop-after" : "drop-before");
    }
    function autoScroll(x) {
      var board = row.closest(".board"); if (!board) return;
      var b = board.getBoundingClientRect();
      if (x < b.left + 44) board.scrollLeft -= 16; else if (x > b.right - 44) board.scrollLeft += 16;
    }
    function drop(x, y) {
      var tg = target(x, y); unlift();
      if (!tg) return;
      if (p.sort !== "manual") p.sort = "manual";
      var moving = p.tasks.filter(function (z) { return z.id === task.id; })[0]; if (!moving) return;
      var before = tg.row ? p.tasks.filter(function (z) { return z.id === tg.row.dataset.id; })[0] : null;
      moveToSection(p, moving, tg.section, before || null, tg.after);
      save(); paint(); toast("→ " + laneMeta(tg.section).name);
    }
    function down(ev, immediate) {
      if (ev.pointerType !== "touch") return;
      // Nur echte Bedienelemente sind ausgenommen; der Titel (auch als Knopf) trägt die Wischgeste.
      // Der Titel ist ein textarea (Bearbeitung an Ort); er trägt die Wischgeste trotzdem. Ausgenommen bleiben echte Bedienelemente.
      if (!immediate && ev.target.closest && ev.target.closest("input,select,option,label,a,.task__actions,.check,.prio,.pill,.move-sel,.col__add,textarea:not(.task__content)")) return;
      clearTimeout(touch.timer);
      touch.id = ev.pointerId; touch.startX = touch.x = ev.clientX; touch.startY = touch.y = ev.clientY; touch.moved = false;
      if (immediate) lift(ev.clientX, ev.clientY, ev.pointerId);
      else touch.timer = setTimeout(function () { if (!touch.moved && touch.id === ev.pointerId) lift(touch.x, touch.y, ev.pointerId); }, 350);
    }
    function move(ev) {
      if (ev.pointerId !== touch.id) return;
      touch.x = ev.clientX; touch.y = ev.clientY;
      var dx = touch.x - touch.startX, dy = touch.y - touch.startY;
      if (!touch.lifted) { if (Math.abs(dx) > 10 || Math.abs(dy) > 10) { touch.moved = true; clearTimeout(touch.timer); } return; }
      if (ev.cancelable) ev.preventDefault();
      if (touch.ghost) { touch.ghost.style.left = (touch.x + touch.gx) + "px"; touch.ghost.style.top = (touch.y + touch.gy) + "px"; }
      mark(target(touch.x, touch.y)); autoScroll(touch.x);
    }
    function up(ev) {
      if (ev.pointerId !== touch.id) return;
      clearTimeout(touch.timer);
      if (touch.lifted) drop(touch.x, touch.y);
      else { var dx = touch.x - touch.startX, dy = touch.y - touch.startY; if (Math.abs(dx) > 60 && Math.abs(dy) < 40) { touch.swiped = true; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); shiftLane(p, task, dx > 0 ? 1 : -1); } }
      touch.id = null;
    }
    function cancel(ev) { if (ev.pointerId !== touch.id) return; clearTimeout(touch.timer); if (touch.lifted) unlift(); touch.id = null; }
    // Nach einem Wisch darf der Tipp am Ende nicht als Klick durchgehen (Titel öffnet sonst die Bearbeitung).
    row.addEventListener("click", function (ev) { if (touch.swiped) { touch.swiped = false; ev.stopPropagation(); ev.preventDefault(); } }, true);
    grip.addEventListener("pointerdown", function (ev) { down(ev, true); });
    row.addEventListener("pointerdown", function (ev) { if (ev.target === grip || grip.contains(ev.target)) return; down(ev, false); });
    [row, grip].forEach(function (n) { n.addEventListener("pointermove", move); n.addEventListener("pointerup", up); n.addEventListener("pointercancel", cancel); });
  }

  function nudge(p, task, dir) {
    if (p.sort !== "manual") { p.sort = "manual"; }
    var group = p.tasks.filter(function (x) {
      return !x.parent_id && laneOf(x) === laneOf(task);
    }).sort(function (a, b) { return a.order - b.order; });
    var i = group.indexOf(task), j = i + dir;
    if (i < 0 || j < 0 || j >= group.length) return;
    var tmp = group[i].order; group[i].order = group[j].order; group[j].order = tmp;
    save(); paint();
  }

  function wireSectionDrop(body, block, p, sectionId) {
    function over(ev) {
      if (!drag.id) return;
      ev.preventDefault();
      body.classList.add("is-over");
      block.classList.add("sec--over");
    }
    function leave(ev) {
      // only clear when leaving the body itself
      if (!body.contains(ev.relatedTarget)) {
        body.classList.remove("is-over");
        block.classList.remove("sec--over");
      }
    }
    body.addEventListener("dragover", over);
    body.addEventListener("dragleave", leave);
    body.addEventListener("drop", function (ev) {
      if (!drag.id) return;
      // if dropped on a task, task handler already ran
      if (ev.target.closest && ev.target.closest(".task") && ev.target.closest(".task") !== body) {
        // task drop handled separately
      }
      ev.preventDefault();
      clearMarks();
      var moving = p.tasks.filter(function (x) { return x.id === drag.id; })[0];
      if (!moving) return;
      // if already handled by task drop, skip — but task drop stops propagation
      moveToSection(p, moving, sectionId, null, false);
      save(); paint();
      toast("→ " + laneMeta(sectionId).name);
    });
  }

  function addBar(p) {
    var wrap = el("div", "addbar");
    var inp = el("input", "addbar__input");
    inp.type = "text";
    inp.placeholder = "Add task…  pending | doing | audit | done · @label · p1 · today";
    inp.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" || !inp.value.trim()) return;
      var q = parseQuick(inp.value, p);
      if (!q.content) return;
      var sec = q.section_id || "pending";
      p.tasks.push(taskObj({
        id: uid("t"), content: q.content, priority: q.priority,
        labels: q.labels, due: q.due, section_id: sec, order: p.tasks.length
      }));
      save(); paint();
      toast("Added → " + laneMeta(sec).name);
      setTimeout(function () {
        var n = document.querySelector(".addbar__input");
        if (n) n.focus();
      }, 0);
    });
    wrap.appendChild(inp);

    var chips = el("div", "addbar__statuses");
    LANES.forEach(function (lane) {
      var b = el("button", "chipbtn", lane.name);
      b.type = "button";
      b.title = "Add in " + lane.name;
      b.addEventListener("click", function () {
        ask("Task in " + lane.name, "", function (name) {
          p.tasks.push(taskObj({
            id: uid("t"), content: name, section_id: lane.id, order: p.tasks.length
          }));
          save(); paint();
        });
      });
      chips.appendChild(b);
    });
    wrap.appendChild(chips);
    wrap.appendChild(el("p", "addbar__hint",
      "Board columns: Pending → In progress → To be audited → Done. Drag cards between columns. " +
      "Square p# = priority (click). Circle = done. Dropdown = move."));
    return wrap;
  }

  /* chrome */
  var addBtn = document.getElementById("btn-add-project");
  if (addBtn) addBtn.addEventListener("click", function () {
    ask("Project name", "New project", function (name) {
      var id = uid("p");
      var pr = {
        id: id, name: name, color: "#299438", view: "board", sort: "manual",
        showDone: true, sections: [], tasks: []
      };
      ensureLanes(pr);
      state.projects[id] = pr;
      state.active = id; state.focus = null; save(); paint();
    });
  });

  save();
  /* Öffnen aus einer Checkliste (2026-09-09): /project?p=<seed>. Die Saat aus
     seeds.js (oder die Hub-Datei aus app.js) wird ein Projekt dieses Bretts,
     Schritte werden Aufgaben in «Pending», Notizen zur Beschreibung. Gibt es das
     Projekt schon, wird es nur aktiv. Vorher landete «Open the checklist» auf
     einem leeren Projekt, weil dieses Brett die Saaten nie gelesen hat. */
  (function openFromQuery() {
    var pid = new URLSearchParams(location.search).get("p"); if (!pid) return;
    if (state.projects[pid]) { if (state.active !== pid) { state.active = pid; state.focus = null; save(); } return; }
    var seed = (window.__seeds || {})[pid], hubP = null;
    try { hubP = window.__hub && window.__hub.state().projects[pid]; } catch (e) {}
    var steps = hubP && hubP.steps ? hubP.steps.filter(function (s) { return !s.parent_id; }).map(function (s) { return { t: s.content || s.t || "", n: s.note || s.description || "", done: !!(s.checked || s.done) }; })
              : (seed && seed.steps ? seed.steps.map(function (s) { return { t: s.t || s.content || "", n: s.n || s.note || "", i: s.i || "", done: false }; }) : null);
    if (!steps || !steps.length) return;
    var now = new Date().toISOString();
    var np = { id: pid, name: (hubP && hubP.title) || (seed && seed.title) || pid, seed: pid, created_at: now, updated_at: now, sort: "manual", view: "board", showDone: true,
      tasks: steps.map(function (s, i) { return taskObj({ id: uid("t"), content: s.t, description: s.n, instructions: s.i || "", section_id: s.done ? "done" : "pending", checked: s.done, order: i, added_at: now }); }) };
    state.projects[pid] = np; state.active = pid; state.focus = null; save();
    try { if (window.__hub && !hubP) window.__hub.record("open", "Project opened from checklist " + pid, pid); } catch (e) {}
  })();

  paint();
})();
