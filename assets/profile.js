/* profile.js — /p/<id>: das öffentliche Profil einer Person, als Portfolio.
 *
 * Ohne Marke lesbar. Kopf mit Bild, Name und Einzeiler, darunter Stand,
 * Beitritt, Ort, Rolle und Sprachen; ein Zahlenband mit dem, was sich belegen
 * lässt; die Biographie als Prosa; die veröffentlichten Module als
 * Schaufenster, angereichert aus dem Katalog per Slug; die öffentlichen
 * Journaleinträge als Zeitleiste. Vorher drei Karten untereinander
 * (umgebaut 2026-09-10, Wunsch des Eigentümers: «wie eine Portfolio-Übersicht»). */
(function () {
  "use strict";
  var host = document.getElementById("profile"); if (!host) return;
  // Zwei Adressen für dieselbe Seite: /p/<id> ist die feste, /contributors/<name>
  // die lesbare. Wer über die Nummer kommt, landet in der Adresszeile auf dem Namen.
  var id = (location.pathname.match(/^\/p\/(\d{1,12})$/) || [])[1];
  var slug = (location.pathname.match(/^\/contributors\/([a-z0-9-]{1,80})$/) || [])[1];
  var WORDS = { collector: "collector", contributor: "contributor", reviewer: "team", owner: "owner" };
  var ROLES = { teacher: "Teacher", student: "Student", parent: "Parent", "social-worker": "Social worker", developer: "Developer", researcher: "Researcher", other: "Other" };
  var STATE = { finished: "finished", available: "finished", development: "in development", idea: "an idea", running: "running" };
  var LANGS = window.__languages || [];
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function langName(c) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === c) return LANGS[i][2] || LANGS[i][1]; return c; }
  function day(iso) { return iso ? String(iso).slice(0, 10) : ""; }
  // Tage wie auf /me: heute, gestern, dann das Datum.
  function dayLabel(iso) { var d = day(iso), today = new Date().toISOString().slice(0, 10), yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10); return d === today ? "Today" : d === yest ? "Yesterday" : d.slice(5); }
  function block(eyebrow, h, sub) { var s = el("section", "block"); if (eyebrow) s.appendChild(el("span", "eyebrow", eyebrow)); if (h) s.appendChild(el("h1", "work__h", h)); if (sub) s.appendChild(el("p", "work__sub work__sub--wide", sub)); host.appendChild(s); return s; }
  // Der Katalog liefert Bereich, Vorspann, Umfang und Stand zu einem Slug.
  function catalogue(slug) {
    var cat = window.__catalogue || {};
    for (var s in cat) { var list = (cat[s] || {}).list || []; for (var i = 0; i < list.length; i++) if (list[i].slug === slug) return list[i]; }
    return null;
  }

  if (!id && !slug) { block("Profile", "No such profile", "The address needs a number, like /p/2, or a name, like /contributors/anna-meier."); return; }
  fetch(slug ? "/api/profiles/slug/" + slug : "/api/profiles/" + id).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); }).then(function (r) {
    if (r.s !== 200) { block("Profile", "No public profile here", "Either the number is wrong, or the person has not set a name yet."); return; }
    var p = r.j.profile, pr = p.profile || {};
    document.title = p.name + " | entrosana";
    if (p.slug) {
      var canon = "https://entrosana.app/contributors/" + p.slug;
      if (!slug) { try { history.replaceState(null, "", "/contributors/" + p.slug); } catch (e) {} }
      var lc = document.querySelector('link[rel="canonical"]') || document.head.appendChild(el("link")); lc.rel = "canonical"; lc.href = canon;
      var og = document.querySelector('meta[property="og:url"]') || document.head.appendChild(el("meta")); og.setAttribute("property", "og:url"); og.content = canon;
      var ot = document.querySelector('meta[property="og:title"]') || document.head.appendChild(el("meta")); ot.setAttribute("property", "og:title"); ot.content = p.name + " | entrosana";
    }
    var sec = block(null, null, null);

    // Kopf. Der Einzeiler ist die Überschrift; fehlt er, springt die Rolle ein,
    // und dann steht sie in der Zeile darunter nicht ein zweites Mal.
    var hero = el("div", "hero"), av = el("div", "hero__av");
    if (p.avatar) { var img = el("img"); img.src = "/api/avatars/" + p.id + "?v=" + encodeURIComponent(p.avatar); img.alt = ""; av.appendChild(img); }
    else av.textContent = p.name.trim().charAt(0).toUpperCase();
    hero.appendChild(av);
    var mid = el("div"); mid.appendChild(el("h1", "hero__name", p.name));
    var role = ROLES[pr.role] || pr.role || "";
    var line = pr.about || [role, pr.org].filter(Boolean).join(" · ");
    if (line) mid.appendChild(el("p", "hero__line", line));
    var meta = el("div", "hero__meta");
    meta.appendChild(el("span", "tag", WORDS[p.standing] || p.standing));
    meta.appendChild(el("span", null, "on the Hub since " + p.since));
    if (pr.place) meta.appendChild(el("span", null, pr.place));
    if (pr.about && role) meta.appendChild(el("span", null, [role, pr.org].filter(Boolean).join(" · ")));
    if (pr.langs && pr.langs.length) meta.appendChild(el("span", null, pr.langs.map(langName).join(" · ")));
    mid.appendChild(meta); hero.appendChild(mid);
    var act = el("div", "hero__act");
    if (p.contact) { var mw = el("a", "btn", "Write to " + p.name.split(" ")[0]); mw.href = "mailto:" + p.contact; act.appendChild(mw); act.appendChild(el("span", "hero__contact muted", p.contact)); }
    if (pr.website) { var w = el("a", "btn" + (p.contact ? " btn--ghost" : ""), pr.website.replace(/^https:\/\//, "") + " ↗"); w.href = pr.website; w.rel = "noopener"; act.appendChild(w); }
    if (!p.contact) { var wr = el("a", "btn btn--ghost", "Write to the Hub"); wr.href = "/request"; act.appendChild(wr); }
    hero.appendChild(act); sec.appendChild(hero);

    // Zahlenband: nur, was öffentlich belegbar ist. Aufzeichnungen liegen auf
    // dem Gerät der Person und stehen deshalb nicht hier.
    var facts = el("div", "facts2");
    [[String(p.modules.length), p.modules.length === 1 ? "published" : "published"], [p.since, "on the Hub since"],
     pr.langs && pr.langs.length ? [String(pr.langs.length), pr.langs.length === 1 ? "language" : "languages"] : null,
     p.journal.length ? [String(p.journal.length), p.journal.length === 1 ? "public entry" : "public entries"] : null
    ].forEach(function (f) { if (!f) return; var d = el("div", "fact2"); d.appendChild(el("b", null, f[0])); d.appendChild(el("span", null, f[1])); facts.appendChild(d); });
    sec.appendChild(facts);

    // Biographie als Prosa, mit Zeilenumbrüchen.
    if (pr.bio) sec.appendChild(el("p", "bio", pr.bio));

    // Schaufenster.
    var ps = el("div", "psect"), ph = el("div", "psect__h");
    ph.appendChild(el("h2", null, "Contributions")); ph.appendChild(el("span", null, p.modules.length + " published")); ps.appendChild(ph);
    ps.appendChild(el("p", "psect__s", "Modules under this name. Each one opens as a lesson you can run."));
    if (!p.modules.length) ps.appendChild(el("p", "quiet", "No module published under this name yet."));
    else {
      // Dieselbe Karte wie auf /modules: cards.js zeichnet sie, der Katalog liefert
      // den Eintrag per Slug. Fehlt er dort, bleibt eine karge Karte aus dem, was
      // die API weiss (Titel, Slug, Datum).
      var show = el("div", "cards");
      p.modules.forEach(function (m) {
        var c = catalogue(m.slug) || { slug: m.slug, title: m.title, lede: "", track: "", meta: "published " + day(m.published) };
        if (window.__moduleCard) show.appendChild(window.__moduleCard("modules", c));
        else { var a = el("a", "mcard"); a.href = "/modules/" + m.slug; a.appendChild(el("p", "mcard__t", m.title)); show.appendChild(a); }
      });
      ps.appendChild(show);
    }
    sec.appendChild(ps);

    // Öffentliche Dateien (2026-09-10): nur die, die die Person selbst öffentlich gestellt hat.
    if (p.files && p.files.length) {
      var fmt = function (b) { return b >= 1048576 ? (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + " MB" : b >= 1024 ? Math.round(b / 1024) + " KB" : b + " B"; };
      var fs = el("div", "psect"), fh = el("div", "psect__h");
      fh.appendChild(el("h2", null, "Files")); fh.appendChild(el("span", null, p.files.length + (p.files.length === 1 ? " file" : " files"))); fs.appendChild(fh);
      fs.appendChild(el("p", "psect__s", "Kept on the Hub's own server. Each link downloads the file as it was uploaded."));
      var frl = el("div", "rowlist");
      p.files.forEach(function (f) {
        var a = el("a", "row2"); a.href = "/api/files/" + p.id + "/" + f.id + "/" + encodeURIComponent(f.name);
        a.appendChild(el("span", "row2__t", f.name)); a.appendChild(el("span", "row2__s", fmt(f.size) + " · " + day(f.created)));
        a.appendChild(el("span", "row2__m", "download ›")); frl.appendChild(a);
      });
      fs.appendChild(frl); sec.appendChild(fs);
    }

    // Journal als Zeitleiste.
    var js = el("div", "psect"), jh = el("div", "psect__h");
    jh.appendChild(el("h2", null, "Journal")); jh.appendChild(el("span", null, "public entries")); js.appendChild(jh);
    if (!p.journal.length) js.appendChild(el("p", "quiet", "Nothing public in the journal yet."));
    else {
      var tl = el("div", "tl");
      p.journal.forEach(function (e) {
        var d = el("div", "tl__d"); d.id = "j" + e.id;
        d.appendChild(el("span", "tl__k", dayLabel(e.created) + (e.updated ? " · edited" : "")));
        d.appendChild(el("p", "tl__t", e.text)); tl.appendChild(d);
      });
      js.appendChild(tl);
    }
    sec.appendChild(js);
    if (location.hash) { var target = document.getElementById(location.hash.slice(1)); if (target) target.scrollIntoView(); }
  }).catch(function () { block("Profile", "Not reachable", "The Hub's server is not reachable right now."); });
})();
