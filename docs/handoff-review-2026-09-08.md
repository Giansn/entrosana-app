# entrosana.com and entrosana.app — final review and handoff

Written 2026-09-08, late evening, by the owner-seat session that promoted the v3
design to entrosana.com. Every figure below was read from the running system on
2026-09-08; where something is a claim from a document and not a measurement,
it says so. Sibling document for the app side: `docs/contributions.md`. For the
website side: `~/entrosana-wp/TODO.md` and `~/entrosana-wp/drafts/README-gpu-section.md`.

---

## 1. State at handoff

| what | where | state 2026-09-08 |
|---|---|---|
| entrosana.com | WordPress, `~/entrosana-wp`, Docker on 127.0.0.1:8090, tunnel | up, all pages 200, 0.3–0.6 s |
| entrosana.app | `~/entrosana-app/serve.mjs`, :4322, tunnel | up, 200 |
| Hub API | `~/entrosana-app/api/server.mjs`, :4324, tunnel path rule `^/api/.+` | up, `/api/healthz` 200 |
| admin .com | `~/entrosana-site/admin.py`, :8393, tailnet and loopback only | up |
| admin .app | `admin-app.py` :8396, `admin-modules-ux.py` :8397, tailnet | up |
| entrosana-edge | Caddy, LAN :443 fallback to :4321 | **crash-looping**, see §5 |
| Sep-5 NetworkManager fix | `/etc/NetworkManager/conf.d/99-unmanaged-docker.conf` | held through the Sep-8 restart, 8/8 bridges with IPv4 |

Nothing on entrosana.com has changed since 2026-09-02 09:06 (`post_modified` of all
five content pages; no newer theme or mu-plugin file).

## 2. Done this cycle

- **v3 design promoted to entrosana.com** (2026-09-02). Derived attributes are
  stamped at render in `theme/entrosana/inc/shapes.php`; `improve.css` is gone,
  zero `!important` remain; content edits are real `post_content` on pages
  7/12/13/14/112. Verified pixel-identical against the staging mirror.
  Backups: `~/entrosana-wp/attic/v3-promote-20260902/`, theme rollback
  `theme/entrosana.prev/`.
- **Admin v2 for the website** (:8393). `dist/` is rebuilt from the live site by
  `~/entrosana-site/build-dist.py` with three per-page stylesheet bundles.
  `/design` and `/live` change the live site; `/gjs`, `/edit`, `/raw`,
  `/preview` edit the snapshot. `admin.py` is untracked in git.
- **Contribution platform on entrosana.app** (built by a sibling session,
  eleven commits 19:19–21:08 today, phases 0–7). Reviewed in §3.
- **GPU differentiation drafted, not published.** Four files in
  `~/entrosana-wp/drafts/`, WordPress page 157 (draft, parent 14,
  `/modules/dedicated-vs-unified-gpu`). Every CSS class it uses exists in the
  live theme. The README flags one claim that needs an owner behind it before
  publishing: "Sharing a processor is not sharing data."
- **Host fault fixed** (2026-09-05): NetworkManager adopting Docker bridges.
  Durable rule installed, see §5.

## 3. Review: the contributor path on entrosana.app

**What it is.** Form on `/contribute/submit` → `POST /api/contributions` → SQLite
row `received` → confirmation mail, link valid one hour → `confirmed` → review
console in the :8396 admin → `admitted` → separate publish step with its own
checks and a mandatory reason → entry in `assets/catalogue.js` under a new
"Contributed" track, with the submitter's name → card on `/modules` and a
detail page derived from the catalogue, no restart. Every transition is a line
in a hash chain. Submitters get a status page, withdraw, delete, JSON export,
and full erasure with a per-module choice to keep an admitted module published
under their name. Honeypot, per-IP and per-address limits (5/h), a global mail
cap (60/h), nightly purge, backup and log rotation timers exist.

**Verdict.** Solid. The rules were written before the code
(`docs/contributions.md`) and the code follows them; policy is a table, not
scattered ifs; the catalogue is edited byte-preserving with a backup and a
sandbox evaluation before write; no SQL or path is built from input.

**Verified live.** Origin HTML of submit, status, modules and contribute is
byte-identical to the working tree (Cloudflare adds one inline bot-detection
script at the edge, blocked by the CSP, harmless). Database: two actors (service
reviewer, owner), three test contributions, 48 chain lines.

| id | status | title | area |
|---|---|---|---|
| 1 | admitted | Gate test: Phase 4 submission | other |
| 2 | admitted | Gate test with trail: Phase 4 | technical |
| 3 | confirmed | Test | social |

Nothing is published; the "Contributed" wall shows its empty-state sentence.
The two admitted gate tests would appear on the public wall the moment someone
publishes them, and the nightly purge does not touch admitted rows.

**Settings worth knowing.** `FOUR_EYES` is not set in the unit, so the same
actor may admit and publish; the chain records that as a note. Documented as
intended while the review team is one person.

## 4. Coherence between .com and .app

### 4.1 Every referral from .com to .app

| .com page | target on .app | link text |
|---|---|---|
| home, hub | `/` | entrosana.app · in development |
| hub | `/` | Open the Hub → |
| modules | `/` | Visit the Hub → |
| modules | `/modules/your-value-system` | Open the module › |

Seven links, none to `/contribute` or `/contribute/submit`. The module pick-up
is framed once, on `.com/modules` under "Available now": slides, worksheet and
the full description are in the Hub. That is unambiguous and correct.

### 4.2 Two "Propose a module" paths

`.com/modules` has its own Propose dialog. It posts to the WordPress contact
endpoint and becomes a mail to info@ with the subject "Module proposal — area".
No record, no status page, no review queue. `.com/hub` "Request or propose a
module →" also stays on .com. The app has the real pipeline, and .com never
points at it. A teacher who reads on .com that modules are built by
contributors is sent to an inbox, not to the form that gives them a
confirmation, a status page and their name on the result.

**Recommendation.** Point the .com "Propose a module" button at
`https://entrosana.app/contribute/submit`. Keep "Request a module" on .com as
the school-side inquiry to info@. Two verbs, two destinations.

### 4.3 On the app, the form is buried

`/modules` "Propose a module" and "Request a module" both link to `/contribute`,
the landing page, whose primary button is "Write to info@entrosana.com" and
whose secondary is the .com request form. The new submit form is the fifth card
in "Ways in" (chip "proposal", cost "a form").

**Recommendation.** "Propose a module" → `/contribute/submit` directly; move
the submit card first or into the header actions.

### 4.4 Three addresses face the reader

| address | where it appears |
|---|---|
| info@entrosana.com | SMTP sender, .com contact form, `/contribute` landing CTA, catalogue "Where it goes" (two entries) |
| sygnif@entrosana.com | Reply-To on every Hub mail (`tools/mail-send.py`), no-JS fallback in `submit.html`/`status.html`, offline fallback in `submit.js`/`status.js`, `docs/privacy-hub.md` |
| entrosana.com/request-access | `/contribute` landing secondary button, `/modules` "New project" |

`docs/contributions.md` records sygnif@ as registered 2026-09-08 and sorted by
SYGNIF. Not verified from this seat by a delivery test; the evidence is the
document. Pick one address for the reader, or explain the split on the page.

### 4.5 Promises made before the text exists

Both are flagged in the sibling's own docs and both are still open:

- The AGPL-3.0 plus attribution sentence belongs on `.app/modules` "Open to
  contributors" before the first outside proposal. `/contribute` already says
  it; `/modules` does not.
- `entrosana.com/privacy` (page 17) must describe what the Hub stores, how long,
  and the way to erasure. The draft is `docs/privacy-hub.md`. Page 17 today has
  no mention of the Hub, contributions or entrosana.app.

### 4.6 Smaller UI seams

- Rail footer says "Not signed in · local device only" on the status page even
  while a 30-day token is held and the page lists the person's own contributions.
- Published entries carry the meta line "contributed · draft, under review for
  publication" and the fact "Status: admitted; text as submitted", both written
  for the admitted state but shown after publication (`api/publish.mjs`,
  `entryFor`).
- Rail count "Contribute 3" is hard-coded in the HTML.
- The GPU explainer as a `.com` child page under `/modules/` creates two
  `/modules/<slug>` namespaces with different meanings; the tab patch's eyebrow
  "published modules" labels a text explainer as a module. Either publish it as
  a Technical-area catalogue entry on the app (through the :8397 editor, it is
  owner-authored, not a contribution) or keep it on .com and relabel it as an
  explainer.

## 5. Incidents

**2026-09-05, site unreachable.** Unplugging the ethernet cable made
NetworkManager adopt all eight Docker bridges; each lost its IPv4 gateway.
Apache logged normal 301s, replies had no route back. Tell: `ip -4 -br addr show
| grep br-` returns nothing. Runtime fix re-added the addresses; durable fix is
`99-unmanaged-docker.conf` (`unmanaged-devices=interface-name:docker*;
interface-name:br-*;interface-name:veth*`). Six NM auto-created profiles still
exist, inert. Memory: `e14-nm-adopts-docker-bridges.md`.

**2026-09-08 21:18:50, ten-second outage.** `sudo systemctl restart docker` from
the owner's own SSH shell on gtaura (pts/10), after two iptables reads. All
containers back 21:19:01–03. Compose hashes unchanged. The Sep-5 fix held.

**entrosana-edge crash loop, since that restart.** `deploy/edge/Caddyfile:7`
binds `192.168.105.119`, the Praxis hotspot address e14 no longer has since the
Yallo contract ended 2026-08-31. Restart count 11 and rising. Affects only the
LAN :443 fallback, not the public site. Fix: change the `bind`. Not done, not
asked.

## 6. Open decisions for the owner

| decision | recommendation |
|---|---|
| Where the .com "Propose a module" button goes | `entrosana.app/contribute/submit` |
| One reader-facing address, or explain the split | one address; if sygnif@ stays, name it as the contributions desk everywhere it appears |
| GPU explainer: .app catalogue entry or .com page | catalogue entry, Technical area; delete draft page 157 afterwards |
| The "Sharing a processor is not sharing data" claim | confirm or soften before the services section goes live |
| Gate-test rows #1–#3 in the live database | delete them before the first real submission, or they may be published by accident |
| `entrosana-edge` bind | change to a present address or drop the LAN edge |
| `FOUR_EYES=strict` once a second reviewer exists | set it |
| Six inert NetworkManager profiles | delete them to remove the mechanism |
| Rotate the sudo password | it was typed into a chat transcript on 2026-09-05 |
| What "UAM" is (bridge idea from 2026-09-06) | undefined; the sketch waits on a definition |

## 7. First three edits, in order

1. **.com page 14**: change the Propose dialog trigger (`data-jump-modal="market-proposal"`)
   to a plain link to `https://entrosana.app/contribute/submit`; leave the
   Request dialog. `wp post update 14` via `docker compose run --rm -T wpcli`,
   or `/live` in the :8393 admin.
2. **.app `modules.html`** line 114: `href="/contribute"` → `href="/contribute/submit"`
   on "Propose a module". Reorder the submit card in `contribute.html` to first.
3. **One address**: either replace sygnif@ with info@ in `submit.html`,
   `status.html`, `assets/submit.js`, `assets/status.js`, `tools/mail-send.py`
   default, or add one sentence on `/contribute` saying contributions are
   answered from sygnif@.

## 8. Pointers

- Website: `~/entrosana-wp` (theme and mu-plugins bind-mounted, edits are live;
  `cf-cache-status: DYNAMIC`). wp-cli: `docker compose run --rm -T wpcli …`,
  `--user=1` bypasses KSES. Files for wp-cli must live under the container's
  `/var/www/html/`, not `/tmp`.
- App: `~/entrosana-app`, units `entrosana-app.service` and
  `entrosana-api.service` (user scope). Admin CLI:
  `node api/admin.mjs list | grant | token | publish | unpublish | purge | verify-chain`.
  Database `api/db/hub.sqlite`, backups `api/db/hub.backup.sqlite` (03:20) and
  `~/entrosana-app-backups/` for catalogue snapshots. Restore: `docs/restore.md §5`.
- Tunnel: `~/.cloudflared/config.yml` (entrosana.com → :8090, entrosana.app →
  :4322, `/api/.+` → :4324).
- Browser comparison: await `document.getAnimations()` before measuring, the
  front-page hero animation otherwise flaps by 1 px.
