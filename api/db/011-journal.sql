-- 011-journal.sql — das Journal im Profil (Vorbild LearningView, Lernjournal):
-- Einträge einer Person, öffentlich auf ihrer Profilseite, wenn sie es so wählt.
-- Wunsch des Eigentümers, 2026-09-08. Löschung des Kontos nimmt sie mit.
CREATE TABLE IF NOT EXISTS journal(
  id       INTEGER PRIMARY KEY,
  actor_id INTEGER NOT NULL REFERENCES actors(id),
  text     TEXT NOT NULL,
  public   INTEGER NOT NULL DEFAULT 1 CHECK(public IN (0,1)),
  created  TEXT NOT NULL,
  updated  TEXT
);
CREATE INDEX IF NOT EXISTS journal_actor ON journal(actor_id, created);
