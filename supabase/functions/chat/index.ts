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
import { normalizeAction } from "../_shared/actions.ts";
import { previewSessionActions } from "../_shared/sessionConfirm.ts";

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

  let body: {
    message?: string;
    image_base64?: string;
    image_mime?: string;
    history?: Array<{ role: "user" | "assistant"; text: string }>;
  } = {};
  try {
    body = await req.json();
  } catch {}
  const message = (body.message || "").trim();
  const hasImage = Boolean(body.image_base64?.length);
  if (!message && !hasImage) {
    return json({ error: "empty_message" }, { status: 400 });
  }
  if (hasImage && body.image_base64!.length > 1_400_000) {
    return json({ error: "image_too_large", message: "Сжми скрин или отправь меньший файл." }, { status: 413 });
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
    db.from("sessions").select("id,start_time,end_time,duration_min,type,project,category,notes").eq(
      "date",
      today,
    ),
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

  const imageInstructions = hasImage
    ? `
IMAGE INPUT:
- User attached a photo/screenshot. Read text, numbers, times, macros, prices, receipts, app UI.
- Food: extract meal name, kcal, protein/fat/carbs if visible → create_meal (+ create_session food if time known).
- Receipt / bank: amount, currency, merchant → create_finance_transaction (expense) + account if inferable.
- Schedule screenshot: sessions with start/end, category, project → create_session / update_session.
- If unreadable, ask_clarification with a specific question — do not guess macros.
`
    : "";

  // 3. Build prompt
  const systemPrompt = `You are a structured life-logging assistant.
Return ONLY JSON matching the supplied schema — no prose outside JSON.
${imageInstructions}

${loadRules(ALL_DOMAINS)}

Available action types (use in actions[].type):
  - create_work_session_open    { date, start_time, project, category }            // category: work_paid | personal | byt
  - close_work_session          { session_id?, end_time, notes? }
  - create_session              { date, start_time, end_time, type, category?, project?, notes? }
                                                                                    // type: work | sport | walk | chill | sleep | chores | food | transport | social
  - update_session              { id, date, start_time?, end_time?, category?, project?, notes? }
  - delete_session              { id, date? }
  - create_meal                 { date, time?, slot, name, kcal, protein_g, fat_g, carbs_g, confidence, notes? }
  - create_activity             { date, time?, type, duration_min?, calories_burned?, intensity?, source?, notes? }
                                                                                    // source: manual | move | base_move | apple_health | strava
  - create_substance            { date, time?, name, amount?, unit?, notes? }
  - create_body_metric          { date, time?, metric, value, unit?, notes? }
  - update_day                  { date, wake_time?, sleep_time?, sleep_hours?, mood?, energy?, focus?, weight_kg?, day_type?, kcal_target?, carbs_target_g?, protein_target_g?, fat_target_g?, notes? }
  - create_finance_transaction  { date, time?, amount, currency, account?, counter_account?, amount_counter?, category?, merchant?, txn_type?, session_id?, notes? }
                                                                                              // transfer: account=from, counter_account=to, amount_counter=credit on to-account
  - create_event                { date, kind, detail?, severity? }
  - create_planner_event        { date, end_date?, time?, title, kind, detail?, recurrence?, reminder_minutes? }
  - create_mood_log             { date, time?, emotion, emotion_label?, valence?, tags?, notes? }
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
    { "type": "create_substance", "data": { "date": "${today}", "time": "09:00", "name": "moda", "amount": 75, "unit": "mg" } }
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
    { "type": "create_session", "data": { "date": "${today}", "start_time": "${nowTime}", "end_time": "${nowTime}", "type": "sport", "category": "sport_walk" } }
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

Input: "обнови на сегодня: старт первого рабочего блока app на 12:20, дальше как есть"   (use session ids from CONTEXT)
Output:
{
  "reply_to_user": "Сдвигаю app на 12:20 и подстраиваю следующие сессии без пересечений. Записать?",
  "actions": [
    { "type": "update_session", "data": { "id": "<uuid from context>", "date": "${today}", "start_time": "12:20" } }
  ],
  "needs_confirmation": true
}

Input: "добавь обед 13:30-14:00 550 ккал, курицу +75г, обед на час вперёд, между завтраком и обедом работа app, первую рабочую с 13:00"   (use session ids from CONTEXT; shorten work if overlap)
Output:
{
  "reply_to_user": "Понял: обед 13:30–14:00 (~675 ккал с курицей), app с 13:00 (сокращу до 13:30), рабочий блок между приёмами пищи. Записать?",
  "actions": [
    { "type": "create_meal", "data": { "date": "${today}", "time": "13:30", "slot": "lunch", "name": "обед + курица 75г", "kcal": 675, "protein_g": 52, "fat_g": 30, "carbs_g": 40, "confidence": "medium" } },
    { "type": "update_session", "data": { "id": "<app session uuid>", "date": "${today}", "start_time": "13:00", "end_time": "13:30" } },
    { "type": "create_session", "data": { "date": "${today}", "start_time": "14:00", "end_time": "15:00", "type": "work", "category": "work_paid", "project": "app" } }
  ],
  "needs_confirmation": true
}

CHAT HISTORY (if present): previous user/assistant turns — use them to resolve follow-ups like "сократить рабочую" without asking again.

CURRENT CONTEXT (JSON):
${JSON.stringify(context, null, 2)}
`;

  const userParts: GeminiContent["parts"] = [];
  if (message) userParts.push({ text: message });
  if (hasImage) {
    userParts.push({
      inlineData: {
        mimeType: body.image_mime || "image/jpeg",
        data: body.image_base64!,
      },
    });
    if (!message) {
      userParts.unshift({
        text: "Разбери прикреплённое изображение и предложи actions для записи в трекер.",
      });
    }
  }

  const historyContents: GeminiContent[] = (body.history || [])
    .filter((h) => h.text?.trim())
    .slice(-8)
    .map((h) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.text.trim() }],
    }));

  // 4. Call Gemini
  let parsed: {
    reply_to_user: string;
    actions: Array<{ type: string; data: Record<string, unknown> }>;
    needs_confirmation: boolean;
    domains?: string[];
  };
  let modelUsed = "";
  try {
    const out = await generate({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [...historyContents, { role: "user", parts: userParts }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });
    if (!out.json || typeof out.json !== "object") {
      throw new Error(`Gemini returned non-JSON: ${out.text.slice(0, 200)}`);
    }
    parsed = out.json as typeof parsed;
    modelUsed = out.model;
    if (Array.isArray(parsed.actions)) {
      parsed.actions = parsed.actions.map((a) => normalizeAction(a));
    }
    const writable = (parsed.actions || []).filter((a) => a.type !== "ask_clarification");
    if (writable.length === 0 && (parsed.actions || []).some((a) => a.type === "ask_clarification")) {
      parsed.needs_confirmation = false;
    }
    const swallowWarnings = await previewSessionActions(db, parsed.actions || []);
    if (swallowWarnings.length) {
      parsed.needs_confirmation = true;
      const note = swallowWarnings.map((w) => w.message).join("\n");
      if (!parsed.reply_to_user.includes("поглощ")) {
        parsed.reply_to_user = `${parsed.reply_to_user}\n\n⚠️ ${note}`;
      }
      (parsed as Record<string, unknown>).swallow_warnings = swallowWarnings;
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await db.from("raw_logs").update({ status: "error", status_reason: detail }).eq("id", rawLog.id);
    const quota = /429|RESOURCE_EXHAUSTED|quota exceeded/i.test(detail);
    if (quota) {
      const retryMatch = detail.match(/retry(?:Delay)?["']?\s*:\s*"?(\d+)/i);
      const retry_after_sec = retryMatch ? Number(retryMatch[1]) : 60;
      return json(
        {
          error: "llm_quota_exceeded",
          message: "Квота Google Gemini исчерпана. Подожди и попробуй снова.",
          retry_after_sec,
          detail,
        },
        { status: 429 },
      );
    }
    return json(
      {
        error: "llm_failed",
        message: "Не удалось обработать сообщение (ошибка ИИ).",
        detail,
      },
      { status: 502 },
    );
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
    swallow_warnings: (parsed as { swallow_warnings?: unknown }).swallow_warnings ?? [],
    model: modelUsed,
  });
});
