// Thema-Umschalter, gleiche Regel wie auf entrosana.com:
// ohne Attribut ist die Seite dunkel, data-theme="light" ist die gewählte Ausnahme.
// Der erste Teil läuft vor dem ersten Bild, damit nichts falsch aufblitzt.
try {
  if (localStorage.getItem("entrosana-theme") === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  }
} catch (e) { /* Speicher gesperrt: dann eben ohne Erinnerung */ }

// "/" führt seit 2026-10-31 serverseitig auf /start (serve.mjs); die einmalige
// Weiche für Erstbesucher, die hier stand, ist damit entfallen.

// Anmeldeknopf im Kopf der Landeseite (2026-10-31): liegt ein gültiger Login auf dem Gerät,
// führt er als «Your account» auf /me statt zum Anmelden.
document.addEventListener("DOMContentLoaded", function () {
  var a = document.querySelector("[data-acct]");
  if (!a) return;
  try {
    var t = JSON.parse(localStorage.getItem("entrosana-app:token") || "null");
    if (t && t.expires > new Date().toISOString()) a.textContent = "Your account";
  } catch (e) { /* siehe oben */ }
});

document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      var h = document.documentElement;
      var goingLight = h.getAttribute("data-theme") !== "light";
      if (goingLight) {
        h.setAttribute("data-theme", "light");
      } else {
        h.removeAttribute("data-theme");
      }
      b.setAttribute("aria-pressed", String(goingLight));
      try {
        localStorage.setItem("entrosana-theme", goingLight ? "light" : "dark");
      } catch (e) { /* siehe oben */ }
    });
  });
});
