-- 021-file-label.sql — Beschriftung je Datei: ein kurzer Titel, den die Person
-- selbst setzt («CV», «Konzept Waldtag»). Steht auf der öffentlichen Seite im
-- Zahlenband neben den Sprachen an Stelle des Dateinamens (Wunsch des
-- Eigentümers, 2026-09-10). Leer heisst: der Dateiname ohne Endung.
ALTER TABLE files ADD COLUMN label TEXT NOT NULL DEFAULT '';
