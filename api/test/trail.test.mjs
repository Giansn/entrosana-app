// Gate Phase 4: der mitgeschickte Trail verifiziert serverseitig gegen die Kette.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifyTrail, recordPayload } from "../contributions.mjs";

const sha = s => createHash("sha256").update(s).digest("hex");
function device(n, project) {   // baut eine Kette wie app.js
  const recs = [], chain = [];
  for (let i = 0; i < n; i++) {
    const r = { t: "2026-09-08T17:00:0" + (i % 10) + ".000Z", kind: i % 2 ? "done" : "note", project: i % 3 ? project : "other/000", text: "line " + i };
    r.h = sha((i ? chain[i - 1] : "") + "|" + recordPayload(r)); chain.push(r.h); recs.push({ i, ...r });
  }
  return { chain, records: recs.filter(r => r.project === project) };
}

test("kette stimmt: nur die zeilen des projekts, mit stelle i", () => {
  const d = device(12, "contribute/000");
  const v = verifyTrail(d.chain, d.records);
  assert.equal(v.ok, true); assert.equal(v.chain, 12); assert.equal(v.n, d.records.length);
});
test("eine geänderte zeile fällt auf", () => {
  const d = device(12, "contribute/000"); d.records[1].text = "edited";
  assert.match(verifyTrail(d.chain, d.records).why, /hash mismatch/);
});
test("eine zeile, die nicht in der kette steht, fällt auf", () => {
  const d = device(12, "contribute/000"); d.records[0].h = "0".repeat(64);
  assert.match(verifyTrail(d.chain, d.records).why, /not in chain/);
});
test("stelle ausserhalb der kette, fremde eingaben", () => {
  const d = device(5, "contribute/000"); d.records[0].i = 99;
  assert.match(verifyTrail(d.chain, d.records).why, /outside chain/);
  assert.equal(verifyTrail("x", []).ok, false);
  assert.match(verifyTrail(["nothex"], []).why, /sha256 hex/);
  assert.equal(verifyTrail([], []).ok, true);
});
