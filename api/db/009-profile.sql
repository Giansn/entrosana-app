-- 009-profile.sql — das Profil: Organisation oder Schule, Rolle, eine Zeile
-- über die Person, Website, Sprachen. Alles freiwillig, alles unter /me
-- änderbar, alles beim Löschen des Kontos weg (Wunsch des Eigentümers,
-- 2026-09-08; Vorbild LearningView: Lernende und Lehrpersonen mit Profil).
ALTER TABLE actors ADD COLUMN org TEXT;
ALTER TABLE actors ADD COLUMN role TEXT;
ALTER TABLE actors ADD COLUMN about TEXT;
ALTER TABLE actors ADD COLUMN website TEXT;
ALTER TABLE actors ADD COLUMN langs TEXT;
