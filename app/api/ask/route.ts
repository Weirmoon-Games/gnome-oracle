// =============================================================================
// app/api/ask/route.ts — stream a persona's answer (open to everyone)
// =============================================================================
// Asking the Oracle stays anonymous-friendly. Behavior:
//   • Resolve the current user (may be null). The persona is fetched scoped to
//     that user (seeds for everyone; private personas only for their owner).
//   • Logged in  → record a history row and return its id via `X-History-Id`,
//                  filling the answer in once the stream completes.
//   • Anonymous  → DON'T persist (no row, no header); streaming is identical.
//   • Optional `model` / `responseLength` (from Settings) are threaded into the
//     Ollama call (plan §5).
// All DB calls are now async (Kysely), so the persisting transform's `flush()`
// is async too.
// =============================================================================

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCharacter, addHistory, setHistoryAnswer } from "@/lib/db";
import { streamChat, ndjsonToTextStream, type ChatMessage } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResponseStyle = "funny-useful" | "mostly-comedy" | "oracle-chaos";

const RESPONSE_STYLE_PROMPTS: Record<ResponseStyle, string> = {
  "funny-useful":
    " Response style: be funny but useful. Give a real, directly relevant answer first, then wrap it in character flavor.",
  "mostly-comedy":
    " Response style: mostly comedy. Include at most one tiny useful fact, and spend most of the reply on the persona bit.",
  "oracle-chaos":
    " Response style: oracle chaos. Be weird, dramatic, and surprising, but do not become incoherent.",
};

const MOOD_PROMPTS: Record<string, string> = {
  default: "",
  excited: " Mood: excited and high-energy.",
  grumpy: " Mood: grumpy, cranky, and reluctant.",
  wise: " Mood: wise, patient, and oddly profound.",
  dramatic: " Mood: dramatic and theatrical.",
  confident: " Mood: extremely confident.",
  frazzled: " Mood: frazzled and barely holding it together.",
  visionary: " Mood: visionary and grandiose.",
  cheery: " Mood: cheery and relaxed.",
  worried: " Mood: worried but trying to stay helpful.",
  legendary: " Mood: legendary and boastful.",
  mystical: " Mood: mystical and cryptic.",
  sleepy: " Mood: sleepy and distracted.",
  cozy: " Mood: cozy and gentle.",
  suspicious: " Mood: suspicious and squinty.",
  delighted: " Mood: delighted and easily impressed.",
};

// Appended to every persona so the model stays short and in character.
const GLOBAL_GUARD =
  " IMPORTANT RULES: Stay fully in character. Keep your reply to 2-3 short sentences. " +
  "Do NOT explain your reasoning or think out loud — just answer immediately. " +
  "Follow the selected response style exactly.";

function textResponse(text: string): Response {
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(req: NextRequest) {
  let body: {
    question?: string;
    characterId?: number;
    responseStyle?: string;
    mood?: string;
    model?: string;
    responseLength?: number;
  };
  try {
    body = await req.json();
  } catch {
    return textResponse("The oracle could not understand your scroll. (bad request)");
  }

  const question = (body.question ?? "").toString().trim();
  const characterId = Number(body.characterId);
  if (!question) return textResponse("Ask me something, won't you?");

  // Anonymous visitors are allowed; they just can't see private personas and
  // their exchanges aren't saved.
  const user = await getCurrentUser();
  const persona = Number.isFinite(characterId)
    ? await getCharacter(characterId, user?.id ?? null)
    : undefined;
  if (!persona) return textResponse("That persona has wandered off. Pick another from the list!");

  const responseStyle = normalizeResponseStyle(body.responseStyle);
  const mood = normalizeMood(body.mood, persona.meta.moods);
  const moodPrompt = MOOD_PROMPTS[mood] ?? ` Mood: ${mood.replace(/-/g, " ")}.`;
  const model = typeof body.model === "string" && body.model ? body.model : undefined;
  const numPredict =
    Number.isFinite(body.responseLength) && (body.responseLength as number) > 0
      ? Math.min(1024, Math.max(32, Math.round(body.responseLength as number)))
      : undefined;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        persona.system_prompt + RESPONSE_STYLE_PROMPTS[responseStyle] + moodPrompt + GLOBAL_GUARD,
    },
    { role: "user", content: question },
  ];

  let ollama: Response;
  try {
    ollama = await streamChat({ messages, temperature: persona.temperature, model, numPredict });
  } catch {
    return textResponse(
      "*The oracle's crystal ball has gone dark.* (Could not reach Ollama — is it running?)"
    );
  }

  // Only logged-in users get a persisted history row.
  let historyId: number | null = null;
  if (user) {
    historyId = await addHistory(
      {
        characterId: persona.id,
        personaName: persona.name,
        personaEmoji: persona.emoji,
        question,
      },
      user.id
    );
  }

  const textStream = ndjsonToTextStream(ollama.body!);

  // Accumulate the full answer and persist it on flush (no extra client
  // round-trip, no trusting the client). flush() is async now that the DB is.
  const decoder = new TextDecoder();
  let full = "";
  const persisting = textStream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        full += decoder.decode(chunk, { stream: true });
        controller.enqueue(chunk);
      },
      async flush() {
        if (historyId != null) await setHistoryAnswer(historyId, full.trim());
      },
    })
  );

  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
  };
  if (historyId != null) headers["X-History-Id"] = String(historyId);

  return new Response(persisting, { headers });
}

function normalizeResponseStyle(raw: unknown): ResponseStyle {
  return raw === "mostly-comedy" || raw === "oracle-chaos" || raw === "funny-useful"
    ? raw
    : "funny-useful";
}

function normalizeMood(raw: unknown, allowed: string[]): string {
  const mood = typeof raw === "string" ? raw.trim().toLowerCase() : "default";
  return allowed.includes(mood) ? mood : "default";
}
