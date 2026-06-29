# Page: Home — the Oracle (`/`)

The main stage where you pick a persona and ask a question. **Open to everyone.**

## Controls

- **Persona** dropdown — seeds (everyone) plus your own personas when signed in.
- **Outfit** + 🎲 shuffle — switch between the persona's 4 looks.
- **Response style** — Funny but useful / Mostly comedy / Oracle chaos.
- **Mood** — persona-specific moods.
- **Ask** — streams the answer; the wizard speaks and the mouth animates.
- **Replay** — re-speak the last answer.
- **Favorite** — save to history (signed-in only).
- Nav: voice/music quick toggles, **Settings**, **History**/**Lab** (signed-in),
  **Docs**, **Login/Logout**.

## APIs called

- `GET /api/me` — current user (nav + gating).
- `GET /api/settings` — durable preferences (merged over localStorage).
- `GET /api/characters` — persona list (scoped).
- `GET /api/music` — playlist (built-in + uploaded).
- `POST /api/ask` — streamed answer; sends `model` + `responseLength` from
  Settings. Returns `X-History-Id` only when signed in.
- `PATCH /api/history/[id]` — favorite the last answer.

## State

Per-ask choices (persona/outfit/style/mood) live in component state and are
remembered via `lib/clientSettings` (localStorage; DB when signed in). Voice runs
through `lib/tts.ts` (Kokoro/browser); SFX + music through `lib/sound.ts`.

## Notes

- Anonymous asks are **not saved** (no history row, no Favorite).
- Reduce-motion + light/dark theme from Settings apply here.
