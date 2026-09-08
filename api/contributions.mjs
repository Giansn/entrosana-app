// contributions.mjs — Prüfung der Eingabe und die Zustandsmaschine. Reine
// Funktionen, damit die Tests sie ohne Netz und ohne Datenbank treffen.
import { createHash } from "node:crypto";
const sha = s => createHash("sha256").update(s).digest("hex");

export const AREAS = ["social", "nature-based", "technical", "other"];
export const OPEN = ["received", "confirmed", "reviewing"];
export const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,189}\.[A-Za-z]{2,}$/;
export const LIMITS = { name: 120, title: [3, 160], summary: [1, 4000], trail: 12000, files: 10, label: 120, url: 500 };

const str = (v, max) => (typeof v === "string" ? v : "").trim().slice(0, max + 1);

// Gibt {ok:true, value} oder {ok:false, error} zurück; bei gefüllter Honigfalle
// {ok:false, spam:true} — der Aufrufer antwortet dann, als wäre alles gut.
export function validate(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be an object" };
  if (str(body.website, 10)) return { ok: false, spam: true };
  const email = str(body.email, 254).toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: "email missing or malformed" };
  const name = str(body.name, LIMITS.name);
  if (name.length < 2) return { ok: false, error: "name missing: contributions are published under the submitter's name" };
  if (name.length > LIMITS.name) return { ok: false, error: `name longer than ${LIMITS.name}` };
  const title = str(body.title, LIMITS.title[1]);
  if (title.length < LIMITS.title[0]) return { ok: false, error: `title missing or shorter than ${LIMITS.title[0]}` };
  if (title.length > LIMITS.title[1]) return { ok: false, error: `title longer than ${LIMITS.title[1]}` };
  const area = str(body.area, 40);
  if (!AREAS.includes(area)) return { ok: false, error: "area must be one of " + AREAS.join(", ") };
  const summary = str(body.summary, LIMITS.summary[1]);
  if (summary.length < LIMITS.summary[0]) return { ok: false, error: "summary missing" };
  if (summary.length > LIMITS.summary[1]) return { ok: false, error: `summary longer than ${LIMITS.summary[1]}` };
  const trail = str(body.trail, LIMITS.trail);
  if (trail.length > LIMITS.trail) return { ok: false, error: `trail longer than ${LIMITS.trail}` };
  const filesIn = body.files === undefined ? [] : body.files;
  if (!Array.isArray(filesIn)) return { ok: false, error: "files must be a list" };
  if (filesIn.length > LIMITS.files) return { ok: false, error: `more than ${LIMITS.files} files` };
  const files = [];
  for (const f of filesIn) {
    const label = str(f && f.label, LIMITS.label), url = str(f && f.url, LIMITS.url);
    if (!label || label.length > LIMITS.label) return { ok: false, error: "file label missing or too long" };
    if (!/^https:\/\/[^\s]+$/.test(url) || url.length > LIMITS.url) return { ok: false, error: "file url must be https and short" };
    files.push({ label, url });
  }
  let org_id = null;
  if (body.org_id !== undefined && body.org_id !== null && body.org_id !== "") {
    org_id = Number(body.org_id);
    if (!Number.isInteger(org_id) || org_id <= 0) return { ok: false, error: "org_id must be a positive integer" };
  }
  const records = Array.isArray(body.records) ? body.records : [];
  const chain = Array.isArray(body.chain) ? body.chain : [];
  const attribution = body.attribution === "keep" ? "keep" : "remove";   // Vorgabe: beim Löschen geht das Modul mit
  return { ok: true, value: { email, name, title, area, summary, trail, files, org_id, records, chain, attribution } };
}

// Der Trail des Geräts, serverseitig nachgerechnet. Der Client schickt die Hashes
// der ganzen Kette (nur Hashes, kein Inhalt fremder Projekte) und die vollen
// Zeilen dieses Projekts mit ihrer Stelle i. Rezept wie in app.js:
// sha256(prev + "|" + [t, kind, project, text].join("|")).
export const TRAIL = { chain: 4000, records: 400 };
export const recordPayload = r => [r.t, r.kind, r.project || "", r.text].join("|");
export function verifyTrail(chain, records) {
  if (!Array.isArray(chain) || !Array.isArray(records)) return { ok: false, why: "chain and records must be lists" };
  if (chain.length > TRAIL.chain || records.length > TRAIL.records) return { ok: false, why: "trail too long" };
  if (!chain.every(h => typeof h === "string" && /^[0-9a-f]{64}$/.test(h))) return { ok: false, why: "chain entries must be sha256 hex" };
  for (const r of records) {
    if (!r || !Number.isInteger(r.i) || r.i < 0 || r.i >= chain.length) return { ok: false, why: "record index outside chain" };
    if (["t", "kind", "text", "h"].some(k => typeof r[k] !== "string")) return { ok: false, why: "record fields" };
    if (chain[r.i] !== r.h) return { ok: false, why: `record ${r.i} not in chain` };
    if (sha((r.i > 0 ? chain[r.i - 1] : "") + "|" + recordPayload(r)) !== r.h) return { ok: false, why: `record ${r.i} hash mismatch` };
  }
  return { ok: true, n: records.length, chain: chain.length };
}

// Welche Handlung führt von current nach target? null, wenn der Übergang nicht existiert.
// received → confirmed geschieht nur über die Bestätigung, nie über PATCH.
// admitted → published ist das Tor: eine eigene Handlung hinter publishChecks().
export function actionFor(current, target) {
  if (target === "withdrawn") return OPEN.includes(current) ? "withdraw" : null;
  if (current === "confirmed" && target === "reviewing") return "decide";
  if (current === "reviewing" && (target === "admitted" || target === "rejected")) return "decide";
  if (current === "admitted" && target === "published") return "publish";
  if (current === "published" && target === "admitted") return "publish";   // zurücknehmen
  return null;
}

// Was vor einer Veröffentlichung stimmen muss. Liefert die Liste der Mängel;
// leer heisst: darf hinaus. Die Regel ist Code, nicht Erinnerung.
export function publishChecks(c, actor) {
  const f = [];
  if (!actor || !actor.name || String(actor.name).trim().length < 2) f.push("submitter has no name to publish under");
  if (!c.decided_by) f.push("no admission on record");
  if (c.trail_ok === 0) f.push("record trail did not verify");
  if (!AREAS.includes(c.area)) f.push("area invalid");
  if (String(c.title || "").trim().length < 3) f.push("title missing");
  if (String(c.summary || "").trim().length < 40) f.push("proposal shorter than 40 characters");
  try { for (const x of JSON.parse(c.files_json || "[]")) if (!/^https:\/\//.test(String(x.url))) f.push("file link not https"); }
  catch { f.push("files unreadable"); }
  return f;
}
