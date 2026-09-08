# Meilenstein «Konten und Sync» — Scope und Roadmap

Stand: 2026-08-02. Stufen statt Termine, wie auf der öffentlichen Roadmap.
Bezieht sich ausschliesslich auf entrosana.app; entrosana.com (WordPress)
bleibt unberührt.

## Ausgangslage

Die App ist heute strikt local-first, und zwar strukturell, nicht nur
konfiguriert:

- Alle Nutzdaten liegen im localStorage des Browsers:
  `entrosana-app:v1` (Hub: created, projects, records[]),
  `entrosana-todo-demo:v3` (Projektverwaltung), dazu `entrosana-theme`
  und `entrosana-rail:projects` (reine UI-Zustände).
- Die Siegelkette wird clientseitig gerechnet (SHA-256 über
  crypto.subtle, nur im Sicherheitskontext); «Verify chain» prüft lokal.
- serve.mjs ist ein Allowlist-Dateiserver: alles ausser GET/HEAD
  bekommt 405, die CSP setzt `form-action 'none'`. Ein Login-Formular
  könnte heute nicht einmal absenden.
- Es gibt keinen Anwendungsserver, keine Datenbank, keine Sessions.
- Die öffentliche Roadmap nennt als eigene Stufe: «The Hub as a
  platform, meaning one sign-in, shared projects and the record visible
  to parents and teachers.»
- Marketingzusage auf .com: «Swiss/EU data residency by design» — die
  Daten müssen auf eigener Infrastruktur (e14, hinter dem bestehenden
  Cloudflare-Tunnel) liegen.

## Ziel des Meilensteins

Am Ende kann jede Person selbst ein Konto anlegen, sich auf jedem Gerät
anmelden und findet ihre Projekte und Records dort wieder. Die
Siegelkette bleibt beweisbar; die Daten liegen auf e14.

Fertig heisst konkret:

1. Registrierung und Anmeldung funktionieren selbstbedient (Passkey
   zuerst, E-Mail-Link als Rückweg).
2. Bestehende Gerätedaten werden beim ersten Anmelden ins Konto
   übernommen (kein Datenverlust, kein Doppelbestand).
3. Zwei Geräte, ein Konto: Änderungen erscheinen wechselseitig; Records
   gehen nie verloren.
4. «Verify chain» prüft weiterhin nach — auch für Ketten, die auf einem
   anderen Gerät entstanden sind.
5. Auskunft und Löschung eines Kontos sind mit Bordmitteln möglich.

## Nicht im Scope (bewusst)

- Geteilte Projekte, Rollen und Sichten (Eltern/Lehrkräfte) — das ist
  die nächste Plattform-Stufe der öffentlichen Roadmap, nicht diese.
- Organisation/Mandanten (Schulen als Einheit), SSO/SAML.
- Fremd-Logins (Google, Apple etc.) — Datenresidenz und Schulkontext
  sprechen dagegen; Passkeys decken den Komfort ab.
- Bezahlfunktionen, Mehrsprachigkeit, native Apps.
- Änderungen an entrosana.com ausser der Privacy-Seite (S4).

## Stufenplan

### S0 — Pilot-Tor (unabhängig vom Rest, sofort machbar)

Cloudflare Access vor die Arbeitsbereichs-Pfade (`/project`,
`/projects`, `/records`), E-Mail-Einmalcode gegen eine Pilotliste aus
dem bestehenden «Request pilot access»-Trichter. Kein Code in der App.

Zweck: Identität und Zugangskontrolle vor dem echten Unterbau; zugleich
Lernphase, wer wie einsteigt. Öffentliche Seiten (Start, Tools,
Modules, Contribute) bleiben offen.

Exit: Pilotpersonen kommen mit ihrer E-Mail hinein, alle anderen nicht;
die offenen Seiten bleiben unverändert erreichbar.

### S1 — Fundament: eigener Dienst mit Datenbank

Ein zweiter kleiner Node-Dienst (`api/`) neben serve.mjs, eigener Port,
über den bestehenden Tunnel als selber Ursprung eingebunden
(cloudflared-Ingress mit Pfadregel `entrosana.app` + `/api/*`; Rückfall:
eigene Subdomain `api.entrosana.app`, kostet dann CORS-Pflege).
Same-Origin hält die CSP bei `connect-src 'self'`.

- Speicher: SQLite. Erste Wahl `node:sqlite` (in Node 22 eingebaut,
  keine Fremdabhängigkeit, Status experimentell); Rückfall
  `better-sqlite3` als bewusst einzige Abhängigkeit.
- Schema v1: `users`, `credentials` (Passkeys), `sessions`,
  `devices`, `objects` (Projekte/Tasks, versioniert),
  `records` (append-only, je Gerätekette).
- Sessions als HttpOnly-Cookie, `SameSite=Strict`, Secure; CSRF
  zusätzlich über einen Pflicht-Header (die App spricht ohnehin nur
  fetch, Formulare bleiben `form-action 'none'`).
- Betriebsgerüst: systemd-user-Unit wie entrosana-app.service,
  strukturierte Logzeilen, /healthz.

Exit: Dienst läuft hinter dem Tunnel, hält Neustarts aus, beantwortet
/healthz; Schema-Migrationen sind wiederholbar.

### S2 — Identität: Registrierung und Anmeldung

- Passkeys (WebAuthn) als erster Weg: Registrierung erzeugt das Konto,
  Anmeldung ist ein Fingertipp. Ehrlicher Trade-off: WebAuthn ohne
  Bibliothek heisst CBOR/COSE selbst parsen (± 3 Tage Mehraufwand und
  Fehlerrisiko); empfohlen ist genau eine geprüfte Server-Bibliothek.
- E-Mail-Magic-Link als Rückweg und Wiederherstellung. Versandweg im
  Haus vorhanden (contact-send auf e14); sonst Cloudflare Email.
  SPF/DKIM gehören zur Abnahme.
- Rate-Limits auf alles Identitätsnahe; Audit-Zeile je Ereignis.
- UI: /account (Registrieren, Anmelden, Geräte, Abmelden) in der
  bestehenden Gestaltungssprache; die Fusszeile «Not signed in · local
  device only» wird zur wahren Zustandsanzeige mit Verweis.

Exit: Konto anlegen, abmelden, auf zweitem Gerät anmelden — ohne
Passwort; Magic-Link funktioniert nachweislich mit SPF/DKIM-Pass.

### S3 — Datenumzug und Sync

- Übernahme: Beim ersten Anmelden werden die lokalen Bestände dem Konto
  zugeordnet (Gerät «adoptiert» seine Daten). Kein stiller Merge: die
  Übernahme wird angezeigt und protokolliert.
- Records: append-only bleibt append-only. Jede Gerätekette behält ihre
  eigene Hash-Verankerung (`device_id` + Laufnummer); das Konto ist die
  Sammlung seiner Ketten. Dadurch gibt es beim Sync nichts zu mergen
  und «Verify chain» prüft jede Kette einzeln nach — die Beweisbarkeit
  übersteht den Umzug.
- Projekte/Tasks: Last-Write-Wins je Objekt mit Versionszähler und
  Änderungszeit; Konflikte werden nicht verschluckt, sondern als
  Hinweis sichtbar gemacht.
- Offline bleibt Bürger erster Klasse: localStorage ist Cache und
  Arbeitsvorrat, der Abgleich läuft nach, sobald Netz da ist.

Exit: Zwei-Geräte-Szenario aus dem Ziel-Katalog läuft; Ketten aus
beiden Geräten verifizieren; Offline-Arbeit geht beim nächsten Netz
sauber auf.

### S4 — Betrieb, Pflichten, Öffnung

- Nächtliche Sicherung der SQLite-Datei (versioniert, getestet
  wiederherstellbar), Wiederherstellungsübung dokumentiert.
- Datenauskunft (Export des Kontos als JSON) und Löschung (Konto samt
  Daten) als Funktion, nicht als Handarbeit.
- Privacy-Seite auf .com auf den neuen Stand (was liegt jetzt wo).
- Das Pilot-Tor aus S0 wird zurückgebaut: die Registrierung öffnet.
- Monitoring: Fehlerrate, Sync-Rückstau, Speicherwachstum.

Exit: Backup nachweislich wiederherstellbar; Auskunft/Löschung
durchgespielt; Access-Gate entfernt; Privacy aktualisiert.

## Architekturentscheide (Kurzform mit Begründung)

1. **Same-Origin `/api` statt Subdomain** — eine Origin, kein CORS,
   `connect-src 'self'` bleibt; localStorage-Herkunft ändert sich nicht.
2. **SQLite auf e14 statt gehosteter DB** — hält die
   Datenresidenz-Zusage wörtlich, ein Prozess, eine Datei, einfache
   Sicherung.
3. **Passkeys zuerst, kein Passwort-Stack** — kein Hashing, kein Reset,
   kein Phishing-Ziel; Magic-Link deckt Wiederherstellung.
4. **Siegel bleiben clientseitig gerechnet** — der Server speichert und
   verifiziert Ketten, erzeugt sie aber nicht; genau das macht den
   Record glaubwürdig (der Server könnte sonst rückwirkend schreiben).
5. **Geräteketten statt Konto-Kette** — append-only je Gerät macht Sync
   konfliktfrei und erhält die Prüfbarkeit; das Konto aggregiert.

## Aufwand (ehrlich grob, Personentage)

| Stufe | Inhalt | PT |
|---|---|---|
| S0 | Cloudflare-Access-Gate | 0.5–1 |
| S1 | Dienst, Schema, Sessions, Betrieb | 3–5 |
| S2 | Passkeys, Magic-Link, /account-UI | 5–8 |
| S3 | Übernahme, Sync, Ketten-Verifikation | 4–6 |
| S4 | Backup, Auskunft/Löschung, Öffnung | 2–3 |
| **Summe** | | **≈ 15–23** |

Grösster Unsicherheitsposten: WebAuthn (Bibliothek ja/nein) und die
Sync-Kanten in S3.

## Risiken und Gegenmittel

- **WebAuthn-Eigenbau lockt** → bewusst eine geprüfte Bibliothek
  zulassen; der «keine Abhängigkeiten»-Grundsatz gilt dem Ausliefern
  von Seiten, nicht der Kryptografie.
- **E-Mail-Zustellbarkeit** (Magic-Link landet im Spam) → SPF/DKIM als
  Abnahmekriterium in S2, nicht als Nacharbeit.
- **e14 als einzelner Punkt** → S4-Backups sind Teil des Meilensteins,
  nicht optional; Wiederherstellung wird geübt, nicht angenommen.
- **Scope-Kriechen Richtung «shared projects»** → alles Geteilte ist
  ausdrücklich die nächste Stufe; dieser Meilenstein endet bei «meine
  Daten überall bei mir».
- **Stiller Datenverlust beim Umzug** → Übernahme ist sichtbar,
  protokolliert und rückholbar (S3), localStorage wird erst nach
  bestätigtem Abgleich als Cache degradiert.

## Reihenfolge-Empfehlung

S0 sofort (unabhängig, macht den Pilot kontrollierbar), danach S1→S4 in
Folge. Registrierungs- und Login-Seiten entstehen in S2 — mit dem
Unterbau, nicht vor ihm.

## Entscheid vom 2026-09-08: der Hub bekommt einen schreibenden Server

Die offene Frage aus `handoff-design.md` §10 ist entschieden. entrosana.app
erhält einen Dienst, der schreiben kann: `api/` mit `node:http` und
`node:sqlite` auf `127.0.0.1:4324` (Port frei, geprüft mit `ss -ltnp` am
2026-09-08), als eigene Einheit `entrosana-api.service` neben
`entrosana-app.service`, erreichbar über den bestehenden Tunnel mit einer
Pfadregel `^/api/.+` vor der Auffangregel. `serve.mjs` bleibt reine
Auslieferung; seine Inhaltssicherheitsregel erhält `connect-src 'self'`. Der
Entscheid setzt die Architekturentscheide 1 und 2 um.

Der Weg dahin steht in `docs/contributions.md` (Zustände, Regeln, Rollen, die
vier Entscheide des Eigentümers) und folgt dem Stufenplan: S1 zuerst, Beiträge
vor Konten. Identität (S2, Passkeys) kommt danach auf derselben
Akteurs-Nahtstelle an, ohne die Annahme neu zu öffnen.

Ursprung bleibt e14. x1 (`thinkx1`, 8 Kerne, 15 GiB, `node` v22.23.2 mit
`node:sqlite`, gemessen am 2026-09-08) dient als Vorstufe für den Bau der
Phasen 1 bis 6 und höchstens als zweiter, zustandsloser Tunnel-Anschluss für
die statischen Seiten, nie für `api/`. Gründe: x1 war Anfang September vier
Tage offline, seine Platte ist unverschlüsselt und reist mit, und die
Sicherungskette läuft von e14.
