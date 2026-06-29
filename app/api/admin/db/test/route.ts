// =============================================================================
// app/api/admin/db/test/route.ts — validate a Postgres connection (admin only)
// =============================================================================
// POST { url } → connects and runs `select 1`. Never logs or echoes the URL.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { looksLikePostgresUrl } from "@/lib/dbConfig";
import { testPostgres } from "@/lib/dbSwitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { url?: unknown };
  if (!looksLikePostgresUrl(body.url)) {
    return NextResponse.json({ error: "Enter a valid postgres:// URL" }, { status: 400 });
  }
  try {
    await testPostgres(body.url);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
