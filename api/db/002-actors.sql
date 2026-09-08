-- 002-actors.sql — Akteure, Rollen, Kette, Bestätigungen, Zugangsmarken.
-- docs/contributions.md, Abschnitt Rollen. Alles Weitere in Phase 3.
CREATE TABLE IF NOT EXISTS actors(
  id      INTEGER PRIMARY KEY,
  kind    TEXT NOT NULL CHECK(kind IN ('email','service','account')),
  email   TEXT UNIQUE,                 -- kleingeschrieben; NULL bei service
  name    TEXT,
  org_id  INTEGER,                     -- wartet auf die Rolle school
  created TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roles(
  actor_id   INTEGER NOT NULL REFERENCES actors(id),
  role       TEXT NOT NULL CHECK(role IN ('submitter','reviewer','owner','editor','school','teacher','parent','learner')),
  org_id     INTEGER,
  granted_by INTEGER REFERENCES actors(id),
  granted    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS roles_uq ON roles(actor_id, role, IFNULL(org_id, 0));
-- Die Kette des Servers über seine eigenen Handlungen. Sie ersetzt nicht die
-- Ketten der Nutzer (Architekturentscheid 4), sie belegt Entscheide.
CREATE TABLE IF NOT EXISTS audit(
  seq      INTEGER PRIMARY KEY AUTOINCREMENT,
  prev     TEXT NOT NULL,
  hash     TEXT NOT NULL UNIQUE,
  t        TEXT NOT NULL,
  kind     TEXT NOT NULL,
  actor_id INTEGER,
  resource TEXT,
  text     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS verifications(
  id         INTEGER PRIMARY KEY,
  email      TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created    TEXT NOT NULL,
  expires    TEXT NOT NULL,
  used       TEXT
);
CREATE TABLE IF NOT EXISTS actor_tokens(
  id         INTEGER PRIMARY KEY,
  actor_id   INTEGER NOT NULL REFERENCES actors(id),
  token_hash TEXT NOT NULL UNIQUE,
  created    TEXT NOT NULL,
  expires    TEXT NOT NULL,
  last_used  TEXT
);
INSERT OR REPLACE INTO meta(key, value, updated) VALUES ('schema', '2', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
