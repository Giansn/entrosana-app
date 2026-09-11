# Team endpoints

Calls for reviewers and the owner. They accept a bearer token of an account with the reviewer or owner role, or the console's service token. Everyone else gets 403, signed-out callers 401.

## The queue

| Call | Role | What it does |
|---|---|---|
| `GET /api/contributions` | team | every proposal with state, submitter and the gate checks |
| `PATCH /api/contributions/<id>` with `{"status": "reviewing"}` | team | opens a confirmed proposal |
| `PATCH /api/contributions/<id>` with `{"status": "admitted"}` or `"rejected"` and `reason` | team | decides; reason at least three characters, mailed to the submitter |
| `PATCH /api/contributions/<id>` with `{"status": "published"}` and `reason` | owner | publishes an admitted or reviewing proposal in one step; refused with 409 and the list of failed checks while the gate is closed |
| `PATCH /api/contributions/<id>` with `{"status": "admitted"}` from `published` | owner | takes a module back from the catalogue |

Publishing is the owner's step alone since 2026-09-10; a reviewer's attempt answers 403.

## Applications

| Call | What it does |
|---|---|
| `GET /api/applications`, `?all=1` for decided ones | open applications with the applicant |
| `PATCH /api/applications/<id>` with `{"outcome": "approved"}` or `"declined"` and `reason` | decides; approval writes the contributor role |

## Members, invitations, requests, services

| Call | What it does |
|---|---|
| `GET /api/actors` | every account with roles, standing, profile, counts of contributions, open applications, devices, invitations, services and files, and `dormant_notice` |
| `GET /api/invites` | every invitation with inviter and outcome |
| `GET /api/requests`, `?all=1` | open requests; `PATCH /api/requests/<id>` with `{"handled": true}` marks one |
| `GET /api/services` | every account's services with account and target, plus the machine snapshot |
| `GET /api/me/modules` | for the team, every published module |

## Roles

Roles are not granted through the API. The owner grants and revokes them on the machine:

```bash
node api/admin.mjs grant someone@example.org reviewer
node api/admin.mjs revoke someone@example.org reviewer
```

Each is a line in the record trail.
