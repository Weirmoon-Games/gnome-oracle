// =============================================================================
// lib/dbConfig.ts — database bootstrap configuration
// =============================================================================
//
// "Which database do we connect to?" is a setting that cannot itself live in the
// database it selects, so it lives in a small JSON file on disk:
//
//     data/db-config.json   →   { "driver": "sqlite" | "postgres", "url"?: "…" }
//
// Resolution order (highest priority first):
//   1. The on-disk config file (written by the admin "Switch to Postgres" flow).
//   2. The `DATABASE_URL` env var — if set to a `postgres://…` string and no file
//      exists yet, we treat the backend as Postgres (headless / container setups).
//   3. Default: SQLite at `data/gnome.db`.
//
// The file is gitignored (it may contain a Postgres URL with a password) and is
// created lazily. NOTHING here logs the connection string.
// =============================================================================

import fs from "node:fs";
import path from "node:path";

export type DbDriver = "sqlite" | "postgres";

export interface DbConfig {
  driver: DbDriver;
  /** Postgres connection string; only present when driver === "postgres". */
  url?: string;
}

/** Absolute path to the writable runtime data directory (next to the app). */
export const DATA_DIR = path.join(process.cwd(), "data");
/** Default SQLite database file. */
export const SQLITE_PATH = path.join(DATA_DIR, "gnome.db");
/** Bootstrap config file path. */
export const DB_CONFIG_PATH = path.join(DATA_DIR, "db-config.json");

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Read the active database configuration. Falls back to env then to SQLite.
 * Never throws — a malformed file degrades gracefully to the default.
 */
export function readDbConfig(): DbConfig {
  // 1. On-disk config wins.
  try {
    const raw = fs.readFileSync(DB_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<DbConfig>;
    if (parsed.driver === "postgres" && typeof parsed.url === "string" && parsed.url) {
      return { driver: "postgres", url: parsed.url };
    }
    if (parsed.driver === "sqlite") {
      return { driver: "sqlite" };
    }
  } catch {
    // No file yet, or unreadable/malformed → fall through.
  }

  // 2. Env var seeds a headless Postgres install.
  const envUrl = process.env.DATABASE_URL;
  if (envUrl && /^postgres(ql)?:\/\//i.test(envUrl)) {
    return { driver: "postgres", url: envUrl };
  }

  // 3. Default.
  return { driver: "sqlite" };
}

/**
 * Persist a new database configuration to disk (used by the admin DB-switch
 * flow after a successful migrate + data copy). Creates `data/` if needed.
 */
export function writeDbConfig(config: DbConfig): void {
  ensureDataDir();
  const safe: DbConfig =
    config.driver === "postgres"
      ? { driver: "postgres", url: config.url }
      : { driver: "sqlite" };
  fs.writeFileSync(DB_CONFIG_PATH, JSON.stringify(safe, null, 2), "utf8");
}

/** True when a Postgres connection string looks structurally valid. */
export function looksLikePostgresUrl(url: unknown): url is string {
  return typeof url === "string" && /^postgres(ql)?:\/\/.+/i.test(url);
}
