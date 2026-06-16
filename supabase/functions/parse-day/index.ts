// POST /parse-day { message, images?: [{ base64, mime }] }
// Deterministic text parser + Gemini OCR for screenshots only → day plan → confirm via /confirm

import { preflight, json } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/jwt.ts";
import { admin } from "../_shared/db.ts";
import { parseDayLogText, looksLikeDayLog } from "../_shared/dayLogParser.ts";
import { extractFromScreenshots } from "../_shared/screenshotExtract.ts";
import {
  mergeScreenshotsIntoPlan,
  planToPreviewActions,
  buildReplyFromPlan,
} from "../_shared/dayPlanMerge.ts";

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
    images?: Array<{ base64: string; mime?: string }>;
    image_base64?: string;
    image_mime?: string;
  } = {};
  try {
    body = await req.json();
  } catch {}

  const message = (body.message || "").trim();
  const images = body.images?.length
    ? body.images
    : body.image_base64
    ? [{ base64: body.image_base64, mime: body.image_mime }]
    : [];

  if (!message) {
    return json({ error: "empty_message", message: "Нужен текст дня в обычном формате." }, { status: 400 });
  }

  if (!looksLikeDayLog(message)) {
    return json({
      error: "not_day_log",
      message: "Не похоже на полный день (нужна дата + несколько строк со временем). Для коротких записей используй обычный chat.",
    }, { status: 400 });
  }

  const defaultYear = new Date().getFullYear();
  const parsed = parseDayLogText(message, defaultYear);
  if (!parsed) {
    return json({
      error: "parse_failed",
      message: "Не удалось разобрать текст. Проверь формат: заголовок фазы без времени, строки HH:MM–HH:MM ивент, (+ …) вложения.",
    }, { status: 400 });
  }

  const db = admin();

  const { data: rawLog, error: insertErr } = await db
    .from("raw_logs")
    .insert({ raw_text: message, source: images.length ? "image" : "chat", status: "pending" })
    .select("id")
    .single();
  if (insertErr || !rawLog) {
    return json({ error: "db_insert_failed", detail: insertErr?.message }, { status: 500 });
  }

  let plan = parsed;
  let ocrModel = "";

  if (images.length) {
    try {
      const items = await extractFromScreenshots(images);
      plan = mergeScreenshotsIntoPlan(plan, items);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      await db.from("raw_logs").update({ status: "error", status_reason: detail }).eq("id", rawLog.id);
      return json({ error: "ocr_failed", message: "Скрины не удалось разобрать.", detail }, { status: 502 });
    }
  }

  const actions = planToPreviewActions(plan);
  const reply_to_user = buildReplyFromPlan(plan);
  const needs_confirmation = actions.some((a) => a.type !== "ask_clarification");

  const parsed_json = {
    pipeline: "day_plan_v1",
    plan,
    reply_to_user,
    actions,
    needs_confirmation,
  };

  await db
    .from("raw_logs")
    .update({ parsed_json, reply_text: reply_to_user, status: needs_confirmation ? "pending" : "confirmed" })
    .eq("id", rawLog.id);

  return json({
    raw_log_id: rawLog.id,
    reply_to_user,
    actions,
    needs_confirmation,
    pipeline: "day_plan_v1",
    parse_summary: {
      date: plan.date,
      sessions: plan.sessions.length,
      events: plan.sessions.reduce((a, s) => a + s.events.length, 0),
      clarifications: plan.clarifications.length,
    },
    model: ocrModel || "deterministic-parser",
  });
});
