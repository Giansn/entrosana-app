// db.mjs — öffnet die Datenbank und wendet die Migrationen an. Von server.mjs,
// admin.mjs und den Tests gemeinsam benutzt; die Tests öffnen ":memory:".
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DB_DIR = join(HERE, "db");

export function open(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  if (path !== ":memory:") db.exec("PRAGMA journal_mode=WAL;");
  db.exec(`CREATE TABLE IF NOT EXISTS migrations(
    id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied TEXT NOT NULL)`);
  const migrations = migrate(db);
  return { db, migrations };
}

// Jede Datei db/NNN-*.sql genau einmal, in Reihenfolge, je in einer Transaktion.
export function migrate(db) {
  const done = new Set(db.prepare("SELECT name FROM migrations").all().map(r => r.name));
  const files = readdirSync(DB_DIR).filter(f => /^\d{3}[^/]*\.sql$/.test(f)).sort();
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(join(DB_DIR, f), "utf8"));
      db.prepare("INSERT INTO migrations(name, applied) VALUES (?, ?)").run(f, new Date().toISOString());
      db.exec("COMMIT");
      applied++;
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`migration ${f}: ${e.message}`);
    }
  }
  return { total: files.length, applied };
}
