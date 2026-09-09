/* Eigene Dienste (2026-09-10): Prüfvorschriften, Zielschutz und die Prüfungen selbst.
   url:  GET mit Weiterleitungen, gut unter 400
   mcp:  JSON-RPC initialize + tools/list über Streamable HTTP; zählt die Werkzeuge
   tcp:  Verbindung zu host:port
   tls:  Zertifikat von host:443, warnt zwei Wochen vor Ablauf
   webhook: kein aktiver Test — der Dienst meldet sich an eine geheime Adresse
   Adressen im privaten Raum (LAN, Loopback, Tailnet) darf nur der Eigentümer messen
   lassen: e14 ist sonst ein Sprungbrett in fremde Netze. Aufgelöst wird vor dem Test. */
import { connect as tcpConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { lookup } from "node:dns/promises";

export const KINDS = ["url", "mcp", "tcp", "tls", "webhook"];
export const GROUPS = ["Public", "LAN and tailnet", "Data", "Jobs"];
export const PLACES = ["via tunnel", "cloudflared", "LAN", "tailnet", "container only", "oneshot", "cloud", "on site"];
export const INTERVALS = [5, 15, 60, 240, 1440];
export const MAX_PER_ACTOR = 30;
const TIMEOUT = 8000;

export function parseCheck(check) {
  const s = String(check || "").trim();
  const m = /^([a-z]+):(.*)$/s.exec(s);
  if (!m || !KINDS.includes(m[1])) return { error: "check must start with url:, mcp:, tcp:, tls: or webhook:" };
  const kind = m[1], rest = m[2].trim();
  if (kind === "webhook") return { kind, target: null };
  if (kind === "url" || kind === "mcp") {
    let u; try { u = new URL(rest); } catch { return { error: "give a full address, https://…" }; }
    if (!/^https?:$/.test(u.protocol)) return { error: "only http or https" };
    if (u.username || u.password) return { error: "no credentials in the address" };
    return { kind, target: u.toString(), host: u.hostname };
  }
  if (kind === "tcp") {
    const t = /^\[?([a-z0-9.\-:]+)\]?:(\d{1,5})$/i.exec(rest);
    if (!t || Number(t[2]) < 1 || Number(t[2]) > 65535) return { error: "tcp needs host:port" };
    return { kind, target: `${t[1]}:${t[2]}`, host: t[1], port: Number(t[2]) };
  }
  if (kind === "tls") {
    const t = /^([a-z0-9.\-]+)(?::(\d{1,5}))?$/i.exec(rest);
    if (!t) return { error: "tls needs a host name" };
    return { kind, target: t[2] ? `${t[1]}:${t[2]}` : t[1], host: t[1], port: t[2] ? Number(t[2]) : 443 };
  }
  return { error: "unknown check" };
}

function privateIp(ip) {
  if (!ip) return true;
  if (ip.includes(":")) {   // IPv6
    const l = ip.toLowerCase();
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:") && privateIp(l.slice(7));
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some(n => Number.isNaN(n))) return true;
  return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) ||
         (p[0] === 169 && p[1] === 254) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
}
export async function guardTarget(host, ownerMayUsePrivate) {
  const h = String(host || "").toLowerCase();
  if (!h) return "host missing";
  if (ownerMayUsePrivate) return null;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".ts.net") || h.endsWith(".home.arpa")) return "private address: only the owner may watch it from here";
  if (/^[\d.]+$/.test(h) || h.includes(":")) return privateIp(h.replace(/^\[|\]$/g, "")) ? "private address: only the owner may watch it from here" : null;
  try {
    const rs = await lookup(h, { all: true });
    if (!rs.length) return "name does not resolve";
    if (rs.some(r => privateIp(r.address))) return "the name points into a private network";
  } catch { return "name does not resolve"; }
  return null;
}

const withTimeout = (ms) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) }; };
const ago = (iso) => { const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 90 ? s + " s" : s < 5400 ? Math.round(s / 60) + " min" : s < 172800 ? Math.round(s / 3600) + " h" : Math.round(s / 86400) + " d"; };

async function checkUrl(target) {
  const t0 = Date.now(), w = withTimeout(TIMEOUT);
  try {
    const r = await fetch(target, { method: "GET", redirect: "follow", signal: w.signal, headers: { "User-Agent": "entrosana-hub-check/1 (+https://entrosana.app/services)", Accept: "*/*" } });
    const ms = Date.now() - t0; try { await r.body?.cancel(); } catch {}
    if (r.status === 401 || r.status === 403) return { state: "warn", status: `${r.status} · reachable, needs sign-in · ${ms} ms`, ms };
    return r.status < 400 ? { state: "ok", status: `${r.status} · ${ms} ms`, ms } : { state: "off", status: `${r.status} · ${ms} ms`, ms };
  } catch (e) { return { state: "off", status: e.name === "AbortError" ? "no answer within 8 s" : "unreachable: " + String(e.cause?.code || e.message).slice(0, 60), ms: Date.now() - t0 }; }
  finally { w.done(); }
}
async function rpc(target, body, session, signal) {
  const h = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "User-Agent": "entrosana-hub-check/1", "MCP-Protocol-Version": "2025-06-18" };
  if (session) h["Mcp-Session-Id"] = session;
  const r = await fetch(target, { method: "POST", headers: h, body: JSON.stringify(body), signal });
  const sid = r.headers.get("mcp-session-id") || session;
  const ct = r.headers.get("content-type") || "";
  let msg = null;
  if (r.status === 202 || r.status === 204) return { status: r.status, sid, msg: null };
  const text = await r.text();
  if (ct.includes("text/event-stream")) {
    for (const line of text.split("\n")) if (line.startsWith("data:")) { try { const j = JSON.parse(line.slice(5).trim()); if (j.id === body.id || j.result || j.error) { msg = j; break; } } catch {} }
  } else { try { msg = JSON.parse(text); } catch {} }
  return { status: r.status, sid, msg };
}
async function checkMcp(target) {
  const t0 = Date.now(), w = withTimeout(TIMEOUT);
  try {
    const init = await rpc(target, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "entrosana-hub-check", version: "1" } } }, null, w.signal);
    if (init.status === 401 || init.status === 403) return { state: "warn", status: `${init.status} · reachable, needs auth · ${Date.now() - t0} ms`, ms: Date.now() - t0 };
    if (init.status >= 400 || !init.msg || !init.msg.result) return { state: "off", status: `not an MCP endpoint (${init.status})`, ms: Date.now() - t0 };
    const name = (init.msg.result.serverInfo && init.msg.result.serverInfo.name) || "server";
    try { await rpc(target, { jsonrpc: "2.0", method: "notifications/initialized" }, init.sid, w.signal); } catch {}
    const tools = await rpc(target, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, init.sid, w.signal);
    const n = tools.msg && tools.msg.result && Array.isArray(tools.msg.result.tools) ? tools.msg.result.tools.length : null;
    const ms = Date.now() - t0;
    return { state: "ok", status: `${name} · ${n == null ? "tools not listed" : n + (n === 1 ? " tool" : " tools")} · ${ms} ms`, ms };
  } catch (e) { return { state: "off", status: e.name === "AbortError" ? "no answer within 8 s" : "unreachable: " + String(e.cause?.code || e.message).slice(0, 60), ms: Date.now() - t0 }; }
  finally { w.done(); }
}
function checkTcp(host, port) {
  return new Promise((resolve) => {
    const t0 = Date.now(); const s = tcpConnect({ host, port, timeout: TIMEOUT });
    s.once("connect", () => { const ms = Date.now() - t0; s.destroy(); resolve({ state: "ok", status: `port open · ${ms} ms`, ms }); });
    s.once("timeout", () => { s.destroy(); resolve({ state: "off", status: "no answer within 8 s", ms: Date.now() - t0 }); });
    s.once("error", (e) => { resolve({ state: "off", status: "closed: " + String(e.code || e.message).slice(0, 40), ms: Date.now() - t0 }); });
  });
}
function checkTls(host, port) {
  return new Promise((resolve) => {
    const t0 = Date.now(); const s = tlsConnect({ host, port, servername: host, timeout: TIMEOUT, rejectUnauthorized: false });
    s.once("secureConnect", () => {
      const c = s.getPeerCertificate(); const ms = Date.now() - t0; s.destroy();
      if (!c || !c.valid_to) return resolve({ state: "off", status: "no certificate", ms });
      const days = Math.floor((Date.parse(c.valid_to) - Date.now()) / 86400e3);
      const trusted = s.authorized !== false;
      if (days < 0) return resolve({ state: "off", status: `certificate expired ${-days} d ago`, ms });
      if (!trusted) return resolve({ state: "warn", status: `certificate not trusted · ${days} d left`, ms });
      resolve({ state: days <= 14 ? "warn" : "ok", status: `certificate valid ${days} more days · ${ms} ms`, ms });
    });
    s.once("timeout", () => { s.destroy(); resolve({ state: "off", status: "no answer within 8 s", ms: Date.now() - t0 }); });
    s.once("error", (e) => { resolve({ state: "off", status: "unreachable: " + String(e.code || e.message).slice(0, 40), ms: Date.now() - t0 }); });
  });
}
export async function runCheck(svc) {
  const p = parseCheck(svc.kind + ":" + (svc.target || ""));
  if (p.error) return { state: "off", status: p.error, ms: 0 };
  if (p.kind === "url") return checkUrl(p.target);
  if (p.kind === "mcp") return checkMcp(p.target);
  if (p.kind === "tcp") return checkTcp(p.host, p.port);
  if (p.kind === "tls") return checkTls(p.host, p.port);
  return { state: "wait", status: "reports itself", ms: 0 };
}
// Zustand eines Lebenszeichens aus der letzten Meldung und dem Intervall.
export function heartbeatState(svc, now = Date.now()) {
  if (!svc.last_beat) return { state: "wait", status: "waiting for the first heartbeat" };
  const age = now - Date.parse(svc.last_beat), win = svc.interval_min * 60e3;
  const word = "heartbeat " + ago(svc.last_beat) + " ago" + (svc.last_status ? " · " + svc.last_status : "");
  if (age <= win) return { state: "ok", status: word };
  if (age <= 2 * win) return { state: "warn", status: "late: " + word };
  return { state: "off", status: "silent: " + word };
}
