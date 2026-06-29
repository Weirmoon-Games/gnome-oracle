// =============================================================================
// app/api/docs/route.ts — list available documentation files
// =============================================================================
// GET → { docs: DocEntry[] } enumerating the Markdown under docs/. Open to all
// (documentation isn't sensitive); it's a review surface for the upgrade.
// =============================================================================

import { NextResponse } from "next/server";
import { listDocs } from "@/lib/docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ docs: listDocs() });
}
