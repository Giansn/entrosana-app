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
import { validate as validateContribution, actionFor, verifyTrail } from "./contributions.mjs";
import { serviceToken, ensureServiceActor, resolveActor, issueToken, withRoles, newToken, sha } from "./auth.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4324);
const HOST = process.env.HOST || "127.0.0.1";
const DB_PATH = process.env.DB_PATH || join(HERE, "db", "hub.sqlite");
const LOG = process.env.LOG || join(process.env.HOME || HERE, ".sygnif", "logs", "entrosana-api.log");
const PUBLIC = process.env.PUBLIC_ORIGIN || "https://entrosana.app";
const MAIL = process.env.MAIL_SEND || join(HERE, "..", "tools", "mail-send.py");
const BODY_CAP = 256 * 1024;  // Kette eines Geräts als Hashes passt hinein
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

// Bestätigung anlegen und den Verweis verschicken. Die Adresse kommt nicht in
// die Kette, nur ein Kürzel ihres Hashes.
async function startVerification(email, name, purpose) {
  const token = newToken(), now = new Date();
  db.prepare("INSERT INTO verifications(email, token_hash, created, expires) VALUES (?,?,?,?)")
    .run(email, sha(token), now.toISOString(), new Date(now.getTime() + 3600e3).toISOString());
  const link = `${PUBLIC}/contribute/status?verify=${token}`;
  const what = purpose === "contribution" ? "a contribution to the entrosana Hub under this address" : "this address on entrosana.app";
  const r = await mail(email, purpose === "contribution" ? "entrosana Hub: confirm your contribution" : "entrosana Hub: confirm your address",
    `Hello${name ? " " + name : ""},\n\nsomeone (probably you) entered ${what}.\n` +
    `Open this link within one hour to confirm it:\n\n${link}\n\nIf that was not you, ignore this mail; nothing happens.\n\nentrosana`);
  auditAppend(db, { kind: "verify.request", actor_id: null, resource: "email:" + sha(email).slice(0, 12),
    text: r.ok ? `verification mail sent (${purpose})` : "verification mail failed: " + (r.err || r.code) });
  return r;
}

// Schritt 1: Adresse nennen, Verweis per Mail erhalten. Antwort verrät nicht,
// ob die Adresse bekannt ist.
routes.set("POST /api/verify/request", async (ctx) => {
  const body = await readJson(ctx.req);
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim().slice(0, 120);
  if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, "bad email");
  if (limited("ip:" + ctx.ip) || limited("email:" + email)) throw new HttpError(429, "too many requests");
  const r = await startVerification(email, name, "address");
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
  // Offene Beiträge dieser Adresse gelten jetzt als eingereicht.
  const pending = db.prepare("SELECT id FROM contributions WHERE actor_id = ? AND status = 'received'").all(actor.id);
  for (const c of pending) {
    db.prepare("UPDATE contributions SET status = 'confirmed', confirmed = ? WHERE id = ?").run(nowIso, c.id);
    auditAppend(db, { kind: "contribution.confirmed", actor_id: actor.id, resource: "contribution:" + c.id, text: "confirmed by email link" });
  }
  const t = issueToken(db, actor.id);
  const a = withRoles(db, actor);
  send(ctx.res, 200, { ok: true, token: t.token, expires: t.expires, confirmed: pending.length, actor: { id: a.id, email: a.email, roles: [...a.roles] } });
});

// Nur prüfende Rolle und Eigentümer: die Kette nachrechnen.
routes.set("GET /api/audit/verify", (ctx) => {
  if (!can(ctx.actor, "decide")) throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
  send(ctx.res, 200, auditVerify(db));
});

// ---- Beiträge (Phase 3) ----------------------------------------------------
function actorForEmail(email, name) {
  let a = db.prepare("SELECT * FROM actors WHERE email = ?").get(email);
  if (!a) {
    const id = db.prepare("INSERT INTO actors(kind, email, name, created) VALUES ('email', ?, ?, ?)")
      .run(email, name || null, new Date().toISOString()).lastInsertRowid;
    a = db.prepare("SELECT * FROM actors WHERE id = ?").get(id);
  } else if (name && !a.name) {
    db.prepare("UPDATE actors SET name = ? WHERE id = ?").run(name, a.id);
  }
  return a;
}
const asResource = c => ({ kind: "contribution", actor_id: c.actor_id, status: c.status });
function publicRow(c, full) {
  const r = { id: c.id, kind: c.kind, status: c.status, title: c.title, area: c.area, org_id: c.org_id,
              created: c.created, confirmed: c.confirmed, decided: c.decided, reason: c.reason };
  r.trail_ok = c.trail_ok;
  if (full) Object.assign(r, { summary: c.summary, files: JSON.parse(c.files_json || "[]"), trail: c.trail_md,
                               records: JSON.parse(c.trail_json || "[]"), actor_id: c.actor_id, decided_by: c.decided_by });
  return r;
}
const getContribution = id => db.prepare("SELECT * FROM contributions WHERE id = ?").get(Number(id));

// Öffentlich. Honigfalle bekommt dieselbe Antwort wie ein echter Beitrag.
routes.set("POST /api/contributions", async (ctx) => {
  const body = await readJson(ctx.req);
  const v = validateContribution(body);
  if (v.spam) {
    auditAppend(db, { kind: "spam.honeypot", actor_id: null, resource: null, text: "honeypot filled, discarded" });
    return send(ctx.res, 202, { ok: true, received: true });
  }
  if (!v.ok) throw new HttpError(400, v.error);
  const { email, name, title, area, summary, trail, files, org_id, records, chain } = v.value;
  let trailOk = null, trailJson = "[]";
  if (records.length || chain.length) {
    const tv = verifyTrail(chain, records);
    trailOk = tv.ok ? 1 : 0; trailJson = JSON.stringify(records);
    if (!tv.ok) auditAppend(db, { kind: "trail.mismatch", actor_id: null, resource: null, text: tv.why });
  }
  if (limited("ip:" + ctx.ip) || limited("email:" + email)) throw new HttpError(429, "too many requests");
  const actor = actorForEmail(email, name);
  // Wer schon eine gültige Marke für dieselbe Adresse trägt, hat sie bestätigt.
  const known = !!(ctx.actor && ctx.actor.id === actor.id);
  const now = new Date().toISOString();
  const id = Number(db.prepare(`INSERT INTO contributions(kind, status, actor_id, org_id, title, area, summary, files_json, trail_md, trail_json, trail_ok, created, confirmed)
    VALUES ('module', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(known ? "confirmed" : "received", actor.id, org_id, title, area, summary, JSON.stringify(files), trail, trailJson, trailOk, now, known ? now : null).lastInsertRowid);
  auditAppend(db, { kind: known ? "contribution.confirmed" : "contribution.received", actor_id: actor.id, resource: "contribution:" + id, text: `${area}: ${title}` });
  let mailed = null;
  if (!known) mailed = (await startVerification(email, name, "contribution")).ok;
  send(ctx.res, 202, { ok: true, id, status: known ? "confirmed" : "received", mail: mailed, trail_ok: trailOk });
});

// Prüfende und Eigentümer sehen die Schlange, alle anderen nur Eigenes.
routes.set("GET /api/contributions", (ctx) => {
  if (!ctx.actor) throw new HttpError(401, "no actor");
  const where = [], args = [];
  const status = ctx.query.get("status");
  if (status) { where.push("status = ?"); args.push(status); }
  if (!can(ctx.actor, "decide")) { where.push("actor_id = ?"); args.push(ctx.actor.id); }
  const rows = db.prepare(`SELECT * FROM contributions ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created DESC LIMIT 200`).all(...args);
  send(ctx.res, 200, { ok: true, items: rows.map(c => publicRow(c, false)) });
});

const patterns = [];
patterns.push([/^\/api\/contributions\/(\d{1,12})$/, {
  GET: (ctx, [id]) => {
    const c = getContribution(id);
    if (!c) throw new HttpError(404, "not found");
    if (!can(ctx.actor, "read", asResource(c))) throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
    send(ctx.res, 200, { ok: true, item: publicRow(c, true) });
  },
  PATCH: async (ctx, [id]) => {
    const c = getContribution(id);
    if (!c) throw new HttpError(404, "not found");
    const body = await readJson(ctx.req);
    const target = String(body.status || "");
    const action = actionFor(c.status, target);
    if (!action) throw new HttpError(409, `no transition ${c.status} → ${target || "?"}`);
    if (!can(ctx.actor, action, asResource(c))) throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
    const reason = String(body.reason || "").trim().slice(0, 2000);
    if (action === "decide" && reason.length < 3) throw new HttpError(400, "reason required");
    const now = new Date().toISOString();
    const final = ["admitted", "rejected", "withdrawn"].includes(target);
    db.prepare(`UPDATE contributions SET status = ?, decided = COALESCE(?, decided), decided_by = COALESCE(?, decided_by),
                reason = COALESCE(?, reason) WHERE id = ?`).run(target, final ? now : null, final ? ctx.actor.id : null, reason || null, c.id);
    auditAppend(db, { kind: "contribution." + target, actor_id: ctx.actor.id, resource: "contribution:" + c.id,
      text: reason || (action === "withdraw" ? "withdrawn by submitter" : target) });
    send(ctx.res, 200, { ok: true, item: publicRow(getContribution(c.id), true) });
  },
}]);

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
    const method = req.method === "HEAD" ? "GET" : req.method;
    let handler = routes.get(`${method} ${path}`), params = [];
    if (!handler) {
      for (const [re, byMethod] of patterns) {
        const m = re.exec(path);
        if (!m) continue;
        handler = byMethod[method]; params = m.slice(1);
        if (!handler) return send(res, 405, { error: "method not allowed" });
        break;
      }
    }
    if (!handler) {
      const known = [...routes.keys()].some(k => k.endsWith(" " + path));
      return known ? send(res, 405, { error: "method not allowed" }) : send(res, 404, { error: "not found" });
    }
    const actor = resolveActor(db, req, TOKEN);
    actorId = actor ? actor.id : null;
    await handler({ req, res, ip, actor, query: url.searchParams }, params);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    log({ ev: "error", p: path, err: String(e && e.message || e).slice(0, 300) });
    if (!res.headersSent) send(res, 500, { error: "internal" });
  }
}).listen(PORT, HOST, () => {
  console.log(`entrosana-api on http://${HOST}:${PORT}, migrations ${migrations.applied}/${migrations.total} applied`);
});

process.on("SIGTERM", () => { log({ ev: "stop" }); db.close(); process.exit(0); });
