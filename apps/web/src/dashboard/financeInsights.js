/** Plan/fact balance series in RUB for Insights chart. */

/** ~6 months forward for daily food + table planned rows. */
export const PLAN_HORIZON_DAYS = 183;

export const FX_RUB_PER_UNIT = {
  RUB: 1,
  VND: 10000 / 3692220,
  USD: 92,
};

export function toRub(amount, currency, fx = FX_RUB_PER_UNIT) {
  const n = Number(amount) || 0;
  const rate = fx[currency] ?? 1;
  return n * rate;
}

export function accountsTotalRub(accounts, fx = FX_RUB_PER_UNIT) {
  return (accounts || []).reduce((sum, a) => {
    if (a.archived) return sum;
    const bal = Number(a.balance);
    return sum + toRub(Number.isFinite(bal) ? bal : 0, a.currency, fx);
  }, 0);
}

export function financeTxnDeltaRub(t, fx = FX_RUB_PER_UNIT) {
  const type = (t.txn_type || "expense").toLowerCase();
  if (type === "transfer") return 0;
  const sign = type === "income" ? 1 : -1;
  return sign * toRub(t.amount, t.currency, fx);
}

export function addDaysISO(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function eachDayISO(from, to) {
  const out = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return out;
}

function recurrenceNote(item) {
  const rec = item.recurrence || "once";
  if (rec === "daily") return "ежедн.";
  if (rec === "monthly") return `${item.day_of_month || 1}-е число`;
  return "разово";
}

/** Expand planned budget lines to dated deltas (for chart/tooltip). */
export function expandPlannedItems(items, fromDate, toDate, fx = FX_RUB_PER_UNIT) {
  if (!fromDate || !toDate) return [];
  const out = [];
  for (const item of items || []) {
    if (item.active === false) continue;
    const start = item.start_date;
    if (!start || typeof start !== "string") continue;
    const end = item.end_date || toDate;
    if (!end || end < fromDate || start > toDate) continue;

    const sign = (item.txn_type || "expense") === "income" ? 1 : -1;
    const delta = sign * toRub(item.amount, item.currency, fx);
    const rec = item.recurrence || "once";

    if (rec === "daily") {
      let d = start < fromDate ? fromDate : start;
      const stop = end > toDate ? toDate : end;
      while (d <= stop) {
        out.push({ date: d, deltaRub: delta, title: item.title, item });
        d = addDaysISO(d, 1);
      }
      continue;
    }

    if (rec === "monthly") {
      const dom = Number(item.day_of_month) || 1;
      let y = parseInt(start.slice(0, 4), 10);
      let m = parseInt(start.slice(5, 7), 10) - 1;
      const endY = parseInt(toDate.slice(0, 4), 10);
      const endM = parseInt(toDate.slice(5, 7), 10) - 1;
      while (y < endY || (y === endY && m <= endM)) {
        const lastDom = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        const day = Math.min(dom, lastDom);
        const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (iso >= start && iso >= fromDate && iso <= toDate && iso <= end) {
          out.push({ date: iso, deltaRub: delta, title: item.title, item });
        }
        m += 1;
        if (m > 11) {
          m = 0;
          y += 1;
        }
      }
      continue;
    }

    if (rec === "once" && start >= fromDate && start <= toDate) {
      out.push({ date: start, deltaRub: delta, title: item.title, item });
    }
  }
  return out;
}

/** Virtual transaction rows for table (planned / future, not in finance_transactions). */
export function plannedItemsToVirtualTransactions(plannedItems, fromDate, toDate) {
  const expanded = expandPlannedItems(plannedItems, fromDate, toDate);
  return expanded.map((e) => {
    const item = e.item;
    const rec = item.recurrence || "once";
    return {
      id: `plan:${item.id}:${e.date}`,
      _planned: true,
      _planned_item_id: item.id,
      date: e.date,
      time: null,
      txn_type: "planned",
      _planned_txn_type: (item.txn_type || "expense").toLowerCase(),
      amount: item.amount,
      currency: item.currency,
      account: null,
      counter_account: null,
      amount_counter: null,
      category: item.category || item.title,
      merchant: item.title,
      notes: `${recurrenceNote(item)}${item.notes ? ` · ${item.notes}` : ""}`,
      session_id: null,
    };
  });
}

/** Merge real txns + planned virtual rows for the transactions table. */
export function mergeFinanceTableRows(
  finance = [],
  plannedItems = [],
  today,
  planHorizonDays = PLAN_HORIZON_DAYS,
) {
  const plannedFrom = today;
  const plannedTo = addDaysISO(today, planHorizonDays);
  const planned = plannedItemsToVirtualTransactions(plannedItems, plannedFrom, plannedTo);
  return [...(finance || []), ...planned];
}

function groupDeltasByDate(entries) {
  const map = new Map();
  for (const e of entries) {
    map.set(e.date, (map.get(e.date) || 0) + e.deltaRub);
  }
  return map;
}

export function buildBalanceSeries({
  today,
  accounts = [],
  finance = [],
  snapshots = [],
  plannedItems = [],
  historyDays = 90,
  planDays = PLAN_HORIZON_DAYS,
  fx = FX_RUB_PER_UNIT,
}) {
  const fromDate = addDaysISO(today, -historyDays);
  const toDate = addDaysISO(today, planDays);
  const dates = eachDayISO(fromDate, toDate);

  const snapMap = new Map((snapshots || []).map((s) => [s.date, Number(s.total_rub)]));
  const txnByDate = new Map();
  for (const t of finance || []) {
    if (t.date < fromDate || t.date > today) continue;
    txnByDate.set(t.date, (txnByDate.get(t.date) || 0) + financeTxnDeltaRub(t, fx));
  }

  const plannedExpanded = expandPlannedItems(plannedItems, fromDate, toDate, fx);
  const plannedByDate = groupDeltasByDate(plannedExpanded);
  const markers = plannedExpanded.filter((p) => p.date > today);

  const todayBal = snapMap.get(today) ?? accountsTotalRub(accounts, fx);
  let run = todayBal;
  for (let d = today; d > fromDate; d = addDaysISO(d, -1)) {
    run -= txnByDate.get(d) || 0;
  }

  const fact = [];
  const plan = [];

  for (const date of dates) {
    if (date <= today) {
      if (snapMap.has(date)) run = snapMap.get(date);
      else if (date > fromDate) run += txnByDate.get(date) || 0;
      fact.push(run);
      plan.push(run);
    } else {
      run += plannedByDate.get(date) || 0;
      fact.push(null);
      plan.push(run);
    }
  }

  return {
    dates,
    fact,
    plan,
    markers,
    today,
    totalRubNow: todayBal,
  };
}

/** Thin chart: keep last N points so SVG stays visible. */
export function downsampleChartSeries(dates, fact, plan, maxPoints = 120) {
  if (dates.length <= maxPoints) return { dates, fact, plan };
  const step = Math.max(1, Math.floor(dates.length / maxPoints));
  const outD = [];
  const outF = [];
  const outP = [];
  for (let i = 0; i < dates.length; i += step) {
    outD.push(dates[i]);
    outF.push(fact[i]);
    outP.push(plan[i]);
  }
  const last = dates.length - 1;
  if (outD[outD.length - 1] !== dates[last]) {
    outD.push(dates[last]);
    outF.push(fact[last]);
    outP.push(plan[last]);
  }
  return { dates: outD, fact: outF, plan: outP };
}

export function fmtRub(n) {
  return `${Math.round(Number(n) || 0).toLocaleString("ru-RU")} ₽`;
}

export function plannedItemLabel(p) {
  const rub = toRub(p.amount, p.currency);
  const rec =
    p.recurrence === "daily"
      ? "ежедн."
      : p.recurrence === "monthly"
        ? `${p.day_of_month}-е число`
        : p.start_date;
  const sign = (p.txn_type || "expense") === "income" ? "+" : "−";
  return `${p.title}: ${sign}${fmtRub(rub)} · ${rec}`;
}

const EMPTY_DAY_BREAKDOWN = {
  date: null,
  snapshot: null,
  txns: [],
  planned: [],
  txnDeltaRub: 0,
  plannedDeltaRub: 0,
  isFuture: false,
  isToday: false,
};

/** Per-day rows for chart tooltip and day drawer. */
export function getDayBreakdown(date, { finance = [], snapshots = [], plannedItems = [], today, fx = FX_RUB_PER_UNIT }) {
  if (!date) return { ...EMPTY_DAY_BREAKDOWN };
  const txns = (finance || []).filter((t) => t.date === date);
  const planned = expandPlannedItems(plannedItems, date, date, fx);
  const snapshot = (snapshots || []).find((s) => s.date === date);
  return {
    date,
    snapshot: snapshot != null ? Number(snapshot.total_rub) : null,
    txns,
    planned,
    txnDeltaRub: txns.reduce((s, t) => s + financeTxnDeltaRub(t, fx), 0),
    plannedDeltaRub: planned.reduce((s, p) => s + p.deltaRub, 0),
    isFuture: date > today,
    isToday: date === today,
  };
}

export function formatDayBreakdownTooltip(
  breakdown,
  { factBalance, planBalance },
) {
  const lines = [];
  const d = breakdown?.date;
  if (!d) return lines;
  const [y, m, day] = d.split("-");
  lines.push(`${day}.${m}.${y}`);

  if (factBalance != null && Number.isFinite(factBalance)) {
    lines.push(`факт: ${fmtRub(factBalance)}`);
  }
  if (planBalance != null && Number.isFinite(planBalance)) {
    lines.push(`план: ${fmtRub(planBalance)}`);
  }
  if (breakdown.snapshot != null) {
    lines.push(`снимок: ${fmtRub(breakdown.snapshot)}`);
  }

  if (breakdown.txns.length) {
    lines.push("— операции —");
    for (const t of breakdown.txns) {
      const type = (t.txn_type || "expense").toLowerCase();
      const sign = type === "income" ? "+" : type === "transfer" ? "↔" : "−";
      const rub = financeTxnDeltaRub(t);
      const title = t.merchant || t.category || type;
      lines.push(`${sign} ${title}: ${fmtRub(Math.abs(rub))}`);
    }
  }

  if (breakdown.planned.length) {
    lines.push("— план —");
    for (const p of breakdown.planned) {
      const sign = p.deltaRub >= 0 ? "+" : "−";
      lines.push(`${sign} ${p.title}: ${fmtRub(Math.abs(p.deltaRub))}`);
    }
  }

  if (lines.length === 1) lines.push("нет операций");
  return lines;
}
