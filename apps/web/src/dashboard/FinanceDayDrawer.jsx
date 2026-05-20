import { h, Fragment } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import htm from "htm";
import { upsertRow, notifyDataChanged } from "../api/manual";
import { fmtRub, getDayBreakdown } from "./financeInsights.js";
import { financeTxnLabel, financeTxnShortMeta } from "./financeDisplay.js";

const html = htm.bind(h);

function formatDateRu(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export default function FinanceDayDrawer({
  date,
  finance = [],
  balance_snapshots = [],
  finance_planned_items = [],
  factBalance,
  planBalance,
  today = "",
  liveMode = false,
  onClose,
  onOpenTxn,
  onAddTxn,
}) {
  const [factInput, setFactInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!date) return;
    const breakdown = getDayBreakdown(date, {
      finance,
      snapshots: balance_snapshots,
      plannedItems: finance_planned_items,
      today,
    });
    const snap = breakdown.snapshot;
    const val = snap != null ? String(Math.round(snap)) : factBalance != null ? String(Math.round(factBalance)) : "";
    setFactInput(val);
  }, [date, finance, balance_snapshots, finance_planned_items, today, factBalance]);

  useEffect(() => {
    if (!date) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [Boolean(date)]);

  useEffect(() => {
    if (!date) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [date, onClose]);

  const saveFact = useCallback(async () => {
    if (!liveMode || !date) return;
    const n = Number(factInput.replace(/\s/g, ""));
    if (!Number.isFinite(n)) return;
    setSaving(true);
    try {
      await upsertRow("balance_snapshots", { date, total_rub: n, notes: null });
      notifyDataChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [factInput, liveMode, date]);

  if (!date) return null;

  const breakdown = getDayBreakdown(date, {
    finance,
    snapshots: balance_snapshots,
    plannedItems: finance_planned_items,
    today,
  });

  const stopInside = (e) => e.stopPropagation();

  return html`
    <${Fragment}>
      <div
        class="record-drawer-overlay record-drawer-overlay--open"
        onClick=${onClose}
        role="presentation"
      ></div>
      <aside class="record-drawer record-drawer--open finance-day-drawer" aria-label="День" onClick=${stopInside}>
        <header class="record-drawer-header-wrap">
          <div class="record-drawer-title-wrap">
            <span class="record-drawer-title">${formatDateRu(date)}</span>
            <span class="record-drawer-subtitle">баланс и операции</span>
          </div>
          <div class="record-drawer-header-actions-wrap">
            <button type="button" class="btn btn--ghost btn--icon" onClick=${onClose} title="закрыть">
              <span class="btn__icon-wrap">×</span>
            </button>
          </div>
        </header>

        <div class="record-drawer-body-wrap">
          <div class="finance-day-summary-wrap">
            ${factBalance != null &&
            html`
              <div class="finance-day-summary-row-wrap">
                <span class="finance-day-summary-label">факт (график)</span>
                <span class="finance-day-summary-val">${fmtRub(factBalance)}</span>
              </div>
            `}
            ${planBalance != null &&
            html`
              <div class="finance-day-summary-row-wrap">
                <span class="finance-day-summary-label">план</span>
                <span class="finance-day-summary-val">${fmtRub(planBalance)}</span>
              </div>
            `}
            ${breakdown.txnDeltaRub !== 0 &&
            html`
              <div class="finance-day-summary-row-wrap">
                <span class="finance-day-summary-label">операции за день</span>
                <span class="finance-day-summary-val">${fmtRub(breakdown.txnDeltaRub)}</span>
              </div>
            `}
          </div>

          <div class="finance-day-fact-wrap">
            <span class="record-drawer-section-title">факт баланс (снимок)</span>
            <div class="finance-insights-log-wrap">
              <input
                class="finance-insights-log-input"
                type="number"
                placeholder="все счета в ₽"
                value=${factInput}
                disabled=${!liveMode || saving}
                onInput=${(e) => setFactInput(e.currentTarget.value)}
              />
              ${liveMode &&
              html`
                <button type="button" class="btn btn--primary" disabled=${saving} onClick=${saveFact}>
                  <span class="btn__text-wrap">${saving ? "…" : "сохранить"}</span>
                </button>
              `}
            </div>
          </div>

          <div class="finance-day-actions-wrap">
            <button type="button" class="btn" disabled=${!liveMode} onClick=${() => onAddTxn?.("expense")}>
              <span class="btn__text-wrap">+ расход</span>
            </button>
            <button type="button" class="btn" disabled=${!liveMode} onClick=${() => onAddTxn?.("income")}>
              <span class="btn__text-wrap">+ доход</span>
            </button>
            <button type="button" class="btn" disabled=${!liveMode} onClick=${() => onAddTxn?.("transfer")}>
              <span class="btn__text-wrap">+ перевод</span>
            </button>
          </div>

          <div class="finance-day-section-wrap">
            <span class="record-drawer-section-title">операции (${breakdown.txns.length})</span>
            <div class="finance-day-tx-list-wrap">
              ${breakdown.txns.length === 0 &&
              html`<span class="finance-day-empty">нет записей</span>`}
              ${breakdown.txns.map((t) => html`
                <button
                  type="button"
                  key=${t.id}
                  class="finance-day-tx-row-wrap"
                  onClick=${() => onOpenTxn?.(t)}
                >
                  <span class="finance-day-tx-label">${financeTxnLabel(t)}</span>
                  <span class="finance-day-tx-meta">${financeTxnShortMeta(t)}</span>
                </button>
              `)}
            </div>
          </div>

          ${breakdown.planned.length > 0 &&
          html`
            <div class="finance-day-section-wrap">
              <span class="record-drawer-section-title">план (${breakdown.planned.length})</span>
              <div class="finance-day-planned-list-wrap">
                ${breakdown.planned.map((p, i) => {
                  const sign = p.deltaRub >= 0 ? "+" : "−";
                  return html`
                    <div class="finance-day-planned-row-wrap" key=${i}>
                      <span class="finance-day-planned-text">${sign} ${p.title}: ${fmtRub(Math.abs(p.deltaRub))}</span>
                    </div>
                  `;
                })}
              </div>
            </div>
          `}

          ${!liveMode &&
          html`
            <div class="record-drawer-demo-hint-wrap">
              <span>Редактирование доступно только в LIVE-режиме.</span>
            </div>
          `}
        </div>

        <footer class="record-drawer-footer-wrap">
          <button type="button" class="btn btn--ghost" onClick=${onClose}>
            <span class="btn__text-wrap">закрыть</span>
          </button>
        </footer>
      </aside>
    </${Fragment}>
  `;
}
