// Thema-Umschalter, gleiche Regel wie auf entrosana.com:
// ohne Attribut ist die Seite dunkel, data-theme="light" ist die gewählte Ausnahme.
// Der erste Teil läuft vor dem ersten Bild, damit nichts falsch aufblitzt.
try {
  if (localStorage.getItem("entrosana-theme") === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  }
} catch (e) { /* Speicher gesperrt: dann eben ohne Erinnerung */ }

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
