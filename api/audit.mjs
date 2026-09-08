// audit.mjs — die Kette des Servers. Jede Zeile trägt den Hash der vorherigen;
// verify() rechnet alles nach. Was hier steht, sind Handlungen des Servers und
// seiner Akteure, nicht die Aufzeichnungen der Nutzer.
import { createHash } from "node:crypto";

export function payload(r) {
  return [r.t, r.kind, r.actor_id ?? "", r.resource ?? "", r.text].join("|");
}
const sha = s => createHash("sha256").update(s).digest("hex");

export function append(db, { kind, actor_id = null, resource = null, text }) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const last = db.prepare("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1").get();
    const prev = last ? last.hash : "";
    const r = { t: new Date().toISOString(), kind, actor_id, resource, text };
    const hash = sha(prev + "|" + payload(r));
    db.prepare("INSERT INTO audit(prev, hash, t, kind, actor_id, resource, text) VALUES (?,?,?,?,?,?,?)")
      .run(prev, hash, r.t, kind, actor_id, resource, text);
    db.exec("COMMIT");
    return { ...r, prev, hash };
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}

export function verify(db) {
  let prev = "", n = 0;
  for (const r of db.prepare("SELECT * FROM audit ORDER BY seq").all()) {
    if (r.prev !== prev) return { ok: false, at: r.seq, why: "prev mismatch" };
    if (sha(prev + "|" + payload(r)) !== r.hash) return { ok: false, at: r.seq, why: "hash mismatch" };
    prev = r.hash; n++;
  }
  return { ok: true, n };
}
