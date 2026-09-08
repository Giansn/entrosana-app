-- 003-contributions.sql — Beiträge. Zustände und Regeln: docs/contributions.md.
CREATE TABLE IF NOT EXISTS contributions(
  id         INTEGER PRIMARY KEY,
  kind       TEXT NOT NULL CHECK(kind IN ('module')),
  status     TEXT NOT NULL CHECK(status IN ('received','confirmed','reviewing','admitted','rejected','withdrawn')),
  actor_id   INTEGER NOT NULL REFERENCES actors(id),
  org_id     INTEGER,
  title      TEXT NOT NULL,
  area       TEXT NOT NULL CHECK(area IN ('social','nature-based','technical','other')),
  summary    TEXT NOT NULL,
  files_json TEXT NOT NULL DEFAULT '[]',
  trail_md   TEXT NOT NULL DEFAULT '',
  created    TEXT NOT NULL,
  confirmed  TEXT,
  decided    TEXT,
  decided_by INTEGER REFERENCES actors(id),
  reason     TEXT
);
CREATE INDEX IF NOT EXISTS contributions_status ON contributions(status, created);
CREATE INDEX IF NOT EXISTS contributions_actor  ON contributions(actor_id);
INSERT OR REPLACE INTO meta(key, value, updated) VALUES ('schema', '3', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
