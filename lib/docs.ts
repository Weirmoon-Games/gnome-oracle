// =============================================================================
// lib/docs.ts — read the docs/ Markdown tree for the in-app /docs review surface
// =============================================================================
// The documentation lives as Markdown under `docs/` (committed to the repo).
// This module enumerates and reads those files for the /docs route and the
// /api/docs endpoints. All access is restricted to the docs tree and slugs are
// path-sanitized (no traversal, .md only).
// =============================================================================

import fs from "node:fs";
import path from "node:path";

/** Absolute path to the docs root. */
export const DOCS_DIR = path.join(process.cwd(), "docs");

export interface DocEntry {
  slug: string; // e.g. "pages/home" or "features/auth"
  title: string; // first H1 or prettified filename
  group: string; // top-level folder ("pages", "features") or "root"
}

/** Recursively list every `.md` file under docs/, as slugged entries. */
export function listDocs(): DocEntry[] {
  const out: DocEntry[] = [];
  walk(DOCS_DIR, "");
  function walk(dir: string, prefix: string) {
    let items: fs.Dirent[] = [];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.isDirectory()) {
        walk(path.join(dir, it.name), rel);
      } else if (it.name.endsWith(".md")) {
        const slug = rel.replace(/\.md$/, "");
        out.push({ slug, title: titleFor(path.join(dir, it.name), slug), group: groupFor(slug) });
      }
    }
  }
  return out;
}

function groupFor(slug: string): string {
  const top = slug.split("/")[0];
  return slug.includes("/") ? top : "root";
}

function titleFor(file: string, slug: string): string {
  try {
    const text = fs.readFileSync(file, "utf8");
    const h1 = /^#\s+(.+)$/m.exec(text);
    if (h1) return h1[1].trim();
  } catch {
    /* fall through */
  }
  const base = slug.split("/").pop() ?? slug;
  return base.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Read one doc by slug (no extension). Returns null if the slug escapes the
 * docs tree or the file is missing.
 */
export function readDoc(slug: string): string | null {
  const clean = slug.replace(/\.md$/, "");
  // Reject anything with traversal or absolute markers.
  if (!/^[\w/-]+$/.test(clean) || clean.includes("..")) return null;
  const full = path.join(DOCS_DIR, `${clean}.md`);
  const rel = path.relative(DOCS_DIR, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  try {
    return fs.readFileSync(full, "utf8");
  } catch {
    return null;
  }
}
