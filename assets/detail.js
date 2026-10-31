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
  function fsClass(key) {
    if (!e) return "";
    var row = (window.__catalogueSizes || {})[e.slug] || {};
    var s = row[key];
    if (!s || s === "md") return "";
    return " fs-" + s;
  }

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
  var STATE = { finished: ["note--ok", "finished"], available: ["note--ok", "finished"], running: ["note--ok", "running"],
                development: ["note--dev", "still in development"], idea: ["note--idea", "only an idea"] };
  if (STATE[e.state]) {
    var led = el("span", "note " + STATE[e.state][0]);
    led.appendChild(el("span", "led"));
    led.appendChild(document.createTextNode(STATE[e.state][1]));
    head.appendChild(led);
  }
  b1.appendChild(head);
  b1.appendChild(el("h1", "work__h" + fsClass("title"), e.title));
  if (e.who) b1.appendChild(el("p", "mod__who" + fsClass("who"), e.who));
  if (e.by) b1.appendChild(el("p", "mod__by", "Contributed by " + e.by + (e.updated ? " · last update " + e.updated : "")));
  b1.appendChild(el("p", "mod__lede" + fsClass("lede"), e.lede));
  if (e.draft) {
    b1.appendChild(el("p", "draftnote",
      "Draft page — the wording below is a placeholder until it is replaced."));
  }

  // Was es ist
  var b2 = block();
  b2.appendChild(el("span", "eyebrow", "What it is"));
  b2.appendChild(el("p", "measure" + (e.draft ? " draft" : "") + fsClass("about"), e.about));
  if (e.note) b2.appendChild(el("p", "hint" + fsClass("note"), e.note));

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

  // Zum Mitnehmen. Steht vor «was bleibt», weil es der Grund ist, warum
  // jemand die Seite offen hat.
  if (e.downloads && e.downloads.length) {
    var bd = block();
    bd.appendChild(el("span", "eyebrow", "Take it with you"));
    bd.appendChild(el("p", "work__sub measure",
      "The files sit on entrosana.com."));
    e.downloads.forEach(function (g) {
      bd.appendChild(el("p", "dl__lang", g.lang));
      var row = el("div", "actions");
      g.files.forEach(function (f, i) {
        var a = el("a", i ? "btn btn--ghost" : "btn", f[0]);
        a.href = f[1];
        row.appendChild(a);
      });
      bd.appendChild(row);
    });
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
  if (e.repo) {
    var repo = el("a", "btn", "Open the repository");
    repo.href = e.repo;
    act.appendChild(repo);
  }
  // Punkte und Meldung (2026-09-09): ein Punkt je Konto, umschaltbar; Meldungen gehen per Formular an sygnif@.
  var bp = block(); bp.appendChild(el("span", "eyebrow", "Your word on it"));
  var ptbar = el("div", "ptbar"), ptn = el("span", "note", "…"), ptb = el("button", "btn btn--ghost", "Give a point"); ptb.type = "button";
  var tok = null; try { var tk = JSON.parse(localStorage.getItem("entrosana-app:token") || "null"); tok = tk && tk.expires > new Date().toISOString() ? tk : null; } catch (er) {}
  function paintPoints(n, mine) { ptn.textContent = n === 1 ? "1 point" : n + " points"; ptb.textContent = mine ? "Take your point back" : "Give a point"; ptb.className = "btn " + (mine ? "btn--ghost" : ""); }
  fetch("/api/points", { headers: tok ? { Authorization: "Bearer " + tok.token } : {} }).then(function (r) { return r.json(); })
    .then(function (j) { paintPoints((j.counts || {})[e.slug] || 0, (j.mine || []).indexOf(e.slug) >= 0); }).catch(function () { ptn.textContent = ""; });
  ptb.addEventListener("click", function () {
    if (!tok) { location.href = "/me"; return; }
    fetch("/api/modules/" + e.slug + "/point", { method: "POST", headers: { Authorization: "Bearer " + tok.token } }).then(function (r) { return r.json(); })
      .then(function (j) { if (j.ok) paintPoints(j.points, j.mine); else ptn.textContent = j.error || "not saved"; }).catch(function () { ptn.textContent = "not reachable"; });
  });
  ptbar.appendChild(ptb); ptbar.appendChild(ptn);
  var rep = el("a", "btn btn--quiet", section === "tools" ? "Report this tool" : "Report this module"); rep.href = "/request?kind=report&module=" + encodeURIComponent(e.slug); ptbar.appendChild(rep);
  // Wer das Modul bearbeiten darf (Beitragende, Team), bekommt den Weg dorthin (2026-09-09).
  if (tok) {
    fetch("/api/me/modules/" + e.slug, { headers: { Authorization: "Bearer " + tok.token } }).then(function (r) { if (r.status !== 200) return; var ed = el("a", "btn btn--ghost", "Edit this module"); ed.href = "/me/modules#" + e.slug; ptbar.appendChild(ed); }).catch(function () {});
  }
  bp.appendChild(ptbar);
  bp.appendChild(el("p", "fine", tok ? "One point per account. A report goes to the team with the reason you give." : "Sign in to give a point. A report goes to the team with the reason you give."));

  var ask = el("a", (e.seed || e.repo) ? "btn btn--ghost" : "btn",
               section === "modules"
                 ? (e.downloads ? "Ask us to run it with you" : "Request this module")
                 : "Ask about this tool");
  ask.href = section === "modules" ? "https://entrosana.com/request-access" : "/contribute";
  act.appendChild(ask);
  b6.appendChild(act);
  // Kein Hinweis «makes a copy … on this device» mehr (Eigentümer 2026-09-11: solche Vorspanne verwirren).

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
