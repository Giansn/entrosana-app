/* search.js — die Suche hinter ⌘K (2026-09-08). Vorbild Brave: sofortige Treffer
 * beim Tippen, zuerst aus dem, was der Browser schon hat (Seiten, Katalog,
 * Projekte dieses Geräts), dann vom Dienst (Personen, Journal, veröffentlichte
 * Module); Tastatur zuerst; nichts wird gespeichert oder protokolliert (der
 * Dienst schreibt nur den Pfad, nie die Frage). Eine Palette, kein eigener Ort. */
(function () {
  "use strict";
  var PAGES = [["Workspace", "/", "Start, files and the record"], ["Tools", "/tools", "What actually runs"], ["Modules", "/modules", "Lessons for schools"], ["Contribute", "/contribute", "Ways in, rules, checklists"],
    ["Propose a track", "/contribute/submit", "The proposal form"], ["Request", "/request", "Ask for a module, a track, a tool or a service"], ["Projects", "/projects", "Your projects on this device"],
    ["Record trail", "/records", "Append-only and sealed"], ["Running services", "/services", "What is up"], ["Your account", "/me", "Sign in, profile, journal, data"], ["Contribution status", "/contribute/status", "What you sent and where it stands"]];
  var GROUPS = ["Pages", "Your projects", "Modules", "Tools", "Contribute", "People", "Journal"];
  var dlg = null, input = null, list = null, hi = -1, rows = [], server = { q: "", people: [], journal: [], modules: [] }, timer = null;
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function localIndex() {
    var items = PAGES.map(function (p) { return { group: "Pages", title: p[0], line: p[2] || "", href: p[1] }; });
    var cat = window.__catalogue || {};
    [["modules", "Modules"], ["tools", "Tools"], ["contribute", "Contribute"]].forEach(function (s) {
      ((cat[s[0]] || {}).list || []).forEach(function (e) { if (typeof e.slug === "string") items.push({ group: s[1], title: e.title || e.slug, line: [e.who, e.lede].filter(Boolean).join(" · ").slice(0, 110), href: "/" + s[0] + "/" + e.slug, tag: e.draft ? "draft" : (e.by ? "by " + e.by : "") }); });
    });
    try { var b = JSON.parse(localStorage.getItem("entrosana-todo-demo:v3") || "null"); if (b && b.projects) Object.keys(b.projects).forEach(function (id) { var p = b.projects[id]; if (p.is_archived) return; items.push({ group: "Your projects", title: p.name || "Untitled", line: (p.tasks || []).length + " tasks · on this device", href: "/project" }); }); } catch (e) {}
    try { var st = window.__hub && window.__hub.state(); if (st && st.projects) Object.keys(st.projects).forEach(function (id) { items.push({ group: "Your projects", title: st.projects[id].title || id, line: "Hub file on this device", href: "/project?p=" + encodeURIComponent(id) }); }); } catch (e) {}
    return items;
  }
  function score(item, q) { var t = item.title.toLowerCase(), l = (item.line || "").toLowerCase(); if (t === q) return 0; if (t.indexOf(q) === 0) return 1; if (t.indexOf(q) >= 0) return 2; if (l.indexOf(q) >= 0) return 3; return -1; }
  function results(q) {
    q = q.trim().toLowerCase();
    var out = [];
    if (!q) { PAGES.slice(0, 6).forEach(function (p) { out.push({ group: "Pages", title: p[0], line: p[2], href: p[1] }); }); return out; }
    localIndex().forEach(function (it) { var s = score(it, q); if (s >= 0) { it.s = s; out.push(it); } });
    out.sort(function (a, b) { return a.s - b.s || GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group); });
    var seen = {}; out.forEach(function (it) { seen[it.href] = true; });
    if (server.q === q) {
      server.people.forEach(function (p) { if (!seen[p.href]) out.push({ group: "People", title: p.name, line: p.line || "profile", href: p.href, s: 2 }); });
      server.journal.forEach(function (j) { if (!seen[j.href]) out.push({ group: "Journal", title: j.name, line: j.text, href: j.href, s: 3 }); });
      server.modules.forEach(function (m) { if (!seen[m.href]) out.push({ group: "Modules", title: m.title, line: "by " + m.name, href: m.href, s: 2 }); });
    }
    return out.slice(0, 40);
  }
  function render(q) {
    var items = results(q); list.textContent = ""; rows = [];
    if (!items.length) { list.appendChild(el("div", "palette__none", "Nothing matches «" + q.trim() + "» yet. Try a shorter word, or a name.")); hi = -1; return; }
    var byGroup = {}; items.forEach(function (it) { (byGroup[it.group] = byGroup[it.group] || []).push(it); });
    GROUPS.forEach(function (g) {
      if (!byGroup[g]) return;
      var box = el("div", "palette__group"); box.appendChild(el("span", "eyebrow", g));
      byGroup[g].slice(0, 8).forEach(function (it) {
        var a = el("a", "palette__row"); a.href = it.href; a.setAttribute("role", "option"); a.id = "pal-" + rows.length;
        a.appendChild(el("span", "palette__t", it.title)); if (it.tag) a.appendChild(el("span", "palette__k", it.tag)); if (it.line) a.appendChild(el("span", "palette__l", it.line));
        a.addEventListener("mousemove", function () { setHi(rows.indexOf(a)); });
        box.appendChild(a); rows.push(a);
      });
      list.appendChild(box);
    });
    setHi(rows.length ? 0 : -1);
  }
  function setHi(i) { hi = i; rows.forEach(function (r, k) { r.classList.toggle("is-hi", k === i); }); if (rows[i]) { input.setAttribute("aria-activedescendant", rows[i].id); rows[i].scrollIntoView({ block: "nearest" }); } }
  function askServer(q) {
    q = q.trim().toLowerCase(); clearTimeout(timer);
    if (q.length < 2) { server = { q: "", people: [], journal: [], modules: [] }; return; }
    timer = setTimeout(function () {
      fetch("/api/search?q=" + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (j) { if (input.value.trim().toLowerCase() !== q) return; server = { q: q, people: j.people || [], journal: j.journal || [], modules: j.modules || [] }; var keep = hi; render(input.value); if (keep >= 0 && keep < rows.length) setHi(keep); }).catch(function () {});
    }, 160);
  }
  function ensureCatalogue(then) {
    if (window.__catalogue || document.querySelector('script[src^="/assets/catalogue.js"]')) { then(); return; }
    var s = document.createElement("script"); s.src = "/assets/catalogue.js"; s.onload = then; s.onerror = then; document.head.appendChild(s);
  }
  function build() {
    if (dlg) return;
    dlg = el("dialog", "pick palette"); dlg.id = "palette"; dlg.setAttribute("aria-label", "Search the Hub");
    var box = el("div", "pick__box"), head = el("div", "palette__head"); head.appendChild(el("span", "palette__g", "⌕"));
    input = el("input", "palette__in"); input.type = "search"; input.placeholder = "Pages, modules, tools, people, journal…"; input.setAttribute("aria-label", "Search the Hub"); input.setAttribute("role", "combobox"); input.setAttribute("aria-expanded", "true"); input.setAttribute("aria-controls", "palette-list"); input.setAttribute("aria-autocomplete", "list"); input.autocomplete = "off"; input.spellcheck = false;
    head.appendChild(input); box.appendChild(head);
    list = el("div", "palette__list"); list.id = "palette-list"; list.setAttribute("role", "listbox"); box.appendChild(list);
    box.appendChild(el("p", "palette__foot", "↑ ↓ move · Enter opens · Esc closes · nothing you type is stored or logged"));
    dlg.appendChild(box); document.body.appendChild(dlg);
    input.addEventListener("input", function () { render(input.value); askServer(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); if (rows.length) setHi(Math.min(hi + 1, rows.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (rows.length) setHi(Math.max(hi - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); if (rows[hi]) location.href = rows[hi].getAttribute("href"); }
      else if (e.key === "Home") { e.preventDefault(); setHi(0); } else if (e.key === "End") { e.preventDefault(); setHi(rows.length - 1); }
    });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) close(); });
    dlg.addEventListener("close", function () { input.value = ""; });
  }
  function open() { build(); ensureCatalogue(function () { if (!dlg.open) dlg.showModal(); input.value = ""; render(""); input.focus(); }); }
  function close() { if (dlg && dlg.open) dlg.close(); }
  function toggle() { if (dlg && dlg.open) close(); else open(); }
  document.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); toggle(); } });
  Array.prototype.forEach.call(document.querySelectorAll("[data-search]"), function (b) { b.addEventListener("click", function (e) { e.preventDefault(); open(); }); });
  window.__search = { open: open, close: close };
})();
