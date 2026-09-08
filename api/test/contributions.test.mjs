// Gate Phase 3: die sechs ungültigen Eingaben werden mit Begründung abgewiesen,
// die Honigfalle erkannt, die Zustandsmaschine hält nur die erlaubten Wege.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, actionFor, publishChecks } from "../contributions.mjs";

const good = { email: "a@b.ch", name: "Anna B.", title: "A module", area: "social", summary: "What it does.", trail: "", files: [{ label: "Slides", url: "https://example.org/s.pdf" }] };

test("gültige eingabe geht durch, normalisiert", () => {
  const v = validate(good);
  assert.equal(v.ok, true); assert.equal(v.value.email, "a@b.ch"); assert.equal(v.value.files.length, 1); assert.equal(v.value.org_id, null);
});

test("sieben ungültige eingaben, je mit begründung", () => {
  const cases = [
    [{ ...good, email: undefined },            /email/],
    [{ ...good, email: "not-an-address" },     /email/],
    [{ ...good, name: "" },                    /name missing/],
    [{ ...good, title: "" },                   /title/],
    [{ ...good, area: "religion" },            /area/],
    [{ ...good, summary: "x".repeat(4001) },   /summary longer/],
    [{ ...good, files: [{ label: "x", url: "http://insecure.example" }] }, /https/],
  ];
  for (const [body, re] of cases) {
    const v = validate(body);
    assert.equal(v.ok, false, JSON.stringify(body).slice(0, 60));
    assert.match(v.error, re);
  }
});

test("honigfalle: kein fehler, sondern spam", () => {
  const v = validate({ ...good, website: "http://spam" });
  assert.equal(v.ok, false); assert.equal(v.spam, true); assert.equal(v.error, undefined);
});

test("zustandsmaschine", () => {
  assert.equal(actionFor("received", "confirmed"), null);       // nur über die Bestätigung
  assert.equal(actionFor("confirmed", "reviewing"), "decide");
  assert.equal(actionFor("confirmed", "admitted"), null);       // nicht überspringen
  assert.equal(actionFor("reviewing", "admitted"), "decide");
  assert.equal(actionFor("reviewing", "rejected"), "decide");
  for (const s of ["received", "confirmed", "reviewing"]) assert.equal(actionFor(s, "withdrawn"), "withdraw");
  assert.equal(actionFor("admitted", "withdrawn"), null);
  assert.equal(actionFor("rejected", "reviewing"), null);
  assert.equal(actionFor("admitted", "published"), "publish");     // das Tor
  assert.equal(actionFor("published", "admitted"), "publish");     // zurücknehmen
  assert.equal(actionFor("reviewing", "published"), null);         // nicht ohne Annahme
  assert.equal(actionFor("published", "rejected"), null);
});

test("veröffentlichung: prüfungen benennen jeden mangel", () => {
  const ok = { decided_by: 1, trail_ok: 1, area: "social", title: "A module", summary: "x".repeat(40), files_json: "[]" };
  assert.deepEqual(publishChecks(ok, { name: "Anna", roles: new Set(["contributor"]) }), []);
  assert.deepEqual(publishChecks(ok, { name: "Anna" }), ["submitter not approved as contributor"]);
  const bad = publishChecks({ ...ok, trail_ok: 0, summary: "short", files_json: JSON.stringify([{ url: "http://x" }]) }, { name: "" });
  assert.equal(bad.length, 5);
  assert.ok(bad.some(x => /not approved/.test(x)) && bad.some(x => /no name/.test(x)) && bad.some(x => /trail/.test(x)) && bad.some(x => /40/.test(x)) && bad.some(x => /https/.test(x)));
  assert.deepEqual(publishChecks({ ...ok, decided_by: null }, { name: "Anna", roles: new Set(["owner"]) }), ["no admission on record"]);
});

test("attribution: keep nur ausdrücklich, sonst remove", () => {
  assert.equal(validate(good).value.attribution, "remove");
  assert.equal(validate({ ...good, attribution: "keep" }).value.attribution, "keep");
  assert.equal(validate({ ...good, attribution: "anything" }).value.attribution, "remove");
});
