# Gnome Oracle — Documentation

Living documentation for the Gnome Oracle upgrade (pluggable database, accounts,
tune uploads, neural voice, settings, and new personas). These files are also
served inside the running app at **`/docs`** for easy review.

## How the docs are organized

- **Features** (`docs/features/`) — one file per workstream: the design
  decisions, schema, routes, env vars, and how to verify it.
- **Pages** (`docs/pages/`) — one file per user-facing route: what it's for,
  the controls on it, which APIs it calls, and its auth requirements.

## Feature index

- [Database layer (Kysely, SQLite/Postgres)](features/database.md)
- [Authentication & accounts](features/auth.md)
- [Per-user data scoping](features/per-user-data.md)
- [Tune uploads](features/tune-uploads.md)
- [Settings](features/settings.md)
- [Postgres switch flow](features/postgres-switch.md)
- [Voice — Kokoro neural TTS](features/voice-kokoro.md)
- [Personas, SFX & outfits](features/personas.md)

## Page index

- [Home — the Oracle](pages/home.md)
- [History](pages/history.md)
- [Lab](pages/lab.md)
- [Login](pages/login.md)
- [Signup](pages/signup.md)
- [Settings](pages/settings.md)
- [Docs](pages/docs.md)

## Architecture at a glance

```
Browser (React, "use client")
  app/page.tsx ── ask ──▶ /api/ask ──▶ lib/ollama.ts ──▶ Ollama (local LLM)
       │                      │
       │ tts (lib/tts.ts) ────┴── lib/kokoroTts.ts (neural voice, in-browser)
       │ sound (lib/sound.ts)
       ▼
  /api/* route handlers ──▶ lib/auth.ts ──▶ lib/db.ts (Kysely repository)
                                              │
                                  SqliteDialect │ PostgresDialect
                                  (data/gnome.db)│ (DATABASE_URL)
                                              ▲
                              lib/dbConfig.ts (data/db-config.json)
```

See the repository root [`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) for the full plan
and verification checklist.
