# Feature: Tune uploads (admin-only)

## Why a runtime directory

`public/music/` is baked into the standalone build and isn't writable at
runtime, so uploads go to **`data/music/`** (writable next to the app). Built-in
tracks stay in `public/music/` and are served statically at `/music/<file>`.

## Storage

- Files: `data/music/<sanitized-name>`.
- Catalog: the `tracks` table (`filename`, `title`, `uploaded_by`, `created_at`).

## Routes (`lib/music.ts` + routes)

- `GET /api/music` — merged `string[]` of built-in URLs (`/music/<f>`) and
  uploaded URLs (`/api/music/file/<f>`). Same shape the client already feeds to
  `sound.setPlaylist()`.
- `POST /api/music` — **admin only**. `await req.formData()`, validate against
  `AUDIO_RE`, enforce the 25 MB cap, sanitize the filename, write to
  `data/music/`, insert a `tracks` row. No upload library.
- `GET /api/music/file/[name]` — stream an uploaded file with content-type and
  **HTTP Range** support (seeking). Path-traversal is blocked by
  `resolveUploadPath()`.
- `DELETE /api/music/file/[name]` — **admin only**: remove file + `tracks` row.

## Safety

- `sanitizeFilename()` strips directory parts and unsafe characters, rejects
  hidden/extension-less names.
- `resolveUploadPath()` guarantees the resolved path stays inside `data/music/`.

## UI

Settings → **Manage tunes (admin)**: drag/drop-ish file input, list with inline
`<audio>` preview, and delete for uploaded files. Non-admins never see it, and
the routes return 403 regardless.

## Verify

- Admin uploads an `.mp3` → it appears in `GET /api/music` and rotates in
  playback; preview + delete work; the file lands in `data/music/`, not
  `public/`. A non-admin upload returns 403.
