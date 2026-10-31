// applications.mjs — Stand eines Kontos und die Bewerbung als Beitragende.
// Sammler ist, wer eine Adresse bestätigt hat; Beitragende wird, wen das Team
// freigibt (Rolle contributor). Reine Funktionen über der Datenbank; die
// Fehler tragen einen HTTP-Status, den der Dienst weiterreicht.
import { append } from "./audit.mjs";
import { rolesOf } from "./policy.mjs";

export function standingOf(roles) {
  const r = roles instanceof Set ? roles : new Set(roles || []);
  if (r.has("owner")) return "owner";
  if (r.has("reviewer")) return "reviewer";
  if (r.has("contributor")) return "contributor";
  return "collector";
}
export function isApproved(roles) { return standingOf(roles) !== "collector"; }
export function currentApplication(db, actorId) {
  return db.prepare("SELECT * FROM applications WHERE actor_id = ? ORDER BY id DESC LIMIT 1").get(actorId) || null;
}
export function openApplication(db, actor, text) {
  text = String(text || "").trim();
  if (!actor || !actor.id) throw err(401, "no actor");
  if (!actor.name || String(actor.name).trim().length < 2) throw err(400, "name missing: set your name first");
  if (isApproved(actor.roles)) throw err(409, "already approved");
  if (text.length < 20 || text.length > 2000) throw err(400, "text must be 20 to 2000 characters");
  const last = currentApplication(db, actor.id);
  if (last && !last.decided) throw err(409, "application pending");
  const now = new Date().toISOString();
  const id = db.prepare("INSERT INTO applications(actor_id, text, created) VALUES (?,?,?)").run(actor.id, text, now).lastInsertRowid;
  append(db, { kind: "application.open", actor_id: actor.id, resource: "application:" + id, text: "contributor application opened" });
  return db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
}
export function listApplications(db, all = false) {
  return db.prepare(`SELECT a.*, x.name AS actor_name, x.email AS actor_email FROM applications a JOIN actors x ON x.id = a.actor_id
                     ${all ? "" : "WHERE a.decided IS NULL"} ORDER BY a.id DESC`).all();
}
export function decideApplication(db, id, decider, outcome, reason) {
  reason = String(reason || "").trim().slice(0, 2000);
  if (!["approved", "declined"].includes(outcome)) throw err(400, "outcome must be approved or declined");
  if (reason.length < 3) throw err(400, "reason required");
  const a = db.prepare("SELECT * FROM applications WHERE id = ?").get(Number(id));
  if (!a) throw err(404, "not found");
  if (a.decided) throw err(409, "already decided");
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE applications SET decided = ?, decided_by = ?, outcome = ?, reason = ? WHERE id = ?").run(now, decider.id, outcome, reason, a.id);
    if (outcome === "approved" && !rolesOf(db, a.actor_id).has("contributor"))
      db.prepare("INSERT INTO roles(actor_id, role, granted_by, granted) VALUES (?, 'contributor', ?, ?)").run(a.actor_id, decider.id, now);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  // Kette pseudonym (2026-10-31): die Begründung bleibt auf der Bewerbung (Spalte reason), nicht in der Kette.
  append(db, { kind: "application." + outcome, actor_id: decider.id, resource: "application:" + a.id, text: outcome + " (reason on the application)" });
  return { application: db.prepare("SELECT * FROM applications WHERE id = ?").get(a.id), applicant: db.prepare("SELECT * FROM actors WHERE id = ?").get(a.actor_id) };
}
function err(status, message) { const e = new Error(message); e.status = status; return e; }
