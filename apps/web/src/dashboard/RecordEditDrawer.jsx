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
  filterSessionEventFields,
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
import DrawerNav from "./DrawerNav.jsx";
import DrawerLeafNav from "./DrawerLeafNav.jsx";
import DrawerParentAtom from "./DrawerParentAtom.jsx";
import { isSubstanceMirrorEvent } from "./drawerNavigation.js";
import { DrawerLinkedBlock } from "./DrawerLinkedBlock.jsx";
import {
  findFinanceForMeal,
  findFinanceForActivity,
  leafDrawerExcludeKinds,
} from "./leafLinks.js";
import {
  sessionEventDrawerPolicy,
  shouldSendExpensePatch,
  applySessionEventPolicyToPatch,
} from "./drawerFieldPolicy.js";
import DrawerSubstancesList from "./DrawerSubstancesList.jsx";
import { substancesForSessionPhase } from "./substanceSession.js";
import { sessionBreadcrumbLabel } from "./drawerNavigation.js";
import { mapSessionEventForDrawer, sessionEventDisplayLabel } from "./recordDisplay.js";
import {
  defaultSubstanceAttachForm,
  defaultMealAttachForm,
  defaultActivityAttachForm,
  attachSubstanceToAtom,
  attachMealToAtom,
  attachActivityToAtom,
  SUBSTANCE_ATTACH_FIELDS,
  MEAL_ATTACH_FIELDS,
  ACTIVITY_ATTACH_FIELDS,
} from "./atomAttach.js";

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
  stack = [],
  navCtx = {},
  onClose,
  onBack,
  onNavigateStack,
  onSwitchTarget,
  liveMode = false,
  setSessions,
  sessions = [],
  sessionEvents = [],
  activities = [],
  finance = [],
  accounts = [],
}) {
  const current = target;
  const bundleParts = useMemo(() => {
    if (!current || current.kind !== "session") return [];
    return childEventsForSession(current.record.id, sessionEvents);
  }, [current, sessionEvents]);

  const ctx = useMemo(
    () => ({
      sessions,
      sessionEvents,
      meals: navCtx.meals || [],
      activities,
      finance,
      substances: navCtx.substances || [],
      ...navCtx,
    }),
    [sessions, sessionEvents, navCtx, activities, finance],
  );

  const sessionPhaseSubstances = useMemo(() => {
    if (current?.kind !== "session") return [];
    return substancesForSessionPhase(current.record, ctx.substances || [], sessionEvents);
  }, [current?.kind, current?.record?.id, ctx.substances, sessionEvents]);

  const isSessionBundle =
    current?.kind === "session" && bundleParts.length > 0;

  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expenseExpanded, setExpenseExpanded] = useState(false);
  const [substanceExpanded, setSubstanceExpanded] = useState(false);
  const [mealExpanded, setMealExpanded] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [substanceAttachForm, setSubstanceAttachForm] = useState({});
  const [mealAttachForm, setMealAttachForm] = useState({});
  const [activityAttachForm, setActivityAttachForm] = useState({});
  const [attachBusy, setAttachBusy] = useState(false);

  const meta = current ? getRecordEditorMeta(current.kind) : null;

  const accountIds = useMemo(
    () => accounts.filter((a) => !a.archived).map((a) => a.id),
    [accounts],
  );

  const fields = useMemo(() => {
    if (!meta) return [];
    return withAccountOptions(meta.fields, accountIds);
  }, [meta, accountIds]);

  const linkedSession = useMemo(() => {
    if (!current || current.kind !== "meal") return null;
    return findFoodSessionForMeal(current.record, sessions);
  }, [current, sessions]);

  const linkedExpense = useMemo(() => {
    if (!current) return null;
    if (current.kind === "session_event") {
      return expensesForSessionEvent(current.record.id, finance)[0] ?? null;
    }
    if (current.kind === "meal") {
      return findFinanceForMeal(current.record, ctx);
    }
    if (current.kind === "activity") {
      return findFinanceForActivity(current.record, ctx);
    }
    if (current.kind === "session") {
      const sid = resolveExpenseSessionId(current.kind, current.record, sessions);
      return expenseForSession(sid, finance);
    }
    return null;
  }, [current, finance, sessions, ctx]);

  const eventPolicy = useMemo(() => {
    if (current?.kind !== "session_event") return null;
    return sessionEventDrawerPolicy(current.record, ctx);
  }, [current?.kind, current?.record?.id, ctx]);

  useEffect(() => {
    if (current) {
      setForm(
        recordToForm(
          current.kind,
          current.record,
          linkedExpense,
          linkedSession,
          finance,
          activities,
          ctx.meals || [],
          sessionEvents,
        ),
      );
      if (current.kind === "session_event") {
        setExpenseExpanded(false);
        setSubstanceExpanded(false);
        setMealExpanded(false);
        setActivityExpanded(false);
        setSubstanceAttachForm(defaultSubstanceAttachForm(current.record));
        setMealAttachForm(defaultMealAttachForm(current.record));
        setActivityAttachForm(defaultActivityAttachForm(current.record));
      } else {
        setExpenseExpanded(Boolean(linkedExpense));
        setSubstanceExpanded(false);
        setMealExpanded(false);
        setActivityExpanded(false);
      }
    } else setForm({});
  }, [current?.kind, current?.record?.id, linkedExpense?.id, linkedSession?.id, linkedSession?.start, activities, finance, ctx, sessionEvents]);

  const setSubstanceAttachField = useCallback((key, value) => {
    setSubstanceAttachForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setMealAttachField = useCallback((key, value) => {
    setMealAttachForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setActivityAttachField = useCallback((key, value) => {
    setActivityAttachForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onAttachSubstance = async () => {
    if (!current?.record?.id || !liveMode) return;
    setAttachBusy(true);
    try {
      await attachSubstanceToAtom(current.record.id, substanceAttachForm);
      setSubstanceExpanded(false);
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setAttachBusy(false);
    }
  };

  const onAttachMeal = async () => {
    if (!current?.record?.id || !liveMode) return;
    setAttachBusy(true);
    try {
      await attachMealToAtom(current.record, mealAttachForm);
      setMealExpanded(false);
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setAttachBusy(false);
    }
  };

  const onAttachActivity = async () => {
    if (!current?.record?.id || !liveMode) return;
    setAttachBusy(true);
    try {
      await attachActivityToAtom(current.record, activityAttachForm);
      setActivityExpanded(false);
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setAttachBusy(false);
    }
  };

  useEffect(() => {
    if (
      current?.kind === "session_event" &&
      isSubstanceMirrorEvent(current.record) &&
      current.record.substance_id &&
      onSwitchTarget
    ) {
      const sub = (ctx.substances || []).find((s) => s.id === current.record.substance_id);
      if (sub) onSwitchTarget({ kind: "substance", record: sub });
    }
  }, [current?.kind, current?.record?.id, ctx.substances, onSwitchTarget]);

  const refreshStackForCurrent = useCallback(() => {
    if (!current || !onSwitchTarget) return;
    onSwitchTarget({ kind: current.kind, record: current.record });
  }, [current?.kind, current?.record?.id, onSwitchTarget]);

  useEffect(() => {
    if (!current) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [Boolean(current)]);

  useEffect(() => {
    if (!current) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, onClose]);

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const isNew = Boolean(current?.record?._new);

  const onSave = async () => {
    if (!current || !meta || !liveMode) return;
    if (current.record._synthetic) {
      alert("Сначала сохраните сессию еды — откройте её из списка сессий.");
      return;
    }
    setSaving(true);
    try {
      let patch = formToDbPatch(current.kind, form);
      if (current.kind === "session_event" && eventPolicy) {
        patch = applySessionEventPolicyToPatch(patch, eventPolicy);
      }
      if (current.kind === "meal" && linkedSession?.id) {
        patch.session_id = linkedSession.id;
      }
      const supportsExpense =
        current.kind === "session" || current.kind === "session_event";
      let expensePayload = undefined;
      if (supportsExpense) {
        if (current.kind === "session_event" && eventPolicy) {
          expensePayload = shouldSendExpensePatch(
            eventPolicy,
            form,
            current.record.id,
            finance,
            expenseExpanded,
          );
        } else {
          const parsed = expenseFromForm(form);
          if (parsed) {
            expensePayload = { ...parsed };
            if (current.kind === "session" && form.project) {
              expensePayload.merchant = expensePayload.merchant || form.project;
            }
          } else if (linkedExpense) {
            expensePayload = null;
          }
        }
      }
      const expenseSessionId = resolveExpenseSessionId(current.kind, current.record, sessions);
      const extra = {
        expense: expensePayload,
        expense_session_id: expenseSessionId || undefined,
      };

      if (current.kind === "session" && setSessions && !isNew) {
        const ui = formToSessionUi(form);
        setSessions((prev) =>
          prev.map((s) => (s.id === current.record.id ? { ...s, ...ui } : s)),
        );
      }

      if (isNew) {
        const { insertRow, notifyDataChanged } = await import("../api/manual");
        const row = { ...patch };
        if (current.record.id && !String(current.record.id).startsWith("plan:")) {
          row.id = current.record.id;
        }
        await insertRow(meta.resource, row);
        notifyDataChanged();
      } else {
        await manualPatch(meta.resource, current.record.id, patch, extra);
      }
      if (stack.length > 1) onBack();
      else onClose();
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
    if (!current || !meta || !liveMode) return;
    if (!confirm("Удалить запись?")) return;
    setDeleting(true);
    try {
      const { deleteRow, notifyDataChanged } = await import("../api/manual");
      await deleteRow(meta.resource, current.record.id);
      if (current.kind === "session" && setSessions) {
        setSessions((prev) => prev.filter((s) => s.id !== current.record.id));
      }
      notifyDataChanged();
      if (stack.length > 1) onBack();
      else onClose();
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

  const drawerSubtitle = useMemo(() => {
    if (!current || !meta) return "";
    if (current.record?._new) return "новая запись";
    if (current.kind === "session") return sessionBreadcrumbLabel(current.record);
    if (current.kind === "session_event") {
      return sessionEventDisplayLabel(
        mapSessionEventForDrawer(current.record),
        finance,
        ctx.meals || [],
        sessionEvents,
        ctx.substances || [],
      );
    }
    return meta.subtitle(current.record);
  }, [current?.kind, current?.record?.id, meta, finance, ctx.meals]);

  if (!current) return null;

  if (isSessionBundle) {
    return html`
      <${SessionBundleDrawer}
        session=${current.record}
        sessionEvents=${sessionEvents}
        activities=${activities}
        finance=${finance}
        accounts=${accounts}
        liveMode=${liveMode}
        navCtx=${ctx}
        onClose=${onClose}
        onOpenRecord=${onSwitchTarget}
        setSessions=${setSessions}
      />
    `;
  }

  if (!meta) return null;

  const subtitle = drawerSubtitle;
  const busy = saving || deleting || attachBusy;
  const stopInside = (e) => e.stopPropagation();
  let mainFields = fields.filter((f) => !isExpenseField(f));
  if (current?.kind === "session_event") {
    mainFields = filterSessionEventFields(current.record, mainFields);
    if (eventPolicy) {
      mainFields = mainFields.filter((f) => !eventPolicy.hideFields.has(f.key));
    }
  }
  const expenseFields = fields.filter((f) => isExpenseField(f));
  const showExpenseEditable =
    expenseFields.length > 0 &&
    (current?.kind !== "session_event" ||
      (eventPolicy?.canEditExpenseInline && expenseExpanded));
  const showExpenseAddButton =
    current?.kind === "session_event" &&
    eventPolicy?.canEditExpenseInline &&
    !expenseExpanded;
  const showExpenseLegacy =
    current?.kind === "session" && expenseFields.length > 0;

  const navExcludeKinds = leafDrawerExcludeKinds(current?.kind);

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
          <${DrawerNav}
            stack=${stack}
            ctx=${ctx}
            liveMode=${liveMode}
            onBack=${onBack}
            onNavigateToIndex=${onNavigateStack}
            onOpenLinked=${onSwitchTarget}
            currentKind=${current.kind}
            currentRecord=${current.record}
            excludeKinds=${navExcludeKinds}
          />
          <div class="record-drawer-fields-wrap">
            ${current?.kind === "session_event" && eventPolicy?.readonlyRows?.length > 0 && html`
              <${DrawerLinkedBlock}
                rows=${eventPolicy.readonlyRows}
                onOpenRecord=${onSwitchTarget}
                liveMode=${liveMode}
              />
            `}
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
            ${current?.kind === "session_event" && eventPolicy?.canAddSubstance && !substanceExpanded && html`
              <button type="button" class="btn btn--ghost btn--block session-bundle-add-expense-btn"
                disabled=${!liveMode || busy} onClick=${() => setSubstanceExpanded(true)}>
                <span class="btn__text-wrap">добавить субстанцию</span>
              </button>
            `}
            ${current?.kind === "session_event" && eventPolicy?.canAddSubstance && substanceExpanded && html`
              <div class="record-drawer-attach-wrap">
                <div class="record-drawer-section-wrap">
                  <span class="record-drawer-section-title">субстанция · доза</span>
                  <span class="record-drawer-section-hint">привязка к этому атому · отдельная строка substances</span>
                </div>
                ${SUBSTANCE_ATTACH_FIELDS.map(
                  (field) => html`
                    <${FieldInput}
                      key=${`sub-attach-${field.key}`}
                      field=${field}
                      value=${substanceAttachForm[field.key]}
                      onChange=${setSubstanceAttachField}
                      disabled=${!liveMode || busy}
                    />
                  `,
                )}
                <div class="record-drawer-attach-actions-wrap">
                  <button type="button" class="btn btn--primary btn--sm" disabled=${!liveMode || busy}
                    onClick=${onAttachSubstance}>
                    <span class="btn__text-wrap">сохранить дозу</span>
                  </button>
                  <button type="button" class="btn btn--ghost btn--sm" disabled=${busy}
                    onClick=${() => setSubstanceExpanded(false)}>
                    <span class="btn__text-wrap">отмена</span>
                  </button>
                </div>
              </div>
            `}
            ${current?.kind === "session_event" && eventPolicy?.canAddMeal && !mealExpanded && html`
              <button type="button" class="btn btn--ghost btn--block session-bundle-add-expense-btn"
                disabled=${!liveMode || busy} onClick=${() => setMealExpanded(true)}>
                <span class="btn__text-wrap">добавить приём пищи</span>
              </button>
            `}
            ${current?.kind === "session_event" && eventPolicy?.canAddMeal && mealExpanded && html`
              <div class="record-drawer-attach-wrap">
                <div class="record-drawer-section-wrap">
                  <span class="record-drawer-section-title">приём пищи + расход</span>
                  <span class="record-drawer-section-hint">meal в БД + meal_id на атом · расход на этот же атом</span>
                </div>
                ${MEAL_ATTACH_FIELDS.map(
                  (field) => html`
                    <${FieldInput}
                      key=${`meal-attach-${field.key}`}
                      field=${field}
                      value=${mealAttachForm[field.key]}
                      onChange=${setMealAttachField}
                      disabled=${!liveMode || busy}
                    />
                  `,
                )}
                <div class="record-drawer-attach-actions-wrap">
                  <button type="button" class="btn btn--primary btn--sm" disabled=${!liveMode || busy}
                    onClick=${onAttachMeal}>
                    <span class="btn__text-wrap">сохранить приём</span>
                  </button>
                  <button type="button" class="btn btn--ghost btn--sm" disabled=${busy}
                    onClick=${() => setMealExpanded(false)}>
                    <span class="btn__text-wrap">отмена</span>
                  </button>
                </div>
              </div>
            `}
            ${current?.kind === "session_event" && eventPolicy?.canAddActivity && !activityExpanded && html`
              <button type="button" class="btn btn--ghost btn--block session-bundle-add-expense-btn"
                disabled=${!liveMode || busy} onClick=${() => setActivityExpanded(true)}>
                <span class="btn__text-wrap">добавить активность</span>
              </button>
            `}
            ${current?.kind === "session_event" && eventPolicy?.canAddActivity && activityExpanded && html`
              <div class="record-drawer-attach-wrap">
                <div class="record-drawer-section-wrap">
                  <span class="record-drawer-section-title">активность · метрики</span>
                  <span class="record-drawer-section-hint">activities в БД + activity_id на атом · ккал/км там</span>
                </div>
                ${ACTIVITY_ATTACH_FIELDS.map(
                  (field) => html`
                    <${FieldInput}
                      key=${`act-attach-${field.key}`}
                      field=${field}
                      value=${activityAttachForm[field.key]}
                      onChange=${setActivityAttachField}
                      disabled=${!liveMode || busy}
                    />
                  `,
                )}
                <div class="record-drawer-attach-actions-wrap">
                  <button type="button" class="btn btn--primary btn--sm" disabled=${!liveMode || busy}
                    onClick=${onAttachActivity}>
                    <span class="btn__text-wrap">сохранить активность</span>
                  </button>
                  <button type="button" class="btn btn--ghost btn--sm" disabled=${busy}
                    onClick=${() => setActivityExpanded(false)}>
                    <span class="btn__text-wrap">отмена</span>
                  </button>
                </div>
              </div>
            `}
            ${showExpenseAddButton && html`
              <button type="button" class="btn btn--ghost btn--block session-bundle-add-expense-btn"
                disabled=${!liveMode || busy} onClick=${() => setExpenseExpanded(true)}>
                <span class="btn__text-wrap">добавить расход</span>
              </button>
            `}
            ${(showExpenseEditable || showExpenseLegacy) && html`
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
              ${current?.kind === "session_event" && eventPolicy?.canEditExpenseInline && expenseExpanded && html`
                <button type="button" class="btn btn--ghost btn--sm" disabled=${!liveMode || busy}
                  onClick=${() => setExpenseExpanded(false)}>
                  <span class="btn__text-wrap">скрыть</span>
                </button>
              `}
            `}
            ${current?.kind === "session" && html`
              <${DrawerSubstancesList}
                title="субстанции в сессии"
                hint="по времени оболочки"
                rows=${sessionPhaseSubstances}
                onOpenRecord=${onSwitchTarget}
                liveMode=${liveMode}
              />
            `}
            ${!liveMode &&
            html`
              <div class="record-drawer-demo-hint-wrap">
                <span>Редактирование доступно только в LIVE-режиме (Supabase).</span>
              </div>
            `}
          </div>
          ${(current.kind === "meal" ||
            current.kind === "activity" ||
            current.kind === "finance" ||
            current.kind === "substance") &&
          html`
            <${DrawerParentAtom}
              kind=${current.kind}
              record=${current.record}
              ctx=${ctx}
              liveMode=${liveMode}
              busy=${busy}
              onOpenRecord=${onSwitchTarget}
              onReassigned=${refreshStackForCurrent}
            />
          `}
          ${(current.kind === "meal" ||
            current.kind === "activity" ||
            current.kind === "finance") &&
          html`
            <${DrawerLeafNav}
              kind=${current.kind}
              record=${current.record}
              ctx=${ctx}
              liveMode=${liveMode}
              busy=${busy}
              accountIds=${accountIds}
              onOpenRecord=${onSwitchTarget}
            />
          `}
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
