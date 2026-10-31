/* entrosana.app — die Arbeitsfläche.
 *
 * Alles liegt auf diesem Gerät, in localStorage. Es gibt keine Konten und keinen
 * Server, der schreiben könnte: serve.mjs lässt nur GET und HEAD zu, und die
 * Inhaltssicherheitsregel setzt form-action 'none' (handoff-design.md §6, §10).
 * Die Siegel sind echt, sie kommen aus crypto.subtle und nicht aus einer Attrappe.
 */
(function () {
  "use strict";

  var KEY = "entrosana-app:v1";
  var seeds = window.__seeds || {};

  // ---------------------------------------------------------------- Speicher
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* Speicher gesperrt: dann eben nur diese Sitzung */ }
    return { created: null, projects: {}, records: [] };
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  var state = load();

  // ---------------------------------------------------------------- Aufgaben
  // Volle Struktur nach dem Vorbild von Todoist: Abschnitt, Unteraufgabe,
  // Termin mit Wiederholung, Rang und Kürzel. Bestehende Dateien wandern still
  // mit, ein fehlendes Feld bekommt seinen Vorgabewert.
  // Feldnamen wie in der Todoist-Schnittstelle v1: content, description,
  // priority, due, labels, parent_id, section_id, child_order, checked,
  // added_at, completed_at. Zwei Zählweisen, die man leicht verwechselt:
  //   Schnittstelle: priority 1 ist der niedrigste, 4 der hoechste Rang.
  //   Vorlagen-CSV:  PRIORITY leer ist p1, 4 ist p4, also umgekehrt.
  // Gespeichert wird die Zählweise der Schnittstelle, angezeigt die der Oberfläche.
  function normTask(s, i) {
    return {
      id: s.id || ("t" + i),
      content: s.content != null ? s.content : (s.t || ""),
      description: s.description != null ? s.description : (s.n || ""),
      priority: s.priority || (s.prio ? 5 - s.prio : 1),
      due: s.due || null,                 // {date, string, is_recurring, lang, timezone}
      labels: s.labels || [],
      parent_id: s.parent_id || s.parent || null,
      section_id: s.section_id || s.section || null,
      child_order: (s.child_order != null ? s.child_order : (s.order != null ? s.order : i)),
      checked: s.checked != null ? !!s.checked : !!s.done,
      added_at: s.added_at || new Date().toISOString(),
      completed_at: s.completed_at || s.at || null,
      instructions: s.instructions || "", // ausführliche Anleitung, nur im Fenster
      note: s.note || ""                  // eigen: die Entscheidung hinter dem Schritt
    };
  }
  function uiPrio(t) { return 5 - (t.priority || 1); }   // Schnittstelle -> Oberfläche

  (function migrate() {
    var touched = false;
    Object.keys(state.projects).forEach(function (k) {
      var p = state.projects[k];
      if (!p.sections) { p.sections = []; touched = true; }
      p.steps = p.steps.map(function (s, i) {
        if (s.content === undefined) touched = true;
        return normTask(s, i);
      });
    });
    if (touched) save(state);
  })();

  var DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
  }
  function todayISO() { return iso(new Date()); }
  function plusDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return iso(d); }
  function dueClass(due, done) {
    if (!due) return "";
    if (done) return "due--done";
    var t = todayISO();
    if (due.date < t) return "due--over";
    if (due.date === t) return "due--today";
    return "";
  }
  function dueLabel(due) {
    if (!due) return "";
    return due.date === todayISO() ? "today"
      : due.date === plusDays(1) ? "tomorrow"
      : due.date === plusDays(-1) ? "yesterday" : due.date;
  }
  // Nächster Termin einer wiederkehrenden Aufgabe.
  function nextDue(due) {
    if (!due || !due.is_recurring) return null;
    var d = new Date(due.date + "T12:00:00");
    var s = (due.string || "").toLowerCase();
    if (s.indexOf("month") > -1) d.setMonth(d.getMonth() + 1);
    else if (s.indexOf("week") > -1) d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    return { date: iso(d), string: due.string, is_recurring: true, lang: "en", timezone: null };
  }

  // Schnelleingabe mit denselben Zeichen wie in Todoist:
  //   text  #Abschnitt  @kuerzel  p1..p4  today|tomorrow|mon..sun|JJJJ-MM-TT
  //   every day|week|month   ·   führendes ">" macht eine Unteraufgabe
  function parseQuick(raw, project) {
    var sub = /^\s*>\s+/.test(raw);
    var text = raw.replace(/^\s*>\s+/, "");
    var out = { priority: 1, labels: [], section_id: null, due: null, sub: sub };
    var repeat = null;
    var m = text.match(/\bevery\s+(day|week|month)\b/i);
    if (m) { repeat = "every " + m[1].toLowerCase(); text = text.replace(m[0], " "); }
    text = text.replace(/\bp([1-4])\b/i, function (_, n) { out.priority = 5 - (+n); return " "; });
    text = text.replace(/@([^\s@#]+)/g, function (_, l) { out.labels.push(l); return " "; });
    text = text.replace(/#([^\s@#]+)/g, function (_, s) {
      var found = (project.sections || []).filter(function (x) {
        return x.name.toLowerCase() === s.toLowerCase();
      })[0];
      if (!found) {
        found = { id: "sec" + Date.now().toString(36), project_id: project.id,
                  name: s, section_order: project.sections.length };
        project.sections.push(found);
      }
      out.section_id = found.id;
      return " ";
    });
    function setDue(date, str) {
      out.due = { date: date, string: str || date, is_recurring: !!repeat,
                  lang: "en", timezone: null };
      if (repeat) out.due.string = repeat;
    }
    text = text.replace(/\b(\d{4}-\d{2}-\d{2})\b/, function (_, d) { setDue(d); return " "; });
    if (!out.due) {
      text = text.replace(/\b(today|tomorrow)\b/i, function (_, w) {
        var lw = w.toLowerCase();
        setDue(lw === "today" ? todayISO() : plusDays(1), lw);
        return " ";
      });
    }
    if (!out.due) {
      text = text.replace(/\b(sun|mon|tue|wed|thu|fri|sat)\b/i, function (_, w) {
        var want = DAYS.indexOf(w.toLowerCase()), now = new Date().getDay();
        setDue(plusDays((want - now + 7) % 7 || 7), w.toLowerCase());
        return " ";
      });
    }
    if (!out.due && repeat) setDue(todayISO(), repeat);
    out.content = text.replace(/\s+/g, " ").trim();
    return out;
  }

  // ---------------------------------------------------------------- Siegel
  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ("0" + b.toString(16)).slice(-2);
    }).join("");
  }
  // Ausserhalb eines sicheren Kontexts (HTTPS oder localhost) gibt es kein
  // crypto.subtle. Dann null statt Leerstring: ein Leerstring sähe aus wie ein
  // Siegel, und die Kette würde sich gegen lauter leere Siegel "bestätigen".
  function sealable() { return !!(window.crypto && window.crypto.subtle); }
  function sha256(text) {
    if (!sealable()) return Promise.resolve(null);
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(hex);
  }

  // Jede Zeile wird gegen die vorherige gesiegelt. Genau das macht die Kette prüfbar.
  function payload(r) { return [r.t, r.kind, r.project || "", r.text].join("|"); }
  function record(kind, text, project) {
    var prev = state.records.length ? state.records[state.records.length - 1].h : "";
    var r = { t: new Date().toISOString(), kind: kind, text: text, project: project || null };
    return sha256(prev + "|" + payload(r)).then(function (h) {
      if (h == null) {
        // Ohne Siegel keine Zeile: eine ungesiegelte Zeile wäre eine Attrappe.
        // Die Handlung selbst bleibt erlaubt, aber sie wird laut angesagt.
        say("No seal possible here (needs HTTPS) — this action left no record.", "warn");
        return null;
      }
      r.h = h;
      state.records.push(r);
      save(state);
      return r;
    });
  }
  // true: jede Zeile passt. false: ein Bruch. null: hier nicht prüfbar.
  function verifyChain() {
    if (!sealable()) return Promise.resolve(null);
    var prev = "";
    var chain = Promise.resolve(true);
    state.records.forEach(function (r) {
      chain = chain.then(function (ok) {
        if (!ok) return false;
        return sha256(prev + "|" + payload(r)).then(function (h) {
          prev = r.h;
          return h === r.h;
        });
      });
    });
    return chain;
  }

  // ---------------------------------------------------------------- Projekte
  function openProject(seedId) {
    if (state.projects[seedId]) return Promise.resolve(state.projects[seedId]);
    var seed = seeds[seedId];
    if (!seed) return Promise.resolve(null);
    var p = {
      id: seedId, seed: seedId, title: seed.title,
      opened: new Date().toISOString(),
      view_style: "list", sort: "manual", show_completed: true,
      sections: [],
      steps: seed.steps.map(function (s, i) { return normTask({ content: s.t, description: s.n }, i); })
    };
    state.projects[seedId] = p;
    if (!state.created) state.created = p.opened;
    save(state);
    return record("open", "Project opened from seed " + seedId, seedId).then(function () { return p; });
  }
  // Eine eigene Datei ist derselbe Gegenstand wie eine aus dem Hub, nur ohne
  // Saat und ohne vorgegebene Schritte. Deshalb kein fremdes Aufgabenwerkzeug:
  // das Schema trägt beides, und die Ausfuhr ist Markdown mit Ankreuzfeldern.
  function createOwn(title) {
    var id = "own/" + Date.now().toString(36);
    var p = {
      id: id, seed: id, title: title, own: true,
      opened: new Date().toISOString(),
      view_style: "list", sort: "manual", show_completed: true,
      sections: [], steps: []
    };
    state.projects[id] = p;
    if (!state.created) state.created = p.opened;
    save(state);
    return record("open", "Project created — " + title, id).then(function () { return p; });
  }

  function projectList() {
    // Only active hub projects (not archived / soft-deleted).
    return Object.keys(state.projects).map(function (k) { return state.projects[k]; })
      .filter(function (p) {
        return p && !p.is_archived && !p.archived && !p.is_deleted && !p.deleted;
      });
  }
  function isActiveProject(p) {
    if (!p) return false;
    if (p.is_archived || p.archived || p.is_deleted || p.deleted) return false;
    if (p.status === "archived" || p.status === "deleted") return false;
    return true;
  }
  // Workspace counter + resume card — MUST match the rail "Projects" list
  // (rail-projects.js → entrosana-todo-demo:v3). Never fall back to hub seed
  // projects (entrosana-app:v1): those made the page say "4 projects open"
  // while the rail correctly showed "none yet".
  function activeProjects() {
    try {
      var board = JSON.parse(localStorage.getItem("entrosana-todo-demo:v3") || "null");
      if (!board || !board.projects) return [];
      return Object.keys(board.projects).filter(function (id) {
        return isActiveProject(board.projects[id]);
      }).map(function (id) {
        var p = board.projects[id];
        var tasks = p.tasks || [];
        return {
          id: id,
          seed: id,
          title: p.name || "Untitled",
          opened: p.updated_at || p.updated || p.created_at || p.opened || "",
          board: true,
          steps: tasks.map(function (t) {
            var done = !!t.checked || t.section_id === "done" || t.status === "done";
            return { content: t.content || "", checked: done };
          })
        };
      });
    } catch (e) {
      return [];
    }
  }
  function progress(p) {
    var steps = p.steps || [];
    var done = steps.filter(function (s) { return s.checked; }).length;
    return { done: done, total: steps.length };
  }
  // Das Dateisiegel deckt, was man sieht: Text, Haken, Abschlusszeit und
  // Notiz jedes Schritts. JSON statt join, damit kein Zeichen im Text die
  // Feldgrenzen verschieben kann. Vorher lasen die Felder s.t/s.done/s.at,
  // die es im Schema (content/checked/completed_at) nie gab — das Siegel
  // blieb starr, egal was in der Datei geschah.
  function projectSeal(p) {
    var canon = JSON.stringify([p.seed, p.steps.map(function (s) {
      return [s.content, !!s.checked, s.completed_at || null, s.note || ""];
    })]);
    return sha256(canon);
  }

  // ---------------------------------------------------------------- Werkzeug
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function hhmm(iso) {
    var d = new Date(iso);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function isToday(iso) {
    var d = new Date(iso), n = new Date();
    return d.toDateString() === n.toDateString();
  }
  function ring(done, total) {
    var r = 21.5, c = 2 * Math.PI * r, off = total ? c * (1 - done / total) : c;
    return '<div class="ring"><svg width="50" height="50" viewBox="0 0 50 50">' +
      '<circle cx="25" cy="25" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="3.5"/>' +
      '<circle cx="25" cy="25" r="' + r + '" fill="none" stroke="var(--verify)" stroke-width="3.5" ' +
      'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) +
      '" stroke-linecap="round"/></svg><span>' + done + "/" + total + "</span></div>";
  }
  function download(name, text) {
    try {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      return true;
    } catch (e) { return false; }
  }
  function say(msg, kind) {
    var bar = document.getElementById("say") || (function () {
      var n = el("div", "saybar"); n.id = "say";
      document.body.appendChild(n); return n;
    })();
    bar.className = "saybar note note--" + (kind || "idle");
    bar.textContent = msg;
    bar.hidden = false;
    clearTimeout(bar._t);
    bar._t = setTimeout(function () { bar.hidden = true; }, 4000);
  }

  // ---------------------------------------------------------------- Leiste
  function paintRail() {
    var box = document.getElementById("rail-projects");
    if (box) {
      box.textContent = "";
      var list = projectList();
      if (!list.length) {
        var none = el("p", "rail__none", "none yet");
        box.appendChild(none);
      }
      list.forEach(function (p) {
        var pr = progress(p);
        var a = el("a", "rail__item");
        a.href = "/project?p=" + encodeURIComponent(p.seed);
        a.innerHTML = '<span class="rail__glyph">▪</span> ' +
          '<span class="rail__label"></span><span class="rail__count">' + pr.done + "/" + pr.total + "</span>";
        a.querySelector(".rail__label").textContent = p.title;
        box.appendChild(a);
      });
    }
    var rc = document.getElementById("rec-count");
    if (rc) rc.textContent = state.records.length || "";
    var rt = document.getElementById("rec-today");
    if (rt) rt.textContent = state.records.filter(function (r) { return isToday(r.t); }).length || "";
    var sc = document.getElementById("svc-count");
    if (sc) { try { var stk = JSON.parse(localStorage.getItem("entrosana-app:token") || "null"), own = Number(localStorage.getItem("entrosana-svc-own:v1") || 0) || 0;
      var mach = Number(localStorage.getItem("entrosana-svc-machine:v1") || 0) || 0;   // nur beim Eigentümer je > 0
      sc.textContent = (stk && stk.expires > new Date().toISOString() ? own + mach : 0) || ""; } catch (e) { sc.textContent = ""; } }
  }

  // ---------------------------------------------------------------- Ansichten
  // Erstes Projekt (2026-09-09): ein leerer Arbeitsplatz zeigt nichts, womit man anfangen könnte.
  // Beim ersten Besuch ohne Projekte auf dem Gerät legt der Hub «Contribute a module» aus der
  // Checkliste contribute/003 in den Board-Speicher, ohne Kettenzeile: das Gerät hat noch nichts getan.
  // Die vorgeschlagenen Projekte (2026-09-10): drei Vorhaben des Hubs, jedem Brett einmal angelegt.
  // Der frühere Startvorschlag «Contribute a module» geht, wenn er unberührt ist.
  var PROPOSED = ["hub/001", "hub/002", "hub/003"], PROPOSED_FLAG = "entrosana-proposed:v2", OLD_STARTER = "contribute/003";
  function projectFromSeed(id, seed) {
    var now = new Date().toISOString(), stamp = Date.now().toString(36) + id.replace(/\W/g, "");
    return { id: id, name: seed.title, seed: id, created_at: now, updated_at: now, sort: "manual", view: "board", showDone: true,
      tasks: seed.steps.map(function (s, i) { return { id: "t" + stamp + i, content: s.t || "", description: s.n || "", instructions: s.i || "", priority: 1, section_id: "pending", parent_id: null, order: i, labels: [], due: null, checked: false, completed_at: null }; }) };
  }
  function ensureStarter() {
    if (!document.getElementById("oversight")) return false;
    try {
      if (localStorage.getItem(PROPOSED_FLAG)) return false;
      var raw = localStorage.getItem("entrosana-todo-demo:v3");
      var board = raw ? JSON.parse(raw) : null;
      board = board && board.projects ? board : { projects: {}, active: null, focus: null };
      var old = board.projects[OLD_STARTER];
      if (old && old.seed === OLD_STARTER && (old.tasks || []).every(function (t) { return t.section_id === "pending" && !t.checked; })) delete board.projects[OLD_STARTER];
      var added = 0;
      PROPOSED.forEach(function (id) { if (board.projects[id] || !seeds[id] || !seeds[id].steps) return; board.projects[id] = projectFromSeed(id, seeds[id]); added++; });
      if (!isActiveProject(board.projects[board.active])) { board.active = PROPOSED[0]; board.focus = null; }
      localStorage.setItem("entrosana-todo-demo:v3", JSON.stringify(board));
      localStorage.setItem(PROPOSED_FLAG, "1");
      if (added && window.__rail) try { window.__rail(); } catch (e) {}
      return added > 0;
    } catch (e) { return false; }
  }

  function paintWorkspace() {
    ensureStarter();
    var emptyBox = document.getElementById("state-empty");
    var resumeBox = document.getElementById("state-resume");
    var resume = document.getElementById("resume");
    // Active only: not archived, not deleted (board store — same as rail).
    var list = activeProjects().sort(function (a, b) {
      return (b.opened || "").localeCompare(a.opened || "");
    });
    // Two separate DOM blocks so admin can edit both empty + resume copy
    // without JS overwriting the editable nodes.
    if (emptyBox) emptyBox.hidden = !!list.length;
    if (resumeBox) resumeBox.hidden = !list.length;
    if (resume) resume.textContent = "";
    if (list.length && resumeBox) {
      var one = document.getElementById("lede-resume-one");
      var many = document.getElementById("lede-resume-many");
      var lede = document.getElementById("lede-resume");
      if (lede) {
        if (list.length === 1) {
          lede.textContent = (one && one.textContent.trim()) || "One project open.";
        } else {
          var manyTpl = (many && many.textContent.trim()) || "{n} projects open.";
          lede.textContent = manyTpl.replace(/\{n\}/g, String(list.length));
        }
      }
      if (resume) {
        var p = list[0], pr = progress(p);
        var next = (p.steps || []).filter(function (s) { return !s.checked; })[0];
        var card = el("div", "card resume");
        var openHref = p.board
          ? "/project"
          : "/project?p=" + encodeURIComponent(p.seed);
        card.innerHTML = ring(pr.done, pr.total) +
          '<div><p class="h3"></p><p class="resume__m"></p></div>' +
          '<a class="btn" href="' + openHref + '">Open project</a>';
        card.querySelector(".h3").textContent = p.title;
        card.querySelector(".resume__m").textContent =
          (p.board ? p.title : p.seed) + " · " + pr.done + "/" + pr.total + " done" +
          (next ? " · next: " + (next.content || "").toLowerCase() : " · finished");
        if (p.board) {
          card.querySelector("a.btn").addEventListener("click", function () {
            try {
              var raw = localStorage.getItem("entrosana-todo-demo:v3");
              var s = raw ? JSON.parse(raw) : null;
              if (s) {
                s.active = p.id;
                localStorage.setItem("entrosana-todo-demo:v3", JSON.stringify(s));
              }
            } catch (e) { /* storage locked */ }
          });
        }
        resume.appendChild(card);
      }
    }
    // Kette und Quittung
    var note = document.getElementById("chain-note"), box = document.getElementById("chain-receipt");
    if (!note || !box) return;   // nur der Arbeitsplatz hat die Kettenzeile; andere Seiten rufen paintWorkspace ebenfalls
    if (!state.records.length) return;
    verifyChain().then(function (ok) {
      if (ok == null) {
        note.className = "note note--idle";
        note.textContent = "cannot verify here — seals need HTTPS · " + state.records.length + " records";
        return;
      }
      note.className = "note note--" + (ok ? "ok" : "warn");
      note.textContent = (ok ? "chain verified · " : "chain broken · ") + state.records.length +
        " of " + state.records.length + " records";
      var last = state.records[state.records.length - 1];
      var r = el("div", "receipt");
      r.innerHTML = '<div class="receipt__perf"></div><div class="receipt__body">' +
        '<div class="receipt__row"><span class="receipt__k">last</span><span class="receipt__in"></span></div>' +
        '<div class="receipt__row"><span class="receipt__k">seal</span><span class="receipt__hash"></span></div>' +
        '<p class="receipt__meta"></p>' +
        '<p class="receipt__status" data-state="' + (ok ? "ok" : "warn") + '"></p></div>';
      r.querySelector(".receipt__in").textContent = last.text;
      r.querySelector(".receipt__hash").textContent = (last.h || "").slice(0, 16);
      r.querySelector(".receipt__meta").textContent = "recomputed from " + state.records.length + " records";
      r.querySelector(".receipt__status").textContent = ok ? "every line matches its predecessor" : "a line does not match";
      box.appendChild(r);
    });
  }

  function paintProject() {
    var host = document.getElementById("project-view");
    if (!host) return;
    var sid = new URLSearchParams(location.search).get("p");
    if (state.projects[sid]) { drawProject(host, state.projects[sid]); paintRail(); return; }
    if (!seeds[sid]) {
      host.innerHTML = '<div class="card empty"><span class="eyebrow">Not found</span>' +
        "<h4>No such file.</h4><p>The three sections list every Hub file, and your own ones are in " +
        "the rail.</p><a class=\"btn\" href=\"/\">Back to the workspace</a></div>";
      return;
    }
    openProject(sid).then(function (p) { drawProject(host, p); paintRail(); });
  }

  function drawProject(host, p) {
    ensureLanes(p);
    var pr = progress(p);
    var where = seeds[p.seed]
      ? seeds[p.seed].section.replace(/^./, function (c) { return c.toUpperCase(); })
      : "Your projects";
    document.getElementById("crumb").innerHTML = where + ' <i>/</i> <b></b>';
    document.querySelector("#crumb b").textContent = p.title;

    host.textContent = "";
    var wrap = el("div", "wide");
    var file = el("div", "file");
    var head = el("div", "file__h");
    head.innerHTML = ring(pr.done, pr.total) +
      '<div><p class="h3"></p><p class="file__m"></p></div>' +
      '<div class="file__act">' +
      '<button class="btn btn--quiet" type="button" data-act="export-project">Markdown</button>' +
      '<button class="btn btn--quiet" type="button" data-act="export-csv">Template</button>' +
      '<label class="btn btn--quiet" for="csv-in" title="Import a Todoist template">Import</label>' +
      '<input id="csv-in" type="file" accept=".csv,text/csv" hidden>' +
      '<button class="btn btn--danger" type="button" data-act="reset">Reset to seed</button></div>';
    head.querySelector(".h3").textContent = p.title;
    head.querySelector(".file__m").textContent =
      (p.own ? "your own file" : "seed " + p.seed) + " · opened " + hhmm(p.opened) + " · " +
      state.records.filter(function (r) { return r.project === p.seed; }).length + " records";
    file.appendChild(head);
    file.appendChild(toolbar(p, host));

    var csvIn = head.querySelector("#csv-in");
    if (csvIn) csvIn.addEventListener("change", function () {
      var f = csvIn.files && csvIn.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var n = fromTemplate(p, String(rd.result));
        if (!n) { say("Nothing in that file looked like a task.", "warn"); return; }
        save(state);
        record("import", "Template imported — " + n + " tasks from " + f.name, p.seed)
          .then(function () { say(n + " tasks imported.", "ok"); drawProject(host, p); paintRail(); });
      };
      rd.readAsText(f);
    });

    if (!p.steps.length) {
      // Eigene Klasse statt des Rasters von .step: das hat vier Spalten, und
      // eine Leerzeile mit drei Zellen landet sonst in der Kästchenspalte.
      var none = el("div", "step--empty");
      none.innerHTML = '<p class="step__t">No steps yet.' +
        '<span class="step__n">Add the first one below. Each step you finish writes a record, ' +
        "exactly as in a Hub file.</span></p>";
      file.appendChild(none);
    }

    renderTasks(file, p, host);
    wrap.appendChild(file);

    host.appendChild(wrap);
  }

  // ---------------------------------------------------------------- Ziehen
  // Volles Ziehen/Ablegen wie bei Todoist: Reihenfolge, Abschnitt, Nestung.
  // Sort: manual speichert die Reihenfolge. Bei due/priority startet Ziehen
  // und schaltet still auf manual, damit die neue Lage nicht verworfen wird.
  var dragId = null;
  var dragKind = null; // "task" | "section"
  function sectionName(p, id) {
    if (!id) return "no section";
    var s = (p.sections || []).filter(function (x) { return x.id === id; })[0];
    return s ? s.name : "no section";
  }
  function clearMarks() {
    document.querySelectorAll(".drop-before,.drop-after,.drop-nest,.is-over,.is-dragging").forEach(function (n) {
      n.classList.remove("drop-before", "drop-after", "drop-nest", "is-over", "is-dragging");
    });
  }
  function ensureManual(p) {
    if (p.sort !== "manual") {
      p.sort = "manual";
      say("Sort set to manual so the new order sticks.", "idle");
    }
  }
  function isAncestor(p, maybeParent, s) {
    var cur = s;
    while (cur && cur.parent_id) {
      if (cur.parent_id === maybeParent.id) return true;
      cur = p.steps.filter(function (x) { return x.id === cur.parent_id; })[0];
    }
    return false;
  }
  function reorder(p, s, targetSection, targetParent, target, after) {
    s.section_id = targetSection || null;
    s.parent_id = targetParent || null;
    // Unteraufgaben folgen dem Eltern-Abschnitt.
    if (s.parent_id) {
      var par = p.steps.filter(function (x) { return x.id === s.parent_id; })[0];
      if (par) s.section_id = par.section_id || null;
    }
    var group = p.steps.filter(function (x) {
      return x !== s && (x.section_id || null) === (s.section_id || null) &&
             (x.parent_id || null) === (s.parent_id || null);
    }).sort(function (a, b) { return a.child_order - b.child_order; });
    var i = target ? group.indexOf(target) : group.length;
    if (i < 0) i = group.length;
    group.splice(target ? (after ? i + 1 : i) : group.length, 0, s);
    group.forEach(function (x, k) { x.child_order = k; });
  }
  // mode: "before" | "after" | "nest" (Unteraufgabe von target)
  function dropTask(p, id, target, mode, sectionId, host) {
    var s = p.steps.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    if (target && (target === s || isAncestor(p, s, target))) return;
    ensureManual(p);
    var fromSec = s.section_id || null;
    var fromPar = s.parent_id || null;
    if (mode === "nest" && target) {
      reorder(p, s, target.section_id, target.id, null, false);
    } else if (target) {
      var after = mode === "after";
      reorder(p, s, target.section_id, target.parent_id, target, after);
    } else {
      reorder(p, s, sectionId, null, null, false);
    }
    // Kinder behalten parent_id; Abschnitt der Kinder mitziehen wenn Top-Level-Eltern.
    p.steps.filter(function (c) { return c.parent_id === s.id; }).forEach(function (c) {
      c.section_id = s.section_id;
    });
    save(state);
    var bits = [];
    if ((s.section_id || null) !== fromSec) bits.push("section " + sectionName(p, s.section_id));
    if ((s.parent_id || null) !== fromPar) bits.push(s.parent_id ? "nested" : "unnested");
    record("move", "Task moved — " + s.content +
           (bits.length ? " (" + bits.join(", ") + ")" : " (order)"),
           p.seed).then(function () {
      say(bits.length ? "Moved (" + bits.join(", ") + ")." : "Order recorded.", "ok");
      drawProject(host, p); paintRail();
    });
  }
  function dropModeFromEvent(node, ev) {
    var r = node.getBoundingClientRect();
    var y = (ev.clientY - r.top) / r.height;
    var x = (ev.clientX - r.left) / r.width;
    // Rechte Hälfte = nesten unter die Zeile (Todoist-Indent-Gefühl).
    if (x > 0.62 && y > 0.2 && y < 0.8) return "nest";
    return y > 0.5 ? "after" : "before";
  }
  function makeDraggable(node, p, s, host) {
    // Nur am Griff greifen — sonst blockieren Klicks auf Box/Prio/Notizen.
    var grip = node.querySelector(".grip");
    if (grip) {
      grip.draggable = true;
      grip.addEventListener("dragstart", function (ev) {
        ensureManual(p);
        dragId = s.id;
        dragKind = "task";
        node.classList.add("is-dragging");
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = "move";
          try { ev.dataTransfer.setData("text/plain", s.id); } catch (e) {}
        }
        ev.stopPropagation();
      });
      grip.addEventListener("dragend", function () {
        dragId = null; dragKind = null; clearMarks();
      });
    }
    node.addEventListener("dragover", function (ev) {
      if (dragKind !== "task" || !dragId || dragId === s.id) return;
      ev.preventDefault();
      ev.stopPropagation();
      var mode = dropModeFromEvent(node, ev);
      node.classList.toggle("drop-before", mode === "before");
      node.classList.toggle("drop-after", mode === "after");
      node.classList.toggle("drop-nest", mode === "nest");
    });
    node.addEventListener("dragleave", function () {
      node.classList.remove("drop-before", "drop-after", "drop-nest");
    });
    node.addEventListener("drop", function (ev) {
      if (dragKind !== "task" || !dragId) return;
      ev.preventDefault(); ev.stopPropagation();
      var mode = node.classList.contains("drop-nest") ? "nest"
        : node.classList.contains("drop-after") ? "after" : "before";
      clearMarks();
      dropTask(p, dragId, s, mode, null, host);
    });
  }
  function makeDropZone(node, p, sectionId, host) {
    node.addEventListener("dragover", function (ev) {
      if (dragKind !== "task" || !dragId) return;
      ev.preventDefault();
      node.classList.add("is-over");
    });
    node.addEventListener("dragleave", function () { node.classList.remove("is-over"); });
    node.addEventListener("drop", function (ev) {
      if (dragKind !== "task" || !dragId) return;
      ev.preventDefault();
      clearMarks();
      dropTask(p, dragId, null, "after", sectionId, host);
    });
  }
  function makeSectionDraggable(node, p, sec, host) {
    if (!sec || !sec.id) return;
    var grip = node.querySelector(".grip") || node;
    grip.draggable = true;
    grip.addEventListener("dragstart", function (ev) {
      dragId = sec.id;
      dragKind = "section";
      node.classList.add("is-dragging");
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = "move";
        try { ev.dataTransfer.setData("text/plain", sec.id); } catch (e) {}
      }
      ev.stopPropagation();
    });
    grip.addEventListener("dragend", function () { dragId = null; dragKind = null; clearMarks(); });
    node.addEventListener("dragover", function (ev) {
      if (dragKind !== "section" || !dragId || dragId === sec.id) return;
      ev.preventDefault();
      var r = node.getBoundingClientRect();
      var after = (ev.clientY - r.top) > r.height / 2;
      node.classList.toggle("drop-after", after);
      node.classList.toggle("drop-before", !after);
    });
    node.addEventListener("dragleave", function () {
      node.classList.remove("drop-before", "drop-after");
    });
    node.addEventListener("drop", function (ev) {
      if (dragKind !== "section" || !dragId || dragId === sec.id) return;
      ev.preventDefault(); ev.stopPropagation();
      var after = node.classList.contains("drop-after");
      clearMarks();
      reorderSections(p, dragId, sec.id, after, host);
    });
  }
  function reorderSections(p, movedId, targetId, after, host) {
    var list = (p.sections || []).slice().sort(function (a, b) {
      return (a.section_order || 0) - (b.section_order || 0);
    });
    var moved = list.filter(function (x) { return x.id === movedId; })[0];
    var target = list.filter(function (x) { return x.id === targetId; })[0];
    if (!moved || !target) return;
    list = list.filter(function (x) { return x !== moved; });
    var i = list.indexOf(target);
    list.splice(after ? i + 1 : i, 0, moved);
    list.forEach(function (x, k) { x.section_order = k; });
    save(state);
    record("move", "Section reordered — " + moved.name, p.seed)
      .then(function () { say("Section order recorded.", "ok"); drawProject(host, p); });
  }

  // ---------------------------------------------------------------- Details
  // Übernommen aus dem Vorbau ~/entrosana-todo-demo/app.js (openDetails).
  // Zwei Unterschiede: das Speichern schreibt eine Aufzeichnung, und die
  // Bahn und der Rang lassen sich hier gleich mitändern.
  function onModalKey(ev) { if (ev.key === "Escape") closeDetails(); }
  function closeDetails() {
    document.removeEventListener("keydown", onModalKey);
    var m = document.getElementById("task-modal");
    if (m) m.remove();
  }
  function openDetails(p, s, host) {
    closeDetails();
    var back = el("div", "modal-back");
    back.id = "task-modal";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-modal", "true");
    back.setAttribute("aria-label", "Task details");

    var box = el("div", "modal");
    box.addEventListener("click", function (ev) { ev.stopPropagation(); });

    var head = el("div", "modal__head");
    head.appendChild(el("h2", "modal__title", s.content || "Task"));
    var x = el("button", "modal__x", "✕");
    x.type = "button"; x.title = "Close";
    x.addEventListener("click", closeDetails);
    head.appendChild(x);
    box.appendChild(head);

    box.appendChild(el("p", "modal__meta",
      laneMeta(laneOf(s)).name + " · priority p" + uiPrio(s) +
      (s.due ? " · due " + (s.due.is_recurring ? s.due.string : s.due.date) : "") +
      (s.labels.length ? " · @" + s.labels.join(" @") : "")));

    box.appendChild(el("label", "modal__label", "Title"));
    var titleIn = el("input", "modal__input");
    titleIn.type = "text"; titleIn.value = s.content;
    box.appendChild(titleIn);

    box.appendChild(el("label", "modal__label", "Description (shown on the card)"));
    var descIn = el("textarea", "modal__area");
    descIn.rows = 3; descIn.value = s.description || "";
    descIn.placeholder = "Short summary visible on the board card…";
    box.appendChild(descIn);

    box.appendChild(el("label", "modal__label", "Detailed instructions"));
    var instIn = el("textarea", "modal__area modal__area--tall");
    instIn.rows = 10; instIn.value = s.instructions || "";
    instIn.placeholder = "Step-by-step instructions, checklist, links, notes for whoever does the work…";
    box.appendChild(instIn);

    box.appendChild(el("label", "modal__label", "Lane"));
    var laneIn = el("select", "modal__input");
    LANES.forEach(function (l) {
      var op = el("option", null, l.name); op.value = l.id;
      if (l.id === laneOf(s)) op.selected = true;
      laneIn.appendChild(op);
    });
    box.appendChild(laneIn);

    box.appendChild(el("label", "modal__label", "What was actually decided"));
    var noteIn = el("input", "modal__input");
    noteIn.type = "text"; noteIn.value = s.note || "";
    box.appendChild(noteIn);

    var foot = el("div", "modal__foot");
    var cancel = el("button", "btn btn--ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", closeDetails);
    var ok = el("button", "btn", "Save");
    ok.type = "button";
    ok.addEventListener("click", function () {
      var title = titleIn.value.trim();
      if (!title) { say("A task needs a title.", "warn"); return; }
      var before = s.content, lane = laneIn.value, laneBefore = laneOf(s);
      var changed = [];
      if (title !== s.content) changed.push("title");
      if (descIn.value.trim() !== (s.description || "")) changed.push("description");
      if (instIn.value !== (s.instructions || "")) changed.push("instructions");
      if (noteIn.value.trim() !== (s.note || "")) changed.push("note");
      s.content = title;
      s.description = descIn.value.trim();
      s.instructions = instIn.value;
      s.note = noteIn.value.trim();
      save(state);
      closeDetails();
      if (lane !== laneBefore) { moveLane(p, s, lane, host); return; }
      if (!changed.length) { say("Nothing changed.", "idle"); drawProject(host, p); return; }
      record("details", "Details changed — " + before +
             (title !== before ? " → " + title : "") +
             " (" + changed.join(", ") + ")", p.seed)
        .then(function () { say("Details recorded.", "ok"); drawProject(host, p); paintRail(); });
    });
    foot.appendChild(cancel); foot.appendChild(ok);
    box.appendChild(foot);

    back.appendChild(box);
    back.addEventListener("click", closeDetails);
    document.body.appendChild(back);
    document.addEventListener("keydown", onModalKey);
    setTimeout(function () { descIn.focus(); }, 0);
  }

  // ---------------------------------------------------------------- Bahnen
  // Aus dem Vorbau ~/entrosana-todo-demo übernommen: vier feste Arbeitsbahnen
  // statt frei benannter Abschnitte. Sie sind zugleich section_id im Sinne der
  // Todoist-Schnittstelle, die Struktur bleibt also dieselbe.
  // Der Unterschied zum Vorbau: jeder Wechsel schreibt eine Aufzeichnung.
  var LANES = [
    { id: "pending",     name: "Pending",       state: "wait" },
    { id: "in_progress", name: "In progress",   state: "run"  },
    { id: "audit",       name: "To be audited", state: "audit" },
    { id: "done",        name: "Done",          state: "ok"   }
  ];
  function laneMeta(id) {
    return LANES.filter(function (l) { return l.id === id; })[0] || LANES[0];
  }
  function laneOf(s) {
    var id = s.section_id;
    return LANES.some(function (l) { return l.id === id; })
      ? id : (s.checked ? "done" : "pending");
  }
  // Die Bahnen sind die Abschnitte. Bestehende Dateien wandern beim Öffnen mit.
  function ensureLanes(p) {
    var have = {};
    (p.sections || []).forEach(function (x) { have[x.id] = x; });
    var missing = LANES.filter(function (l) { return !have[l.id]; });
    if (missing.length) {
      p.sections = LANES.map(function (l, i) {
        return { id: l.id, project_id: p.id, name: l.name, section_order: i };
      });
    }
    var touched = missing.length > 0;
    p.steps.forEach(function (s) {
      var want = laneOf(s);
      if (s.section_id !== want) { s.section_id = want; touched = true; }
    });
    if (touched) save(state);
    return p;
  }
  // Zug in eine Bahn: «Done» setzt das Häkchen, jede andere Bahn nimmt es weg.
  function moveLane(p, s, laneId, host) {
    var from = laneOf(s);
    if (from === laneId) return;
    s.section_id = laneId;
    s.parent_id = null;                     // beim Bahnwechsel wird sie oberste Ebene
    s.checked = laneId === "done";
    s.completed_at = s.checked ? (s.completed_at || new Date().toISOString()) : null;
    var group = p.steps.filter(function (x) {
      return x !== s && !x.parent_id && laneOf(x) === laneId;
    }).sort(function (a, b) { return a.child_order - b.child_order; });
    group.push(s);
    group.forEach(function (x, i) { x.child_order = i; });
    save(state);
    record("lane", "Task moved — " + s.content + ": " +
           laneMeta(from).name + " → " + laneMeta(laneId).name, p.seed)
      .then(function () {
        say("Moved to " + laneMeta(laneId).name + ".", laneId === "done" ? "ok" : "idle");
        drawProject(host, p); paintRail();
      });
  }

  // ---------------------------------------------------------------- Verwaltung
  function prefs(p) {
    if (!p.view_style) p.view_style = "list";      // wie in der Schnittstelle
    if (!p.sort) p.sort = "manual";
    if (p.show_completed == null) p.show_completed = true;
    return p;
  }
  function sortTasks(list, mode) {
    var a = list.slice();
    if (mode === "due") {
      a.sort(function (x, y) {
        var dx = x.due ? x.due.date : "9999-99-99", dy = y.due ? y.due.date : "9999-99-99";
        return dx < dy ? -1 : dx > dy ? 1 : x.child_order - y.child_order;
      });
    } else if (mode === "priority") {
      a.sort(function (x, y) { return y.priority - x.priority || x.child_order - y.child_order; });
    } else {
      a.sort(function (x, y) { return x.child_order - y.child_order; });
    }
    return a;
  }
  function siblings(p, s) {
    return sortTasks(p.steps.filter(function (x) {
      return (x.section_id || null) === (s.section_id || null) &&
             (x.parent_id || null) === (s.parent_id || null);
    }), "manual");
  }
  function move(p, s, dir, host) {
    ensureManual(p);
    var sib = siblings(p, s);
    var i = sib.indexOf(s), j = i + dir;
    if (i < 0 || j < 0 || j >= sib.length) return;
    var a = sib[i].child_order; sib[i].child_order = sib[j].child_order; sib[j].child_order = a;
    save(state); drawProject(host, p);
  }
  // Rang wechseln: UI p1 (höchste) → p2 → p3 → p4 (niedrigste) → p1.
  // Gespeichert wird die API-Zählung (1 niedrig … 4 hoch).
  function cyclePriority(p, s, host) {
    var ui = uiPrio(s);
    var next = ui >= 4 ? 1 : ui + 1;
    s.priority = 5 - next;
    save(state);
    record("edit", "Priority set — " + s.content + " p" + next, p.seed)
      .then(function () { say("Priority p" + next + ".", "ok"); drawProject(host, p); paintRail(); });
  }
  function setPriority(p, s, ui, host) {
    if (!(ui >= 1 && ui <= 4)) return;
    s.priority = 5 - ui;
    save(state);
    record("edit", "Priority set — " + s.content + " p" + ui, p.seed)
      .then(function () { say("Priority p" + ui + ".", "ok"); drawProject(host, p); paintRail(); });
  }
  // Einrücken: Unteraufgabe des vorherigen Geschwisters (Todoist Tab).
  function indent(p, s, host) {
    ensureManual(p);
    var sib = siblings(p, s);
    var i = sib.indexOf(s);
    if (i <= 0) return say("Nothing above to nest under.", "idle");
    var parent = sib[i - 1];
    if (isAncestor(p, s, parent)) return;
    reorder(p, s, parent.section_id, parent.id, null, false);
    save(state);
    record("move", "Task nested — " + s.content + " under " + parent.content, p.seed)
      .then(function () { say("Nested under “" + parent.content + "”.", "ok"); drawProject(host, p); });
  }
  // Ausrücken: eine Stufe hoch, hinter dem bisherigen Elternteil.
  function outdent(p, s, host) {
    if (!s.parent_id) return say("Already at the top level.", "idle");
    ensureManual(p);
    var parent = p.steps.filter(function (x) { return x.id === s.parent_id; })[0];
    if (!parent) { s.parent_id = null; save(state); drawProject(host, p); return; }
    reorder(p, s, parent.section_id, parent.parent_id || null, parent, true);
    save(state);
    record("move", "Task unnested — " + s.content, p.seed)
      .then(function () { say("Moved to top level of the section.", "ok"); drawProject(host, p); });
  }
  function removeTask(p, s, host) {
    var kids = p.steps.filter(function (c) { return c.parent_id === s.id; });
    p.steps = p.steps.filter(function (x) { return x !== s && kids.indexOf(x) < 0; });
    save(state);
    record("delete", "Task deleted — " + s.content +
           (kids.length ? " (with " + kids.length + (kids.length === 1 ? " sub-task)" : " sub-tasks)") : ""), p.seed)
      .then(function () { say("Task deleted.", "warn"); drawProject(host, p); paintRail(); });
  }
  // Aufgabe als Schnelleingabe darstellen, damit man sie mit denselben Zeichen ändert.
  function taskToQuick(p, s) {
    var out = [s.content];
    var sec = (p.sections || []).filter(function (x) { return x.id === s.section_id; })[0];
    if (sec) out.push("#" + sec.name.replace(/\s+/g, "-"));
    s.labels.forEach(function (l) { out.push("@" + l); });
    if (uiPrio(s) < 4) out.push("p" + uiPrio(s));
    if (s.due) out.push(s.due.is_recurring ? s.due.string : s.due.date);
    return out.join(" ");
  }
  function applyQuick(p, s, raw) {
    var q = parseQuick(raw, p);
    if (!q.content) return false;
    s.content = q.content; s.priority = q.priority;
    s.labels = q.labels; s.due = q.due;
    if (q.section_id) s.section_id = q.section_id;
    return true;
  }

  function toolbar(p, host) {
    var bar = el("div", "bar");
    function btn(label, cls, fn, title) {
      var b = el("button", "bar__b" + (cls ? " " + cls : ""), label);
      b.type = "button"; if (title) b.title = title;
      b.addEventListener("click", fn); return b;
    }
    var seg = el("div", "seg");
    ["list", "board"].forEach(function (v) {
      seg.appendChild(btn(v, p.view_style === v ? "is-on" : "", function () {
        p.view_style = v; save(state); drawProject(host, p);
      }, "view_style " + v));
    });
    bar.appendChild(seg);

    var sortWrap = el("label", "bar__sel");
    sortWrap.appendChild(el("span", null, "sort"));
    var sel = el("select");
    [["manual", "manual"], ["due", "due date"], ["priority", "priority"]].forEach(function (o) {
      var op = el("option", null, o[1]); op.value = o[0];
      if (p.sort === o[0]) op.selected = true;
      sel.appendChild(op);
    });
    sel.addEventListener("change", function () { p.sort = sel.value; save(state); drawProject(host, p); });
    sortWrap.appendChild(sel);
    bar.appendChild(sortWrap);

    bar.title = p.sort === "manual"
      ? "Drag ⠿ to reorder. Drop on the right half of a row to nest. Click p to cycle priority."
      : "Dragging a task switches sort to manual so the new order is kept.";
    bar.appendChild(btn(p.show_completed ? "hide done" : "show done", "", function () {
      p.show_completed = !p.show_completed; save(state); drawProject(host, p);
    }));
    bar.appendChild(btn("rename", "", function () {
      var n = prompt("Project name?", p.title);
      if (!n || !n.trim() || n.trim() === p.title) return;
      var old = p.title; p.title = n.trim(); save(state);
      record("rename", "Project renamed — " + old + " → " + p.title, p.seed)
        .then(function () { drawProject(host, p); paintRail(); });
    }));
    return bar;
  }

  // ---------------------------------------------------------------- Ansichten
  function visible(p, list) {
    return p.show_completed ? list : list.filter(function (s) { return !s.checked; });
  }
  function renderTasks(file, p, host) {
    prefs(p);
    if (p.view_style === "board") renderBoard(file, p, host);
    else renderList(file, p, host);
    quickAdd(file, p, host);

    // Das Siegel steht am Rand, nicht als Tafel: eine Zeile in der kleinsten Stufe.
    var seal = el("div", "file__seal");
    seal.innerHTML = '<span>seal</span> <b>…</b> <span></span>';
    seal.querySelectorAll("span")[1].textContent =
      "recomputed from " + p.steps.length + " tasks";
    file.appendChild(seal);
    projectSeal(p).then(function (h) { seal.querySelector("b").textContent = h ? h.slice(0, 10) : "unavailable — needs https"; });
  }

  function orderedSections(p) {
    return (p.sections || []).slice().sort(function (a, b) {
      return (a.section_order || 0) - (b.section_order || 0);
    });
  }
  // Mit festen Bahnen gibt es keinen Rest ohne Abschnitt mehr.
  function laneSections(p) {
    var secs = orderedSections(p);
    var hasLanes = secs.some(function (x) { return x.id === "pending"; });
    return hasLanes ? secs : [{ id: null, name: null }].concat(secs);
  }

  function renderList(file, p, host) {
    // Immer alle Abschnitte zeigen (auch leere), damit man hineinziehen kann.
    var secs = laneSections(p);
    var hasNamed = orderedSections(p).length > 0;
    secs.forEach(function (sec) {
      var mine = visible(p, sortTasks(p.steps.filter(function (s) {
        return (s.section_id || null) === sec.id && !s.parent_id;
      }), p.sort));
      // Ohne benannte Abschnitte: keinen leeren "No section"-Kopf erzwingen.
      if (!sec.id && !mine.length && !hasNamed) {
        /* only empty project body later via quick-add */
      }
      if (sec.id || (hasNamed && !sec.id)) {
        var h = el("div", "sec__h" + (sec.id ? "" : " sec__h--loose"));
        h.setAttribute("data-lane", sec.id || "");
        if (sec.id) {
          var g = el("span", "grip", "⠿");
          g.title = "Drag section";
          g.setAttribute("aria-hidden", "true");
          h.appendChild(g);
        }
        h.appendChild(document.createTextNode(sec.id ? sec.name : "No section"));
        h.appendChild(el("span", "sec__n",
          mine.filter(function (s) { return !s.checked; }).length + " open"));
        makeDropZone(h, p, sec.id, host);
        if (sec.id) makeSectionDraggable(h, p, sec, host);
        // Aus dem Vorbau: jede Bahn lässt sich für sich befüllen.
        var qa = el("button", "sec__add", "+");
        qa.type = "button";
        qa.title = "Add a task in " + sec.name;
        qa.addEventListener("click", function (ev) {
          ev.stopPropagation();
          var inp = el("input", "sec__addin");
          inp.type = "text";
          inp.placeholder = "Task in " + sec.name + "\u2026  @label  p1  today";
          inp.addEventListener("keydown", function (e2) {
            if (e2.key === "Escape") { drawProject(host, p); return; }
            if (e2.key !== "Enter" || !inp.value.trim()) return;
            addTask(p, inp.value, host, sec.id);
          });
          h.parentNode.insertBefore(inp, h.nextSibling);
          inp.focus();
        });
        h.appendChild(qa);
        file.appendChild(h);
      }
      var zone = el("div", "sec__body");
      zone.setAttribute("data-section", sec.id || "");
      makeDropZone(zone, p, sec.id, host);
      if (!mine.length) {
        var empty = el("div", "sec__empty", "Drop tasks here, or move a task into this lane");
        zone.appendChild(empty);
      }
      mine.forEach(function (s) {
        zone.appendChild(taskRow(p, s, host, false));
        visible(p, sortTasks(p.steps.filter(function (c) { return c.parent_id === s.id; }), p.sort))
          .forEach(function (c) { zone.appendChild(taskRow(p, c, host, true)); });
      });
      // Leere unbenannte Zone nur, wenn es Abschnitte gibt oder gar keine Tasks.
      if (sec.id || mine.length || hasNamed || !p.steps.length) file.appendChild(zone);
    });
  }

  // Brettansicht nach dem Vorbau ~/entrosana-todo-demo (boardView + taskRow):
  // Spalte mit Kopf, Körper als Ablagefläche, «Drop here» wenn leer, «+ Add»
  // im Körper. Die Karte hat links eine stehende Leiste aus Griff, Rangfahne
  // und Kreis, rechts den Körper. Der Kreis schiebt in die Bahn «Done».
  function boardCard(p, s, host) {
    var card = el("div", "task" + (laneOf(s) === "done" ? " done" : ""));
    card.setAttribute("data-id", s.id);

    var rail = el("div", "task__rail");
    var grip = el("span", "grip", "⠿");
    grip.title = "Drag to another column";
    grip.setAttribute("aria-label", "Drag handle");
    rail.appendChild(grip);

    var ui = uiPrio(s);
    var prio = el("button", "prio prio--" + ui, "p" + ui);
    prio.type = "button";
    prio.title = "Priority — click to cycle p1 (highest) to p4 (lowest)";
    prio.setAttribute("aria-label", "Priority p" + ui + ", click to change");
    prio.addEventListener("click", function (ev) { ev.stopPropagation(); cyclePriority(p, s, host); });
    rail.appendChild(prio);

    var check = el("button", "check" + (s.checked ? " on" : ""));
    check.type = "button";
    check.title = laneOf(s) === "done" ? "Done — click to reopen" : "Mark done (moves to Done)";
    check.setAttribute("aria-label", s.checked ? "Mark not done" : "Mark done");
    check.addEventListener("click", function (ev) {
      ev.stopPropagation();
      moveLane(p, s, laneOf(s) === "done" ? "pending" : "done", host);
    });
    rail.appendChild(check);
    card.appendChild(rail);

    var body = el("div", "task__body");
    var title = el("p", "task__content", s.content);
    title.title = "Open details";
    title.addEventListener("click", function () { openDetails(p, s, host); });
    body.appendChild(title);
    if (s.description) body.appendChild(el("p", "task__desc", s.description));

    var meta = el("div", "task__meta");
    if (s.due) {
      meta.appendChild(el("span", "due " + dueClass(s.due, s.checked), dueLabel(s.due)));
      if (s.due.is_recurring) meta.appendChild(el("span", "rep", s.due.string));
    }
    s.labels.forEach(function (l) { meta.appendChild(el("span", "lbl", l)); });
    var kids = p.steps.filter(function (c) { return c.parent_id === s.id; });
    if (kids.length) meta.appendChild(el("span", "rep2",
      kids.filter(function (c) { return c.checked; }).length + "/" + kids.length + " sub"));
    if (s.instructions) meta.appendChild(el("span", "rep2", "has instructions"));

    var lane = el("select", "lane");
    LANES.forEach(function (l) {
      var op = el("option", null, l.name);
      op.value = l.id;
      if (l.id === laneOf(s)) op.selected = true;
      lane.appendChild(op);
    });
    lane.title = "Move to another lane";
    lane.addEventListener("click", function (ev) { ev.stopPropagation(); });
    lane.addEventListener("change", function () { moveLane(p, s, lane.value, host); });
    meta.appendChild(lane);
    body.appendChild(meta);
    card.appendChild(body);

    var act = el("div", "task__actions");
    function ab(label, title, fn) {
      var b = el("button", "act", label); b.type = "button"; b.title = title;
      b.addEventListener("click", function (ev) { ev.stopPropagation(); fn(); });
      return b;
    }
    act.appendChild(ab("ⓘ", "Details", function () { openDetails(p, s, host); }));
    act.appendChild(ab("↑", "Move up", function () { move(p, s, -1, host); }));
    act.appendChild(ab("↓", "Move down", function () { move(p, s, 1, host); }));
    act.appendChild(ab("✕", "Delete", function () {
      if (confirm("Delete “" + s.content + "”?")) removeTask(p, s, host);
    }));
    card.appendChild(act);

    makeDraggable(card, p, s, host);
    return card;
  }

  function renderBoard(file, p, host) {
    var board = el("div", "board");
    laneSections(p).forEach(function (sec) {
      if (sec.id === "done" && !p.show_completed) return;
      var mine = visible(p, sortTasks(p.steps.filter(function (s) {
        return (s.section_id || null) === sec.id && !s.parent_id;
      }), p.sort));

      var col = el("div", "col");
      col.setAttribute("data-section", sec.id || "");

      var h = el("div", "col__h");
      h.setAttribute("data-lane", sec.id || "");
      var badge = el("span", "sec__badge");
      badge.setAttribute("data-lane", sec.id || "");
      h.appendChild(badge);
      h.appendChild(document.createTextNode(sec.name));
      h.appendChild(el("span", "col__cnt", String(mine.length)));
      col.appendChild(h);

      var body = el("div", "col__body");
      makeDropZone(body, p, sec.id, host);
      mine.forEach(function (s) { body.appendChild(boardCard(p, s, host)); });
      if (!mine.length) body.appendChild(el("div", "sec__empty", "Drop here"));

      var add = el("button", "col__add", "+ Add");
      add.type = "button";
      add.addEventListener("click", function () {
        add.replaceWith((function () {
          var inp = el("input", "col__addin");
          inp.type = "text";
          inp.placeholder = "Task in " + sec.name + "…  @label  p1  today";
          inp.addEventListener("keydown", function (ev) {
            if (ev.key === "Escape") { drawProject(host, p); return; }
            if (ev.key !== "Enter" || !inp.value.trim()) return;
            addTask(p, inp.value, host, sec.id);
          });
          setTimeout(function () { inp.focus(); }, 0);
          return inp;
        })());
      });
      body.appendChild(add);

      col.appendChild(body);
      board.appendChild(col);
    });
    file.appendChild(board);
  }
  function taskRow(p, s, host, isSub) {
    var row = el("div", "step" + (s.checked ? " done" : "") + (isSub ? " step--sub" : ""));

    var grip = el("span", "grip", "⠿");
    grip.title = "Drag to reorder · drop on right half to nest";
    grip.setAttribute("aria-label", "Drag handle");
    row.appendChild(grip);

    var box = el("button", "box" + (s.checked ? " on" : ""), s.checked ? "✓" : "");
    box.type = "button";
    box.setAttribute("aria-pressed", String(s.checked));
    box.setAttribute("aria-label", (s.checked ? "Undo: " : "Done: ") + s.content);
    box.addEventListener("click", function () { toggle(p, s, host); });
    row.appendChild(box);

    var t = el("p", "step__t");
    var ui = uiPrio(s);
    // p4 (default lowest) has no chip — keeps the row clean; hover shows a set-priority control.
    var pr = el("button", "prio prio--" + ui + " prio--btn" + (ui >= 4 ? " prio--idle" : ""),
      ui < 4 ? "p" + ui : "");
    pr.type = "button";
    pr.title = "Priority: click to cycle p1 (highest) → p4 (lowest)";
    pr.setAttribute("aria-label", "Priority p" + ui);
    pr.addEventListener("click", function (ev) {
      ev.stopPropagation(); cyclePriority(p, s, host);
    });
    pr.addEventListener("contextmenu", function (ev) {
      ev.preventDefault();
      var n = prompt("Priority p1 (highest) … p4 (lowest)", String(ui));
      if (!n) return;
      setPriority(p, s, parseInt(n, 10), host);
    });
    t.appendChild(pr);
    t.appendChild(document.createTextNode(" "));
    t.appendChild(document.createTextNode(s.content));
    if (s.description) t.appendChild(el("span", "step__n", s.description));
    if (s.due || s.labels.length) {
      var meta = el("div", "meta");
      if (s.due) {
        meta.appendChild(el("span", "due " + dueClass(s.due, s.checked), dueLabel(s.due)));
        if (s.due.is_recurring) meta.appendChild(el("span", "rep", s.due.string));
      }
      s.labels.forEach(function (l) { meta.appendChild(el("span", "lbl", l)); });
      t.appendChild(meta);
    }
    row.appendChild(t);

    var right = el("div", "step__side");
    right.appendChild(el("span", "step__r" + (s.completed_at ? " has" : ""),
      s.completed_at ? hhmm(s.completed_at) : "no record yet"));
    var act = el("div", "step__act");
    function ab(label, title, fn) {
      var b = el("button", "act", label); b.type = "button"; b.title = title;
      b.addEventListener("click", fn); return b;
    }
    act.appendChild(ab("✎", "Edit (quick syntax)", function () { editRow(p, s, host, row); }));
    act.appendChild(ab("ⓘ", "Details", function () { openDetails(p, s, host); }));
    act.appendChild(ab("↑", "Move up", function () { move(p, s, -1, host); }));
    act.appendChild(ab("↓", "Move down", function () { move(p, s, 1, host); }));
    act.appendChild(ab("↳", "Indent — nest under task above", function () { indent(p, s, host); }));
    act.appendChild(ab("↰", "Outdent — leave parent", function () { outdent(p, s, host); }));
    act.appendChild(ab("✕", "Delete", function () {
      if (confirm("Delete “" + s.content + "”?")) removeTask(p, s, host);
    }));
    right.appendChild(act);
    row.appendChild(right);

    var lane = el("select", "lane");
    LANES.forEach(function (l) {
      var op = el("option", null, l.name);
      op.value = l.id;
      if (l.id === laneOf(s)) op.selected = true;
      lane.appendChild(op);
    });
    lane.title = "Move to another lane";
    lane.addEventListener("click", function (ev) { ev.stopPropagation(); });
    lane.addEventListener("change", function () { moveLane(p, s, lane.value, host); });
    right.appendChild(lane);

    var note = el("div", "step__note");
    var ni = el("input");
    ni.type = "text";
    ni.value = s.note || "";
    ni.placeholder = "add what you actually decided";
    ni.addEventListener("change", function () {
      s.note = ni.value.trim();
      save(state);
      record("note", (s.note ? "Note on “" + s.content + "”: " + s.note
                             : "Note cleared on “" + s.content + "”"), p.seed)
        .then(function () { say("Note recorded.", "ok"); paintRail(); });
    });
    note.appendChild(ni);
    row.appendChild(note);
    makeDraggable(row, p, s, host);
    return row;
  }

  function editRow(p, s, host, row) {
    var box = el("div", "edit");
    var inp = el("input");
    inp.type = "text";
    inp.value = taskToQuick(p, s);
    var hint = el("span", "edit__h", "Enter saves, Esc cancels");
    box.appendChild(inp); box.appendChild(hint);
    row.replaceWith(box);
    inp.focus(); inp.select();
    inp.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { drawProject(host, p); return; }
      if (ev.key !== "Enter") return;
      var before = s.content;
      if (!applyQuick(p, s, inp.value)) { drawProject(host, p); return; }
      save(state);
      record("edit", "Task changed — " + before +
             (before === s.content ? "" : " → " + s.content), p.seed)
        .then(function () { say("Change recorded.", "ok"); drawProject(host, p); paintRail(); });
    });
  }

  function quickAdd(file, p, host) {
    var qa = el("div", "qa");
    var inp = el("input");
    inp.type = "text";
    inp.placeholder = "Add a task…  #Section  @label  p1  today  every week  ·  “> ” makes a sub-task";
    inp.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" || !inp.value.trim()) return;
      addTask(p, inp.value, host);
      inp.value = "";
    });
    qa.appendChild(inp);
    qa.appendChild(el("p", "qa__hint",
      "Enter adds it. p1 is the highest rank and p4 the lowest, @ is a label, # a section, " +
      "and a weekday, a date or “every week” sets the due day."));
    file.appendChild(qa);
  }

  function addTask(p, raw, host, forceLane) {
    var q = parseQuick(raw, p);
    if (!q.content) return;
    var parent_id = null;
    if (q.sub) {
      var tops = p.steps.filter(function (x) { return !x.parent_id; });
      if (tops.length) parent_id = tops[tops.length - 1].id;
    }
    var s = normTask({
      id: "t" + Date.now().toString(36), content: q.content,
      priority: q.priority, due: q.due, labels: q.labels,
      section_id: forceLane || q.section_id, parent_id: parent_id,
      child_order: p.steps.length
    }, p.steps.length);
    p.steps.push(s);
    save(state);
    var what = "Task added — " + s.content +
      (s.due ? " (due " + s.due.date + (s.due.is_recurring ? ", " + s.due.string : "") + ")" : "") +
      (uiPrio(s) < 4 ? " [p" + uiPrio(s) + "]" : "") +
      (s.labels.length ? " @" + s.labels.join(" @") : "");
    record("add", what, p.seed).then(function () {
      say("Task added.", "ok"); drawProject(host, p); paintRail();
    });
  }

  function toggle(p, s, host) {
    var wasOpen = !s.checked;
    s.checked = !s.checked;
    s.completed_at = s.checked ? new Date().toISOString() : null;
    // Das Häkchen und die Bahn sind dasselbe: erledigt heisst Bahn «Done».
    s.section_id = s.checked ? "done" : (laneOf(s) === "done" ? "pending" : laneOf(s));

    // Wiederkehrendes bleibt offen, der Termin rückt weiter. So macht es Todoist.
    var moved = null;
    if (s.checked && s.due && s.due.is_recurring) {
      moved = nextDue(s.due);
      if (moved) { s.due = moved; s.checked = false; s.completed_at = null; }
    }
    save(state);

    var text = moved
      ? "Occurrence done — " + s.content + ", next " + moved.date
      : (wasOpen ? "Step done — " : "Step reopened — ") + s.content;
    record(moved ? "done" : (wasOpen ? "done" : "undone"), text, p.seed).then(function () {
      say(moved ? "Recorded. Next occurrence " + moved.date + "."
                : (wasOpen ? "Record written." : "Record written, step reopened."), "ok");
      drawProject(host, p);
      paintRail();
    });
  }

  function markdown(p) {
    var pr = progress(p);
    var out = ["# " + p.title, "", "seed: " + p.seed, "opened: " + p.opened,
               "progress: " + pr.done + "/" + pr.total, ""];
    function line(s, indent) {
      var bits = [];
      if (uiPrio(s) < 4) bits.push("p" + uiPrio(s));
      if (s.due) bits.push(s.due.is_recurring ? s.due.string : s.due.date);
      s.labels.forEach(function (l) { bits.push("@" + l); });
      out.push(indent + "- [" + (s.checked ? "x" : " ") + "] " + s.content +
               (bits.length ? "  " + bits.join(" ") : "") +
               (s.completed_at ? "  (" + s.completed_at + ")" : ""));
      if (s.description) out.push(indent + "      " + s.description);
      if (s.note) out.push(indent + "      note: " + s.note);
    }
    laneSections(p).forEach(function (sec) {
      var mine = p.steps.filter(function (s) {
        return (s.section_id || null) === sec.id && !s.parent_id;
      }).sort(function (a, b) { return a.child_order - b.child_order; });
      if (!mine.length) return;
      if (sec.id) out.push("", "## " + sec.name, "");
      mine.forEach(function (s) {
        line(s, "");
        p.steps.filter(function (c) { return c.parent_id === s.id; })
          .sort(function (a, b) { return a.child_order - b.child_order; })
          .forEach(function (c) { line(c, "  "); });
      });
    });
    out.push("", "## Records", "");
    state.records.filter(function (r) { return r.project === p.seed; }).forEach(function (r) {
      out.push("- " + r.t + "  " + (r.h || "").slice(0, 8) + "  " + r.text);
    });
    return out.join("\n") + "\n";
  }

  // ---------------------------------------------------------------- Vorlage
  // Todoist-Vorlagenformat. Achtung auf die Spalte PRIORITY: dort ist leer
  // gleich p1 und 4 gleich p4, also die umgekehrte Zählung zur Schnittstelle.
  var CSV_COLS = ["TYPE", "CONTENT", "DESCRIPTION", "PRIORITY", "INDENT",
                  "AUTHOR", "RESPONSIBLE", "DATE", "DATE_LANG", "TIMEZONE"];
  function csvCell(v) {
    v = v == null ? "" : String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function toTemplate(p) {
    var rows = [CSV_COLS.join(",")];
    function push(o) { rows.push(CSV_COLS.map(function (c) { return csvCell(o[c]); }).join(",")); }
    function task(s, indent) {
      var content = s.content + s.labels.map(function (l) { return " @" + l; }).join("");
      var ui = uiPrio(s);
      push({ TYPE: "task", CONTENT: content, DESCRIPTION: s.description,
             PRIORITY: ui === 1 ? "" : String(ui), INDENT: String(indent),
             DATE: s.due ? (s.due.is_recurring ? s.due.string : s.due.date) : "",
             DATE_LANG: s.due ? "en" : "", TIMEZONE: "" });
      if (s.note) push({ TYPE: "note", CONTENT: s.note });
    }
    laneSections(p).forEach(function (sec) {
      var mine = p.steps.filter(function (s) {
        return (s.section_id || null) === sec.id && !s.parent_id;
      }).sort(function (a, b) { return a.child_order - b.child_order; });
      if (!mine.length) return;
      if (sec.id) push({ TYPE: "section", CONTENT: sec.name });
      mine.forEach(function (s) {
        task(s, 1);
        p.steps.filter(function (c) { return c.parent_id === s.id; })
          .sort(function (a, b) { return a.child_order - b.child_order; })
          .forEach(function (c) { task(c, 2); });
      });
    });
    return rows.join("\n") + "\n";
  }
  function splitCsv(line) {
    var out = [], cur = "", q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }
  function fromTemplate(p, text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ""; });
    if (!lines.length) return 0;
    var head = splitCsv(lines.shift()).map(function (h) { return h.trim().toUpperCase(); });
    var ix = {}; head.forEach(function (h, i) { ix[h] = i; });
    var section_id = null, lastTop = null, lastAny = null, added = 0;
    lines.forEach(function (l) {
      var c = splitCsv(l);
      var type = (c[ix.TYPE] || "").trim().toLowerCase();
      var content = (c[ix.CONTENT] || "").trim();
      if (type === "section") {
        // Gleicher Name, gleicher Abschnitt: sonst steht er nach jeder Einfuhr doppelt da.
        var sec = p.sections.filter(function (x) {
          return x.name.toLowerCase() === content.toLowerCase();
        })[0];
        if (!sec) {
          sec = { id: "sec" + Date.now().toString(36) + p.sections.length,
                  project_id: p.id, name: content, section_order: p.sections.length };
          p.sections.push(sec);
        }
        section_id = sec.id; return;
      }
      if (type === "note") {
        // Die Notiz gehört an die Zeile davor, gleich auf welcher Stufe.
        if (lastAny) lastAny.note = content;
        return;
      }
      if (type !== "task" || !content) return;
      var labels = [];
      content = content.replace(/@([^\s@#]+)/g, function (_, l) { labels.push(l); return " "; })
                       .replace(/\s+/g, " ").trim();
      var uiP = parseInt((c[ix.PRIORITY] || "").trim(), 10);
      if (!(uiP >= 1 && uiP <= 4)) uiP = 1;                 // leer bedeutet p1
      var indent = parseInt((c[ix.INDENT] || "1").trim(), 10) || 1;
      var dateStr = (c[ix.DATE] || "").trim();
      var due = null;
      if (dateStr) {
        var m = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
        due = { date: m ? dateStr : todayISO(), string: dateStr,
                is_recurring: /^every\b/i.test(dateStr), lang: "en", timezone: null };
      }
      var s = normTask({
        id: "t" + Date.now().toString(36) + p.steps.length,
        content: content, description: (c[ix.DESCRIPTION] || "").trim(),
        priority: 5 - uiP, due: due, labels: labels,
        section_id: indent > 1 ? null : section_id,
        parent_id: indent > 1 && lastTop ? lastTop.id : null,
        child_order: p.steps.length
      }, p.steps.length);
      p.steps.push(s); added++;
      lastAny = s;
      if (indent === 1) lastTop = s;
    });
    return added;
  }

  function markdownTrail() {
    var out = ["# entrosana.app — record trail", "", "records: " + state.records.length, ""];
    state.records.forEach(function (r) {
      out.push("- " + r.t + "  " + (r.h || "").slice(0, 8) + "  [" + r.kind + "]  " + r.text);
    });
    return out.join("\n") + "\n";
  }

  function paintTrail() {
    var host = document.getElementById("trail");
    if (!host) return;
    var when = new URLSearchParams(location.search).get("when");
    var rows = state.records.slice().reverse();
    if (when === "today") rows = rows.filter(function (r) { return isToday(r.t); });
    if (!rows.length) {
      host.innerHTML = '<div class="card empty"><span class="eyebrow">Empty</span>' +
        "<h4>Nothing recorded yet.</h4><p>A record appears the moment you finish a step.</p>" +
        '<a class="btn" href="/">Back to the workspace</a></div>';
      return;
    }
    var card = el("div", "card"); card.style.padding = "0";
    var tbl = el("table", "tbl");
    tbl.innerHTML = "<thead><tr><th>time</th><th>what happened</th><th>kind</th><th class='num'>seal</th></tr></thead>";
    var body = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr");
      tr.innerHTML = '<td class="svc__p"></td><td class="svc__w"></td><td class="svc__s"></td>' +
        '<td class="svc__p num"></td>';
      tr.children[0].textContent = hhmm(r.t);
      tr.children[1].textContent = r.text;
      tr.children[2].textContent = r.kind;
      tr.children[3].textContent = (r.h || "").slice(0, 6);
      body.appendChild(tr);
    });
    tbl.appendChild(body);
    card.appendChild(tbl);
    host.appendChild(card);

    verifyChain().then(function (ok) {
      var n = ok == null
        ? el("p", "note note--idle", "cannot verify here — seals need HTTPS")
        : el("p", "note note--" + (ok ? "ok" : "warn"),
             ok ? "chain verified · " + state.records.length + " records"
                : "chain broken · a line does not match its predecessor");
      n.style.marginTop = "1rem";
      host.appendChild(n);
    });
  }

  function paintServices() {
    var host = document.getElementById("services");
    if (!host) return;
    var d = window.__services;
    if (!d) {
      host.innerHTML = '<div class="card empty"><span class="eyebrow">No snapshot</span>' +
        "<h4>Nothing has been read yet.</h4><p>Run <span class=\"mono\">tools/services-snapshot.sh</span> on e14.</p></div>";
      return;
    }
    var card = el("div", "card"); card.style.padding = "0";
    var tbl = el("table", "tbl");
    tbl.innerHTML = "<thead><tr><th></th><th>service</th><th>what it serves</th><th>where</th>" +
      "<th class='num'>state</th></tr></thead>";
    var body = el("tbody"), group = null;
    d.services.forEach(function (s) {
      if (s.group !== group) {
        group = s.group;
        var g = el("tr", "svc__grp");
        g.innerHTML = '<td colspan="5"></td>';
        g.children[0].textContent = group;
        body.appendChild(g);
      }
      var tr = el("tr");
      tr.innerHTML = '<td><span class="led led--' + (s.state || "off") + '"></span></td>' +
        '<td class="svc__n"></td><td class="svc__w"></td><td class="svc__p"></td>' +
        '<td class="svc__s ' + (s.state === "ok" ? "ok" : s.state === "warn" ? "warn" : "") + ' num"></td>';
      tr.children[1].textContent = s.name;
      tr.children[2].textContent = s.what;
      tr.children[3].textContent = s.where;
      tr.children[4].textContent = s.status;
      body.appendChild(tr);
      if (s.flag) {
        var f = el("tr");
        f.innerHTML = '<td></td><td colspan="4"><span class="svc__flag"></span></td>';
        f.querySelector(".svc__flag").textContent = s.flag;
        body.appendChild(f);
      }
    });
    tbl.appendChild(body);
    card.appendChild(tbl);
    host.appendChild(card);

    var meta = el("p", "note note--idle",
      d.host + " · read " + d.read + " · " + d.services.length + " services");
    meta.style.marginTop = "1rem";
    host.appendChild(meta);
  }

  // ---------------------------------------------------------------- Handlungen
  // Ein Knopf je Startdatei: Titel, Schritte, Kennung, «already open». Vorher stand
  // die Schleife nur im Dialog «New project»; seit die Startdateien auch auf
  // /contribute genannt werden, hängt beides an dieser einen Form.
  function seedButton(id) {
    var b = el("button", "pick__seed");
    b.type = "button";
    b.innerHTML = '<span class="pick__t"></span><span class="pick__m"></span>';
    b.querySelector(".pick__t").textContent = seeds[id].title;
    b.querySelector(".pick__m").textContent =
      seeds[id].steps.length + " steps · " + id + (state.projects[id] ? " · already open" : "");
    b.addEventListener("click", function () {
      if (state.projects[id]) { location.href = "/project?p=" + encodeURIComponent(id); return; }
      openProject(id).then(function () { location.href = "/project?p=" + encodeURIComponent(id); });
    });
    return b;
  }

  // Startdateien auf /contribute (Eigentümer 2026-09-11: «take the examples in project
  // and mention them in the contribute section»). Dieselbe Quelle und dieselbe
  // Gruppierung wie der Dialog; data-seed-list nennt die Abschnitte, die drei
  // Hub-Vorhaben stehen darüber schon als Karten.
  function paintSeedList() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-seed-list]"), function (box) {
      var want = (box.getAttribute("data-seed-list") || "").split(",")
        .map(function (s) { return s.trim(); }).filter(Boolean);
      box.textContent = "";
      want.forEach(function (sec) {
        var ids = Object.keys(seeds).filter(function (id) { return seeds[id].section === sec; });
        if (!ids.length) return;
        box.appendChild(el("p", "pick__sec", sec));
        ids.forEach(function (id) { box.appendChild(seedButton(id)); });
      });
    });
  }

  function openPicker() {
    var dlg = document.getElementById("pick");
    var box = document.getElementById("pick-seeds");
    if (!dlg || !box) return;
    box.textContent = "";
    var bySection = {};
    Object.keys(seeds).forEach(function (id) {
      (bySection[seeds[id].section] = bySection[seeds[id].section] || []).push(id);
    });
    Object.keys(bySection).forEach(function (sec) {
      var h = el("p", "pick__sec", sec);
      box.appendChild(h);
      bySection[sec].forEach(function (id) { box.appendChild(seedButton(id)); });
    });
    dlg.showModal();
    document.getElementById("pick-own").value = "";
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-act]");
    if (!t) return;
    var act = t.getAttribute("data-act");
    if (act === "new") { ev.preventDefault(); openPicker(); }
    if (act === "pick-close") { ev.preventDefault(); document.getElementById("pick").close(); }
    if (act === "new-own") {
      ev.preventDefault();
      var title = (document.getElementById("pick-own").value || "").trim();
      if (!title) return say("Give the file a name first.", "idle");
      createOwn(title).then(function (p) { location.href = "/project?p=" + encodeURIComponent(p.id); });
    }
    if (act === "verify") {
      ev.preventDefault();
      if (!state.records.length) return say("Nothing to verify yet.", "idle");
      verifyChain().then(function (ok) {
        if (ok == null) return say("Cannot verify here — seals need HTTPS.", "warn");
        say(ok ? "Chain verified, " + state.records.length + " records match."
               : "Chain broken: a line does not match its predecessor.", ok ? "ok" : "warn");
      });
    }
    if (act === "export") {
      ev.preventDefault();
      if (!state.records.length) return say("Nothing to export yet.", "idle");
      download("entrosana-record-trail.md", markdownTrail()) ? say("Trail exported.", "ok")
        : say("The browser refused the download.", "warn");
    }
    if (act === "export-project") {
      ev.preventDefault();
      var sid = new URLSearchParams(location.search).get("p");
      var p = state.projects[sid];
      if (!p) return say("Nothing to export here.", "idle");
      download(sid.replace("/", "-") + ".md", markdown(p)) ? say("Project exported.", "ok")
        : say("The browser refused the download.", "warn");
    }
    if (act === "export-csv") {
      ev.preventDefault();
      var cid = new URLSearchParams(location.search).get("p");
      var cp = state.projects[cid];
      if (!cp) return say("Nothing to export here.", "idle");
      download(cid.replace("/", "-") + "-template.csv", toTemplate(cp))
        ? say("Template exported. It imports into Todoist as it is.", "ok")
        : say("The browser refused the download.", "warn");
    }
    if (act === "reset") {
      ev.preventDefault();
      var id = new URLSearchParams(location.search).get("p");
      if (!state.projects[id]) return;
      if (!confirm("Reset this file to the state every visitor starts from? The records stay.")) return;
      delete state.projects[id];
      save(state);
      record("reset", "File reset to seed " + id, id).then(function () {
        location.reload();
      });
    }
  });

  // ---------------------------------------------------------------- Start
  paintRail();
  paintWorkspace();
  paintSeedList();
  paintProject();
  paintTrail();
  paintServices();

  // Schmale Nahtstelle für submit.js (Phase 4). Ändert hier nichts, gibt nur
  // die vorhandenen Helfer heraus.
  window.__hub = {
    state: function () { return state; },
    save: function () { save(state); },
    record: record, say: say, markdown: markdown, download: download,
    paint: function (host, p) { drawProject(host, p); paintRail(); }
  };
})();

/* Konto in der Leiste (2026-09-08): liest die Marke der Anmeldung (localStorage
 * entrosana-app:token, gesetzt von /me und /contribute/status) und zeigt Name und
 * Stand statt «Not signed in». Kein Netz: die Marke trägt Name und Stand seit dem
 * letzten Besuch von /me; ist sie abgelaufen, steht wieder «Not signed in». */
(function () {
  "use strict";
  var KEY = "entrosana-app:token", WORDS = { collector: "collector", contributor: "contributor", reviewer: "team", owner: "owner" };
  function read() { try { var t = JSON.parse(localStorage.getItem(KEY) || "null"); return t && t.expires > new Date().toISOString() ? t : null; } catch (e) { return null; } }
  function paint() {
    var t = read();
    Array.prototype.forEach.call(document.querySelectorAll(".rail__acct"), function (a) {
      var name = a.querySelector(".rail__acctname"), sub = a.querySelector(".rail__acctsub"), av = a.querySelector(".rail__avatar");
      if (!name || !sub || !av) return;
      if (t) {
        var label = t.name || t.email || "Signed in";
        name.textContent = label; sub.textContent = (WORDS[t.standing] || "signed in") + (t.name && t.email ? " · " + t.email : "");
        av.textContent = "";
        if (t.avatar && t.id) { var im = document.createElement("img"); im.src = "/api/avatars/" + t.id + "?v=" + encodeURIComponent(t.avatar); im.alt = ""; im.className = "rail__avatarimg"; av.appendChild(im); }
        else av.textContent = label.trim().charAt(0).toUpperCase();
        a.classList.add("is-in"); a.setAttribute("aria-label", "Your account: " + label);
      } else {
        name.textContent = "Not signed in"; sub.textContent = "local device only"; av.textContent = "?";
        a.classList.remove("is-in"); a.setAttribute("aria-label", "Sign in or register");
      }
      // Sichtbarer Knopf darunter: anmelden führt zu /me, abmelden löscht die Marke dieses Geräts.
      var foot = a.parentNode; if (!foot) return;
      var row = foot.querySelector(".rail__auth"); if (!row) { row = document.createElement("div"); row.className = "rail__auth"; foot.appendChild(row); }
      row.textContent = "";
      if (t) {
        var out = document.createElement("button"); out.type = "button"; out.className = "btn btn--ghost rail__authbtn"; out.textContent = "Sign out";
        out.addEventListener("click", function () {
          var h = { "Authorization": "Bearer " + t.token };
          var done = function () { try { localStorage.removeItem(KEY); } catch (e) {} paint(); if (location.pathname === "/me") location.reload(); };
          fetch("/api/me/token", { method: "DELETE", headers: h }).then(done, done);
        });
        row.appendChild(out);
      } else {
        var inn = document.createElement("a"); inn.className = "btn rail__authbtn"; inn.href = "/me"; inn.textContent = "Sign in"; row.appendChild(inn);
        var reg = document.createElement("a"); reg.className = "btn btn--ghost rail__authbtn"; reg.href = "/me"; reg.textContent = "Register"; row.appendChild(reg);
      }
    });
  }
  paint();
  window.addEventListener("storage", function (e) { if (e.key === KEY) paint(); });
  window.__account = { paint: paint, read: read };
})();

