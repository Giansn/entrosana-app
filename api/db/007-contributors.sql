-- 007-contributors.sql — Sammler registrieren sich frei, Beitragende werden
-- freigegeben (Entscheid des Eigentümers, 2026-09-08). Neue Rolle contributor,
-- dazu die Bewerbung als eigene Tabelle. SQLite kann eine CHECK-Klausel nicht
-- erweitern: roles neu aufbauen, der eindeutige Index kommt mit.
CREATE TABLE roles_v2(
  actor_id   INTEGER NOT NULL REFERENCES actors(id),
  role       TEXT NOT NULL CHECK(role IN ('submitter','reviewer','owner','editor','school','teacher','parent','learner','contributor')),
  org_id     INTEGER,
  granted_by INTEGER REFERENCES actors(id),
  granted    TEXT NOT NULL
);
INSERT INTO roles_v2(actor_id, role, org_id, granted_by, granted) SELECT actor_id, role, org_id, granted_by, granted FROM roles;
DROP INDEX IF EXISTS roles_uq;
DROP TABLE roles;
ALTER TABLE roles_v2 RENAME TO roles;
CREATE UNIQUE INDEX IF NOT EXISTS roles_uq ON roles(actor_id, role, IFNULL(org_id, 0));
CREATE TABLE IF NOT EXISTS applications(
  id         INTEGER PRIMARY KEY,
  actor_id   INTEGER NOT NULL REFERENCES actors(id),
  text       TEXT NOT NULL,
  created    TEXT NOT NULL,
  decided    TEXT,
  decided_by INTEGER REFERENCES actors(id),
  outcome    TEXT CHECK(outcome IN ('approved','declined')),
  reason     TEXT
);
CREATE INDEX IF NOT EXISTS applications_open ON applications(actor_id) WHERE decided IS NULL;
