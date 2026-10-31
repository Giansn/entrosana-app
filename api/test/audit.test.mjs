// Kette pseudonym (2026-10-31): neue Zeilen tragen Kontonummern, keine Adressen, Namen oder Begründungen.
// Was hier geprüft wird, verspricht die Datenschutzerklärung in Abschnitt 7.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "../db.mjs";
import { openApplication, decideApplication } from "../applications.mjs";
import { rolesOf } from "../policy.mjs";
import { verify } from "../audit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function assertNoAddress(db) {
  const rows = db.prepare("SELECT seq, kind, resource, text FROM audit ORDER BY seq").all();
  assert.ok(rows.length > 0, "keine kettenzeilen geschrieben");
  for (const r of rows) {
    assert.ok(!/@/.test(r.text || ""), `kette ${r.seq} (${r.kind}): text trägt eine adresse: ${r.text}`);
    assert.ok(!/@/.test(r.resource || ""), `kette ${r.seq} (${r.kind}): resource trägt eine adresse: ${r.resource}`);
  }
  return rows;
}

test("kette: entscheid über eine bewerbung schreibt weder adresse noch begründung", () => {
  const { db } = open(":memory:");
  const now = new Date().toISOString();
  const a = db.prepare("INSERT INTO actors(kind,email,name,created) VALUES ('email','cara@x.ch','Cara',?)").run(now).lastInsertRowid;
  const team = db.prepare("INSERT INTO actors(kind,email,name,created) VALUES ('email','team@x.ch','Team',?)").run(now).lastInsertRowid;
  db.prepare("INSERT INTO roles(actor_id, role, granted) VALUES (?, 'reviewer', ?)").run(team, now);
  const actor = { id: a, name: "Cara", email: "cara@x.ch", roles: rolesOf(db, a) };
  const app = openApplication(db, actor, "I teach grade 8; reach me at cara@x.ch for a value-system workshop.");
  const reason = "Fits the social track; replied to cara@x.ch by mail.";
  decideApplication(db, app.id, { id: team }, "approved", reason);
  const rows = assertNoAddress(db);
  const mine = rows.filter(r => r.kind.startsWith("application."));
  assert.equal(mine.length, 2);
  assert.ok(mine.every(r => !/Fits|Cara/.test(r.text)), "begründung oder name in der kette");
  assert.ok(mine.every(r => r.resource === "application:" + app.id));
  // Die Begründung bleibt auf der Bewerbung, nicht in der Kette.
  assert.equal(db.prepare("SELECT reason FROM applications WHERE id = ?").get(app.id).reason, reason);
  assert.equal(verify(db).ok, true);
  db.close();
});

test("kette: admin cli (grant, token, revoke) schreibt die kontonummer, nicht die adresse", () => {
  const dir = mkdtempSync(join(tmpdir(), "entrosana-audit-"));
  try {
    const env = { ...process.env, DB_PATH: join(dir, "hub.sqlite") };
    const cli = (...args) => execFileSync(process.execPath, [join(HERE, "..", "admin.mjs"), ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    cli("grant", "neu@example.org", "reviewer");
    cli("token", "neu@example.org", "1");
    cli("revoke", "neu@example.org", "reviewer");
    const { db } = open(env.DB_PATH);
    const rows = assertNoAddress(db);
    const kinds = rows.map(r => r.kind);
    for (const k of ["actor", "grant", "token.cli", "revoke"]) assert.ok(kinds.includes(k), "kettenart fehlt: " + k);
    const id = db.prepare("SELECT id FROM actors WHERE email = 'neu@example.org'").get().id;
    assert.ok(rows.filter(r => ["actor", "grant", "token.cli", "revoke"].includes(r.kind)).every(r => r.resource === "actor:" + id));
    assert.ok(rows.every(r => !/neu|example/.test(r.text)), "adressbestandteil in der kette");
    assert.equal(verify(db).ok, true);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
