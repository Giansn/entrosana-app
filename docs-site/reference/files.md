# Files

Each account holds up to 400 MB on the Hub's own server: up to 200 files of up to 50 MB each. All calls need a bearer token except reading a public file.

## List

`GET /api/me/files`

```json
{"ok": true, "items": [{"id": 3, "name": "worksheet-a.pdf", "label": "Worksheet A", "ext": "pdf", "type": "application/pdf", "size": 184220, "public": true, "created": "…", "url": "/api/files/4/3/worksheet-a.pdf"}],
 "used": 184220, "quota": 419430400, "max_file": 52428800, "where": "on the Hub's own server in Switzerland"}
```

## Upload

`PUT /api/me/files` with the file's bytes as the body. The name and the title travel in headers, so nothing else needs encoding:

| Header | Meaning |
|---|---|
| `Content-Type` | the file's type |
| `Content-Length` | the size in bytes, required |
| `X-File-Name` | the file name, URL-encoded; the ending decides the kind |
| `X-File-Label` | a title of up to 60 characters, URL-encoded, optional |
| `X-Public` | `1` for a public file; private otherwise |

```bash
curl -X PUT https://entrosana.app/api/me/files -H "Authorization: Bearer $T" \
  -H "Content-Type: application/pdf" -H "X-File-Name: worksheet-a.pdf" -H "X-File-Label: Worksheet%20A" -H "X-Public: 1" \
  --data-binary @worksheet-a.pdf
```

Answers 201 with `item`, `used` and `quota`. Refusals: 400 without a name, 411 without a length, 413 over 50 MB or over the quota, 415 for a kind not on the list, 409 at 200 files, 429 after 60 uploads in an hour. If fewer bytes arrive than announced, the file is discarded and the answer is 400.

## Change and delete

| Call | What it does |
|---|---|
| `PATCH /api/me/files/<id>` | `public` true or false, `label` up to 60, `name` keeping the same ending |
| `DELETE /api/me/files/<id>` | removes it; answers `used` and `quota` |

## Read, public for public files

`GET /api/files/<account>/<file>/<name>` sends the bytes with the stored type and a download name. A private file answers 404 to everyone but its owner, who may read it with a token. Public files are cached at the edge for five minutes; private ones never.

> **Note:** Every file is mirrored into the encrypted backup per file. A deleted file leaves the backups after 14 days.
