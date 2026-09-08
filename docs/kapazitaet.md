# Kapazität und Schwachstellen, gemessen am 2026-09-09

Ein Durchlauf gegen die Kante (Fehlerpfade) und gegen den Ursprung (Last),
dazu ein Fehlerdurchlauf aller 17 Seiten im Browser, frisch und angemeldet.
Maschine e14: 8 Kerne (i7-1165G7), 31 791 MB RAM (19 381 frei), 140 GB Platte
frei, Last 0,3 im Ruhezustand. Dienste: `entrosana-api` 16 MB, `entrosana-app`
18 MB, je `MemoryMax` 256 MB. Datenbank 662 344 B mit 3 Konten, 6 Beiträgen,
87 Kettenzeilen.

## Last am Ursprung (32 Verbindungen, 4 s je Ziel, `scratchpad/load.mjs`)

| Ziel | Anfragen/s | p50 | p99 | Fehler |
|---|---|---|---|---|
| `GET /api/healthz` | 10 871 | 2,2 ms | 8,7 ms | 0 |
| `GET /api/search?q=value` | 8 738 | 2,4 ms | 11,8 ms | 27 273 × 429 (Drossel greift wie vorgesehen) |
| `GET /api/profiles/2` | 6 065 | 4,5 ms | 12,5 ms | 0 |
| `GET /` (HTML) | 8 915 | 3,1 ms | 8,2 ms | 0 |
| `GET /modules` | 10 010 | 2,7 ms | 7,1 ms | 0 |
| `GET /assets/app.css` | 5 878 | 4,8 ms | 11,0 ms | 0 |

Speicher danach: API 37 MB, App 20 MB; Last 0,71. Beide Dienste sind je ein
Node-Prozess ohne Cluster; das genügt bei diesen Zahlen.

## Schätzung: wie viele Menschen trägt das heute

- **Leser gleichzeitig:** Der Ursprung liefert rund 9 000 Seiten je Sekunde;
  Stilblätter und Skripte hält die Kante 4 Stunden. Rechnet man 10 Anfragen
  an den Ursprung je Person und Minute in Spitzen, trägt der Ursprung
  rechnerisch über 50 000 gleichzeitige Besucher. Der engere Flaschenhals ist
  der Tunnel: zwei `cloudflared`-Verbinder auf einem Heimanschluss, geschätzt
  einige tausend Anfragen je Sekunde, also in der Grössenordnung von 10 000
  gleichzeitigen Besuchern. Weit jenseits des Bedarfs.
- **Konten:** SQLite trägt Millionen Zeilen; Profilbilder liegen als BLOB
  (höchstens 180 KB, vom Browser auf rund 20 bis 40 KB verkleinert): 10 000
  Konten wären rund 400 MB, die nächtliche Kopie wächst entsprechend.
- **Neuanmeldungen je Stunde: die eigentliche Grenze.** Jede Anmeldung, jede
  Bestätigung und jede Entscheidung ist eine Mail; `MAIL_CAP` deckelt bei
  60 Mails je Stunde (`api/server.mjs`, Zeile 39). Das sind rund 50 neue
  Konten je Stunde, etwa 1 000 am Tag. Eine Klasse mit 25 Personen, die sich
  gemeinsam anmeldet, braucht eine halbe Stunde, und eine zweite Klasse in
  derselben Stunde wartet.
- **Schulen hinter einer Adresse:** `RATE` erlaubt 5 Anfragen je Stunde je IP
  für Anmeldeverweise, Vorschläge und Anfragen (Entscheid 5). Hinter dem NAT
  einer Schule sind das 5 Anmeldungen je Stunde für das ganze Haus. Suche:
  1 200 je Stunde je IP (seit heute); Journal: 60 Einträge je Stunde je Konto.

## Gefunden und behoben (2026-09-09)

- Die Konsole meldete das Tor als zu («submitter not approved as contributor»),
  weil die Leseansicht die Rollen der einreichenden Person nicht lud. Behoben;
  Tor #4 und #6: alle Prüfungen bestanden.
- `GET /api/search` war ungedrosselt; jetzt 1 200 je Stunde je IP.
- Die Bildgrenze (300 KB) lag über der Body-Grenze (256 KB, base64): jetzt
  180 KB, Fehlertext und Texte angepasst.
- `paintWorkspace` schrieb die Kettenzeile auf jeder Seite, sobald Records da
  waren, und warf einen Fehler; jetzt nur, wo das Element existiert.

## Gefunden und offen — Entscheide des Eigentümers

1. `MAIL_CAP` 60/h: für Schulklassen zu wenig. Vorschlag 300/h, nachdem Protons
   Sendegrenze für das SMTP-Konto geprüft ist.
2. `RATE` 5/h je IP: für Schulen zu wenig. Vorschlag 60/h je IP bei 5/h je
   Adresse; die Adresse ist die bessere Kennung.
3. Eine unbestätigte Einreichung wartet auf den Mailversand (2,8 s gemessen);
   Antwort und Mail liessen sich trennen. Kosmetisch.
4. Ein Rechner, ein Heimanschluss: Verfügbarkeit, nicht Kapazität, ist das
   Risiko. x1 kann die Seiten spiegeln, nicht den Dienst (Entscheid: Ursprung
   bleibt e14). Ein API-Neustart kostet rund 1,5 s.
5. Konsolen im Tailnet ohne Schlüssel: jedes Gerät im Tailnet entscheidet mit.
   Tailscale-ACL eng halten; Geräte, die gehen, aus dem Tailnet nehmen.
6. Docker-Protokolle von entrosana.com ohne Grenze (siehe `docs/datenschutz.md`).

## Fehlerpfade (Kante, `scratchpad/probe-api.sh`)

Unbekannte Route 404, falsche Methode 405, falscher Inhaltstyp 415, kaputtes
JSON 400, 300 KB Körper 413, ohne oder mit falscher Marke 401, fremde Ressourcen
401/403, Kennungen ausserhalb 404, verbrauchter Verweis 410, Pfadaufstieg 400
und 404, Datenbankdatei 404. Suche mit `' OR 1=1 --`, `%%`, `<script>` und 5 000
Zeichen: 200 mit leerem Ergebnis, nichts ausgeführt, nichts protokolliert. Kopf:
CSP, HSTS, `nosniff`, Referrer-Policy. Browserdurchlauf: kein Fehler auf 17
Seiten, frisch und angemeldet; einzig `/p/999` protokolliert den erwarteten 404
der Profilabfrage.
