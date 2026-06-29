# Feature: Per-user data scoping

## Model

- **Seeds** (`is_seed = 1`, `user_id = NULL`) are shared by everyone and cannot
  be deleted.
- **User personas** carry `user_id`; they're private to their owner.
- **History** rows carry `user_id`; anonymous asks are **not persisted at all**.

## Repository scoping (`lib/db.ts`)

Every relevant helper takes a `userId`:

- `listCharacters(userId)` → seeds (`user_id IS NULL`) **plus** the user's own.
  Anonymous (`null`) → seeds only.
- `getCharacter(id, userId)` → only if it's a seed or owned by the user.
- `createCharacter(c, ownerId)` → stamps the owner.
- `deleteCharacter(id, userId)` → seeds are `protected`; a non-owned id reads as
  `not_found` (ownership isn't leaked).
- `addHistory / listHistory / toggleFavorite / deleteHistory` → all scoped to
  `userId`.

## Route behavior

| Route | Anonymous | Signed in |
|---|---|---|
| `POST /api/ask` | allowed, **not saved** (no `X-History-Id`) | saved with `user_id` |
| `GET /api/characters` | seeds only | seeds + own |
| `POST /api/characters`, `…/generate` | 401 | creates owned persona |
| `DELETE /api/characters/[id]` | 401 | deletes own only |
| `GET /api/history`, `PATCH/DELETE /api/history/[id]` | 401 | own rows only |

## UI

`app/page.tsx` fetches `/api/me`: shows Login/Logout, shows History/Lab only when
signed in, and hides the Favorite affordance for anonymous asks (with a "sign in
to save" hint).

## Verify

- Two accounts see separate history; Lab personas are private; seeds are shared.
- Anonymous ask works but creates no row and offers no Favorite.
