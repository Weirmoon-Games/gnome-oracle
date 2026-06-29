# Page: Lab (`/lab`)

Conjure new personas from a "vibe". **Requires sign-in**; personas you create are
**private to your account** (seeds remain shared and read-only).

## Controls

- **Describe a vibe** + **Conjure a Persona** — asks the model to design one.
- Persona list — your personas show a **Delete** button; seeds show a "built-in"
  badge and can't be deleted.

## APIs called

- `POST /api/characters/generate` — model-designed persona (401 if anonymous).
- `GET /api/characters` — list (seeds + your own).
- `DELETE /api/characters/[id]` — delete your own (403 for seeds).

A 401 bounces you to `/login?next=/lab`.
