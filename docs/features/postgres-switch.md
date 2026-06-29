# Feature: Postgres switch (admin)

Lets an admin migrate from the default SQLite to a PostgreSQL backend from
Settings, copying existing data over (plan §1).

## Flow (apply → migrate → copy → restart)

1. **Test** (`POST /api/admin/db/test`) — connect to the target URL and run
   `select 1`. The URL is never logged.
2. **Switch** (`POST /api/admin/db/switch`, `lib/dbSwitch.ts`):
   - Build a throwaway connection to the target and run migrations on it.
   - **Copy all rows** in FK-safe order: `users → sessions → characters →
     history → tracks → settings` (batched).
   - **Reset Postgres sequences** with `setval(pg_get_serial_sequence(...))` so
     future inserts don't collide with copied ids.
   - Write `data/db-config.json` only after a fully successful copy.
   - `closeDb()` drops the cached connection so the next request reconnects on
     Postgres (works even without a process restart). If `SERVICE_AUTORESTART=1`,
     the process also exits ~1.5 s later so a supervisor (WinSW / systemd)
     relaunches cleanly.
3. **Revert** (`{ revert: true }`) — rewrite the config back to SQLite. The
   SQLite file is never touched by the switch, so it remains a complete backup.

## UI

Settings → **Database backend (admin)** shows the current driver, a Postgres URL
field, **Test** / **Switch to Postgres** (with a confirm dialog warning about the
copy + brief "blink"), and **Revert to SQLite** when on Postgres.

## Safety

- Admin-only endpoints.
- The connection string is never logged; errors are generic.
- The copy is one-way (SQLite → Postgres) and leaves SQLite intact.

## Verify

- Point at a local Postgres (e.g. Docker). **Test** passes; **Switch** migrates
  schema + copies data; the app reconnects on Postgres with all prior
  history/personas/users present; **Revert** returns to SQLite.

> Note: this environment has no Postgres, so the switch was verified by
> type-check + build only; exercise it against a real Postgres before relying on
> it in production.
