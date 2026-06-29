// =============================================================================
// lib/tts.ts — client text-to-speech with a pluggable engine
// =============================================================================
// Speaks the streamed answer SENTENCE-BY-SENTENCE so the wizard starts talking
// almost immediately and the mouth stays roughly in sync with the audio.
//
// Two engines share the same sentence buffer (plan §4):
//   • "kokoro"  — Kokoro-82M neural TTS (natural, characterful). PRIMARY.
//   • "browser" — the platform's speechSynthesis. FALLBACK / lightweight option.
//   • "off"     — muted.
// If Kokoro is unsupported or fails to load, we AUTO-FALL BACK to the browser
// voice (resilience, not a separate user setting). The public API is unchanged
// from the original so callers (app/page.tsx) keep working; `setVoice` now also
// carries the Kokoro `voiceId`/`speed`.
// =============================================================================

import type { Voice } from "./persona";
import { kokoro } from "./kokoroTts";

export type TtsEngine = "kokoro" | "browser" | "off";
export type TtsStatus = "idle" | "loading" | "ready" | "fallback";

type SpeakingCb = (speaking: boolean) => void;
type StatusCb = (status: TtsStatus) => void;

class Tts {
  private muted = false;
  private buffer = "";
  private voice: Voice = { rate: 1, pitch: 1, voiceId: "af_heart", speed: 1 };
  private volume = 1; // 0 - 1
  private active = 0; // utterances queued or playing (drives the mouth)
  private listeners = new Set<SpeakingCb>();
  private statusListeners = new Set<StatusCb>();
  private engine: TtsEngine = "kokoro";
  private effectiveEngine: TtsEngine = "kokoro"; // may drop to "browser" on failure
  private status: TtsStatus = "idle";

  /** Browser-speech support (used as the universal fallback gate). */
  supportedBrowser(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  /** Any voice output possible at all? */
  supported(): boolean {
    return this.supportedBrowser() || kokoro.isSupported();
  }

  setEngine(engine: TtsEngine) {
    this.engine = engine;
    this.effectiveEngine = engine;
    if (engine === "off") this.cancel();
    if (engine === "kokoro") {
      // Warm the model so the first answer doesn't wait on a cold download.
      this.warmKokoro();
    }
  }

  getEngine(): TtsEngine {
    return this.engine;
  }

  private warmKokoro() {
    if (!kokoro.isSupported()) {
      this.setStatus("fallback");
      this.effectiveEngine = "browser";
      return;
    }
    this.setStatus("loading");
    void kokoro.ensureLoaded().then((ok) => {
      if (ok) this.setStatus("ready");
      else {
        this.effectiveEngine = "browser";
        this.setStatus("fallback");
      }
    });
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) this.cancel();
  }

  isMuted() {
    return this.muted || this.engine === "off";
  }

  setVoice(v: Voice) {
    this.voice = v;
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
  }

  onSpeakingChange(cb: SpeakingCb): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onStatusChange(cb: StatusCb): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  private setStatus(s: TtsStatus) {
    this.status = s;
    this.statusListeners.forEach((cb) => cb(s));
  }

  private notify() {
    const speaking = this.active > 0;
    this.listeners.forEach((cb) => cb(speaking));
  }

  /** Bracket helpers so BOTH engines update the shared active count. */
  private enter() {
    this.active++;
    this.notify();
  }
  private leave() {
    this.active = Math.max(0, this.active - 1);
    this.notify();
  }

  /** Start a new utterance stream (cancels anything still playing). */
  begin() {
    this.cancel();
    this.buffer = "";
    if (this.effectiveEngine === "kokoro") this.warmKokoro();
  }

  /** Feed a chunk of streamed text; complete sentences are spoken immediately. */
  feed(chunk: string) {
    if (this.isMuted() || !this.supported()) return;
    this.buffer += chunk;
    this.flush(false);
  }

  /** Flush whatever remains at the end of the answer. */
  end() {
    if (this.isMuted() || !this.supported()) return;
    this.flush(true);
  }

  /** Speak a full piece of text on demand (Replay) — works even when muted. */
  replay(text: string) {
    if (!this.supported() || !text.trim()) return;
    this.cancel();
    this.buffer = text;
    this.flush(true);
  }

  private flush(force: boolean) {
    // Pull out complete sentences ending in . ! ? (keep a trailing partial).
    const re = /[^.!?]*[.!?]+(\s|$)/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buffer)) !== null) {
      const sentence = m[0].trim();
      if (sentence) this.speak(sentence);
      lastIndex = re.lastIndex;
    }
    this.buffer = this.buffer.slice(lastIndex);
    if (force && this.buffer.trim()) {
      this.speak(this.buffer.trim());
      this.buffer = "";
    }
  }

  /** Route one sentence to the active engine (with auto-fallback). */
  private speak(text: string) {
    if (this.effectiveEngine === "kokoro") {
      this.speakKokoro(text);
    } else {
      this.speakBrowser(text);
    }
  }

  private speakKokoro(text: string) {
    this.enter();
    let settled = false;
    const onStart = () => {
      /* playback actually began — count already entered */
    };
    const onEnd = () => {
      if (!settled) {
        settled = true;
        this.leave();
      }
    };
    kokoro
      .generateAndPlay({
        text,
        voiceId: this.voice.voiceId ?? "af_heart",
        speed: this.voice.speed ?? this.voice.rate,
        volume: this.volume,
        onStart,
        onEnd,
      })
      .catch(() => {
        // Permanent fallback for the rest of the session.
        this.effectiveEngine = "browser";
        this.setStatus("fallback");
        if (!settled) {
          settled = true;
          this.leave();
        }
        this.speakBrowser(text);
      });
  }

  private speakBrowser(text: string) {
    if (!this.supportedBrowser()) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = this.voice.rate;
    u.pitch = this.voice.pitch;
    u.volume = this.volume;
    const done = () => this.leave();
    u.onend = done;
    u.onerror = done;
    this.enter();
    window.speechSynthesis.speak(u);
  }

  cancel() {
    if (this.supportedBrowser()) window.speechSynthesis.cancel();
    kokoro.cancel();
    this.active = 0;
    this.notify();
  }
}

export const tts = new Tts();
