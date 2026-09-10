/* Dateien je Konto (2026-09-10): Ablage, Kontingent, Zulassung, Auslieferung.
 *
 * Die Dateien liegen neben der Datenbank unter api/db/files/<konto>/, nicht in
 * ihr — auf dem eigenen Server, mit den Konten zusammen (Wunsch des
 * Eigentümers, 2026-09-10). Jedes Konto hat 400 MB, jede Datei höchstens 50 MB,
 * beides wird hier gezählt und nicht im Browser. Zugelassen ist eine Liste von
 * Endungen; der Typ beim Ausliefern kommt aus dieser Liste, nie aus dem, was
 * der Browser beim Hochladen behauptet hat. Ausgeliefert wird immer als Anhang
 * mit nosniff, damit nichts Hochgeladenes im Ursprung des Hubs als Seite läuft. */
import { createWriteStream, mkdirSync, statSync, unlinkSync, rmSync, existsSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export const QUOTA = 400 * 1024 * 1024;      // je Konto
export const MAX_FILE = 50 * 1024 * 1024;    // je Datei
export const MAX_FILES = 200;                // je Konto, damit eine Liste eine Liste bleibt

// Endung → Typ beim Ausliefern. SVG fehlt mit Absicht: es kann Skript tragen.
export const TYPES = {
  pdf: "application/pdf",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  md: "text/markdown; charset=utf-8", txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  zip: "application/zip",
};

// Dateiname: nur das Blatt, keine Pfade, keine Steuerzeichen, höchstens 120 Zeichen.
export function safeName(name) {
  let n = String(name || "").split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, "").trim();
  n = n.replace(/\s+/g, " ").slice(0, 120);
  if (!n || n === "." || n === "..") return "";
  return n;
}
export function extOf(name) { const m = /\.([a-z0-9]{1,8})$/i.exec(name); return m ? m[1].toLowerCase() : ""; }

// Vorprüfung vor dem ersten Byte. Grössen aus Content-Length, das Zählen beim
// Empfang prüft sie ein zweites Mal.
export function checkUpload({ name, size, used, count }) {
  const n = safeName(name);
  if (!n) return { ok: false, status: 400, error: "a file name is needed" };
  const ext = extOf(n);
  if (!TYPES[ext]) return { ok: false, status: 415, error: "this kind of file is not accepted (" + Object.keys(TYPES).join(", ") + ")" };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, status: 411, error: "content-length is needed" };
  if (size > MAX_FILE) return { ok: false, status: 413, error: "a file may have up to 50 MB" };
  if (used + size > QUOTA) return { ok: false, status: 413, error: "this would exceed the 400 MB of your account (" + fmt(used) + " used)" };
  if (count >= MAX_FILES) return { ok: false, status: 409, error: "up to " + MAX_FILES + " files per account" };
  return { ok: true, name: n, ext, type: TYPES[ext] };
}

export function fmt(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1) + " MB";
  if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
  return bytes + " B";
}

export function dirFor(root, actorId) { return join(root, "files", String(actorId)); }
export function pathFor(root, row) { return join(dirFor(root, row.actor_id), row.id + "." + row.ext); }

export function usedBytes(db, actorId) {
  return db.prepare("SELECT COALESCE(SUM(size), 0) AS n FROM files WHERE actor_id = ?").get(actorId).n;
}
export function listFiles(db, actorId) {
  return db.prepare("SELECT id, name, ext, type, size, public, created, sha256, label FROM files WHERE actor_id = ? ORDER BY created DESC, id DESC").all(actorId)
    .map(r => ({ id: r.id, name: r.name, type: r.type, size: r.size, public: !!r.public, created: r.created, sha256: r.sha256, label: r.label || "" }));
}
export function publicFiles(db, actorId) {
  return db.prepare("SELECT id, name, size, type, created, label FROM files WHERE actor_id = ? AND public = 1 ORDER BY created DESC, id DESC").all(actorId)
    .map(r => ({ id: r.id, name: r.name, size: r.size, type: r.type, created: r.created, label: r.label || "" }));
}
export function fileRow(db, actorId, id) {
  return db.prepare("SELECT * FROM files WHERE actor_id = ? AND id = ?").get(actorId, Number(id)) || null;
}

// Empfang: der Strom geht in eine Nebendatei, Bytes und Prüfsumme werden gezählt,
// über der Grenze wird abgebrochen und nichts behalten. Erst am Ende wird die
// Nebendatei an ihren Platz gelegt.
export function receive(req, dest, max) {
  return new Promise((resolve, reject) => {
    mkdirSync(join(dest, ".."), { recursive: true });
    const tmp = dest + ".part";
    const out = createWriteStream(tmp, { flags: "wx", mode: 0o600 });
    const hash = createHash("sha256");
    let size = 0, done = false;
    const fail = (status, msg) => { if (done) return; done = true; out.destroy(); try { unlinkSync(tmp); } catch {} req.resume(); reject(Object.assign(new Error(msg), { status })); };
    req.on("data", c => { if (done) return; size += c.length; if (size > max) return fail(413, "too large"); hash.update(c); if (!out.write(c)) { req.pause(); out.once("drain", () => req.resume()); } });
    req.on("end", () => { if (done) return; done = true; out.end(() => { try { renameSync(tmp, dest); resolve({ size, sha256: hash.digest("hex") }); } catch (e) { try { unlinkSync(tmp); } catch {} reject(Object.assign(new Error("could not store the file"), { status: 500 })); } }); });
    req.on("error", () => fail(400, "read error"));
    out.on("error", () => fail(500, "could not store the file"));
  });
}

export function removeFile(db, root, row) {
  db.prepare("DELETE FROM files WHERE id = ?").run(row.id);
  try { unlinkSync(pathFor(root, row)); } catch {}
}
// Beim Löschen des Kontos: Zeilen und Ordner.
export function removeAll(db, root, actorId) {
  db.prepare("DELETE FROM files WHERE actor_id = ?").run(actorId);
  const d = dirFor(root, actorId); if (existsSync(d)) rmSync(d, { recursive: true, force: true });
}
export function sizeOnDisk(root, row) { try { return statSync(pathFor(root, row)).size; } catch { return null; } }
