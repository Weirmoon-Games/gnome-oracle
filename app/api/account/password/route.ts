// =============================================================================
// app/api/account/password/route.ts — change own password
// =============================================================================
// POST { current, next } → verify the current password, then set the new one.
// Requires sign-in.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifyCredentials, changePassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { current?: string; next?: string };
  const ok = await verifyCredentials(user.username, String(body.current ?? ""));
  if (!ok) return NextResponse.json({ error: "Current password is wrong" }, { status: 400 });
  try {
    await changePassword(user.id, String(body.next ?? ""));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "New password must be 6+ characters" }, { status: 400 });
  }
}
