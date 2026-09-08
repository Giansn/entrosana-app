-- 004-trail.sql — der mitgeschickte Trail als Daten, samt Prüfergebnis.
-- trail_ok: NULL nichts mitgeschickt, 1 Kette stimmt, 0 Kette stimmt nicht.
ALTER TABLE contributions ADD COLUMN trail_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE contributions ADD COLUMN trail_ok INTEGER;
INSERT OR REPLACE INTO meta(key, value, updated) VALUES ('schema', '4', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
