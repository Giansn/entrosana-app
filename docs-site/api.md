# API

The Hub's API sits under `https://entrosana.app/api/`. Everything is JSON: send `Content-Type: application/json` and get JSON back. An error carries a status code and `{"error": "…"}` with the reason. Reading public things needs no key. Account calls use the token of a signed-in session.

## Sign in

Sign-in is by e-mail link, also for the API.

1. `POST /api/verify/request` with `{"email": "you@example.org", "purpose": "login", "age_ok": true}`. The answer is always 202, whether or not the address exists.
2. Open the link from the mail within 20 minutes. It ends on `/me?verify=<token>`. The page calls `GET /api/verify?token=<token>` and gets `{"ok": true, "token": "…", "expires": "…", "actor": {…}}`.
3. Send that token as `Authorization: Bearer <token>` on every account call. It is good for 30 days per device. `DELETE /api/me/token` signs the device out; `GET /api/me/devices` lists sessions and `DELETE /api/me/devices?all=1` ends them all.

Erasing the account and changing a module's attribution need a token younger than 15 minutes. Otherwise the answer is 409 with `"fresh_required": true`.

## Public, no token

| Call | What it returns |
|---|---|
| `GET /api/healthz` | `{"ok": true, "db": "ok", "migrations": n}` |
| `GET /api/modules/meta` | contributors and points per module, keyed by slug |
| `GET /api/points` | point counts per module, and your own points when signed in |
| `GET /api/search?q=…` | people, public journal entries and published modules |
| `GET /api/profiles/<id>`, `GET /api/profiles/slug/<name>` | a public profile |
| `GET /api/avatars/<id>` | a profile picture |
| `GET /api/audit/verify` | the check of the record chain |
| `POST /api/requests` | a request or a report: `name`, `email`, `kind`, `text`, optional `org` and `module`. Kinds: module, track, tool, service, report, contribute, other. Answer 202. |
| `POST /api/contributions` | a proposal: `name`, `email`, `title`, `area`, `summary`, optional `trail`, `files`, `attribution`. Areas: social, nature-based, technical, other. Without a session a confirmation mail goes out first. |

## Your account, with token

| Call | What it does |
|---|---|
| `GET /api/me` | who you are: id, name, standing, roles, slug |
| `PATCH /api/me` | profile fields: name, org, role, about, website, langs and more |
| `GET /api/me/export` | everything the Hub holds about you, as JSON |
| `DELETE /api/me` | erase the account; needs a fresh token |
| `GET /api/me/journal`, `POST /api/me/journal`, `PATCH` and `DELETE /api/me/journal/<id>` | your journal |
| `POST /api/me/apply` | apply for contributor standing |
| `GET /api/me/invites`, `POST /api/me/invites` | invitations |
| `GET /api/me/modules`, `PATCH /api/me/modules/<slug>` | your modules and their text, state and facts |
| `POST /api/me/modules/<slug>/contributors`, `DELETE …/contributors/<id>` | contributors of a module |
| `POST /api/modules/<slug>/point` | give a point, or take it back |

## Services, with token

| Call | What it does |
|---|---|
| `GET /api/me/services` | your list, plus the kinds, groups, places and intervals the dialog offers |
| `POST /api/me/services` | add one: `name`, `check`, optional `what`, `group`, `place`, `interval` |
| `PATCH /api/me/services/<id>` | rename, describe, regroup, change the interval |
| `DELETE /api/me/services/<id>` | remove |
| `POST /api/me/services/<id>/check` | check now |
| `POST /api/me/services/<id>/rotate` | a new heartbeat address; the old one stops |

The `check` field says how: `url:https://…`, `mcp:https://…/mcp`, `tcp:host:port`, `tls:host`, or `webhook:` for a heartbeat. For a heartbeat the answer carries `hook_url` once.

`GET` or `POST /api/hooks/<key>` is the heartbeat itself, without a token. `?status=…` or a JSON body `{"status": "…"}` keeps a short text. The answer is `{"ok": true, "service": "…", "received": "…"}`.

## Limits

- Sign-in requests and proposals: 5 an hour per address and per origin. Mails: 60 an hour in total.
- Heartbeats: 600 an hour per address. Points: 120 changes an hour per account. Searches: 1200 an hour per origin. «check now»: 60 an hour.
- When a limit is reached the answer is 429. A missing or malformed field gives 400 with the reason.

## Source

The Hub is AGPL-3.0. The code is on [GitHub](https://github.com/entrosana/hub).
