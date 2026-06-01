import { h, Fragment } from "preact";
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import htm from "htm";
import { ApiError } from "../api/client.ts";
import { manualPatch } from "./manualSave.js";
import {
  childEventsForSession,
  fmtExpensesShort,
  expensesForSessionEvent,
} from "./sessionFinance.js";
import { formToSessionEventPatch, sessionEventToForm } from "./sessionEventEditor.js";
import { withAccountOptions, isExpenseField, getRecordEditorMeta } from "./recordEditor.js";
import DrawerNav from "./DrawerNav.jsx";
import { isSportSessionEvent } from "./activityMetrics.js";
import {
  sessionEventDrawerPolicy,
  stripExpenseFormFields,
  shouldSendExpensePatch,
  applySessionEventPolicyToPatch,
} from "./drawerFieldPolicy.js";
import { DrawerLinkedBlock } from "./DrawerLinkedBlock.jsx";
import DrawerSubstancesList from "./DrawerSubstancesList.jsx";
import { substancesForSessionPhase, substancesForDate } from "./substanceSession.js";

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

function BundlePartCard({
  part,
  idx,
  form,
  policy,
  finance,
  expenseExpanded,
  onToggleExpense,
  expenseFields,
  liveMode,
  saving,
  onOpenRecord,
  setPartField,
}) {
  const pexp = expensesForSessionEvent(part.id, finance);
  const label =
    policy.readonlyRows.find((r) => r.key === "meal")?.value ||
    form.title ||
    part.title ||
    `атом ${idx + 1}`;

  const showKind = !policy.hideFields.has("kind");
  const showTitle = !policy.hideFields.has("title");
  const showEnd = !policy.hideFields.has("end");
  const showSport =
    (isSportSessionEvent(part) || form.kind === "sport") &&
    !policy.hideFields.has("sport_type");

  return html`
    <article class="session-bundle-part-card-wrap">
      <header class="session-bundle-part-card-head-wrap">
        <span class="session-bundle-part-card-index">${idx + 1}</span>
        <div class="session-bundle-part-card-title-wrap">
          <span class="session-bundle-part-title">${label}</span>
          ${pexp.length ? html`<span class="session-bundle-part-exp">${fmtExpensesShort(pexp)}</span>` : ""}
        </div>
        ${onOpenRecord && html`
          <button type="button" class="drawer-nav-link-btn drawer-nav-link-btn--inline"
            onClick=${() => onOpenRecord({ kind: "session_event", record: part })}>
            <span class="drawer-nav-link-btn__text">атом →</span>
          </button>
        `}
      </header>

      <${DrawerLinkedBlock}
        rows=${policy.readonlyRows}
        onOpenRecord=${onOpenRecord}
        liveMode=${liveMode}
      />

      <div class="session-bundle-part-fields-wrap">
        ${showKind && html`
          <${FieldInput} field=${{ key: "kind", label: "kind", type: "select", options: PART_KINDS }}
            value=${form.kind} onChange=${(k, v) => setPartField(part.id, k, v)} disabled=${!liveMode || saving} />
        `}
        ${showTitle && html`
          <${FieldInput} field=${{ key: "title", label: "название", type: "text" }}
            value=${form.title} onChange=${(k, v) => setPartField(part.id, k, v)} disabled=${!liveMode || saving} />
        `}
        <div class="session-bundle-part-times-wrap">
          <${FieldInput} field=${{ key: "start", label: "начало", type: "time" }}
            value=${form.start} onChange=${(k, v) => setPartField(part.id, k, v)} disabled=${!liveMode || saving} />
          ${showEnd && html`
            <${FieldInput} field=${{ key: "end", label: "конец", type: "time" }}
              value=${form.end} onChange=${(k, v) => setPartField(part.id, k, v)} disabled=${!liveMode || saving} />
          `}
        </div>
        ${showSport && html`
          <${FieldInput} field=${{ key: "sport_type", label: "sport_type", type: "text" }}
            value=${form.sport_type} onChange=${(k, v) => setPartField(part.id, k, v)} disabled=${!liveMode || saving} />
          <${FieldInput} field=${{ key: "calories_burned", label: "ккал (ивент)", type: "number" }}
            value=${form.calories_burned} onChange=${(k, v) => setPartField(part.id, k, v)} disabled=${!liveMode || saving} />
          <${FieldInput} field=${{ key: "distance_km", label: "км", type: "number", optional: true }}
            value=${form.distance_km} onChange=${(k, v) => setPartField(part.id, k, v)} disabled=${!liveMode || saving} />
        `}
      </div>

      ${policy.canEditExpenseInline && html`
        <div class="session-bundle-part-expense-edit-wrap">
          ${!expenseExpanded && html`
            <button type="button" class="btn btn--ghost btn--block session-bundle-add-expense-btn"
              disabled=${!liveMode || saving} onClick=${onToggleExpense}>
              <span class="btn__text-wrap">добавить расход</span>
            </button>
          `}
          ${expenseExpanded && html`
            <div class="session-bundle-expense-fields-wrap">
              <div class="record-drawer-section-wrap">
                <span class="record-drawer-section-title">расход этой части</span>
              </div>
              ${expenseFields.map(
                (field) => html`
                  <${FieldInput} key=${part.id + field.key} field=${field} value=${form[field.key]}
                    onChange=${(k, v) => setPartField(part.id, k, v)} disabled=${!liveMode || saving} />
                `,
              )}
              <button type="button" class="btn btn--ghost btn--sm"
                disabled=${!liveMode || saving} onClick=${onToggleExpense}>
                <span class="btn__text-wrap">скрыть</span>
              </button>
            </div>
          `}
        </div>
      `}
    </article>
  `;
}

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

  const ctx = useMemo(
    () => ({
      sessions: navCtx.sessions || [],
      sessionEvents,
      meals: navCtx.meals || [],
      activities,
      substances: navCtx.substances || [],
      finance,
    }),
    [navCtx, sessionEvents, activities, finance],
  );

  const [envelope, setEnvelope] = useState({
    date: session.date,
    category: session.category || "",
    project: session.project || "",
    note: session.note || "",
  });
  const [partForms, setPartForms] = useState({});
  const [expenseExpanded, setExpenseExpanded] = useState({});
  const [saving, setSaving] = useState(false);

  const accountIds = useMemo(
    () => accounts.filter((a) => !a.archived).map((a) => a.id),
    [accounts],
  );

  const eventMeta = getRecordEditorMeta("session_event");
  const expenseFields = useMemo(() => {
    if (!eventMeta) return [];
    return withAccountOptions(eventMeta.fields, accountIds).filter((f) => isExpenseField(f));
  }, [eventMeta, accountIds]);

  const partPolicies = useMemo(() => {
    const m = {};
    for (const p of parts) m[p.id] = sessionEventDrawerPolicy(p, ctx);
    return m;
  }, [parts, ctx]);

  useEffect(() => {
    const next = {};
    for (const p of parts) {
      const policy = sessionEventDrawerPolicy(p, ctx);
      let f = sessionEventToForm(p, finance, activities);
      if (!policy.canEditExpenseInline) f = stripExpenseFormFields(f);
      next[p.id] = f;
    }
    setPartForms(next);
    setExpenseExpanded((prev) => {
      const merged = { ...prev };
      for (const p of parts) {
        if (merged[p.id] === undefined) merged[p.id] = false;
      }
      return merged;
    });
  }, [parts, finance, activities, ctx]);

  const setPartField = useCallback((partId, key, value) => {
    setPartForms((prev) => ({
      ...prev,
      [partId]: { ...prev[partId], [key]: value },
    }));
  }, []);

  const toggleExpense = useCallback((partId) => {
    setExpenseExpanded((prev) => ({ ...prev, [partId]: !prev[partId] }));
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
        const policy = partPolicies[p.id] || sessionEventDrawerPolicy(p, ctx);
        let patch = formToSessionEventPatch(form, session.id);
        patch = applySessionEventPolicyToPatch(patch, policy);
        const expensePayload = shouldSendExpensePatch(
          policy,
          form,
          p.id,
          finance,
          Boolean(expenseExpanded[p.id]),
        );
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

          <section class="session-bundle-envelope-card-wrap">
            <div class="record-drawer-section-wrap record-drawer-section-wrap--card">
              <span class="record-drawer-section-title">оболочка · ежедневник</span>
              <span class="record-drawer-section-hint">одна строка в расписании</span>
            </div>
            <div class="session-bundle-envelope-fields-wrap">
              <${FieldInput} field=${{ key: "date", label: "дата", type: "date" }} value=${envelope.date}
                onChange=${(k, v) => setEnvelope((e) => ({ ...e, [k]: v }))} disabled=${!liveMode || saving} />
              <${FieldInput} field=${{ key: "category", label: "категория", type: "text" }} value=${envelope.category}
                onChange=${(k, v) => setEnvelope((e) => ({ ...e, [k]: v }))} disabled=${!liveMode || saving} />
              <${FieldInput} field=${{ key: "project", label: "заголовок", type: "text" }} value=${envelope.project}
                onChange=${(k, v) => setEnvelope((e) => ({ ...e, [k]: v }))} disabled=${!liveMode || saving} />
              <${FieldInput} field=${{ key: "note", label: "заметка", type: "textarea", optional: true }} value=${envelope.note}
                onChange=${(k, v) => setEnvelope((e) => ({ ...e, [k]: v }))} disabled=${!liveMode || saving} />
            </div>
          </section>

          <section class="session-bundle-parts-section-wrap">
            <div class="record-drawer-section-wrap record-drawer-section-wrap--card">
              <span class="record-drawer-section-title">атомы внутри фазы</span>
              <span class="record-drawer-section-hint">${parts.length} шт. · время и связи</span>
            </div>
            <div class="session-bundle-parts-list-wrap">
              ${parts.map((p, idx) => {
                const policy = partPolicies[p.id] || sessionEventDrawerPolicy(p, ctx);
                const form = partForms[p.id] || {};
                return html`
                  <${BundlePartCard}
                    key=${p.id}
                    part=${p}
                    idx=${idx}
                    form=${form}
                    policy=${policy}
                    finance=${finance}
                    expenseExpanded=${Boolean(expenseExpanded[p.id])}
                    onToggleExpense=${() => toggleExpense(p.id)}
                    expenseFields=${expenseFields}
                    liveMode=${liveMode}
                    saving=${saving}
                    onOpenRecord=${onOpenRecord}
                    setPartField=${setPartField}
                  />
                `;
              })}
            </div>
          </section>

          <${DrawerSubstancesList}
            title="дозы в этой фазе"
            hint=${`substances · по времени ${envelopeSpan}`}
            rows=${phaseSubstances}
            onOpenRecord=${onOpenRecord}
            liveMode=${liveMode}
            emptyText="в интервале фазы нет записей substances"
          />

          ${daySubstances.length > 0 && html`
            <${DrawerSubstancesList}
              title=${`субстанции · ${session.date}`}
              hint=${`${daySubstances.length} за день · таблица substances`}
              rows=${daySubstances}
              onOpenRecord=${onOpenRecord}
              liveMode=${liveMode}
              emptyText="нет"
            />
          `}
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
