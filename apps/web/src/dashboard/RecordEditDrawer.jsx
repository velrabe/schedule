import { h, Fragment } from "preact";
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import htm from "htm";
import { ApiError } from "../api/client.ts";
import { manualPatch } from "./manualSave.js";
import {
  getRecordEditorMeta,
  recordToForm,
  formToDbPatch,
  formToSessionUi,
  withAccountOptions,
  isExpenseField,
} from "./recordEditor.js";
import { findFoodSessionForMeal } from "./mergeNutrition.js";
import {
  childEventsForSession,
  expenseForSession,
  expensesForSessionEvent,
  expenseFromForm,
  resolveExpenseSessionId,
} from "./sessionFinance.js";
import SessionBundleDrawer from "./SessionBundleDrawer.jsx";

const html = htm.bind(h);

function selectOptions(field, value) {
  const base = [...(field.options || [])];
  const v = value == null ? "" : String(value);
  if (v && !base.includes(v)) base.unshift(v);
  return base;
}

function FieldInput({ field, value, onChange, disabled }) {
  const id = `record-field-${field.key}`;
  const onInput = (e) => onChange(field.key, e.target.value);
  const displayValue = value == null || value === "" ? "" : String(value);

  if (field.type === "textarea") {
    return html`
      <div class="record-drawer-field-wrap">
        <label class="record-drawer-label-wrap" for=${id}>
          <span class="record-drawer-label">${field.label}</span>
        </label>
        <textarea
          id=${id}
          class="record-drawer-input record-drawer-input--area"
          rows="3"
          disabled=${disabled}
          value=${displayValue}
          onInput=${onInput}
        ></textarea>
      </div>
    `;
  }

  if (field.type === "select") {
    const options = selectOptions(field, value);
    return html`
      <div class="record-drawer-field-wrap">
        <label class="record-drawer-label-wrap" for=${id}>
          <span class="record-drawer-label">${field.label}</span>
        </label>
        <select
          id=${id}
          class="record-drawer-input"
          disabled=${disabled}
          value=${displayValue}
          onChange=${(e) => onChange(field.key, e.target.value)}
        >
          ${field.optional && html`<option value="">—</option>`}
          ${options.map((opt) => html`<option value=${opt}>${opt}</option>`)}
        </select>
      </div>
    `;
  }

  return html`
    <div class="record-drawer-field-wrap">
      <label class="record-drawer-label-wrap" for=${id}>
        <span class="record-drawer-label">${field.label}</span>
      </label>
      <input
        type=${field.type || "text"}
        id=${id}
        class="record-drawer-input"
        disabled=${disabled}
        value=${displayValue}
        onInput=${onInput}
      />
    </div>
  `;
}

export default function RecordEditDrawer({
  target,
  onClose,
  onSwitchTarget,
  liveMode = false,
  setSessions,
  sessions = [],
  sessionEvents = [],
  activities = [],
  finance = [],
  accounts = [],
}) {
  const bundleParts = useMemo(() => {
    if (!target || target.kind !== "session") return [];
    return childEventsForSession(target.record.id, sessionEvents);
  }, [target, sessionEvents]);

  if (target?.kind === "session" && bundleParts.length > 0) {
    return html`
      <${SessionBundleDrawer}
        session=${target.record}
        sessionEvents=${sessionEvents}
        activities=${activities}
        finance=${finance}
        accounts=${accounts}
        liveMode=${liveMode}
        onClose=${onClose}
        onOpenRecord=${(t) => (onSwitchTarget ? onSwitchTarget(t) : null)}
        setSessions=${setSessions}
      />
    `;
  }

  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const meta = target ? getRecordEditorMeta(target.kind) : null;

  const accountIds = useMemo(
    () => accounts.filter((a) => !a.archived).map((a) => a.id),
    [accounts],
  );

  const fields = useMemo(() => {
    if (!meta) return [];
    return withAccountOptions(meta.fields, accountIds);
  }, [meta, accountIds]);

  const linkedSession = useMemo(() => {
    if (!target || target.kind !== "meal") return null;
    return findFoodSessionForMeal(target.record, sessions);
  }, [target, sessions]);

  const linkedExpense = useMemo(() => {
    if (!target) return null;
    if (target.kind === "session_event") {
      return expensesForSessionEvent(target.record.id, finance)[0] ?? null;
    }
    const sid = resolveExpenseSessionId(target.kind, target.record, sessions);
    return expenseForSession(sid, finance);
  }, [target, finance, sessions]);

  useEffect(() => {
    if (target) {
      setForm(recordToForm(target.kind, target.record, linkedExpense, linkedSession, finance, activities));
    }
    else setForm({});
  }, [target?.kind, target?.record?.id, linkedExpense?.id, linkedSession?.id, linkedSession?.start, activities]);

  useEffect(() => {
    if (!target) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [Boolean(target)]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const isNew = Boolean(target?.record?._new);

  const onSave = async () => {
    if (!target || !meta || !liveMode) return;
    if (target.record._synthetic) {
      alert("Сначала сохраните сессию еды — откройте её из списка сессий.");
      return;
    }
    setSaving(true);
    try {
      const patch = formToDbPatch(target.kind, form);
      if (target.kind === "meal" && linkedSession?.id) {
        patch.session_id = linkedSession.id;
      }
      const supportsExpense =
        target.kind === "session" || target.kind === "meal" || target.kind === "session_event";
      let expensePayload = undefined;
      if (supportsExpense) {
        const parsed = expenseFromForm(form);
        if (parsed) {
          expensePayload = { ...parsed };
          if (target.kind === "meal" && form.name) {
            expensePayload.merchant = expensePayload.merchant || form.name;
          }
          if (target.kind === "session" && form.project) {
            expensePayload.merchant = expensePayload.merchant || form.project;
          }
        } else if (linkedExpense) {
          expensePayload = null;
        }
      }
      const expenseSessionId = resolveExpenseSessionId(target.kind, target.record, sessions);
      const extra = {
        expense: expensePayload,
        expense_session_id: expenseSessionId || undefined,
      };

      if (target.kind === "session" && setSessions && !isNew) {
        const ui = formToSessionUi(form);
        setSessions((prev) =>
          prev.map((s) => (s.id === target.record.id ? { ...s, ...ui } : s)),
        );
      }

      if (isNew) {
        const { insertRow, notifyDataChanged } = await import("../api/manual");
        const row = { ...patch };
        if (target.record.id && !String(target.record.id).startsWith("plan:")) {
          row.id = target.record.id;
        }
        await insertRow(meta.resource, row);
        notifyDataChanged();
      } else {
        await manualPatch(meta.resource, target.record.id, patch, extra);
      }
      onClose();
    } catch (e) {
      const msg = e?.message || String(e);
      if (msg === "Failed to fetch") {
        alert(
          "Не удалось связаться с API (manual). Проверь, что задеплоена edge function manual и VITE_FUNCTIONS_URL в GitHub Secrets.",
        );
      } else if (e instanceof ApiError) {
        alert(`Ошибка ${e.status}: ${JSON.stringify(e.body ?? msg)}`);
      } else {
        alert(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!target || !meta || !liveMode) return;
    if (!confirm("Удалить запись?")) return;
    setDeleting(true);
    try {
      const { deleteRow, notifyDataChanged } = await import("../api/manual");
      await deleteRow(meta.resource, target.record.id);
      if (target.kind === "session" && setSessions) {
        setSessions((prev) => prev.filter((s) => s.id !== target.record.id));
      }
      notifyDataChanged();
      onClose();
    } catch (e) {
      const msg = e?.message || String(e);
      if (msg === "Failed to fetch") {
        alert("Не удалось связаться с API (manual).");
      } else if (e instanceof ApiError) {
        alert(`Ошибка ${e.status}: ${JSON.stringify(e.body ?? msg)}`);
      } else {
        alert(msg);
      }
    } finally {
      setDeleting(false);
    }
  };

  if (!target || !meta) return null;

  const subtitle = isNew ? "новая запись" : meta.subtitle(target.record);
  const busy = saving || deleting;
  const stopInside = (e) => e.stopPropagation();
  const mainFields = fields.filter((f) => !isExpenseField(f));
  const expenseFields = fields.filter((f) => isExpenseField(f));
  const showExpense = expenseFields.length > 0;

  return html`
    <${Fragment}>
      <div
        class="record-drawer-overlay record-drawer-overlay--open"
        onClick=${onClose}
        role="presentation"
      ></div>
      <aside
        class="record-drawer record-drawer--open"
        aria-label=${meta.title}
        onClick=${stopInside}
      >
        <header class="record-drawer-header-wrap">
          <div class="record-drawer-title-wrap">
            <span class="record-drawer-title">${meta.title}</span>
            <span class="record-drawer-subtitle">${subtitle}</span>
          </div>
          <div class="record-drawer-header-actions-wrap">
            <button type="button" class="btn btn--ghost btn--icon" onClick=${onClose} title="закрыть">
              <span class="btn__icon-wrap">×</span>
            </button>
          </div>
        </header>

        <div class="record-drawer-body-wrap">
          <div class="record-drawer-fields-wrap">
            ${mainFields.map(
              (field) => html`
                <${FieldInput}
                  key=${field.key}
                  field=${field}
                  value=${form[field.key]}
                  onChange=${setField}
                  disabled=${!liveMode || busy}
                />
              `,
            )}
            ${showExpense && html`
              <div class="record-drawer-section-wrap">
                <span class="record-drawer-section-title">расход · списание со счёта</span>
              </div>
              ${expenseFields.map(
                (field) => html`
                  <${FieldInput}
                    key=${field.key}
                    field=${field}
                    value=${form[field.key]}
                    onChange=${setField}
                    disabled=${!liveMode || busy}
                  />
                `,
              )}
            `}
            ${!liveMode &&
            html`
              <div class="record-drawer-demo-hint-wrap">
                <span>Редактирование доступно только в LIVE-режиме (Supabase).</span>
              </div>
            `}
          </div>
        </div>

        <footer class="record-drawer-footer-wrap">
          ${liveMode &&
          html`
            <button type="button" class="btn btn--primary" disabled=${busy} onClick=${onSave}>
              <span class="btn__text-wrap">${saving ? "сохранение…" : "сохранить"}</span>
            </button>
            ${!isNew &&
            html`
              <button type="button" class="btn btn--ghost record-drawer-delete-btn" disabled=${busy} onClick=${onDelete}>
                <span class="btn__text-wrap">${deleting ? "удаление…" : "удалить"}</span>
              </button>
            `}
          `}
          <button type="button" class="btn btn--ghost" onClick=${onClose} disabled=${busy}>
            <span class="btn__text-wrap">закрыть</span>
          </button>
        </footer>
      </aside>
    </${Fragment}>
  `;
}
