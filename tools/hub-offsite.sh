#!/usr/bin/env bash
# Die nächtliche Sicherung des Hubs von e14 aus, seit er auf Metanet läuft
# (2026-11-05). Löst für den Hub ~/entrosana-wp/backup.sh ab; WordPress gibt es
# nicht mehr.
#
# Vorher, ohne dieses Skript:
#   03:20  Server (Cron): tools/hub-backup.sh schreibt api/db/hub.backup.sqlite
#   03:40  e14 (entrosana-hub-backup.timer): holt diese Kopie an denselben Platz
# Hier (entrosana-hub-offsite.timer, 03:50):
#   1. Datenbank. Die geholte Kopie prüfen, verschlüsseln (gpg, AES256, Schlüssel
#      ~/.config/entrosana-backup.key), gegen die Quelle zurücklesen. Dann nach
#      ~/entrosana-backups/hub-db/hub-<JJJJMMTT-HHMM>.sqlite.gpg, auf die T9, in
#      die Nextcloud und zu Proton Drive. Der Name trägt die Zeit, zu der der
#      Server die Kopie schrieb; ein zweiter Lauf am selben Tag legt nichts doppelt
#      an. An jedem Ort bleiben die neuesten KEEP.
#   2. Dateien der Konten. tools/hub-files-pull.sh holt sie vom Server, danach
#      spiegelt tools/hub-files-backup.sh sie je Datei verschlüsselt. Scheitert das
#      Holen, bleibt der Spiegel, wie er ist.
#
# Nur Chiffrat verlässt diesen Rechner. Jeder Schritt im Netz hat eine Frist, und
# Proton Drive kommt je Teil zuletzt: am 2026-11-04 und -05 hing ein einziger
# Upload 30 Minuten, und alles dahinter fiel aus (Befund in tools/hub-proton.sh).
# Der Ausgang ist ehrlich: fehlt ein Ziel, endet der Lauf mit 1 und meldet sich.
#
# Zurückholen:
#   gpg --batch --decrypt --passphrase-file ~/.config/entrosana-backup.key \
#       -o hub.sqlite ~/entrosana-backups/hub-db/hub-<JJJJMMTT-HHMM>.sqlite.gpg
#   sqlite3 hub.sqlite 'PRAGMA integrity_check'        # muss «ok» sagen
# Die Dateien: siehe tools/hub-files-backup.sh. Der ganze Weg: docs/restore.md.
#
# Für Proben, ohne ein Ziel zu berühren: HUB_DB_BACKUP, HUB_DB_ARCHIVES, HUB_DB_T9,
#   HUB_DB_REMOTE=0, HUB_OFFSITE_NOTIFY=0, HUB_OFFSITE_MARK, dazu die Schalter
#   HUB_FILES_* der beiden anderen Skripte.
set -uo pipefail
umask 077

TOOLS="$(cd "$(dirname "$0")" && pwd)"
DB="${HUB_DB_BACKUP:-$HOME/entrosana-app/api/db/hub.backup.sqlite}"
LOCAL="${HUB_DB_ARCHIVES:-$HOME/entrosana-backups/hub-db}"
T9="${HUB_DB_T9:-/media/g2thek/t9root/home/g2thek/entrosana-backups/hub-db}"
REMOTE="${HUB_DB_REMOTE:-1}"
NOTIFY="${HUB_OFFSITE_NOTIFY:-1}"
MARK="${HUB_OFFSITE_MARK:-$HOME/.sygnif/backup/entrosana-hub-offsite.ok}"
KEYFILE="$HOME/.config/entrosana-backup.key"
NC_ENV="$HOME/.sygnif/nextcloud.env"
NC_DIR="Bridge/from-sygnif/hub-db"
PD_DIR="/my-files/Sygnif Local/entrosana-hub-db"
KEEP=14
MAX_AGE_H=26

FAILED=()
fail() { echo "FAIL: hub-offsite: $*" >&2; FAILED+=("$1"); }
sha() { sha256sum "$1" | cut -d' ' -f1; }
# Aus einer Namensliste alles ausser den neuesten KEEP Sicherungen.
old_ones() { grep -E '^hub-[0-9]{8}-[0-9]{4}\.sqlite\.gpg$' | sort -u | head -n "-$KEEP"; }

test -s "$KEYFILE" || { echo "FATAL: hub-offsite: missing $KEYFILE, refusing to write a plaintext backup" >&2; exit 2; }

nc_url() { printf '%s/remote.php/dav/files/%s/%s' "$NEXTCLOUD_URL" "$NEXTCLOUD_BRIDGE_USER" "$1"; }
nc_code() { curl -s -m 60 -o /dev/null -w '%{http_code}' -X "$1" -u "$NEXTCLOUD_BRIDGE_USER:$NEXTCLOUD_BRIDGE_TOKEN" "$(nc_url "$2")"; }
# MKCOL: 201 angelegt, 405 gibt es schon
nc_mkcol() { local c; c="$(nc_code MKCOL "$1")"; [ "$c" = 201 ] || [ "$c" = 405 ]; }
nc_names() {
    curl -s -m 60 -X PROPFIND -H 'Depth: 1' -u "$NEXTCLOUD_BRIDGE_USER:$NEXTCLOUD_BRIDGE_TOKEN" "$(nc_url "$NC_DIR/")" \
        | grep -oE 'hub-[0-9]{8}-[0-9]{4}\.sqlite\.gpg'
}

database() {
    local check age_h name out cipher old
    [ -s "$DB" ] || { fail "no database copy at $DB"; return; }
    # mode=ro, immutable: nur lesen und keine -wal/-shm neben die Kopie legen.
    check="$(sqlite3 "file:$DB?mode=ro&immutable=1" 'PRAGMA integrity_check' 2>&1)"
    [ "$check" = ok ] || { fail "the database copy fails integrity_check: ${check:0:120}"; return; }
    # Eine alte Kopie heisst: der Cron auf dem Server oder das Holen um 03:40 fiel aus.
    # Sie wird trotzdem gesichert, soweit sie es noch nicht ist; der Lauf gilt als gescheitert.
    age_h=$(( ($(date +%s) - $(stat -c %Y "$DB")) / 3600 ))
    [ "$age_h" -le "$MAX_AGE_H" ] \
        || fail "the database copy is $age_h h old (written $(date -r "$DB" '+%Y-%m-%d %H:%M')): the server's 03:20 copy or the 03:40 fetch did not happen"

    name="hub-$(date -r "$DB" +%Y%m%d-%H%M).sqlite.gpg"
    out="$LOCAL/$name"
    mkdir -p "$LOCAL"
    find "$LOCAL" -maxdepth 1 -name 'hub-*.sqlite.gpg.tmp' -mmin +60 -delete
    if [ ! -s "$out" ]; then
        gpg --batch --yes --quiet --symmetric --cipher-algo AES256 --passphrase-file "$KEYFILE" -o "$out.tmp" "$DB" \
            && mv -f "$out.tmp" "$out" \
            || { rm -f "$out.tmp"; fail "encrypting the database copy"; return; }
    fi
    # Zurücklesen: was das Chiffrat hergibt, muss Byte für Byte die geprüfte Kopie sein.
    [ "$(gpg --batch --quiet --decrypt --passphrase-file "$KEYFILE" "$out" 2>/dev/null | sha256sum | cut -d' ' -f1)" = "$(sha "$DB")" ] \
        || { fail "$name does not decrypt to the database copy; nothing shipped"; return; }
    cipher="$(sha "$out")"

    # T9: zweite Platte am selben Ort. Keine Platte, ein Fehler.
    if [ -d "$(dirname "$T9")" ]; then
        mkdir -p "$T9"
        if [ ! -f "$T9/$name" ] || [ "$(sha "$T9/$name")" != "$cipher" ]; then
            cp -f "$out" "$T9/$name" && sync "$T9/$name"
        fi
        [ "$(sha "$T9/$name")" = "$cipher" ] && echo "hub-db: T9 ok" || fail "T9 copy of $name"
        ls -1 "$T9" | old_ones | while IFS= read -r old; do rm -f -- "$T9/$old"; done
    else
        fail "T9 not mounted"
    fi

    if [ "$REMOTE" = 1 ]; then
        # Nextcloud: steht auf diesem Rechner, also kein Ort ausser Haus.
        if [ -f "$NC_ENV" ] && command -v sygnif-nc-put >/dev/null 2>&1; then
            # shellcheck disable=SC1090
            . "$NC_ENV"
            if nc_mkcol "$NC_DIR" && timeout 300 sygnif-nc-put "$out" "$NC_DIR/$name" >/dev/null 2>&1; then
                echo "hub-db: nextcloud ok"
                nc_names | old_ones | while IFS= read -r old; do nc_code DELETE "$NC_DIR/$old" >/dev/null; done
            else
                fail "nextcloud upload of $name"
            fi
        else
            fail "nextcloud: sygnif-nc-put or $NC_ENV missing"
        fi
        # Proton Drive: die einzige Kopie, die den Verlust dieses Hauses übersteht.
        if command -v proton-drive >/dev/null 2>&1; then
            if "$TOOLS/hub-proton.sh" put "$out" "$PD_DIR"; then
                echo "hub-db: proton ok"
                "$TOOLS/hub-proton.sh" ls "$PD_DIR" | cut -f1 | sed 's/\.parts$//' | old_ones \
                    | while IFS= read -r old; do "$TOOLS/hub-proton.sh" del "$PD_DIR" "$old" || true; done
            else
                fail "Proton Drive upload of $name"
            fi
        else
            fail "proton-drive missing, the database has no copy outside this house"
        fi
    fi

    ls -1 "$LOCAL" | old_ones | while IFS= read -r old; do rm -f -- "$LOCAL/$old"; done
    echo "hub-db: $name, $(stat -c%s "$out") B, from the server's copy of $(date -r "$DB" '+%Y-%m-%d %H:%M'), $(ls -1 "$LOCAL" | grep -c '\.sqlite\.gpg$') kept here"
}

files() {
    if "$TOOLS/hub-files-pull.sh"; then
        "$TOOLS/hub-files-backup.sh" || fail "hub files mirror"
    else
        fail "hub files pull, the mirror stays as it is"
    fi
}

database
files

if [ "${#FAILED[@]}" -eq 0 ]; then
    # Erfolgsmarke nur für einen echten Lauf: eine Probe ohne Fernziele ist keine Sicherung.
    if [ "$REMOTE" = 1 ] && [ "${HUB_FILES_REMOTE:-1}" = 1 ]; then
        mkdir -p "$(dirname "$MARK")" && date -Is > "$MARK"
    fi
    echo "hub-offsite: ok"
    exit 0
fi
echo "hub-offsite: ${#FAILED[@]} step(s) failed" >&2
if [ "$NOTIFY" = 1 ] && command -v notify-gi >/dev/null 2>&1; then
    notify-gi "⚠ Hub-Sicherung (entrosana.app) unvollständig: $(printf '%s; ' "${FAILED[@]}")Protokoll: journalctl --user -u entrosana-hub-offsite -n 40" >/dev/null 2>&1 || true
fi
exit 1
