// =============================================================================
// lib/migrations.ts — Kysely migrations (dialect-aware)
// =============================================================================
//
// The repository (`lib/db.ts`) runs `migrateToLatest()` on startup. Migrations
// must work on BOTH backends and must be safe to run against the *existing*
// SQLite database, which already has `characters` and `history` tables created
// by the original hand-rolled `init()` (pre-Kysely). We therefore:
//   • create every table with `ifNotExists()`, and
//   • additively add the new `user_id` columns only when missing,
// so a fresh Postgres DB is fully provisioned while a legacy SQLite DB is simply
// extended in place (no data loss).
//
// The id column type differs per dialect (SQLite `integer … autoincrement` vs
// Postgres `serial`). `setMigrationDriver()` is called by `getDb()` before
// migrating so the migration can pick the correct type.
// =============================================================================

import { Kysely, Migration, MigrationProvider, sql, type CreateTableBuilder } from "kysely";
import type { DbDriver } from "./dbConfig";

let migrationDriver: DbDriver = "sqlite";

/** Tell the migrations which dialect they're running against. */
export function setMigrationDriver(driver: DbDriver): void {
  migrationDriver = driver;
}

/**
 * Add an auto-incrementing integer primary key named `id`, per dialect.
 * Generic over the table name so the typed builder flows through cleanly.
 * (Migrations are intentionally untyped over the schema; lib/schema.ts is the
 * typed surface for queries.)
 */
function addIdColumn<TB extends string>(builder: CreateTableBuilder<TB, never>) {
  if (migrationDriver === "postgres") {
    return builder.addColumn("id", "serial", (c) => c.primaryKey());
  }
  return builder.addColumn("id", "integer", (c) => c.primaryKey().autoIncrement());
}

/** True if `table` already has `column` (used to make column adds idempotent). */
async function hasColumn(db: Kysely<unknown>, table: string, column: string): Promise<boolean> {
  try {
    const tables = await db.introspection.getTables();
    const t = tables.find((x) => x.name === table);
    return !!t && t.columns.some((c) => c.name === column);
  } catch {
    return false;
  }
}

const migrations: Record<string, Migration> = {
  // ---------------------------------------------------------------------------
  // 001 — initial schema (characters, history, users, sessions, tracks,
  //       settings). Idempotent against the pre-existing SQLite DB.
  // ---------------------------------------------------------------------------
  "001_init": {
    async up(db: Kysely<unknown>): Promise<void> {
      // characters -----------------------------------------------------------
      await addIdColumn(db.schema.createTable("characters").ifNotExists())
        .addColumn("slug", "text", (c) => c.notNull().unique())
        .addColumn("name", "text", (c) => c.notNull())
        .addColumn("emoji", "text", (c) => c.notNull().defaultTo("✨"))
        .addColumn("description", "text", (c) => c.notNull().defaultTo(""))
        .addColumn("system_prompt", "text", (c) => c.notNull())
        .addColumn("temperature", "real", (c) => c.notNull().defaultTo(0.9))
        .addColumn("created_at", "text", (c) => c.notNull().defaultTo(""))
        .addColumn("is_seed", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("meta", "text")
        .addColumn("user_id", "integer")
        .execute();

      // history --------------------------------------------------------------
      await addIdColumn(db.schema.createTable("history").ifNotExists())
        .addColumn("character_id", "integer")
        .addColumn("persona_name", "text", (c) => c.notNull().defaultTo(""))
        .addColumn("persona_emoji", "text", (c) => c.notNull().defaultTo("✨"))
        .addColumn("question", "text", (c) => c.notNull())
        .addColumn("answer", "text", (c) => c.notNull().defaultTo(""))
        .addColumn("favorite", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("created_at", "text", (c) => c.notNull().defaultTo(""))
        .addColumn("user_id", "integer")
        .execute();

      // users ----------------------------------------------------------------
      await addIdColumn(db.schema.createTable("users").ifNotExists())
        .addColumn("username", "text", (c) => c.notNull().unique())
        .addColumn("password_hash", "text", (c) => c.notNull())
        .addColumn("password_salt", "text", (c) => c.notNull())
        .addColumn("role", "text", (c) => c.notNull().defaultTo("user"))
        .addColumn("created_at", "text", (c) => c.notNull().defaultTo(""))
        .execute();

      // sessions -------------------------------------------------------------
      await db.schema
        .createTable("sessions")
        .ifNotExists()
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("user_id", "integer", (c) => c.notNull())
        .addColumn("expires_at", "text", (c) => c.notNull())
        .addColumn("created_at", "text", (c) => c.notNull().defaultTo(""))
        .execute();

      // tracks ---------------------------------------------------------------
      await addIdColumn(db.schema.createTable("tracks").ifNotExists())
        .addColumn("filename", "text", (c) => c.notNull().unique())
        .addColumn("title", "text", (c) => c.notNull().defaultTo(""))
        .addColumn("uploaded_by", "integer")
        .addColumn("created_at", "text", (c) => c.notNull().defaultTo(""))
        .execute();

      // settings (composite PK: owner + key) ---------------------------------
      await db.schema
        .createTable("settings")
        .ifNotExists()
        .addColumn("owner", "text", (c) => c.notNull())
        .addColumn("key", "text", (c) => c.notNull())
        .addColumn("value", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint("settings_pk", ["owner", "key"])
        .execute();

      // Additive columns for legacy SQLite DBs that predate this migration. ---
      if (!(await hasColumn(db, "characters", "user_id"))) {
        await db.schema.alterTable("characters").addColumn("user_id", "integer").execute();
      }
      if (!(await hasColumn(db, "characters", "meta"))) {
        await db.schema.alterTable("characters").addColumn("meta", "text").execute();
      }
      if (!(await hasColumn(db, "history", "user_id"))) {
        await db.schema.alterTable("history").addColumn("user_id", "integer").execute();
      }

      // Helpful indexes (ignore failures if they already exist).
      await sql`CREATE INDEX IF NOT EXISTS idx_history_user ON history (user_id, created_at)`.execute(db).catch(() => {});
      await sql`CREATE INDEX IF NOT EXISTS idx_characters_user ON characters (user_id)`.execute(db).catch(() => {});
      await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)`.execute(db).catch(() => {});
    },

    async down(db: Kysely<unknown>): Promise<void> {
      // Destructive — only used in tests/manual rollback.
      for (const t of ["settings", "tracks", "sessions", "users", "history", "characters"]) {
        await db.schema.dropTable(t).ifExists().execute();
      }
    },
  },
};

/** A static MigrationProvider backed by the in-memory `migrations` map. */
export const migrationProvider: MigrationProvider = {
  async getMigrations(): Promise<Record<string, Migration>> {
    return migrations;
  },
};
