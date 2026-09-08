/* profile.js — /p/<id>: das öffentliche Profil einer Person. Ohne Marke lesbar:
 * Name, Stand, Bild, Organisation, Rolle, eine Zeile, Website, Sprachen, die
 * veröffentlichten Module und die öffentlichen Journaleinträge. */
(function () {
  "use strict";
  var host = document.getElementById("profile"); if (!host) return;
  var id = (location.pathname.match(/^\/p\/(\d{1,12})$/) || [])[1];
  var WORDS = { collector: "Collector", contributor: "Contributor", reviewer: "Team", owner: "Owner" };
  var ROLES = { teacher: "Teacher", student: "Student", parent: "Parent", "social-worker": "Social worker", developer: "Developer", researcher: "Researcher", other: "Other" };
  var LANGS = window.__languages || [];
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function langName(c) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === c) return LANGS[i][2] || LANGS[i][1]; return c; }
  function when(iso) { return iso ? String(iso).replace("T", " ").slice(0, 16) : ""; }
  function block(eyebrow, h, sub) { var s = el("section", "block hair"); if (eyebrow) s.appendChild(el("span", "eyebrow", eyebrow)); if (h) s.appendChild(el("h1", "work__h", h)); if (sub) s.appendChild(el("p", "work__sub work__sub--wide", sub)); host.appendChild(s); return s; }
  if (!id) { block("Profile", "No such profile", "The address needs a number, like /p/2."); return; }
  fetch("/api/profiles/" + id).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); }).then(function (r) {
    if (r.s !== 200) { block("Profile", "No public profile here", "Either the number is wrong, or the person has not set a name yet."); return; }
    var p = r.j.profile, pr = p.profile || {};
    document.title = p.name + " | entrosana";
    var sec = block("Profile", p.name, [ROLES[pr.role] || pr.role, pr.org].filter(Boolean).join(" · ") || null);
    var card = el("div", "card me"); sec.appendChild(card);
    var head = el("div", "me__id");
    var av = el("span", "me__avatar");
    if (p.avatar) { var img = el("img", "me__avatarimg"); img.src = "/api/avatars/" + p.id + "?v=" + encodeURIComponent(p.avatar); img.alt = ""; av.appendChild(img); } else av.textContent = p.name.trim().charAt(0).toUpperCase();
    head.appendChild(av);
    var meta = el("div", "me__meta"); meta.appendChild(el("span", "chip", WORDS[p.standing] || p.standing));
    if (pr.about) meta.appendChild(el("p", "me__line", pr.about));
    if (pr.website) { var wl = el("p", "me__line"); var wa = el("a", null, pr.website.replace(/^https:\/\//, "")); wa.href = pr.website; wa.rel = "noopener"; wl.appendChild(wa); meta.appendChild(wl); }
    if (pr.langs && pr.langs.length) meta.appendChild(el("p", "me__line fine", "Languages: " + pr.langs.map(langName).join(", ")));
    meta.appendChild(el("p", "me__line fine", "On the Hub since " + p.since + "."));
    head.appendChild(meta); card.appendChild(head);
    var sec2 = block("Brought to the Hub", null, null), box = el("div", "card me");
    if (!p.modules.length) box.appendChild(el("p", "fine", "No published module yet."));
    else { var ul = el("ul", "me__list"); p.modules.forEach(function (m) { var li = el("li", "me__row"); var a = el("a", "me__t", m.title); a.href = "/modules/" + m.slug; li.appendChild(a); li.appendChild(el("span", "me__n", when(m.published).slice(0, 10))); ul.appendChild(li); }); box.appendChild(ul); }
    sec2.appendChild(box);
    var sec3 = block("Journal", null, null), jbox = el("div", "card me");
    if (!p.journal.length) jbox.appendChild(el("p", "fine", "Nothing public in the journal yet."));
    else { var jl = el("ul", "me__list journal"); p.journal.forEach(function (e) { var li = el("li", "me__row journal__e"); li.id = "j" + e.id; li.appendChild(el("span", "me__n", when(e.created) + (e.updated ? " · edited" : ""))); li.appendChild(el("p", "journal__t", e.text)); jl.appendChild(li); }); jbox.appendChild(jl); }
    sec3.appendChild(jbox);
    if (location.hash) { var target = document.getElementById(location.hash.slice(1)); if (target) target.scrollIntoView(); }
  }).catch(function () { block("Profile", "Not reachable", "The Hub's server is not reachable right now."); });
})();
