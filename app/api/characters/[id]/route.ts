// =============================================================================
// app/api/characters/[id]/route.ts — delete a persona
// =============================================================================
// Requires sign-in. Users may delete only their OWN personas; seeds are
// protected (403) and other users' personas appear as "not found" (404) so
// ownership isn't leaked.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteCharacter } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const result = await deleteCharacter(numId, user.id);
  switch (result) {
    case "deleted":
      return NextResponse.json({ ok: true });
    case "not_found":
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    case "protected":
      return NextResponse.json({ error: "Built-in personas cannot be deleted" }, { status: 403 });
  }
}
