// =============================================================================
// app/api/characters/route.ts — list / create personas
// =============================================================================
// GET  → personas visible to the caller (seeds for everyone; private personas
//        only for their owner). Anonymous callers get the seeds.
// POST → create a private persona; requires sign-in (401 otherwise) and stamps
//        the new row with the owner's id.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listCharacters, createCharacter } from "@/lib/db";
import { normalizeMeta } from "@/lib/persona";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(await listCharacters(user?.id ?? null));
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let body: {
    name?: string;
    emoji?: string;
    description?: string;
    system_prompt?: string;
    temperature?: number;
    meta?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").toString().trim();
  const system_prompt = (body.system_prompt ?? "").toString().trim();
  if (!name || !system_prompt) {
    return NextResponse.json({ error: "name and system_prompt are required" }, { status: 400 });
  }

  const temperature = typeof body.temperature === "number" ? clampTemp(body.temperature) : 0.9;

  const created = await createCharacter(
    {
      name,
      emoji: (body.emoji ?? "✨").toString().slice(0, 8),
      description: (body.description ?? "").toString(),
      system_prompt,
      temperature,
      meta: body.meta ? normalizeMeta(body.meta, name, temperature) : undefined,
    },
    user.id
  );
  return NextResponse.json(created, { status: 201 });
}

function clampTemp(t: number): number {
  if (!Number.isFinite(t)) return 0.9;
  return Math.min(1.4, Math.max(0.1, t));
}
