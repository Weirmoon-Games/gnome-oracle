// =============================================================================
// lib/dbSwitch.ts — one-way data copy for the SQLite → Postgres switch
// =============================================================================
// Implements the heavy lifting behind the admin "Switch to Postgres" flow
// (plan §1). The current (source) database is read through the live repository
// connection; the target Postgres database is provisioned + populated through a
// throwaway connection, then `data/db-config.json` is rewritten so the next
// process boot connects to Postgres. The source SQLite file is never modified,
// so it remains a complete backup.
//
// SECURITY: the connection string is never logged. Errors are reported with
// generic messages.
// =============================================================================

import { sql } from "kysely";
import { getDb, buildKyselyMigrated } from "./db";
import { writeDbConfig, type DbConfig } from "./dbConfig";

/** Tables copied in FK-safe order (referenced rows first). */
const COPY_ORDER = ["users", "sessions", "characters", "history", "tracks", "settings"] as const;

/** Tables whose integer `id` is a Postgres sequence that needs resetting. */
const SEQUENCE_TABLES = ["users", "characters", "history", "tracks"] as const;

export interface SwitchResult {
  copied: Record<string, number>;
}

/**
 * Validate a Postgres URL by connecting and running a trivial query. Returns
 * true on success; throws a generic Error otherwise (never echoes the URL).
 */
export async function testPostgres(url: string): Promise<true> {
  let db;
  try {
    db = await buildKyselyMigratedNoMigrate(url);
    await sql`select 1`.execute(db);
    return true;
  } catch {
    throw new Error("Could not connect to the Postgres database.");
  } finally {
    await db?.destroy();
  }
}

/** Lightweight connect-only Kysely (no migration) for the connectivity test. */
async function buildKyselyMigratedNoMigrate(url: string) {
  const pg = (await import("pg")).default;
  const { Kysely, PostgresDialect } = await import("kysely");
  return new Kysely<Record<string, unknown>>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 2 }) }),
  });
}

/**
 * Copy all data from the current database into a freshly-migrated Postgres
 * target, reset its id sequences, then persist the new bootstrap config.
 * Returns per-table row counts. After this resolves the caller should restart
 * the process so the app reconnects on Postgres.
 */
export async function switchToPostgres(url: string): Promise<SwitchResult> {
  const source = await getDb();
  const targetConfig: DbConfig = { driver: "postgres", url };
  const target = await buildKyselyMigrated(targetConfig);
  const copied: Record<string, number> = {};

  try {
    for (const table of COPY_ORDER) {
      // Read every row from the source table.
      const rows = (await source.selectFrom(table as never).selectAll().execute()) as Record<
        string,
        unknown
      >[];
      copied[table] = rows.length;
      if (rows.length === 0) continue;
      // Insert in batches to keep statements a sane size.
      const BATCH = 200;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        // eslint-disable-next-line no-await-in-loop
        await target.insertInto(table as never).values(batch as never).execute();
      }
    }

    // Reset Postgres sequences so future inserts don't collide with copied ids.
    for (const table of SEQUENCE_TABLES) {
      // eslint-disable-next-line no-await-in-loop
      await sql`
        SELECT setval(
          pg_get_serial_sequence(${table}, 'id'),
          COALESCE((SELECT MAX(id) FROM ${sql.id(table)}), 1),
          (SELECT COUNT(*) > 0 FROM ${sql.id(table)})
        )
      `.execute(target);
    }
  } finally {
    await target.destroy();
  }

  // Only persist the new config after a fully successful copy.
  writeDbConfig(targetConfig);
  return { copied };
}

/** Revert to the default SQLite backend (just rewrites the config). */
export function revertToSqlite(): void {
  writeDbConfig({ driver: "sqlite" });
}
