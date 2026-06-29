// =============================================================================
// lib/music.ts — background-music file locations + helpers
// =============================================================================
// Music comes from two places (plan §3):
//   • Built-in tracks baked into the build at `public/music/`, served statically
//     at `/music/<file>`.
//   • Admin-uploaded tracks written at runtime to `data/music/` (writable even
//     in the standalone build — `public/` is NOT), served via the streaming
//     route `/api/music/file/<file>`.
// The client receives a single merged `string[]` of URLs and rotates through it.
// =============================================================================

import path from "node:path";
import { DATA_DIR } from "./dbConfig";

/** Built-in tracks (read-only, in the build output). */
export const PUBLIC_MUSIC_DIR = path.join(process.cwd(), "public", "music");
/** Runtime upload directory (writable). */
export const UPLOAD_MUSIC_DIR = path.join(DATA_DIR, "music");

/** Allowed audio extensions (shared with the original GET behavior). */
export const AUDIO_RE = /\.(mp3|ogg|wav|m4a|aac|flac)$/i;

/** Max upload size (bytes) — keep self-hosted boxes from filling their disk. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

const CONTENT_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
};

/** Best-effort content type for an audio filename. */
export function contentTypeFor(filename: string): string {
  return CONTENT_TYPES[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Sanitize an uploaded filename to a safe basename: strip any directory parts,
 * keep only word chars / dot / dash / space, collapse whitespace. Returns "" if
 * nothing usable remains (caller should reject).
 */
export function sanitizeFilename(raw: string): string {
  const base = path.basename(raw).replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "_");
  // Disallow leading dots (hidden files) and empty/extension-less names.
  if (!base || base.startsWith(".") || !AUDIO_RE.test(base)) return "";
  return base.slice(0, 120);
}

/**
 * Resolve a requested upload filename to an absolute path INSIDE the upload dir,
 * or null if it escapes the directory (path-traversal guard).
 */
export function resolveUploadPath(filename: string): string | null {
  const safe = path.basename(filename);
  const full = path.join(UPLOAD_MUSIC_DIR, safe);
  const rel = path.relative(UPLOAD_MUSIC_DIR, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return full;
}
