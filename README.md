# entrosana Hub · entrosana.app

The Hub of [entrosana](https://entrosana.com): lessons ("modules") and small tools for schools, a way to propose new ones with a person deciding on each, and a **record trail**, a list in which every line is sealed against the one before it, so a story of work can be checked by hand.

- Live: <https://entrosana.app>
- Docs: <https://docs.entrosana.app>
- Rules for using and contributing: <https://entrosana.app/guidelines>

## What is in this repository

| Path | What it is |
|---|---|
| `*.html`, `assets/` | The pages: one HTML file per route, plain ES5 scripts, one stylesheet (`assets/app.css`). No build step, no frameworks. |
| `serve.mjs` | Serves entrosana.app, docs.entrosana.app and atrium.entrosana.com. URLs map to files through an explicit table, never through the file system; the server stamps asset links with content hashes and sends a strict CSP. `INDEXABLE` is the one switch for search engines. |
| `assets/catalogue.js` | The modules, tools and contribution entries. Detail pages (`/modules/<slug>` and so on) are derived from it. |
| `api/` | The writing service: accounts by mail link, proposals and review, profiles, files, services. `node:http` and `node:sqlite`, migrations in `api/db/`, permissions in `policy.mjs`, a hash-chained log in `audit.mjs`, tests in `api/test/`. |
| `docs-site/`, `docs-dev/` | The published docs and their working copy (served on atrium.entrosana.com/docs). |
| `docs/` | Internal notes, mostly in German: contribution rules (`contributions.md`), restore (`restore.md`), the privacy text (`datenschutz.md`). |
| `deploy/`, `tools/` | systemd units and timers; backup, sync, mail and snapshot scripts. |
| `admin-app.py`, `admin-modules-ux.py` | The team consoles. Tailnet only, key login, Python 3.12 or newer. |

## Run it locally

Node 22.13 or newer (`node:sqlite` without a flag). There is nothing to install.

```sh
node serve.mjs                          # pages on http://127.0.0.1:4322
DB_PATH=:memory: node api/server.mjs    # API on http://127.0.0.1:4324
node --test api/test/*.test.mjs         # API tests
```

In production a Cloudflare tunnel sends `/api/*` to the API and everything else to `serve.mjs`; locally the two run side by side without that routing. Sending mail needs `~/.config/entrosana-smtp.env` (see `tools/mail-send.py`).

## How changes go live

**`master` deploys itself.** A timer on the server (`tools/hub-sync.sh`) pulls `master` every hour. Pages and assets are re-read within seconds, `serve.mjs` restarts when it changes, and the API restarts only when its tests pass. The team console also commits text edits to `master`. Work on a branch and open a pull request.

## Licence

[AGPL-3.0](LICENSE). Published contributions carry the same licence and their contributors' names, as the [guidelines](https://entrosana.app/guidelines) describe.

Contact: [info@entrosana.com](mailto:info@entrosana.com)
