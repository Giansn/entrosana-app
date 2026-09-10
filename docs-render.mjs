// docs-render.mjs — docs.entrosana.app: eine kleine Markdown-Teilmenge, in die Hülle docs-site/shell.html gesetzt.
// Bewusst ohne Abhängigkeit: die Seiten schreiben wir selbst (Überschriften, Absätze, Listen mit einer
// Unterebene, Zäune, Tabellen, Zitate, fett, kursiv, Code, Verweise). serve.mjs ruft docsPage() je Anfrage
// und hält das Ergebnis, bis Quelle oder Hülle sich ändern.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PAGES = [
  ["getting-started", "Getting started"],
  ["accounts", "Accounts"],
  ["contribute", "Contribute"],
  ["services", "Services"],
  ["api", "API"],
  ["privacy", "Privacy"],
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => s.toLowerCase().replace(/`/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(`<code>${esc(c)}</code>`); return `@@c${codes.length - 1}@@`; });
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<i>$2</i>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => `<a href="${u}"${/^https?:\/\//.test(u) && !/^https?:\/\/(docs\.)?entrosana\.(app|com)\//.test(u) ? ' rel="noopener"' : ""}>${t}</a>`);
  return s.replace(/@@c(\d+)@@/g, (m, i) => codes[Number(i)]);
}

export function render(md) {
  const lines = String(md).replace(/\r\n?/g, "\n").split("\n");
  const out = [], toc = [];
  let title = "", lede = "", para = [], i = 0;
  const flush = () => {
    if (!para.length) return;
    const text = para.join(" "); para = [];
    if (title && !lede) { lede = text; return; }   // der erste Absatz nach dem Titel wird die Unterzeile
    out.push(`<p>${inline(text)}</p>`);
  };
  const LI = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) { flush(); const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`); continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { flush(); const level = h[1].length, text = h[2].trim(); if (level === 1 && !title) title = text; else { const id = slug(text); if (level === 2) toc.push({ id, text }); out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`); } i++; continue; }
    if (/^\s*$/.test(line)) { flush(); i++; continue; }
    if (/^---+\s*$/.test(line)) { flush(); out.push("<hr>"); i++; continue; }
    if (/^>\s?/.test(line)) { flush(); const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, "")); out.push(`<blockquote><p>${inline(buf.join(" "))}</p></blockquote>`); continue; }
    if (/^\|/.test(line)) {
      flush(); const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
      const head = cells(rows[0]), body = rows.slice(1).filter((r) => !/^\|\s*:?-{2,}/.test(r));
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
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it.t)}${it.sub.length ? `<ul>${it.sub.map((s) => `<li>${inline(s)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</${tag}>`);
      continue;
    }
    para.push(line.trim()); i++;
  }
  flush();
  return { title, lede, toc, html: out.join("\n") };
}

// Ein Rail-Eintrag wie in den App-Seiten: Glyphe aus docs-site/glyphs.json, dann der Name als Text.
export function docsPage(root, key, shell, glyphs) {
  const page = PAGES.find(([k]) => k === key) || PAGES[0];
  const r = render(readFileSync(join(root, "docs-site", page[0] + ".md"), "utf8"));
  const nav = PAGES.map(([k, label]) => `    <a class="rail__item${k === page[0] ? " is-active" : ""}" href="/${k === "getting-started" ? "" : k}"${k === page[0] ? ' aria-current="page"' : ""}>${glyphs[k] || ""} ${esc(label)}</a>`).join("\n");
  const toc = r.toc.length ? `        <nav class="doc__toc" aria-label="On this page"><span class="eyebrow">On this page</span>${r.toc.map((t) => `<a href="#${t.id}">${esc(t.text)}</a>`).join("")}</nav>` : "";
  const desc = r.lede.replace(/`/g, "").replace(/\*\*?/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");   // für <meta>: ohne Auszeichnung
  return shell.replace(/\{\{title\}\}/g, esc(r.title || page[1])).replace(/\{\{desc\}\}/g, esc(desc)).replace("{{lede}}", inline(r.lede)).replace(/\{\{path\}\}/g, page[0] === "getting-started" ? "/" : "/" + page[0])
              .replace("{{crumb}}", esc(page[1])).replace("{{nav}}", nav).replace("{{toc}}", toc).replace("{{content}}", r.html);
}
