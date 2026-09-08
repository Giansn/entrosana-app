#!/usr/bin/env bash
# Konsistente Kopie der Hub-Datenbank, bevor backup.sh um 03:30 den Ordner
# einpackt. Die Datei läuft im WAL-Modus; ein tar der .sqlite/.sqlite-wal/.shm
# mitten im Schreiben kann uneinheitlich sein. ".backup" liest über die
# SQLite-Sperre und schreibt eine Datei, die für sich allein stimmt.
# Liegt in api/db/, also im Baum, den backup.sh sichert (EXTRAS: entrosana-app).
set -euo pipefail
DB="$HOME/entrosana-app/api/db/hub.sqlite"
OUT="$HOME/entrosana-app/api/db/hub.backup.sqlite"
[ -f "$DB" ] || { echo "keine Datenbank unter $DB"; exit 2; }
sqlite3 "$DB" ".backup '$OUT.tmp'"
CHECK="$(sqlite3 "$OUT.tmp" 'PRAGMA integrity_check')"
[ "$CHECK" = "ok" ] || { echo "integrity_check: $CHECK"; rm -f "$OUT.tmp"; exit 1; }
mv -f "$OUT.tmp" "$OUT"
echo "$(date '+%Y-%m-%d %H:%M') hub.backup.sqlite $(stat -c%s "$OUT") B, integrity ok, $(sqlite3 "$OUT" 'SELECT COUNT(*) FROM audit') Kettenzeilen"
