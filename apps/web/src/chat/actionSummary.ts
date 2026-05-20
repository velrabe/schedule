export type Action = {
  type: string;
  data: Record<string, unknown>;
};

const SLOT_RU: Record<string, string> = {
  breakfast: "завтрак",
  lunch: "обед",
  dinner: "ужин",
  snack: "снек",
};

function trimTime(t: unknown): string {
  if (t == null) return "";
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function fmtDate(d: unknown): string {
  if (!d) return "";
  const s = String(d);
  const [, m, day] = s.split("-");
  return m && day ? `${day}.${m}` : s;
}

/** One-line Russian summary per action (no JSON). */
export function summarizeAction(a: Action): string {
  const d = a.data || {};
  const date = fmtDate(d.date);
  const type = a.type.toLowerCase();

  switch (type) {
    case "create_substance": {
      const name = String(d.name ?? "вещество");
      const amt = d.amount != null ? ` ${d.amount}${d.unit ? ` ${d.unit}` : ""}` : "";
      return `${name}${amt}${date ? ` · ${date}` : ""}`;
    }
    case "update_day": {
      const parts: string[] = [];
      if (d.wake_time) parts.push(`подъём ${trimTime(d.wake_time)}`);
      if (d.sleep_time) parts.push(`отбой ${trimTime(d.sleep_time)}`);
      if (d.sleep_hours != null) parts.push(`сон ${d.sleep_hours}ч`);
      if (d.modafinil_mg != null) parts.push(`мод ${d.modafinil_mg} мг`);
      if (d.weight_kg != null) parts.push(`вес ${d.weight_kg} кг`);
      return `День ${date || "—"}: ${parts.join(", ") || "обновление"}`;
    }
    case "create_session": {
      const start = trimTime(d.start_time ?? d.start);
      const end = trimTime(d.end_time ?? d.end);
      const cat = d.category ? String(d.category) : d.type ? String(d.type) : "";
      const proj = d.project ? ` · ${d.project}` : "";
      return `${start && end ? `${start}–${end}` : start || "сессия"} · ${cat}${proj}${date ? ` · ${date}` : ""}`;
    }
    case "update_session": {
      const start = d.start_time != null ? trimTime(d.start_time) : "";
      const end = d.end_time != null ? trimTime(d.end_time) : "";
      const times = start && end ? `${start}–${end}` : start ? `старт ${start}` : end ? `конец ${end}` : "время";
      const proj = d.project ? ` · ${d.project}` : "";
      return `Обновить сессию${proj}: ${times}${date ? ` · ${date}` : ""}`;
    }
    case "delete_session": {
      return `Удалить сессию ${d.id ?? ""}${date ? ` · ${date}` : ""}`;
    }
    case "create_work_session_open": {
      return `Открыть работу «${d.project ?? "?"}» с ${trimTime(d.start_time)}${date ? ` · ${date}` : ""}`;
    }
    case "close_work_session": {
      return `Закрыть работу в ${trimTime(d.end_time)}`;
    }
    case "create_meal": {
      const slot = d.slot ? SLOT_RU[String(d.slot)] || String(d.slot) : "еда";
      const kcal = d.kcal != null ? ` · ${Math.round(Number(d.kcal))} ккал` : "";
      const macro =
        d.protein_g != null
          ? ` (Б${Math.round(Number(d.protein_g))}/Ж${Math.round(Number(d.fat_g ?? 0))}/У${Math.round(Number(d.carbs_g ?? 0))})`
          : "";
      return `${slot}: ${d.name ?? "—"}${kcal}${macro}${date ? ` · ${date}` : ""}`;
    }
    case "create_activity": {
      const kcal = d.calories_burned != null ? ` · ${Math.round(Number(d.calories_burned))} ккал` : "";
      const dur = d.duration_min != null ? ` · ${d.duration_min} мин` : "";
      return `Активность: ${d.type ?? "move"}${dur}${kcal}${date ? ` · ${date}` : ""}`;
    }
    case "create_body_metric": {
      return `${d.metric}: ${d.value}${d.unit ? ` ${d.unit}` : ""}${date ? ` · ${date}` : ""}`;
    }
    case "create_finance_transaction": {
      const cur = d.currency ?? "";
      const type = String(d.txn_type || "expense").toLowerCase();
      if (type === "transfer" && d.counter_account) {
        return `Перевод ${d.account} → ${d.counter_account}: ${d.amount} ${cur} → ${d.amount_counter ?? "?"}${date ? ` · ${date}` : ""}`;
      }
      if (type === "income") {
        return `Приход +${d.amount} ${cur} · ${d.account ?? ""}${date ? ` · ${date}` : ""}`;
      }
      return `Расход ${d.amount} ${cur}${d.category ? ` · ${d.category}` : ""}${date ? ` · ${date}` : ""}`;
    }
    case "create_planner_event": {
      return `Планер: ${d.title ?? "—"}${date ? ` · ${date}` : ""}`;
    }
    case "create_mood_log": {
      return `Настроение: ${d.emotion ?? "—"}${date ? ` · ${date}` : ""}`;
    }
    case "create_event": {
      return `Событие: ${d.kind ?? "—"}${date ? ` · ${date}` : ""}`;
    }
    case "ask_clarification": {
      return `Уточнение: ${d.question ?? "?"}`;
    }
    default:
      return type;
  }
}

export function summarizeActions(actions: Action[]): string[] {
  return actions.map(summarizeAction);
}
