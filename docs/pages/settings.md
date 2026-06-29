# Page: Settings (`/settings`)

All durable preferences in one place. **Open to everyone** (admin sections appear
only for admins). A server wrapper reads the current DB backend + user and hands
off to the `SettingsClient` component.

## Sections

- **Voice** — engine (Kokoro/browser/off), voice override, speed, volume.
- **Audio** — master mute, music, per-channel volumes, SFX theme override.
- **Oracle / Model** — model picker, response length, default response style.
- **Appearance** — reduce motion, light/dark theme, default persona.
- **Account** — change password, sign out (or a prompt to sign in).
- **Admin** — Manage tunes, Manage users, Database backend (switch/revert).

## APIs called

`GET /api/settings`, `PUT /api/settings`, `GET /api/models`,
`GET /api/characters`, `GET/POST /api/admin/users`, `GET/POST/DELETE /api/music`
(+ `…/file/[name]`), `POST /api/admin/db/test`, `POST /api/admin/db/switch`,
`POST /api/account/password`, `POST /api/auth/logout`.

## State

`lib/clientSettings.ts`: localStorage for everyone; `settings` table sync for
signed-in users. Changes apply live to `sound`/`tts` and the document theme.
