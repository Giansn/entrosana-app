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
  const out = { contributions: 0, actors: 0, verifications: 0, tokens: 0, requests: 0, applications: 0 };
  db.exec("BEGIN IMMEDIATE");
  try {
    const stale = db.prepare("SELECT id FROM contributions WHERE status = 'received' AND created < ?").all(cutoff);
    for (const c of stale) db.prepare("DELETE FROM contributions WHERE id = ?").run(c.id);
    out.contributions = stale.length;
    out.verifications = db.prepare("DELETE FROM verifications WHERE (used IS NOT NULL AND used < ?) OR (used IS NULL AND expires < ?)").run(cutoff, cutoff).changes;
    out.tokens = db.prepare("DELETE FROM actor_tokens WHERE expires < ?").run(cutoff).changes;
    out.applications = db.prepare("DELETE FROM applications WHERE decided IS NOT NULL AND decided < ?").run(new Date(now.getTime() - 730 * 86400e3).toISOString()).changes;   // entschiedene Bewerbungen: 24 Monate
    out.requests = db.prepare("DELETE FROM requests WHERE created < ?").run(new Date(now.getTime() - 180 * 86400e3).toISOString()).changes;   // Anfragen: 180 Tage
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
      text: `retention ${DAYS}d: ${out.contributions} unconfirmed contribution(s), ${out.actors} orphan actor(s), ${out.verifications} verification(s), ${out.tokens} token(s), ${out.requests} request(s), ${out.applications} decided application(s) removed` });
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
  return { exported: new Date().toISOString(), actor: { id: actor.id, kind: actor.kind, email: actor.email, name: actor.name, created: actor.created, org: actor.org || null, role: actor.role || null, about: actor.about || null, website: actor.website || null, langs: actor.langs || [], roles: [...(actor.roles || [])] },
           contributions, applications, requests, journal, audit, tokens };
}
