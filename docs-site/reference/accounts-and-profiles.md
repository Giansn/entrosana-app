# Accounts and profiles

Everything about the signed-in account, its public page, journal, applications and invitations. All calls need a bearer token unless marked public.

## Who am I

`GET /api/me`

```json
{"id": 4, "kind": "email", "email": "you@example.org", "name": "Dominik Plumettaz", "created": "2026-09-10T09:24:59.000Z",
 "roles": ["contributor"], "standing": "contributor", "slug": "dominik-plumettaz",
 "profile": {"org": "", "role": "teacher", "about": "", "bio": "", "place": "", "contact": "", "website": "", "langs": ["de"]}, "avatar": null}
```

`standing` is derived from the roles: owner, reviewer, contributor, or collector when none is set.

## Change the profile

`PATCH /api/me` with any of the fields; absent fields stay as they are, an empty string clears one.

| Field | Rule |
|---|---|
| `name` | 2 to 120 characters |
| `org` | up to 200 |
| `role` | one of `teacher`, `student`, `parent`, `social-worker`, `developer`, `researcher`, `other` |
| `about` | up to 280 |
| `bio` | up to 4000 |
| `place` | up to 120 |
| `contact` | an e-mail address for the public page |
| `website` | an `https://` link |
| `langs` | an array of language codes from the Hub's list |

```bash
curl -X PATCH https://entrosana.app/api/me -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"role": "teacher", "place": "Belp", "langs": ["de", "fr"]}'
```

The answer repeats `name` and `profile`. Each changed field is a line in the record trail without its content.

## Picture

`POST /api/me/avatar` with the image bytes as the body and its `Content-Type`; the Hub stores a 256 × 256 version. `DELETE /api/me/avatar` removes it. `GET /api/avatars/<id>` is public and answers 404 when there is none.

## Public profiles, public

`GET /api/profiles/<id>` and `GET /api/profiles/slug/<name>` return:

```json
{"ok": true, "profile": {"id": 4, "name": "…", "slug": "…", "standing": "contributor", "since": "2026-09-10", "avatar": null, "contact": "",
  "profile": {"org": "", "role": "", "about": "", "bio": "", "place": "", "website": "", "langs": []},
  "modules": [{"title": "…", "slug": "…", "published": "…"}], "journal": [{"id": 1, "text": "…", "created": "…", "updated": null}]}}
```

Only accounts with a name have a public profile; the sign-in address is never included.

## Journal

| Call | What it does |
|---|---|
| `GET /api/me/journal` | your entries, newest first: `{"items": [{"id", "text", "public", "created", "updated"}]}` |
| `POST /api/me/journal` | `{"text": "…", "public": true}`; text 1 to 2000 characters; `public` defaults to true; 60 entries an hour; answers 201 with `item` |
| `PATCH /api/me/journal/<id>` | `text` and/or `public` |
| `DELETE /api/me/journal/<id>` | removes it |

## Apply for contributor standing

`POST /api/me/apply` with `{"text": "…"}`, 20 to 2000 characters. Answers 202 with `{"application": {"id", "created"}}`. One open application at a time; the decision comes by mail and is visible under `GET /api/me`.

## Invitations

| Call | What it does |
|---|---|
| `GET /api/me/invites` | the ones you sent, with `accepted` and the resulting account number |
| `POST /api/me/invites` | `{"email": "…", "message": "…"}`; message up to 500; needs your name set; refuses your own address and addresses with an account; the link lasts seven days |

## Export and erase

- `GET /api/me/export` returns a JSON file with everything the Hub holds about you: account, profile, journal, applications, proposals with files and records, requests under your address, invitations, services, files, and your lines of the record trail.
- `DELETE /api/me` erases the account. Needs a fresh token. Body, optional: `{"keep": [ids], "remove": [ids]}` to decide per published proposal whether the module keeps your name; without it, the attribution set on each proposal applies. Answers `{"ok": true, "kept": n, "unpublished": n, "deleted": n}`.

> **Owner:** The owner account cannot erase itself; the answer is 409 until ownership is handed over on the server.
