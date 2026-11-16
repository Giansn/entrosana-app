// http.test.mjs — Export und Löschung über HTTP gegen einen echten server.mjs
// (2026-10-31, Gap 1.6/1.7/5.3). Eigene Datenbank in einem Wegwerf-Ordner, Mail
// auf /bin/true, Dienst-Marke unter HOME im Wegwerf-Ordner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "../db.mjs";
import { issueToken } from "../auth.mjs";

const SERVER = join(dirname(fileURLToPath(import.meta.url)), "..", "server.mjs");
const NOW = new Date().toISOString();

async function up(dir, port, env = {}) {
  const child = spawn(process.execPath, [SERVER], { stdio: "ignore", env: { ...process.env, HOME: dir, PORT: String(port),
    DB_PATH: join(dir, "hub.sqlite"), LOG: join(dir, "api.log"), MAIL_SEND: "/bin/true", CATALOGUE: join(dir, "catalogue.js"),
    CATALOGUE_BACKUPS: join(dir, "bak"), ...env } });
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

test("ein vorschlag speichert keine spur, auch wenn eine alte seite sie mitschickt (2026-11-01)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "entrosana-http-"));
  open(join(dir, "hub.sqlite")).db.close();
  const port = 40000 + Math.floor(Math.random() * 20000);
  const child = await up(dir, port);
  try {
    const body = { email: "neu@x.ch", name: "Neu", title: "A module", area: "social", summary: "What it does.", files: [],
                   trail: "# alte spur", records: [{ i: 0, t: NOW, kind: "view", text: "Page opened — /x", project: null, h: "ab" }], chain: ["ab"] };
    const r = await fetch(`http://127.0.0.1:${port}/api/contributions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(r.status, 202);
    assert.equal((await r.json()).trail_ok, null);
  } finally { child.kill(); }
  const { db } = open(join(dir, "hub.sqlite"));
  const c = db.prepare("SELECT trail_md, trail_json, trail_ok FROM contributions").get();
  assert.equal(c.trail_md, ""); assert.equal(c.trail_json, "[]"); assert.equal(c.trail_ok, null);
  db.close(); rmSync(dir, { recursive: true, force: true });
});

// Das Formular von entrosana.com (2026-11-16): ein Platzhalter-Skript fängt, was sonst per SMTP hinausginge.
test("kontaktformular: brief an info@ mit antwort-an, nichts gespeichert, honigfalle, pflichtfelder, grenze", async () => {
  const dir = mkdtempSync(join(tmpdir(), "entrosana-http-"));
  open(join(dir, "hub.sqlite")).db.close();
  const stub = join(dir, "mail-stub.py"), out = join(dir, "mails.jsonl");
  writeFileSync(stub, 'import os, sys\nwith open(os.environ["MAIL_OUT"], "a", encoding="utf-8") as f:\n    f.write(sys.stdin.read().replace("\\n", " ") + "\\n")\n');
  const port = 40000 + Math.floor(Math.random() * 20000);
  const child = await up(dir, port, { MAIL_SEND: stub, MAIL_OUT: out, INFO_INBOX: "info@example.org" });
  const url = `http://127.0.0.1:${port}/api/contact`;
  const post = body => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const mails = () => existsSync(out) ? readFileSync(out, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)) : [];
  const ok = { name: "Anna Muster", email: "Anna@Example.org", org: "Schule Belp", interest: "Individual offer · organisation, group or family", msg: "Wir sind zwölf.\nGeht das?" };
  try {
    let r = await post(ok);
    assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true });
    let m = mails();
    assert.equal(m.length, 1);
    assert.equal(m[0].to, "info@example.org"); assert.equal(m[0].reply_to, "anna@example.org");
    assert.equal(m[0].subject, "Access request: Individual offer · organisation, group or family");
    assert.ok(m[0].text.startsWith("Name: Anna Muster\nOrganisation: Schule Belp\nEmail: anna@example.org\nInterested in: Individual offer"));
    assert.ok(m[0].text.includes("Wir sind zwölf.\nGeht das?"));

    r = await post({ ...ok, interest: "x\r\nBcc: fremd@example.org", org: "" });   // Betreff bleibt einzeilig
    assert.equal(r.status, 200);
    m = mails();
    assert.equal(m.length, 2); assert.equal(m[1].subject, "Access request: x Bcc: fremd@example.org"); assert.ok(m[1].text.includes("Organisation: —\n"));

    r = await post({ ...ok, website: "http://spam.example" });                      // Honigfalle: Antwort wie gesendet, kein Brief
    assert.equal(r.status, 200); assert.equal(mails().length, 2);

    assert.equal((await post({ ...ok, name: "" })).status, 400);
    assert.equal((await post({ ...ok, email: "keine-adresse" })).status, 400);
    assert.equal((await post({ ...ok, interest: " " })).status, 400);
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(ok) })).status, 415);
    assert.equal((await fetch(url)).status, 405);
    assert.equal(mails().length, 2);

    for (let i = 0; i < 3; i++) assert.equal((await post(ok)).status, 200);          // fünf je Stunde, die sechste wird abgewiesen
    r = await post(ok);
    assert.equal(r.status, 429); assert.equal(mails().length, 5);
  } finally { child.kill(); }
  const { db } = open(join(dir, "hub.sqlite"));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM requests").get().n, 0);           // nichts gespeichert
  const lines = db.prepare("SELECT text FROM audit WHERE kind = 'contact.mail'").all();
  assert.equal(lines.length, 5); assert.ok(lines.every(l => l.text === "website form relayed to the info inbox"));   // ohne Namen, Adresse, Text
  db.close(); rmSync(dir, { recursive: true, force: true });
});

test("kontaktformular: scheitert der versand, sagt die antwort es und die kette hält es fest", async () => {
  const dir = mkdtempSync(join(tmpdir(), "entrosana-http-"));
  open(join(dir, "hub.sqlite")).db.close();
  const stub = join(dir, "mail-fail.py");
  writeFileSync(stub, 'import sys\nsys.stdin.read()\nprint("send failure: test", file=sys.stderr)\nsys.exit(1)\n');
  const port = 40000 + Math.floor(Math.random() * 20000);
  const child = await up(dir, port, { MAIL_SEND: stub });
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/contact`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Anna Muster", email: "anna@example.org", interest: "Hub · co-created learning" }) });
    assert.equal(r.status, 502); assert.deepEqual(await r.json(), { error: "sending failed" });
  } finally { child.kill(); }
  const { db } = open(join(dir, "hub.sqlite"));
  assert.equal(db.prepare("SELECT text FROM audit WHERE kind = 'contact.mail'").get().text, "website form mail failed: send failure: test");
  db.close(); rmSync(dir, { recursive: true, force: true });
});
