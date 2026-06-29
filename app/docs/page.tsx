// =============================================================================
// app/docs/page.tsx — in-app documentation index (review surface)
// =============================================================================
// Server component that lists every Markdown doc under docs/, grouped by folder
// (Pages / Features / root), each linking to its rendered view. Reachable from
// the "📚 Docs" nav link. Open to everyone.
// =============================================================================

import Link from "next/link";
import { listDocs } from "@/lib/docs";

export const dynamic = "force-dynamic";

const GROUP_LABEL: Record<string, string> = {
  pages: "📄 Pages",
  features: "🧩 Features",
  root: "📚 Overview",
};

export default function DocsIndex() {
  const docs = listDocs();
  const groups = new Map<string, typeof docs>();
  for (const d of docs) {
    const arr = groups.get(d.group) ?? [];
    arr.push(d);
    groups.set(d.group, arr);
  }
  const order = ["root", "features", "pages"];
  const sortedGroups = [...groups.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));

  return (
    <main className="wrap">
      <div className="topbar">
        <h1 className="title">
          Documentation <span className="spark">📚</span>
        </h1>
        <Link className="navlink" href="/">
          ← Back to the Oracle
        </Link>
      </div>
      <p className="tagline">
        Living documentation for the Gnome Oracle upgrade — one file per feature and per page.
      </p>

      {docs.length === 0 && <p className="persona-desc">No docs found.</p>}

      {sortedGroups.map((g) => (
        <section key={g}>
          <h2 className="section-title">{GROUP_LABEL[g] ?? g}</h2>
          <ul className="list">
            {(groups.get(g) ?? []).map((d) => (
              <li key={d.slug}>
                <span className="emoji">📃</span>
                <span className="meta">
                  <b>
                    <Link className="navlink" href={`/docs/${d.slug}`}>
                      {d.title}
                    </Link>
                  </b>
                  <small>{d.slug}.md</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
