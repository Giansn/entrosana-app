/* docs.js — Docs-Hosts: Kopierknöpfe an Codeblöcken und die Suche über /docs-index.json. ES5, keine Inline-Skripte (CSP). */
(function () {
  "use strict";
  document.querySelectorAll(".code__copy").forEach(function (b) {
    b.addEventListener("click", function () {
      var pre = b.parentNode.querySelector("pre"); if (!pre || !navigator.clipboard) return;
      navigator.clipboard.writeText(pre.textContent).then(function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1500); });
    });
  });
  var q = document.getElementById("doc-q"), box = document.getElementById("doc-r"); if (!q || !box) return;
  var idx = null, src = q.getAttribute("data-index") || "/docs-index.json";
  function slug(s) { return s.toLowerCase().replace(/`/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function load() { if (idx) return Promise.resolve(idx); return fetch(src).then(function (r) { return r.json(); }).then(function (j) { idx = j; return j; }); }
  function show(list) {
    box.textContent = "";
    if (!list.length) { var n = document.createElement("p"); n.className = "docsearch__none"; n.textContent = "Nothing found."; box.appendChild(n); box.hidden = false; return; }
    list.slice(0, 8).forEach(function (p) {
      var a = document.createElement("a"); a.className = "docsearch__a"; a.href = p.path + (p.head ? "#" + slug(p.head) : "");
      var b = document.createElement("b"); b.textContent = p.title + (p.head ? " › " + p.head : ""); var s = document.createElement("span"); s.textContent = p.group;
      a.appendChild(b); a.appendChild(s); box.appendChild(a);
    });
    box.hidden = false;
  }
  q.addEventListener("input", function () {
    var s = q.value.trim().toLowerCase(); if (s.length < 2) { box.hidden = true; return; }
    load().then(function (i) {
      var out = [];
      i.forEach(function (p) {
        var head = (p.heads || []).filter(function (h) { return h.toLowerCase().indexOf(s) >= 0; })[0];
        if (p.title.toLowerCase().indexOf(s) >= 0) out.push({ path: p.path, title: p.title, group: p.group });
        else if (head) out.push({ path: p.path, title: p.title, group: p.group, head: head });
        else if ((p.text || "").toLowerCase().indexOf(s) >= 0) out.push({ path: p.path, title: p.title, group: p.group });
      });
      show(out);
    }).catch(function () { box.hidden = true; });
  });
  q.addEventListener("keydown", function (e) { if (e.key === "Escape") { box.hidden = true; q.blur(); } });
  document.addEventListener("click", function (e) { if (e.target !== q && !box.contains(e.target)) box.hidden = true; });
})();
