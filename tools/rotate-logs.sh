#!/usr/bin/env bash
# Protokolle des Hubs rotieren: neben der laufenden Datei bleibt genau eine
# ältere Generation (eine Woche). Die älteste Zeile ist damit höchstens 14 Tage
# alt, so wie es die Datenschutzerklärung zusagt. Bis 2026-11-16 blieben zwei
# ältere Generationen liegen, kurz vor einem Lauf also bis zu 21 Tage.
# Der Dienst schreibt je Zeile mit appendFileSync, deshalb ist Kopieren und
# Leeren sicher; ein Neustart ist nicht nötig. Die Zeilen tragen
# Client-Adressen, länger als zwei Wochen braucht das niemand.
set -euo pipefail
cd "$HOME/.sygnif/logs"
for f in entrosana-api.log entrosana-services-snapshot.log; do
  [ -f "$f" ] || continue
  rm -f "$f.2"                       # Rest der früheren zweiten Generation
  cp -p "$f" "$f.1" && : > "$f"      # überschreibt die Vorwoche
  echo "$(date '+%Y-%m-%d %H:%M') $f rotiert ($(wc -l < "$f.1") Zeilen nach .1)"
done
