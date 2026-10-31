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
import { appendFileSync, createReadStream, mkdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "./db.mjs";
import { append as auditAppend, verify as auditVerify } from "./audit.mjs";
import { can, rolesOf } from "./policy.mjs";
import { validate as validateContribution, actionFor, verifyTrail, publishChecks, EMAIL } from "./contributions.mjs";
import { appendEntry, removeEntry, updateEntry as updateCatalogueEntry, entryFor, readCatalogue } from "./publish.mjs";
import { exportActor, dormantSweep } from "./maintenance.mjs";
import { standingOf, currentApplication, openApplication, listApplications, decideApplication } from "./applications.mjs";
import { LANG_CODES, MAX_LANGS } from "./languages.mjs";
import { listJournal, addEntry, updateEntry, deleteEntry, publicProfile, publicProfileBySlug, slugOf, searchPublic } from "./journal.mjs";
import { QUOTA, MAX_FILE, checkUpload, safeName, pathFor, usedBytes, listFiles, fileRow, receive, removeFile, removeAll } from "./files.mjs";
import { KINDS as SVC_KINDS, GROUPS as SVC_GROUPS, PLACES as SVC_PLACES, INTERVALS as SVC_INTERVALS, MAX_PER_ACTOR as SVC_MAX, parseCheck, guardTarget, runCheck, heartbeatState } from "./services.mjs";
import { serviceToken, ensureServiceActor, resolveActor, issueToken, withRoles, newToken, sha } from "./auth.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4324);
const HOST = process.env.HOST || "127.0.0.1";
const DB_PATH = process.env.DB_PATH || join(HERE, "db", "hub.sqlite");
const LOG = process.env.LOG || join(process.env.HOME || HERE, ".sygnif", "logs", "entrosana-api.log");
const PUBLIC = process.env.PUBLIC_ORIGIN || "https://entrosana.app";
const INBOX = process.env.INBOX || "sygnif@entrosana.com";   // Postfach der Beitragenden, sortiert von sygnif
const INFO = process.env.INFO_INBOX || "info@entrosana.com";   // Anfragen: Module, Tracks, Werkzeuge, Dienste
const PHONE = "077 529 73 01";
const REQUEST_KINDS = ["module", "track", "tool", "service", "report", "contribute", "other"];   // report/contribute (2026-09-09): zu einem Modul, gehen an sygnif@
const MAIL = process.env.MAIL_SEND || join(HERE, "..", "tools", "mail-send.py");
const BODY_CAP = 256 * 1024;  // Kette eines Geräts als Hashes passt hinein
const RATE = { limit: 5, windowMs: 3600e3 };   // docs/contributions.md, Entscheid 5
const MAIL_CAP = 60;                            // Briefe je Stunde insgesamt, gegen Verstärkung
const FOUR_EYES = process.env.FOUR_EYES === "strict";   // strict: veröffentlichen darf nicht, wer angenommen hat

mkdirSync(dirname(LOG), { recursive: true });
const { db, migrations } = open(DB_PATH);
// Dateien der Konten liegen neben der Datenbank: api/db/files/<konto>/ (2026-09-10).
const FILES_ROOT = DB_PATH === ":memory:" ? "/tmp/entrosana-files" : dirname(DB_PATH);
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
// Ein Textfeld aus dem Rumpf: ohne Rand, höchstens max Zeichen; fehlt es, leer.
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

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
function limited(key, limit = RATE.limit) {
  const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < RATE.windowMs);
  if (arr.length >= limit) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr); return false;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) { const a = v.filter(t => now - t < RATE.windowMs); a.length ? hits.set(k, a) : hits.delete(k); } }, 600e3).unref();

function mail(to, subject, text) {
  return new Promise((resolve) => {
    const p = spawn("python3", [MAIL], { stdio: ["pipe", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", d => err += d);
    p.on("close", code => resolve({ ok: code === 0, code, err: err.trim().slice(0, 200) }));
    p.stdin.end(JSON.stringify({ to, subject, text }));
  });
}

// Die einreichende Person erfährt jede Entscheidung mit ihrer Begründung.
function notify(submitter, c, what, reason, url) {
  if (!submitter || !submitter.email || limited("mail:global", MAIL_CAP)) return;
  const words = { admitted: "admitted — it waits for publication", rejected: "rejected", published: "published" };
  mail(submitter.email, `entrosana Hub: your contribution «${c.title}» was ${what}`,
    `Hello${submitter.name ? " " + submitter.name : ""},\n\nyour contribution #${c.id} «${c.title}» was ${words[what] || what}.\n\n` +
    `Reason given by the reviewer:\n${reason}` + (url ? `\n\nIt is listed as a draft under your name at ${url}` : "") +
    `\n\nIts status page: ${PUBLIC}/contribute/status?id=${c.id}\n\nentrosana`).then(r => {
      auditAppend(db, { kind: "decision.mail", actor_id: null, resource: "contribution:" + c.id, text: r.ok ? `${what}: decision mail sent` : "decision mail failed: " + (r.err || r.code) });
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
  const a = ctx.actor, app = a.kind === "email" ? currentApplication(db, a.id) : null;
  send(ctx.res, 200, { id: a.id, kind: a.kind, email: a.email, name: a.name, created: a.created, roles: [...a.roles], standing: standingOf(a.roles), slug: slugOf(db, a),
    profile: { org: a.org || "", role: a.role || "", about: a.about || "", bio: a.bio || "", place: a.place || "", contact: a.contact_email || "", website: a.website || "", langs: a.langs || [] },
    avatar: a.avatar ? (a.avatar_updated || "1") : null,
    application: app ? { id: app.id, created: app.created, decided: app.decided, outcome: app.outcome, reason: app.reason } : null });
});

// Bestätigung anlegen und den Verweis verschicken. Die Adresse kommt nicht in
// die Kette, nur ein Kürzel ihres Hashes.
async function startVerification(email, name, purpose) {
  if (limited("mail:global", MAIL_CAP)) {
    auditAppend(db, { kind: "mail.capped", actor_id: null, resource: null, text: `global mail cap ${MAIL_CAP}/h reached, verification not sent` });
    return { ok: false, code: 429, err: "mail cap" };
  }
  const token = newToken(), now = new Date();
  const login = purpose === "login";
  // 2026-09-10 (OWASP): Anmeldelinks 20 Minuten; Bestätigungen zu Vorschlägen bleiben eine Stunde, die Person liest sie später.
  db.prepare("INSERT INTO verifications(email, token_hash, created, expires, name) VALUES (?,?,?,?,?)")
    .run(email, sha(token), now.toISOString(), new Date(now.getTime() + (login ? 20 * 60e3 : 3600e3)).toISOString(), name || null);
  const link = `${PUBLIC}${login ? "/me" : "/contribute/status"}?verify=${token}`;
  const what = purpose === "contribution" ? "entered a contribution to the entrosana Hub under this address"
             : login ? "asked to sign in to the entrosana Hub with this address" : "entered this address on entrosana.app";
  const r = await mail(email, purpose === "contribution" ? "entrosana Hub: confirm your contribution" : login ? "entrosana Hub: your sign-in link" : "entrosana Hub: confirm your address",
    `Hello${name ? " " + name : ""},\n\nsomeone (probably you) ${what}.\n` +
    `Open this link within ${login ? "20 minutes on the device you want to use" : "one hour"} to ${login ? "sign in" : "confirm it"}:\n\n${link}\n\nIf that was not you, ignore this mail; nothing happens.\n\nentrosana`);
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
  const purpose = body.purpose === "login" ? "login" : "address";
  if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, "bad email");
  if (purpose === "login" && body.age_ok !== true) throw new HttpError(400, "confirm that you are 13 or older, or register on behalf of a younger learner");   // 2026-09-10; nichts davon wird gespeichert
  if (limited("ip:" + ctx.ip) || limited("email:" + email)) throw new HttpError(429, "too many requests");
  const r = await startVerification(email, name, purpose);
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
  let actor, existed = false;
  try {
    db.prepare("UPDATE verifications SET used = ? WHERE id = ?").run(nowIso, row.id);
    actor = db.prepare("SELECT * FROM actors WHERE email = ?").get(row.email);
    existed = !!actor;
    if (!actor) {
      const id = db.prepare("INSERT INTO actors(kind, email, name, created) VALUES ('email', ?, ?, ?)").run(row.email, row.name || null, nowIso).lastInsertRowid;
      actor = db.prepare("SELECT * FROM actors WHERE id = ?").get(id);
    } else if (!actor.name && row.name) {
      // Ein bestehendes Konto ohne Namen übernimmt den Namen aus dem Formular; einen gesetzten Namen überschreibt der Verweis nie.
      db.prepare("UPDATE actors SET name = ? WHERE id = ?").run(row.name, actor.id);
      actor = db.prepare("SELECT * FROM actors WHERE id = ?").get(actor.id);
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  auditAppend(db, { kind: "verify.ok", actor_id: actor.id, resource: "actor:" + actor.id, text: "email confirmed" });
  // Einladungen (2026-09-09): die älteste offene Einladung an diese Adresse gilt als angenommen.
  const inv = db.prepare("SELECT id, inviter_id FROM invites WHERE email = ? AND accepted IS NULL ORDER BY id LIMIT 1").get(actor.email);
  if (inv) {
    db.prepare("UPDATE invites SET accepted = ?, accepted_id = ? WHERE id = ?").run(nowIso, actor.id, inv.id);
    auditAppend(db, { kind: "invite.accepted", actor_id: actor.id, resource: "actor:" + inv.inviter_id, text: `invitation #${inv.id} accepted` });
  }
  // Offene Beiträge dieser Adresse gelten jetzt als eingereicht.
  const pending = db.prepare("SELECT id, title, area FROM contributions WHERE actor_id = ? AND status = 'received'").all(actor.id);
  for (const c of pending) {
    db.prepare("UPDATE contributions SET status = 'confirmed', confirmed = ? WHERE id = ?").run(nowIso, c.id);
    auditAppend(db, { kind: "contribution.confirmed", actor_id: actor.id, resource: "contribution:" + c.id, text: "confirmed by email link" });
    // Das Team erfährt es im Postfach: ein bestätigter Beitrag wartet auf Prüfung.
    if (!limited("mail:global", MAIL_CAP)) mail(INBOX, `entrosana Hub: contribution #${c.id} «${c.title}» waits for review`,
      `${actor.name || "(no name yet)"} <${actor.email}> confirmed contribution #${c.id} «${c.title}» (${c.area}).\n\n` +
      `Read and decide in the console (tailnet): http://100.115.236.97:8396/contributions/${c.id}\n` +
      `Status page of the submitter: ${PUBLIC}/contribute/status?id=${c.id}\n\nentrosana`)
      .then(r => auditAppend(db, { kind: "review.mail", actor_id: null, resource: "contribution:" + c.id, text: r.ok ? "inbox notified of confirmed contribution" : "inbox mail failed: " + (r.err || r.code) }));
  }
  const t = issueToken(db, actor.id);
  // Hinweis (2026-09-10): ein bestehendes Konto erfährt jede neue Anmeldung per Mail, mit dem Weg zum Abmelden.
  if (existed && actor.email && !limited("mail:global", MAIL_CAP)) {
    const origin = String(ctx.ip || "").replace(/^(\d+\.\d+)\.\d+\.\d+$/, "$1.x.x");
    mail(actor.email, "entrosana Hub: a new device signed in to your account",
      `Hello${actor.name ? " " + actor.name : ""},\n\na device just signed in to your entrosana Hub account with a link sent to this address.\n\n` +
      `When: ${nowIso.slice(0, 16).replace("T", " ")} UTC\nFrom: ${origin || "unknown"}\n\n` +
      `If that was you, nothing to do. If not, open ${PUBLIC}/me, press «Sign out everywhere» under Devices, and request a fresh link.\n\nentrosana`)
      .then(r => auditAppend(db, { kind: "signin.mail", actor_id: actor.id, resource: "actor:" + actor.id, text: r.ok ? "sign-in notice sent" : "sign-in notice failed: " + (r.err || r.code) }));
  }
  const roles = rolesOf(db, actor.id);
  send(ctx.res, 200, { ok: true, token: t.token, expires: t.expires, confirmed: pending.length, actor: { id: actor.id, email: actor.email, name: actor.name, created: actor.created, roles: [...roles], standing: standingOf(roles) } });
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
  r.trail_ok = c.trail_ok; r.slug = c.slug || null; r.attribution = c.attribution; r.published = c.published; r.published_by = c.published_by;
  if (full) {
    Object.assign(r, { summary: c.summary, files: JSON.parse(c.files_json || "[]"), trail: c.trail_md,
                       records: JSON.parse(c.trail_json || "[]"), actor_id: c.actor_id, decided_by: c.decided_by });
    if (c.status === "admitted" || c.status === "reviewing") { const sub = db.prepare("SELECT * FROM actors WHERE id = ?").get(c.actor_id); if (sub) sub.roles = rolesOf(db, sub.id); r.checks = publishChecks(c, sub); }   // mit Rollen, sonst meldet das Tor fälschlich «not approved»
  }
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
  const { email, name, title, area, summary, trail, files, org_id, records, chain, attribution } = v.value;
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
  const id = Number(db.prepare(`INSERT INTO contributions(kind, status, actor_id, org_id, title, area, summary, files_json, trail_md, trail_json, trail_ok, created, confirmed, attribution)
    VALUES ('module', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(known ? "confirmed" : "received", actor.id, org_id, title, area, summary, JSON.stringify(files), trail, trailJson, trailOk, now, known ? now : null, attribution).lastInsertRowid);
  // Kette pseudonym (2026-10-31): kein Titel, keine Begründung in audit.text; beides steht auf der Beitragszeile.
  auditAppend(db, { kind: known ? "contribution.confirmed" : "contribution.received", actor_id: actor.id, resource: "contribution:" + id, text: `module contribution (${area})` });
  // Mit Marke eingereicht heisst sofort bestätigt: das Postfach erfährt es hier, nicht erst über den Verweis.
  if (known && !limited("mail:global", MAIL_CAP)) mail(INBOX, `entrosana Hub: contribution #${id} «${title}» waits for review`,
    `${actor.name || name || "(no name yet)"} <${email}> submitted contribution #${id} «${title}» (${area}) from a signed-in device.\n\n` +
    `Read and decide in the console (tailnet): http://100.115.236.97:8396/contributions/${id}\nStatus page of the submitter: ${PUBLIC}/contribute/status?id=${id}\n\nentrosana`)
    .then(r => auditAppend(db, { kind: "review.mail", actor_id: null, resource: "contribution:" + id, text: r.ok ? "inbox notified of confirmed contribution" : "inbox mail failed: " + (r.err || r.code) }));
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
  DELETE: (ctx, [id]) => {
    const c = getContribution(id);
    if (!c) throw new HttpError(404, "not found");
    const own = ctx.actor && ctx.actor.id === c.actor_id, owner = ctx.actor && ctx.actor.roles.has("owner");
    if (!own && !owner) throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
    if (!["received", "confirmed", "reviewing", "withdrawn", "rejected"].includes(c.status)) throw new HttpError(409, "only unpublished, undecided or closed contributions can be deleted");
    db.prepare("DELETE FROM contributions WHERE id = ?").run(c.id);
    auditAppend(db, { kind: "contribution.deleted", actor_id: ctx.actor.id, resource: "contribution:" + c.id, text: own ? "deleted by submitter" : "deleted by owner" });
    send(ctx.res, 200, { ok: true, deleted: c.id });
  },
  PATCH: async (ctx, [id]) => {
    const c = getContribution(id);
    if (!c) throw new HttpError(404, "not found");
    const body = await readJson(ctx.req);
    const submitter = db.prepare("SELECT * FROM actors WHERE id = ?").get(c.actor_id); if (submitter) submitter.roles = rolesOf(db, submitter.id);

    // Ohne Zielzustand: die einreichende Person ändert ihre Wahl zur Namensnennung.
    if (body.status === undefined && body.attribution !== undefined) {
      if (!ctx.actor || ctx.actor.id !== c.actor_id) throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
      if (tokenAgeMs(ctx) > FRESH_MS) { send(ctx.res, 409, { error: "fresh sign-in required: open a new link from your mail on this device, then change it", fresh_required: true }); return; }
      const a = body.attribution === "keep" ? "keep" : "remove";
      db.prepare("UPDATE contributions SET attribution = ? WHERE id = ?").run(a, c.id);
      auditAppend(db, { kind: "attribution", actor_id: ctx.actor.id, resource: "contribution:" + c.id, text: "attribution set to " + a });
      return send(ctx.res, 200, { ok: true, item: publicRow(getContribution(c.id), true) });
    }

    const target = String(body.status || "");
    const action = actionFor(c.status, target);
    if (!action) throw new HttpError(409, `no transition ${c.status} → ${target || "?"}`);
    if (!can(ctx.actor, action, asResource(c))) throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
    const reason = String(body.reason || "").trim().slice(0, 2000);
    if ((action === "decide" || action === "publish") && reason.length < 3) throw new HttpError(400, "reason required");
    const now = new Date().toISOString();

    if (target === "published") {
      // Das Tor: erst die Prüfungen, dann die zweite Lesung, dann der Katalog.
      const fails = publishChecks(c, submitter);
      if (fails.length) throw new HttpError(409, "publication blocked: " + fails.join("; "));
      const oneStep = c.status === "reviewing";   // 2026-09-09: Annahme und Veröffentlichung in einem Schritt
      const sameReviewer = oneStep || c.decided_by === ctx.actor.id;
      if (sameReviewer && FOUR_EYES) throw new HttpError(409, "second reading required: the same actor admitted this contribution");
      const r = appendEntry("modules", entryFor(c, submitter));
      db.prepare(`UPDATE contributions SET status = 'published', published = ?, published_by = ?, slug = ?, reason = ?,
                  decided = COALESCE(decided, ?), decided_by = COALESCE(decided_by, ?) WHERE id = ?`)
        .run(now, ctx.actor.id, r.slug, reason, now, ctx.actor.id, c.id);
      db.prepare("INSERT OR IGNORE INTO module_contributors(slug, actor_id, added, added_by) VALUES (?,?,?,?)").run(r.slug, c.actor_id, now, ctx.actor.id);
      if (oneStep) auditAppend(db, { kind: "contribution.admitted", actor_id: ctx.actor.id, resource: "contribution:" + c.id, text: "admitted and published in one step (reason on the contribution)" });
      auditAppend(db, { kind: "publish", actor_id: ctx.actor.id, resource: "contribution:" + c.id,
        text: `published as modules/${r.slug}` + (sameReviewer ? " (no second reading: same actor admitted and published)" : "") + " (reason on the contribution)" });
      notify(submitter, c, "published", reason, `${PUBLIC}/modules/${r.slug}`);
      return send(ctx.res, 200, { ok: true, second_reading: !sameReviewer, item: publicRow(getContribution(c.id), true) });
    }
    if (c.status === "published" && target === "admitted") {
      // Ein Original des Katalogs (Spur nicht «contributed») wird nie über diesen Weg entfernt.
      if (c.slug) { const cat = readCatalogue(); const entry = ((cat.modules || {}).list || []).find(x => x.slug === c.slug);
        if (entry && entry.track !== "contributed") throw new HttpError(409, "original catalogue entry: it is edited in the catalogue, not taken back here"); }
      if (c.slug) { try { removeEntry("modules", c.slug); } catch (e) { auditAppend(db, { kind: "unpublish.failed", actor_id: ctx.actor.id, resource: "contribution:" + c.id, text: String(e.message).slice(0, 200) }); } }
      if (c.slug) { db.prepare("DELETE FROM module_contributors WHERE slug = ?").run(c.slug); db.prepare("DELETE FROM points WHERE slug = ?").run(c.slug); }
      db.prepare("UPDATE contributions SET status = 'admitted', published = NULL, published_by = NULL, slug = NULL, reason = ? WHERE id = ?").run(reason, c.id);
      auditAppend(db, { kind: "unpublish", actor_id: ctx.actor.id, resource: "contribution:" + c.id, text: "taken back from the catalogue (reason on the contribution)" });
      return send(ctx.res, 200, { ok: true, item: publicRow(getContribution(c.id), true) });
    }

    const final = ["admitted", "rejected", "withdrawn"].includes(target);
    db.prepare(`UPDATE contributions SET status = ?, decided = COALESCE(?, decided), decided_by = COALESCE(?, decided_by),
                reason = COALESCE(?, reason) WHERE id = ?`).run(target, final ? now : null, final ? ctx.actor.id : null, reason || null, c.id);
    auditAppend(db, { kind: "contribution." + target, actor_id: ctx.actor.id, resource: "contribution:" + c.id,
      text: (action === "withdraw" ? "withdrawn by submitter" : target) + (reason ? " (reason on the contribution)" : "") });
    if (target === "admitted" || target === "rejected") notify(submitter, c, target, reason, null);
    send(ctx.res, 200, { ok: true, item: publicRow(getContribution(c.id), true) });
  },
}]);

// ── Module (2026-09-09): Beitragende bearbeiten ihre veröffentlichten Module, ein
// Modul kann mehrere Beitragende haben, jedes Konto kann einem Modul einen Punkt geben.
const MODULE_STATES = ["idea", "development", "finished"];
const SLUG_RE = /^[a-z0-9-]{1,80}$/;
function moduleEntry(slug) { return (((readCatalogue().modules || {}).list) || []).find(x => x.slug === slug) || null; }
function contributorsOf(slug) {
  return db.prepare("SELECT a.id, a.name FROM module_contributors m JOIN actors a ON a.id = m.actor_id WHERE m.slug = ? ORDER BY m.added").all(slug);
}
function pointsCount(slug) { return db.prepare("SELECT COUNT(*) n FROM points WHERE slug = ?").get(slug).n; }
function moduleView(slug, e) {
  return { slug, title: e.title, who: e.who || "", lede: e.lede || "", about: e.about || "", note: e.note || "", meta: e.meta || "", state: e.state || "development",
           track: e.track || "", area: e.area || "", updated: e.updated || "", by: e.by || "", facts: Array.isArray(e.facts) ? e.facts : [], gets: Array.isArray(e.gets) ? e.gets : [],
           contributors: contributorsOf(slug), points: pointsCount(slug), url: `${PUBLIC}/modules/${slug}` };
}
// Bearbeiten darf, wer als Beitragende eingetragen ist, und das Team — seit 2026-09-09 auch bei
// Originalen des Katalogs (der Eintrag muss als striktes JSON dastehen; updateEntry prüft das).
function moduleAccess(ctx, slug) {
  if (!ctx.actor) throw new HttpError(401, "no actor");
  if (!SLUG_RE.test(slug)) throw new HttpError(404, "module not found");
  const mine = db.prepare("SELECT 1 FROM module_contributors WHERE slug = ? AND actor_id = ?").get(slug, ctx.actor.id);
  if (!mine && !can(ctx.actor, "publish")) throw new HttpError(403, "not a contributor of this module");
  const e = moduleEntry(slug);
  if (!e) throw new HttpError(404, "module not found");
  if (e.track === "onrequest") throw new HttpError(409, "area description, not a module: the team edits it in the console");
  return e;
}
function refreshBy(slug) {
  const names = contributorsOf(slug).map(c => c.name).filter(Boolean);
  updateCatalogueEntry("modules", slug, { by: names.join(", ") });
}
routes.set("GET /api/me/modules", (ctx) => {
  if (!ctx.actor) throw new HttpError(401, "no actor");
  const team = can(ctx.actor, "publish");
  const slugs = team ? (((readCatalogue().modules || {}).list) || []).filter(e => e.track !== "onrequest").map(e => e.slug)
                     : db.prepare("SELECT slug FROM module_contributors WHERE actor_id = ? ORDER BY added").all(ctx.actor.id).map(r => r.slug);
  const items = slugs.map(s => { const e = moduleEntry(s); return e ? moduleView(s, e) : null; }).filter(Boolean);
  send(ctx.res, 200, { items, team });
});
patterns.push([/^\/api\/me\/modules\/([a-z0-9-]{1,80})$/, {
  GET: (ctx, [slug]) => { const e = moduleAccess(ctx, slug); send(ctx.res, 200, { item: moduleView(slug, e) }); },
  PATCH: async (ctx, [slug]) => {
    moduleAccess(ctx, slug);
    const body = await readJson(ctx.req), fields = {};
    if (body.title !== undefined) { const v = str(body.title, 120); if (v.length < 3) throw new HttpError(400, "title too short"); fields.title = v; }
    if (body.who !== undefined) fields.who = str(body.who, 160);
    if (body.lede !== undefined) fields.lede = str(body.lede, 300);
    if (body.about !== undefined) fields.about = str(body.about, 4000);
    if (body.note !== undefined) fields.note = str(body.note, 2000) || null;
    if (body.state !== undefined) { if (!MODULE_STATES.includes(body.state)) throw new HttpError(400, "state unknown"); fields.state = body.state; }
    if (body.meta !== undefined) fields.meta = str(body.meta, 160) || null;
    if (body.facts !== undefined) {   // Paare [Beschriftung, Wert], höchstens zwölf
      if (!Array.isArray(body.facts) || body.facts.length > 12) throw new HttpError(400, "facts: up to 12 pairs");
      const facts = body.facts.map(f => Array.isArray(f) ? [str(f[0], 60), str(f[1], 200)] : null).filter(f => f && f[0] && f[1]);
      fields.facts = facts.length ? facts : null;
    }
    if (body.gets !== undefined) {   // Zeilen «what you get», höchstens acht
      if (!Array.isArray(body.gets) || body.gets.length > 8) throw new HttpError(400, "gets: up to 8 lines");
      const gets = body.gets.map(g => str(g, 200)).filter(Boolean);
      fields.gets = gets.length ? gets : null;
    }
    if (!Object.keys(fields).length) throw new HttpError(400, "nothing to change");
    fields.updated = new Date().toISOString().slice(0, 10);
    lift(() => updateCatalogueEntry("modules", slug, fields));
    auditAppend(db, { kind: "module.edit", actor_id: ctx.actor.id, resource: "module:" + slug, text: "fields: " + Object.keys(fields).join(", ") });
    send(ctx.res, 200, { ok: true, item: moduleView(slug, moduleEntry(slug)) });
  },
}]);
patterns.push([/^\/api\/me\/modules\/([a-z0-9-]{1,80})\/contributors$/, {
  POST: async (ctx, [slug]) => {
    moduleAccess(ctx, slug);
    const body = await readJson(ctx.req);
    const email = String(body.email || "").trim().toLowerCase();
    const a = email ? db.prepare("SELECT id, name FROM actors WHERE email = ?").get(email) : null;
    if (!a) throw new HttpError(404, "no account with this address");
    const roles = rolesOf(db, a.id);
    if (!roles.some(r => ["contributor", "reviewer", "owner"].includes(r))) throw new HttpError(409, "this account is not approved as contributor yet");
    if (!a.name) throw new HttpError(409, "this account has no name yet");
    db.prepare("INSERT OR IGNORE INTO module_contributors(slug, actor_id, added, added_by) VALUES (?,?,?,?)").run(slug, a.id, new Date().toISOString(), ctx.actor.id);
    lift(() => refreshBy(slug));
    auditAppend(db, { kind: "module.contributor", actor_id: ctx.actor.id, resource: "module:" + slug, text: `contributor added: actor ${a.id}` });
    send(ctx.res, 200, { ok: true, item: moduleView(slug, moduleEntry(slug)) });
  },
}]);
patterns.push([/^\/api\/me\/modules\/([a-z0-9-]{1,80})\/contributors\/(\d{1,12})$/, {
  DELETE: (ctx, [slug, id]) => {
    moduleAccess(ctx, slug);
    if (db.prepare("SELECT COUNT(*) n FROM module_contributors WHERE slug = ?").get(slug).n <= 1) throw new HttpError(409, "a module keeps at least one contributor");
    db.prepare("DELETE FROM module_contributors WHERE slug = ? AND actor_id = ?").run(slug, Number(id));
    lift(() => refreshBy(slug));
    auditAppend(db, { kind: "module.contributor", actor_id: ctx.actor.id, resource: "module:" + slug, text: `contributor removed: actor ${id}` });
    send(ctx.res, 200, { ok: true, item: moduleView(slug, moduleEntry(slug)) });
  },
}]);
// Beitragende und Punkte je Modul, für die Karten der Modulseite (öffentlich, ohne Konto).
routes.set("GET /api/modules/meta", (ctx) => {
  const items = {};
  for (const r of db.prepare("SELECT m.slug, a.id, a.name FROM module_contributors m JOIN actors a ON a.id = m.actor_id ORDER BY m.slug, m.added").all()) {
    (items[r.slug] = items[r.slug] || { contributors: [], points: 0 }).contributors.push({ id: r.id, name: r.name || "" });
  }
  for (const r of db.prepare("SELECT slug, COUNT(*) n FROM points GROUP BY slug").all()) (items[r.slug] = items[r.slug] || { contributors: [], points: 0 }).points = r.n;
  send(ctx.res, 200, { items });
});
// Punkte: Zählung für alle (auch ohne Konto), Umschalten nur mit Konto.
routes.set("GET /api/points", (ctx) => {
  const counts = Object.fromEntries(db.prepare("SELECT slug, COUNT(*) n FROM points GROUP BY slug").all().map(r => [r.slug, r.n]));
  const mine = ctx.actor ? db.prepare("SELECT slug FROM points WHERE actor_id = ?").all(ctx.actor.id).map(r => r.slug) : [];
  send(ctx.res, 200, { counts, mine });
});
patterns.push([/^\/api\/modules\/([a-z0-9-]{1,80})\/point$/, {
  POST: (ctx, [slug]) => {
    if (!ctx.actor || ctx.actor.kind !== "email") throw new HttpError(401, "sign in to give a point");
    if (!moduleEntry(slug)) throw new HttpError(404, "module not found");
    if (limited("points:" + ctx.actor.id, 120)) throw new HttpError(429, "too many changes; try again later");
    const had = db.prepare("SELECT 1 FROM points WHERE slug = ? AND actor_id = ?").get(slug, ctx.actor.id);
    if (had) db.prepare("DELETE FROM points WHERE slug = ? AND actor_id = ?").run(slug, ctx.actor.id);
    else db.prepare("INSERT INTO points(slug, actor_id, created) VALUES (?,?,?)").run(slug, ctx.actor.id, new Date().toISOString());
    send(ctx.res, 200, { ok: true, mine: !had, points: pointsCount(slug) });
  },
}]);

// ── Einladungen (2026-09-09): jedes Konto lädt per Adresse ein. Die Mail trägt einen
// Anmeldelink, der sieben Tage gilt; das Konto entsteht erst, wenn der Link geöffnet wird.
routes.set("GET /api/me/invites", (ctx) => {
  if (!ctx.actor || ctx.actor.kind !== "email") throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
  const items = db.prepare("SELECT id, email, message, created, accepted FROM invites WHERE inviter_id = ? ORDER BY id DESC LIMIT 100").all(ctx.actor.id);
  send(ctx.res, 200, { items });
});
routes.set("POST /api/me/invites", async (ctx) => {
  if (!ctx.actor || ctx.actor.kind !== "email") throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
  if (!ctx.actor.name) throw new HttpError(409, "set your name first; the invitation carries it");
  const body = await readJson(ctx.req);
  const email = String(body.email || "").trim().toLowerCase();
  const message = String(body.message || "").trim().slice(0, 500);
  if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, "bad email");
  if (email === ctx.actor.email) throw new HttpError(400, "that is your own address");
  if (db.prepare("SELECT 1 FROM actors WHERE email = ?").get(email)) throw new HttpError(409, "this address already has an account");
  const recent = db.prepare("SELECT created FROM invites WHERE email = ? AND accepted IS NULL ORDER BY id DESC LIMIT 1").get(email);
  if (recent && Date.now() - Date.parse(recent.created) < 86400e3) throw new HttpError(429, "this address was invited within the last day");
  if (limited("invite:" + ctx.actor.id, 10) || limited("email:" + email)) throw new HttpError(429, "too many invitations; try again later");
  if (limited("mail:global", MAIL_CAP)) throw new HttpError(429, "mail cap reached; try again later");
  const token = newToken(), now = new Date();
  db.prepare("INSERT INTO verifications(email, token_hash, created, expires) VALUES (?,?,?,?)")
    .run(email, sha(token), now.toISOString(), new Date(now.getTime() + 7 * 86400e3).toISOString());
  const r = await mail(email, `${ctx.actor.name} invites you to the entrosana Hub`,
    `Hello,\n\n${ctx.actor.name} (${ctx.actor.email}) invites you to the entrosana Hub: modules, tools and a record trail that schools and families can check by hand.\n\n` +
    (message ? `Their words:\n${message}\n\n` : "") +
    `Open this link within seven days on the device you want to use. It registers you as a collector under this address, no password:\n\n${PUBLIC}/me?verify=${token}\n\n` +
    `If you do not want this, ignore the mail; nothing happens. The address stays only as an unanswered invitation for 180 days.\n\nentrosana`);
  if (!r.ok) { auditAppend(db, { kind: "invite.failed", actor_id: ctx.actor.id, resource: "email:" + sha(email).slice(0, 12), text: "invitation mail failed: " + (r.err || r.code) }); throw new HttpError(502, "the mail could not be sent"); }
  const id = db.prepare("INSERT INTO invites(inviter_id, email, message, created) VALUES (?,?,?,?)").run(ctx.actor.id, email, message || null, now.toISOString()).lastInsertRowid;
  auditAppend(db, { kind: "invite.sent", actor_id: ctx.actor.id, resource: "email:" + sha(email).slice(0, 12), text: "invitation mailed" });
  send(ctx.res, 200, { ok: true, item: { id, email, message, created: now.toISOString(), accepted: null } });
});

// ── Eigene Dienste (2026-09-10): je Konto eine Liste, geprüft von e14 oder selbst gemeldet.
const svcRow = (r) => {
  const hb = r.kind === "webhook" ? heartbeatState(r) : null;
  return { id: r.id, name: r.name, what: r.what || "", group: r.grp, place: r.place, kind: r.kind, interval: r.interval_min,
           target_hint: r.kind === "webhook" ? null : (r.target || "").replace(/^(https?:\/\/[^/]+).*$/, "$1").slice(0, 80),
           state: hb ? hb.state : (r.last_state || "wait"), status: hb ? hb.status : (r.last_status || "not checked yet"),
           checked: r.last_checked, ms: r.last_ms, beat: r.last_beat, created: r.created };
};
const svcOf = (ctx, id) => {
  const r = db.prepare("SELECT * FROM services WHERE id = ? AND actor_id = ?").get(Number(id), ctx.actor.id);
  if (!r) throw new HttpError(404, "service not found");
  return r;
};
async function svcCheckAndStore(r) {
  if (r.kind === "webhook") return;
  const res = await runCheck(r);
  db.prepare("UPDATE services SET last_state = ?, last_status = ?, last_checked = ?, last_ms = ? WHERE id = ?").run(res.state, String(res.status).slice(0, 160), new Date().toISOString(), res.ms | 0, r.id);
}
// Der Schnappschuss der Maschine (tools/services-snapshot.sh, alle zehn Minuten) gehört dem Eigentümer:
// seine Dienste sind seine Dienste. Seit 2026-09-10 nicht mehr als Datei ausgeliefert, sondern hier mitgegeben.
function machineSnapshot() {
  try {
    const raw = readFileSync(join(HERE, "..", "assets", "services.js"), "utf8");
    const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
    const s = JSON.parse(raw.slice(a, b + 1));
    return s && Array.isArray(s.services) ? { host: s.host, read: s.read, services: s.services } : null;
  } catch { return null; }
}
routes.set("GET /api/me/services", (ctx) => {
  if (!ctx.actor || ctx.actor.kind !== "email") throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
  const rows = db.prepare("SELECT * FROM services WHERE actor_id = ? ORDER BY grp, name").all(ctx.actor.id);
  send(ctx.res, 200, { items: rows.map(svcRow), team: isTeam(ctx.actor), machine: ctx.actor.roles.has("owner") ? machineSnapshot() : null,
    kinds: SVC_KINDS, groups: SVC_GROUPS, places: SVC_PLACES, intervals: SVC_INTERVALS, max: SVC_MAX });
});
routes.set("POST /api/me/services", async (ctx) => {
  if (!ctx.actor || ctx.actor.kind !== "email") throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
  const body = await readJson(ctx.req);
  const name = str(body.name, 80); if (name.length < 2) throw new HttpError(400, "name too short");
  const n = db.prepare("SELECT COUNT(*) n FROM services WHERE actor_id = ?").get(ctx.actor.id).n;
  if (n >= SVC_MAX) throw new HttpError(409, `at most ${SVC_MAX} services per account`);
  const p = parseCheck(body.check); if (p.error) throw new HttpError(400, p.error);
  const owner = ctx.actor.roles.has("owner");
  if (p.host) { const g = await guardTarget(p.host, owner); if (g) throw new HttpError(400, g); }
  const grp = SVC_GROUPS.includes(body.group) ? body.group : "Public";
  const place = SVC_PLACES.includes(body.place) ? body.place : "via tunnel";
  const interval = SVC_INTERVALS.includes(Number(body.interval)) ? Number(body.interval) : 60;
  const now = new Date().toISOString();
  let hook = null, hookHash = null;
  if (p.kind === "webhook") { hook = newToken(); hookHash = sha(hook); }
  const id = db.prepare(`INSERT INTO services(actor_id, name, what, grp, place, kind, target, hook_hash, interval_min, created, updated)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(ctx.actor.id, name, str(body.what, 160) || null, grp, place, p.kind, p.target, hookHash, interval, now, now).lastInsertRowid;
  auditAppend(db, { kind: "service.add", actor_id: ctx.actor.id, resource: "service:" + id, text: `${p.kind} service added` });   // Kette pseudonym (2026-10-31): kein Dienstname (Freitext) in der Kette
  const r = db.prepare("SELECT * FROM services WHERE id = ?").get(id);
  await svcCheckAndStore(r);
  const out = { ok: true, item: svcRow(db.prepare("SELECT * FROM services WHERE id = ?").get(id)) };
  if (hook) out.hook_url = `${PUBLIC}/api/hooks/${hook}`;   // nur dieses eine Mal im Klartext
  send(ctx.res, 200, out);
});
patterns.push([/^\/api\/me\/services\/(\d{1,12})$/, {
  PATCH: async (ctx, [id]) => {
    if (!ctx.actor || ctx.actor.kind !== "email") throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
    const r = svcOf(ctx, id); const body = await readJson(ctx.req);
    const name = body.name !== undefined ? str(body.name, 80) : r.name; if (name.length < 2) throw new HttpError(400, "name too short");
    const what = body.what !== undefined ? (str(body.what, 160) || null) : r.what;
    const grp = body.group !== undefined && SVC_GROUPS.includes(body.group) ? body.group : r.grp;
    const place = body.place !== undefined && SVC_PLACES.includes(body.place) ? body.place : r.place;
    const interval = body.interval !== undefined && SVC_INTERVALS.includes(Number(body.interval)) ? Number(body.interval) : r.interval_min;
    db.prepare("UPDATE services SET name = ?, what = ?, grp = ?, place = ?, interval_min = ?, updated = ? WHERE id = ?").run(name, what, grp, place, interval, new Date().toISOString(), r.id);
    send(ctx.res, 200, { ok: true, item: svcRow(db.prepare("SELECT * FROM services WHERE id = ?").get(r.id)) });
  },
  DELETE: (ctx, [id]) => {
    if (!ctx.actor || ctx.actor.kind !== "email") throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
    const r = svcOf(ctx, id);
    db.prepare("DELETE FROM services WHERE id = ?").run(r.id);
    auditAppend(db, { kind: "service.remove", actor_id: ctx.actor.id, resource: "service:" + r.id, text: "service removed" });
    send(ctx.res, 200, { ok: true });
  },
}]);
patterns.push([/^\/api\/me\/services\/(\d{1,12})\/check$/, {
  POST: async (ctx, [id]) => {
    if (!ctx.actor || ctx.actor.kind !== "email") throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
    if (limited("svc-check:" + ctx.actor.id, 60)) throw new HttpError(429, "too many checks; the timer keeps checking on its own");
    const r = svcOf(ctx, id); await svcCheckAndStore(r);
    send(ctx.res, 200, { ok: true, item: svcRow(db.prepare("SELECT * FROM services WHERE id = ?").get(r.id)) });
  },
}]);
patterns.push([/^\/api\/me\/services\/(\d{1,12})\/rotate$/, {
  POST: (ctx, [id]) => {
    if (!ctx.actor || ctx.actor.kind !== "email") throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
    const r = svcOf(ctx, id); if (r.kind !== "webhook") throw new HttpError(409, "only webhooks have an address");
    const hook = newToken(); db.prepare("UPDATE services SET hook_hash = ?, updated = ? WHERE id = ?").run(sha(hook), new Date().toISOString(), r.id);
    auditAppend(db, { kind: "service.rotate", actor_id: ctx.actor.id, resource: "service:" + r.id, text: "webhook address renewed" });
    send(ctx.res, 200, { ok: true, hook_url: `${PUBLIC}/api/hooks/${hook}` });
  },
}]);
// Lebenszeichen: öffentlich, nur die geheime Adresse zählt. GET reicht für einen Cron-Einzeiler.
patterns.push([/^\/api\/hooks\/([A-Za-z0-9_-]{20,80})$/, {
  GET: (ctx, [tok]) => hookBeat(ctx, tok, null),
  POST: async (ctx, [tok]) => { let body = {}; try { body = await readJson(ctx.req); } catch {} hookBeat(ctx, tok, body); },
}]);
function hookBeat(ctx, tok, body) {
  const r = db.prepare("SELECT * FROM services WHERE hook_hash = ? AND kind = 'webhook'").get(sha(tok));
  if (!r) throw new HttpError(404, "unknown address");
  if (limited("hook:" + r.id, 600)) throw new HttpError(429, "too many heartbeats");
  const status = body && body.status != null ? String(body.status).trim().slice(0, 120) : (ctx.query.get("status") || "").slice(0, 120);
  db.prepare("UPDATE services SET last_beat = ?, last_status = ?, last_checked = ? WHERE id = ?").run(new Date().toISOString(), status || null, new Date().toISOString(), r.id);
  send(ctx.res, 200, { ok: true, service: r.name, received: new Date().toISOString() });
}
// Prüfuhr: jede Minute, was fällig ist; höchstens drei zugleich.
async function svcTick() {
  try {
    const now = Date.now();
    const due = db.prepare("SELECT * FROM services WHERE kind != 'webhook' ORDER BY last_checked").all()
      .filter(r => !r.last_checked || now - Date.parse(r.last_checked) >= r.interval_min * 60e3).slice(0, 30);
    for (let i = 0; i < due.length; i += 3) await Promise.all(due.slice(i, i + 3).map(r => svcCheckAndStore(r).catch(() => {})));
  } catch (e) { console.error("service check failed:", e.message); }
}
setTimeout(() => { svcTick(); setInterval(svcTick, 60e3); }, 20e3);
// Ruhende Konten (2026-09-10): alle 6 Stunden nachsehen; Hinweis per Mail, Löschung wie die Selbstlöschung.
function dormantTick() {
  try {
    const r = dormantSweep(db, new Date(), (a) => limited("mail:global", MAIL_CAP) ? Promise.resolve({ ok: false }) : mail(a.email, "entrosana Hub: your account has been quiet for two years",
      `Hello${a.name ? " " + a.name : ""},\n\nyour entrosana Hub account has not signed in for 24 months. If you want to keep it, sign in once within the next three months: ${PUBLIC}/me\n\n` +
      `Without a sign-in the account is erased after that, the way a self-erasure works: address, name and profile go, published modules stay under your name only where you said so.\n\nentrosana`),
      (a) => eraseActor(a, new Set(), new Set(), "dormant account erased after 27 months without a sign-in"));
    if (r.noticed || r.erased) console.log("dormant sweep:", JSON.stringify(r));
  } catch (e) { console.error("dormant sweep failed:", e.message); }
}
setTimeout(() => { dormantTick(); setInterval(dormantTick, 6 * 3600e3); }, 90e3);

function lift(fn) { try { return fn(); } catch (e) { if (e && e.status) throw new HttpError(e.status, e.message); throw e; } }

// Profil: Name (Pflicht vor dem Beitragen), Organisation, Rolle, eine Zeile,
// Website, Sprachen. Nur was mitkommt, wird gesetzt; leer löscht das Feld.
const ROLES = ["teacher", "student", "parent", "social-worker", "developer", "researcher", "other"];
routes.set("PATCH /api/me", async (ctx) => {
  if (!ctx.actor) throw new HttpError(401, "no actor");
  if (ctx.actor.kind !== "email") throw new HttpError(403, "not for service actors");
  const body = await readJson(ctx.req);
  const sets = [], vals = [], changed = [];
  if (body.name !== undefined) { const name = str(body.name, 120); if (name.length < 2) throw new HttpError(400, "name too short"); sets.push("name = ?"); vals.push(name); changed.push("name"); }
  if (body.org !== undefined) { sets.push("org = ?"); vals.push(str(body.org, 200) || null); changed.push("org"); }
  if (body.role !== undefined) { const role = str(body.role, 40); if (role && !ROLES.includes(role)) throw new HttpError(400, "role unknown"); sets.push("role = ?"); vals.push(role || null); changed.push("role"); }
  if (body.about !== undefined) { sets.push("about = ?"); vals.push(str(body.about, 280) || null); changed.push("about"); }
  // Die Biographie: der Absatz für die öffentliche Seite, 4000 Zeichen wie bei den Modulen.
  if (body.bio !== undefined) { sets.push("bio = ?"); vals.push(str(body.bio, 4000) || null); changed.push("bio"); }
  if (body.place !== undefined) { sets.push("place = ?"); vals.push(str(body.place, 120) || null); changed.push("place"); }
  // Öffentliche Kontaktadresse: frei wählbar, darf leer sein, muss aber eine Adresse sein. Die Anmeldeadresse bleibt davon unberührt.
  if (body.contact !== undefined) { const c = str(body.contact, 254); if (c && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) throw new HttpError(400, "contact must be an e-mail address"); sets.push("contact_email = ?"); vals.push(c || null); changed.push("contact"); }
  if (body.website !== undefined) { const w = str(body.website, 200); if (w && !/^https:\/\/[^\s]+$/.test(w)) throw new HttpError(400, "website must be an https link"); sets.push("website = ?"); vals.push(w || null); changed.push("website"); }
  if (body.langs !== undefined) { const l = [...new Set((Array.isArray(body.langs) ? body.langs : []).map(x => String(x).toLowerCase()).filter(x => LANG_CODES.has(x)))].slice(0, MAX_LANGS); sets.push("langs = ?"); vals.push(l.length ? l.join(",") : null); changed.push("langs"); }
  if (!sets.length) throw new HttpError(400, "nothing to change");
  db.prepare(`UPDATE actors SET ${sets.join(", ")} WHERE id = ?`).run(...vals, ctx.actor.id);
  auditAppend(db, { kind: "profile.update", actor_id: ctx.actor.id, resource: "actor:" + ctx.actor.id, text: "profile fields set: " + changed.join(", ") });
  const a = withRoles(db, db.prepare("SELECT * FROM actors WHERE id = ?").get(ctx.actor.id));
  send(ctx.res, 200, { ok: true, name: a.name, profile: { org: a.org || "", role: a.role || "", about: a.about || "", bio: a.bio || "", place: a.place || "", contact: a.contact_email || "", website: a.website || "", langs: a.langs || [] } });
});

// Abmelden: nur die vorgelegte Marke wird gelöscht, andere Geräte bleiben angemeldet.
// ── Geräte (2026-09-10): jede Marke ist ein Gerät; Liste, einzeln abmelden, überall abmelden.
const bearerHash = (ctx) => { const a = String(ctx.req.headers["authorization"] || ""); return a.startsWith("Bearer ") ? sha(a.slice(7).trim()) : null; };
function tokenAgeMs(ctx) {
  const h = bearerHash(ctx); if (!h) return Infinity;
  const r = db.prepare("SELECT created FROM actor_tokens WHERE token_hash = ?").get(h);
  return r ? Date.now() - Date.parse(r.created) : Infinity;
}
const FRESH_MS = 15 * 60e3;
routes.set("GET /api/me/devices", (ctx) => {
  if (!ctx.actor || ctx.actor.kind !== "email") throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
  const h = bearerHash(ctx), now = new Date().toISOString();
  const items = db.prepare("SELECT id, token_hash, created, expires, last_used FROM actor_tokens WHERE actor_id = ? AND expires > ? ORDER BY created DESC").all(ctx.actor.id, now)
    .map(r => ({ id: r.id, created: r.created, expires: r.expires, last_used: r.last_used, current: r.token_hash === h }));
  send(ctx.res, 200, { items });
});
routes.set("DELETE /api/me/devices", (ctx) => {
  if (!ctx.actor || ctx.actor.kind !== "email") throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
  const h = bearerHash(ctx), all = ctx.query.get("all") === "1";
  const n = all ? db.prepare("DELETE FROM actor_tokens WHERE actor_id = ?").run(ctx.actor.id).changes
                : db.prepare("DELETE FROM actor_tokens WHERE actor_id = ? AND token_hash != ?").run(ctx.actor.id, h).changes;
  auditAppend(db, { kind: "signout.all", actor_id: ctx.actor.id, resource: "actor:" + ctx.actor.id, text: `${n} device(s) signed out${all ? " including this one" : ""}` });
  send(ctx.res, 200, { ok: true, removed: n });
});
patterns.push([/^\/api\/me\/devices\/(\d{1,12})$/, {
  DELETE: (ctx, [id]) => {
    if (!ctx.actor || ctx.actor.kind !== "email") throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
    const n = db.prepare("DELETE FROM actor_tokens WHERE id = ? AND actor_id = ?").run(Number(id), ctx.actor.id).changes;
    if (!n) throw new HttpError(404, "device not found");
    auditAppend(db, { kind: "signout.device", actor_id: ctx.actor.id, resource: "actor:" + ctx.actor.id, text: "one device signed out" });
    send(ctx.res, 200, { ok: true });
  },
}]);
routes.set("DELETE /api/me/token", (ctx) => {
  if (!ctx.actor) throw new HttpError(401, "no actor");
  const m = /^Bearer\s+(\S+)$/i.exec(ctx.req.headers.authorization || "");
  if (!m) throw new HttpError(400, "bearer token required");
  const n = db.prepare("DELETE FROM actor_tokens WHERE token_hash = ? AND actor_id = ?").run(sha(m[1]), ctx.actor.id).changes;
  auditAppend(db, { kind: "signout", actor_id: ctx.actor.id, resource: "actor:" + ctx.actor.id, text: n ? "token revoked" : "token not found" });
  send(ctx.res, 200, { ok: true, revoked: n });
});

// Bewerbung als Beitragende: eine offene je Konto; das Postfach erfährt davon.
routes.set("POST /api/me/apply", async (ctx) => {
  if (!ctx.actor) throw new HttpError(401, "no actor");
  if (!can(ctx.actor, "apply")) throw new HttpError(403, "not allowed");
  const body = await readJson(ctx.req);
  const a = lift(() => openApplication(db, ctx.actor, body.text));
  if (!limited("mail:global", MAIL_CAP)) mail(INBOX, `entrosana Hub: contributor application #${a.id} from ${ctx.actor.name}`,
    `${ctx.actor.name} <${ctx.actor.email}> applies as contributor:\n\n${a.text}\n\nDecide in the console (tailnet): http://100.115.236.97:8396/applications\n\nentrosana`)
    .then(r => auditAppend(db, { kind: "application.mail", actor_id: null, resource: "application:" + a.id, text: r.ok ? "inbox notified" : "inbox mail failed: " + (r.err || r.code) }));
  send(ctx.res, 202, { ok: true, application: { id: a.id, created: a.created } });
});

// Das Team liest und entscheidet Bewerbungen.
routes.set("GET /api/applications", (ctx) => {
  if (!can(ctx.actor, "decide-application")) throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
  send(ctx.res, 200, { ok: true, items: listApplications(db, ctx.query.get("all") === "1") });
});
patterns.push([/^\/api\/applications\/(\d{1,12})$/, {
  PATCH: async (ctx, [id]) => {
    if (!can(ctx.actor, "decide-application")) throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
    const body = await readJson(ctx.req);
    const { application, applicant } = lift(() => decideApplication(db, id, ctx.actor, String(body.outcome || ""), body.reason));
    if (applicant && applicant.email && !limited("mail:global", MAIL_CAP)) {
      const ok = application.outcome === "approved";
      mail(applicant.email, ok ? "entrosana Hub: you can contribute" : "entrosana Hub: about your contributor application",
        `Hello${applicant.name ? " " + applicant.name : ""},\n\nyour application to contribute was ${application.outcome}.\n\nReason given by the team:\n${application.reason}\n\n` +
        (ok ? `Proposals you send can be published under your name once admitted: ${PUBLIC}/contribute/submit` : `You keep everything a collector has, and you may apply again later: ${PUBLIC}/me`) + `\n\nentrosana`)
        .then(r => auditAppend(db, { kind: "application.mail", actor_id: null, resource: "application:" + application.id, text: r.ok ? "decision mail sent" : "decision mail failed: " + (r.err || r.code) }));
    }
    send(ctx.res, 200, { ok: true, application });
  },
}]);

// Anfrage: kein Konto, keine Marke. Eingang bleibt 180 Tage, die Mail geht an
// info@; die anfragende Person bekommt eine kurze Bestätigung ohne fremden Text.
routes.set("POST /api/requests", async (ctx) => {
  const body = await readJson(ctx.req);
  if (String(body.website || "").trim()) return send(ctx.res, 202, { ok: true, id: 0 });   // Honigfalle
  const name = String(body.name || "").trim().slice(0, 120), email = String(body.email || "").trim().toLowerCase();
  const org = String(body.org || "").trim().slice(0, 200), kind = REQUEST_KINDS.includes(body.kind) ? body.kind : "other";
  const moduleSlug = /^[a-z0-9-]{1,80}$/.test(String(body.module || "")) ? String(body.module) : "";
  const text = String(body.text || "").trim().slice(0, 4000);
  if (name.length < 2) throw new HttpError(400, "name missing");
  if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, "bad email");
  if (text.length < 10) throw new HttpError(400, "text too short");
  if (limited("ip:" + ctx.ip) || limited("email:" + email)) throw new HttpError(429, "too many requests");
  const now = new Date().toISOString();
  const id = db.prepare("INSERT INTO requests(name, email, org, kind, text, created) VALUES (?,?,?,?,?,?)").run(name, email, org || null, kind, text, now).lastInsertRowid;
  auditAppend(db, { kind: "request.received", actor_id: ctx.actor ? ctx.actor.id : null, resource: "request:" + id, text: `${kind} request received` });
  if (!limited("mail:global", MAIL_CAP)) {
    mail((kind === "report" || kind === "contribute") ? INBOX : INFO, `entrosana: ${kind === "report" ? "module report" : kind === "contribute" ? "offer to contribute" : kind + " request"} #${id} from ${name}`, `${name} <${email}>${org ? " · " + org : ""} ${kind === "report" ? "reports" : kind === "contribute" ? "offers to contribute" : "asks (" + kind + ")"}:\n\n${moduleSlug ? "Module: " + PUBLIC + "/modules/" + moduleSlug + "\n\n" : ""}${text}\n\nReply to ${email}.\n\nentrosana`)
      .then(r => { if (r.ok) db.prepare("UPDATE requests SET mailed = ? WHERE id = ?").run(new Date().toISOString(), id);
        auditAppend(db, { kind: "request.mail", actor_id: null, resource: "request:" + id, text: r.ok ? "info inbox notified" : "info mail failed: " + (r.err || r.code) }); });
    mail(email, "entrosana: we received your request", `Hello,\n\nyour request #${id} reached entrosana. info@entrosana.com answers within a few days; you can also call ${PHONE}.\n\nIf you sent nothing to entrosana.app, ignore this mail.\n\nentrosana`);
  }
  send(ctx.res, 202, { ok: true, id });
});

// Verwaltung (Team): Konten mit Profil und Stand, Anfragen mit Erledigt-Marke.
const isTeam = a => !!(a && (a.roles.has("reviewer") || a.roles.has("owner")));
routes.set("GET /api/actors", (ctx) => {
  if (!isTeam(ctx.actor)) throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
  const rows = db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM contributions c WHERE c.actor_id = a.id) contributions,
      (SELECT COUNT(*) FROM applications p WHERE p.actor_id = a.id AND p.decided IS NULL) open_applications,
      (SELECT COUNT(*) FROM actor_tokens t WHERE t.actor_id = a.id AND t.expires > ?) devices,
      (SELECT COUNT(*) FROM invites i WHERE i.inviter_id = a.id) invites_sent,
      (SELECT COUNT(*) FROM invites i WHERE i.inviter_id = a.id AND i.accepted IS NOT NULL) invites_accepted,
      (SELECT COUNT(*) FROM services s WHERE s.actor_id = a.id) services,
      (SELECT COUNT(*) FROM files f WHERE f.actor_id = a.id) files,
      (SELECT COALESCE(SUM(f.size), 0) FROM files f WHERE f.actor_id = a.id) files_bytes FROM actors a ORDER BY a.id`).all(new Date().toISOString());
  send(ctx.res, 200, { ok: true, items: rows.map(r => { const roles = rolesOf(db, r.id); return { id: r.id, kind: r.kind, email: r.email, name: r.name, created: r.created, roles: [...roles], standing: r.kind === "email" ? standingOf(roles) : r.kind,
    profile: { org: r.org || "", role: r.role || "", about: r.about || "", bio: r.bio || "", place: r.place || "", contact: r.contact_email || "", website: r.website || "", langs: r.langs ? String(r.langs).split(",").filter(Boolean) : [] },
    contributions: r.contributions, open_applications: r.open_applications, devices: r.devices, invites_sent: r.invites_sent, invites_accepted: r.invites_accepted,
    services: r.services, files: r.files, files_bytes: r.files_bytes, dormant_notice: r.dormant_notice || null }; }), quota: QUOTA, max_file: MAX_FILE });
});
// Alle Dienste aller Konten fürs Team (2026-09-10), dazu der Schnappschuss der Maschine: die Konsole :8396 zeigt beides.
routes.set("GET /api/services", (ctx) => {
  if (!isTeam(ctx.actor)) throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
  const rows = db.prepare("SELECT s.*, a.email actor_email, a.name actor_name FROM services s JOIN actors a ON a.id = s.actor_id ORDER BY a.id, s.grp, s.name").all();
  send(ctx.res, 200, { ok: true, items: rows.map(r => Object.assign(svcRow(r), { actor_id: r.actor_id, actor_email: r.actor_email, actor_name: r.actor_name, target: r.target })), machine: machineSnapshot() });
});
// Einladungen fürs Team (2026-09-09): wer wen eingeladen hat, und ob die Adresse ein Konto wurde.
routes.set("GET /api/invites", (ctx) => {
  if (!isTeam(ctx.actor)) throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
  const items = db.prepare(`SELECT i.id, i.email, i.message, i.created, i.accepted, i.accepted_id, i.inviter_id, a.name inviter_name, a.email inviter_email
      FROM invites i LEFT JOIN actors a ON a.id = i.inviter_id ORDER BY i.id DESC LIMIT 500`).all();
  send(ctx.res, 200, { ok: true, items });
});
routes.set("GET /api/requests", (ctx) => {
  if (!isTeam(ctx.actor)) throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
  const all = ctx.query.get("all") === "1";
  send(ctx.res, 200, { ok: true, items: db.prepare(`SELECT * FROM requests ${all ? "" : "WHERE handled IS NULL"} ORDER BY id DESC`).all() });
});
patterns.push([/^\/api\/requests\/(\d{1,12})$/, {
  PATCH: async (ctx, [id]) => {
    if (!isTeam(ctx.actor)) throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
    const body = await readJson(ctx.req);
    const r = db.prepare("SELECT * FROM requests WHERE id = ?").get(Number(id));
    if (!r) throw new HttpError(404, "not found");
    const handled = body.handled ? new Date().toISOString() : null;
    db.prepare("UPDATE requests SET handled = ? WHERE id = ?").run(handled, r.id);
    auditAppend(db, { kind: handled ? "request.handled" : "request.reopened", actor_id: ctx.actor.id, resource: "request:" + r.id, text: handled ? "marked handled" : "reopened" });
    send(ctx.res, 200, { ok: true, item: db.prepare("SELECT * FROM requests WHERE id = ?").get(r.id) });
  },
}]);

// Journal: eigene Einträge, öffentlich auf Wunsch. Öffentliches Profil und Suche ohne Marke.
routes.set("GET /api/me/journal", (ctx) => { if (!ctx.actor) throw new HttpError(401, "no actor"); send(ctx.res, 200, { ok: true, items: listJournal(db, ctx.actor.id) }); });
routes.set("POST /api/me/journal", async (ctx) => {
  if (!ctx.actor || ctx.actor.kind !== "email") throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
  const body = await readJson(ctx.req);
  if (limited("journal:" + ctx.actor.id, 60)) throw new HttpError(429, "too many entries this hour");
  send(ctx.res, 201, { ok: true, item: lift(() => addEntry(db, ctx.actor, body.text, body.public !== false && body.public !== 0)) });
});
patterns.push([/^\/api\/me\/journal\/(\d{1,12})$/, {
  PATCH: async (ctx, [id]) => { if (!ctx.actor) throw new HttpError(401, "no actor"); const body = await readJson(ctx.req); send(ctx.res, 200, { ok: true, item: lift(() => updateEntry(db, ctx.actor, id, body)) }); },
  DELETE: (ctx, [id]) => { if (!ctx.actor) throw new HttpError(401, "no actor"); lift(() => deleteEntry(db, ctx.actor, id)); send(ctx.res, 200, { ok: true, deleted: Number(id) }); },
}]);
patterns.push([/^\/api\/profiles\/(\d{1,12})$/, {
  GET: (ctx, [id]) => { const p = publicProfile(db, id); if (!p) throw new HttpError(404, "no public profile"); send(ctx.res, 200, { ok: true, profile: p }); },
}]);
// Dateien je Konto (2026-09-10): Liste, Hochladen als roher Strom, Umschalten,
// Löschen, Ausliefern. 400 MB je Konto, 50 MB je Datei, Zulassung per Endung;
// alles in files.mjs gezählt, hier nur Anbindung.
patterns.push([/^\/api\/me\/files$/, {
  GET: (ctx) => { if (!ctx.actor) throw new HttpError(401, "no actor");
    send(ctx.res, 200, { ok: true, items: listFiles(db, ctx.actor.id), used: usedBytes(db, ctx.actor.id), quota: QUOTA, max_file: MAX_FILE, where: "on the Hub's own server in Switzerland" }); },
  PUT: async (ctx) => {
    if (!ctx.actor) throw new HttpError(401, "no actor");
    if (limited("files:" + ctx.actor.id, 60)) throw new HttpError(429, "too many uploads this hour");
    const name = safeName(decodeURIComponent(String(ctx.req.headers["x-file-name"] || "")));
    const size = Number(ctx.req.headers["content-length"] || 0);
    const count = db.prepare("SELECT COUNT(*) AS n FROM files WHERE actor_id = ?").get(ctx.actor.id).n;
    const chk = checkUpload({ name, size, used: usedBytes(db, ctx.actor.id), count });
    if (!chk.ok) { ctx.req.resume(); throw new HttpError(chk.status, chk.error); }
    const now = new Date().toISOString();
    // Titel beim Hochladen (2026-09-11): X-File-Label, URL-kodiert, höchstens 60 Zeichen, ohne Steuerzeichen.
    let label = ""; try { label = decodeURIComponent(String(ctx.req.headers["x-file-label"] || "")); } catch { label = ""; }
    label = label.replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
    const id = db.prepare("INSERT INTO files(actor_id, name, ext, type, size, sha256, public, created, label) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(ctx.actor.id, chk.name, chk.ext, chk.type, size, "", String(ctx.req.headers["x-public"] || "") === "1" ? 1 : 0, now, label).lastInsertRowid;
    const row = { id, actor_id: ctx.actor.id, ext: chk.ext };
    try {
      const got = await receive(ctx.req, pathFor(FILES_ROOT, row), MAX_FILE);
      if (got.size !== size) { removeFile(db, FILES_ROOT, row); throw new HttpError(400, "content-length did not match the bytes received"); }
      db.prepare("UPDATE files SET size = ?, sha256 = ? WHERE id = ?").run(got.size, got.sha256, id);
    } catch (e) { db.prepare("DELETE FROM files WHERE id = ?").run(id); throw e.status ? new HttpError(e.status, e.message) : e; }
    const item = listFiles(db, ctx.actor.id).find(f => f.id === Number(id));
    send(ctx.res, 201, { ok: true, item, used: usedBytes(db, ctx.actor.id), quota: QUOTA });
  },
}]);
patterns.push([/^\/api\/me\/files\/(\d{1,12})$/, {
  PATCH: async (ctx, [id]) => {
    if (!ctx.actor) throw new HttpError(401, "no actor");
    const row = fileRow(db, ctx.actor.id, id); if (!row) throw new HttpError(404, "no such file");
    const body = await readJson(ctx.req); const sets = [], vals = [];
    if (body.public !== undefined) { sets.push("public = ?"); vals.push(body.public ? 1 : 0); }
    // Beschriftung (2026-09-10): kurzer Titel für die öffentliche Seite, höchstens 60 Zeichen, ohne Steuerzeichen.
    if (body.label !== undefined) { sets.push("label = ?"); vals.push(String(body.label || "").replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60)); }
    if (body.name !== undefined) { const n = safeName(body.name); if (!n || !n.toLowerCase().endsWith("." + row.ext)) throw new HttpError(400, "the name must keep its ending ." + row.ext); sets.push("name = ?"); vals.push(n); }
    if (sets.length) db.prepare("UPDATE files SET " + sets.join(", ") + " WHERE id = ?").run(...vals, row.id);
    send(ctx.res, 200, { ok: true, item: listFiles(db, ctx.actor.id).find(f => f.id === row.id) });
  },
  DELETE: (ctx, [id]) => {
    if (!ctx.actor) throw new HttpError(401, "no actor");
    const row = fileRow(db, ctx.actor.id, id); if (!row) throw new HttpError(404, "no such file");
    removeFile(db, FILES_ROOT, row); send(ctx.res, 200, { ok: true, deleted: row.id, used: usedBytes(db, ctx.actor.id), quota: QUOTA });
  },
}]);
// Ausliefern: öffentliche Dateien für alle, private nur für das Konto und das Team.
// Immer als Anhang, immer nosniff, Typ aus der Zulassungsliste und nie aus dem Upload.
patterns.push([/^\/api\/files\/(\d{1,12})\/(\d{1,12})\/([^/]{1,200})$/, {
  GET: (ctx, [actorId, id]) => {
    const row = fileRow(db, Number(actorId), id);
    const mine = ctx.actor && (ctx.actor.id === Number(actorId) || isTeam(ctx.actor));
    if (!row || (!row.public && !mine)) throw new HttpError(404, "no such file");
    const path = pathFor(FILES_ROOT, row);
    const fname = row.name.replace(/["\r\n]/g, "");
    ctx.res.writeHead(200, { "Content-Type": row.type, "Content-Length": row.size, "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "attachment; filename=\"" + fname.replace(/[^\x20-\x7e]/g, "_") + "\"; filename*=UTF-8''" + encodeURIComponent(fname),
      "Cache-Control": row.public ? "public, max-age=300" : "private, no-store", "Referrer-Policy": "no-referrer" });
    if (ctx.req.method === "HEAD") return ctx.res.end();
    createReadStream(path).on("error", () => { try { ctx.res.destroy(); } catch {} }).pipe(ctx.res);
  },
}]);
// /contributors/<name>: dieselbe Antwort, aufgelöst über den aus dem Namen gerechneten Slug.
patterns.push([/^\/api\/profiles\/slug\/([a-z0-9_-]{1,80})$/, {
  GET: (ctx, [slug]) => { const p = publicProfileBySlug(db, slug); if (!p) throw new HttpError(404, "no public profile"); send(ctx.res, 200, { ok: true, profile: p }); },
}]);
routes.set("GET /api/search", (ctx) => {
  if (limited("search:" + ctx.ip, 1200)) throw new HttpError(429, "too many searches from here; try again later");   // 1200 je Stunde je IP: eine Klasse hinter einem NAT sucht viel
  send(ctx.res, 200, { ok: true, ...searchPublic(db, ctx.query.get("q") || "") });
});

// Profilbild: JSON mit base64, höchstens 300 KB entpackt, nur JPEG, PNG oder WebP (Magic Bytes).
const IMAGE_MAGIC = [["image/jpeg", [0xFF, 0xD8, 0xFF]], ["image/png", [0x89, 0x50, 0x4E, 0x47]], ["image/webp", [0x52, 0x49, 0x46, 0x46]]];
routes.set("POST /api/me/avatar", async (ctx) => {
  if (!ctx.actor || ctx.actor.kind !== "email") throw new HttpError(ctx.actor ? 403 : 401, "not allowed");
  const body = await readJson(ctx.req);
  const b64 = String(body.data || "").replace(/^data:[^,]*,/, "");
  let buf; try { buf = Buffer.from(b64, "base64"); } catch { throw new HttpError(400, "bad image data"); }
  if (!buf.length || buf.length > 180 * 1024) throw new HttpError(400, "image must be 1 byte to 180 KB");   // base64 muss unter BODY_CAP (256 KB) bleiben
  const kind = IMAGE_MAGIC.find(([, m]) => m.every((v, i) => buf[i] === v));
  if (!kind) throw new HttpError(400, "image must be JPEG, PNG or WebP");
  const now = new Date().toISOString();
  db.prepare("UPDATE actors SET avatar = ?, avatar_type = ?, avatar_updated = ? WHERE id = ?").run(buf, kind[0], now, ctx.actor.id);
  auditAppend(db, { kind: "profile.avatar", actor_id: ctx.actor.id, resource: "actor:" + ctx.actor.id, text: `picture set (${kind[0]}, ${buf.length} B)` });
  send(ctx.res, 200, { ok: true, avatar: now });
});
routes.set("DELETE /api/me/avatar", (ctx) => {
  if (!ctx.actor) throw new HttpError(401, "no actor");
  db.prepare("UPDATE actors SET avatar = NULL, avatar_type = NULL, avatar_updated = NULL WHERE id = ?").run(ctx.actor.id);
  auditAppend(db, { kind: "profile.avatar", actor_id: ctx.actor.id, resource: "actor:" + ctx.actor.id, text: "picture removed" });
  send(ctx.res, 200, { ok: true, avatar: null });
});
patterns.push([/^\/api\/avatars\/(\d{1,12})$/, {
  GET: (ctx, [id]) => {
    const r = db.prepare("SELECT avatar, avatar_type, avatar_updated FROM actors WHERE id = ? AND email IS NOT NULL").get(Number(id));
    if (!r || !r.avatar) throw new HttpError(404, "no picture");
    const etag = `"${Buffer.from(r.avatar_updated || "").toString("base64url")}"`;
    if (ctx.req.headers["if-none-match"] === etag) { ctx.res.writeHead(304, { ETag: etag }); return ctx.res.end(); }
    ctx.res.writeHead(200, { "Content-Type": r.avatar_type, "Content-Length": r.avatar.length, "Cache-Control": "public, max-age=300", ETag: etag, "X-Content-Type-Options": "nosniff" });
    ctx.res.end(Buffer.from(r.avatar));
  },
}]);

// Alles über mich, als Datei. Nur mit Marke, nur Eigenes.
routes.set("GET /api/me/export", (ctx) => {
  if (!ctx.actor) throw new HttpError(401, "no actor");
  auditAppend(db, { kind: "export", actor_id: ctx.actor.id, resource: "actor:" + ctx.actor.id, text: "self-service export" });
  send(ctx.res, 200, exportActor(db, ctx.actor), { "Content-Disposition": `attachment; filename="entrosana-hub-export-${ctx.actor.id}.json"` });
});

// Löschen der eigenen Daten. Veröffentlichte Module bleiben nur, wenn die Person
// es so gewählt hat (attribution keep, oder im Aufruf ausdrücklich keep: [ids]);
// sonst gehen sie aus dem Katalog. Alles andere wird entfernt, die Kettenzeilen
// bleiben ohne Personendaten stehen.
// Löschung eines Kontos (2026-09-10 als Funktion): Selbstlöschung und ruhende Konten gehen denselben Weg.
function eraseActor(actor, keepIds = new Set(), removeIds = new Set(), why = "personal data erased") {
  const mine = db.prepare("SELECT * FROM contributions WHERE actor_id = ?").all(actor.id);
  let kept = 0, unpublished = 0, deleted = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const c of mine) {
      const keep = c.status === "published" && (keepIds.has(c.id) || (c.attribution === "keep" && !removeIds.has(c.id)));
      if (keep) { kept++; continue; }
      if (c.status === "published" && c.slug) { try { removeEntry("modules", c.slug); unpublished++; } catch {} }
      db.prepare("DELETE FROM contributions WHERE id = ?").run(c.id); deleted++;
    }
    db.prepare("DELETE FROM actor_tokens WHERE actor_id = ?").run(actor.id);
    db.prepare("DELETE FROM verifications WHERE email = ?").run(actor.email);
    db.prepare("DELETE FROM roles WHERE actor_id = ?").run(actor.id);
    db.prepare("DELETE FROM applications WHERE actor_id = ?").run(actor.id);          // Bewerbungstexte gehen mit
    db.prepare("DELETE FROM journal WHERE actor_id = ?").run(actor.id);                // Journal geht mit
    if (actor.email) db.prepare("DELETE FROM requests WHERE email = ?").run(actor.email);   // Anfragen unter derselben Adresse
    db.prepare("DELETE FROM invites WHERE inviter_id = ?").run(actor.id);              // eigene Einladungen gehen mit
    db.prepare("DELETE FROM services WHERE actor_id = ?").run(actor.id);              // eigene Dienste gehen mit
    if (actor.email) db.prepare("UPDATE invites SET email = '(erased)' WHERE email = ?").run(actor.email);   // erhaltene: Adresse weg
    // Name bleibt nur, wenn ein Modul unter ihm stehen bleibt; die Adresse geht immer.
    removeAll(db, FILES_ROOT, actor.id);   // Dateien des Kontos, Zeilen und Ordner (2026-09-10)
    db.prepare("UPDATE actors SET email = NULL, name = ?, org_id = NULL, org = NULL, role = NULL, about = NULL, bio = NULL, place = NULL, contact_email = NULL, website = NULL, langs = NULL, avatar = NULL, avatar_type = NULL, avatar_updated = NULL WHERE id = ?").run(kept ? actor.name : "(erased)", actor.id);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  auditAppend(db, { kind: "erase", actor_id: actor.id, resource: "actor:" + actor.id, text: `${why}; ${kept} module(s) kept under the name, ${unpublished} unpublished, ${deleted} contribution(s) deleted` });
  return { kept, unpublished, deleted };
}
routes.set("DELETE /api/me", async (ctx) => {
  if (!ctx.actor) throw new HttpError(401, "no actor");
  if (ctx.actor.kind !== "email") throw new HttpError(409, "only e-mail actors can erase themselves");
  if (tokenAgeMs(ctx) > FRESH_MS) { send(ctx.res, 409, { error: "fresh sign-in required: open a new link from your mail on this device, then erase", fresh_required: true }); return; }
  if (ctx.actor.roles.has("owner")) throw new HttpError(409, "the owner account cannot erase itself; hand ownership over first");   // 2026-09-10: alle anderen Konten, auch Prüfende, löschen sich selbst
  const body = await readJson(ctx.req).catch(() => ({}));
  const keepIds = new Set(Array.isArray(body.keep) ? body.keep.map(Number) : []);
  const removeIds = new Set(Array.isArray(body.remove) ? body.remove.map(Number) : []);
  const r = eraseActor(ctx.actor, keepIds, removeIds);
  send(ctx.res, 200, { ok: true, kept: r.kept, unpublished: r.unpublished, deleted: r.deleted });
});

const METHODS = new Set(["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"]);

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
    if (!METHODS.has(req.method)) return send(res, 405, { error: "method not allowed" }, { Allow: "GET, HEAD, POST, PATCH, PUT, DELETE" });
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
