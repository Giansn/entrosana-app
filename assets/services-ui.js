/* Dienste-Ansicht: Kategorien zum Auf- und Zuklappen, Herkunft je Zeile, und
   eine eigene Liste.
 *
 * Drei Herkünfte, weil sie verschiedene Versprechen tragen:
 *   entrosana — kommt aus tools/services-snapshot.sh, auf e14 gemessen
 *   module    — mit einem Modul dazugekommen, gleiche Messung
 *   yours     — von dir eingetragen
 *
 * Ein grüner Punkt heisst: jemand hat nachgesehen. Gemessen wird auf e14, und
 * zwar nur, was in tools/services-watch.txt steht. Ein hier eingetragener
 * Dienst liegt deshalb zuerst nur auf diesem Gerät und steht als «not checked yet» — nie als «ok». Sobald derselbe Name aus dem Schnappschuss
 * kommt, verschwindet der lokale Eintrag von selbst; ab dann zeigt die Zeile
 * eine echte Messung.
 *
 * Zustand der Klappen und die eigene Liste liegen im localStorage, wie alles
 * andere in dieser App auch. */
(function () {
  var UI = document.getElementById("svc-ui");
  if (!UI) return;

  var K_OWN = "entrosana-services:v1";
  var K_OPEN = "entrosana-svcgroups:v1";
  var GROUPS = ["Public", "LAN and tailnet", "Data", "Jobs"];
  var WHERE = ["via tunnel", "cloudflared", "LAN", "tailnet", "container only", "oneshot"];
  var snap = window.__services || { host: "?", read: "?", services: [] };

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* voll oder gesperrt */ }
  }

  var own = read(K_OWN, { items: [] });
  if (!own.items) own.items = [];
  var openState = read(K_OPEN, {});

  // Was e14 inzwischen selbst misst, braucht keinen lokalen Platzhalter mehr.
  var known = {};
  snap.services.forEach(function (s) { known[s.name] = true; });
  var before = own.items.length;
  own.items = own.items.filter(function (o) { return !known[o.name]; });
  if (own.items.length !== before) write(K_OWN, own);


  function el(t, c, x) {
    var n = document.createElement(t);
    if (c) n.className = c;
    if (x != null) n.textContent = x;
    return n;
  }

  function watchLine(o) {
    return [o.name, o.what, o.group, o.where, o.check, "own"].join(" | ");
  }

  function rows() {
    var out = [];
    snap.services.forEach(function (s) {
      out.push({ group: s.group, name: s.name, what: s.what, where: s.where,
                 state: s.state, status: s.status, origin: s.origin || "entrosana" });
    });
    own.items.forEach(function (o, i) {
      out.push({ group: o.group, name: o.name, what: o.what, where: o.where,
                 state: "wait", status: "not checked yet", origin: "own", idx: i });
    });
    return out;
  }

  function paint() {
    UI.textContent = "";
    var all = rows();

    var order = [], byGroup = {};
    all.forEach(function (r) {
      if (!byGroup[r.group]) { byGroup[r.group] = []; order.push(r.group); }
      byGroup[r.group].push(r);
    });

    // Kopfzeile: zuerst die Zahl, die eine Antwort ist.
    var nOk = 0, nBad = 0, nWait = 0;
    all.forEach(function (r) {
      if (r.state === "ok") nOk++;
      else if (r.state === "warn" || r.state === "off") nBad++;
      else nWait++;
    });
    var bar = el("div", "svcbar");
    var ok = el("span", "note note--ok");
    ok.appendChild(el("span", "led"));
    ok.appendChild(document.createTextNode(nOk + " running"));
    bar.appendChild(ok);
    if (nBad) {
      var w = el("span", "note note--warn");
      w.appendChild(el("span", "led led--warn"));
      w.appendChild(document.createTextNode(nBad + " down"));
      bar.appendChild(w);
    }
    if (nWait) {
      var q = el("span", "note note--idle");
      q.appendChild(el("span", "led led--wait"));
      q.appendChild(document.createTextNode(nWait + " waiting"));
      bar.appendChild(q);
    }
    bar.appendChild(el("span", "note note--idle", snap.host + " · read " + snap.read));
    var add = el("button", "btn", "+ Add a service");
    add.type = "button";
    add.addEventListener("click", openAdd);
    bar.appendChild(add);
    UI.appendChild(bar);

    order.forEach(function (g) {
      var list = byGroup[g];
      var bad = list.filter(function (r) { return r.state === "warn" || r.state === "off"; }).length;
      var wait = list.filter(function (r) { return r.state !== "ok" && r.state !== "warn" && r.state !== "off"; }).length;

      var d = el("details", "grp");
      // Voreinstellung: zu, wenn alles läuft. Was Aufmerksamkeit braucht, steht offen.
      d.open = openState[g] != null ? !!openState[g] : (bad > 0 || wait > 0);
      d.addEventListener("toggle", function () { openState[g] = d.open; write(K_OPEN, openState); });

      var sum = el("summary");
      sum.appendChild(el("span", "grp__n", g));
      sum.appendChild(el("span", "grp__c", String(list.length)));
      sum.appendChild(el("span", "grp__s " + (bad ? "warn" : wait ? "" : "ok"),
                         bad ? bad + " down" : wait ? wait + " waiting" : "all ok"));
      d.appendChild(sum);

      var body = el("div", "grp__body");
      var tbl = el("table", "tbl");
      tbl.innerHTML = "<thead><tr><th></th><th>service</th><th>what it serves</th>" +
        "<th>where</th><th>origin</th><th class='num'>state</th><th></th></tr></thead>";
      var tb = el("tbody");
      list.forEach(function (r) {
        var tr = el("tr");
        tr.innerHTML =
          '<td><span class="led led--' + (r.state || "off") + '"></span></td>' +
          '<td class="svc__n"></td><td class="svc__w"></td><td class="svc__p"></td>' +
          '<td><span class="origin origin--' + r.origin + '"></span></td>' +
          '<td class="svc__s ' + (r.state === "ok" ? "ok" : (r.state === "warn" || r.state === "off") ? "warn" : "") + ' num"></td>' +
          '<td class="num"></td>';
        tr.children[1].textContent = r.name;
        tr.children[2].textContent = r.what;
        tr.children[3].textContent = r.where;
        tr.children[4].firstChild.textContent =
          r.origin === "own" ? "yours" : r.origin === "module" ? "module" : "entrosana";
        tr.children[5].textContent = r.status;
        if (r.idx != null) {
          var rm = el("button", "rowact rowact--danger", "remove");
          rm.type = "button";
          rm.addEventListener("click", function () {
            own.items.splice(r.idx, 1);
            write(K_OWN, own);
            paint();
          });
          tr.children[6].appendChild(rm);
        }
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      body.appendChild(tbl);
      d.appendChild(body);
      UI.appendChild(d);
    });

    if (own.items.length) {
      var h = el("div", "hint");
      h.appendChild(el("p", "hint__t", own.items.length === 1
        ? "One entry is waiting for its first check."
        : own.items.length + " entries are waiting for their first check."));
      h.appendChild(el("p", null,
        "They live on this device. e14 measures a service once its line stands in " +
        "tools/services-watch.txt — until then no green dot is claimed for it."));
      var pre = el("pre", "watchline", own.items.map(watchLine).join("\n"));
      h.appendChild(pre);
      var copy = el("button", "btn btn--ghost", "Copy the lines");
      copy.type = "button";
      copy.addEventListener("click", function () {
        var text = own.items.map(watchLine).join("\n");
        function done() { copy.textContent = "Copied"; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, select);
        } else { select(); }
        function select() {
          var r = document.createRange();
          r.selectNodeContents(pre);
          var s = window.getSelection();
          s.removeAllRanges();
          s.addRange(r);
          copy.textContent = "Selected — copy it";
        }
      });
      h.appendChild(copy);
      UI.appendChild(h);
    }
  }

  // ------------------------------------------------------------ Hinzufügen
  var dlg = document.getElementById("svc-add");

  function fill(id, values) {
    var sel = dlg.querySelector(id);
    values.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
  }

  function openAdd() {
    if (!dlg) return;
    ["#svc-name", "#svc-what", "#svc-check"].forEach(function (id) {
      dlg.querySelector(id).value = "";
      dlg.querySelector(id).closest(".field").className = "field";
    });
    dlg.showModal();
  }

  if (dlg) {
    fill("#svc-group", GROUPS);
    fill("#svc-where", WHERE);
    dlg.querySelector("[data-act='svc-save']").addEventListener("click", function () {
      var name = dlg.querySelector("#svc-name").value.trim();
      var nf = dlg.querySelector("#svc-name").closest(".field");
      if (!name) { nf.className = "field is-bad"; return; }
      nf.className = "field";
      own.items.push({
        name: name,
        what: dlg.querySelector("#svc-what").value.trim() || "no description",
        group: dlg.querySelector("#svc-group").value,
        where: dlg.querySelector("#svc-where").value,
        check: dlg.querySelector("#svc-check").value.trim() || "url:"
      });
      write(K_OWN, own);
      dlg.close();
      paint();
    });
    dlg.querySelector("[data-act='svc-cancel']").addEventListener("click", function () { dlg.close(); });
  }

  paint();
  // /services?add öffnet den Dialog direkt — praktisch zum Verlinken.
  if (/(^|[?&])add(=|&|$)/.test(location.search)) openAdd();
})();
