/* propose.js — kurzer Ablauf vor dem Vorschlagsformular (Eigentümer 2026-10-31:
 * «pop up describing in short terms how the contribution application and gate is working»).
 * Fängt jeden Verweis auf /contribute/submit ab und zeigt zuerst die fünf Schritte.
 * Die Schritte folgen dem Code: Bestätigung per Link (unbestätigt nach 7 Tagen gelöscht,
 * api/maintenance.mjs DAYS), Entscheid admitted/rejected mit Mail (server.mjs notify),
 * Tor vor der Veröffentlichung (contributions.mjs publishChecks: Name, als Beitragende
 * zugelassen, Annahme vermerkt). */
(function () {
  "use strict";
  var STEPS = [
    ["Send", "Fill in the form. No account needed."],
    ["Confirm", "We mail you a link. Open it within 7 days, or the proposal is deleted."],
    ["Review", "The team reads it. Claude, a language model by Anthropic in the USA, helps sort; a person decides."],
    ["Decision", "Admitted or not, by mail, with the reason."],
    ["Published", "It goes into the catalogue under your name. For that you need an account the team has approved for contributing; you apply on your account page."]
  ];
  var dlg = null;
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function build() {
    dlg = el("dialog", "pick propose"); dlg.setAttribute("aria-labelledby", "propose-h");
    var box = el("div", "pick__box");
    var h = el("p", "h3", "How a proposal goes in"); h.id = "propose-h"; box.appendChild(h);
    var ol = el("ol", "propose__steps");
    STEPS.forEach(function (s) { var li = el("li"); li.appendChild(el("b", null, s[0])); li.appendChild(el("span", null, s[1])); ol.appendChild(li); });
    box.appendChild(ol);
    var row = el("div", "actions");
    var go = el("a", "btn", "Continue to the form"); go.href = "/contribute/submit";
    var no = el("button", "btn btn--ghost", "Cancel"); no.type = "button"; no.addEventListener("click", function () { dlg.close(); });
    row.appendChild(go); row.appendChild(no); box.appendChild(row);
    dlg.appendChild(box); document.body.appendChild(dlg);
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href="/contribute/submit"]');
    if (!a || (dlg && dlg.contains(a)) || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault(); if (!dlg) build(); dlg.showModal(); dlg.querySelector(".btn").focus();
  });
})();
