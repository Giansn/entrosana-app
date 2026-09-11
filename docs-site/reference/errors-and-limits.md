# Errors and limits

Every error is a status code and a body `{"error": "…"}` with the reason in plain words. Some carry one extra field, noted below.

## Status codes

| Code | When |
|---|---|
| 400 | a field is missing or malformed; the reason names it |
| 401 | no token, or an expired one |
| 403 | the token is valid but the account may not do this |
| 404 | nothing under this identifier, or nothing you may see |
| 409 | the state does not allow it: a closed gate, a second open application, the 30th service, the owner erasing itself, a stale token (`"fresh_required": true`) |
| 410 | a sign-in link that was used or has expired |
| 411, 413, 415 | a file upload without a length, too large, or of a kind not accepted |
| 429 | a rate limit reached; try again later |
| 502 | a mail could not be sent |
| 503 | the database does not answer; `GET /api/healthz` says so |

## Rate limits

Counted in memory per hour, not stored.

| What | Limit |
|---|---|
| sign-in and confirmation links | 5 an hour per address, 5 per origin |
| proposals | 5 an hour per address, 5 per origin |
| mails in total | 60 an hour; beyond it, links and notifications wait |
| searches | 1200 an hour per origin |
| journal entries | 60 an hour per account |
| points | 120 changes an hour per account |
| «check now» on a service | 60 an hour per account |
| heartbeats | 600 an hour per address |
| file uploads | 60 an hour per account |

## Sizes

| What | Limit |
|---|---|
| request body | JSON of a few kilobytes; a file upload up to 50 MB |
| services per account | 30 |
| files per account | 200, 400 MB in total |
| journal entry | 2000 characters |
| proposal summary | 4000 characters; trail 12000; 10 file links |
| module text | 4000 characters; 12 facts; 8 links |
