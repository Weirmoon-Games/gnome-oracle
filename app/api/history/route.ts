import { NextRequest, NextResponse } from "next/server";
import { listHistory } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const favoritesOnly = sp.get("favorites") === "1";
  const limitParam = Number(sp.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 100;
  return NextResponse.json(listHistory({ favoritesOnly, limit }));
}
