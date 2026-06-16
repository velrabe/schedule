/** Gemini OCR-only: extract numbers from screenshots — never schedule structure. */

import { generate, type GeminiContent } from "./gemini.ts";

export type ScreenshotExtract = {
  kind: "meal" | "expense" | "activity" | "unknown";
  /** For matching to text event only — NOT for DB write */
  screenshot_time?: string;
  screenshot_date?: string;
  merchant_hint?: string;
  meal?: {
    name?: string;
    kcal?: number;
    protein_g?: number;
    fat_g?: number;
    carbs_g?: number;
    portion_grams?: number;
    notes?: string;
  };
  finance?: {
    amount?: number;
    currency?: string;
    merchant?: string;
    notes?: string;
    category?: string;
  };
  activity?: {
    type?: string;
    calories_burned?: number;
    distance_km?: number;
    pace?: string;
    notes?: string;
  };
};

const OCR_SYSTEM = `You extract structured data from screenshots ONLY.
Return JSON: { "items": [ ... ] }

Each item:
- kind: "meal" | "expense" | "activity" | "unknown"
- screenshot_time: "HH:MM" if visible (for matching only)
- screenshot_date: "YYYY-MM-DD" if visible
- merchant_hint: brand/app name if visible (Grab, Popeyes, Apple Health, etc.)
- meal: { name, kcal, protein_g, fat_g, carbs_g, portion_grams, notes } — for food/calorie apps
- finance: { amount, currency, merchant, notes, category } — for receipts/bank; line items in notes
- activity: { type, calories_burned, distance_km, pace, notes } — for sport trackers

RULES:
- Extract ONLY what is visible. Do not invent.
- Do NOT output session names, event titles, or schedule structure.
- screenshot_time is for internal matching — user text owns all event times.
- One screenshot may yield one or more items (e.g. receipt + meal app).
- If unreadable, omit fields — do not guess macros.`;

export async function extractFromScreenshots(
  images: Array<{ base64: string; mime?: string }>,
): Promise<ScreenshotExtract[]> {
  if (!images.length) return [];

  const parts: GeminiContent["parts"] = [
    {
      text:
        "Extract meal KBJU, expense amounts, and activity metrics from these screenshots. JSON only.",
    },
  ];
  for (const img of images) {
    parts.push({
      inlineData: {
        mimeType: img.mime || "image/jpeg",
        data: img.base64,
      },
    });
  }

  const out = await generate({
    systemInstruction: { parts: [{ text: OCR_SYSTEM }] },
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
  });

  const json = out.json as { items?: ScreenshotExtract[] } | null;
  return Array.isArray(json?.items) ? json!.items! : [];
}
