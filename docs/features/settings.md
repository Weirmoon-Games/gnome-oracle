# Feature: Settings

A consolidated **Settings** page (`/settings`) replaces the old four-slider
panel, grouped into sections (plan §5).

## Groups

| Group | Settings |
|---|---|
| **Voice** | Engine (Kokoro / browser / off); voice override; speed; volume |
| **Audio** | Master mute; music on/off + volume; SFX volume + theme override; typing volume |
| **Oracle / Model** | Model picker (`GET /api/models`); response length (`num_predict`); default response style |
| **Appearance** | Reduce motion; light/dark theme; default persona |
| **Account** | Change password; sign out |
| **Admin** | Manage tunes; manage users; database backend (switch) |

## Persistence

`lib/clientSettings.ts` is the shared model. Anonymous users persist to
`localStorage` (`gnome.*` keys — the original behavior). Signed-in users **also**
sync to the `settings` table via `PUT /api/settings`, so preferences follow the
account. On load, DB settings are merged over the local ones.

`GET /api/settings` returns the user's settings merged over the `global` scope
(or `{}` for anonymous, a 200, so the client falls back to localStorage).

## Live application

Changing a setting immediately updates the `sound`/`tts` singletons and the
`<html data-theme>` / `data-reduce-motion` attributes. The model + response
length are threaded into `POST /api/ask` → `streamChat`.

## Verify

- Model / response-length / voice / volumes take effect and persist (DB when
  signed in, localStorage when not).
- Reduce-motion calms the canvas; light theme restyles the app.
