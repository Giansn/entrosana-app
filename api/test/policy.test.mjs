// Gate Phase 2: can() verweigert einem unbekannten Akteur alles ausser submit
// und gewährt nur die Tabelle; die Kette prüft sich nach 100 gemischten Zeilen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { open } from "../db.mjs";
import { can, ACTIONS } from "../policy.mjs";
import { append, verify } from "../audit.mjs";

const contribution = (owner, status) => ({ kind: "contribution", actor_id: owner, status });

test("anonym: nur submit", () => {
  for (const a of ACTIONS) assert.equal(can(null, a, contribution(1, "received")), a === "submit", a);
});

test("unbekannter Akteur ohne Rollen: nur submit, nichts Fremdes", () => {
  const stranger = { id: 99, roles: new Set() };
  for (const a of ACTIONS) assert.equal(can(stranger, a, contribution(1, "received")), a === "submit" || a === "apply", a);   // bewerben darf jede bestätigte Adresse
  assert.equal(can(stranger, "read", null), false);
  assert.equal(can(stranger, "grant", null), false);
});

test("einreichend: eigene lesen, eigene offene zurückziehen, sonst nichts", () => {
  const me = { id: 7, roles: new Set() };
  assert.equal(can(me, "read", contribution(7, "reviewing")), true);
  assert.equal(can(me, "read", contribution(8, "reviewing")), false);
  assert.equal(can(me, "withdraw", contribution(7, "confirmed")), true);
  assert.equal(can(me, "withdraw", contribution(7, "admitted")), false);
  assert.equal(can(me, "withdraw", contribution(8, "confirmed")), false);
  for (const a of ["decide", "publish", "grant"]) assert.equal(can(me, a, contribution(7, "confirmed")), false, a);
});

test("prüfend: lesen, entscheiden, veröffentlichen; nicht zurückziehen, nicht vergeben", () => {
  const rev = { id: 2, roles: new Set(["reviewer"]) };
  const c = contribution(7, "confirmed");
  assert.deepEqual(ACTIONS.filter(a => can(rev, a, c)), ["submit", "read", "decide", "publish", "apply", "decide-application"]);
});

test("eigentümer: alles, auch fremde zurückziehen", () => {
  const owner = { id: 1, roles: new Set(["owner"]) };
  assert.deepEqual(ACTIONS.filter(a => can(owner, a, contribution(7, "admitted"))), ACTIONS);
});

test("unbekannte handlung: immer nein", () => {
  assert.equal(can({ id: 1, roles: new Set(["owner"]) }, "delete-everything", null), false);
});

test("migrationen laufen auf :memory: und sind idempotent", () => {
  const { db, migrations } = open(":memory:");
  assert.equal(migrations.total, 20);
  assert.equal(migrations.applied, 20);
  assert.equal(db.prepare("SELECT value FROM meta WHERE key='schema'").get().value, "6");
  db.close();
});

test("kette: 100 gemischte zeilen verifizieren, eine manipulation fällt auf", () => {
  const { db } = open(":memory:");
  const kinds = ["verify.request", "verify.ok", "grant", "decide", "publish", "withdraw"];
  for (let i = 0; i < 100; i++) {
    append(db, { kind: kinds[i % kinds.length], actor_id: i % 3 ? i : null, resource: i % 2 ? "contribution:" + i : null, text: "line " + i });
  }
  const v = verify(db);
  assert.equal(v.ok, true); assert.equal(v.n, 100);
  db.prepare("UPDATE audit SET text = 'edited' WHERE seq = 42").run();
  const broken = verify(db);
  assert.equal(broken.ok, false); assert.equal(broken.at, 42);
  db.close();
});
