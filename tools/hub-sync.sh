#!/usr/bin/env bash
# Stündlicher Abgleich des Hubs (2026-09-10), entrosana-hub-sync.timer.
#   1. Texte, die die Konsole :8396 schreibt, einchecken (Seiten, Katalog, Checklisten, Docs).
#   2. Neuestes von GitHub holen (rebase mit Autostash, damit offene Arbeit anderer Sitzungen liegen bleibt).
#   3. Eigene Commits hochladen.
#   4. Dienste neu starten, wenn Code dazukam: api nach bestandenen Tests, app bei serve.mjs/docs-render.mjs,
#      Konsole nur ohne offene Verbindung.
# Protokoll als JSON-Zeilen in ~/.sygnif/logs/entrosana-hub-sync.log; die Konsole zeigt es unter /sync.
# Lebenszeichen (2026-09-10): steht in ~/.config/entrosana-hub-sync.hook die geheime Adresse eines Eintrags
# «My service reports to the Hub», ruft der Lauf sie am Ende auf; ein gescheiterter Lauf ruft nicht, dann
# wird der Punkt auf entrosana.app/services nach dem Intervall amber. Die Adresse steht nur dort, nicht im Baum.
set -uo pipefail
APP="$HOME/entrosana-app"; LOG="$HOME/.sygnif/logs/entrosana-hub-sync.log"; HOOK="$HOME/.config/entrosana-hub-sync.hook"
beat() { [ -s "$HOOK" ] || return 0; curl -fsS -m 10 "$(tr -d '[:space:]' < "$HOOK")?status=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$1")" >/dev/null 2>&1 && log beat true "Lebenszeichen gesendet: $1" || log beat false "Lebenszeichen nicht angekommen"; }
mkdir -p "$(dirname "$LOG")"; cd "$APP" || exit 2
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { printf '{"t":"%s","step":"%s","ok":%s,"text":%s}\n' "$(now)" "$1" "$2" "$(printf '%s' "$3" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()[:600]))')" >> "$LOG"; }
branch=$(git branch --show-current)
if [ "$branch" != "master" ]; then log branch false "auf Zweig $branch, nicht master; nichts getan"; exit 0; fi

# 1) Texte aus der Konsole
shopt -s nullglob
TEXT=(*.html assets/catalogue.js assets/seeds.js assets/catalogue-sizes.js docs-site/pages.json docs-site/*.md docs-site/*/*.md docs-dev/pages.json docs-dev/*.md docs-dev/*/*.md atrium-site/*.md)
changed=$(git status --short --untracked-files=no -- "${TEXT[@]}" 2>/dev/null | wc -l)
if [ "$changed" -gt 0 ]; then
  if git add -- "${TEXT[@]}" && git -c user.name=Giansn -c user.email=gianson@pm.me commit -q -m "texte: abgleich $(date '+%Y-%m-%d %H:%M') aus der konsole"; then
    log commit true "$changed Datei(en) eingecheckt: $(git log -1 --format=%h)"
  else log commit false "commit fehlgeschlagen"; fi
fi

# 2) Neuestes holen
before=$(git rev-parse HEAD)
if out=$(git pull --rebase --autostash --quiet origin master 2>&1); then
  after=$(git rev-parse HEAD); n=$(git rev-list --count "$before..$after" 2>/dev/null || echo 0)
  log pull true "$n neue(r) Commit(s): ${before:0:7} → ${after:0:7}"
else
  git rebase --abort >/dev/null 2>&1; log pull false "$out"; exit 1
fi

# 3) Hochladen
ahead=$(git rev-list --count origin/master..master 2>/dev/null || echo 0)
if [ "$ahead" -gt 0 ]; then
  if out=$(git push -q origin master 2>&1); then log push true "$ahead Commit(s) hochgeladen"; else log push false "$out"; fi
fi

# 4) Neustarts
# Verglichen wird mit dem Commit, auf dem jeder Dienst zuletzt gestartet wurde
# (~/.sygnif/entrosana-deployed-<dienst>), nicht nur mit dem Stand vor dem Pull:
# sonst laufen lokal committete Änderungen nie (Fund 2026-10-30, API lief ohne
# 59042ca/43e7fc6). Ohne Zustandsdatei gilt der Stand vor dem Pull wie bisher.
DEPLOYED="$HOME/.sygnif/entrosana-deployed"
seit() { local f="$DEPLOYED-$1"; [ -s "$f" ] && git cat-file -e "$(cat "$f")^{commit}" 2>/dev/null && cat "$f" || echo "$before"; }
gestartet() { echo "$after" > "$DEPLOYED-$1"; }
files_api=$(git diff --name-only "$(seit api)" "$after")
if echo "$files_api" | grep -qE '^api/'; then
  if node --test api/test/*.test.mjs >/dev/null 2>&1; then
    systemctl --user restart entrosana-api.service && log restart true "api neu gestartet" && gestartet api
  else log restart false "api: tests fehlgeschlagen, kein neustart"; fi
else gestartet api; fi
files_app=$(git diff --name-only "$(seit app)" "$after")
if echo "$files_app" | grep -qE '^(serve\.mjs|docs-render\.mjs)$'; then
  systemctl --user restart entrosana-app.service && log restart true "app neu gestartet" && gestartet app
else gestartet app; fi
files_konsole=$(git diff --name-only "$(seit konsole)" "$after")
if echo "$files_konsole" | grep -qE '^admin-app\.py$'; then
  if [ "$(ss -Htn state established '( sport = :8396 )' | wc -l)" = "0" ]; then
    systemctl --user restart entrosana-admin-app.service && log restart true "konsole neu gestartet" && gestartet konsole
  else log restart false "konsole in gebrauch, neustart verschoben"; fi
else gestartet konsole; fi
log done true "fertig auf $(git log -1 --format=%h)"
beat "ok, $(git log -1 --format=%h), $n new"
