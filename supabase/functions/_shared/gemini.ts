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

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export async function generate(req: GeminiRequest): Promise<{
  text: string;
  json: unknown;
  usage?: { promptTokens: number; outputTokens: number };
}> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body}`);
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
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
