# Wiederherstellung

Was zu tun ist, wenn der Hub bricht — von der kleinsten Reparatur zur
grössten. Stand 2. August 2026.

## Wo überall etwas liegt

| Ort | Was | Wie oft | Verschlüsselt |
|---|---|---|---|
| `~/entrosana-app/.git` | jede festgehaltene Fassung des Hubs | bei jedem Commit | nein |
| `/media/g2thek/t9root/home/g2thek/entrosana-app` | Arbeitsstand im bootfähigen Klon | alle drei Tage, `sygnif-t9-sync.timer` | nein |
| `~/entrosana-backups/wp/entrosana-wp-*.tar.gz.gpg` | alles: Datenbank, wp-content, Stapel, Hub | täglich 03:30, `entrosana-wp-backup.timer` | ja, AES-256 |
| `/media/g2thek/t9root/home/g2thek/entrosana-backups/wp/` | dieselbe Datei auf der T9 | täglich, 14 Stück | ja |
| Nextcloud `Bridge/from-sygnif/` | dieselbe Datei | täglich, 14 Stück | ja |
| Cloudflare R2 | dieselbe Datei, ausser Haus | täglich | ja |

Der Schlüssel steht in `~/.config/entrosana-backup.key`. **Er liegt nur auf
diesem Rechner.** Ohne ihn ist jede Kopie ausser dem Klon auf der T9 wertlos —
siehe `~/entrosana-wp/docs/backup-key-escrow.md`.

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

```bash
cd ~/entrosana-backups/wp
NEU=$(ls -1t entrosana-wp-*.tar.gz.gpg | head -1)
gpg --batch --decrypt --passphrase-file ~/.config/entrosana-backup.key "$NEU" \
  | tar xz -C /tmp                       # ergibt vier Bündel
tar xzf /tmp/extras.tar.gz -C "$HOME" entrosana-app
systemctl --user restart entrosana-app.service
```

`extras.tar.gz` enthält ausserdem `entrosana-todo-demo/` (die Quelle der
wörtlichen Kopie in `assets/project.js`), die entrosana-Units unter
`.config/systemd/user/` und die Teile von `entrosana-site`, die in keinem
git-Baum stehen. Die Pfade sind relativ zu `$HOME`, das Auspacken mit
`-C "$HOME"` legt sie also an die richtige Stelle.

Die anderen drei Bündel: `wordpress.sql` (Datenbankabzug), `wp-content.tar.gz`
(Uploads und Erweiterungen), `stack.tar.gz` (docker-compose, .env, Theme).

## 4. Der Rechner ist weg

Die T9 ist ein bootfähiger Klon dieses Rechners, siehe
`~/BOOT-E14-FROM-T9.md`. Anstecken, davon starten, weiterarbeiten. Der Klon
hinkt höchstens drei Tage hinterher.

Ist auch die T9 weg, bleibt R2. Dafür braucht es `~/.config/entrosana-r2.env`
— die liegt selbst im Archiv, also im Zirkelschluss. Deshalb: **den Schlüssel
und die R2-Zugangsdaten ausserhalb dieses Rechners aufbewahren.**

## Prüfen, ohne etwas kaputtzumachen

Dass die letzte Sicherung sich öffnen lässt:

```bash
cd ~/entrosana-backups/wp && NEU=$(ls -1t entrosana-wp-*.tar.gz.gpg | head -1)
gpg --batch --quiet --decrypt --passphrase-file ~/.config/entrosana-backup.key "$NEU" | tar tz
```

Dass der Hub darin vollständig ist:

```bash
… | tar tz   # oben; dann im extras-Bündel nach entrosana-app/ sehen
```

Dass die beiden Zeitgeber laufen:

```bash
systemctl --user list-timers entrosana-wp-backup.timer sygnif-t9-sync.timer
```

`backup.sh` prüft sich selbst: es entschlüsselt das frisch geschriebene Archiv
und listet es auf, vergleicht die Prüfsumme der Kopie auf der T9 und endet mit
einem Fehler, sobald ein Ziel nicht erreicht wurde. Ein Lauf, der „success"
meldet, hat also wirklich überall geschrieben.
