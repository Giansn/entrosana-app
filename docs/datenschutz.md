# Datenschutzerklärung für entrosana — Arbeitsfassung zum Einfügen

Stand 2026-09-08, spät. Zwei vollständige Fassungen, Englisch für
entrosana.com/privacy (die Seite ist englisch) und Deutsch für Schulen und
Behörden. Beide sagen dasselbe. Vorweg, was der Eigentümer vor dem Einfügen
erledigt, dann die Texte, dann das Bearbeitungsverzeichnis.

Kein Rechtsrat: Die Fassung folgt den Informationspflichten nach Art. 19 DSG
(Bundesgesetz über den Datenschutz vom 25. September 2020, in Kraft seit
1. September 2023) und, wo Personen im EU/EWR-Raum betroffen sind, Art. 13 DSGVO.
Eine Einzelfirma braucht weder Datenschutzberater (Art. 10 DSG, freiwillig) noch
ein Bearbeitungsverzeichnis (Art. 12 Abs. 5 DSG, Befreiung unter 250
Mitarbeitenden ohne hohes Risiko); das Verzeichnis unten ist trotzdem geführt,
weil es die Auskunft nach Art. 25 DSG in 30 Tagen möglich macht. Eine
Datenschutzerklärung ist keine Vereinbarung, sondern eine Information; bindend
wird sie dadurch, dass sie stimmt. Deshalb steht hinter jeder Zahl, woher sie
kommt.

## Vor dem Einfügen

1. **Platzhalter füllen**: Firmenbezeichnung der Einzelfirma (Handelsregister
   oder «entrosana, Gianluca Kühne»), Strasse, PLZ Ort, UID (CHE-…). Steht in
   beiden Fassungen in eckigen Klammern.
2. **Protokolle von entrosana.com begrenzen.** Die Container `entrosana-wp-wordpress-1`
   und `entrosana-edge` schreiben Zugriffsprotokolle mit Client-Adressen in
   Docker-JSON-Dateien ohne Grenze (`docker inspect`: `json-file`, keine
   `max-size`). Der Text verspricht 30 Tage. Das braucht root:
   `/etc/docker/daemon.json` mit `{"log-driver":"json-file","log-opts":{"max-size":"20m","max-file":"3"}}`
   und `sudo systemctl restart docker` (beide Auftritte sind dabei kurz weg), oder
   in `docker-compose.yml` je Dienst `logging: {driver: json-file, options: {max-size: "20m", max-file: "3"}}`
   und `docker compose up -d`. Bis dahin den Satz auf «bis wir sie löschen» ändern
   oder ihn weglassen.
3. **SYGNIF und Modelle bestätigen.** Das Postfach sygnif@entrosana.com wird
   von eigener Software über Proton Bridge auf dem eigenen Server gelesen
   (IMAP 127.0.0.1:1143). Ob Mailinhalte an ein gehostetes Sprachmodell
   (RunPod, USA) gehen, konnte ich aus dem Code nicht belegen. Der Satz in
   Klammern in Abschnitt «Mail» ist entsprechend zu setzen oder zu streichen.
4. **Zertifizierungen prüfen**: Cloudflare, Inc. und GitHub, Inc. (Microsoft)
   führen das Data Privacy Framework mit Schweizer Erweiterung; nachsehen unter
   dataprivacyframework.gov/list, Datum notieren.
5. **Einfügen**: Seite «Privacy» auf entrosana.com im Editor :8393 oder per
   wp-cli (`docs/handoff.md` von entrosana-wp); danach die englische Fassung
   dort, die deutsche als Unterseite oder Umschalter. Datum «8 September 2026»
   stehen lassen, bei Änderungen nachführen.

Was die Zahlen belegt: `api/maintenance.mjs` (Fristen), `api/server.mjs`
(Protokoll, Drosseln, Marken), `api/auth.mjs` (30 Tage, 365 Tage für SYGNIF),
`tools/rotate-logs.sh` (14 Tage), `~/entrosana-wp/backup.sh` (Ziele), Handoff
§11 und `docs/contributions.md`.

---

## English — for entrosana.com/privacy

# Privacy

**Who is responsible.** entrosana is the sole proprietorship (Einzelfirma) of
Gianluca Kühne, Mühlestrasse 42, [ZIP city], Switzerland, business identification
number [CHE-…]. Reach us at info@entrosana.com or 077 529 73 01. This statement
covers entrosana.com, entrosana.app and the mailboxes info@ and sygnif@. It
follows the Swiss Data Protection Act (DSG) and, for people in the EU or EEA,
the GDPR. Last changed 8 September 2026.

**The short version.** We collect as little as the service needs. No advertising,
no analytics, no tracking, no third-party content on our pages. Most of what you
do in the Hub stays in your browser. What you send us is used to answer you, to
review what you propose, and, if you ask for it, to publish under your name.
Everything has a deletion date, and you can delete your own data yourself.

### 1. Visiting our pages

Both sites are delivered through Cloudflare, Inc. (San Francisco, USA), which
terminates the encrypted connection at its edge and forwards requests to our own
server in Switzerland. Cloudflare sees your IP address, browser identification
and the request; it may set a short-lived security cookie only when it challenges
a request it considers suspicious. We set no cookies ourselves. Cloudflare's
security features may inject a small script into pages; it does not track you.

Our origin server keeps a request log: IP address, path, status, duration and, if
you are signed in to the Hub, your account number. The Hub's log is deleted after
14 days. The website's log is deleted after 30 days.

Fonts and scripts come from our own domain. Loading a page contacts nothing else.

### 2. What stays in your browser

The Hub keeps your projects, their steps, your record trail, your theme choice and,
after you sign in, your sign-in token in your browser's local storage. None of it
is sent to us unless you submit a proposal, a request or an application. Clearing
your browser's site data removes it.

### 3. Your account

You can register with an e-mail address; we send a link, and opening it signs
that device in. We store your address, the time you registered, a hashed token
per signed-in device (valid 30 days), and what you add to your profile: your
name, organisation or school, role, a line about yourself, a website, languages.
Everything except the address is optional; a name is needed before you can
contribute, because contributions are published under it.

Purpose: to know whom we are talking to, to publish under your name, to decide on
applications and proposals. Unconfirmed addresses are deleted after 7 days.
Sign-in links expire after one hour. Under /me you can change your profile,
download everything we hold (JSON), sign out of a device, and erase your account.
Erasing removes address, profile and applications; published modules remain only
where you chose that they should.

Everyone who registers is a collector. Contributor standing is granted by our
team after an application (a text you write, kept with your account; decided
applications are deleted after 24 months).

**Your public profile.** Every account with a name has a public page under
/p/<number>: name, standing, picture (if you add one), organisation or school,
role, the line about you, website, languages, the date you joined, your
published modules, and the journal entries you marked public. Nothing else, and
never your address. You choose per journal entry whether it is public; you can
change or delete entries, remove the picture, and empty the profile fields at
any time under /me. The picture is stored as a small image (256 × 256) with your
account and deleted with it.

**Search.** The search on our pages runs in your browser for pages and the
catalogue and asks our server only for people, public journal entries and
published modules. We do not log what you type; the server records the request
path, not the query.

### 4. Proposals and published modules

A proposal contains your name, address, title, area, the text, links to files
you host elsewhere and, if you attach it, the part of your record trail that
belongs to the project (step texts and hashes; other projects appear as hashes
only). We record each step (received, confirmed, in review, decided, published)
with the time and the team member who took it, and we mail you the decision
with its reason.

A proposal that is never confirmed is deleted after 7 days. A confirmed proposal
stays until it is decided and, if published, for as long as the module is in the
catalogue. Published modules carry your name under AGPL-3.0; the catalogue file
lives in our code repository at GitHub, Inc. (USA). You can withdraw or delete
an undecided proposal yourself, and choose whether a published module keeps your
name if you erase your account.

### 5. Requests

If you ask us for a module, a track, a tool or a service under /request, we
store name, address, organisation, kind and text for 180 days, send the text to
info@entrosana.com and you a short confirmation without your text. No account
is needed.

### 6. Mail and phone

Our mailboxes are hosted at Proton AG, Geneva, Switzerland. Confirmation,
decision and notification mails are sent from our account through Proton's
servers. Mail to sygnif@entrosana.com is pre-sorted by our own software on our
server in Switzerland; people read it and people decide. [If that software sends
mail content to a hosted language model, name the provider and country here.]
What you tell us by phone is noted only as far as needed to answer you.

### 7. Our own record

The Hub keeps a chain of hashed entries about every step it takes: who (as an
account number) did what and when. It contains no names, addresses or texts,
only a truncated hash of an address where a confirmation was requested. It is
kept permanently because it proves that the history of a module was not
rewritten. Rate limits (five actions per hour per address and per IP) are
counted in memory for one hour and not stored.

### 8. Backups

Encrypted backups of the database, the site and the Hub are written nightly:
to our server, to a second disk at the same place, to our own Nextcloud on the
same server, and one encrypted copy to Cloudflare R2 (Cloudflare, Inc.).
Encryption happens before anything leaves our server; the providers cannot read
the copies. Backups are kept [number] days.

### 9. Who else receives data

Cloudflare, Inc., USA (delivery, security, tunnel, one encrypted backup copy);
Proton AG, Switzerland (mail); GitHub, Inc., USA (code repository, which
includes the catalogue with published contributors' names). Cloudflare and
GitHub are certified under the Swiss-U.S. Data Privacy Framework; where that does
not apply, standard contractual clauses do. We sell nothing and share nothing
for advertising. A teacher or a school never receives more than what you
publish.

### 10. Your rights

You may ask what we hold about you, have it corrected or deleted, receive it in
a portable form, and object to its processing (Art. 25, 28 and 32 DSG; Art. 15
to 21 GDPR). Under /me and /contribute/status you can do most of this yourself.
For the rest, write to info@entrosana.com or to the address above; we answer
within 30 days. You may complain to the Federal Data Protection and Information
Commissioner (FDPIC), Feldeggweg 1, 3003 Bern, or, in the EU, to your
supervisory authority. We make no automated decisions about you.

### 11. Children

Our modules are used in schools. We do not knowingly collect data of children,
and we ask teachers never to send us the personal data of pupils; a module report
needs the group, not the names. If you believe we hold a child's data, write to
us and we delete it.

### 12. Changes

We change this statement when the service changes and note the date at the top.

---

## Deutsch — Datenschutzerklärung

**Verantwortlich.** entrosana ist die Einzelfirma von Gianluca Kühne,
Mühlestrasse 42, [PLZ Ort], Schweiz, UID [CHE-…], erreichbar unter info@entrosana.com
oder 077 529 73 01. Diese Erklärung gilt für entrosana.com, entrosana.app und die
Postfächer info@ und sygnif@. Sie folgt dem Schweizer Datenschutzgesetz (DSG)
und, für Personen im EU/EWR-Raum, der DSGVO. Stand 8. September 2026.

**Kurz.** Wir erheben so wenig, wie der Dienst braucht. Keine Werbung, keine
Analyse, kein Tracking, keine fremden Inhalte auf unseren Seiten. Das meiste,
was Sie im Hub tun, bleibt in Ihrem Browser. Was Sie uns schicken, dient der
Antwort, der Prüfung Ihres Vorschlags und, wenn Sie es wollen, der
Veröffentlichung unter Ihrem Namen. Alles hat eine Löschfrist, und Ihre eigenen
Daten löschen Sie selbst.

### 1. Besuch der Seiten

Beide Auftritte werden über Cloudflare, Inc. (San Francisco, USA) ausgeliefert.
Cloudflare beendet die verschlüsselte Verbindung an seinem Rand und reicht die
Anfrage an unseren eigenen Server in der Schweiz weiter. Cloudflare sieht
IP-Adresse, Browserkennung und Anfrage; ein kurzlebiges Sicherheits-Cookie setzt
es nur, wenn es eine Anfrage als verdächtig prüft. Wir selbst setzen keine
Cookies. Cloudflares Sicherheitsfunktionen können ein kleines Skript in die
Seiten einfügen; es verfolgt Sie nicht.

Unser Server führt ein Zugriffsprotokoll: IP-Adresse, Pfad, Status, Dauer und,
wenn Sie im Hub angemeldet sind, Ihre Kontonummer. Das Protokoll des Hubs wird
nach 14 Tagen gelöscht, das der Website nach 30 Tagen.

Schriften und Skripte kommen von unserer eigenen Domain. Der Aufruf einer Seite
kontaktiert sonst nichts.

### 2. Was im Browser bleibt

Der Hub hält Ihre Projekte, deren Schritte, Ihren Record Trail, die Wahl der
Erscheinung und nach der Anmeldung die Marke Ihres Geräts im lokalen Speicher
Ihres Browsers. Nichts davon geht an uns, solange Sie keinen Vorschlag, keine
Anfrage und keine Bewerbung senden. Das Löschen der Website-Daten im Browser
entfernt es.

### 3. Ihr Konto

Sie registrieren sich mit einer E-Mail-Adresse; wir schicken einen Verweis, und
das Öffnen meldet dieses Gerät an. Wir speichern die Adresse, den Zeitpunkt der
Registrierung, je angemeldetem Gerät eine gehashte Marke (30 Tage gültig) und
was Sie Ihrem Profil hinzufügen: Name, Organisation oder Schule, Rolle, eine
Zeile über Sie, eine Website, Sprachen. Alles ausser der Adresse ist freiwillig;
ein Name wird gebraucht, bevor Sie beitragen, weil Beiträge unter ihm
veröffentlicht werden.

Zweck: zu wissen, mit wem wir sprechen; unter Ihrem Namen zu veröffentlichen;
über Bewerbungen und Vorschläge zu entscheiden. Unbestätigte Adressen werden nach
7 Tagen gelöscht, Anmeldeverweise verfallen nach einer Stunde. Unter /me ändern
Sie Ihr Profil, laden alles herunter, was wir halten (JSON), melden ein Gerät ab
und löschen Ihr Konto. Das Löschen entfernt Adresse, Profil und Bewerbungen;
veröffentlichte Module bleiben nur, wo Sie es so gewählt haben.

Wer sich registriert, ist Sammler. Den Stand als Beitragende vergibt unser Team
nach einer Bewerbung (ein Text von Ihnen, der beim Konto bleibt; entschiedene
Bewerbungen werden nach 24 Monaten gelöscht).

**Ihr öffentliches Profil.** Jedes Konto mit Namen hat eine öffentliche Seite
unter /p/<Nummer>: Name, Stand, Bild (wenn Sie eines setzen), Organisation oder
Schule, Rolle, die Zeile über Sie, Website, Sprachen, seit wann Sie dabei sind,
Ihre veröffentlichten Module und die Journaleinträge, die Sie öffentlich
gestellt haben. Nichts weiter, nie Ihre Adresse. Je Eintrag wählen Sie, ob er
öffentlich ist; Einträge ändern oder löschen, das Bild entfernen und die
Profilfelder leeren können Sie jederzeit unter /me. Das Bild liegt als kleines
Bild (256 × 256) beim Konto und geht mit dessen Löschung.

**Suche.** Die Suche auf unseren Seiten läuft für Seiten und Katalog in Ihrem
Browser und fragt unseren Server nur nach Personen, öffentlichen
Journaleinträgen und veröffentlichten Modulen. Wir protokollieren nicht, was Sie
eingeben; der Server hält den Pfad der Anfrage fest, nicht die Frage.

### 4. Vorschläge und veröffentlichte Module

Ein Vorschlag enthält Name, Adresse, Titel, Bereich, Text, Verweise auf Dateien,
die Sie selbst hosten, und, wenn Sie ihn mitgeben, den Teil Ihres Record Trails,
der zum Projekt gehört (Schritttexte und Hashes; andere Projekte erscheinen nur
als Hashes). Jeden Schritt (eingegangen, bestätigt, in Prüfung, entschieden,
veröffentlicht) halten wir mit Zeit und entscheidender Person fest, und wir
mailen Ihnen den Entscheid mit Begründung.

Ein nie bestätigter Vorschlag wird nach 7 Tagen gelöscht. Ein bestätigter bleibt
bis zum Entscheid und, wenn veröffentlicht, solange das Modul im Katalog steht.
Veröffentlichte Module tragen Ihren Namen unter AGPL-3.0; die Katalogdatei liegt
in unserem Code-Archiv bei GitHub, Inc. (USA). Einen unentschiedenen Vorschlag
ziehen Sie selbst zurück oder löschen ihn, und Sie wählen, ob ein
veröffentlichtes Modul beim Löschen Ihres Kontos Ihren Namen behält.

### 5. Anfragen

Wenn Sie unter /request ein Modul, einen Track, ein Werkzeug oder eine
Dienstleistung anfragen, speichern wir Name, Adresse, Organisation, Art und Text
180 Tage, senden den Text an info@entrosana.com und Ihnen eine kurze Bestätigung
ohne Ihren Text. Ein Konto ist nicht nötig.

### 6. Mail und Telefon

Unsere Postfächer liegen bei Proton AG, Genf, Schweiz. Bestätigungen, Entscheide
und Hinweise verschicken wir aus unserem Konto über Protons Server. Mail an
sygnif@entrosana.com wird von eigener Software auf unserem Server in der Schweiz
vorsortiert; gelesen wird sie von Menschen, entschieden wird von Menschen. [Wenn
diese Software Mailinhalte an ein gehostetes Sprachmodell gibt: Anbieter und
Land hier nennen.] Was Sie uns am Telefon sagen, notieren wir nur, soweit es die
Antwort braucht.

### 7. Unsere eigene Aufzeichnung

Der Hub führt eine Kette gehashter Einträge über jeden seiner Schritte: wer (als
Kontonummer) wann was getan hat. Sie enthält weder Namen noch Adressen noch
Texte, nur einen gekürzten Hash der Adresse, wo eine Bestätigung angefordert
wurde. Sie bleibt dauerhaft, weil sie belegt, dass die Geschichte eines Moduls
nicht umgeschrieben wurde. Drosseln (fünf Handlungen je Stunde je Adresse und je
IP) werden eine Stunde im Speicher gezählt und nicht gespeichert.

### 8. Sicherungen

Verschlüsselte Sicherungen von Datenbank, Website und Hub entstehen jede Nacht:
auf unserem Server, auf einer zweiten Platte am selben Ort, in unserer eigenen
Nextcloud auf demselben Server und als eine verschlüsselte Kopie bei Cloudflare
R2 (Cloudflare, Inc.). Verschlüsselt wird, bevor etwas unseren Server verlässt;
die Anbieter können die Kopien nicht lesen. Sicherungen bleiben [Zahl] Tage.

### 9. Wer sonst Daten erhält

Cloudflare, Inc., USA (Auslieferung, Sicherheit, Tunnel, eine verschlüsselte
Sicherungskopie); Proton AG, Schweiz (Mail); GitHub, Inc., USA (Code-Archiv mit
dem Katalog, der die Namen veröffentlichter Beitragender enthält). Cloudflare
und GitHub sind unter dem Swiss-U.S. Data Privacy Framework zertifiziert; wo das
nicht greift, gelten Standardvertragsklauseln. Wir verkaufen nichts und geben
nichts für Werbung weiter. Eine Lehrperson oder Schule erhält nie mehr, als Sie
veröffentlichen.

### 10. Ihre Rechte

Sie können erfahren, was wir über Sie halten, es berichtigen oder löschen
lassen, es in übertragbarer Form erhalten und der Bearbeitung widersprechen
(Art. 25, 28 und 32 DSG; Art. 15 bis 21 DSGVO). Unter /me und /contribute/status
erledigen Sie das meiste selbst. Für den Rest schreiben Sie an
info@entrosana.com oder an die Adresse oben; wir antworten innert 30 Tagen. Sie
können sich beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten
(EDÖB), Feldeggweg 1, 3003 Bern, beschweren, in der EU bei Ihrer
Aufsichtsbehörde. Wir treffen keine automatisierten Einzelentscheide.

### 11. Kinder

Unsere Module werden in Schulen eingesetzt. Wir erheben wissentlich keine Daten
von Kindern und bitten Lehrpersonen, uns nie Personendaten von Schülerinnen und
Schülern zu schicken; ein Modulbericht braucht die Gruppe, nicht die Namen.
Vermuten Sie, dass wir Daten eines Kindes halten, schreiben Sie uns, und wir
löschen sie.

### 12. Änderungen

Wir ändern diese Erklärung, wenn sich der Dienst ändert, und führen das Datum
oben nach.

---

## Bearbeitungsverzeichnis (Art. 12 DSG, freiwillig geführt)

| Bearbeitung | Daten | Zweck | Empfänger | Frist | Beleg |
|---|---|---|---|---|---|
| Auslieferung | IP, Browserkennung, Anfrage | Betrieb, Sicherheit | Cloudflare (USA) | bei Cloudflare nach deren Regeln | Tunnel, `~/.cloudflared/config.yml` |
| Protokoll Hub-API | IP, Pfad, Status, Dauer, Kontonummer | Betrieb, Missbrauch | — | 14 Tage | `tools/rotate-logs.sh` |
| Protokoll Website | IP, Pfad, Status | Betrieb | — | 30 Tage (nach Punkt 2 oben) | Docker json-file |
| Konto | Adresse, Registrierung, Marken (gehasht), Profil, Bild | Identität, Veröffentlichung, Entscheide, öffentliches Profil | öffentlich: alles ausser Adresse und Marken | bis zur Löschung; unbestätigt 7 d; Marke 30 d; Verweis 1 h | `api/auth.mjs`, `api/maintenance.mjs` |
| Journal | Text, Zeit, öffentlich/privat | Lernjournal, öffentliches Profil | öffentliche Einträge: alle | bis zur Löschung des Eintrags oder Kontos | `api/journal.mjs` |
| Bewerbung | Text, Zeit, Entscheid, Begründung | Freigabe als Beitragende | Team; Postfach sygnif@ | 24 Monate nach Entscheid | `api/applications.mjs` |
| Vorschlag | Name, Adresse, Titel, Bereich, Text, Dateiverweise, Trail | Prüfung, Veröffentlichung | Team; Postfach sygnif@; GitHub (Katalog) | unbestätigt 7 d; sonst bis Entscheid / solange veröffentlicht | `api/contributions.mjs` |
| Anfrage | Name, Adresse, Organisation, Art, Text | Antwort | Postfach info@ | 180 Tage | `api/server.mjs` |
| Mail | Absender, Inhalt | Antwort, Sortierung | Proton AG (CH); SYGNIF-Software | Postfachregeln | Proton Bridge, Mail-Daemon |
| Kette | Kontonummer, Handlung, Zeit, gekürzter Adress-Hash | Nachweis | — | dauerhaft | `api/audit.mjs` |
| Sicherung | alles oben, verschlüsselt | Wiederherstellung | T9, Nextcloud (eigener Server), Cloudflare R2 | [Zahl] Tage | `~/entrosana-wp/backup.sh` |
