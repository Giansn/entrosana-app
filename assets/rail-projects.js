/* Füllt die Projektliste in der Leiste, während die Seite noch geparst wird.
 *
 * Zwei Gründe für dieses Skript. Erstens das Flackern: ohne es trägt erst
 * app.js am Seitenende nach, der Browser zeichnet die leere Gruppe und die
 * Leiste springt bei jedem Wechsel. Zweitens die Quelle: die Projekte liegen
 * im Speicher der Verwaltung (entrosana-todo-demo:v3), nicht im Speicher des
 * Hubs. Vorher las die Leiste je nach Seite eine andere Liste.
 *
 * Auf /project füllt paintNav der Verwaltung dieselbe Gruppe. Dieses Skript
 * schreibt deshalb von sich aus nur, wenn sie noch leer ist.
 *
 * window.__rail() zeichnet auf Zuruf neu. Die Übersicht braucht das: wer dort
 * ein Projekt ablegt, zurückholt oder löscht, soll es sofort in der Leiste
 * sehen und nicht erst nach dem nächsten Seitenwechsel.
 */
(function () {
  "use strict";
  var PROJ = "entrosana-todo-demo:v3";
  var HUB = "entrosana-app:v1";
  var LANES = ["pending", "in_progress", "audit", "done"];

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; }
  }
  function laneOf(t) {
    var id = t.section_id || t.status || "pending";
    return LANES.indexOf(id) >= 0 ? id : (t.checked ? "done" : "pending");
  }

  function male() {
    var box = document.getElementById("projects");
    if (!box) return;
    box.textContent = "";
    var s = read(PROJ);
    var ids = (s ? Object.keys(s.projects || {}) : []).filter(function (id) {
      // Abgelegtes stört hier nicht mehr; es steht auf /projects im Archiv.
      // Das gerade offene Projekt bleibt sichtbar, auch wenn es abgelegt ist,
      // sonst zeigt die Leiste nicht, wo man sich befindet.
      return !s.projects[id].is_archived || id === s.active;
    });
    if (!ids.length) {
      var none = document.createElement("p");
      none.className = "rail__none";
      none.textContent = "none yet";
      box.appendChild(none);
    }
    ids.forEach(function (id) {
      var p = s.projects[id];
      var tasks = p.tasks || [];
      var done = tasks.filter(function (t) { return laneOf(t) === "done"; }).length;
      // Genau die Form, die paintNav der Kopie erzeugt: Punkt, Name als
      // blosser Text, Zähler. Nur so greift auf /project und auf allen
      // anderen Seiten derselbe Regelsatz aus app.css.
      var a = document.createElement("a");
      a.className = "navitem" + (id === s.active ? " is-on" : "");
      a.href = "/project";
      a.appendChild(document.createElement("span")).className = "pdot";
      var nm = document.createElement("span"); nm.className = "navitem__t"; nm.textContent = p.name || "Untitled"; a.appendChild(nm);   // Ellipse statt abgeschnittenem Zähler (2026-09-09)
      var cnt = document.createElement("span");
      cnt.className = "cnt";
      cnt.textContent = done + "/" + tasks.length;
      a.appendChild(cnt);
      a.addEventListener("click", function () {
        // Das angeklickte Projekt aktiv setzen, damit /project es öffnet.
        try {
          var cur = read(PROJ);
          if (cur) { cur.active = id; localStorage.setItem(PROJ, JSON.stringify(cur)); }
        } catch (e) { /* Speicher gesperrt */ }
      });
      box.appendChild(a);
    });
  }

  // Beim Laden nur zeichnen, wenn die Gruppe leer ist: auf /project füllt sie
  // paintNav der Kopie, und zwei Zeichner in derselben Gruppe flackern.
  var erste = document.getElementById("projects");
  if (erste && !erste.children.length) male();
  window.__rail = male;

  // Die Zähler der Aufzeichnungskette kommen weiterhin aus dem Hub-Speicher.
  function set(id, value) {
    var n = document.getElementById(id);
    if (n) n.textContent = value || "";
  }
  var hub = read(HUB);
  if (hub) {
    var recs = hub.records || [];
    set("rec-count", recs.length);
    var heute = new Date().toDateString();
    set("rec-today", recs.filter(function (r) {
      return new Date(r.t).toDateString() === heute;
    }).length);
  }
  // Zähler (2026-09-10): die eigene Liste setzt ihn auf /services; der Schnappschuss von e14 zählt nur für das Team.
  try { var tk = JSON.parse(localStorage.getItem("entrosana-app:token") || "null"); if (window.__services && tk && (tk.standing === "owner" || tk.standing === "reviewer")) set("svc-count", window.__services.services.length); else set("svc-count", ""); } catch (e) { set("svc-count", ""); }

  // Die Projektliste klappt am Eintrag selbst auf und zu; der Zustand
  // übersteht den Seitenwechsel. Standard ist offen. Läuft synchron vor dem
  // ersten Zeichnen, darum blitzt beim Laden kein falscher Zustand auf.
  var wrap = document.getElementById("proj-wrap");
  var chev = document.querySelector(".rail__chev");
  if (wrap && chev) {
    var zu = false;
    try { zu = localStorage.getItem("entrosana-rail:projects") === "closed"; } catch (e) { /* Speicher gesperrt */ }
    if (zu) { wrap.classList.add("is-closed"); chev.setAttribute("aria-expanded", "false"); }
    chev.addEventListener("click", function () {
      var closed = wrap.classList.toggle("is-closed");
      chev.setAttribute("aria-expanded", closed ? "false" : "true");
      try { localStorage.setItem("entrosana-rail:projects", closed ? "closed" : "open"); } catch (e) { /* dito */ }
    });
  }

  // Der Burger unter 760 px klappt die Leiste auf und zu. Hier verdrahtet,
  // weil dieses Skript auf jeder Seite direkt nach der Leiste läuft.
  var burger = document.querySelector(".rail__burger");
  if (burger) burger.addEventListener("click", function () {
    var rail = burger.closest(".rail");
    var open = rail.classList.toggle("is-open");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  });
})();
