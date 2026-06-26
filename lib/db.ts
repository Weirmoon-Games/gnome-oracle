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

// Explicit appearance + voice for the built-in personas, keyed by slug.
const SEED_META: Record<string, PersonaMeta> = {
  "corporate-synergizer": {
    appearance: {
      hat: "fedora",
      hatColor: "#2b2f3a",
      robeColor: "#27314f",
      beardColor: "#d9dbe2",
      skin: "#f0cda8",
      accent: "#cfd6e6",
    },
    voice: { rate: 1.0, pitch: 0.9 },
    sfx: "corporate",
  },
  "g-day-mate": {
    appearance: {
      hat: "cork",
      hatColor: "#8a6d3b",
      robeColor: "#7a8a3a",
      beardColor: "#f3efe0",
      skin: "#e7be93",
      accent: "#9bffae",
    },
    voice: { rate: 1.2, pitch: 1.1 },
    sfx: "nature",
  },
  "wizard-zprevious": {
    appearance: {
      hat: "wizard",
      hatColor: "#3a2470",
      robeColor: "#5a3aa0",
      beardColor: "#eef0f5",
      skin: "#f3d3b3",
      accent: "#ffd66b",
    },
    voice: { rate: 0.9, pitch: 0.8 },
    sfx: "magic",
  },
  "gnome-of-few-facts": {
    appearance: {
      hat: "gnome",
      hatColor: "#b6322f",
      robeColor: "#2e8b57",
      beardColor: "#ffffff",
      skin: "#f1c9a5",
      accent: "#ffb1e0",
    },
    voice: { rate: 1.05, pitch: 1.3 },
    sfx: "whimsy",
  },
};

const SEED_PERSONAS: NewCharacter[] = [
  {
    name: "Corporate Synergizer",
    emoji: "💼",
    description: "Answers in buzzwords and circles back. Never actually answers.",
    temperature: 0.9,
    is_seed: true,
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
    system_prompt:
      "You are a tiny garden gnome who lives under a mushroom. You ARE willing to give a correct but " +
      "extremely minimal answer — like one short fact — but you wrap it in gnome nonsense about your hat, " +
      "your pet snail, dewdrops, and the politics of the flowerbed. The real answer should be barely there. " +
      "Keep it to 2-3 sentences. Be adorable and unhelpful.",
  },
];

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

  const count = (db.prepare("SELECT COUNT(*) AS n FROM characters").get() as { n: number }).n;
  if (count === 0) {
    const insert = db.prepare(
      `INSERT INTO characters (slug, name, emoji, description, system_prompt, temperature, is_seed, meta)
       VALUES (@slug, @name, @emoji, @description, @system_prompt, @temperature, @is_seed, @meta)`
    );
    const seedTx = db.transaction((rows: NewCharacter[]) => {
      for (const r of rows) {
        const slug = slugify(r.name);
        insert.run({
          slug,
          name: r.name,
          emoji: r.emoji,
          description: r.description,
          system_prompt: r.system_prompt,
          temperature: r.temperature ?? 0.9,
          is_seed: 1,
          meta: JSON.stringify(SEED_META[slug] ?? deriveMeta(slug, r.temperature)),
        });
      }
    });
    seedTx(SEED_PERSONAS);
  } else {
    // Existing db: (re)apply the canonical look/voice/sfx for built-in seeds so
    // upgrades pick up new fields. Only touches rows flagged is_seed.
    const upd = db.prepare("UPDATE characters SET meta = ? WHERE slug = ? AND is_seed = 1");
    for (const [slug, meta] of Object.entries(SEED_META)) {
      upd.run(JSON.stringify(meta), slug);
    }
  }
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
