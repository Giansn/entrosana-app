/* Kartenwand für Modules und Tools. Ein Behälter sagt über data-section,
   welche Abteilung er zeigt, und über data-track, ob nur ein Gleis davon.
   Die ganze Karte ist der Link: auf dem Telefon ist ein Knopf in der Ecke
   das einzige Ziel, das man verfehlen kann. */
(function () {
  var cat = window.__catalogue;
  if (!cat) return;

  function steps(e) {
    var s = window.__seeds && window.__seeds[e.seed];
    return s && s.steps ? s.steps.length : 0;
  }

  // Per-card field letter size from catalogue-sizes.js (slug → { title: "lg", … }).
  function fsClass(e, key) {
    var all = window.__catalogueSizes || {};
    var row = all[e.slug] || {};
    var s = row[key];
    if (!s || s === "md") return "";
    return " fs-" + s;
  }

  // Gebiet eines Eintrags (2026-09-09): ausdrücklich gesetzt, sonst aus der ersten Zeile abgeleitet.
  var AREA_NAME = { "nature-based": "Nature", social: "Social", technical: "Technical", other: "Other" };
  function areaOf(e) {
    if (e.area) return e.area;
    var w = String(e.who || "").toLowerCase();
    if (/^nature/.test(w)) return "nature-based";
    if (/^social/.test(w)) return "social";
    if (/^(technical|code|computing)/.test(w)) return "technical";
    return "other";
  }
  function fileCount(e) { return (e.downloads || []).reduce(function (n, g) { return n + ((g.files || []).length); }, 0); }
  var META = null, metaWaiters = [];
  fetch("/api/modules/meta").then(function (r) { return r.json(); }).then(function (j) { META = j.items || {}; metaWaiters.forEach(function (f) { f(META); }); }).catch(function () { META = {}; metaWaiters.forEach(function (f) { f(META); }); });
  function withMeta(f) { if (META) f(META); else metaWaiters.push(f); }

  // Ein Modul mit seiner Kontaktzeile: die Karte bleibt ein einziger Link; die Zeile darunter
  // trägt die Profile der Beitragenden, das Datum, die Dateien und den Weg, mitzuwirken.
  function item(section, e) {
    var wrap = document.createElement("div");
    wrap.className = "mitem";
    wrap.appendChild(card(section, e));
    var c = document.createElement("p");
    c.className = "mcard__contact";
    function paintContact(meta) {
      c.textContent = "";
      var m = (meta || {})[e.slug] || { contributors: [], points: 0 };
      var byLabel = document.createElement("span"); byLabel.textContent = "Contributor" + ((m.contributors.length || 1) > 1 ? "s" : "") + ": ";
      c.appendChild(byLabel);
      if (m.contributors.length) {
        m.contributors.forEach(function (p, i) {
          if (i) c.appendChild(document.createTextNode(", "));
          var a = document.createElement("a"); a.href = "/p/" + p.id; a.textContent = p.name || ("account " + p.id); c.appendChild(a);
        });
      } else {
        c.appendChild(document.createTextNode(e.by || "entrosana"));
      }
      var upd = document.createElement("span"); upd.className = "mcard__sep"; upd.textContent = " · last update " + (e.updated || "—") + " · " + (fileCount(e) === 1 ? "1 file" : fileCount(e) + " files") + (m.points ? " · " + (m.points === 1 ? "1 point" : m.points + " points") : "");
      c.appendChild(upd);
      var br = document.createElement("br"); c.appendChild(br);
      var contact = document.createElement("span"); contact.textContent = "Contribute to it: ";
      c.appendChild(contact);
      var join = document.createElement("a"); join.href = "/request?kind=contribute&module=" + encodeURIComponent(e.slug); join.textContent = "offer your part ›"; c.appendChild(join);
      c.appendChild(document.createTextNode(" · "));
      var mail = document.createElement("a"); mail.href = "mailto:sygnif@entrosana.com?subject=" + encodeURIComponent("Contribution to " + (e.title || e.slug)); mail.textContent = "sygnif@entrosana.com"; c.appendChild(mail);
      c.appendChild(document.createTextNode(" · "));
      var tel = document.createElement("a"); tel.href = "tel:+41775297301"; tel.textContent = "077 529 73 01"; c.appendChild(tel);
    }
    paintContact(null);
    withMeta(paintContact);
    wrap.appendChild(c);
    return wrap;
  }

  function card(section, e) {
    var a = document.createElement("a");
    a.className = "mcard";
    a.href = "/" + section + "/" + e.slug;

    var head = document.createElement("span");
    head.className = "mcard__head";
    var tracks = cat[section].tracks, name = e.track;
    tracks.forEach(function (t) { if (t.id === e.track) name = t.short || t.name; });
    var chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = name;
    head.appendChild(chip);
    // Stand des Eintrags (2026-09-09): finished/available grün, running grün,
    // development bernstein, idea grau. Gesetzt im Katalog-Editor der Konsole
    // oder von der beitragenden Person auf /me/modules.
    var STATE = { finished: ["note--ok", "finished"], available: ["note--ok", "finished"], running: ["note--ok", "running"],
                  development: ["note--dev", "still in development"], idea: ["note--idea", "only an idea"] };
    var st = STATE[e.state];
    if (st) {
      var led = document.createElement("span");
      led.className = "note " + st[0];
      led.innerHTML = '<span class="led"></span>';
      led.appendChild(document.createTextNode(st[1]));
      head.appendChild(led);
    }
    a.appendChild(head);

    var t = document.createElement("p");
    t.className = "mcard__t" + fsClass(e, "title");
    t.textContent = e.title;
    a.appendChild(t);

    if (e.who) {
      var w = document.createElement("p");
      w.className = "mcard__who" + fsClass(e, "who");
      w.textContent = e.who;
      a.appendChild(w);
    }

    if (e.by) {
      var by = document.createElement("p");
      by.className = "mcard__by";
      by.textContent = "by " + e.by;
      a.appendChild(by);
    }

    var l = document.createElement("p");
    l.className = "mcard__l" + fsClass(e, "lede");
    l.textContent = e.lede;
    a.appendChild(l);

    var m = document.createElement("span");
    m.className = "mcard__m";
    var c = document.createElement("span");
    c.className = (c.className || "") + fsClass(e, "meta");
    c.textContent = [e.seed ? steps(e) + " steps" : "", e.meta]
      .filter(function (x) { return x; }).join(" · ");
    var go = document.createElement("span");
    go.className = "mcard__go";
    go.textContent = "open ›";
    m.appendChild(c);
    m.appendChild(go);
    a.appendChild(m);
    return a;
  }

  // Einleitung eines Gebiets: der Eintrag der Spur «onrequest» beschreibt, was das Gebiet umfasst.
  function paintIntro(box) {
    var area = box.getAttribute("data-area-intro"), data = cat.modules;
    if (!data) return;
    var e = null; data.list.forEach(function (x) { if (x.track === "onrequest" && areaOf(x) === area) e = x; });
    box.textContent = "";
    if (!e) return;
    var pth = document.createElement("p"); pth.className = "work__sub measure"; pth.textContent = e.lede || e.about || "";
    var a = document.createElement("a"); a.className = "fine"; a.href = "/modules/" + e.slug; a.textContent = "What this area covers, and how a module is scoped on request ›";
    box.appendChild(pth); box.appendChild(a);
  }
  var intros = document.querySelectorAll("[data-area-intro]");
  for (var k = 0; k < intros.length; k++) paintIntro(intros[k]);

  function paint(box) {
    var section = box.getAttribute("data-cards");
    var only = box.getAttribute("data-track");
    var area = box.getAttribute("data-area");
    var data = cat[section];
    if (!data) return;
    box.textContent = "";
    var shown = 0;
    data.list.forEach(function (e) {
      if (only && only !== "all" && e.track !== only) return;
      if (area) { if (e.track === "onrequest" || areaOf(e) !== area) return; }
      shown++;
      box.appendChild(area ? item(section, e) : card(section, e));
    });
    if (area && !shown) {
      var secEl = box.closest("[data-area-section]");
      if (secEl && secEl.hasAttribute("hidden")) return;   // «Other» bleibt versteckt, solange es leer ist
    } else if (area && shown) {
      var secShow = box.closest("[data-area-section]"); if (secShow) secShow.removeAttribute("hidden");
    }
    if (!box.children.length && box.getAttribute("data-empty")) {
      var empty = document.createElement("p");
      empty.className = "note note--idle";
      empty.textContent = box.getAttribute("data-empty");
      box.appendChild(empty);
    }
    if (!shown && !box.getAttribute("data-empty")) {   // mit eigenem Leertext keine zweite Leermeldung
      var empty = document.createElement("div");
      empty.className = "card empty";
      empty.innerHTML = "<h4>Nothing here yet.</h4>";
      box.appendChild(empty);
    }
  }

  var boxes = document.querySelectorAll("[data-cards]");
  for (var i = 0; i < boxes.length; i++) paint(boxes[i]);

  // ---- Reiter statt Kartenwand ----
  // Die drei Gebiete standen als drei Karten untereinander; wer vergleichen
  // wollte, musste scrollen. Ein Behälter mit data-tabs zeigt dieselben
  // Einträge, aber einen nach dem anderen: die Auswahl als Reiterband, der
  // Inhalt in der Tafel darunter. Muster wie in den WAI-ARIA-Reitern:
  // tablist/tab/tabpanel, Pfeiltasten wandern, und nur der gewählte Reiter
  // steht im Tabulator-Lauf — sonst hakelt sich die Tastatur durch alle drei.
  var tabbox = document.querySelector("[data-tabs]");
  if (tabbox) tabs(tabbox);

  function tabs(box) {
    var section = box.getAttribute("data-tabs");
    var only = box.getAttribute("data-track");
    var panel = document.querySelector('[data-tabpanel="' + section + '"]');
    var data = cat[section];
    if (!panel || !data) return;
    var items = data.list.filter(function (e) {
      return !only || only === "all" || e.track === only;
    });
    if (!items.length) return;

    var btns = [];
    items.forEach(function (e, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tabs__b";
      b.textContent = e.title;
      b.id = "tab-" + section + "-" + e.slug;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", "panel-" + section);
      b.addEventListener("click", function () { show(i); });
      b.addEventListener("keydown", function (ev) {
        var to = ev.key === "ArrowRight" ? i + 1 : ev.key === "ArrowLeft" ? i - 1
               : ev.key === "Home" ? 0 : ev.key === "End" ? items.length - 1 : -1;
        if (to < 0 && ev.key !== "ArrowLeft") return;
        ev.preventDefault();
        to = (to + items.length) % items.length;
        show(to);
        btns[to].focus();
      });
      btns.push(b);
      box.appendChild(b);
    });

    panel.id = "panel-" + section;
    panel.setAttribute("role", "tabpanel");
    panel.tabIndex = 0;

    function show(idx) {
      var e = items[idx];
      btns.forEach(function (b, i) {
        var on = i === idx;
        b.className = "tabs__b" + (on ? " is-on" : "");
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
      panel.setAttribute("aria-labelledby", btns[idx].id);
      panel.textContent = "";
      if (e.who) panel.appendChild(line("tabpanel__who mono" + fsClass(e, "who"), e.who));
      if (e.lede) panel.appendChild(line("tabpanel__l" + fsClass(e, "lede"), e.lede));
      if (e.about) panel.appendChild(line("tabpanel__a" + fsClass(e, "about"), e.about));
      var go = document.createElement("a");
      go.className = "tabpanel__go";
      go.href = "/" + section + "/" + e.slug;
      go.textContent = "Open " + e.title + " ›";
      panel.appendChild(go);
    }
    function line(cls, text) {
      var n = document.createElement("p");
      n.className = cls;
      n.textContent = text;
      return n;
    }
    show(0);
  }

  // Filterleiste, wenn eine da ist. Zeigt nur an, navigiert nicht: die Karten
  // bleiben dieselben, es fällt nur etwas weg.
  var bar = document.querySelector("[data-filters]");
  if (!bar) return;
  var section = bar.getAttribute("data-filters");
  var target = document.querySelector('[data-cards="' + section + '"]');
  if (!cat[section] || !target) return;
  var all = [{ id: "all", name: "All" }].concat(cat[section].tracks);
  all.forEach(function (t) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = t.name;
    if (t.id === "all") b.className = "is-on";
    b.addEventListener("click", function () {
      var on = bar.querySelectorAll("button");
      for (var i = 0; i < on.length; i++) on[i].className = "";
      b.className = "is-on";
      target.setAttribute("data-track", t.id);
      paint(target);
    });
    bar.appendChild(b);
  });
})();
