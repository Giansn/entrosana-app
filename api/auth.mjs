// auth.mjs — zwei Wege, einen Akteur zu erkennen, beide ohne Passwort.
// 1. Dienstakteur: Kopfzeile X-Entrosana-Token gegen ~/.config/entrosana-api.token,
//    dasselbe Muster wie admin-app.py (Datei 0600, beim ersten Start erzeugt).
// 2. Zugangsmarke: Authorization: Bearer <token>, ausgegeben nach bestätigter
//    E-Mail-Adresse, gespeichert nur als SHA-256, 30 Tage gültig.
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { rolesOf } from "./policy.mjs";

const TOKEN_FILE = process.env.API_TOKEN_FILE || join(process.env.HOME || ".", ".config", "entrosana-api.token");
export const sha = s => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export function serviceToken() {
  if (!existsSync(TOKEN_FILE)) {
    mkdirSync(dirname(TOKEN_FILE), { recursive: true });
    writeFileSync(TOKEN_FILE, newToken() + "\n");
    chmodSync(TOKEN_FILE, 0o600);
  }
  return readFileSync(TOKEN_FILE, "utf8").trim();
}
function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// Der Dienstakteur existiert genau einmal und trägt die prüfende Rolle.
export function ensureServiceActor(db, audit) {
  let a = db.prepare("SELECT * FROM actors WHERE kind='service' AND name='admin'").get();
  if (!a) {
    const now = new Date().toISOString();
    const id = db.prepare("INSERT INTO actors(kind, name, created) VALUES ('service','admin',?)").run(now).lastInsertRowid;
    db.prepare("INSERT INTO roles(actor_id, role, granted) VALUES (?, 'reviewer', ?)").run(id, now);
    audit(db, { kind: "bootstrap", actor_id: Number(id), resource: "actor:" + id, text: "service actor admin created with role reviewer" });
    a = db.prepare("SELECT * FROM actors WHERE id = ?").get(id);
  }
  return a;
}

export function withRoles(db, row) {
  return row ? { id: row.id, kind: row.kind, email: row.email, name: row.name, org_id: row.org_id, created: row.created, roles: rolesOf(db, row.id) } : null;
}

export function issueToken(db, actorId, days = 30) {
  const token = newToken(), now = new Date();
  const exp = new Date(now.getTime() + days * 86400e3);
  db.prepare("INSERT INTO actor_tokens(actor_id, token_hash, created, expires) VALUES (?,?,?,?)")
    .run(actorId, sha(token), now.toISOString(), exp.toISOString());
  return { token, expires: exp.toISOString() };
}

// Reihenfolge: Dienst-Kopfzeile, dann Zugangsmarke, sonst anonym (null).
export function resolveActor(db, req, token) {
  const svc = req.headers["x-entrosana-token"];
  if (svc && same(svc, token)) {
    return withRoles(db, db.prepare("SELECT * FROM actors WHERE kind='service' AND name='admin'").get());
  }
  const auth = String(req.headers["authorization"] || "");
  if (auth.startsWith("Bearer ")) {
    const h = sha(auth.slice(7).trim());
    const row = db.prepare(`SELECT a.* FROM actor_tokens t JOIN actors a ON a.id = t.actor_id
                            WHERE t.token_hash = ? AND t.expires > ?`).get(h, new Date().toISOString());
    if (row) {
      db.prepare("UPDATE actor_tokens SET last_used = ? WHERE token_hash = ?").run(new Date().toISOString(), h);
      return withRoles(db, row);
    }
  }
  return null;
}
