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

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply_to_user: { type: "string" },
    domains: { type: "array", items: { type: "string" } },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          data: { type: "object" },
        },
        required: ["type", "data"],
      },
    },
    needs_confirmation: { type: "boolean" },
  },
  required: ["reply_to_user", "actions", "needs_confirmation"],
};

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
  const [openSessions, todayDay, todaySessions] = await Promise.all([
    db.from("open_sessions").select("*"),
    db.from("days").select("*").eq("date", today).maybeSingle(),
    db.from("sessions").select("start_time,end_time,type,project,category").eq("date", today),
  ]);

  const context = {
    today,
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
  - For "сейчас" use the current local time.
  - For "сегодня" use ${today}.
  - reply_to_user must be a short Russian confirmation prompt like "Понял: ... . Записать?"
  - needs_confirmation=true unless this is a simple substance/body_metric.

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
        responseSchema: RESPONSE_SCHEMA,
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
