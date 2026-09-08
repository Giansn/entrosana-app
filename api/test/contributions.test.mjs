// Gate Phase 3: die sechs ungültigen Eingaben werden mit Begründung abgewiesen,
// die Honigfalle erkannt, die Zustandsmaschine hält nur die erlaubten Wege.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, actionFor } from "../contributions.mjs";

const good = { email: "a@b.ch", name: "A", title: "A module", area: "social", summary: "What it does.", trail: "", files: [{ label: "Slides", url: "https://example.org/s.pdf" }] };

test("gültige eingabe geht durch, normalisiert", () => {
  const v = validate(good);
  assert.equal(v.ok, true); assert.equal(v.value.email, "a@b.ch"); assert.equal(v.value.files.length, 1); assert.equal(v.value.org_id, null);
});

test("sechs ungültige eingaben, je mit begründung", () => {
  const cases = [
    [{ ...good, email: undefined },            /email/],
    [{ ...good, email: "not-an-address" },     /email/],
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
});
