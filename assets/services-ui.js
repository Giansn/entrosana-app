/* Eigene Dienste (2026-09-10): jedes Konto führt seine Liste auf dem Server. Geprüft wird
   von e14 (url, mcp, tcp, tls) oder der Dienst meldet sich selbst (webhook). Ohne Konto
   steht hier die Erklärung und der Weg zur Anmeldung; ein neues Konto sieht eine leere
   Liste mit derselben Erklärung. Das Team sieht darunter den Schnappschuss der eigenen
   Maschine (data.machine aus tools/services-snapshot.sh, kommt nur für den Eigentümer mit). */
(function () {
  var UI = document.getElementById("svc-ui");
  if (!UI) return;
  var TOKEN_KEY = "entrosana-app:token", K_OPEN = "entrosana-svcgroups:v2";
  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
  function token() { try { var t = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); return t && t.expires > new Date().toISOString() ? t : null; } catch (e) { return null; } }
  function api(path, opts) {
    opts = opts || {}; var tk = token(); var h = { Accept: "application/json" }; if (tk) h.Authorization = "Bearer " + tk.token; if (opts.body) h["Content-Type"] = "application/json";
    return fetch(path, Object.assign({ headers: h }, opts)).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }, function () { return { s: r.status, j: {} }; }); });
  }
  function read(key, fb) { try { return JSON.parse(localStorage.getItem(key)) || fb; } catch (e) { return fb; } }
  function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  var openState = read(K_OPEN, {});
  var KIND_WORD = { url: "address", mcp: "MCP", webhook: "heartbeat", tcp: "port", tls: "certificate" };
  var tk = token(), data = null;

  // Die Erklärung, in einfachen Worten: erst wozu die Seite da ist, dann die zwei Richtungen, dann die Schritte.
  // Für Besucher ohne Konto steht sie in der Seite, für Konten in einem grossen Fenster hinter dem (i).
  function bubble(signedIn, inDialog) {
    var h = el("div", "hint svc__bubble");
    if (!inDialog) h.appendChild(el("p", "hint__t", "What this page is for"));
    h.appendChild(el("p", null, "You have things that must keep running: a school server, a shared folder, a backup that runs at night, an MCP server your assistant uses. This page keeps your list of them and shows a dot for each one. Green: it answered. Amber: something is wrong. Grey: the Hub has not heard from it yet. The Hub does the checking, so you do not have to go and look."));

    h.appendChild(el("p", "hint__t", "Two ways a check can work"));
    var ul = el("ul", "measure");
    [["The Hub checks my service.", " You give the Hub an address of yours: a web address, an MCP server, a host and port, or a certificate name. The Hub tries it on a fixed rhythm and records whether it answered."],
     ["My service reports to the Hub.", " For things the Hub cannot reach itself: a machine inside your network, a cron job, a backup script. The Hub gives you a secret web address. Your job calls that address every time it runs. While the calls keep coming, the dot stays green; when they stop, it turns amber, then grey."]].forEach(function (k) {
      var li = el("li"); li.appendChild(el("b", null, k[0])); li.appendChild(document.createTextNode(k[1])); ul.appendChild(li);
    });
    h.appendChild(ul);

    h.appendChild(el("p", "hint__t", "How to set one up"));
    var ol = el("ol", "measure");
    [["Press «+ Add a service».", ""],
     ["Give it a name.", " That is the only thing you must fill in."],
     ["Choose the direction:", " «The Hub checks my service» or «My service reports to the Hub»."],
     ["If the Hub checks it:", " pick the kind of check (address, MCP, port or certificate) and type the address of your service."],
     ["If it reports to the Hub:", " press «Add and get the address». The Hub shows the secret address once, with a ready-made command line. Copy it into the job or the machine, so it calls the address each time it runs. Lost it? «new address» in the row makes a new one."],
     ["Optional:", " a short description, a category, where it sits, and how often. Category and place only sort the list. «How often» is how often the Hub checks, or how often a report must arrive."]].forEach(function (k) {
      var li = el("li"); li.appendChild(el("b", null, k[0]));
      if (k[1]) li.appendChild(document.createTextNode(k[1]));
      ol.appendChild(li);
    });
    h.appendChild(ol);

    h.appendChild(el("p", "hint__t", "Who sees it"));
    var who = signedIn ? "Only you. Addresses stay on the server; the list shows name, category and result." : "Only the account that made the list. Sign in or register to keep one.";
    if (signedIn && snapFor()) who += " As the owner you also see the services of the Hub's own machine here; they are read on the machine every ten minutes.";
    h.appendChild(el("p", null, who));
    return h;
  }

  // Das Fenster: gross, in der Mitte, scrollt in sich. Schliesst mit ×, «Got it», Escape oder Klick daneben.
  var infoDlg = null;
  function infoDialog(signedIn) {
    if (infoDlg) infoDlg.remove();
    infoDlg = el("dialog", "pick svc__infodlg"); infoDlg.setAttribute("aria-label", "What this page is for");
    var box = el("div", "pick__box");
    var head = el("div", "svc__pop__head"); head.appendChild(el("p", "h3", "What this page is for"));
    var x = el("button", "iconbtn svc__pop__x", "\u00d7"); x.type = "button"; x.setAttribute("aria-label", "Close"); x.addEventListener("click", function () { infoDlg.close(); }); head.appendChild(x);
    box.appendChild(head); box.appendChild(bubble(signedIn, true));
    var act = el("div", "actions"); var ok = el("button", "btn", "Got it"); ok.type = "button"; ok.addEventListener("click", function () { infoDlg.close(); }); act.appendChild(ok); box.appendChild(act);
    infoDlg.appendChild(box);
    infoDlg.addEventListener("click", function (e) { if (e.target === infoDlg) infoDlg.close(); });
    document.body.appendChild(infoDlg);
    return infoDlg;
  }
  function infoBtn(dialogEl) {
    var b = el("button", "iconbtn iconbtn--info"); b.type = "button";
    b.title = "What this page is for";
    b.setAttribute("aria-label", "What this page is for");
    b.setAttribute("aria-haspopup", "dialog");
    b.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.4"/>' +
      '<path d="M12 11.4v4.8"/><circle cx="12" cy="8.1" r=".95" fill="currentColor" stroke="none"/></svg>';
    b.addEventListener("click", function () { if (!dialogEl.open) dialogEl.showModal(); });
    return b;
  }

  function ledFor(state) { return el("span", "led led--" + (state === "ok" ? "ok" : state === "warn" ? "warn" : state === "off" ? "off" : "wait")); }
  function when(iso) { return iso ? String(iso).replace("T", " ").slice(0, 16) : "—"; }

  function paint() {
    UI.textContent = "";
    if (!tk) {
      UI.appendChild(bubble(false));
      var act = el("div", "actions"); var a1 = el("a", "btn", "Sign in or register"); a1.href = "/me"; act.appendChild(a1); UI.appendChild(act);
      var lg = legacyItems(); if (lg.length) UI.appendChild(el("p", "note note--idle", lg.length + (lg.length === 1 ? " entry" : " entries") + " from the earlier version of this page are still in this browser; sign in and they can be moved to your account."));
      return;
    }
    var own = (data && data.items) || [];
    var snap = snapFor(), machine = snap ? snap.services.map(function (s) { return { machine: true, name: s.name, what: s.what, place: s.where, group: s.group, state: s.state, status: s.status, flag: s.flag, read: snap.read, host: snap.host }; }) : [];
    var items = own.concat(machine);   // eine Liste: eigene Einträge und, beim Eigentümer, die Dienste der Maschine
    var bar = el("div", "svcbar");
    var nOk = items.filter(function (r) { return r.state === "ok"; }).length, nBad = items.filter(function (r) { return r.state === "warn" || r.state === "off"; }).length, nWait = items.length - nOk - nBad;
    if (items.length) {
      var ok = el("span", "note note--ok"); ok.appendChild(el("span", "led")); ok.appendChild(document.createTextNode(nOk + " running")); bar.appendChild(ok);
      if (nBad) { var w = el("span", "note note--warn"); w.appendChild(el("span", "led led--warn")); w.appendChild(document.createTextNode(nBad + " down")); bar.appendChild(w); }
      if (nWait) { var q = el("span", "note note--idle"); q.appendChild(el("span", "led led--wait")); q.appendChild(document.createTextNode(nWait + " waiting")); bar.appendChild(q); }
    }
    var add = el("button", "btn", "+ Add a service"); add.type = "button"; add.addEventListener("click", openAdd); bar.appendChild(add);
    bar.appendChild(infoBtn(infoDialog(true)));
    UI.appendChild(bar);
    try { localStorage.setItem("entrosana-svc-own:v1", String(own.length)); localStorage.setItem("entrosana-svc-machine:v1", String(machine.length)); } catch (e) {}   // Zähler in der Leiste auf den anderen Seiten
    var sc = document.getElementById("svc-count"); if (sc) sc.textContent = items.length || "";
    if (machine.length) UI.appendChild(el("p", "fine", machine.length + " of these are read straight from " + snap.host + " by the snapshot script, last at " + snap.read + "; the others are checked by the Hub on the interval you set."));
    var legacy = legacyItems();
    if (legacy.length) UI.appendChild(legacyBox(legacy));
    if (!items.length) {
      var none = el("div", "hint");
      none.appendChild(el("p", "hint__t", "Your list is empty."));
      none.appendChild(el("p", null, legacy.length ? "The entries from the earlier version of this page are above; move them to your account or add a new one." : "Add the first service above. The button beside it says what the Hub can watch."));
      UI.appendChild(none); return;
    }

    var order = [], byGroup = {};
    items.forEach(function (r) { if (!byGroup[r.group]) { byGroup[r.group] = []; order.push(r.group); } byGroup[r.group].push(r); });
    order.forEach(function (g) {
      var list = byGroup[g];
      var bad = list.filter(function (r) { return r.state === "warn" || r.state === "off"; }).length;
      var wait = list.filter(function (r) { return r.state !== "ok" && r.state !== "warn" && r.state !== "off"; }).length;
      var d = el("details", "grp"); d.open = openState[g] != null ? !!openState[g] : true;
      d.addEventListener("toggle", function () { openState[g] = d.open; write(K_OPEN, openState); });
      var sum = el("summary"); sum.appendChild(el("span", "grp__n", g)); sum.appendChild(el("span", "grp__c", String(list.length)));
      sum.appendChild(el("span", "grp__s " + (bad ? "warn" : wait ? "" : "ok"), bad ? bad + " down" : wait ? wait + " waiting" : "all ok")); d.appendChild(sum);
      var body = el("div", "grp__body"), tbl = el("table", "tbl");
      tbl.innerHTML = "<thead><tr><th></th><th>service</th><th>what it serves</th><th>where</th><th>check</th><th class='num'>state</th><th></th></tr></thead>";
      var tb = el("tbody");
      list.forEach(function (r) {
        if (r.machine) { tb.appendChild(machineRow(r)); if (r.flag) { var fr = el("tr"); var fc = el("td"); fc.colSpan = 7; fc.appendChild(el("span", "svc__flag", r.flag)); fr.appendChild(fc); tb.appendChild(fr); } return; }
        var tr = el("tr"); var c0 = el("td"); c0.appendChild(ledFor(r.state)); tr.appendChild(c0);
        var c1 = el("td", "svc__n"); c1.appendChild(document.createTextNode(r.name)); if (r.target_hint) { c1.appendChild(document.createElement("br")); c1.appendChild(el("span", "fine", r.target_hint)); } tr.appendChild(c1);
        tr.appendChild(el("td", "svc__w", r.what || "")); tr.appendChild(el("td", "svc__p", r.place));
        var c4 = el("td", "svc__p"); c4.appendChild(el("span", "origin origin--own", KIND_WORD[r.kind] || r.kind)); c4.appendChild(document.createElement("br")); c4.appendChild(el("span", "fine", "every " + (r.interval >= 60 ? (r.interval / 60) + " h" : r.interval + " min"))); tr.appendChild(c4);
        var c5 = el("td", "svc__s num " + (r.state === "ok" ? "ok" : (r.state === "warn" || r.state === "off") ? "warn" : "")); c5.appendChild(document.createTextNode(r.status || "")); c5.appendChild(document.createElement("br")); c5.appendChild(el("span", "fine", r.kind === "webhook" ? (r.beat ? "last " + when(r.beat) : "") : (r.checked ? "checked " + when(r.checked) : ""))); tr.appendChild(c5);
        var c6 = el("td", "num");
        if (r.kind !== "webhook") { var chk = el("button", "rowact", "check now"); chk.type = "button"; chk.addEventListener("click", function () { chk.textContent = "…"; api("/api/me/services/" + r.id + "/check", { method: "POST" }).then(function (x) { if (x.s === 200) load(); else chk.textContent = x.j.error || "failed"; }); }); c6.appendChild(chk); }
        else { var rot = el("button", "rowact", "new address"); rot.type = "button"; rot.addEventListener("click", function () { if (!confirm("Renew the secret address? The old one stops working.")) return; api("/api/me/services/" + r.id + "/rotate", { method: "POST" }).then(function (x) { if (x.s === 200) showHook(r.name, x.j.hook_url); else rot.textContent = x.j.error || "failed"; }); }); c6.appendChild(rot); }
        var rm = el("button", "rowact rowact--danger", "remove"); rm.type = "button"; rm.addEventListener("click", function () { if (!confirm("Remove «" + r.name + "» from your list?")) return; api("/api/me/services/" + r.id, { method: "DELETE" }).then(load); }); c6.appendChild(rm);
        tr.appendChild(c6); tb.appendChild(tr);
      });
      tbl.appendChild(tb); body.appendChild(tbl); d.appendChild(body); UI.appendChild(d);
    });
    UI.appendChild(el("p", "note note--idle", (machine.length ? "Rows marked " + snap.host + " are read on the machine itself every ten minutes; the others are checked from the Hub's server on the interval you set. " : "Checked from the Hub's server on the interval you set; ") + "Heartbeats count when they arrive. Addresses stay on the server."));
  }
  // Eine Zeile der Maschine: gleiche Spalten wie die eigenen, Herkunft statt Prüfart, keine Knöpfe.
  function machineRow(r) {
    var tr = el("tr", "svc__mrow"); var c0 = el("td"); c0.appendChild(ledFor(r.state)); tr.appendChild(c0);
    tr.appendChild(el("td", "svc__n", r.name)); tr.appendChild(el("td", "svc__w", r.what || "")); tr.appendChild(el("td", "svc__p", r.place || ""));
    var c4 = el("td", "svc__p"); c4.appendChild(el("span", "origin origin--own", r.host)); c4.appendChild(document.createElement("br")); c4.appendChild(el("span", "fine", "read " + String(r.read || "").slice(11))); tr.appendChild(c4);   // nur die Uhrzeit; Datum steht in der Zeile über der Liste
    tr.appendChild(el("td", "svc__s num " + (r.state === "ok" ? "ok" : (r.state === "warn" || r.state === "off") ? "warn" : ""), r.status || ""));
    tr.appendChild(el("td", "num"));
    return tr;
  }

  // Schnappschuss der eigenen Maschine: nur für das Team.
  // Die Maschine gehört dem Eigentümer: die Schnittstelle gibt den Schnappschuss nur ihm mit.
  function snapFor() { var s = data && data.machine; return s && s.services ? s : null; }
  // Einträge aus der Fassung bis 2026-09-10 (entrosana-services:v1): lagen nur im Browser, der Server kannte sie nie.
  var K_LEGACY = "entrosana-services:v1";
  function legacyItems() { var o = read(K_LEGACY, null); return o && o.items && o.items.length ? o.items.filter(function (i) { return i && i.name; }) : []; }
  function legacyBox(list) {
    var box = el("div", "hint svc__legacy");
    box.appendChild(el("p", "hint__t", list.length + (list.length === 1 ? " entry" : " entries") + " from the earlier version of this page, still in this browser"));
    box.appendChild(el("p", null, "They were kept in the browser only, so the server never saw them and no other device shows them. Move them to your account and the Hub starts checking them the way you set; an entry without a check becomes a heartbeat, which you can replace afterwards."));
    var ul = el("ul", "measure");
    list.forEach(function (i) { var li = el("li"); li.appendChild(el("b", null, i.name)); li.appendChild(document.createTextNode((i.what ? " · " + i.what : "") + (i.where ? " · " + i.where : "") + " · " + (i.check && /^[a-z]+:/.test(i.check) ? i.check.split(":")[0] : "no check, becomes heartbeat"))); ul.appendChild(li); });
    box.appendChild(ul);
    var act = el("div", "actions");
    var mv = el("button", "btn", "Move them to my account"); mv.type = "button";
    mv.addEventListener("click", function () {
      mv.disabled = true; mv.textContent = "Moving…";
      var left = [], failed = [];
      (function next(k) {
        if (k >= list.length) {
          write(K_LEGACY, left.length ? { items: left } : null); if (!left.length) { try { localStorage.removeItem(K_LEGACY); } catch (e) {} }
          load().then(function () { if (failed.length) { var m = el("p", "note note--warn", failed.join(" · ")); UI.insertBefore(m, UI.firstChild.nextSibling); } });
          return;
        }
        var i = list[k], check = i.check && /^[a-z]+:/.test(i.check) ? i.check : "webhook:";
        api("/api/me/services", { method: "POST", body: JSON.stringify({ name: i.name, what: i.what && i.what !== "no description" ? i.what : "", group: i.group || "Public", place: i.where || "via tunnel", check: check, interval: 60 }) })
          .then(function (r) { if (r.s !== 200) { left.push(i); failed.push("«" + i.name + "»: " + (r.j.error || "HTTP " + r.s)); } next(k + 1); })
          .catch(function () { left.push(i); failed.push("«" + i.name + "»: server not reachable"); next(k + 1); });
      })(0);
    });
    var drop = el("button", "btn btn--quiet", "Discard them"); drop.type = "button";
    drop.addEventListener("click", function () { if (!confirm("Discard the " + list.length + " entries from the earlier page? They exist nowhere else.")) return; try { localStorage.removeItem(K_LEGACY); } catch (e) {} paint(); });
    act.appendChild(mv); act.appendChild(drop); box.appendChild(act);
    return box;
  }
  // ------------------------------------------------------------ Hinzufügen
  var dlg = document.getElementById("svc-add");
  var HELP = { url: "The address the Hub should open, https://… It expects an answer below 400. The address stays on the server; only you see this list.",
               mcp: "Streamable HTTP endpoint of an MCP server, for example https://host/mcp. The Hub sends initialize and tools/list and counts the tools. Servers behind a key show as «needs auth».",
               webhook: "Nothing to type here. Press «Add and get the address» and the Hub shows the secret address for this entry, once, with a ready curl line. It looks like https://entrosana.app/api/hooks/3f9c… Copy it into the job or the machine you want to watch and have it call the address on its schedule, at least once per interval. If the calls stop for longer than the interval, the dot turns amber, then grey. Lost it? «new address» in the row makes a fresh one.",
               tcp: "host:port, for example mail.example.org:993. The Hub checks that the port answers.",
               tls: "A host name, for example example.org. The Hub reads the certificate and warns two weeks before it expires." };
  var PLACEHOLDER = { url: "https://schulserver.example.org/", mcp: "https://tools.example.org/mcp", webhook: "", tcp: "mail.example.org:993", tls: "example.org" };
  function fill(id, values, selected) { var sel = dlg.querySelector(id); sel.textContent = ""; values.forEach(function (v) { var o = document.createElement("option"); o.value = v; o.textContent = v; if (v === selected) o.selected = true; sel.appendChild(o); }); }
  // Wer ruft wen: «hub» = der Hub prüft etwas von dir (Adresse nötig), «mine» = dein Dienst meldet sich (Lebenszeichen, Adresse kommt vom Hub).
  var K_DIR = "entrosana-svc-dir:v1";
  var DIR_HELP = { hub: "You give the Hub an address of yours; the Hub opens it on the interval and tells you whether it answers.",
                   mine: "The Hub gives you a secret address. Your job or machine calls it on its schedule, and the dot stays green while the calls keep coming. Nothing to type." };
  function dirNow() { var on = dlg.querySelector("#svc-dir .is-on"); return on ? on.getAttribute("data-dir") : "hub"; }
  function kindNow() { return dirNow() === "mine" ? "webhook" : dlg.querySelector("#svc-kind").value; }
  function setDir(d) {
    dlg.querySelectorAll("#svc-dir .bar__b").forEach(function (b) { var on = b.getAttribute("data-dir") === d; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", String(on)); });
    dlg.querySelector("#svc-dir-help").textContent = DIR_HELP[d];
    dlg.querySelector("#svc-kind-field").hidden = d === "mine";
    var stale = dlg.querySelector(".svc__msg"); if (stale) stale.remove();   // ein Hinweis zur anderen Richtung gilt nicht mehr
    dlg.querySelector("#svc-target-field").className = "field";
    write(K_DIR, d); syncKind();
  }
  function syncKind() {
    var k = kindNow(), inp = dlg.querySelector("#svc-target"), lab = dlg.querySelector("label[for='svc-target']");
    dlg.querySelector("#svc-target-help").textContent = HELP[k]; inp.placeholder = PLACEHOLDER[k];
    inp.hidden = lab.hidden = (k === "webhook");   // beim Lebenszeichen bleibt die Erklärung stehen, nur das Adressfeld geht
    dlg.querySelector("[data-act='svc-save']").textContent = saveLabel();
  }
  function saveLabel() { return kindNow() === "webhook" ? "Add and get the address" : "Add"; }
  function say(text) { var old = dlg.querySelector(".svc__msg"); if (old) old.remove(); var m = el("p", "note note--warn svc__msg", text); dlg.querySelector(".actions").before(m); }
  // Nach dem Anlegen eines Lebenszeichens bleibt der Dialog offen und zeigt die Adresse dort, wo man gerade hinschaut.
  function hookView(name, url) {
    var v = el("div", "svc__hookview");
    v.appendChild(el("span", "eyebrow", "Added"));
    v.appendChild(el("p", "h3", "The secret address for «" + name + "»"));
    v.appendChild(el("p", null, "It belongs to this entry alone and is shown only now. Paste it into the job or the machine you want to watch and have it call the address on its schedule, at least once per interval; GET or POST both count, an optional «status» text is kept. The dot in the list stays green while the calls keep coming. If you lose the address, «new address» in the row makes a fresh one."));
    var pre = el("pre", "watchline", url + "\n\ncurl -fsS " + url + "?status=ok"); v.appendChild(pre);
    var act = el("div", "actions");
    var copy = el("button", "btn", "Copy the address"); copy.type = "button";
    copy.addEventListener("click", function () { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { copy.textContent = "Copied"; }, function () { copy.textContent = "Select it above and copy"; }); else copy.textContent = "Select it above and copy"; });
    var done = el("button", "btn btn--ghost", "Done"); done.type = "button"; done.addEventListener("click", function () { dlg.close(); });
    act.appendChild(copy); act.appendChild(done); v.appendChild(act);
    return v;
  }
  function openAdd() {
    if (!dlg) return;
    if (!tk) { location.href = "/me"; return; }
    ["#svc-name", "#svc-what", "#svc-target"].forEach(function (id) { dlg.querySelector(id).value = ""; dlg.querySelector(id).closest(".field").className = "field"; });
    var msg = dlg.querySelector(".svc__msg"); if (msg) msg.remove();
    dlg.classList.remove("is-hook"); var hv = dlg.querySelector(".svc__hookview"); if (hv) hv.remove();
    setDir(read(K_DIR, "hub") === "mine" ? "mine" : "hub"); dlg.showModal();
  }
  if (dlg) {
    var d0 = data || {};
    fill("#svc-group", d0.groups || ["Public", "LAN and tailnet", "Data", "Jobs"], "Public");
    fill("#svc-where", d0.places || ["via tunnel", "cloudflared", "LAN", "tailnet", "container only", "oneshot", "cloud", "on site"], "via tunnel");
    dlg.querySelector("#svc-kind").addEventListener("change", syncKind);
    dlg.querySelectorAll("#svc-dir .bar__b").forEach(function (b) { b.addEventListener("click", function () { setDir(b.getAttribute("data-dir")); }); });
    dlg.querySelector("[data-act='svc-save']").addEventListener("click", function () {
      var name = dlg.querySelector("#svc-name").value.trim(), nf = dlg.querySelector("#svc-name").closest(".field");
      if (!name) { nf.className = "field is-bad"; say("Give the service a name first; it is the only field that is always required."); dlg.querySelector("#svc-name").focus(); return; } nf.className = "field";
      var kind = kindNow(), target = dlg.querySelector("#svc-target").value.trim();
      var tfld = dlg.querySelector("#svc-target-field");
      if (kind !== "webhook" && !target) { tfld.className = "field is-bad"; say("This needs the address of your service, the one the Hub should open. If your service should call the Hub instead, choose «My service reports to the Hub» above."); dlg.querySelector("#svc-target").focus(); return; } tfld.className = "field";
      var old = dlg.querySelector(".svc__msg"); if (old) old.remove();
      var btn = dlg.querySelector("[data-act='svc-save']"); btn.disabled = true; btn.textContent = "Checking…";
      api("/api/me/services", { method: "POST", body: JSON.stringify({ name: name, what: dlg.querySelector("#svc-what").value.trim(), group: dlg.querySelector("#svc-group").value, place: dlg.querySelector("#svc-where").value, check: kind + ":" + target, interval: Number(dlg.querySelector("#svc-interval").value) }) })
        .then(function (r) {
          btn.disabled = false; btn.textContent = saveLabel();
          if (r.s === 200 && r.j.hook_url) { dlg.querySelector(".pick__box").appendChild(hookView(name, r.j.hook_url)); dlg.classList.add("is-hook"); load(); }
          else if (r.s === 200) { dlg.close(); load(); }
          else { var m = el("p", "note note--warn svc__msg", r.j.error || ("HTTP " + r.s)); dlg.querySelector(".actions").before(m); }
        }).catch(function () { btn.disabled = false; btn.textContent = saveLabel(); say("The Hub's server is not reachable right now."); });
    });
    dlg.querySelector("[data-act='svc-cancel']").addEventListener("click", function () { dlg.close(); });
  }

  function load() {
    if (!tk) { paint(); return Promise.resolve(); }
    return api("/api/me/services").then(function (r) {
      if (r.s === 401) { tk = null; paint(); return; }
      data = r.s === 200 ? r.j : { items: [] };
      if (dlg && data.groups) { fill("#svc-group", data.groups, dlg.querySelector("#svc-group").value || "Public"); fill("#svc-where", data.places, dlg.querySelector("#svc-where").value || "via tunnel"); }
      paint();
    }).catch(function () { UI.textContent = ""; UI.appendChild(el("p", "note note--warn", "The Hub's server is not reachable right now.")); });
  }
  load();
  if (/(^|[?&])add(=|&|$)/.test(location.search)) setTimeout(openAdd, 300);
})();
