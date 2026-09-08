/* submit.js — /contribute/submit: einen Vorschlag an den Hub senden (Phase 4).
 * Eigene Seite, unabhängig davon, wie die Projektansicht gerade gebaut ist.
 * Liegt in app.js (window.__hub) eine Hub-Datei zur Saat vor, werden Titel,
 * Schritte und Aufzeichnungen daraus vorbelegt; sonst bleibt das Formular leer.
 * Fällt der Server aus, bleibt der alte Weg: Datei herunterladen und mailen. */
(function () {
  "use strict";
  var host = document.getElementById("submit");
  if (!host) return;
  var q = new URLSearchParams(location.search), seed = q.get("seed") || "contribute/000";
  var TOKEN_KEY = "entrosana-app:token", SUBS_KEY = "entrosana-app:submissions";
  var AREAS = ["social", "nature-based", "technical", "other"];
  var hub = window.__hub || null;
  var st = hub ? hub.state() : { projects: {}, records: [] };
  var p = st.projects[seed] || null;
  var seedDef = (window.__seeds || {})[seed] || null;

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function token() { try { var t = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); return t && t.expires > new Date().toISOString() ? t : null; } catch (e) { return null; } }
  function field(label, input, help, req) {
    var f = el("div", "field"), l = el("label", null, label);
    if (req) { l.appendChild(document.createTextNode(" ")); l.appendChild(el("span", "req", "*")); }
    f.appendChild(l); f.appendChild(input); if (help) f.appendChild(el("span", "help", help)); return f;
  }
  function stepText(s) { return s.content || s.t || ""; }
  function prefill() {
    if (p) return p.steps.filter(function (s) { return !s.parent_id; }).map(function (s) {
      var line = "- " + stepText(s); var n = s.note || s.description; return n ? line + ": " + n : line; }).join("\n");
    if (seedDef) return seedDef.steps.map(function (s) { return "- " + s.t + ": "; }).join("\n");
    return "";
  }
  function note(out, kind, text) { out.textContent = ""; out.appendChild(el("p", "note note--" + kind, text)); }
  function link(out, href, text) { var a = el("a", "btn btn--ghost", text); a.href = href; out.appendChild(document.createTextNode(" ")); out.appendChild(a); }
  function remember(id) { try { var l = JSON.parse(localStorage.getItem(SUBS_KEY) || "[]"); if (l.indexOf(id) < 0) l.push(id); localStorage.setItem(SUBS_KEY, JSON.stringify(l)); } catch (e) {} }
  function markDone() {
    if (!p || !hub) return;
    var s = p.steps.filter(function (x) { return /^Submit to the Hub/i.test(stepText(x)); })[0];
    if (!s || s.checked || s.done) return;
    s.checked = true; s.done = true; s.completed_at = s.at = new Date().toISOString(); if (s.section_id !== undefined) s.section_id = "done";
    hub.save(); hub.record("done", "Step done — Submit to the Hub", seed);
  }

  var sec = el("section", "block hair");
  sec.appendChild(el("span", "eyebrow", "Submit to the Hub"));
  sec.appendChild(el("h1", "work__h", seedDef ? seedDef.title : "Propose a module"));
  sec.appendChild(el("p", "work__sub", p
    ? "Prefilled from your file «" + p.title + "» on this device, with its " + st.records.filter(function (r) { return r.project === seed; }).length + " records."
    : "No file for this on this device; the form works on its own. You get a mail with a link, and the proposal counts once you open it."));
  var card = el("div", "card submit"); sec.appendChild(card); host.appendChild(sec);

  var form = el("form"); form.noValidate = true; card.appendChild(form);
  var grid = el("div", "submit__grid");
  var name = el("input"); name.type = "text"; name.maxLength = 120; name.autocomplete = "name"; name.required = true;
  var email = el("input"); email.type = "email"; email.maxLength = 254; email.autocomplete = "email"; email.required = true;
  var tk = token(); if (tk && tk.email) email.value = tk.email;
  var title = el("input"); title.type = "text"; title.maxLength = 160; title.required = true; title.value = (p ? p.title : "").slice(0, 160);
  var area = el("select"); AREAS.forEach(function (a) { var o = el("option", null, a); o.value = a; area.appendChild(o); });
  grid.appendChild(field("Your name", name, "Admitted modules are published under your name.", true));
  grid.appendChild(field("Your e-mail", email, "Only for the confirmation link and the answer.", true));
  grid.appendChild(field("Title", title, "What you want to build or teach, in one line.", true));
  grid.appendChild(field("Area", area, null, true));
  form.appendChild(grid);
  var summary = el("textarea"); summary.maxLength = 4000; summary.required = true; summary.value = prefill().slice(0, 4000);
  form.appendChild(field("Proposal", summary, "This is what the reviewer reads. Edit freely.", true));
  var fgrid = el("div", "submit__grid");
  var flabel = el("input"); flabel.type = "text"; flabel.maxLength = 120; flabel.placeholder = "Slides, worksheet…";
  var furl = el("input"); furl.type = "url"; furl.maxLength = 500; furl.placeholder = "https://…";
  fgrid.appendChild(field("File (optional)", flabel, null, false));
  fgrid.appendChild(field("Link to it", furl, "Only https links; files stay where you host them.", false));
  form.appendChild(fgrid);
  var keepWrap = el("label", "toggle"); var keep = el("input"); keep.type = "checkbox"; keep.id = "keep-attr";
  var track = el("span", "toggle__track"); track.appendChild(el("span", "toggle__dot")); keepWrap.appendChild(keep); keepWrap.appendChild(track);
  keepWrap.appendChild(el("span", "toggle__label", "If I ever erase my data, keep an admitted module published under my name."));
  var keepHelp = el("p", "help", "Default is off: erasing your data takes the module out of the catalogue. You can change this later on the status page.");
  keepHelp.style && (keepHelp.className = "help");
  form.appendChild(keepWrap); form.appendChild(keepHelp);
  var hp = el("input", "hp"); hp.name = "website"; hp.tabIndex = -1; hp.autocomplete = "off"; hp.setAttribute("aria-hidden", "true"); form.appendChild(hp);
  var actions = el("div", "actions");
  var go = el("button", "btn", "Send to the Hub"); go.type = "submit"; actions.appendChild(go);
  if (p && hub) { var dl = el("button", "btn btn--ghost", "Download the file instead"); dl.type = "button"; actions.appendChild(dl);
    dl.addEventListener("click", function () { hub.download(seed.replace("/", "-") + ".md", hub.markdown(p)); }); }
  form.appendChild(actions);
  var out = el("div", "submit__out"); form.appendChild(out);

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var files = []; if (furl.value.trim()) files.push({ label: flabel.value.trim() || "File", url: furl.value.trim() });
    var chain = st.records.map(function (r) { return r.h; });
    var records = st.records.map(function (r, i) { return { i: i, t: r.t, kind: r.kind, text: r.text, project: r.project, h: r.h }; })
                            .filter(function (r) { return r.project === seed; });
    var body = { email: email.value.trim(), name: name.value.trim(), title: title.value.trim(), area: area.value,
                 summary: summary.value.trim(), website: hp.value, files: files, attribution: keep.checked ? "keep" : "remove",
                 trail: p && hub ? hub.markdown(p).slice(0, 12000) : "", records: records, chain: records.length ? chain : [] };
    var headers = { "Content-Type": "application/json" }; if (tk) headers["Authorization"] = "Bearer " + tk.token;
    go.disabled = true; note(out, "idle", "Sending…");
    fetch("/api/contributions", { method: "POST", headers: headers, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (r) {
        go.disabled = false;
        if (r.s === 202 && r.j.id) {
          remember(r.j.id);
          var msg = r.j.status === "confirmed" ? "Received and confirmed as contribution #" + r.j.id + "."
                  : "Received as #" + r.j.id + ". Check your mail and open the link to confirm it.";
          if (r.j.trail_ok === 1) msg += " Your record trail verified on the server.";
          if (r.j.trail_ok === 0) msg += " The record trail did not verify; it is stored as sent.";
          note(out, "ok", msg); link(out, "/contribute/status?id=" + r.j.id, "Follow its status");
          if (hub) hub.say("Sent to the Hub.", "ok"); markDone();
        } else if (r.s === 429) note(out, "warn", "Too many attempts from here; try again in an hour.");
        else if (r.s === 400) note(out, "warn", "Not sent: " + (r.j.error || "invalid input") + ".");
        else note(out, "warn", "Not sent (" + r.s + "). Nothing was stored.");
      })
      .catch(function () {
        go.disabled = false;
        note(out, "idle", "The Hub's server is not reachable right now." + (p ? " Your file is safe on this device." : ""));
        link(out, "mailto:sygnif@entrosana.com?subject=" + encodeURIComponent("Proposal: " + title.value.trim()), "Mail it instead");
      });
  });
})();
