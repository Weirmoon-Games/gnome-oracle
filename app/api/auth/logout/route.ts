// =============================================================================
// app/api/auth/logout/route.ts — destroy the current session
// =============================================================================
// POST clears the session cookie and deletes the server-side session row, then
// redirects home. Used by the "Logout" button in the nav.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, destroySession, clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/", req.url));
}
