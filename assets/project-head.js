/* Verbindet die Kopfzeile der Kopie mit der Pille des Hubs.
 *
 * Statt die Kopfzeile der Kopie nachzubauen, wird die echte .top-Pille benutzt
 * und bekommt deren Werkzeuge hineingehängt. Farbe, Schatten, Radius und
 * Geometrie sind damit buchstäblich dieselben wie auf jeder anderen Seite.
 * Die Kopie zeichnet bei jeder Änderung neu, deshalb der MutationObserver.
 */
(function () {
  "use strict";

  function sync() {
    var top = document.querySelector("header.top");
    var head = document.querySelector(".view__head");
    if (!top || !head) return;

    // Name der Datei in den Pfad der Pille und in den Reiter spiegeln.
    var input = head.querySelector(".view__title input");
    var name = document.getElementById("proj-name");
    if (input && name && name.textContent !== input.value) name.textContent = input.value;
    if (input && input.value && document.title !== input.value) document.title = input.value;

    // Werkzeuge übernehmen, aber nur einmal je Zeichnung.
    var tools = head.querySelector(".view__tools");
    if (tools) {
      var alt = top.querySelector(".view__tools");
      if (alt) alt.remove();
      top.appendChild(tools);
      ablegenUndMenue(tools);
    }
    head.hidden = true;
  }

  /* ---- Ablegen und Löschen ----
     Beides steht im Dreipunktmenü ganz rechts in der Kopfzeile. Ein eigener
     Schalter dafür hat die Pille gesprengt, sobald die Beschriftung länger
     wurde; das Menü braucht dagegen immer nur 1.75 rem.

     Dass ein Projekt fertig ist, zeigt der Punkt am Dreipunktknopf, und der
     Eintrag heisst dann anders. Gelöscht wird nur nach Rückfrage.

     Geschrieben wird hier unmittelbar in den Speicher und sofort danach die
     Seite gewechselt oder neu geladen. Die Kopie hält ihren eigenen Stand im
     Arbeitsspeicher und würde ihn beim nächsten save() zurückschreiben — nach
     dem Wechsel gibt es kein nächstes save() mehr. */
  var KEY = "entrosana-todo-demo:v3";
  var LANES = ["pending", "in_progress", "audit", "done"];

  function lies() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
  }
  function schreibe(fn) {
    try {
      var s = lies();
      if (!s) return;
      fn(s);
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) { /* Speicher gesperrt */ }
  }
  function bahn(t) {
    var id = t.section_id || t.status || "pending";
    return LANES.indexOf(id) >= 0 ? id : (t.checked ? "done" : "pending");
  }
  function nachId(s) {
    // Nach dem Weglegen oder Löschen auf ein Projekt zeigen, das es noch gibt.
    var frei = Object.keys(s.projects).filter(function (i) { return !s.projects[i].is_archived; });
    return frei.length ? frei[0] : (Object.keys(s.projects)[0] || null);
  }

  function ablegenUndMenue(tools) {
    var s = lies();
    var p = s && s.projects ? s.projects[s.active] : null;
    if (!p) return;
    var tasks = p.tasks || [];
    var offen = tasks.filter(function (t) { return bahn(t) !== "done"; }).length;
    var fertig = tasks.length > 0 && offen === 0;
    var name = p.name || "Untitled";

    if (!window.__dlg) return;
    var halter = document.createElement("div");
    halter.className = "top__menu";
    var b = document.createElement("button");
    b.type = "button";
    b.className = "top__more" + (fertig && !p.is_archived ? " top__more--fertig" : "");
    b.textContent = "⋯";
    b.title = fertig && !p.is_archived
      ? "Everything is done — you can archive this project"
      : "Archive or delete this project";
    b.setAttribute("aria-label", "Archive or delete this project");
    b.setAttribute("aria-haspopup", "menu");
    b.setAttribute("aria-expanded", "false");

    var punkte = [];
    if (p.is_archived) {
      punkte.push({ text: "Restore from archive", tun: function () {
        schreibe(function (st) {
          var pr = st.projects[st.active];
          if (!pr) return;
          pr.is_archived = false;
          delete pr.archived_at;
        });
        location.reload();
      } });
    } else {
      // Ist alles erledigt, sagt der Eintrag es auch — das ist der Vorschlag.
      punkte.push({ text: fertig ? "Archive · everything done" : "Archive project",
                    tun: function () {
        schreibe(function (st) {
          var pr = st.projects[st.active];
          if (!pr) return;
          pr.is_archived = true;
          pr.archived_at = new Date().toISOString();
          st.active = nachId(st);
        });
        location.href = "/projects";
      } });
    }
    punkte.push({ text: "Delete project", gefahr: true, tun: function () {
      window.__dlg.frage({
        titel: "Delete “" + name + "”?",
        text: "This removes the project and all its tasks from this device. "
            + "It cannot be undone. To keep it without it being in the way, archive it instead.",
        knopf: "Delete", gefahr: true,
        weiter: function () {
          schreibe(function (st) {
            var weg = st.active;
            delete st.projects[weg];
            st.active = nachId(st);
          });
          location.href = "/projects";
        }
      });
    } });
    window.__dlg.menu(b, punkte);
    halter.appendChild(b);
    tools.appendChild(halter);
  }

  sync();
  var main = document.getElementById("main");
  if (main) new MutationObserver(sync).observe(main, { childList: true, subtree: true });
})();
