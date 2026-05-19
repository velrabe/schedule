// POST /chat { message, image_url?, image_base64? }
// → { reply_to_user, actions[], needs_confirmation, raw_log_id }
//
// Flow:
//   1. Save raw_logs row (status=pending)
//   2. Classify domains
//   3. Build context (open sessions, today summary)
//   4. Call Gemini 2.5 Flash with structured JSON output
//   5. Update raw_logs.parsed_json
//   6. Return to client (which then calls /confirm)

import { preflight, json } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/jwt.ts";
import { admin } from "../_shared/db.ts";
import { generate, type GeminiContent } from "../_shared/gemini.ts";
import { loadRules, ALL_DOMAINS } from "../_shared/rules.ts";

const TZ = "Asia/Ho_Chi_Minh";

// Note: we intentionally do NOT pass responseSchema to Gemini — when we do,
// Gemini interprets `data: {type: "object"}` as "empty object satisfies schema"
// and refuses to emit concrete fields. responseMimeType=application/json is
// enough to get clean JSON back, and the few-shot examples enforce the shape.

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, { status: 405 });

  const JWT_SECRET = Deno.env.get("JWT_SECRET");
  if (!JWT_SECRET) return json({ error: "server_misconfigured" }, { status: 500 });

  const auth = await requireAuth(req, JWT_SECRET);
  if (auth instanceof Response) return auth;

  let body: { message?: string; image_base64?: string; image_mime?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const message = (body.message || "").trim();
  if (!message && !body.image_base64) {
    return json({ error: "empty_message" }, { status: 400 });
  }

  const db = admin();

  // 1. Save raw_log row
  const { data: rawLog, error: insertErr } = await db
    .from("raw_logs")
    .insert({ raw_text: message, source: body.image_base64 ? "image" : "chat", status: "pending" })
    .select("id")
    .single();
  if (insertErr || !rawLog) {
    return json({ error: "db_insert_failed", detail: insertErr?.message }, { status: 500 });
  }

  // 2. Pull context: open sessions and today snapshot
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const nowTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const [openSessions, todayDay, todaySessions] = await Promise.all([
    db.from("open_sessions").select("*"),
    db.from("days").select("*").eq("date", today).maybeSingle(),
    db.from("sessions").select("start_time,end_time,type,project,category").eq("date", today),
  ]);

  const context = {
    today,
    now_time: nowTime,
    timezone: TZ,
    open_sessions: openSessions.data || [],
    today_summary: {
      day: todayDay.data || null,
      sessions: todaySessions.data || [],
    },
  };

  // 3. Build prompt
  const systemPrompt = `You are a structured life-logging assistant.
Return ONLY JSON matching the supplied schema — no prose outside JSON.

${loadRules(ALL_DOMAINS)}

Available action types (use in actions[].type):
  - create_work_session_open    { date, start_time, project, category? }
  - close_work_session          { session_id?, end_time, notes? }
  - create_session              { date, start_time, end_time, type, category?, project?, notes? }
  - create_meal                 { date, time?, slot?, name, portion_grams?, kcal?, protein_g?, fat_g?, carbs_g?, confidence?, notes? }
  - create_activity             { date, time?, type, duration_min?, intensity?, notes? }
  - create_substance            { date, time?, name, amount?, unit?, notes? }
  - create_body_metric          { date, time?, metric, value, unit?, notes? }
  - update_day                  { date, wake_time?, sleep_time?, sleep_hours?, mood?, energy?, focus?, weight_kg?, day_type?, notes? }
  - create_finance_transaction  { date, time?, amount, currency, account?, category?, merchant?, txn_type?, notes? }
  - create_event                { date, kind, detail?, severity? }
  - ask_clarification           { question }   ← use when confidence is low or ambiguous

Conventions:
  - Use ISO date (YYYY-MM-DD) and 24h time (HH:MM).
  - For "сейчас", "только что", "сегодня" use the values from CURRENT CONTEXT: today=${today}, now_time=${nowTime}.
  - NEVER emit literal placeholders like "<HH:MM>" — always resolve to actual values.
  - reply_to_user must be a short Russian confirmation prompt like "Понял: ... . Записать?"
  - needs_confirmation=true unless this is a simple substance/body_metric.
  - actions[].data MUST contain concrete fields, never empty {}. Always include "date".

EXAMPLES (input → output):

Input: "75 мг модафинила"
Output:
{
  "reply_to_user": "Записал: модафинил 75 мг.",
  "actions": [
    { "type": "create_substance", "data": { "date": "${today}", "name": "modafinil", "amount": 75, "unit": "mg" } }
  ],
  "needs_confirmation": false
}

Input: "вес 82.4"
Output:
{
  "reply_to_user": "Записал: вес 82.4 кг.",
  "actions": [
    { "type": "create_body_metric", "data": { "date": "${today}", "metric": "weight_kg", "value": 82.4, "unit": "kg" } }
  ],
  "needs_confirmation": false
}

Input: "начал приложение"   (assume now_time=${nowTime})
Output:
{
  "reply_to_user": "Понял: открываю рабочую сессию «приложение» с ${nowTime}. Подтвердить?",
  "actions": [
    { "type": "create_work_session_open", "data": { "date": "${today}", "start_time": "${nowTime}", "project": "child_app", "category": "work_paid" } }
  ],
  "needs_confirmation": true
}

Input: "закончил приложение, иду гулять"   (assume now_time=${nowTime})
Output:
{
  "reply_to_user": "Закрываю «приложение» в ${nowTime} и открываю прогулку. Подтвердить?",
  "actions": [
    { "type": "close_work_session", "data": { "end_time": "${nowTime}" } },
    { "type": "create_session", "data": { "date": "${today}", "start_time": "${nowTime}", "end_time": "${nowTime}", "type": "walk", "category": "walk" } }
  ],
  "needs_confirmation": true
}

Input: "поел пасту с тунцом и манго, посчитай"
Output:
{
  "reply_to_user": "Понял: паста с тунцом + манго. ≈850 ккал (Б45/Ж25/У110). Записать?",
  "actions": [
    { "type": "create_meal", "data": { "date": "${today}", "name": "паста с тунцом и манго", "kcal": 850, "protein_g": 45, "fat_g": 25, "carbs_g": 110, "confidence": "low", "slot": "lunch" } }
  ],
  "needs_confirmation": true
}

Input: "потратил 120к донгов на кофе"
Output:
{
  "reply_to_user": "Расход: 120 000 VND, категория food, merchant: кофейня. Записать?",
  "actions": [
    { "type": "create_finance_transaction", "data": { "date": "${today}", "amount": 120000, "currency": "VND", "category": "food", "merchant": "кофе", "txn_type": "expense" } }
  ],
  "needs_confirmation": true
}

CURRENT CONTEXT (JSON):
${JSON.stringify(context, null, 2)}
`;

  const userParts: GeminiContent["parts"] = [];
  if (message) userParts.push({ text: message });
  if (body.image_base64) {
    userParts.push({
      inlineData: {
        mimeType: body.image_mime || "image/jpeg",
        data: body.image_base64,
      },
    });
  }

  // 4. Call Gemini
  let parsed: {
    reply_to_user: string;
    actions: Array<{ type: string; data: Record<string, unknown> }>;
    needs_confirmation: boolean;
    domains?: string[];
  };
  try {
    const out = await generate({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: userParts }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });
    if (!out.json || typeof out.json !== "object") {
      throw new Error(`Gemini returned non-JSON: ${out.text.slice(0, 200)}`);
    }
    parsed = out.json as typeof parsed;
  } catch (err) {
    await db.from("raw_logs").update({ status: "error", status_reason: String(err) }).eq("id", rawLog.id);
    return json({ error: "llm_failed", detail: String(err) }, { status: 502 });
  }

  // 5. Persist parsed_json
  await db
    .from("raw_logs")
    .update({
      parsed_json: parsed,
      reply_text: parsed.reply_to_user,
      status: parsed.needs_confirmation ? "pending" : "confirmed",
    })
    .eq("id", rawLog.id);

  return json({
    raw_log_id: rawLog.id,
    reply_to_user: parsed.reply_to_user,
    actions: parsed.actions || [],
    needs_confirmation: parsed.needs_confirmation,
  });
});
