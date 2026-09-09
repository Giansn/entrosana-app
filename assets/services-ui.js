/* Eigene Dienste (2026-09-10): jedes Konto führt seine Liste auf dem Server. Geprüft wird
   von e14 (url, mcp, tcp, tls) oder der Dienst meldet sich selbst (webhook). Ohne Konto
   steht hier die Erklärung und der Weg zur Anmeldung; ein neues Konto sieht eine leere
   Liste mit derselben Erklärung. Das Team sieht darunter den Schnappschuss der eigenen
   Maschine (window.__services aus tools/services-snapshot.sh). */
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

  // Die Erklärung: für Besucher ohne Konto und für Konten ohne Eintrag dieselbe.
  function bubble(signedIn) {
    var h = el("div", "hint svc__bubble");
    h.appendChild(el("p", "hint__t", signedIn ? "Your list is empty. Here is what it is for." : "What this page is"));
    h.appendChild(el("p", null, "A list of things that must be up for your work: a school server, a file share in the staff room, an MCP server your assistant talks to, a nightly backup job. The Hub watches them and shows a dot per service: green when it answers, amber when something is off, grey when nothing has been heard yet."));
    var ul = el("ul", "measure");
    [["address", "the Hub's server opens a web address and expects an answer."],
     ["MCP", "it speaks to an MCP server, lists its tools and counts them."],
     ["port", "it checks that a port answers."],
     ["certificate", "it reads the TLS certificate and warns two weeks before it expires."],
     ["heartbeat", "for anything the Hub cannot reach, inside your network or a cron job: the service calls a secret address of its own, and the dot stays green as long as it keeps calling."]].forEach(function (k) { var li = el("li"); li.appendChild(el("b", null, k[0] + " — ")); li.appendChild(document.createTextNode(k[1])); ul.appendChild(li); });
    h.appendChild(ul);
    h.appendChild(el("p", null, signedIn ? "Addresses stay on the server; the list is yours and nobody else sees it. Add the first one below." : "The list belongs to your account and nobody else sees it. Sign in or register to keep one; it takes one mail."));
    return h;
  }

  function ledFor(state) { return el("span", "led led--" + (state === "ok" ? "ok" : state === "warn" ? "warn" : state === "off" ? "off" : "wait")); }
  function when(iso) { return iso ? String(iso).replace("T", " ").slice(0, 16) : "—"; }

  function paint() {
    UI.textContent = "";
    if (!tk) {
      UI.appendChild(bubble(false));
      var act = el("div", "actions"); var a1 = el("a", "btn", "Sign in or register"); a1.href = "/me"; act.appendChild(a1); UI.appendChild(act);
      paintSnapshot(false);
      return;
    }
    var items = (data && data.items) || [];
    var bar = el("div", "svcbar");
    var nOk = items.filter(function (r) { return r.state === "ok"; }).length, nBad = items.filter(function (r) { return r.state === "warn" || r.state === "off"; }).length, nWait = items.length - nOk - nBad;
    if (items.length) {
      var ok = el("span", "note note--ok"); ok.appendChild(el("span", "led")); ok.appendChild(document.createTextNode(nOk + " running")); bar.appendChild(ok);
      if (nBad) { var w = el("span", "note note--warn"); w.appendChild(el("span", "led led--warn")); w.appendChild(document.createTextNode(nBad + " down")); bar.appendChild(w); }
      if (nWait) { var q = el("span", "note note--idle"); q.appendChild(el("span", "led led--wait")); q.appendChild(document.createTextNode(nWait + " waiting")); bar.appendChild(q); }
    }
    var add = el("button", "btn", "+ Add a service"); add.type = "button"; add.addEventListener("click", openAdd); bar.appendChild(add);
    UI.appendChild(bar);
    var sc = document.getElementById("svc-count"); if (sc) sc.textContent = items.length || "";
    if (!items.length) { UI.appendChild(bubble(true)); paintSnapshot(true); return; }

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
    UI.appendChild(el("p", "note note--idle", "Checked from the Hub's server on the interval you set; heartbeats count when they arrive. Addresses stay on the server."));
    paintSnapshot(true);
  }

  // Schnappschuss der eigenen Maschine: nur für das Team.
  function paintSnapshot(signedIn) {
    var snap = window.__services; if (!snap || !tk || !(tk.standing === "owner" || tk.standing === "reviewer")) return;
    var sec = el("div", "svc__snap");
    sec.appendChild(el("span", "eyebrow", "The Hub's own machine"));
    sec.appendChild(el("p", "fine", snap.host + " · read " + snap.read + " · " + snap.services.length + " services · from tools/services-snapshot.sh, team only"));
    var tbl = el("table", "tbl"); tbl.innerHTML = "<thead><tr><th></th><th>service</th><th>what it serves</th><th>where</th><th class='num'>state</th></tr></thead>";
    var tb = el("tbody"), group = null;
    snap.services.forEach(function (s) {
      if (s.group !== group) { group = s.group; var g = el("tr", "svc__grp"); var gc = el("td", null, group); gc.colSpan = 5; g.appendChild(gc); tb.appendChild(g); }
      var tr = el("tr"); var c0 = el("td"); c0.appendChild(ledFor(s.state)); tr.appendChild(c0);
      tr.appendChild(el("td", "svc__n", s.name)); tr.appendChild(el("td", "svc__w", s.what)); tr.appendChild(el("td", "svc__p", s.where));
      tr.appendChild(el("td", "svc__s num " + (s.state === "ok" ? "ok" : s.state === "warn" ? "warn" : ""), s.status)); tb.appendChild(tr);
      if (s.flag) { var f = el("tr"); var fc = el("td"); fc.colSpan = 5; fc.appendChild(el("span", "svc__flag", s.flag)); f.appendChild(fc); tb.appendChild(f); }
    });
    tbl.appendChild(tb); sec.appendChild(tbl); UI.appendChild(sec);
  }

  function showHook(name, url) {
    var box = el("div", "hint svc__hook");
    box.appendChild(el("p", "hint__t", "The secret address for «" + name + "»"));
    box.appendChild(el("p", null, "Shown once. Have the service call it on its schedule; GET or POST both count, an optional «status» text is kept. The dot stays green while the calls keep coming."));
    var pre = el("pre", "watchline", url + "\n\ncurl -fsS " + url + "?status=ok"); box.appendChild(pre);
    var copy = el("button", "btn btn--ghost", "Copy the address"); copy.type = "button";
    copy.addEventListener("click", function () { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { copy.textContent = "Copied"; }); });
    box.appendChild(copy);
    var close = el("button", "btn btn--quiet", "Done"); close.type = "button"; close.addEventListener("click", function () { box.remove(); }); box.appendChild(close);
    UI.insertBefore(box, UI.firstChild.nextSibling);
  }

  // ------------------------------------------------------------ Hinzufügen
  var dlg = document.getElementById("svc-add");
  var HELP = { url: "The Hub's server opens it and expects an answer below 400. The address stays on the server; only you see this list.",
               mcp: "Streamable HTTP endpoint of an MCP server, for example https://host/mcp. The Hub sends initialize and tools/list and counts the tools. Servers behind a key show as «needs auth».",
               webhook: "No address needed: you get a secret address after adding. Your service calls it on its schedule; if the calls stop for longer than the interval, the dot turns amber, then grey.",
               tcp: "host:port, for example mail.example.org:993. The Hub checks that the port answers.",
               tls: "A host name, for example example.org. The Hub reads the certificate and warns two weeks before it expires." };
  var PLACEHOLDER = { url: "https://schulserver.example.org/", mcp: "https://tools.example.org/mcp", webhook: "", tcp: "mail.example.org:993", tls: "example.org" };
  function fill(id, values, selected) { var sel = dlg.querySelector(id); sel.textContent = ""; values.forEach(function (v) { var o = document.createElement("option"); o.value = v; o.textContent = v; if (v === selected) o.selected = true; sel.appendChild(o); }); }
  function syncKind() {
    var k = dlg.querySelector("#svc-kind").value, tf = dlg.querySelector("#svc-target-field");
    dlg.querySelector("#svc-target-help").textContent = HELP[k]; dlg.querySelector("#svc-target").placeholder = PLACEHOLDER[k];
    tf.hidden = k === "webhook";
  }
  function openAdd() {
    if (!dlg) return;
    if (!tk) { location.href = "/me"; return; }
    ["#svc-name", "#svc-what", "#svc-target"].forEach(function (id) { dlg.querySelector(id).value = ""; dlg.querySelector(id).closest(".field").className = "field"; });
    var msg = dlg.querySelector(".svc__msg"); if (msg) msg.remove();
    syncKind(); dlg.showModal();
  }
  if (dlg) {
    var d0 = data || {};
    fill("#svc-group", d0.groups || ["Public", "LAN and tailnet", "Data", "Jobs"], "Public");
    fill("#svc-where", d0.places || ["via tunnel", "cloudflared", "LAN", "tailnet", "container only", "oneshot", "cloud", "on site"], "via tunnel");
    dlg.querySelector("#svc-kind").addEventListener("change", syncKind);
    dlg.querySelector("[data-act='svc-save']").addEventListener("click", function () {
      var name = dlg.querySelector("#svc-name").value.trim(), nf = dlg.querySelector("#svc-name").closest(".field");
      if (!name) { nf.className = "field is-bad"; return; } nf.className = "field";
      var kind = dlg.querySelector("#svc-kind").value, target = dlg.querySelector("#svc-target").value.trim();
      var tfld = dlg.querySelector("#svc-target-field");
      if (kind !== "webhook" && !target) { tfld.className = "field is-bad"; return; } tfld.className = "field";
      var old = dlg.querySelector(".svc__msg"); if (old) old.remove();
      var btn = dlg.querySelector("[data-act='svc-save']"); btn.disabled = true; btn.textContent = "Checking…";
      api("/api/me/services", { method: "POST", body: JSON.stringify({ name: name, what: dlg.querySelector("#svc-what").value.trim(), group: dlg.querySelector("#svc-group").value, place: dlg.querySelector("#svc-where").value, check: kind + ":" + target, interval: Number(dlg.querySelector("#svc-interval").value) }) })
        .then(function (r) {
          btn.disabled = false; btn.textContent = "Add";
          if (r.s === 200) { dlg.close(); load().then(function () { if (r.j.hook_url) showHook(name, r.j.hook_url); }); }
          else { var m = el("p", "note note--warn svc__msg", r.j.error || ("HTTP " + r.s)); dlg.querySelector(".actions").before(m); }
        }).catch(function () { btn.disabled = false; btn.textContent = "Add"; var m = el("p", "note note--warn svc__msg", "The Hub's server is not reachable right now."); dlg.querySelector(".actions").before(m); });
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
