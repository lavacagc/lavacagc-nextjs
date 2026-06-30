/**
 * Shared OpenAI helpers for the blog edge functions (Deno).
 *
 * Raw fetch (no SDK) to match how these functions already call external APIs.
 * Used by generate-blog-post, enhance-blog-content, and generate-blog-image.
 */

const OPENAI_BASE = "https://api.openai.com/v1";

export function getOpenAIKey(): string {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return key;
}

/** True for the GPT-5.x family, which only accepts the default temperature. */
function isGpt5(model: string): boolean {
  return /gpt-5/.test(model);
}

/**
 * Chat completion → returns the assistant message text.
 * `temperature` is silently dropped for GPT-5.x (they reject custom values).
 * `maxTokens` maps to max_completion_tokens for GPT-5.x; omit it to let the
 * model write to its natural length (recommended for full articles).
 */
export async function openaiChat(opts: {
  model: string;
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const key = getOpenAIKey();
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });

  const body: Record<string, unknown> = { model: opts.model, messages };
  if (opts.temperature !== undefined && !isGpt5(opts.model)) {
    body.temperature = opts.temperature;
  }
  if (opts.maxTokens !== undefined) {
    body[isGpt5(opts.model) ? "max_completion_tokens" : "max_tokens"] = opts.maxTokens;
  }

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("OpenAI chat error:", text.substring(0, 500));
    throw new Error(`OpenAI chat error: ${res.status} - ${text.substring(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    console.error("No content in OpenAI response:", JSON.stringify(data).substring(0, 500));
    throw new Error("No content generated");
  }
  return content;
}

/**
 * Text-to-image via the Images API. gpt-image-* always returns base64 PNG
 * (no url option). Returns { b64, mimeType } ready for a data: URL or upload.
 */
export async function openaiImage(opts: {
  model: string;
  prompt: string;
  size?: string; // e.g. "1536x1024" (landscape ~16:9), "1024x1024", "1024x1536"
  quality?: string; // "low" | "medium" | "high" | "auto"
}): Promise<{ b64: string; mimeType: string }> {
  const key = getOpenAIKey();
  const res = await fetch(`${OPENAI_BASE}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      prompt: opts.prompt,
      size: opts.size ?? "1536x1024",
      quality: opts.quality ?? "high",
      n: 1,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("OpenAI image error:", text.substring(0, 500));
    throw new Error(`OpenAI image error: ${res.status} - ${text.substring(0, 200)}`);
  }

  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    console.error("No image data in OpenAI response:", JSON.stringify(data).substring(0, 300));
    throw new Error("No image data in response");
  }
  return { b64, mimeType: "image/png" };
}
