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
  // Sprachen der Welt (ISO 639-1 plus gsw) aus assets/languages.js: [Code, englischer Name, Eigenname].
  var LANGS = window.__languages || [["de", "German", "Deutsch"], ["en", "English", "English"], ["fr", "French", "Français"], ["it", "Italian", "Italiano"], ["es", "Spanish", "Español"]];
  function langByCode(c) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === c) return LANGS[i]; return null; }
  function langName(c) { var l = langByCode(c); return l ? (l[2] || l[1]) : c; }
  // Sprachwähler: Tippen filtert, Pfeile und Enter wählen, Chips zeigen die Auswahl (Buchstabenleiste entfernt 2026-09-10).
  function langPicker(selected, max) {
    var sel = selected.slice(), hi = -1;
    var wrap = el("div", "langpick"), chips = el("div", "langpick__chips");
    var input = el("input"); input.type = "text"; input.autocomplete = "off"; input.placeholder = "Type a letter or a name…";
    input.setAttribute("role", "combobox"); input.setAttribute("aria-expanded", "false"); input.setAttribute("aria-autocomplete", "list");
    var list = el("div", "langpick__list"); list.setAttribute("role", "listbox"); list.hidden = true;
    function starts(l, q) { return l[1].toLowerCase().indexOf(q) === 0 || (l[2] || "").toLowerCase().indexOf(q) === 0 || l[0] === q; }
    function contains(l, q) { return l[1].toLowerCase().indexOf(q) >= 0 || (l[2] || "").toLowerCase().indexOf(q) >= 0; }
    function render() {
      chips.textContent = "";
      sel.forEach(function (code) { var c = el("span", "chip langpick__chip", langName(code)); var x = el("button", "langpick__x", "×"); x.type = "button"; x.setAttribute("aria-label", "Remove " + langName(code)); x.addEventListener("click", function () { sel = sel.filter(function (k) { return k !== code; }); render(); input.focus(); }); c.appendChild(x); chips.appendChild(c); });
      if (!sel.length) chips.appendChild(el("span", "langpick__empty", "No language chosen yet."));
      input.disabled = sel.length >= max; input.placeholder = input.disabled ? "Up to " + max + " languages." : "Type a letter or a name…";
    }
    function filter() {
      var q = input.value.trim().toLowerCase(); list.textContent = ""; hi = -1;
      if (!q) { list.hidden = true; input.setAttribute("aria-expanded", "false"); return; }
      var free = LANGS.filter(function (l) { return sel.indexOf(l[0]) < 0; });
      // Ein einzelner Buchstabe: nur englische Namen mit diesem Anfang, damit unter S nicht «Albanian · Shqip» steht.
      var m = q.length === 1 ? free.filter(function (l) { return l[1].toLowerCase().indexOf(q) === 0; }) : free.filter(function (l) { return starts(l, q); });
      if (!m.length) m = free.filter(function (l) { return contains(l, q); });
      m.slice(0, q.length === 1 ? 60 : 12).forEach(function (l) { var b = el("button", "langpick__opt", l[1] + (l[2] && l[2] !== l[1] ? " · " + l[2] : "")); b.type = "button"; b.setAttribute("role", "option"); b.setAttribute("data-code", l[0]); b.addEventListener("click", function () { add(l[0]); }); list.appendChild(b); });
      if (!m.length) list.appendChild(el("span", "langpick__none", "No language matches «" + input.value + "»."));
      list.hidden = false; input.setAttribute("aria-expanded", "true");
    }
    function add(code) { if (sel.indexOf(code) < 0 && sel.length < max) sel.push(code); input.value = ""; render(); filter(); if (!input.disabled) input.focus(); }
    function mark(opts) { for (var i = 0; i < opts.length; i++) opts[i].classList.toggle("is-hi", i === hi); if (opts[hi]) opts[hi].scrollIntoView({ block: "nearest" }); }
    input.addEventListener("input", filter);
    input.addEventListener("keydown", function (e) {
      var opts = list.querySelectorAll(".langpick__opt");
      if (e.key === "ArrowDown") { e.preventDefault(); hi = Math.min(hi + 1, opts.length - 1); mark(opts); }
      else if (e.key === "ArrowUp") { e.preventDefault(); hi = Math.max(hi - 1, 0); mark(opts); }
      else if (e.key === "Enter") { e.preventDefault(); if (opts.length) add(opts[hi < 0 ? 0 : hi].getAttribute("data-code")); }
      else if (e.key === "Escape") { input.value = ""; filter(); }
      else if (e.key === "Backspace" && !input.value && sel.length) { sel.pop(); render(); }
    });
    wrap.appendChild(chips); wrap.appendChild(input); wrap.appendChild(list); render();
    return { el: wrap, input: input, value: function () { return sel.slice(); } };
  }
  var hub = window.__hub || null;
  function roleWord(r) { for (var i = 0; i < ROLES.length; i++) if (ROLES[i][0] === r) return ROLES[i][1]; return r || ""; }
  function when2(iso) { return iso ? String(iso).replace("T", " ").slice(0, 16) : ""; }
  // Handlungen nach Tagen (Wunsch des Eigentümers, 2026-09-09): heute, gestern, dann das Datum.
  function dayLabel(iso) { var d = String(iso).slice(0, 10), today = new Date().toISOString().slice(0, 10), yest = new Date(Date.now() - 86400e3).toISOString().slice(0, 10); return d === today ? "Today" : d === yest ? "Yesterday" : d; }
  function timeOf(iso) { return String(iso).slice(11, 16); }
  function byDay(items, getIso) { var groups = [], map = {}; items.forEach(function (it) { var d = String(getIso(it)).slice(0, 10); if (!map[d]) { map[d] = { label: dayLabel(getIso(it)), items: [] }; groups.push(map[d]); } map[d].items.push(it); }); return groups; }
  function dayHead(list, g) { var li = el("li", "me__day"); li.appendChild(el("span", null, g.label)); li.appendChild(el("span", "me__n", g.items.length + (g.items.length === 1 ? " entry" : " entries"))); list.appendChild(li); }
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
  // Seit 2026-09-10 hat /me Reiter: block() hängt in das gerade gewählte Fach.
  // Abgemeldet bleibt target === host, dort ändert sich nichts.
  var target = host;
  function block(eyebrow, h, sub) {
    var s = el("section", "block"); if (eyebrow) s.appendChild(el("span", "eyebrow", eyebrow));
    if (h) s.appendChild(el("h1", "work__h", h)); if (sub) s.appendChild(el("p", "work__sub work__sub--wide", sub)); target.appendChild(s); return s;
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
    host.textContent = ""; target = host;
    var sec = block("Your account", "Sign in with a link by mail", "No password. Anyone can register as a collector; contributing is approved by the team.");
    if (msg) sec.appendChild(el("p", "note note--" + msg.kind, msg.text));
    var card = el("div", "card submit"), form = el("form"); form.noValidate = true; card.appendChild(form); sec.appendChild(card);
    var email = el("input"); email.type = "email"; email.autocomplete = "email"; email.inputMode = "email"; email.maxLength = 254; email.required = true;
    var name = el("input"); name.type = "text"; name.autocomplete = "name"; name.maxLength = 120;
    var fE = field("Your e-mail", email, "We send the link there. Open it on the device you want to use; it works for 20 minutes.");
    var fN = field("Your name", name, "Optional now, needed before you contribute.", true);
    form.appendChild(fE); form.appendChild(fN);
    // Alter (2026-09-10): Urteilsfähigkeit ab etwa 13; jüngere Lernende bringt eine Lehrperson oder ein Elternteil ein. Nichts davon wird gespeichert.
    var age = el("input"); age.type = "checkbox"; age.id = "age-ok"; var fA = el("div", "field me__age"); var la = el("label", "toggle"); la.htmlFor = "age-ok";
    la.appendChild(age); la.appendChild(el("span", "toggle__label", "I am 13 or older, or I register on behalf of a younger learner as their teacher or parent.")); fA.appendChild(la);
    var hg = el("span", "help"); hg.appendChild(document.createTextNode("Required. The Hub stores no age; it only asks. By registering you accept ")); var hga = el("a", null, "the guidelines"); hga.href = "/guidelines"; hg.appendChild(hga); hg.appendChild(document.createTextNode(".")); fA.appendChild(hg); form.appendChild(fA);
    var actions = el("div", "actions"), go = el("button", "btn", "Send me the link"); go.type = "submit"; actions.appendChild(go); form.appendChild(actions);
    var out = live(); form.appendChild(out);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { bad(fE, "An address we can send the link to."); return; }
      if (!age.checked) { bad(fA, "Tick the box: 13 or older, or registering on behalf of a younger learner."); return; }
      go.disabled = true; note(out, "idle", "Sending…");
      api("/api/verify/request", { method: "POST", body: JSON.stringify({ email: email.value.trim(), name: name.value.trim(), purpose: "login", age_ok: true }) })
        .then(function (r) {
          go.disabled = false;
          if (r.s === 202) note(out, "ok", "Sent to " + email.value.trim() + ". Open the link from that mail on this device; it signs you in here.");
          else if (r.s === 429) note(out, "warn", "Too many attempts from here; try again in an hour.");
          else note(out, "warn", "Not sent (" + r.s + "). Nothing was stored.");
        })
        .catch(function () { go.disabled = false; note(out, "idle", "The Hub's server is not reachable right now."); });
    });
    sec.appendChild(el("p", "fine", "With an account you can keep up to 400 MB of files on the Hub's own server in Switzerland: CVs, reviews, concepts, project papers. Each file is private unless you set it public on your page. Up to 50 MB per file."));
    var p = el("p", "fine"); p.appendChild(document.createTextNode("Everything you do without an account stays on this device. "));
    var a = el("a", null, "How the Hub treats your data"); a.href = "https://entrosana.com/privacy/"; a.rel = "noopener"; p.appendChild(a); p.appendChild(document.createTextNode(".")); sec.appendChild(p);
  }

  // Angemeldet: das Profil als Portfolio (2026-09-10). Links die Person mit
  // Biographie, Ort und Bearbeiten; rechts die Arbeit als geführte Liste,
  // Module zuoberst, dann Oversight, Journal, Dokumente. Unter dem Strich das
  // Konto: Team, Einladen, Geräte, Daten, Aufklärung, Gefahrenzone. Vorher
  // zwölf gleichrangige Karten, dann Reiter mit Karten; beides Kästen.
  function profile(me) {
    host.textContent = ""; target = host;
    var t = token(), pr = me.profile || {}, team = me.standing === "owner" || me.standing === "reviewer";
    var wrap = block(null, null, null), pf = el("div", "pf"); wrap.appendChild(pf);

    // ---------------------------------------------------------------- links
    var side = el("aside", "pf__id"); pf.appendChild(side);
    var av = el("div", "pf__av");
    if (me.avatar) { var img = el("img"); img.src = "/api/avatars/" + me.id + "?v=" + encodeURIComponent(me.avatar); img.alt = ""; av.appendChild(img); }
    else av.textContent = (me.name || me.email || "?").trim().charAt(0).toUpperCase();
    side.appendChild(av);
    side.appendChild(el("p", "pf__name", me.name || "No name yet"));
    side.appendChild(el("p", "pf__handle", (WORDS[me.standing] || me.standing).toLowerCase() + " · since " + when(me.created)));
    if (pr.about) side.appendChild(el("p", "pf__bio", pr.about));
    if (pr.bio) side.appendChild(el("p", "pf__bio", pr.bio));
    var facts = el("div", "pf__facts");
    function fact(icon, node) { var f = el("span", "pf__fact"); f.innerHTML = icon; f.appendChild(node); facts.appendChild(f); }
    var I = { pin: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6-5.5 6-11a6 6 0 1 0-12 0c0 5.5 6 11 6 11z"/><circle cx="12" cy="10" r="2.2"/></svg>',
              org: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/></svg>',
              web: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8M12 3.6a15 15 0 0 1 0 16.8 15 15 0 0 1 0-16.8"/></svg>',
              role: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h7"/></svg>',
              mail: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M3.5 7.5l8.5 6 8.5-6"/></svg>' };
    if (pr.place) fact(I.pin, el("span", null, pr.place));
    if (pr.org) fact(I.org, el("span", null, pr.org));
    if (pr.role) fact(I.role, el("span", null, roleWord(pr.role)));
    if (pr.website) { var wa = el("a", null, pr.website.replace(/^https:\/\//, "")); wa.href = pr.website; wa.rel = "noopener"; fact(I.web, wa); }
    if (pr.contact) { var cm = el("a", null, pr.contact); cm.href = "mailto:" + pr.contact; fact(I.mail, cm); }
    var pm = el("span", "muted", me.email + " · private"); fact(I.mail, pm);
    side.appendChild(facts);
    if (pr.langs && pr.langs.length) { var chips = el("div", "pf__chips"); pr.langs.forEach(function (c) { chips.appendChild(el("span", "chip", langName(c))); }); side.appendChild(chips); }
    // Klare Knöpfe mit dem Namen der Funktion, untereinander (Wunsch des Eigentümers, 2026-09-11).
    var btns = el("div", "pf__btns"); side.appendChild(btns);
    var editBtn = el("button", "btn btn--ghost pf__edit", "Edit profile"); editBtn.type = "button"; editBtn.setAttribute("aria-expanded", "false"); btns.appendChild(editBtn);
    var q1 = el("a", "btn btn--ghost", "View public page ↗"); q1.href = me.slug ? "/contributors/" + me.slug : "/p/" + me.id; q1.target = "_blank"; q1.rel = "noopener";
    var q2 = el("a", "btn btn--ghost", "Invite someone"); q2.href = "#account"; q2.addEventListener("click", function (ev) { ev.preventDefault(); show("account", "invite"); });
    var q3 = el("a", "btn btn--ghost", "Account and devices"); q3.href = "#account"; q3.addEventListener("click", function (ev) { ev.preventDefault(); show("account"); });
    btns.appendChild(q1); btns.appendChild(q2); btns.appendChild(q3);

    // Bearbeiten: Name, Organisation, Rolle, Ort, eine Zeile, Biographie, Website, Sprachen, Bild.
    var edit = el("div", "pf__edit-form"); edit.hidden = !!me.name; side.appendChild(edit);
    editBtn.addEventListener("click", function () { edit.hidden = !edit.hidden; editBtn.setAttribute("aria-expanded", String(!edit.hidden)); if (!edit.hidden) nameIn.focus(); });
    var nf = el("form"); nf.noValidate = true; edit.appendChild(nf);
    var nameIn = el("input"); nameIn.type = "text"; nameIn.maxLength = 120; nameIn.autocomplete = "name"; nameIn.value = me.name || "";
    var orgIn = el("input"); orgIn.type = "text"; orgIn.maxLength = 200; orgIn.autocomplete = "organization"; orgIn.value = pr.org || "";
    var roleIn = el("select"); ROLES.forEach(function (r) { var o = el("option", null, r[1]); o.value = r[0]; roleIn.appendChild(o); }); roleIn.value = pr.role || "";
    var placeIn = el("input"); placeIn.type = "text"; placeIn.maxLength = 120; placeIn.autocomplete = "address-level2"; placeIn.value = pr.place || "";
    var aboutIn = el("textarea"); aboutIn.rows = 2; aboutIn.maxLength = 280; aboutIn.value = pr.about || "";
    var bioIn = el("textarea"); bioIn.rows = 7; bioIn.maxLength = 4000; bioIn.value = pr.bio || "";
    var webIn = el("input"); webIn.type = "url"; webIn.maxLength = 200; webIn.placeholder = "https://…"; webIn.value = pr.website || "";
    var contactIn = el("input"); contactIn.type = "email"; contactIn.maxLength = 254; contactIn.autocomplete = "off"; contactIn.value = pr.contact || "";
    var fN = field("Your name", nameIn, me.name ? "Contributions are published under this name." : "Needed before you apply or contribute; publications carry it.");
    var fO = field("School or organisation", orgIn, null, true), fR = field("Role", roleIn, null, true);
    var fP = field("Place", placeIn, "Town or region, in your words. Shown next to your name.", true);
    var fA = field("One line about you", aboutIn, "Up to 280 characters; the headline under your name.", true);
    var fB = field("Biography", bioIn, "Your own words, up to 4000 characters. Shown on your public page. Line breaks are kept.", true);
    var fW = field("Website", webIn, "https only.", true);
    var fC = field("Public e-mail", contactIn, "Shown on your public page, for anyone who wants to write to you. Your sign-in address (" + me.email + ") stays private and is not affected.", true);
    var picker = langPicker(pr.langs || [], 12);
    var fL = field("Languages", picker.input, "Type a name; Enter adds it. Up to 12, from " + LANGS.length + " languages.", true);
    fL.insertBefore(picker.el, fL.querySelector(".help")); picker.el.insertBefore(picker.input, picker.el.querySelector(".langpick__list"));
    var fs1 = el("fieldset"); [fN, fO, fR, fP, fA, fB, fC, fW, fL].forEach(function (f) { fs1.appendChild(f); }); nf.appendChild(fs1);
    var na = el("div", "actions"), nb = el("button", "btn", "Save profile"); nb.type = "submit"; na.appendChild(nb);
    var nc = el("button", "btn btn--ghost", "Close"); nc.type = "button"; nc.addEventListener("click", function () { edit.hidden = true; editBtn.setAttribute("aria-expanded", "false"); }); na.appendChild(nc);
    nf.appendChild(na); var nout = live(); nf.appendChild(nout);
    nf.addEventListener("submit", function (ev) {
      ev.preventDefault(); var v = nameIn.value.trim();
      if (v.length < 2) { bad(fN, "At least two characters."); return; }
      var w = webIn.value.trim(); if (w && !/^https:\/\/\S+$/.test(w)) { bad(fW, "An https:// link."); return; }
      var cmail = contactIn.value.trim(); if (cmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cmail)) { bad(fC, "An e-mail address, or leave it empty."); return; }
      nb.disabled = true; note(nout, "idle", "Saving…");
      api("/api/me", { method: "PATCH", body: JSON.stringify({ name: v, org: orgIn.value.trim(), role: roleIn.value, place: placeIn.value.trim(), about: aboutIn.value.trim(), bio: bioIn.value.trim(), contact: cmail, website: w, langs: picker.value() }) })
        .then(function (r) { nb.disabled = false; if (r.s === 200) { var tk = token(); if (tk) { tk.name = v; saveToken(tk); } refresh(); } else note(nout, "warn", "Not saved: " + (r.j.error || r.s) + "."); })
        .catch(function () { nb.disabled = false; note(nout, "warn", "The Hub's server is not reachable right now."); });
    });
    // Profilbild: Datei wählen, im Browser auf 256 px verkleinern, als JPEG senden (data:-URL, siehe 2026-09-09).
    var pic = el("div", "actions me__pic"); var fileIn = el("input"); fileIn.type = "file"; fileIn.accept = "image/*"; fileIn.hidden = true; fileIn.setAttribute("aria-label", "Choose a picture");
    var pb = el("button", "btn btn--ghost", me.avatar ? "Change picture" : "Add a picture"); pb.type = "button"; pb.addEventListener("click", function () { fileIn.click(); });
    var pout = live(); pic.appendChild(pb);
    if (me.avatar) { var rb = el("button", "btn btn--ghost", "Remove picture"); rb.type = "button"; rb.addEventListener("click", function () { api("/api/me/avatar", { method: "DELETE" }).then(function (r) { if (r.s === 200) { var tk = token(); if (tk) { tk.avatar = null; saveToken(tk); } refresh(); } }); }); pic.appendChild(rb); }
    pic.appendChild(fileIn); edit.appendChild(pic); edit.appendChild(pout);
    fileIn.addEventListener("change", function () {
      var f = fileIn.files && fileIn.files[0]; if (!f) return;
      if (!/^image\//.test(f.type)) { note(pout, "warn", "That is not an image."); return; }
      note(pout, "idle", "Reading the picture…");
      var rd = new FileReader();
      rd.onerror = function () { note(pout, "warn", "The browser could not read that file."); };
      rd.onload = function () {
        var im = new Image();
        im.onload = function () {
          var S = 256, c = document.createElement("canvas"); c.width = S; c.height = S; var g = c.getContext("2d");
          var w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
          if (!w || !h) { note(pout, "warn", "The browser could not read that image."); return; }
          var s = Math.min(w, h), sx = (w - s) / 2, sy = (h - s) / 2;
          g.fillStyle = "#fff"; g.fillRect(0, 0, S, S); g.drawImage(im, sx, sy, s, s, 0, 0, S, S);
          var data; try { data = c.toDataURL("image/jpeg", 0.85); } catch (e) { note(pout, "warn", "The browser could not convert that image."); return; }
          note(pout, "idle", "Uploading…");
          api("/api/me/avatar", { method: "POST", body: JSON.stringify({ data: data, type: "image/jpeg" }) })
            .then(function (r) { if (r.s === 200) { var tk = token(); if (tk) { tk.avatar = r.j.avatar; saveToken(tk); } refresh(); } else note(pout, "warn", "Not saved: " + (r.j.error || r.s) + "."); })
            .catch(function () { note(pout, "warn", "The Hub's server is not reachable right now."); });
        };
        im.onerror = function () { note(pout, "warn", "The browser could not read that image. JPEG, PNG or WebP work best."); };
        im.src = rd.result;
      };
      rd.readAsDataURL(f); fileIn.value = "";
    });

    // ---------------------------------------------------------------- rechts
    var main = el("div", "pf__main"); pf.appendChild(main);
    var projs = deviceProjects(), recs = deviceRecords();

    // Reiter rechts: Work, Account, für das Team Review. Das Konto stand vorher
    // als Kastenstapel unter dem Profil (Kritik des Eigentümers, 2026-09-10).
    var TABS = [["work", "Work"], ["account", "Account"]].concat(team ? [["team", "Review"]] : []);
    var tabs = el("div", "tabs"), panes = {}, tabBtn = {};
    TABS.forEach(function (d) {
      var b = el("button", "tabs__b", d[1]); b.type = "button"; b.setAttribute("role", "tab");
      b.addEventListener("click", function () { show(d[0]); }); tabs.appendChild(b); tabBtn[d[0]] = b;
      var pn = el("div", "me__pane"); pn.hidden = true; panes[d[0]] = pn;
    });
    main.appendChild(tabs); TABS.forEach(function (d) { main.appendChild(panes[d[0]]); });
    function show(key, anchor) {
      if (!panes[key]) key = "work";
      TABS.forEach(function (d) { var on = d[0] === key; panes[d[0]].hidden = !on; tabBtn[d[0]].classList.toggle("is-on", on); tabBtn[d[0]].setAttribute("aria-selected", String(on)); });
      try { history.replaceState(null, "", "/me" + (key === "work" ? "" : "#" + key)); } catch (e) {}
      if (anchor) { var a = document.getElementById(anchor); if (a) a.scrollIntoView({ block: "start" }); }
    }
    var pane = panes.work;
    function psect(title, rightText, rightHref, sub) {
      var s = el("div", "psect"), h = el("div", "psect__h"); h.appendChild(el("h2", null, title));
      // Rechts ein klarer Knopf mit dem Namen der Funktion statt einer leisen Zeile (Wunsch des Eigentümers, 2026-09-11).
      if (rightText) { var r = el(rightHref ? "a" : "span", rightHref ? "btn btn--ghost btn--sm" : null, rightText); if (rightHref) r.href = rightHref; h.appendChild(r); }
      s.appendChild(h); if (sub) s.appendChild(el("p", "psect__s", sub)); pane.appendChild(s); return s;
    }
    function row(href, title, sub, right, rightOk) {
      var a = el(href ? "a" : "div", "row2"); if (href) a.href = href;
      a.appendChild(el("span", "row2__t", title)); a.appendChild(el("span", "row2__s", sub || ""));
      var m = el("span", "row2__m"); if (rightOk) { m.appendChild(el("span", "ok", right)); } else m.textContent = right || "";
      a.appendChild(m); return a;
    }
    var openSteps = projs.reduce(function (n, p) { return n + (p.total - p.done); }, 0);
    var ledeParts = [];

    // Module zuoberst.
    if (me.standing !== "collector") {
      var sm = psect("Modules", "Edit modules", "/me/modules", "Published under your name, and the ones still on the way there.");
      var ml = el("div", "rowlist"); sm.appendChild(ml); ml.appendChild(el("p", "quiet", "Loading…"));
      var STATE = { finished: "finished", available: "finished", development: "in development", idea: "an idea", running: "running" };
      api("/api/me/modules").then(function (r) {
        ml.textContent = ""; var items = r.s === 200 ? (r.j.items || []) : [];
        if (r.s === 200 && r.j.team) sm.insertBefore(el("p", "quiet", "As team you may edit every module of the catalogue."), ml);
        if (!items.length) { var np = el("p", "quiet"); np.appendChild(document.createTextNode("No published module under your name yet. ")); var npa = el("a", null, "Propose a track"); npa.href = "/contribute/submit"; np.appendChild(npa); np.appendChild(document.createTextNode(" to start one.")); ml.appendChild(np); return; }
        items.forEach(function (m) { ml.appendChild(row(m.url, m.title, [m.area, m.points === 1 ? "1 point" : m.points + " points"].filter(Boolean).join(" · "), STATE[m.state] || m.state || "", /finished|available|running/.test(m.state || ""))); });
      }).catch(function () { ml.textContent = ""; ml.appendChild(el("p", "quiet", "The Hub's server is not reachable; the list waits.")); });
    }

    // Oversight: Zahl und Weg, die Listen selbst stehen in der Leiste.
    var so = psect("Oversight", "Open projects", "/projects", "What is yours and where it lives. The lists themselves are in the rail.");
    var ol = el("div", "rowlist"); so.appendChild(ol);
    ol.appendChild(row("/projects", "Projects", "on this device, with their steps", projs.length + (openSteps ? " · " + openSteps + " open" : "")));
    ol.appendChild(row("/records", "Record trail", "append-only, sealed line by line", String(recs.length)));
    var svcRow = row("/services", "Running services", "what you asked the Hub to watch", "—"); ol.appendChild(svcRow);
    api("/api/me/services").then(function (r) { if (r.s === 200) svcRow.querySelector(".row2__m").textContent = String((r.j.items || []).length); }).catch(function () {});
    var oa = el("div", "actions"); var np2 = el("a", "btn btn--ghost", "New project"); np2.href = "/project"; oa.appendChild(np2); so.appendChild(oa);

    // Schalter «sichtbar» als Baustein für Journal und Dateien.
    function toggle(labelText, on) { var w = el("label", "toggle"); var cb = el("input"); cb.type = "checkbox"; cb.checked = !!on; var tr = el("span", "toggle__track"); tr.appendChild(el("span", "toggle__dot")); w.appendChild(cb); w.appendChild(tr); w.appendChild(el("span", "toggle__label", labelText)); w.input = cb; return w; }
    // Journal: Formular, dann die Zeitleiste mit den bisherigen Handlungen.
    var sj = psect("Journal", null, null, "What you learned, tried, changed. Public entries appear on your profile page; private ones stay with your account.");
    var jf = el("form"); jf.noValidate = true; var jta = el("textarea"); jta.rows = 3; jta.maxLength = 2000;
    var fJ = field("New entry", jta, null); jf.appendChild(fJ);
    var pubWrap = el("label", "toggle"); var pubCb = el("input"); pubCb.type = "checkbox"; pubCb.checked = true; var ptr = el("span", "toggle__track"); ptr.appendChild(el("span", "toggle__dot")); pubWrap.appendChild(pubCb); pubWrap.appendChild(ptr); pubWrap.appendChild(el("span", "toggle__label", "Visible on my public profile")); jf.appendChild(pubWrap);
    var ja = el("div", "actions"); var jb = el("button", "btn", "Add entry"); jb.type = "submit"; ja.appendChild(jb); jf.appendChild(ja); var jout = live(); jf.appendChild(jout); sj.appendChild(jf);
    var jl = el("div", "tl"); sj.appendChild(jl);
    function paintJournal() {
      api("/api/me/journal").then(function (r) {
        jl.textContent = ""; var items = r.s === 200 ? r.j.items : [];
        if (!items.length) { jl.appendChild(el("p", "quiet", "No entries yet.")); return; }
        items.forEach(function (e) {
          var d = el("div", "tl__d"); d.id = "j" + e.id;
          d.appendChild(el("span", "tl__k", dayLabel(e.created) + " " + timeOf(e.created) + (e.updated ? " · edited" : "") + (e.public ? "" : " · private")));
          var txt = el("p", "tl__t", e.text); d.appendChild(txt);
          // Ein Knopf «Edit» je Eintrag: Text, Sichtbarkeit und Löschen an einem Ort (Wunsch des Eigentümers, 2026-09-11).
          var acts = el("div", "tl__acts"); var ed = el("button", "btn btn--ghost btn--sm", "Edit"); ed.type = "button";
          ed.addEventListener("click", function () {
            var open = d.querySelector(".edit-panel"); if (open) { open.remove(); txt.hidden = false; return; }
            var p = el("form", "edit-panel"); p.noValidate = true;
            var ta = el("textarea"); ta.value = e.text; ta.rows = 3; ta.maxLength = 2000; var fE = field("Entry", ta, null); p.appendChild(fE);
            var vis = toggle("Visible on my public profile", e.public); p.appendChild(vis);
            var a2 = el("div", "actions"); var sv = el("button", "btn", "Save"); sv.type = "submit"; var cn = el("button", "btn btn--ghost", "Cancel"); cn.type = "button"; var dl = el("button", "btn btn--danger", "Delete entry"); dl.type = "button";
            cn.addEventListener("click", function () { p.remove(); txt.hidden = false; });
            dl.addEventListener("click", function () { if (!confirm("Delete this entry? This cannot be undone.")) return; api("/api/me/journal/" + e.id, { method: "DELETE" }).then(paintJournal); });
            a2.appendChild(sv); a2.appendChild(cn); a2.appendChild(dl); p.appendChild(a2);
            p.addEventListener("submit", function (ev) { ev.preventDefault(); var v = ta.value.trim(); if (!v) { bad(fE, "Write a line first."); return; } sv.disabled = true; api("/api/me/journal/" + e.id, { method: "PATCH", body: JSON.stringify({ text: v, public: vis.input.checked }) }).then(paintJournal); });
            txt.hidden = true; d.insertBefore(p, acts); ta.focus();
          });
          acts.appendChild(ed); d.appendChild(acts); jl.appendChild(d);
        });
      }).catch(function () { jl.textContent = ""; jl.appendChild(el("p", "quiet", "The Hub's server is not reachable; entries wait.")); });
    }
    jf.addEventListener("submit", function (ev) { ev.preventDefault(); var v = jta.value.trim(); if (!v) { bad(fJ, "Write a line first."); return; } jb.disabled = true; note(jout, "idle", "Saving…");
      api("/api/me/journal", { method: "POST", body: JSON.stringify({ text: v, public: pubCb.checked }) }).then(function (r) { jb.disabled = false; if (r.s === 201) { jta.value = ""; jout.textContent = ""; paintJournal(); } else note(jout, "warn", "Not saved: " + (r.j.error || r.s) + "."); }).catch(function () { jb.disabled = false; note(jout, "warn", "The Hub's server is not reachable right now."); }); });
    paintJournal();

    // Dokumente: was gesendet wurde, was gehostet wird, was auf dem Gerät liegt.
    var sd = psect("Documents", "Open record trail", "/records", "Files you keep on the Hub, what you sent, and the files on this device.");
    // Dateien auf dem Hub (2026-09-10): 400 MB je Konto, 50 MB je Datei, auf dem
    // eigenen Server neben den Konten. Privat, bis man eine Datei öffentlich stellt.
    function fmt(b) { return b >= 1048576 ? (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + " MB" : b >= 1024 ? Math.round(b / 1024) + " KB" : b + " B"; }
    var quota = el("p", "quiet mono", "Counting…"); sd.appendChild(quota);
    var fl = el("div", "rowlist"); sd.appendChild(fl);
    // Hochladen mit Titel (Wunsch des Eigentümers, 2026-09-11): nach der Wahl der Datei
    // erscheint ein Formular mit Titel und Sichtbarkeit, erst «Upload» sendet. Jede Zeile
    // hat einen Knopf «Edit», der Titel, Sichtbarkeit und Löschen an einem Ort zeigt.
    function cleanTitle(name) { return String(name || "").replace(/\.[a-z0-9]{1,8}$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60); }
    var fact = el("div", "actions"); var fileIn2 = el("input"); fileIn2.type = "file"; fileIn2.hidden = true; fileIn2.setAttribute("aria-label", "Choose a file to upload");
    fileIn2.accept = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.md,.txt,.csv,.docx,.xlsx,.pptx,.odt,.ods,.odp,.zip";
    var upBtn = el("button", "btn btn--ghost", "Upload a file"); upBtn.type = "button"; upBtn.addEventListener("click", function () { fileIn2.click(); });
    var fout = live(); fact.appendChild(upBtn); fact.appendChild(fileIn2); sd.appendChild(fact);
    var upForm = el("form", "edit-panel"); upForm.hidden = true; upForm.noValidate = true; sd.appendChild(upForm); sd.appendChild(fout);
    function paintFiles() {
      api("/api/me/files").then(function (r) {
        if (r.s !== 200) { quota.textContent = ""; return; }
        var items = r.j.items || [];
        quota.textContent = fmt(r.j.used) + " of " + fmt(r.j.quota) + " used · " + r.j.where + " · up to " + fmt(r.j.max_file) + " per file";
        fl.textContent = "";
        if (!items.length) { fl.appendChild(el("p", "quiet", "No file on the Hub yet.")); return; }
        items.forEach(function (f) {
          var rr = row("/api/files/" + me.id + "/" + f.id + "/" + encodeURIComponent(f.name), f.label || cleanTitle(f.name), f.name + " · " + fmt(f.size) + " · " + when(f.created), f.public ? "on your page" : "private", f.public);
          var m = rr.querySelector(".row2__m"); var ed = el("button", "btn btn--ghost btn--sm", "Edit"); ed.type = "button"; m.appendChild(ed); fl.appendChild(rr);
          ed.addEventListener("click", function (ev) {
            ev.preventDefault(); var open = rr.nextSibling; if (open && open.classList && open.classList.contains("edit-panel")) { open.remove(); return; }
            var p = el("form", "edit-panel"); p.noValidate = true;
            var ti = el("input"); ti.type = "text"; ti.maxLength = 60; ti.value = f.label || ""; ti.placeholder = cleanTitle(f.name);
            var fT = field("Title on your page", ti, "Short, like «CV» or «Concept Waldtag». Empty means the file name."); p.appendChild(fT);
            var vis = toggle("Visible on my public page", f.public); p.appendChild(vis);
            var acts = el("div", "actions"); var sv = el("button", "btn", "Save"); sv.type = "submit"; var cn = el("button", "btn btn--ghost", "Cancel"); cn.type = "button"; var dl = el("button", "btn btn--danger", "Delete file"); dl.type = "button";
            cn.addEventListener("click", function () { p.remove(); });
            dl.addEventListener("click", function () { if (!confirm("Delete «" + f.name + "» from the Hub? This cannot be undone.")) return; api("/api/me/files/" + f.id, { method: "DELETE" }).then(paintFiles); });
            acts.appendChild(sv); acts.appendChild(cn); acts.appendChild(dl); p.appendChild(acts);
            p.addEventListener("submit", function (e2) { e2.preventDefault(); sv.disabled = true; api("/api/me/files/" + f.id, { method: "PATCH", body: JSON.stringify({ label: ti.value.trim(), public: vis.input.checked }) }).then(paintFiles); });
            rr.parentNode.insertBefore(p, rr.nextSibling); ti.focus();
          });
        });
      }).catch(function () { quota.textContent = ""; });
    }
    fileIn2.addEventListener("change", function () {
      var f = fileIn2.files && fileIn2.files[0]; fileIn2.value = ""; if (!f) return;
      if (f.size > 52428800) { note(fout, "warn", "A file may have up to 50 MB; this one has " + fmt(f.size) + "."); return; }
      upForm.textContent = ""; upForm.hidden = false; fout.textContent = "";
      upForm.appendChild(el("p", "edit-panel__t", f.name + " · " + fmt(f.size)));
      var ti = el("input"); ti.type = "text"; ti.maxLength = 60; ti.value = cleanTitle(f.name);
      var fT = field("Title on your page", ti, "Short, like «CV» or «Concept Waldtag»."); upForm.appendChild(fT);
      var vis = toggle("Visible on my public page", false); upForm.appendChild(vis);
      var acts = el("div", "actions"); var go = el("button", "btn", "Upload"); go.type = "submit"; var cancel = el("button", "btn btn--ghost", "Cancel"); cancel.type = "button";
      cancel.addEventListener("click", function () { upForm.hidden = true; upForm.textContent = ""; });
      acts.appendChild(go); acts.appendChild(cancel); upForm.appendChild(acts);
      upForm.onsubmit = function (ev) {
        ev.preventDefault(); var t = ti.value.trim(); if (!t) { bad(fT, "Give the file a title."); return; }
        go.disabled = true; note(fout, "idle", "Uploading " + f.name + " (" + fmt(f.size) + ")…");
        var h = headers(false); h["Content-Type"] = "application/octet-stream"; h["X-File-Name"] = encodeURIComponent(f.name); h["X-File-Label"] = encodeURIComponent(t); if (vis.input.checked) h["X-Public"] = "1";
        fetch("/api/me/files", { method: "PUT", headers: h, body: f })
          .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }, function () { return { s: r.status, j: {} }; }); })
          .then(function (r) { go.disabled = false; if (r.s === 201) { upForm.hidden = true; upForm.textContent = ""; note(fout, "ok", "Stored as «" + (r.j.item.label || r.j.item.name) + "» (" + fmt(r.j.item.size) + "), " + (r.j.item.public ? "visible on your page." : "private until you set it visible.")); paintFiles(); } else note(fout, "warn", "Not stored: " + (r.j.error || r.s) + "."); })
          .catch(function () { go.disabled = false; note(fout, "warn", "The Hub's server is not reachable right now."); });
      };
      ti.focus(); ti.select();
    });
    paintFiles();
    sd.appendChild(el("p", "quiet", "Proposals you sent, and files on this device:"));
    var dl2 = el("div", "rowlist"); sd.appendChild(dl2);
    api("/api/contributions").then(function (r) {
      var items = r.s === 200 ? (r.j.items || []) : [];
      if (!items.length) dl2.appendChild(el("p", "quiet", "No proposals sent from this account yet."));
      items.forEach(function (c) { var rr = row("/contribute/status?id=" + c.id, c.title, (c.files || []).map(function (f) { return f.label || f.url; }).join(" · "), c.status); dl2.appendChild(rr); });
    }).catch(function () { dl2.appendChild(el("p", "quiet", "The Hub's server is not reachable; the list of proposals waits.")); });
    projs.filter(function (p) { return p.kind === "file" && hub; }).forEach(function (p) { var rr = row(null, p.title, "file on this device", ""); var b = el("button", "btn btn--ghost btn--sm", "Download .md"); b.type = "button"; b.addEventListener("click", function () { hub.download(String(p.id).replace("/", "-") + ".md", hub.markdown(p.p)); }); rr.querySelector(".row2__m").appendChild(b); dl2.appendChild(rr); });

    // Beitragen: Sammler bewerben sich hier; alle anderen sehen ihren Stand in einer Zeile.
    var sc = psect("Contributing", "Open contributions", "/contribute/status", null);
    if (me.standing === "collector") {
      var app = me.application;
      if (app && !app.decided) sc.appendChild(el("p", "note note--idle", "Your application from " + when(app.created) + " is with the team. They answer by mail."));
      else {
        if (app && app.outcome === "declined") sc.appendChild(el("p", "note note--warn", "Your application from " + when(app.created) + " was declined: " + (app.reason || "no reason recorded") + " You may apply again."));
        sc.appendChild(el("p", "quiet", "Collectors keep projects and records and can send proposals. For an admitted proposal to be published under your name, the team approves you as contributor first."));
        var af = el("form"); af.noValidate = true; var ta = el("textarea"); ta.rows = 4; ta.maxLength = 2000; ta.placeholder = "Where you work, what you would bring, and why it belongs in the Hub.";
        var fAp = field("Apply as contributor", ta, "20 to 2000 characters. The team reads it against the rules on /contribute."); af.appendChild(fAp);
        var aa = el("div", "actions"), ab = el("button", "btn", "Send application"); ab.type = "submit"; aa.appendChild(ab); af.appendChild(aa); var aout = live(); af.appendChild(aout); sc.appendChild(af);
        af.addEventListener("submit", function (ev) {
          ev.preventDefault(); var v = ta.value.trim();
          if (!me.name) { note(aout, "warn", "Set your name first; approvals and publications carry it."); edit.hidden = false; nameIn.focus(); return; }
          if (v.length < 20) { bad(fAp, "A few sentences, at least 20 characters."); return; }
          ab.disabled = true; note(aout, "idle", "Sending…");
          api("/api/me/apply", { method: "POST", body: JSON.stringify({ text: v }) }).then(function (r) { ab.disabled = false; if (r.s === 202) refresh(); else note(aout, "warn", "Not sent: " + (r.j.error || r.s) + "."); }).catch(function () { ab.disabled = false; note(aout, "warn", "The Hub's server is not reachable right now."); });
        });
      }
    } else sc.appendChild(el("p", "quiet", (EXPLAIN[me.standing] || "") + " Propose a track under /contribute/submit."));


    // ---------------------------------------------------------------- Review
    if (team) {
      pane = panes.team;
      var st = psect("Review queue", "Open review queue", "/review", "Proposals, decisions and contributor applications. Every decision needs a reason.");
      var tcount = el("p", "quiet", "Counting…"); st.appendChild(tcount);
      var tlist = el("div", "rowlist"); st.appendChild(tlist);
      var tact = el("div", "actions");
      var tapp = el("a", "btn btn--ghost", "Applications"); tapp.href = "/review?tab=applications"; tact.appendChild(tapp);
      var tmem = el("a", "btn btn--ghost", "Members"); tmem.href = "/review?tab=members"; tact.appendChild(tmem); st.appendChild(tact);
      Promise.all([api("/api/contributions"), api("/api/applications")]).then(function (rs) {
        var waiting = (rs[0].j.items || []).filter(function (c) { return ["received", "confirmed", "reviewing"].indexOf(c.status) >= 0; }).sort(function (x, y) { return y.id - x.id; });
        var apps = (rs[1].j.items || []).length;
        tcount.textContent = waiting.length + (waiting.length === 1 ? " proposal" : " proposals") + " waiting · " + apps + (apps === 1 ? " application" : " applications") + " open.";
        waiting.slice(0, 8).forEach(function (c) { tlist.appendChild(row("/review?c=" + c.id, "#" + c.id + " " + c.title, [c.area, String(c.created || "").slice(0, 10)].filter(Boolean).join(" · "), c.status)); });
        var n = waiting.length + apps; if (n) tabBtn.team.appendChild(el("span", "tabs__n", String(n)));
      }).catch(function () { tcount.textContent = ""; });
    }

    // ---------------------------------------------------------------- Account
    pane = panes.account;

    // Einladen: jedes Konto lädt per Adresse ein; die Mail trägt den Anmeldelink unter dem eigenen Namen.
    var secI = psect("Invite", null, null, "Bring a colleague, a parent, another teacher. They get a mail under your name with a link that registers them as a collector, no password. Contributing is approved by the team as always."); secI.id = "invite";
    var iform = el("form"); var iEmail = el("input"); iEmail.type = "email"; iEmail.required = true; iEmail.placeholder = "their e-mail address"; iEmail.maxLength = 254; iEmail.autocomplete = "off";
    var iMsg = el("textarea"); iMsg.rows = 3; iMsg.maxLength = 500; iMsg.placeholder = "A line from you (optional)";
    var fE = el("div", "field"); fE.appendChild(el("label", null, "Address")); fE.appendChild(iEmail);
    var fM = el("div", "field"); fM.appendChild(el("label", null, "Your message")); fM.appendChild(iMsg); fM.appendChild(el("span", "help", "Optional, up to 500 characters; it goes into the mail as your words."));
    var iBtn = el("button", "btn", "Send the invitation"); iBtn.type = "submit"; var iOut = el("div"); var iAct = el("div", "actions"); iAct.appendChild(iBtn);
    iform.appendChild(fE); iform.appendChild(fM); iform.appendChild(iAct); iform.appendChild(iOut); secI.appendChild(iform);
    var iList = el("div", "rowlist"); secI.appendChild(iList);
    function paintInvites() {
      api("/api/me/invites").then(function (r) {
        iList.textContent = ""; var items = r.j.items || []; if (!items.length) return;
        items.forEach(function (i) { iList.appendChild(row(null, i.email, i.accepted ? "accepted " + i.accepted.slice(0, 10) : "sent " + i.created.slice(0, 10) + ", not accepted yet", i.accepted ? "accepted" : "sent", !!i.accepted)); });
      }).catch(function () {});
    }
    iform.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!me.name) { note(iOut, "warn", "Set your name first; the invitation carries it."); return; }
      note(iOut, "idle", "Sending…"); iBtn.disabled = true;
      api("/api/me/invites", { method: "POST", body: JSON.stringify({ email: iEmail.value.trim(), message: iMsg.value.trim() }) }).then(function (r) {
        iBtn.disabled = false;
        if (r.s === 200) { note(iOut, "ok", "Sent to " + r.j.item.email + ". The link is valid for seven days."); iEmail.value = ""; iMsg.value = ""; paintInvites(); }
        else note(iOut, "warn", r.j.error || ("HTTP " + r.s));
      }).catch(function () { iBtn.disabled = false; note(iOut, "warn", "The Hub's server is not reachable right now."); });
    });
    paintInvites();

    // Geräte: jede Anmeldung ist ein Gerät; einzeln oder überall abmelden.
    var secDev = psect("Devices", null, null, "Every sign-in link opens a 30-day session on one device. You get a mail whenever a new device signs in.");
    var dvl = el("div", "rowlist"); secDev.appendChild(dvl); dvl.appendChild(el("p", "quiet", "Loading…"));
    var dva = el("div", "actions"); var dvAll = el("button", "btn btn--ghost", "Sign out everywhere else"); dvAll.type = "button"; var dvEvery = el("button", "btn btn--danger", "Sign out everywhere"); dvEvery.type = "button"; var dvMsg = el("span", "fine", "");
    dva.appendChild(dvAll); dva.appendChild(dvMsg); secDev.appendChild(dva);
    function paintDevices() {
      api("/api/me/devices").then(function (r) {
        dvl.textContent = ""; var items = (r.j.items || []);
        items.forEach(function (d) {
          var rr = row(null, "Signed in " + when2(d.created) + (d.current ? " · this device" : ""), (d.last_used ? "last used " + when2(d.last_used) + " · " : "") + "until " + String(d.expires).slice(0, 10), d.current ? "current" : "", d.current);
          if (!d.current) { var b = el("button", "btn btn--ghost btn--sm", "Sign out"); b.type = "button"; b.addEventListener("click", function () { api("/api/me/devices/" + d.id, { method: "DELETE" }).then(paintDevices); }); rr.querySelector(".row2__m").textContent = ""; rr.querySelector(".row2__m").appendChild(b); }
          dvl.appendChild(rr);
        });
        dvAll.hidden = items.length < 2;
      }).catch(function () { dvl.textContent = ""; });
    }
    dvAll.addEventListener("click", function () { api("/api/me/devices", { method: "DELETE" }).then(function (r) { dvMsg.textContent = r.s === 200 ? (r.j.removed + " signed out.") : (r.j.error || "failed"); paintDevices(); }); });
    dvEvery.addEventListener("click", function () { if (!confirm("Sign out on every device, including this one?")) return; api("/api/me/devices?all=1", { method: "DELETE" }).then(function () { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} location.href = "/me"; }); });
    paintDevices();

    // Deine Daten: herunterladen, auf diesem Gerät abmelden.
    var sec3 = psect("Your data", null, null, "Download everything the Hub holds about you. Erasing is in the danger zone below; it removes your address and name, and published modules stay only where you asked them to.");
    var da = el("div", "actions");
    var ex = el("a", "btn btn--ghost", "Download my data"); ex.href = "/api/me/export";
    ex.addEventListener("click", function (ev) {
      ev.preventDefault();
      fetch("/api/me/export", { headers: headers() }).then(function (r) { return r.json(); }).then(function (j) {
        var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: "application/json" }));
        a.download = "entrosana-hub-export.json"; document.body.appendChild(a); a.click(); a.remove();
      });
    });
    var so2 = el("button", "btn btn--ghost", "Sign out on this device"); so2.type = "button";
    so2.addEventListener("click", function () {
      var done = function () { dropToken(); paintRail(); signedOut({ kind: "ok", text: "Signed out on this device. Other devices stay signed in." }); };
      api("/api/me/token", { method: "DELETE" }).then(done, done);
    });
    da.appendChild(ex); da.appendChild(so2); sec3.appendChild(da);

    // Aufklärung: was der Record Trail ist und wer was sieht; Einzelheiten in der Datenschutzerklärung.
    var secInfo = psect("Record trail and visibility", "Privacy statement ↗", "https://entrosana.com/privacy", null);
    ["Record trail: every step you take in a project on this device is written to a list that only grows. Each line is sealed against the one before it, so a change anywhere shows up when the chain is verified. The trail stays in this browser; it leaves the device only when you attach it to a proposal or export it. The Hub keeps a chain of its own for decisions, and anyone can verify it.",
     "Public: your profile page with name, place, organisation, role, the one line about you, the biography, the public e-mail if you set one, website, languages, picture and the journal entries you mark public; modules published under your name; points as a count, never by name.",
     "Private: your sign-in e-mail address, private journal entries, the records on this device, proposals until they are published, applications and invitations. The team (owner and reviewers) sees proposals, applications, requests and accounts to do its work.",
     "Files: up to 400 MB per account, 50 MB per file, stored next to the accounts on the Hub's own server in Switzerland. A file is private until you set it public; public files appear on your page and can be downloaded by anyone with the link. Deleting a file removes it; erasing the account removes them all.",
     "Where it rests, where it is processed: your data rests on our own server in Switzerland, with one encrypted backup copy at Cloudflare R2. Delivery runs through Cloudflare (USA), our code lives at GitHub (USA), and mail to sygnif@entrosana.com is read by Claude, a language model run by Anthropic (USA), before a person decides. «Swiss/EU» on our pages means the residency of stored data, not the seat of every provider that processes it."
    ].forEach(function (s) { secInfo.appendChild(el("p", "tl__t", s)); });

    // Gefahrenzone: was nicht rückgängig zu machen ist, zuletzt und abgesetzt.
    var dz = el("div", "danger"); dz.appendChild(el("p", "h3", "Danger zone"));
    function dzrow(lead, rest, node) { var r = el("div", "danger__row"); var p2 = el("p"); p2.appendChild(el("b", null, lead)); p2.appendChild(document.createTextNode(" " + rest)); r.appendChild(p2); if (node) r.appendChild(node); dz.appendChild(r); }
    dzrow("Sign out everywhere, this device too.", "You will need the link by mail again to get back in.", dvEvery);
    if (me.standing === "owner") dzrow("Erasing is not open to the owner.", "Hand ownership over first; every other account, reviewers included, erases itself here.", null);
    else { var er = el("a", "btn btn--danger", "Erase my data"); er.href = "/contribute/status"; dzrow("Erase my data.", "Removes your address and name. Published modules stay only where you asked them to.", er); }
    pane.appendChild(dz);

    var want = (location.hash || "").replace("#", "");
    show(want === "invite" ? "account" : want, want === "invite" ? "invite" : null);
  }

  function refresh() {
    api("/api/me").then(function (r) {
      if (r.s === 200) { var tk = token(); if (tk) { tk.id = r.j.id; tk.name = r.j.name; tk.email = r.j.email; tk.standing = r.j.standing; tk.avatar = r.j.avatar || null; saveToken(tk); } paintRail(); profile(r.j); }
      else { dropToken(); paintRail(); signedOut(r.s === 401 ? { kind: "idle", text: "Your sign-in on this device has expired. Ask for a new link." } : null); }
    }).catch(function () { host.textContent = ""; block("Your account", "Not reachable", "The Hub's server is not reachable right now. What is on this device stays on this device."); });
  }

  if (q.get("verify")) {
    var sec = block("Signing in", "One moment…", null);
    api("/api/verify?token=" + encodeURIComponent(q.get("verify"))).then(function (r) {
      history.replaceState(null, "", "/me");
      if (r.s === 200) { saveToken({ token: r.j.token, expires: r.j.expires, id: r.j.actor.id, email: r.j.actor.email, name: r.j.actor.name, standing: r.j.actor.standing }); paintRail(); refresh(); }
      else signedOut({ kind: "warn", text: "This link does not work: it was already used, or it is older than an hour. Ask for a new one." });
    }).catch(function () { sec.querySelector("h1").textContent = "Not reachable"; });
  } else if (token()) refresh();
  else signedOut(null);
})();
