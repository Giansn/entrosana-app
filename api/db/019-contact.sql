-- 019-contact.sql — die öffentliche Kontaktadresse. Die Anmeldeadresse bleibt
-- privat und per Link bestätigt; diese hier setzt das Konto selbst, sie steht
-- auf der öffentlichen Profilseite und darf leer sein (Wunsch des Eigentümers,
-- 2026-09-10: «i have to be able to edit my publicly visible email»).
ALTER TABLE actors ADD COLUMN contact_email TEXT;
