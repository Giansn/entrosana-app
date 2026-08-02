/* Zwei kleine Bausteine, die zwei Seiten brauchen: das Dreipunktmenü und die
 * Rückfrage vor dem Löschen. Beide gehören dem Haus, nicht dem Browser — die
 * eingebauten prompt()- und confirm()-Fenster sehen auf jedem Rechner anders
 * aus und stehen ausserhalb des Entwurfs.
 *
 * Liegt in einer eigenen Datei, weil die Übersicht (/projects) und die
 * Projektansicht (/project) dieselbe Rückfrage stellen und dieselbe Form
 * zeigen sollen. window.__dlg ist die einzige Aussenkante.
 */
(function () {
  "use strict";

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---- Dreipunktmenü ----
     knopf: der Auslöser. eintraege: [{ text, gefahr, tun }] */
  function menu(knopf, eintraege) {
    knopf.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var offen = document.querySelector(".menu");
      if (offen) {
        var warMeins = offen.__quelle === knopf;
        zu();
        if (warMeins) return;
      }
      var box = el("div", "menu");
      box.__quelle = knopf;
      box.setAttribute("role", "menu");
      eintraege.forEach(function (e) {
        var b = el("button", "menu__item" + (e.gefahr ? " menu__item--warn" : ""), e.text);
        b.type = "button";
        b.setAttribute("role", "menuitem");
        b.addEventListener("click", function () { zu(); e.tun(); });
        box.appendChild(b);
      });
      // Der Auslöser trägt die Stellung: position:relative sitzt in app.css.
      knopf.parentNode.appendChild(box);
      knopf.setAttribute("aria-expanded", "true");
      setTimeout(function () {
        document.addEventListener("click", zu);
        document.addEventListener("keydown", aufTaste);
      }, 0);
      var erster = box.querySelector(".menu__item");
      if (erster) erster.focus();
    });

    function aufTaste(ev) { if (ev.key === "Escape") { zu(); knopf.focus(); } }
    function zu() {
      var box = document.querySelector(".menu");
      if (box) box.remove();
      document.querySelectorAll("[aria-expanded]").forEach(function (n) {
        n.setAttribute("aria-expanded", "false");
      });
      document.removeEventListener("click", zu);
      document.removeEventListener("keydown", aufTaste);
    }
  }

  /* ---- Rückfrage ----
     { titel, text, knopf, gefahr, weiter } */
  function frage(o) {
    var alt = document.getElementById("dlg");
    if (alt) alt.remove();
    var back = el("div", "dlg");
    back.id = "dlg";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-modal", "true");
    var box = el("div", "dlg__box");
    box.addEventListener("click", function (ev) { ev.stopPropagation(); });

    box.appendChild(el("h2", "dlg__title", o.titel));
    if (o.text) box.appendChild(el("p", "dlg__text", o.text));

    var foot = el("div", "dlg__foot");
    var ab = el("button", "dlg__cancel", "Cancel");
    ab.type = "button";
    var ok = el("button", "dlg__ok" + (o.gefahr ? " dlg__ok--warn" : ""), o.knopf || "OK");
    ok.type = "button";
    foot.appendChild(ab); foot.appendChild(ok);
    box.appendChild(foot);
    back.appendChild(box);
    document.body.appendChild(back);

    var vorher = document.activeElement;
    function zu() {
      document.removeEventListener("keydown", aufTaste);
      back.remove();
      if (vorher && vorher.focus) vorher.focus();
    }
    function aufTaste(ev) {
      if (ev.key === "Escape") zu();
      if (ev.key === "Enter") { zu(); o.weiter(); }
    }
    ab.addEventListener("click", zu);
    back.addEventListener("click", zu);
    ok.addEventListener("click", function () { zu(); o.weiter(); });
    document.addEventListener("keydown", aufTaste);
    ok.focus();
  }

  window.__dlg = { menu: menu, frage: frage };
})();
