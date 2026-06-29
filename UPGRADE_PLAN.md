# Gnome Oracle — Upgrade Plan: Pluggable DB, Tune Uploads, Login & Accounts, Voice, Settings, New Personas

## Context

**Gnome Oracle** (`W:\gnome-oracle`) is a Next.js 15 / React 19 / TypeScript web app: a whimsical on‑screen wizard/gnome that answers questions in‑character. Stack: `better-sqlite3` (`data/gnome.db`), a **local Ollama** LLM (`gemma2:2b`), **browser `speechSynthesis`** for voice, **Web Audio** synth for SFX, and background music auto‑discovered from `public/music/`. Three pages (`/`, `/history`, `/lab`), API routes for ask/characters/history/music, deployed as a Windows service or Linux systemd+nginx. **Today there is no authentication, no per‑user data, no way to upload music, the voice is the flat browser default, and the database is hard‑wired to SQLite.**

This plan makes the app meaningfully better along the axes you asked about. Confirmed decisions:

- **Database:** Keep **SQLite as the default**, but let an **admin switch to a PostgreSQL connection from Settings**. Implement via an **async repository layer using the Kysely query builder** (one query API, two dialects). Switching does **apply‑config → migrate existing data → restart** the service to reconnect cleanly.
- **Voice:** Add **Kokoro‑82M in‑browser neural TTS** as the primary voice engine (natural, characterful, 100% client‑side); keep `speechSynthesis` as an automatic fallback (resilience, not a separate feature).
- **Accounts:** **Multi‑user with per‑user history & personas.** The 35 built‑in "seed" personas stay shared/global.
- **Login gate:** Asking the Oracle stays **open to everyone**. **History and the persona Lab require sign‑in.** **Tune uploads are admin‑only** → `user` / `admin` **roles**.
- **Personas:** Design a **curated batch of ~12 new personas** (plus new outfit pieces and SFX themes).

The whole design stays true to the app's lean, self‑hosted, privacy‑first ethos: **no cloud services**, and aside from the query builder, Postgres driver, and the Kokoro voice library, no heavy new dependencies — auth and uploads use Node built‑ins.

---

## 1. Database layer — SQLite default, admin-switchable PostgreSQL (FOUNDATIONAL)

This is the foundation everything else sits on, so it's built first. Today `lib/db.ts` calls **synchronous** `better-sqlite3` directly with `@named` placeholders, `PRAGMA`/WAL, `AUTOINCREMENT`, `datetime('now')`, and the `better-sqlite3` transaction API — all SQLite‑specific. Postgres (`pg`) is **async**, so we refactor to an async repository.

### Approach — Kysely repository
- **Add deps:** `kysely`, `pg`, `@types/pg`. `better-sqlite3` stays. Kysely's dialect is a constructor argument (`SqliteDialect` vs `PostgresDialect`), so the same query code targets either engine — ideal for config‑driven switching.
- **New `lib/schema.ts`:** a Kysely `Database` interface (tables: `characters`, `history`, `users`, `sessions`, `tracks`, plus a `settings`/`kv` table for per‑user + global settings).
- **Rewrite `lib/db.ts`** as the repository: an async `getDb()` that reads the bootstrap config (below), constructs Kysely with the right dialect, caches it on `global.__gnomeDb`, and runs migrations. All existing helpers (`getCharacter`, `listCharacters`, `createCharacter`, `deleteCharacter`, `addHistory`, `setHistoryAnswer`, `listHistory`, `toggleFavorite`, `deleteHistory`) become **async** and dialect‑neutral. `hydrate()`/`normalizeMeta` and the seed‑persona data/logic (`SEED_PERSONAS`, `makeSeeds`, `uniqueWardrobe`, `seedMeta`) are preserved; only the persistence calls change. Use cross‑dialect idioms: `RETURNING id` for inserts (both support it), `created_at` defaulted in app code or via dialect‑appropriate defaults, upsert seeds via select‑then‑insert/update (as today).
- **Migrations:** use Kysely's `Migrator` with migration files (clean, and required to provision a fresh Postgres DB on switch). Replace the current idempotent `init()` with `migrateToLatest()` on startup.

### Async ripple (every DB call site must `await`)
- `app/api/ask/route.ts`: `await addHistory(...)`; the `setHistoryAnswer` call inside the `TransformStream.flush()` (`app/api/ask/route.ts:109`) — `flush` may return a Promise, so make it async.
- `app/api/characters/*`, `app/api/history/*`, `app/api/music/route.ts`, and the new auth code all `await` the repository.

### Bootstrap config (the "which DB" setting can't live in the DB it selects)
- **New `data/db-config.json`** (gitignored): `{ "driver": "sqlite" | "postgres", "url"?: string }`. Defaults to SQLite at `data/gnome.db`. Env `DATABASE_URL` (a `postgres://…` string) seeds/overrides it for headless installs.
- `getDb()` reads this file to choose the dialect.

### Admin "Database" settings + switch flow (apply → migrate → restart)
- New admin‑only routes:
  - `POST /api/admin/db/test` — validates a Postgres URL by connecting + a trivial query (never logs the secret).
  - `POST /api/admin/db/switch` — connect to target → run migrations on it → **copy all rows** from the current SQLite DB (table order respecting FKs: users → sessions → characters → history → tracks; then reset Postgres sequences with `setval`) → write `data/db-config.json` → signal restart.
- **Restart mechanism:** since the app runs as an auto‑restarting service (WinSW / systemd), the switch endpoint finishes the migration, persists config, returns "switching… reconnecting", then exits the process so the service relaunches on Postgres. Show a clear "the Oracle will blink for a moment" UI state. (Document a manual restart for `npm start`/dev.)
- Settings → **Database** section (admin): shows current backend; Postgres URL field; **Test** and **Switch to Postgres** buttons with a confirm dialog warning that data is copied and the service restarts. A "Revert to SQLite" path just rewrites the config + restarts (SQLite file is untouched by the switch, so it remains a backup).

---

## 2. Authentication & Accounts (multi-user, roles, per-user data)

**Approach:** DIY session cookies backed by the repository — best‑practice for a lean self‑hosted Next.js app (Auth.js/NextAuth is heavy and awkward with credential+DB sessions; Lucia is now "building blocks" only). Password hashing uses Node's built‑in `crypto.scrypt` + `timingSafeEqual` — **no new dependency**.

### Schema (in `lib/schema.ts` + migrations)
- `users(id, username UNIQUE, password_hash, password_salt, role DEFAULT 'user', created_at)`.
- `sessions(id TEXT PK, user_id, expires_at, created_at)` — `id` is a random 32‑byte token stored in the cookie; easy to revoke.
- Nullable `user_id` on `characters` (NULL = shared seed) and on `history`.
- **Admin bootstrap:** on migrate, if no users exist and `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars are set, create the admin. `ALLOW_SIGNUP` env (default on) lets visitors self‑register as `user`.

### New `lib/auth.ts`
`createUser`, `verifyCredentials` (scrypt compare), `createSession`/`destroySession`, and `getCurrentUser()` — reads the `gnome_session` httpOnly/secure/SameSite cookie via `next/headers` `cookies()`, resolves the user, prunes expired sessions.

### New pages & routes
- `/login`, `/signup` using **Server Actions** to verify/create, set the cookie, redirect. Logout action / `POST /api/auth/logout` destroys the session.
- `middleware.ts`: coarse gate — no session cookie → redirect `/history` and `/lab` to `/login`. **Real authorization lives in the route handlers** (current Next.js guidance), not middleware.

### Wire auth into data paths
- Repository history/character helpers take a `userId` and scope every query to it: `listCharacters(userId)` returns seeds (`user_id IS NULL`) **plus** the user's own; `createCharacter` stamps the owner; `deleteCharacter` only deletes the user's own (seeds stay `protected`); history helpers only touch the user's rows.
- `app/api/ask/route.ts`: resolve `getCurrentUser()`. Logged in → save history with `userId` + return `X-History-Id`. **Anonymous → don't persist** (skip the insert, omit the header). Streaming otherwise unchanged.
- `app/api/history/*`, `app/api/characters/*` (incl. `generate`): require a user; 401 otherwise.
- `app/page.tsx`: fetch current user on load; show **Login/Logout** in the nav, show **History**/**Lab** only when signed in, hide **Favorite** for anonymous asks.

---

## 3. Upload Tunes (admin-only)

`public/music/` is baked into the standalone build, so runtime uploads must go to a writable runtime dir under `data/`.

- **New dir `data/music/`** for uploads; `tracks(id, filename, title, uploaded_by, created_at)` table.
- **`POST /api/music`** (admin‑only, in `app/api/music/route.ts`): `await req.formData()`, validate against the existing `AUDIO_RE` (`app/api/music/route.ts:11`), enforce a size cap (~25 MB) + sanitized filename, write to `data/music/`, insert a `tracks` row. No upload library.
- **`GET /api/music`** (rewrite): merge built‑in files from `public/music/` (served statically at `/music/<f>`) with uploaded files from `data/music/` (served via the route below). Returns the same `string[]` the client already feeds to `sound.setPlaylist()` (`app/page.tsx:80`).
- **`GET /api/music/file/[name]`**: stream an uploaded file from `data/music/` with content‑type + range support.
- **`DELETE /api/music/file/[name]`** (admin‑only): remove file + `tracks` row.
- **Tunes admin UI:** a panel in Settings (see §5) — drag‑drop upload, list with preview‑play, delete. Admins only.
- *Optional polish:* associate a tune with a persona or mood so music shifts with the character.

---

## 4. Voice — Kokoro-82M neural TTS in the browser

Replace the flat default voice with natural neural voices, staying 100% local.

**Library:** `kokoro-js` (+ `@huggingface/transformers`, WebGPU with WASM fallback). Many named voices (`af_heart`, `am_michael`, `bm_george`, …) → strong character differentiation; adjustable `speed`.

### Integration (centered on `lib/tts.ts`)
The `tts` singleton already exposes the right seams (`begin`/`feed`/`end`/`replay`/`setVoice`/`setVolume`/`setMuted`/`onSpeakingChange`) and speaks **sentence‑by‑sentence** (`lib/tts.ts:81`). Keep this API; add a pluggable engine:
- **New `lib/kokoroTts.ts`:** lazy‑loads the model via dynamic `import()` (never in the server bundle), exposes `generate(sentence, voiceId, speed) → AudioBuffer`, and a **playback queue** so sentences play back‑to‑back. It must drive the active‑utterance count / `onSpeakingChange` exactly like the current code (`lib/tts.ts:46-49,101-112`) so the canvas mouth animation (`app/page.tsx:61,344`) stays synced.
- **`lib/tts.ts`:** add an engine switch (`"kokoro" | "browser"`); the same sentence buffer feeds whichever is active. **If Kokoro is unsupported or fails to load, auto‑fall back** to `speechSynthesis`.
- **First‑load UX:** a small "summoning the Oracle's voice…" indicator while the model downloads (cached afterward); fall back to the browser voice until ready so nothing blocks.

### Persona voice mapping (`lib/persona.ts`)
- Extend `Voice` (`lib/persona.ts:205`) with optional `voiceId?: string` + `speed?: number`; keep `rate`/`pitch` for fallback. Update `normalizeMeta` (`lib/persona.ts:273`) to validate `voiceId` against the known Kokoro voice list, and `deriveMeta` to pick a deterministic default voice from the slug hash.
- Assign fitting `voiceId`s to seed personas in `lib/db.ts` seed data.

### Offline / LAN deployment
transformers.js fetches weights from the HF CDN by default. For offline boxes, **vendor the Kokoro ONNX model** (e.g. `public/models/kokoro/`) and point transformers.js at the local path; have the installers download it during setup. **WebGPU needs a secure context** (HTTPS or localhost) — the nginx path provides HTTPS; document this for LAN/IP access.

---

## 5. Editable Settings (what would make this better)

Today the only settings are four volume sliders + persona/outfit/mood/style (`app/page.tsx:280-336`). Consolidate and expand into a proper **Settings panel** (extend the toggle at `app/page.tsx:52,266`, or promote to a `/settings` page):

| Group | Settings |
|---|---|
| **Voice** | Engine (Kokoro / browser / off); voice picker (per‑persona + global override); speed; volume |
| **Audio** | Music on/off + volume; SFX volume + **theme override**; typing volume; master mute |
| **Oracle / LLM** | Model picker (new `GET /api/models` proxying Ollama `/api/tags`); response length (`num_predict`, hard‑coded 200 at `lib/ollama.ts:38`); default response style & mood; temperature nudge |
| **Appearance / UX** | **Reduce motion** (accessibility toggle for the canvas); light/dark theme; default persona |
| **Account** (signed in) | Change password; sign out. **Admin:** manage users; **manage tunes** (the §3 uploader); **Database** backend (the §1 switch) |

Per‑user settings persist to the `settings` table when logged in (so they follow the account), falling back to the existing `localStorage` `gnome.*` keys for anonymous users. Thread `num_predict`/model through `POST /api/ask` → `streamChat` (`lib/ollama.ts:23`).

---

## 6. New Personas & Outfits (curated batch ~12)

Built mostly from the **existing** costume vocabulary in `lib/persona.ts`, so most need no new renderer code. Add via the existing `persona(...)` / `SEED_PERSONAS` pattern (`lib/db.ts:321-352`) with `uniqueWardrobe` cases (`lib/db.ts:101`) for 4 outfit variants each.

**Proposed roster** (emoji · vibe · sfx · voice feel):
1. 🔮 **Fortune‑Teller Mystic** — crystal ball & cryptic omens · magic · slow, breathy
2. ⚔️ **Viking Skald** — saga‑singing, booming boasts · nature/chiptune · deep, slow
3. 🍵 **Zen Tea Master** — calm koans, tea metaphors · nature · low, unhurried
4. 🎷 **Jazz Lounge Crooner** — velvet smooth, scat riffs · *jazzy (new)* · low, relaxed
5. 📻 **Late‑Night Conspiracy Host** — harmless "truth is out there" AM radio · robot · mid, fast
6. 🧛 **Gothic Vampire Count** — theatrical Transylvanian, counts things · *spooky (new)* · deep
7. 🌙 **Cottagecore Witch** — cozy herbal spells · whimsy · warm, mid
8. 🏄 **Surfer Dude Sage** — chill beach wisdom, "gnarly" · *oceanic (new)* · relaxed
9. 🤖 **Robot Butler** — impeccably polite, faint beep‑boop · robot · even, measured
10. 🎭 **Shakespearean Bard** — thee/thou, iambic flourish · whimsy · mid, dramatic
11. 🪖 **Drill Sergeant** — shouty tough‑love motivation (clean) · corporate · fast, low
12. 🩷 **80s Aerobics Instructor** — peppy "feel the burn!" · *chiptune (new)* · fast, high

Each gets: name, emoji, description, an in‑style system prompt (parody, 2–3 sentences, "tiny real answer wrapped in flavor"), temperature, 4 outfit variants, voice (`voiceId` + rate/pitch/speed), `sfx`, moods.

**New SFX themes** → add to `SfxTheme` (`lib/persona.ts:186`) + `THEMES` (`lib/sound.ts`): `chiptune` (square 8‑bit arpeggio), `spooky` (low minor sine/triangle), `jazzy` (warm swung triangle), `oceanic` (soft watery sine). Update `normalizeMeta` validation + `SFX_THEMES`.

**New outfit pieces** (small, high‑impact; each needs a draw branch in `components/OracleCanvas.tsx`): hats `crown`, `viking-helm`, `top-hat`; held `crystal-ball`, `lute`, `tea-cup`; face `monocle`, `vampire-fangs`; pattern `flames`. Extend each union type + its `*_STYLES` array + `normalizeMeta`, then render. (Personas are designed to still look good with only existing pieces if a renderer addition is deferred.)

---

## Dependencies & Config

- **Add:** `kysely` + `pg` + `@types/pg` (dual‑DB); `kokoro-js` (+ `@huggingface/transformers`, client‑only via dynamic import). Verify `next.config.ts` keeps server‑only packages external (`better-sqlite3`, `pg`) and doesn't bundle Kokoro/`onnxruntime-node` server‑side.
- **No new deps** for auth (Node `crypto`) or uploads (`Request.formData()` + `fs`).
- **New env vars:** `DATABASE_URL` (optional Postgres seed), `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ALLOW_SIGNUP`, `SESSION_TTL_DAYS`. Document in `README.md` and set in both installers; add the Kokoro model download to `deploy/install-linux.sh` and `deploy/install-service.ps1`. Add `data/db-config.json` to `.gitignore`.

## 7. Documentation (added before implementation, per request)

Every slice above ships with documentation so the upgrade is reviewable and maintainable. Documentation lives in three places and is wired into the app itself for in‑product review.

### 7.1 Inline code documentation
- Every new module (`lib/schema.ts`, `lib/dbConfig.ts`, `lib/auth.ts`, `lib/kokoroTts.ts`, `lib/settings.ts`, new API routes, `middleware.ts`) opens with a file‑level doc comment explaining its responsibility, its place in the architecture, and any cross‑dialect / security / SSR caveats.
- Every exported function gets a doc comment covering parameters, return shape, side effects (DB writes, cookies, process exit on DB switch), and failure modes. Non‑obvious logic (async streaming `flush`, scrypt compare, FK‑ordered row copy, sequence reset, Kokoro fallback) gets inline `//` rationale comments.

### 7.2 Markdown — one file per page
- New directory `docs/pages/` with a Markdown file per user‑facing route: `home.md` (`/`), `history.md`, `lab.md`, `login.md`, `signup.md`, `settings.md`, `docs.md`. Each describes the page's purpose, the controls on it, which APIs it calls, auth requirements, and the persisted state (DB vs `localStorage`).

### 7.3 Markdown — one file per feature
- New directory `docs/features/` with a Markdown file per workstream: `database.md` (Kysely repo + bootstrap config), `auth.md`, `per-user-data.md`, `tune-uploads.md`, `settings.md`, `postgres-switch.md`, `voice-kokoro.md`, `personas.md`. Each covers the design decision, the schema/migrations involved, the routes, env vars, and the verification steps from the plan.

### 7.4 In‑app `/docs` route (review surface)
- New route `app/docs/` renders the Markdown under `docs/` so the docs can be read inside the running app. `GET /api/docs` lists available docs; `GET /api/docs/[...slug]` returns the raw Markdown for a file (path‑sanitized, restricted to the `docs/` tree). `app/docs/page.tsx` shows an index (Pages + Features); `app/docs/[...slug]/page.tsx` renders a doc with a lightweight Markdown renderer (no heavy dependency). A **📚 Docs** link is added to the main nav, and each page's doc is linked from a small "ⓘ About this page" affordance.
- `docs/README.md` is the documentation index/table of contents.

### 7.5 README & deploy
- `README.md` gains the new env vars (`DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ALLOW_SIGNUP`, `SESSION_TTL_DAYS`, Kokoro model path), the new directories (`data/music/`, `data/db-config.json`, `public/models/kokoro/`), and a pointer to `/docs`. Installer scripts get comments for the model download + env setup.

---

## Suggested implementation order
0. **Documentation scaffolding** — create `docs/` tree, the `/docs` route, and `/api/docs`; then document each slice as it lands (inline + per‑page + per‑feature).
1. **DB repository refactor** (Kysely + `lib/schema.ts`, SQLite dialect, migrations, async helpers + await all call sites) — get the app fully working on SQLite through the new layer first.
2. **Auth foundation** (users/sessions tables, `lib/auth.ts`, login/signup/logout, middleware).
3. **Per‑user scoping** of history & characters (repository + ask/history/characters routes + nav).
4. **Tune uploads** (data/music dir, tracks table, upload/list/stream/delete routes, admin UI).
5. **Settings panel** consolidation + new settings (incl. `/api/models`, settings persistence).
6. **Postgres adapter + admin switch** (PostgresDialect, test/switch routes, data‑copy migration, restart, Database settings UI).
7. **Kokoro voice** engine + persona `voiceId` mapping + offline model vendoring.
8. **New personas, SFX themes, outfit pieces.**

## Risks / watch-outs
- **Async refactor blast radius:** every DB call site becomes `await`; the streaming `flush()` in the ask route must go async. Do step 1 carefully and verify the full app on SQLite before adding Postgres.
- **Cross‑dialect gotchas:** identity/sequence handling on data copy (reset Postgres sequences after inserting explicit ids), boolean vs integer for `favorite`/`is_seed`, timestamp formats. Kysely smooths syntax but these need testing on both engines.
- **DB switch safety:** admin‑only endpoints; never log the connection string; copy is one‑way (SQLite → Postgres) and leaves SQLite intact as a backup; clearly warn about the restart.
- **Standalone + uploads:** must use `data/music/`, not `public/`; verify under the standalone CWD.
- **Kokoro bundle/SSR:** keep out of the server bundle (dynamic import), guard `window`/WebGPU; large first download covered by the fallback. WebGPU needs HTTPS/localhost.
- **Per‑user history migration:** existing `history` rows get `user_id = NULL`; recommend assigning them to the bootstrap admin on migrate.

## Verification
- **Run dev:** `npm run dev` (port 8080). Smoke‑test each slice:
  - **DB layer:** app works end‑to‑end on SQLite through Kysely; migrations create a fresh `gnome.db`; seeds load.
  - **Auth:** sign up → logged in; `/history` & `/lab` redirect to `/login` when logged out; logout clears session; bad password rejected.
  - **Per‑user data:** two accounts see separate history; Lab personas are private; seeds shared; anonymous ask works but isn't saved (no Favorite, no row).
  - **Tunes:** admin uploads `.mp3` → shows in `GET /api/music` and rotates; preview & delete work; non‑admin gets 403; **file lands in `data/music/`, not `public/`**.
  - **Postgres switch:** point at a local Postgres (Docker), **Test** passes, **Switch** migrates schema + copies data, service restarts on Postgres, and prior history/personas/users are all present; revert to SQLite works.
  - **Voice:** Kokoro speaks streamed answers sentence‑by‑sentence with mouth synced; persona change swaps voice; forced unsupported context falls back to `speechSynthesis`; Replay works.
  - **Settings:** model/response‑length/voice/volumes take effect and persist (DB when logged in, localStorage when not); reduce‑motion calms the canvas.
  - **Personas:** new ones appear, answer in character, correct outfits/voices/SFX; new SFX themes audibly differ.
- **Build check:** `npm run build` succeeds (catches Kokoro server‑bundling + Kysely/pg issues) and the standalone output runs.
- **Manual UI pass** via the `webapp-testing` / Playwright skill or `mcp__Claude_Preview__*` tools for login, upload, DB‑switch, and voice flows.
