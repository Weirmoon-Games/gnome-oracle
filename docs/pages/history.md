# Page: History (`/history`)

Everything the Oracle has answered for **you**. **Requires sign-in** (middleware
redirects to `/login` without a session).

## Controls

- **All / ⭐ Favorites** filter.
- Per row: ⭐ toggle favorite, 🗑 delete.

## APIs called

- `GET /api/history` (`?favorites=1`) — your rows, newest first.
- `PATCH /api/history/[id]` — toggle favorite.
- `DELETE /api/history/[id]` — delete a row.

All scoped to your `user_id`; a foreign id reads as 404. A 401 (stale session)
bounces you to `/login?next=/history`.

## State

Server data only; no local persistence. Timestamps are ISO-8601 and rendered as
relative "time ago" (legacy `YYYY-MM-DD HH:MM:SS` rows still parse).
