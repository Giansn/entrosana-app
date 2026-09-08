# Beiträge: Zustände, Regeln, Rollen

Stand 2026-09-08. Gilt für alles, was über entrosana.app eingereicht wird:
Modulvorschläge, Rezensionen, Anfragen nach Runway. Eine Stelle für Zustände,
Regeln und Entscheide. Die Umsetzung in `api/` richtet sich nach diesem
Dokument, nicht umgekehrt.

## Zustände

```
received → confirmed → reviewing → admitted → published
                                 → rejected           ↑ zurücknehmen → admitted
                     ↘ withdrawn (nur aus received, confirmed, reviewing)
```

- **received**: eingegangen, E-Mail-Adresse unbestätigt. Sichtbar nur für die
  einreichende Person und die prüfende Rolle.
- **confirmed**: der Bestätigungsverweis aus der Mail wurde geöffnet. Erst
  jetzt gilt der Beitrag als eingereicht.
- **reviewing**: eine prüfende Person hat ihn übernommen.
- **admitted**: angenommen. Ein Urteil, keine Veröffentlichung.
- **published**: durch das Tor gegangen und als Katalogeintrag mit
  `draft: true`, Urheberangabe `by` und Gleis `contributed` öffentlich.
- **rejected**: abgelehnt.
- **withdrawn**: von der einreichenden Person zurückgezogen.

Jeder Übergang ist eine Zeile in der Kette (`audit`), mit Akteur, Rolle und
Zeit. Eine Entscheidung ohne Begründung wird abgewiesen, und zwar vom Endpunkt
selbst: `PATCH /api/contributions/:id` lehnt eine leere Begründung ab.

## Das Tor (seit 2026-09-08)

Nicht alles Angenommene wird veröffentlicht. Der Übergang `admitted → published`
ist eine eigene Handlung mit eigener Begründung, und `publishChecks()`
(`api/contributions.mjs`) hält ihn zu, solange ein Mangel besteht: kein Name
zum Veröffentlichen, keine Annahme in der Kette, Trail stimmt nicht, Bereich
ungültig, Titel fehlt, Vorschlag unter 40 Zeichen, Dateiverweis nicht `https`.
Die Konsole zeigt die Liste vor dem Knopf; der Dienst antwortet `409` mit
denselben Gründen. `published → admitted` nimmt den Eintrag wieder aus dem
Katalog.

Die Entscheidung liegt beim Eigentümer und einem ausgewählten Team: das Team
trägt die Rolle `reviewer`, vergeben allein vom Eigentümer. Zweite Lesung:
`decided_by` und `published_by` stehen im Datensatz; sind es dieselbe Person,
steht das in der Kettenzeile und die Konsole sagt es. Mit `FOUR_EYES=strict` in
der Unit des Dienstes wird daraus eine Abweisung, sobald das Team mehr als eine
Person zählt.

## Namensnennung und Löschung

Bei der Einreichung wählt die Person, ob ein veröffentlichtes Modul beim Löschen
ihrer Daten unter ihrem Namen stehen bleibt (`attribution`: `keep`) oder mit
hinausgeht (`remove`, Vorgabe). Die Wahl lässt sich auf der Statusseite ändern
(`PATCH` mit `attribution`, nur Eigenes) und beim Löschen je Modul noch einmal
treffen. `DELETE /api/me` (nur Akteure der Art `email`, ohne Rollen) löscht
Adresse, Marken, Bestätigungen und alle nicht veröffentlichten Beiträge; ein
veröffentlichtes Modul bleibt nur mit dieser Wahl, dann bleibt auch der Name.
Die Kettenzeilen bleiben, ohne Personendaten.

## Veröffentlichte Regeln

Wörtlich von entrosana.app/modules (`modules.html`, Zeilen 100 bis 105, Stand
2026-09-08):

«Module proposals are wanted from educators, social workers, nature lovers,
technical enthusiasts, parents, organisations and so on. You bring the idea, we
fill the gaps in collaboration with you. We review each module thoroughly before
it gets published.»

«We do not accept content with a commercial or a religious intentions.»

Aus dem Plan, auf /modules noch **nicht** veröffentlicht: angenommene Beiträge
stehen unter AGPL-3.0 und tragen den Namen der einreichenden Person. Bevor
Phase 3 den ersten Beitrag annimmt, gehört dieser Satz auf die Seite, sonst
verspricht das Formular etwas, das die Seite nicht sagt.

## Rollen

Alles, was nicht aufgeführt ist, ist verweigert.

| Handlung | anonym | einreichend (eigene) | prüfend | Eigentümer |
|---|---|---|---|---|
| Beitrag einreichen | ja | ja | ja | ja |
| Beitrag lesen | nein | ja | ja | ja |
| zurückziehen | nein | ja, nur offen | nein | ja |
| entscheiden, mit Begründung | nein | nein | ja | ja |
| durch das Tor veröffentlichen, zurücknehmen | nein | nein | ja | ja |
| Namensnennung wählen | nein | ja, eigene | nein | ja |
| eigene Daten löschen | nein | ja | nein | nein |
| Rolle vergeben | nein | nein | nein | ja |

Später, ohne Änderung an der Annahme: `editor` (nur Katalogtexte), `school`
(liest die eigenen Anfragen, über `org_id`), `teacher`, `parent`, `learner`.
Jede dieser Rollen ist eine Zeile in `roles` und ein Eintrag in der Regel,
kein neues Schema. Die Spalte `org_id` und die Akteursart `account` warten
dafür schon.

### Konto: Sammler und Beitragende (2026-09-08, abends)

Entscheid des Eigentümers: «contributor and contributions have to be approved.
collectors can just register for now.» Umsetzung:

- **Sammler** ist, wer eine Adresse bestätigt hat (`GET /api/verify`, Marke 30
  Tage). Anmeldung über `/me`: Adresse nennen, `POST /api/verify/request` mit
  `purpose:"login"`, der Verweis führt auf `/me?verify=…` statt auf die
  Statusseite. Sammler halten Projekte und Records auf dem Gerät, senden
  Vorschläge und verfolgen sie. Keine Freigabe nötig.
- **Beitragende** ist eine Rolle (`contributor`, Migration 007), die das Team
  vergibt. Weg: Bewerbung unter `/me` (`POST /api/me/apply`, Text 20 bis 2000
  Zeichen, Name vorher gesetzt, eine offene je Konto; das Postfach
  sygnif@entrosana.com erfährt davon), Entscheid in der Konsole unter
  `/applications` (`PATCH /api/applications/<id>` mit `outcome` und Begründung,
  Rolle reviewer oder owner). Freigabe legt die Rolle an und schreibt der Person
  eine Mail; Ablehnung ebenso, mit Begründung, Bewerbung später wieder möglich.
- **Das Tor kennt den Stand:** `publishChecks()` verlangt seit 007 «submitter
  approved as contributor» (reviewer und owner gelten als freigegeben). Ein
  angenommener Beitrag eines Sammlers bleibt bei `admitted`, bis die Person
  freigegeben ist; die Konsole zeigt es in der Torliste.
- Weiteres unter `/me`: Name setzen (`PATCH /api/me`), Abmelden auf diesem Gerät
  (`DELETE /api/me/token`, löscht nur die vorgelegte Marke), Daten laden und der
  Weg zur Löschung. Der Kontoblock der Leiste zeigt Name und Stand aus der Marke.
- Kettenzeilen: `application.open`, `application.approved|declined`,
  `application.mail`, `profile.name`, `signout`. Geprüft in
  `api/test/applications.test.mjs`.

## Entscheide des Eigentümers vom 2026-09-08

1. **Der Hub bekommt einen schreibenden Server.** `api/` auf `127.0.0.1:4324`
   (Port frei, `ss -ltnp` am 2026-09-08), `node:http` und `node:sqlite`, ohne
   Fremdabhängigkeiten. Über den Tunnel als Pfadregel `^/api/.+` vor der
   Auffangregel, nach dem Vorbild der arboro-Regeln
   (`~/.cloudflared/config.yml`, Zeilen 16 bis 42).
2. **Prüfende Rolle beim Start:** eine Person, der Eigentümer, mit der Regel,
   dass jede Annahme vor der Veröffentlichung eine zweite Lesung erhält. Eine
   zweite prüfende Person ist eine Zeile in `roles`.
3. **Dateien in Phase 6a:** nur Verweise, gehostet durch die einreichende
   Person. Die Mediathek von entrosana.com bleibt den Modulen vorbehalten, die
   der Eigentümer selbst veröffentlicht. Ein eigener Ablageort (6b) kommt später.
4. **Sichtbarkeit offener Beiträge:** niemand ausser einreichender und
   prüfender Person. `org_id` wird ab Phase 3 dennoch erhoben (nullable), damit
   Schulen später per Regel und nicht per Migration Einblick in ihre eigenen
   Anfragen erhalten.
5. **Begrenzung für `POST /api/contributions`:** höchstens 5 Einreichungen je
   Stunde und IP-Adresse sowie 5 je Stunde und E-Mail-Adresse. Das ist eine
   neue Regel. Auf entrosana.com wurde kein bestehendes Limit gefunden
   (`grep` über `contact-send.py`, `mu-plugins/` und `theme/`, 2026-09-08).

## Bestätigung per Mail (Phase 2, gebaut am 2026-09-08)

Wer einreicht, nennt eine E-Mail-Adresse. `POST /api/verify/request` legt eine
Bestätigung an (Zufallswert aus 32 Bytes, gespeichert nur als SHA-256, eine
Stunde gültig) und schickt den Verweis an diese Adresse. Der Versand läuft über
`tools/mail-send.py`, ein Geschwister von `contact-send.py`: dieselben
Zugangsdaten aus `~/.config/entrosana-smtp.env`, aber mit frei wählbarem
Empfänger und Betreff; `contact-send.py` schreibt immer an `MAIL_TO` und bleibt
für das Formular auf entrosana.com unverändert.

`GET /api/verify?token=…` verbraucht den Verweis, legt den Akteur an
(`actors.kind = 'email'`) und gibt eine Zugangsmarke aus, 30 Tage gültig,
ebenfalls nur als Hash gespeichert. Die Marke geht als
`Authorization: Bearer …` mit; `GET /api/me` sagt, wer man ist. Bis Phase 4 eine
Seite dafür baut, zeigt der Verweis die Antwort als JSON.

Der Dienstakteur `admin` (Rolle `reviewer`) weist sich mit der Kopfzeile
`X-Entrosana-Token` aus, deren Wert in `~/.config/entrosana-api.token` liegt
(0600, beim ersten Start erzeugt), nach dem Muster von `admin-app.py`. Rollen
vergibt der Eigentümer auf der Maschine: `node api/admin.mjs grant <email> <role>`;
jede Vergabe ist eine Zeile in der Kette. Die Kette prüft
`GET /api/audit/verify` (prüfende Rolle oder Eigentümer) und
`node api/admin.mjs verify-chain`.

Begrenzung: 5 Anfragen je Stunde und IP-Adresse sowie je Adresse, gezählt im
Speicher des Prozesses (`api/server.mjs`, `RATE`). Ein Neustart setzt die Zähler
zurück; Phase 3 entscheidet, ob sie in die Datenbank gehören.

## Annahme (Phase 3, gebaut am 2026-09-08)

`POST /api/contributions` ist öffentlich. Angenommen wird `kind = module` mit
`email`, `name`, `title`, `area`, `summary`, `trail` (Markdown des Record-Trails)
und `files` (nur Verweise, `https`, höchstens 10; Entscheid 3). Grenzen: Titel
3 bis 160 Zeichen, Zusammenfassung bis 4000, Trail bis 12 000, Name bis 120,
Anfrage bis 32 KB (`api/contributions.mjs`, `LIMITS`; `api/server.mjs`,
`BODY_CAP`). Ein leeres Feld `website` ist die Honigfalle: ist es gefüllt, wird
nichts gespeichert, die Antwort ist trotzdem `202`, und die Kette erhält eine
Zeile `spam.honeypot` ohne Personendaten.

Die sechs ungültigen Eingaben, die das Gate prüft (`api/test/contributions.test.mjs`):
fehlende Adresse, ungültige Adresse, leerer Titel, Bereich ausserhalb von
`social, nature-based, technical, other`, Zusammenfassung über 4000 Zeichen,
Datei-Verweis ohne `https`. Jede Abweisung nennt den Grund (`400`, `error`).

Der Beitrag entsteht als `received`, der Akteur zur Adresse wird angelegt, falls
neu, und der Bestätigungsverweis geht per Mail hinaus (`startVerification`). Der
Verweis stellt alle offenen Beiträge dieser Adresse auf `confirmed` und gibt die
Zugangsmarke aus. Wer schon eine gültige Marke für dieselbe Adresse mitschickt,
reicht direkt als `confirmed` ein.

Lesen: `GET /api/contributions` zeigt der prüfenden Rolle und dem Eigentümer die
Schlange (`?status=` filtert), allen anderen nur Eigenes; `GET /api/contributions/:id`
folgt `can(actor, 'read')`. Entscheiden: `PATCH /api/contributions/:id` mit
`status` und `reason`; erlaubt sind `confirmed → reviewing`,
`reviewing → admitted | rejected` (prüfende Rolle, Begründung ab 3 Zeichen
Pflicht) und `received | confirmed | reviewing → withdrawn` (einreichende
Person für Eigenes, Eigentümer für alles). Jeder Übergang ist eine Kettenzeile
`contribution.<zustand>` mit Akteur und Begründung. Alles andere ist `409`.

## Einreichen (Phase 4, gebaut am 2026-09-08)

Eigene Seite `/contribute/submit?seed=…` (`submit.html`, `assets/submit.js`),
absichtlich unabhängig von der Projektansicht: `/project` wird von `project.js`
gezeichnet, einem Vorführ-Projekt mit eigenem Speicher
(`entrosana-todo-demo:v3`), und hat kein `#project-view` mehr. Die Seite
benutzt die schmale Nahtstelle `window.__hub` aus `app.js` (`state`, `save`,
`record`, `say`, `markdown`, `download`, `paint`). Liegt zur Saat eine Hub-Datei
auf dem Gerät, werden Titel, Schritte und Aufzeichnungen vorbelegt und Schritt 6
«Submit to the Hub» wird nach dem Senden abgehakt und in die Kette geschrieben;
sonst arbeitet das Formular leer.

Gesendet werden Name, Adresse, Titel, Bereich, Vorschlag, höchstens ein
Dateiverweis, der Markdown-Export der Datei (`trail`) sowie der Trail als Daten:
die vollen Zeilen dieses Projekts mit ihrer Stelle `i` und von der ganzen Kette
des Geräts **nur die Hashes** (`chain`). Der Server rechnet jede Zeile nach
(`verifyTrail`, `api/contributions.mjs`) und speichert `trail_ok` (1 stimmt,
0 stimmt nicht, NULL nichts mitgeschickt). Inhalte anderer Projekte verlassen
das Gerät nicht. Grenzen: 4000 Hashes, 400 Zeilen, 256 KB.

Die Rückmeldung hat drei Ausgänge in den Farben des Vorrats: gesendet
(`--verify`), abgewiesen mit Grund (`--warn`), Server nicht erreichbar
(`--muted`). Im dritten Fall bleibt der alte Weg sichtbar: Datei herunterladen
und an sygnif@entrosana.com mailen, das Beitragspostfach (seit 2026-09-08 registriert, von SYGNIF sortiert). Nichts, was heute geht, hört auf zu gehen.

`/contribute/status` (`status.html`, `assets/status.js`) löst den Verweis aus
der Mail ein (`?verify=`), legt die Zugangsmarke im Browser ab
(`entrosana-app:token`, 30 Tage), zeigt eigene Beiträge und zu `?id=` den Stand
mit Begründung, und führt zum Einreichen. Zurückziehen geht dort, solange der
Beitrag offen ist. Der Verweis in der Mail zeigt auf diese Seite.

Auf der Maschine gibt `node api/admin.mjs token <email> [tage]` eine Marke ohne
Mail aus, für Prüfung und Eigentümer; auch das ist eine Kettenzeile.

Am Rand fügt Cloudflare in jede HTML-Antwort ein Inline-Skript für seine
Bot-Erkennung ein (`/cdn-cgi/challenge-platform/…`). Die Regel `script-src 'self'`
blockiert es; für den Hub folgenlos, aber die Erkennung läuft damit nicht. Das
ist eine Zoneneinstellung, keine Datei im Baum.

Umbau vom 2026-09-08, abends (Durchsicht, `docs/handoff-design.md` §11): eine
Spalte auf 560 px, drei Gruppen (Wer, Vorschlag, Dateien und Daten), jedes Feld
mit `for`/`id` und `aria-describedby`, Prüfung vor dem Senden (Name ≥ 2, Adresse,
Titel ≥ 3, Vorschlag nicht leer und nicht nur die Vorlage, Verweise nur https),
Rückmeldung in einer `role="status"`-Zeile. Dateien kommen als Zeilen «Name
https://…» in einem Feld; die Beschriftung wird, wenn sie fehlt, aus dem letzten
Pfadteil oder dem Hostnamen abgeleitet; höchstens 10, wie `validate()` im Dienst
verlangt. Am Dienst ändert sich nichts: `files` bleibt `[{label, url}]`.

## Prüfkonsole (Phase 5, gebaut am 2026-09-08)

Kein viertes Verwaltungswerkzeug: `admin-app.py` auf `:8396` (Tailnet, Cookie
`eaa`) hat einen Abschnitt «Beiträge» bekommen. Die Übersicht zeigt die Schlange
mit Filter nach Zustand (`/contributions?status=`), die Detailseite
(`/contributions/<id>`) Fakten, Vorschlag, Dateiverweise, die Aufzeichnungen
der einreichenden Person mit Stelle und Siegel, die Datei als Text und den
Stand der Serverkette. Die Verwaltung entscheidet nicht selbst, sie ruft `api/`
auf `127.0.0.1:4324` als Dienstakteur auf (`X-Entrosana-Token` aus
`~/.config/entrosana-api.token`, Rolle `reviewer`).

Das Formular kennt nur die erlaubten Übergänge (`confirmed → reviewing`,
`reviewing → admitted | rejected`) und schickt ohne Begründung nichts ab; die
Verwaltung prüft das vor dem Aufruf (`contrib_decide`, «Begründung fehlt»), und
der Dienst würde es ohnehin abweisen (`PATCH`, `reason required`). Jede
Entscheidung erscheint in der Kette mit Akteur 1 (`service admin`) und
Begründung.

## Veröffentlichung (Phase 6, gebaut am 2026-09-08)

Veröffentlicht wird, was durch das Tor geht: beim Übergang nach `published`
schreibt `api/publish.mjs` einen Eintrag in `assets/catalogue.js`: Abschnitt
`modules`, Gleis `contributed` (wird beim ersten Mal angelegt), `state: draft`,
`draft: true`, `by` mit dem Namen der einreichenden Person, Titel, Bereich,
der Vorschlag als `about`, Dateiverweise als `downloads`. Der Slug entsteht aus
dem Titel und ist eindeutig (`-2`, `-3` bei Wiederholung). Die Datei wird nicht
neu erzeugt, sondern der Eintrag wortgetreu vor die schliessende Klammer der
Liste eingefügt, mit der Einrückung des letzten Eintrags; vorher wird eine
Kopie nach `~/entrosana-app-backups/` gelegt. Der Test
(`api/test/publish.test.mjs`) verlangt, dass Anhängen und Entfernen die Datei
Byte für Byte wiederherstellen, bis auf die eine Gleiszeile.

`serve.mjs` kennt die Detailrouten nicht mehr als Zeilen: `deriveRoutes()` liest
den Katalog im Sandkasten (`node:vm`) so, wie der Browser ihn liest, und leitet
`/modules/<slug>`, `/tools/<slug>`, `/contribute/<slug>` daraus ab; ändert sich
die Datei, wird innerhalb von 5 Sekunden neu abgeleitet. Die Allowlist bleibt:
ein Slug ausserhalb des Katalogs ist 404. Die Sitemap folgt derselben Ableitung
und lässt Entwürfe aus. Ein neuer Eintrag braucht damit weder einen Eingriff in
`serve.mjs` noch einen Neustart (Gate 6, geprüft am 2026-09-08 mit #2 und #1).

`detail.js` zeigt «Contributed by …», `cards.js` «by …» (`.mod__by`,
`.mcard__by`). Rückzug oder Ablehnung eines veröffentlichten Beitrags nimmt den
Eintrag wieder heraus (`removeEntry`); auf der Maschine gehen
`node api/admin.mjs publish <id>` und `unpublish <id>`. Jede Entscheidung geht
per Mail an die einreichende Person, mit Begründung und, bei Annahme, dem
Verweis auf die Seite; die globale Obergrenze von 60 Briefen je Stunde gilt
auch dafür.

Weil die Veröffentlichung den Namen trägt, ist der Name seit dieser Phase bei
der Einreichung Pflicht (`validate`, «name missing»).

## Anfragen (2026-09-08, abends)

Wer etwas braucht statt etwas bringt, fragt an: `/request` (`request.html`,
`assets/request.js`), ohne Konto und ohne Marke. Felder: Name, Adresse,
Organisation (optional), Art (module, track, tool, service, other; `?kind=`
belegt die Auswahl vor, so verweist «Request a module» auf `/modules`), Text.
`POST /api/requests` prüft (Name ≥ 2, Adresse, Text ≥ 10), drosselt wie die
Beiträge (5 je Stunde je Adresse und je IP), legt die Zeile in `requests`
(Migration 008) ab, schreibt `request.received` in die Kette, mailt den Text an
info@entrosana.com (`INFO_INBOX`) und der anfragenden Person eine kurze
Bestätigung ohne fremden Text. Der Eingang bleibt 180 Tage (`purge`), damit
nichts verloren geht, wenn eine Mail nicht ankommt. Die Telefonnummer
077 529 73 01 steht auf `/contribute`, im Formular und in der Bestätigung als
dritter Weg für Beiträge und Anfragen (Wunsch des Eigentümers, 2026-09-08).

## Verwaltung im Tailnet (2026-09-08, abends)

Zwei Konsolen, beide nur aus dem Tailnet erreichbar (`_src_ok()`: Loopback und
100.64.0.0/10), beide seit heute **ohne Schlüssel** für Geräte im Tailnet
(Entscheid des Eigentümers: «open decider platform to devices in tailnet without
further auth»; `TAILNET_OPEN = True` in beiden Skripten, der Schlüssel bleibt als
zweiter Weg). Tailscale Serve und Funnel leiten nichts auf diese Ports.

| Konsole | Adresse | Was |
|---|---|---|
| Hub-Konsole (`~/entrosana-app/admin-app.py`) | http://100.115.236.97:8396/ | alles zum Hub: `/contributions` Beiträge prüfen, annehmen, veröffentlichen; `/applications` Bewerbungen freigeben oder ablehnen; `/accounts` Konten mit Profil, Stand, Rollen, Geräten; `/requests` Anfragen mit «erledigt»-Marke (`PATCH /api/requests/:id`); `/checklists` Projektvorlagen (seeds.js); `/page/<name>.html` Seitentexte; `/catalogue/<slug>` Karten; `/design` Gestaltung |
| Site-Editor (`~/entrosana-site/admin.py`) | http://100.115.236.97:8393/ | nur entrosana.com (WordPress-Texte, Fusszeile, Gestaltung der Live-Seite); eine Zeile zeigt auf die Hub-Konsole. Die Hub-Schicht, die am 2026-09-08 hier lag, wurde am 2026-09-09 nach :8396 gezogen, damit die Backends von .com und .app getrennt bleiben |

Beide sprechen mit dem Dienst über die Dienstmarke (`~/.config/entrosana-api.token`,
Rolle reviewer); Rollen vergibt allein `node api/admin.mjs grant`. Neue
Team-Endpunkte: `GET /api/actors` (Konten mit Profil und Stand), `GET /api/requests`
(offene, `?all=1` alle), `PATCH /api/requests/<id>` (`handled`). Migration 010.

## Profil (2026-09-08, abends)

Unter `/me`, Abschnitt «Edit profile» (offen, solange kein Name steht): Name,
Organisation oder Schule, Rolle (teacher, student, parent, social-worker,
developer, researcher, other), eine Zeile (280 Zeichen), Website (https),
Sprachen (alle nach ISO 639-1, 183 Codes, dazu gsw für Schweizerdeutsch, höchstens 12; Wähler mit Buchstabenleiste A–Z, Tippen filtert, Enter fügt hinzu; Liste in `api/languages.mjs`, für den Browser erzeugt als `assets/languages.js`). `PATCH /api/me` setzt nur, was mitkommt; leer löscht.
Migration 009 (fünf Spalten in `actors`), Export und Löschung umfassen sie.
Darunter, dem Dreischritt von LearningView folgend (planen, begleiten,
reflektieren): **Tasks** (Projekte dieses Geräts mit erledigt/gesamt und
nächstem Schritt, aus der Hub-Datei und dem Brett), **Documents** (eigene
Vorschläge mit Stand und Dateiverweisen, Hub-Dateien als .md, Weg zum Trail),
**Journal** (die letzten sechs Records des Geräts). Alles Gerätebezogene bleibt
auf dem Gerät; der Dienst sieht nur Profil und Vorschläge.

## Profilbild, Journal, öffentliches Profil, Suche (2026-09-09, nachts)

- **Profilbild** (Migration 012): der Browser verkleinert das gewählte Bild auf
  256 × 256 px und sendet es als JPEG (`POST /api/me/avatar`, JSON mit base64,
  höchstens 300 KB entpackt, Magic Bytes für JPEG, PNG, WebP). Es liegt als BLOB
  im Konto, wird unter `/api/avatars/<id>` ausgeliefert (`Cache-Control: public,
  max-age=300`, ETag) und erscheint in der Leiste, unter `/me` und auf der
  öffentlichen Profilseite. `DELETE /api/me/avatar` entfernt es; die Löschung des
  Kontos ebenso.
- **Journal** (Migration 011, `api/journal.mjs`): geschriebene Einträge (bis 2000
  Zeichen), je Eintrag öffentlich oder privat (Voreinstellung öffentlich, mit
  Schalter «Visible on my public profile»). `GET/POST /api/me/journal`,
  `PATCH/DELETE /api/me/journal/<id>`; Drossel 60 Einträge je Stunde. Kettenzeilen
  `journal.add|edit|delete`. Unter `/me` heisst der frühere Block «Journal»
  jetzt «Records on this device».
- **Öffentliches Profil** `/p/<id>` (`profile.html`, `assets/profile.js`, Route
  per Muster in `serve.mjs`; `GET /api/profiles/<id>`): Name, Stand, Bild,
  Rolle, Organisation, eine Zeile, Website, Sprachen, seit wann, veröffentlichte
  Module, öffentliche Journaleinträge. Ohne Adresse, ohne Marke lesbar; nur für
  Konten mit Namen, sonst 404.
- **Suche** (`assets/search.js`, Knopf in der Pille auf allen 14 Seiten, ⌘K oder
  Ctrl+K): eine Palette als `<dialog>`. Treffer sofort aus dem Browser (Seiten,
  Katalog aus `window.__catalogue`, bei Bedarf nachgeladen, Projekte des Geräts),
  nach 160 ms ergänzt vom Dienst (`GET /api/search?q=`: Personen, öffentliche
  Journaleinträge, veröffentlichte Module; `api/journal.mjs::searchPublic`, LIKE
  über Name, Organisation, Zeile, Text, Titel; ab zwei Zeichen, höchstens 8 je
  Gruppe). Tastatur: Pfeile, Enter, Esc. Der Dienst protokolliert nur den Pfad,
  nie die Frage; der Browser speichert nichts (Vorbild Brave).
- **Brett am Telefon** (`assets/project.js`, `project-shell.css`): HTML5-Drag
  feuert auf Berührung nicht. Der Griff ⠿ (44 px) hebt die Karte sofort, ein
  langer Druck (350 ms) auf die Karte ebenso; ein Schatten folgt dem Finger, die
  Bahn unter dem Finger wird markiert, das Brett rollt am Rand mit. Wischen quer
  über die Karte (auch über den Titel) schiebt sie eine Bahn weiter; der
  folgende Klick wird unterdrückt, der Fokus genommen. Eine Bahnenleiste über dem
  Brett rollt zur gewählten Bahn und markiert die sichtbare. Geprüft mit
  emulierter Berührung (CDP `Input.dispatchTouchEvent`).

## Postfach

Beiträge und Antworten laufen über `sygnif@entrosana.com`, registriert am
2026-09-08, sortiert von SYGNIF. Jede Mail des Hubs trägt diese Adresse als
`Reply-To` (`tools/mail-send.py`, überschreibbar mit `MAIL_REPLY_TO` in
`~/.config/entrosana-smtp.env`); Absender bleibt das SMTP-Konto `info@`. Das
Formular auf entrosana.com und `contact-send.py` sind davon nicht berührt. Der
Katalogeintrag «Propose a track» nennt noch `info@entrosana.com` als Ziel; das
ist ein Text des Eigentümers im Katalog.

### Was wohin gemeldet wird (2026-09-08, abends)

| Ereignis | Mail an | Inhalt |
|---|---|---|
| Beitrag bestätigt (Verweis geöffnet) | sygnif@entrosana.com (`INBOX`) | Nummer, Titel, Bereich, Person, Verweis in die Konsole `/contributions/<id>` (Tailnet) |
| Bewerbung als Beitragende | sygnif@entrosana.com | Name, Adresse, Text, Verweis in die Konsole `/applications` |
| Anfrage (`/request`) | info@entrosana.com (`INFO_INBOX`) | Name, Adresse, Organisation, Art, Text; die Person bekommt eine kurze Bestätigung |
| Entscheid zu Beitrag oder Bewerbung | die betroffene Person | Ausgang und Begründung des Teams |

Der Weg einer Freigabe, Stand heute: Konto anlegen (Mail-Verweis, ohne Freigabe)
→ unter `/me` als Beitragende bewerben → Mail an sygnif@ → Konsole
`/applications`, freigeben oder ablehnen mit Begründung → Mail an die Person.
Vorschläge: `/contribute/submit` → Bestätigungsverweis an die Person → Mail an
sygnif@ → Konsole `/contributions/<id>`: in Prüfung, annehmen oder ablehnen mit
Begründung → Mail an die Person → Tor (Name, Freigabe als Beitragende, Trail,
Bereich, Titel, Vorschlag, Dateiverweise) → veröffentlichen → Mail an die Person.
Wer entscheidet: Rolle reviewer oder owner; vergeben mit
`node api/admin.mjs grant <email> reviewer`. Kettenzeilen `review.mail`,
`application.mail`, `request.mail`, `decision.mail` halten fest, ob eine Mail
hinausging.

## Betrieb (Phase 7, gebaut am 2026-09-08)

Drei Timer unter `~/.config/systemd/user/` (Vorlagen in `deploy/`), alle mit
`Persistent=true`, Protokoll je Lauf in `~/.sygnif/logs/entrosana-hub-ops.log`:

| Timer | wann | was |
|---|---|---|
| `entrosana-hub-purge.timer` | täglich 03:10 | `node api/admin.mjs purge`, Fristen unten |
| `entrosana-hub-backup.timer` | täglich 03:20 | `tools/hub-backup.sh`: `sqlite3 .backup` nach `api/db/hub.backup.sqlite`, `integrity_check`; zehn Minuten vor `entrosana-wp-backup.timer` (03:30, Streuung 300 s), das den Ordner verschlüsselt sichert |
| `entrosana-hub-rotate.timer` | Montag 04:00 | `tools/rotate-logs.sh`: `entrosana-api.log` und `entrosana-services-snapshot.log` nach `.1`/`.2`, also 14 Tage |

Zurückspielen der Datenbank: `docs/restore.md`, Abschnitt 5; Probe am
2026-09-08 gelaufen. Die Drosseln (5 je Stunde je Adresse und je IP,
`MAIL_CAP` 60 Mails je Stunde) leben im Speicher des Prozesses und beginnen
bei jedem Neustart bei null; das ist bekannt und für die erwartete Last
(einstellige Beiträge je Woche) hingenommen.

## Personendaten

Ein Beitrag enthält Name, E-Mail-Adresse und den Record-Trail der einreichenden
Person. Was gespeichert wird, wie lange, und der Weg zur Löschung stehen als
Entwurf in `docs/privacy-hub.md`; der Eigentümer fügt den Text in
entrosana.com/privacy/ ein, bevor der erste fremde Beitrag angenommen wird.

Fristen, angewandt von `api/maintenance.mjs` (`purge`, täglich 03:10, geprüft
in `api/test/maintenance.test.mjs`):

- `received` älter als 7 Tage: Beitrag samt Trail und Dateiliste gelöscht.
- Akteure der Art `email` ohne Beitrag, Rolle und gültige Marke, älter als 7 Tage: gelöscht.
- Bestätigungsverweise (1 h gültig) und Zugangsmarken (30 Tage gültig): 7 Tage nach Ablauf gelöscht.
- Kettenzeilen (`audit`) bleiben; sie tragen Kennungen, keine Adressen. Ein Lauf, der etwas löscht, schreibt eine Zeile `purge` mit den Zahlen.
- Das Zugriffsprotokoll `entrosana-api.log` trägt Client-Adressen und reicht 14 Tage.

Selbstbedienung unter `/contribute/status` (mit Marke, nur Eigenes):

- Zurückziehen (`PATCH status=withdrawn`, offene Zustände): Zeile bleibt als `withdrawn`.
- Löschen (`DELETE /api/contributions/<id>`, Zustände received/confirmed/reviewing/withdrawn/rejected; der Eigentümer darf es auch): Zeile weg, eine Kettenzeile `contribution.deleted` bleibt. Angenommene und veröffentlichte Beiträge gehen nur über die Löschung des Kontos.
- Herunterladen (`GET /api/me/export`): Akteur, eigene Beiträge mit Records und Dateiliste, Kettenzeilen zu den eigenen Beiträgen, Marken ohne Hash; als JSON-Datei. Schreibt eine Kettenzeile `export`.
- Konto löschen (`DELETE /api/me`, Abschnitt «Namensnennung und Löschung»).

## Module nach der Veröffentlichung (2026-09-09)

Ein veröffentlichter Beitrag wird ein Eintrag der Spur `contributed` in `assets/catalogue.js`, ohne Entwurfsmarke,
mit Stand `development`. Die Beitragenden eines Moduls stehen in `module_contributors`; die erste Person ist die
einreichende. Jede eingetragene Person und das Team bearbeiten Titel, Zeile, Kernsatz, Beschreibung, Zusatz und
Stand unter https://entrosana.app/me/modules; weitere Beitragende werden über die E-Mail eines freigegebenen Kontos
eingetragen, mindestens eine Person bleibt. Die Karte nennt alle («by A, B»). Punkte: ein Punkt je Konto und Modul,
umschaltbar auf der Detailseite. Meldungen zu einem Modul gehen über das Anfrageformular (`kind: report`) an
sygnif@entrosana.com und stehen in der Konsole unter Anfragen. Annahme und Veröffentlichung sind seit dem
2026-09-09 ein Schritt («annehmen und veröffentlichen»); «nur annehmen» bleibt möglich. Die Schlange gibt es auch
in der Gestaltung des Hubs unter https://entrosana.app/review (Eigentümer, Prüfende).

