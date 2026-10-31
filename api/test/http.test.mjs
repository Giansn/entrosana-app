// http.test.mjs — Export und Löschung über HTTP gegen einen echten server.mjs
// (2026-10-31, Gap 1.6/1.7/5.3). Eigene Datenbank in einem Wegwerf-Ordner, Mail
// auf /bin/true, Dienst-Marke unter HOME im Wegwerf-Ordner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "../db.mjs";
import { issueToken } from "../auth.mjs";

const SERVER = join(dirname(fileURLToPath(import.meta.url)), "..", "server.mjs");
const NOW = new Date().toISOString();

async function up(dir, port) {
  const child = spawn(process.execPath, [SERVER], { stdio: "ignore", env: { ...process.env, HOME: dir, PORT: String(port),
    DB_PATH: join(dir, "hub.sqlite"), LOG: join(dir, "api.log"), MAIL_SEND: "/bin/true", CATALOGUE: join(dir, "catalogue.js"),
    CATALOGUE_BACKUPS: join(dir, "bak") } });
  for (let i = 0; i < 100; i++) {
    try { await fetch(`http://127.0.0.1:${port}/api/me`); return child; } catch { await new Promise(r => setTimeout(r, 50)); }
  }
  child.kill(); throw new Error("server did not start");
}

test("export enthält profil, bild, dateien, punkte und module; löschung räumt punkte und mitarbeit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "entrosana-http-"));
  let { db } = open(join(dir, "hub.sqlite"));
  const me = db.prepare(`INSERT INTO actors(kind,email,name,created,bio,place,contact_email,langs,avatar,avatar_type,avatar_updated)
    VALUES ('email','me@x.ch','Me',?,'lange bio','Basel','kontakt@x.ch','de,fr',?, 'image/png', ?)`).run(NOW, Buffer.from([1, 2, 3]), NOW).lastInsertRowid;
  const other = db.prepare("INSERT INTO actors(kind,email,name,created) VALUES ('email','o@x.ch','O',?)").run(NOW).lastInsertRowid;
  db.prepare("INSERT INTO files(actor_id,name,ext,type,size,sha256,public,created,label) VALUES (?,?,?,?,?,?,?,?,?)").run(me, "cv.pdf", "pdf", "application/pdf", 3, "abc", 1, NOW, "CV");
  for (const [slug, a] of [["fremd", other], ["fremd", me]]) db.prepare("INSERT INTO module_contributors(slug,actor_id,added) VALUES (?,?,?)").run(slug, a, NOW);
  for (const [slug, a] of [["fremd", me], ["fremd", other], ["anderes", me]]) db.prepare("INSERT INTO points(slug,actor_id,created) VALUES (?,?,?)").run(slug, a, NOW);
  const { token } = issueToken(db, me);
  db.close();

  const port = 40000 + Math.floor(Math.random() * 20000);
  const child = await up(dir, port);
  try {
    const auth = { Authorization: "Bearer " + token };
    const r = await fetch(`http://127.0.0.1:${port}/api/me/export`, { headers: auth });
    assert.equal(r.status, 200);
    const ex = await r.json();
    assert.equal(ex.actor.bio, "lange bio"); assert.equal(ex.actor.place, "Basel"); assert.equal(ex.actor.contact_email, "kontakt@x.ch");
    assert.deepEqual(ex.actor.langs, ["de", "fr"]);
    assert.equal(ex.actor.avatar.type, "image/png"); assert.equal(ex.actor.avatar.base64, Buffer.from([1, 2, 3]).toString("base64"));
    assert.equal(ex.files.length, 1); assert.equal(ex.files[0].label, "CV"); assert.equal(ex.files[0].download, `/api/files/${me}/1/cv.pdf`);
    assert.deepEqual(ex.points.map(p => p.slug).sort(), ["anderes", "fremd"]);
    assert.deepEqual(ex.modules.map(m => m.slug), ["fremd"]);

    const d = await fetch(`http://127.0.0.1:${port}/api/me`, { method: "DELETE", headers: { ...auth, "Content-Type": "application/json" }, body: "{}" });
    assert.equal(d.status, 200);
  } finally { child.kill(); }

  ({ db } = open(join(dir, "hub.sqlite")));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM points WHERE actor_id = ?").get(me).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM module_contributors WHERE actor_id = ?").get(me).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM points WHERE actor_id = ?").get(other).n, 1);         // fremde Punkte bleiben
  assert.equal(db.prepare("SELECT COUNT(*) n FROM module_contributors WHERE actor_id = ?").get(other).n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM files WHERE actor_id = ?").get(me).n, 0);
  const a = db.prepare("SELECT email, name, bio, place, contact_email, avatar FROM actors WHERE id = ?").get(me);
  assert.deepEqual({ ...a }, { email: null, name: "(erased)", bio: null, place: null, contact_email: null, avatar: null });
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
