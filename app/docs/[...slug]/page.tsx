// =============================================================================
// app/docs/[...slug]/page.tsx — render one documentation file
// =============================================================================
// Server component that reads the requested Markdown (path-sanitized in
// lib/docs) and renders it with the lean lib/markdown renderer. 404s cleanly.
// =============================================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { readDoc } from "@/lib/docs";
import { renderMarkdown } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const joined = (slug ?? []).join("/");
  const md = readDoc(joined);
  if (md == null) notFound();
  const html = renderMarkdown(md);

  return (
    <main className="wrap">
      <div className="topbar">
        <h1 className="title">
          Docs <span className="spark">📚</span>
        </h1>
        <nav className="nav">
          <Link className="navlink" href="/docs">
            ← All docs
          </Link>
          <Link className="navlink" href="/">
            Oracle
          </Link>
        </nav>
      </div>
      <article className="panel doc" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
