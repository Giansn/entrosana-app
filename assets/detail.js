/* Unterseite eines Katalogeintrags, für beide Abteilungen. Der Pfad sagt
   alles: /modules/<slug> und /tools/<slug>. Jeder Slug steht als eigener
   Eintrag in ROUTES und zeigt auf dieselbe Datei — die Allowlist in serve.mjs
   bleibt damit unangetastet, es wird nie ein Pfad aus der Anfrage gebaut. */
(function () {
  var host = document.getElementById("detail");
  if (!host) return;
  var cat = window.__catalogue || {};

  var parts = location.pathname.replace(/^\/|\/$/g, "").split("/");
  var section = parts[0], slug = parts[1] || "";
  var data = cat[section];
  var e = null;
  if (data) data.list.forEach(function (x) { if (x.slug === slug) e = x; });

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function block() { var s = el("section", "block hair"); host.appendChild(s); return s; }

  if (!e) {
    var b = block();
    b.appendChild(el("span", "eyebrow", "Not found"));
    b.appendChild(el("h1", "work__h", "Nothing here under that name."));
    var back = el("a", "btn", "Back to " + (data ? data.title : "the workspace"));
    back.href = data ? "/" + section : "/";
    b.appendChild(back);
    return;
  }

  var trackName = e.track;
  data.tracks.forEach(function (t) { if (t.id === e.track) trackName = t.short || t.name; });
  var seed = (window.__seeds && window.__seeds[e.seed]) || null;

  document.title = e.title + " | entrosana";
  var crumb = document.querySelector(".crumb");
  if (crumb) {
    crumb.textContent = "";
    var up = el("a", "crumb__up", data.title);
    up.href = "/" + section;
    crumb.appendChild(up);
    crumb.appendChild(document.createTextNode(" / "));
    crumb.appendChild(el("b", null, e.title));
  }

  // Kopf
  var b1 = block();
  var back2 = el("a", "mod__back", "‹ All " + data.title.toLowerCase());
  back2.href = "/" + section;
  b1.appendChild(back2);
  var head = el("div", "mcard__head");
  head.appendChild(el("span", "chip chip--head", trackName));
  if (e.state === "running") {
    var led = el("span", "note note--ok");
    led.appendChild(el("span", "led"));
    led.appendChild(document.createTextNode("running"));
    head.appendChild(led);
  }
  b1.appendChild(head);
  b1.appendChild(el("h1", "work__h", e.title));
  b1.appendChild(el("p", "mod__lede", e.lede));
  if (e.draft) {
    b1.appendChild(el("p", "draftnote",
      "Draft page — the wording below is a placeholder until it is replaced."));
  }

  // Was es ist
  var b2 = block();
  b2.appendChild(el("span", "eyebrow", "What it is"));
  b2.appendChild(el("p", "measure" + (e.draft ? " draft" : ""), e.about));
  if (e.note) b2.appendChild(el("p", "hint", e.note));

  // Eckdaten
  if (e.facts && e.facts.length) {
    var b3 = block();
    b3.appendChild(el("span", "eyebrow", "At a glance"));
    var dl = el("dl", "facts" + (e.draft ? " draft" : ""));
    e.facts.forEach(function (p) {
      var d = el("div");
      d.appendChild(el("dt", null, p[0]));
      d.appendChild(el("dd", null, p[1]));
      dl.appendChild(d);
    });
    b3.appendChild(dl);
  }

  // Ablauf aus dem Seed — keine zweite Fassung derselben Schritte
  if (seed && seed.steps && seed.steps.length) {
    var b4 = block();
    b4.appendChild(el("span", "eyebrow", "How it is prepared"));
    b4.appendChild(el("p", "work__sub",
      "The same checklist you can open below. Every tick leaves a record."));
    var ol = el("ol", "steps");
    seed.steps.forEach(function (s) {
      var li = el("li");
      li.appendChild(el("b", null, s.t));
      li.appendChild(el("span", null, s.n));
      ol.appendChild(li);
    });
    b4.appendChild(ol);
  }

  // Was bleibt
  if (e.gets && e.gets.length) {
    var b5 = block();
    b5.appendChild(el("span", "eyebrow", "What the school ends up with"));
    var ul = el("ul", "measure" + (e.draft ? " draft" : ""));
    e.gets.forEach(function (g) { ul.appendChild(el("li", null, g)); });
    b5.appendChild(ul);
  }

  // Handlungen
  var b6 = block();
  var act = el("div", "actions");
  if (e.seed) {
    var open = el("a", "btn", "Open the checklist");
    open.href = "/project?p=" + e.seed;
    act.appendChild(open);
  }
  var ask = el("a", e.seed ? "btn btn--ghost" : "btn", section === "modules" ? "Ask for this module" : "Ask about this tool");
  ask.href = "/contribute";
  act.appendChild(ask);
  b6.appendChild(act);
  if (e.seed) {
    b6.appendChild(el("p", "muted",
      "Opening the checklist makes a copy that is yours, on this device."));
  }

  // Nachbarn
  var others = data.list.filter(function (x) { return x.slug !== e.slug; }).slice(0, 3);
  if (others.length) {
    var b7 = block();
    b7.appendChild(el("span", "eyebrow", "More in " + data.title.toLowerCase()));
    var grid = el("div", "cards");
    others.forEach(function (o) {
      var a = el("a", "mcard");
      a.href = "/" + section + "/" + o.slug;
      a.appendChild(el("p", "mcard__t", o.title));
      a.appendChild(el("p", "mcard__l", o.lede));
      grid.appendChild(a);
    });
    b7.appendChild(grid);
  }
})();
