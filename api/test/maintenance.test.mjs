// Gate Phase 7: die Frist greift genau dort, wo sie soll, und nirgends sonst.
import { test } from "node:test";
import assert from "node:assert/strict";
import { open } from "../db.mjs";
import { purge, exportActor } from "../maintenance.mjs";

const iso = d => new Date(d).toISOString();
const OLD = "2026-08-01T00:00:00.000Z", NEW = "2026-09-07T00:00:00.000Z", NOW = new Date("2026-09-08T03:10:00.000Z");

test("purge: alt und unbestätigt geht, alles andere bleibt", () => {
  const { db } = open(":memory:");
  const ins = db.prepare("INSERT INTO actors(kind,email,name,created) VALUES ('email',?,?,?)");
  const a1 = ins.run("old-orphan@x.ch", "A", OLD).lastInsertRowid;      // weg
  const a2 = ins.run("new-orphan@x.ch", "B", NEW).lastInsertRowid;      // bleibt (zu jung)
  const a3 = ins.run("with-contrib@x.ch", "C", OLD).lastInsertRowid;    // bleibt (hat bestätigten Beitrag)
  const a4 = ins.run("with-role@x.ch", "D", OLD).lastInsertRowid;       // bleibt (Rolle)
  db.prepare("INSERT INTO roles(actor_id, role, granted) VALUES (?, 'reviewer', ?)").run(a4, OLD);
  const c = db.prepare("INSERT INTO contributions(kind,status,actor_id,title,area,summary,created) VALUES ('module',?,?,?,?,?,?)");
  c.run("received", a3, "old unconfirmed", "other", "x", OLD);          // weg
  c.run("confirmed", a3, "old confirmed", "other", "x", OLD);           // bleibt
  c.run("received", a3, "new unconfirmed", "other", "x", NEW);          // bleibt
  db.prepare("INSERT INTO verifications(email, token_hash, created, expires, used) VALUES (?,?,?,?,?)").run("z@x.ch", "h1", OLD, OLD, OLD);   // weg
  db.prepare("INSERT INTO verifications(email, token_hash, created, expires, used) VALUES (?,?,?,?,NULL)").run("z@x.ch", "h2", NEW, iso(NOW.getTime() + 3600e3)); // bleibt
  db.prepare("INSERT INTO actor_tokens(actor_id, token_hash, created, expires) VALUES (?,?,?,?)").run(a3, "t1", OLD, OLD);   // weg
  db.prepare("INSERT INTO actor_tokens(actor_id, token_hash, created, expires) VALUES (?,?,?,?)").run(a3, "t2", NEW, iso(NOW.getTime() + 86400e3)); // bleibt
  db.prepare("INSERT INTO requests(name,email,kind,text,created) VALUES (?,?,?,?,?)").run("Old", "o@x.ch", "module", "old request", "2026-01-01T00:00:00.000Z");   // weg (> 180 d)
  db.prepare("INSERT INTO requests(name,email,kind,text,created) VALUES (?,?,?,?,?)").run("New", "n@x.ch", "module", "new request", NEW);                       // bleibt
  const out = purge(db, NOW);
  assert.deepEqual(out, { contributions: 1, actors: 1, verifications: 1, tokens: 1, requests: 1 });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM actors").get().n, 3);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM contributions").get().n, 2);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit WHERE kind='purge'").get().n, 1);
  assert.deepEqual(purge(db, NOW), { contributions: 0, actors: 0, verifications: 0, tokens: 0, requests: 0 });   // zweiter Lauf: nichts, keine Kettenzeile
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit WHERE kind='purge'").get().n, 1);
  db.close();
});

test("export: nur eigenes, mit kettenzeilen zu den eigenen beiträgen", () => {
  const { db } = open(":memory:");
  const me = db.prepare("INSERT INTO actors(kind,email,name,created) VALUES ('email','me@x.ch','Me',?)").run(NEW).lastInsertRowid;
  const other = db.prepare("INSERT INTO actors(kind,email,name,created) VALUES ('email','o@x.ch','O',?)").run(NEW).lastInsertRowid;
  const cid = db.prepare("INSERT INTO contributions(kind,status,actor_id,title,area,summary,created,files_json) VALUES ('module','confirmed',?,?,?,?,?,?)").run(me, "mine", "other", "x", NEW, '[{"label":"a","url":"https://x"}]').lastInsertRowid;
  db.prepare("INSERT INTO contributions(kind,status,actor_id,title,area,summary,created) VALUES ('module','confirmed',?,?,?,?,?)").run(other, "theirs", "other", "x", NEW);
  db.prepare("INSERT INTO audit(prev,hash,t,kind,actor_id,resource,text) VALUES ('','h',?,?,?,?,?)").run(NEW, "contribution.confirmed", me, "contribution:" + cid, "ok");
  const ex = exportActor(db, { id: me, kind: "email", email: "me@x.ch", name: "Me", created: NEW, roles: new Set() });
  assert.equal(ex.contributions.length, 1); assert.equal(ex.contributions[0].title, "mine"); assert.equal(ex.contributions[0].files[0].url, "https://x");
  assert.equal(ex.audit.length, 1); assert.equal(ex.actor.email, "me@x.ch");
  db.close();
});
