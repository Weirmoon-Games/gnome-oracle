# Page: Signup (`/signup`)

Self-registration (when enabled). A **Server Action** creates a `user` account,
opens a session, and redirects home.

## Behavior

- Honors `ALLOW_SIGNUP`: when `0`, the form is replaced with a notice and the
  action refuses.
- Errors round-trip via `?error=`: `taken` (username exists), `invalid`
  (username < 3 or password < 6), `disabled`.

## Related

- `lib/auth.ts` — `createUser`, `createSession`, `setSessionCookie`.
- Admins can also create users (including other admins) from **Settings → Manage
  users**.
