-- 013 (2026-09-09): Module mit mehreren Beitragenden und Punkte je Konto.
-- module_contributors: wer ein veröffentlichtes Modul bearbeiten darf; gesät aus den
-- veröffentlichten Beiträgen. points: ein Punkt je Konto und Modul, umschaltbar.
CREATE TABLE IF NOT EXISTS module_contributors (
  slug      TEXT    NOT NULL,
  actor_id  INTEGER NOT NULL REFERENCES actors(id),
  added     TEXT    NOT NULL,
  added_by  INTEGER,
  PRIMARY KEY (slug, actor_id)
);
CREATE TABLE IF NOT EXISTS points (
  slug      TEXT    NOT NULL,
  actor_id  INTEGER NOT NULL REFERENCES actors(id),
  created   TEXT    NOT NULL,
  PRIMARY KEY (slug, actor_id)
);
INSERT OR IGNORE INTO module_contributors(slug, actor_id, added, added_by)
  SELECT slug, actor_id, COALESCE(published, decided, created), published_by
  FROM contributions WHERE status = 'published' AND slug IS NOT NULL;
