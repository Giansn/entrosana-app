-- 014 (2026-09-09): Einladungen. Ein Konto lädt eine Adresse ein; die Mail trägt einen
-- Anmeldelink (sieben Tage gültig). Legt die Adresse ihr Konto an, gilt die Einladung als
-- angenommen. Unbeantwortete Einladungen räumt die Wartung nach 180 Tagen weg.
CREATE TABLE IF NOT EXISTS invites (
  id          INTEGER PRIMARY KEY,
  inviter_id  INTEGER NOT NULL REFERENCES actors(id),
  email       TEXT    NOT NULL,
  message     TEXT,
  created     TEXT    NOT NULL,
  accepted    TEXT,
  accepted_id INTEGER
);
CREATE INDEX IF NOT EXISTS invites_email ON invites(email);
CREATE INDEX IF NOT EXISTS invites_inviter ON invites(inviter_id);
