// maintenance.mjs — Aufbewahrungsfristen. Reine Funktionen über der Datenbank,
// damit der Test sie auf :memory: mit gestellter Uhr trifft.
//
// Regeln (docs/contributions.md, Personendaten):
//   received älter als 7 Tage: nie bestätigt, weg — samt Trail und Vorschlag.
//   Akteure der Art email ohne Beitrag, Rolle und Marke, älter als 7 Tage: weg.
//   Bestätigungsverweise: verbraucht oder abgelaufen seit 7 Tagen: weg.
//   Zugangsmarken: abgelaufen seit 7 Tagen: weg.
//   Anfragen (requests): älter als 180 Tage: weg.
//   Entschiedene Bewerbungen: 24 Monate nach dem Entscheid: weg.
// Die Kette bleibt; sie trägt keine Adressen.
import { append } from "./audit.mjs";

export const DAYS = 7;

export function purge(db, now = new Date()) {
  const cutoff = new Date(now.getTime() - DAYS * 86400e3).toISOString();
  const nowIso = now.toISOString();
  const out = { contributions: 0, actors: 0, verifications: 0, tokens: 0, requests: 0, applications: 0, invites: 0 };
  db.exec("BEGIN IMMEDIATE");
  try {
    const stale = db.prepare("SELECT id FROM contributions WHERE status = 'received' AND created < ?").all(cutoff);
    for (const c of stale) db.prepare("DELETE FROM contributions WHERE id = ?").run(c.id);
    out.contributions = stale.length;
    out.verifications = db.prepare("DELETE FROM verifications WHERE (used IS NOT NULL AND used < ?) OR (used IS NULL AND expires < ?)").run(cutoff, cutoff).changes;
    out.tokens = db.prepare("DELETE FROM actor_tokens WHERE expires < ?").run(cutoff).changes;
    out.applications = db.prepare("DELETE FROM applications WHERE decided IS NOT NULL AND decided < ?").run(new Date(now.getTime() - 730 * 86400e3).toISOString()).changes;   // entschiedene Bewerbungen: 24 Monate
    out.requests = db.prepare("DELETE FROM requests WHERE created < ?").run(new Date(now.getTime() - 180 * 86400e3).toISOString()).changes;   // Anfragen: 180 Tage
    out.invites = db.prepare("DELETE FROM invites WHERE accepted IS NULL AND created < ?").run(new Date(now.getTime() - 180 * 86400e3).toISOString()).changes;   // Einladungen ohne Antwort: 180 Tage
    const orphans = db.prepare(`SELECT id FROM actors a WHERE a.kind = 'email' AND a.created < ?
      AND NOT EXISTS (SELECT 1 FROM contributions c WHERE c.actor_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.actor_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM actor_tokens t WHERE t.actor_id = a.id AND t.expires > ?)`).all(cutoff, nowIso);
    for (const a of orphans) db.prepare("DELETE FROM actors WHERE id = ?").run(a.id);
    out.actors = orphans.length;
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  if (Object.values(out).some(n => n > 0)) {
    append(db, { kind: "purge", actor_id: null, resource: null,
      text: `retention ${DAYS}d: ${out.invites} unanswered invitation(s), ${out.contributions} unconfirmed contribution(s), ${out.actors} orphan actor(s), ${out.verifications} verification(s), ${out.tokens} token(s), ${out.requests} request(s), ${out.applications} decided application(s) removed` });
  }
  return out;
}

// Alles, was der Hub über einen Akteur hält, als eine Antwort.
export function exportActor(db, actor) {
  const contributions = db.prepare("SELECT * FROM contributions WHERE actor_id = ? ORDER BY id").all(actor.id)
    .map(c => ({ ...c, files: JSON.parse(c.files_json || "[]"), records: JSON.parse(c.trail_json || "[]"), files_json: undefined, trail_json: undefined }));
  const ids = contributions.map(c => "contribution:" + c.id);
  const audit = ids.length
    ? db.prepare(`SELECT seq, t, kind, actor_id, resource, text FROM audit WHERE resource IN (${ids.map(() => "?").join(",")}) OR resource = ? ORDER BY seq`).all(...ids, "actor:" + actor.id)
    : db.prepare("SELECT seq, t, kind, actor_id, resource, text FROM audit WHERE resource = ? ORDER BY seq").all("actor:" + actor.id);
  const tokens = db.prepare("SELECT created, expires, last_used FROM actor_tokens WHERE actor_id = ?").all(actor.id);
  const applications = db.prepare("SELECT id, text, created, decided, outcome, reason FROM applications WHERE actor_id = ? ORDER BY id").all(actor.id);
  const requests = actor.email ? db.prepare("SELECT id, name, org, kind, text, created FROM requests WHERE email = ? ORDER BY id").all(actor.email) : [];
  const journal = db.prepare("SELECT id, text, public, created, updated FROM journal WHERE actor_id = ? ORDER BY id").all(actor.id);
  const invites = db.prepare("SELECT id, email, message, created, accepted FROM invites WHERE inviter_id = ? ORDER BY id").all(actor.id);
  const services = db.prepare("SELECT id, name, what, grp, place, kind, target, interval_min, created, last_state, last_status, last_checked, last_beat FROM services WHERE actor_id = ? ORDER BY id").all(actor.id);
  // 2026-10-31 (Gap 1.6): Profilfelder aus der Zeile, nicht aus dem mitgegebenen Objekt; dazu Bild, Dateien, Punkte, Module.
  const row = db.prepare("SELECT * FROM actors WHERE id = ?").get(actor.id) || actor;
  const langs = String(row.langs || "").split(",").filter(Boolean);   // gespeichert als «de,fr»
  const avatar = row.avatar ? { type: row.avatar_type, updated: row.avatar_updated, base64: Buffer.from(row.avatar).toString("base64") } : null;
  const files = db.prepare("SELECT id, name, label, type, size, sha256, public, created FROM files WHERE actor_id = ? ORDER BY id").all(actor.id)
    .map(f => ({ ...f, public: !!f.public, download: `/api/files/${actor.id}/${f.id}/${encodeURIComponent(f.name)}` }));
  const points = db.prepare("SELECT slug, created FROM points WHERE actor_id = ? ORDER BY created").all(actor.id);
  const modules = db.prepare("SELECT slug, added FROM module_contributors WHERE actor_id = ? ORDER BY added").all(actor.id);
  return { exported: new Date().toISOString(), actor: { id: actor.id, kind: row.kind, email: row.email, name: row.name, created: row.created, org: row.org || null, role: row.role || null, about: row.about || null, bio: row.bio || null, place: row.place || null, contact_email: row.contact_email || null, website: row.website || null, langs, roles: [...(actor.roles || [])], avatar },
           contributions, applications, requests, journal, invites, services, files, points, modules, audit, tokens };
}

// Ruhende Konten (2026-09-10): letzte Regung = jüngste Marke (last_used oder created) oder das Konto selbst.
// Nach NOTICE_MS ohne Regung geht ein Hinweis, nach weiteren GRACE_MS ohne Regung wird gelöscht.
// Team-Konten (owner, reviewer) und Dienstkonten sind ausgenommen. mailFn(actor) und eraseFn(actor)
// kommen vom Dienst; hier wird nur entschieden und gebucht.
export const DORMANT_NOTICE_MS = 730 * 86400e3, DORMANT_GRACE_MS = 92 * 86400e3;
export function lastActivity(db, actorId) {
  const r = db.prepare("SELECT MAX(COALESCE(last_used, created)) t FROM actor_tokens WHERE actor_id = ?").get(actorId);
  const a = db.prepare("SELECT created FROM actors WHERE id = ?").get(actorId);
  return Math.max(r && r.t ? Date.parse(r.t) : 0, a && a.created ? Date.parse(a.created) : 0);
}
export function dormantSweep(db, now = new Date(), mailFn = () => Promise.resolve({ ok: true }), eraseFn = () => ({})) {
  const out = { noticed: 0, erased: 0, cleared: 0 };
  const rows = db.prepare(`SELECT a.* FROM actors a WHERE a.kind = 'email' AND a.email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.actor_id = a.id AND r.role IN ('owner', 'reviewer'))`).all();
  for (const a of rows) {
    const idle = now.getTime() - lastActivity(db, a.id);
    if (a.dormant_notice && idle < DORMANT_NOTICE_MS) {   // hat sich nach dem Hinweis gemeldet
      db.prepare("UPDATE actors SET dormant_notice = NULL WHERE id = ?").run(a.id); out.cleared++; continue;
    }
    if (!a.dormant_notice && idle >= DORMANT_NOTICE_MS) {
      db.prepare("UPDATE actors SET dormant_notice = ? WHERE id = ?").run(now.toISOString(), a.id);
      append(db, { kind: "dormant.notice", actor_id: a.id, resource: "actor:" + a.id, text: "no sign-in for 24 months; notice sent, 3 months to sign in" });
      Promise.resolve(mailFn(a)).catch(() => {}); out.noticed++; continue;
    }
    if (a.dormant_notice && now.getTime() - Date.parse(a.dormant_notice) >= DORMANT_GRACE_MS && idle >= DORMANT_NOTICE_MS) {
      eraseFn(a); append(db, { kind: "dormant.erase", actor_id: a.id, resource: "actor:" + a.id, text: "no sign-in for 27 months; erased like a self-erasure" }); out.erased++;
    }
  }
  return out;
}

