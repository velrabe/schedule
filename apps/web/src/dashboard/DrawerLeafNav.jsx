import { h } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import htm from "htm";
import { DrawerLinkedBlock } from "./DrawerLinkedBlock.jsx";
import {
  buildLeafNavRows,
  defaultFinanceAttachForm,
  attachFinanceToMeal,
  attachFinanceToActivity,
  FINANCE_ATTACH_FIELDS,
} from "./leafLinks.js";
import { withAccountOptions } from "./recordEditor.js";

const html = htm.bind(h);

function FieldInput({ field, value, onChange, disabled, accountIds }) {
  const fields = withAccountOptions([field], accountIds);
  const f = fields[0];
  const id = `leaf-finance-${f.key}`;
  const displayValue = value == null || value === "" ? "" : String(value);

  if (f.type === "select") {
    const options = [...(f.options || [])];
    if (displayValue && !options.includes(displayValue)) options.unshift(displayValue);
    return html`
      <div class="record-drawer-field-wrap">
        <label class="record-drawer-label-wrap" for=${id}>
          <span class="record-drawer-label">${f.label}</span>
        </label>
        <select
          id=${id}
          class="record-drawer-input"
          disabled=${disabled}
          value=${displayValue}
          onChange=${(e) => onChange(f.key, e.target.value)}
        >
          ${options.map((opt) => html`<option value=${opt}>${opt}</option>`)}
        </select>
      </div>
    `;
  }

  return html`
    <div class="record-drawer-field-wrap">
      <label class="record-drawer-label-wrap" for=${id}>
        <span class="record-drawer-label">${f.label}</span>
      </label>
      <input
        type=${f.type || "text"}
        id=${id}
        class="record-drawer-input"
        disabled=${disabled}
        value=${displayValue}
        onInput=${(e) => onChange(f.key, e.target.value)}
      />
    </div>
  `;
}

/**
 * Bottom navigation on meal / activity / finance leaf drawers.
 */
export default function DrawerLeafNav({
  kind,
  record,
  ctx = {},
  liveMode = false,
  busy = false,
  accountIds = [],
  onOpenRecord,
}) {
  const [expanded, setExpanded] = useState(false);
  const [attachForm, setAttachForm] = useState({});
  const [attachBusy, setAttachBusy] = useState(false);

  const { rows, canCreateFinance } = buildLeafNavRows(kind, record, ctx);
  const showBlock = rows.length > 0 || (canCreateFinance && liveMode);

  useEffect(() => {
    setExpanded(false);
    if (kind === "meal" || kind === "activity") {
      setAttachForm(defaultFinanceAttachForm(kind, record));
    }
  }, [kind, record?.id]);

  const setAttachField = useCallback((key, value) => {
    setAttachForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onCreateFinance = async () => {
    if (!liveMode || !record?.id) return;
    setAttachBusy(true);
    try {
      if (kind === "meal") await attachFinanceToMeal(record, attachForm, ctx);
      else if (kind === "activity") await attachFinanceToActivity(record, attachForm, ctx);
      setExpanded(false);
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setAttachBusy(false);
    }
  };

  if (!showBlock) return null;

  const blockBusy = busy || attachBusy;

  return html`
    <div class="drawer-leaf-nav-wrap">
      <div class="record-drawer-section-wrap">
        <span class="record-drawer-section-title">связанные записи</span>
      </div>
      <${DrawerLinkedBlock}
        rows=${rows}
        onOpenRecord=${onOpenRecord}
        liveMode=${liveMode}
      />
      ${canCreateFinance && !rows.length && !expanded && html`
        <div class="drawer-leaf-nav-actions-wrap">
          <button
            type="button"
            class="btn btn--ghost btn--block session-bundle-add-expense-btn"
            disabled=${!liveMode || blockBusy}
            onClick=${() => setExpanded(true)}
          >
            <span class="btn__text-wrap">добавить транзакцию</span>
          </button>
        </div>
      `}
      ${canCreateFinance && expanded && html`
        <div class="record-drawer-attach-wrap">
          <div class="record-drawer-section-wrap">
            <span class="record-drawer-section-hint">расход откроется в операции · редактирование там</span>
          </div>
          ${FINANCE_ATTACH_FIELDS.map(
            (field) => html`
              <${FieldInput}
                key=${field.key}
                field=${field}
                value=${attachForm[field.key]}
                onChange=${setAttachField}
                disabled=${!liveMode || blockBusy}
                accountIds=${accountIds}
              />
            `,
          )}
          <div class="record-drawer-attach-actions-wrap">
            <button
              type="button"
              class="btn btn--primary btn--sm"
              disabled=${!liveMode || blockBusy}
              onClick=${onCreateFinance}
            >
              <span class="btn__text-wrap">сохранить транзакцию</span>
            </button>
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              disabled=${blockBusy}
              onClick=${() => setExpanded(false)}
            >
              <span class="btn__text-wrap">отмена</span>
            </button>
          </div>
        </div>
      `}
    </div>
  `;
}
