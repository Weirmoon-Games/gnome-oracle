// =============================================================================
// app/api/models/route.ts — list installed Ollama models (for the picker)
// =============================================================================
// Proxies Ollama's GET /api/tags. Returns { models: string[] }. If Ollama is
// unreachable, returns the configured default so the picker still works.
// =============================================================================

import { NextResponse } from "next/server";
import { listModels, OLLAMA_MODEL } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ models: await listModels(), default: OLLAMA_MODEL });
  } catch {
    return NextResponse.json({ models: [OLLAMA_MODEL], default: OLLAMA_MODEL, offline: true });
  }
}
