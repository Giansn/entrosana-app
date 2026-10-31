/* submit.js — /contribute/submit: einen Vorschlag an den Hub senden (Phase 4).
 * Eigene Seite, unabhängig davon, wie die Projektansicht gerade gebaut ist.
 * Liegt in app.js (window.__hub) eine Hub-Datei zur Saat vor, werden Titel,
 * Schritte und Aufzeichnungen daraus vorbelegt; sonst bleibt das Formular leer.
 * Fällt der Server aus, bleibt der alte Weg: Datei herunterladen und mailen.
 * 2026-09-08: eine Spalte, drei Gruppen; Beschriftung und Hilfe hängen am Feld
 * (for/id, aria-describedby); Prüfung vor dem Senden, Rückmeldung in einer
 * Live-Region; Dateien als Zeilen «Name https://…» statt zweier Felder. */
(function () {
  "use strict";
  var host = document.getElementById("submit");
  if (!host) return;
  // Vorbelegen aus einer Datei nur, wenn ein Projekt ausdrücklich hierher schickt (?seed=…).
  // Ohne Parameter holte der Rückfall «contribute/000» eine alte lokale Kopie «Propose a track»
  // mit steifen Vorgaben aus dem Browser (Eigentümer 2026-10-31: «more helping»).
  var q = new URLSearchParams(location.search), explicit = q.has("seed"), seed = q.get("seed") || "contribute/000";
  var TOKEN_KEY = "entrosana-app:token", SUBS_KEY = "entrosana-app:submissions";
  var AREAS = ["social", "nature-based", "technical", "other"];
  var hub = window.__hub || null;
  var st = hub ? hub.state() : { projects: {}, records: [] };
  var p = explicit ? st.projects[seed] || null : null;
  var seedDef = (window.__seeds || {})[seed] || null;
  var uid = 0, out;

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function token() { try { var t = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); return t && t.expires > new Date().toISOString() ? t : null; } catch (e) { return null; } }
  // Ein Feld: Beschriftung, Eingabe, Hilfe. Beides hängt am Feld, damit es vorgelesen wird.
  function field(label, input, help, optional) {
    var id = "f-" + (++uid), f = el("div", "field"), l = el("label", null, label);
    l.htmlFor = id; input.id = id;
    if (optional) { l.appendChild(document.createTextNode(" ")); l.appendChild(el("span", "opt", "(optional)")); }
    var h = el("span", "help", help || ""); h.id = id + "-help"; if (!help) h.hidden = true;
    input.setAttribute("aria-describedby", h.id);
    f.appendChild(l); f.appendChild(input); f.appendChild(h);
    f.help = h; f.baseHelp = help || ""; f.input = input;
    input.addEventListener("input", function () { if (f.classList.contains("is-bad")) good(f); });
    return f;
  }
  function bad(f, msg) { f.classList.add("is-bad"); f.help.hidden = false; f.help.textContent = msg; f.input.setAttribute("aria-invalid", "true"); }
  function good(f) { f.classList.remove("is-bad"); f.help.textContent = f.baseHelp; f.help.hidden = !f.baseHelp; f.input.removeAttribute("aria-invalid"); }
  function group(legend) { var fs = el("fieldset"); fs.appendChild(el("legend", null, legend)); return fs; }
  function stepText(s) { return s.content || s.t || ""; }
  function prefill() {
    if (p) return p.steps.filter(function (s) { return !s.parent_id; }).map(function (s) {
      var line = "- " + stepText(s); var n = s.note || s.description; return n ? line + ": " + n : line; }).join("\n");
    if (seedDef) return (seedDef.prompts || seedDef.steps).map(function (s) { return "- " + (typeof s === "string" ? s : s.t) + ": "; }).join("\n");   // Prompts fürs Formular, nicht die Prozessschritte
    return "";
  }
  var TEMPLATE = prefill().slice(0, 4000);
  function say(kind, text) { out.textContent = ""; out.appendChild(el("p", "note note--" + kind, text)); }
  function link(href, text) { var a = el("a", "btn btn--ghost", text); a.href = href; out.appendChild(document.createTextNode(" ")); out.appendChild(a); }
  function remember(id) { try { var l = JSON.parse(localStorage.getItem(SUBS_KEY) || "[]"); if (l.indexOf(id) < 0) l.push(id); localStorage.setItem(SUBS_KEY, JSON.stringify(l)); } catch (e) {} }
  function markDone() {
    if (!p || !hub) return;
    var s = p.steps.filter(function (x) { return /^(Submit to the Hub|Send your proposal)/i.test(stepText(x)); })[0];
    if (!s || s.checked || s.done) return;
    s.checked = true; s.done = true; s.completed_at = s.at = new Date().toISOString(); if (s.section_id !== undefined) s.section_id = "done";
    hub.save(); hub.record("done", "Step done — Submit to the Hub", seed);
  }
  // Dateien: eine Zeile je Datei, «Name https://…» oder nur der Verweis. Höchstens zehn, nur https.
  function parseFiles(text) {
    var files = [], errors = [];
    text.split(/\r?\n/).forEach(function (line, i) {
      var s = line.trim(); if (!s) return;
      var m = s.match(/^(.*?)\s*(https:\/\/\S+)\s*$/);
      if (!m) { errors.push("Line " + (i + 1) + " needs an https:// link."); return; }
      var label = m[1].replace(/[\s:—–-]+$/, "").trim();
      if (!label) { try { var u = new URL(m[2]); var seg = u.pathname.split("/").filter(Boolean).pop(); label = seg ? decodeURIComponent(seg) : u.hostname; } catch (e) { label = "File"; } }
      files.push({ label: label.slice(0, 120), url: m[2].slice(0, 500) });
    });
    if (files.length > 10) errors.push("At most 10 links.");
    return { files: files.slice(0, 10), errors: errors };
  }

  var sec = el("section", "block hair");
  sec.appendChild(el("span", "eyebrow", "Submit to the Hub"));
  sec.appendChild(el("h1", "work__h", seedDef ? seedDef.title : "Propose a module"));
  // Ohne Datei kein Vorspann (Eigentümer 2026-09-11: «remove this text, its confusing»).
  // Der Absatz entfällt ganz statt leer zu bleiben, sonst stünde sein 1.6rem-Abstand als Loch unter dem Titel.
  if (p) sec.appendChild(el("p", "work__sub work__sub--wide",
    "Prefilled from your file «" + p.title + "» on this device."));
  var card = el("div", "card submit"); sec.appendChild(card); host.appendChild(sec);

  var form = el("form"); form.noValidate = true; card.appendChild(form);
  var rule = el("p", "submit__rule", "Everything is required except the links. Questions: info@entrosana.com, or call ");
  var tel = el("a", null, "077 529 73 01"); tel.href = "tel:+41775297301"; rule.appendChild(tel); rule.appendChild(document.createTextNode(".")); form.appendChild(rule);

  var g1 = group("Who you are");
  var name = el("input"); name.type = "text"; name.maxLength = 120; name.autocomplete = "name"; name.required = true;
  var email = el("input"); email.type = "email"; email.maxLength = 254; email.autocomplete = "email"; email.inputMode = "email"; email.required = true;
  var tk = token(); if (tk && tk.email) email.value = tk.email; if (tk && tk.name) name.value = tk.name;
  var fName = field("Your name", name, "Admitted modules are published under this name.");
  var fEmail = field("Your e-mail", email, "Only for the confirmation link and our answer.");
  g1.appendChild(fName); g1.appendChild(fEmail); form.appendChild(g1);

  var g2 = group("The proposal");
  var title = el("input"); title.type = "text"; title.maxLength = 160; title.required = true; title.value = (p ? p.title : "").slice(0, 160);
  var area = el("select"); AREAS.forEach(function (a) { var o = el("option", null, a); o.value = a; area.appendChild(o); });
  var summary = el("textarea"); summary.maxLength = 4000; summary.required = true; summary.rows = 8; summary.value = TEMPLATE;
  // Fragen als Platzhalter statt Vorgaben im Feld: verschwinden beim Tippen, nichts muss gelöscht werden.
  if (!TEMPLATE) summary.placeholder = "Who is it for?\nWhat should they take away?\nIs there something already? A link helps.\nWhere could we help? Review, time, hosting, or someone who knows the subject.";
  var fTitle = field("Title", title, "What you want to build or teach, in one line.");
  var fArea = field("Area", area, null);
  var fSummary = field("Proposal", summary, "A few lines are enough. Nothing has to be finished; we work it out with you.");
  g2.appendChild(fTitle); g2.appendChild(fArea); g2.appendChild(fSummary); form.appendChild(g2);

  var g3 = group("Files and your data");
  var links = el("textarea"); links.rows = 2; links.maxLength = 2000; links.placeholder = "Slides https://…"; links.spellcheck = false;
  var fLinks = field("Links to your files", links, "One per line, https only; files stay where you host them. A word before the link names it.", true);
  g3.appendChild(fLinks);
  var choice = el("div", "submit__choice");
  var keepWrap = el("label", "toggle"); var keep = el("input"); keep.type = "checkbox"; keep.id = "keep-attr"; keep.setAttribute("aria-describedby", "keep-help");
  var track = el("span", "toggle__track"); track.appendChild(el("span", "toggle__dot")); keepWrap.appendChild(keep); keepWrap.appendChild(track);
  keepWrap.appendChild(el("span", "toggle__label", "Keep an admitted module published under my name even if I erase my data later."));
  var keepHelp = el("p", "help", "Off: erasing your data takes the module out of the catalogue. You can change this on the status page at any time."); keepHelp.id = "keep-help";
  var priv = el("p", "help"); priv.appendChild(document.createTextNode("What we store and for how long: "));
  var pa = el("a", null, "privacy on entrosana.com"); pa.href = "https://entrosana.com/privacy/"; pa.rel = "noopener"; priv.appendChild(pa); priv.appendChild(document.createTextNode("."));
  choice.appendChild(keepWrap); choice.appendChild(keepHelp); choice.appendChild(priv); g3.appendChild(choice); form.appendChild(g3);

  var hp = el("input", "hp"); hp.name = "website"; hp.tabIndex = -1; hp.autocomplete = "off"; hp.setAttribute("aria-hidden", "true"); form.appendChild(hp);
  var actions = el("div", "actions");
  var go = el("button", "btn", "Send to the Hub"); go.type = "submit"; actions.appendChild(go);
  if (p && hub) { var dl = el("button", "btn btn--ghost", "Download the file instead"); dl.type = "button"; actions.appendChild(dl);
    dl.addEventListener("click", function () { hub.download(seed.replace("/", "-") + ".md", hub.markdown(p)); }); }
  form.appendChild(actions);
  out = el("div", "submit__out"); out.setAttribute("role", "status"); out.setAttribute("aria-live", "polite"); form.appendChild(out);

  // Erst prüfen, dann senden: mit leeren Pflichtfeldern geht nichts über die Leitung.
  function validate() {
    var fails = [];
    [fName, fEmail, fTitle, fArea, fSummary, fLinks].forEach(good);
    if (name.value.trim().length < 2) { bad(fName, "Your name, at least two characters."); fails.push(fName); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { bad(fEmail, "An address we can send the confirmation link to."); fails.push(fEmail); }
    if (title.value.trim().length < 3) { bad(fTitle, "A title, at least three characters."); fails.push(fTitle); }
    var s = summary.value.trim();
    if (!s) { bad(fSummary, "A few lines about your idea, so we know where to start."); fails.push(fSummary); }
    else if (!p && TEMPLATE && s === TEMPLATE.trim()) { bad(fSummary, "The prompts are still empty. Write after the colons."); fails.push(fSummary); }
    var pf = parseFiles(links.value);
    if (pf.errors.length) { bad(fLinks, pf.errors.join(" ")); fails.push(fLinks); }
    return { fails: fails, files: pf.files };
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var v = validate();
    if (v.fails.length) { say("warn", v.fails.length === 1 ? "One field needs attention." : v.fails.length + " fields need attention."); v.fails[0].input.focus(); return; }
    // The device's record trail stays on the device: nothing of it goes with a proposal (owner 2026-11-01).
    var body = { email: email.value.trim(), name: name.value.trim(), title: title.value.trim(), area: area.value,
                 summary: summary.value.trim(), website: hp.value, files: v.files, attribution: keep.checked ? "keep" : "remove" };
    var headers = { "Content-Type": "application/json" }; if (tk) headers["Authorization"] = "Bearer " + tk.token;
    go.disabled = true; say("idle", "Sending…");
    fetch("/api/contributions", { method: "POST", headers: headers, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (r) {
        go.disabled = false;
        if (r.s === 202 && r.j.id) {
          remember(r.j.id);
          var msg = r.j.status === "confirmed" ? "Received and confirmed as contribution #" + r.j.id + "."
                  : "Received as #" + r.j.id + ". We sent a link to " + email.value.trim() + "; the proposal counts once you open it.";
          say("ok", msg); link("/contribute/status?id=" + r.j.id, "Follow its status");
          go.disabled = true; go.textContent = "Sent";
          if (hub) hub.say("Sent to the Hub.", "ok"); markDone();
        } else if (r.s === 429) say("warn", "Too many attempts from here; try again in an hour.");
        else if (r.s === 400) say("warn", "Not sent: " + (r.j.error || "invalid input") + ".");
        else say("warn", "Not sent (" + r.s + "). Nothing was stored.");
      })
      .catch(function () {
        go.disabled = false;
        say("idle", "The Hub's server is not reachable right now." + (p ? " Your file is safe on this device." : ""));
        link("mailto:info@entrosana.com?subject=" + encodeURIComponent("Proposal: " + title.value.trim()), "Mail it instead");
      });
  });
})();
