-- 020-files.sql — Dateien je Konto: Lebensläufe, Rezensionen, Konzepte,
-- Projektunterlagen, ohne fremdes Hosting. Die Bytes liegen neben der
-- Datenbank unter api/db/files/<konto>/<id>.<endung>; hier steht nur, was
-- es ist, wie gross, wem es gehört und ob es öffentlich ist. 400 MB je Konto,
-- 50 MB je Datei, gezählt in api/files.mjs (Wunsch des Eigentümers, 2026-09-10).
CREATE TABLE IF NOT EXISTS files(
  id        INTEGER PRIMARY KEY,
  actor_id  INTEGER NOT NULL REFERENCES actors(id),
  name      TEXT NOT NULL,
  ext       TEXT NOT NULL,
  type      TEXT NOT NULL,
  size      INTEGER NOT NULL,
  sha256    TEXT NOT NULL,
  public    INTEGER NOT NULL DEFAULT 0,
  created   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS files_actor ON files(actor_id, created);
