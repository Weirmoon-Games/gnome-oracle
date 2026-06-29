# Feature: Personas, SFX themes & outfits

## New curated personas (12)

Added to `lib/seeds.ts` via the existing `persona(...)` pattern, each with name,
emoji, description, an in-style system prompt, temperature, 4 outfit variants, a
Kokoro `voiceId`, an SFX theme, and moods:

🔮 Fortune-Teller Mystic · ⚔️ Viking Skald · 🍵 Zen Tea Master · 🎷 Jazz Lounge
Crooner · 📻 Late-Night Conspiracy Host · 🧛 Gothic Vampire Count · 🌙 Cottagecore
Witch · 🏄 Surfer Dude Sage · 🤖 Robot Butler · 🎭 Shakespearean Bard · 🪖 Drill
Sergeant · 🩷 80s Aerobics Instructor.

## New SFX themes (`lib/persona.ts` + `lib/sound.ts`)

- `chiptune` — bright square-wave 8-bit arpeggio.
- `spooky` — low, minor sine/triangle.
- `jazzy` — warm swung triangle (maj7-ish).
- `oceanic` — soft, watery sine swell.

Added to the `SfxTheme` union + `SFX_THEMES`, with matching `THEMES` entries
(waveform / chime arpeggio / typing blip) in `lib/sound.ts`.

## New outfit pieces (`components/OracleCanvas.tsx`)

Each got a new union member (+ `*_STYLES` array + `normalizeMeta` validation) and
a canvas draw branch:

- Hats: `crown`, `viking-helm`, `top-hat`.
- Held items: `crystal-ball`, `lute`, `tea-cup`.
- Face: `monocle`, `vampire-fangs`.
- Pattern: `flames`.

Personas still render fine if a renderer addition is ever deferred, because
`normalizeMeta` falls back to a known piece.

## Verify

- New personas appear in the dropdown, answer in character, and show the right
  outfits/voices/SFX. New SFX themes audibly differ.
