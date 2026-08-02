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
    if (e.state === "running" || e.state === "available") {
      var led = document.createElement("span");
      led.className = "note note--ok";
      led.innerHTML = '<span class="led"></span>';
      led.appendChild(document.createTextNode(e.state === "available" ? "finished" : "running"));
      head.appendChild(led);
    }
    a.appendChild(head);

    var t = document.createElement("p");
    t.className = "mcard__t";
    t.textContent = e.title;
    a.appendChild(t);

    if (e.who) {
      var w = document.createElement("p");
      w.className = "mcard__who";
      w.textContent = e.who;
      a.appendChild(w);
    }

    var l = document.createElement("p");
    l.className = "mcard__l";
    l.textContent = e.lede;
    a.appendChild(l);

    var m = document.createElement("span");
    m.className = "mcard__m";
    var c = document.createElement("span");
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
