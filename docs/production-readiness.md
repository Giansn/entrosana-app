# Produktionsreife entrosana.app: Gap-Analyse

Stand 2026-10-30. Nur gelesen: Code (api/, serve.mjs, assets/, tools/), docs/, der
Kontext aus dem Lauf vom 29.10. (~/entrosana-app-work/context-2026-10-29.md),
DNS per `dig`, die Tests per `node --test`. Kein Rechtsrat; Gesetzesstellen
tragen die Quelle, alles ohne gelesene Quelle steht als «prüfen».

Quellen für Rechtsaussagen: DSG (SR 235.1, Fassung 2023-09-01, fedlex HTML),
UWG Art. 3 Abs. 1 Bst. s (SR 241, Fassung 2025-01-01, fedlex HTML), EDÖB zur
Informationspflicht (edoeb.admin.ch/de/informationspflicht). EUR-Lex und
gnu.org waren beim Lauf nicht lesbar; DSGVO- und AGPL-Stellen sind deshalb
«prüfen».

## Zusammenfassung

Die Technik ist für den Start weitgehend bereit: keine Fremdabhängigkeiten,
explizite Routen, gehashte Marken, strenge Kopfzeilen, Drosseln, tägliche
Sicherungen, 34 grüne Tests. Was fehlt, sind vor allem Übereinstimmung
zwischen Versprechen und Betrieb (Sicherungsort, Kette, Quellcode), die
Wiederherstellbarkeit ohne diesen einen Rechner, und Überwachung. 33 Lücken:
fünf blockieren den Start, sechzehn sind wichtig, zwölf können später kommen.

Ergänzt 2026-10-31 aus einer zweiten, unabhängigen Prüfung am Live-System (~/entrosana-app-work/gap-sygnif.md): 3.4 von W auf B gehoben, Rechte der DB-Kopien in 1.8.

Schwere: **B** blockiert Produktion, **W** wichtig, **S** später.

## 1. Datenschutz (DSG, DSGVO, Minderjährige)

| # | S | Lücke | Beleg | Nächster Schritt |
|---|---|---|---|---|
| 1.1 | B | Datenschutzerklärung und Kontoseite versprechen «eine verschlüsselte Sicherungskopie bei Cloudflare R2». R2 ist seit 2026-09-30 aus («NotEntitled»), Offsite ist Proton Drive, das nirgends als Empfänger steht. Art. 19 Abs. 2 Bst. c DSG verlangt die Nennung der Empfänger; der EDÖB nennt zusätzlich Empfängerstaat und Garantien bei Auslandsbekanntgabe. | assets/me.js:543; docs/datenschutz.md:79, :190, :423; tools/hub-files-backup.sh:129-158 (Gate `ENTROSANA_R2`); Kontext 29.10. zu ~/entrosana-wp/backup.sh:134-141 | Erklärung (EN und DE), Kontoseite und docs/restore.md auf Proton Drive (Proton AG, Schweiz) umschreiben, Datum «Last changed» nachführen. Oder R2 wieder einschalten. |
| 1.2 | B | Die Kette soll «weder Namen noch Adressen noch Texte» enthalten und bleibt dauerhaft, auch nach der Löschung eines Kontos. Tatsächlich schreibt die Konsole Klartext-Adressen hinein, und Veröffentlichung/Entscheid tragen Titel und Begründung. Damit ist die Erklärung falsch und die Löschung unvollständig. | api/admin.mjs:42, :45 (`granted to ${target.email}`); api/server.mjs:362-364 (Begründung im Text); docs/datenschutz.md:179-182, :353-356; Löschung: api/server.mjs:981-1008 löscht audit nicht | In admin.mjs nur `actor:<id>` und den gekürzten Adress-Hash wie in server.mjs:153 schreiben; Begründungen in die Beitragszeile (`reason`), nicht in `audit.text`. Bestehende Zeilen: entweder Kette neu aufbauen oder die Erklärung ehrlich machen («Begründungen der Prüfenden bleiben in der Kette»). |
| 1.3 | W | Die Erklärung nennt keine Rechtsgrundlage je Zweck (keine Treffer für «Rechtsgrundlage», «legal basis», «Art. 6»). Nach DSG ist das nicht nötig; für EU/EWR-Personen verlangt Art. 13 Abs. 1 Bst. c DSGVO die Rechtsgrundlage (prüfen, Quelle nicht gelesen). | docs/datenschutz.md gesamt (grep leer); Erklärung beansprucht DSGVO-Geltung in Zeile 68-69 | Je Abschnitt (Konto, Vorschlag, Anfrage, Mail, Sicherung) Vertrag, berechtigtes Interesse oder Einwilligung benennen. Dann 1.4 entscheiden. |
| 1.4 | W | Altersgrenze 13 gilt für alle. Für EU-Personen setzt Art. 8 Abs. 1 DSGVO bei einwilligungsgestützten Diensten 16 Jahre, Mitgliedstaaten bis 13 (prüfen). Ob der Hub Einwilligung braucht, hängt von 1.3 ab. Das Häkchen wird nicht gespeichert, ein Nachweis fehlt also; das ist bewusst (Datenminimierung). | api/server.mjs:166; assets/me.js:124-131; guidelines.html:105; docs/leitlinien-konten.md:17-18 | Nach 1.3: entweder Rechtsgrundlage Vertrag/berechtigtes Interesse (dann reicht 13 mit Urteilsfähigkeit) oder für EU-Nutzende unter 16 Elternweg vorschreiben. Satz in Abschnitt 3 der Erklärung ergänzen. |
| 1.5 | W | Auftragsbearbeitung: Art. 9 Abs. 1 DSG verlangt Vertrag oder Gesetz, Art. 16 Abs. 2 Bst. b DSG für die Auslandsbekanntgabe Vertragsklauseln. docs/ belegt nur die DPF-Prüfung der Anbieter, keinen abgelegten Vertrag (Cloudflare, Proton Mail und Proton Drive, GitHub, Anthropic). Art. 28 Abs. 3 DSGVO analog (prüfen). | docs/datenschutz.md:40-45; Empfängerliste :194-202 | Je Anbieter den DPA/Standardvertrag herunterladen und unter docs/ oder ausserhalb des Baums ablegen, mit Datum. Anthropic: Commercial Terms/DPA prüfen, da Mailinhalte Dritter hingehen. |
| 1.6 | W | Export («download everything we hold») lässt bio, place, contact_email, Bild, Dateiliste und points weg (Tabellen aus Migration 012, 013, 017-021). Auskunftsrecht Art. 25 DSG, Herausgabe Art. 28 DSG. | api/maintenance.mjs:46-60; assets/me.js:520; api/db/017-bio.sql, 018-place.sql, 019-contact.sql, 020-files.sql | Fehlende Spalten und `files`/`points` in exportActor aufnehmen; Test in api/test/maintenance.test.mjs ergänzen. |
| 1.7 | W | Löschung lässt `points` und `module_contributors` am gelöschten Konto; Modulkarten listen den Akteur weiter («(erased)» oder Name). | api/server.mjs:981-1008 (keine DELETE auf points/module_contributors); :485-489 liest sie für /api/modules/meta | In eraseActor beide Tabellen für nicht behaltene Module löschen; bei behaltenen Modulen bleibt der Eintrag absichtlich. |
| 1.8 | W | Sieben unverschlüsselte Vor-Migrations-Kopien der Datenbank (hub.pre006 bis pre022.sqlite) liegen neben der Live-Datei, für jeden Benutzer auf e14 lesbar (Rechte 644), enthalten alte Stände aller Personendaten und werden nie geräumt; kein Skript erzeugt sie, Löschanträge erreichen sie nicht. | Glob api/db/hub.pre0*.sqlite (7 Dateien); .gitignore:7 | Kopien nach bestandener Migration löschen; Regel in docs/restore.md festhalten (Kopie nur bis zum nächsten erfolgreichen Nacht-Backup). |
| 1.9 | S | Erklärung sagt, Sicherungen seien «ohne feste Frist»; tatsächlich halten alle Ziele 14 Generationen (KEEP=14, KEEP_DAYS=14, PROTON_KEEP=14). Die ehrliche Zahl ist besser als «offen». | docs/datenschutz.md:192, :366; tools/hub-files-backup.sh:9-13, :136-151; docs/leitlinien-konten.md:72 | «14 Tage» in Abschnitt 8 eintragen, Entscheid 9 aus leitlinien-konten.md schliessen. |
| 1.10 | S | EU-Vertreter nach Art. 27 DSGVO: nicht erwähnt. Ausnahme bei gelegentlicher Bearbeitung ohne besondere Kategorien (prüfen). | docs/datenschutz.md (kein Treffer «Vertreter»/«representative») | Kurz prüfen und als Entscheid mit Begründung in docs/ festhalten. |

## 2. Anwendungssicherheit

| # | S | Lücke | Beleg | Nächster Schritt |
|---|---|---|---|---|
| 2.1 | W | Konsole :8396 nimmt jedes Gerät im Tailnet ohne Schlüssel an (Entscheid 2026-09-08). Jedes verlorene oder fremde Tailnet-Gerät kann prüfen, entscheiden und über den Dienstschlüssel in den Hub schreiben. | admin-app.py:57 (`TAILNET_OPEN = True`), :1694-1699, :1720; docs/kapazitaet.md:69-70 | Vor dem Start Tailscale-ACL auf die eigenen Geräte eingrenzen und dokumentieren, oder TAILNET_OPEN aus und den Cookie-Schlüssel nutzen. |
| 2.2 | W | Drosseln für Schulen zu eng: 5 Anmeldeverweise je Stunde je IP (eine Schule hinter NAT), 60 Mails je Stunde gesamt (eine Klasse braucht eine halbe Stunde). Offener Entscheid seit 2026-09-09. | api/server.mjs:40-41, :167, :106, :138; docs/kapazitaet.md:36-45, :60-63 | Entscheid fällen: Vorschlag 60/h je IP bei 5/h je Adresse, MAIL_CAP 300/h nach Prüfung der Proton-Sendegrenze. |
| 2.3 | S | Sitzungsmarke liegt im localStorage (XSS-Risiko), 30 Tage, ohne Erneuerung. Die strenge CSP (`script-src 'self'`, kein inline) mildert das; kein Fremdskript auf den Seiten. | assets/me.js:10; serve.mjs:102-104; api/auth.mjs:45-50 | Beim Start so lassen; später gleitende Erneuerung oder kürzere Laufzeit für Team-Konten, Passkeys (leitlinien-konten.md Punkt 11). |
| 2.4 | S | Dienste laufen ohne systemd-Härtung (kein ProtectSystem/ProtectHome/PrivateTmp, kein WatchdogSec); MemoryMax und NoNewPrivileges sind gesetzt. | Kontext 29.10. (`systemctl --user show`); api/entrosana-api.service | ProtectSystem=strict mit ReadWritePaths auf api/db und ~/.sygnif/logs, PrivateTmp=yes; danach Tests und Neustart im Wartungsfenster. |
| 2.5 | S | Abhängigkeiten: keine Fremdpakete, nur node: und Python-Standardbibliothek. Node v22.23.1 ist LTS; Ende der Wartung für Node 22 prüfen und als Termin notieren. | serve.mjs:7-13; api/server.mjs:10-26; `node --version` | Termin in docs/ festhalten; keine weitere Massnahme nötig. |

Geprüft und in Ordnung: Marken 32 Byte CSPRNG, nur SHA-256 gespeichert,
Dienstschlüssel timing-sicher verglichen (api/auth.mjs:12-13, :23-26);
Verweis-Token steht nicht im Zugriffsprotokoll (server.mjs:1026, :1031 loggt
nur `pathname`) und wird im Browser sofort aus der URL entfernt (me.js:568);
JSON-only mit 256 KB Grenze (server.mjs:74-83); Pfade und SQL nie aus Anfragen
gebaut; Dateien nur als Anhang mit nosniff und Typ aus der Zulassungsliste
(server.mjs:914-926); Konto-Enumeration verhindert (202 immer).

## 3. Betrieb

| # | S | Lücke | Beleg | Nächster Schritt |
|---|---|---|---|---|
| 3.1 | B | Der Sicherungsschlüssel liegt laut Doku «nur auf diesem Rechner», die R2-Zugangsdaten liegen im Archiv selbst (Zirkelschluss). Fällt e14 samt T9 aus, ist jede Kopie (Nextcloud, Proton Drive) wertlos. Ob der Schlüssel inzwischen ausser Haus liegt, konnte dieser Lauf nicht lesen (~/.config ausserhalb des Baums). | docs/restore.md:17-19, :82-84; Kontext 29.10.: `~/.config/entrosana-backup.key` 0600, 64 B | Passphrase in Proton Pass (oder Papier an zweitem Ort) ablegen, Datum in docs/restore.md eintragen, einmal von einem anderen Gerät aus entschlüsseln. |
| 3.2 | W | Keine Überwachung, kein Alarm: /healthz und /api/healthz antworten, aber niemand ruft sie von aussen; das Lebenszeichen von hub-sync ist inaktiv (Hook-Datei fehlt). Ein Rechner an einem Mobilfunk-Uplink aus dem Van. | serve.mjs:250-253; api/server.mjs:119-124; tools/hub-sync.sh:9-14, :60; docs/kapazitaet.md:66-68; Kontext 29.10. (kein Treffer für telegram/uptime in tools/, Hook fehlt) | Externen Uptime-Check auf https://entrosana.app/api/healthz mit Telegram- oder Mail-Alarm; Hook-Datei anlegen, damit hub-sync auf /services erscheint. |
| 3.3 | W | Deploy-Weg ist uneindeutig: hub-sync.sh startet die API nur neu, wenn der Pull von GitHub neue Commits bringt (`before != after` nach dem Pull). Lokale Commits werden gepusht, aber nicht ausgerollt; lokale Änderungen an Code bleiben stehen, bis jemand von Hand neu startet. | tools/hub-sync.sh:32-35, :41-44, :47-53 | Im Skript nach dem Push auch `git diff --name-only <vorher-lauf> HEAD` der lokalen Commits prüfen, oder in docs/ festhalten: «Code-Änderungen auf e14: committen, pushen, `systemctl --user restart` von Hand». |
| 3.4 | B | Live-Stand und Git weichen ab, und jede Bearbeitung ist sofort öffentlich: serve.mjs liefert direkt aus der Arbeitskopie (serve.mjs:15), am 30.10. enthielt https://entrosana.app/assets/app.js `paintSeedList`, HEAD nicht. Im Einzelnen: sechs assets/*.js und tools/hub-files-backup.sh sind seit 2026-09-11 bzw. 2026-10-27 geändert, aber nicht eingecheckt (hub-sync checkt nur HTML, Katalog, Seeds, Docs ein). serve.mjs liefert die Arbeitskopie aus, GitHub und `git checkout -- .` (restore.md Abschnitt 1) hätten den alten Stand. | `git status --short`; `git diff --stat` (78 Zeilen); tools/hub-sync.sh:23 (TEXT-Liste ohne assets/*.js) | Die sieben Dateien prüfen und committen; danach entscheiden, ob hub-sync auch assets/*.js einchecken soll (nicht services.js, die wird alle 10 Minuten generiert). |
| 3.5 | W | docs/restore.md ist vom 2. August: nennt R2 als Offsite, nicht Proton Drive, und kennt die Datei-Sicherung (hub-files-backup.sh) nicht. Eine vollständige Wiederherstellung auf einem fremden Rechner (Archiv + Dateien + Units + Schlüssel) ist nie geprobt; geprobt ist nur die Datenbankkopie (2026-09-08). | docs/restore.md:1-19, :142-150; tools/hub-files-backup.sh:123-159 | Tabelle und Abschnitt 4 nachführen; einmal auf x1 oder in einer VM aus Proton Drive heraus wiederherstellen und das Datum eintragen. |
| 3.6 | S | Kein README, kein Tag, keine Versionsnummer; der Stand ist nur über den Commit-Hash benennbar. | Glob README*/LICENSE* leer; Kontext 29.10. (`git describe` ohne Tags) | Beim Start einen Tag `v1.0` setzen und ein kurzes README mit Start, Tests, Deploy und Verweis auf docs/ anlegen. |

## 4. E-Mail

| # | S | Lücke | Beleg | Nächster Schritt |
|---|---|---|---|---|
| 4.1 | W | entrosana.com: SPF `~all` (softfail) und DMARC `p=quarantine` ohne `rua`, also keine Berichte darüber, wer die Domain missbraucht oder ob eigene Mails durchfallen. DKIM: drei Proton-CNAMEs vorhanden. | `dig TXT entrosana.com`: `v=spf1 include:_spf.protonmail.ch ~all`; `dig TXT _dmarc.entrosana.com`: `v=DMARC1; p=quarantine` | `rua=mailto:…` ergänzen (Proton oder ein kostenloser DMARC-Berichtsdienst), nach zwei Wochen sauberer Berichte `-all` und `p=reject`. |
| 4.2 | W | entrosana.app hat weder SPF noch DMARC. Die Domain versendet nicht, kann aber als Absender gefälscht werden; Hub-Mails verweisen auf diese Domain. | `dig TXT entrosana.app` (nur google-site-verification); `dig TXT _dmarc.entrosana.app` leer | `v=spf1 -all` und `v=DMARC1; p=reject` für entrosana.app setzen. |
| 4.3 | W | Zustellung ohne Rückkanal: Fehler landen als Text in der Kette («mail failed»), niemand wird benachrichtigt; keine Bounce-Auswertung; Protons Sendelimit für das SMTP-Konto ist ungeprüft. | api/server.mjs:112, :154, :224; tools/mail-send.py:38-42; docs/kapazitaet.md:60-61 | Zähler «mail failed» in den Alarm aus 3.2 aufnehmen; Proton-Limit nachfragen und MAIL_CAP darauf abstimmen. |
| 4.4 | S | Absender ist SMTP_USER, Reply-To sygnif@; Auto-Submitted gesetzt. Kein List-Unsubscribe nötig (nur Transaktionsmails). Ob From und sygnif@ dieselbe Domain nutzen, hängt von ~/.config/entrosana-smtp.env ab (nicht lesbar in diesem Lauf). | tools/mail-send.py:32-36 | Einmal prüfen, dass From unter entrosana.com liegt (DMARC-Alignment). |

## 5. Barrierefreiheit, Rechtliches, Tests

| # | S | Lücke | Beleg | Nächster Schritt |
|---|---|---|---|---|
| 5.1 | B | Quellcode nicht offengelegt: Fusszeile und Leitlinien versprechen AGPL-3.0, der Link «Source» führt auf github.com/entrosana/hub (anderes Repo mit entrosana-ai und lp21-mcp, 43 Commits), das eigentliche Repo Giansn/entrosana-app ist privat (404). Im Baum liegt keine LICENSE-Datei. AGPL §13 verlangt das Quellangebot an Netznutzende (prüfen, gnu.org beim Lauf nicht lesbar). | index.html:77-81; `git remote -v`; WebFetch beider Repos; Glob LICENSE* leer | Repo öffentlich machen oder einen Spiegel ohne Secrets veröffentlichen, LICENSE (AGPL-3.0) hinzufügen, Fusszeile auf das richtige Repo zeigen lassen. |
| 5.2 | W | Kontoseite: «anyone can verify» die Server-Kette; tatsächlich nur Prüfende und Eigentümer (401/403). | assets/me.js:539; api/server.mjs:231-234 | GET /api/audit/verify ohne Login freigeben (liefert nur ok und Zeilenzahl) oder den Satz ändern. |
| 5.3 | W | Tests decken Module ab (34 Fälle, alle grün, in-memory), aber nicht server.mjs (1062 Zeilen: Anmeldung, Marken, Drosseln, Löschung, Dateien über HTTP). Keine CI; Tests laufen nur als Tor vor dem API-Neustart in hub-sync. | api/test/*.test.mjs; `node --test`: 34 pass; tools/hub-sync.sh:49-51; Kontext 29.10. (kein .github/) | Einen HTTP-Test gegen server.mjs mit DB_PATH=:memory: und MAIL_SEND auf einen Stub: Anmeldung, 429, Export, Löschung. GitHub Action mit `node --test`. |
| 5.4 | S | Impressum: der Hub hat keinen Impressum-Link; entrosana.com/imprint nennt entrosana.app nicht. UWG Art. 3 Abs. 1 Bst. s verlangt Identität und Kontaktadresse beim Anbieten von Leistungen im elektronischen Geschäftsverkehr; ob ein kostenloser Hub darunter fällt, ist zu prüfen. Die Datenschutzerklärung nennt den Verantwortlichen bereits. | index.html:77-81; WebFetch entrosana.com/imprint | Link «Imprint» in die Fusszeile, auf .com/imprint «covers entrosana.app» ergänzen. Kostenarm, erledigt die Frage. |
| 5.5 | S | Keine Nutzungsbedingungen; die Leitlinien (/guidelines) übernehmen die Rolle (Lizenzvergabe, Verhalten, Rücknahme). Für einen kostenlosen Dienst vertretbar; für Schulen als Partner wäre ein kurzer Nutzungsvertrag mit Auftragsbearbeitung (nur falls Schülerdaten) der nächste Schritt. | guidelines.html:105-129; contribute.html:101 | Erst wenn eine Schule Konten für Lehrpersonen verlangt; dann Vorlage aus docs/leitlinien-konten.md Abschnitt 1 (educa.ch, privatim). |
| 5.6 | S | Barrierefreiheit: Grundlagen vorhanden (lang, Skip-Link, Fokusstile, Labels, autocomplete, kein CAPTCHA, Avatare als dekorativ). Es gibt aber keinen dokumentierten Audit (Kontrast, Tastaturlauf durch die Dialoge auf /me, Screenreader) und die Oberfläche ist nur Englisch, während die Zielgruppe Schweizer Schulen sind. | alle *.html:2 (`lang="en"`), :28 (Skip-Link); assets/app.css (28 Fokus-Treffer); docs/leitlinien-konten.md:26-28, :54 | Einmal axe/Lighthouse und einen Tastaturlauf über me, submit, request, review laufen lassen, Befunde in docs/ ablegen. Deutsch als zweite Sprache als eigenes Vorhaben. |
| 5.7 | S | Kleine Textfehler: «older than an hour» für 20-Minuten-Links; 200-Dateien-Grenze steht auf keiner Seite; canonical von guidelines.html zeigt auf /contribute/status. | assets/me.js:570; api/files.mjs:16; guidelines.html:8-12 | In einem Durchgang richten. |
| 5.8 | S | noindex ist noch aktiv (INDEXABLE=false), robots ohne Sitemap. Bewusst; vor dem Start entscheiden. | serve.mjs:30, :272-287 | Schalter umlegen, wenn 1.1, 1.2 und 5.1 erledigt sind. |

## Bereits gut gelöst

- Architektur ohne Fremdpakete, explizite Routentabellen, keine Pfad- oder SQL-Konstruktion aus Anfragen (serve.mjs:41-96; api/server.mjs:7-9).
- Anmeldung ohne Passwort nach OWASP: 32-Byte-Token, SHA-256 gespeichert, 20 Minuten, einmalig, 202 ohne Konto-Enumeration, Mail bei neuem Gerät, Geräteliste mit «überall abmelden», frischer Link vor Löschung (server.mjs:142-228, :709; auth.mjs).
- Kopfzeilen: CSP ohne inline und ohne Fremdquellen, HSTS, nosniff, Referrer-Policy, frame-ancestors none; API mit no-store (serve.mjs:102-104, :298-312; server.mjs:57-69).
- Drosseln je IP, je Adresse, je Konto, global für Mail; Honigtopf statt CAPTCHA; Body-Grenze 256 KB (server.mjs:39-41, :85-92).
- Dateien: Quote 400 MB, 50 MB je Datei, Typ-Zulassungsliste ohne SVG, Auslieferung nur als Anhang, privat nur für Konto und Team (files.mjs:14-19; server.mjs:914-926).
- Fristen sind im Code, was die Erklärung sagt: 7 Tage unbestätigt, 180 Tage Anfragen und Einladungen, 24 + 3 Monate ruhend, Protokoll 14 Tage (maintenance.mjs; tools/rotate-logs.sh).
- Sicherung: tägliche konsistente SQLite-Kopie mit integrity_check, AES-256 vor dem Verlassen des Rechners, vier Ziele, Selbstprüfung durch Entschlüsseln, Dateien je Datei verschlüsselt (tools/hub-backup.sh; tools/hub-files-backup.sh).
- Erklärung mit Verantwortlichem, Kontakt, Zwecken, Empfängern inkl. USA-Anbietern, Fristen, Rechten, EDÖB-Adresse, Kinderabschnitt, Bearbeitungsverzeichnis; EN und DE (docs/datenschutz.md).
- Minderjährige: keine Schülerkonten, Altersbestätigung ohne Speicherung, Hinweis «keine Personendaten von Kindern» auf /contribute und /guidelines.
- Kapazität gemessen und weit über Bedarf; Fehlerpfade geprobt (docs/kapazitaet.md).
- E-Mail: Proton MX, drei DKIM-Selektoren, SPF und DMARC vorhanden, Auto-Submitted gesetzt.
