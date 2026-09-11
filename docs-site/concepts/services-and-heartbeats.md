# Services and heartbeats

You have things that must keep running: a school server, a shared folder, a backup that runs at night, an MCP server your assistant uses. The Running services page keeps your list of them and shows a dot for each: green when it answered, amber when something is wrong, grey when the Hub has not heard from it yet. The Hub does the checking.

## Two directions

**The Hub checks your service.** You give the Hub an address of yours and it tries it on a fixed rhythm. Four kinds:

| Kind | What you give | What the Hub does |
|---|---|---|
| address | a web address, `https://…` | opens it and expects an answer below 400 |
| MCP | the streamable HTTP endpoint of an MCP server | sends `initialize` and `tools/list` and counts the tools; a server behind a key shows as «needs auth» |
| port | `host:port` | checks that the port answers |
| certificate | a host name | reads the TLS certificate and warns two weeks before it expires |

**Your service reports to the Hub.** For things the Hub cannot reach itself: a machine inside your network, a cron job, a backup script. The Hub gives you a secret web address. Your job calls it every time it runs. While the calls keep coming, the dot stays green. When they stop for longer than the interval, it turns amber, and after twice the interval grey. This is a heartbeat.

## Rhythm

Every 5 or 15 minutes, every hour, every 4 hours, once a day. For a check, this is how often the Hub tries. For a heartbeat, this is how often a call must arrive.

## What is checked from where

The Hub checks from its own server in Switzerland. Addresses inside private networks, such as 10.x, 192.168.x, `.local` and tailnet names, are refused for everyone except the owner of the Hub, whose machine sits in such a network.

## Who sees what

Only you see your list. Addresses stay on the server; the list shows name, category and result. The owner also sees the services of the Hub's own machine in the same list, read from the machine every ten minutes.

## Limits

Up to 30 services per account. A heartbeat address accepts 600 calls an hour, «check now» runs 60 times an hour.
