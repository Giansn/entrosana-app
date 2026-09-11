# Authentication

Sign-in is by e-mail link, also for the API. A link creates a token for one device; the token is what you send afterwards.

## Get a token

**1. Ask for a link.**

```bash
curl -X POST https://entrosana.app/api/verify/request \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.org", "purpose": "login", "age_ok": true}'
```

```json
{"ok": true, "sent": true}
```

The answer is 202 whether or not the address exists. `purpose` is `login` for a sign-in link (20 minutes) or `address` for a plain confirmation (one hour). `age_ok: true` is required for `login`; it is not stored. Optional `name` sets the name of a new account. Five requests an hour per address and per origin.

**2. Open the link.** It ends on `/me?verify=<token>`. The page calls:

```bash
curl "https://entrosana.app/api/verify?token=<token>"
```

```json
{"ok": true, "token": "…", "expires": "2026-10-11T14:02:10.421Z", "confirmed": 0,
 "actor": {"id": 4, "email": "you@example.org", "name": "…", "created": "…", "roles": ["contributor"], "standing": "contributor"}}
```

A link works once. `confirmed` is the number of pending proposals the confirmation also confirmed.

**3. Send the token.** On every account call:

```
Authorization: Bearer <token>
```

The token is good for 30 days per device; each use extends nothing, the expiry is fixed at sign-in. The Hub stores only a hash of it.

## Devices

| Call | What it does |
|---|---|
| `GET /api/me/devices` | your sessions: `{"items": [{"id", "created", "expires", "last_used", "current"}]}` |
| `DELETE /api/me/devices/<id>` | ends one session |
| `DELETE /api/me/devices?all=1` | ends all sessions, this one included |
| `DELETE /api/me/token` | signs this device out |

When a device signs in to an existing account, the address gets a mail with the time and a rough origin.

## Fresh tokens

Two actions need a token younger than 15 minutes: `DELETE /api/me` and changing a proposal's attribution. With an older token the answer is:

```json
{"error": "fresh sign-in required: open a new link from your mailbox", "fresh_required": true}
```

with status 409. Ask for a new link, open it, and repeat the call with the new token.

## Team access

The owner's console uses a service token sent as `X-Entrosana-Token`. It lives on the Hub's machine and is not something an account can obtain; team endpoints accept it or a bearer token of an account with the reviewer or owner role.
