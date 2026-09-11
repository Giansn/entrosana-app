# API overview

The Hub's API sits under `https://entrosana.app/api/`. Everything the pages do, they do through it, so everything you see in the Hub you can also do from a script.

## Conventions

- **JSON in, JSON out.** Send `Content-Type: application/json`; answers are JSON with a status code. The one exception is a file upload, which sends the bytes as the body.
- **Errors** carry the status code and a body `{"error": "…"}` with the reason in plain words. See [Errors and limits](/reference/errors-and-limits).
- **Public reads need no token.** Account calls send `Authorization: Bearer <token>`, see [Authentication](/reference/authentication).
- **Times** are ISO 8601 in UTC, for example `2026-09-11T14:02:10.421Z`.
- **Identifiers** are integers for accounts, proposals, services, files and journal entries; modules are addressed by their slug, for example `values-and-community`.
- **No versioning yet.** The API changes with the Hub; the [changelog](/changelog) lists what changed and when.

## A first call

```bash
curl https://entrosana.app/api/healthz
```

```json
{"ok": true, "db": "ok", "migrations": 20}
```

## The resources

| Page | Covers |
|---|---|
| [Authentication](/reference/authentication) | sign-in links, tokens, devices, fresh tokens |
| [Accounts and profiles](/reference/accounts-and-profiles) | `/api/me`, public profiles, journal, applications, invitations, export, erasure |
| [Modules and points](/reference/modules-and-points) | your modules, editing, contributors, points, search, catalogue meta |
| [Services and hooks](/reference/services-and-hooks) | checks, heartbeats, rotation |
| [Files](/reference/files) | upload, list, share, delete |
| [Requests and proposals](/reference/requests-and-proposals) | the public forms |
| [Team endpoints](/reference/team-endpoints) | queue, decisions, members |
| [Errors and limits](/reference/errors-and-limits) | status codes and rate limits |

## Public, no token

| Call | Returns |
|---|---|
| `GET /api/healthz` | `{"ok": true, "db": "ok", "migrations": n}`; 503 with `"db": "fail"` when the database does not answer |
| `GET /api/modules/meta` | contributors and points per module, keyed by slug |
| `GET /api/points` | point counts per module and, signed in, your own points |
| `GET /api/search?q=…` | people, public journal entries and published modules |
| `GET /api/profiles/<id>`, `GET /api/profiles/slug/<name>` | a public profile |
| `GET /api/avatars/<id>` | a profile picture |
| `GET /api/files/<account>/<file>/<name>` | a public file |
| `GET /api/audit/verify` | the check of the record chain |
| `GET`, `POST /api/hooks/<key>` | a heartbeat |
| `POST /api/requests` | a request or a report |
| `POST /api/contributions` | a proposal |
| `POST /api/verify/request` | a sign-in or confirmation link |

> **Note:** The origin behind the API is one machine in Switzerland behind Cloudflare. Be gentle: the rate limits on the last page are there for a class behind one address, not for load tests.
