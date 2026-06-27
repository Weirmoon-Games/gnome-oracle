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
  const appearanceVariants = wardrobe(base, opts.accessories);
  return {
    appearance: appearanceVariants[0],
    appearanceVariants,
    voice: opts.voice,
    sfx: opts.sfx,
    moods: Array.from(new Set(["default", ...opts.moods])),
  };
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
  return {
    name,
    emoji,
    description,
    system_prompt,
    temperature,
    is_seed: true,
    meta: seedMeta(appearance, { accessories, voice, sfx, moods }),
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
