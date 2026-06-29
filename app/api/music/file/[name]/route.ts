// =============================================================================
// app/api/music/file/[name]/route.ts — stream / delete an uploaded track
// =============================================================================
// GET    → stream a file from data/music with content-type and HTTP Range
//          support (so the <audio> element can seek). Open to everyone (music
//          isn't sensitive); path-traversal is blocked by resolveUploadPath().
// DELETE → admin-only: remove the file from disk and its `tracks` row.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { deleteTrack } from "@/lib/db";
import { resolveUploadPath, contentTypeFor } from "@/lib/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const full = resolveUploadPath(decodeURIComponent(name));
  if (!full || !fs.existsSync(full)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stat = fs.statSync(full);
  const total = stat.size;
  const type = contentTypeFor(full);
  const range = req.headers.get("range");

  // Range request → 206 Partial Content (enables seeking in the player).
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? parseInt(m[2], 10) : total - 1;
      if (start <= end && end < total) {
        const chunk = fs.readFileSync(full).subarray(start, end + 1);
        return new Response(chunk, {
          status: 206,
          headers: {
            "Content-Type": type,
            "Content-Length": String(chunk.length),
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
          },
        });
      }
    }
  }

  return new Response(fs.readFileSync(full), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { name } = await params;
  const filename = decodeURIComponent(name);
  const full = resolveUploadPath(filename);
  if (!full) return NextResponse.json({ error: "Bad name" }, { status: 400 });
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    /* ignore unlink races */
  }
  await deleteTrack(path.basename(full));
  return NextResponse.json({ ok: true });
}
