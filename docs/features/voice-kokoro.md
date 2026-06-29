# Feature: Voice — Kokoro-82M neural TTS

Replaces the flat browser default voice with natural neural voices, 100% in the
browser (plan §4).

## Engines

`lib/tts.ts` exposes the original sentence-by-sentence API but now switches
between engines that share one sentence buffer:

- **`kokoro`** — Kokoro-82M via `kokoro-js` + `@huggingface/transformers`
  (WebGPU with WASM fallback). PRIMARY.
- **`browser`** — the platform `speechSynthesis`. Lightweight option / automatic
  fallback.
- **`off`** — muted.

If Kokoro is unsupported or fails to load, the engine **auto-falls back** to the
browser voice (resilience, not a separate setting).

## `lib/kokoroTts.ts`

- Lazily loads the model via **dynamic `import()`** so it never enters the server
  bundle (and `next.config.ts` lists `kokoro-js` /
  `@huggingface/transformers` as `serverExternalPackages`).
- `generate()` → PCM, converted to an `AudioBuffer` and played through Web Audio.
- A **playback queue** plays sentences back-to-back.
- `onStart`/`onEnd` callbacks drive the shared active-utterance count so the
  canvas mouth animation stays synced exactly like before.

## Persona voice mapping (`lib/persona.ts`)

`Voice` gained optional `voiceId?` (a Kokoro voice such as `af_heart`,
`am_michael`, `bm_george`) and `speed?`. `normalizeMeta` validates `voiceId`
against `KOKORO_VOICES`; `deriveMeta` picks a deterministic default from the slug
hash. Seed personas carry fitting `voiceId`s in `lib/seeds.ts`.

## First-load UX

While the model downloads, the Home page shows "🔮 Summoning the Oracle's
voice…"; the browser voice covers anything until Kokoro is ready (cached
afterwards).

## Offline / LAN

`transformers.js` fetches weights from the HF CDN by default. For offline boxes,
vendor the ONNX model (e.g. `public/models/kokoro/`) and set
`NEXT_PUBLIC_KOKORO_MODEL` (or `window.__KOKORO_MODEL_ID`) to the local path; have
the installers download it during setup. **WebGPU needs a secure context**
(HTTPS or localhost) — the nginx path provides HTTPS.

## Verify

- Kokoro speaks streamed answers sentence-by-sentence with the mouth synced;
  changing persona swaps the voice; a forced-unsupported context falls back to
  `speechSynthesis`; Replay works.

> Note: WebGPU/WASM model execution can't run in this build environment, so the
> voice path was verified by type-check + build; exercise it in a real browser.
