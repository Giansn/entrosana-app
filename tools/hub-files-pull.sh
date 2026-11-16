#!/usr/bin/env bash
# Holt die Dateien der Konten vom Server auf e14: api/db/files/<konto>/<id>.<endung>
#
# Seit 2026-11-05 läuft der Hub auf Metanet, die Dateien liegen dort. Der Schlüssel
# der Sicherung liegt nur auf e14 und bleibt hier; also kommt der Klartext über ssh
# hierher und wird hier verschlüsselt (tools/hub-files-backup.sh liest diese Kopie).
#
#   Server   metanet:entrosana-app/api/db/files/
#   Kopie    ~/.cache/entrosana-hub-files/   nur für den Besitzer lesbar. Unter
#            .cache, weil der Klon auf die T9 diesen Ordner auslässt: auf die T9
#            geht aus dieser Sicherung nur Chiffrat. Geht die Kopie verloren, holt
#            der nächste Lauf sie neu.
#
# Die Kopie folgt dem Server, auch wenn dort eine Datei gelöscht wird. Nie aber
# aus einer Quelle, die fehlt oder leer ist: ist der Server nicht erreichbar, fehlt
# dort der Ordner oder steht nichts darin, während hier Dateien liegen, bleibt
# die Kopie, wie sie ist, und der Lauf endet mit einem Fehler. Gelöscht wird
# erst, wenn alles angekommen ist, was die Liste nennt, und nur gegen diese Liste.
# Hat der Hub wirklich keine Datei mehr, sagt das ein Mensch:
#   HUB_FILES_ALLOW_EMPTY=1 tools/hub-files-pull.sh
#
# Für Proben: HUB_FILES_HOST, HUB_FILES_HOST_DIR, HUB_FILES_SRC
set -euo pipefail
umask 077

HOST="${HUB_FILES_HOST:-metanet}"
HOST_DIR="${HUB_FILES_HOST_DIR:-entrosana-app/api/db/files}"
SRC="${HUB_FILES_SRC:-${XDG_CACHE_HOME:-$HOME/.cache}/entrosana-hub-files}"
ALLOW_EMPTY="${HUB_FILES_ALLOW_EMPTY:-0}"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)

die() { echo "FAIL: hub-files-pull: $*" >&2; exit 1; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 1. Eine Liste vom Server: Grösse und Pfad je Datei, mit Nullbyte getrennt.
#    Eine .part ist ein Upload, der noch läuft. 44 heisst: der Ordner fehlt dort.
rc=0
"${SSH[@]}" "$HOST" "d=$(printf '%q' "$HOST_DIR"); [ -d \"\$d\" ] || exit 44; cd \"\$d\" && find . -type f ! -name '*.part' -printf '%s\t%P\0'" \
    > "$WORK/list" || rc=$?
case "$rc" in
    0|44) ;;
    *) die "$HOST not reached or the listing failed (rc=$rc); the copy stays as it is" ;;
esac
n="$(tr -cd '\0' < "$WORK/list" | wc -c)"
have=0
[ -d "$SRC" ] && have="$(find "$SRC" -type f | wc -l)"

if [ "$rc" = 44 ] || [ "$n" -eq 0 ]; then
    state="empty"; [ "$rc" = 44 ] && state="missing"
    if [ "$have" -eq 0 ]; then
        echo "hub-files-pull: $HOST:$HOST_DIR is $state and there is no copy here, nothing to do"
        exit 0
    fi
    [ "$state" = empty ] && [ "$ALLOW_EMPTY" = 1 ] \
        || die "$HOST:$HOST_DIR is $state, but the copy here holds $have file(s). Nothing pulled, nothing dropped. If the Hub really has no files left: HUB_FILES_ALLOW_EMPTY=1"
    echo "hub-files-pull: $HOST:$HOST_DIR is empty and HUB_FILES_ALLOW_EMPTY=1 is set, emptying the copy"
fi

# 2. Die Liste prüfen, bevor ein Pfad daraus benutzt wird.
: > "$WORK/paths"
while IFS= read -r -d '' rec; do
    size="${rec%%$'\t'*}"; rel="${rec#*$'\t'}"
    [[ "$size" =~ ^[0-9]+$ ]] || die "the listing carries an odd size: $rec"
    case "/$rel/" in //*|*/../*|*$'\n'*) die "the listing carries an odd path: $rel" ;; esac
    printf '%s\0' "$rel" >> "$WORK/paths"
done < "$WORK/list"

# 3. Holen, was die Liste nennt. Eine Datei ändert sich nie, sie kommt oder geht;
#    rsync überträgt nur, was hier fehlt oder in Grösse und Zeit abweicht.
fetched=0
if [ "$n" -gt 0 ]; then
    mkdir -p "$SRC"; chmod 700 "$SRC"
    rsync -t --from0 --files-from="$WORK/paths" --timeout=120 --chmod=D700,F600 \
          --out-format='%n' -e "${SSH[*]}" "$HOST:$HOST_DIR/" "$SRC/" > "$WORK/fetched" \
        || die "rsync from $HOST failed; nothing dropped"
    fetched="$(grep -cv '/$' "$WORK/fetched" || true)"
    while IFS= read -r -d '' rec; do
        size="${rec%%$'\t'*}"; rel="${rec#*$'\t'}"
        [ -f "$SRC/$rel" ] && [ "$(stat -c%s "$SRC/$rel")" = "$size" ] \
            || die "after the transfer $rel is missing here or has the wrong size; nothing dropped"
    done < "$WORK/list"
fi

# 4. Was die Liste nicht mehr nennt, geht auch hier. Der Spiegel hält es danach
#    noch 14 Tage unter deleted/.
removed=0
if [ -d "$SRC" ]; then
    while IFS= read -r -d '' f; do
        grep -qzxF -- "${f#"$SRC"/}" "$WORK/paths" && continue
        rm -f -- "$f"; removed=$((removed + 1))
    done < <(find "$SRC" -type f -print0)
    find "$SRC" -mindepth 1 -type d -empty -delete
fi

echo "hub-files-pull: $n on $HOST, $fetched fetched, $removed removed here, $(du -sh "$SRC" 2>/dev/null | cut -f1) in $SRC"
