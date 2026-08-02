// Minimaler Server für entrosana.app.
//
// Bewusst ohne Fremdabhängigkeiten und ohne Dateisystem-Auflösung: die Zuordnung
// von URL zu Datei steht vollständig in ROUTES. Aus einer Anfrage wird nie ein
// Pfad gebaut, deshalb ist Pfad-Traversal strukturell ausgeschlossen und nicht
// bloss abgesichert. Neue Seite heisst: neuer Eintrag in ROUTES.
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4322);
const HOST = process.env.HOST || "127.0.0.1";
// Öffentlich gibt es genau einen Ursprung: https://entrosana.app. www und
// blankes http leiten dorthin um, sonst legt localStorage je Ursprung eine
// eigene, leere Kopie aller Daten an. Lokale Zugriffe (127.0.0.1, Proben)
// tragen einen anderen Host und bleiben unberührt.
const CANON = "entrosana.app";

const HTML = "text/html; charset=utf-8";
const CSS = "text/css; charset=utf-8";
const JS = "text/javascript; charset=utf-8";
const ROUTES = new Map([
  ["/",           { file: "index.html",      type: HTML }],
  ["/tools",      { file: "tools.html",      type: HTML }],
  ["/modules",    { file: "modules.html",    type: HTML }],
  ["/contribute", { file: "contribute.html", type: HTML }],
  ["/project",    { file: "project.html",    type: HTML }],
  ["/records",    { file: "records.html",    type: HTML }],
  ["/projects",  { file: "projects.html",  type: HTML }],
  ["/services",   { file: "services.html",   type: HTML }],
  ["/assets/app.css",     { file: "assets/app.css",     type: CSS }],
  ["/assets/app.js",      { file: "assets/app.js",      type: JS }],
  ["/assets/overview.js", { file: "assets/overview.js", type: JS }],
  ["/assets/dialog.js",   { file: "assets/dialog.js",   type: JS }],
  ["/assets/rail-projects.js", { file: "assets/rail-projects.js", type: JS }],
  ["/assets/project.js",  { file: "assets/project.js",  type: JS }],
  ["/assets/project-head.js", { file: "assets/project-head.js", type: JS }],
  ["/assets/project.css", { file: "assets/project.css", type: CSS }],
  ["/assets/project-shell.css", { file: "assets/project-shell.css", type: CSS }],
  ["/assets/seeds.js",    { file: "assets/seeds.js",    type: JS }],
  ["/assets/services.js", { file: "assets/services.js", type: JS }],
  ["/assets/theme.js",    { file: "assets/theme.js",    type: JS }],
  ["/assets/mark.svg",    { file: "assets/mark.svg",    type: "image/svg+xml" }],
  // assets/fonts.css liegt noch auf der Platte, wird aber nicht mehr ausgeliefert:
  // die neun Schnitte haben keinen Lateinbereich (docs/handoff-design.md §3).
]);

// Die Seiten sind eigenständig: kein fremdes Skript, kein fremder Stil, kein
// fremdes Bild. Das einzige Skript ist der Themenumschalter von hier, deshalb
// 'self' und nicht 'unsafe-inline'. Schriften und das Rauschen im Hintergrund
// stecken als data:-URI in den eigenen Dateien.
const CSP = "default-src 'none'; style-src 'self'; script-src 'self'; " +
            "img-src 'self' data:; font-src data:; " +
            "form-action 'none'; frame-ancestors 'none'; base-uri 'none'";

const cache = new Map();
function load(route) {
  const path = join(ROOT, route.file);
  const body = readFileSync(path);
  const etag = `W/"${statSync(path).mtimeMs.toString(36)}-${body.length.toString(36)}"`;
  cache.set(route.file, { body, etag, type: route.type });
}
for (const route of ROUTES.values()) load(route);

// Beim Ändern einer Datei neu einlesen, ohne Neustart.
setInterval(() => {
  for (const route of ROUTES.values()) {
    try {
      const s = statSync(join(ROOT, route.file));
      const etag = `W/"${s.mtimeMs.toString(36)}-${s.size.toString(36)}"`;
      if (cache.get(route.file).etag !== etag) load(route);
    } catch { /* Datei kurzzeitig weg: alte Fassung weiter ausliefern */ }
  }
}, 5000);

// Nur Query und abschliessenden Schrägstrich entfernen; kein Auflösen von "..".
function normalize(url) {
  const path = url.split("?")[0].split("#")[0];
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Allow": "GET, HEAD" }).end();
    return;
  }
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" }).end("ok\n");
    return;
  }

  // Host und Schema kommen durch den Tunnel unverändert an: cloudflared reicht
  // den Host durch, die Cloudflare-Kante setzt X-Forwarded-Proto auf das
  // Schema des Besuchers.
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  const proto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
  if (host === "www." + CANON || (host === CANON && proto === "http")) {
    res.writeHead(301, { "Location": "https://" + CANON + req.url, "Content-Length": 0 }).end();
    return;
  }

  const route = ROUTES.get(normalize(req.url));
  // Unbekannte Pfade liefern die Startseite mit 404, damit nichts vorgetäuscht wird.
  const entry = cache.get((route ?? ROUTES.get("/")).file);
  const status = route ? 200 : 404;

  if (status === 200 && req.headers["if-none-match"] === entry.etag) {
    res.writeHead(304, { ETag: entry.etag, "Cache-Control": "no-cache" }).end();
    return;
  }
  const headers = {
    "Content-Type": entry.type,
    "Content-Length": entry.body.length,
    // no-cache statt no-store: der Browser darf behalten, muss aber mit dem
    // ETag nachfragen. Änderungen erscheinen weiterhin sofort, Unverändertes
    // kommt als 304 ohne Rumpf zurück statt jedes Mal ganz.
    "Cache-Control": "no-cache",
    "ETag": entry.etag,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": CSP,
  };
  // Die .app-Zone ist ohnehin HSTS-vorgeladen; die Kopfzeile macht es explizit.
  if (proto === "https") headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  res.writeHead(status, headers);
  res.end(req.method === "HEAD" ? undefined : entry.body);
}).listen(PORT, HOST, () => {
  console.log(`entrosana-app serving ${ROUTES.size} routes on http://${HOST}:${PORT}`);
});
