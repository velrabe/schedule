// Gemini client: free-tier model rotation (separate RPD per model name).

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

/** Models that often show 0/0 or ~20 RPD on free tier — skip in rotation. */
const BLOCKED_ON_FREE = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-pro-preview-03-25",
]);

/** Separate daily buckets on free tier (generateContent API). Order = try first. */
const TEXT_CHAIN = [
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-flash",
] as const;

const VISION_CHAIN = [
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
] as const;

function requestHasImage(req: GeminiRequest): boolean {
  for (const c of req.contents) {
    for (const p of c.parts) {
      if ("inlineData" in p && p.inlineData?.data) return true;
    }
  }
  return false;
}

function buildChain(hasImage: boolean): string[] {
  const base = hasImage ? [...VISION_CHAIN] : [...TEXT_CHAIN];
  const env = Deno.env.get("GEMINI_MODEL")?.trim();
  const out: string[] = [];
  if (env && !BLOCKED_ON_FREE.has(env) && !out.includes(env)) {
    out.push(env);
  }
  for (const m of base) {
    if (!BLOCKED_ON_FREE.has(m) && !out.includes(m)) out.push(m);
  }
  return out;
}

function endpointFor(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function isQuotaError(status: number, body: string): boolean {
  return status === 429 || /RESOURCE_EXHAUSTED|quota exceeded/i.test(body);
}

function isModelUnavailable(status: number, body: string): boolean {
  return status === 404 || /not found|not supported|invalid model/i.test(body);
}

async function callOnce(
  model: string,
  key: string,
  req: GeminiRequest,
): Promise<{ res: Response; body: string }> {
  const endpoint = endpointFor(model);
  const delays = [300, 900];
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
    await new Promise((r) => setTimeout(r, delays[attempt] ?? 800));
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

  const chain = buildChain(requestHasImage(req));
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
    if (isQuotaError(res.status, body) || isModelUnavailable(res.status, body)) {
      continue;
    }
    throw new Error(lastErr);
  }

  throw new Error(
    `${lastErr}\n(models_tried: ${tried.join(" → ")}). ` +
      `Free tier: 2.5-flash исчерпан (20/день). Live API «Unlimited» — другой продукт, чат его не использует.`,
  );
}
