#!/usr/bin/env bash
# Proton Drive für die Sicherungen des Hubs: ablegen, wegnehmen, auflisten.
# Hier kommt nur Chiffrat an; verschlüsselt hat der Aufrufer (hub-offsite.sh,
# hub-files-backup.sh).
#
#   hub-proton.sh put <datei> <ordner>   legt die Datei im Ordner ab, ersetzt eine
#                                        gleichnamige und sieht nach, ob sie mit
#                                        Grösse und SHA-1 dort steht
#   hub-proton.sh del <ordner> <name>    legt <name> und <name>.parts in den Papierkorb
#   hub-proton.sh ls  <ordner>           je Zeile Name, Art, Grösse, SHA-1; ein Ordner,
#                                        den es nicht gibt, ist leer und kein Fehler
#
# Warum Teile und Fristen (Befund 2026-11-16): am 2026-11-04 und -05 hing
# ~/entrosana-wp/backup.sh je 30 Minuten im Upload des 57-MB-Archivs zu Proton
# Drive, bis systemd die Unit abbrach; hub-files-backup.sh dahinter lief gar nicht
# mehr. Der Uplink von e14 war eingebrochen: am 2026-11-03 gingen dieselben 57 MB
# in einer halben Minute durch, am 2026-11-06 und -07 mass sygnif-e14-backup 13 bis
# 17 KB/s, und sein 8-MB-Archiv scheiterte in denselben Nächten mit «Gateway
# Timeout». proton-drive lädt in Blöcken bis 4 MB, ein Block läuft bei dem Tempo in
# die Zeitgrenze des Proton-Gateways, und der Aufruf schrieb nach /dev/null und
# hatte keine eigene Frist. Deshalb hier:
#   - was grösser ist als PART_BYTES, geht in Teilen nach <name>.parts/ (wie
#     sygnif-e14-backup seit 2026-11-06), einzeln nacheinander, mit SHA256SUMS;
#     ein abgebrochener Lauf setzt in der nächsten Nacht dort fort;
#   - jeder Aufruf hat eine Frist und eine begrenzte Zahl Versuche;
#   - als abgelegt gilt erst, was danach in der Liste steht.
# Zurückholen: proton-drive filesystem download <pfad> <ordner>; bei Teilen dann
#   cd <name>.parts && sha256sum -c SHA256SUMS && cat part-* > ../<name>
set -euo pipefail

PART_BYTES="${HUB_PROTON_PART_BYTES:-921600}"   # 900 KiB
TRIES="${HUB_PROTON_TRIES:-3}"
STEP_S="${HUB_PROTON_TIMEOUT:-300}"             # Frist je Aufruf, Sekunden
WAIT_S="${HUB_PROTON_RETRY_WAIT:-30}"

err() { echo "hub-proton: $*" >&2; }
usage() { err "usage: put <file> <folder> | del <folder> <name> | ls <folder>"; exit 2; }
command -v proton-drive >/dev/null 2>&1 || { err "proton-drive missing"; exit 127; }
pd() { timeout "$STEP_S" proton-drive filesystem "$@"; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Name, Art, Grösse und SHA-1 je Eintrag, mit Tabulator getrennt.
ls_folder() {
    if pd list -j "$1" > "$WORK/list.json" 2> "$WORK/list.err"; then
        python3 -c '
import json, sys
for n in json.load(open(sys.argv[1])):
    rev = n.get("activeRevision") or {}
    sha1 = (rev.get("claimedDigests") or {}).get("sha1") or ""
    print((n.get("name") or {}).get("value", ""), n.get("type", ""), rev.get("claimedSize", ""), sha1, sep="\t")
' "$WORK/list.json"
    elif grep -q 'Node not found' "$WORK/list.json" "$WORK/list.err"; then
        return 0
    else
        err "list $1: $(cat "$WORK/list.err" "$WORK/list.json" | tail -n 2 | tr '\n' ' ')"
        return 1
    fi
}

# Legt jede Stufe unter /my-files an; «gibt es schon» ist kein Fehler.
mkdirs() {
    local parent seg
    local -a segs
    IFS='/' read -r -a segs <<< "${1#/}"
    parent="/${segs[0]}"
    for seg in "${segs[@]:1}"; do
        pd create-folder "$parent" "$seg" >/dev/null 2>&1 || true
        parent="$parent/$seg"
    done
}

# Eine Datei, höchstens PART_BYTES gross, in einen Ordner. Nach dem ersten
# Fehlschlag wird der Ordner angelegt (er fehlt beim allerersten Lauf), danach
# wird zwischen den Versuchen gewartet.
upload() {
    local file="$1" folder="$2" try out
    for try in $(seq 1 "$TRIES"); do
        if out="$(pd upload -t -c replace "$file" "$folder" 2>&1)"; then return 0; fi
        err "$(basename "$file") try $try/$TRIES: $(printf '%s' "$out" | tail -n 2 | tr '\n' ' ')"
        [ "$try" -lt "$TRIES" ] || break
        if [ "$try" = 1 ]; then mkdirs "$folder"; else sleep "$WAIT_S"; fi
    done
    return 1
}

# Steht jede der Dateien mit ihrer Grösse und ihrem SHA-1 im Ordner?
# Die Liste bleibt in $WORK/have liegen.
listed() {
    local folder="$1" f name line rsize rsha
    shift
    ls_folder "$folder" > "$WORK/have" || return 1
    for f in "$@"; do
        name="$(basename "$f")"
        line="$(awk -F'\t' -v n="$name" '$1 == n' "$WORK/have" | head -n 1)"
        [ -n "$line" ] || { err "$name is not listed in $folder after the upload"; return 1; }
        rsize="$(printf '%s' "$line" | cut -f3)"; rsha="$(printf '%s' "$line" | cut -f4)"
        [ -z "$rsize" ] || [ "$rsize" = "$(stat -c%s "$f")" ] \
            || { err "$name is listed with $rsize bytes, here it has $(stat -c%s "$f")"; return 1; }
        [ -z "$rsha" ] || [ "${rsha,,}" = "$(sha1sum "$f" | cut -d' ' -f1)" ] \
            || { err "$name is listed with another SHA-1 than the file here"; return 1; }
    done
}

put() {
    local file="$1" folder="$2" name size p extra
    [ -f "$file" ] || { err "no such file: $file"; return 1; }
    name="$(basename "$file")"; size="$(stat -c%s "$file")"
    if [ "$size" -le "$PART_BYTES" ]; then
        upload "$file" "$folder" || return 1
        listed "$folder" "$file" || return 1
        # Lag derselbe Name früher in Teilen dort, sind die jetzt überholt.
        if cut -f1 "$WORK/have" | grep -qxF -- "$name.parts"; then
            pd trash "$folder/$name.parts" >/dev/null 2>&1 || err "stale $name.parts stays in $folder"
        fi
        return 0
    fi
    rm -rf "$WORK/parts"; mkdir "$WORK/parts"
    split -b "$PART_BYTES" -d -a 4 "$file" "$WORK/parts/part-"
    ( cd "$WORK/parts" && sha256sum part-* > SHA256SUMS )
    mkdirs "$folder/$name.parts"
    for p in "$WORK/parts"/*; do
        upload "$p" "$folder/$name.parts" || return 1
    done
    listed "$folder/$name.parts" "$WORK/parts"/* || return 1
    # Teile einer früheren, längeren Fassung desselben Namens würden beim
    # Zusammensetzen mit hineinlaufen; ebenso überholt ist eine ganze Datei.
    while IFS= read -r extra; do
        [ -n "$extra" ] || continue
        [ -e "$WORK/parts/$extra" ] && continue
        pd trash "$folder/$name.parts/$extra" >/dev/null 2>&1 \
            || { err "stale $extra stays in $folder/$name.parts"; return 1; }
    done < <(cut -f1 "$WORK/have")
    ls_folder "$folder" > "$WORK/have" || return 1
    if cut -f1 "$WORK/have" | grep -qxF -- "$name"; then
        pd trash "$folder/$name" >/dev/null 2>&1 || err "stale $name stays in $folder"
    fi
}

del() {
    local folder="$1" name="$2" n rc=0
    ls_folder "$folder" > "$WORK/have" || return 1
    for n in "$name" "$name.parts"; do
        if cut -f1 "$WORK/have" | grep -qxF -- "$n"; then
            pd trash "$folder/$n" >/dev/null 2>&1 || { err "could not trash $folder/$n"; rc=1; }
        fi
    done
    return "$rc"
}

case "${1:-}" in
    put) [ $# -eq 3 ] || usage; put "$2" "$3" ;;
    del) [ $# -eq 3 ] || usage; del "$2" "$3" ;;
    ls)  [ $# -eq 2 ] || usage; ls_folder "$2" ;;
    *)   usage ;;
esac
