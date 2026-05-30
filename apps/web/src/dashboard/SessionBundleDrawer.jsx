import { h, Fragment } from "preact";
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import htm from "htm";
import { ApiError } from "../api/client.ts";
import { manualPatch } from "./manualSave.js";
import {
  childEventsForSession,
  fmtExpensesShort,
  expensesForSessionEvent,
  linkedEventLabel,
  expenseFromForm,
} from "./sessionFinance.js";
import { formToSessionEventPatch, sessionEventToForm } from "./sessionEventEditor.js";
import { withAccountOptions, isExpenseField, getRecordEditorMeta } from "./recordEditor.js";
import DrawerNav from "./DrawerNav.jsx";
import { getRelatedLinks } from "./recordLinks.js";
import { isSportSessionEvent } from "./activityMetrics.js";

const html = htm.bind(h);

function FieldInput({ field, value, onChange, disabled }) {
  const id = `bundle-field-${field.key}`;
  const displayValue = value == null || value === "" ? "" : String(value);
  if (field.type === "textarea") {
    return html`
      <div class="record-drawer-field-wrap">
        <label class="record-drawer-label-wrap" for=${id}><span class="record-drawer-label">${field.label}</span></label>
        <textarea id=${id} class="record-drawer-input record-drawer-input--area" rows="2" disabled=${disabled}
          value=${displayValue} onInput=${(e) => onChange(field.key, e.target.value)}></textarea>
      </div>
    `;
  }
  if (field.type === "select") {
    const opts = [...(field.options || [])];
    if (displayValue && !opts.includes(displayValue)) opts.unshift(displayValue);
    return html`
      <div class="record-drawer-field-wrap">
        <label class="record-drawer-label-wrap" for=${id}><span class="record-drawer-label">${field.label}</span></label>
        <select id=${id} class="record-drawer-input" disabled=${disabled} value=${displayValue}
          onChange=${(e) => onChange(field.key, e.target.value)}>
          ${field.optional && html`<option value="">—</option>`}
          ${opts.map((o) => html`<option value=${o}>${o}</option>`)}
        </select>
      </div>
    `;
  }
  return html`
    <div class="record-drawer-field-wrap">
      <label class="record-drawer-label-wrap" for=${id}><span class="record-drawer-label">${field.label}</span></label>
      <input type=${field.type || "text"} id=${id} class="record-drawer-input" disabled=${disabled}
        value=${displayValue} onInput=${(e) => onChange(field.key, e.target.value)} />
    </div>
  `;
}

const PART_KINDS = ["other", "wake", "substance", "chores", "transport", "sport", "food", "work", "chill", "reminder"];

export default function SessionBundleDrawer({
  session,
  sessionEvents = [],
  activities = [],
  finance = [],
  accounts = [],
  liveMode = false,
  stack = [],
  navCtx = {},
  onClose,
  onBack,
  onNavigateStack,
  onOpenRecord,
  setSessions,
}) {
  const parts = useMemo(
    () => childEventsForSession(session.id, sessionEvents),
    [session.id, sessionEvents],
  );

  const [envelope, setEnvelope] = useState({
    date: session.date,
    category: session.category || "",
    project: session.project || "",
    note: session.note || "",
  });
  const [partForms, setPartForms] = useState({});
  const [saving, setSaving] = useState(false);

  const accountIds = useMemo(
    () => accounts.filter((a) => !a.archived).map((a) => a.id),
    [accounts],
  );

  const eventMeta = getRecordEditorMeta("session_event");
  const eventFields = useMemo(
    () => (eventMeta ? withAccountOptions(eventMeta.fields, accountIds) : []),
    [eventMeta, accountIds],
  );

  useEffect(() => {
    const next = {};
    for (const p of parts) {
      next[p.id] = sessionEventToForm(p, finance);
    }
    setPartForms(next);
  }, [parts, finance]);

  const setPartField = useCallback((partId, key, value) => {
    setPartForms((prev) => ({
      ...prev,
      [partId]: { ...prev[partId], [key]: value },
    }));
  }, []);

  const envelopeSpan = useMemo(() => {
    if (!parts.length) return `${session.start}–${session.end}`;
    const starts = parts.map((p) => String(p.start_time || "").slice(0, 5));
    const ends = parts.map((p) => String(p.end_time || "").slice(0, 5));
    return `${starts.sort()[0]}–${ends.sort().reverse()[0]}`;
  }, [parts, session]);

  const onSave = async () => {
    if (!liveMode) return;
    setSaving(true);
    try {
      await manualPatch("sessions", session.id, {
        category: envelope.category || null,
        project: envelope.project || null,
        notes: envelope.note || null,
      });

      if (setSessions) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === session.id
              ? {
                  ...s,
                  category: envelope.category,
                  project: envelope.project,
                  note: envelope.note,
                }
              : s,
          ),
        );
      }

      for (const p of parts) {
        const form = partForms[p.id];
        if (!form) continue;
        const patch = formToSessionEventPatch(form, session.id);
        let expensePayload = undefined;
        const parsed = expenseFromForm(form);
        if (parsed) expensePayload = parsed;
        else if (expensesForSessionEvent(p.id, finance).length) expensePayload = null;
        await manualPatch("session_events", p.id, patch, { expense: expensePayload });
      }

      const { notifyDataChanged } = await import("../api/manual");
      notifyDataChanged();
      onClose();
    } catch (e) {
      const msg = e?.message || String(e);
      if (e instanceof ApiError) alert(`Ошибка ${e.status}: ${JSON.stringify(e.body ?? msg)}`);
      else alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const expenseFields = eventFields.filter((f) => isExpenseField(f));

  return html`
    <${Fragment}>
      <div class="record-drawer-overlay record-drawer-overlay--open" onClick=${onClose} role="presentation"></div>
      <aside class="record-drawer record-drawer--open record-drawer--wide" onClick=${(e) => e.stopPropagation()}>
        <header class="record-drawer-header-wrap">
          <div class="record-drawer-title-wrap">
            <span class="record-drawer-title">Сессия · части</span>
            <span class="record-drawer-subtitle">${envelopeSpan} · ${envelope.category || "—"}</span>
          </div>
          <button type="button" class="btn btn--ghost btn--icon" onClick=${onClose}>×</button>
        </header>

        <div class="record-drawer-body-wrap">
          <${DrawerNav}
            stack=${stack}
            ctx=${navCtx}
            liveMode=${liveMode}
            onBack=${onBack}
            onNavigateToIndex=${onNavigateStack}
            onOpenLinked=${onOpenRecord}
            currentKind="session"
            currentRecord=${session}
            excludeKinds=${["session", "session_event"]}
          />
          <div class="record-drawer-section-wrap">
            <span class="record-drawer-section-title">оболочка (ежедневник)</span>
          </div>
          <${FieldInput} field=${{ key: "date", label: "дата", type: "date" }} value=${envelope.date}
            onChange=${(k, v) => setEnvelope((e) => ({ ...e, [k]: v }))} disabled=${!liveMode || saving} />
          <${FieldInput} field=${{ key: "category", label: "категория", type: "text" }} value=${envelope.category}
            onChange=${(k, v) => setEnvelope((e) => ({ ...e, [k]: v }))} disabled=${!liveMode || saving} />
          <${FieldInput} field=${{ key: "project", label: "заголовок", type: "text" }} value=${envelope.project}
            onChange=${(k, v) => setEnvelope((e) => ({ ...e, [k]: v }))} disabled=${!liveMode || saving} />
          <${FieldInput} field=${{ key: "note", label: "заметка", type: "textarea", optional: true }} value=${envelope.note}
            onChange=${(k, v) => setEnvelope((e) => ({ ...e, [k]: v }))} disabled=${!liveMode || saving} />

          <div class="record-drawer-section-wrap">
            <span class="record-drawer-section-title">части (${parts.length})</span>
          </div>

          ${parts.map((p, idx) => {
            const form = partForms[p.id] || {};
            const pexp = expensesForSessionEvent(p.id, finance);
            const label = form.title || linkedEventLabel(p, finance) || `часть ${idx + 1}`;
            const partLinks = getRelatedLinks("session_event", p, navCtx).filter(
              (l) => l.kind !== "session",
            );
            return html`
              <div class="session-bundle-part-wrap" key=${p.id}>
                <div class="session-bundle-part-head-wrap">
                  <span class="session-bundle-part-title">${label}</span>
                  ${pexp.length ? html`<span class="session-bundle-part-exp">${fmtExpensesShort(pexp)}</span>` : ""}
                  ${onOpenRecord && html`
                    <button type="button" class="drawer-nav-link-btn drawer-nav-link-btn--inline"
                      onClick=${() => onOpenRecord({ kind: "session_event", record: p })}>
                      <span class="drawer-nav-link-btn__text">редактировать →</span>
                    </button>
                  `}
                </div>
                ${partLinks.length > 0 && html`
                  <div class="session-bundle-part-links-wrap">
                    ${partLinks.map((l) => html`
                      <button type="button" class="drawer-nav-link-btn" key=${l.kind + l.record.id}
                        disabled=${!liveMode}
                        onClick=${() => onOpenRecord({ kind: l.kind, record: l.record })}>
                        <span class="drawer-nav-link-btn__text">${l.label} →</span>
                      </button>
                    `)}
                  </div>
                `}
                <${FieldInput} field=${{ key: "kind", label: "kind", type: "select", options: PART_KINDS }}
                  value=${form.kind} onChange=${(k, v) => setPartField(p.id, k, v)} disabled=${!liveMode || saving} />
                <${FieldInput} field=${{ key: "title", label: "название", type: "text" }}
                  value=${form.title} onChange=${(k, v) => setPartField(p.id, k, v)} disabled=${!liveMode || saving} />
                <div class="session-bundle-part-times-wrap">
                  <${FieldInput} field=${{ key: "start", label: "начало", type: "time" }}
                    value=${form.start} onChange=${(k, v) => setPartField(p.id, k, v)} disabled=${!liveMode || saving} />
                  <${FieldInput} field=${{ key: "end", label: "конец", type: "time" }}
                    value=${form.end} onChange=${(k, v) => setPartField(p.id, k, v)} disabled=${!liveMode || saving} />
                </div>
                ${(isSportSessionEvent(p) || form.kind === "sport") && html`
                  <${FieldInput} field=${{ key: "sport_type", label: "sport_type", type: "text" }}
                    value=${form.sport_type} onChange=${(k, v) => setPartField(p.id, k, v)} disabled=${!liveMode || saving} />
                  <${FieldInput} field=${{ key: "calories_burned", label: "ккал (ивент)", type: "number" }}
                    value=${form.calories_burned} onChange=${(k, v) => setPartField(p.id, k, v)} disabled=${!liveMode || saving} />
                  <${FieldInput} field=${{ key: "distance_km", label: "км", type: "number", optional: true }}
                    value=${form.distance_km} onChange=${(k, v) => setPartField(p.id, k, v)} disabled=${!liveMode || saving} />
                `}
                <div class="record-drawer-section-wrap">
                  <span class="record-drawer-section-title">расход этой части</span>
                </div>
                ${expenseFields.map(
                  (field) => html`
                    <${FieldInput} key=${p.id + field.key} field=${field} value=${form[field.key]}
                      onChange=${(k, v) => setPartField(p.id, k, v)} disabled=${!liveMode || saving} />
                  `,
                )}
              </div>
            `;
          })}
        </div>

        <footer class="record-drawer-footer-wrap">
          ${liveMode && html`
            <button type="button" class="btn btn--primary" disabled=${saving} onClick=${onSave}>
              <span class="btn__text-wrap">${saving ? "сохранение…" : "сохранить всё"}</span>
            </button>
          `}
          <button type="button" class="btn btn--ghost" onClick=${onClose}>закрыть</button>
        </footer>
      </aside>
    </${Fragment}>
  `;
}
