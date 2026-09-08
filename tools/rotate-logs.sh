#!/usr/bin/env bash
# Protokolle des Hubs rotieren: zwei Generationen zu je einer Woche, also
# 14 Tage. Der Dienst schreibt je Zeile mit appendFileSync, deshalb ist
# Kopieren und Leeren sicher; ein Neustart ist nicht nötig. Die Zeilen tragen
# Client-Adressen, länger als zwei Wochen braucht das niemand.
set -euo pipefail
cd "$HOME/.sygnif/logs"
for f in entrosana-api.log entrosana-services-snapshot.log; do
  [ -f "$f" ] || continue
  [ -f "$f.1" ] && mv -f "$f.1" "$f.2"
  cp -p "$f" "$f.1" && : > "$f"
  echo "$(date '+%Y-%m-%d %H:%M') $f rotiert ($(wc -l < "$f.1") Zeilen nach .1)"
done
