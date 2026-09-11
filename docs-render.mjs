// docs-render.mjs — Markdown-Hosts (docs.entrosana.app, atrium.entrosana.com): eine kleine Teilmenge Markdown, in eine
// Hülle gesetzt, mit Seitenleiste nach Gruppen (docs-site/pages.json), Brotkrume, «On this page», Vor/Zurück,
// Hinweiskästen und Suchindex. Bewusst ohne Abhängigkeit: die Seiten schreiben wir selbst.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => s.toLowerCase().replace(/`/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Das Inhaltsverzeichnis: Gruppen mit Seiten. Schlüssel = Pfad unter der Basis, Datei = <dir>/<key>.md.
export function manifest(root, dir = "docs-site") {
  const m = JSON.parse(readFileSync(join(root, dir, "pages.json"), "utf8"));
  const flat = [];
  for (const g of m.groups) for (const it of g.items) flat.push({ key: it.key, label: it.label, desc: it.desc || "", group: g.title });
  return { groups: m.groups, flat, has: (k) => flat.some((p) => p.key === k) };
}

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(`<code>${esc(c)}</code>`); return `@@c${codes.length - 1}@@`; });
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<i>$2</i>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => `<a href="${u}"${/^https?:\/\//.test(u) && !/^https?:\/\/(docs\.|atrium\.)?entrosana\.(app|com)\//.test(u) ? ' rel="noopener"' : ""}>${t}</a>`);
  return s.replace(/@@c(\d+)@@/g, (m, i) => codes[Number(i)]);
}

export function render(md) {
  const lines = String(md).replace(/\r\n?/g, "\n").split("\n");
  const out = [], toc = []; let title = "", lede = "", para = [], i = 0, plain = [];
  const flush = () => {
    if (!para.length) return;
    const text = para.join(" "); para = []; plain.push(text);
    if (title && !lede) { lede = text; return; }
    out.push(`<p>${inline(text)}</p>`);
  };
  const LI = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) { flush(); const lang = line.slice(3).trim(); const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push(`<div class="code"><pre${lang ? ` data-lang="${esc(lang)}"` : ""}><code>${esc(buf.join("\n"))}</code></pre><button class="code__copy" type="button" aria-label="Copy">Copy</button></div>`); continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { flush(); const level = h[1].length, text = h[2].trim(); if (level === 1 && !title) title = text; else { const id = slug(text); if (level === 2) toc.push({ id, text }); plain.push(text); out.push(`<h${level} id="${id}"><a class="anchor" href="#${id}">${inline(text)}</a></h${level}>`); } i++; continue; }
    if (/^\s*$/.test(line)) { flush(); i++; continue; }
    if (/^---+\s*$/.test(line)) { flush(); out.push("<hr>"); i++; continue; }
    if (/^>\s?/.test(line)) {
      flush(); const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      const text = buf.join(" "); const k = /^\*\*(Note|Tip|Warning|Owner):\*\*\s*/.exec(text);
      plain.push(text);
      if (k) out.push(`<aside class="callout callout--${k[1].toLowerCase()}"><span class="callout__k">${k[1]}</span><p>${inline(text.slice(k[0].length))}</p></aside>`);
      else out.push(`<blockquote><p>${inline(text)}</p></blockquote>`);
      continue;
    }
    if (/^\|/.test(line)) {
      flush(); const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
      const head = cells(rows[0]), body = rows.slice(1).filter((r) => !/^\|\s*:?-{2,}/.test(r));
      body.forEach((r) => plain.push(cells(r).join(" ")));
      out.push(`<div class="doc__scroll"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const li = LI.exec(line);
    if (li && !li[1]) {
      flush(); const ordered = /\d/.test(li[2]), items = [];
      while (i < lines.length) {
        const m = LI.exec(lines[i]);
        if (m && !m[1]) { items.push({ t: m[3], sub: [] }); i++; continue; }
        if (items.length && m && m[1]) { items[items.length - 1].sub.push(m[3]); i++; continue; }
        if (items.length && /^\s{2,}\S/.test(lines[i])) { items[items.length - 1].t += " " + lines[i].trim(); i++; continue; }
        break;
      }
      items.forEach((it) => plain.push(it.t + " " + it.sub.join(" ")));
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it.t)}${it.sub.length ? `<ul>${it.sub.map((s) => `<li>${inline(s)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</${tag}>`);
      continue;
    }
    para.push(line.trim()); i++;
  }
  flush();
  return { title, lede, toc, html: out.join("\n"), text: plain.join(" ").replace(/[`*\[\]]/g, "").slice(0, 4000) };
}

// Eine Seite: Hülle mit {{title}} {{desc}} {{lede}} {{path}} {{crumb}} {{nav}} {{toc}} {{content}} {{prevnext}} {{updated}} {{group}}.
// opts: dir, base ("" oder "/docs"), extra (Rail-Einträge vor den Gruppen), host.
export function sitePage(root, key, shell, opts = {}) {
  const dir = opts.dir || "docs-site", base = opts.base || "";
  const man = manifest(root, dir);
  const page = man.flat.find((p) => p.key === key) || man.flat[0];
  const file = join(root, dir, page.key + ".md");
  const r = render(readFileSync(file, "utf8"));
  const hrefOf = (k) => (k === "index" ? (base || "/") : base + "/" + k);
  const navMan = opts.navDir ? manifest(root, opts.navDir) : man;   // navDir: Rail aus einem anderen Verzeichnis (Landung des Atriums zeigt die Docs)
  const nav = (opts.extra || []).map((x) => `    <a class="rail__item${x.active ? " is-active" : ""}" href="${x.href}"${x.active ? ' aria-current="page"' : ""}>${x.glyph || ""} ${esc(x.label)}</a>`)
    .concat(navMan.groups.map((g) => {
      const cur = opts.navDir ? null : page.key;
      const open = g.items.some((it) => it.key === cur) || g.items.length <= 1;
      const items = g.items.map((it) => `      <a class="rail__item rail__item--plain${it.key === cur ? " is-active" : ""}" href="${hrefOf(it.key)}"${it.key === cur ? ' aria-current="page"' : ""}>${esc(it.label)}</a>`).join("\n");
      if (g.items.length === 1 && g.items[0].key === "index") return items;
      return `    <details class="rail__sec"${open ? " open" : ""}><summary class="rail__group rail__sum">${esc(g.title)}</summary>\n${items}\n    </details>`;
    })).join("\n");
  const toc = r.toc.length ? `<nav class="doc__toc" aria-label="On this page"><span class="eyebrow">On this page</span>${r.toc.map((t) => `<a href="#${t.id}">${esc(t.text)}</a>`).join("")}</nav>` : "";
  const desc = (page.desc || r.lede).replace(/`/g, "").replace(/\*\*?/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  const idx = man.flat.findIndex((p) => p.key === page.key), prev = idx > 0 ? man.flat[idx - 1] : null, next = idx < man.flat.length - 1 ? man.flat[idx + 1] : null;
  const prevnext = man.flat.length > 1 ? `<nav class="doc__pn" aria-label="Previous and next">${prev ? `<a class="doc__pn-a" href="${hrefOf(prev.key)}"><span class="fine">Previous</span><b>${esc(prev.label)}</b></a>` : "<span></span>"}${next ? `<a class="doc__pn-a doc__pn-a--next" href="${hrefOf(next.key)}"><span class="fine">Next</span><b>${esc(next.label)}</b></a>` : "<span></span>"}</nav>` : "";
  const updated = statSync(file).mtime.toISOString().slice(0, 10);
  const crumb = page.key === "index" ? esc(page.label) : `${esc(page.group)} <i>/</i> <b>${esc(page.label)}</b>`;
  return shell.replace(/\{\{title\}\}/g, esc(r.title || page.label)).replace(/\{\{desc\}\}/g, esc(desc)).replace("{{lede}}", inline(r.lede)).replace(/\{\{path\}\}/g, hrefOf(page.key))
              .replace("{{crumb}}", crumb).replace("{{group}}", esc(page.group)).replace("{{nav}}", nav).replace("{{toc}}", toc).replace("{{content}}", r.html)
              .replace("{{prevnext}}", prevnext).replace("{{updated}}", updated);
}

// Suchindex: je Seite Pfad, Titel, Gruppe, Überschriften, Text.
export function siteIndex(root, opts = {}) {
  const dir = opts.dir || "docs-site", base = opts.base || "";
  const man = manifest(root, dir);
  return man.flat.map((p) => { const r = render(readFileSync(join(root, dir, p.key + ".md"), "utf8")); return { path: p.key === "index" ? (base || "/") : base + "/" + p.key, title: r.title || p.label, group: p.group, heads: r.toc.map((t) => t.text), text: r.text.slice(0, 1200) }; });
}
export function siteStamp(root, dir = "docs-site") {
  const man = manifest(root, dir);
  return [join(root, dir, "pages.json")].concat(man.flat.map((p) => join(root, dir, p.key + ".md"))).map((f) => { try { return statSync(f).mtimeMs; } catch { return 0; } }).join(":");
}
