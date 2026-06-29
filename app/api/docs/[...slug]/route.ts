// =============================================================================
// app/api/docs/[...slug]/route.ts — return one doc's raw Markdown
// =============================================================================
// GET /api/docs/pages/home → { slug, markdown } (404 if missing or out of tree).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { readDoc } from "@/lib/docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const joined = (slug ?? []).join("/");
  const markdown = readDoc(joined);
  if (markdown == null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ slug: joined, markdown });
}
