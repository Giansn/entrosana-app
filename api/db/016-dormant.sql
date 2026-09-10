-- 016 (2026-09-10): ruhende Konten. Nach 24 Monaten ohne Anmeldung ein Hinweis (Zeit hier),
-- nach weiteren 3 Monaten ohne Anmeldung die Löschung wie die Selbstlöschung.
ALTER TABLE actors ADD COLUMN dormant_notice TEXT;
