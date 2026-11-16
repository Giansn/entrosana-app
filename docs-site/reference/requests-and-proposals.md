# Requests and proposals

The two public forms of the Hub, callable without an account, and the status calls that go with them.

## A request or a report

`POST /api/requests`

| Field | Rule |
|---|---|
| `name` | 2 to 120 characters |
| `email` | an address |
| `kind` | `module`, `track`, `tool`, `service`, `report`, `contribute`, `other`; unknown becomes `other` |
| `text` | 10 to 4000 characters |
| `org` | up to 200, optional |
| `module` | a module slug, for `report` and `contribute` |
| `website` | leave empty; a filled field is treated as spam and answered 202 without effect |

```bash
curl -X POST https://entrosana.app/api/requests -H "Content-Type: application/json" \
  -d '{"name": "…", "email": "…", "kind": "report", "module": "values-and-community", "text": "The worksheet link on page 2 is dead."}'
```

Answers 202 with `{"ok": true, "id": n}`. Requests for a module, track, tool or service go to info@entrosana.com; reports and contribution offers go to sygnif@entrosana.com with a link to the module. The sender gets a short confirmation without the text. Requests are kept 180 days.

## The website's contact form

`POST /api/contact`

The form on entrosana.com sends through this call. The message goes to info@entrosana.com as a mail, with the sender's address as the reply address. Nothing is stored.

| Field | Rule |
|---|---|
| `name` | 2 to 120 characters |
| `email` | an address |
| `interest` | what the message is about, up to 120 characters |
| `org` | up to 200, optional |
| `msg` | up to 4000, optional |
| `website` | leave empty; a filled field is treated as spam and answered 200 without effect |

Answers 200 with `{"ok": true}` once the mail has been handed over. Refusals: 400 without a name, an address or an interest, 429 after five messages in an hour from one address or one network, 502 when the mail could not be sent.

## A proposal

`POST /api/contributions`

| Field | Rule |
|---|---|
| `name` | 2 to 120 characters; the work is published under it |
| `email` | an address |
| `title` | 3 to 160 |
| `area` | `social`, `nature-based`, `technical`, `other` |
| `summary` | 1 to 4000 |
| `trail` | the record trail as Markdown, up to 12000, optional |
| `records` and `chain` | the record trail as data, verified before publication, optional |
| `files` | up to 10 entries `{"label", "url"}`, label up to 120, url up to 500 |
| `attribution` | `keep` or `remove`: whether the module keeps your name if you erase your account |
| `website` | leave empty |

Signed in with the same address, the proposal is `confirmed` at once and the team is notified. Without a session it is `received`, a confirmation link goes to the address, and it counts once opened; unopened, it is deleted after seven days. Five proposals an hour per address and per origin.

```json
{"ok": true, "id": 12, "status": "received", "status_url": "https://entrosana.app/contribute/status?id=12"}
```

## Status and withdrawal

| Call | Who | What it does |
|---|---|---|
| `GET /api/contributions/<id>` | the submitter or the team | the proposal with its state, decisions and reasons |
| `DELETE /api/contributions/<id>` | the submitter or the owner | deletes an unpublished proposal |
| `PATCH /api/contributions/<id>` with `{"status": "withdrawn", "reason": "…"}` | the submitter | withdraws it while open |
| `PATCH /api/contributions/<id>` with `{"attribution": "keep"}` | the submitter, fresh token | sets the attribution |

The status page under `/contribute/status?id=<id>` shows the same without a token, through the link from the mail.
