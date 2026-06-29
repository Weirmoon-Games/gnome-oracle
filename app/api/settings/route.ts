// =============================================================================
// app/api/settings/route.ts — per-user settings persistence
// =============================================================================
// GET  → the signed-in user's saved settings merged over the global defaults.
// PUT  → save a partial settings object for the signed-in user.
// Anonymous callers get `{}` and a 200 (the client falls back to localStorage),
// keeping the Oracle usable without an account (plan §5).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSettings, saveSettings } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ settings: {}, signedIn: false });
  const globals = await getSettings("global");
  const mine = await getSettings(String(user.id));
  return NextResponse.json({ settings: { ...globals, ...mine }, signedIn: true });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Only persist a known-safe, bounded set of keys.
  const allowed = [
    "voiceEngine",
    "voiceId",
    "voiceSpeed",
    "responseStyle",
    "mood",
    "model",
    "responseLength",
    "reduceMotion",
    "theme",
    "defaultPersonaId",
    "sfxThemeOverride",
    "volumes",
    "voiceOn",
    "musicOn",
  ];
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) clean[k] = body[k];
  await saveSettings(String(user.id), clean);
  return NextResponse.json({ ok: true });
}
