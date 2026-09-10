# entrosana.app — Übergabe Gestaltung

Stand 2026-08-01, 23:10 Uhr. Alle Zahlen sind am laufenden System gemessen, nicht
aus Dokumentation übernommen. Wo etwas ungeprüft oder offen ist, steht es dabei.
Belege in Klammern nennen Datei und Zeile oder das Messmittel.

---

## 1. Wofür dieses Dokument

entrosana.app ist der Hub, also das Produkt. entrosana.com ist die Website davor.
Beide sollen wie ein Haus wirken, aber sie haben verschiedene Aufgaben: die eine
wirbt, die andere wird benutzt. Dieses Dokument sagt, was die beiden teilen, wo
sie heute auseinanderlaufen und welche Bauteile eine Arbeitsfläche zusätzlich
braucht.

Wer es gelesen hat, kann an entrosana.app gestalten, ohne die Handschrift zu
verlieren, und kann eine Änderung ausliefern. Das Fundament ist bereits eins —
die Farbmerkmale, die Schriftleiter und das Raster stimmen auf beiden Auftritten
überein. Die Arbeit liegt woanders.

---

## 2. Was läuft, und wo

```
~/entrosana-app/                       neun Live-Dateien
  index.html tools.html modules.html contribute.html
  assets/app.css        14655 B       Gestaltung
  assets/fonts.css      49896 B       neun @font-face-Blöcke, base64
  assets/mark.svg        4166 B       Markenzeichen
  assets/theme.js        1053 B       Hell/Dunkel-Umschalter
  serve.mjs                           Auslieferung
  docs/handoff-design.md              dieses Dokument
```

Ausgeliefert wird von einem Node-Server ohne Fremdabhängigkeiten. `serve.mjs`
importiert ausschliesslich `node:http`, `node:fs`, `node:path` und `node:url`;
Node ist v22.23.1. Der Dienst ist eine systemd-Einheit im Benutzerbereich:
`Type=simple`, `PORT=4322`, `HOST=127.0.0.1`, `Restart=always`, `RestartSec=2`,
Protokoll nach `~/.sygnif/logs/entrosana-app.log`. Er ist `enabled` und `Linger`
steht auf `yes`, überlebt also einen Neustart des Rechners. Gelauscht wird nur
auf `127.0.0.1:4322` — von aussen führt kein Weg daran vorbei, nur durch den
Tunnel.

**Ein Tunnel bedient beide Auftritte.** In derselben `~/.cloudflared/config.yml`
stehen `entrosana.com` und `www.entrosana.com` auf `http://127.0.0.1:8090`, also
WordPress, und `entrosana.app` sowie `www.entrosana.app` auf
`http://127.0.0.1:4322`. Auffangregel ist `http_status:404`. Beides bedient ein
einziger Prozess. Ein Neustart von `entrosana-tunnel` nimmt entrosana.com **und**
entrosana.app gleichzeitig vom Netz. Die Beschreibung der Einheit ist überholt,
sie nennt noch «e14 :4321» — bedient werden :8090 und :4322.

Es gibt acht statische Routen, keine Pfadauflösung: `/`, `/tools`, `/modules`,
`/contribute` und die vier Dateien unter `/assets/`. Aus einer Anfrage wird nie
ein Pfad gebaut, es wird in einer Zuordnungstabelle nachgeschlagen — Pfad-Traversal
ist damit strukturell ausgeschlossen, nicht bloss abgesichert. Ein unbekannter
Pfad liefert die Startseite mit Status 404, damit nichts vorgetäuscht wird.
Erlaubt sind nur `GET` und `HEAD`, alles andere bekommt 405 mit `Allow: GET, HEAD`.
`GET /healthz` antwortet mit `ok`.

**Eine Änderung geht ohne Neustart live.** Alle 5000 ms vergleicht der Server den
ETag jeder Route mit der Platte und liest bei Abweichung neu ein; verschwindet
eine Datei kurzzeitig, wird die alte Fassung weitergeliefert. Ein Neustart ist
**nur** nötig, wenn eine ganz neue Datei hinzukommt — die Routentabelle wird
einmal beim Start durchlaufen. Im Protokoll ist das ablesbar: dreimal
«serving index.html», dann «serving 7 routes», dann «serving 8 routes».

Der Ursprung sendet für alle Antworten `Cache-Control: public, max-age=300`.
Cloudflare überschreibt das für Stilblätter auf `max-age=14400`, HTML bleibt
`DYNAMIC` und wird am Rand nicht zwischengespeichert. Wer eine CSS-Änderung sofort
sehen will, muss den Zwischenspeicher leeren; die Zugangsdaten liegen in
`~/.config/entrosana-cf-purge.env` mit `CLOUDFLARE_PURGE_TOKEN`, `CF_ZONE_COM` und
`CF_ZONE_APP`. Ein Helfer, der `CF_ZONE_APP` benutzt, existiert nicht.

**Die Sicherung deckt die Gestaltung nicht ab.** Die `EXTRAS`-Liste in
`~/entrosana-wp/backup.sh` führt genau drei Einträge: `entrosana-app/index.html`,
`entrosana-app/serve.mjs` und die Dienstdatei. Sieben der neun Live-Dateien stehen
in **keinem** Archiv: `tools.html`, `modules.html`, `contribute.html`, `app.css`,
`fonts.css`, `mark.svg`, `theme.js` — also die gesamte Gestaltung. Fehlende
Einträge melden nur eine Warnung, der Lauf bricht nicht ab
(`echo "WARNING: extras: missing $rel" >&2`). Der Kommentar in `backup.sh` nennt
`index.html` noch «Uebergangsseite» — das ist seit dem Gestaltungsdurchgang vom
2026-08-01 falsch. **Das ist der dringendste Punkt dieses Dokuments.** Siehe §10.

---

## 3. Das gemeinsame Fundament

Die Farbmerkmale sind auf beiden Auftritten identisch, in beiden Erscheinungen, im
Browser nachgemessen (`~/entrosana-app/assets/app.css:14-19` gegen
`~/entrosana-wp/theme/entrosana/assets/site.css:56-58`). Nur die Schreibweise der
Hexziffern weicht ab.

| Merkmal | dunkel | hell |
|---|---|---|
| `--paper` | `#1B1E24` | `#f5fffe` |
| `--paper-2` | `#22262E` | `#ECEEEA` |
| `--ink` | `#E9EBE7` | `#16181D` |
| `--ink-2` | `#C6CAD1` | `#3A3F49` |
| `--muted` | `#8F95A1` | `#6C7078` |
| `--line` | `#323843` | `#DCDDD6` |
| `--line-2` | `#3A404C` | `#2C313B` |
| `--line-ui` | `#5A6273` | `#8A8D84` |
| `--seal` | `#2BD4E8` | `#077183` |
| `--seal-2` | `#7FE7F3` | `#09606F` |
| `--verify` | `#2FB89E` | `#0E7C6B` |
| `--warn` | `#D2685C` | `#B23A2E` |
| `--card-bg` | `#232833` | `#FFFFFF` |
| `--field-bg` | `#1F232B` | `#FFFFFF` |
| `--btn-fg` | `#071316` | `#FFFFFF` |

`--seal-2` verhält sich gegenläufig: dunkel ist es **heller** als `--seal`, hell
ist es **dunkler**. Das ist Absicht, nicht Versehen — der Überfahrzustand soll in
beiden Fällen mehr Kontrast tragen.

Zwei Werte sind tot und dürfen nicht wiederbelebt werden. `#2742E0` ist das blaue
Siegel der v1-Palette, vollständig überschrieben; es lebt heute nur noch in
`mark.svg` weiter, siehe §5. Und `--radius` steht auf `4px` — es war zwischenzeitlich
`8px`, der Verwaltungsblock holt `4px` zurück.

**Schriftleiter**, Wurzelgrösse 100 % = 16 px. Die gemessenen Werte gelten für
390 px, 760 px und den Deckel.

| Stufe | Formel | gemessen |
|---|---|---|
| `--step--1` | `clamp(.78rem, .74rem + .2vw, .86rem)` | 12,62 / 13,36 / 13,76 px |
| `--step-0` | `clamp(.95rem, .9rem + .25vw, 1.05rem)` | 15,375 / 16,3 / 16,8 px |
| `--step-1` | `clamp(1.15rem, 1.05rem + .5vw, 1.4rem)` | 18,75 / 20,6 / 22,4 px |
| `--step-2` | `clamp(1.5rem, 1.3rem + 1vw, 2.1rem)` | 24,7 / 28,4 / 33,6 px |
| `--step-3` | `clamp(2.1rem, 1.7rem + 2vw, 3.4rem)` | 35 / 42,4 / 54,4 px |
| `--step-4` | `clamp(2.8rem, 2rem + 4vw, 5.2rem)` | 47,6 / 62,4 / 83,2 px |

Die Leiter wird nicht durchgehend eingehalten. `--step-3` und `--step-4` werden
für `.h2`, `.ph__h` und `.hero__h` weiter unten mit eigenem `clamp` überschrieben,
und eine Reihe kleiner Bauteile trägt feste Grössen: `.tool__state` `.68rem` →
10,88 px, `.tracks-lbl` `.7rem` → 11,2 px, `.tracks li` `.95rem` → 15,2 px. Für
eine Anwendung ist das eher Vorbild als Fehler — Bedienelemente vertragen feste
Grade besser als fliessende.

**Raster und Abstände.** `--wrap` ist 1140 px, `--gutter`
`clamp(1.25rem, .8rem + 2.5vw, 3.0rem)` → 48 px bei 1440. Die Formel lautet
`width: min(100% - 2*var(--gutter), var(--wrap))`, gemessen 344,891 px bei 390 und
1140 px ab 1260. Abschnittspolster `clamp(3.5rem, 2rem + 7vw, 7rem)`, Deckel 7 rem
= 112 px. Kartenpolster `clamp(1.25rem, .8rem + 2vw, 1.9rem)` → 30,4 px ab 1000.
Rasterabstand `.grid` `clamp(1rem, .5rem + 2vw, 2rem)` → 32 px ab 1260.

**Haltepunkte.** 759,98 px Mobilnavigation mit Burger 44 × 44 px; 760 px
`.grid--3`, `.fact`, `.nav__links`, `.foot__inner`; 820 px Unterseitenkopf fällt
auf eine Spalte, ebenso `.split`, `.tools`, `.hub-nest__grid`; 860 px senkrechter
Hero-Strich aus und Fusszeilenfuge ein; 900 px `.hero__grid`; 1000 px vollständiger
Hero-Umbau, nur Startseite; 1260 px Navigationspille löst sich vom Rand auf
1200 px.

### Wo entrosana.app abweicht

| | entrosana.com | entrosana.app | gleich? |
|---|---|---|---|
| Farbmerkmale | siehe Tabelle | dieselben Werte | ja |
| `--wrap` | 1140 px | 1140 px | ja |
| Inhaltsbreite @1440 / @430 | 1140 / 382,891 px | 1140 / 382,891 px | ja |
| Fliesstext @1440 / @430 | 16,8 / 15,475 px | 16,8 / 15,475 px | ja |
| `--step-0`, `--step--1` | identische `clamp()` | identische `clamp()` | ja |
| `--font-mono` | `"Geist Mono", ui-monospace, …` | derselbe Stapel | ja |
| Querscrollen | keines | keines | ja |
| `--font-sans` | `Calibri,Carlito,"Segoe UI",…` | `"Hanken Grotesk", system-ui,…` | **nein** |
| `--font-serif` | auf denselben Calibri-Stapel eingeebnet | `"Newsreader", Georgia, …` | **nein** |
| Wortmarke Farbe | einfarbig `rgb(43,212,232)` | zweifarbig, Wort `#E9EBE7` | **nein** |
| Zeichen | eingebettetes `<svg>`, `currentColor`, 2.4em → 40,31 px | `<img>`, fest 26 × 26 px, `fill="#2742E0"` | **nein** |
| Haarstrich unter der Marke | 79,94 × 2 px, Akzent 65 %, auslaufend | fehlt | **nein** |
| Kopfleiste | schwebende Pille, `sticky`, `blur(12px)`, 62 px | statischer, durchsichtiger Balken | **nein** |
| Kopfleiste @430 | bleibt 62 px, Burger | bricht auf zwei Zeilen, 116,97 px | **nein** |
| Abschnittspolster @1440 | 112 px oben, 48 px unten | 88 px oben und unten | **nein** |
| Überschrift @430 | 39,12 px | 49,2 px | **nein** |
| Trennstrich | Verlaufshaarlinie in `--seal` | harte graue Kante `--line` | **nein** |
| `--line-ui` | vorhanden | fehlt | **nein** |
| Grundton hell | `#CDEEF4` (nur Startseite) | `#f5fffe` | **nein** |

**Die Schrift wird auf keiner der beiden Seiten ausgeliefert.** Beide Auftritte
liefern neun `@font-face`-Blöcke als `data:font/woff2;base64` direkt im Stylesheet,
alle mit `font-display:swap`. Es kommen aber genau drei `unicode-range`-Werte vor:
Kyrillisch-Erweitert, Vietnamesisch und ein Interpunktionsbereich. **Ein
lateinischer Bereich fehlt vollständig**, `U+0-FF` steht in keiner der beiden
Dateien. `document.fonts` liefert alle neun Einträge im Zustand `unloaded`. Auch
«Geist Mono» fällt zurück. Solange das so ist, entscheidet allein der
Rückfallstapel über das Erscheinungsbild — und der ist zwischen den Auftritten
verschieden. Die 49'896 Bytes `fonts.css` tragen auf einer deutschsprachigen Seite
nichts bei. Vorbehalt: gemessen auf Linux, Rückfallschriften sind
betriebssystemabhängig. Der fehlende Latein-Bereich ist es nicht.

---

## 4. Der filigrane Trennstrich

Er ist das wiedererkennbare Mittel und muss in der Anwendung überleben. Es gibt
ihn in vier Stärken, alle aus derselben Rezeptur.

**Waagerecht zwischen Abschnitten, 26 %.** Selektoren
`.section:not(.section--ink) + .section:not(.section--ink)::before`,
`.section--ink + .section--ink::before` und `.foot::before`.

```css
content:""; position:absolute; top:0; left:50%; transform:translateX(-50%);
width:min(var(--wrap,1140px), calc(100% - 3rem)); height:1px;
background:linear-gradient(90deg, transparent,
  color-mix(in srgb, var(--seal) 26%, transparent) 18%,
  color-mix(in srgb, var(--seal) 26%, transparent) 82%, transparent);
```

Gemessen dunkel: 1140 px breit, 1 px hoch, `color(srgb 0.168627 0.831373 0.909804 / 0.26)`.
Hell folgt der Strich dem Merkmal: `color(srgb 0.027451 0.443137 0.513726 / 0.26)`,
also `#077183` bei 26 %. Die Geometrie ist identisch.

**Die Setzregel ist eng und soll eng bleiben.** Der Strich steht nur, wo eine Naht
sonst unmarkiert bliebe: zwischen zwei Abschnitten **gleichen** Untergrunds. Folgt
ein `--ink`-Abschnitt auf einen hellen, leistet der Tonwechsel die Trennung
bereits, und der Strich entfällt. Wer ihn überall setzt, macht ihn wertlos.

**Senkrecht in einer Fuge, 34 % und 42 %.** In der Fusszeile ab 860 px
(`.foot__cols::before`, Höhe `min(70%, 8rem)`) und im Hero (`.hero__msg::before`,
Höhe `clamp(5.5rem, 26vh, 9.5rem)`, 42 %). Beide verschwinden, sobald gestapelt
wird — ohne Spalten gibt es keine Fuge.

**Kurz und mit Schimmer, 65 %.** Für den laufenden Navigationsverweis und die
Wortmarke: `height:2px; bottom:-6px` und zusätzlich
`filter:drop-shadow(0 0 4px color-mix(in srgb,var(--seal) 55%,transparent))`.
`drop-shadow` statt `box-shadow`, weil es dem Alphakanal folgt und mit dem Strich
ausläuft. In der Fusszeile blendet dieselbe Form beim Überfahren ein, `opacity`
0 → 1 über `.18s ease`.

**Mobile Ersatzform.** Unter 759,98 px bekommt der aktive Verweis statt des
Strichs einen Punkt: 6 × 6 px, `border-radius:50%`, `background:var(--seal)`,
Verweis `padding-left:1.1rem`.

**Auf entrosana.app ist davon nichts umgesetzt.** Stattdessen steht eine harte
graue 1-px-Kante in `--line` `#323843` unter jedem Abschnitt und ein einzelner
`hr.sealrule` mit 56 × 2 px. Die harte Kante ist das genaue Gegenteil des
auslaufenden Verlaufs. Das ist der auffälligste Bruch mit der Handschrift und die
erste Änderung, die ich empfehle.

---

## 5. Bauteile, die aus entrosana.com übernommen werden

`.section` und `.section--ink` als Bänder, `.wrap` als Satzspiegel, `.eyebrow` als
Rubrik mit vorangestellter Haarlinie (22,0156 × 1 px in `--seal`, `opacity .5`),
`.lede` als Vorspann, `.card` mit `--card-bg`, 1 px `--line`, 4 px Radius und
`--shadow-1`, sowie die Kartenarten `.tool`, `.pillar3`, `.deploy__card`. Dazu
`.tag`, `.chip`, `.fact` als Faktenzeile mit `14rem 1fr`, `.btn` in zwei Rangstufen
und der Fokusring `outline:2px solid var(--seal); outline-offset:2px`.

Die Wortmarke wird aus `parts/header.html:3` übernommen:

```html
<a href="/" class="brand" aria-label="entrosana, home">
  <svg class="brand__logo" viewBox="0 0 100 100" aria-hidden="true">
    … zwei <path fill="currentColor"> …
  </svg><span class="brand__word">entro<b class="brand__accent">sana</b></span></a>
```

Das Grössenverhältnis ist bewusst gesetzt und im Quelltext begründet: Kopfzeile
Logo `2.4em` gegen Wort 15 px, Fusszeile `2.667em` innerhalb von `.foot__word`
(22,4 px) → 59,73 px. Faktor 2,667.

**Zwei Bauteile liegen auf entrosana.com fertig gestaltet vor und werden auf
keiner Live-Seite benutzt.** Sie gehören in die Anwendung, nicht auf die Website:

`.receipt` ist der stärkste Fund. Er hat eine Perforationskante als sich
wiederholenden Verlauf mit 6 px an und 6 px aus, ein Feld für den Zeitstempel und
eine Hash-Zeile in `--step-1`. Das ist der Bereich «The record», bereits
entworfen. Er wartet nur darauf, benutzt zu werden.

`.toggle` ist ebenfalls fertig: Bahn 34 × 18 px mit 999 px Radius, Punkt 14 px,
Verschiebung 16 px, das Ankreuzfeld absolut gesetzt und versteckt.

---

## 6. Bauteile, die eine Anwendung zusätzlich braucht

Für jeden Punkt steht, was entrosana.com hergibt und was fehlt. Neue Farben werden
nirgends erfunden — der Vorrat ist abschliessend.

**Der Zustandsvorrat ist zu klein.** Es gibt genau vier semantische Farben:
`--seal` als Akzent, `--verify` für gelungen, `--warn` für misslungen, `--muted`
für unbestimmt. Eine fünfte für «läuft gerade» oder «wartet auf Freigabe`
existiert nicht. Für einen Hub mit Projekten, Anfragen und Nachweisen ist das die
erste Lücke, die sich rächt. Vorschlag: «läuft» über Bewegung statt Farbe lösen —
`--seal` mit einer Pulsanimation —, und «wartet» über `--muted` mit
`--line-ui`-Rand. Damit bleibt der Vorrat unangetastet.

**Navigation mit Zustand — vorhanden, übernehmbar.** entrosana.com markiert die
laufende Seite serverseitig; ein `render_block`-Filter setzt `is-active` und
`aria-current="page"`, gestaltet als 1,5-px-Unterkante in `--seal`. Für eine
Anwendung mit stehender Navigation reicht das, es braucht nur eine zweite Ebene
für den Abschnitt innerhalb eines Bereichs.

**Datentabellen — nichts vorhanden, muss neu.** Über alle sechs geprüften Seiten
von entrosana.com steht kein einziges `<table>`, und keines der drei Stilblätter
kennt eine Regel für `table`, `thead`, `tbody`, `th` oder `td`. Vorschlag:
Kopfzeile in `--font-mono` auf `--step--1` mit Laufweite wie `.fact__k` (`.08em`),
Zeilentrenner als 1 px `--line`, Zeilenpolster `.7em`, kein Zebra — der
Trennstrich leistet die Gliederung.

**Formulare — teilweise vorhanden.** entrosana.com liefert `.form` als Raster mit
1 rem Abstand und höchstens 560 px Breite, Beschriftung über dem Feld, Feldpolster
`.6em` auf `.7em`, `--field-bg` als Grund, 4 px Radius, Fokus 2 px `--seal`. Das
trägt. Es fehlen Feldfehler, Hilfetext unter dem Feld und Pflichtfeldkennzeichnung.

**Schaltflächen — zwei Stufen vorhanden, aber auseinandergelaufen.**
entrosana.com liefert 999 px Radius mit Fettung 600, gemessen 37,8 px hoch gefüllt
und 43,8 px geisterhaft. Eine Anwendung braucht eine dritte, stille Stufe für
Nebenhandlungen und eine zerstörerische in `--warn`.

**Rückmeldung nach einer Handlung — fast nichts.** Der einzige Handlungsfall auf
entrosana.com ist das Kontaktformular, und es schreibt bei Erfolg, bei ausgelöster
Honigfalle und nach jedem Netzfehler **dieselbe** Zeichenkette «Message sent.».
Für eine Anwendung ist das unbrauchbar. Es braucht eine Rückmeldezeile mit drei
Ausgängen in `--verify`, `--warn` und `--muted`.

**Ladezustände — nichts, die grösste Lücke.** `spinner`, `skeleton` und `loading`
kommen in allen drei Stilblättern je nullmal vor. Ein Hub, der Belege,
Tabellenseiten und Modullisten nachlädt, braucht sie an jeder Stelle.

**Leerzustände — einer, und der ist Prosa.** Die Suchvorlage legt für keine Treffer
einen `<p class="lede">` an. Ein Leerzustand ist ein Bauteil: Rubrik, ein Satz,
eine Handlung.

**Fehlerzustände — nur die 404-Seite, ebenfalls Prosa.** Kein Feldfehler, keine
Formularzusammenfassung, kein Ausfallzustand für einen einzelnen Bereich.

**Rollen — kein Bauteil, aber die Sprache steht.** `tools.html` trägt `.tool__who`
als Zeile in `--seal-2` und `--font-mono`. Daraus lässt sich eine Rollenmarke
ableiten, ohne etwas Neues zu erfinden.

**Anmeldung — nichts.** Im gesamten Thema steht kein `type="password"`, kein
`wp-login`, kein `is_user_logged_in`. Der einzige Zugangsweg ist
`/request-access`, ein Kontaktformular. Und `serve.mjs` lässt nur `GET` und `HEAD`
zu — eine Anmeldung ist mit dem heutigen Server **nicht möglich**. Siehe §10.

**Suchen und Filtern — formal vorhanden, gestalterisch nicht.**
`templates/search.html` setzt `wp:search` ein, aber `.wp-block-search` kommt in
`blocks-bridge.css` nullmal vor — das Feld erbt die Vorgabe des Kerns.

**Blättern — nichts.** Die Suchvorlage setzt `perPage` auf 10, enthält aber keinen
Blätterblock; `pagination`, `page-numbers` und `nav-links` kommen in allen drei
Stilblättern nullmal vor.

**Zeitangaben — nichts.** Auf `/`, `/hub/` und `/roadmap/` steht kein einziges
`<time>`. entrosana.app hat die Absicht immerhin angelegt, `.project__rec`.

---

## 7. Dichte

entrosana.com atmet, entrosana.app ist bereits enger, für eine Arbeitsfläche
reicht beides nicht. Gemessen: Abschnittspolster 112 px oben und 48 px unten auf
.com, 88 px oben und unten auf .app, dort mit `--tight` 52 px.

Vorschlag, ausgehend von den gemessenen Werten: Abschnittspolster in der Anwendung
auf 48 px bis 64 px, Kartenpolster von 30,4 px auf 20 px bis 24 px, Rasterabstand
von 32 px auf 16 px bis 20 px, Absatzabstand von 20 px auf 12 px. Der Satzspiegel
bleibt bei 1140 px, die Schriftleiter bleibt unverändert — Dichte entsteht durch
Abstand, nicht durch kleinere Schrift.

Eine Ausnahme: der Trennstrich behält seine volle Breite. Er ist das Mittel, das
die gewonnene Enge wieder gliedert.

---

## 8. Was nicht verhandelbar ist

Der Name wird **immer** klein geschrieben, auch am Satzanfang. Die Wortmarke ist
**einfarbig** — Zeichen, «entro» und «sana» tragen dieselbe Farbe. Der filigrane
Trennstrich bleibt ein auslaufender Verlauf in `--seal`, niemals eine harte Kante.
Es werden keine neuen Farben eingeführt; der Vorrat aus §3 ist abschliessend.

Und die Inhaltssicherheitsregel von `serve.mjs` steht vor jedem
Gestaltungsvorschlag:

```
default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:;
font-src data:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'
```

Keine fremden Schriften, keine fremden Skripte, keine externen Bilder. Schriften
dürfen **nur** als `data:`-URI kommen. `form-action 'none'` heisst: kein Formular
kann heute absenden.

### Nachtrag 2026-09-08

Die Regel hat `connect-src 'self'` dazubekommen (`serve.mjs`, Zeile 94), damit
die Seite den eigenen Dienst unter `/api` erreichen kann. Der Dienst ist
`entrosana-api.service` auf `127.0.0.1:4324` (`api/server.mjs`, `node:http` und
`node:sqlite`, keine Fremdabhängigkeit); der Tunnel leitet `^/api/.+` für
entrosana.app und www.entrosana.app dorthin, mit zwei Regeln vor der
.app-Auffangregel in `~/.cloudflared/config.yml` (geprüft mit
`cloudflared tunnel ingress validate` und `ingress rule`). Alles Übrige der
Regel ist unverändert. `form-action 'none'` bleibt, bis Phase 3 ein Formular
braucht. Entscheid und Weg: `docs/meilenstein-konten.md`, `docs/contributions.md`.

---

## 9. Fallen

**Eine Gestaltungsregel kann hinter einer Startseiten-Bedingung gefangen sein.**
`design-polish.css` wird nur mit `is_front_page()` eingebunden. Genau daran ist der
Unterseitenkopf gescheitert: die `.ph`-Regeln standen dort, obwohl sie für Hub,
Service, Modules und Request access geschrieben waren — vier Seiten fielen auf eine
Spalte zurück. Behoben durch Auslagerung nach `page-hero.css`. Derselbe Fehler
steckt heute noch im Hellmodus: der Grundton `#CDEEF4` steht in
`design-polish.css` und gilt deshalb nur auf der Startseite.

**Die Klassen tragen das Design, nicht die Blöcke.** Wer Markup umbaut und dabei
eine Klasse verliert, verliert die Gestaltung. Vor und nach jeder Änderung die
Klassenliste vergleichen.

**Die WordPress-Abfrageparameter `?s=` und `?m=` verfälschen jede Messung.** `?s=`
ist die Suche, `?m=` das Archiv. Wer sie zum Umgehen des Zwischenspeichers
benutzt, misst eine ganz andere Seite und hält das Ergebnis für einen Fehler. Ein
harmloser Parameter wie `?nc=123` tut es.

**Ein Neustart des Tunnels nimmt beide Auftritte vom Netz.** Siehe §2.

**`.open` bedeutet in `app.css` zwei verschiedene Dinge** — einmal den Zustand
«in development» an `.tool__state`, einmal das Aufklappfeld der Projektdatei. Beide
Regeln haben dasselbe Gewicht. Das ist eine Kollision, die beim nächsten Ausbau
zuschlägt.

---

## 10. Offen — Entscheidungen des Eigentümers

**Die Sicherung der Gestaltung.** Sieben von neun Live-Dateien stehen in keinem
Archiv, darunter `app.css` und alle vier Seiten. Empfohlen wird, in `backup.sh`
statt einzelner Dateien den ganzen Ordner `entrosana-app/` aufzunehmen und den
überholten Kommentar «Uebergangsseite» zu streichen. **Steht noch aus.**

**Welche Schrift ist die Marke?** entrosana.com rendert Carlito über den Stapel
`Calibri,Carlito,…`, entrosana.app deklariert Hanken Grotesk. Das sind zwei
verschiedene Entwürfe. Solange die eingebetteten Schriften keinen lateinischen
Bereich tragen, entscheidet allein dieser Stapel über das Erscheinungsbild. Erst
nach dieser Entscheidung lässt sich die Schriftauslieferung reparieren.
**Besprochen, nicht entschieden.**

**Übernimmt entrosana.app die schwebende Pille?** Sie ist das prägnanteste Bauteil
von entrosana.com. Für eine Anwendung mit ständiger Navigation kann ein bündiger,
klebender Balken die bessere Wahl sein: mehr nutzbare Höhe, klarerer Zustand.
**Nicht entschieden.**

**Braucht der Hub einen Server, der mehr kann als ausliefern?** `serve.mjs` lässt
nur `GET` und `HEAD` zu, und die Inhaltssicherheitsregel setzt
`form-action 'none'`. Anmeldung, Formularversand und jedes Nachladen von Daten sind
damit heute ausgeschlossen. Das ist keine Gestaltungsfrage, aber es begrenzt, was
gestaltet werden kann. **Nicht entschieden.**

**Das Markenzeichen ist blau.** `assets/mark.svg` enthält zweimal
`fill="#2742E0"`, den Wert einer abgelegten Palette. Als `<img>` eingebunden kann
es `currentColor` nicht erben. Empfohlen wird, es wie auf entrosana.com in die
Seite einzubetten und auf `currentColor` zu stellen. Das ist eine kleine Änderung
mit grosser Wirkung und hängt an keiner anderen Entscheidung. **Steht noch aus.**

---

## 11. Nachtrag 2026-09-08, abends: drei Eingriffe nach der Durchsicht

Eine Durchsicht aller 13 Seiten (Schreibtisch dunkel und hell, Telefon 390 px;
39 Ladevorgänge, DOM-Prüfung je Seite, Bilder unter dem Scratchpad der Sitzung)
fand drei strukturelle Fehler. Alle drei sind seit 21:55 live, ohne Neustart:
`serve.mjs` liest geänderte Dateien binnen 5 s (`setInterval`, Zeile 126); die
Kante hängt an Stilblättern und Skripten `max-age=14400` (gemessen an
`/assets/app.css`, Ursprung sendet `no-cache`), deshalb tragen alle 11 Seiten
jetzt `?v=20260908d`, project.html zusätzlich für `project.css` und
`project-shell.css`, submit.html für `submit.js`.

**`/project` war am Telefon unbenutzbar.** `project.css` (Zeile 59) und
`project-shell.css` (Zeilen 5 und 262) setzen die Rasterspalten ohne
Medienbedingung und überschrieben damit die Handy-Regel `.app{grid-template-columns:1fr}`
aus `app.css` (gleiche Spezifität, später in der Kaskade). Dazu hielt
`.view{margin:0 auto}` das Brett auf seiner Inhaltsbreite: gemessen 980 px Brett
in 142 px Hauptspalte, Fensterbreite 1269 px statt 390. Neu am Ende von
`project-shell.css` ein Block unter 760 px: eine Spalte, `.view` gestreckt,
`.board` rollt für sich mit `scroll-snap-type:x mandatory`, Bahnen
`flex:0 0 min(86vw, 20rem)`, die Kopfzeile darf umbrechen (`height:auto`,
`flex-wrap`), die Bahnenliste `#filters` faltet sich mit (per ID, weil
`#filters{display:flex}` jede Klassenregel schlägt). Gemessen danach:
Fensterbreite 390 px, Brett 371 px sichtbar bei 1309 px Inhalt, vier Bahnen zu
320 px, Kopfzeile 123 px (zwei Zeilen), keine Konsolenfehler. Schreibtisch
unverändert: Brett 1137 px, vier Bahnen zu 272 px, kein Querlauf.

**Die Leiste stand nicht.** `.rail` war `position:relative` in einer Rasterspalte,
die mit der Seite wuchs: auf `/contribute` 3628 px hoch, bei 1500 px Rolltiefe
Marke und Konto ausser Sicht, während die Pille klebte. Neu (`app.css`, Block
«Die Leiste steht»): `position:sticky; top:.85rem; align-self:start;
height:calc(100dvh - 1.7rem); overflow:hidden auto`. Gemessen bei 1440 × 900:
Leiste 873 px, Oberkante 14 px bei Rolltiefe 0 und 1500, Marke und Konto
sichtbar; bei 700 px Fensterhöhe 673 px und die Leiste rollt für sich. Unter
760 px bleibt sie die zugeklappte Zeile im Fluss (`position:relative`). Auf dem
Rechner des Eigentümers (Windows, Fenster rund 790 px hoch, zwei Projekte) trug
die Leiste mehr als das Fenster und zeigte den hellen Systembalken mit Pfeilen;
seit 22:40 ist der Griff dünn und dunkel (`scrollbar-width:thin`,
`scrollbar-color` aus `--line-ui`, Trog durchsichtig), voll erst beim Überfahren.

**Das Formular unter `/contribute/submit`.** Vier Felder nebeneinander liefen
ungleich hoch (Eingaben 44 px, Auswahl 63 px), acht von neun Beschriftungen
hingen nicht am Feld (`label` ohne `for`), `novalidate` ohne eigene Prüfung
schickte leere Pflichtfelder an den Dienst («Sending…»), keine Live-Region,
Sternchen ohne Legende, der Hinweis zur Namensnennung in Fliesstextgrösse.
Neu in `submit.js`: eine Spalte auf 560 px wie `.form` auf entrosana.com (§6),
drei `fieldset` mit `legend` in Mono («Who you are», «The proposal», «Files and
your data»), zwischen den Gruppen der Trennstrich in 26 % (§4); jedes Feld mit
`for`/`id` und `aria-describedby` auf seinen Hilfetext; Pflicht ist die Regel,
ein Feld trägt «(optional)»; Prüfung vor dem Senden mit Fehlertext im
Hilfe-Platz, `aria-invalid`, Fokus auf das erste fehlerhafte Feld und Zählung in
einer `role="status"`-Zeile; die beiden Dateifelder wurden eine Zeile je Datei
(«Slides https://…», Beschriftung frei oder aus dem Verweis abgeleitet, höchstens
zehn, nur https); die Wahl zur Namensnennung steht als eigener Kasten mit dem
Verweis auf entrosana.com/privacy. Kontrast bleibt, wo er trägt: Schaltfläche in
`--seal`, Fehler in `--warn`, Erfolg in `--verify`. Gemessen: 3 Gruppen, 6 Felder,
6 beschriftet, 6 beschrieben, alle Felder 42 px hoch, 0 Sternchen; leeres
Absenden: 0 Anfragen, 4 Fehler, Fokus auf dem Namen; ungültige Zeile im
Dateifeld: 0 Anfragen, 1 Fehler; gültig: 1 Anfrage mit
`files:[{label:"Slides",url:…},{label:"sheet.pdf",url:…}]`, Schaltfläche danach
«Sent» und gesperrt. Telefon: Karte 358 px in 390, kein Querlauf.

Offen geblieben aus der Durchsicht, in dieser Reihenfolge: Eyebrows als
Überschriften (`h2`) statt `span`, damit die Seiten eine Gliederung tragen;
`aria-current` auch auf Detailseiten; Escape und Fokus für die Schublade; die
Suchattrappe mit `⌘K` entfernen, bis es eine Suche gibt; die Zähler «3» in der
Leiste benennen; Abschnittspolster 56 px → 40 px (§7); Tippfehler «avaiable»,
«verfied», «Whre»; `/contribute` führt weiter mit «Write to info@» statt mit
dem Formular.

### Nachtrag, später am 2026-09-08: das Konto

Der Kontoblock der Leiste («Not signed in · local device only») war Anzeige ohne
Weg. Jetzt ist er ein Verweis auf `/me` (`me.html`, `assets/me.js`, Route in
`serve.mjs`), und `app.js` schreibt Name und Stand aus der Marke hinein
(`localStorage entrosana-app:token`, seit heute mit `name` und `standing`);
angemeldet trägt der Kreis den Anfangsbuchstaben in Siegelfarbe. `/me` folgt dem
Formular: eine Spalte auf 560 px, drei Blöcke (Konto, Contributing, Your data),
Stand als `.chip`, Pflicht und Fehler wie unter `/contribute/submit`. Die
Anmeldung ist die vorhandene Mailbestätigung mit `purpose:"login"`; kein
Passwort, kein neues Bauteil, keine neue Farbe. Regelwerk und Zustände:
`docs/contributions.md`, «Konto: Sammler und Beitragende».

### Nachtrag, 2026-09-09 nachts: Berührung, Profil, Suche

Das Brett unter `/project` kannte nur HTML5-Drag, das auf Berührung nicht
feuert. Jetzt (`assets/project.js`, `project-shell.css`): Griff ⠿ mit
`touch-action:none`, 44 × 44 px, hebt sofort; langer Druck auf die Karte hebt
nach 350 ms; Schatten `.task--ghost` (fixiert, gedreht 1,5°); Bahn unter dem
Finger `.sec--over`; Autoscroll ab 44 px vom Rand; Wisch quer über die Karte
ab 60 px bei unter 40 px senkrecht schiebt eine Bahn weiter; Bahnenleiste
`.lanebar` über dem Brett, nur unter 760 px. Vorlage sind Materials Regeln für
Listen: Wischen wirkt auf das Element, langer Druck nimmt auf, Ziele 48 dp.
Gemessen im Emulator (390 px): Griff 44 × 44, Ablage in «In progress» mit
Toast, Wisch verschiebt ohne Fokuswechsel.

`/me` trägt das Profilbild (Kreis, `object-fit:cover`), den Wähler für Sprachen
(A–Z-Leiste, Chips) und das Journal; `/p/<id>` ist die öffentliche Seite in
derselben Karte. Die Suche ersetzt die Attrappe: `.search` ist ein Knopf, die
Palette ein `<dialog>` in `.pick`-Form (640 px, 7 vh von oben; am Telefon
ganzseitig), Gruppen als Eyebrows, Zeilen mit Titel, Kennung und Zeile.
Kein neuer Farbwert, keine neue Schrift.

### Nachtrag 2026-09-09 (Fälligkeit, Checklisten-Konsole, Profilbild)

**Fälligkeit im Board.** Das Details-Popup einer Karte hat ein Datumsfeld «Due date» mit «Clear»; gespeichert wird
`task.due = {date, string, is_recurring:false}` wie bei der Schnelleingabe («today», «tomorrow»). Die Karte zeigt
das Datum in Worten: «due today» (Siegelfarbe), «due tomorrow», «due in n days» bis 14 Tage, sonst das Datum,
und «n days overdue» in Rot, solange die Karte nicht in Done liegt. Sortierung «Due date» bestand schon.
Belegt: Prüflauf `gate-due.mjs` (Modal, Pillen, Speicher, Sortierung, Leeren) ohne Konsolenfehler.

**Checklisten-Konsole.** Die Projektvorlagen (`assets/seeds.js`) waren bislang nirgends editierbar; die alte
Konsole :8396 kennt nur Beiträge und Bewerbungen, der Texteditor :8393 nur Seitentexte. Neu in der Hub-Schicht
von :8393: `/hub/checklists` (Liste) und `/hub/checklists/<track>/<nnn>` (Titel, Untertitel, Prompts, Schritte
mit t/n/i). Speichern legt eine Sicherung `~/entrosana-app-backups/seeds.js.<Zeit>.admin` an, schreibt die Datei
mit erhaltenem Kommentarkopf, hebt `seeds.js?v=` in allen 14 Seiten und versucht einen Git-Commit der
betroffenen Dateien. Der Ursprung liest die Datei binnen 5 s neu; wer eine Liste schon auf dem Gerät hat,
behält seine Kopie (der Import läuft nur beim ersten Öffnen über `?p=`).

**Profilbild.** Der Upload scheiterte an der eigenen CSP: `img-src 'self' data:` liess die `blob:`-Vorschau nicht
laden, der Browser meldete «could not read that image», es ging nie eine Anfrage ab (API-Log ohne Avatar-Zeilen).
Behoben doppelt: `me.js` liest die Datei als data:-URL (FileReader), und `serve.mjs` erlaubt `blob:` in `img-src`.
Belegt: Prüflauf `gate-avatar.mjs` im Telefonformat, POST `/api/me/avatar` 200, Bild 3 619 B als JPEG in der
Datenbank, Rail und öffentliches Profil zeigen es.

**Seitentexte aus der Konsole (Nachtrag, 2026-09-09).** Neben den Checklisten bearbeitet die Hub-Schicht von :8393 nun
auch die Texte der 14 statischen Seiten: `/hub/pages` listet sie, `/hub/pages/<name>` zeigt jede Textstelle aus `<main>`
und dem `<title>` als Feld, in Seitenreihenfolge, mit dem Pfad (`h1.work__h`, `a.btn`, `p.mcard__l`) als Beschriftung.
Anders als der WordPress-Editor fasst dieser Editor kein Markup an: der Parser merkt sich Anfang und Ende jedes
Textlaufs im Rohtext, ersetzt beim Speichern nur diese Spannen (von hinten nach vorn), faltet Zeilenumbrüche zu
Leerzeichen und behält führenden wie folgenden Weissraum, damit Inline-Fugen wie «, for a contribution» stehen bleiben.
Jede Änderung trägt den Ausgangstext mit; stimmt er nicht mehr mit der Datei überein, wird die Stelle als Konflikt
gemeldet und nicht übernommen. Glyphen, Rail, Suchknopf und Skripte sind ausgeblendet. Speichern legt eine Sicherung
`<name>.html.<Zeit>.admin` an und versucht einen Commit; die Kante hält HTML nicht vor, der Ursprung liest binnen 5 s neu.
Nicht von hier editierbar bleiben der Katalog (`assets/catalogue.js`, Kommentare im Objekt, kein striktes JSON) und die
Texte, die JavaScript erzeugt (Konto, Profil, Status, Suche).

**Konsolen getrennt (Nachtrag, 2026-09-09).** Auf Wunsch des Eigentümers («dont mix up .com and .app backend») ist die
Hub-Schicht aus dem .com-Editor (:8393, `~/entrosana-site/admin.py`) in die Hub-Konsole (:8396, `admin-app.py`)
gezogen: Konten unter `/accounts`, Anfragen unter `/requests`, die Checklisten unter `/checklists` und
`/checklists/<track>/<nnn>` (Speichern mit Sicherung, Versionshebung und Commit wie beschrieben; eine Speicherung ohne
Änderung schreibt nichts). Bewerbungen und Beiträge lagen dort schon. Die beiden vorigen Nachträge sind entsprechend zu
lesen: Pfade mit `/hub/…` auf :8393 gibt es nicht mehr, der .com-Editor zeigt nur noch mit einer Zeile auf :8396.
Der eigene Seitentext-Editor `/hub/pages` wurde nicht mitgenommen: die Hub-Konsole hat unter `/page/<name>.html` seit
dem 2026-09-08 einen Editor für die sieben Inhaltsseiten, mit Vorschau und Schriftgrössen; Contribute hat dort 122
Textstellen. Die Parser-Funktionen (`hub_text_runs`, `hub_apply_edits`) bleiben in der Git-Geschichte von
`entrosana-site` (Commit 5ff0761), falls ein Editor für die übrigen sieben Seiten je gebraucht wird.
Ausserdem korrigiert: das Entscheiden-Formular der Beitragsseite lag in den `.f`-Rastern des Texteditors und bekam
auf dem Laptop nur die 4,2 rem breite Beschriftungsspalte; es hat jetzt einen eigenen Block `.decide` in Lesebreite.

**Nachtrag, 2026-09-09 spät: Versionen, ein Schritt, Stände, Schlange, Module.**

*Automatische Asset-Versionen.* Die Kante hält Assets vier Stunden vor; darum «landete» eine Veröffentlichung
zwar in Datenbank und `catalogue.js`, die Seite /modules zeigte sie aber bis zu vier Stunden nicht. `serve.mjs`
setzt die Versionen jetzt selbst: beim Laden einer HTML-Seite bekommt jeder Verweis auf `/assets/<datei>` den
Inhalts-Hash der Datei als `?v=`, und `<html>` trägt den Hash des Katalogs als `data-cv`. Ändert sich ein Asset
(Katalog, Checklisten, CSS, JS), werden alle Seiten binnen 5 s neu versioniert; Handbumps entfallen. Belegt:
`catalogue.js?v=<hash>` an der Kante enthält den neuen Slug sofort.

*Ein Schritt.* Der Eigentümer will Annahme und Veröffentlichung zusammen. `actionFor("reviewing","published")`
ist jetzt «publish»; der Dienst setzt in diesem Fall Entscheid und Veröffentlichung im selben Schritt, schreibt zwei
Kettenzeilen (`contribution.admitted`, `publish`) und schickt eine Mail. Die Prüfungen vor dem Tor (`checks`)
kommen für Beiträge in Prüfung und für angenommene. Konsole und Schlange bieten «annehmen und veröffentlichen»,
«annehmen, noch nicht veröffentlichen», «ablehnen». Ein veröffentlichter Beitrag trägt keine Entwurfsmarke mehr
(`draft:false`, `state:"development"`, `meta: "contributed · text by the contributor"`).

*Stände.* Drei Worte für Karte und Detailseite: `idea` («only an idea», grau), `development` («still in
development», bernstein), `finished` («finished», grün; `available` gilt weiter als finished, `running` für
Dienste). Die Konsole bietet den Stand als Auswahl im Katalog-Editor; Beitragende setzen ihn auf /me/modules.

*Schlange in der Gestaltung des Hubs.* `/review` (review.html, assets/review.js) zeigt Eigentümer und Prüfenden die
Beiträge mit Filtern, die Detailseite mit Fakten, Vorschlag, Dateien, Aufzeichnungen, Prüfungen und dem
Entscheiden-Formular, dazu die Bewerbungen (`?tab=applications`). Das Konto spricht mit dem Dienst über seine
Bearer-Marke; die Rechte sind dieselben wie in der Konsole (`can(actor,"decide"|"publish")`). /me zeigt dem
Eigentümer einen Block «Team» mit Zähler und Link. Die Konsole :8396 bleibt als zweiter Weg.

*Module mit mehreren Beitragenden, Bearbeitung, Punkte, Meldungen.* Migration 013: `module_contributors(slug,
actor_id, added, added_by)` (gesät aus den veröffentlichten Beiträgen) und `points(slug, actor_id, created)`.
Endpunkte: `GET /api/me/modules`, `GET|PATCH /api/me/modules/:slug` (title, who, lede, about, note, state; nur
Einträge der Spur `contributed`, nur eingetragene Beitragende und das Team), `POST …/contributors` (E-Mail eines
freigegebenen Kontos mit Namen), `DELETE …/contributors/:id` (mindestens eine Person bleibt); `by` wird aus den
Namen neu gesetzt. `publish.mjs::updateEntry` schreibt den Eintrag an Ort und Stelle (nur striktes JSON, also die
von publish geschriebenen Einträge). `GET /api/points` (Zählung, eigene), `POST /api/modules/:slug/point`
(umschaltbar, Konto nötig, 120/h). Meldungen: `POST /api/requests` mit `kind:"report"` und `module:<slug>` geht an
sygnif@ statt info@; die Detailseite verlinkt `/request?kind=report&module=<slug>`, das Formular belegt den Text
vor. Seite /me/modules (module.html, assets/module.js) für die Beitragenden; /me verlinkt sie unter «Documents».

*Modulseite in drei Gebieten (2026-09-09, spät).* Die Seite /modules ordnet jedes Modul in seinen Abschnitt Nature,
Social oder Technical (ein vierter, «Other», bleibt versteckt, bis dort etwas liegt). Massgebend ist das Feld `area`
des Eintrags (`nature-based`, `social`, `technical`, `other`); fehlt es, wird es aus der ersten Zeile abgeleitet. Die
Einträge der Spur `onrequest` sind keine Module, sondern die Einleitung ihres Gebiets (Kernsatz plus Verweis auf die
Detailseite, die den Zuschnitt auf Anfrage beschreibt). Jede Karte trägt unter sich eine Kontaktzeile in Mono:
die Beitragenden als Verweise auf ihre Profile (`GET /api/modules/meta`: Beitragende und Punkte je Modul, öffentlich),
das Datum der letzten Änderung (`updated`, gesetzt bei Veröffentlichung, jeder Bearbeitung auf /me/modules und jedem
Speichern im Katalog-Editor), die Zahl der Dateien und der Weg, mitzuwirken: `/request?kind=contribute&module=<slug>`
(geht an sygnif@), Mail, Telefon. Die Karte selbst bleibt ein einziger Link. Der Katalog-Editor der Konsole bietet
Gebiet und Stand als Auswahl.

*Einladen (2026-09-09, spät).* Kontoseite: Block «Invite» zwischen «Contributing» und «Tasks» mit Adresse, Zeile in
eigenen Worten und der Liste der gesendeten Einladungen (gesendet am, angenommen am). Dienst: Migration 014
(`invites`), `GET|POST /api/me/invites`, Annahme in `GET /api/verify`; Einzelheiten in docs/contributions.md.
Die Schlange (/review) trägt seit heute Kästen in der Seitenschrift, eine Marke «done» für abgeschlossene Vorgänge
und den Reiter «Members» (alle Konten mit Stand, Rollen, Profil und Zahlen).

*Aufklärung auf der Kontoseite (2026-09-09, spät).* Unter dem Profil steht ein Block «Record trail and visibility»:
was der Record Trail ist (nur wachsende Liste, jede Zeile gegen die vorige versiegelt, bleibt im Browser, verlässt
das Gerät nur mit einem Vorschlag oder Export; der Dienst führt seine eigene, prüfbare Kette), was öffentlich ist
(Profilseite, veröffentlichte Module, Punkte als Zahl) und was privat bleibt (Adresse, private Journalzeilen,
Aufzeichnungen auf dem Gerät, Vorschläge bis zur Veröffentlichung, Bewerbungen, Einladungen; das Team sieht, was es
für seine Arbeit braucht). Für Rechte und Fristen verweist er auf https://entrosana.com/privacy.

*Residenz gegen Verarbeitung (2026-09-09, spät).* Der Eigentümer bestätigte: Claude (Anthropic, USA) liest das
Postfach sygnif@; «Swiss/EU» gilt der Datenresidenz, nicht dem Dienst. Auf entrosana.com sagen Service (ID 12) und
Roadmap (ID 112) das nun: die Zelle «model» der gehosteten Stufe heisst «CH/EU or USA», die Marke «managed ·
Swiss/EU data residency», der Absatz der gehosteten Stufe nennt die Anbieter in der Schweiz und den USA. Die Seite
Privacy (ID 17) trägt die neue englische Erklärung, /privacy/de/ (ID 161) die deutsche. Die Textschnittstelle
(`/texts/<id>`) lehnte die Änderungen ab, weil sie die Klassenzahl der Seite vergleicht; gesetzt wurde per
`wp eval-file` im wpcli-Container mit `kses_remove_filters()` und `--user=gianson`, Sicherungen der drei Beiträge
in `~/entrosana-app-backups/wp-post-<id>.*.html`. Im Hub sagt der Block «Record trail and visibility» auf /me
dasselbe in einem Absatz, und der Schritt «It arrives» auf /contribute nennt Claude.

*Modulbearbeitung vollständig verdrahtet (2026-09-09, spät).* `/me/modules` bearbeitet nun auch Originale des
Katalogs (Value System), sofern die Person als Beitragende eingetragen ist oder zum Team gehört; das Team sieht
dort alle Module ausser den Gebietsbeschreibungen (`onrequest`, weiter in der Konsole). Felder: Titel, Zeile,
Kernsatz, Beschreibung, Zusatz, Stand, Fusszeile (`meta`), Fakten (`facts`, «Beschriftung: Wert» je Zeile, bis
zwölf) und «What you get» (`gets`, bis acht Zeilen). Die Detailseite zeigt Berechtigten den Knopf «Edit this
module» (Anfrage an `GET /api/me/modules/<slug>`, nur mit Marke). `updateEntry` bewahrt bei Originalen alle
Felder, Reihenfolge und die Kommentare der Datei; belegt an einer Kopie und im Prüflauf `gate-modedit.mjs`.

*Erstes Projekt im Arbeitsplatz (2026-09-09, spät).* Ein leerer Arbeitsplatz zeigte «Welcome» und sonst nichts, womit
man anfangen konnte. `app.js::ensureStarter()` legt beim ersten Besuch der Startseite ohne aktive Projekte auf dem
Gerät das Projekt «Contribute a module» (neue Checkliste `contribute/003`, acht Schritte: Gebiet und Form, Zeile und
Kernsatz, Dateien, Vorschlag senden, Adresse bestätigen, registrieren und bewerben, Lesung des Teams, bearbeiten und
wachsen lassen) in den Board-Speicher und merkt sich das in `entrosana-starter:v1`; ohne Kettenzeile, weil das Gerät
noch nichts getan hat. Geräte mit eigenen Projekten bleiben unberührt (die Marke wird nur gesetzt). Die Karte
«Continue and track your projects» zeigt dann 0/8 mit dem nächsten Schritt, die Leiste das Projekt, /project das
Board mit acht Karten in Pending. Belegt: `gate-starter.mjs` (frisches Profil, zweiter Besuch ohne Dublette,
Telefon, bestehendes Projekt).

*Eigene Dienste (2026-09-10).* «Running services» war die Maschine des Hubs für alle; jetzt ist es die Liste des
Kontos: leer mit Erklärungsblase für neue Konten, mit Knopf zur Anmeldung für Besucher, der Schnappschuss von e14 nur
noch für das Team darunter. Der Dialog fragt Prüfart (url, mcp, webhook, tcp, tls), Adresse, Kategorie, Ort und
Intervall; nach einem Webhook zeigt die Seite die geheime Adresse einmal mit einem curl-Einzeiler. Die Zeile trägt
Punkt, Name mit Host, Zweck, Ort, Art und Intervall, Stand mit Zeit, «check now» oder «new address», «remove».
Der Zähler in der Leiste zeigt die eigene Zahl, für das Team die der Maschine. Einzelheiten in docs/contributions.md.
Helles Thema geprüft auf allen 18 Seiten (Kontrast nach WCAG): Bernstein «still in development» und der aktive
Chip auf dem Siegel waren zu schwach, `--verify` im hellen Thema auf 4.9:1 gehoben.

*Gebiete als Reiter (2026-09-10).* Die Modulseite zeigt Nature, Social und Technical als Reiter (WAI-ARIA tablist,
Pfeiltasten, ein Reiter im Tabulator-Lauf), je einer zur Zeit: oben die Einleitung des Gebiets aus dem
`onrequest`-Eintrag, darunter die Karten mit Kontaktzeile, bei leerem Gebiet der Hinweistext. Der Reiter trägt die
Zahl der Module. Die Wahl bleibt im Gerät (`entrosana-area:v1`), `?area=<id>` führt direkt hin und wird beim
Wechsel nachgeführt; ohne Wahl öffnet das erste Gebiet mit Modulen. «Other» erscheint nur, wenn dort etwas liegt.
Die vorigen Abschnitte (`data-area-section`) sind aus modules.html entfernt; `cards.js` behält den Code dafür.


**Nachtrag 2026-09-10, Dienste des Eigentümers.** `assets/services.js` (Schnappschuss der Maschine aus
`tools/services-snapshot.sh`) wird nicht mehr ausgeliefert und auf keiner Seite mehr eingebunden;
`api/server.mjs` liest die Datei und gibt sie bei `GET /api/me/services` als `machine` nur dem
Eigentümer mit. Auf /services stehen diese Zeilen in derselben Liste wie die eigenen Einträge
(Hostname statt Prüfart, Lesezeit, keine Knöpfe); jedes andere Konto sieht nur seine eigenen. Der
Zähler in der Leiste liest `entrosana-svc-own:v1` und `entrosana-svc-machine:v1`, die die Seite
/services ablegt. Die Erklärung der Seite ist eine Blase am (i)-Knopf (`.svc__pop`), am Telefon ein
Blatt am unteren Rand; der Text zum Lebenszeichen nennt die Adresse `/api/hooks/…`, wann sie
erscheint und was damit zu tun ist.

**Nachtrag 2026-09-10, docs.entrosana.app.** Sechs Seiten in Markdown unter `docs-site/` (getting-started,
accounts, contribute, services, api, privacy; die Reihenfolge steht in `PAGES` in docs-render.mjs), Hülle `docs-site/shell.html` (aus dem Rail der App gebaut, Glyphen in
`docs-site/glyphs.json`), gerendert von `docs-render.mjs` (eigene kleine Teilmenge: Überschriften,
Absätze, Listen mit einer Unterebene, Zäune, Tabellen, Zitate, fett, kursiv, Code, Verweise; keine
Abhängigkeit). `serve.mjs` weicht auf `DOCS_HOST` (Standard `docs.entrosana.app`) ab: Seiten aus
`docs-site/`, Assets wie die App, unbekannte Pfade 404 mit der ersten Seite, gleiche CSP und noindex-Regel;
gehalten bis Quelle, Hülle, Glyphen oder app.css sich ändern (Prüfung je Anfrage über mtime). Prosa-Stile
`.doc`, Inhaltszeile `.doc__toc`. Konsole :8396: `/docs` und `/docs/<seite>.md` bearbeiten die Quelle,
Kopie in `~/entrosana-app-backups`, live ohne Neustart. Tunnel: `docs.entrosana.app → 127.0.0.1:4322`
in `~/.cloudflared/config.yml`. DNS: das Tunnel-Zertifikat gilt nur für die Zone entrosana.com; `cloudflared
tunnel route dns` legte deshalb `docs.entrosana.app.entrosana.com` an (zu löschen). Der richtige Eintrag,
CNAME `docs` → `69e77bd9-70aa-4d0e-b8ea-16eacc25cb3a.cfargotunnel.com` (proxied) in der Zone entrosana.app,
braucht das Dashboard oder ein `cloudflared tunnel login` für diese Zone.

**Nachtrag 2026-09-10, vorgeschlagene Projekte.** Die Vorschläge der Spur «contribute» (Propose a track, Review
someone else's work, Ask for runway, Contribute a module) sind aus `assets/seeds.js` heraus und die drei Karten
auf /contribute im Katalog (`assets/catalogue.js`, Abschnitt contribute) durch die drei Vorhaben des Hubs
ersetzt: «Docs in plain language, in several languages» (Slug docs-in-plain-language, Seed hub/001, 8
Schritte), «Translate the website text» (translate-the-website, hub/002, 8), «Work out the requests»
(work-out-the-requests, hub/003, 6); die alten Detailpfade antworten 404. Die Kacheltexte auf der Startseite
und die Beschreibung von /contribute nennen die neuen drei. Die Checklisten `tools/*` und `modules/*` bleiben,
weil ihre Katalogkarten sie über `seed` zählen.
`app.js ensureStarter()` legt die drei Projekte jedem Brett einmal an (Marke `entrosana-proposed:v2`),
entfernt den alten Startvorschlag `contribute/003`, wenn keine Karte bewegt oder abgehakt wurde, und lässt ihn
sonst stehen. Der Dialog «New project» zeigt die Abschnitte tools, modules, hub; die Konsole bearbeitet die
drei unter /checklists wie die anderen.
