/* request.js — /request: eine Anfrage an entrosana (Modul, Track, Werkzeug,
 * Dienst). Kein Konto, keine Marke; der Text geht an info@entrosana.com, die
 * anfragende Person bekommt eine kurze Bestätigung. Aufbau wie /contribute/submit:
 * eine Spalte, Beschriftung und Hilfe am Feld, Prüfung vor dem Senden, Live-Zeile. */
(function () {
  "use strict";
  var host = document.getElementById("request");
  if (!host) return;
  var q = new URLSearchParams(location.search), uid = 0, PHONE = "077 529 73 01", TEL = "tel:+41775297301";
  var KINDS = [["module", "A module for my class or school"], ["track", "A track that does not exist yet"], ["tool", "A tool or connector"], ["service", "A service: run it with us, train us, advise us"], ["contribute", "Contribute to a module (goes to sygnif@entrosana.com)"], ["report", "Report a module (goes to sygnif@entrosana.com)"], ["other", "Something else"]];
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function field(label, input, help, optional) {
    var id = "rq-" + (++uid), f = el("div", "field"), l = el("label", null, label);
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
  function note(kind, text) { out.textContent = ""; out.appendChild(el("p", "note note--" + kind, text)); }

  var sec = el("section", "block hair");
  sec.appendChild(el("span", "eyebrow", "Ask entrosana"));
  sec.appendChild(el("h1", "work__h", "Request a module, a track, a tool or a service"));
  // Kein Vorspann unter dem Titel (Eigentümer 2026-09-11: «confusing»). Die Telefonnummer
  // wandert in die Regelzeile des Formulars, wo sie auf /contribute/submit auch steht.
  var card = el("div", "card submit"); sec.appendChild(card); host.appendChild(sec);
  var form = el("form"); form.noValidate = true; card.appendChild(form);
  var rule = el("p", "submit__rule", "Everything is required except the organisation. No account needed. Replies come from info@entrosana.com, or call ");
  var tel = el("a", null, PHONE); tel.href = TEL; rule.appendChild(tel); rule.appendChild(document.createTextNode(".")); form.appendChild(rule);

  var name = el("input"); name.type = "text"; name.maxLength = 120; name.autocomplete = "name"; name.required = true;
  var email = el("input"); email.type = "email"; email.maxLength = 254; email.autocomplete = "email"; email.inputMode = "email"; email.required = true;
  var org = el("input"); org.type = "text"; org.maxLength = 200; org.autocomplete = "organization";
  var kind = el("select"); KINDS.forEach(function (k) { var o = el("option", null, k[1]); o.value = k[0]; kind.appendChild(o); });
  var pre = q.get("kind"); if (pre && KINDS.some(function (k) { return k[0] === pre; })) kind.value = pre;
  var text = el("textarea"); text.rows = 6; text.maxLength = 4000; text.required = true; text.placeholder = "Who is it for, what should it do, and by when?";
  var fName = field("Your name", name, null), fEmail = field("Your e-mail", email, "For the answer and a short confirmation."), fOrg = field("School or organisation", org, null, true);
  var fKind = field("What you ask for", kind, null), fText = field("Your request", text, null);
  var fs = el("fieldset"); [fName, fEmail, fOrg, fKind, fText].forEach(function (f) { fs.appendChild(f); }); form.appendChild(fs);   // Gruppe: gleicher Abstand wie im Vorschlagsformular
  var hp = el("input", "hp"); hp.name = "website"; hp.tabIndex = -1; hp.autocomplete = "off"; hp.setAttribute("aria-hidden", "true"); form.appendChild(hp);
  var actions = el("div", "actions"); var go = el("button", "btn", "Send the request"); go.type = "submit"; actions.appendChild(go);
  var mailto = el("a", "btn btn--ghost", "Write a mail instead"); mailto.href = "mailto:info@entrosana.com"; actions.appendChild(mailto); form.appendChild(actions);
  var out = el("div", "submit__out"); out.setAttribute("role", "status"); out.setAttribute("aria-live", "polite"); form.appendChild(out);

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var fails = []; [fName, fEmail, fText].forEach(good);
    if (name.value.trim().length < 2) { bad(fName, "Your name, at least two characters."); fails.push(fName); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { bad(fEmail, "An address we can answer to."); fails.push(fEmail); }
    if (text.value.trim().length < 10) { bad(fText, "A few words on what you need."); fails.push(fText); }
    if (fails.length) { note("warn", fails.length === 1 ? "One field needs attention." : fails.length + " fields need attention."); fails[0].input.focus(); return; }
    go.disabled = true; note("idle", "Sending…");
    fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.value.trim(), email: email.value.trim(), org: org.value.trim(), kind: kind.value, text: text.value.trim(), website: hp.value, module: (q.get("module") || "") }) })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (r) {
        if (r.s === 202) { note("ok", "Received as request #" + r.j.id + ". info@entrosana.com answers within a few days; a short confirmation is on its way to " + email.value.trim() + "."); go.textContent = "Sent"; }
        else if (r.s === 429) { go.disabled = false; note("warn", "Too many attempts from here; try again in an hour, or call " + PHONE + "."); }
        else { go.disabled = false; note("warn", "Not sent: " + (r.j.error || r.s) + "."); }
      })
      .catch(function () { go.disabled = false; note("idle", "The Hub's server is not reachable right now. Write to info@entrosana.com or call " + PHONE + "."); });
  });
  // Meldung zu einem Modul (2026-09-09): der Verweis steht im Text, die Art ist vorgewählt.
  var mod = q.get("module");
  if (mod && /^[a-z0-9-]{1,80}$/.test(mod) && !text.value) { text.value = "About the module " + location.origin + "/modules/" + mod + "\n\n"; }
})();
