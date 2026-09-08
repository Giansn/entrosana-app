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
import { can, rolesOf } from "./policy.mjs";
import { validate as validateContribution, actionFor, verifyTrail, publishChecks } from "./contributions.mjs";
import { appendEntry, removeEntry, entryFor, readCatalogue } from "./publish.mjs";
import { exportActor } from "./maintenance.mjs";
import { standingOf, currentApplication, openApplication, listApplications, decideApplication } from "./applications.mjs";
import { LANG_CODES, MAX_LANGS } from "./languages.mjs";
import { listJournal, addEntry, updateEntry, deleteEntry, publicProfile, searchPublic } from "./journal.mjs";
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
const REQUEST_KINDS = ["module", "track", "tool", "service", "other"];
const MAIL = process.env.MAIL_SEND || join(HERE, "..", "tools", "mail-send.py");
const BODY_CAP = 256 * 1024;  // Kette eines Geräts als Hashes passt hinein
const RATE = { limit: 5, windowMs: 3600e3 };   // docs/contributions.md, Entscheid 5
const MAIL_CAP = 60;                            // Briefe je Stunde insgesamt, gegen Verstärkung
const FOUR_EYES = process.env.FOUR_EYES === "strict";   // strict: veröffentlichen darf nicht, wer angenommen hat

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
function limited(key, limit = RATE.limit) {
  const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < RATE.windowMs);
  if (arr.length >= limit) { hits.set(key, arr); return true; }
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
  send(ctx.res, 200, { id: a.id, kind: a.kind, email: a.email, name: a.name, created: a.created, roles: [...a.roles], standing: standingOf(a.roles),
    profile: { org: a.org || "", role: a.role || "", about: a.about || "", website: a.website || "", langs: a.langs || [] },
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
  db.prepare("INSERT INTO verifications(email, token_hash, created, expires) VALUES (?,?,?,?)")
    .run(email, sha(token), now.toISOString(), new Date(now.getTime() + 3600e3).toISOString());
  const login = purpose === "login";
  const link = `${PUBLIC}${login ? "/me" : "/contribute/status"}?verify=${token}`;
  const what = purpose === "contribution" ? "entered a contribution to the entrosana Hub under this address"
             : login ? "asked to sign in to the entrosana Hub with this address" : "entered this address on entrosana.app";
  const r = await mail(email, purpose === "contribution" ? "entrosana Hub: confirm your contribution" : login ? "entrosana Hub: your sign-in link" : "entrosana Hub: confirm your address",
    `Hello${name ? " " + name : ""},\n\nsomeone (probably you) ${what}.\n` +
    `Open this link within one hour${login ? " on the device you want to use" : ""} to ${login ? "sign in" : "confirm it"}:\n\n${link}\n\nIf that was not you, ignore this mail; nothing happens.\n\nentrosana`);
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
  const roles = rolesOf(db, actor.id);
  const a = withRoles(db, actor);
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
    if (c.status === "admitted") { const sub = db.prepare("SELECT * FROM actors WHERE id = ?").get(c.actor_id); if (sub) sub.roles = rolesOf(db, sub.id); r.checks = publishChecks(c, sub); }   // mit Rollen, sonst meldet das Tor fälschlich «not approved»
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
  auditAppend(db, { kind: known ? "contribution.confirmed" : "contribution.received", actor_id: actor.id, resource: "contribution:" + id, text: `${area}: ${title}` });
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
      const sameReviewer = c.decided_by === ctx.actor.id;
      if (sameReviewer && FOUR_EYES) throw new HttpError(409, "second reading required: the same actor admitted this contribution");
      const r = appendEntry("modules", entryFor(c, submitter));
      db.prepare("UPDATE contributions SET status = 'published', published = ?, published_by = ?, slug = ?, reason = ? WHERE id = ?")
        .run(now, ctx.actor.id, r.slug, reason, c.id);
      auditAppend(db, { kind: "publish", actor_id: ctx.actor.id, resource: "contribution:" + c.id,
        text: `published as modules/${r.slug}` + (sameReviewer ? " (no second reading: same actor admitted and published)" : "") + " — " + reason });
      notify(submitter, c, "published", reason, `${PUBLIC}/modules/${r.slug}`);
      return send(ctx.res, 200, { ok: true, second_reading: !sameReviewer, item: publicRow(getContribution(c.id), true) });
    }
    if (c.status === "published" && target === "admitted") {
      // Ein Original des Katalogs (Spur nicht «contributed») wird nie über diesen Weg entfernt.
      if (c.slug) { const cat = readCatalogue(); const entry = ((cat.modules || {}).list || []).find(x => x.slug === c.slug);
        if (entry && entry.track !== "contributed") throw new HttpError(409, "original catalogue entry: it is edited in the catalogue, not taken back here"); }
      if (c.slug) { try { removeEntry("modules", c.slug); } catch (e) { auditAppend(db, { kind: "unpublish.failed", actor_id: ctx.actor.id, resource: "contribution:" + c.id, text: String(e.message).slice(0, 200) }); } }
      db.prepare("UPDATE contributions SET status = 'admitted', published = NULL, published_by = NULL, slug = NULL, reason = ? WHERE id = ?").run(reason, c.id);
      auditAppend(db, { kind: "unpublish", actor_id: ctx.actor.id, resource: "contribution:" + c.id, text: `taken back from the catalogue — ${reason}` });
      return send(ctx.res, 200, { ok: true, item: publicRow(getContribution(c.id), true) });
    }

    const final = ["admitted", "rejected", "withdrawn"].includes(target);
    db.prepare(`UPDATE contributions SET status = ?, decided = COALESCE(?, decided), decided_by = COALESCE(?, decided_by),
                reason = COALESCE(?, reason) WHERE id = ?`).run(target, final ? now : null, final ? ctx.actor.id : null, reason || null, c.id);
    auditAppend(db, { kind: "contribution." + target, actor_id: ctx.actor.id, resource: "contribution:" + c.id,
      text: reason || (action === "withdraw" ? "withdrawn by submitter" : target) });
    if (target === "admitted" || target === "rejected") notify(submitter, c, target, reason, null);
    send(ctx.res, 200, { ok: true, item: publicRow(getContribution(c.id), true) });
  },
}]);

function lift(fn) { try { return fn(); } catch (e) { if (e && e.status) throw new HttpError(e.status, e.message); throw e; } }

// Profil: Name (Pflicht vor dem Beitragen), Organisation, Rolle, eine Zeile,
// Website, Sprachen. Nur was mitkommt, wird gesetzt; leer löscht das Feld.
const ROLES = ["teacher", "student", "parent", "social-worker", "developer", "researcher", "other"];
routes.set("PATCH /api/me", async (ctx) => {
  if (!ctx.actor) throw new HttpError(401, "no actor");
  if (ctx.actor.kind !== "email") throw new HttpError(403, "not for service actors");
  const body = await readJson(ctx.req);
  const sets = [], vals = [], changed = [];
  const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
  if (body.name !== undefined) { const name = str(body.name, 120); if (name.length < 2) throw new HttpError(400, "name too short"); sets.push("name = ?"); vals.push(name); changed.push("name"); }
  if (body.org !== undefined) { sets.push("org = ?"); vals.push(str(body.org, 200) || null); changed.push("org"); }
  if (body.role !== undefined) { const role = str(body.role, 40); if (role && !ROLES.includes(role)) throw new HttpError(400, "role unknown"); sets.push("role = ?"); vals.push(role || null); changed.push("role"); }
  if (body.about !== undefined) { sets.push("about = ?"); vals.push(str(body.about, 280) || null); changed.push("about"); }
  if (body.website !== undefined) { const w = str(body.website, 200); if (w && !/^https:\/\/[^\s]+$/.test(w)) throw new HttpError(400, "website must be an https link"); sets.push("website = ?"); vals.push(w || null); changed.push("website"); }
  if (body.langs !== undefined) { const l = [...new Set((Array.isArray(body.langs) ? body.langs : []).map(x => String(x).toLowerCase()).filter(x => LANG_CODES.has(x)))].slice(0, MAX_LANGS); sets.push("langs = ?"); vals.push(l.length ? l.join(",") : null); changed.push("langs"); }
  if (!sets.length) throw new HttpError(400, "nothing to change");
  db.prepare(`UPDATE actors SET ${sets.join(", ")} WHERE id = ?`).run(...vals, ctx.actor.id);
  auditAppend(db, { kind: "profile.update", actor_id: ctx.actor.id, resource: "actor:" + ctx.actor.id, text: "profile fields set: " + changed.join(", ") });
  const a = withRoles(db, db.prepare("SELECT * FROM actors WHERE id = ?").get(ctx.actor.id));
  send(ctx.res, 200, { ok: true, name: a.name, profile: { org: a.org || "", role: a.role || "", about: a.about || "", website: a.website || "", langs: a.langs || [] } });
});

// Abmelden: nur die vorgelegte Marke wird gelöscht, andere Geräte bleiben angemeldet.
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
  const text = String(body.text || "").trim().slice(0, 4000);
  if (name.length < 2) throw new HttpError(400, "name missing");
  if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, "bad email");
  if (text.length < 10) throw new HttpError(400, "text too short");
  if (limited("ip:" + ctx.ip) || limited("email:" + email)) throw new HttpError(429, "too many requests");
  const now = new Date().toISOString();
  const id = db.prepare("INSERT INTO requests(name, email, org, kind, text, created) VALUES (?,?,?,?,?,?)").run(name, email, org || null, kind, text, now).lastInsertRowid;
  auditAppend(db, { kind: "request.received", actor_id: ctx.actor ? ctx.actor.id : null, resource: "request:" + id, text: `${kind} request received` });
  if (!limited("mail:global", MAIL_CAP)) {
    mail(INFO, `entrosana: ${kind} request #${id} from ${name}`, `${name} <${email}>${org ? " · " + org : ""} asks (${kind}):\n\n${text}\n\nReply to ${email}.\n\nentrosana`)
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
      (SELECT COUNT(*) FROM actor_tokens t WHERE t.actor_id = a.id AND t.expires > ?) devices FROM actors a ORDER BY a.id`).all(new Date().toISOString());
  send(ctx.res, 200, { ok: true, items: rows.map(r => { const roles = rolesOf(db, r.id); return { id: r.id, kind: r.kind, email: r.email, name: r.name, created: r.created, roles: [...roles], standing: r.kind === "email" ? standingOf(roles) : r.kind,
    profile: { org: r.org || "", role: r.role || "", about: r.about || "", website: r.website || "", langs: r.langs ? String(r.langs).split(",").filter(Boolean) : [] },
    contributions: r.contributions, open_applications: r.open_applications, devices: r.devices }; }) });
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
routes.set("DELETE /api/me", async (ctx) => {
  if (!ctx.actor) throw new HttpError(401, "no actor");
  if (ctx.actor.kind !== "email") throw new HttpError(409, "only e-mail actors can erase themselves");
  if (ctx.actor.roles.has("owner") || ctx.actor.roles.has("reviewer")) throw new HttpError(409, "revoke the roles first");
  const body = await readJson(ctx.req).catch(() => ({}));
  const keepIds = new Set(Array.isArray(body.keep) ? body.keep.map(Number) : []);
  const removeIds = new Set(Array.isArray(body.remove) ? body.remove.map(Number) : []);
  const mine = db.prepare("SELECT * FROM contributions WHERE actor_id = ?").all(ctx.actor.id);
  let kept = 0, unpublished = 0, deleted = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const c of mine) {
      const keep = c.status === "published" && (keepIds.has(c.id) || (c.attribution === "keep" && !removeIds.has(c.id)));
      if (keep) { kept++; continue; }
      if (c.status === "published" && c.slug) { try { removeEntry("modules", c.slug); unpublished++; } catch {} }
      db.prepare("DELETE FROM contributions WHERE id = ?").run(c.id); deleted++;
    }
    db.prepare("DELETE FROM actor_tokens WHERE actor_id = ?").run(ctx.actor.id);
    db.prepare("DELETE FROM verifications WHERE email = ?").run(ctx.actor.email);
    db.prepare("DELETE FROM roles WHERE actor_id = ?").run(ctx.actor.id);
    db.prepare("DELETE FROM applications WHERE actor_id = ?").run(ctx.actor.id);          // Bewerbungstexte gehen mit
    db.prepare("DELETE FROM journal WHERE actor_id = ?").run(ctx.actor.id);                // Journal geht mit
    if (ctx.actor.email) db.prepare("DELETE FROM requests WHERE email = ?").run(ctx.actor.email);   // Anfragen unter derselben Adresse
    // Name bleibt nur, wenn ein Modul unter ihm stehen bleibt; die Adresse geht immer.
    db.prepare("UPDATE actors SET email = NULL, name = ?, org_id = NULL, org = NULL, role = NULL, about = NULL, website = NULL, langs = NULL, avatar = NULL, avatar_type = NULL, avatar_updated = NULL WHERE id = ?").run(kept ? ctx.actor.name : "(erased)", ctx.actor.id);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  auditAppend(db, { kind: "erase", actor_id: ctx.actor.id, resource: "actor:" + ctx.actor.id, text: `personal data erased; ${kept} module(s) kept under the name, ${unpublished} unpublished, ${deleted} contribution(s) deleted` });
  send(ctx.res, 200, { ok: true, kept, unpublished, deleted });
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
