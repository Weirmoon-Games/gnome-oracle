import { NextRequest, NextResponse } from "next/server";
import { listCharacters, createCharacter } from "@/lib/db";
import { normalizeMeta } from "@/lib/persona";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listCharacters());
}

export async function POST(req: NextRequest) {
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
    return NextResponse.json(
      { error: "name and system_prompt are required" },
      { status: 400 }
    );
  }

  const temperature =
    typeof body.temperature === "number" ? clampTemp(body.temperature) : 0.9;

  const created = createCharacter({
    name,
    emoji: (body.emoji ?? "✨").toString().slice(0, 8),
    description: (body.description ?? "").toString(),
    system_prompt,
    temperature,
    // Normalize any provided meta (filling gaps from a name-derived fallback).
    meta: body.meta ? normalizeMeta(body.meta, name, temperature) : undefined,
  });
  return NextResponse.json(created, { status: 201 });
}

function clampTemp(t: number): number {
  if (!Number.isFinite(t)) return 0.9;
  return Math.min(1.4, Math.max(0.1, t));
}
