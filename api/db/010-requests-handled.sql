-- 010-requests-handled.sql — Anfragen können in der Verwaltung als erledigt
-- markiert werden; die Frist von 180 Tagen gilt unverändert.
ALTER TABLE requests ADD COLUMN handled TEXT;
