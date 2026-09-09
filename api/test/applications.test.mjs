// Gate: Sammler registrieren sich frei, Beitragende werden freigegeben, das Tor kennt den Unterschied.
import { test } from "node:test";
import assert from "node:assert/strict";
import { open } from "../db.mjs";
import { openApplication, decideApplication, listApplications, standingOf } from "../applications.mjs";
import { rolesOf, can } from "../policy.mjs";
import { publishChecks } from "../contributions.mjs";

test("bewerbung: sammler → offen → freigegeben → contributor; tor und policy folgen", () => {
  const { db, migrations } = open(":memory:"); assert.equal(migrations.total, 15);
  const now = new Date().toISOString();
  const a = db.prepare("INSERT INTO actors(kind,email,name,created) VALUES ('email','c@x.ch','Cara',?)").run(now).lastInsertRowid;
  const team = db.prepare("INSERT INTO actors(kind,email,name,created) VALUES ('email','t@x.ch','Team',?)").run(now).lastInsertRowid;
  db.prepare("INSERT INTO roles(actor_id, role, granted) VALUES (?, 'reviewer', ?)").run(team, now);
  const actor = { id: a, name: "Cara", email: "c@x.ch", roles: rolesOf(db, a) };
  assert.equal(standingOf(actor.roles), "collector");
  assert.throws(() => openApplication(db, actor, "short"), /20 to 2000/);
  assert.throws(() => openApplication(db, { id: a, name: "", roles: new Set() }, "I teach grade 8 and would bring a value-system workshop."), /name missing/);
  const app = openApplication(db, actor, "I teach grade 8 and would bring a value-system workshop.");
  assert.throws(() => openApplication(db, actor, "I teach grade 8 and would bring a value-system workshop."), /pending/);
  assert.equal(listApplications(db).length, 1); assert.equal(listApplications(db)[0].actor_email, "c@x.ch");
  assert.throws(() => decideApplication(db, app.id, { id: team }, "approved", ""), /reason/);
  assert.throws(() => decideApplication(db, app.id, { id: team }, "maybe", "x"), /approved or declined/);
  const d = decideApplication(db, app.id, { id: team }, "approved", "Fits the social track.");
  assert.equal(d.application.outcome, "approved"); assert.equal(d.applicant.email, "c@x.ch");
  assert.ok(rolesOf(db, a).has("contributor")); assert.equal(standingOf(rolesOf(db, a)), "contributor");
  assert.equal(listApplications(db).length, 0); assert.equal(listApplications(db, true).length, 1);
  assert.throws(() => decideApplication(db, app.id, { id: team }, "declined", "twice"), /already/);
  assert.throws(() => openApplication(db, { id: a, name: "Cara", roles: rolesOf(db, a) }, "I am approved already, this must not open."), /already approved/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit WHERE kind LIKE 'application.%'").get().n, 2);
  const c = { decided_by: team, trail_ok: null, area: "social", title: "Values", summary: "x".repeat(50), files_json: "[]" };
  assert.ok(publishChecks(c, { name: "Cara", roles: new Set() }).some(f => /not approved as contributor/.test(f)));
  assert.equal(publishChecks(c, { name: "Cara", roles: rolesOf(db, a) }).filter(f => /not approved/.test(f)).length, 0);
  assert.equal(publishChecks(c, { name: "Own", roles: new Set(["owner"]) }).filter(f => /not approved/.test(f)).length, 0);
  assert.equal(can(null, "apply"), false); assert.equal(can({ id: a, roles: new Set() }, "apply"), true);
  assert.equal(can({ id: a, roles: new Set() }, "decide-application"), false);
  assert.equal(can({ id: team, roles: new Set(["reviewer"]) }, "decide-application"), true);
  db.close();
});
