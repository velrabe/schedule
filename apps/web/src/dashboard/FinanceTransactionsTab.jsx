import { h } from "preact";
import { useMemo, useCallback } from "preact/hooks";
import htm from "htm";
import { localTodayISO } from "./useDateStrip.js";
import { addDaysISO, mergeFinanceTableRows, PLAN_HORIZON_DAYS } from "./financeInsights.js";
import { financeTxnLabel, financeTxnShortMeta } from "./financeDisplay.js";
import { useSheetState, applySheet, SheetHeader, Toolbar, sheetIcons } from "./sheetUi.js";

const html = htm.bind(h);
const I = sheetIcons;

export default function FinanceTransactionsTab({
  finance = [],
  finance_planned_items = [],
  liveMode = false,
  onOpenRecord,
}) {
  const today = localTodayISO();
  const rows = useMemo(
    () => mergeFinanceTableRows(finance, finance_planned_items, today),
    [finance, finance_planned_items, today],
  );

  const { sort, toggleSort, filters, setFilter, search, setSearch } = useSheetState("finance-tx", {
    id: "date",
    dir: "desc",
  });

  const txnTypes = useMemo(
    () => [...new Set(rows.map((t) => t.txn_type || "expense"))].sort(),
    [rows],
  );
  const currencies = useMemo(
    () => [...new Set(rows.map((t) => t.currency || "VND"))].sort(),
    [rows],
  );

  const columns = useMemo(
    () => [
      { id: "date", label: "дата", thClass: "col-w--md", sortAccessor: (r) => r.date },
      { id: "time", label: "время", thClass: "col-w--sm", sortAccessor: (r) => r.time || "" },
      {
        id: "txn_type",
        label: "тип",
        thClass: "col-w--sm",
        filterOptions: txnTypes,
        filterMode: "exact",
        sortAccessor: (r) => r.txn_type || "",
      },
      {
        id: "amount",
        label: "сумма",
        thClass: "col-w--md",
        sortAccessor: (r) => Number(r.amount) || 0,
        accessor: (r) => financeTxnLabel(r),
      },
      {
        id: "currency",
        label: "валюта",
        thClass: "col-w--xs",
        filterOptions: currencies,
        filterMode: "exact",
      },
      { id: "account", label: "счёт", thClass: "col-w--md", sortAccessor: (r) => r.account || "" },
      { id: "category", label: "категория", thClass: "col-w--md", sortAccessor: (r) => r.category || "" },
      {
        id: "merchant",
        label: "контрагент",
        thClass: "col-w--md",
        sortAccessor: (r) => r.merchant || "",
      },
      {
        id: "meta",
        label: "детали",
        thClass: "col-w--lg",
        sortable: false,
        filterable: false,
        accessor: (r) => financeTxnShortMeta(r),
      },
    ],
    [txnTypes, currencies],
  );

  const view = useMemo(
    () => applySheet(rows, sort, filters, search, columns),
    [rows, sort, filters, search, columns],
  );

  const factCount = finance.length;
  const plannedCount = rows.length - factCount;

  const addTxn = useCallback(() => {
    if (!onOpenRecord) return;
    onOpenRecord({
      kind: "finance",
      record: {
        _new: true,
        date: today,
        txn_type: "expense",
        account: "cash_vnd",
        currency: "VND",
        amount: "",
        category: "",
      },
    });
  }, [onOpenRecord, today]);

  const openRow = (t) => {
    if (t._planned) return;
    onOpenRecord?.({ kind: "finance", record: t });
  };

  return html`
    <div class="finance-tx-table-wrap">
      <${Toolbar}
        search=${search}
        setSearch=${setSearch}
        extraLeft=${liveMode &&
        onOpenRecord &&
        html`
          <button type="button" class="btn" onClick=${addTxn}>
            <span class="btn__icon-wrap">${I.plus()}</span>
            <span class="btn__text-wrap">добавить</span>
          </button>
        `}
      />
      <div class="table-wrap">
        <table class="sheet sheet--clickable">
          <${SheetHeader}
            columns=${columns}
            sort=${sort}
            toggleSort=${toggleSort}
            filters=${filters}
            setFilter=${setFilter}
          />
          <tbody>
            ${view.length === 0 &&
            html`
              <tr>
                <td colspan=${columns.length}>
                  <div class="sheet__td">
                    <span class="finance-empty">нет операций</span>
                  </div>
                </td>
              </tr>
            `}
            ${view.map((t) => {
              const isPlanned = Boolean(t._planned);
              const clickable = liveMode && onOpenRecord && !isPlanned;
              return html`
                <tr
                  key=${t.id}
                  class=${`${isPlanned ? "sheet-row--planned" : ""} ${clickable ? "sheet-row--clickable" : ""}`}
                  onClick=${clickable ? () => openRow(t) : undefined}
                >
                  <td>
                    <div class="sheet__td">
                      <span>${t.date}${isPlanned && t.date > today ? "" : ""}</span>
                    </div>
                  </td>
                  <td>
                    <div class="sheet__td">
                      <span>${t.time ? String(t.time).slice(0, 5) : "—"}</span>
                    </div>
                  </td>
                  <td>
                    <div class="sheet__td">
                      <span>${isPlanned ? "planned" : t.txn_type || "expense"}</span>
                    </div>
                  </td>
                  <td>
                    <div class="sheet__td">
                      <span>${financeTxnLabel(t)}</span>
                    </div>
                  </td>
                  <td>
                    <div class="sheet__td">
                      <span>${t.currency || ""}</span>
                    </div>
                  </td>
                  <td>
                    <div class="sheet__td">
                      <span>${t.account || "—"}</span>
                    </div>
                  </td>
                  <td>
                    <div class="sheet__td">
                      <span>${t.category || "—"}</span>
                    </div>
                  </td>
                  <td>
                    <div class="sheet__td">
                      <span>${t.merchant || "—"}</span>
                    </div>
                  </td>
                  <td>
                    <div class="sheet__td sheet__td--muted">
                      <span>${financeTxnShortMeta(t)}</span>
                    </div>
                  </td>
                </tr>
              `;
            })}
          </tbody>
        </table>
      </div>
      <div class="footer-bar">
        <span>${view.length} в таблице · ${factCount} факт · ${plannedCount} план (6 мес · до ${addDaysISO(today, PLAN_HORIZON_DAYS)})</span>
      </div>
    </div>
  `;
}
