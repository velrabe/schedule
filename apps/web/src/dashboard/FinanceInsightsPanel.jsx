import { h } from "preact";
import { useMemo, useState, useCallback } from "preact/hooks";
import htm from "htm";
import { localTodayISO } from "./useDateStrip.js";
import { buildBalanceSeries, fmtRub, plannedItemLabel } from "./financeInsights.js";
import FinanceBalanceChart from "./FinanceBalanceChart.jsx";

const html = htm.bind(h);

export default function FinanceInsightsPanel({
  accounts = [],
  finance = [],
  balance_snapshots = [],
  finance_planned_items = [],
  liveMode = false,
}) {
  const today = localTodayISO();
  const [balanceInput, setBalanceInput] = useState("");
  const [saving, setSaving] = useState(false);

  const series = useMemo(
    () =>
      buildBalanceSeries({
        today,
        accounts,
        finance,
        snapshots: balance_snapshots,
        plannedItems: finance_planned_items,
        historyDays: 60,
        planDays: 150,
      }),
    [today, accounts, finance, balance_snapshots, finance_planned_items],
  );

  const saveBalance = useCallback(async () => {
    if (!liveMode) return;
    const n = Number(balanceInput.replace(/\s/g, ""));
    if (!Number.isFinite(n)) return;
    setSaving(true);
    try {
      const { upsertRow, notifyDataChanged } = await import("../api/manual");
      await upsertRow("balance_snapshots", { date: today, total_rub: n, notes: null });
      notifyDataChanged();
      setBalanceInput("");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [balanceInput, liveMode, today]);

  const activePlanned = (finance_planned_items || []).filter((p) => p.active);

  return html`
    <div class="finance-insights-panel-wrap">
      <div class="finance-insights-summary-wrap">
        <span class="finance-insights-summary-label">сейчас (все счета ≈)</span>
        <span class="finance-insights-summary-val">${fmtRub(series.totalRubNow)}</span>
        ${liveMode &&
        html`
          <div class="finance-insights-log-wrap">
            <input
              class="finance-insights-log-input"
              type="number"
              placeholder="факт баланс сегодня, ₽"
              value=${balanceInput}
              onInput=${(e) => setBalanceInput(e.currentTarget.value)}
            />
            <button type="button" class="btn btn--primary" disabled=${saving} onClick=${saveBalance}>
              <span class="btn__text-wrap">${saving ? "…" : "записать факт"}</span>
            </button>
          </div>
        `}
      </div>

      <${FinanceBalanceChart}
        dates=${series.dates}
        fact=${series.fact}
        plan=${series.plan}
        markers=${series.markers}
      />

      <div class="finance-insights-planned-wrap">
        <span class="finance-insights-planned-title">плановые статьи</span>
        <div class="finance-insights-planned-list-wrap">
          ${activePlanned.length === 0 && html`<span class="finance-insights-planned-empty">нет активных статей</span>`}
          ${activePlanned.map((p) => html`
            <div class="finance-insights-planned-row-wrap" key=${p.id}>
              <span class="finance-insights-planned-row-text">${plannedItemLabel(p)}</span>
            </div>
          `)}
        </div>
      </div>
    </div>
  `;
}
