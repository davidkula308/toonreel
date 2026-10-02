import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const GATEWAY = "https://ai.gateway.lovable.dev";
export const TEXT_MODEL = "openai/gpt-6-astra";
export const VIDEO_MODEL = "google/gemini-omni-1.1-flash";

function apiKey() {
  const key = process.env['LOVABLE_API_KEY'];
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

export async function createVideoJob(input: string, seconds: number, aspect: string, opts: { resolution?: "720p" | "1080p"; imageUrl?: string } = {}) {
  const send = (body: unknown) =>
    fetch(`${GATEWAY}/v1/videos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VIDEO_MODEL,
        input: body,
        response_format: {
          type: "video",
          resolution: opts.resolution ?? "720p",
          duration: `${Math.min(10, Math.max(3, Math.round(seconds)))}s`,
          aspect_ratio: aspect === "9:16" ? "9:16" : "16:9",
        },
      }),
    });
  if (opts.imageUrl) {
    // Animate from the Nano Banana keyframe; fall back to text-only if not accepted.
    const res = await send([
      { role: "user", content: [{ type: "input_text", text: `Animate this keyframe. ${input}` }, { type: "input_image", image_url: opts.imageUrl }] },
    ]);
    if (res.ok || res.status === 402 || res.status === 429) return jobRes(res);
    console.warn("Keyframe video input rejected, falling back to text", res.status, await res.text().catch(() => ""));
  }
  return jobRes(await send(input));
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

export const CHAT_MODEL = "google/gemini-3.8-flash";
export const IMAGE_MODEL = "google/gemini-3.1-flash-image"; // Nano Banana

type ChatPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMsg = { role: "system" | "user" | "assistant"; content: string | ChatPart[] };

async function gatewayError(res: Response) {
  const body = (await res.json().catch(() => null)) as { message?: string; error?: { message?: string } } | null;
  if (res.status === 402) return new Error("AI credits are used up. Please add credits to keep chatting.");
  if (res.status === 429) return new Error("Too many requests right now. Please wait a moment and try again.");
  return new Error(body?.message ?? body?.error?.message ?? `AI request failed (${res.status})`);
}

/** Streams a Gemini chat completion server-side and returns the final text. */
export async function chatGemini(messages: ChatMsg[]) {
  const key = apiKey();
  const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model: CHAT_MODEL, messages, stream: true }),
  });
  if (!res.ok || !res.body) throw await gatewayError(res);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        text += j.choices?.[0]?.delta?.content ?? "";
      } catch { /* partial */ }
    }
  }
  return text;
}

/** Generates an image with Nano Banana; returns raw bytes + mime. */
export async function nanoBanana(prompt: string, refUrls: string[]) {
  const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      modalities: ["image", "text"],
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...refUrls.map((url) => ({ type: "image_url", image_url: { url } }))] }],
    }),
  });
  if (!res.ok) throw await gatewayError(res);
  const j = (await res.json()) as any;
  const url: string | undefined = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url?.startsWith("data:")) throw new Error("The image could not be created. Please try again.");
  const [meta, b64] = url.split(",");
  const mime = meta!.slice(5).split(";")[0] || "image/png";
  return { bytes: Uint8Array.from(atob(b64!), (c) => c.charCodeAt(0)), mime };
}
