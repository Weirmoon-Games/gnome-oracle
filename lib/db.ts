// =============================================================================
// lib/db.ts — async repository layer (Kysely; SQLite default / Postgres option)
// =============================================================================
//
// This is the ONLY module that talks to the database. It replaces the original
// synchronous `better-sqlite3` code with an async, dialect-neutral repository
// built on the Kysely query builder, so the exact same query code can target
// either SQLite (default) or PostgreSQL — the dialect is chosen at connect time
// from `data/db-config.json` (see lib/dbConfig.ts).
//
// Responsibilities:
//   • Construct + cache a single Kysely instance per process (survives Next.js
//     hot reloads via `global`), choosing the dialect from the bootstrap config.
//   • Run migrations (lib/migrations.ts) and upsert the built-in seed personas.
//   • Expose async, per-user-scoped helpers for characters, history, settings,
//     and tracks.
//
// Per-user scoping (plan §2/§3): every character/history helper takes a
// `userId`. Seeds have `user_id = NULL` and are visible to everyone; a user only
// ever sees/edits their own rows plus the shared seeds. Anonymous callers pass
// `null` and therefore see only seeds (and never persist history).
//
// Cross-dialect notes: booleans are stored as INTEGER 0/1; timestamps are
// app-written ISO strings; inserts use `RETURNING id` (supported by both the
// better-sqlite3 dialect and Postgres).
// =============================================================================

import { Kysely, Migrator, SqliteDialect, PostgresDialect } from "kysely";
import type { Database } from "./schema";
import { type PersonaMeta, deriveMeta, normalizeMeta } from "./persona";
import { type DbConfig, readDbConfig, SQLITE_PATH, DATA_DIR } from "./dbConfig";
import { migrationProvider, setMigrationDriver } from "./migrations";
import { SEED_PERSONAS, slugify, type NewCharacter } from "./seeds";
import fs from "node:fs";

export type { NewCharacter };

// ----------------------------- public row types -----------------------------

/** A persona as consumed by the app (meta parsed/normalized into an object). */
export interface Character {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  description: string;
  system_prompt: string;
  temperature: number;
  created_at: string;
  is_seed: number; // 1 = built-in (cannot be deleted), 0 = user/AI created
  user_id: number | null;
  meta: PersonaMeta; // always populated (parsed or derived)
}

export interface HistoryRow {
  id: number;
  character_id: number | null;
  persona_name: string;
  persona_emoji: string;
  question: string;
  answer: string;
  favorite: number;
  created_at: string;
  user_id: number | null;
}

// --------------------------- connection bootstrap ---------------------------

// Cache the Kysely instance AND the in-flight init promise on `global` so
// concurrent route invocations share one connection and one initialization.
declare global {
  // eslint-disable-next-line no-var
  var __gnomeKysely: Kysely<Database> | undefined;
  // eslint-disable-next-line no-var
  var __gnomeInit: Promise<Kysely<Database>> | undefined;
}

/** Build a Kysely instance for the given config (dynamic-imports the driver). */
async function makeKysely(config: DbConfig): Promise<Kysely<Database>> {
  if (config.driver === "postgres") {
    // `pg` is pure-JS and only loaded when actually targeting Postgres.
    const pg = (await import("pg")).default;
    const dialect = new PostgresDialect({
      pool: new pg.Pool({ connectionString: config.url, max: 10 }),
    });
    return new Kysely<Database>({ dialect });
  }
  // Default: SQLite via better-sqlite3 (native module, kept external in the
  // Next build — see next.config.ts).
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const BetterSqlite3 = (await import("better-sqlite3")).default;
  const sqlite = new BetterSqlite3(SQLITE_PATH);
  sqlite.pragma("journal_mode = WAL");
  return new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
}

/** Run migrations then upsert the seed personas. */
async function initialize(db: Kysely<Database>, config: DbConfig): Promise<void> {
  setMigrationDriver(config.driver);
  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error instanceof Error ? error : new Error(String(error));
  await seedPersonas(db);
}

/**
 * Get the shared Kysely instance, constructing + initializing it on first use.
 * All repository helpers funnel through here. Safe to call concurrently.
 */
export async function getDb(): Promise<Kysely<Database>> {
  if (global.__gnomeKysely) return global.__gnomeKysely;
  if (!global.__gnomeInit) {
    const config = readDbConfig();
    global.__gnomeInit = (async () => {
      const db = await makeKysely(config);
      await initialize(db, config);
      global.__gnomeKysely = db;
      return db;
    })();
  }
  return global.__gnomeInit;
}

/**
 * Build a fresh Kysely instance for an ARBITRARY config and run migrations on
 * it (no seeding — seeds are re-upserted when the app next boots). Used by the
 * admin DB-switch flow to provision and populate the target Postgres database
 * WITHOUT disturbing the live cached connection.
 */
export async function buildKyselyMigrated(config: DbConfig): Promise<Kysely<Database>> {
  const db = await makeKysely(config);
  setMigrationDriver(config.driver);
  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error } = await migrator.migrateToLatest();
  if (error) {
    await db.destroy();
    throw error instanceof Error ? error : new Error(String(error));
  }
  return db;
}

/**
 * Tear down the cached connection (used by the admin DB-switch flow before the
 * process restarts, and by tests between cases).
 */
export async function closeDb(): Promise<void> {
  const db = global.__gnomeKysely;
  global.__gnomeKysely = undefined;
  global.__gnomeInit = undefined;
  if (db) await db.destroy();
}

// ------------------------------- seeding ------------------------------------

/**
 * Upsert the built-in personas. New seeds are inserted; existing seeds are
 * refreshed (so prompt/appearance tweaks ship on the next boot). User-created
 * personas that happen to share a slug are left alone (`is_seed = 1` guard on
 * update, and seeds always have `user_id IS NULL`).
 */
async function seedPersonas(db: Kysely<Database>): Promise<void> {
  for (const r of SEED_PERSONAS) {
    const slug = slugify(r.name);
    const meta = JSON.stringify(r.meta ?? deriveMeta(slug, r.temperature));
    const existing = await db
      .selectFrom("characters")
      .select(["id", "is_seed"])
      .where("slug", "=", slug)
      .executeTakeFirst();

    const payload = {
      name: r.name,
      emoji: r.emoji,
      description: r.description,
      system_prompt: r.system_prompt,
      temperature: r.temperature ?? 0.9,
      is_seed: 1,
      meta,
    };

    if (!existing) {
      await db
        .insertInto("characters")
        .values({ slug, created_at: nowIso(), user_id: null, ...payload })
        .execute();
    } else if (existing.is_seed) {
      await db.updateTable("characters").set(payload).where("slug", "=", slug).execute();
    }
  }
}

// -------------------------------- helpers -----------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

/** Parse the stored JSON meta into a complete PersonaMeta (filling gaps). */
function hydrate(row: {
  slug: string;
  temperature: number;
  meta: string | null;
  [k: string]: unknown;
}): Character {
  let parsed: unknown = null;
  if (row.meta) {
    try {
      parsed = JSON.parse(row.meta);
    } catch {
      parsed = null;
    }
  }
  const meta = normalizeMeta(parsed, row.slug, row.temperature);
  return { ...(row as unknown as Omit<Character, "meta">), meta };
}

// --------------------------- character helpers ------------------------------

/**
 * List personas visible to `userId`: all shared seeds plus that user's own.
 * Anonymous callers (`userId == null`) see only seeds.
 */
export async function listCharacters(userId: number | null = null): Promise<Character[]> {
  const db = await getDb();
  let q = db.selectFrom("characters").selectAll();
  q =
    userId == null
      ? q.where("user_id", "is", null)
      : q.where((eb) => eb.or([eb("user_id", "is", null), eb("user_id", "=", userId)]));
  const rows = await q.orderBy("is_seed", "desc").orderBy("name", "asc").execute();
  return rows.map(hydrate);
}

/**
 * Fetch one persona by id, scoped to `userId` (seed or owned). Returns
 * undefined if it doesn't exist or isn't visible to the caller.
 */
export async function getCharacter(
  id: number,
  userId: number | null = null
): Promise<Character | undefined> {
  const db = await getDb();
  let q = db.selectFrom("characters").selectAll().where("id", "=", id);
  q =
    userId == null
      ? q.where("user_id", "is", null)
      : q.where((eb) => eb.or([eb("user_id", "is", null), eb("user_id", "=", userId)]));
  const row = await q.executeTakeFirst();
  return row ? hydrate(row) : undefined;
}

/**
 * Create a persona owned by `ownerId` (NULL for seeds). Ensures a unique slug
 * by appending -2, -3, … on collision. Returns the hydrated row.
 */
export async function createCharacter(
  c: NewCharacter,
  ownerId: number | null = null
): Promise<Character> {
  const db = await getDb();
  const base = slugify(c.name);
  let slug = base;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await db.selectFrom("characters").select("id").where("slug", "=", slug).executeTakeFirst()) {
    slug = `${base}-${n++}`;
  }
  const meta = c.meta ?? deriveMeta(slug, c.temperature);
  const inserted = await db
    .insertInto("characters")
    .values({
      slug,
      name: c.name,
      emoji: c.emoji || "✨",
      description: c.description || "",
      system_prompt: c.system_prompt,
      temperature: c.temperature ?? 0.9,
      is_seed: c.is_seed ? 1 : 0,
      meta: JSON.stringify(meta),
      created_at: nowIso(),
      user_id: ownerId,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return (await getCharacter(Number(inserted.id), ownerId))!;
}

/**
 * Delete a persona. Seeds are protected; users can only delete their own.
 * Returns 'deleted' | 'not_found' | 'protected'.
 */
export async function deleteCharacter(
  id: number,
  userId: number
): Promise<"deleted" | "not_found" | "protected"> {
  const db = await getDb();
  const row = await db
    .selectFrom("characters")
    .select(["is_seed", "user_id"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row) return "not_found";
  if (row.is_seed) return "protected";
  if (row.user_id !== userId) return "not_found"; // not the owner → hide existence
  await db.deleteFrom("characters").where("id", "=", id).execute();
  return "deleted";
}

// ----------------------------- history helpers ------------------------------

/** Record a new (answer-less) history row for `userId`; returns its id. */
export async function addHistory(
  h: { characterId: number | null; personaName: string; personaEmoji: string; question: string },
  userId: number
): Promise<number> {
  const db = await getDb();
  const inserted = await db
    .insertInto("history")
    .values({
      character_id: h.characterId,
      persona_name: h.personaName,
      persona_emoji: h.personaEmoji,
      question: h.question,
      answer: "",
      favorite: 0,
      created_at: nowIso(),
      user_id: userId,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return Number(inserted.id);
}

/** Fill in the answer once streaming completes (called server-side only). */
export async function setHistoryAnswer(id: number, answer: string): Promise<void> {
  const db = await getDb();
  await db.updateTable("history").set({ answer }).where("id", "=", id).execute();
}

/** List a user's history (optionally favorites only), newest first. */
export async function listHistory(
  userId: number,
  opts?: { favoritesOnly?: boolean; limit?: number }
): Promise<HistoryRow[]> {
  const db = await getDb();
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  let q = db.selectFrom("history").selectAll().where("user_id", "=", userId);
  if (opts?.favoritesOnly) q = q.where("favorite", "=", 1);
  return (await q
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(limit)
    .execute()) as HistoryRow[];
}

/** Toggle favorite on a user's row; returns the new state or null if missing. */
export async function toggleFavorite(id: number, userId: number): Promise<boolean | null> {
  const db = await getDb();
  const row = await db
    .selectFrom("history")
    .select("favorite")
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (!row) return null;
  const next = row.favorite ? 0 : 1;
  await db
    .updateTable("history")
    .set({ favorite: next })
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .execute();
  return next === 1;
}

/** Delete one of a user's history rows; returns true if a row was removed. */
export async function deleteHistory(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  const res = await db
    .deleteFrom("history")
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  return Number(res.numDeletedRows ?? 0) > 0;
}

// ----------------------------- settings helpers -----------------------------

/** Read all settings for an owner ("global" or String(userId)) as an object. */
export async function getSettings(owner: string): Promise<Record<string, unknown>> {
  const db = await getDb();
  const rows = await db
    .selectFrom("settings")
    .select(["key", "value"])
    .where("owner", "=", owner)
    .execute();
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = r.value;
    }
  }
  return out;
}

/** Upsert a single setting (value is JSON-encoded). */
export async function setSetting(owner: string, key: string, value: unknown): Promise<void> {
  const db = await getDb();
  const encoded = JSON.stringify(value);
  const existing = await db
    .selectFrom("settings")
    .select("key")
    .where("owner", "=", owner)
    .where("key", "=", key)
    .executeTakeFirst();
  if (existing) {
    await db
      .updateTable("settings")
      .set({ value: encoded })
      .where("owner", "=", owner)
      .where("key", "=", key)
      .execute();
  } else {
    await db.insertInto("settings").values({ owner, key, value: encoded }).execute();
  }
}

/** Replace an owner's settings with the given object (one row per key). */
export async function saveSettings(owner: string, values: Record<string, unknown>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    // eslint-disable-next-line no-await-in-loop
    await setSetting(owner, key, value);
  }
}

// ------------------------------ track helpers -------------------------------

export interface Track {
  id: number;
  filename: string;
  title: string;
  uploaded_by: number | null;
  created_at: string;
}

/** Record an uploaded music track. */
export async function addTrack(t: { filename: string; title: string; uploadedBy: number | null }): Promise<void> {
  const db = await getDb();
  await db
    .insertInto("tracks")
    .values({
      filename: t.filename,
      title: t.title,
      uploaded_by: t.uploadedBy,
      created_at: nowIso(),
    })
    .execute();
}

/** List uploaded tracks, newest first. */
export async function listTracks(): Promise<Track[]> {
  const db = await getDb();
  return (await db
    .selectFrom("tracks")
    .selectAll()
    .orderBy("created_at", "desc")
    .execute()) as Track[];
}

/** Remove a track row by filename; returns true if a row was removed. */
export async function deleteTrack(filename: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.deleteFrom("tracks").where("filename", "=", filename).executeTakeFirst();
  return Number(res.numDeletedRows ?? 0) > 0;
}

