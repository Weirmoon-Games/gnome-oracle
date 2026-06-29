// =============================================================================
// lib/markdown.ts — tiny, dependency-free Markdown → HTML renderer
// =============================================================================
// Just enough Markdown for the /docs review surface (headings, bold/italic,
// inline + fenced code, links, lists, tables, blockquotes, hr, paragraphs).
// We avoid pulling a heavy Markdown library to keep with the app's lean ethos.
// All raw text is HTML-escaped first, so rendered docs can't inject markup.
// =============================================================================

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Inline formatting: code, bold, italic, links. Operates on escaped text. */
function inline(text: string): string {
  let t = text;
  // inline code first (so its contents aren't further formatted)
  t = t.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    const safe = /^(https?:\/\/|\/|#)/.test(href) ? href : "#";
    return `<a href="${safe}">${label}</a>`;
  });
  return t;
}

/** Render a Markdown string to an HTML string. */
export function renderMarkdown(md: string): string {
  const lines = esc(md).split(/\r?\n/);
  const html: string[] = [];
  let i = 0;
  let inCode = false;
  let codeBuf: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let tableBuf: string[] = [];

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };
  const flushTable = () => {
    if (tableBuf.length === 0) return;
    const rows = tableBuf.map((r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    const body = rows.filter((_, idx) => idx !== 1); // drop the |---| separator row
    html.push("<table>");
    body.forEach((cells, idx) => {
      const tag = idx === 0 ? "th" : "td";
      html.push("<tr>" + cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join("") + "</tr>");
    });
    html.push("</table>");
    tableBuf = [];
  };

  for (; i < lines.length; i++) {
    const line = lines[i];

    // fenced code
    if (/^```/.test(line)) {
      if (inCode) {
        html.push(`<pre><code>${codeBuf.join("\n")}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        flushTable();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // table rows
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      tableBuf.push(line);
      continue;
    } else if (tableBuf.length) {
      flushTable();
    }

    // blank line
    if (/^\s*$/.test(line)) {
      closeList();
      continue;
    }
    // hr
    if (/^---+$/.test(line)) {
      closeList();
      html.push("<hr/>");
      continue;
    }
    // headings
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const level = h[1].length;
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    // blockquote
    const bq = /^>\s?(.*)$/.exec(line);
    if (bq) {
      closeList();
      html.push(`<blockquote>${inline(bq[1])}</blockquote>`);
      continue;
    }
    // unordered list
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    // ordered list
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }
    // paragraph
    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }

  if (inCode) html.push(`<pre><code>${codeBuf.join("\n")}</code></pre>`);
  closeList();
  flushTable();
  return html.join("\n");
}
