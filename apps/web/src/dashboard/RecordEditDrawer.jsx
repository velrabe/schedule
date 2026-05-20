import { h, Fragment } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import htm from "htm";
import { ApiError } from "../api/client.ts";
import { manualPatch } from "./manualSave.js";
import {
  getRecordEditorMeta,
  recordToForm,
  formToDbPatch,
  formToSessionUi,
} from "./recordEditor.js";

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
  liveMode = false,
  setSessions,
}) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const meta = target ? getRecordEditorMeta(target.kind) : null;

  useEffect(() => {
    if (target) setForm(recordToForm(target.kind, target.record));
    else setForm({});
  }, [target?.kind, target?.record?.id]);

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

  const onSave = async () => {
    if (!target || !meta || !liveMode) return;
    setSaving(true);
    try {
      const patch = formToDbPatch(target.kind, form);
      if (target.kind === "session" && setSessions) {
        const ui = formToSessionUi(form);
        setSessions((prev) =>
          prev.map((s) => (s.id === target.record.id ? { ...s, ...ui } : s)),
        );
      }
      await manualPatch(meta.resource, target.record.id, patch);
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

  const subtitle = meta.subtitle(target.record);
  const busy = saving || deleting;
  const stopInside = (e) => e.stopPropagation();

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
            ${meta.fields.map(
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
            <button type="button" class="btn btn--ghost record-drawer-delete-btn" disabled=${busy} onClick=${onDelete}>
              <span class="btn__text-wrap">${deleting ? "удаление…" : "удалить"}</span>
            </button>
          `}
          <button type="button" class="btn btn--ghost" onClick=${onClose} disabled=${busy}>
            <span class="btn__text-wrap">закрыть</span>
          </button>
        </footer>
      </aside>
    </${Fragment}>
  `;
}
