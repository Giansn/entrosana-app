import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, LANG_CODES, MAX_LANGS } from "../languages.mjs";
test("sprachen: iso 639-1 vollständig genug, eindeutig, mit es und gsw", () => {
  assert.ok(LANGUAGES.length >= 180, "mindestens 180 Sprachen, sind " + LANGUAGES.length);
  assert.equal(LANG_CODES.size, LANGUAGES.length);
  for (const [c, en, own] of LANGUAGES) { assert.match(c, /^[a-z]{2,3}$/); assert.ok(en.length > 1 && own.length > 0, c); }
  for (const c of ["es", "de", "fr", "it", "en", "gsw", "rm", "zh", "ar"]) assert.ok(LANG_CODES.has(c), c);
  assert.equal(MAX_LANGS, 12);
});
