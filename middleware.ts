// =============================================================================
// middleware.ts — coarse auth gate for protected pages
// =============================================================================
// Per current Next.js guidance, middleware does only a CHEAP presence check:
// if there's no session cookie, redirect History and the Lab to /login. The
// REAL authorization (token validity, ownership, admin role) lives in the route
// handlers and Server Actions — middleware never touches the database.
//
// Asking the Oracle (/), Settings, and Docs stay open to everyone.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

// Inlined (NOT imported from lib/auth): middleware runs on the Edge runtime and
// must not pull in the Node-only auth/db module graph. Keep in sync with
// SESSION_COOKIE in lib/auth.ts.
const SESSION_COOKIE = "gnome_session";

export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Only run on the gated routes (keeps middleware off the open pages + assets).
export const config = {
  matcher: ["/history/:path*", "/lab/:path*"],
};
