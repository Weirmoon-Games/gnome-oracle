import { NextRequest } from "next/server";
import { getCharacter, addHistory, setHistoryAnswer } from "@/lib/db";
import { streamChat, ndjsonToTextStream, type ChatMessage } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Appended to every persona so the model stays short, silly, and barely helpful.
const GLOBAL_GUARD =
  " IMPORTANT RULES: Stay fully in character. Keep your reply to 2-3 short sentences. " +
  "Do NOT explain your reasoning or think out loud — just answer immediately. " +
  "Be silly and entertaining, and give only the bare minimum of a real answer (if any).";

function textResponse(text: string): Response {
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(req: NextRequest) {
  let body: { question?: string; characterId?: number };
  try {
    body = await req.json();
  } catch {
    return textResponse("The oracle could not understand your scroll. (bad request)");
  }

  const question = (body.question ?? "").toString().trim();
  const characterId = Number(body.characterId);
  if (!question) return textResponse("Ask me something, won't you?");

  const persona = Number.isFinite(characterId) ? getCharacter(characterId) : undefined;
  if (!persona) return textResponse("That persona has wandered off. Pick another from the list!");

  const messages: ChatMessage[] = [
    { role: "system", content: persona.system_prompt + GLOBAL_GUARD },
    { role: "user", content: question },
  ];

  let ollama: Response;
  try {
    ollama = await streamChat({ messages, temperature: persona.temperature });
  } catch {
    return textResponse(
      "*The oracle's crystal ball has gone dark.* (Could not reach Ollama — is it running?)"
    );
  }

  // Record the exchange now; fill the answer in once the stream completes.
  const historyId = addHistory({
    characterId: persona.id,
    personaName: persona.name,
    personaEmoji: persona.emoji,
    question,
  });

  const textStream = ndjsonToTextStream(ollama.body!);

  // Tee the text through a transform that accumulates the full answer and
  // persists it on flush — no extra client round-trip, no trusting the client.
  const decoder = new TextDecoder();
  let full = "";
  const persisting = textStream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        full += decoder.decode(chunk, { stream: true });
        controller.enqueue(chunk);
      },
      flush() {
        setHistoryAnswer(historyId, full.trim());
      },
    })
  );

  return new Response(persisting, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-History-Id": String(historyId),
    },
  });
}
