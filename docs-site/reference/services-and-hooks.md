# Services and hooks

Your list of services, the checks the Hub runs, and the heartbeat addresses. All calls need a bearer token except the hook itself.

## List

`GET /api/me/services`

```json
{"items": [{"id": 7, "name": "Hub sync", "what": "", "group": "Jobs", "place": "oneshot", "kind": "webhook", "interval": 240,
            "target_hint": null, "state": "ok", "status": "heartbeat 12 min ago · ok, 642311b, 0 new", "checked": "…", "ms": null, "beat": "…", "created": "…"}],
 "team": false, "machine": null,
 "kinds": ["url", "mcp", "tcp", "tls", "webhook"], "groups": ["Public", "LAN and tailnet", "Data", "Jobs"],
 "places": ["via tunnel", "cloudflared", "LAN", "tailnet", "container only", "oneshot", "cloud", "on site"], "intervals": [5, 15, 60, 240, 1440], "max": 30}
```

`state` is `ok`, `warn`, `off` or `wait`; `target_hint` is the origin of a checked address, never the full address. For the owner, `machine` carries the snapshot of the Hub's own machine: `{"host", "read", "services": [{"group", "name", "what", "where", "state", "status", "flag"}]}`.

## Add

`POST /api/me/services`

| Field | Rule |
|---|---|
| `name` | 2 to 80 characters, required |
| `check` | how it is checked, see below, required |
| `what` | up to 160 |
| `group` | one of `groups` |
| `place` | one of `places` |
| `interval` | one of `intervals`, minutes; default 60 |

The `check` field says the kind and the target in one string:

| Form | Kind |
|---|---|
| `url:https://host/path` | address; http or https, no credentials in it |
| `mcp:https://host/mcp` | MCP server, streamable HTTP |
| `tcp:host:port` | port, 1 to 65535 |
| `tls:host` or `tls:host:port` | certificate, default port 443 |
| `webhook:` | heartbeat, no target |

```bash
curl -X POST https://entrosana.app/api/me/services -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"name": "nightly export", "check": "webhook:", "group": "Jobs", "place": "oneshot", "interval": 240}'
```

```json
{"ok": true, "item": {…}, "hook_url": "https://entrosana.app/api/hooks/EcJEZwnZgpxwi4XNIjmkIzRV6yeVgml2ENb2Qa1AK2Q"}
```

`hook_url` appears only in this answer and only for a heartbeat. For a check, the first check runs before the answer comes back, so `item` already carries a result. Private targets are refused with 400 unless the account is the owner; the host is resolved and its addresses checked, so a public name pointing into a private range is refused too. Up to 30 services per account, 409 beyond.

## Change, check, rotate, remove

| Call | What it does |
|---|---|
| `PATCH /api/me/services/<id>` | `name`, `what`, `group`, `place`, `interval`; kind and target do not change, remove and add instead |
| `POST /api/me/services/<id>/check` | runs the check now and returns `item`; 60 an hour per account; not for heartbeats |
| `POST /api/me/services/<id>/rotate` | heartbeats only: a new address in `hook_url`, the old one stops at once |
| `DELETE /api/me/services/<id>` | removes it |

## The heartbeat, public

`GET` or `POST /api/hooks/<key>`, no token. A `status` text of up to 120 characters is kept: as `?status=…` or as a JSON body `{"status": "…"}`.

```bash
curl -fsS "https://entrosana.app/api/hooks/<key>?status=ok"
```

```json
{"ok": true, "service": "nightly export", "received": "2026-09-11T03:17:04.101Z"}
```

An unknown key answers 404; 600 calls an hour per address, 429 beyond. The state follows the interval: `ok` within it, `warn` up to twice the interval, `off` after that.

## How checks run

A timer on the Hub's server runs due checks every minute, at most three at a time; an address check waits up to ten seconds for an answer. Results are kept per service: last state, last status text, time and duration.
