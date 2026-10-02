import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const GATEWAY = "https://ai.gateway.lovable.dev";
export const TEXT_MODEL = "openai/gpt-6-astra";
export const VIDEO_MODEL = "google/gemini-omni-1.1-flash";

function apiKey() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI is not configured yet.");
  return key;
}

/** Streams a Responses call server-side and returns the final text. */
export async function askAI(system: string, prompt: string, effort: "low" | "medium" = "medium") {
  const key = apiKey();
  let runId: string | undefined;
  const provider = createOpenAI({
    baseURL: `${GATEWAY}/v1`,
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);
      const res = await fetch(input, { ...init, headers });
      runId ??= res.headers.get("X-Lovable-AIG-Run-ID") ?? undefined;
      if (res.status === 402) throw new Error("AI credits are used up. Please add credits to keep creating.");
      if (res.status === 429) throw new Error("Too many requests right now. Please wait a moment and try again.");
      return res;
    },
  });
  const result = streamText({
    model: provider.responses(TEXT_MODEL),
    system,
    prompt,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: effort,
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  return await result.text;
}

export function parseJSON<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("The AI reply could not be read. Please try again.");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

type Job = { id: string; status: string; error?: { message?: string } };

async function jobRes(res: Response): Promise<Job> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string; error?: { message?: string } } | null;
    if (res.status === 402) throw new Error("AI credits are used up. Please add credits to make videos.");
    throw new Error(body?.message ?? body?.error?.message ?? `Video request failed (${res.status})`);
  }
  return res.json() as Promise<Job>;
}

export async function createVideoJob(input: string, seconds: number, aspect: string) {
  return jobRes(
    await fetch(`${GATEWAY}/v1/videos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VIDEO_MODEL,
        input,
        response_format: {
          type: "video",
          resolution: "720p",
          duration: `${Math.min(10, Math.max(3, Math.round(seconds)))}s`,
          aspect_ratio: aspect === "9:16" ? "9:16" : "16:9",
        },
      }),
    }),
  );
}

export async function pollVideoJob(id: string) {
  return jobRes(
    await fetch(`${GATEWAY}/v1/videos/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    }),
  );
}

export async function downloadVideo(id: string) {
  const res = await fetch(`${GATEWAY}/v1/videos/${encodeURIComponent(id)}/content`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) throw new Error(`Video download failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}
