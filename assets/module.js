/* Eigene Module (2026-09-09): wer als Beitragende eines veröffentlichten Moduls
   eingetragen ist, ändert hier Text und Stand und trägt weitere Beitragende ein.
   Der Dienst prüft die Berechtigung; die Datei catalogue.js wird an Ort und Stelle
   neu geschrieben und ist binnen Sekunden live. */
(function () {
  var host = document.getElementById("mymods");
  if (!host) return;
  var TOKEN_KEY = "entrosana-app:token";
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function token() { try { var t = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); return t && t.expires > new Date().toISOString() ? t : null; } catch (e) { return null; } }
  function api(path, opts) {
    opts = opts || {}; var tk = token(); var h = { Accept: "application/json" }; if (tk) h.Authorization = "Bearer " + tk.token; if (opts.body) h["Content-Type"] = "application/json";
    return fetch(path, Object.assign({ headers: h }, opts)).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }, function () { return { s: r.status, j: {} }; }); });
  }
  function block(eyebrow, h, sub) { var s = el("section", "block hair"); if (eyebrow) s.appendChild(el("span", "eyebrow", eyebrow)); if (h) s.appendChild(el("h1", "work__h", h)); if (sub) s.appendChild(el("p", "work__sub work__sub--wide", sub)); host.appendChild(s); return s; }
  var STATES = [["idea", "only an idea"], ["development", "still in development"], ["finished", "finished"]];
  var tk = token();
  if (!tk) { var s0 = block("Your modules", "Sign in first", "Published modules are edited by the people listed as their contributors."); var a0 = el("a", "btn", "Sign in"); a0.href = "/me"; s0.appendChild(a0); return; }

  var sec = block("Your modules", "Published under your name", "Text and state change on the live page within seconds. Co-contributors need an approved contributor account.");
  var back = el("a", "fine", "‹ Your account"); back.href = "/me"; sec.appendChild(back);
  var out = el("div", "mods"); sec.appendChild(out); out.appendChild(el("p", "fine", "Loading…"));

  function field(label, input, help) { var w = el("div", "field"); var l = el("label", null, label); w.appendChild(l); w.appendChild(input); if (help) w.appendChild(el("span", "help", help)); return w; }

  function card(m) {
    var c = el("div", "card me");
    var head = el("div", "ptbar"); head.appendChild(el("span", "chip", "contributed")); var live = el("a", "fine", "open the live page ›"); live.href = m.url; head.appendChild(live); c.appendChild(head);
    var form = el("div", "rev__form");
    var title = el("input"); title.value = m.title; title.maxLength = 120;
    var who = el("input"); who.value = m.who; who.maxLength = 160;
    var lede = el("textarea"); lede.value = m.lede; lede.rows = 2; lede.maxLength = 300;
    var about = el("textarea"); about.value = m.about; about.rows = 6; about.maxLength = 4000;
    var note = el("textarea"); note.value = m.note; note.rows = 3; note.maxLength = 2000;
    var state = el("select"); STATES.forEach(function (s) { var o = el("option", null, s[1]); o.value = s[0]; state.appendChild(o); }); state.value = STATES.some(function (s) { return s[0] === m.state; }) ? m.state : "development";
    form.appendChild(field("Title", title, "The address of the page stays as it is."));
    form.appendChild(field("One line under the title", who, "Area, format, languages; for example «social · 9 slides · English and German»."));
    form.appendChild(field("Lead sentence", lede, null));
    form.appendChild(field("What it is", about, null));
    form.appendChild(field("Closing note", note, "Optional."));
    form.appendChild(field("State", state, "Shows on the card as «only an idea», «still in development» or «finished»."));
    var bar = el("div", "actions"); var save = el("button", "btn", "Save"); save.type = "button"; var msg = el("span", "fine", ""); bar.appendChild(save); bar.appendChild(msg); form.appendChild(bar);
    save.addEventListener("click", function () {
      msg.textContent = "…"; save.disabled = true;
      api("/api/me/modules/" + m.slug, { method: "PATCH", body: JSON.stringify({ title: title.value, who: who.value, lede: lede.value, about: about.value, note: note.value, state: state.value }) })
        .then(function (r) { save.disabled = false; if (r.s === 200) { msg.textContent = "Saved. Live within seconds."; } else { msg.textContent = r.j.error || ("HTTP " + r.s); } })
        .catch(function () { save.disabled = false; msg.textContent = "The Hub's server is not reachable."; });
    });
    c.appendChild(form);
    // Beitragende
    c.appendChild(el("span", "eyebrow", "Contributors"));
    var cl = el("ul", "measure");
    (m.contributors || []).forEach(function (p) {
      var li = el("li"); li.appendChild(document.createTextNode(p.name || ("actor " + p.id)));
      if ((m.contributors || []).length > 1) { var rm = el("button", "btn btn--quiet", "remove"); rm.type = "button"; rm.addEventListener("click", function () {
        api("/api/me/modules/" + m.slug + "/contributors/" + p.id, { method: "DELETE" }).then(function (r) { if (r.s === 200) render(r.j.item, c); else cmsg.textContent = r.j.error || ("HTTP " + r.s); });
      }); li.appendChild(document.createTextNode(" ")); li.appendChild(rm); }
      cl.appendChild(li);
    });
    c.appendChild(cl);
    var addf = el("div", "actions"); var em = el("input"); em.type = "email"; em.placeholder = "e-mail of an approved contributor"; em.className = "field__in";
    var addb = el("button", "btn btn--ghost", "Add contributor"); addb.type = "button"; var cmsg = el("span", "fine", "");
    addb.addEventListener("click", function () {
      var v = em.value.trim(); if (!v) { cmsg.textContent = "Address missing."; return; } cmsg.textContent = "…";
      api("/api/me/modules/" + m.slug + "/contributors", { method: "POST", body: JSON.stringify({ email: v }) }).then(function (r) { if (r.s === 200) render(r.j.item, c); else cmsg.textContent = r.j.error || ("HTTP " + r.s); });
    });
    addf.appendChild(em); addf.appendChild(addb); addf.appendChild(cmsg); c.appendChild(addf);
    c.appendChild(el("p", "fine", "Everyone listed may edit this module; the card says «by " + (m.by || "") + "». " + (m.points === 1 ? "1 point" : m.points + " points") + " given so far."));
    return c;
  }
  function render(m, oldCard) { var n = card(m); if (oldCard && oldCard.parentNode) oldCard.parentNode.replaceChild(n, oldCard); else out.appendChild(n); }

  api("/api/me/modules").then(function (r) {
    out.textContent = "";
    if (r.s !== 200) { out.appendChild(el("p", "note note--warn", r.j.error || ("HTTP " + r.s))); return; }
    var items = r.j.items || [];
    if (!items.length) { var p = el("p", "fine"); p.appendChild(document.createTextNode("No published module under your name yet. ")); var a = el("a", null, "Propose a track"); a.href = "/contribute/submit"; p.appendChild(a); p.appendChild(document.createTextNode(" to start one.")); out.appendChild(p); return; }
    items.forEach(function (m) { render(m, null); });
  }).catch(function () { out.textContent = ""; out.appendChild(el("p", "note note--warn", "The Hub's server is not reachable right now.")); });
})();
