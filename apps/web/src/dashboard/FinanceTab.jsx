import { h } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import htm from "htm";
import { useDateStrip } from "./useDateStrip.js";
import { RecordOpenRow } from "./RecordOpenRow.jsx";
import { ACCOUNT_LABELS, fmtMoney, financeTxnLabel, financeTxnShortMeta } from "./financeDisplay.js";
import FinanceChartTab from "./FinanceChartTab.jsx";
import FinanceTransactionsTab from "./FinanceTransactionsTab.jsx";

const html = htm.bind(h);
const FINANCE_SUBTAB_KEY = "schedule-tracker:finance-subtab";

function FinanceSubTabBtn({ id, active, onClick, label }) {
  return html`
    <button
      type="button"
      class=${`finance-subtab ${active === id ? "finance-subtab--active" : ""}`}
      onClick=${() => onClick(id)}
    >
      <span class="finance-subtab__text">${label}</span>
    </button>
  `;
}

function FinanceDaysView({ days, accounts = [], finance = [], active = true, liveMode = false, onOpenRecord }) {
  const knownDates = useMemo(() => {
    const set = new Set();
    for (const d of days) set.add(d.date);
    for (const t of finance) set.add(t.date);
    return [...set];
  }, [days, finance]);

  const {
    today,
    visibleDates,
    scrollRef,
    todayColRef,
    pastSentinelRef,
    futureSentinelRef,
    onScroll,
    canLoadPast,
    canLoadFuture,
    scrollToToday,
  } = useDateStrip(knownDates, { active });

  const txByDate = useMemo(() => {
    const map = new Map();
    for (const t of finance) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date).push(t);
    }
    for (const [, list] of map) {
      list.sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
    }
    return map;
  }, [finance]);

  const activeAccounts = accounts.filter((a) => !a.archived);

  return html`
    <div class="finance-wrap">
      <div class="finance-accounts-wrap">
        ${activeAccounts.length === 0 && html`<span class="finance-empty">счета не загружены</span>`}
        ${activeAccounts.map((a) => html`
          <div class="finance-account-card-wrap" key=${a.id}>
            <span class="finance-account-name">${a.name || ACCOUNT_LABELS[a.id] || a.id}</span>
            <span class="finance-account-balance">${fmtMoney(a.balance, a.currency)}</span>
          </div>
        `)}
      </div>
      <${DateStripControls}
        canLoadPast=${canLoadPast}
        canLoadFuture=${canLoadFuture}
        onToday=${scrollToToday}
      />
      <div class="finance-scroll-wrap date-strip-scroll" ref=${scrollRef} onScroll=${onScroll}>
        <div class="date-strip-sentinel date-strip-sentinel--past" ref=${pastSentinelRef}></div>
        ${visibleDates.map((date) => {
          const dayTx = txByDate.get(date) || [];
          const isToday = date === today;
          const expenses = dayTx.filter((t) => (t.txn_type || "expense") === "expense");
          const expense = expenses.reduce((a, t) => a + Math.abs(Number(t.amount) || 0), 0);
          const transferCount = dayTx.filter((t) => (t.txn_type || "") === "transfer").length;
          return html`
            <div
              class=${`finance-day-col ${isToday ? "finance-day-col--today" : ""}`}
              key=${date}
              ref=${isToday ? todayColRef : null}
            >
              <div class="finance-day-head-wrap">
                <span class="finance-day-date">${date}${isToday ? " · today" : ""}</span>
                ${expense > 0 &&
                html`<span class="finance-day-total">расход ${fmtMoney(expense, expenses[0]?.currency || "VND")}</span>`}
                ${transferCount > 0 &&
                html`<span class="finance-day-total finance-day-total--transfer">переводов ${transferCount}</span>`}
              </div>
              <div class="finance-tx-wrap">
                ${dayTx.length === 0 && html`<span class="finance-empty">нет операций</span>`}
                ${dayTx.map((t) => {
                  const isTransfer = (t.txn_type || "") === "transfer";
                  return html`
                    <${RecordOpenRow}
                      key=${t.id}
                      className=${`finance-tx-row ${isTransfer ? "finance-tx-row--transfer" : ""}`}
                      onOpen=${onOpenRecord ? () => onOpenRecord({ kind: "finance", record: t }) : null}
                      disabled=${!liveMode}
                    >
                      <span class="finance-tx-amount">${financeTxnLabel(t)}</span>
                      <span class="finance-tx-meta">${financeTxnShortMeta(t)}</span>
                      ${t.notes && html`<span class="finance-tx-note">${t.notes}</span>`}
                    </${RecordOpenRow}>
                  `;
                })}
              </div>
            </div>
          `;
        })}
        <div class="date-strip-sentinel date-strip-sentinel--future" ref=${futureSentinelRef}></div>
      </div>
    </div>
  `;
}

function DateStripControls({ canLoadPast, canLoadFuture, onToday }) {
  return html`
    <div class="date-strip-controls-wrap">
      <div class="date-strip-hints-wrap">
        ${canLoadPast
          ? html`<span class="date-strip-hint">← край — ещё 15 дней</span>`
          : html`<span class="date-strip-hint date-strip-hint--muted">начало истории</span>`}
        ${canLoadFuture
          ? html`<span class="date-strip-hint">край → — ещё 15 дней</span>`
          : html`<span class="date-strip-hint date-strip-hint--muted">конец горизонта</span>`}
      </div>
      <button class="btn btn--ghost" onClick=${onToday} type="button" title="к сегодня">
        <span class="btn__text-wrap">today</span>
      </button>
    </div>
  `;
}

export default function FinanceTab({
  days,
  accounts = [],
  finance = [],
  balance_snapshots = [],
  finance_planned_items = [],
  active = true,
  liveMode = false,
  onOpenRecord,
}) {
  const [sub, setSub] = useState(() => {
    try {
      const saved = localStorage.getItem(FINANCE_SUBTAB_KEY);
      if (saved === "days" || saved === "chart" || saved === "table") return saved;
    } catch {}
    return "days";
  });

  useEffect(() => {
    localStorage.setItem(FINANCE_SUBTAB_KEY, sub);
  }, [sub]);

  return html`
    <div class="finance-tab-shell">
      <nav class="finance-subtabbar">
        <${FinanceSubTabBtn} id="days" active=${sub} onClick=${setSub} label="по дням" />
        <${FinanceSubTabBtn} id="chart" active=${sub} onClick=${setSub} label="график" />
        <${FinanceSubTabBtn} id="table" active=${sub} onClick=${setSub} label="таблица" />
      </nav>
      <div class="finance-panel">
        ${sub === "days" &&
        html`
          <${FinanceDaysView}
            days=${days}
            accounts=${accounts}
            finance=${finance}
            active=${active}
            liveMode=${liveMode}
            onOpenRecord=${onOpenRecord}
          />
        `}
        ${sub === "chart" &&
        html`
          <${FinanceChartTab}
            accounts=${accounts}
            finance=${finance}
            balance_snapshots=${balance_snapshots}
            finance_planned_items=${finance_planned_items}
            liveMode=${liveMode}
            onOpenRecord=${onOpenRecord}
          />
        `}
        ${sub === "table" &&
        html`
          <${FinanceTransactionsTab}
            finance=${finance}
            liveMode=${liveMode}
            onOpenRecord=${onOpenRecord}
          />
        `}
      </div>
    </div>
  `;
}
