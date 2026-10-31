#!/usr/bin/env bash
# Sicherung der Dateien, die Konten auf dem Hub ablegen: api/db/files/<konto>/<id>.<endung>
#
# Nicht im grossen Archiv von ~/entrosana-wp/backup.sh. Das würde jede Nacht bis zu
# 400 MB je Konto neu verschlüsseln und viermal verschicken. Hier wird jede Datei
# genau einmal verschlüsselt (gpg, AES256, derselbe Schlüssel wie das Archiv) und
# nur Neues verschickt. Eine hochgeladene Datei ändert sich nie: sie kommt oder geht.
#
#   Spiegel (Chiffrat)   ~/entrosana-backups/hub-files/current/<konto>/<id>.<endung>.gpg
#   Gelöschtes           ~/entrosana-backups/hub-files/deleted/<JJJJMMTT>/…   14 Tage, dann weg
#   T9                   rsync des ganzen Spiegels, mit Löschungen
#   Nextcloud, R2        current/ je Datei; Löschungen werden nachgezogen; was dort
#                        liegt, steht in .shipped-nc und .shipped-r2 (eine Zeile je Datei)
#
# Wiederherstellen (die Zeilen dazu, Name, Typ, öffentlich, stehen in hub.backup.sqlite):
#   cd ~/entrosana-backups/hub-files/current
#   find . -name '*.gpg' | while read -r f; do o="$HOME/entrosana-app/api/db/files/${f%.gpg}";
#     mkdir -p "$(dirname "$o")"; gpg --batch --decrypt --passphrase-file ~/.config/entrosana-backup.key -o "$o" "$f"; done
#
# Läuft aus backup.sh heraus (03:30) oder von Hand. Für Proben lassen sich Quelle,
# Spiegel und T9 umlenken und die Fernziele abschalten:
#   HUB_FILES_SRC, HUB_FILES_MIRROR, HUB_FILES_T9, HUB_FILES_REMOTE=0
set -euo pipefail

SRC="${HUB_FILES_SRC:-$HOME/entrosana-app/api/db/files}"
MIRROR="${HUB_FILES_MIRROR:-$HOME/entrosana-backups/hub-files}"
T9="${HUB_FILES_T9:-/media/g2thek/t9root/home/g2thek/entrosana-backups/hub-files}"
REMOTE="${HUB_FILES_REMOTE:-1}"
KEYFILE="$HOME/.config/entrosana-backup.key"
NC_ENV="$HOME/.sygnif/nextcloud.env"
NC_DIR="Bridge/from-sygnif/hub-files"
R2_ENV_FILE="$HOME/.config/entrosana-r2.env"
R2_PUT="$HOME/entrosana-wp/tools/r2-put.sh"
R2_DELETE="$HOME/entrosana-wp/tools/r2-delete.sh"
KEEP_DAYS=14
TODAY="$(date +%Y%m%d)"

FAILED=0
fail() { echo "FAIL: hub-files: $*" >&2; FAILED=1; }
sha() { sha256sum "$1" | cut -d' ' -f1; }

test -s "$KEYFILE" || { echo "FATAL: hub-files: missing $KEYFILE, refusing to mirror plaintext" >&2; exit 2; }
# Kein Quellordner heisst: nie etwas hochgeladen, oder der Ordner fehlt aus einem
# anderen Grund. Beides ist kein Anlass, den Spiegel und die Fernziele zu leeren.
[ -d "$SRC" ] || { echo "hub-files: no $SRC, nothing to mirror and nothing to drop"; exit 0; }
mkdir -p "$MIRROR/current" "$MIRROR/deleted"

# 1. Neues verschlüsseln. Erst in eine Nebendatei, durch Entschlüsseln gegen die Quelle
#    geprüft, dann an den Platz. Eine .part ist ein Upload, der noch läuft.
added=0; removed=0; kept=0
while IFS= read -r -d '' f; do
    rel="${f#"$SRC"/}"
    out="$MIRROR/current/$rel.gpg"
    if [ -s "$out" ]; then kept=$((kept + 1)); continue; fi
    [ -f "$f" ] || continue
    mkdir -p "$(dirname "$out")"
    if gpg --batch --yes --quiet --symmetric --cipher-algo AES256 --passphrase-file "$KEYFILE" -o "$out.tmp" "$f" \
       && [ "$(gpg --batch --quiet --decrypt --passphrase-file "$KEYFILE" "$out.tmp" 2>/dev/null | sha256sum | cut -d' ' -f1)" = "$(sha "$f")" ]; then
        mv -f "$out.tmp" "$out"; added=$((added + 1))
    else
        rm -f "$out.tmp"; fail "encrypting $rel"
    fi
done < <(find "$SRC" -type f ! -name '*.part' -print0 2>/dev/null | sort -z)

# 2. Was auf dem Hub nicht mehr liegt, wandert nach deleted/<heute>/ und bleibt dort
#    KEEP_DAYS Tage, wie die Archive. Dann verschwindet der Tagesordner.
while IFS= read -r -d '' g; do
    rel="${g#"$MIRROR/current/"}"; rel="${rel%.gpg}"
    [ -f "$SRC/$rel" ] && continue
    mkdir -p "$MIRROR/deleted/$TODAY/$(dirname "$rel")"
    mv -f "$g" "$MIRROR/deleted/$TODAY/$rel.gpg"; removed=$((removed + 1))
done < <(find "$MIRROR/current" -type f -name '*.gpg' -print0 | sort -z)
find "$MIRROR/current" -mindepth 1 -type d -empty -delete
cutoff="$(date -d "$KEEP_DAYS days ago" +%Y%m%d)"
for d in "$MIRROR"/deleted/*/; do
    [ -d "$d" ] || continue
    day="$(basename "$d")"
    [[ "$day" =~ ^[0-9]{8}$ ]] && [ "$day" -lt "$cutoff" ] && rm -rf "$d"
done

# 3. T9: der ganze Spiegel samt deleted/, mit Löschungen. Keine Platte, ein Fehler.
if [ -d "$(dirname "$T9")" ]; then
    mkdir -p "$T9"
    rsync -a --delete "$MIRROR/" "$T9/" && echo "hub-files: T9 ok" || fail "T9 rsync"
else
    fail "T9 not mounted"
fi

# 4. Nextcloud und R2: je Datei, nur was noch nicht dort liegt, Löschungen nachgezogen.
#    ship <ledger> <put> <del>: put bekommt Datei und relativen Pfad, del den Pfad.
ship() {
    local ledger="$1" put="$2" del="$3" rel bad=0 tmp
    touch "$ledger"
    while IFS= read -r -d '' g; do
        rel="${g#"$MIRROR/current/"}"
        grep -qxF "$rel" "$ledger" && continue
        if "$put" "$g" "$rel"; then echo "$rel" >> "$ledger"; else bad=1; fail "$put $rel"; fi
    done < <(find "$MIRROR/current" -type f -name '*.gpg' -print0 | sort -z)
    tmp="$(mktemp)"
    while IFS= read -r rel; do
        [ -n "$rel" ] || continue
        if [ -f "$MIRROR/current/$rel" ]; then echo "$rel" >> "$tmp"
        elif "$del" "$rel"; then :
        else echo "$rel" >> "$tmp"; bad=1; fail "$del $rel"; fi
    done < "$ledger"
    mv -f "$tmp" "$ledger"
    return $bad
}

nc_url() {
    printf '%s/remote.php/dav/files/%s/%s' "$NEXTCLOUD_URL" "$NEXTCLOUD_BRIDGE_USER" \
        "$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$1")"
}
nc_code() { curl -s -o /dev/null -w '%{http_code}' -X "$1" -u "$NEXTCLOUD_BRIDGE_USER:$NEXTCLOUD_BRIDGE_TOKEN" "$(nc_url "$2")"; }
# MKCOL: 201 angelegt, 405 gibt es schon
nc_mkcol() { local c; c="$(nc_code MKCOL "$1")"; [ "$c" = 201 ] || [ "$c" = 405 ]; }
nc_put() { nc_mkcol "$NC_DIR" && nc_mkcol "$NC_DIR/$(dirname "$2")" && sygnif-nc-put "$1" "$NC_DIR/$2" >/dev/null; }
# DELETE: 204 weg, 404 war schon weg
nc_del() { local c; c="$(nc_code DELETE "$NC_DIR/$1")"; [ "$c" = 204 ] || [ "$c" = 404 ]; }
r2_put() { "$R2_PUT" "$1" "hub-files/$2" >/dev/null; }
r2_del() { "$R2_DELETE" "hub-files/$1" >/dev/null; }

if [ "$REMOTE" = 1 ]; then
    if [ -f "$NC_ENV" ] && command -v sygnif-nc-put >/dev/null 2>&1; then
        # shellcheck disable=SC1090
        . "$NC_ENV"
        ship "$MIRROR/.shipped-nc" nc_put nc_del && echo "hub-files: nextcloud ok" || true
    fi
    # R2 meldet seit 2026-09-30 «NotEntitled» (im Cloudflare-Dashboard abgeschaltet).
    # Offsite ist jetzt Proton Drive: der ganze Spiegel (Dateien schon einzeln
    # verschluesselt) als ein Paket pro Lauf, die neuesten 14 bleiben.
    # R2 wieder zuschalten: ENTROSANA_R2=1 in der Unit, sobald R2 freigegeben ist.
    if [ "${ENTROSANA_R2:-0}" = 1 ] && [ -f "$R2_ENV_FILE" ] && [ -x "$R2_PUT" ] && [ -x "$R2_DELETE" ]; then
        ship "$MIRROR/.shipped-r2" r2_put r2_del && echo "hub-files: r2 ok" || true
    fi
    if command -v proton-drive >/dev/null 2>&1; then
        pparent="/my-files/Sygnif Local"; pdest="$pparent/entrosana-hub-files"
        pkg="$(mktemp -d)/entrosana-hub-files-$(date +%Y%m%d-%H%M%S).tar"
        tar cf "$pkg" -C "$MIRROR" current || fail "packing the mirror"
        proton-drive filesystem create-folder "$pparent" "entrosana-hub-files" >/dev/null 2>&1 || true
        if [ -s "$pkg" ] && proton-drive filesystem upload -c skip "$pkg" "$pdest" >/dev/null 2>&1; then
            echo "hub-files: proton ok"
            proton-drive filesystem list -j "$pdest" 2>/dev/null | python3 -c "
import json, sys
names = sorted(n['name']['value'] for n in json.load(sys.stdin)
               if n['type'] == 'file' and n['name']['value'].startswith('entrosana-hub-files-'))
print('\n'.join(names[:-14]))
" | while IFS= read -r old; do
                [ -n "$old" ] || continue
                proton-drive filesystem trash "$pdest/$old" >/dev/null || true
            done || true
        else
            fail "Proton Drive upload"
        fi
        rm -rf "$(dirname "$pkg")"
    else
        fail "proton-drive missing — the mirror has no copy outside this house"
    fi
fi

echo "hub-files: $added new, $removed removed, $kept unchanged, $(du -sh "$MIRROR/current" | cut -f1) mirrored"
[ "$FAILED" -eq 0 ] || { echo "hub-files: one or more steps failed" >&2; exit 1; }
