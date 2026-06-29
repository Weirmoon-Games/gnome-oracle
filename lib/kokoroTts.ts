// =============================================================================
// lib/kokoroTts.ts — in-browser neural TTS engine (Kokoro-82M)
// =============================================================================
// The PRIMARY voice engine (plan §4): natural, characterful, 100% client-side.
// The model + runtime (`kokoro-js` + `@huggingface/transformers`) are LAZILY
// loaded via dynamic import, so they never enter the server bundle and the page
// stays light until voice is actually needed. WebGPU is used when available,
// with a WASM fallback.
//
// This module exposes a tiny imperative surface consumed by `lib/tts.ts`:
//   • isSupported()            — quick capability gate (browser + WebAudio)
//   • ensureLoaded()           — kick off / await the one-time model download
//   • generateAndPlay(text,…)  — synthesize a sentence and queue it for back-to-
//                                 back playback, calling onStart/onEnd so the
//                                 caller can drive the mouth-animation count
//   • cancel()                 — stop everything and clear the queue
//
// OFFLINE / LAN: set `window.__KOKORO_MODEL_ID` (or NEXT_PUBLIC_KOKORO_MODEL) to
// a locally-vendored model path to avoid hitting the HF CDN. WebGPU requires a
// secure context (HTTPS or localhost) — see deploy docs.
// =============================================================================

import type { KokoroVoiceId } from "./persona";

const DEFAULT_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

interface PlayItem {
  text: string;
  voiceId: KokoroVoiceId;
  speed: number;
  volume: number;
  onStart: () => void;
  onEnd: () => void;
}

// Minimal structural type for what kokoro-js returns from generate().
interface RawAudioLike {
  audio: Float32Array;
  sampling_rate: number;
}
interface KokoroModelLike {
  generate(text: string, opts: { voice: string; speed: number }): Promise<RawAudioLike>;
}

class KokoroEngine {
  private model: KokoroModelLike | null = null;
  private loadPromise: Promise<boolean> | null = null;
  private ctx: AudioContext | null = null;
  private queue: PlayItem[] = [];
  private playing = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private generation = 0; // bumped on cancel() to abandon in-flight work

  /** Browser + WebAudio present. (Model support is probed during load.) */
  isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      ("AudioContext" in window || "webkitAudioContext" in window)
    );
  }

  private modelId(): string {
    if (typeof window !== "undefined") {
      const w = window as unknown as { __KOKORO_MODEL_ID?: string };
      if (w.__KOKORO_MODEL_ID) return w.__KOKORO_MODEL_ID;
    }
    return process.env.NEXT_PUBLIC_KOKORO_MODEL || DEFAULT_MODEL_ID;
  }

  private ensureCtx(): AudioContext | null {
    if (!this.isSupported()) return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  /**
   * Lazily download + initialize the model. Returns true once ready, false if
   * unsupported or loading failed (caller should fall back to browser speech).
   * Safe to call repeatedly — the work happens at most once.
   */
  ensureLoaded(): Promise<boolean> {
    if (!this.isSupported()) return Promise.resolve(false);
    if (this.model) return Promise.resolve(true);
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        // Dynamic import keeps this out of the server bundle entirely.
        const mod = (await import("kokoro-js")) as unknown as {
          KokoroTTS: {
            from_pretrained(
              id: string,
              opts: { dtype: string; device: string }
            ): Promise<KokoroModelLike>;
          };
        };
        const device = (await hasWebGPU()) ? "webgpu" : "wasm";
        // q8 weights keep the download small and run fine on CPU/WASM.
        this.model = await mod.KokoroTTS.from_pretrained(this.modelId(), {
          dtype: device === "webgpu" ? "fp32" : "q8",
          device,
        });
        return true;
      } catch {
        this.model = null;
        return false;
      }
    })();
    return this.loadPromise;
  }

  /** Queue a sentence for synthesis + sequential playback. */
  async generateAndPlay(item: PlayItem): Promise<void> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.model) {
      // Engine unavailable — signal completion so counts don't leak.
      item.onStart();
      item.onEnd();
      throw new Error("kokoro unavailable");
    }
    this.queue.push(item);
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    const myGen = this.generation;
    while (this.queue.length && myGen === this.generation) {
      const item = this.queue.shift()!;
      try {
        const raw = await this.model!.generate(item.text, {
          voice: item.voiceId,
          speed: item.speed,
        });
        if (myGen !== this.generation) break; // cancelled mid-generate
        // eslint-disable-next-line no-await-in-loop
        await this.playBuffer(raw, item, myGen);
      } catch {
        item.onStart();
        item.onEnd();
      }
    }
    this.playing = false;
  }

  /** Convert the model's PCM to an AudioBuffer and play it to completion. */
  private playBuffer(raw: RawAudioLike, item: PlayItem, myGen: number): Promise<void> {
    const ctx = this.ensureCtx();
    if (!ctx) {
      item.onStart();
      item.onEnd();
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const buffer = ctx.createBuffer(1, raw.audio.length, raw.sampling_rate);
      // Use getChannelData().set() rather than copyToChannel() so we don't trip
      // over TS 5.7's stricter Float32Array<ArrayBuffer> vs <ArrayBufferLike>
      // variance (kokoro-js returns a generically-backed Float32Array).
      buffer.getChannelData(0).set(raw.audio);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = Math.min(1, Math.max(0, item.volume));
      src.connect(gain);
      gain.connect(ctx.destination);
      this.currentSource = src;
      item.onStart();
      const done = () => {
        item.onEnd();
        if (this.currentSource === src) this.currentSource = null;
        resolve();
      };
      src.onended = done;
      if (myGen !== this.generation) {
        done();
        return;
      }
      try {
        if (ctx.state === "suspended") void ctx.resume();
        src.start();
      } catch {
        done();
      }
    });
  }

  /** Stop playback and drop the queue (e.g. a new question arrives). */
  cancel(): void {
    this.generation++;
    this.queue = [];
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        /* already stopped */
      }
      this.currentSource = null;
    }
    this.playing = false;
  }
}

/** Probe WebGPU availability (needs a secure context). */
async function hasWebGPU(): Promise<boolean> {
  try {
    const nav = navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } };
    if (!nav.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

export const kokoro = new KokoroEngine();
