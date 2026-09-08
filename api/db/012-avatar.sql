-- 012-avatar.sql — das Profilbild, als kleines Bild im Konto (höchstens 180 KB,
-- vom Browser auf 256 px verkleinert). Öffentlich auf der Profilseite und in der
-- Leiste; geht mit der Löschung des Kontos. Wunsch des Eigentümers, 2026-09-08.
ALTER TABLE actors ADD COLUMN avatar BLOB;
ALTER TABLE actors ADD COLUMN avatar_type TEXT;
ALTER TABLE actors ADD COLUMN avatar_updated TEXT;
