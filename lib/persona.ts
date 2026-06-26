// Shared persona "meta" types + deterministic fallbacks. NO node-only imports
// here so this module is safe to import from client components too.

export type HatStyle = "wizard" | "gnome" | "fedora" | "cork" | "cowboy" | "none";
export const HAT_STYLES: HatStyle[] = ["wizard", "gnome", "fedora", "cork", "cowboy", "none"];

// Sound-effect "flavor" per persona — drives the waveform/notes of the chime,
// typing blip, etc. (mapped to actual synth params in lib/sound.ts).
export type SfxTheme = "magic" | "corporate" | "nature" | "robot" | "whimsy";
export const SFX_THEMES: SfxTheme[] = ["magic", "corporate", "nature", "robot", "whimsy"];

export interface Appearance {
  hat: HatStyle;
  hatColor: string;
  robeColor: string;
  beardColor: string;
  skin: string;
  accent: string;
}

export interface Voice {
  rate: number; // 0.5 - 1.6
  pitch: number; // 0 - 2
}

export interface PersonaMeta {
  appearance: Appearance;
  voice: Voice;
  sfx: SfxTheme;
}

// A handful of cohesive palettes; the slug hash picks one so every persona is
// visually distinct even without explicit metadata.
const PALETTES: Omit<Appearance, "hat">[] = [
  { hatColor: "#3a2470", robeColor: "#5a3aa0", beardColor: "#eef0f5", skin: "#f3d3b3", accent: "#ffd66b" },
  { hatColor: "#1f6f54", robeColor: "#2e8b6b", beardColor: "#f5f3e8", skin: "#e9c39b", accent: "#9bffd6" },
  { hatColor: "#8a2f2f", robeColor: "#c14b4b", beardColor: "#fff", skin: "#f1c9a5", accent: "#ffb1b1" },
  { hatColor: "#2b3a6b", robeColor: "#3d52a0", beardColor: "#e8ecf5", skin: "#f0cda8", accent: "#9bc6ff" },
  { hatColor: "#6b4a8a", robeColor: "#9166b8", beardColor: "#f3eefa", skin: "#eac6b0", accent: "#e7b1ff" },
  { hatColor: "#7a5a20", robeColor: "#b08534", beardColor: "#fbf6e6", skin: "#e7c49a", accent: "#ffe39b" },
  { hatColor: "#205a6b", robeColor: "#2f8aa0", beardColor: "#eaf6f9", skin: "#edc8a6", accent: "#9beaff" },
  { hatColor: "#5a5a5a", robeColor: "#2c3550", beardColor: "#e6e8ee", skin: "#f0cda8", accent: "#cfd6e6" },
];

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Deterministically derive a look + voice from a slug (and temperature). Used
 * whenever a persona has no explicit `meta`, so legacy/manual personas still
 * get a distinct, stable appearance.
 */
export function deriveMeta(slug: string, temperature = 0.9): PersonaMeta {
  const h = hashString(slug || "persona");
  const palette = PALETTES[h % PALETTES.length];
  const hat = HAT_STYLES[(h >> 3) % HAT_STYLES.length];
  // Wackier personas (higher temperature) talk a bit faster and higher.
  const t = clamp(temperature, 0.1, 1.4);
  const rate = clamp(0.85 + (t - 0.5) * 0.45, 0.7, 1.4);
  const pitch = clamp(0.85 + (t - 0.5) * 0.7, 0.6, 1.6);
  const sfx = SFX_THEMES[(h >> 6) % SFX_THEMES.length];
  return {
    appearance: { hat, ...palette },
    voice: { rate: round2(rate), pitch: round2(pitch) },
    sfx,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Validate/normalize a partial meta object (e.g. from the model), filling gaps
 *  from deriveMeta. Always returns a complete PersonaMeta. */
export function normalizeMeta(
  raw: unknown,
  slug: string,
  temperature = 0.9
): PersonaMeta {
  const fallback = deriveMeta(slug, temperature);
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const a = (o.appearance ?? {}) as Record<string, unknown>;
  const v = (o.voice ?? {}) as Record<string, unknown>;

  const hat = HAT_STYLES.includes(a.hat as HatStyle)
    ? (a.hat as HatStyle)
    : fallback.appearance.hat;

  const color = (val: unknown, def: string) =>
    typeof val === "string" && /^#[0-9a-fA-F]{3,8}$/.test(val) ? val : def;

  const num = (val: unknown, def: number, lo: number, hi: number) =>
    typeof val === "number" && Number.isFinite(val) ? clamp(val, lo, hi) : def;

  const sfx = SFX_THEMES.includes(o.sfx as SfxTheme)
    ? (o.sfx as SfxTheme)
    : fallback.sfx;

  return {
    appearance: {
      hat,
      hatColor: color(a.hatColor, fallback.appearance.hatColor),
      robeColor: color(a.robeColor, fallback.appearance.robeColor),
      beardColor: color(a.beardColor, fallback.appearance.beardColor),
      skin: color(a.skin, fallback.appearance.skin),
      accent: color(a.accent, fallback.appearance.accent),
    },
    voice: {
      rate: num(v.rate, fallback.voice.rate, 0.5, 1.6),
      pitch: num(v.pitch, fallback.voice.pitch, 0, 2),
    },
    sfx,
  };
}
