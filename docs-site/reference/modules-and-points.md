# Modules and points

Published modules are catalogue entries with contributors. This page covers editing them, their contributors, points, search and the public meta data.

## Your modules

`GET /api/me/modules` lists the modules you contribute to; for the team, every module.

```json
{"items": [{"slug": "values-and-community", "title": "…", "who": "…", "lede": "…", "about": "…", "note": null, "meta": "…",
            "state": "development", "track": "…", "area": "social", "updated": "2026-09-10", "by": "…",
            "facts": [["Age", "10 to 12"]], "gets": ["Worksheet A"], "contributors": [{"id": 4, "name": "…"}], "points": 3, "url": "/modules/values-and-community"}],
 "team": false}
```

`GET /api/me/modules/<slug>` returns one as `{"item": …}`; 403 when you are not a contributor of it.

## Edit a module

`PATCH /api/me/modules/<slug>` with any of the fields. The catalogue file is rewritten at once and `updated` is stamped.

| Field | Rule |
|---|---|
| `title` | 3 to 120 characters |
| `who` | up to 160 |
| `lede` | up to 300 |
| `about` | up to 4000 |
| `note` | up to 2000, empty clears |
| `state` | `idea`, `development` or `finished` |
| `meta` | up to 160, empty clears |
| `facts` | up to 12 pairs `[label, value]`, label up to 60, value up to 200; pairs with an empty side are dropped |
| `gets` | up to 8 lines |

```bash
curl -X PATCH https://entrosana.app/api/me/modules/values-and-community -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"state": "finished", "facts": [["Age", "10 to 12"], ["Duration", "2 lessons"]]}'
```

## Contributors

| Call | What it does |
|---|---|
| `POST /api/me/modules/<slug>/contributors` | `{"email": "…"}`; the address must belong to an account with contributor standing and a name; answers the new list |
| `DELETE /api/me/modules/<slug>/contributors/<id>` | removes one; a module keeps at least one contributor |

## Points

`POST /api/modules/<slug>/point` toggles your point on the module: the first call gives it, the second takes it back. Needs a token; 120 changes an hour per account. Answers `{"ok": true, "points": n, "mine": true}`.

`GET /api/points`, public, returns `{"counts": {"<slug>": n}, "mine": ["<slug>"]}`; `mine` is empty without a token.

## Catalogue meta, public

`GET /api/modules/meta` returns, per slug, the contributors and the point count:

```json
{"items": {"values-and-community": {"contributors": [{"id": 4, "name": "…"}], "points": 3}}}
```

The card texts themselves are in the catalogue file the pages load; this call carries only what changes without a publication.

## Search, public

`GET /api/search?q=<text>` with at least two characters:

```json
{"ok": true, "people": [{"id", "name", "org", "role", "about"}], "journal": [{"id", "text", "created", "actor_id", "name"}], "modules": [{"title", "slug", "name"}]}
```

Only public things are searched: named accounts, public journal entries, published modules. 1200 searches an hour per origin. The Hub does not log the query.
