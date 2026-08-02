#!/usr/bin/env bash
# Liest den Zustand der entrosana-Dienste von der Maschine und schreibt ihn nach
# assets/services.js. Bewusst eine Datei statt einer Schnittstelle: serve.mjs
# liefert nur aus, und die Inhaltssicherheitsregel kennt kein connect-src
# (docs/handoff-design.md §8, §10). Die Seite liest window.__services.
#
# Aufruf:  bash tools/services-snapshot.sh
set -uo pipefail

OUT="$(cd "$(dirname "$0")/.." && pwd)/assets/services.js"
HOST="$(hostname)"
READ_AT="$(date '+%H:%M')"

unit_state() { systemctl --user is-active "$1" 2>/dev/null; }
docker_status() { docker ps --filter "name=^${1}$" --format '{{.Status}}' 2>/dev/null | head -1; }
listens() { ss -ltn 2>/dev/null | grep -qE "[: ]${1}\b" && echo yes || echo no; }

WP_STATUS="$(docker_status entrosana-wp-wordpress-1)"; WP_STATUS="${WP_STATUS:-not running}"
DB_STATUS="$(docker_status entrosana-wp-db-1)";        DB_STATUS="${DB_STATUS:-not running}"
EDGE_STATUS="$(docker_status entrosana-edge)";         EDGE_STATUS="${EDGE_STATUS:-not running}"

APP="$(unit_state entrosana-app.service)"
SITE="$(unit_state entrosana-site.service)"
TUN="$(unit_state entrosana-tunnel.service)"
ADMIN="$(unit_state entrosana-admin.service)"
STAGING="$(unit_state entrosana-staging.service)"
BACKUP="$(unit_state entrosana-wp-backup.service)"

# Der Widerspruch aus §2: die Beschreibung der Einheit nennt einen anderen Port
# als der Lauscher. Wird gemessen, nicht angenommen.
ADMIN_DESC_PORT="$(systemctl --user show entrosana-admin.service -p Description --value 2>/dev/null \
                   | grep -oE ':[0-9]{2,5}' | tr -d ':' | head -1)"
ADMIN_PORT=""
for p in 8392 8393 8394; do [ "$(listens $p)" = yes ] && ADMIN_PORT=$p && break; done
ADMIN_FLAG=""
ADMIN_STATE="ok"
if [ -n "$ADMIN_DESC_PORT" ] && [ -n "$ADMIN_PORT" ] && [ "$ADMIN_DESC_PORT" != "$ADMIN_PORT" ]; then
  ADMIN_FLAG="Unit description says :${ADMIN_DESC_PORT}, the listener is on :${ADMIN_PORT}. One of the two is wrong."
  ADMIN_STATE="warn"
fi

state_of() { case "$1" in active) echo ok ;; activating) echo run ;; inactive|failed) echo off ;; *) echo off ;; esac; }
docker_state() { case "$1" in Up*) echo ok ;; *) echo off ;; esac; }

cat > "$OUT" <<EOF
/* Erzeugt von tools/services-snapshot.sh — nicht von Hand ändern. */
window.__services = {
 "host": "${HOST}",
 "read": "${READ_AT}",
 "services": [
  {"group":"Public","name":"entrosana.com","what":"WordPress","where":"tunnel → :8090","state":"$(docker_state "$WP_STATUS")","status":"${WP_STATUS}"},
  {"group":"Public","name":"entrosana.app","what":"this app, entrosana-app.service","where":"tunnel → :4322","state":"$(state_of "$APP")","status":"${APP}"},
  {"group":"Public","name":"entrosana-tunnel","what":"Cloudflare Tunnel, serves both hosts","where":"cloudflared","state":"$(state_of "$TUN")","status":"${TUN}"},
  {"group":"LAN and tailnet","name":"entrosana-site","what":"static predecessor, fallback path","where":"0.0.0.0:4321","state":"$(state_of "$SITE")","status":"${SITE}"},
  {"group":"LAN and tailnet","name":"entrosana-edge","what":"Caddy TLS edge","where":"LAN :443 → :4321","state":"$(docker_state "$EDGE_STATUS")","status":"${EDGE_STATUS}"},
  {"group":"LAN and tailnet","name":"entrosana-admin","what":"editor, tailnet only","where":"0.0.0.0:${ADMIN_PORT:-?}","state":"${ADMIN_STATE}","status":"${ADMIN}"$( [ -n "$ADMIN_FLAG" ] && printf ',"flag":"%s"' "$ADMIN_FLAG" )},
  {"group":"LAN and tailnet","name":"entrosana-staging","what":"staging preview, tailnet only","where":":8394","state":"$(state_of "$STAGING")","status":"${STAGING}"},
  {"group":"Data","name":"entrosana-wp-db-1","what":"MariaDB","where":"3306, container only","state":"$(docker_state "$DB_STATUS")","status":"${DB_STATUS}"},
  {"group":"Jobs","name":"entrosana-wp-backup","what":"db + wp-content + stack → local, T9, Nextcloud","where":"oneshot","state":"wait","status":"${BACKUP}"}
 ]
};
EOF

echo "geschrieben: $OUT ($(stat -c%s "$OUT") B, gelesen ${READ_AT})"
