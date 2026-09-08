-- 008-requests.sql — Anfragen (Modul, Track, Werkzeug, Dienst) gehen an
-- info@entrosana.com; hier bleibt der Eingang 180 Tage stehen, damit nichts
-- verloren geht, wenn eine Mail nicht ankommt. Keine Marke, keine Rolle.
CREATE TABLE IF NOT EXISTS requests(
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  email   TEXT NOT NULL,
  org     TEXT,
  kind    TEXT NOT NULL CHECK(kind IN ('module','track','tool','service','other')),
  text    TEXT NOT NULL,
  created TEXT NOT NULL,
  mailed  TEXT
);
