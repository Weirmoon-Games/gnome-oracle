// Thin client for the local Ollama server. No streaming "thinking" — we use a
// small non-reasoning model (gemma2:2b by default) and cap output length so
// replies come back fast on this GPU-less box.

export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma2:2b";

// Keep the model resident in RAM between requests so only the FIRST reply pays
// the load cost; everything after is snappy.
const KEEP_ALIVE = "30m";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * POST /api/chat with stream:true. Returns the raw fetch Response whose body is
 * newline-delimited JSON ({ message: { content }, done }). Callers pipe/transform
 * it. Throws if Ollama is unreachable.
 */
export async function streamChat(opts: {
  messages: ChatMessage[];
  temperature?: number;
  numPredict?: number;
}): Promise<Response> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: opts.messages,
      stream: true,
      keep_alive: KEEP_ALIVE,
      options: {
        temperature: opts.temperature ?? 0.9,
        num_predict: opts.numPredict ?? 200,
        top_p: 0.9,
        num_ctx: 2048,
      },
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Ollama responded ${res.status}`);
  }
  return res;
}

/**
 * Transform Ollama's NDJSON chat stream into a stream of plain text token
 * chunks suitable for the browser to read directly.
 */
export function ndjsonToTextStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            try {
              const obj = JSON.parse(line);
              const piece: string | undefined = obj?.message?.content;
              if (piece) controller.enqueue(encoder.encode(piece));
            } catch {
              // ignore partial / malformed lines
            }
          }
        }
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });
}

/**
 * Non-streaming JSON generation, used by the persona generator. Asks Ollama for
 * a single JSON object (format:"json") and parses it. Throws on transport error
 * or unparseable output.
 */
export async function generateJSON(prompt: string): Promise<unknown> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      format: "json",
      keep_alive: KEEP_ALIVE,
      options: { temperature: 0.8, num_predict: 400, num_ctx: 2048 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  const content = data?.message?.content ?? "";
  return JSON.parse(content);
}
