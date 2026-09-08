/* me.js — /me: das Konto. Anmelden über den Verweis per Mail (dieselbe Bestätigung
 * wie für Beiträge), Name setzen, Stand sehen, sich als Beitragende bewerben,
 * abmelden. Sammler registrieren sich frei; Beitragende und Beiträge werden
 * freigegeben (Entscheid des Eigentümers, 2026-09-08). Ohne Server bleibt der
 * Text ehrlich: was auf dem Gerät liegt, bleibt auf dem Gerät. */
(function () {
  "use strict";
  var host = document.getElementById("me");
  if (!host) return;
  var q = new URLSearchParams(location.search), TOKEN_KEY = "entrosana-app:token", uid = 0;
  var WORDS = { collector: "Collector", contributor: "Contributor", reviewer: "Team", owner: "Owner" };
  var EXPLAIN = { collector: "You keep projects and records on this device, send proposals and follow them. Publishing under your name needs contributor standing, which the team grants.",
                  contributor: "Approved: admitted proposals of yours are published under your name.",
                  reviewer: "You read and decide on proposals and applications.", owner: "The last word on every decision." };

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function token() { try { var t = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); return t && t.expires > new Date().toISOString() ? t : null; } catch (e) { return null; } }
  function saveToken(t) { try { localStorage.setItem(TOKEN_KEY, JSON.stringify(t)); } catch (e) {} }
  function dropToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  function headers(json) { var h = json ? { "Content-Type": "application/json" } : {}; var t = token(); if (t) h["Authorization"] = "Bearer " + t.token; return h; }
  function api(path, opts) {
    opts = opts || {};
    return fetch(path, Object.assign({ headers: headers(!!opts.body) }, opts))
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }, function () { return { s: r.status, j: {} }; }); });
  }
  function block(eyebrow, h, sub) {
    var s = el("section", "block hair"); if (eyebrow) s.appendChild(el("span", "eyebrow", eyebrow));
    if (h) s.appendChild(el("h1", "work__h", h)); if (sub) s.appendChild(el("p", "work__sub work__sub--wide", sub)); host.appendChild(s); return s;
  }
  function note(out, kind, text) { out.textContent = ""; out.appendChild(el("p", "note note--" + kind, text)); }
  function live() { var o = el("div", "submit__out"); o.setAttribute("role", "status"); o.setAttribute("aria-live", "polite"); return o; }
  function field(label, input, help, optional) {
    var id = "me-" + (++uid), f = el("div", "field"), l = el("label", null, label);
    l.htmlFor = id; input.id = id;
    if (optional) { l.appendChild(document.createTextNode(" ")); l.appendChild(el("span", "opt", "(optional)")); }
    var h = el("span", "help", help || ""); h.id = id + "-help"; if (!help) h.hidden = true;
    input.setAttribute("aria-describedby", h.id);
    f.appendChild(l); f.appendChild(input); f.appendChild(h);
    f.help = h; f.baseHelp = help || ""; f.input = input;
    input.addEventListener("input", function () { if (f.classList.contains("is-bad")) { f.classList.remove("is-bad"); f.help.textContent = f.baseHelp; f.help.hidden = !f.baseHelp; input.removeAttribute("aria-invalid"); } });
    return f;
  }
  function bad(f, msg) { f.classList.add("is-bad"); f.help.hidden = false; f.help.textContent = msg; f.input.setAttribute("aria-invalid", "true"); f.input.focus(); }
  function when(iso) { return iso ? String(iso).slice(0, 10) : "—"; }
  function paintRail() { if (window.__account && window.__account.paint) window.__account.paint(); }

  // Abgemeldet: die Adresse nennen, der Verweis kommt per Mail und meldet dieses Gerät an.
  function signedOut(msg) {
    host.textContent = "";
    var sec = block("Your account", "Sign in with a link by mail", "No password. Anyone can register as a collector; contributing is approved by the team.");
    if (msg) sec.appendChild(el("p", "note note--" + msg.kind, msg.text));
    var card = el("div", "card submit"), form = el("form"); form.noValidate = true; card.appendChild(form); sec.appendChild(card);
    var email = el("input"); email.type = "email"; email.autocomplete = "email"; email.inputMode = "email"; email.maxLength = 254; email.required = true;
    var name = el("input"); name.type = "text"; name.autocomplete = "name"; name.maxLength = 120;
    var fE = field("Your e-mail", email, "We send the link there. Open it on the device you want to use; it works for one hour.");
    var fN = field("Your name", name, "Optional now, needed before you contribute.", true);
    form.appendChild(fE); form.appendChild(fN);
    var actions = el("div", "actions"), go = el("button", "btn", "Send me the link"); go.type = "submit"; actions.appendChild(go); form.appendChild(actions);
    var out = live(); form.appendChild(out);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { bad(fE, "An address we can send the link to."); return; }
      go.disabled = true; note(out, "idle", "Sending…");
      api("/api/verify/request", { method: "POST", body: JSON.stringify({ email: email.value.trim(), name: name.value.trim(), purpose: "login" }) })
        .then(function (r) {
          go.disabled = false;
          if (r.s === 202) note(out, "ok", "Sent to " + email.value.trim() + ". Open the link from that mail on this device; it signs you in here.");
          else if (r.s === 429) note(out, "warn", "Too many attempts from here; try again in an hour.");
          else note(out, "warn", "Not sent (" + r.s + "). Nothing was stored.");
        })
        .catch(function () { go.disabled = false; note(out, "idle", "The Hub's server is not reachable right now."); });
    });
    var p = el("p", "fine"); p.appendChild(document.createTextNode("Everything you do without an account stays on this device. "));
    var a = el("a", null, "How the Hub treats your data"); a.href = "https://entrosana.com/privacy/"; a.rel = "noopener"; p.appendChild(a); p.appendChild(document.createTextNode(".")); sec.appendChild(p);
  }

  // Angemeldet: wer ich bin, wie ich stehe, was ich tun kann.
  function profile(me) {
    host.textContent = "";
    var t = token();
    var sec = block("Your account", me.name || "No name yet", me.email);
    var idc = el("div", "card me"); sec.appendChild(idc);
    var head = el("div", "me__id"); head.appendChild(el("span", "me__avatar", (me.name || me.email || "?").trim().charAt(0).toUpperCase()));
    var meta = el("div", "me__meta");
    meta.appendChild(el("span", "chip", WORDS[me.standing] || me.standing));
    meta.appendChild(el("p", "me__line", EXPLAIN[me.standing] || ""));
    meta.appendChild(el("p", "me__line fine", "Registered " + when(me.created) + " · signed in on this device until " + when(t && t.expires) + "."));
    head.appendChild(meta); idc.appendChild(head);

    var nf = el("form"); nf.noValidate = true;
    var nameIn = el("input"); nameIn.type = "text"; nameIn.maxLength = 120; nameIn.autocomplete = "name"; nameIn.value = me.name || "";
    var fN = field("Your name", nameIn, me.name ? "Contributions are published under this name." : "Needed before you apply or contribute; publications carry it."); nf.appendChild(fN);
    var na = el("div", "actions"), nb = el("button", "btn btn--ghost", me.name ? "Change name" : "Save name"); nb.type = "submit"; na.appendChild(nb); nf.appendChild(na);
    var nout = live(); nf.appendChild(nout); idc.appendChild(nf);
    nf.addEventListener("submit", function (ev) {
      ev.preventDefault(); var v = nameIn.value.trim();
      if (v.length < 2) { bad(fN, "At least two characters."); return; }
      if (v === (me.name || "")) { note(nout, "idle", "That is the name on record."); return; }
      api("/api/me", { method: "PATCH", body: JSON.stringify({ name: v }) })
        .then(function (r) { if (r.s === 200) { var tk = token(); if (tk) { tk.name = v; saveToken(tk); } refresh(); } else note(nout, "warn", "Not saved: " + (r.j.error || r.s) + "."); })
        .catch(function () { note(nout, "warn", "The Hub's server is not reachable right now."); });
    });

    var sec2 = block("Contributing", null, null), box = el("div", "card me");
    if (me.standing === "collector") {
      var app = me.application;
      if (app && !app.decided) {
        box.appendChild(el("p", "note note--idle", "Your application from " + when(app.created) + " is with the team. They answer by mail."));
      } else {
        if (app && app.outcome === "declined") box.appendChild(el("p", "note note--warn", "Your application from " + when(app.created) + " was declined: " + (app.reason || "no reason recorded") + " You may apply again."));
        box.appendChild(el("p", "fine", "Collectors keep projects and records and can send proposals. For an admitted proposal to be published under your name, the team approves you as contributor first."));
        var af = el("form"); af.noValidate = true;
        var ta = el("textarea"); ta.rows = 4; ta.maxLength = 2000; ta.placeholder = "Where you work, what you would bring, and why it belongs in the Hub.";
        var fA = field("Apply as contributor", ta, "20 to 2000 characters. The team reads it against the rules on /contribute."); af.appendChild(fA);
        var aa = el("div", "actions"), ab = el("button", "btn", "Send application"); ab.type = "submit"; aa.appendChild(ab); af.appendChild(aa);
        var aout = live(); af.appendChild(aout); box.appendChild(af);
        af.addEventListener("submit", function (ev) {
          ev.preventDefault(); var v = ta.value.trim();
          if (!me.name) { note(aout, "warn", "Set your name first; approvals and publications carry it."); nameIn.focus(); return; }
          if (v.length < 20) { bad(fA, "A few sentences, at least 20 characters."); return; }
          ab.disabled = true; note(aout, "idle", "Sending…");
          api("/api/me/apply", { method: "POST", body: JSON.stringify({ text: v }) })
            .then(function (r) { ab.disabled = false; if (r.s === 202) refresh(); else note(aout, "warn", "Not sent: " + (r.j.error || r.s) + "."); })
            .catch(function () { ab.disabled = false; note(aout, "warn", "The Hub's server is not reachable right now."); });
        });
      }
    } else {
      box.appendChild(el("p", "note note--ok", me.standing === "contributor" ? "Approved as contributor. Admitted proposals are published under your name." : "You are on the team: you read and decide."));
    }
    var links = el("div", "actions");
    var l1 = el("a", "btn btn--ghost", "Your contributions"); l1.href = "/contribute/status";
    var l2 = el("a", "btn btn--ghost", "Propose a track"); l2.href = "/contribute/submit";
    links.appendChild(l1); links.appendChild(l2); box.appendChild(links); sec2.appendChild(box);

    var sec3 = block("Your data", null, null), dbox = el("div", "card me");
    dbox.appendChild(el("p", "fine", "Download everything the Hub holds about you, or erase it. Erasing removes your address and name; published modules stay only where you asked them to."));
    var da = el("div", "actions");
    var ex = el("a", "btn btn--ghost", "Download my data"); ex.href = "/api/me/export";
    ex.addEventListener("click", function (ev) {
      ev.preventDefault();
      fetch("/api/me/export", { headers: headers() }).then(function (r) { return r.json(); }).then(function (j) {
        var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: "application/json" }));
        a.download = "entrosana-hub-export.json"; document.body.appendChild(a); a.click(); a.remove();
      });
    });
    var er = el("a", "btn btn--danger", "Erase my data"); er.href = "/contribute/status";
    var so = el("button", "btn btn--quiet", "Sign out on this device"); so.type = "button";
    so.addEventListener("click", function () {
      var done = function () { dropToken(); paintRail(); signedOut({ kind: "ok", text: "Signed out on this device. Other devices stay signed in." }); };
      api("/api/me/token", { method: "DELETE" }).then(done, done);
    });
    da.appendChild(ex); da.appendChild(er); da.appendChild(so); dbox.appendChild(da); sec3.appendChild(dbox);
  }

  function refresh() {
    api("/api/me").then(function (r) {
      if (r.s === 200) { var tk = token(); if (tk) { tk.name = r.j.name; tk.email = r.j.email; tk.standing = r.j.standing; saveToken(tk); } paintRail(); profile(r.j); }
      else { dropToken(); paintRail(); signedOut(r.s === 401 ? { kind: "idle", text: "Your sign-in on this device has expired. Ask for a new link." } : null); }
    }).catch(function () { host.textContent = ""; block("Your account", "Not reachable", "The Hub's server is not reachable right now. What is on this device stays on this device."); });
  }

  if (q.get("verify")) {
    var sec = block("Signing in", "One moment…", null);
    api("/api/verify?token=" + encodeURIComponent(q.get("verify"))).then(function (r) {
      history.replaceState(null, "", "/me");
      if (r.s === 200) { saveToken({ token: r.j.token, expires: r.j.expires, email: r.j.actor.email, name: r.j.actor.name, standing: r.j.actor.standing }); paintRail(); refresh(); }
      else signedOut({ kind: "warn", text: "This link does not work: it was already used, or it is older than an hour. Ask for a new one." });
    }).catch(function () { sec.querySelector("h1").textContent = "Not reachable"; });
  } else if (token()) refresh();
  else signedOut(null);
})();
