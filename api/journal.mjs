// journal.mjs — Journaleinträge und das öffentliche Profil. Reine Funktionen
// über der Datenbank; Fehler tragen einen HTTP-Status (wie applications.mjs).
import { append } from "./audit.mjs";
import { rolesOf } from "./policy.mjs";
import { standingOf } from "./applications.mjs";
export const MAX_TEXT = 2000;
function err(status, message) { const e = new Error(message); e.status = status; return e; }
export function listJournal(db, actorId, publicOnly = false) {
  return db.prepare(`SELECT id, text, public, created, updated FROM journal WHERE actor_id = ? ${publicOnly ? "AND public = 1" : ""} ORDER BY created DESC, id DESC`).all(actorId);
}
export function addEntry(db, actor, text, pub) {
  text = String(text || "").trim();
  if (!actor || !actor.id) throw err(401, "no actor");
  if (text.length < 1 || text.length > MAX_TEXT) throw err(400, `text must be 1 to ${MAX_TEXT} characters`);
  const now = new Date().toISOString();
  const id = db.prepare("INSERT INTO journal(actor_id, text, public, created) VALUES (?,?,?,?)").run(actor.id, text, pub ? 1 : 0, now).lastInsertRowid;
  append(db, { kind: "journal.add", actor_id: actor.id, resource: "journal:" + id, text: pub ? "entry added (public)" : "entry added (private)" });
  return db.prepare("SELECT id, text, public, created, updated FROM journal WHERE id = ?").get(id);
}
export function updateEntry(db, actor, id, patch) {
  const row = db.prepare("SELECT * FROM journal WHERE id = ? AND actor_id = ?").get(Number(id), actor.id);
  if (!row) throw err(404, "not found");
  const text = patch.text !== undefined ? String(patch.text).trim() : row.text;
  if (text.length < 1 || text.length > MAX_TEXT) throw err(400, `text must be 1 to ${MAX_TEXT} characters`);
  const pub = patch.public !== undefined ? (patch.public ? 1 : 0) : row.public;
  db.prepare("UPDATE journal SET text = ?, public = ?, updated = ? WHERE id = ?").run(text, pub, new Date().toISOString(), row.id);
  append(db, { kind: "journal.edit", actor_id: actor.id, resource: "journal:" + row.id, text: "entry edited" + (pub !== row.public ? (pub ? ", now public" : ", now private") : "") });
  return db.prepare("SELECT id, text, public, created, updated FROM journal WHERE id = ?").get(row.id);
}
export function deleteEntry(db, actor, id) {
  const n = db.prepare("DELETE FROM journal WHERE id = ? AND actor_id = ?").run(Number(id), actor.id).changes;
  if (!n) throw err(404, "not found");
  append(db, { kind: "journal.delete", actor_id: actor.id, resource: "journal:" + Number(id), text: "entry deleted" });
  return n;
}
// Das öffentliche Profil: Name, Stand, Profilfelder, veröffentlichte Module, öffentliche Einträge. Ohne Adresse.
// Der Slug für /contributors/<name>: Umlaute nach ae/oe/ue, ß nach ss, dann
// alles ausser Buchstaben und Ziffern zu Bindestrichen. Nicht gespeichert,
// sondern aus dem Namen gerechnet; bei zwei gleichen Namen trägt der spätere
// die Nummer hinten. Ändert sich der Name, ändert sich die Adresse — /p/<id>
// bleibt darum als feste Adresse bestehen und leitet weiter.
export function slugify(name) {
  return String(name || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
export function slugOf(db, actor) {
  const base = slugify(actor.name); if (!base) return null;
  const earlier = db.prepare("SELECT id, name FROM actors WHERE kind = 'email' AND email IS NOT NULL AND name IS NOT NULL AND id < ?").all(actor.id)
    .some(a => slugify(a.name) === base);
  return earlier ? base + "-" + actor.id : base;
}
export function publicProfileBySlug(db, slug) {
  slug = String(slug || "").toLowerCase();
  const rows = db.prepare("SELECT id, name FROM actors WHERE kind = 'email' AND email IS NOT NULL AND name IS NOT NULL").all();
  const hit = rows.find(a => slugOf(db, a) === slug);
  return hit ? publicProfile(db, hit.id) : null;
}
export function publicProfile(db, id) {
  const a = db.prepare("SELECT * FROM actors WHERE id = ? AND kind = 'email' AND email IS NOT NULL").get(Number(id));
  if (!a || !a.name) return null;
  const roles = rolesOf(db, a.id);
  const modules = db.prepare("SELECT title, slug, published FROM contributions WHERE actor_id = ? AND status = 'published' AND slug IS NOT NULL ORDER BY published DESC").all(a.id);
  return { id: a.id, name: a.name, slug: slugOf(db, a), standing: standingOf(roles), since: String(a.created).slice(0, 10), avatar: a.avatar ? (a.avatar_updated || "1") : null,
    contact: a.contact_email || "",
    profile: { org: a.org || "", role: a.role || "", about: a.about || "", bio: a.bio || "", place: a.place || "", website: a.website || "", langs: a.langs ? String(a.langs).split(",").filter(Boolean) : [] },
    modules, journal: listJournal(db, a.id, true).map(e => ({ id: e.id, text: e.text, created: e.created, updated: e.updated })) };
}
// Suche über Öffentliches: Profile, öffentliche Journaleinträge, veröffentlichte Module. Kein Protokoll der Frage.
export function searchPublic(db, q, limit = 8) {
  q = String(q || "").trim().slice(0, 80);
  if (q.length < 2) return { people: [], journal: [], modules: [] };
  const like = "%" + q.replace(/[%_]/g, " ") + "%";
  const people = db.prepare("SELECT id, name, org, role, about FROM actors WHERE kind = 'email' AND email IS NOT NULL AND name IS NOT NULL AND (name LIKE ? OR org LIKE ? OR about LIKE ?) ORDER BY name LIMIT ?").all(like, like, like, limit)
    .map(a => ({ id: a.id, name: a.name, line: [a.role, a.org].filter(Boolean).join(" · "), href: "/p/" + a.id }));
  const journal = db.prepare("SELECT j.id, j.text, j.created, j.actor_id, a.name FROM journal j JOIN actors a ON a.id = j.actor_id WHERE j.public = 1 AND a.email IS NOT NULL AND a.name IS NOT NULL AND j.text LIKE ? ORDER BY j.created DESC LIMIT ?").all(like, limit)
    .map(j => ({ id: j.id, text: j.text.slice(0, 140), name: j.name, created: j.created, href: "/p/" + j.actor_id + "#j" + j.id }));
  const modules = db.prepare("SELECT c.title, c.slug, a.name FROM contributions c JOIN actors a ON a.id = c.actor_id WHERE c.status = 'published' AND c.slug IS NOT NULL AND (c.title LIKE ? OR c.summary LIKE ?) ORDER BY c.published DESC LIMIT ?").all(like, like, limit)
    .map(c => ({ title: c.title, name: c.name, href: "/modules/" + c.slug }));
  return { people, journal, modules };
}
