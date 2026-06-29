# Feature: Authentication & accounts

## Approach

A lean, **dependency-free** auth layer (no Auth.js/NextAuth): Node's built-in
`crypto` for password hashing and DB-backed session cookies. Implemented in
`lib/auth.ts`.

## Passwords

- `crypto.scryptSync(password, salt, 64)` with a per-user 16-byte random salt.
- Verification uses `crypto.timingSafeEqual` (after a length check) to avoid
  timing leaks.
- Stored in `users.password_hash` + `users.password_salt`.

## Sessions

- `sessions.id` is a random 32-byte hex token, also the value of the
  **`gnome_session`** cookie (httpOnly, SameSite=Lax, Secure in production,
  `maxAge = SESSION_TTL_DAYS`).
- Revocation = delete the row. Expired sessions are pruned opportunistically.
- `getCurrentUser()` reads the cookie via `next/headers`, resolves the user, and
  returns `null` for anonymous visitors.

## Roles

`user` (default) and `admin`. Admin gates tune uploads, the DB switch, and user
management. Checked in the route handlers (e.g. `user.role !== "admin"` → 403).

## Bootstrap

On first run, if there are no users and `ADMIN_USERNAME` / `ADMIN_PASSWORD` are
set, the admin account is created. Legacy rows (history + non-seed characters
with `user_id IS NULL`) are adopted by that admin so existing data isn't
orphaned. `ALLOW_SIGNUP` (default on) lets visitors self-register as `user`.

## Pages & routes

- `/login`, `/signup` — Server Actions verify/create, set the cookie, redirect.
- `POST /api/auth/logout` — destroys the session + clears the cookie.
- `POST /api/account/password` — change own password.
- `GET /api/me` — `{ user, allowSignup }` for client components.
- `GET/POST /api/admin/users` — admin user management.
- `middleware.ts` — coarse cookie-presence gate redirecting `/history` and
  `/lab` to `/login`. **Real authorization lives in the route handlers**, not
  middleware (which runs on the Edge runtime and never touches the DB).

## Env vars

`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ALLOW_SIGNUP` (default `1`),
`SESSION_TTL_DAYS` (default `30`).

## Verify

- Sign up → logged in; bad password rejected.
- `/history` & `/lab` redirect to `/login` when logged out.
- Logout clears the session; the protected APIs return 401 without a session.
