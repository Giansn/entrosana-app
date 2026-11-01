// Gate Phase 6: Eintrag anhängen, auswertbar bleiben, für den Editor lesbar
// bleiben, wieder entfernen — und dann Byte für Byte die alte Datei sein.
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "cat-"));
process.env.CATALOGUE_BACKUPS = join(dir, "bak");
const { appendEntry, removeEntry, readCatalogue, entryFor, slugify, ledeOf } = await import("../publish.mjs");
const SRC = new URL("../../assets/catalogue.js", import.meta.url).pathname;
const copy = join(dir, "catalogue.js");
copyFileSync(SRC, copy);
const original = readFileSync(copy, "utf8");
const slugRe = /"slug":\s*"([a-z0-9-]+)"/g;   // dasselbe Muster wie der Editor
const slugs = s => [...s.matchAll(slugRe)].map(m => m[1]);

test("anhängen: auswertbar, im Abschnitt modules, Gleis contributed vorhanden, ein Slug mehr", () => {
  const before = readCatalogue(copy);
  const c = { id: 99, title: "Reading the Forest Floor", area: "nature-based", summary: "Ten minutes of looking down. Then a map of what was found.", files_json: JSON.stringify([{ label: "Sheet", url: "https://example.org/s.pdf" }]), trail_ok: 1 };
  const r = appendEntry("modules", entryFor(c, { name: "Anna Beispiel" }), copy);
  assert.equal(r.slug, "reading-the-forest-floor");
  const after = readCatalogue(copy);
  assert.equal(after.modules.list.length, before.modules.list.length + 1);
  const e = after.modules.list[after.modules.list.length - 1];
  assert.equal(e.by, "Anna Beispiel"); assert.equal(e.track, "contributed"); assert.equal(e.draft, false); assert.equal(e.state, "development");   // seit 2026-09-09: veröffentlicht ist veröffentlicht
  assert.equal(JSON.stringify(e.downloads[0].files[0]), JSON.stringify(["Sheet", "https://example.org/s.pdf"]));   // Werte aus dem Sandkasten, andere Realm
  assert.ok(after.modules.tracks.some(t => t.id === "contributed"));
  assert.equal(after.tools.list.length, before.tools.list.length);
  assert.equal(slugs(readFileSync(copy, "utf8")).length, slugs(original).length + 1);
});

test("doppelter Titel bekommt einen eindeutigen Slug", () => {
  const r = appendEntry("modules", entryFor({ id: 100, title: "Reading the Forest Floor", area: "other", summary: "Again.", files_json: "[]", trail_ok: null }, { name: "B" }), copy);
  assert.equal(r.slug, "reading-the-forest-floor-2");
  assert.equal(readCatalogue(copy).modules.list.filter(e => e.slug.startsWith("reading-the-forest-floor")).length, 2);
});

test("entfernen stellt die Datei wieder her, bis auf das Gleis", () => {
  assert.equal(removeEntry("modules", "reading-the-forest-floor-2", copy).removed, true);
  assert.equal(removeEntry("modules", "reading-the-forest-floor", copy).removed, true);
  const now = readFileSync(copy, "utf8");
  // Das Gleis «contributed» bleibt absichtlich stehen; ohne diese eine Zeile ist alles wie vorher.
  const strip = s => s.replace(/,\n\s*\{"id":"contributed", "name":"Contributed", "short":"contributed"\}/, "");
  assert.equal(strip(now), strip(original));
  assert.equal(readCatalogue(copy).modules.list.length, readCatalogue(SRC).modules.list.length);
});

test("slugify", () => {
  assert.equal(slugify("Über Wälder & Wiesen!"), "uber-walder-wiesen");
  assert.equal(slugify("   "), "contribution");
});

test("Vorspann: erster Satz; zu lang heisst an der Wortgrenze gekürzt, mit «…»", () => {
  assert.equal(ledeOf("Ten minutes of looking down. Then a map."), "Ten minutes of looking down.");
  assert.equal(ledeOf("One line\nover two."), "One line over two.");
  // Der Fall vom 2026-09-09: ein erster Satz über 200 Zeichen endete auf «… CPU and GPU sh».
  const long = "An 11-slide deck on the difference between a dedicated GPU (its own VRAM, reached over PCIe) and unified memory " +
               "(CPU and GPU share one pool): what each looks like in a machine, the two numbers that decide, and the setup each one demands.";
  const l = ledeOf(long);
  assert.ok(l.length <= 200, `länger als 200: ${l.length}`);
  assert.ok(l.endsWith("…"));
  const words = l.slice(0, -1).split(" "), last = words[words.length - 1];
  assert.ok(long.split(/[\s]+/).some(w => w === last || w.replace(/[,;:.]+$/, "") === last), `letztes Wort abgeschnitten: «${last}»`);
  assert.equal(entryFor({ id: 1, title: "T", area: "technical", summary: long, files_json: "[]" }, { name: "N" }).lede, l);
  assert.equal(ledeOf("x".repeat(250)).length, 200);   // ein einziges langes Wort: hart gekürzt, aber markiert
});
