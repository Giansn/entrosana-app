-- 006-publication-gate.sql — angenommen ist ein Urteil, veröffentlicht eine
-- eigene Handlung. Dazu die Wahl der einreichenden Person, ob ein
-- veröffentlichtes Modul beim Löschen ihrer Daten stehen bleibt.
-- SQLite kann eine CHECK-Klausel nicht erweitern: Tabelle neu aufbauen.
CREATE TABLE contributions_v2(
  id           INTEGER PRIMARY KEY,
  kind         TEXT NOT NULL CHECK(kind IN ('module')),
  status       TEXT NOT NULL CHECK(status IN ('received','confirmed','reviewing','admitted','published','rejected','withdrawn')),
  actor_id     INTEGER NOT NULL REFERENCES actors(id),
  org_id       INTEGER,
  title        TEXT NOT NULL,
  area         TEXT NOT NULL CHECK(area IN ('social','nature-based','technical','other')),
  summary      TEXT NOT NULL,
  files_json   TEXT NOT NULL DEFAULT '[]',
  trail_md     TEXT NOT NULL DEFAULT '',
  trail_json   TEXT NOT NULL DEFAULT '[]',
  trail_ok     INTEGER,
  created      TEXT NOT NULL,
  confirmed    TEXT,
  decided      TEXT,
  decided_by   INTEGER REFERENCES actors(id),
  reason       TEXT,
  slug         TEXT,
  attribution  TEXT NOT NULL DEFAULT 'remove' CHECK(attribution IN ('keep','remove')),
  published    TEXT,
  published_by INTEGER REFERENCES actors(id)
);
INSERT INTO contributions_v2(id,kind,status,actor_id,org_id,title,area,summary,files_json,trail_md,trail_json,trail_ok,created,confirmed,decided,decided_by,reason,slug)
  SELECT id,kind,status,actor_id,org_id,title,area,summary,files_json,trail_md,trail_json,trail_ok,created,confirmed,decided,decided_by,reason,slug FROM contributions;
DROP TABLE contributions;
ALTER TABLE contributions_v2 RENAME TO contributions;
CREATE INDEX IF NOT EXISTS contributions_status ON contributions(status, created);
CREATE INDEX IF NOT EXISTS contributions_actor  ON contributions(actor_id);
INSERT OR REPLACE INTO meta(key, value, updated) VALUES ('schema', '6', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
