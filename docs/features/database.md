# Feature: Database layer (Kysely — SQLite default, Postgres optional)

## What changed

The original data layer called `better-sqlite3` **synchronously** with
SQLite-specific SQL (`@named` params, `AUTOINCREMENT`, `datetime('now')`, the
`better-sqlite3` transaction API). That is now an **async repository built on the
Kysely query builder**, so one set of query code targets either SQLite (default)
or PostgreSQL — the dialect is chosen at connect time.

## Modules

| File | Responsibility |
|---|---|
| `lib/schema.ts` | The Kysely `Database` interface (all tables). Single source of truth for column types. |
| `lib/dbConfig.ts` | Reads/writes `data/db-config.json` — "which DB?" (can't live in the DB it selects). |
| `lib/migrations.ts` | Kysely `Migrator` migrations; dialect-aware id columns; idempotent against the legacy SQLite DB. |
| `lib/db.ts` | The repository: `getDb()`, seeding, and all async, per-user-scoped helpers. |
| `lib/seeds.ts` | The built-in persona catalog + wardrobe helpers (extracted from the old `db.ts`). |

## Tables

`characters`, `history`, `users`, `sessions`, `tracks`, `settings`. See
`lib/schema.ts` for the exact columns.

## Cross-dialect choices (and why)

- **Booleans as INTEGER 0/1** (`favorite`, `is_seed`) — avoids SQLite-int vs
  Postgres-bool coercion surprises.
- **Timestamps as ISO-8601 TEXT**, always written by the app (never a DB
  `now()` default) — identical format on both engines and trivially parseable in
  the browser via `new Date(iso)`.
- **`RETURNING id` on insert** — supported by both the better-sqlite3 dialect and
  Postgres.
- **`settings` keyed by `(owner, key)`** where `owner` is `"global"` or the
  stringified user id — sidesteps NULL-in-unique-key differences.
- **id column type** is chosen per dialect in the migration (`integer …
  autoincrement` for SQLite, `serial` for Postgres).

## Bootstrap config

`data/db-config.json` (gitignored) holds `{ "driver": "sqlite" | "postgres",
"url"?: "…" }`. Resolution order: on-disk file → `DATABASE_URL` env → default
SQLite at `data/gnome.db`. The connection string is never logged.

## Connection lifecycle

`getDb()` builds + caches one Kysely instance per process (on `global`, so it
survives Next.js hot reloads), runs `migrateToLatest()`, then upserts the seed
personas. `closeDb()` tears it down (used by the DB switch and by tests).

## Verify

- `npm run dev`; the app works end-to-end on SQLite through Kysely.
- A fresh `data/gnome.db` is created with all tables; seeds load.
- Existing `data/gnome.db` is migrated in place (new `user_id` columns added, no
  data loss).
- `npm run build` succeeds (catches Kysely/pg bundling issues).
