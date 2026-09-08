# Beiträge: Zustände, Regeln, Rollen

Stand 2026-09-08. Gilt für alles, was über entrosana.app eingereicht wird:
Modulvorschläge, Rezensionen, Anfragen nach Runway. Eine Stelle für Zustände,
Regeln und Entscheide. Die Umsetzung in `api/` richtet sich nach diesem
Dokument, nicht umgekehrt.

## Zustände

```
received → confirmed → reviewing → admitted
                                 → rejected
                     ↘ withdrawn (nur aus received, confirmed, reviewing)
```

- **received**: eingegangen, E-Mail-Adresse unbestätigt. Sichtbar nur für die
  einreichende Person und die prüfende Rolle.
- **confirmed**: der Bestätigungsverweis aus der Mail wurde geöffnet. Erst
  jetzt gilt der Beitrag als eingereicht.
- **reviewing**: eine prüfende Person hat ihn übernommen.
- **admitted**: angenommen. Der Beitrag erscheint als Katalogeintrag mit
  `draft: true`, Urheberangabe `by` und Gleis `contributed`.
- **rejected**: abgelehnt.
- **withdrawn**: von der einreichenden Person zurückgezogen.

Jeder Übergang ist eine Zeile in der Kette (`audit`), mit Akteur, Rolle und
Zeit. Eine Entscheidung ohne Begründung wird abgewiesen, und zwar vom Endpunkt
selbst: `PATCH /api/contributions/:id` lehnt eine leere Begründung ab.

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
| in den Katalog veröffentlichen | nein | nein | ja | ja |
| Rolle vergeben | nein | nein | nein | ja |

Später, ohne Änderung an der Annahme: `editor` (nur Katalogtexte), `school`
(liest die eigenen Anfragen, über `org_id`), `teacher`, `parent`, `learner`.
Jede dieser Rollen ist eine Zeile in `roles` und ein Eintrag in der Regel,
kein neues Schema. Die Spalte `org_id` und die Akteursart `account` warten
dafür schon.

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

## Personendaten

Ein Beitrag enthält Name, E-Mail-Adresse und den Record-Trail der einreichenden
Person. Was gespeichert wird, wie lange, und der Weg zur Löschung gehören auf
entrosana.com/privacy/, bevor der erste Beitrag angenommen wird (Phase 7).
Eine einreichende Person zieht einen offenen Beitrag selbst zurück; das löscht
Inhalt und Dateien und lässt allein die Kettenzeile stehen.
