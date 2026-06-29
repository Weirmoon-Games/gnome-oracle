// =============================================================================
// app/api/music/route.ts — list (everyone) / upload (admin) background music
// =============================================================================
// GET  → merged list of track URLs: built-in files under public/music (served
//        at /music/<f>) + uploaded files under data/music (served at
//        /api/music/file/<f>). Returns the same `string[]` the client already
//        feeds to sound.setPlaylist().
// POST → admin-only multipart upload: validates extension + size, sanitizes the
//        filename, writes to data/music, and records a `tracks` row.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { addTrack } from "@/lib/db";
import {
  PUBLIC_MUSIC_DIR,
  UPLOAD_MUSIC_DIR,
  AUDIO_RE,
  MAX_UPLOAD_BYTES,
  sanitizeFilename,
} from "@/lib/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => AUDIO_RE.test(f)).sort();
  } catch {
    return [];
  }
}

export async function GET() {
  const builtIn = listDir(PUBLIC_MUSIC_DIR).map((f) => `/music/${encodeURIComponent(f)}`);
  const uploaded = listDir(UPLOAD_MUSIC_DIR).map(
    (f) => `/api/music/file/${encodeURIComponent(f)}`
  );
  return NextResponse.json([...builtIn, ...uploaded]);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large (max 25 MB)" }, { status: 413 });
  }

  const filename = sanitizeFilename(file.name);
  if (!filename) {
    return NextResponse.json({ error: "Unsupported or unsafe filename" }, { status: 400 });
  }

  fs.mkdirSync(UPLOAD_MUSIC_DIR, { recursive: true });
  const dest = path.join(UPLOAD_MUSIC_DIR, filename);
  if (fs.existsSync(dest)) {
    return NextResponse.json({ error: "A track with that name already exists" }, { status: 409 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(dest, bytes);

  const title = (form.get("title")?.toString() || filename.replace(AUDIO_RE, "")).slice(0, 120);
  await addTrack({ filename, title, uploadedBy: user.id });

  return NextResponse.json({ ok: true, filename, title }, { status: 201 });
}
