# Page: Login (`/login`)

Sign in with username + password. Uses a **Server Action** that verifies the
credentials, creates a session, sets the `gnome_session` cookie, and redirects.

## Behavior

- `?next=` carries the originally-requested path (sanitized to internal paths
  only — no open redirects).
- Wrong credentials → redirect back with `?error=1`.
- Shows a "Create one" link when `ALLOW_SIGNUP` is on.

## Related

- `lib/auth.ts` — `verifyCredentials`, `createSession`, `setSessionCookie`.
- `middleware.ts` sends gated pages here when no session cookie is present.
