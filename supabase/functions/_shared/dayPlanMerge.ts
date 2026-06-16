import type { DayPlan, ParsedEvent } from "./dayLogParser.ts";
import { inferMealSlotForEvent } from "./dayLogParser.ts";
import type { ScreenshotExtract } from "./screenshotExtract.ts";

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function timeDistance(a: string, b: string): number {
  return Math.abs(timeToMin(a) - timeToMin(b));
}

/** Match OCR items to parsed events by kind + closest screenshot_time. */
export function mergeScreenshotsIntoPlan(
  plan: DayPlan,
  items: ScreenshotExtract[],
): DayPlan {
  const clarifications = [...plan.clarifications];

  function findBestEvent(
    kind: "meal" | "expense" | "activity",
    shotTime?: string,
    merchantHint?: string,
  ): { sessionIdx: number; eventIdx: number; attIdx: number } | null {
    let best: { sessionIdx: number; eventIdx: number; attIdx: number; score: number } | null = null;

    plan.sessions.forEach((sess, si) => {
      sess.events.forEach((ev, ei) => {
        ev.attachments.forEach((att, ai) => {
          if (kind === "meal" && att.kind !== "meal") return;
          if (kind === "expense" && att.kind !== "expense") return;
          if (kind === "activity" && att.kind !== "activity") return;

          let score = 0;
          if (shotTime) score -= timeDistance(shotTime, ev.start) * 2;
          if (merchantHint && att.merchant?.toLowerCase().includes(merchantHint.toLowerCase())) {
            score -= 30;
          }
          if (merchantHint && att.raw.toLowerCase().includes(merchantHint.toLowerCase())) score -= 20;
          if (!best || score < best.score) {
            best = { sessionIdx: si, eventIdx: ei, attIdx: ai, score };
          }
        });
      });
    });

    if (!best) return null;
    return { sessionIdx: best.sessionIdx, eventIdx: best.eventIdx, attIdx: best.attIdx };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "meal" && item.meal) {
      const match = findBestEvent("meal", item.screenshot_time, item.merchant_hint);
      if (match) {
        const att = plan.sessions[match.sessionIdx].events[match.eventIdx].attachments[match.attIdx];
        att.meal = {
          ...att.meal,
          name: item.meal.name ?? att.meal?.name,
          kcal: item.meal.kcal ?? att.meal?.kcal,
          protein_g: item.meal.protein_g ?? att.meal?.protein_g,
          fat_g: item.meal.fat_g ?? att.meal?.fat_g,
          carbs_g: item.meal.carbs_g ?? att.meal?.carbs_g,
          portion_grams: item.meal.portion_grams ?? att.meal?.portion_grams,
          notes: item.meal.notes
            ? `КБЖU со скрина: ${item.meal.notes}`
            : att.meal?.notes ||
              (item.meal.name
                ? `КБЖU со скрина: ${item.meal.name}${item.meal.portion_grams ? `, ${item.meal.portion_grams}g` : ""}${item.meal.kcal ? `, ${item.meal.kcal} kcal` : ""}`
                : undefined),
        };
        att.screenshot_time = item.screenshot_time;
        att.missing = undefined;
      } else {
        clarifications.push(
          `Скрин еды (${item.meal.name || "?"}) не привязан — нет (+ пища/+кбжu) в тексте`,
        );
      }
    }

    if (item.kind === "expense" && item.finance) {
      const match = findBestEvent("expense", item.screenshot_time, item.merchant_hint || item.finance.merchant);
      if (match) {
        const att = plan.sessions[match.sessionIdx].events[match.eventIdx].attachments[match.attIdx];
        att.amount = att.amount ?? item.finance.amount;
        att.currency = att.currency ?? item.finance.currency;
        att.notes = [att.notes, item.finance.notes].filter(Boolean).join(" | ") ||
          (item.finance.notes ? `Чек: ${item.finance.notes}` : att.notes);
        att.screenshot_time = item.screenshot_time;
        if (att.amount != null) att.missing = undefined;
      }
    }

    if (item.kind === "activity" && item.activity) {
      const match = findBestEvent("activity", item.screenshot_time);
      if (match) {
        const att = plan.sessions[match.sessionIdx].events[match.eventIdx].attachments[match.attIdx];
        att.activity = { ...att.activity, ...item.activity };
        att.screenshot_time = item.screenshot_time;
      }
    }
  }

  for (const sess of plan.sessions) {
    for (const ev of sess.events) {
      for (const att of ev.attachments) {
        if (att.kind === "meal" && !att.meal?.kcal) {
          const q = `КБЖU для «${ev.title}» ${ev.start} — приложи скрин или допиши цифры`;
          att.missing = [q];
          if (!clarifications.includes(q)) clarifications.push(q);
        }
        if (att.kind === "expense" && att.amount == null) {
          const q = `Сумма для расхода «${ev.title}» ${ev.start} (${att.merchant || "?"})`;
          att.missing = [q];
          if (!clarifications.includes(q)) clarifications.push(q);
        }
      }
    }
  }

  return { ...plan, clarifications: [...new Set(clarifications)] };
}

export function planToPreviewActions(plan: DayPlan): Array<{ type: string; data: Record<string, unknown> }> {
  const actions: Array<{ type: string; data: Record<string, unknown> }> = [];

  const dayPatch: Record<string, unknown> = { date: plan.date };
  if (plan.wake_time) dayPatch.wake_time = plan.wake_time;
  if (plan.sleep_time) dayPatch.sleep_time = plan.sleep_time;
  if (plan.modafinil_mg != null) dayPatch.modafinil_mg = plan.modafinil_mg;
  actions.push({ type: "update_day", data: dayPatch });

  for (const sess of plan.sessions) {
    actions.push({
      type: "create_session_bundle",
      data: {
        date: plan.date,
        project: sess.project,
        events: sess.events.map((ev) => ({
          start_time: ev.start,
          end_time: ev.end,
          title: ev.title,
          instant: ev.instant,
        })),
      },
    });

    for (const ev of sess.events) {
      for (const att of ev.attachments) {
        if (att.kind === "substance" && att.substance) {
          actions.push({
            type: "create_substance",
            data: {
              date: plan.date,
              time: ev.start,
              name: att.substance,
              amount: att.substance === "moda" ? plan.modafinil_mg : 1,
              unit: att.substance === "moda" ? "mg" : att.substance === "caffeine" ? "cup" : "session",
            },
          });
        }
        if (att.kind === "meal" && att.meal?.kcal) {
          actions.push({
            type: "create_meal",
            data: {
              date: plan.date,
              time: ev.start,
              slot: inferMealSlotForEvent(ev),
              name: att.meal.name || ev.title,
              kcal: att.meal.kcal,
              protein_g: att.meal.protein_g,
              fat_g: att.meal.fat_g,
              carbs_g: att.meal.carbs_g,
              notes: att.meal.notes,
            },
          });
        }
        if (att.kind === "expense" && att.amount != null) {
          actions.push({
            type: "create_finance_transaction",
            data: {
              date: plan.date,
              time: ev.start,
              amount: att.amount,
              currency: att.currency || "VND",
              account: att.account,
              merchant: att.merchant,
              txn_type: "expense",
              notes: att.notes,
            },
          });
        }
        if (att.kind === "income" && att.amount != null) {
          actions.push({
            type: "create_finance_transaction",
            data: {
              date: plan.date,
              time: ev.start,
              amount: att.amount,
              currency: att.currency || "USDT",
              account: att.account,
              merchant: att.merchant || att.account,
              txn_type: "income",
              notes: att.notes,
            },
          });
        }
        if (att.kind === "activity" && att.activity?.calories_burned) {
          actions.push({
            type: "create_activity",
            data: {
              date: plan.date,
              time: ev.start,
              type: att.activity.type || "move",
              calories_burned: att.activity.calories_burned,
              distance_km: att.activity.distance_km,
              pace: att.activity.pace,
              notes: att.activity.notes,
            },
          });
        }
      }
    }
  }

  for (const q of plan.clarifications) {
    actions.push({ type: "ask_clarification", data: { question: q } });
  }

  return actions;
}

export function buildReplyFromPlan(plan: DayPlan): string {
  const evCount = plan.sessions.reduce((a, s) => a + s.events.length, 0);
  const lines = [
    `Разобрал текст: ${plan.date}, ${plan.sessions.length} сессий, ${evCount} ивентов.`,
    "Структура и названия — только из текста; скрины — КБЖU/суммы/notes.",
  ];
  for (const sess of plan.sessions) {
    lines.push(`• ${sess.project}: ${sess.events.length} ивентов`);
  }
  if (plan.clarifications.length) {
    lines.push(`\n⚠️ Не хватает данных (${plan.clarifications.length}):`);
    plan.clarifications.slice(0, 8).forEach((c) => lines.push(`• ${c}`));
    if (plan.clarifications.length > 8) lines.push(`… и ещё ${plan.clarifications.length - 8}`);
    lines.push("\nМожно подтвердить частично или допиши недостающее.");
  } else {
    lines.push("\nПроверь превью и нажми «да».");
  }
  return lines.join("\n");
}
