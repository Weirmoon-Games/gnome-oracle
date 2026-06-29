// =============================================================================
// lib/schema.ts — Kysely database schema (dialect-neutral)
// =============================================================================
//
// This file is the single source of truth for the database *shape*. It declares
// the TypeScript interface that Kysely uses to type every query, for BOTH the
// SQLite (default) and PostgreSQL backends. The actual tables are created by the
// migrations in `lib/migrations.ts`; this interface must stay in sync with them.
//
// Cross-dialect design choices (see UPGRADE_PLAN.md §1 "Cross-dialect gotchas"):
//   • Booleans (`favorite`, `is_seed`) are stored as INTEGER 0/1 in both engines
//     so we never trip over SQLite-int vs Postgres-bool coercion.
//   • Timestamps (`created_at`, `expires_at`) are stored as ISO-8601 TEXT, always
//     written by the app (never a DB `now()` default), so the format is identical
//     across engines and trivially parseable in the browser (`new Date(iso)`).
//   • Auto-increment ids use `Generated<number>` here; the migration picks the
//     right column type per dialect (`integer autoincrement` vs `serial`).
//
// NOTE: this module has NO node-only imports and is safe to import anywhere.
// =============================================================================

import type { ColumnType, Generated, Insertable, Selectable, Updateable } from "kysely";

/** A column the DB fills in on insert (auto-increment primary key). */
type Pk = Generated<number>;

/**
 * `characters` — the persona catalog.
 * `is_seed` (0/1): built-in personas (cannot be deleted, shared by everyone).
 * `user_id` (nullable): owner of a user-created persona; NULL = shared seed.
 * `meta`: JSON string (appearance, voice, sfx, moods) — parsed by `hydrate()`.
 */
export interface CharactersTable {
  id: Pk;
  slug: string;
  name: string;
  emoji: string;
  description: string;
  system_prompt: string;
  temperature: number;
  created_at: string; // ISO-8601, written by the app
  is_seed: number; // 0 | 1
  meta: string | null; // JSON
  user_id: number | null; // NULL = shared/global seed
}

/**
 * `history` — every question/answer exchange.
 * `user_id` (nullable): owner; anonymous asks are NOT persisted, so in practice
 * this is always set, but the column stays nullable for legacy rows.
 */
export interface HistoryTable {
  id: Pk;
  character_id: number | null;
  persona_name: string;
  persona_emoji: string;
  question: string;
  answer: string;
  favorite: number; // 0 | 1
  created_at: string; // ISO-8601
  user_id: number | null;
}

/**
 * `users` — accounts. Passwords are hashed with Node's built-in scrypt
 * (`lib/auth.ts`); we store the derived hash and the per-user salt separately.
 * `role` gates admin-only features (tune uploads, DB switch, user management).
 */
export interface UsersTable {
  id: Pk;
  username: string;
  password_hash: string;
  password_salt: string;
  role: string; // 'user' | 'admin'
  created_at: string; // ISO-8601
}

/**
 * `sessions` — server-side session records. The primary key is a random 32-byte
 * hex token that is also the value of the `gnome_session` cookie, so a session
 * is trivially revocable (delete the row).
 */
export interface SessionsTable {
  id: string; // random token (also the cookie value)
  user_id: number;
  expires_at: string; // ISO-8601
  created_at: string; // ISO-8601
}

/**
 * `tracks` — uploaded background-music files (admin uploads). The bytes live in
 * `data/music/`; this row is the catalog entry. Built-in tracks under
 * `public/music/` are NOT recorded here (they're discovered from disk).
 */
export interface TracksTable {
  id: Pk;
  filename: string; // sanitized, unique on disk
  title: string;
  uploaded_by: number | null; // users.id
  created_at: string; // ISO-8601
}

/**
 * `settings` — key/value store for per-user and global settings.
 * `owner` is either the string `"global"` or the stringified user id. Using a
 * non-null text discriminator (instead of a nullable user_id) keeps the
 * composite primary key portable: SQLite and Postgres disagree about NULLs in
 * unique/primary keys, so we sidestep the issue entirely.
 */
export interface SettingsTable {
  owner: string; // "global" | String(userId)
  key: string;
  value: string; // JSON-encoded value
}

/** The full database, as seen by Kysely. */
export interface Database {
  characters: CharactersTable;
  history: HistoryTable;
  users: UsersTable;
  sessions: SessionsTable;
  tracks: TracksTable;
  settings: SettingsTable;
}

// Convenience row types -------------------------------------------------------
export type CharacterRowDb = Selectable<CharactersTable>;
export type NewCharacterRow = Insertable<CharactersTable>;
export type CharacterUpdate = Updateable<CharactersTable>;

export type HistoryRowDb = Selectable<HistoryTable>;
export type UserRow = Selectable<UsersTable>;
export type SessionRow = Selectable<SessionsTable>;
export type TrackRow = Selectable<TracksTable>;
export type SettingRow = Selectable<SettingsTable>;

// `ColumnType` is re-exported only to keep the import "used" for consumers that
// want to extend the schema; it documents that columns could differ on
// insert/select/update if we ever needed that.
export type { ColumnType };
