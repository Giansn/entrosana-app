-- 005-slug.sql — der Katalogeintrag eines angenommenen Beitrags.
ALTER TABLE contributions ADD COLUMN slug TEXT;
INSERT OR REPLACE INTO meta(key, value, updated) VALUES ('schema', '5', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
