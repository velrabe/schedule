// Thin Gemini 2.5 Flash client. Returns structured JSON via response_schema.

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

export type GeminiRequest = {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[] };
  generationConfig?: {
    temperature?: number;
    responseMimeType?: "application/json" | "text/plain";
    responseSchema?: Record<string, unknown>;
  };
};

/** Text-only default (cheapest free tier). */
const DEFAULT_MODEL = "gemini-2.0-flash-lite";
/** Vision default when request includes images (lite is weaker on screenshots). */
const DEFAULT_VISION_MODEL = "gemini-2.0-flash";

function resolveModel(hasImage: boolean): string {
  const env = Deno.env.get("GEMINI_MODEL")?.trim();
  if (env) return env;
  return hasImage ? DEFAULT_VISION_MODEL : DEFAULT_MODEL;
}

function endpointFor(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function requestHasImage(req: GeminiRequest): boolean {
  for (const c of req.contents) {
    for (const p of c.parts) {
      if ("inlineData" in p && p.inlineData?.data) return true;
    }
  }
  return false;
}

export async function generate(req: GeminiRequest): Promise<{
  text: string;
  json: unknown;
  usage?: { promptTokens: number; outputTokens: number };
  model: string;
}> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const model = resolveModel(requestHasImage(req));
  const endpoint = endpointFor(model);

  // Gemini free tier occasionally returns 503 / 429 / 500. Retry with exp backoff.
  let res: Response | null = null;
  let lastBody = "";
  const delays = [400, 1200, 3000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    res = await fetch(`${endpoint}?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (res.ok) break;
    lastBody = await res.text();
    const retryable = res.status === 429 || res.status === 500 || res.status === 503;
    if (!retryable || attempt === delays.length) {
      throw new Error(`Gemini ${model} ${res.status}: ${lastBody}`);
    }
    await new Promise((r) => setTimeout(r, delays[attempt] ?? 1000));
  }
  if (!res || !res.ok) {
    throw new Error(`Gemini failed: ${lastBody}`);
  }
  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("");
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {}
  return {
    text,
    json: parsed,
    model,
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
