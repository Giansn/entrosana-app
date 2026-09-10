// Minimaler Server für entrosana.app.
//
// Bewusst ohne Fremdabhängigkeiten und ohne Dateisystem-Auflösung: die Zuordnung
// von URL zu Datei steht vollständig in ROUTES. Aus einer Anfrage wird nie ein
// Pfad gebaut, deshalb ist Pfad-Traversal strukturell ausgeschlossen und nicht
// bloss abgesichert. Neue Seite heisst: neuer Eintrag in ROUTES.
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { PAGES as DOCS_PAGES, docsPage } from "./docs-render.mjs";
import { createHash } from "node:crypto";
import vm from "node:vm";
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
const DOCS_HOST = process.env.DOCS_HOST || "docs." + CANON;   // docs.entrosana.app (2026-09-10): Markdown aus docs-site/, gerendert in docs-render.mjs
// Der einzige Schalter für die Sichtbarkeit in Suchmaschinen. Solange er false
// ist, geht auf jeder Seite X-Robots-Tag: noindex raus; die Seiten selbst
// tragen dazu nichts, damit es nur eine Stelle gibt. Auf true setzen, sobald
// der Hub öffentlich gefunden werden soll — mehr ist nicht zu tun, robots.txt
// und sitemap.xml richten sich danach.
const INDEXABLE = false;
// Was in die sitemap.xml gehört: die inhaltlichen Seiten. /records, /projects
// und /services zeigen, was auf dem jeweiligen Gerät liegt, /project ist noch
// nicht gebaut — nichts davon hat in einem Suchindex etwas verloren.
const SITEMAP_BASE = ["/", "/tools", "/modules", "/contribute"];
// Dazu kommen die abgeleiteten Detailseiten ohne Entwurfsmarke, siehe deriveRoutes().
const SITEMAP = { get list() { return SITEMAP_BASE.concat([...DERIVED].filter(([, r]) => !r.draft).map(([p]) => p)); } };

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
  // Detailseiten (/modules/*, /tools/*, /contribute/*) stehen nicht mehr hier:
  // sie werden aus assets/catalogue.js abgeleitet, siehe deriveRoutes(). Die
  // Allowlist bleibt: ein Slug, der nicht im Katalog steht, ist weiterhin 404.
  // Stand eines Beitrags und Einreichen (Phase 4). Nicht in der Sitemap.
  ["/contribute/status",               { file: "status.html", type: HTML }],
  ["/me",                              { file: "me.html", type: HTML }],
  ["/guidelines",                      { file: "guidelines.html", type: HTML }],   // Regeln in einer Seite (2026-09-10)
  ["/review",                          { file: "review.html", type: HTML }],   // Team: Schlange, Entscheide, Bewerbungen
  ["/me/modules",                      { file: "module.html", type: HTML }],   // Beitragende: eigene Module bearbeiten
  ["/request",                         { file: "request.html", type: HTML }],
  ["/contribute/submit",               { file: "submit.html", type: HTML }],
  ["/assets/catalogue.js",   { file: "assets/catalogue.js",   type: JS }],
  ["/assets/catalogue-sizes.js", { file: "assets/catalogue-sizes.js", type: JS }],
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
  ["/assets/theme.js",    { file: "assets/theme.js",    type: JS }],
  ["/assets/status.js",   { file: "assets/status.js",   type: JS }],
  ["/assets/me.js",       { file: "assets/me.js",       type: JS }],
  ["/assets/review.js",       { file: "assets/review.js",       type: JS }],
  ["/assets/module.js",       { file: "assets/module.js",       type: JS }],
  ["/assets/request.js",  { file: "assets/request.js",  type: JS }],
  ["/assets/languages.js", { file: "assets/languages.js", type: JS }],
  ["/assets/profile.js",  { file: "assets/profile.js",  type: JS }],
  ["/assets/search.js",   { file: "assets/search.js",   type: JS }],
  ["/assets/submit.js",   { file: "assets/submit.js",   type: JS }],
  ["/assets/mark.svg",    { file: "assets/mark.svg",    type: "image/svg+xml" }],
  ["/assets/fonts/kavivanar-latin.woff2",     { file: "assets/fonts/kavivanar-latin.woff2",     type: "font/woff2" }],
  ["/assets/fonts/kavivanar-latin-ext.woff2", { file: "assets/fonts/kavivanar-latin-ext.woff2", type: "font/woff2" }],
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
const CSP = "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; " +
            "img-src 'self' data: blob:; font-src 'self' data:; " +
            "form-action 'none'; frame-ancestors 'none'; base-uri 'none'";

// Abgeleitete Routen: der Katalog wird so gelesen, wie der Browser ihn liest
// (im Sandkasten, ohne Netz), und je Eintrag entsteht /abschnitt/slug auf
// detail.html. Ändert sich die Datei, wird neu abgeleitet, ohne Neustart.
const CATALOGUE = join(ROOT, "assets", "catalogue.js");
let DERIVED = new Map(), catalogueTag = "";
function deriveRoutes() {
  const s = statSync(CATALOGUE);
  const tag = `${s.mtimeMs}-${s.size}`;
  if (tag === catalogueTag) return;
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(CATALOGUE, "utf8"), sandbox, { timeout: 1000 });
  const cat = sandbox.window.__catalogue || {};
  const m = new Map();
  for (const sec of ["modules", "tools", "contribute"]) {
    for (const e of ((cat[sec] || {}).list || [])) {
      if (typeof e.slug === "string" && /^[a-z0-9][a-z0-9-]{0,60}$/.test(e.slug)) {
        m.set(`/${sec}/${e.slug}`, { file: "detail.html", type: HTML, draft: !!e.draft });
      }
    }
  }
  DERIVED = m; catalogueTag = tag;
  console.log(`entrosana-app derived ${m.size} detail routes from catalogue.js`);
}
try { deriveRoutes(); } catch (e) { console.error("catalogue.js not derivable:", e.message); }

const cache = new Map();
// Versionen von Hand (?v=…) waren die Regel, weil die Kante Assets vier Stunden
// vorhält. Seit 2026-09-09 setzt der Server sie selbst: jeder Verweis auf
// /assets/<datei> in einer HTML-Seite bekommt den Inhalts-Hash der Datei als
// ?v=. Ändert sich ein Asset (Katalog, Checklisten, CSS), ändert sich der
// Verweis, und die Kante liefert die neue Fassung sofort. Das <html>-Element
// trägt den Hash des Katalogs (data-cv), damit search.js ihn nachladen kann.
const ASSET_REF = /(["'])\/assets\/([A-Za-z0-9._-]+)(\?v=[0-9A-Za-z_-]+)?\1/g;
function assetTag(name) {
  const e = cache.get("assets/" + name);
  return e ? createHash("sha1").update(e.body).digest("base64url").slice(0, 10) : null;
}
function version(src) {
  const cv = assetTag("catalogue.js") || "";
  return src.replace(ASSET_REF, (m, q, name) => { const tag = assetTag(name); return tag ? `${q}/assets/${name}?v=${tag}${q}` : m; })
            .replace(/<html(\s|>)/, (m, s) => `<html data-cv="${cv}"${s}`);
}
function load(route) {
  const path = join(ROOT, route.file);
  const source = readFileSync(path);
  const s = statSync(path);
  const srcTag = `${s.mtimeMs.toString(36)}-${source.length.toString(36)}`;
  const isHtml = route.type === HTML;
  const body = isHtml ? Buffer.from(version(source.toString("utf8")), "utf8") : source;
  const etag = isHtml ? `W/"${createHash("sha1").update(body).digest("base64url").slice(0, 16)}"` : `W/"${srcTag}"`;
  cache.set(route.file, { body, etag, type: route.type, srcTag });
}
// detail.html gehört zu keiner festen Route mehr, wird aber von allen
// abgeleiteten gebraucht; deshalb steht sie hier ausdrücklich.
const DETAIL = { file: "detail.html", type: HTML };
// /p/<id> und /contributors/<name>: das öffentliche Profil, alleinstehend ohne
// Leiste und Kopfleiste (2026-09-10). profile.html bleibt auf der Platte, wird
// aber nicht mehr ausgeliefert.
const PROFILE = { file: "contributor.html", type: HTML };
const FILES = () => [...ROUTES.values(), DETAIL, PROFILE];
// Erst die Assets, dann die Seiten: die Seiten brauchen die Hashes der Assets.
for (const route of FILES()) if (route.type !== HTML) load(route);
for (const route of FILES()) if (route.type === HTML) load(route);

// Beim Ändern einer Datei neu einlesen, ohne Neustart. Ändert sich ein Asset,
// werden alle Seiten neu versioniert.
setInterval(() => {
  try { deriveRoutes(); } catch (e) { console.error("catalogue.js not derivable:", e.message); }
  let assetsChanged = false;
  for (const route of FILES()) {
    try {
      const s = statSync(join(ROOT, route.file));
      const tag = `${s.mtimeMs.toString(36)}-${s.size.toString(36)}`;
      if (cache.get(route.file).srcTag !== tag) { load(route); if (route.type !== HTML) assetsChanged = true; }
    } catch { /* Datei kurzzeitig weg: alte Fassung weiter ausliefern */ }
  }
  if (assetsChanged) for (const route of FILES()) if (route.type === HTML) load(route);
}, 5000);

// Nur Query und abschliessenden Schrägstrich entfernen; kein Auflösen von "..".
function normalize(url) {
  const path = url.split("?")[0].split("#")[0];
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

// docs.entrosana.app (2026-09-10): dieselbe Hülle, dieselben Assets, Text aus docs-site/<seite>.md. Unbekannte Pfade
// liefern die erste Seite mit 404, wie beim Hub. Gehalten, bis Quelle, Hülle, Glyphen oder app.css sich ändern.
const docsCache = new Map();
function serveDocs(req, res, path, proto) {
  const key = path === "/" ? "getting-started" : path.replace(/^\/+|\/+$/g, "");
  const known = DOCS_PAGES.some(([k]) => k === key);
  const page = known ? key : "getting-started";
  const shellPath = join(ROOT, "docs-site", "shell.html"), mdPath = join(ROOT, "docs-site", page + ".md"), glyphPath = join(ROOT, "docs-site", "glyphs.json");
  const stamp = [shellPath, mdPath, glyphPath].map((f) => statSync(f).mtimeMs).join(":") + ":" + (assetTag("app.css") || "") + (assetTag("theme.js") || "");
  let e = docsCache.get(page);
  if (!e || e.stamp !== stamp) {
    const html = version(docsPage(ROOT, page, readFileSync(shellPath, "utf8"), JSON.parse(readFileSync(glyphPath, "utf8"))));
    const body = Buffer.from(html, "utf8");
    e = { stamp, body, etag: `W/"${createHash("sha1").update(body).digest("base64url").slice(0, 16)}"` };
    docsCache.set(page, e);
  }
  const status = known ? 200 : 404;
  if (status === 200 && req.headers["if-none-match"] === e.etag) { res.writeHead(304, { ETag: e.etag, "Cache-Control": "no-cache" }).end(); return; }
  const headers = { "Content-Type": HTML, "Content-Length": e.body.length, "Cache-Control": "no-cache", "ETag": e.etag,
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "Content-Security-Policy": CSP };
  if (!INDEXABLE) headers["X-Robots-Tag"] = "noindex, nofollow";
  if (proto === "https") headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  res.writeHead(status, headers);
  res.end(req.method === "HEAD" ? undefined : e.body);
}

createServer((req, res) => {
  try {
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
  if (host === DOCS_HOST && !path.startsWith("/assets/") && path !== "/robots.txt") { serveDocs(req, res, path, proto); return; }

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
    const urls = SITEMAP.list.map((p) => `  <url><loc>https://${CANON}${p}</loc></url>`).join("\n");
    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" })
       .end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
    return;
  }

  const route = ROUTES.get(path) || DERIVED.get(path) || ((/^\/p\/\d{1,12}$/.test(path) || /^\/contributors\/[a-z0-9_-]{1,80}$/.test(path)) ? PROFILE : undefined);
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
  } catch (e) {
    console.error("request failed:", req.url, e.message);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("internal error\n");
  }
}).listen(PORT, HOST, () => {
  console.log(`entrosana-app serving ${ROUTES.size} routes on http://${HOST}:${PORT}`);
});
