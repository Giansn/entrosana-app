// api/server.mjs — der schreibende Dienst von entrosana.app. Phase 1: Fundament.
//
// Ohne Fremdabhängigkeiten: node:http und node:sqlite. Lauscht nur auf
// 127.0.0.1:4324; von aussen führt der Weg über den Tunnel mit der Pfadregel
// ^/api/.+ (docs/meilenstein-konten.md, Entscheid vom 2026-09-08).
//
// Routen stehen in einer expliziten Tabelle, wie in serve.mjs. Aus einer
// Anfrage wird nie ein Pfad oder eine SQL-Anweisung gebaut.
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4324);
const HOST = process.env.HOST || "127.0.0.1";
const DB_PATH = process.env.DB_PATH || join(ROOT, "db", "hub.sqlite");
const LOG = process.env.LOG || join(process.env.HOME || ROOT, ".sygnif", "logs", "entrosana-api.log");

mkdirSync(dirname(DB_PATH), { recursive: true });
mkdirSync(dirname(LOG), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");

// Migrationen: jede Datei db/NNN-*.sql genau einmal, in Reihenfolge, je in
// einer Transaktion. Ein zweiter Start wendet nichts erneut an.
db.exec(`CREATE TABLE IF NOT EXISTS migrations(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied TEXT NOT NULL)`);
function migrate() {
  const done = new Set(db.prepare("SELECT name FROM migrations").all().map(r => r.name));
  const files = readdirSync(join(ROOT, "db")).filter(f => /^\d{3}[^/]*\.sql$/.test(f)).sort();
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(ROOT, "db", f), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO migrations(name, applied) VALUES (?, ?)").run(f, new Date().toISOString());
      db.exec("COMMIT");
      applied++;
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`migration ${f}: ${e.message}`);
    }
  }
  return { total: files.length, applied };
}
const mig = migrate();

// Eine Zeile JSON je Ereignis. Kein Fliesstext im Protokoll.
function log(obj) {
  try { appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...obj }) + "\n"); } catch {}
}
log({ ev: "start", host: HOST, port: PORT, db: DB_PATH, migrations: mig });

function send(res, status, body, extra = {}) {
  const json = typeof body !== "string";
  const data = json ? JSON.stringify(body) : body;
  res.writeHead(status, {
    "Content-Type": json ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...extra,
  });
  res.end(data);
}

// ---- Routen ---------------------------------------------------------------
const routes = new Map();
routes.set("GET /api/healthz", (req, res) => {
  let dbOk = false;
  try { dbOk = db.prepare("SELECT 1 AS one").get().one === 1; } catch {}
  const n = db.prepare("SELECT COUNT(*) AS n FROM migrations").get().n;
  send(res, dbOk ? 200 : 503, { ok: dbOk, db: dbOk ? "ok" : "fail", migrations: n });
});

const METHODS = new Set(["GET", "HEAD", "POST", "PATCH", "DELETE"]);

createServer((req, res) => {
  const t0 = process.hrtime.bigint();
  const path = (req.url || "/").split("?")[0];
  // Hinter cloudflared zählt CF-Connecting-IP, aber nur, wenn die Anfrage wirklich
  // von localhost kommt. Sonst könnte jeder die Kopfzeile setzen.
  const local = req.socket.remoteAddress === "127.0.0.1" || req.socket.remoteAddress === "::ffff:127.0.0.1";
  const ip = local ? (req.headers["cf-connecting-ip"] || "127.0.0.1") : req.socket.remoteAddress;
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    log({ m: req.method, p: path, s: res.statusCode, ms: Math.round(ms * 10) / 10, ip });
  });

  if (!METHODS.has(req.method)) return send(res, 405, { error: "method not allowed" }, { Allow: "GET, HEAD" });
  const handler = routes.get(`${req.method === "HEAD" ? "GET" : req.method} ${path}`);
  if (handler) return handler(req, res);
  const known = [...routes.keys()].some(k => k.endsWith(" " + path));
  return known ? send(res, 405, { error: "method not allowed" }) : send(res, 404, { error: "not found" });
}).listen(PORT, HOST, () => {
  console.log(`entrosana-api on http://${HOST}:${PORT}, migrations ${mig.applied}/${mig.total} applied`);
});

process.on("SIGTERM", () => { log({ ev: "stop" }); db.close(); process.exit(0); });
