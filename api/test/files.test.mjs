import { test } from "node:test";
import assert from "node:assert/strict";
import { open } from "../db.mjs";
import { checkUpload, safeName, extOf, QUOTA, MAX_FILE, MAX_FILES, fmt, usedBytes, listFiles, publicFiles } from "../files.mjs";

test("dateien: name, endung, grenzen", () => {
  assert.equal(safeName("../../etc/passwd"), "passwd");
  assert.equal(safeName("C:\\Users\\x\\Lebenslauf 2026.pdf"), "Lebenslauf 2026.pdf");
  assert.equal(safeName("  a\u0000b.txt "), "ab.txt");
  assert.equal(safeName(".."), "");
  assert.equal(extOf("Konzept.Final.DOCX"), "docx");

  assert.equal(checkUpload({ name: "cv.pdf", size: 1000, used: 0, count: 0 }).ok, true);
  assert.equal(checkUpload({ name: "logo.svg", size: 1000, used: 0, count: 0 }).status, 415);
  assert.equal(checkUpload({ name: "run.exe", size: 1000, used: 0, count: 0 }).status, 415);
  assert.equal(checkUpload({ name: "big.zip", size: MAX_FILE + 1, used: 0, count: 0 }).status, 413);
  assert.equal(checkUpload({ name: "ok.zip", size: MAX_FILE, used: 0, count: 0 }).ok, true);
  assert.equal(checkUpload({ name: "last.pdf", size: 10, used: QUOTA - 5, count: 0 }).status, 413);
  assert.equal(checkUpload({ name: "last.pdf", size: 5, used: QUOTA - 5, count: 0 }).ok, true);
  assert.equal(checkUpload({ name: "n.pdf", size: 5, used: 0, count: MAX_FILES }).status, 409);
  assert.equal(checkUpload({ name: "n.pdf", size: 0, used: 0, count: 0 }).status, 411);
  assert.equal(fmt(400 * 1024 * 1024), "400 MB");
  assert.equal(fmt(1536), "2 KB");
});

test("dateien: zeilen, kontingent, öffentliche auswahl", () => {
  const { db, migrations } = open(":memory:");
  assert.equal(migrations.total, 22);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO actors(kind, email, name, created) VALUES ('email', 'a@example.org', 'A', ?)").run(now);
  const id = db.prepare("SELECT id FROM actors WHERE email = 'a@example.org'").get().id;
  const ins = db.prepare("INSERT INTO files(actor_id, name, ext, type, size, sha256, public, created) VALUES (?,?,?,?,?,?,?,?)");
  ins.run(id, "cv.pdf", "pdf", "application/pdf", 1200, "x", 1, now);
  ins.run(id, "notes.md", "md", "text/markdown; charset=utf-8", 300, "y", 0, now);
  assert.equal(usedBytes(db, id), 1500);
  assert.equal(listFiles(db, id).length, 2);
  assert.deepEqual(publicFiles(db, id).map(f => f.name), ["cv.pdf"]);
  assert.equal(listFiles(db, id)[0].label, "");
  db.prepare("UPDATE files SET label = 'CV' WHERE name = 'cv.pdf'").run();
  assert.deepEqual(publicFiles(db, id).map(f => f.label), ["CV"]);
  assert.equal(usedBytes(db, id + 1), 0);
});
