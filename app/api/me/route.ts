// =============================================================================
// app/api/me/route.ts — who am I? (for client components)
// =============================================================================
// Returns { user: { id, username, role } | null } plus the signup flag, so the
// client can render Login/Logout, gate History/Lab links, and show admin UI.
// =============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser, ALLOW_SIGNUP } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user, allowSignup: ALLOW_SIGNUP });
}
