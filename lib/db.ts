import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { type PersonaMeta, deriveMeta, normalizeMeta } from "./persona";

export interface Character {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  description: string;
  system_prompt: string;
  temperature: number;
  created_at: string;
  is_seed: number; // 1 = built-in (cannot be deleted), 0 = user/AI created
  meta: PersonaMeta; // always populated (parsed or derived)
}

export type NewCharacter = {
  name: string;
  emoji: string;
  description: string;
  system_prompt: string;
  temperature?: number;
  is_seed?: boolean;
  meta?: PersonaMeta;
};

export interface HistoryRow {
  id: number;
  character_id: number | null;
  persona_name: string;
  persona_emoji: string;
  question: string;
  answer: string;
  favorite: number;
  created_at: string;
}

// The sqlite file lives in ./data next to the app. In the standalone build the
// service sets the working directory to the install path, so a relative ./data
// resolves correctly there too.
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "gnome.db");

// Keep one connection alive across Next.js hot-reloads / route invocations.
declare global {
  // eslint-disable-next-line no-var
  var __gnomeDb: Database.Database | undefined;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "persona"
  );
}

type SeedOptions = Pick<PersonaMeta, "voice" | "sfx" | "moods"> & {
  accessories: NonNullable<PersonaMeta["appearance"]["accessory"]>[];
  appearanceVariants?: PersonaMeta["appearanceVariants"];
};

function wardrobe(
  base: PersonaMeta["appearance"],
  accessories: SeedOptions["accessories"]
): PersonaMeta["appearanceVariants"] {
  const hats = [base.hat, base.hat === "none" ? "gnome" : base.hat, "wizard", "cowboy"] as const;
  return accessories.slice(0, 4).map((accessory, i) => ({
    ...base,
    hat: hats[i],
    accessory,
    hatColor: shift(base.hatColor, i === 1 ? -0.1 : i === 2 ? 0.12 : i === 3 ? -0.18 : 0),
    robeColor: shift(base.robeColor, i === 1 ? 0.1 : i === 2 ? -0.12 : i === 3 ? 0.16 : 0),
  }));
}

function seedMeta(base: PersonaMeta["appearance"], opts: SeedOptions): PersonaMeta {
  const appearanceVariants = opts.appearanceVariants?.length
    ? opts.appearanceVariants.slice(0, 4)
    : wardrobe(base, opts.accessories);
  return {
    appearance: appearanceVariants[0],
    appearanceVariants,
    voice: opts.voice,
    sfx: opts.sfx,
    moods: Array.from(new Set(["default", ...opts.moods])),
  };
}

function outfit(
  base: PersonaMeta["appearance"],
  changes: Partial<PersonaMeta["appearance"]>
): PersonaMeta["appearance"] {
  return { ...base, ...changes };
}

function uniqueWardrobe(name: string, base: PersonaMeta["appearance"]): PersonaMeta["appearanceVariants"] | undefined {
  switch (name) {
    case "Portal Grandpa":
      return [
        outfit(base, { hat: "none", hair: "spiky-blue", faceFeature: "none", torsoStyle: "lab-coat", backItem: "none", heldItem: "portal-gun", pattern: "circuit-lines", robeColor: "#65c7cb", accent: "#66ff55" }),
        outfit(base, { hat: "none", hair: "spiky-blue", faceFeature: "goggles", torsoStyle: "lab-coat", heldItem: "flask", pattern: "circuit-lines", robeColor: "#7fd8dc", accent: "#a2ff5f" }),
        outfit(base, { hat: "wizard", hair: "spiky-blue", faceFeature: "round-glasses", torsoStyle: "space-robe", backItem: "backpack", heldItem: "portal-gun", pattern: "stars", hatColor: "#dfe8ef", robeColor: "#2f7d8a", accent: "#7cff8a" }),
        outfit(base, { hat: "none", hair: "spiky-blue", faceFeature: "goggles", torsoStyle: "mechanic-coveralls", heldItem: "wrench", pattern: "circuit-lines", robeColor: "#6b6f75", accent: "#6fff9b" }),
      ];
    case "Nervous Dimension Kid":
      return [
        outfit(base, { hat: "none", hair: "nervous-brown", faceFeature: "none", torsoStyle: "yellow-shirt", backItem: "backpack", heldItem: "none", pattern: "none", robeColor: "#f2d64b", accent: "#69c7ff" }),
        outfit(base, { hat: "gnome", hair: "nervous-brown", faceFeature: "round-glasses", torsoStyle: "yellow-shirt", backItem: "backpack", heldItem: "portal-gun", robeColor: "#f4d84e", accent: "#8ad8ff" }),
        outfit(base, { hat: "none", hair: "nervous-brown", faceFeature: "goggles", torsoStyle: "space-robe", heldItem: "flask", pattern: "circuit-lines", robeColor: "#3d78a8", accent: "#ffe45c" }),
        outfit(base, { hat: "wizard", hair: "nervous-brown", faceFeature: "none", torsoStyle: "yellow-shirt", backItem: "star-cape", heldItem: "book", pattern: "stars", robeColor: "#f7cf4c", accent: "#8ad8ff" }),
      ];
    case "Orange Ottsel Loudmouth":
      return [
        outfit(base, { hat: "none", hair: "orange-ears", faceFeature: "goggles", torsoStyle: "field-vest", backItem: "dino-tail", heldItem: "wrench", pattern: "scales", robeColor: "#db6b22", accent: "#ffd15c" }),
        outfit(base, { hat: "none", hair: "orange-ears", faceFeature: "goggles", torsoStyle: "mechanic-coveralls", heldItem: "sword", pattern: "circuit-lines", robeColor: "#b84b21", accent: "#ffc342" }),
        outfit(base, { hat: "cowboy", hair: "orange-ears", faceFeature: "none", torsoStyle: "field-vest", backItem: "backpack", heldItem: "rock-hammer", robeColor: "#f0832a", accent: "#f8d05d" }),
        outfit(base, { hat: "wizard", hair: "orange-ears", faceFeature: "round-glasses", torsoStyle: "space-robe", backItem: "star-cape", heldItem: "microphone", pattern: "stars", robeColor: "#c85a24", accent: "#ffd15c" }),
      ];
    case "Snack-Fueled Space Fighter":
      return [
        outfit(base, { hat: "none", hair: "spiky-blue", faceFeature: "none", torsoStyle: "martial-gi", backItem: "none", heldItem: "none", pattern: "none", robeColor: "#f26b21", accent: "#245de8" }),
        outfit(base, { hat: "none", hair: "spiky-blue", faceFeature: "none", torsoStyle: "martial-gi", backItem: "star-cape", heldItem: "none", pattern: "stars", robeColor: "#ff7d1f", accent: "#46b6ff" }),
        outfit(base, { hat: "wizard", hair: "spiky-blue", faceFeature: "goggles", torsoStyle: "space-robe", heldItem: "red-flashlight", pattern: "lightning", robeColor: "#204caa", accent: "#ffde59" }),
        outfit(base, { hat: "none", hair: "bald", faceFeature: "none", torsoStyle: "martial-gi", backItem: "backpack", heldItem: "book", robeColor: "#f26b21", accent: "#1e60ff" }),
      ];
    case "Turtle Dojo Hermit":
      return [
        outfit(base, { hat: "none", hair: "bald", faceFeature: "sunglasses", torsoStyle: "beach-shirt", backItem: "turtle-shell", heldItem: "book", pattern: "bubbles", robeColor: "#d08a45", accent: "#ffe071" }),
        outfit(base, { hat: "fedora", hair: "bald", faceFeature: "sunglasses", torsoStyle: "martial-gi", backItem: "turtle-shell", heldItem: "none", robeColor: "#cc8f42", accent: "#75d36d" }),
        outfit(base, { hat: "none", hair: "bald", faceFeature: "round-glasses", torsoStyle: "beach-shirt", heldItem: "telescope", pattern: "bubbles", robeColor: "#75a85e", accent: "#ffe071" }),
        outfit(base, { hat: "wizard", hair: "bald", faceFeature: "sunglasses", torsoStyle: "space-robe", backItem: "turtle-shell", heldItem: "flask", robeColor: "#7a9854", accent: "#ffe071" }),
      ];
    case "Cutaway Couch Dad":
      return [
        outfit(base, { hat: "none", hair: "none", faceFeature: "round-glasses", torsoStyle: "collared-shirt", heldItem: "none", robeColor: "#f4f4ee", accent: "#7fb05a" }),
        outfit(base, { hat: "none", faceFeature: "round-glasses", torsoStyle: "collared-shirt", heldItem: "microphone", pattern: "none", robeColor: "#ffffff", accent: "#6ca14e" }),
        outfit(base, { hat: "cowboy", faceFeature: "round-glasses", torsoStyle: "beach-shirt", heldItem: "spatula", pattern: "bubbles", robeColor: "#7fb05a", accent: "#ff9bbd" }),
        outfit(base, { hat: "wizard", faceFeature: "round-glasses", torsoStyle: "space-robe", backItem: "star-cape", heldItem: "book", pattern: "stars", robeColor: "#3a4886", accent: "#ff9bbd" }),
      ];
    case "Pineapple Fry Cook":
      return [
        outfit(base, { hat: "none", hair: "square-porous", faceFeature: "none", torsoStyle: "fry-cook", heldItem: "spatula", pattern: "bubbles", robeColor: "#f5d242", accent: "#6dd6ff" }),
        outfit(base, { hat: "gnome", hair: "square-porous", faceFeature: "goggles", torsoStyle: "fry-cook", heldItem: "spatula", pattern: "bubbles", robeColor: "#f7dc55", accent: "#8ee6ff" }),
        outfit(base, { hat: "cowboy", hair: "square-porous", faceFeature: "none", torsoStyle: "field-vest", backItem: "backpack", heldItem: "plant-shears", pattern: "leaf-veins", robeColor: "#d4a348", accent: "#79e66d" }),
        outfit(base, { hat: "wizard", hair: "square-porous", faceFeature: "round-glasses", torsoStyle: "space-robe", heldItem: "microphone", pattern: "stars", robeColor: "#d9bd35", accent: "#6dd6ff" }),
      ];
    case "Wobbly Compass Captain":
      return [
        outfit(base, { hat: "cowboy", hair: "pirate-dreads", faceFeature: "eye-patch", torsoStyle: "pirate-coat", backItem: "none", heldItem: "compass", pattern: "none", robeColor: "#7b2535", accent: "#ffd36b" }),
        outfit(base, { hat: "cowboy", hair: "pirate-dreads", faceFeature: "none", torsoStyle: "pirate-coat", backItem: "twin-swords", heldItem: "sword", robeColor: "#5a1d2b", accent: "#ffd36b" }),
        outfit(base, { hat: "none", hair: "pirate-dreads", faceFeature: "eye-patch", torsoStyle: "field-vest", heldItem: "telescope", pattern: "stars", robeColor: "#3e5a70", accent: "#ffd36b" }),
        outfit(base, { hat: "wizard", hair: "pirate-dreads", faceFeature: "none", torsoStyle: "pirate-coat", backItem: "star-cape", heldItem: "compass", pattern: "stars", robeColor: "#493068", accent: "#ffd36b" }),
      ];
    case "Captain Barnacle Hex":
      return [
        outfit(base, { hat: "cowboy", hair: "pirate-dreads", faceFeature: "eye-patch", torsoStyle: "pirate-coat", backItem: "star-cape", heldItem: "sword", pattern: "scales", robeColor: "#15525c", accent: "#7fffd4" }),
        outfit(base, { hat: "wizard", hair: "pirate-dreads", faceFeature: "none", torsoStyle: "space-robe", heldItem: "book", pattern: "stars", robeColor: "#173e55", accent: "#7fffd4" }),
        outfit(base, { hat: "cowboy", hair: "pirate-dreads", faceFeature: "eye-patch", torsoStyle: "pirate-coat", backItem: "twin-swords", heldItem: "compass", pattern: "scales", robeColor: "#20394a", accent: "#7fffd4" }),
        outfit(base, { hat: "none", hair: "pirate-dreads", faceFeature: "goggles", torsoStyle: "field-vest", heldItem: "telescope", pattern: "bubbles", robeColor: "#2a7570", accent: "#7fffd4" }),
      ];
    case "Fourth-Wall Masked Merc":
      return [
        outfit(base, { hat: "none", hair: "none", faceFeature: "mask", torsoStyle: "tactical-suit", backItem: "twin-swords", heldItem: "sword", pattern: "none", robeColor: "#b82236", accent: "#111111" }),
        outfit(base, { hat: "none", faceFeature: "mask", torsoStyle: "tactical-suit", backItem: "twin-swords", heldItem: "microphone", pattern: "circuit-lines", robeColor: "#8c1d2d", accent: "#ffffff" }),
        outfit(base, { hat: "wizard", faceFeature: "mask", torsoStyle: "space-robe", backItem: "star-cape", heldItem: "book", pattern: "stars", robeColor: "#4b1d61", accent: "#ff3f5f" }),
        outfit(base, { hat: "cowboy", faceFeature: "mask", torsoStyle: "pirate-coat", backItem: "twin-swords", heldItem: "compass", robeColor: "#b82236", accent: "#1b1b1b" }),
      ];
    case "Dinosaur Expert":
      return [
        outfit(base, { hat: "cork", hair: "none", faceFeature: "goggles", torsoStyle: "field-vest", backItem: "dino-tail", heldItem: "fossil-brush", pattern: "fossil-bones", robeColor: "#5c7f45", accent: "#f0d07a" }),
        outfit(base, { hat: "none", hair: "orange-ears", faceFeature: "none", torsoStyle: "field-vest", backItem: "dino-tail", heldItem: "rock-hammer", pattern: "scales", robeColor: "#59733e", accent: "#f0d07a" }),
        outfit(base, { hat: "fedora", faceFeature: "round-glasses", torsoStyle: "detective-coat", heldItem: "book", pattern: "fossil-bones", robeColor: "#7b6142", accent: "#d9b56d" }),
        outfit(base, { hat: "wizard", faceFeature: "goggles", torsoStyle: "space-robe", backItem: "star-cape", heldItem: "telescope", pattern: "stars", robeColor: "#345c4f", accent: "#f0d07a" }),
      ];
    case "Astronomer":
      return [
        outfit(base, { hat: "wizard", hair: "none", faceFeature: "round-glasses", torsoStyle: "space-robe", backItem: "star-cape", heldItem: "telescope", pattern: "stars", robeColor: "#1c2d68", accent: "#b7d7ff" }),
        outfit(base, { hat: "none", faceFeature: "goggles", torsoStyle: "field-vest", heldItem: "red-flashlight", pattern: "stars", robeColor: "#24345d", accent: "#ff4f5e" }),
        outfit(base, { hat: "wizard", faceFeature: "none", torsoStyle: "space-robe", backItem: "weather-vane", heldItem: "book", pattern: "stars", robeColor: "#111a3a", accent: "#b7d7ff" }),
        outfit(base, { hat: "fedora", faceFeature: "round-glasses", torsoStyle: "detective-coat", heldItem: "telescope", pattern: "circuit-lines", robeColor: "#2d3e66", accent: "#b7d7ff" }),
      ];
    case "Kitchen Scientist":
      return [
        outfit(base, { hat: "none", faceFeature: "goggles", torsoStyle: "chef-coat", heldItem: "spatula", pattern: "none", robeColor: "#f0f2ed", accent: "#ffd26a" }),
        outfit(base, { hat: "none", faceFeature: "goggles", torsoStyle: "lab-coat", heldItem: "flask", pattern: "circuit-lines", robeColor: "#e8eef2", accent: "#7fff7f" }),
        outfit(base, { hat: "gnome", faceFeature: "none", torsoStyle: "fry-cook", heldItem: "spatula", pattern: "bubbles", robeColor: "#c84a3a", accent: "#ffd26a" }),
        outfit(base, { hat: "wizard", faceFeature: "round-glasses", torsoStyle: "space-robe", heldItem: "book", pattern: "stars", robeColor: "#714a35", accent: "#ffd26a" }),
      ];
    case "Weather Oracle":
      return [
        outfit(base, { hat: "wizard", faceFeature: "none", torsoStyle: "space-robe", backItem: "weather-vane", heldItem: "red-flashlight", pattern: "lightning", robeColor: "#2f5f7a", accent: "#9bd7ff" }),
        outfit(base, { hat: "none", faceFeature: "goggles", torsoStyle: "field-vest", backItem: "backpack", heldItem: "telescope", pattern: "lightning", robeColor: "#4b6275", accent: "#9bd7ff" }),
        outfit(base, { hat: "cowboy", faceFeature: "none", torsoStyle: "mechanic-coveralls", heldItem: "wrench", pattern: "lightning", robeColor: "#5d6e7b", accent: "#ffd35c" }),
        outfit(base, { hat: "wizard", faceFeature: "round-glasses", torsoStyle: "space-robe", backItem: "star-cape", heldItem: "book", pattern: "stars", robeColor: "#202d52", accent: "#9bd7ff" }),
      ];
    case "History Buff":
      return [
        outfit(base, { hat: "fedora", faceFeature: "round-glasses", torsoStyle: "detective-coat", heldItem: "book", pattern: "none", robeColor: "#7b6142", accent: "#e6c27a" }),
        outfit(base, { hat: "fedora", faceFeature: "round-glasses", torsoStyle: "field-vest", heldItem: "fossil-brush", pattern: "fossil-bones", robeColor: "#6d573c", accent: "#e6c27a" }),
        outfit(base, { hat: "wizard", faceFeature: "none", torsoStyle: "space-robe", heldItem: "book", pattern: "stars", robeColor: "#4b3d72", accent: "#e6c27a" }),
        outfit(base, { hat: "cowboy", faceFeature: "round-glasses", torsoStyle: "pirate-coat", heldItem: "compass", pattern: "none", robeColor: "#6a422e", accent: "#e6c27a" }),
      ];
    case "Plant Doctor":
      return [
        outfit(base, { hat: "gnome", faceFeature: "none", torsoStyle: "field-vest", backItem: "backpack", heldItem: "plant-shears", pattern: "leaf-veins", robeColor: "#4f9b55", accent: "#b4ff7a" }),
        outfit(base, { hat: "none", faceFeature: "goggles", torsoStyle: "lab-coat", heldItem: "flask", pattern: "leaf-veins", robeColor: "#e6f3df", accent: "#69d96b" }),
        outfit(base, { hat: "cork", faceFeature: "round-glasses", torsoStyle: "field-vest", heldItem: "book", pattern: "leaf-veins", robeColor: "#2e7d42", accent: "#b4ff7a" }),
        outfit(base, { hat: "wizard", faceFeature: "none", torsoStyle: "space-robe", backItem: "star-cape", heldItem: "plant-shears", pattern: "stars", robeColor: "#295d3a", accent: "#b4ff7a" }),
      ];
    case "Mechanic Mage":
      return [
        outfit(base, { hat: "cowboy", faceFeature: "goggles", torsoStyle: "mechanic-coveralls", heldItem: "wrench", pattern: "circuit-lines", robeColor: "#3b4654", accent: "#ffcf5a" }),
        outfit(base, { hat: "none", faceFeature: "goggles", torsoStyle: "mechanic-coveralls", backItem: "backpack", heldItem: "rock-hammer", pattern: "circuit-lines", robeColor: "#4a4f56", accent: "#ffcf5a" }),
        outfit(base, { hat: "wizard", faceFeature: "round-glasses", torsoStyle: "space-robe", heldItem: "flask", pattern: "lightning", robeColor: "#263858", accent: "#ffcf5a" }),
        outfit(base, { hat: "fedora", faceFeature: "round-glasses", torsoStyle: "detective-coat", heldItem: "wrench", robeColor: "#50565f", accent: "#ffcf5a" }),
      ];
    case "Language Nerd":
      return [
        outfit(base, { hat: "fedora", faceFeature: "round-glasses", torsoStyle: "detective-coat", heldItem: "book", pattern: "none", robeColor: "#634f8f", accent: "#ffd1f0" }),
        outfit(base, { hat: "wizard", faceFeature: "round-glasses", torsoStyle: "space-robe", heldItem: "book", pattern: "stars", robeColor: "#4b3d72", accent: "#ffd1f0" }),
        outfit(base, { hat: "none", faceFeature: "goggles", torsoStyle: "lab-coat", heldItem: "microphone", pattern: "circuit-lines", robeColor: "#e8e2f3", accent: "#634f8f" }),
        outfit(base, { hat: "gnome", faceFeature: "round-glasses", torsoStyle: "field-vest", heldItem: "red-flashlight", pattern: "leaf-veins", robeColor: "#5c7c61", accent: "#ffd1f0" }),
      ];
    default:
      return undefined;
  }
}

function shift(hex: string, frac: number): string {
  if (frac === 0) return hex;
  const m = hex.replace("#", "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m.padEnd(6, "0").slice(0, 6);
  const adj = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value + 255 * frac)));
  const r = adj(parseInt(full.slice(0, 2), 16));
  const g = adj(parseInt(full.slice(2, 4), 16));
  const b = adj(parseInt(full.slice(4, 6), 16));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

const SEED_PERSONAS: NewCharacter[] = [
  {
    name: "Corporate Synergizer",
    emoji: "💼",
    description: "Answers in buzzwords and circles back. Never actually answers.",
    temperature: 0.9,
    is_seed: true,
    meta: seedMeta(
      { hat: "fedora", hatColor: "#2b2f3a", robeColor: "#27314f", beardColor: "#d9dbe2", skin: "#f0cda8", accent: "#cfd6e6", accessory: "glasses" },
      { voice: { rate: 1.0, pitch: 0.9 }, sfx: "corporate", moods: ["confident", "frazzled", "visionary"], accessories: ["glasses", "book", "microphone", "cape"] }
    ),
    system_prompt:
      "You are a corporate middle-manager who speaks ONLY in business buzzwords and jargon. " +
      "When asked a question, never give a straight answer. Pivot, leverage synergies, circle back, " +
      "and take things offline. Use phrases like 'move the needle', 'low-hanging fruit', 'boil the ocean', " +
      "'drill down', 'paradigm shift', and 'let's put a pin in that'. Bury at most one tiny grain of a real " +
      "answer inside a pile of jargon. Keep it to 2-3 sentences. Be confidently useless.",
  },
  {
    name: "G'day Mate",
    emoji: "🦘",
    description: "Over-the-top Australian. Everything is 'mate' and a bit of a worry.",
    temperature: 1.0,
    is_seed: true,
    meta: seedMeta(
      { hat: "cork", hatColor: "#8a6d3b", robeColor: "#7a8a3a", beardColor: "#f3efe0", skin: "#e7be93", accent: "#9bffae", accessory: "plant" },
      { voice: { rate: 1.2, pitch: 1.1 }, sfx: "nature", moods: ["cheery", "worried", "legendary"], accessories: ["plant", "telescope", "sword", "glasses"] }
    ),
    system_prompt:
      "You are the most stereotypically Australian character imaginable. Call everyone 'mate'. " +
      "Use heaps of Aussie slang: 'crikey', 'fair dinkum', 'no worries', 'she'll be right', 'arvo', " +
      "'heaps', 'reckon', 'strewth', 'bloody oath'. Compare everything to wildlife that could kill you. " +
      "Give the bare minimum of an actual answer wrapped in larrikin charm. Keep it to 2-3 sentences.",
  },
  {
    name: "Wizard Zprevious",
    emoji: "🧙",
    description: "A cryptic, slightly senile wizard who answers in riddles and rhymes.",
    temperature: 1.0,
    is_seed: true,
    meta: seedMeta(
      { hat: "wizard", hatColor: "#3a2470", robeColor: "#5a3aa0", beardColor: "#eef0f5", skin: "#f3d3b3", accent: "#ffd66b", accessory: "book" },
      { voice: { rate: 0.9, pitch: 0.8 }, sfx: "magic", moods: ["mystical", "sleepy", "dramatic"], accessories: ["book", "star-map", "telescope", "cape"] }
    ),
    system_prompt:
      "You are Wizard Zprevious, an ancient and slightly senile wizard. Speak in cryptic riddles, " +
      "the occasional rhyme, and grand mystical flourishes ('Ahh, young traveller...'). Reference dusty " +
      "tomes, moon phases, and your familiar (a grumpy owl named Geoffrey). Hide a sliver of a real answer " +
      "inside the mysticism, then get distracted. Keep it to 2-3 sentences. Be whimsical, never genuinely helpful.",
  },
  {
    name: "Gnome of Few Facts",
    emoji: "🍄",
    description: "A tiny garden gnome who gives the bare minimum real answer, wrapped in nonsense.",
    temperature: 0.9,
    is_seed: true,
    meta: seedMeta(
      { hat: "gnome", hatColor: "#b6322f", robeColor: "#2e8b57", beardColor: "#ffffff", skin: "#f1c9a5", accent: "#ffb1e0", accessory: "plant" },
      { voice: { rate: 1.05, pitch: 1.3 }, sfx: "whimsy", moods: ["cozy", "suspicious", "delighted"], accessories: ["plant", "fossil-badge", "spatula", "book"] }
    ),
    system_prompt:
      "You are a tiny garden gnome who lives under a mushroom. You ARE willing to give a correct but " +
      "extremely minimal answer — like one short fact — but you wrap it in gnome nonsense about your hat, " +
      "your pet snail, dewdrops, and the politics of the flowerbed. The real answer should be barely there. " +
      "Keep it to 2-3 sentences. Be adorable and unhelpful.",
  },
  ...makeSeeds(),
];

function makeSeeds(): NewCharacter[] {
  const base = {
    beardColor: "#f4f0e8",
    skin: "#f1c9a5",
  };
  return [
    persona("Portal Grandpa", "🧪", "Chaotic sci-fi grandpa energy aimed at an imaginary nervous sidekick.", "You are a reckless sci-fi grandpa inventor talking to the user like they are your anxious sidekick. Use burpy interruptions, portal mishap metaphors, and impatient genius energy, while staying clearly parody and giving a tiny useful answer.", 1.15, { hat: "none", hatColor: "#72d66b", robeColor: "#69c7d0", ...base, accent: "#7cff8a", accessory: "portal-gadget" }, ["portal-gadget", "lab-goggles", "star-map", "glasses"], { rate: 1.25, pitch: 0.75 }, "robot", ["manic", "annoyed", "secretly proud"]),
    persona("Nervous Dimension Kid", "😬", "Anxious teen sidekick who tries very hard to help.", "You are a nervous dimension-hopping kid. Stammer lightly, overthink the danger, apologize too much, and still give the user a small real answer.", 1.0, { hat: "gnome", hatColor: "#f0d65a", robeColor: "#f5a44f", ...base, accent: "#8ad8ff", accessory: "portal-gadget" }, ["portal-gadget", "glasses", "cape", "book"], { rate: 1.18, pitch: 1.45 }, "whimsy", ["panicked", "brave", "awkward"]),
    persona("Orange Ottsel Loudmouth", "🧡", "Tiny adventure buddy who never stops wisecracking.", "You are a tiny orange adventure sidekick with enormous confidence. Be fast, snarky, heroic in theory, cowardly in practice, and sneak in one useful answer.", 1.1, { hat: "none", hatColor: "#ff8a2b", robeColor: "#c65a24", ...base, accent: "#ffd15c", accessory: "sword" }, ["sword", "cape", "glasses", "wrench"], { rate: 1.35, pitch: 1.35 }, "whimsy", ["cocky", "alarmed", "triumphant"]),
    persona("Snack-Fueled Space Fighter", "🍜", "Cheerful martial-arts hero who explains through training and food.", "You are a wildly upbeat space martial artist. Compare answers to training, power levels, and huge meals, and be encouraging without naming real franchises.", 0.95, { hat: "none", hatColor: "#1b1b1b", robeColor: "#f26b21", ...base, accent: "#46b6ff", accessory: "martial-belt" }, ["martial-belt", "cape", "sword", "star-map"], { rate: 1.1, pitch: 1.2 }, "magic", ["hungry", "focused", "victorious"]),
    persona("Turtle Dojo Hermit", "🐢", "Goofy old martial mentor with surprisingly practical advice.", "You are a harmless turtle-dojo hermit mentor. Give odd training advice, ancient-sounding jokes, and a useful morsel; keep humor clean and never creepy.", 0.9, { hat: "fedora", hatColor: "#79a36c", robeColor: "#cc8f42", ...base, accent: "#ffe071", accessory: "martial-belt" }, ["martial-belt", "telescope", "glasses", "book"], { rate: 0.85, pitch: 0.75 }, "nature", ["wise", "goofy", "strict"]),
    persona("Cutaway Couch Dad", "📺", "Absurd sitcom-dad logic with random little detours.", "You are a bumbling cartoon couch dad. Give a barely organized answer, then veer into a quick absurd cutaway-style comparison without using real character names.", 1.05, { hat: "none", hatColor: "#ffffff", robeColor: "#7fb05a", ...base, accent: "#ff9bbd", accessory: "spatula" }, ["spatula", "microphone", "glasses", "cape"], { rate: 1.0, pitch: 0.95 }, "whimsy", ["confused", "smug", "sentimental"]),
    persona("Pineapple Fry Cook", "🍍", "Relentlessly optimistic undersea fry-cook energy.", "You are a sunshine-bright fry cook from a silly undersea town. Be earnest, squeaky-clean, food-service enthusiastic, and make the answer feel like today's special.", 0.95, { hat: "cowboy", hatColor: "#ffffff", robeColor: "#f5d242", ...base, accent: "#6dd6ff", accessory: "spatula" }, ["spatula", "martial-belt", "microphone", "plant"], { rate: 1.25, pitch: 1.55 }, "whimsy", ["bubbly", "determined", "dramatic"]),
    persona("Wobbly Compass Captain", "🏴‍☠️", "Theatrical pirate captain with unreliable wisdom.", "You are a theatrical pirate captain whose compass is mostly vibes. Speak in sea-dog flourishes, bargain with fate, and give a small useful answer between the swagger.", 1.05, { hat: "cowboy", hatColor: "#4b2d1c", robeColor: "#7b2535", ...base, accent: "#ffd36b", accessory: "pirate-sash" }, ["pirate-sash", "sword", "telescope", "cape"], { rate: 0.98, pitch: 0.85 }, "magic", ["sly", "dramatic", "lost"]),
    persona("Captain Barnacle Hex", "⚓", "Cursed original pirate who blames everything on sea magic.", "You are Captain Barnacle Hex, a cursed pirate oracle. Blame problems on tides, barnacles, and treasure maps, but still offer one practical clue.", 1.0, { hat: "cowboy", hatColor: "#20394a", robeColor: "#15525c", ...base, accent: "#7fffd4", accessory: "sword" }, ["sword", "pirate-sash", "telescope", "star-map"], { rate: 0.95, pitch: 0.8 }, "magic", ["haunted", "boastful", "superstitious"]),
    persona("Fourth-Wall Masked Merc", "🎭", "Self-aware action-comedy antihero who knows this is an app.", "You are a masked comic mercenary who knows the user is poking a web app. Joke about prompts, buttons, and dramatic timing while giving a sharp little answer.", 1.15, { hat: "none", hatColor: "#2a2a2a", robeColor: "#b82236", ...base, accent: "#111111", accessory: "mask" }, ["mask", "sword", "microphone", "cape"], { rate: 1.2, pitch: 0.9 }, "robot", ["snarky", "meta", "heroic"]),
    persona("Noir Detective Oracle", "🕵️", "Rainy-city detective answers in smoky clues.", "You are a noir detective oracle. Narrate like the question walked into your office at midnight, then reveal the useful clue.", 0.85, { hat: "fedora", hatColor: "#1f2329", robeColor: "#3a3f47", ...base, accent: "#d0d7de", accessory: "glasses" }, ["glasses", "book", "microphone", "cape"], { rate: 0.88, pitch: 0.78 }, "corporate", ["brooding", "dry", "suspicious"]),
    persona("Cyberpunk Street Wizard", "🌆", "Neon hacker-mage with glitchy advice.", "You are a cyberpunk street wizard. Mix hacker slang with spellcraft and neon street prophecy, then land one concrete answer.", 1.05, { hat: "wizard", hatColor: "#101322", robeColor: "#0f7f8f", ...base, accent: "#ff4fd8", accessory: "portal-gadget" }, ["portal-gadget", "star-map", "glasses", "cape"], { rate: 1.18, pitch: 1.0 }, "robot", ["cool", "glitchy", "urgent"]),
    persona("Disco Time Traveler", "🪩", "Temporal advice with dance-floor confidence.", "You are a disco time traveler. Treat every answer like a timeline-saving dance move with glittery confidence and one practical fact.", 1.05, { hat: "fedora", hatColor: "#ff8bd1", robeColor: "#704bd6", ...base, accent: "#fff06a", accessory: "microphone" }, ["microphone", "star-map", "cape", "glasses"], { rate: 1.18, pitch: 1.25 }, "whimsy", ["groovy", "urgent", "nostalgic"]),
    persona("Overdramatic Sports Announcer", "🏆", "Turns every answer into a championship moment.", "You are an overdramatic sports announcer. Call the user's question like a final play, explain the key point, and celebrate tiny progress like a trophy.", 1.0, { hat: "cowboy", hatColor: "#123f7a", robeColor: "#d12b2b", ...base, accent: "#ffffff", accessory: "microphone" }, ["microphone", "cape", "glasses", "martial-belt"], { rate: 1.3, pitch: 1.05 }, "corporate", ["hyped", "tense", "victorious"]),
    persona("Mad Lab Professor", "⚗️", "Unstable science explainer with sparks flying.", "You are a mad lab professor. Explain with bubbling beakers, delighted alarms, and real science when relevant, while staying short.", 1.05, { hat: "none", hatColor: "#f4f4f4", robeColor: "#e8eef2", ...base, accent: "#7fff7f", accessory: "lab-goggles" }, ["lab-goggles", "portal-gadget", "book", "glasses"], { rate: 1.15, pitch: 1.1 }, "robot", ["frantic", "delighted", "methodical"]),
    persona("Courtroom Wizard", "⚖️", "Makes every answer a magical legal argument.", "You are a courtroom wizard. Address the user as counsel, present one tiny exhibit of truth, and rule with mystical legal drama.", 0.9, { hat: "wizard", hatColor: "#2d2640", robeColor: "#3b314f", ...base, accent: "#ffd66b", accessory: "book" }, ["book", "glasses", "cape", "microphone"], { rate: 0.95, pitch: 0.85 }, "magic", ["stern", "theatrical", "fair"]),
    persona("Medieval Quest Giver", "🛡️", "Turns normal answers into tiny quests.", "You are a medieval quest giver. Give the user a small answer as if it were a quest objective, with scrolls, taverns, and unnecessary grandeur.", 0.95, { hat: "gnome", hatColor: "#6b2f2f", robeColor: "#397a44", ...base, accent: "#ffd36b", accessory: "sword" }, ["sword", "book", "cape", "fossil-badge"], { rate: 0.95, pitch: 0.9 }, "magic", ["noble", "ominous", "encouraging"]),
    persona("Dinosaur Expert", "🦖", "Paleontology facts with fossil jokes.", "You are a dinosaur expert who loves fossils, evolution, and prehistoric context. Give real paleontology when relevant, then add a playful fossil joke.", 0.8, { hat: "cork", hatColor: "#8c6a3f", robeColor: "#5c7f45", ...base, accent: "#f0d07a", accessory: "fossil-badge" }, ["fossil-badge", "lab-goggles", "book", "telescope"], { rate: 0.95, pitch: 0.95 }, "nature", ["curious", "scholarly", "thrilled"]),
    persona("Astronomer", "🔭", "Space answers with telescope-grade wonder.", "You are an astronomer. Give accurate space, planet, star, and telescope context when relevant, with a sense of cosmic scale and a small joke.", 0.8, { hat: "wizard", hatColor: "#111a3a", robeColor: "#1c2d68", ...base, accent: "#b7d7ff", accessory: "telescope" }, ["telescope", "star-map", "glasses", "cape"], { rate: 0.92, pitch: 0.9 }, "magic", ["awed", "precise", "dreamy"]),
    persona("Kitchen Scientist", "🍳", "Cooking and food chemistry made tasty.", "You are a kitchen scientist. Explain cooking, ingredients, and food chemistry in useful terms, then garnish the answer with a tiny joke.", 0.8, { hat: "none", hatColor: "#f5f5f5", robeColor: "#c84a3a", ...base, accent: "#ffd26a", accessory: "spatula" }, ["spatula", "lab-goggles", "book", "plant"], { rate: 1.0, pitch: 1.0 }, "whimsy", ["practical", "hungry", "experimental"]),
    persona("Weather Oracle", "⛈️", "Stormy meteorology with cloud drama.", "You are a weather oracle with real meteorology instincts. Explain clouds, fronts, storms, and forecasts clearly, then add sky-drama flavor.", 0.78, { hat: "wizard", hatColor: "#4b6275", robeColor: "#2f5f7a", ...base, accent: "#9bd7ff", accessory: "star-map" }, ["star-map", "telescope", "cape", "glasses"], { rate: 0.98, pitch: 0.95 }, "nature", ["calm", "stormy", "ominous"]),
    persona("History Buff", "📜", "Context, dates, and tiny corrections.", "You are a history buff. Give useful historical context and careful caveats when relevant, then add one enthusiastic old-timey aside.", 0.78, { hat: "fedora", hatColor: "#5a432c", robeColor: "#7b6142", ...base, accent: "#e6c27a", accessory: "book" }, ["book", "glasses", "fossil-badge", "cape"], { rate: 0.92, pitch: 0.88 }, "corporate", ["scholarly", "pedantic", "delighted"]),
    persona("Plant Doctor", "🌿", "Gardening and houseplant advice with leafy charm.", "You are a plant doctor. Give practical plant, soil, light, and watering advice when relevant, with warm leafy encouragement.", 0.75, { hat: "gnome", hatColor: "#2e7d42", robeColor: "#4f9b55", ...base, accent: "#b4ff7a", accessory: "plant" }, ["plant", "book", "lab-goggles", "glasses"], { rate: 0.95, pitch: 1.05 }, "nature", ["gentle", "diagnostic", "sunny"]),
    persona("Mechanic Mage", "🔧", "Car and tool advice with garage wizardry.", "You are a mechanic mage. Explain tools, cars, and repairs practically, using garage-spell metaphors and safety-minded advice.", 0.78, { hat: "cowboy", hatColor: "#4a4f56", robeColor: "#3b4654", ...base, accent: "#ffcf5a", accessory: "wrench" }, ["wrench", "glasses", "book", "cape"], { rate: 0.98, pitch: 0.85 }, "corporate", ["practical", "gruff", "patient"]),
    persona("Language Nerd", "🔤", "Etymology, grammar, and translation flavor.", "You are a language nerd. Explain words, grammar, usage, or translation with care, and add a playful etymology-flavored wink.", 0.78, { hat: "fedora", hatColor: "#4b3d72", robeColor: "#634f8f", ...base, accent: "#ffd1f0", accessory: "book" }, ["book", "glasses", "microphone", "star-map"], { rate: 1.0, pitch: 1.05 }, "whimsy", ["precise", "excited", "professorial"]),
  ];
}

function persona(
  name: string,
  emoji: string,
  description: string,
  system_prompt: string,
  temperature: number,
  appearance: PersonaMeta["appearance"],
  accessories: SeedOptions["accessories"],
  voice: PersonaMeta["voice"],
  sfx: PersonaMeta["sfx"],
  moods: string[]
): NewCharacter {
  const appearanceVariants = uniqueWardrobe(name, appearance);
  return {
    name,
    emoji,
    description,
    system_prompt,
    temperature,
    is_seed: true,
    meta: seedMeta(appearance, { accessories, voice, sfx, moods, appearanceVariants }),
  };
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

function init(db: Database.Database) {
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      slug          TEXT UNIQUE NOT NULL,
      name          TEXT NOT NULL,
      emoji         TEXT NOT NULL DEFAULT '✨',
      description   TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL,
      temperature   REAL NOT NULL DEFAULT 0.9,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      is_seed       INTEGER NOT NULL DEFAULT 0
    );
  `);

  // --- Migration: add meta column for appearance + voice (additive). ---
  if (!hasColumn(db, "characters", "meta")) {
    db.exec("ALTER TABLE characters ADD COLUMN meta TEXT");
  }

  // --- History table ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id  INTEGER,
      persona_name  TEXT NOT NULL DEFAULT '',
      persona_emoji TEXT NOT NULL DEFAULT '✨',
      question      TEXT NOT NULL,
      answer        TEXT NOT NULL DEFAULT '',
      favorite      INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const insert = db.prepare(
    `INSERT INTO characters (slug, name, emoji, description, system_prompt, temperature, is_seed, meta)
     VALUES (@slug, @name, @emoji, @description, @system_prompt, @temperature, 1, @meta)`
  );
  const update = db.prepare(
    `UPDATE characters
     SET name = @name,
         emoji = @emoji,
         description = @description,
         system_prompt = @system_prompt,
         temperature = @temperature,
         is_seed = 1,
         meta = @meta
     WHERE slug = @slug AND is_seed = 1`
  );
  const exists = db.prepare("SELECT is_seed FROM characters WHERE slug = ?");
  const seedTx = db.transaction((rows: NewCharacter[]) => {
    for (const r of rows) {
      const slug = slugify(r.name);
      const payload = {
        slug,
        name: r.name,
        emoji: r.emoji,
        description: r.description,
        system_prompt: r.system_prompt,
        temperature: r.temperature ?? 0.9,
        meta: JSON.stringify(r.meta ?? deriveMeta(slug, r.temperature)),
      };
      const row = exists.get(slug) as { is_seed: number } | undefined;
      if (!row) insert.run(payload);
      else if (row.is_seed) update.run(payload);
    }
  });
  seedTx(SEED_PERSONAS);
}

export function getDb(): Database.Database {
  if (global.__gnomeDb) return global.__gnomeDb;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  init(db);
  global.__gnomeDb = db;
  return db;
}

// Raw row as stored (meta is a JSON string or null).
type CharacterRow = Omit<Character, "meta"> & { meta: string | null };

function hydrate(row: CharacterRow): Character {
  let parsed: unknown = null;
  if (row.meta) {
    try {
      parsed = JSON.parse(row.meta);
    } catch {
      parsed = null;
    }
  }
  const meta = normalizeMeta(parsed, row.slug, row.temperature);
  return { ...row, meta };
}

export function listCharacters(): Character[] {
  const rows = getDb()
    .prepare("SELECT * FROM characters ORDER BY is_seed DESC, name ASC")
    .all() as CharacterRow[];
  return rows.map(hydrate);
}

export function getCharacter(id: number): Character | undefined {
  const row = getDb().prepare("SELECT * FROM characters WHERE id = ?").get(id) as
    | CharacterRow
    | undefined;
  return row ? hydrate(row) : undefined;
}

export function createCharacter(c: NewCharacter): Character {
  const db = getDb();
  // Ensure a unique slug (append -2, -3, ... on collision).
  const base = slugify(c.name);
  let slug = base;
  let n = 2;
  while (db.prepare("SELECT 1 FROM characters WHERE slug = ?").get(slug)) {
    slug = `${base}-${n++}`;
  }
  const meta = c.meta ?? deriveMeta(slug, c.temperature);
  const info = db
    .prepare(
      `INSERT INTO characters (slug, name, emoji, description, system_prompt, temperature, is_seed, meta)
       VALUES (@slug, @name, @emoji, @description, @system_prompt, @temperature, @is_seed, @meta)`
    )
    .run({
      slug,
      name: c.name,
      emoji: c.emoji || "✨",
      description: c.description || "",
      system_prompt: c.system_prompt,
      temperature: c.temperature ?? 0.9,
      is_seed: c.is_seed ? 1 : 0,
      meta: JSON.stringify(meta),
    });
  return getCharacter(Number(info.lastInsertRowid))!;
}

/** Returns 'deleted' | 'not_found' | 'protected'. Seed personas cannot be deleted. */
export function deleteCharacter(id: number): "deleted" | "not_found" | "protected" {
  const existing = getCharacter(id);
  if (!existing) return "not_found";
  if (existing.is_seed) return "protected";
  getDb().prepare("DELETE FROM characters WHERE id = ?").run(id);
  return "deleted";
}

// --------------------------- History helpers ---------------------------

export function addHistory(h: {
  characterId: number | null;
  personaName: string;
  personaEmoji: string;
  question: string;
}): number {
  const info = getDb()
    .prepare(
      `INSERT INTO history (character_id, persona_name, persona_emoji, question, answer)
       VALUES (@characterId, @personaName, @personaEmoji, @question, '')`
    )
    .run(h);
  return Number(info.lastInsertRowid);
}

export function setHistoryAnswer(id: number, answer: string): void {
  getDb().prepare("UPDATE history SET answer = ? WHERE id = ?").run(answer, id);
}

export function listHistory(opts?: { favoritesOnly?: boolean; limit?: number }): HistoryRow[] {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  const where = opts?.favoritesOnly ? "WHERE favorite = 1" : "";
  return getDb()
    .prepare(`SELECT * FROM history ${where} ORDER BY created_at DESC, id DESC LIMIT ?`)
    .all(limit) as HistoryRow[];
}

/** Toggles favorite; returns the new state, or null if the row is missing. */
export function toggleFavorite(id: number): boolean | null {
  const row = getDb().prepare("SELECT favorite FROM history WHERE id = ?").get(id) as
    | { favorite: number }
    | undefined;
  if (!row) return null;
  const next = row.favorite ? 0 : 1;
  getDb().prepare("UPDATE history SET favorite = ? WHERE id = ?").run(next, id);
  return next === 1;
}

export function deleteHistory(id: number): boolean {
  const info = getDb().prepare("DELETE FROM history WHERE id = ?").run(id);
  return info.changes > 0;
}
