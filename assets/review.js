/* Schlange für das Team (2026-09-09): Beiträge lesen und entscheiden, Bewerbungen
   freigeben — in der Gestaltung des Hubs, mit dem eigenen Konto (Eigentümer oder
   Prüfende). Die Konsole :8396 bleibt als zweiter Weg. */
(function () {
  var host = document.getElementById("review");
  if (!host) return;
  var TOKEN_KEY = "entrosana-app:token";
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function token() { try { var t = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); return t && t.expires > new Date().toISOString() ? t : null; } catch (e) { return null; } }
  function api(path, opts) {
    opts = opts || {}; var tk = token(); var h = { Accept: "application/json" }; if (tk) h.Authorization = "Bearer " + tk.token; if (opts.body) h["Content-Type"] = "application/json";
    return fetch(path, Object.assign({ headers: h }, opts)).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }, function () { return { s: r.status, j: {} }; }); });
  }
  function block(eyebrow, h, sub) { var s = el("section", "block hair"); if (eyebrow) s.appendChild(el("span", "eyebrow", eyebrow)); if (h) s.appendChild(el("h1", "work__h", h)); if (sub) s.appendChild(el("p", "work__sub work__sub--wide", sub)); host.appendChild(s); return s; }
  function when(iso) { return iso ? String(iso).replace("T", " ").slice(0, 16) : "—"; }
  var WORDS = { received: "received, unconfirmed", confirmed: "confirmed, waits for review", reviewing: "in review", admitted: "admitted, not published", published: "published", rejected: "rejected", withdrawn: "withdrawn" };
  var NEXT = { confirmed: [["reviewing", "take into review"]],
               reviewing: [["published", "admit and publish"], ["admitted", "admit, do not publish yet"], ["rejected", "reject"]],
               admitted: [["published", "publish"]],
               published: [["admitted", "take back from the catalogue"]] };
  var q = new URLSearchParams(location.search);
  var tk = token();

  if (!tk) { var s0 = block("Team", "Sign in first", "The review queue is for the owner and the reviewers."); var a0 = el("a", "btn", "Sign in"); a0.href = "/me"; s0.appendChild(a0); return; }
  if (tk.standing !== "owner" && tk.standing !== "reviewer") { block("Team", "Team only", "Your account is not a reviewer. The queue stays closed to it."); return; }

  function nav(active) {
    var chips = el("div", "chips");
    [["queue", "Proposals", "/review"], ["applications", "Applications", "/review?tab=applications"], ["members", "Members", "/review?tab=members"]].forEach(function (t) {
      var a = el("a", "chip" + (t[0] === active ? " chip--on" : ""), t[1]); a.href = t[2]; chips.appendChild(a);
    });
    var c = el("a", "chip", "Console :8396 ↗"); c.href = "http://100.115.236.97:8396/contributions"; c.target = "_blank"; c.rel = "noopener"; chips.appendChild(c);
    return chips;
  }

  function list() {
    var filter = q.get("status") || "";
    var sec = block("Team", "Review queue", "Every decision needs a reason; it goes to the person by mail and into the chain.");
    sec.appendChild(nav("queue"));
    var fl = el("div", "chips");
    [["", "all"]].concat(Object.keys(WORDS).map(function (k) { return [k, k]; })).forEach(function (f) {
      var b = el("a", "chip" + (f[0] === filter ? " chip--on" : ""), f[1]); b.href = "/review" + (f[0] ? "?status=" + f[0] : ""); fl.appendChild(b);
    });
    sec.appendChild(fl);
    var out = el("div"); sec.appendChild(out); out.appendChild(el("p", "fine", "Loading…"));
    api("/api/contributions").then(function (r) {
      out.textContent = "";
      if (r.s !== 200) { out.appendChild(el("p", "note note--warn", r.j.error || ("HTTP " + r.s))); return; }
      var items = (r.j.items || []).filter(function (c) { return !filter || c.status === filter; }).sort(function (a, b) { return b.id - a.id; });
      if (!items.length) { out.appendChild(el("p", "fine", "Nothing here.")); return; }
      var DONE = ["published", "rejected", "withdrawn"];   // abgeschlossen: nichts mehr zu tun
      items.forEach(function (c) {
        var done = DONE.indexOf(c.status) >= 0;
        var row = el("div", "rev" + (done ? " rev--done" : ""));
        var c1 = el("div", "rev__id"); c1.appendChild(el("span", null, "#" + c.id)); c1.appendChild(document.createElement("br")); c1.appendChild(el("span", "fine", when(c.created))); row.appendChild(c1);
        var c2 = el("div"); var t = el("p", "rev__t"); var ta = el("a", null, c.title); ta.href = "/review?c=" + c.id; t.appendChild(ta); c2.appendChild(t); c2.appendChild(el("span", "fine", c.area || "")); row.appendChild(c2);
        var st = el("div");
        if (done) { var dm = el("span", "note note--ok rev__done"); dm.appendChild(el("span", "led")); dm.appendChild(document.createTextNode("done")); st.appendChild(dm); st.appendChild(document.createElement("br")); }
        st.appendChild(document.createTextNode(WORDS[c.status] || c.status)); row.appendChild(st);
        row.appendChild(el("div", "fine", "Trail: " + (c.trail_ok === 1 ? "verified" : c.trail_ok === 0 ? "wrong" : "—")));
        var o = el("a", "btn btn--quiet", "Open"); o.href = "/review?c=" + c.id; row.appendChild(o);
        out.appendChild(row);
      });
    });
  }

  function detail(id) {
    var sec = block("Team", "Contribution #" + id, null); sec.appendChild(nav("queue"));
    var back = el("a", "fine", "‹ Back to the queue"); back.href = "/review"; sec.appendChild(back);
    var out = el("div"); sec.appendChild(out); out.appendChild(el("p", "fine", "Loading…"));
    api("/api/contributions/" + id).then(function (r) {
      out.textContent = "";
      if (r.s !== 200) { out.appendChild(el("p", "note note--warn", r.j.error || ("HTTP " + r.s))); return; }
      var c = r.j.item;
      sec.querySelector("h1").textContent = c.title;
      var dl = el("dl", "facts");
      [["Area", c.area], ["Status", WORDS[c.status] || c.status], ["Received", when(c.created)], ["Confirmed", when(c.confirmed)],
       ["Decided", when(c.decided) + (c.decided_by ? " · actor " + c.decided_by : "")], ["Reason", c.reason || "—"],
       ["Published", when(c.published) + (c.slug ? " · " : "")], ["Attribution", c.attribution === "keep" ? "stays when the data is erased" : "goes with the data"],
       ["Submitter", "actor " + c.actor_id], ["Trail", c.trail_ok === 1 ? "verified on the server" : c.trail_ok === 0 ? "does not verify" : "nothing sent"]].forEach(function (p) {
        var dt = el("dt", null, p[0]), dd = el("dd", null, p[1]); if (p[0] === "Published" && c.slug) { var la = el("a", null, "modules/" + c.slug); la.href = "/modules/" + c.slug; dd.appendChild(la); } dl.appendChild(dt); dl.appendChild(dd);
      });
      out.appendChild(dl);
      out.appendChild(el("span", "eyebrow", "Proposal")); out.appendChild(el("pre", "rev__pre", c.summary || "—"));
      out.appendChild(el("span", "eyebrow", "Files"));
      var ul = el("ul", "measure"); (c.files || []).forEach(function (f) { var li = el("li"); var a = el("a", null, f.label || f.url); a.href = f.url; a.target = "_blank"; a.rel = "noopener"; li.appendChild(a); ul.appendChild(li); });
      if (!(c.files || []).length) ul.appendChild(el("li", "fine", "none")); out.appendChild(ul);
      if ((c.records || []).length) {
        out.appendChild(el("span", "eyebrow", "Records of the submitter"));
        var tb = el("table", "rev__tbl"), tr0 = el("tr"); ["#", "when", "kind", "text", "hash"].forEach(function (h) { tr0.appendChild(el("th", null, h)); }); tb.appendChild(tr0);
        c.records.forEach(function (rc) { var tr = el("tr"); [rc.i, when(rc.t), rc.kind || "", rc.text || "", (rc.h || "").slice(0, 10)].forEach(function (v) { tr.appendChild(el("td", null, String(v == null ? "" : v))); }); tb.appendChild(tr); });
        out.appendChild(tb);
      }
      if (c.status === "admitted" || c.status === "reviewing") {
        var fails = c.checks || [];
        out.appendChild(el("span", "eyebrow", "Before publication"));
        out.appendChild(el("p", "note " + (fails.length ? "note--warn" : "note--ok"), fails.length ? "The gate is closed: " + fails.join("; ") : "All checks pass: name, standing, trail, area, title, proposal, file links."));
        if (fails.some(function (x) { return /not approved as contributor/.test(x); })) { var ap = el("p", "fine"); ap.appendChild(document.createTextNode("The person is a collector. Approve them under ")); var apa = el("a", null, "Applications"); apa.href = "/review?tab=applications"; ap.appendChild(apa); ap.appendChild(document.createTextNode(" if they applied.")); out.appendChild(ap); }
      }
      if (NEXT[c.status]) {
        out.appendChild(el("span", "eyebrow", "Decide"));
        var form = el("div", "rev__form"), sel = el("select"); NEXT[c.status].forEach(function (o) { var op = el("option", null, o[1]); op.value = o[0]; sel.appendChild(op); });
        var reason = el("textarea"); reason.placeholder = "Reason, at least three characters; it goes to the person by mail."; reason.rows = 4;
        var btn = el("button", "btn", "Decide"); btn.type = "button"; var msg = el("p", "fine", "");
        btn.addEventListener("click", function () {
          var rs = reason.value.trim(); if (rs.length < 3) { msg.textContent = "Reason missing."; msg.className = "note note--warn"; return; }
          msg.textContent = "…"; msg.className = "fine"; btn.disabled = true;
          api("/api/contributions/" + id, { method: "PATCH", body: JSON.stringify({ status: sel.value, reason: rs }) }).then(function (rr) {
            btn.disabled = false;
            if (rr.s === 200) { location.reload(); } else { msg.textContent = rr.j.error || ("HTTP " + rr.s); msg.className = "note note--warn"; }
          }).catch(function () { btn.disabled = false; msg.textContent = "The Hub's server is not reachable."; msg.className = "note note--warn"; });
        });
        form.appendChild(sel); form.appendChild(reason); form.appendChild(btn); form.appendChild(msg); out.appendChild(form);
      }
    });
  }

  function applications() {
    var sec = block("Team", "Applications", "Collectors who ask to become contributors. Approval needs a reason; it goes to the person by mail.");
    sec.appendChild(nav("applications"));
    var out = el("div"); sec.appendChild(out); out.appendChild(el("p", "fine", "Loading…"));
    api("/api/applications?all=1").then(function (r) {
      out.textContent = "";
      if (r.s !== 200) { out.appendChild(el("p", "note note--warn", r.j.error || ("HTTP " + r.s))); return; }
      var items = r.j.items || [], open = items.filter(function (a) { return !a.decided; }), done = items.filter(function (a) { return a.decided; });
      out.appendChild(el("span", "eyebrow", "Open (" + open.length + ")"));
      if (!open.length) out.appendChild(el("p", "fine", "none"));
      open.forEach(function (a) {
        var row = el("div", "rev"); var c1 = el("div", "rev__id", "#" + a.id); row.appendChild(c1);
        var c2 = el("div"); c2.appendChild(el("p", "rev__t", a.actor_name || "—")); c2.appendChild(el("span", "fine", a.actor_email || "")); c2.appendChild(el("pre", "rev__pre", a.text || "")); row.appendChild(c2);
        row.appendChild(el("div", "fine", when(a.created)));
        var form = el("div", "rev__form"); var reason = el("textarea"); reason.rows = 2; reason.placeholder = "Reason, at least three characters"; form.appendChild(reason);
        var bar = el("div", "actions"); var msg = el("span", "fine", "");
        [["approved", "approve", "btn"], ["declined", "decline", "btn btn--ghost"]].forEach(function (o) {
          var b = el("button", o[2], o[1]); b.type = "button";
          b.addEventListener("click", function () {
            var rs = reason.value.trim(); if (rs.length < 3) { msg.textContent = "Reason missing."; return; } msg.textContent = "…";
            api("/api/applications/" + a.id, { method: "PATCH", body: JSON.stringify({ outcome: o[0], reason: rs }) }).then(function (rr) { if (rr.s === 200) location.reload(); else msg.textContent = rr.j.error || ("HTTP " + rr.s); });
          });
          bar.appendChild(b);
        });
        bar.appendChild(msg); form.appendChild(bar); c2.appendChild(form);
        row.appendChild(el("div")); row.appendChild(el("div")); out.appendChild(row);
      });
      if (done.length) {
        out.appendChild(el("span", "eyebrow", "Decided (" + done.length + ")"));
        done.forEach(function (a) {
          var row = el("div", "rev rev--done"); row.appendChild(el("div", "rev__id", "#" + a.id));
          var c2 = el("div"); c2.appendChild(el("p", "rev__t", a.actor_name || "—")); c2.appendChild(el("span", "fine", a.actor_email || "")); row.appendChild(c2);
          var st2 = el("div"); var dm2 = el("span", "note note--ok rev__done"); dm2.appendChild(el("span", "led")); dm2.appendChild(document.createTextNode("done")); st2.appendChild(dm2); st2.appendChild(document.createElement("br"));
          st2.appendChild(el("span", a.outcome === "approved" ? "note note--ok" : "note note--warn", a.outcome === "approved" ? "approved" : "declined")); row.appendChild(st2);
          row.appendChild(el("div", "fine", when(a.decided))); row.appendChild(el("div", "fine", a.reason || "")); out.appendChild(row);
        });
      }
    });
  }

  // Mitglieder (2026-09-09): alle Konten mit Stand, Rollen, Profil und Zahlen; die Rollen vergibt der Server.
  var STAND = { collector: "collector", contributor: "contributor", reviewer: "reviewer", owner: "owner" };
  function members() {
    var sec = block("Team", "Members", "Everyone with an account. Collectors register freely; contributor standing comes through an application. Roles are granted on the server.");
    sec.appendChild(nav("members"));
    var out = el("div"); sec.appendChild(out); out.appendChild(el("p", "fine", "Loading…"));
    api("/api/actors").then(function (r) {
      out.textContent = "";
      if (r.s !== 200) { out.appendChild(el("p", "note note--warn", r.j.error || ("HTTP " + r.s))); return; }
      var items = (r.j.items || []).filter(function (a) { return a.kind === "email"; }).sort(function (a, b) { return b.id - a.id; });
      out.appendChild(el("p", "fine", items.length + (items.length === 1 ? " account" : " accounts")));
      items.forEach(function (a) {
        var pr = a.profile || {};
        var row = el("div", "rev");
        var c1 = el("div", "rev__id"); c1.appendChild(el("span", null, "#" + a.id)); c1.appendChild(document.createElement("br")); c1.appendChild(el("span", "fine", "since " + when(a.created).slice(0, 10))); row.appendChild(c1);
        var c2 = el("div"); var t = el("p", "rev__t"); var ta = el("a", null, a.name || "(no name yet)"); ta.href = "/p/" + a.id; t.appendChild(ta); c2.appendChild(t);
        c2.appendChild(el("span", "fine", a.email || ""));
        var line = [pr.role, pr.org, (pr.langs || []).join(", ")].filter(Boolean).join(" · "); if (line) c2.appendChild(el("p", "fine", line));
        if (pr.about) c2.appendChild(el("p", "fine", pr.about));
        row.appendChild(c2);
        var c3 = el("div"); c3.appendChild(el("span", "chip", STAND[a.standing] || a.standing)); if ((a.roles || []).length) c3.appendChild(el("p", "fine", "roles: " + a.roles.join(", "))); row.appendChild(c3);
        row.appendChild(el("div", "fine", (a.contributions || 0) + " contributions · " + (a.open_applications || 0) + " open applications · " + (a.devices || 0) + " devices"));
        var o = el("a", "btn btn--quiet", "Profile"); o.href = "/p/" + a.id; row.appendChild(o);
        out.appendChild(row);
      });
    });
  }

  if (q.get("c")) detail(q.get("c")); else if (q.get("tab") === "applications") applications(); else if (q.get("tab") === "members") members(); else list();
})();
