// =============================================================================
// app/api/history/route.ts — list the signed-in user's history
// =============================================================================
// Requires sign-in (401 otherwise). Returns only the caller's own rows,
// optionally filtered to favorites.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listHistory } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const favoritesOnly = sp.get("favorites") === "1";
  const limitParam = Number(sp.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 100;
  return NextResponse.json(await listHistory(user.id, { favoritesOnly, limit }));
}
