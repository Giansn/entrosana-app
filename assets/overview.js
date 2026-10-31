/* Projektübersicht.
 *
 * Liest denselben Speicher wie die Projektverwaltung (entrosana-todo-demo:v3)
 * und zeigt alle Projekte nebeneinander: Fortschritt, offene Aufgaben je Bahn,
 * Rang der dringendsten Aufgabe und wann zuletzt etwas geschah. Ein Klick
 * öffnet das Projekt, indem er es aktiv setzt und auf /project wechselt.
 *
 * Ablegen und Löschen sind zwei verschiedene Dinge und stehen deshalb an zwei
 * verschiedenen Stellen:
 *
 *   Ablegen  bietet sich von selbst an, sobald in einem Projekt nichts mehr
 *            offen ist. Der Schalter erscheint erst dann. Das Projekt bekommt
 *            is_archived und archived_at (dieselben Feldnamen wie in der
 *            Todoist-Schnittstelle), verschwindet aus der Leiste und aus dem
 *            Feld oben und steht unten im Archiv: lesbar, jederzeit zurück.
 *
 *   Löschen  ist nie ein Vorschlag. Es steckt im Dreipunktmenü oben rechts an
 *            der Karte, hinter einer Rückfrage, und ist endgültig.
 */
(function () {
  "use strict";
  var KEY = "entrosana-todo-demo:v3";
  var LANES = [
    { id: "pending", name: "Pending" },
    { id: "in_progress", name: "In progress" },
    { id: "audit", name: "To be audited" },
    { id: "done", name: "Done" }
  ];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
  }
  function write(fn) {
    // Immer frisch lesen, schreiben, zurücklegen: die Verwaltung hält ihren
    // eigenen Stand im Speicher, und wir wollen ihr nichts überbügeln.
    try {
      var s = load();
      if (!s) return null;
      fn(s);
      localStorage.setItem(KEY, JSON.stringify(s));
      // Die Leiste zeigt dieselbe Liste und muss dieselbe Änderung sehen.
      if (window.__rail) window.__rail();
      return s;
    } catch (e) { return null; }
  }
  function laneOf(t) {
    var id = t.section_id || t.status || "pending";
    return LANES.some(function (l) { return l.id === id; }) ? id : (t.checked ? "done" : "pending");
  }
  function uiPrio(t) { return 5 - (t.priority || 1); }
  function when(iso) {
    if (!iso) return "no date";
    var d = new Date(iso), n = new Date();
    var tage = Math.floor((n - d) / 86400000);
    if (d.toDateString() === n.toDateString()) {
      return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    }
    if (tage <= 1) return "yesterday";
    if (tage < 7) return tage + " days ago";
    return d.toISOString().slice(0, 10);
  }
  function ring(done, total) {
    var r = 21.5, c = 2 * Math.PI * r, off = total ? c * (1 - done / total) : c;
    return '<div class="ring"><svg width="50" height="50" viewBox="0 0 50 50">' +
      '<circle cx="25" cy="25" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="3.5"/>' +
      '<circle cx="25" cy="25" r="' + r + '" fill="none" stroke="var(--done)" stroke-width="3.5" ' +
      'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) +
      '" stroke-linecap="round"/></svg><span>' + done + "/" + total + "</span></div>";
  }
  function oeffne(id) {
    write(function (s) { s.active = id; });
    location.href = "/project";
  }
  function archiviere(id) {
    write(function (s) {
      var p = s.projects[id];
      if (!p) return;
      p.is_archived = true;
      p.archived_at = new Date().toISOString();
      // Ein abgelegtes Projekt darf nicht das aktive bleiben, sonst öffnet
      // /project etwas, das in der Leiste nicht mehr steht.
      if (s.active === id) {
        var frei = Object.keys(s.projects).filter(function (i) {
          return !s.projects[i].is_archived;
        });
        s.active = frei.length ? frei[0] : null;
      }
    });
    zeichne();
  }
  function hole(id) {
    write(function (s) {
      var p = s.projects[id];
      if (!p) return;
      p.is_archived = false;
      delete p.archived_at;
      s.active = id;
    });
    zeichne();
  }
  function loesche(id, name) {
    window.__dlg.frage({
      titel: "Delete “" + name + "”?",
      text: "This removes the project and all its tasks from this device. "
          + "It cannot be undone. To keep it without it being in the way, archive it instead.",
      knopf: "Delete", gefahr: true,
      weiter: function () {
        write(function (s) {
          delete s.projects[id];
          if (s.active === id) {
            var frei = Object.keys(s.projects).filter(function (i) {
              return !s.projects[i].is_archived;
            });
            s.active = frei.length ? frei[0] : (Object.keys(s.projects)[0] || null);
          }
        });
        zeichne();
      }
    });
  }
  function dreiPunkte(k) {
    var halter = el("div", "ov__menu");
    var b = el("button", "ov__more" + (k.fertig && !k.abgelegt ? " ov__more--fertig" : ""), "⋯");
    b.type = "button";
    b.title = k.fertig && !k.abgelegt
      ? "Everything is done — you can archive this project"
      : "Archive or delete this project";
    b.setAttribute("aria-label", "Archive or delete " + (k.p.name || "Untitled"));
    b.setAttribute("aria-haspopup", "menu");
    b.setAttribute("aria-expanded", "false");
    var punkte = [];
    if (k.abgelegt) {
      punkte.push({ text: "Restore from archive", tun: function () { hole(k.id); } });
    } else {
      punkte.push({ text: k.fertig ? "Archive · everything done" : "Archive project",
                    tun: function () { archiviere(k.id); } });
    }
    punkte.push({ text: "Delete project", gefahr: true,
                  tun: function () { loesche(k.id, k.p.name || "Untitled"); } });
    window.__dlg.menu(b, punkte);
    halter.appendChild(b);
    return halter;
  }

  var host = document.getElementById("overview");
  if (!host) return;

  function zeichne() {
    host.textContent = "";
    var state = load();
    var ids = state ? Object.keys(state.projects || {}) : [];

    // Kennzahlen je Projekt, einmal für beide Listen.
    var alles = ids.map(function (id) {
      var p = state.projects[id];
      var tasks = p.tasks || [];
      var proBahn = {};
      LANES.forEach(function (l) { proBahn[l.id] = 0; });
      var letzte = p.added_at || null, p1 = 0;
      tasks.forEach(function (t) {
        proBahn[laneOf(t)] = (proBahn[laneOf(t)] || 0) + 1;
        if (uiPrio(t) === 1 && !t.checked) p1++;
        var st = t.completed_at || t.added_at;
        if (st && (!letzte || st > letzte)) letzte = st;
      });
      var done = tasks.filter(function (t) { return laneOf(t) === "done"; }).length;
      return { id: id, p: p, done: done, total: tasks.length, proBahn: proBahn, p1: p1,
               letzte: letzte, fertig: tasks.length > 0 && done === tasks.length,
               abgelegt: !!p.is_archived };
    });
    var aktiv = alles.filter(function (k) { return !k.abgelegt; });
    var archiv = alles.filter(function (k) { return k.abgelegt; });

    if (!alles.length) {
      host.innerHTML = '<div class="card empty"><span class="eyebrow">Empty</span>' +
        "<h4>No projects yet.</h4><p>Open a checklist from one of the three sections, " +
        "or create your own in the project view.</p>" +
        '<a class="btn" href="/project">Go to the project view</a></div>';
      return;
    }

    var offen = 0, gesamt = 0, p1 = 0;
    aktiv.forEach(function (k) { offen += k.total - k.done; gesamt += k.total; p1 += k.p1; });
    var kopf = el("p", "work__sub");
    kopf.textContent = aktiv.length + (aktiv.length === 1 ? " project" : " projects") + " · " +
      offen + " open of " + gesamt + " tasks" +
      (p1 ? " · " + p1 + " at rank p1" : "") +
      (archiv.length ? " · " + archiv.length + " archived" : "");
    host.appendChild(kopf);

    aktiv.sort(function (a, b) { return String(b.letzte || "").localeCompare(String(a.letzte || "")); });
    archiv.sort(function (a, b) {
      return String(b.p.archived_at || "").localeCompare(String(a.p.archived_at || ""));
    });

    if (!aktiv.length) {
      var leer = el("div", "card ov__none");
      leer.appendChild(el("p", "h3", "Nothing open."));
      leer.appendChild(el("p", "ov__m", "Every project is archived. Restore one below, "
        + "or start a new one from the rail."));
      host.appendChild(leer);
    }

    var grid = el("div", "ov");
    aktiv.forEach(function (k) {
      var a = el("div", "card ov__card" + (k.fertig ? " ov__card--fertig" : ""));

      var head = el("div", "ov__head");
      head.innerHTML = ring(k.done, k.total);
      var titel = el("div", "ov__titel");
      titel.appendChild(el("p", "h3", k.p.name || "Untitled"));
      // Der Zähler steht im Ring und je Bahn; hier nur Stand und Datum (2026-10-31).
      titel.appendChild(el("p", "ov__m", (k.fertig ? "all done" : "in progress") + (k.letzte ? " · last activity " + when(k.letzte) : " · not started yet")));
      head.appendChild(titel);
      head.appendChild(dreiPunkte(k));
      a.appendChild(head);

      var bahnen = el("div", "ov__lanes");
      LANES.forEach(function (l) {
        var row = el("div", "ov__lane");
        row.appendChild(el("span", "sec__badge ov__dot"));
        row.lastChild.setAttribute("data-lane", l.id);
        row.appendChild(el("span", "ov__lname", l.name));
        row.appendChild(el("span", "ov__lcount", String(k.proBahn[l.id] || 0)));
        bahnen.appendChild(row);
      });
      a.appendChild(bahnen);

      var fuss = el("div", "ov__foot");
      if (k.p1) fuss.appendChild(el("span", "ov__p1", k.p1 + " at p1"));
      // Der Schalter kommt von selbst, sobald nichts mehr offen ist — und nur dann.
      if (k.fertig) {
        var ab = el("button", "ov__arch", "Archive");
        ab.type = "button";
        ab.title = "Move to the archive. Nothing is deleted.";
        ab.addEventListener("click", function (ev) {
          ev.stopPropagation();
          archiviere(k.id);
        });
        fuss.appendChild(ab);
      }
      var go = el("a", "ov__go", "Open →");
      go.href = "/project";
      go.addEventListener("click", function (ev) { ev.preventDefault(); oeffne(k.id); });
      fuss.appendChild(go);
      a.appendChild(fuss);

      // Die ganze Karte öffnet, die beiden Schalter im Fuss nicht.
      a.addEventListener("click", function (ev) {
        if (ev.target.closest("button,a")) return;
        oeffne(k.id);
      });
      grid.appendChild(a);
    });
    host.appendChild(grid);

    if (!archiv.length) return;

    var trenner = el("p", "eyebrow ov__abschnitt");
    trenner.textContent = "ARCHIVE";   // den Strich davor setzt .eyebrow::before
    host.appendChild(trenner);
    var hinweis = el("p", "work__sub");
    hinweis.textContent = "Out of the way, not gone. Open one to read it, or put it back.";
    host.appendChild(hinweis);

    var liste = el("div", "card ov__archiv");
    archiv.forEach(function (k) {
      var row = el("div", "ov__row");
      row.appendChild(el("span", "pdot"));
      row.appendChild(el("span", "ov__rname", k.p.name || "Untitled"));
      row.appendChild(el("span", "ov__rcount", k.done + "/" + k.total));
      row.appendChild(el("span", "ov__rwhen", "archived " + when(k.p.archived_at)));

      var zurueck = el("button", "ov__back", "Restore");
      zurueck.type = "button";
      zurueck.addEventListener("click", function () { hole(k.id); });
      row.appendChild(zurueck);

      var go = el("a", "ov__go", "Open →");
      go.href = "/project";
      go.addEventListener("click", function (ev) { ev.preventDefault(); oeffne(k.id); });
      row.appendChild(go);
      row.appendChild(dreiPunkte(k));
      liste.appendChild(row);
    });
    host.appendChild(liste);
  }

  zeichne();
})();
