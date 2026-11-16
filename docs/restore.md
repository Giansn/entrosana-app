# Wiederherstellung

Was zu tun ist, wenn der Hub bricht — von der kleinsten Reparatur zur
grössten. Stand 16. November 2026.

**Seit 2026-11-05 läuft der Hub auf Metanet** (`ssh metanet`, Ordner
`entrosana-app`); dort liegen die Datenbank und die Dateien der Konten. e14
hält den Arbeitsbaum, holt die Daten jede Nacht und sichert sie verschlüsselt.
WordPress gibt es nicht mehr. Die Abschnitte 1, 2 und 6 stammen aus der Zeit,
als der Hub auf e14 lief: ihre Befehle gelten für den Arbeitsbaum auf e14; was
die laufende Datenbank anfasst (Abschnitt 6), gehört heute auf den Server.

## Wo überall etwas liegt

| Ort | Was | Wie oft | Verschlüsselt |
|---|---|---|---|
| GitHub `Giansn/entrosana-app`, `~/entrosana-app/.git` | jede festgehaltene Fassung des Hubs | bei jedem Commit; e14 gleicht alle fünf Minuten ab, der Server zieht alle zwei | nein |
| Server, `entrosana-app/api/db/hub.backup.sqlite` | stimmige Kopie der Datenbank | täglich 03:20, Cron | nein |
| e14, `~/entrosana-app/api/db/hub.backup.sqlite` | dieselbe Kopie, geholt | täglich 03:40, `entrosana-hub-backup.timer` | nein |
| e14, `~/.cache/entrosana-hub-files/` | die Dateien der Konten, geholt | täglich 03:50 | nein |
| `~/entrosana-backups/hub-db/hub-<zeit>.sqlite.gpg` | die Datenbank, die neuesten 14 | täglich 03:50, `entrosana-hub-offsite.timer` | ja, AES-256 |
| `~/entrosana-backups/hub-files/` | die Dateien der Konten, je Datei; Gelöschtes 14 Tage unter `deleted/` | täglich 03:50 | ja |
| `/media/g2thek/t9root/home/g2thek/entrosana-backups/hub-db/` und `hub-files/` | dasselbe auf der T9 | täglich | ja |
| Nextcloud `Bridge/from-sygnif/hub-db/` und `hub-files/` | dasselbe; die Nextcloud steht auf e14 | täglich | ja |
| Proton Drive `/my-files/Sygnif Local/entrosana-hub-db/` und `entrosana-hub-files/current/` | dasselbe, der einzige Ort ausser Haus | täglich | ja |
| T9 als bootfähiger Klon | der ganze Rechner e14 ohne `~/.cache`: Arbeitsbaum, die geholte Datenbank und der Schlüssel | jede Nacht, `sygnif-t9-full.timer` | nein |
| `~/entrosana-backups/wp/`, dazu T9, Nextcloud und Proton Drive | Archive aus der WordPress-Zeit, das letzte vom 2026-11-05; darin der Hub, wie er damals auf e14 lief | nicht mehr | ja |

Der Schlüssel steht in `~/.config/entrosana-backup.key`. **Er liegt nur auf
diesem Rechner** und mit ihm im Klon auf der T9. Ohne ihn ist jede
verschlüsselte Kopie wertlos — siehe `~/entrosana-wp/docs/backup-key-escrow.md`.

Die Sicherung um 03:50 ist `tools/hub-offsite.sh`. Den Zeitgeber schaltet der
Eigentümer ein (`systemctl --user enable --now entrosana-hub-offsite.timer`,
die Unit steht unter `deploy/`). Ein Lauf, dem ein Ziel fehlt, endet mit einem
Fehler, meldet sich über `notify-gi` und steht in
`journalctl --user -u entrosana-hub-offsite`.

## 1. Eine Datei zurücknehmen

```bash
git -C ~/entrosana-app checkout -- assets/project.js
```

Alles seit dem letzten Commit verwerfen:

```bash
git -C ~/entrosana-app checkout -- .
```

Ältere Fassung ansehen, ohne etwas zu ändern:

```bash
git -C ~/entrosana-app log --oneline -- assets/project.js
git -C ~/entrosana-app show <commit>:assets/project.js
```

## 2. Den ganzen Hub aus dem Klon holen

Schnellster Weg, solange die T9 angesteckt ist und der letzte Abgleich jünger
ist als der Schaden:

```bash
rsync -a --delete /media/g2thek/t9root/home/g2thek/entrosana-app/ ~/entrosana-app/
systemctl --user restart entrosana-app.service
```

Wie alt der Klon ist:

```bash
sygnif-doctor t9-check
```

## 3. Aus der verschlüsselten Sicherung

Der Code kommt aus git (Abschnitt 1) oder von GitHub. Aus der verschlüsselten
Sicherung kommen die Daten: die Datenbank und die Dateien der Konten.

Die Datenbank, auf e14 entschlüsselt und geprüft. Der Klartext entsteht unter
`~/.cache`, das der Klon auf die T9 auslässt:

```bash
cd ~/entrosana-backups/hub-db && NEU=$(ls -1 hub-*.sqlite.gpg | tail -n 1)
P=$(mktemp -d -p ~/.cache)
gpg --batch --decrypt --passphrase-file ~/.config/entrosana-backup.key -o "$P/hub.sqlite" "$NEU"
sqlite3 "$P/hub.sqlite" 'PRAGMA integrity_check'                                  # muss «ok» sagen
DB_PATH="$P/hub.sqlite" node --no-warnings ~/entrosana-app/api/admin.mjs verify-chain   # die Kette
```

Wie sie auf den Server kommt, steht in Abschnitt 5; danach `rm -rf "$P"`.

Die Dateien der Konten, alle auf einmal:

```bash
cd ~/entrosana-backups/hub-files/current
find . -name '*.gpg' | while read -r f; do o="$HOME/.cache/entrosana-hub-files-zurueck/${f%.gpg}";
  mkdir -p "$(dirname "$o")"; gpg --batch --decrypt --passphrase-file ~/.config/entrosana-backup.key -o "$o" "$f"; done
rsync -rt ~/.cache/entrosana-hub-files-zurueck/ metanet:entrosana-app/api/db/files/
rm -rf ~/.cache/entrosana-hub-files-zurueck
```

Eine Datei heisst im Spiegel `<konto>/<id>.<endung>.gpg`; Konto, Nummer, Name
und SHA-256 stehen in der Tabelle `files` der Datenbank. Was vor weniger als
14 Tagen gelöscht wurde, liegt unter
`~/entrosana-backups/hub-files/deleted/<JJJJMMTT>/`.

Von Proton Drive, wenn e14 und die T9 weg sind:

```bash
proton-drive filesystem download "/my-files/Sygnif Local/entrosana-hub-db" .
proton-drive filesystem download "/my-files/Sygnif Local/entrosana-hub-files/current" .
```

Was grösser ist als 900 KiB, liegt dort als Ordner `<name>.gpg.parts/` und wird
so wieder eine Datei: `cd <name>.gpg.parts && sha256sum -c SHA256SUMS && cat part-* > ../<name>.gpg`.

Die Archive aus der WordPress-Zeit (`~/entrosana-backups/wp/`, das letzte vom
2026-11-05) öffnen sich wie bisher mit
`gpg --batch --decrypt --passphrase-file ~/.config/entrosana-backup.key <archiv> | tar xz -C <ordner>`
und ergeben vier Bündel: `wordpress.sql`, `wp-content.tar.gz`, `stack.tar.gz`
und `extras.tar.gz`. Im letzten steht `entrosana-app/`, wie es auf e14 lief,
samt `api/db/hub.backup.sqlite`, dazu `entrosana-todo-demo/`, die
entrosana-Units und die Teile von `entrosana-site`, die in keinem git-Baum
stehen; die Pfade sind relativ zu `$HOME`.

## 4. Ein Rechner ist weg

**Der Server (Metanet).** Der Hub steht still; die Daten auf e14 sind höchstens
einen Tag alt. Code: `git clone https://github.com/Giansn/entrosana-app.git`.
Daten: Abschnitte 3 und 5. Wie der Hub dort eingerichtet ist (Node, Cron,
`~/entrosana-ops/entrosana-ctl`), steht auf e14 in
`~/entrosana-metanet/PLAN-app.md`.

**e14.** Der Hub läuft weiter; es fehlen die nächtliche Sicherung und die
Konsolen. Die T9 ist ein bootfähiger Klon dieses Rechners, siehe
`~/BOOT-E14-FROM-T9.md`: anstecken, davon starten, weiterarbeiten. Der Klon
ist so alt wie die letzte Nacht, in der die T9 angesteckt war.

**e14 und die T9.** Es bleibt Proton Drive: die Datenbank der letzten 14
Nächte und jede Datei der Konten, verschlüsselt. Öffnen lässt sich das nur mit
dem Schlüssel, und der liegt auf e14 und auf der T9. Deshalb: **den Schlüssel
ausserhalb dieses Hauses aufbewahren.** R2 ist seit 2026-09-30 abgeschaltet
und kein Ort mehr.

## Prüfen, ohne etwas kaputtzumachen

Dass die letzte Sicherung der Datenbank sich öffnen lässt und stimmt: der erste
Block in Abschnitt 3.

Dass eine gespiegelte Datei der Datei auf dem Server gleicht. Dreimal derselbe
SHA-256: aus der Datenbank, vom Server und aus dem Chiffrat.

```bash
sqlite3 "file:$HOME/entrosana-app/api/db/hub.backup.sqlite?mode=ro&immutable=1" 'SELECT actor_id, id, ext, sha256 FROM files'
ssh metanet sha256sum entrosana-app/api/db/files/2/1.pdf
gpg --batch --quiet --decrypt --passphrase-file ~/.config/entrosana-backup.key \
    ~/entrosana-backups/hub-files/current/2/1.pdf.gpg | sha256sum
```

Dass die Zeitgeber laufen und der letzte Lauf durchging:

```bash
systemctl --user list-timers 'entrosana-hub-*'
journalctl --user -u entrosana-hub-offsite -n 30
```

Die Skripte prüfen sich selbst: jedes Chiffrat wird nach dem Schreiben
entschlüsselt und mit seiner Quelle verglichen, die Kopie auf der T9 mit der
Prüfsumme, und was zu Proton Drive ging, muss danach mit Grösse und SHA-1 in
der Liste stehen. Fehlt ein Ziel, endet der Lauf mit einem Fehler.

Nachweis 2026-11-16, an den echten Daten (Datenbank vom 2026-11-16 03:20, eine
Datei `2/1.pdf`): der erste Block aus Abschnitt 3 lief durch, die Kette
meldete `{"ok":true,"n":243}`, und die entschlüsselte Datenbank hat denselben
SHA-256 wie die Kopie auf dem Server. Der Dateivergleich ergab überall
denselben SHA-256: Datenbank, Server, Spiegel auf e14, T9, Nextcloud und das
letzte Paket alter Form bei Proton Drive (2026-11-03). Die Schleife aus
Abschnitt 3 lief bis vor das `rsync`; dessen Probelauf (`-n --checksum`)
meldete andere Zeiten, keinen anderen Inhalt. Nicht geprobt: das Zurückholen
der neuen Ablage von Proton Drive, dort lag an dem Tag noch nichts in dieser
Form.

## 5. Die Hub-Datenbank

Der Hub hält eine SQLite-Datei `api/db/hub.sqlite` mit Beiträgen, Akteuren,
Marken und der Kette (`audit`), seit 2026-11-05 auf dem Server. Sie läuft im
WAL-Modus, also liegen daneben `hub.sqlite-wal` und `hub.sqlite-shm`; eine
Kopie der drei mitten im Schreiben kann uneinheitlich sein. Deshalb schreibt
`tools/hub-backup.sh` dort täglich um 03:20 (Cron) eine für sich stimmige
Kopie `api/db/hub.backup.sqlite` über die SQLite-Sperre (`.backup`) und prüft
sie (`PRAGMA integrity_check`). e14 holt sie um 03:40
(`entrosana-hub-backup.timer`; die Unit steht mit ihren Zusätzen unter
`deploy/`) und sichert sie um 03:50 verschlüsselt (`tools/hub-offsite.sh`).

Zurückspielen, wenn die laufende Datei kaputt oder falsch ist. Die Kopie der
letzten Nacht liegt schon auf dem Server. Eine ältere kommt aus der
verschlüsselten Sicherung (Abschnitt 3) und mit
`scp "$P/hub.sqlite" metanet:entrosana-app/api/db/hub.backup.sqlite` dorthin.
Dann auf dem Server (`ssh metanet`):

```bash
touch ~/run/entrosana.off                      # sonst startet der Wächter die API nach einer Minute wieder
~/entrosana-ops/entrosana-ctl stop api
cd ~/entrosana-app/api/db && mv hub.sqlite hub.sqlite.kaputt-$(date +%Y%m%d-%H%M)
rm -f hub.sqlite-wal hub.sqlite-shm            # gehören zur kaputten Datei
cp hub.backup.sqlite hub.sqlite
~/nodejs/current/bin/node --no-warnings ~/entrosana-app/api/admin.mjs verify-chain   # muss "ok" und die Zeilenzahl nennen
rm ~/run/entrosana.off && ~/entrosana-ops/entrosana-ctl start api
```

Diese Folge ist auf dem Server nicht geprobt, sie hält den laufenden Hub an.
Geprobt ist alles davor (Abschnitt «Prüfen»).

Der Dienst legt beim Start die Migrationen aus `api/db/*.sql` an, die noch
fehlen (Tabelle `meta`); eine Kopie vom Vortag braucht davon in der Regel
keine. Was zwischen Kopie und Ausfall passiert ist, fehlt danach: höchstens
ein Tag Beiträge. Die Betroffenen stehen auf dem Server in
`~/.sygnif/logs/entrosana-api.log` (Pfad `/api/contributions`, Status 201),
soweit das Protokoll noch reicht (zwei Wochen, `tools/rotate-logs.sh`).

Probe ohne Eingriff: die geholte Kopie auf e14 in einen Nebenordner stellen
und die Kette dort prüfen.

```bash
P=$(mktemp -d -p ~/.cache) && cp ~/entrosana-app/api/db/hub.backup.sqlite "$P/hub.sqlite"
DB_PATH="$P/hub.sqlite" node --no-warnings ~/entrosana-app/api/admin.mjs verify-chain
rm -rf "$P"
```

## 6. Das Eigentümerkonto

Rollen liegen nur auf dem Server: in der Tabelle `roles`, vergeben und
entzogen mit `api/admin.mjs`, jede Vergabe als Zeile in der Kette. Kein Weg
über das Netz vergibt eine Rolle; wer die Maschine hat, hat die Rollen. Das
Eigentümerkonto (`gianson@pm.me`, Akteur 2) kann sich nicht selbst löschen
und wird nicht als ruhend behandelt. Drei Lagen, von leicht nach schwer:

**Zweiter Eigentümer.** Ein zweites, bestätigtes Konto (eigene Adresse, ein
Anmeldeverweis geöffnet) bekommt die Rolle auf der Maschine; sie gilt sofort,
ohne Neustart. Zurück geht es mit `revoke`.

```bash
cd ~/entrosana-app && node --no-warnings api/admin.mjs grant zweite@adresse.ch owner --by gianson@pm.me
node --no-warnings api/admin.mjs list          # Konten und Rollen nachsehen
node --no-warnings api/admin.mjs revoke zweite@adresse.ch owner
```

**Postfach verloren, Maschine da.** Der Anmeldeverweis kommt per Mail; ohne
Postfach entsteht er direkt in der Datenbank. Der Dienst erwartet den
SHA-256 der Marke in `verifications`, der Verweis lautet
`https://entrosana.app/me?verify=<Marke>` und gilt hier eine Stunde. Danach
ist das Gerät angemeldet wie nach einer Mail, und die Adresse kann unter
/me gewechselt werden. Der Vorgang steht als `verify` in der Kette, ohne
Hinweis auf den Weg; deshalb den Grund gleich als eigene Zeile anhängen.

```bash
cd ~/entrosana-app && node --no-warnings --input-type=module -e '
import { open } from "./api/db.mjs"; import { sha, newToken } from "./api/auth.mjs"; import { append } from "./api/audit.mjs";
const { db } = open(process.env.HOME + "/entrosana-app/api/db/hub.sqlite");
const tok = newToken(), now = new Date();
db.prepare("INSERT INTO verifications(email, token_hash, created, expires) VALUES (?,?,?,?)").run("gianson@pm.me", sha(tok), now.toISOString(), new Date(now.getTime() + 3600e3).toISOString());
append(db, { kind: "verify.cli", actor_id: null, resource: "actor:2", text: "sign-in link created on the machine for the owner; mailbox unavailable" });
console.log("https://entrosana.app/me?verify=" + tok);'
```

Für Aufrufe an die Schnittstelle ohne Browser gibt `node api/admin.mjs token
gianson@pm.me 7` eine Marke für sieben Tage aus (Kette: `token.cli`); sie
gehört in den Kopf `Authorization: Bearer …` und in keine Datei, die im
Baum liegt.

**Maschine weg.** Erst Abschnitt 4 (Rechner ersetzen, Sicherung
zurückspielen), dann dieser Abschnitt auf der neuen Maschine: die Rollen
kommen mit der Datenbank zurück. Zwei Schlüssel liegen absichtlich in keiner
Sicherung, weil sie sich neu erzeugen lassen: der Dienstschlüssel
`~/.config/entrosana-api.token` (Rechte 600) entsteht beim ersten Start des
Dienstes von selbst, wenn er fehlt; SYGNIF bekommt mit `node api/admin.mjs
token sygnif@entrosana.com 365` einen neuen Zugang, der in
`~/.config/entrosana-sygnif.token` (JSON) abgelegt wird.

Nachweis 2026-09-10: `grant`/`revoke` und die Marke aus `verifications`
liefen im Gate-Konto (`gate-acct@example.org`) genau so durch, siehe
`docs/leitlinien-konten.md`.
