import { NextRequest, NextResponse } from "next/server";
import { createCharacter } from "@/lib/db";
import { generateJSON } from "@/lib/ollama";
import { normalizeMeta, HAT_STYLES, SFX_THEMES, COSTUME_ACCESSORIES } from "@/lib/persona";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildPrompt(vibe: string): string {
  return (
    "You are a creative character designer for a silly meme website where an on-screen " +
    "wizard/gnome answers questions in funny personas. Invent ONE new persona based on this vibe: " +
    `"${vibe}".\n\n` +
    "Respond with ONLY a JSON object with exactly these keys:\n" +
    "{\n" +
    '  "name": short catchy persona name (2-4 words),\n' +
    '  "emoji": a single emoji that fits,\n' +
    '  "description": one short sentence describing how it talks,\n' +
    '  "system_prompt": detailed instructions telling the model how to act as this persona. ' +
    "It MUST stay in character, keep replies to 2-3 sentences, be silly/funny, and give only the " +
    "bare minimum of a real answer.,\n" +
    '  "temperature": a number from 0.6 to 1.2 (higher = wackier),\n' +
    '  "appearance": { "hat": one of ' +
    JSON.stringify(HAT_STYLES) +
    ', "hatColor": hex color, "robeColor": hex color, "beardColor": hex color, ' +
    '"skin": hex color, "accent": hex color (used for glow/sparkles), "accessory": one of ' +
    JSON.stringify(COSTUME_ACCESSORIES) +
    " },\n" +
    '  "appearanceVariants": array of 4 appearance objects using the same shape as "appearance",\n' +
    '  "voice": { "rate": number 0.7 to 1.4 (speech speed), "pitch": number 0.6 to 1.6 (speech pitch) },\n' +
    '  "sfx": one of ' +
    JSON.stringify(SFX_THEMES) +
    ' (the sound-effect flavor that best matches the vibe),\n' +
    '  "moods": array of 3-5 short lowercase mood names\n' +
    "}\n" +
    "Pick colors, costumes, accessories, moods, and an sfx flavor that match the vibe. Do not include any text outside the JSON object."
  );
}

interface GeneratedPersona {
  name: string;
  emoji: string;
  description: string;
  system_prompt: string;
  temperature: number;
}

function validate(obj: unknown): GeneratedPersona | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const system_prompt = typeof o.system_prompt === "string" ? o.system_prompt.trim() : "";
  if (!name || !system_prompt) return null;
  let temperature = typeof o.temperature === "number" ? o.temperature : 0.9;
  if (!Number.isFinite(temperature)) temperature = 0.9;
  temperature = Math.min(1.4, Math.max(0.1, temperature));
  return {
    name: name.slice(0, 60),
    emoji: typeof o.emoji === "string" && o.emoji ? o.emoji.slice(0, 8) : "✨",
    description: typeof o.description === "string" ? o.description.slice(0, 200) : "",
    system_prompt,
    temperature,
  };
}

export async function POST(req: NextRequest) {
  let body: { vibe?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const vibe = (body.vibe ?? "").toString().trim();
  if (!vibe) {
    return NextResponse.json({ error: "Describe a vibe first!" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await generateJSON(buildPrompt(vibe));
  } catch {
    return NextResponse.json(
      { error: "Could not reach the model (is Ollama running?)" },
      { status: 502 }
    );
  }

  const persona = validate(raw);
  if (!persona) {
    return NextResponse.json(
      { error: "The model conjured nonsense. Try a different vibe!" },
      { status: 422 }
    );
  }

  // Pull appearance/voice from the same object; normalizeMeta fills any gaps
  // with a deterministic fallback so a sparse/invalid model reply still works.
  const rawMeta = raw as {
    appearance?: unknown;
    appearanceVariants?: unknown;
    voice?: unknown;
    sfx?: unknown;
    moods?: unknown;
  };
  const meta = normalizeMeta(
    {
      appearance: rawMeta.appearance,
      appearanceVariants: rawMeta.appearanceVariants,
      voice: rawMeta.voice,
      sfx: rawMeta.sfx,
      moods: rawMeta.moods,
    },
    persona.name,
    persona.temperature
  );

  const created = createCharacter({ ...persona, is_seed: false, meta });
  return NextResponse.json(created, { status: 201 });
}
