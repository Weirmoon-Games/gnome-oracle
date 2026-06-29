// =============================================================================
// app/api/admin/users/route.ts — admin user management
// =============================================================================
// GET  → list all users (admin only).
// POST → create a user with a chosen role (admin only).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, listUsers, createUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return NextResponse.json({ users: await listUsers() });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
    role?: string;
  };
  const role = body.role === "admin" ? "admin" : "user";
  try {
    const created = await createUser(String(body.username ?? ""), String(body.password ?? ""), role);
    return NextResponse.json({ ok: true, user: created }, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message === "username taken" ? "Username taken" : "Invalid username/password";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
