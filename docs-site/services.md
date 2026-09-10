# Services

You have things that must keep running: a school server, a shared folder, a backup that runs at night, an MCP server your assistant uses. The Running services page keeps your list of them and shows a dot for each one. Green: it answered. Amber: something is wrong. Grey: the Hub has not heard from it yet. The Hub does the checking, so you do not have to go and look.

## Two ways a check can work

**The Hub checks my service.** You give the Hub an address of yours and it tries it on a fixed rhythm. Four kinds:

| Kind | What you give | What the Hub does |
|---|---|---|
| address | a web address, `https://…` | opens it and expects an answer below 400 |
| MCP | the streamable HTTP endpoint of an MCP server | sends `initialize` and `tools/list` and counts the tools; a server behind a key shows as «needs auth» |
| port | `host:port` | checks that the port answers |
| certificate | a host name | reads the TLS certificate and warns two weeks before it expires |

**My service reports to the Hub.** For things the Hub cannot reach itself: a machine inside your network, a cron job, a backup script. The Hub gives you a secret web address. Your job calls it every time it runs. While the calls keep coming, the dot stays green. When they stop for longer than the interval, it turns amber, then grey. This is a heartbeat.

## Set one up

1. Sign in and open [entrosana.app/services](https://entrosana.app/services).
2. Press **+ Add a service** and give it a name. The name is the only field that is always required.
3. Choose the direction: «The Hub checks my service» or «My service reports to the Hub».
4. If the Hub checks it, pick the kind and type the address of your service.
5. If it reports to the Hub, press **Add and get the address**. The Hub shows the secret address once, with a ready-made command line. Copy it into the job or the machine.
6. Optional: a description, a category, where it sits, and how often: every 5 or 15 minutes, every hour, every 4 hours, once a day. Category and place only sort the list. «How often» is how often the Hub checks, or how often a heartbeat must arrive.

## The heartbeat address

The address looks like this:

```
https://entrosana.app/api/hooks/<long random key>
```

Call it with GET or POST; both count. An optional `status` text is kept and shown in the list:

```
curl -fsS "https://entrosana.app/api/hooks/<key>?status=ok"
```

In a cron job, after the work is done:

```
17 3 * * * /usr/local/bin/backup.sh && curl -fsS "https://entrosana.app/api/hooks/<key>?status=ok"
```

The address is shown only once. «new address» in the row makes a fresh one and retires the old. One address accepts up to 600 calls an hour.

## Limits, and who sees what

- Up to 30 services per account.
- The Hub checks from its own server. Addresses inside private networks (10.x, 192.168.x, .local, tailnet names) are refused, except for the owner of the Hub.
- «check now» in a row runs the check at once, up to 60 times an hour.
- Only you see your list. Addresses stay on the server; the list shows name, category and result.

## Entries from the earlier page

If you used the page before 10 September 2026, your entries lived only in that browser. Open the page there once: a box lists them, and «Move them to my account» puts them on the server.
