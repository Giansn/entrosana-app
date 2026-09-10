#!/usr/bin/env bash
# Liest den Zustand der entrosana-Dienste von der Maschine und schreibt ihn nach
# assets/services.js. Seit 2026-09-10 liefert serve.mjs die Datei nicht mehr aus;
# api/server.mjs liest sie und gibt sie bei GET /api/me/services nur dem
# Eigentümer mit (seine Dienste sind seine Dienste, andere Konten sehen nur ihre
# eigenen). Die Seite /services zeigt die Zeilen in derselben Liste wie die
# eigenen Einträge.
#
# Aufruf:  bash tools/services-snapshot.sh
set -uo pipefail

OUT="$(cd "$(dirname "$0")/.." && pwd)/assets/services.js"
HOST="$(hostname)"
READ_AT="$(date '+%Y-%m-%d %H:%M')"

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
# als der Lauscher. Wird gemessen, nicht angenommen. Auf der öffentlichen
# Seite stehen keine Portnummern und keine Bind-Adressen: die Spalte where
# nennt nur den Ort (tunnel, LAN, tailnet, container). Wer die Ports braucht,
# liest sie hier im Skript oder per ss auf der Maschine.
ADMIN_DESC_PORT="$(systemctl --user show entrosana-admin.service -p Description --value 2>/dev/null \
                   | grep -oE ':[0-9]{2,5}' | tr -d ':' | head -1)"
ADMIN_PORT=""
for p in 8392 8393 8394; do [ "$(listens $p)" = yes ] && ADMIN_PORT=$p && break; done
ADMIN_FLAG=""
ADMIN_STATE="ok"
if [ -n "$ADMIN_DESC_PORT" ] && [ -n "$ADMIN_PORT" ] && [ "$ADMIN_DESC_PORT" != "$ADMIN_PORT" ]; then
  ADMIN_FLAG="Unit description and the actual listener disagree about the port."
  ADMIN_STATE="warn"
fi

state_of() { case "$1" in active) echo ok ;; activating) echo run ;; inactive|failed) echo off ;; *) echo off ;; esac; }
docker_state() { case "$1" in Up*) echo ok ;; *) echo off ;; esac; }

# ----------------------------------------------------------- eigene Dienste
# tools/services-watch.txt hält, was zusätzlich gemessen werden soll — eigene
# Dienste und solche, die mit einem Modul dazugekommen sind. Geprüft wird hier
# auf der Maschine; die Seite zeigt nur das Ergebnis. Adressen und Ports aus
# der Prüfung gehen nicht mit hinaus, /services ist öffentlich erreichbar.
WATCH="$(cd "$(dirname "$0")" && pwd)/services-watch.txt"

trim() { printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }
clean() { printf '%s' "$1" | tr -d '"\\' | tr -d '\n'; }

probe() {  # $1 = Prüfvorschrift, gibt "state|status" zurück
  case "$1" in
    url:*)
      code="$(curl -s -o /dev/null -m 4 -w '%{http_code}' "${1#url:}" 2>/dev/null)"
      case "$code" in
        2*|3*) echo "ok|HTTP ${code}" ;;
        000|"") echo "off|unreachable" ;;
        *) echo "warn|HTTP ${code}" ;;
      esac ;;
    unit:*)
      u="${1#unit:}"
      s="$(systemctl --user is-active "$u" 2>/dev/null)"
      if [ -z "$s" ] || [ "$s" = "unknown" ]; then s="$(systemctl is-active "$u" 2>/dev/null)"; fi
      case "$s" in
        active) echo "ok|active" ;;
        activating) echo "run|activating" ;;
        *) echo "off|${s:-unknown}" ;;
      esac ;;
    docker:*)
      s="$(docker ps --filter "name=^${1#docker:}$" --format '{{.Status}}' 2>/dev/null | head -1)"
      case "$s" in
        Up*) echo "ok|${s}" ;;
        *) echo "off|${s:-not running}" ;;
      esac ;;
    *) echo "wait|no check configured" ;;
  esac
}

EXTRA=""
if [ -r "$WATCH" ]; then
  while IFS='|' read -r w_name w_what w_group w_where w_check w_origin; do
    w_name="$(trim "${w_name:-}")"
    case "$w_name" in ''|\#*) continue ;; esac
    w_what="$(clean "$(trim "${w_what:-}")")"
    w_group="$(clean "$(trim "${w_group:-}")")"
    w_where="$(clean "$(trim "${w_where:-}")")"
    w_check="$(trim "${w_check:-}")"
    w_origin="$(clean "$(trim "${w_origin:-}")")"
    [ -n "$w_group" ] || w_group="LAN and tailnet"
    [ -n "$w_where" ] || w_where="LAN"
    case "$w_origin" in module) : ;; *) w_origin="own" ;; esac
    result="$(probe "$w_check")"
    EXTRA="${EXTRA},
  {\"group\":\"${w_group}\",\"name\":\"$(clean "$w_name")\",\"what\":\"${w_what}\",\"where\":\"${w_where}\",\"state\":\"${result%%|*}\",\"status\":\"${result#*|}\",\"origin\":\"${w_origin}\"}"
  done < "$WATCH"
fi

cat > "$OUT" <<EOF
/* Erzeugt von tools/services-snapshot.sh — nicht von Hand ändern. */
window.__services = {
 "host": "${HOST}",
 "read": "${READ_AT}",
 "services": [
  {"group":"Public","name":"entrosana.com","what":"WordPress","where":"via tunnel","state":"$(docker_state "$WP_STATUS")","status":"${WP_STATUS}","origin":"entrosana"},
  {"group":"Public","name":"entrosana.app","what":"this app, entrosana-app.service","where":"via tunnel","state":"$(state_of "$APP")","status":"${APP}","origin":"entrosana"},
  {"group":"Public","name":"entrosana-tunnel","what":"Cloudflare Tunnel, serves both hosts","where":"cloudflared","state":"$(state_of "$TUN")","status":"${TUN}","origin":"entrosana"},
  {"group":"LAN and tailnet","name":"entrosana-site","what":"static predecessor, fallback path","where":"LAN","state":"$(state_of "$SITE")","status":"${SITE}","origin":"entrosana"},
  {"group":"LAN and tailnet","name":"entrosana-edge","what":"Caddy TLS edge","where":"LAN","state":"$(docker_state "$EDGE_STATUS")","status":"${EDGE_STATUS}","origin":"entrosana"},
  {"group":"LAN and tailnet","name":"entrosana-admin","what":"editor, tailnet only","where":"tailnet","state":"${ADMIN_STATE}","status":"${ADMIN}","origin":"entrosana"$( [ -n "$ADMIN_FLAG" ] && printf ',"flag":"%s"' "$ADMIN_FLAG" )},
  {"group":"LAN and tailnet","name":"entrosana-staging","what":"staging preview, tailnet only","where":"tailnet","state":"$(state_of "$STAGING")","status":"${STAGING}","origin":"entrosana"},
  {"group":"Data","name":"entrosana-wp-db-1","what":"MariaDB","where":"container only","state":"$(docker_state "$DB_STATUS")","status":"${DB_STATUS}","origin":"entrosana"},
  {"group":"Jobs","name":"entrosana-wp-backup","what":"db + wp-content + stack → local, T9, Nextcloud","where":"oneshot","state":"wait","status":"${BACKUP}","origin":"entrosana"}${EXTRA}
 ]
};
EOF

echo "geschrieben: $OUT ($(stat -c%s "$OUT") B, gelesen ${READ_AT})"
