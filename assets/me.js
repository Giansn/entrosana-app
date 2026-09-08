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
  var ROLES = [["", "—"], ["teacher", "Teacher"], ["student", "Student"], ["parent", "Parent"], ["social-worker", "Social worker"], ["developer", "Developer"], ["researcher", "Researcher"], ["other", "Other"]];
  var LANGS = [["de", "Deutsch"], ["fr", "Français"], ["it", "Italiano"], ["en", "English"]];
  var hub = window.__hub || null;
  function roleWord(r) { for (var i = 0; i < ROLES.length; i++) if (ROLES[i][0] === r) return ROLES[i][1]; return r || ""; }
  function when2(iso) { return iso ? String(iso).replace("T", " ").slice(0, 16) : ""; }
  // Projekte auf diesem Gerät: die Hub-Dateien (Saat-Checklisten) und das Brett der Projektverwaltung.
  function deviceProjects() {
    var out = [];
    try { var st = hub ? hub.state() : null; if (st && st.projects) Object.keys(st.projects).forEach(function (id) { var p = st.projects[id]; var steps = p.steps || []; out.push({ id: id, title: p.title || id, kind: "file", href: "/project?p=" + encodeURIComponent(id), total: steps.length, done: steps.filter(function (s) { return s.checked || s.done; }).length, next: (steps.filter(function (s) { return !(s.checked || s.done); })[0] || {}).content || null, p: p }); }); } catch (e) {}
    try { var b = JSON.parse(localStorage.getItem("entrosana-todo-demo:v3") || "null"); if (b && b.projects) Object.keys(b.projects).forEach(function (id) { var p = b.projects[id]; if (p.is_archived) return; var tasks = p.tasks || []; var isDone = function (x) { return !!x.checked || x.section_id === "done" || x.status === "done"; }; out.push({ id: id, title: p.name || "Untitled", kind: "board", href: "/project", total: tasks.length, done: tasks.filter(isDone).length, next: (tasks.filter(function (x) { return !isDone(x); })[0] || {}).content || null }); }); } catch (e) {}
    return out;
  }
  function deviceRecords() { try { var st = hub ? hub.state() : null; return (st && st.records) ? st.records.slice() : []; } catch (e) { return []; } }
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
    var pr = me.profile || {};
    var who = [roleWord(pr.role), pr.org].filter(Boolean).join(" · "); if (who) meta.appendChild(el("p", "me__line", who));
    if (pr.about) meta.appendChild(el("p", "me__line", pr.about));
    if (pr.website) { var wl = el("p", "me__line"); var wa = el("a", null, pr.website.replace(/^https:\/\//, "")); wa.href = pr.website; wa.rel = "noopener"; wl.appendChild(wa); meta.appendChild(wl); }
    if (pr.langs && pr.langs.length) meta.appendChild(el("p", "me__line fine", "Languages: " + pr.langs.map(function (l) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === l) return LANGS[i][1]; return l; }).join(", ")));
    meta.appendChild(el("p", "me__line fine", "Registered " + when(me.created) + " · signed in on this device until " + when(t && t.expires) + "."));
    head.appendChild(meta); idc.appendChild(head);

    // Profil bearbeiten: Name, Organisation, Rolle, eine Zeile, Website, Sprachen.
    var det = el("details", "me__edit"); var sum = el("summary", "btn btn--ghost", "Edit profile"); det.appendChild(sum);
    var nf = el("form"); nf.noValidate = true; det.appendChild(nf); idc.appendChild(det);
    var nameIn = el("input"); nameIn.type = "text"; nameIn.maxLength = 120; nameIn.autocomplete = "name"; nameIn.value = me.name || "";
    var orgIn = el("input"); orgIn.type = "text"; orgIn.maxLength = 200; orgIn.autocomplete = "organization"; orgIn.value = pr.org || "";
    var roleIn = el("select"); ROLES.forEach(function (r) { var o = el("option", null, r[1]); o.value = r[0]; roleIn.appendChild(o); }); roleIn.value = pr.role || "";
    var aboutIn = el("textarea"); aboutIn.rows = 2; aboutIn.maxLength = 280; aboutIn.value = pr.about || "";
    var webIn = el("input"); webIn.type = "url"; webIn.maxLength = 200; webIn.placeholder = "https://…"; webIn.value = pr.website || "";
    var fN = field("Your name", nameIn, me.name ? "Contributions are published under this name." : "Needed before you apply or contribute; publications carry it.");
    var fO = field("School or organisation", orgIn, null, true), fR = field("Role", roleIn, null, true);
    var fA = field("One line about you", aboutIn, "Up to 280 characters; shown with your published modules.", true), fW = field("Website", webIn, "https only.", true);
    var fL = el("div", "field"); fL.appendChild(el("label", null, "Languages")); var lw = el("div", "me__langs"); var langBoxes = {};
    LANGS.forEach(function (l) { var lab = el("label", "me__lang"); var cb = el("input"); cb.type = "checkbox"; cb.value = l[0]; cb.checked = (pr.langs || []).indexOf(l[0]) >= 0; langBoxes[l[0]] = cb; lab.appendChild(cb); lab.appendChild(document.createTextNode(" " + l[1])); lw.appendChild(lab); }); fL.appendChild(lw);
    var fs1 = el("fieldset"); [fN, fO, fR, fA, fW, fL].forEach(function (f) { fs1.appendChild(f); }); nf.appendChild(fs1);
    var na = el("div", "actions"), nb = el("button", "btn", "Save profile"); nb.type = "submit"; na.appendChild(nb); nf.appendChild(na);
    var nout = live(); nf.appendChild(nout);
    if (!me.name) det.open = true;
    nf.addEventListener("submit", function (ev) {
      ev.preventDefault(); var v = nameIn.value.trim();
      if (v.length < 2) { bad(fN, "At least two characters."); return; }
      var w = webIn.value.trim(); if (w && !/^https:\/\/\S+$/.test(w)) { bad(fW, "An https:// link."); return; }
      var langs = Object.keys(langBoxes).filter(function (k) { return langBoxes[k].checked; });
      nb.disabled = true; note(nout, "idle", "Saving…");
      api("/api/me", { method: "PATCH", body: JSON.stringify({ name: v, org: orgIn.value.trim(), role: roleIn.value, about: aboutIn.value.trim(), website: w, langs: langs }) })
        .then(function (r) { nb.disabled = false; if (r.s === 200) { var tk = token(); if (tk) { tk.name = v; saveToken(tk); } refresh(); } else note(nout, "warn", "Not saved: " + (r.j.error || r.s) + "."); })
        .catch(function () { nb.disabled = false; note(nout, "warn", "The Hub's server is not reachable right now."); });
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

    // Plan → Begleiten → Reflektieren (Vorbild LearningView): Aufgaben, Dokumente, Journal.
    var projs = deviceProjects(), recs = deviceRecords();
    var secT = block("Tasks", null, null), tbox = el("div", "card me");
    tbox.appendChild(el("p", "fine", "Your projects and their steps live on this device. " + (projs.length ? projs.length + " project(s), " + projs.reduce(function (n, p) { return n + (p.total - p.done); }, 0) + " open step(s)." : "None yet.")));
    if (projs.length) { var tl = el("ul", "me__list"); projs.forEach(function (p) { var li = el("li", "me__row"); var a = el("a", "me__t", p.title); a.href = p.href; li.appendChild(a); li.appendChild(el("span", "me__n", p.done + "/" + p.total)); if (p.next) li.appendChild(el("span", "me__next", "next: " + p.next)); tl.appendChild(li); }); tbox.appendChild(tl); }
    var ta2 = el("div", "actions"); var np = el("a", "btn btn--ghost", "New project"); np.href = "/project"; var ap = el("a", "btn btn--ghost", "All projects"); ap.href = "/projects"; ta2.appendChild(np); ta2.appendChild(ap); tbox.appendChild(ta2); secT.appendChild(tbox);
    var secD = block("Documents", null, null), dbx = el("div", "card me");
    dbx.appendChild(el("p", "fine", "What you sent, what you host, and the files on this device."));
    var dl = el("ul", "me__list"); dbx.appendChild(dl);
    api("/api/contributions").then(function (r) {
      var items = r.s === 200 ? (r.j.items || []) : [];
      if (!items.length) dl.appendChild(el("li", "me__row fine", "No proposals sent from this account yet."));
      items.forEach(function (c) { var li = el("li", "me__row"); var a = el("a", "me__t", c.title); a.href = "/contribute/status?id=" + c.id; li.appendChild(a); li.appendChild(el("span", "me__n", c.status)); (c.files || []).forEach(function (f) { var fa = el("a", "me__file", f.label || f.url); fa.href = f.url; fa.rel = "noopener"; li.appendChild(fa); }); dl.appendChild(li); });
    }).catch(function () { dl.appendChild(el("li", "me__row fine", "The Hub's server is not reachable; the list of proposals waits.")); });
    projs.filter(function (p) { return p.kind === "file" && hub; }).forEach(function (p) { var li = el("li", "me__row"); li.appendChild(el("span", "me__t", p.title + " (file on this device)")); var b = el("button", "btn btn--quiet", "Download .md"); b.type = "button"; b.addEventListener("click", function () { hub.download(String(p.id).replace("/", "-") + ".md", hub.markdown(p.p)); }); li.appendChild(b); dl.appendChild(li); });
    var da2 = el("div", "actions"); var rl = el("a", "btn btn--ghost", "Record trail and export"); rl.href = "/records"; da2.appendChild(rl); dbx.appendChild(da2); secD.appendChild(dbx);
    var secJ = block("Journal", null, null), jbox = el("div", "card me");
    jbox.appendChild(el("p", "fine", recs.length ? recs.length + " record(s) on this device; the last " + Math.min(6, recs.length) + ":" : "Nothing recorded on this device yet. A record appears the moment you finish a step."));
    if (recs.length) { var jl = el("ul", "me__list"); recs.slice(-6).reverse().forEach(function (r) { var li = el("li", "me__row"); li.appendChild(el("span", "me__n", when2(r.t))); li.appendChild(el("span", "me__t", r.text)); if (r.project) li.appendChild(el("span", "me__next", r.project)); jl.appendChild(li); }); jbox.appendChild(jl); }
    secJ.appendChild(jbox);

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
