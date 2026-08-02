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
// Der einzige Schalter für die Sichtbarkeit in Suchmaschinen. Solange er false
// ist, geht auf jeder Seite X-Robots-Tag: noindex raus; die Seiten selbst
// tragen dazu nichts, damit es nur eine Stelle gibt. Auf true setzen, sobald
// der Hub öffentlich gefunden werden soll — mehr ist nicht zu tun, robots.txt
// und sitemap.xml richten sich danach.
const INDEXABLE = false;
// Was in die sitemap.xml gehört: die inhaltlichen Seiten. /records, /projects
// und /services zeigen, was auf dem jeweiligen Gerät liegt, /project ist noch
// nicht gebaut — nichts davon hat in einem Suchindex etwas verloren.
const SITEMAP = ["/", "/tools", "/modules", "/contribute",
  "/modules/social", "/modules/nature-based",
  "/modules/technical", "/tools/lehrplan21-citation",
  "/tools/lehrplan21-stand-in", "/tools/auditable-back-office",
  "/tools/payroll-run", "/tools/second-opinion"];

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
  // Je Modul ein eigener Eintrag, alle auf dieselbe Datei: die Allowlist
  // bleibt, und module.js liest den Slug aus dem Pfad.
  // Je Katalogeintrag ein eigener Eintrag, alle auf dieselbe Datei: die
  // Allowlist bleibt, und detail.js liest Abteilung und Slug aus dem Pfad.
  ["/modules/social",                { file: "detail.html", type: HTML }],
  ["/modules/nature-based",          { file: "detail.html", type: HTML }],
  ["/modules/technical",             { file: "detail.html", type: HTML }],
  ["/tools/lehrplan21-citation",     { file: "detail.html", type: HTML }],
  ["/tools/lehrplan21-stand-in",     { file: "detail.html", type: HTML }],
  ["/tools/auditable-back-office",   { file: "detail.html", type: HTML }],
  ["/tools/payroll-run",             { file: "detail.html", type: HTML }],
  ["/tools/second-opinion",          { file: "detail.html", type: HTML }],
  ["/assets/catalogue.js",   { file: "assets/catalogue.js",   type: JS }],
  ["/assets/cards.js",       { file: "assets/cards.js",       type: JS }],
  ["/assets/detail.js",      { file: "assets/detail.js",      type: JS }],
  ["/assets/services-ui.js", { file: "assets/services-ui.js", type: JS }],
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
  // Vorschaubild für geteilte Links. Wird nicht von der Seite geladen, sondern
  // von fremden Diensten geholt, deshalb greift die CSP hier nicht.
  ["/assets/share-1200x630.png", { file: "assets/share-1200x630.png", type: "image/png" }],
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

  const path = normalize(req.url);

  // robots.txt und sitemap.xml entstehen aus SITEMAP und INDEXABLE, damit sie
  // nicht getrennt gepflegt werden müssen und nie etwas anderes behaupten als
  // der Kopf, den die Seiten mitbekommen.
  if (path === "/robots.txt") {
    // Auch bei noindex bleibt das Crawlen erlaubt: wer nicht laden darf, sieht
    // den noindex-Kopf nicht und darf die URL trotzdem in den Index nehmen.
    const body = INDEXABLE
      ? `User-agent: *\nAllow: /\n\nSitemap: https://${CANON}/sitemap.xml\n`
      : `User-agent: *\nAllow: /\n`;
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end(body);
    return;
  }
  if (path === "/sitemap.xml") {
    if (!INDEXABLE) { res.writeHead(404, { "Content-Type": "text/plain" }).end("404\n"); return; }
    const urls = SITEMAP.map((p) => `  <url><loc>https://${CANON}${p}</loc></url>`).join("\n");
    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" })
       .end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
    return;
  }

  const route = ROUTES.get(path);
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
  if (!INDEXABLE) headers["X-Robots-Tag"] = "noindex, nofollow";
  // Die .app-Zone ist ohnehin HSTS-vorgeladen; die Kopfzeile macht es explizit.
  if (proto === "https") headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  res.writeHead(status, headers);
  res.end(req.method === "HEAD" ? undefined : entry.body);
}).listen(PORT, HOST, () => {
  console.log(`entrosana-app serving ${ROUTES.size} routes on http://${HOST}:${PORT}`);
});
