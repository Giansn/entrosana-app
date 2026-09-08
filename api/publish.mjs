// publish.mjs — ein angenommener Beitrag wird ein Katalogeintrag (Phase 6).
//
// catalogue.js ist JavaScript mit Kommentaren und hängenden Kommas, also weder
// JSON noch von Hand neu zu erzeugen. Deshalb wird nicht geparst und neu
// geschrieben, sondern wortgetreu eingefügt: der neue Eintrag kommt vor die
// schliessende Klammer der Liste des Abschnitts, mit der Einrückung des letzten
// Eintrags. Alles Bestehende bleibt Byte für Byte, wie es war — die Editoren
// auf :8396 und :8397 lesen die Datei mit denselben Mustern weiter.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CATALOGUE = process.env.CATALOGUE || join(HERE, "..", "assets", "catalogue.js");
const BACKUPS = process.env.CATALOGUE_BACKUPS || join(process.env.HOME || HERE, "entrosana-app-backups");
export const TRACK = { id: "contributed", name: "Contributed", short: "contributed" };

// Die Datei so lesen, wie der Browser sie liest.
export function readCatalogue(path = CATALOGUE) {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(path, "utf8"), sandbox, { timeout: 1000 });
  return sandbox.window.__catalogue;
}

export function slugify(title) {
  const s = String(title).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return s || "contribution";
}
export function uniqueSlug(cat, section, base) {
  const taken = new Set();
  for (const sec of Object.values(cat)) for (const e of (sec.list || [])) taken.add(e.slug);
  let s = base, n = 2;
  while (taken.has(s)) s = `${base}-${n++}`;
  return s;
}

// Sucht vom Beginn des Abschnitts die Liste und deren schliessende Klammer,
// string- und kommentarbewusst, damit ein "]" in einem Text nicht zählt.
function findList(src, section) {
  const head = src.search(new RegExp(`\\n {1,2}"${section}":\\s*\\{`));
  if (head < 0) throw new Error(`section ${section} not found`);
  const listAt = src.indexOf('"list"', head);
  if (listAt < 0) throw new Error(`list of ${section} not found`);
  const open = src.indexOf("[", listAt);
  let depth = 0, i = open, inStr = null, lineComment = false;
  for (; i < src.length; i++) {
    const ch = src[i], nx = src[i + 1];
    if (lineComment) { if (ch === "\n") lineComment = false; continue; }
    if (inStr) { if (ch === "\\") { i++; continue; } if (ch === inStr) inStr = null; continue; }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === "/" && nx === "/") { lineComment = true; continue; }
    if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") { depth--; if (depth === 0) return { open, close: i }; }
  }
  throw new Error(`list of ${section} not closed`);
}

function backup(path) {
  mkdirSync(BACKUPS, { recursive: true });
  const dest = join(BACKUPS, `${basename(path)}.${new Date().toISOString().replace(/[:.]/g, "-")}`);
  copyFileSync(path, dest);
  return dest;
}

// Gibt den Eintrag als Quelltext in der Schreibweise der Datei aus.
function render(entry, indent) {
  const pad = indent, inner = indent + " ";
  const q = v => JSON.stringify(v);
  const lines = [pad + "{"];
  for (const [k, v] of Object.entries(entry)) {
    if (Array.isArray(v) && k === "facts") {
      lines.push(`${inner}${q(k)}:[`);
      lines.push(v.map(p => `${inner} ${q(p)}`).join(",\n"));
      lines.push(`${inner}]`);
    } else if (Array.isArray(v) && k === "downloads") {
      lines.push(`${inner}${q(k)}:[`);
      lines.push(v.map(d => `${inner} {"lang":${q(d.lang)}, "files":${q(d.files)}}`).join(",\n"));
      lines.push(`${inner}]`);
    } else {
      lines.push(`${inner}${q(k)}:${q(v)}`);
    }
  }
  // Kommas zwischen den Feldern
  for (let i = 1; i < lines.length - 1; i++) if (!lines[i].endsWith("[") && !lines[i + 1].trim().startsWith("]")) lines[i] += ",";
  lines.push(pad + "}");
  return lines.join("\n");
}

export function ensureTrack(src, section) {
  const head = src.search(new RegExp(`\\n {1,2}"${section}":\\s*\\{`));
  const tracksAt = src.indexOf('"tracks"', head);
  if (tracksAt < 0 || tracksAt > src.indexOf('"list"', head)) return src;   // Abschnitt ohne Gleise: nichts tun
  const seg = src.slice(tracksAt, src.indexOf("]", tracksAt) + 1);
  if (seg.includes(`"id":"${TRACK.id}"`)) return src;
  const close = src.indexOf("]", tracksAt);
  const lastNl = src.lastIndexOf("\n", close);
  const indent = src.slice(lastNl + 1, close).match(/^\s*/)[0];
  const prev = src.slice(0, close).trimEnd();
  const line = `${indent} {"id":"${TRACK.id}", "name":"${TRACK.name}", "short":"${TRACK.short}"}`;
  return prev + ",\n" + line + "\n" + indent + src.slice(close);
}

export function appendEntry(section, entry, path = CATALOGUE) {
  let src = readFileSync(path, "utf8");
  const cat = readCatalogue(path);
  if (!cat[section]) throw new Error(`section ${section} not found`);
  entry.slug = uniqueSlug(cat, section, entry.slug || slugify(entry.title));
  src = ensureTrack(src, section);
  const { open, close } = findList(src, section);
  const body = src.slice(open + 1, close);
  const lastBrace = body.lastIndexOf("}");
  const indentMatch = body.slice(0, lastBrace).match(/\n( *)\{\s*\n[^]*$/);
  const indent = indentMatch ? indentMatch[1] : "     ";
  const before = src.slice(0, open + 1) + body.slice(0, lastBrace + 1);
  // Nach dem letzten Eintrag: Komma (falls fehlt), neuer Eintrag, dann der alte Rest bis "]".
  const restAfterLast = src.slice(open + 1 + lastBrace + 1, close);   // z. B. "\n    " oder ",\n    "
  const tail = restAfterLast.replace(/^\s*,/, "");                      // hängendes Komma weg, Whitespace behalten
  const out = before + ",\n" + render(entry, indent) + tail + src.slice(close);
  readCatalogueSource(out);                                              // muss weiterhin auswertbar sein
  const b = backup(path);
  writeFileSync(path, out);
  return { slug: entry.slug, backup: b };
}
function readCatalogueSource(src) {
  const sandbox = { window: {} };
  vm.runInNewContext(src, sandbox, { timeout: 1000 });
  if (!sandbox.window.__catalogue) throw new Error("catalogue no longer evaluates");
  return sandbox.window.__catalogue;
}

export function removeEntry(section, slug, path = CATALOGUE) {
  const src = readFileSync(path, "utf8");
  const { open, close } = findList(src, section);
  const body = src.slice(open + 1, close);
  const at = body.indexOf(`"slug":${JSON.stringify(slug)}`);
  if (at < 0) return { removed: false };
  // Objektgrenzen um den Slug: rückwärts zur öffnenden Klammer auf Einrücktiefe, vorwärts zur passenden schliessenden.
  let start = body.lastIndexOf("\n", at); while (start > 0 && !/^\s*\{\s*$/.test(body.slice(start + 1, body.indexOf("\n", start + 1)))) start = body.lastIndexOf("\n", start - 1);
  let depth = 0, i = body.indexOf("{", start), inStr = null;
  for (; i < body.length; i++) { const ch = body[i]; if (inStr) { if (ch === "\\") { i++; continue; } if (ch === inStr) inStr = null; continue; } if (ch === '"') { inStr = ch; continue; } if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth === 0) break; } }
  let end = i + 1; if (body.slice(end).match(/^\s*,/)) end += body.slice(end).match(/^\s*,/)[0].length;
  let newBody = body.slice(0, start) + body.slice(end);
  newBody = newBody.replace(/,(\s*)$/, "$1");                          // letztes Komma vor "]" weg
  const out = src.slice(0, open + 1) + newBody + src.slice(close);
  readCatalogueSource(out);
  const b = backup(path);
  writeFileSync(path, out);
  return { removed: true, backup: b };
}

// Aus einem Beitrag den Eintrag bauen. Kein Wort wird erfunden: Texte kommen
// aus der Einreichung, der Rest ist Kennzeichnung.
export function entryFor(c, actor) {
  const by = (actor && actor.name) || "";
  const summary = String(c.summary || "");
  const lede = summary.split(/(?<=[.!?])\s+/)[0].slice(0, 200);
  const files = (() => { try { return JSON.parse(c.files_json || "[]"); } catch { return []; } })();
  const entry = {
    slug: slugify(c.title), track: TRACK.id, state: "draft", draft: true, by,
    title: String(c.title), who: `${c.area} · contributed`, lede,
    meta: "contributed · draft, under review for publication",
    about: summary,
    facts: [["Area", c.area], ["Contributed by", by], ["Status", "admitted; text as submitted, not yet edited"],
            ["Record trail", c.trail_ok === 1 ? "verified on the server" : "not verified"]],
  };
  if (files.length) entry.downloads = [{ lang: "Files", files: files.map(f => [f.label, f.url]) }];
  return entry;
}
