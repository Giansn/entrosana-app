# Watch a service

Let the Hub open something of yours on a rhythm and tell you whether it answered.

## Steps

1. Sign in and open [entrosana.app/services](https://entrosana.app/services).
2. Press **+ Add a service** and give it a name. The name is the only field that is always required.
3. Under **Who calls whom**, keep **The Hub checks my service**.
4. Choose **How it is checked**: address, MCP, port or certificate.
5. Type the **Address of your service**: `https://…` for address and MCP, `host:port` for port, a host name for certificate.
6. Optional: a description, a category and a place for sorting, and **How often**.
7. Press **Add**. The Hub runs the first check at once and shows the result in the list.

## Reading the list

- **Green** answered; the state column says what came back, for an MCP server the number of tools.
- **Amber** something is wrong, for example a status above 400 or a certificate expiring within two weeks.
- **Grey** not checked yet.

**check now** runs the check at once, up to 60 times an hour. **remove** deletes the entry.

> **Note:** Private addresses are refused unless you are the owner of the Hub. Use a heartbeat for machines inside your network, see [Report with a heartbeat](/how-to/report-with-a-heartbeat).
