// Gemini client with JSON output + automatic model fallback on 429 quota.

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

/** Text-only default (separate free-tier bucket from 2.5-flash). */
const DEFAULT_MODEL = "gemini-2.0-flash-lite";
/** Vision default when request includes images. */
const DEFAULT_VISION_MODEL = "gemini-2.0-flash";

/** Tried in order after primary fails with 429 (separate RPD per model on free tier). */
const FALLBACK_TEXT = ["gemini-2.0-flash-lite", "gemini-2.0-flash"] as const;
const FALLBACK_VISION = ["gemini-2.0-flash", "gemini-2.0-flash-lite"] as const;

function requestHasImage(req: GeminiRequest): boolean {
  for (const c of req.contents) {
    for (const p of c.parts) {
      if ("inlineData" in p && p.inlineData?.data) return true;
    }
  }
  return false;
}

function uniqueModels(primary: string, fallbacks: readonly string[]): string[] {
  const out: string[] = [];
  for (const m of [primary, ...fallbacks]) {
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

function resolvePrimaryModel(hasImage: boolean): string {
  const env = Deno.env.get("GEMINI_MODEL")?.trim();
  if (env) return env;
  return hasImage ? DEFAULT_VISION_MODEL : DEFAULT_MODEL;
}

function modelsToTry(hasImage: boolean): string[] {
  const primary = resolvePrimaryModel(hasImage);
  const pool = hasImage ? FALLBACK_VISION : FALLBACK_TEXT;
  return uniqueModels(primary, pool);
}

function endpointFor(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function isQuotaError(status: number, body: string): boolean {
  return status === 429 || /RESOURCE_EXHAUSTED|quota exceeded/i.test(body);
}

async function callOnce(
  model: string,
  key: string,
  req: GeminiRequest,
): Promise<{ res: Response; body: string }> {
  const endpoint = endpointFor(model);
  const delays = [400, 1200, 3000];
  let res: Response | null = null;
  let lastBody = "";
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    res = await fetch(`${endpoint}?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (res.ok) {
      return { res, body: await res.text() };
    }
    lastBody = await res.text();
    const retryable = res.status === 429 || res.status === 500 || res.status === 503;
    if (!retryable || attempt === delays.length) {
      return { res, body: lastBody };
    }
    await new Promise((r) => setTimeout(r, delays[attempt] ?? 1000));
  }
  return { res: res!, body: lastBody };
}

export async function generate(req: GeminiRequest): Promise<{
  text: string;
  json: unknown;
  usage?: { promptTokens: number; outputTokens: number };
  model: string;
  models_tried?: string[];
}> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const hasImage = requestHasImage(req);
  const chain = modelsToTry(hasImage);
  const tried: string[] = [];
  let lastErr = "";

  for (const model of chain) {
    tried.push(model);
    const { res, body } = await callOnce(model, key, req);
    if (res.ok) {
      const data = JSON.parse(body) as {
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
        models_tried: tried,
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        },
      };
    }
    lastErr = `Gemini ${model} ${res.status}: ${body}`;
    if (!isQuotaError(res.status, body)) {
      throw new Error(lastErr);
    }
    // 429 → try next model in chain (different free-tier RPD bucket)
  }

  throw new Error(
    `${lastErr}\n(models_tried: ${tried.join(" → ")}). ` +
      `На free tier у 2.5 Pro / 2 Flash часто лимит 0/0 — они недоступны без billing. ` +
      `Убери GEMINI_MODEL=gemini-2.5-flash или включи billing.`,
  );
}
