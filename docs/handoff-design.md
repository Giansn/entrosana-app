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
