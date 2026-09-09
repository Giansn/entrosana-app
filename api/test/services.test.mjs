import test from "node:test";
import assert from "node:assert/strict";
import { parseCheck, guardTarget, heartbeatState } from "../services.mjs";

test("prüfvorschriften: fünf arten, adressen ohne zugangsdaten", () => {
  assert.equal(parseCheck("url:https://entrosana.com/").kind, "url");
  assert.equal(parseCheck("mcp:https://example.org/mcp").host, "example.org");
  assert.deepEqual([parseCheck("tcp:example.org:443").host, parseCheck("tcp:example.org:443").port], ["example.org", 443]);
  assert.equal(parseCheck("tls:example.org").port, 443);
  assert.equal(parseCheck("webhook:").kind, "webhook");
  assert.ok(parseCheck("ftp://x").error); assert.ok(parseCheck("url:ftp://x").error); assert.ok(parseCheck("url:https://u:p@x.org/").error);
  assert.ok(parseCheck("tcp:example.org").error); assert.ok(parseCheck("tcp:example.org:99999").error);
});

test("zielschutz: privater raum nur für den eigentümer", async () => {
  assert.ok(await guardTarget("localhost", false)); assert.ok(await guardTarget("schulserver.local", false));
  assert.ok(await guardTarget("127.0.0.1", false)); assert.ok(await guardTarget("10.1.2.3", false)); assert.ok(await guardTarget("100.115.236.97", false));
  assert.ok(await guardTarget("192.168.1.1", false)); assert.ok(await guardTarget("fd00::1", false)); assert.ok(await guardTarget("x.ts.net", false));
  assert.equal(await guardTarget("100.115.236.97", true), null); assert.equal(await guardTarget("localhost", true), null);
  assert.equal(await guardTarget("8.8.8.8", false), null);
});

test("lebenszeichen: wartend, gut, spät, still", () => {
  const now = Date.parse("2026-09-10T12:00:00Z");
  assert.equal(heartbeatState({ interval_min: 60, last_beat: null }, now).state, "wait");
  assert.equal(heartbeatState({ interval_min: 60, last_beat: "2026-09-10T11:30:00Z" }, now).state, "ok");
  assert.equal(heartbeatState({ interval_min: 60, last_beat: "2026-09-10T10:30:00Z" }, now).state, "warn");
  assert.equal(heartbeatState({ interval_min: 60, last_beat: "2026-09-10T08:00:00Z" }, now).state, "off");
});
