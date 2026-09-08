-- 001-meta.sql — Grundtabelle: Schemaversion und Selbstauskunft.
-- Phase 2 bringt actors, roles und audit in eigenen Dateien.
CREATE TABLE IF NOT EXISTS meta(
  key     TEXT PRIMARY KEY,
  value   TEXT NOT NULL,
  updated TEXT NOT NULL
);
INSERT OR REPLACE INTO meta(key, value, updated)
  VALUES ('schema', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
