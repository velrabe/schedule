import { h } from "preact";
import { useMemo, useState, useCallback } from "preact/hooks";
import htm from "htm";
import { localTodayISO } from "./useDateStrip.js";
import { buildBalanceSeries, fmtRub, plannedItemLabel, accountsTotalRub } from "./financeInsights.js";
import FinanceBalanceChart from "./FinanceBalanceChart.jsx";
import FinanceDayDrawer from "./FinanceDayDrawer.jsx";

const html = htm.bind(h);

export default function FinanceChartTab({
  accounts = [],
  finance = [],
  balance_snapshots = [],
  finance_planned_items = [],
  liveMode = false,
  onOpenRecord,
}) {
  const today = localTodayISO();
  const [selectedDate, setSelectedDate] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);

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

  const dateIndex = selectedDate ? series.dates.indexOf(selectedDate) : -1;
  const factAt = dateIndex >= 0 ? series.fact[dateIndex] : null;
  const planAt = dateIndex >= 0 ? series.plan[dateIndex] : null;

  const openNewTxn = useCallback(
    (txn_type) => {
      if (!selectedDate || !onOpenRecord) return;
      onOpenRecord({
        kind: "finance",
        record: {
          _new: true,
          date: selectedDate,
          txn_type,
          account: "cash_vnd",
          currency: "VND",
          amount: "",
          category: txn_type === "expense" ? "" : txn_type === "income" ? "" : "transfer",
        },
      });
    },
    [selectedDate, onOpenRecord],
  );

  const activePlanned = (finance_planned_items || []).filter((p) => p.active !== false);
  const accountsRub = useMemo(() => accountsTotalRub(accounts), [accounts]);
  const snapCount = (balance_snapshots || []).length;

  return html`
    <div class="finance-chart-tab-wrap">
      <div class="finance-insights-summary-wrap">
        <span class="finance-insights-summary-label">сейчас (все счета ≈)</span>
        <span class="finance-insights-summary-val">${fmtRub(series.totalRubNow)}</span>
        <span class="finance-chart-meta">
          счета ${accounts.filter((a) => !a.archived).length} · снимков ${snapCount} · плановых статей ${activePlanned.length} · операций ${finance.length}
        </span>
      </div>

      ${!liveMode &&
      html`
        <div class="finance-chart-demo-hint-wrap">
          <span>График план/факт работает в LIVE — подключи Supabase.</span>
        </div>
      `}

      <${FinanceBalanceChart}
        dates=${series.dates}
        fact=${series.fact}
        plan=${series.plan}
        markers=${series.markers}
        finance=${finance}
        balance_snapshots=${balance_snapshots}
        finance_planned_items=${finance_planned_items}
        today=${today}
        hoverDate=${hoverDate}
        onHoverDate=${setHoverDate}
        onDayClick=${setSelectedDate}
      />

      <div class="finance-insights-planned-wrap">
        <span class="finance-insights-planned-title">плановые статьи (finance_planned_items)</span>
        <div class="finance-insights-planned-list-wrap">
          ${activePlanned.length === 0 &&
          html`<span class="finance-insights-planned-empty">нет активных статей — проверь миграцию 0006 в Supabase</span>`}
          ${activePlanned.map((p) => html`
            <div class="finance-insights-planned-row-wrap" key=${p.id}>
              <span class="finance-insights-planned-row-text">${plannedItemLabel(p)}</span>
            </div>
          `)}
        </div>
        <span class="finance-chart-hint-block">
          План на графике — из этих статей. В таблице они же видны как строки типа planned (будущие даты).
          Факт — операции + баланс счетов (${fmtRub(accountsRub)}).
        </span>
      </div>

      <${FinanceDayDrawer}
        date=${selectedDate}
        finance=${finance}
        balance_snapshots=${balance_snapshots}
        finance_planned_items=${finance_planned_items}
        factBalance=${factAt}
        planBalance=${planAt}
        today=${today}
        liveMode=${liveMode}
        onClose=${() => setSelectedDate(null)}
        onOpenTxn=${(t) => onOpenRecord?.({ kind: "finance", record: t })}
        onAddTxn=${openNewTxn}
      />
    </div>
  `;
}
