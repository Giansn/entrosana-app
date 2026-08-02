# entrosana.app — Übergabe Gestaltung

Stand 2026-08-01, 23:20 Uhr. Jeder Wert hier ist am laufenden System gemessen oder aus der Datei gelesen, nichts aus Dokumentation übernommen. Wo etwas fehlt oder ungeprüft ist, steht es dabei.

Kurzformen der Pfade, überall sonst absolut ausgeschrieben:
`APP` = `/home/g2thek/entrosana-app`, `WP` = `/home/g2thek/entrosana-wp/theme/entrosana`.

---

## 1. Wofür dieses Dokument

Es richtet sich an den, der als Nächstes an entrosana.app arbeitet. entrosana.com ist eine Werbeseite und in `/home/g2thek/entrosana-wp/docs/handoff.md` (231 Zeilen, 10235 Byte) bereits übergeben. entrosana.app ist etwas anderes, nämlich eine Anwendung. Die Gestaltungsmarken sind dieselben, die Bauteile sind es nicht. Eine Werbeseite hat kein Blättern, keinen Ladezustand und keine Rollen, ein Hub hat alles drei.

Nach der Lektüre weiss man, welche Marken bindend sind und mit welchem HEX-Wert, welche Bauteile aus dem Thema von entrosana.com übernommen werden können und welche neu gebaut werden müssen, wie eine Änderung an der Gestaltung wirklich live geht, und was am Bestand nicht angefasst werden darf. Die Farbtafel ist vollständig, Erfindungen sind nicht nötig und nicht erlaubt.

---

## 2. Was läuft, und wo

```
entrosana.app  →  Cloudflare-Tunnel 69e77bd9-70aa-4d0e-b8ea-16eacc25cb3a
                  →  127.0.0.1:4322  →  node serve.mjs
Ordner: /home/g2thek/entrosana-app/
```

Neun Dateien werden ausgeliefert, alle vom 1. August 22:26 bis 22:56:

```
index.html        5946 B    Startseite, drei Einstiegskarten
tools.html        7541 B    Abschnitt 1 von 3
modules.html      7610 B    Abschnitt 2 von 3
contribute.html   7423 B    Abschnitt 3 von 3
serve.mjs         3922 B    Auslieferung, node:http, keine Fremdabhängigkeit
assets/app.css   14655 B    die ganze Gestaltung
assets/fonts.css 49896 B    neun Schriftschnitte als base64, siehe §9
assets/mark.svg   4166 B    das Zeichen, siehe §8
assets/theme.js   1053 B    Umschalter hell/dunkel
```

**Der Server löst nichts aus dem Dateisystem auf.** `ROUTES` ist eine feste Tabelle mit acht Einträgen (`APP/serve.mjs:18-27`). Aus einer Anfrage wird nie ein Pfad gebaut, Pfad-Traversal ist damit strukturell ausgeschlossen. Unbekannte Pfade liefern die Startseite mit Status 404 (`APP/serve.mjs:73-76`). Erlaubt sind nur GET und HEAD, alles andere ergibt 405 mit `Allow: GET, HEAD` (`APP/serve.mjs:63-67`). `/healthz` gibt `ok`.

**Eine Änderung an einer bestehenden Datei ist nach fünf Sekunden live.** Ein Intervall vergleicht den schwachen ETag jeder Route mit der Platte und liest bei Abweichung neu ein (`APP/serve.mjs:46-55`). Ein Neustart ist nur nötig, wenn eine *neue* Datei dazukommt, denn `ROUTES` wird einmal beim Start durchlaufen (`APP/serve.mjs:44`). Im Protokoll ist der Übergang von «serving 7 routes» auf «serving 8 routes» ablesbar (`/home/g2thek/.sygnif/logs/entrosana-app.log`).

**Am Rand ist sie das nicht.** Der Ursprung setzt für alles `public, max-age=300` (`APP/serve.mjs:86`). Cloudflare überschreibt das für CSS auf `max-age=14400` und speichert am Rand zwischen, gemessen `cf-cache-status: MISS` beim ersten und `HIT` mit `age: 14` beim zweiten Abruf von `/assets/app.css`. HTML wird nicht zwischengespeichert, dort steht `cf-cache-status: DYNAMIC`. **Wer app.css ändert, sieht es lokal in fünf Sekunden und am Rand bis zu vier Stunden nicht.** Zugangsdaten zum Leeren liegen in `/home/g2thek/.config/entrosana-cf-purge.env` (`CLOUDFLARE_PURGE_TOKEN`, `CF_ZONE_COM`, `CF_ZONE_APP`, alle gesetzt), es gibt aber kein Skript, das sie benutzt. Der einzige Treffer im Heimverzeichnis ist `/home/g2thek/entrosana-wp/backup.sh:69`, und dort wird die Datei nur gesichert.

Der Dienst ist ein systemd-Nutzerdienst, `Restart=always`, `RestartSec=2`, `PORT=4322`, `HOST=127.0.0.1` (`/home/g2thek/.config/systemd/user/entrosana-app.service:5-12`). Er ist `enabled`, `Linger=yes`, überlebt also einen Neustart des Rechners. Gelauscht wird nur lokal, `LISTEN 0 511 127.0.0.1:4322`.

**Beide Auftritte hängen an einem Tunnel.** `entrosana.com` und `www.entrosana.com` auf `127.0.0.1:8090`, `entrosana.app` und `www.entrosana.app` auf `127.0.0.1:4322`, beide in `/home/g2thek/.cloudflared/config.yml:3-12`. Ein Neustart von `entrosana-tunnel.service` nimmt beide gleichzeitig vom Netz. Die Beschreibung der Unit nennt noch `:4321` (`/home/g2thek/.config/systemd/user/entrosana-tunnel.service:2`), das ist überholt.

**Sieben von neun Live-Dateien sind in keinem Archiv.** Die EXTRAS-Liste sichert von entrosana.app nur `index.html`, `serve.mjs` und die Unit (`/home/g2thek/entrosana-wp/backup.sh:63-65`). Nicht gesichert sind `tools.html`, `modules.html`, `contribute.html`, `assets/app.css`, `assets/fonts.css`, `assets/mark.svg`, `assets/theme.js`, also die gesamte Gestaltung und drei der vier Seiten. Der Kommentar nennt index.html ausserdem noch eine «Uebergangsseite» (`backup.sh:63`), was seit dem 1. August nicht mehr stimmt. Fehlende Einträge brechen den Lauf nicht ab, sie erzeugen nur eine Warnung (`backup.sh:72-74`). Der Zeitplan ist `OnCalendar=*-*-* 03:30:00`, letzter Lauf 2026-08-01 03:35:09 CEST.

---

## 3. Das gemeinsame Fundament

Die Farbtafel ist auf beiden Auftritten Zeichen für Zeichen gleich, im Browser nachgemessen. entrosana.app braucht keine neue Farbe.

### Marken, dunkel (Grundzustand, ohne `data-theme`)

| Marke | Wert | Beleg .app | Beleg .com |
|---|---|---|---|
| `--paper` | `#1B1E24` | `APP/assets/app.css:14` | `WP/assets/site.css:179` |
| `--paper-2` | `#22262E` | `app.css:14` | `site.css:56` |
| `--ink` | `#E9EBE7` | `app.css:15` | `site.css:180` |
| `--ink-2` | `#C6CAD1` | `app.css:15` | `site.css:56` |
| `--muted` | `#8F95A1` | `app.css:15` | `site.css:56` |
| `--line` | `#323843` | `app.css:16` | `site.css:57` |
| `--line-2` | `#3A404C` | `app.css:16` | `site.css:57` |
| `--line-ui` | `#5A6273` | **fehlt** | `WP/assets/blocks-bridge.css:176` |
| `--seal` | `#2BD4E8` | `app.css:17` | `site.css:178` |
| `--seal-2` | `#7FE7F3` | `app.css:17` | `site.css:57` |
| `--verify` | `#2FB89E` | `app.css:18` | `site.css:57` |
| `--warn` | `#D2685C` | `app.css:18` | `site.css:57` |
| `--card-bg` | `#232833` | `app.css:19` | `site.css:58` |
| `--field-bg` | `#1F232B` | `app.css:19` | `site.css:58` |
| `--btn-fg` | `#071316` | `app.css:19` | `site.css:58` |
| `--shadow-1` | `0 1px 2px rgba(0,0,0,.35),0 4px 12px rgba(0,0,0,.30)` | `app.css:20` | `site.css:59` |
| `--shadow-2` | `0 4px 8px rgba(0,0,0,.42),0 14px 32px rgba(0,0,0,.45)` | `app.css:21` | `site.css:60` |

### Marken, hell (`:root[data-theme="light"]`)

| Marke | Wert | Beleg .app | Beleg .com |
|---|---|---|---|
| `--paper` | `#f5fffe` | `app.css:42` | `site.css:188` |
| `--paper-2` | `#ECEEEA` | `app.css:42` | `site.css:96` |
| `--ink` | `#16181d` | `app.css:43` | `site.css:189` |
| `--ink-2` | `#3A3F49` | `app.css:43` | `site.css:96` |
| `--muted` | `#6C7078` | `app.css:43` | `site.css:96` |
| `--line` | `#DCDDD6` | `app.css:44` | `site.css:97` |
| `--line-2` | `#2C313B` | `app.css:44` | `site.css:97` |
| `--line-ui` | `#8A8D84` | **fehlt** | `blocks-bridge.css:177` |
| `--seal` | `#077183` | `app.css:45` | `site.css:187` |
| `--seal-2` | `#09606F` | `app.css:45` | `site.css:97` |
| `--verify` | `#0E7C6B` | `app.css:46` | `site.css:97` |
| `--warn` | `#B23A2E` | `app.css:46` | `site.css:97` |
| `--card-bg` / `--field-bg` / `--btn-fg` | `#FFFFFF` | `app.css:47` | `site.css:98` |

Zwei Eigenheiten der hellen Fassung, die man kennen muss. `--seal-2` kehrt die Richtung um, dunkel `#7FE7F3` heller als `--seal`, hell `#09606F` dunkler. Ueberfahren hellt in der einen Erscheinung auf und verdunkelt in der anderen. Und `--muted` wird auf entrosana.com in der Fusszeile auf `#5A5E66` nachgezogen, weil der Kontrast dort 3.94:1 betrug (`blocks-bridge.css:183`). Beide Regeln fehlen in app.css.

### Schriftleiter

Sechs clamp-Stufen, auf beiden Auftritten wörtlich gleich (`app.css:27-32`, `site.css:1`). Gemessene Werte bei 390 px, 760 px und am Deckel:

| Stufe | Deklaration | 390 px | 760 px | Deckel |
|---|---|---|---|---|
| `--step--1` | `clamp(.78rem, .74rem + .2vw, .86rem)` | 12.62 px | 13.36 px | 13.76 px |
| `--step-0` | `clamp(.95rem, .9rem + .25vw, 1.05rem)` | 15.375 px | 16.3 px | 16.8 px |
| `--step-1` | `clamp(1.15rem, 1.05rem + .5vw, 1.4rem)` | 18.75 px | 20.6 px | 22.4 px |
| `--step-2` | `clamp(1.5rem, 1.3rem + 1vw, 2.1rem)` | 24.7 px | 28.4 px | 33.6 px |
| `--step-3` | `clamp(2.1rem, 1.7rem + 2vw, 3.4rem)` | 35 px | 42.4 px | 54.4 px |
| `--step-4` | `clamp(2.8rem, 2rem + 4vw, 5.2rem)` | 47.6 px | 62.4 px | 83.2 px |

Wurzelgrösse 100 % = 16 px (`site.css:184`, gemessen `html.fontSize = 16px`).

### Abstandsleiter

| Grösse | .com | .app |
|---|---|---|
| `--wrap` | 1140 px (`site.css:181`) | 1140 px (`app.css:34`) |
| `--gutter` | `clamp(1.25rem, .8rem + 2.5vw, 3.0rem)` (`site.css:182`) | `clamp(1.25rem, .8rem + 2.5vw, 3rem)` (`app.css:35`) |
| `--radius` | 4 px (`site.css:183`) | 4 px (`app.css:36`) |
| Abschnittspolster | `clamp(3.5rem, 2rem + 7vw, 7rem)`, gemessen 112 px (`site.css:1`) | `clamp(2.75rem, 1.5rem + 5vw, 5.5rem)`, gemessen 88 px (`app.css:122`) |
| Enges Abschnittspolster | nicht vorhanden | `clamp(2rem, 1.2rem + 3vw, 3.25rem)`, gemessen 52 px (`app.css:123`) |
| Kartenpolster | `clamp(1.25rem, .8rem + 2vw, 1.9rem)`, gemessen 30.4 px (`site.css:1`) | `1.25rem 1.3rem`, gemessen 20 px / 20.8 px (`app.css:171-174`) |

Gemessene Inhaltsbreite ist auf beiden identisch, 1140 px bei 1440 px Fensterbreite und 382.891 px bei 430 px. Querscrollen tritt auf keiner Seite und bei keiner Breite auf.

### Haltepunkte

entrosana.com hat neun Haltepunkte zwischen 759.98 px und 1260 px, verteilt über vier Dateien und nicht aufeinander abgestimmt (`site.css:1`, `site.css:3`, `site.css:10`, `site.css:137`, `page-hero.css:26`, `design-polish.css:96`, `design-polish.css:202`, `blocks-bridge.css:197`, `blocks-bridge.css:334`). entrosana.app hat drei, und die sind sauber (`APP/assets/app.css:296`, `:303`, `:309`):

```
max-width:48rem     Navigation bricht um, .nav__links auf eigene Zeile
max-width:34rem     .project__row von drei auf zwei Spalten,
                    .project__rec rutscht unter die Aufgabe
prefers-reduced-motion:reduce   * { transition:none !important }
```

**Die drei Haltepunkte von entrosana.app sind zu übernehmen, nicht die neun von entrosana.com.** Sie sind in `rem` gesetzt, folgen also der Schriftgrösse des Nutzers, und sie liegen an inhaltlichen Bruchstellen statt an Gerätegrössen.

### Abweichungen im Einzelnen

| Gegenstand | .com | .app | gleich? |
|---|---|---|---|
| Farbtafel dunkel, 17 Marken | siehe Tabelle oben | siehe Tabelle oben | **ja** |
| Farbtafel hell, 13 Marken | siehe Tabelle oben | siehe Tabelle oben | **ja** |
| `--line-ui` | `#5A6273` / `#8A8D84` (`blocks-bridge.css:176-177`) | nicht vorhanden | **nein** |
| `--muted` in der Fusszeile hell | `#5A5E66` (`blocks-bridge.css:183`) | nicht nachgezogen | **nein** |
| Schriftstufen `--step--1` bis `--step-4` | `site.css:1` | `app.css:27-32` | **ja** |
| `--wrap`, `--radius` | 1140 px, 4 px | 1140 px, 4 px | **ja** |
| `--font-mono` | `"Geist Mono", ui-monospace, …` | `"Geist Mono", ui-monospace, …` | **ja** |
| `--font-sans` | `Calibri,Carlito,"Segoe UI",…` (`site.css:35`) | `"Hanken Grotesk", system-ui,…` (`app.css:24`) | **nein** |
| `--font-serif` | `Calibri,Carlito,…` (`site.css:36`) | `"Newsreader", Georgia,…` (`app.css:25`) | **nein** |
| Tatsächlich gerenderte Schrift (Linux) | Carlito | Noto Sans | **nein** |
| Webschriften geladen | 0 von 9, alle `unloaded` | 0 von 9, alle `unloaded` | ja, beide wirkungslos |
| Untergrund body, sechs Ebenen | `site.css:154-165` | `app.css:60-71`, byteweise dieselbe Ebenenreihe | **ja** |
| Untergrund hell | `#CDEEF4`, blend `overlay` (`design-polish.css:225-235`), nur Startseite | `#f5fffe`, blend `soft-light` | **nein** |
| Kopfleiste | sticky, `border-radius:999px`, `backdrop-filter:blur(12px)`, Grund zu 82 % (`site.css:136-137`) | static, radius 0, durchsichtig, `border-bottom:1px solid var(--line)` (`app.css:93`) | **nein** |
| Kopfleiste bei 430 px | 62 px, Burger-Menü | 116.97 px, bricht auf zwei Zeilen | **nein** |
| Schaltfläche, Radius | 999 px (`site.css:144`) | 4 px (`app.css:196-201`) | **nein** |
| Schaltfläche, Gewicht | 600 gefüllt, 500 geisterhaft | 400 | **nein** |
| Karte, Grund und Rahmen | `#232833`, 1 px `#323843`, Radius 4 px | gleich (`app.css:171-174`) | **ja** |
| Karte, Schatten | `--shadow-1` | `none` | **nein** |
| Wortmarke, Farbigkeit | einfarbig `--seal`, Zeichen als `<svg>` mit `currentColor` (`WP/parts/header.html:3`) | dreifarbig, Zeichen als `<img>` fest `#2742E0` | **nein**, siehe §8 |
| Wortmarke, Schrift und Grad | `--font-mono`, 15 px, Gewicht 400 (`site.css:141`) | `--font-sans`, `--step-1` = 22.4 px, Gewicht 500 (`app.css:100`) | **nein** |
| Logogrösse | `2.4em`, gemessen 40.31 px | fest 26 px (`app.css:99`) | **nein** |
| `.eyebrow::before`, die Haarlinie | vorhanden, 22.0156 × 1 px in `--seal` (`site.css:1`, `site.css:142`) | nicht vorhanden (`app.css:136-140`) | **nein**, siehe §4 |
| Trennstrich am Abschnittskopf | 1 px Akzentverlauf, 1140 px (`blocks-bridge.css:321-330`) | harte graue Kante 1 px `--line` (`app.css:122`) | **nein** |
| `.sealrule` | Flexzeile, Haarlinien links und rechts (`site.css:1`) | Balken 2 × 56 px in `--seal` (`app.css:163`) | **nein**, gleicher Name, anderes Mittel |
| Fokusring | `2px solid var(--seal)`, offset 2–3 px | `2px solid var(--seal)`, offset 3 px (`app.css:76`) | **ja** |
| Kleinschreibung des Namens | eingehalten | eingehalten, 0 Treffer für «Entrosana» in sieben Dateien | **ja** |

---

## 4. Der filigrane Trennstrich

Er ist das Trennzeichen dieser Gestaltung, und er ist in entrosana.app bisher nicht angekommen. Auf entrosana.com hat er vier Auspraegungen mit vier Deckungen.

### Die Hauptrezeptur, waagerecht zwischen Abschnitten (26 %)

Wörtlich aus `WP/assets/blocks-bridge.css:319-330`:

```css
.section + .section,
.foot { position: relative; }

.section:not(.section--ink) + .section:not(.section--ink)::before,
.section--ink + .section--ink::before,
.foot::before {
  content: ""; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: min(var(--wrap, 1140px), calc(100% - 3rem)); height: 1px;
  pointer-events: none;
  background: linear-gradient(90deg, transparent,
    color-mix(in srgb, var(--seal) 26%, transparent) 18%,
    color-mix(in srgb, var(--seal) 26%, transparent) 82%, transparent);
}
```

Gemessen im Dunkeln: Breite 1140 px, Höhe 1 px, `left 720px`, `transform matrix(1,0,0,1,-570,0)`, Verlauf `color(srgb 0.168627 0.831373 0.909804 / 0.26)`. Hell folgt der Verlauf der Marke, `color(srgb 0.027451 0.443137 0.513726 / 0.26)`, also `#077183` bei 26 %. Die Geometrie ist in beiden Erscheinungen identisch.

### Die Setzregel

Der Regelkopf in `blocks-bridge.css:303-316` nennt drei erlaubte Stellen und begründet den Verzicht auf den Schimmer. Sinngemäss und mit den Belegzeilen:

1. Zwischen zwei Abschnitten **gleichen** Untergrunds. Folgt ein `--ink`-Abschnitt auf einen hellen, leistet der Tonwechsel die Trennung bereits, ein Strich wäre dort Zierrat.
2. Am Uebergang vom Inhalt zur Fusszeile, der grössten Zäsur der Seite, die vorher `border-top: 0` hatte.
3. In der Fuge der Fusszeile, zwischen Markenblock und Verweisspalten.

Bewusst ohne `drop-shadow`, weil über 1140 px Länge aus einem Akzent eine Leuchtspur würde. Der Schimmer bleibt Marke und Navigation vorbehalten, wo er kurze Strecken betont.

Wie sparsam das wirkt, ist messbar. Auf der Startseite von entrosana.com trägt genau ein Abschnitt einen Strich, auf `/modules/` kein einziger, weil dort `.section` und `.section--ink` strikt abwechseln.

### Senkrecht, Fusszeilenfuge (34 %)

`blocks-bridge.css:334-345`, nur ab `min-width: 860px`, also nur solange die Fusszeile wirklich zweispaltig ist:

```css
.foot__cols::before {
  content: ""; position: absolute; top: 50%; left: -20px;
  transform: translate(-50%, -50%);
  width: 1px; height: min(70%, 8rem);
  pointer-events: none;
  background: linear-gradient(180deg, transparent,
    color-mix(in srgb, var(--seal) 34%, transparent) 24%,
    color-mix(in srgb, var(--seal) 34%, transparent) 76%, transparent);
}
```

Gemessen: Breite 1 px, Höhe 124.328 px, `left -20px`, `top 88.8125px`.

### Senkrecht, Hero-Fuge (42 %)

`design-polish.css:194-200`. Gleiche Bauart, `height: clamp(5.5rem, 26vh, 9.5rem)`, `left: calc(-0.5 * clamp(2rem, 4vw, 4.5rem))`, Deckung 42 % bei 26 % und 74 %. Gemessen 1 × 152 px, `left -28.8px`. Unter `max-width: 860px` wird er abgeschaltet, weil gestapelt keine Fuge mehr existiert (`design-polish.css:202`).

### Kurz und mit Schimmer (65 %), Marke und Navigation

`blocks-bridge.css:229-241`, wörtlich:

```css
.nav__link.is-active::after,
body.home .brand__word::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: -6px; height: 2px;
  pointer-events: none;
  background: linear-gradient(90deg, transparent,
    color-mix(in srgb, var(--seal) 65%, transparent) 22%,
    color-mix(in srgb, var(--seal) 65%, transparent) 78%, transparent);
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--seal) 55%, transparent));
}
```

`drop-shadow` statt `box-shadow`, weil es dem Alphakanal folgt und mit dem Strich ausläuft, statt ihn wie ein Kasten zu umranden. Unter `max-width: 759.98px` tritt an die Stelle des Strichs ein Punkt, 6 × 6 px, `border-radius: 50%`, `background: var(--seal)`, `left: .25rem` (`blocks-bridge.css:244-252`), weil eine Linie unter einer vollbreiten Zeile als Trenner gelesen würde.

Dieselbe Rezeptur trägt die Fusszeilenmarke beim Ueberfahren, `bottom: -.28em`, `opacity 0 → 1` mit `transition: opacity .18s ease` (`blocks-bridge.css:288-298`).

### Die Haarlinie vor der Rubrikzeile

Kein Verlauf, aber dasselbe Mittel im Kleinen. `.eyebrow:before { content:""; width:1.6em; height:1px; background:currentColor; opacity:.5 }` (`site.css:1`), später auf `background: var(--seal)` gestellt (`site.css:142`). Gemessen 22.0156 × 1 px, `rgb(43,212,232)`, `opacity 0.5`. Sie steht vor jeder Rubrikzeile, auf der Hub-Seite achtmal.

### Stand auf entrosana.app und was zu tun ist

`.eyebrow` ist dort `display:block` ohne Pseudoelement (`app.css:136-140`), gemessen `content: "none"`, `width: auto`, `background: rgba(0,0,0,0)`. Die Rubrikzeile erscheint zwölfmal, jedes Mal ohne Strich. An die Stelle des auslaufenden Abschnittsstrichs ist eine harte graue Kante getreten, `border-bottom: 1px solid var(--line)` an jedem `.section` (`app.css:122`). Der einzige sichtbare Strich ist `hr.sealrule`, ein massiver Balken 2 × 56 px in `--seal` (`app.css:163`, eingesetzt in `APP/index.html:106`), und der hat auf entrosana.com kein Gegenstück, dort meint `.sealrule` etwas anderes.

**Der Strich muss in der Anwendung überleben, und die Anwendung braucht ihn öfter als die Werbeseite.** Vier Einsatzorte ergeben sich unmittelbar aus dem Bestand:

- zwischen Tabellenkopf und Zeilen, an der Stelle, an der heute `border-bottom: 1px solid var(--line)` an `.project__row` steht (`app.css:254-258`);
- zwischen Abschnitten eines Belegs, wo `.receipt__status` heute `border-top: 1px dashed var(--line)` trägt (`site.css:3`);
- unter dem aktiven Verweis der Bereichsnavigation, in der 65-Prozent-Fassung mit Schimmer, wie `.nav__link.is-active::after`;
- am Uebergang vom Arbeitsbereich zur Fusszeile, in der 26-Prozent-Fassung ohne Schimmer.

Die harte `--line`-Kante an `.section` ist dabei durch die Verlaufsfassung zu ersetzen, nicht zu ergänzen. Zwei Trennmittel nebeneinander lesen sich als Fehler. Nebenbefund, der dabei mit erledigt wird: `.section--ink` trägt auf entrosana.app gemessen `border-bottom: 1px solid rgba(0,0,0,0)`, die Kante setzt dort also ohnehin aus.

---

## 5. Bauteile, die aus entrosana.com übernommen werden

Vier davon sind in `site.css` fertig gestaltet und stehen auf **keiner** der acht Live-Seiten von entrosana.com. Sie sind gezeichnet, aber nie erprobt. Genau sie sind für einen Hub die wertvollsten.

| Bauteil | Zweck im Hub | Herkunft | Live erprobt? |
|---|---|---|---|
| `.receipt` samt `__perf __body __row __k __in __hash __meta __status __foot` | der Bereich «The record», Nachweis neben der Arbeit | `WP/assets/site.css:3`, hell `:46`, dunkel `:67` | **nein**, 0 Vorkommen |
| `.toggle` samt `__track __dot __label` | Einstellungen je Modul und je Rolle | `site.css:3` | **nein**, 0 Vorkommen |
| `.notice` | Meldungsfläche für jeden Ausgang einer Handlung | `site.css:25`, hell `:52`, dunkel `:70` | **nein**, 0 Vorkommen |
| `.placeholder` | unbelegter Wert in einer Tabelle | `site.css:29` | **nein**, 0 Vorkommen |
| `.form` samt `label input select textarea` | jedes Eingabefeld, Anmeldung, Suche | `site.css:20-24`, hell `:51`, dunkel `:68-69` | ja, `/request-access` |
| `.eyebrow::before` | die Haarlinie, siehe §4 | `site.css:1`, `site.css:142-143` | ja, 37 Vorkommen |
| `.chip` / `.chips` | Rollenmarke, Filtermarke | `site.css:172-173` | ja, 17 Vorkommen |
| `.facts` / `.fact` / `.fact__k` / `.fact__v` | Schlüssel-Wert-Paare in Belegen und Detailansichten | `site.css:1` | ja, 4 Vorkommen |
| `.card` | Grundfläche für alles Umrandete | `site.css:1` | ja, 39 Vorkommen |
| `.nav__link.is-active::after` | Merkzeichen der laufenden Seite und der laufenden Bereichsstufe | `blocks-bridge.css:229-241` | ja, 4 Vorkommen |
| `.vh` | Sprungmarke und Ueberschriften nur für Vorleseprogramme | `site.css:19` | ja, 6 Vorkommen |
| `--line-ui` | Rand jedes Bedienelements, WCAG 1.4.11 | `blocks-bridge.css:175-179` | ja |
| Fokusring | Tastaturbedienung durchgehend | `site.css:1`, `design-polish.css:37` | ja |

Zwei Anmerkungen zur Uebernahme. `.receipt` trägt `max-width: 460px` (`site.css:3`), das ist zu lösen, damit der Beleg neben der Arbeit stehen kann und nicht darunter. `.toggle` färbt den eingeschalteten Zustand mit `--warn` (`site.css:3`), obwohl `--warn` im übrigen Bestand «misslungen» heisst, siehe `.receipt__status[data-state=warn]` und `.notice`. Das ist vor der Uebernahme zu entscheiden, siehe §10.

Nicht zu übernehmen sind die dreizehn Bauteile, die auf entrosana.com nur mit `design-polish.css` bestehen (`.tracks`, `.tracks-wrap`, `.tracks-lbl`, `.tracks-one`, `.hero__hgroup`, `.is-second`, `.hero__msg`, `.hub-nest`, `.hub-nest__inner`, `.hub-nest__grid`, `.foot__brandline`, `.foot__mark`, `.devgrid`). Sie sind an die Startseite gebunden und brechen anderswo, siehe §9.

---

## 6. Bauteile, die eine Anwendung zusätzlich braucht

Das Kernstück. Keine neue Farbe. Wo im Bestand kein Vorbild existiert, steht das ausdrücklich dabei.

### 6.1 Datentabelle

**Wozu.** Belege, Modullisten, Projektzeilen. Auf entrosana.com steht über alle sechs geprüften Seiten kein einziges `<table>`, und keines der vier Stilblätter kennt eine Regel für `table`, `thead`, `tbody`, `th` oder `td`. Es gibt kein Vorbild.

**Marken.** Zeilentrenner `1px solid var(--line)`, Kopfzeile in `--font-mono`, `--step--1`, `letter-spacing:.08em`, versal, Farbe `--muted`, genau wie `.receipt__k` (`site.css:3`). Zahlenspalten rechtsbündig in `--font-mono`, wie `.project__rec` (`app.css:267-270`).

**Ableitung.** `.project__row` ist bereits die Tabelle im Kleinen, `display:grid`, `grid-template-columns:1.4rem 1fr minmax(9rem,auto)`, `padding:.85rem 0`, `border-bottom:1px solid var(--line)`, `align-items:baseline` (`app.css:254-258`). Die Umbruchregel steht ebenfalls schon, unter `max-width:34rem` fällt die dritte Spalte unter die zweite und wird linksbündig (`app.css:303-305`).

**Unterschied zum Werbeseiten-Pendant.** `.facts` auf entrosana.com ist zweispaltig `14rem 1fr` mit `gap:2rem` und `padding-block:1.4rem` (`site.css:1`), also gemessen 22.4 px Polster je Zeile. Für eine Tabelle mit vierzig Zeilen ist das zu viel, siehe §7.

### 6.2 Blätterung

**Wozu.** Jede Liste, die länger wird als ein Bildschirm. Nicht vorhanden. `pagination`, `page-numbers` und `nav-links` kommen in `site.css`, `design-polish.css` und `blocks-bridge.css` je nullmal vor. `WP/templates/search.html` setzt `perPage: 10`, enthält aber keinen `wp:query-pagination`-Block.

**Marken.** Durchgehend `--font-mono` wie jede andere Maschinenschrift. Laufende Seite in `--seal` mit derselben Unterkante wie `.nav__link.is-active` (`blocks-bridge.css:230-241`), übrige Seiten in `--ink-2`, Gesamtzahl links davon in `--muted` auf `--step--1`.

**Unterschied.** Es gibt kein Pendant. Die Blätterung ist die Fortsetzung der Navigationsregel, nicht ein eigenes Muster. Wer sie als eigenes Muster baut, hat zwei Sprachen für dieselbe Sache.

### 6.3 Ladezustand

**Wozu.** Die grösste Lücke. `spinner`, `skeleton` und `loading` kommen in den drei Stilblättern von entrosana.com je nullmal vor.

**Marken.** Platzhalterzeilen als Flächen in `--line` auf Zeilenhöhe mit `--radius` (4 px). Für laufende Vorgänge die Haarlinie aus §4 als schmaler wandernder Balken in `--seal` über der Fläche.

**Unterschied.** Kein Kreisel-Sinnbild. Ein Kreisel ist ein Fremdkörper in einer Gestaltung, die ihre Zeichen aus Linien und Schrift bezieht. Der Rückfall für `prefers-reduced-motion` ist schon gebaut, `* { transition:none !important }` (`app.css:309-312`), dort wird aus dem wandernden Balken eine ruhende Linie.

### 6.4 Leerzustand

**Wozu.** Leere Tabelle, leere Modulliste, Projekt ohne Aufzeichnung. Vorhanden ist genau einer, und der ist Prosa statt Bauteil, nämlich der `<p class="lede">` in `WP/templates/search.html`. Auf entrosana.app übernimmt die Zeichenkette «no record yet» diese Rolle, fünfmal untereinander (`APP/tools.html:102,108,114,120,126`).

**Marken.** Aus `.plan` ableiten, `border:1px dashed var(--line)`, `background:var(--paper-2)`, `border-radius:var(--radius)`, `padding:1.05rem 1.2rem` (`app.css:278-282`). Text in `--ink-2` auf `--step--1`, darunter genau eine Handlung als Schaltfläche dritter Stufe.

**Unterschied.** Der gestrichelte Rahmen bedeutet im Bestand bereits «geplant, noch nicht da». Die Bedeutung ist gesetzt und muss nicht erfunden werden.

### 6.5 Fehlerzustand und Feldfehler

**Wozu.** Nur die 404-Seite existiert, aufgebaut aus `.display`, `.lede` und zwei Schaltflächen (`WP/templates/404.html`). Es gibt keinen Feldfehler, keine Formularzusammenfassung und keinen Ausfallzustand für einen einzelnen Bereich.

**Marken.** `--warn`, dunkel `#D2685C`, hell `#B23A2E`. Feldrand auf `--warn` umstellen, Fehlertext darunter in `--warn` auf `--step--1`, verknüpft über `aria-describedby`. Unbelegte Werte in Tabellen bekommen `.placeholder`, also `background: color-mix(in srgb, var(--warn) 12%, transparent)` mit `border-bottom: 1px dashed var(--warn)` (`site.css:29`).

**Unterschied.** Ein Bereichsausfall bekommt keine eigene Fehlerseite, sondern dieselbe `.notice`-Fläche in Kartenbreite. Ein Ausfall darf den Rest der Arbeitsfläche stehen lassen. Eine Werbeseite kann sich eine ganze Fehlerseite leisten, eine Anwendung nicht.

### 6.6 Rückmeldung nach einer Handlung

**Wozu.** Der einzige Handlungsfall auf entrosana.com ist das Kontaktformular, und es schreibt bei Erfolg, bei ausgelöster Honigfalle und nach jedem Netzfehler dieselbe Zeichenkette «Message sent. We reply personally.» in einen `<p class="mono muted">` (`WP/_pages/request-access.html:40`). Es gibt also weder eine Unterscheidung nach Ausgang noch ein Bauteil dafür.

**Marken.** `.notice` als einzige Grundform, gestaffelt ausschliesslich über die linke Kante: `--verify` für gelungen, `--warn` für misslungen, `--seal` für Hinweise, `--muted` für neutral. Text bleibt immer `--ink-2`, Grund immer `--paper-2` (`site.css:25`).

**Unterschied.** Flüchtige Einblendungen benutzen dieselbe Fläche und dieselbe Kantenregel, damit nur ein Bauteil gepflegt werden muss.

### 6.7 Deaktivierter Zustand

**Wozu.** Jede Handlung, die eine Rolle nicht ausführen darf. `:disabled` und `[disabled]` kommen in `site.css`, `design-polish.css` und `blocks-bridge.css` je nullmal vor.

**Marken.** Text in `--muted`, Rand in `--line`, keine Füllung.

**Unterschied.** Nicht über Deckkraft. Deckkraft macht die Kontrastrechnung unbrauchbar, weil der wirksame Wert dann vom Untergrund abhängt. Neben dem deaktivierten Element steht ein Hilfetext in `--muted`, der den Grund nennt.

### 6.8 Schaltflächen, dritte und vierte Stufe

**Wozu.** Zwei Stufen sind vorhanden, gefüllt und geisterhaft (`site.css:143-147`, `app.css:196-204`). Eine Anwendung braucht eine dritte für Nebenhandlungen und eine für zerstörerische.

**Marken.** Dritte Stufe als reiner Text in `--seal` ohne Rahmen und ohne Füllung. Zerstörerisch als geisterhafte Fassung mit `--warn` als Rand und Text.

**Unterschied.** Vorher ist die Form zu vereinheitlichen. Gemessen liegt entrosana.com bei `border-radius: 999px`, Polster `.72em 1.5em`, Gewicht 600, Höhe 37.8 px gefüllt und 43.8 px geisterhaft; entrosana.app bei `border-radius: var(--radius)` = 4 px, Polster `.6rem 1.15rem`, Gewicht 400, Höhe 43.2 px. Für eine Anwendung mit vielen Schaltflächen in Reihen spricht die eckige Fassung von entrosana.app, weil 999 px neben einem 4-px-Eingabefeld auseinanderfällt. Das ist eine Entscheidung, siehe §10.

### 6.9 Zustandsmarken über die vier vorhandenen Farben hinaus

**Wozu.** Es gibt genau vier semantische Farben, `--seal` als Akzent, `--verify` für gelungen, `--warn` für misslungen, `--muted` für unbestimmt. Eine fünfte für «läuft gerade» oder «wartet auf Freigabe» existiert nicht.

**Marken.** Ohne neue Farbe. Wartend bleibt `--muted`, laufend wird `--seal`, unterschieden über die Rahmenform statt über den Farbton, gestrichelt für wartend und durchgezogen für laufend.

**Unterschied.** Das Muster liegt vor. `.plan` arbeitet bereits mit gestricheltem Rahmen für «geplant» (`app.css:278-281`), und `.tool__state.done` benutzt bereits `--verify` mit `color-mix(in srgb, var(--verify) 45%, var(--line))` als Rand (`app.css:193`). Beide Regeln sind fortzuschreiben, nicht zu ersetzen.

### 6.10 Rollenmarke

**Wozu.** Der Hub unterscheidet Rollen, die Sprache dafür steht schon. `.tool__who` trägt Zeilen wie «for administrative responsibilities and process efficiency» in `--seal-2` und `--font-mono` (`APP/tools.html:59`, `app.css:177-181`), und die Hub-Seite von entrosana.com kündigt Tools als «the back office section, for the roles that need it» an.

**Marken.** `.chip` übernehmen, `border-radius: 999px`, `padding: .4em 1em`, `--ink-2` auf getöntem `--card-bg` (`site.css:172-173`). Die eigene Rolle zusätzlich mit der Haarlinie aus §4 links davor.

**Unterschied.** Auf der Werbeseite ist `.chip` ein Merkmal, in der Anwendung ist es ein Zustand. Gleiche Form, andere Bedeutung, deshalb die Haarlinie als Unterscheidung statt einer Farbe.

### 6.11 Anmeldung

**Wozu.** Nichts vorhanden. Im gesamten Thema steht kein `type="password"`, kein `wp-login` und kein `is_user_logged_in`. Der einzige Zugangsweg ist `/request-access`. entrosana.app sagt selbst, dass Konten noch nicht gebaut sind (`APP/index.html:48`, `:97-99`).

**Marken.** Vollständig aus `.form` bauen, eine Spalte, die gesetzten 560 px als Höchstbreite (`site.css:20`), das Zeichen darüber, Rückmeldung über `.notice`.

**Unterschied.** Es entsteht kein neues Bauteil, nur eine neue Anordnung vorhandener. **Vorher ist §8 zu lesen**, denn `form-action 'none'` in der Inhaltssicherheitsregel verbietet heute jedes Abschicken.

### 6.12 Suchen und Filtern

**Wozu.** Formal vorhanden, gestalterisch nicht. `WP/templates/search.html` setzt den Block `wp:search` ein, aber `.wp-block-search` kommt in `blocks-bridge.css` nullmal vor, das Feld erbt also die Vorgabe des Kerns und nicht die Marke. Ein Filter existiert nirgends.

**Marken.** Suchfeld auf die `.form`-Werte ziehen, `--field-bg` als Grund, `--radius`, `--line-ui` als Rand. Filter als `.chip` mit Ein-Aus-Zustand, gewählt bekommt `--seal` als Rand und Text, ungewählt bleibt `--line` und `--ink-2`.

**Unterschied.** Die aktiven Filter stehen darunter als abwerfbare Marken derselben Form, damit sichtbar bleibt, warum eine Tabelle wenige Zeilen zeigt. Auf einer Werbeseite gibt es diese Frage nicht.

### 6.13 Zeitangaben und Verlauf

**Wozu.** Nichts vorhanden. Auf `entrosana.com/`, `/hub/` und `/roadmap/` steht kein einziges `<time>`, und das Thema kennt das Element in keiner Vorlage. Die Absicht ist auf entrosana.app angelegt, `.project__rec` ist die rechte Spalte jeder Schrittzeile und für den Zeitpunkt vorgesehen, trägt heute aber nur «no record yet» (`app.css:267-270`).

**Marken.** Zeitpunkte in `--font-mono`, `--step--1`, `--muted`. Verlauf als senkrechte 1-px-Haarlinie in `--line` mit Ereignisknoten, bestätigt in `--verify`, offen in `--muted`.

**Unterschied.** Die absolute Angabe gehört ins `title`-Merkmal, die relative in den Text, damit «vor 3 Tagen» und das genaue Datum beide erreichbar sind.

### 6.14 Pfad und Bereichsnavigation

**Wozu.** entrosana.com markiert die laufende Seite serverseitig über einen `render_block`-Filter (`WP/functions.php:88-113`), entrosana.app schreibt `aria-current` von Hand in jede Datei (`APP/tools.html:28`). Beides trägt genau eine Ebene. Sechs Bereiche mit Unterseiten brauchen zwei.

**Marken.** Pfad in `--font-mono`, letzte Stufe in `--ink`, Vorstufen in `--muted`, als Trenner die Haarlinie aus `.eyebrow::before`. Bereichsnavigation als senkrechte Liste mit derselben `--seal`-Kante links statt unten.

**Unterschied.** Auf der Werbeseite ist der aktive Verweis ein Schmuckzeichen, in der Anwendung ist er Ortsangabe. Deshalb die zweite Ebene und deshalb der Pfad.

### 6.15 `--line-ui`, Rand jedes Bedienelements

**Wozu.** Kein neues Bauteil, sondern eine fehlende Marke, und der einzige Punkt in diesem Abschnitt, der ein Mangel ist. entrosana.com hat für Bedienränder ausdrücklich ein eigenes Merkmal eingeführt, mit dem Vermerk «WCAG 1.4.11: interactive boundaries need 3:1, the decorative hairline --line does not reach it» (`blocks-bridge.css:174-179`). `app.css` kennt `--line-ui` nicht, dort tragen `.btn--ghost` (`app.css:203`), `.mode` (`app.css:113`) und `.project__box` (`app.css:262`) alle `--line`.

**Werte.** Gerechnet erreicht `#323843` auf `--paper` 1.42:1 und auf `--card-bg` 1.25:1, `--line-ui` erreicht 2.73:1 dunkel und 3.31:1 hell.

**Warum jetzt.** Solange entrosana.app vier Seiten hat, ist das ein Randfall. Sobald Hunderte Felder, Ankreuzfelder und Tabellenränder dazukommen, ist es ein Flächenproblem. Der dunkle Wert erreicht sein eigenes Ziel allerdings nicht, siehe §10.

---

## 7. Dichte

Eine Werbeseite atmet, eine Arbeitsfläche nicht. Die gemessenen Werte und die Zielwerte:

| Grösse | .com gemessen | .app gemessen | Ziel für den Hub |
|---|---|---|---|
| Abschnittspolster, oben und unten | 112 px (`site.css:1`) | 88 px (`app.css:122`) | **32 px** für Arbeitsbereiche, 88 px nur für Einstiegs- und Erklärseiten |
| Enges Abschnittspolster | nicht vorhanden | 52 px (`app.css:123`) | bleibt 52 px, gilt für Seitenköpfe |
| Kartenpolster | 30.4 px (`site.css:1`) | 20 px / 20.8 px (`app.css:171-174`) | **16 px** in Listen und Tabellen, 20 px bleibt für Einzelkarten |
| Zeilenhöhe body | 26.88 px bei 16.8 px, Faktor 1.6 (`app.css:56`) | gleich | **1.45** im Raster, entspricht 24.36 px |
| Tabellenzeile, Polster | `.fact` 22.4 px oben und unten (`site.css:1`) | `.project__row` `.85rem` = 13.6 px (`app.css:254`) | **40 px Zeilenhöhe** insgesamt |
| Rasterabstand | `.grid` 32 px am Deckel (`site.css:1`) | `.grid` `1rem` = 16 px (`app.css:166`) | 16 px bleibt |
| Kartenreihe | `.tools` 24 px (`site.css:9`) | über `auto-fit minmax(16.5rem,1fr)` (`app.css:168`) | bleibt |

Die 40 px Tabellenzeile sind nicht frei gewählt. Ein Eingabefeld nach `.form` misst gemessen 40.5 px Höhe (`site.css:20-24`). Feld und Zeile liegen damit im selben Raster, und eine Tabelle mit einem Feld darin springt nicht.

**Was nicht enger werden darf.** Der Abstand der Rubrikzeile zum Folgenden, `margin: 0 0 .9rem` (`app.css:139`), und der Abstand zwischen Abschnitten unterschiedlicher Bedeutung. Der Rhythmus aus Rubrik, Ueberschrift und Inhalt trägt die Marke. Wer ihn zusammenzieht, spart 40 px und verliert die Handschrift.

---

## 8. Was nicht verhandelbar ist

**Der Name wird immer klein geschrieben, auch am Satzanfang.** Geprüft über `index.html`, `tools.html`, `modules.html`, `contribute.html`, `assets/app.css`, `assets/theme.js` und `serve.mjs`, null Treffer für «Entrosana». Auch dort klein, wo es einen Titel eröffnet, «entrosana.app — three sections, one project file» (`APP/index.html:6`). Auf entrosana.com gibt es dafür sogar eine eigene Regel, `.tool__state a { text-transform: none; letter-spacing: .06em }` mit dem Vermerk, der Name habe sonst als «ENTROSANA.APP» erschienen (`blocks-bridge.css:138`).

**Die Wortmarke ist Logo, «entro» und «sana» im Akzent, einfarbig.** Auf entrosana.com eingehalten, gemessen `.brand__word` und `.brand__accent` beide `rgb(43,212,232)`, das Zeichen als eingebettetes `<svg>` mit `fill="currentColor"` (`WP/parts/header.html:3`). **Auf entrosana.app verletzt.** Gemessen drei Farben in einem Zeichen, `.brand__word` `rgb(233,235,231)`, `.brand__accent` `rgb(43,212,232)`, das Logo `#2742E0`. Ursache: `assets/mark.svg` trägt zweimal `fill="#2742E0"` fest eingebrannt und wird als `<img>` eingebunden (`APP/index.html:24`), kann also `currentColor` nicht erben. Grossrendering ergab 242273 Bildpunkte `#2742E0` gegen 0 Punkte `#2BD4E8`. `#2742E0` ist der Wert der abgelegten v1-Palette (`site.css:1`) und steht in keiner der beiden Live-Fassungen mehr. **Zu tun: mark.svg wie auf entrosana.com in die Seite einbetten und auf `currentColor` stellen, `.brand__word` auf `--seal` setzen.**

**Der Akzent ist einfarbig und heisst `--seal`.** Dunkel `#2BD4E8`, hell `#077183`. Der Markenzyan `#22D3EE` aus der Markennotiz steckt nur noch im Entwicklergitter (`design-polish.css:75-83`) und ist nicht der wirksame Wert. Das blaue Urspruengssiegel `#2742E0` ist tot.

**Der filigrane Trennstrich ist das wiederkehrende Mittel.** Die Rezepturen stehen in §4 wörtlich. Er darf nicht durch harte Kanten ersetzt werden, und die kurze Fassung mit `drop-shadow` bleibt Marke und Navigation vorbehalten.

**Die Inhaltssicherheitsregel von serve.mjs.** Wörtlich, aus `APP/serve.mjs:33-35` und in der Live-Antwort bestätigt:

```
default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:;
font-src data:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'
```

Was das verbietet: fremde Schriften jeder Art, denn `font-src` ist nur `data:`. Auch eine eigene `.woff2`-Datei unter `/assets/` wäre blockiert, eine Auslagerung aus `fonts.css` ist also nicht möglich, ohne die Regel zu ändern. Ferner fremde Stile und Skripte jeder Herkunft, fremde Bilder, `style`-Attribute im Auszeichnungstext und `<style>`-Blöcke, weil `style-src` ohne `'unsafe-inline'` auch Attribute sperrt, Ereignisattribute wie `onclick`, und wegen `default-src 'none'` zusätzlich `fetch`, XHR, WebSocket, `<iframe>`, Video, Ton, Arbeitsfäden und Zählpixel.

Was erlaubt bleibt: eigene `.css`- und `.js`-Dateien unter `/assets/`, sofern sie in `ROUTES` eingetragen sind, Bilder von der eigenen Herkunft, Rauschen und Schriften als `data:`-URI.

Der Gestaltungsdurchgang vom 1. August hat die Regel **verschärft**, `style-src` ging von `'unsafe-inline'` auf `'self'` (`APP/serve.mjs.bak-20260801-predesign:45-47` gegen `APP/serve.mjs:33-35`). Sie beiläufig beim ersten Formular aufzuweichen wäre ein Rückschritt. entrosana.com sendet gar keine Inhaltssicherheitsregel, das ist kein Vorbild.

**Der Kommentar in serve.mjs ist ebenfalls bindend.** «Neue Seite heisst: neuer Eintrag in ROUTES» (`APP/serve.mjs:5-6`). Eine Datei, die nicht in der Tabelle steht, existiert für den Server nicht.

---

## 9. Fallen

**design-polish.css lädt nur auf der Startseite von entrosana.com.** `functions.php:61` bindet es unter `is_front_page()` ein. Gemessen führt die Startseite `site.css, page-hero.css, design-polish.css, blocks-bridge.css`, alle sieben Unterseiten nur `site.css, page-hero.css, blocks-bridge.css`. Dreizehn Bauteile sind ausschliesslich dort definiert, und zwei davon stehen im Markup einer Unterseite. Auf `/hub` fällt `.tracks` deshalb auf die Browservorgabe zurück, gemessen `display: block` statt `flex`, `list-style-type: disc` statt `none`, `padding-left: 40px` statt `0px`, und der cyanfarbene Punkt verschwindet ersatzlos. **Wer eine Regel aus design-polish.css nach entrosana.app kopiert, kopiert eine Regel, die dort selbst nur auf einer von acht Seiten wirkt.** Der Präzedenzfall der Reparatur steht in `page-hero.css:1-12`, dort wurden die `.ph`-Regeln aus demselben Grund ausgelagert, mit der Gegenmarke «Nicht hierher zurueckholen» in `design-polish.css:126`.

**Die WordPress-Abfrageparameter `?s=` und `?m=` verfälschen jede Messung.** `?s=` ist die Suche, `?m=` das Archiv. Wer damit den Cache umgehen will, misst eine Suchergebnisseite und hält sie für die Startseite. Zum Umgehen taugt jeder harmlose Parameter, etwa `?nc=123`. Das gilt auch für entrosana.app, obwohl dort kein WordPress läuft, denn Messungen laufen üblicherweise gegen beide Auftritte und die Skripte werden geteilt.

**Klassen tragen das Design, nicht die Blöcke.** Das ist der springende Punkt aus der Uebergabe von entrosana.com, und er gilt für entrosana.app unverändert. `.section`, `.card`, `.grid--3`, `.section--ink`, `.project__row`. Wer diese Klassen verliert, verliert das Layout vollständig. Auf entrosana.app kommt hinzu, dass es kein Redaktionssystem gibt, das sie wieder einsetzt.

**`.open` bedeutet in app.css zweierlei, und das ist heute sichtbar.** `app.css:190-192` meint den Zustand «in development» an `.tool__state`, `app.css:227` meint das Aufklappfeld der Projektdatei. Beide Regeln haben dasselbe Gewicht, die spätere gewinnt. Gemessen tragen die Marken «in development» dadurch `border-radius: 4px` statt 999 px, `margin-top: 32px` statt 0 und `background: rgb(35,40,51)` statt durchsichtig, sie sitzen 22 px tiefer als die Marke «planned». Betroffen sind `tools.html:58,63`, `modules.html:58,63,68` und `contribute.html:58,63`. **Umbenennen in `.tool__state--open`, bevor weitere Zustände dazukommen.**

**Die neun eingebetteten Schriftschnitte tragen kein Latein.** `assets/fonts.css` (49896 Byte) enthält neun `@font-face`-Regeln, alle als `data:font/woff2;base64`, alle `font-display: swap`. Die `unicode-range`-Angaben decken nur `U+0460-052F` (kyrillisch erweitert), `U+0102-0103 … U+1EA0-1EF9, U+20AB` (vietnamesisch) und `U+2000-2001 … U+2500-259F` (Rahmenzeichen). `grep -c "U+0000-00FF"` liefert 0. Gemessen melden alle neun `unloaded`, `document.fonts.size` ist 9. Der gesamte englische Text läuft auf Systemschriften, auf diesem Linux-Rechner gemessen Noto Sans für entrosana.app und Carlito für entrosana.com. **Dieselbe Lücke steckt in `site.css` Zeile 1** (55899 Byte), fünf der neun Blöcke sind byteweise identisch. Wer die Gestaltung nach Schriftgrad beurteilt, ohne das zu wissen, beurteilt die Rückfallschrift.

**Die Rückfallschrift ist betriebssystemabhängig.** Unter Windows stünde für entrosana.com echtes Calibri bereit, entrosana.app fiele auf Segoe UI, unter macOS auf San Francisco. Wie weit die beiden Auftritte auf fremden Rechnern auseinanderlaufen, ist von hier aus nicht messbar.

**Der Rand-Cache hält CSS bis zu vier Stunden.** Siehe §2. Wer eine Gestaltungsänderung ausliefert und sie nicht sieht, hält sie für kaputt und ändert weiter. Es gibt kein Skript zum Leeren.

**`~/entrosana-app/` ist kein Git-Arbeitsbaum.** Es gibt keine Verlaufsgeschichte. Die einzigen Sicherungen sind `index.html.bak-20260801-predesign` (18242 Byte, 22:26), `serve.mjs.bak-20260801-predesign` (2307 Byte, 22:26) und ein älteres `index.html.bak` (8702 Byte, 02:53). Zusammen mit der Lücke im Archiv aus §2 heisst das: ein Plattenverlust nimmt die gesamte Gestaltung.

---

## 10. Offen — Entscheidungen des Eigentümers

**Welche Schrift führt die Marke.** entrosana.com steht auf `Calibri,Carlito,"Segoe UI",system-ui,-apple-system,sans-serif` für Sans **und** Serif (`site.css:35-36`, unter der Ueberschrift «v2 design directives»), entrosana.app auf `"Hanken Grotesk"` und `"Newsreader"` (`app.css:24-25`). Der Kopfkommentar von app.css behauptet, die Marken seien unverändert aus dem Live-Stylesheet von entrosana.com übernommen. Für die Farben stimmt das, für die Schrift nicht, übernommen wurde der überschriebene Grundblock aus `site.css` Zeile 1. Praktisch fällt es zurzeit nicht auf, weil beide mangels lateinischem Zeichensatz auf Systemschriften zurückfallen. Empfohlen wird, die Frage vor dem nächsten Gestaltungsdurchgang zu klären, weil sie die Zeilenlängen aller Tabellen bestimmt. **Steht noch aus.**

**Ob die neun Schriftschnitte repariert oder entfernt werden.** Die Blöcke sehen nach einem abgebrochenen Google-Fonts-Auszug aus, bei dem genau die latin- und latin-ext-Teilmengen fehlen. Ob die Datei je vollständig war, ist ohne Verlaufsgeschichte nicht feststellbar. Zwei Wege: die fehlenden Teilmengen nachziehen, dann trägt `fonts.css` deutlich mehr als 49896 Byte, oder auf Systemschriften umstellen und die Datei streichen, dann fällt die Zeile aus allen vier Seiten und ein Eintrag aus `ROUTES`. Empfohlen wird das Nachziehen, weil sonst die Marke auf jedem Betriebssystem anders aussieht. **Steht noch aus.**

**Ob die Schaltflächen rund oder eckig sind.** entrosana.com 999 px, entrosana.app 4 px. Für eine Anwendung mit Schaltflächen neben Eingabefeldern spricht 4 px, für die Wiedererkennung 999 px. Empfohlen wird 4 px für entrosana.app, weil `--radius` dort auch Karten, Felder und Ankreuzkästchen trägt. **Steht noch aus.**

**Welcher helle Untergrund gilt.** Gemessen zeigt die Startseite von entrosana.com hell `rgb(205,238,244)` = `#CDEEF4` mit blend `overlay`, jede Unterseite `rgb(245,255,254)` = `#f5fffe` mit blend `soft-light`, weil `design-polish.css` nur auf der Startseite lädt. entrosana.app hat `#f5fffe` übernommen. Ob das die Absicht war oder ob der Hub den kräftigeren Ton führen soll, ist nicht ableitbar. **Steht noch aus.**

**Welche Farbe der eingeschaltete Umschalter trägt.** `.toggle` färbt ihn mit `--warn` (`site.css:3`), obwohl `--warn` im übrigen Bestand ausschliesslich «misslungen» bedeutet, siehe `.receipt__status[data-state=warn]` (`site.css:3`) und `.notice` (`site.css:25`). Empfohlen wird `--verify` für gewöhnliche Schalter und `--warn` nur dort, wo das Einschalten wirklich riskant ist, etwa bei einer Freigabe nach aussen. **Steht noch aus.**

**Welcher dunkle Wert für `--line-ui` gilt.** Der Vermerk in `blocks-bridge.css:175` nennt 3:1 nach WCAG 1.4.11, gerechnet erreicht `#5A6273` auf `--paper` aber nur 2.73:1 und auf `--card-bg` nur 2.41:1. Hell passt es mit 3.31:1. Wer den Wert unverändert nach entrosana.app übernimmt, vervielfacht einen bekannten Mangel. Empfohlen wird, den dunklen Wert vorher anzuheben. **Steht noch aus.**

**Ob und wie serve.mjs für Anwendungsverhalten geöffnet wird.** Heute sind nur GET und HEAD zugelassen (`APP/serve.mjs:63-67`) und `form-action 'none'` verbietet jedes Abschicken (`APP/serve.mjs:33-35`). Anmeldung, Formular, Tabelle mit Nachladen und Ladezustand brauchen alle eine Entscheidung an dieser Stelle. Empfohlen wird, sie bewusst zu treffen und im Kopf von serve.mjs zu begründen, statt sie beim ersten Formular beiläufig aufzuweichen. **Nicht erledigt.**

**Ob die drei fehlenden Bereiche gebaut werden.** Die sechs Bereiche stehen wörtlich auf `entrosana.com/hub/`, nämlich Overview («what is running for you right now»), Tools, Modules, Projects («what learners, parents, teachers and contributors build together»), The record («beside the work, not buried in settings») und Contribute. entrosana.app bildet drei davon ab, Tools, Modules und Contribute. Es fehlen Overview, Projects und The record, und genau diese drei sind die anwendungsartigsten. Für ihre Reihenfolge und Gewichtung gibt es ausser der Prosa auf `/hub/` keine Quelle auf der Platte. **Steht noch aus.**

**Ob das Archiv erweitert wird.** Sieben von neun Live-Dateien fehlen, siehe §2. Empfohlen wird, die EXTRAS-Liste in `/home/g2thek/entrosana-wp/backup.sh:62-70` auf den ganzen Ordner umzustellen, weil eine Aufzählung einzelner Dateien beim nächsten neuen Bauteil wieder veraltet. **Nicht erledigt.**

**Ob ein Skript zum Leeren des Rand-Caches gebaut wird.** Der Token liegt bereit und ist auf Purge beschränkt. Woher genau die `max-age=14400` für CSS stammt, war nicht feststellbar, ein Leseabruf auf die Zoneneinstellungen wurde nicht versucht. Gemessen ist nur die Wirkung. **Steht noch aus.**

**Ob `~/entrosana-app/` bleibt oder umzieht.** Der Verweis auf `https://github.com/entrosana/hub` steht viermal in den Seiten, unter anderem `APP/index.html:115` und `:126`. Ob das Verzeichnis öffentlich existiert, wurde nicht geprüft. **Steht noch aus.**
