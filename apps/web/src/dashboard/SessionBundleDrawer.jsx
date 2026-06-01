import { h, Fragment } from "preact";
import { useState, useCallback, useMemo } from "preact/hooks";
import htm from "htm";
import { ApiError } from "../api/client.ts";
import { manualPatch } from "./manualSave.js";
import { childEventsForSession, fmtExpensesShort, linkedEventLabel } from "./sessionFinance.js";
import { sessionEventDrawerPolicy } from "./drawerFieldPolicy.js";
import { sessionEventTimeSpan } from "./recordDisplay.js";
import { DrawerLinkedBlock } from "./DrawerLinkedBlock.jsx";
import DrawerSubstancesList from "./DrawerSubstancesList.jsx";
import { substancesForSessionPhase } from "./substanceSession.js";

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

function BundlePartStaticRow({ label, value }) {
  if (value == null || value === "") return null;
  return html`
    <div class="session-bundle-part-static-row-wrap">
      <span class="session-bundle-part-static-label">${label}</span>
      <span class="session-bundle-part-static-value">${value}</span>
    </div>
  `;
}

/** Read-only preview; open session_event drawer via card title click. */
function BundlePartCard({ part, idx, policy, finance, meals, sessionEvents, liveMode, onOpenRecord }) {
  const title =
    linkedEventLabel(part, finance, meals, sessionEvents) ||
    part.kind ||
    `атом ${idx + 1}`;
  const pexp = policy.expenseTxn ? [policy.expenseTxn] : [];
  const openAtom = () =>
    onOpenRecord?.({ kind: "session_event", record: part });

  return html`
    <article class="session-bundle-part-card-wrap">
      <header class="session-bundle-part-card-head-wrap">
        <span class="session-bundle-part-card-index">${idx + 1}</span>
        <div class="session-bundle-part-card-title-wrap">
          ${onOpenRecord
            ? html`
              <button
                type="button"
                class="session-bundle-part-card-title-btn"
                disabled=${!liveMode}
                onClick=${openAtom}
              >
                <span class="session-bundle-part-card-title-btn__text">${title}</span>
              </button>
            `
            : html`<span class="session-bundle-part-title">${title}</span>`}
          ${pexp.length ? html`<span class="session-bundle-part-exp">${fmtExpensesShort(pexp)}</span>` : ""}
        </div>
      </header>

      <div class="session-bundle-part-static-wrap">
        <${BundlePartStaticRow} label="kind" value=${part.kind || "—"} />
        <${BundlePartStaticRow} label="время" value=${sessionEventTimeSpan(part)} />
        <${BundlePartStaticRow} label="название" value=${part.title || "—"} />
        <${BundlePartStaticRow} label="category" value=${part.category} />
      </div>

      <${DrawerLinkedBlock}
        rows=${policy.readonlyRows}
        onOpenRecord=${onOpenRecord}
        liveMode=${liveMode}
      />
    </article>
  `;
}

export default function SessionBundleDrawer({
  session,
  sessionEvents = [],
  activities = [],
  finance = [],
  liveMode = false,
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
  const [saving, setSaving] = useState(false);

  const partPolicies = useMemo(() => {
    const m = {};
    for (const p of parts) m[p.id] = sessionEventDrawerPolicy(p, ctx);
    return m;
  }, [parts, ctx]);

  const phaseSubstances = useMemo(
    () => substancesForSessionPhase(session, navCtx.substances || [], sessionEvents),
    [session, navCtx.substances, sessionEvents],
  );

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
              <span class="record-drawer-section-hint">${parts.length} шт. · клик по заголовку · правка в атоме</span>
            </div>
            <div class="session-bundle-parts-list-wrap">
              ${parts.map((p, idx) => {
                const policy = partPolicies[p.id] || sessionEventDrawerPolicy(p, ctx);
                return html`
                  <${BundlePartCard}
                    key=${p.id}
                    part=${p}
                    idx=${idx}
                    policy=${policy}
                    finance=${finance}
                    meals=${navCtx.meals || []}
                    sessionEvents=${sessionEvents}
                    liveMode=${liveMode}
                    onOpenRecord=${onOpenRecord}
                  />
                `;
              })}
            </div>
          </section>

          <${DrawerSubstancesList}
            title="субстанции в фазе"
            hint=${`в интервале ${envelopeSpan}`}
            rows=${phaseSubstances}
            onOpenRecord=${onOpenRecord}
            liveMode=${liveMode}
            emptyText="в этой фазе нет substances"
          />
        </div>

        <footer class="record-drawer-footer-wrap">
          ${liveMode && html`
            <button type="button" class="btn btn--primary" disabled=${saving} onClick=${onSave}>
              <span class="btn__text-wrap">${saving ? "сохранение…" : "сохранить оболочку"}</span>
            </button>
          `}
          <button type="button" class="btn btn--ghost" onClick=${onClose}>закрыть</button>
        </footer>
      </aside>
    </${Fragment}>
  `;
}
