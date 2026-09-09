-- 015 (2026-09-10): eigene Dienste je Konto. Geprüft von e14 (url, mcp, tcp, tls) oder
-- selbst gemeldet (webhook, Lebenszeichen an eine geheime Adresse). Adressen bleiben
-- auf dem Server; die Liste gehört dem Konto und ist nicht öffentlich.
CREATE TABLE IF NOT EXISTS services (
  id           INTEGER PRIMARY KEY,
  actor_id     INTEGER NOT NULL REFERENCES actors(id),
  name         TEXT    NOT NULL,
  what         TEXT,
  grp          TEXT    NOT NULL DEFAULT 'Public',
  place        TEXT    NOT NULL DEFAULT 'via tunnel',
  kind         TEXT    NOT NULL,
  target       TEXT,
  hook_hash    TEXT,
  interval_min INTEGER NOT NULL DEFAULT 60,
  created      TEXT    NOT NULL,
  updated      TEXT    NOT NULL,
  last_state   TEXT,
  last_status  TEXT,
  last_checked TEXT,
  last_ms      INTEGER,
  last_beat    TEXT
);
CREATE INDEX IF NOT EXISTS services_actor ON services(actor_id);
CREATE INDEX IF NOT EXISTS services_hook ON services(hook_hash);
