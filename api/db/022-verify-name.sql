-- 022-verify-name.sql — der Name aus dem Anmeldeformular reist mit dem Verweis.
-- Vorher ging er nur in die Anrede der Mail, das Konto entstand ohne Namen und
-- die Person musste ihn im Profil noch einmal eingeben (Probelauf 2026-10-29).
ALTER TABLE verifications ADD COLUMN name TEXT;
