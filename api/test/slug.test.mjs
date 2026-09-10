import { test } from "node:test";
import assert from "node:assert/strict";
import { open } from "../db.mjs";
import { slugify, slugOf, publicProfileBySlug } from "../journal.mjs";

test("profil-adresse: unterstrich, umlaute, gleiche namen, alte bindestrich-form", () => {
  assert.equal(slugify("Gianluca Kühne"), "gianluca_kuehne");
  assert.equal(slugify("  Anna-Lena  Zoë Müller "), "anna_lena_zoe_mueller");
  assert.equal(slugify("Über Wälder & Wiesen!"), "ueber_waelder_wiesen");
  assert.equal(slugify("   "), "");

  const { db } = open(":memory:");
  const now = new Date().toISOString();
  const ins = db.prepare("INSERT INTO actors(kind, email, name, created) VALUES ('email', ?, ?, ?)");
  ins.run("a@example.org", "Anna Meier", now);
  ins.run("b@example.org", "Anna Meier", now);
  const [a, b] = db.prepare("SELECT id, name FROM actors ORDER BY id").all();
  assert.equal(slugOf(db, a), "anna_meier");
  assert.equal(slugOf(db, b), "anna_meier_" + b.id);
  assert.equal(publicProfileBySlug(db, "anna_meier").id, a.id);
  assert.equal(publicProfileBySlug(db, "anna-meier").id, a.id);
  assert.equal(publicProfileBySlug(db, "anna_meier_" + b.id).id, b.id);
  assert.equal(publicProfileBySlug(db, "niemand"), null);
});
