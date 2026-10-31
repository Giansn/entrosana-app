#!/usr/bin/env node
// admin.mjs — Verwaltung auf der Maschine, als Eigentümer. Kein Netz.
//   node api/admin.mjs grant <email> <role> [--by <email>]
//   node api/admin.mjs revoke <email> <role>
//   node api/admin.mjs list
//   node api/admin.mjs verify-chain
import { open } from "./db.mjs";
import { append, verify } from "./audit.mjs";
import { issueToken } from "./auth.mjs";
import { appendEntry, removeEntry, entryFor } from "./publish.mjs";
import { publishChecks } from "./contributions.mjs";
import { purge } from "./maintenance.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { db } = open(process.env.DB_PATH || join(HERE, "db", "hub.sqlite"));
const [cmd, a, b, flag, byEmail] = process.argv.slice(2);
const now = () => new Date().toISOString();
const ROLES = ["submitter", "reviewer", "owner", "editor", "school", "teacher", "parent", "learner"];

function actorByEmail(email, create) {
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e)) throw new Error("ungültige E-Mail-Adresse");
  let row = db.prepare("SELECT * FROM actors WHERE email = ?").get(e);
  if (!row && create) {
    const id = db.prepare("INSERT INTO actors(kind, email, created) VALUES ('email', ?, ?)").run(e, now()).lastInsertRowid;
    row = db.prepare("SELECT * FROM actors WHERE id = ?").get(id);
    // Kette pseudonym (2026-10-31): die Adresse steht in actors, nicht in der Kette; actor:<id> genügt.
    append(db, { kind: "actor", actor_id: null, resource: "actor:" + id, text: "actor created by admin cli" });
  }
  if (!row) throw new Error("unbekannter Akteur: " + e);
  return row;
}

try {
  if (cmd === "grant" || cmd === "revoke") {
    if (!ROLES.includes(b)) throw new Error("Rolle muss eine von " + ROLES.join(", ") + " sein");
    const target = actorByEmail(a, cmd === "grant");
    const by = flag === "--by" && byEmail ? actorByEmail(byEmail, false).id : null;
    if (cmd === "grant") {
      db.prepare("INSERT OR IGNORE INTO roles(actor_id, role, granted_by, granted) VALUES (?,?,?,?)").run(target.id, b, by, now());
      append(db, { kind: "grant", actor_id: by, resource: "actor:" + target.id, text: `role ${b} granted to actor ${target.id}` });
    } else {
      db.prepare("DELETE FROM roles WHERE actor_id = ? AND role = ?").run(target.id, b);
      append(db, { kind: "revoke", actor_id: by, resource: "actor:" + target.id, text: `role ${b} revoked from actor ${target.id}` });
    }
    console.log(`${cmd}: ${b} ${cmd === "grant" ? "→" : "←"} ${target.email}`);
  } else if (cmd === "token") {
    // Zugangsmarke für eine bekannte Adresse ausgeben, ohne Mail. Wird einmal gezeigt.
    const target = actorByEmail(a, false);
    const days = Number(b) > 0 ? Number(b) : 30;
    const t = issueToken(db, target.id, days);
    append(db, { kind: "token.cli", actor_id: null, resource: "actor:" + target.id, text: `token issued on the machine for actor ${target.id}, ${days} days` });
    console.log(t.token);
  } else if (cmd === "publish" || cmd === "unpublish") {
    const c = db.prepare("SELECT * FROM contributions WHERE id = ?").get(Number(a));
    if (!c) throw new Error("kein Beitrag #" + a);
    const actor = db.prepare("SELECT * FROM actors WHERE id = ?").get(c.actor_id);
    if (cmd === "publish") {
      if (c.status !== "admitted") throw new Error("nur angenommene Beiträge gehen durch das Tor (Stand: " + c.status + ")");
      const fails = publishChecks(c, actor);
      if (fails.length) throw new Error("Tor zu: " + fails.join("; "));
      const r = appendEntry("modules", entryFor(c, actor));
      db.prepare("UPDATE contributions SET status = 'published', published = ?, published_by = NULL, slug = ? WHERE id = ?").run(now(), r.slug, c.id);
      append(db, { kind: "publish", actor_id: null, resource: "contribution:" + c.id, text: `published as modules/${r.slug} via cli (owner on the machine)` });
      console.log("publish: modules/" + r.slug + " (Sicherung " + r.backup + ")");
    } else {
      if (c.status !== "published") throw new Error("nicht veröffentlicht (Stand: " + c.status + ")");
      const r = c.slug ? removeEntry("modules", c.slug) : { removed: false };
      db.prepare("UPDATE contributions SET status = 'admitted', published = NULL, published_by = NULL, slug = NULL WHERE id = ?").run(c.id);
      append(db, { kind: "unpublish", actor_id: null, resource: "contribution:" + c.id, text: `taken back from the catalogue via cli (modules/${c.slug})` });
      console.log("unpublish: modules/" + c.slug + (r.removed ? "" : " (war nicht in der Datei)"));
    }
  } else if (cmd === "purge") {
    console.log(JSON.stringify({ purged: purge(db) }));
  } else if (cmd === "list") {
    for (const r of db.prepare(`SELECT a.id, a.kind, a.email, a.name, GROUP_CONCAT(r.role) AS roles
                                FROM actors a LEFT JOIN roles r ON r.actor_id = a.id GROUP BY a.id ORDER BY a.id`).all())
      console.log(`${String(r.id).padStart(3)}  ${r.kind.padEnd(8)} ${(r.email || r.name || "").padEnd(32)} ${r.roles || "-"}`);
  } else if (cmd === "verify-chain") {
    const v = verify(db); console.log(JSON.stringify(v)); process.exitCode = v.ok ? 0 : 1;
  } else {
    console.log("Befehle: grant <email> <role> [--by <email>] | revoke <email> <role> | token <email> [tage] | publish <id> | unpublish <id> | purge | list | verify-chain"); process.exitCode = 2;
  }
} catch (e) { console.error("Fehler:", e.message); process.exitCode = 1; }
finally { db.close(); }
