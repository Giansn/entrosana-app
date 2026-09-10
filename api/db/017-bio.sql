-- 017-bio.sql — die Biographie: der längere Text, den ein Konto selbst über
-- sich schreibt, für die öffentliche Profilseite. «about» bleibt daneben die
-- eine Zeile neben dem Namen (280 Zeichen); die Biographie ist der Absatz
-- darunter (Wunsch des Eigentümers, 2026-09-10).
ALTER TABLE actors ADD COLUMN bio TEXT;
