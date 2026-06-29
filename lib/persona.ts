// Shared persona "meta" types + deterministic fallbacks. NO node-only imports
// here so this module is safe to import from client components too.

export type HatStyle =
  | "wizard"
  | "gnome"
  | "fedora"
  | "cork"
  | "cowboy"
  | "crown" // NEW (Phase 8)
  | "viking-helm" // NEW (Phase 8)
  | "top-hat" // NEW (Phase 8)
  | "none";
export const HAT_STYLES: HatStyle[] = [
  "wizard",
  "gnome",
  "fedora",
  "cork",
  "cowboy",
  "crown",
  "viking-helm",
  "top-hat",
  "none",
];

export type CostumeAccessory =
  | "none"
  | "glasses"
  | "pirate-sash"
  | "sword"
  | "portal-gadget"
  | "martial-belt"
  | "spatula"
  | "lab-goggles"
  | "telescope"
  | "fossil-badge"
  | "mask"
  | "cape"
  | "microphone"
  | "book"
  | "plant"
  | "wrench"
  | "star-map";

export const COSTUME_ACCESSORIES: CostumeAccessory[] = [
  "none",
  "glasses",
  "pirate-sash",
  "sword",
  "portal-gadget",
  "martial-belt",
  "spatula",
  "lab-goggles",
  "telescope",
  "fossil-badge",
  "mask",
  "cape",
  "microphone",
  "book",
  "plant",
  "wrench",
  "star-map",
];

export type HairStyle =
  | "none"
  | "spiky-blue"
  | "nervous-brown"
  | "orange-ears"
  | "bald"
  | "square-porous"
  | "pirate-dreads";
export const HAIR_STYLES: HairStyle[] = [
  "none",
  "spiky-blue",
  "nervous-brown",
  "orange-ears",
  "bald",
  "square-porous",
  "pirate-dreads",
];

export type FaceFeature =
  | "none"
  | "goggles"
  | "sunglasses"
  | "round-glasses"
  | "mask"
  | "beard-stache"
  | "eye-patch"
  | "monocle" // NEW (Phase 8)
  | "vampire-fangs"; // NEW (Phase 8)
export const FACE_FEATURES: FaceFeature[] = [
  "none",
  "goggles",
  "sunglasses",
  "round-glasses",
  "mask",
  "beard-stache",
  "eye-patch",
  "monocle",
  "vampire-fangs",
];

export type TorsoStyle =
  | "robe"
  | "lab-coat"
  | "yellow-shirt"
  | "martial-gi"
  | "beach-shirt"
  | "collared-shirt"
  | "fry-cook"
  | "pirate-coat"
  | "tactical-suit"
  | "detective-coat"
  | "field-vest"
  | "space-robe"
  | "chef-coat"
  | "mechanic-coveralls";
export const TORSO_STYLES: TorsoStyle[] = [
  "robe",
  "lab-coat",
  "yellow-shirt",
  "martial-gi",
  "beach-shirt",
  "collared-shirt",
  "fry-cook",
  "pirate-coat",
  "tactical-suit",
  "detective-coat",
  "field-vest",
  "space-robe",
  "chef-coat",
  "mechanic-coveralls",
];

export type BackItem =
  | "none"
  | "turtle-shell"
  | "twin-swords"
  | "dino-tail"
  | "star-cape"
  | "weather-vane"
  | "backpack";
export const BACK_ITEMS: BackItem[] = [
  "none",
  "turtle-shell",
  "twin-swords",
  "dino-tail",
  "star-cape",
  "weather-vane",
  "backpack",
];

export type HeldItem =
  | "none"
  | "portal-gun"
  | "flask"
  | "fossil-brush"
  | "rock-hammer"
  | "telescope"
  | "red-flashlight"
  | "spatula"
  | "compass"
  | "sword"
  | "wrench"
  | "book"
  | "microphone"
  | "plant-shears"
  | "crystal-ball" // NEW (Phase 8)
  | "lute" // NEW (Phase 8)
  | "tea-cup"; // NEW (Phase 8)
export const HELD_ITEMS: HeldItem[] = [
  "none",
  "portal-gun",
  "flask",
  "fossil-brush",
  "rock-hammer",
  "telescope",
  "red-flashlight",
  "spatula",
  "compass",
  "sword",
  "wrench",
  "book",
  "microphone",
  "plant-shears",
  "crystal-ball",
  "lute",
  "tea-cup",
];

export type CostumePattern =
  | "none"
  | "stars"
  | "fossil-bones"
  | "scales"
  | "bubbles"
  | "lightning"
  | "circuit-lines"
  | "leaf-veins"
  | "flames"; // NEW (Phase 8)
export const COSTUME_PATTERNS: CostumePattern[] = [
  "none",
  "stars",
  "fossil-bones",
  "scales",
  "bubbles",
  "lightning",
  "circuit-lines",
  "leaf-veins",
  "flames",
];

// Sound-effect "flavor" per persona — drives the waveform/notes of the chime,
// typing blip, etc. (mapped to actual synth params in lib/sound.ts).
export type SfxTheme =
  | "magic"
  | "corporate"
  | "nature"
  | "robot"
  | "whimsy"
  | "chiptune" // NEW (Phase 8) — square 8-bit arpeggio
  | "spooky" // NEW (Phase 8) — low minor sine/triangle
  | "jazzy" // NEW (Phase 8) — warm swung triangle
  | "oceanic"; // NEW (Phase 8) — soft watery sine
export const SFX_THEMES: SfxTheme[] = [
  "magic",
  "corporate",
  "nature",
  "robot",
  "whimsy",
  "chiptune",
  "spooky",
  "jazzy",
  "oceanic",
];

export interface Appearance {
  hat: HatStyle;
  hatColor: string;
  robeColor: string;
  beardColor: string;
  skin: string;
  accent: string;
  accessory?: CostumeAccessory;
  hair?: HairStyle;
  faceFeature?: FaceFeature;
  torsoStyle?: TorsoStyle;
  backItem?: BackItem;
  heldItem?: HeldItem;
  pattern?: CostumePattern;
}

// Known Kokoro-82M voice ids (plan §4). These drive the in-browser neural TTS
// engine (lib/kokoroTts.ts). The browser-speech fallback ignores `voiceId` and
// uses `rate`/`pitch` instead, so every persona keeps a working voice even when
// Kokoro is unavailable.
export const KOKORO_VOICES = [
  "af_heart",
  "af_bella",
  "af_nicole",
  "af_sarah",
  "am_michael",
  "am_adam",
  "bf_emma",
  "bf_isabella",
  "bm_george",
  "bm_lewis",
] as const;
export type KokoroVoiceId = (typeof KOKORO_VOICES)[number];

export interface Voice {
  rate: number; // 0.5 - 1.6 (browser-speech fallback)
  pitch: number; // 0 - 2 (browser-speech fallback)
  voiceId?: KokoroVoiceId; // Kokoro neural voice (primary engine)
  speed?: number; // 0.5 - 1.6 Kokoro playback speed
}

export interface PersonaMeta {
  appearance: Appearance;
  appearanceVariants: Appearance[];
  voice: Voice;
  sfx: SfxTheme;
  moods: string[];
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
  // Deterministically pick a Kokoro voice from the slug hash so even personas
  // without explicit voice metadata get a stable, characterful neural voice.
  const voiceId = KOKORO_VOICES[(h >> 9) % KOKORO_VOICES.length];
  return {
    appearance: { hat, ...palette },
    appearanceVariants: makeDefaultVariants({ hat, ...palette }),
    voice: { rate: round2(rate), pitch: round2(pitch), voiceId, speed: round2(rate) },
    sfx,
    moods: ["default", "excited", "grumpy", "wise"],
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

  const accessory = COSTUME_ACCESSORIES.includes(a.accessory as CostumeAccessory)
    ? (a.accessory as CostumeAccessory)
    : fallback.appearance.accessory;
  const hair = enumValue(a.hair, HAIR_STYLES, fallback.appearance.hair);
  const faceFeature = enumValue(a.faceFeature, FACE_FEATURES, fallback.appearance.faceFeature);
  const torsoStyle = enumValue(a.torsoStyle, TORSO_STYLES, fallback.appearance.torsoStyle);
  const backItem = enumValue(a.backItem, BACK_ITEMS, fallback.appearance.backItem);
  const heldItem = enumValue(a.heldItem, HELD_ITEMS, fallback.appearance.heldItem);
  const pattern = enumValue(a.pattern, COSTUME_PATTERNS, fallback.appearance.pattern);

  const appearance = {
    hat,
    hatColor: color(a.hatColor, fallback.appearance.hatColor),
    robeColor: color(a.robeColor, fallback.appearance.robeColor),
    beardColor: color(a.beardColor, fallback.appearance.beardColor),
    skin: color(a.skin, fallback.appearance.skin),
    accent: color(a.accent, fallback.appearance.accent),
    accessory,
    hair,
    faceFeature,
    torsoStyle,
    backItem,
    heldItem,
    pattern,
  };

  const rawVariants = Array.isArray(o.appearanceVariants) ? o.appearanceVariants : [];
  const appearanceVariants = normalizeVariants(rawVariants, appearance, fallback.appearanceVariants);

  const moods = Array.isArray(o.moods)
    ? o.moods
        .map((m) => (typeof m === "string" ? m.trim().toLowerCase() : ""))
        .filter(Boolean)
        .slice(0, 8)
    : fallback.moods;

  // Validate the Kokoro voice id against the known list; fall back otherwise.
  const voiceId = KOKORO_VOICES.includes(v.voiceId as KokoroVoiceId)
    ? (v.voiceId as KokoroVoiceId)
    : fallback.voice.voiceId;

  return {
    appearance,
    appearanceVariants,
    voice: {
      rate: num(v.rate, fallback.voice.rate, 0.5, 1.6),
      pitch: num(v.pitch, fallback.voice.pitch, 0, 2),
      voiceId,
      speed: num(v.speed, fallback.voice.speed ?? 1, 0.5, 1.6),
    },
    sfx,
    moods: moods.length ? Array.from(new Set(["default", ...moods])) : fallback.moods,
  };
}

function normalizeVariants(rawVariants: unknown[], first: Appearance, fallback: Appearance[]): Appearance[] {
  const variants: Appearance[] = [];
  for (const raw of rawVariants.slice(0, 4)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const base = variants.length < fallback.length ? fallback[variants.length] : first;
    const hat = HAT_STYLES.includes(o.hat as HatStyle) ? (o.hat as HatStyle) : base.hat;
    const accessory = COSTUME_ACCESSORIES.includes(o.accessory as CostumeAccessory)
      ? (o.accessory as CostumeAccessory)
      : base.accessory;
    const hair = enumValue(o.hair, HAIR_STYLES, base.hair);
    const faceFeature = enumValue(o.faceFeature, FACE_FEATURES, base.faceFeature);
    const torsoStyle = enumValue(o.torsoStyle, TORSO_STYLES, base.torsoStyle);
    const backItem = enumValue(o.backItem, BACK_ITEMS, base.backItem);
    const heldItem = enumValue(o.heldItem, HELD_ITEMS, base.heldItem);
    const pattern = enumValue(o.pattern, COSTUME_PATTERNS, base.pattern);
    const color = (val: unknown, def: string) =>
      typeof val === "string" && /^#[0-9a-fA-F]{3,8}$/.test(val) ? val : def;
    variants.push({
      hat,
      hatColor: color(o.hatColor, base.hatColor),
      robeColor: color(o.robeColor, base.robeColor),
      beardColor: color(o.beardColor, base.beardColor),
      skin: color(o.skin, base.skin),
      accent: color(o.accent, base.accent),
      accessory,
      hair,
      faceFeature,
      torsoStyle,
      backItem,
      heldItem,
      pattern,
    });
  }
  if (variants.length) variants[0] = first;
  else variants.push(first);
  const defaults = makeDefaultVariants(first);
  while (variants.length < 4) variants.push(defaults[variants.length]);
  return variants.slice(0, 4);
}

function enumValue<T extends string>(val: unknown, allowed: readonly T[], def: T | undefined): T | undefined {
  return allowed.includes(val as T) ? (val as T) : def;
}

function makeDefaultVariants(base: Appearance): Appearance[] {
  const accessories: CostumeAccessory[] = [
    base.accessory ?? "none",
    "glasses",
    "cape",
    "book",
  ];
  const hats: HatStyle[] = [base.hat, base.hat === "none" ? "gnome" : base.hat, "wizard", "cowboy"];
  return accessories.map((accessory, i) => ({
    ...base,
    hat: hats[i],
    accessory,
    hatColor: i === 0 ? base.hatColor : shadeHex(base.hatColor, i % 2 === 0 ? 0.12 : -0.12),
    robeColor: i === 0 ? base.robeColor : shadeHex(base.robeColor, i % 2 === 0 ? -0.1 : 0.1),
  }));
}

function shadeHex(hex: string, frac: number): string {
  const m = hex.replace("#", "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m.padEnd(6, "0").slice(0, 6);
  const adjust = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value + 255 * frac)));
  const r = adjust(parseInt(full.slice(0, 2), 16));
  const g = adjust(parseInt(full.slice(2, 4), 16));
  const b = adjust(parseInt(full.slice(4, 6), 16));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
