import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { DayPlan } from "./dayLogParser.ts";
import { inferEventKind, inferMealSlotForEvent } from "./dayLogParser.ts";
import { executeSessionBundle, afterSessionDelete } from "./sessionEvents.ts";
import { executeOne } from "./applyActions.ts";

export type DayPlanResult = { ok: boolean; results: Array<{ step: string; ok: boolean; error?: string }> };

/** Execute a parsed day plan: delete existing sessions, rebuild bundles, link meals/finance. */
export async function executeDayPlan(
  db: SupabaseClient,
  plan: DayPlan,
  sourceLogId: string | null,
): Promise<DayPlanResult> {
  const results: DayPlanResult["results"] = [];

  async function step(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      results.push({ step: name, ok: true });
    } catch (err) {
      results.push({ step: name, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  await step("delete_existing_sessions", async () => {
    const { data: existing } = await db.from("sessions").select("id").eq("date", plan.date);
    for (const s of existing || []) {
      await afterSessionDelete(db, String(s.id));
      await db.from("sessions").delete().eq("id", s.id);
    }
  });

  await step("update_day", async () => {
    const patch: Record<string, unknown> = { date: plan.date };
    if (plan.wake_time) patch.wake_time = `${plan.wake_time}:00`.slice(0, 8);
    if (plan.sleep_time) patch.sleep_time = `${plan.sleep_time}:00`.slice(0, 8);
    if (plan.modafinil_mg != null) patch.modafinil_mg = plan.modafinil_mg;
    await db.from("days").upsert({ ...patch, date: plan.date });
  });

  for (const sess of plan.sessions) {
    const eventsIn = sess.events.map((ev) => {
      const payload: Record<string, unknown> = {
        start_time: ev.start,
        end_time: ev.end,
        title: ev.title,
        kind: inferEventKind(ev),
        instant: ev.instant,
      };
      const expAtt = ev.attachments.find((a) => a.kind === "expense" && a.amount != null && a.account);
      if (expAtt) {
        payload.expense = {
          amount: expAtt.amount,
          currency: expAtt.currency || "VND",
          account: expAtt.account,
          merchant: expAtt.merchant,
          category: "groceries",
          notes: expAtt.notes,
        };
      }
      return payload;
    });

    let sessionId = "";
    let eventRows: Array<{ id: string; start_time: string; title: string | null }> = [];

    await step(`bundle:${sess.project}`, async () => {
      const out = await executeSessionBundle(
        db,
        { date: plan.date, project: sess.project, events: eventsIn },
        sourceLogId,
      );
      sessionId = out.session_id;
      const { data: evts } = await db
        .from("session_events")
        .select("id, start_time, title")
        .eq("session_id", sessionId)
        .order("start_time");
      eventRows = (evts || []) as typeof eventRows;
    });

    for (let i = 0; i < sess.events.length; i++) {
      const ev = sess.events[i];
      const dbEv = eventRows[i];
      if (!dbEv) continue;

      for (const att of ev.attachments) {
        if (att.kind === "substance" && att.substance) {
          await step(`substance:${ev.start}:${att.substance}`, async () => {
            await executeOne(db, {
              type: "create_substance",
              data: {
                date: plan.date,
                time: ev.start,
                name: att.substance,
                amount: att.substance === "moda" ? plan.modafinil_mg ?? 50 : 1,
                unit: att.substance === "moda" ? "mg" : att.substance === "caffeine" ? "cup" : "session",
              },
            }, sourceLogId);
          });
        }

        if (att.kind === "meal" && att.meal?.kcal) {
          await step(`meal:${ev.start}`, async () => {
            const mealRow = await executeOne(db, {
              type: "create_meal",
              data: {
                date: plan.date,
                time: `${ev.start}:00`.slice(0, 8),
                slot: inferMealSlotForEvent(ev),
                name: att.meal!.name || ev.title,
                kcal: att.meal!.kcal,
                protein_g: att.meal!.protein_g ?? 0,
                fat_g: att.meal!.fat_g ?? 0,
                carbs_g: att.meal!.carbs_g ?? 0,
                portion_grams: att.meal!.portion_grams,
                confidence: "estimate",
                notes: att.meal!.notes,
              },
            }, sourceLogId);
            const mealId = (mealRow as { id?: string })?.id;
            if (mealId) {
              await db.from("session_events").update({ meal_id: mealId }).eq("id", dbEv.id);
            }
          });
        }

        if (att.kind === "expense" && att.amount != null && att.account && !eventsIn[i]?.expense) {
          await step(`finance:${ev.start}`, async () => {
            await executeOne(db, {
              type: "create_finance_transaction",
              data: {
                date: plan.date,
                time: `${ev.start}:00`.slice(0, 8),
                amount: att.amount,
                currency: att.currency || "VND",
                account: att.account,
                merchant: att.merchant,
                txn_type: "expense",
                category: "food",
                notes: att.notes,
                session_event_id: dbEv.id,
                session_id: sessionId,
              },
            }, sourceLogId);
          });
        }

        if (att.kind === "income" && att.amount != null && att.account) {
          await step(`income:${ev.start}`, async () => {
            await executeOne(db, {
              type: "create_finance_transaction",
              data: {
                date: plan.date,
                time: `${ev.start}:00`.slice(0, 8),
                amount: att.amount,
                currency: att.currency || "USDT",
                account: att.account,
                merchant: att.merchant || att.account,
                txn_type: "income",
                notes: att.notes,
                session_event_id: dbEv.id,
                session_id: sessionId,
              },
            }, sourceLogId);
          });
        }

        if (att.kind === "activity" && att.activity?.calories_burned) {
          await step(`activity:${ev.start}`, async () => {
            const actRow = await executeOne(db, {
              type: "create_activity",
              data: {
                date: plan.date,
                time: `${ev.start}:00`.slice(0, 8),
                type: att.activity!.type || "move",
                calories_burned: att.activity!.calories_burned,
                distance_km: att.activity!.distance_km,
                pace: att.activity!.pace,
                notes: att.activity!.notes,
                source: "manual",
              },
            }, sourceLogId);
            const actId = (actRow as { id?: string })?.id;
            if (actId) {
              await db.from("session_events").update({ activity_id: actId }).eq("id", dbEv.id);
            }
          });
        }
      }
    }
  }

  const ok = results.every((r) => r.ok);
  return { ok, results };
}
