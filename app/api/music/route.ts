import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lists the background-music tracks dropped into public/music so the client can
// rotate through whatever is present (add/remove files without code changes).
const MUSIC_DIR = path.join(process.cwd(), "public", "music");
const AUDIO_RE = /\.(mp3|ogg|wav|m4a|aac|flac)$/i;

export async function GET() {
  let tracks: string[] = [];
  try {
    tracks = fs
      .readdirSync(MUSIC_DIR)
      .filter((f) => AUDIO_RE.test(f))
      .sort()
      .map((f) => `/music/${encodeURIComponent(f)}`);
  } catch {
    tracks = [];
  }
  return NextResponse.json(tracks);
}
