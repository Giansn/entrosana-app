# Report with a heartbeat

For jobs and machines the Hub cannot reach: they call the Hub instead, and the dot stays green while the calls keep coming.

## Steps

1. Sign in and open [entrosana.app/services](https://entrosana.app/services).
2. Press **+ Add a service** and give it a name.
3. Under **Who calls whom**, choose **My service reports to the Hub**. There is nothing to type; the address field disappears.
4. Set **How often** to how often a call must arrive. For an hourly job choose every 4 hours, so a late run does not turn the dot amber.
5. Press **Add and get the address**. The dialog shows the secret address once, with a ready command line.
6. Copy the address into the job or the machine you want to watch, and have it call the address after the work succeeded.

## The address

```
https://entrosana.app/api/hooks/<long random key>
```

Call it with GET or POST; both count. An optional `status` text is kept and shown in the list.

```bash
curl -fsS "https://entrosana.app/api/hooks/<key>?status=ok"
```

In a cron job, after the work is done:

```
17 3 * * * /usr/local/bin/backup.sh && curl -fsS "https://entrosana.app/api/hooks/<key>?status=ok"
```

## Good practice

- Keep the address in a file with mode 600 outside any repository, and read it from there.
- Call only after success. A failed run then shows as a missing heartbeat.
- **new address** in the row makes a fresh one and retires the old; do this when the address may have leaked.

> **Warning:** The address is shown only once. Anyone who has it can keep the dot green, so treat it like a password.
