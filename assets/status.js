/* status.js — /contribute/status: Verweis aus der Mail einlösen, eigene
 * Beiträge und ihren Stand mit Begründung lesen. Ohne Server bleibt der Text
 * ehrlich: die Datei liegt auf dem Gerät, der Weg per Mail steht offen. */
(function () {
  "use strict";
  var host = document.getElementById("status");
  if (!host) return;
  var q = new URLSearchParams(location.search), TOKEN_KEY = "entrosana-app:token";
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function token() { try { var t = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); return t && t.expires > new Date().toISOString() ? t : null; } catch (e) { return null; } }
  function headers() { var h = {}; var t = token(); if (t) h["Authorization"] = "Bearer " + t.token; return h; }
  function api(path, opts) {
    return fetch(path, Object.assign({ headers: headers() }, opts || {})).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); });
  }
  function block(eyebrow, h, sub) {
    var s = el("section", "block hair"); if (eyebrow) s.appendChild(el("span", "eyebrow", eyebrow));
    if (h) s.appendChild(el("h1", "work__h", h)); if (sub) s.appendChild(el("p", "work__sub", sub)); host.appendChild(s); return s;
  }
  function row(card, k, v) { var r = el("div", "status__row"); r.appendChild(el("span", "status__k", k)); r.appendChild(el("span", null, v == null || v === "" ? "—" : String(v))); card.appendChild(r); }
  function when(iso) { return iso ? iso.replace("T", " ").slice(0, 16) + " UTC" : ""; }
  var WORDS = { received: "received, waiting for your confirmation", confirmed: "confirmed, waiting for review", reviewing: "in review",
                admitted: "admitted, waiting for publication", published: "published as a draft", rejected: "rejected", withdrawn: "withdrawn" };

  function offline(sec) {
    var n = el("p", "note note--idle", "The Hub's server is not reachable right now. Your files are safe on this device; export one from its project page and mail it to info@entrosana.com.");
    sec.appendChild(n);
  }

  function showItem(sec, c) {
    var card = el("div", "card");
    row(card, "title", c.title); row(card, "area", c.area); row(card, "status", WORDS[c.status] || c.status);
    row(card, "received", when(c.created)); row(card, "confirmed", when(c.confirmed)); row(card, "decided", when(c.decided));
    if (c.reason) row(card, "reason", c.reason);
    if (c.trail_ok === 1) row(card, "trail", "verified on the server"); else if (c.trail_ok === 0) row(card, "trail", "did not verify");
    if (c.slug) { var lk = el("a", null, "/modules/" + c.slug); lk.href = "/modules/" + c.slug; var rr = el("div", "status__row"); rr.appendChild(el("span", "status__k", "listed at")); rr.appendChild(lk); card.appendChild(rr); }
    if (c.attribution && token()) {
      var ar = el("div", "status__row"); ar.appendChild(el("span", "status__k", "if I erase my data"));
      var lab = el("label", "toggle"); var cb = el("input"); cb.type = "checkbox"; cb.checked = c.attribution === "keep";
      var tr = el("span", "toggle__track"); tr.appendChild(el("span", "toggle__dot")); lab.appendChild(cb); lab.appendChild(tr);
      lab.appendChild(el("span", "toggle__label", cb.checked ? "the module stays under my name" : "the module goes with it"));
      cb.addEventListener("change", function () {
        api("/api/contributions/" + c.id, { method: "PATCH", headers: Object.assign({ "Content-Type": "application/json" }, headers()), body: JSON.stringify({ attribution: cb.checked ? "keep" : "remove" }) })
          .then(function (r) { if (r.s === 409 && r.j.fresh_required) { lab.lastChild.textContent = "needs a fresh sign-in"; cb.checked = !cb.checked; fresh(lab.parentNode, "Changing the attribution needs a fresh sign-in."); return; } lab.lastChild.textContent = r.s === 200 ? (cb.checked ? "the module stays under my name" : "the module goes with it") : "not saved (" + r.s + ")"; })
          .catch(function () { lab.lastChild.textContent = "not saved, server unreachable"; });
      });
      ar.appendChild(lab); card.appendChild(ar);
    }
    sec.appendChild(card);
    if (["received", "confirmed", "reviewing", "withdrawn", "rejected"].indexOf(c.status) >= 0 && token()) {
      var del = el("button", "btn btn--quiet", "Delete this contribution"); del.type = "button"; del.style.marginTop = "1rem"; del.style.marginRight = ".6rem";
      del.addEventListener("click", function () {
        if (!confirm("Delete this contribution entirely? Its text and files leave the Hub; one chain line stays, without your name.")) return;
        api("/api/contributions/" + c.id, { method: "DELETE" })
          .then(function (r) { if (r.s === 200) location.href = "/contribute/status"; else sec.appendChild(el("p", "note note--warn", "Not deleted (" + r.s + "): " + (r.j.error || ""))); })
          .catch(function () { offline(sec); });
      });
      sec.appendChild(del);
    }
    if (["received", "confirmed", "reviewing"].indexOf(c.status) >= 0 && token()) {
      var b = el("button", "btn btn--danger", "Withdraw"); b.type = "button"; b.style.marginTop = "1rem";
      b.addEventListener("click", function () {
        if (!confirm("Withdraw this contribution? The record of it stays.")) return;
        api("/api/contributions/" + c.id, { method: "PATCH", headers: Object.assign({ "Content-Type": "application/json" }, headers()), body: JSON.stringify({ status: "withdrawn" }) })
          .then(function (r) { if (r.s === 200) location.reload(); else sec.appendChild(el("p", "note note--warn", "Not withdrawn (" + r.s + ").")); })
          .catch(function () { offline(sec); });
      });
      sec.appendChild(b);
    }
  }

  function listOwn(sec) {
    if (!token()) { sec.appendChild(el("p", "note note--idle", "No confirmed address on this device yet. Open the link from your mail here, and your contributions appear.")); return; }
    api("/api/contributions").then(function (r) {
      if (r.s !== 200) { sec.appendChild(el("p", "note note--warn", "Could not read your contributions (" + r.s + ").")); return; }
      if (!r.j.items.length) { sec.appendChild(el("p", "note note--idle", "Nothing submitted from this address yet.")); return; }
      var card = el("div", "card");
      r.j.items.forEach(function (c) {
        var a = el("a", null, "#" + c.id + " · " + c.title + " — " + (WORDS[c.status] || c.status)); a.href = "/contribute/status?id=" + c.id;
        var rr = el("div", "status__row"); rr.appendChild(el("span", "status__k", when(c.created))); rr.appendChild(a); card.appendChild(rr);
      });
      sec.appendChild(card);
      erase(sec, r.j.items);
    }).catch(function () { offline(sec); });
  }

  // Alles löschen, was der Hub über diese Adresse hat. Veröffentlichte Module
  // bleiben nur mit ausdrücklicher Wahl stehen.
  // Frische Anmeldung (2026-09-10): Löschen und Namensnennung verlangen eine Marke, die jünger als 15 Minuten ist.
  function fresh(box, why) {
    var old = box.querySelector(".fresh"); if (old) old.remove();
    var n = el("div", "fresh"); n.appendChild(el("p", "note note--warn", why + " We mail you a new link; open it on this device, then come back and try again."));
    var b = el("button", "btn btn--ghost", "Send me a fresh link"); b.type = "button";
    b.addEventListener("click", function () {
      b.disabled = true;
      api("/api/me", { headers: headers() }).then(function (m) {
        var mail = m.j && m.j.email; if (!mail) { b.textContent = "Sign in first"; return; }
        return api("/api/verify/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: mail, purpose: "login", age_ok: true }) })
          .then(function (r) { b.textContent = r.s === 202 ? "Sent to " + mail : "Not sent (" + r.s + ")"; });
      }).catch(function () { b.textContent = "Not reachable"; });
    });
    n.appendChild(b); box.appendChild(n);
  }
  function erase(sec, items) {
    var box = el("div", "plan"); box.style.marginTop = "1.4rem";
    box.appendChild(el("span", "tag", "your data"));
    var tk0 = null; try { tk0 = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); } catch (e) {}
    if (tk0 && tk0.standing === "owner") { box.appendChild(el("p", "note note--idle", "The owner account cannot erase itself. Hand ownership over first; every other account erases itself here.")); sec.appendChild(box); return; }
    var pub = items.filter(function (c) { return c.status === "published"; });
    box.appendChild(el("p", null, "Erase everything the Hub holds about this address: your contributions, the confirmation records, this device's access. " +
      (pub.length ? "For published modules you decide now whether each one stays in the catalogue under your name." : "")));
    var choices = {};
    pub.forEach(function (c) {
      var lab = el("label", "toggle"); lab.style.display = "flex"; lab.style.marginTop = ".4rem";
      var cb = el("input"); cb.type = "checkbox"; cb.checked = c.attribution === "keep"; choices[c.id] = cb;
      var tr = el("span", "toggle__track"); tr.appendChild(el("span", "toggle__dot")); lab.appendChild(cb); lab.appendChild(tr);
      lab.appendChild(el("span", "toggle__label", "keep «" + c.title + "» published under my name")); box.appendChild(lab);
    });
    var ex = el("a", "btn btn--ghost", "Download my data"); ex.href = "/api/me/export"; ex.style.marginTop = ".8rem"; ex.style.marginRight = ".6rem";
    ex.addEventListener("click", function (ev) {   // mit Marke laden, dann als Datei speichern
      ev.preventDefault();
      fetch("/api/me/export", { headers: headers() }).then(function (r) { return r.json(); }).then(function (j) {
        var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: "application/json" }));
        a.download = "entrosana-hub-export.json"; document.body.appendChild(a); a.click(); a.remove();
      }).catch(function () { offline(sec); });
    });
    box.appendChild(ex);
    var b = el("button", "btn btn--danger", "Erase my data"); b.type = "button"; b.style.marginTop = ".8rem";
    b.addEventListener("click", function () {
      if (!confirm("Erase your data now? This cannot be undone. The chain keeps its lines without your name or address.")) return;
      var keep = [], remove = [];
      Object.keys(choices).forEach(function (id) { (choices[id].checked ? keep : remove).push(Number(id)); });
      api("/api/me", { method: "DELETE", headers: Object.assign({ "Content-Type": "application/json" }, headers()), body: JSON.stringify({ keep: keep, remove: remove }) })
        .then(function (r) {
          if (r.s === 200) { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem("entrosana-app:submissions"); } catch (e) {}
            host.textContent = ""; var d = block("Erased", "Your data is gone.", null);
            d.appendChild(el("p", "note note--ok", r.j.kept + " module(s) kept under your name, " + r.j.unpublished + " taken out of the catalogue, " + r.j.deleted + " contribution(s) deleted.")); }
          else if (r.s === 409 && r.j.fresh_required) fresh(box, "Erasing needs a fresh sign-in.");
          else box.appendChild(el("p", "note note--warn", "Not erased (" + r.s + "): " + (r.j.error || ""))); })
        .catch(function () { offline(sec); });
    });
    box.appendChild(b); sec.appendChild(box);
  }

  if (q.get("verify")) {
    var sec = block("Confirmation", "Confirming your address…", null);
    api("/api/verify?token=" + encodeURIComponent(q.get("verify"))).then(function (r) {
      sec.querySelector("h1").textContent = r.s === 200 ? "Address confirmed." : "This link does not work.";
      if (r.s === 200) {
        try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: r.j.token, expires: r.j.expires, email: r.j.actor.email, name: r.j.actor.name, standing: r.j.actor.standing })); } catch (e) {}
        sec.appendChild(el("p", "note note--ok", (r.j.confirmed ? r.j.confirmed + " contribution(s) confirmed. " : "") + "This device can now read your contributions for 30 days."));
        history.replaceState(null, "", "/contribute/status");
        listOwn(block("Your contributions", null, null));
      } else {
        sec.appendChild(el("p", "note note--warn", "It was already used, or it is older than an hour. Submit again to get a new one."));
      }
    }).catch(function () { offline(sec); });
  } else if (q.get("id")) {
    var s2 = block("Contribution #" + q.get("id"), "Status", null);
    api("/api/contributions/" + encodeURIComponent(q.get("id"))).then(function (r) {
      if (r.s === 200) showItem(s2, r.j.item);
      else if (r.s === 401 || r.s === 403) s2.appendChild(el("p", "note note--idle", "Only the person who submitted this can read it. Open the link from your confirmation mail on this device first."));
      else s2.appendChild(el("p", "note note--warn", "Not found."));
    }).catch(function () { offline(s2); });
  } else {
    listOwn(block("Your contributions", "Status", "What you sent to the Hub from this address, and where each one stands."));
    var go = el("a", "btn", "Submit a new proposal"); go.href = "/contribute/submit"; go.style.marginTop = "1rem"; host.lastChild.appendChild(go);
    var acct = el("a", "btn btn--ghost", "Your account"); acct.href = "/me"; acct.style.marginTop = "1rem"; acct.style.marginLeft = ".6rem"; host.lastChild.appendChild(acct);
  }
})();
