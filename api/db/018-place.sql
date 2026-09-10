-- 018-place.sql — der Ort: wo jemand arbeitet oder wohnt, frei formuliert
-- («Basel», «Zürich Oerlikon», «unterwegs»). Steht im Kopf des Profils neben
-- Rolle und Sprachen (Wunsch des Eigentümers, 2026-09-10).
ALTER TABLE actors ADD COLUMN place TEXT;
