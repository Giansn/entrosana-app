// api/server.mjs — der schreibende Dienst von entrosana.app.
//
// Ohne Fremdabhängigkeiten: node:http und node:sqlite. Lauscht nur auf
// 127.0.0.1:4324; von aussen führt der Weg über den Tunnel mit der Pfadregel
// ^/api/.+ (docs/meilenstein-konten.md, Entscheid vom 2026-09-08).
//
// Routen stehen in einer expliziten Tabelle, wie in serve.mjs. Aus einer
// Anfrage wird nie ein Pfad oder eine SQL-Anweisung gebaut. Wer was darf,
// entscheidet allein policy.mjs; jede Handlung wird in audit angehängt.
import { createServer } from "node:http";
import { appendFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "./db.mjs";
import { append as auditAppend, verify as auditVerify } from "./audit.mjs";
import { can } from "./policy.mjs";
import { serviceToken, ensureServiceActor, resolveActor, issueToken, withRoles, newToken, sha } from "./auth.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4324);
const HOST = process.env.HOST || "127.0.0.1";
const DB_PATH = process.env.DB_PATH || join(HERE, "db", "hub.sqlite");
const LOG = process.env.LOG || join(process.env.HOME || HERE, ".sygnif", "logs", "entrosana-api.log");
const PUBLIC = process.env.PUBLIC_ORIGIN || "https://entrosana.app";
const MAIL = process.env.MAIL_SEND || join(HERE, "..", "tools", "mail-send.py");
const BODY_CAP = 16 * 1024;
const RATE = { limit: 5, windowMs: 3600e3 };   // docs/contributions.md, Entscheid 5

mkdirSync(dirname(LOG), { recursive: true });
const { db, migrations } = open(DB_PATH);
const TOKEN = serviceToken();
ensureServiceActor(db, auditAppend);

function log(obj) {
  try { appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...obj }) + "\n"); } catch {}
}
log({ ev: "start", host: HOST, port: PORT, db: DB_PATH, migrations });

// ---- Hilfen ------------------------------------------------------------------
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
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json\b/i.test(String(req.headers["content-type"] || ""))) return reject(new HttpError(415, "json only"));
    const chunks = []; let size = 0, done = false;
    const fail = e => { if (!done) { done = true; reject(e); req.resume(); } };   // Rest verwerfen, Antwort kann raus
    req.on("data", c => { if (done) return; size += c.length; size > BODY_CAP ? fail(new HttpError(413, "body too large")) : chunks.push(c); });
    req.on("end", () => { if (done) return; done = true; try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new HttpError(400, "bad json")); } });
    req.on("error", () => fail(new HttpError(400, "read error")));
  });
}

// Zähler je Schlüssel (ip:… und email:…), Fenster eine Stunde, im Speicher.
const hits = new Map();
function limited(key) {
  const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < RATE.windowMs);
  if (arr.length >= RATE.limit) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr); return false;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) { const a = v.filter(t => now - t < RATE.windowMs); a.length ? hits.set(k, a) : hits.delete(k); } }, 600e3).unref();

const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,189}\.[A-Za-z]{2,}$/;
function mail(to, subject, text) {
  return new Promise((resolve) => {
    const p = spawn("python3", [MAIL], { stdio: ["pipe", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", d => err += d);
    p.on("close", code => resolve({ ok: code === 0, code, err: err.trim().slice(0, 200) }));
    p.stdin.end(JSON.stringify({ to, subject, text }));
  });
}

// ---- Routen ---------------------------------------------------------------
const routes = new Map();

routes.set("GET /api/healthz", (ctx) => {
  let dbOk = false;
  try { dbOk = db.prepare("SELECT 1 AS one").get().one === 1; } catch {}
  const n = db.prepare("SELECT COUNT(*) AS n FROM migrations").get().n;
  send(ctx.res, dbOk ? 200 : 503, { ok: dbOk, db: dbOk ? "ok" : "fail", migrations: n });
});

routes.set("GET /api/me", (ctx) => {
  if (!ctx.actor) return send(ctx.res, 401, { error: "no actor" });
  const a = ctx.actor;
  send(ctx.res, 200, { id: a.id, kind: a.kind, email: a.email, name: a.name, roles: [...a.roles] });
});

// Schritt 1: Adresse nennen, Verweis per Mail erhalten. Antwort verrät nicht,
// ob die Adresse bekannt ist.
routes.set("POST /api/verify/request", async (ctx) => {
  const body = await readJson(ctx.req);
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim().slice(0, 120);
  if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, "bad email");
  if (limited("ip:" + ctx.ip) || limited("email:" + email)) throw new HttpError(429, "too many requests");
  const token = newToken(), now = new Date();
  db.prepare("INSERT INTO verifications(email, token_hash, created, expires) VALUES (?,?,?,?)")
    .run(email, sha(token), now.toISOString(), new Date(now.getTime() + 3600e3).toISOString());
  const link = `${PUBLIC}/api/verify?token=${token}`;
  const r = await mail(email, "entrosana Hub: confirm your address",
    `Hello${name ? " " + name : ""},\n\nsomeone (probably you) entered this address on entrosana.app.\n` +
    `Open this link within one hour to confirm it:\n\n${link}\n\nIf that was not you, ignore this mail; nothing happens.\n\nentrosana`);
  auditAppend(db, { kind: "verify.request", actor_id: null, resource: "email:" + sha(email).slice(0, 12), text: r.ok ? "verification mail sent" : "verification mail failed: " + (r.err || r.code) });
  if (!r.ok) throw new HttpError(502, "mail failed");
  send(ctx.res, 202, { ok: true, sent: true });
});

// Schritt 2: der Verweis wird geöffnet; die Adresse gilt, der Akteur entsteht,
// eine Zugangsmarke wird ausgegeben. Der Verweis ist danach verbraucht.
routes.set("GET /api/verify", (ctx) => {
  const token = String(ctx.query.get("token") || "");
  if (!token) throw new HttpError(400, "token missing");
  const row = db.prepare("SELECT * FROM verifications WHERE token_hash = ?").get(sha(token));
  const nowIso = new Date().toISOString();
  if (!row || row.used || row.expires <= nowIso) throw new HttpError(410, "link invalid or expired");
  db.exec("BEGIN IMMEDIATE");
  let actor;
  try {
    db.prepare("UPDATE verifications SET used = ? WHERE id = ?").run(nowIso, row.id);
    actor = db.prepare("SELECT * FROM actors WHERE email = ?").get(row.email);
    if (!actor) {
      const id = db.prepare("INSERT INTO actors(kind, email, created) VALUES ('email', ?, ?)").run(row.email, nowIso).lastInsertRowid;
      actor = db.prepare("SELECT * FROM actors WHERE id = ?").get(id);
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  auditAppend(db, { kind: "verify.ok", actor_id: actor.id, resource: "actor:" + actor.id, text: "email confirmed" });
  const t = issueToken(db, actor.id);
  const a = withRoles(db, actor);
  send(ctx.res, 200, { ok: true, token: t.token, expires: t.expires, actor: { id: a.id, email: a.email, roles: [...a.roles] } });
});

// Nur prüfende Rolle und Eigentümer: die Kette nachrechnen.
routes.set("GET /api/audit/verify", (ctx) => {
  if (!can(ctx.actor, "decide")) throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
  send(ctx.res, 200, auditVerify(db));
});

const METHODS = new Set(["GET", "HEAD", "POST", "PATCH", "DELETE"]);

createServer(async (req, res) => {
  const t0 = process.hrtime.bigint();
  const url = new URL(req.url || "/", "http://x");
  const path = url.pathname;
  const local = req.socket.remoteAddress === "127.0.0.1" || req.socket.remoteAddress === "::ffff:127.0.0.1";
  const ip = local ? String(req.headers["cf-connecting-ip"] || "127.0.0.1") : req.socket.remoteAddress;
  let actorId = null;
  res.on("finish", () => {
    log({ m: req.method, p: path, s: res.statusCode, ms: Math.round(Number(process.hrtime.bigint() - t0) / 1e5) / 10, ip, a: actorId });
  });
  try {
    if (!METHODS.has(req.method)) return send(res, 405, { error: "method not allowed" }, { Allow: "GET, HEAD, POST, PATCH, DELETE" });
    const handler = routes.get(`${req.method === "HEAD" ? "GET" : req.method} ${path}`);
    if (!handler) {
      const known = [...routes.keys()].some(k => k.endsWith(" " + path));
      return known ? send(res, 405, { error: "method not allowed" }) : send(res, 404, { error: "not found" });
    }
    const actor = resolveActor(db, req, TOKEN);
    actorId = actor ? actor.id : null;
    await handler({ req, res, ip, actor, query: url.searchParams });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    log({ ev: "error", p: path, err: String(e && e.message || e).slice(0, 300) });
    if (!res.headersSent) send(res, 500, { error: "internal" });
  }
}).listen(PORT, HOST, () => {
  console.log(`entrosana-api on http://${HOST}:${PORT}, migrations ${migrations.applied}/${migrations.total} applied`);
});

process.on("SIGTERM", () => { log({ ev: "stop" }); db.close(); process.exit(0); });
