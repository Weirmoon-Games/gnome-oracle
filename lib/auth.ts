// =============================================================================
// lib/auth.ts — accounts, sessions, and the current-user helper
// =============================================================================
//
// A lean, dependency-free authentication layer for a self-hosted Next.js app
// (plan §2). We deliberately avoid Auth.js/NextAuth (heavy, awkward with
// credential + DB sessions) and use only Node built-ins:
//
//   • Passwords are hashed with `crypto.scrypt` and a per-user random salt;
//     verification uses `crypto.timingSafeEqual` to avoid timing leaks.
//   • Sessions are server-side rows keyed by a random 32-byte token. The token
//     is stored in an httpOnly, SameSite=Lax cookie (`gnome_session`); deleting
//     the row instantly revokes the session.
//
// Roles: 'user' (default) and 'admin'. Admin gates tune uploads, the DB switch,
// and user management. An admin can be bootstrapped from env on first run.
// =============================================================================

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";

export const SESSION_COOKIE = "gnome_session";
export const SESSION_TTL_DAYS = clampInt(process.env.SESSION_TTL_DAYS, 30, 1, 3650);
/** Whether visitors may self-register (default on). Set ALLOW_SIGNUP=0 to lock. */
export const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP !== "0";

export interface AuthUser {
  id: number;
  username: string;
  role: string; // 'user' | 'admin'
}

// --------------------------- password hashing -------------------------------

const SCRYPT_KEYLEN = 64;

function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return { hash, salt };
}

/** Constant-time password check against a stored hash + salt. */
function verifyPassword(password: string, hash: string, salt: string): boolean {
  const known = Buffer.from(hash, "hex");
  let test: Buffer;
  try {
    test = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  } catch {
    return false;
  }
  // Length check first: timingSafeEqual throws if buffers differ in length.
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

// ------------------------------- users --------------------------------------

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Create a user. Throws `Error("username taken")` on collision and
 * `Error("invalid")` on empty/short input. Returns the new user (sans secrets).
 */
export async function createUser(
  rawUsername: string,
  password: string,
  role: "user" | "admin" = "user"
): Promise<AuthUser> {
  const username = normalizeUsername(rawUsername);
  if (username.length < 3 || password.length < 6) throw new Error("invalid");
  const db = await getDb();
  const exists = await db
    .selectFrom("users")
    .select("id")
    .where("username", "=", username)
    .executeTakeFirst();
  if (exists) throw new Error("username taken");
  const { hash, salt } = hashPassword(password);
  const inserted = await db
    .insertInto("users")
    .values({
      username,
      password_hash: hash,
      password_salt: salt,
      role,
      created_at: new Date().toISOString(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { id: Number(inserted.id), username, role };
}

/** Return the user if credentials are valid, else null. */
export async function verifyCredentials(
  rawUsername: string,
  password: string
): Promise<AuthUser | null> {
  const username = normalizeUsername(rawUsername);
  const db = await getDb();
  const row = await db
    .selectFrom("users")
    .selectAll()
    .where("username", "=", username)
    .executeTakeFirst();
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash, row.password_salt)) return null;
  return { id: Number(row.id), username: row.username, role: row.role };
}

/** Change a user's password (used by Settings → Account). */
export async function changePassword(userId: number, newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw new Error("invalid");
  const db = await getDb();
  const { hash, salt } = hashPassword(newPassword);
  await db
    .updateTable("users")
    .set({ password_hash: hash, password_salt: salt })
    .where("id", "=", userId)
    .execute();
}

/** Admin: list all users (id/username/role/created_at). */
export async function listUsers(): Promise<
  { id: number; username: string; role: string; created_at: string }[]
> {
  const db = await getDb();
  const rows = await db
    .selectFrom("users")
    .select(["id", "username", "role", "created_at"])
    .orderBy("created_at", "asc")
    .execute();
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

// ------------------------------ sessions ------------------------------------

function sessionExpiry(): string {
  return new Date(Date.now() + SESSION_TTL_DAYS * 86400_000).toISOString();
}

/** Create a session row and return its token (the cookie value). */
export async function createSession(userId: number): Promise<string> {
  const db = await getDb();
  const token = crypto.randomBytes(32).toString("hex");
  await db
    .insertInto("sessions")
    .values({
      id: token,
      user_id: userId,
      expires_at: sessionExpiry(),
      created_at: new Date().toISOString(),
    })
    .execute();
  // Opportunistically prune expired sessions.
  await db.deleteFrom("sessions").where("expires_at", "<", new Date().toISOString()).execute();
  return token;
}

/** Delete a session row (revoke). */
export async function destroySession(token: string): Promise<void> {
  const db = await getDb();
  await db.deleteFrom("sessions").where("id", "=", token).execute();
}

/** Resolve a session token to its user, or null if missing/expired. */
export async function getSessionUser(token: string): Promise<AuthUser | null> {
  if (!token) return null;
  const db = await getDb();
  const row = await db
    .selectFrom("sessions")
    .innerJoin("users", "users.id", "sessions.user_id")
    .select(["users.id as id", "users.username as username", "users.role as role", "sessions.expires_at as expires_at"])
    .where("sessions.id", "=", token)
    .executeTakeFirst();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await destroySession(token);
    return null;
  }
  return { id: Number(row.id), username: row.username, role: row.role };
}

// --------------------------- cookie + current user --------------------------

/**
 * Read the current user from the `gnome_session` cookie. Returns null for
 * anonymous visitors. Also runs the one-time admin bootstrap.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  await ensureAuthBootstrap();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? "";
  return getSessionUser(token);
}

/** Set the session cookie (call from a Server Action or Route Handler). */
export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 86400,
  });
}

/** Clear the session cookie. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// ----------------------------- bootstrap ------------------------------------

let bootstrapped = false;

/**
 * On first run, if there are no users yet and ADMIN_USERNAME/ADMIN_PASSWORD are
 * set, create the admin account. Also adopt any legacy rows (history /
 * non-seed characters with NULL user_id) so existing data belongs to the admin
 * rather than being orphaned (plan "Risks / per-user history migration").
 */
export async function ensureAuthBootstrap(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return;
  const db = await getDb();
  const anyUser = await db.selectFrom("users").select("id").executeTakeFirst();
  if (anyUser) return; // already initialized
  const admin = await createUser(username, password, "admin");
  // Adopt legacy data.
  await db.updateTable("history").set({ user_id: admin.id }).where("user_id", "is", null).execute();
  await db
    .updateTable("characters")
    .set({ user_id: admin.id })
    .where("user_id", "is", null)
    .where("is_seed", "=", 0)
    .execute();
}

// ------------------------------- utils --------------------------------------

function clampInt(raw: string | undefined, def: number, lo: number, hi: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}
