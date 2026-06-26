// Client-side audio. Background MUSIC uses the real files dropped in
// public/music (rotated end-to-end via an <audio> element). SOUND EFFECTS and
// the TYPING blip are synthesized live via WebAudio (no extra files). Each of
// music / sfx / typing has its own volume, plus a per-persona SFX "theme".
//
// Browsers block all audio until the first user gesture, so playback is armed
// on the first interaction with the page (see primeOnFirstGesture).

import type { SfxTheme } from "./persona";

interface ThemeParams {
  wave: OscillatorType;
  chime: number[]; // arpeggio for "answer arrived"
  blip: number; // base freq for the typing tick
  blipWave: OscillatorType;
}

const THEMES: Record<SfxTheme, ThemeParams> = {
  magic: { wave: "sine", chime: [523.25, 659.25, 783.99, 1046.5], blip: 1320, blipWave: "sine" },
  corporate: { wave: "square", chime: [440, 392, 330, 294], blip: 600, blipWave: "square" },
  nature: { wave: "triangle", chime: [392, 494, 587, 659], blip: 880, blipWave: "triangle" },
  robot: { wave: "square", chime: [330, 440, 330, 550], blip: 240, blipWave: "square" },
  whimsy: { wave: "triangle", chime: [587, 698, 880, 1175], blip: 1500, blipWave: "triangle" },
};

class SoundEngine {
  // WebAudio (SFX + typing)
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private typingGain: GainNode | null = null;
  private delay: DelayNode | null = null;

  private sfxVolume = 0.6;
  private typingVolume = 0.4;
  private theme: SfxTheme = "magic";
  private lastTypeAt = 0;
  private primed = false;

  // Music (<audio> + playlist)
  private audio: HTMLAudioElement | null = null;
  private tracks: string[] = [];
  private trackIdx = 0;
  private musicEnabled = false;
  private musicVolume = 0.5;

  supported(): boolean {
    return (
      typeof window !== "undefined" &&
      ("AudioContext" in window || "webkitAudioContext" in window)
    );
  }

  // --------------------------- WebAudio graph ---------------------------

  private ensure(): boolean {
    if (!this.supported()) return false;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();

      this.master = this.ctx.createGain();
      this.master.gain.value = 1.0;
      this.master.connect(this.ctx.destination);

      // Soft echo tail for a gentle, dreamy feel.
      this.delay = this.ctx.createDelay(1.0);
      this.delay.delayTime.value = 0.3;
      const feedback = this.ctx.createGain();
      feedback.gain.value = 0.2;
      const wet = this.ctx.createGain();
      wet.gain.value = 0.25;
      this.delay.connect(feedback);
      feedback.connect(this.delay);
      this.delay.connect(wet);
      wet.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.master);
      this.sfxGain.connect(this.delay);

      this.typingGain = this.ctx.createGain();
      this.typingGain.gain.value = this.typingVolume;
      this.typingGain.connect(this.master);
    }
    return true;
  }

  resume() {
    if (!this.ensure()) return;
    if (this.ctx!.state === "suspended") this.ctx!.resume();
  }

  /**
   * Begin audio on the user's first interaction. IMPORTANT: only "activating"
   * gestures (click / key / pointer / touch) unlock audio — mousemove & scroll
   * do NOT, so they are deliberately excluded. We keep listening until music is
   * actually rolling, so a rejected early attempt is retried on the next click.
   */
  primeOnFirstGesture() {
    if (this.primed || typeof window === "undefined") return;
    this.primed = true;
    const events: (keyof DocumentEventMap)[] = [
      "pointerdown",
      "keydown",
      "touchstart",
      "click",
    ];
    const handler = () => {
      this.resume();
      this.tryStartMusic();
      // Stop only once we no longer need a gesture: ctx running and music
      // either playing or not wanted.
      const ctxOk = !this.ctx || this.ctx.state === "running";
      const musicOk = !this.musicEnabled || (this.audio != null && !this.audio.paused);
      if (ctxOk && musicOk) {
        events.forEach((e) => window.removeEventListener(e, handler));
      }
    };
    events.forEach((e) => window.addEventListener(e, handler));
  }

  /** Resume the ctx and (re)start music if enabled — safe to call on any click. */
  tryStartMusic() {
    this.resume();
    if (!this.musicEnabled) return;
    const a = this.ensureMusic();
    if (!a) return;
    if (!a.src) this.loadTrack();
    if (a.paused) void a.play().catch(() => {});
  }

  setTheme(theme: SfxTheme) {
    this.theme = theme;
  }

  // ------------------------------ Music ------------------------------

  private ensureMusic(): HTMLAudioElement | null {
    if (typeof window === "undefined") return null;
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = "auto";
      this.audio.volume = this.musicVolume;
      // When a track finishes, rotate to the next one.
      this.audio.addEventListener("ended", () => {
        if (this.tracks.length === 0) return;
        this.trackIdx = (this.trackIdx + 1) % this.tracks.length;
        this.loadTrack();
        if (this.musicEnabled) void this.audio!.play().catch(() => {});
      });
    }
    return this.audio;
  }

  private loadTrack() {
    const a = this.ensureMusic();
    if (!a || this.tracks.length === 0) return;
    a.src = this.tracks[this.trackIdx];
  }

  setPlaylist(tracks: string[]) {
    this.tracks = tracks;
    if (this.trackIdx >= tracks.length) this.trackIdx = 0;
    const a = this.ensureMusic();
    if (a && tracks.length && !a.src) this.loadTrack();
    if (this.musicEnabled && tracks.length) this.playMusic();
  }

  private playMusic() {
    const a = this.ensureMusic();
    if (!a || this.tracks.length === 0) return;
    if (!a.src) this.loadTrack();
    void a.play().catch(() => {
      /* blocked until a user gesture — primeOnFirstGesture retries */
    });
  }

  setMusicEnabled(on: boolean) {
    this.musicEnabled = on;
    const a = this.ensureMusic();
    if (!a) return;
    if (on) this.playMusic();
    else a.pause();
  }

  isMusicEnabled() {
    return this.musicEnabled;
  }

  setMusicVolume(v: number) {
    this.musicVolume = clamp01(v);
    if (this.audio) this.audio.volume = this.musicVolume;
  }

  // ------------------------------ Volumes ------------------------------

  setSfxVolume(v: number) {
    this.sfxVolume = clamp01(v);
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
  }

  setTypingVolume(v: number) {
    this.typingVolume = clamp01(v);
    if (this.typingGain) this.typingGain.gain.value = this.typingVolume;
  }

  // ------------------------------ SFX ------------------------------

  private tone(
    freq: number,
    when: number,
    dur: number,
    gain: number,
    type: OscillatorType,
    bus: GainNode
  ) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(bus);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  /** Answer-arrived arpeggio (per-persona theme). */
  chime() {
    if (!this.ensure()) return;
    this.resume();
    const tp = THEMES[this.theme];
    const t = this.ctx!.currentTime;
    tp.chime.forEach((f, i) => this.tone(f, t + i * 0.1, 0.6, 0.16, tp.wave, this.sfxGain!));
  }

  sparkle() {
    if (!this.ensure()) return;
    this.resume();
    const tp = THEMES[this.theme];
    const t = this.ctx!.currentTime;
    const top = tp.chime[tp.chime.length - 1];
    for (let i = 0; i < 4; i++) {
      this.tone(top * (1 + Math.random() * 0.4), t + i * 0.05, 0.35, 0.07, tp.wave, this.sfxGain!);
    }
  }

  /** Friendly rising "send" when a question is asked. */
  whoosh() {
    if (!this.ensure() || !this.ctx) return;
    this.resume();
    const tp = THEMES[this.theme];
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = tp.wave;
    o.frequency.setValueAtTime(tp.chime[0], t);
    o.frequency.exponentialRampToValueAtTime(tp.chime[tp.chime.length - 1], t + 0.28);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g);
    g.connect(this.sfxGain!);
    o.start(t);
    o.stop(t + 0.45);
  }

  switchBell() {
    if (!this.ensure()) return;
    this.resume();
    const tp = THEMES[this.theme];
    const t = this.ctx!.currentTime;
    this.tone(tp.chime[1], t, 0.5, 0.13, tp.wave, this.sfxGain!);
    this.tone(tp.chime[3], t + 0.04, 0.4, 0.06, tp.wave, this.sfxGain!);
  }

  /** Short typewriter blip, throttled so streaming text doesn't machine-gun it. */
  typeTick() {
    if (this.typingVolume <= 0 || !this.ensure() || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastTypeAt < 0.045) return; // throttle
    this.lastTypeAt = now;
    const tp = THEMES[this.theme];
    const jitter = 1 + (Math.random() - 0.5) * 0.12;
    this.tone(tp.blip * jitter, now, 0.05, 0.5, tp.blipWave, this.typingGain!);
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

export const sound = new SoundEngine();
