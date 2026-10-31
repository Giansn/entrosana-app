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
  // Eigene Module (2026-09-10): wer eingetragen ist oder zum Team gehört, sieht «edit ›» an der Karte.
  var MINE = null, mineWaiters = [];
  (function () {
    var tk = null; try { var raw = JSON.parse(localStorage.getItem("entrosana-app:token") || "null"); tk = raw && raw.expires > new Date().toISOString() ? raw : null; } catch (e) {}
    if (!tk) { MINE = {}; return; }
    fetch("/api/me/modules", { headers: { Authorization: "Bearer " + tk.token } }).then(function (r) { return r.ok ? r.json() : { items: [] }; })
      .then(function (j) { MINE = {}; (j.items || []).forEach(function (m) { MINE[m.slug] = true; }); mineWaiters.forEach(function (f) { f(MINE); }); })
      .catch(function () { MINE = {}; mineWaiters.forEach(function (f) { f(MINE); }); });
  })();
  function withMine(f) { if (MINE) f(MINE); else mineWaiters.push(f); }

  // Ein Modul mit seiner Kontaktzeile: die Karte bleibt ein einziger Link; die Zeile darunter
  // trägt die Profile der Beitragenden, das Datum, die Dateien und den Weg, mitzuwirken.
  function item(section, e) {
    var wrap = document.createElement("div");
    wrap.className = "mitem";
    wrap.appendChild(card(section, e));
    // Die Kontaktzeile darunter nennt die Beitragenden; die Autorzeile der Karte stünde doppelt (2026-10-31).
    var byLine = wrap.querySelector(".mcard__by"); if (byLine) byLine.remove();
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
      var mail = document.createElement("a"); mail.href = "mailto:info@entrosana.com?subject=" + encodeURIComponent("Contribution to " + (e.title || e.slug)); mail.textContent = "info@entrosana.com"; c.appendChild(mail);
      c.appendChild(document.createTextNode(" · "));
      var tel = document.createElement("a"); tel.href = "tel:+41775297301"; tel.textContent = "077 529 73 01"; c.appendChild(tel);
    }
    paintContact(null);
    withMeta(paintContact);
    // Bearbeiten (2026-09-10): wer darf, bekommt den Knopf auf der Karte selbst, oben rechts über der Kartenfläche.
    withMine(function (mine) {
      if (!mine[e.slug] || wrap.querySelector(".mcard__editbtn")) return;
      wrap.classList.add("mitem--editable");
      var ed = document.createElement("a"); ed.className = "btn btn--ghost mcard__editbtn"; ed.href = "/me/modules#" + e.slug; ed.textContent = "Edit"; ed.setAttribute("aria-label", "Edit " + (e.title || e.slug));
      wrap.appendChild(ed);
    });
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

  // Die Modulkarte ist die eine Form für Module, auch auf der Contributors-Seite (2026-09-10).
  window.__moduleCard = card;

  function paint(box) {
    var section = box.getAttribute("data-cards");
    var only = box.getAttribute("data-track");
    var data = cat[section];
    if (!data) return;
    box.textContent = "";
    var shown = 0;
    data.list.forEach(function (e) {
      if (only && only !== "all" && e.track !== only) return;
      shown++;
      box.appendChild(card(section, e));
    });
    if (!shown) {
      var empty = document.createElement("div");
      empty.className = "card empty";
      empty.innerHTML = "<h4>Nothing here yet.</h4>";
      box.appendChild(empty);
    }
  }

  var boxes = document.querySelectorAll("[data-cards]");
  for (var i = 0; i < boxes.length; i++) paint(boxes[i]);

  // Gebiete als Reiter (2026-09-10): Nature, Social, Technical, je einer zur Zeit. «Other» erscheint nur, wenn dort etwas liegt.
  // Die Wahl bleibt im Gerät; ?area= und #area führen direkt hin, die Gebietseinleitung steht im Reiter oben.
  function areaTabs() {
    var strip = document.querySelector("[data-area-tabs]"), panel = document.querySelector("[data-area-panel]");
    var data = cat.modules;
    if (!strip || !panel || !data) return;
    var K = "entrosana-area:v1";
    var areas = ["nature-based", "social", "technical", "other"].map(function (a) {
      return { id: a, name: AREA_NAME[a], intro: null, mods: [] };
    });
    data.list.forEach(function (e) {
      var a = areas.filter(function (x) { return x.id === areaOf(e); })[0]; if (!a) return;
      if (e.track === "onrequest") a.intro = e; else a.mods.push(e);
    });
    areas = areas.filter(function (a) { return a.id !== "other" || a.mods.length; });
    var EMPTY = { "nature-based": "No nature module yet. Propose one, or ask for one.", social: "No further social module yet. Propose one, or ask for one.", technical: "No technical module yet. Propose one, or ask for one.", other: "" };
    var btns = [];
    areas.forEach(function (a, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "tabs__b"; b.id = "tab-area-" + a.id;
      b.setAttribute("role", "tab"); b.setAttribute("aria-controls", "panel-areas");
      b.appendChild(document.createTextNode(a.name));
      var n = document.createElement("span"); n.className = "tabs__n"; n.textContent = String(a.mods.length); b.appendChild(n);
      // Ein leeres Gebiet ist kein Reiter (Eigentümer 2026-10-31): ausgegraut, nicht klickbar, die 0 bleibt sichtbar.
      if (!a.mods.length) { b.disabled = true; b.classList.add("is-empty"); b.title = "No module in this area yet"; }
      b.addEventListener("click", function () { show(i, true); });
      b.addEventListener("keydown", function (ev) {
        var to = ev.key === "ArrowRight" ? i + 1 : ev.key === "ArrowLeft" ? i - 1 : ev.key === "Home" ? 0 : ev.key === "End" ? areas.length - 1 : -1;
        if (to < 0 && ev.key !== "ArrowLeft") return;
        ev.preventDefault(); to = (to + areas.length) % areas.length;
        var guard = 0; while (!areas[to].mods.length && guard++ < areas.length) to = (to + (ev.key === "ArrowLeft" ? -1 : 1) + areas.length) % areas.length;
        if (!areas[to].mods.length) return;
        show(to, true); btns[to].focus();
      });
      btns.push(b); strip.appendChild(b);
    });
    panel.id = "panel-areas"; panel.setAttribute("role", "tabpanel"); panel.tabIndex = 0;
    function show(idx, remember) {
      var a = areas[idx];
      btns.forEach(function (b, i) { var on = i === idx; b.className = "tabs__b" + (on ? " is-on" : ""); b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
      panel.setAttribute("aria-labelledby", btns[idx].id);
      panel.textContent = "";
      if (a.intro) {
        var intro = document.createElement("div"); intro.className = "area__intro";
        var pth = document.createElement("p"); pth.className = "work__sub measure"; pth.textContent = a.intro.lede || a.intro.about || ""; intro.appendChild(pth);
        var go = document.createElement("a"); go.className = "fine"; go.href = "/modules/" + a.intro.slug; go.textContent = "What this area covers, and how a module is scoped on request ›"; intro.appendChild(go);
        panel.appendChild(intro);
      }
      var grid = document.createElement("div"); grid.className = "cards cards--1";
      a.mods.forEach(function (e) { grid.appendChild(item("modules", e)); });
      if (!a.mods.length) { var empty = document.createElement("p"); empty.className = "note note--idle"; empty.textContent = EMPTY[a.id] || "Nothing here yet."; grid.appendChild(empty); }
      panel.appendChild(grid);
      if (remember) { try { localStorage.setItem(K, a.id); } catch (e) {} if (history.replaceState) history.replaceState(null, "", "/modules?area=" + a.id); }
    }
    var want = new URLSearchParams(location.search).get("area") || (location.hash || "").replace("#", "");
    if (!want) { try { want = localStorage.getItem(K); } catch (e) {} }
    var start = -1;
    areas.forEach(function (a, i) { if (a.id === want) start = i; });
    if (start < 0) { areas.forEach(function (a, i) { if (start < 0 && a.mods.length) start = i; }); }
    show(start < 0 ? 0 : start, false);
  }
  areaTabs();

})();
