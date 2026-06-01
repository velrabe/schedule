import { h } from "preact";
import { useState, useEffect, useMemo, useCallback, useRef } from "preact/hooks";
import htm from "htm";
import {
  DAYS as SEED_DAYS,
  SESSIONS as SEED_SESSIONS,
  EVENTS as SEED_EVENTS,
  CATEGORIES,
  DAY_TYPES,
} from "./seed.js";
import { useDateStrip, localTodayISO } from "./useDateStrip.js";
import { EditableField } from "./EditableField.jsx";
import RecordEditDrawer from "./RecordEditDrawer.jsx";
import { RecordOpenRow } from "./RecordOpenRow.jsx";
import { manualPatch, manualUpsertDay } from "./manualSave.js";
import {
  NutriBar,
  NutriMicroBars,
  barsForMeal,
  activityTypeLabel,
  activityDetailLabel,
} from "./nutriViz.jsx";
import { dayKcalOut, kcalOutBreakdown } from "./nutritionKcal.js";
import {
  mergeMealsWithFoodSessions,
  mealCountForNutrition,
  findFoodSessionForMeal,
  mealHasMacroData,
} from "./mergeNutrition.js";
import {
  childEventsForSession,
  expensesForSession,
  expensesForSessionEvent,
  fmtExpensesShort,
  linkedEventLabel,
} from "./sessionFinance.js";
import {
  buildCalendarDayInsights,
  dayExpenses,
  expenseRowLabel,
  substanceRowLabel,
  substancesForDate,
} from "./calendarDayDetail.js";
import {
  businessHourRows,
  fmtSessionDuration,
  findSessionOverlapPairs,
  isRedundantMirrorPart,
  partDurationMin,
  sessionDurationMin,
} from "./sessionDisplay.js";
import { formatKanbanDayCopy, copyTextToClipboard } from "./kanbanDayCopy.js";
import FinanceTab from "./FinanceTab.jsx";
import InsightsTab from "./InsightsTab.jsx";
import BodyTab from "./BodyTab.jsx";
import { useSheetState, applySheet, SheetHeader, Toolbar } from "./sheetUi.js";

const html = htm.bind(h);
const STORE_KEY = "schedule-tracker:v1";

// ---------------- helpers ----------------

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.days || !parsed.sessions || !parsed.events) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {}
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function ensureId(item) {
  return item.id ? item : { ...item, id: uid() };
}

function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  if (Number.isInteger(n) && digits > 0) return n.toFixed(0);
  return Number(n).toFixed(digits);
}

function fmtHours(min) {
  if (!min) return "0";
  return (min / 60).toFixed(min % 60 === 0 ? 0 : 1);
}

// Categories that count as productive output for the "business work" aggregate.
// work_paid: оплачиваемая работа на заказчиков.
// personal:  личные проекты (раньше называлось portfolio).
// byt:       бытовые задачи (банк, документы, отчёты, планирование).
const BUSINESS_CATS = new Set(["work_paid", "personal", "byt"]);
const PAID_CATS = new Set(["work_paid"]);
const PERSONAL_CATS = new Set(["personal"]);
const BYT_CATS = new Set(["byt"]);
const SPORT_CATS = new Set([
  "sport_surf",
  "sport_pickleball",
  "sport_muay_thai",
  "sport_bouldering",
  "sport_gym",
  "sport_hike",
  "sport_run",
  "sport_walk",
]);

function isSportSessionCategory(cat) {
  return SPORT_CATS.has(cat) || cat === "walk";
}

function categoryTone(cat) {
  if (cat === "work_paid") return "success";
  if (cat === "personal" || cat === "portfolio") return "info";
  if (cat === "byt" || cat === "planning") return "info";
  if (SPORT_CATS.has(cat)) return "warning";
  if (cat === "sport_walk" || cat === "walk") return "warning";
  if (cat === "chill" || cat === "sleep") return "danger";
  return "neutral";
}

function dayTypeTone(t) {
  switch (t) {
    case "work":
      return "success";
    case "mixed":
      return "info";
    case "sport":
      return "warning";
    case "social":
      return "info";
    case "travel":
      return "neutral";
    case "recovery":
      return "warning";
    case "burnout":
      return "danger";
    default:
      return "neutral";
  }
}

function timeToMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

// Returns minutes-since-wake for a session start. Sessions that take place
// after midnight (e.g. 00:30 when wake was 10:00) get a value greater than
// the morning sessions, so they sort to the end of the day.
function wakeRelativeMin(start, wake) {
  const s = timeToMin(start);
  const w = timeToMin(wake);
  return (s - w + 24 * 60) % (24 * 60);
}

function aggregateDay(date, sessions) {
  const ds = sessions.filter((s) => s.date === date);
  const sum = (pred) => ds.filter(pred).reduce((a, s) => a + (s.min || 0), 0);
  const work_paid_h = sum((s) => s.category === "work_paid") / 60;
  const personal_h = sum((s) => s.category === "personal" || s.category === "portfolio") / 60;
  const byt_h = sum((s) => s.category === "byt" || s.category === "planning") / 60;
  const business_h = work_paid_h + personal_h + byt_h;
  const sport_h = sum((s) => isSportSessionCategory(s.category)) / 60;
  const walk_h = sum((s) => s.category === "sport_walk" || s.category === "walk") / 60;
  const social_h = sum((s) => s.category === "social") / 60;
  const chill_h = sum((s) => s.category === "chill") / 60;
  return {
    work_paid_h,
    personal_h,
    byt_h,
    // legacy aliases for older consumers (Insights tab, etc.)
    portfolio_h: personal_h,
    planning_h: byt_h,
    business_h,
    sport_h,
    walk_h,
    social_h,
    chill_h,
    sessions: ds.length,
  };
}

function toCsv(rows) {
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) ? v.join("|") : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return rows.map((r) => r.map(escape).join(",")).join("\n");
}

function download(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------- icons ----------------

const I = {
  search: () => svgIcon("M11 19a8 8 0 1 1 5.3-14 8 8 0 0 1-5.3 14Zm10 2-4.35-4.35"),
  chevron: () => svgIcon("m9 6 6 6-6 6"),
  chevronLeft: () => svgIcon("m15 18-6-6 6-6"),
  chevronRight: () => svgIcon("m9 6 6 6-6 6"),
  download: () => svgIcon("M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"),
  sortAsc: () => svgIcon("m6 15 6-6 6 6"),
  sortDesc: () => svgIcon("m6 9 6 6 6-6"),
  sort: () => svgIcon("M8 7h12M8 12h9M8 17h6"),
  plus: () => svgIcon("M12 5v14M5 12h14"),
  x: () => svgIcon("M18 6 6 18M6 6l12 12"),
  reset: () => svgIcon("M3 12a9 9 0 1 0 3-6.7M3 4v5h5"),
  filter: () => svgIcon("M3 5h18l-7 9v6l-4-2v-4z"),
};

function svgIcon(d) {
  return html`
    <span class="icon" aria-hidden="true">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d=${d}></path>
      </svg>
    </span>
  `;
}

// ---------------- root app ----------------

function App(props = {}) {
  // Live mode: props.liveData is passed in. We do NOT use localStorage in live mode —
  // the source of truth is Supabase, edits remain in-memory until reload.
  const liveData = props.liveData || null;
  const sourceBadge = props.sourceBadge || null;
  const onReload = props.onReload || null;

  const initial = liveData
    ? {
        days: liveData.days.map(ensureId),
        sessions: liveData.sessions.map(ensureId),
        events: (liveData.events || []).map(ensureId),
      }
    : (loadState() || {
        days: SEED_DAYS.map(ensureId),
        sessions: SEED_SESSIONS.map(ensureId),
        events: SEED_EVENTS.map(ensureId),
      });

  const [days, setDays] = useState(initial.days);
  const [sessions, setSessions] = useState(initial.sessions);
  const [events, setEvents] = useState(initial.events);
  const [tab, setTab] = useState(() => {
    try {
      const t = localStorage.getItem("schedule-tracker:tab") || "days";
      if (t === "chart") {
        localStorage.setItem("schedule-tracker:finance-subtab", "chart");
        return "finance";
      }
      return t;
    } catch {
      return "days";
    }
  });
  const [editorStack, setEditorStack] = useState([]);

  const mergedMeals = useMemo(
    () =>
      liveData
        ? mergeMealsWithFoodSessions(sessions, liveData.meals || [])
        : mergeMealsWithFoodSessions(sessions, []),
    [liveData, sessions],
  );

  const substances = liveData?.raw?.substances || [];

  const resolveEditorTarget = useCallback(
    (target) => {
      if (!target?.record) return null;
      const rec = target.record;
      if (target.kind === "session_event" && rec.substance_id) {
        const sub = substances.find((s) => s.id === rec.substance_id);
        if (sub) return { kind: "substance", record: sub };
      }
      if (target.kind === "meal") {
        const sess =
          rec.session_id && sessions.find((s) => s.id === rec.session_id)
            ? sessions.find((s) => s.id === rec.session_id)
            : findFoodSessionForMeal(rec, sessions);
        if (sess && (rec._synthetic || !mealHasMacroData(rec))) {
          return { kind: "session", record: sess };
        }
      }
      if (!rec.id && !rec._new) return null;
      if (String(rec.id || "").startsWith("session:")) return null;
      return target;
    },
    [sessions, substances],
  );

  const openRecordEditor = useCallback(
    (target) => {
      const resolved = resolveEditorTarget(target);
      if (!resolved) return;
      setEditorStack([resolved]);
    },
    [resolveEditorTarget],
  );

  const pushRecordEditor = useCallback(
    (target) => {
      const resolved = resolveEditorTarget(target);
      if (!resolved) return;
      setEditorStack((prev) => [...prev, resolved]);
    },
    [resolveEditorTarget],
  );

  const popRecordEditor = useCallback(() => {
    setEditorStack((prev) => (prev.length <= 1 ? [] : prev.slice(0, -1)));
  }, []);

  const navigateEditorStack = useCallback((index) => {
    setEditorStack((prev) => prev.slice(0, index + 1));
  }, []);

  const closeRecordEditor = useCallback(() => setEditorStack([]), []);

  const recordEditor = editorStack.length ? editorStack[editorStack.length - 1] : null;

  const drawerNavCtx = useMemo(
    () => ({
      sessions,
      sessionEvents: liveData?.raw?.session_events || [],
      meals: mergedMeals,
      activities: liveData?.activities || [],
      substances,
      finance: liveData?.finance || [],
    }),
    [sessions, liveData, mergedMeals, substances],
  );

  // When liveData changes (e.g. after a chat confirm), refresh local state.
  useEffect(() => {
    if (!liveData) return;
    setDays(liveData.days.map(ensureId));
    setSessions(liveData.sessions.map(ensureId));
    setEvents((liveData.events || []).map(ensureId));
  }, [liveData]);

  useEffect(() => {
    // Only persist edits in demo mode; live mode is sourced from Supabase.
    if (liveData) return;
    saveState({ days, sessions, events });
  }, [days, sessions, events, liveData]);

  useEffect(() => {
    localStorage.setItem("schedule-tracker:tab", tab);
  }, [tab]);

  const resetAll = useCallback(() => {
    if (!confirm("Сбросить все локальные правки и вернуться к исходным данным из data.js?")) return;
    localStorage.removeItem(STORE_KEY);
    setDays(SEED_DAYS.map(ensureId));
    setSessions(SEED_SESSIONS.map(ensureId));
    setEvents(SEED_EVENTS.map(ensureId));
  }, []);

  const exportJson = useCallback(() => {
    const data = JSON.stringify({ days, sessions, events }, null, 2);
    download(`schedule-${new Date().toISOString().slice(0, 10)}.json`, data, "application/json");
  }, [days, sessions, events]);

  const totals = useMemo(() => {
    const businessMin = sessions
      .filter((s) => BUSINESS_CATS.has(s.category))
      .reduce((a, s) => a + (s.min || 0), 0);
    const paidMin = sessions
      .filter((s) => PAID_CATS.has(s.category))
      .reduce((a, s) => a + (s.min || 0), 0);
    const personalMin = sessions
      .filter((s) => s.category === "personal" || s.category === "portfolio")
      .reduce((a, s) => a + (s.min || 0), 0);
    const bytMin = sessions
      .filter((s) => s.category === "byt" || s.category === "planning")
      .reduce((a, s) => a + (s.min || 0), 0);
    const sleepValues = days.map((d) => d.sleep_h).filter((v) => v !== null && v !== undefined);
    const avgSleep = sleepValues.length ? sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length : 0;
    const modDays = days.filter((d) => d.modafinil_mg > 0).length;
    return {
      businessH: businessMin / 60,
      paidH: paidMin / 60,
      personalH: personalMin / 60,
      bytH: bytMin / 60,
      // legacy aliases
      portH: personalMin / 60,
      planH: bytMin / 60,
      avgSleep,
      modDays,
      avgBusinessPerDay: days.length ? businessMin / 60 / days.length : 0,
    };
  }, [days, sessions]);

  return html`
    <div class="app-shell">
      <header class="app-header">
        <div class="app-header__row">
          <div class="app-header__title-wrap">
            <div class="app-header__title">
              <span>schedule</span>
              <span class="app-header__subtitle">${days.length} day${days.length === 1 ? "" : "s"}</span>
              ${sourceBadge && html`<span class=${`source-badge source-badge--${sourceBadge.toLowerCase()}`}>${sourceBadge}</span>`}
            </div>
          </div>
          <div class="app-header__actions">
            ${onReload && html`
              <button class="btn btn--ghost" onClick=${onReload} title="refresh from Supabase">
                <span class="btn__text-wrap">refresh</span>
              </button>
            `}
            <button class="btn" onClick=${exportJson}>
              <span class="btn__icon-wrap">${I.download()}</span>
              <span class="btn__text-wrap">JSON</span>
            </button>
            ${!liveData && html`
              <button class="btn btn--ghost" onClick=${resetAll} title="reset local edits">
                <span class="btn__icon-wrap">${I.reset()}</span>
                <span class="btn__text-wrap">reset</span>
              </button>
            `}
          </div>
        </div>
        <${StatBar} totals=${totals} days=${days} />
      </header>

      <nav class="tabbar">
        <${TabBtn} id="days" active=${tab} onClick=${setTab} label="Days" count=${days.length} />
        <${TabBtn} id="calendar" active=${tab} onClick=${setTab} label="Calendar" count=${null} />
        <${TabBtn} id="kanban" active=${tab} onClick=${setTab} label="Kanban" count=${null} />
        <${TabBtn} id="nutrition" active=${tab} onClick=${setTab} label="Nutrition" count=${liveData ? mealCountForNutrition(sessions, liveData.meals) : null} />
        <${TabBtn} id="finance" active=${tab} onClick=${setTab} label="Finance" count=${liveData?.finance?.length ?? null} />
        <${TabBtn} id="sessions" active=${tab} onClick=${setTab} label="Sessions" count=${sessions.length} />
        <${TabBtn} id="events" active=${tab} onClick=${setTab} label="Timeline" count=${events.length} />
        <${TabBtn} id="insights" active=${tab} onClick=${setTab} label="Insights" count=${null} />
        <${TabBtn}
          id="body"
          active=${tab}
          onClick=${setTab}
          label="Body"
          count=${liveData?.body_metrics?.length ?? null}
        />
      </nav>

      ${tab === "days" &&
      html`<${DaysTab}
        days=${days}
        sessions=${sessions}
        setDays=${setDays}
        setSessions=${setSessions}
      />`}
      ${tab === "calendar" &&
      html`<${CalendarTab}
        days=${days}
        sessions=${sessions}
        meals=${mergedMeals}
        finance=${liveData?.finance || []}
        activities=${liveData?.activities || []}
        sessionEvents=${liveData?.raw?.session_events || []}
        substances=${substances}
        liveMode=${Boolean(liveData)}
        setSessions=${setSessions}
        setDays=${setDays}
        onOpenRecord=${openRecordEditor}
      />`}
      ${tab === "kanban" && html`<${KanbanTab}
        days=${days}
        sessions=${sessions}
        meals=${mergedMeals}
        activities=${liveData?.activities || []}
        sessionEvents=${liveData?.raw?.session_events || []}
        substances=${liveData?.raw?.substances || []}
        finance=${liveData?.finance || []}
        setSessions=${setSessions}
        liveMode=${Boolean(liveData)}
        active=${true}
        onOpenRecord=${openRecordEditor}
      />`}
      ${tab === "nutrition" &&
      html`<${NutritionTab}
        days=${days}
        sessions=${sessions}
        meals=${mergedMeals}
        finance=${liveData?.finance || []}
        activities=${liveData?.activities || []}
        sessionEvents=${liveData?.raw?.session_events || []}
        active=${true}
        liveMode=${Boolean(liveData)}
        onOpenRecord=${openRecordEditor}
      />`}
      ${tab === "finance" &&
      html`<${FinanceTab}
        days=${days}
        accounts=${liveData?.accounts || []}
        finance=${liveData?.finance || []}
        balance_snapshots=${liveData?.balance_snapshots || []}
        finance_planned_items=${liveData?.finance_planned_items || []}
        active=${true}
        liveMode=${Boolean(liveData)}
        onOpenRecord=${openRecordEditor}
      />`}
      ${tab === "sessions" && html`<${SessionsTab} sessions=${sessions} setSessions=${setSessions} />`}
      ${tab === "events" &&
      html`<${EventsTab}
        events=${events}
        setEvents=${setEvents}
        liveMode=${Boolean(liveData)}
        onOpenRecord=${openRecordEditor}
      />`}
      ${tab === "insights" &&
      html`<${InsightsTab}
        days=${days}
        sessions=${sessions}
        meals=${mergedMeals}
        activities=${liveData?.activities || []}
        sessionEvents=${liveData?.raw?.session_events || []}
        finance=${liveData?.finance || []}
        substances=${liveData?.raw?.substances || []}
        liveMode=${Boolean(liveData)}
      />`}
      ${tab === "body" &&
      html`<${BodyTab}
        days=${days}
        sessions=${sessions}
        body_metrics=${liveData?.body_metrics || []}
        liveMode=${Boolean(liveData)}
        onOpenRecord=${openRecordEditor}
      />`}

      <${RecordEditDrawer}
        target=${recordEditor}
        stack=${editorStack}
        navCtx=${drawerNavCtx}
        onClose=${closeRecordEditor}
        onBack=${popRecordEditor}
        onNavigateStack=${navigateEditorStack}
        onSwitchTarget=${pushRecordEditor}
        liveMode=${Boolean(liveData)}
        setSessions=${setSessions}
        sessions=${sessions}
        sessionEvents=${liveData?.raw?.session_events || []}
        activities=${liveData?.activities || []}
        finance=${liveData?.finance || []}
        accounts=${liveData?.accounts || []}
      />
    </div>
  `;
}

function TabBtn({ id, active, onClick, label, count }) {
  return html`
    <button
      class=${`tab ${active === id ? "tab--active" : ""}`}
      onClick=${() => onClick(id)}
      type="button"
    >
      <span>${label}</span>
      ${count !== null &&
      html`<span class="tab__count"><span>${count}</span></span>`}
    </button>
  `;
}

function StatBar({ totals, days }) {
  const burnouts = days.filter((d) => d.day_type === "burnout").length;
  return html`
    <div class="stat-bar">
      <${StatCell} label="avg business/day" value=${fmt(totals.avgBusinessPerDay)} unit="ч" tone="info" />
      <${StatCell} label="total business" value=${fmt(totals.businessH, 0)} unit="ч" />
      <${StatCell} label="paid" value=${fmt(totals.paidH, 0)} unit="ч" tone="success" />
      <${StatCell} label="personal" value=${fmt(totals.personalH, 0)} unit="ч" tone="info" />
      <${StatCell} label="byt" value=${fmt(totals.bytH, 0)} unit="ч" />
      <${StatCell} label="avg sleep" value=${fmt(totals.avgSleep)} unit="ч" />
      <${StatCell} label="mod days" value=${`${totals.modDays}/${days.length}`} unit="" tone="warning" />
      <${StatCell} label="burnouts" value=${burnouts} unit="" tone=${burnouts > 0 ? "danger" : null} />
    </div>
  `;
}

function StatCell({ label, value, unit, tone }) {
  const cls = tone ? `stat-cell__value stat-cell__value--${tone}` : "stat-cell__value";
  return html`
    <div class="stat-cell">
      <div class=${cls}>
        <span>${value}</span>
        ${unit && html`<span class="stat-cell__unit">${unit}</span>`}
      </div>
      <div class="stat-cell__label">${label}</div>
    </div>
  `;
}

// ---------------- Days tab ----------------

function DaysTab({ days, sessions, setDays, setSessions }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const { sort, toggleSort, filters, setFilter, search, setSearch } = useSheetState("days", {
    id: "date",
    dir: "asc",
  });

  const rows = useMemo(() => {
    return days.map((d) => {
      const agg = aggregateDay(d.date, sessions);
      return { ...d, ...agg };
    });
  }, [days, sessions]);

  const columns = useMemo(
    () => [
      {
        id: "toggle",
        label: "",
        thClass: "col-w--xs",
        sortable: false,
        filterable: false,
      },
      { id: "date", label: "date", thClass: "col-w--md" },
      { id: "dow", label: "dow", thClass: "col-w--xs", filterOptions: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
      { id: "sleep_h", label: "sleep_h", thClass: "col-w--sm" },
      { id: "wake", label: "wake", thClass: "col-w--sm" },
      { id: "sleep_start", label: "sleep_start", thClass: "col-w--sm" },
      {
        id: "modafinil_mg",
        label: "mod_mg",
        thClass: "col-w--sm",
        filterOptions: ["0", "50", "75", "100"],
        filterMode: "exact",
      },
      { id: "business_h", label: "business_h", thClass: "col-w--sm", sortAccessor: (r) => r.business_h },
      { id: "work_paid_h", label: "paid_h", thClass: "col-w--sm" },
      { id: "personal_h", label: "personal_h", thClass: "col-w--sm", sortAccessor: (r) => r.personal_h },
      { id: "byt_h", label: "byt_h", thClass: "col-w--sm", sortAccessor: (r) => r.byt_h },
      { id: "sport_h", label: "sport_h", thClass: "col-w--sm" },
      { id: "walk_h", label: "walk_h", thClass: "col-w--sm" },
      {
        id: "day_type",
        label: "day_type",
        thClass: "col-w--md",
        filterOptions: DAY_TYPES,
        filterMode: "exact",
      },
      {
        id: "tags",
        label: "tags",
        thClass: "col-w--md",
        accessor: (r) => (r.tags || []).join(","),
        sortAccessor: (r) => (r.tags || []).join(","),
      },
      { id: "notes", label: "notes", thClass: "col-w--xl" },
    ],
    [],
  );

  const view = useMemo(
    () => applySheet(rows, sort, filters, search, columns),
    [rows, sort, filters, search, columns],
  );

  const toggleRow = useCallback((date) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpanded(new Set(view.map((r) => r.date)));
  }, [view]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  const updateDay = useCallback(
    (id, patch) => {
      setDays((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    },
    [setDays],
  );

  const exportCsv = useCallback(() => {
    const headers = [
      "date",
      "dow",
      "sleep_h",
      "wake",
      "sleep_start",
      "modafinil_mg",
      "business_h",
      "paid_h",
      "personal_h",
      "byt_h",
      "sport_h",
      "walk_h",
      "day_type",
      "tags",
      "notes",
    ];
    const data = view.map((r) => [
      r.date,
      r.dow,
      r.sleep_h ?? "",
      r.wake,
      r.sleep_start,
      r.modafinil_mg,
      r.business_h.toFixed(2),
      r.work_paid_h.toFixed(2),
      r.personal_h.toFixed(2),
      r.byt_h.toFixed(2),
      r.sport_h.toFixed(2),
      r.walk_h.toFixed(2),
      r.day_type,
      (r.tags || []).join("|"),
      r.notes,
    ]);
    download("schedule-days.csv", toCsv([headers, ...data]), "text/csv;charset=utf-8");
  }, [view]);

  const totalBusiness = view.reduce((a, r) => a + r.business_h, 0);

  return html`
    <${Toolbar}
      search=${search}
      setSearch=${setSearch}
      onExport=${exportCsv}
      extraLeft=${html`
        <button class="btn btn--ghost" onClick=${expandAll}>
          <span class="btn__icon-wrap">${I.chevron()}</span>
          <span class="btn__text-wrap">expand all</span>
        </button>
        <button class="btn btn--ghost" onClick=${collapseAll}>
          <span class="btn__icon-wrap">${I.x()}</span>
          <span class="btn__text-wrap">collapse all</span>
        </button>
        ${Object.keys(filters).length > 0 &&
        html`
          <button class="btn btn--ghost" onClick=${() => Object.keys(filters).forEach((k) => setFilter(k, ""))}>
            <span class="btn__icon-wrap">${I.x()}</span>
            <span class="btn__text-wrap">clear filters</span>
          </button>
        `}
      `}
      hint="click row to expand"
    />
    <div class="table-wrap">
      <table class="sheet">
        <${SheetHeader}
          columns=${columns}
          sort=${sort}
          toggleSort=${toggleSort}
          filters=${filters}
          setFilter=${setFilter}
        />
        <tbody>
          ${view.length === 0 && html`
            <tr>
              <td colspan=${columns.length}>
                <div class="empty-wrap">
                  <div class="empty-wrap__title">Ничего не нашлось</div>
                  <div class="empty-wrap__hint">Попробуй очистить фильтры или поиск.</div>
                </div>
              </td>
            </tr>
          `}
          ${view.map(
            (r) => html`
              <${DayRow}
                key=${r.id}
                row=${r}
                expanded=${expanded.has(r.date)}
                onToggle=${() => toggleRow(r.date)}
                sessions=${sessions}
                setSessions=${setSessions}
                updateDay=${updateDay}
              />
            `,
          )}
        </tbody>
      </table>
    </div>
    <div class="footer-bar">
      <span>${view.length} of ${days.length} days</span>
      <span class="footer-bar__spacer"></span>
      <span>business: ${fmt(totalBusiness, 1)} ч</span>
      <span>avg: ${fmt(view.length ? totalBusiness / view.length : 0)} ч/день</span>
    </div>
  `;
}

function DayRow({ row, expanded, onToggle, sessions, setSessions, updateDay }) {
  const burnout = row.day_type === "burnout";
  const rowClass = `${burnout ? "row--burnout" : ""} ${expanded ? "row--expanded" : ""}`;
  const dayTone = dayTypeTone(row.day_type);
  return html`
    <tr class=${rowClass}>
      <td class="col-w--xs">
        <div class="row-toggle-wrap" onClick=${onToggle}>
          <span
            class=${`row-toggle-wrap__icon ${expanded ? "row-toggle-wrap__icon--open" : ""}`}
          >
            ${I.chevron()}
          </span>
        </div>
      </td>
      <td><div class="sheet__td">${row.date}</div></td>
      <td><div class="sheet__td">${row.dow}</div></td>
      <td>
        <div class="sheet__td sheet__td--right sheet__td--num">
          ${row.sleep_h !== null && row.sleep_h !== undefined ? fmt(row.sleep_h) : "–"}
        </div>
      </td>
      <td><div class="sheet__td sheet__td--num">${row.wake}</div></td>
      <td><div class="sheet__td sheet__td--num">${row.sleep_start}</div></td>
      <td>
        <div class="sheet__td sheet__td--right sheet__td--num">
          ${row.modafinil_mg > 0 ? row.modafinil_mg : "–"}
        </div>
      </td>
      <td><div class="sheet__td sheet__td--right sheet__td--num">${fmt(row.business_h)}</div></td>
      <td><div class="sheet__td sheet__td--right sheet__td--num">${fmt(row.work_paid_h)}</div></td>
      <td><div class="sheet__td sheet__td--right sheet__td--num">${fmt(row.personal_h)}</div></td>
      <td><div class="sheet__td sheet__td--right sheet__td--num">${fmt(row.byt_h)}</div></td>
      <td><div class="sheet__td sheet__td--right sheet__td--num">${fmt(row.sport_h)}</div></td>
      <td><div class="sheet__td sheet__td--right sheet__td--num">${fmt(row.walk_h)}</div></td>
      <td>
        <div class="sheet__td">
          <span class=${`pill pill--${dayTone}`}><span>${row.day_type}</span></span>
        </div>
      </td>
      <td>
        <div class="sheet__td">
          <div class="tag-cell-wrap">
            ${(row.tags || []).map((t) => html`<span class="pill"><span>${t}</span></span>`)}
          </div>
        </div>
      </td>
      <td>
        <div class="sheet__td sheet__td--note">${row.notes}</div>
      </td>
    </tr>
    ${expanded &&
    html`
      <tr>
        <td colspan="16">
          <${DayExpand}
            date=${row.date}
            row=${row}
            sessions=${sessions}
            setSessions=${setSessions}
            updateDay=${updateDay}
          />
        </td>
      </tr>
    `}
  `;
}

function DayExpand({ date, row, sessions, setSessions, updateDay }) {
  const list = useMemo(() => {
    const wake = row.wake || "00:00";
    return sessions
      .filter((s) => s.date === date)
      .sort((a, b) => wakeRelativeMin(a.start, wake) - wakeRelativeMin(b.start, wake));
  }, [sessions, date, row.wake]);

  const addSession = useCallback(() => {
    const last = list[list.length - 1];
    const start = last ? last.end : row.wake || "10:00";
    const newSess = {
      id: uid(),
      date,
      start,
      end: start,
      min: 0,
      category: "chill",
      project: "",
      quality: null,
      note: "",
    };
    setSessions((prev) => [...prev, newSess]);
  }, [list, date, setSessions, row.wake]);

  const updateSession = useCallback(
    (id, patch) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const next = { ...s, ...patch };
          if (patch.start || patch.end) {
            next.min = computeMinutes(next.start, next.end);
          }
          return next;
        }),
      );
    },
    [setSessions],
  );

  const removeSession = useCallback(
    (id) => {
      setSessions((prev) => prev.filter((s) => s.id !== id));
    },
    [setSessions],
  );

  return html`
    <div class="expand-wrap">
      <div class="expand-wrap__inner">
        <div class="expand-wrap__header">
          <div class="expand-wrap__title-wrap">
            <span class="expand-wrap__title">${date} · ${row.dow} · ${list.length} sessions</span>
            <span class="expand-wrap__hint">
              business ${fmt(row.business_h)}h · sport ${fmt(row.sport_h)}h · walk ${fmt(row.walk_h)}h
            </span>
          </div>
          <div class="expand-wrap__actions">
            <button class="btn" onClick=${addSession}>
              <span class="btn__icon-wrap">${I.plus()}</span>
              <span class="btn__text-wrap">add session</span>
            </button>
          </div>
        </div>
        <${EditableSessionList}
          sessions=${list}
          updateSession=${updateSession}
          removeSession=${removeSession}
        />
        <div class="expand-wrap__header">
          <div class="expand-wrap__title-wrap">
            <span class="expand-wrap__title">day fields</span>
          </div>
        </div>
        <${DayMetaEditor} row=${row} updateDay=${updateDay} />
      </div>
    </div>
  `;
}

function computeMinutes(start, end) {
  const toMin = (t) => {
    const [h, m] = t.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };
  const s = toMin(start);
  let e = toMin(end);
  if (s === null || e === null) return 0;
  if (e < s) e += 24 * 60;
  return e - s;
}

function EditableSessionList({ sessions, updateSession, removeSession }) {
  const header = html`
    <div class="session-row session-row--head">
      <div class="session-row__cell session-row__cell--time"><span>start</span></div>
      <div class="session-row__cell session-row__cell--time"><span>end</span></div>
      <div class="session-row__cell session-row__cell--dur"><span>min</span></div>
      <div class="session-row__cell session-row__cell--cat"><span>category</span></div>
      <div class="session-row__cell session-row__cell--proj"><span>project</span></div>
      <div class="session-row__cell session-row__cell--quality"><span>q</span></div>
      <div class="session-row__cell session-row__cell--note"><span>note</span></div>
      <div class="session-row__cell session-row__cell--actions"><span></span></div>
    </div>
  `;

  if (sessions.length === 0) {
    return html`
      <div class="session-list">
        ${header}
        <div class="session-row">
          <div class="session-row__cell session-row__cell--note">
            <span>Сессий нет. Нажми "add session".</span>
          </div>
        </div>
      </div>
    `;
  }
  return html`
    <div class="session-list">
      ${header}
      ${sessions.map(
        (s) => html`
          <div class="session-row" key=${s.id}>
            <div class="session-row__cell session-row__cell--time">
              <input
                class="session-row__input"
                type="time"
                value=${s.start}
                onChange=${(e) => updateSession(s.id, { start: e.currentTarget.value })}
              />
            </div>
            <div class="session-row__cell session-row__cell--time">
              <input
                class="session-row__input"
                type="time"
                value=${s.end}
                onChange=${(e) => updateSession(s.id, { end: e.currentTarget.value })}
              />
            </div>
            <div class="session-row__cell session-row__cell--dur">
              <span>${s.min} мин</span>
            </div>
            <div class="session-row__cell session-row__cell--cat">
              <select
                class="session-row__select"
                value=${s.category}
                onChange=${(e) => updateSession(s.id, { category: e.currentTarget.value })}
              >
                ${CATEGORIES.map((c) => html`<option value=${c}>${c}</option>`)}
              </select>
            </div>
            <div class="session-row__cell session-row__cell--proj">
              <input
                class="session-row__input"
                type="text"
                value=${s.project || ""}
                placeholder="–"
                onChange=${(e) => updateSession(s.id, { project: e.currentTarget.value })}
              />
            </div>
            <div class="session-row__cell session-row__cell--quality">
              <input
                class="session-row__input"
                type="number"
                min="1"
                max="10"
                value=${s.quality ?? ""}
                placeholder="–"
                onChange=${(e) =>
                  updateSession(s.id, {
                    quality: e.currentTarget.value ? Number(e.currentTarget.value) : null,
                  })}
              />
            </div>
            <div class="session-row__cell session-row__cell--note">
              <input
                class="session-row__input"
                type="text"
                value=${s.note || ""}
                placeholder="–"
                onChange=${(e) => updateSession(s.id, { note: e.currentTarget.value })}
              />
            </div>
            <div class="session-row__cell session-row__cell--actions">
              <button
                class="btn btn--ghost btn--icon"
                onClick=${() => removeSession(s.id)}
                title="delete"
              >
                <span class="btn__icon-wrap">${I.x()}</span>
              </button>
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

function DayMetaEditor({ row, updateDay }) {
  return html`
    <div class="session-list">
      <div class="session-row session-row--head">
        <div class="session-row__cell session-row__cell--cat"><span>day_type</span></div>
        <div class="session-row__cell session-row__cell--time"><span>sleep_h</span></div>
        <div class="session-row__cell session-row__cell--time"><span>mod_mg</span></div>
        <div class="session-row__cell session-row__cell--time"><span>mood</span></div>
        <div class="session-row__cell session-row__cell--time"><span>energy</span></div>
        <div class="session-row__cell session-row__cell--time"><span>focus</span></div>
        <div class="session-row__cell session-row__cell--note"><span>notes</span></div>
      </div>
      <div class="session-row">
        <div class="session-row__cell session-row__cell--cat">
          <select
            class="session-row__select"
            value=${row.day_type}
            onChange=${(e) => updateDay(row.id, { day_type: e.currentTarget.value })}
          >
            ${DAY_TYPES.map((t) => html`<option value=${t}>${t}</option>`)}
          </select>
        </div>
        <div class="session-row__cell session-row__cell--time">
          <input
            class="session-row__input"
            type="number"
            step="0.1"
            value=${row.sleep_h ?? ""}
            placeholder="–"
            onChange=${(e) =>
              updateDay(row.id, {
                sleep_h: e.currentTarget.value ? Number(e.currentTarget.value) : null,
              })}
          />
        </div>
        <div class="session-row__cell session-row__cell--time">
          <input
            class="session-row__input"
            type="number"
            min="0"
            value=${row.modafinil_mg}
            placeholder="0"
            onChange=${(e) => updateDay(row.id, { modafinil_mg: Number(e.currentTarget.value) || 0 })}
          />
        </div>
        <div class="session-row__cell session-row__cell--time">
          <input
            class="session-row__input"
            type="number"
            min="1"
            max="10"
            value=${row.mood ?? ""}
            placeholder="–"
            onChange=${(e) =>
              updateDay(row.id, {
                mood: e.currentTarget.value ? Number(e.currentTarget.value) : null,
              })}
          />
        </div>
        <div class="session-row__cell session-row__cell--time">
          <input
            class="session-row__input"
            type="number"
            min="1"
            max="10"
            value=${row.energy ?? ""}
            placeholder="–"
            onChange=${(e) =>
              updateDay(row.id, {
                energy: e.currentTarget.value ? Number(e.currentTarget.value) : null,
              })}
          />
        </div>
        <div class="session-row__cell session-row__cell--time">
          <input
            class="session-row__input"
            type="number"
            min="1"
            max="10"
            value=${row.focus ?? ""}
            placeholder="–"
            onChange=${(e) =>
              updateDay(row.id, {
                focus: e.currentTarget.value ? Number(e.currentTarget.value) : null,
              })}
          />
        </div>
        <div class="session-row__cell session-row__cell--note">
          <input
            class="session-row__input"
            type="text"
            value=${row.notes || ""}
            placeholder="–"
            onChange=${(e) => updateDay(row.id, { notes: e.currentTarget.value })}
          />
        </div>
      </div>
    </div>
  `;
}

// ---------------- Sessions tab ----------------

function SessionsTab({ sessions, setSessions }) {
  const { sort, toggleSort, filters, setFilter, search, setSearch } = useSheetState("sessions", {
    id: "date",
    dir: "asc",
  });

  const columns = useMemo(
    () => [
      { id: "date", label: "date", thClass: "col-w--md" },
      { id: "start", label: "start", thClass: "col-w--sm" },
      { id: "end", label: "end", thClass: "col-w--sm" },
      { id: "min", label: "min", thClass: "col-w--sm" },
      {
        id: "category",
        label: "category",
        thClass: "col-w--md",
        filterOptions: CATEGORIES,
        filterMode: "exact",
      },
      { id: "project", label: "project", thClass: "col-w--md" },
      { id: "quality", label: "q", thClass: "col-w--xs" },
      { id: "note", label: "note", thClass: "col-w--xl" },
    ],
    [],
  );

  const view = useMemo(
    () => applySheet(sessions, sort, filters, search, columns),
    [sessions, sort, filters, search, columns],
  );

  const updateSession = useCallback(
    (id, patch) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const next = { ...s, ...patch };
          if (patch.start || patch.end) next.min = computeMinutes(next.start, next.end);
          return next;
        }),
      );
    },
    [setSessions],
  );

  const removeSession = useCallback(
    (id) => {
      setSessions((prev) => prev.filter((s) => s.id !== id));
    },
    [setSessions],
  );

  const exportCsv = useCallback(() => {
    const headers = ["date", "start", "end", "min", "category", "project", "quality", "note"];
    const rows = view.map((s) => [
      s.date,
      s.start,
      s.end,
      s.min,
      s.category,
      s.project || "",
      s.quality ?? "",
      s.note || "",
    ]);
    download("schedule-sessions.csv", toCsv([headers, ...rows]), "text/csv;charset=utf-8");
  }, [view]);

  const totalMin = view.reduce((a, s) => a + (s.min || 0), 0);
  const byCat = useMemo(() => {
    const map = new Map();
    for (const s of view) {
      map.set(s.category, (map.get(s.category) || 0) + (s.min || 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [view]);

  return html`
    <${Toolbar}
      search=${search}
      setSearch=${setSearch}
      onExport=${exportCsv}
      extraLeft=${html`
        ${Object.keys(filters).length > 0 &&
        html`
          <button class="btn btn--ghost" onClick=${() => Object.keys(filters).forEach((k) => setFilter(k, ""))}>
            <span class="btn__icon-wrap">${I.x()}</span>
            <span class="btn__text-wrap">clear filters</span>
          </button>
        `}
      `}
      hint="click any cell to edit"
    />
    <div class="table-wrap">
      <table class="sheet">
        <${SheetHeader}
          columns=${columns}
          sort=${sort}
          toggleSort=${toggleSort}
          filters=${filters}
          setFilter=${setFilter}
        />
        <tbody>
          ${view.map((s) => {
            const tone = categoryTone(s.category);
            return html`
              <tr key=${s.id}>
                <td><div class="sheet__td">${s.date}</div></td>
                <td>
                  <div class="sheet__td">
                    <input
                      class="session-row__input"
                      type="time"
                      value=${s.start}
                      onChange=${(e) => updateSession(s.id, { start: e.currentTarget.value })}
                    />
                  </div>
                </td>
                <td>
                  <div class="sheet__td">
                    <input
                      class="session-row__input"
                      type="time"
                      value=${s.end}
                      onChange=${(e) => updateSession(s.id, { end: e.currentTarget.value })}
                    />
                  </div>
                </td>
                <td>
                  <div class="sheet__td sheet__td--right sheet__td--num">${s.min}</div>
                </td>
                <td>
                  <div class="sheet__td">
                    <select
                      class="session-row__select"
                      value=${s.category}
                      onChange=${(e) => updateSession(s.id, { category: e.currentTarget.value })}
                    >
                      ${CATEGORIES.map((c) => html`<option value=${c}>${c}</option>`)}
                    </select>
                  </div>
                </td>
                <td>
                  <div class="sheet__td">
                    <input
                      class="session-row__input"
                      type="text"
                      value=${s.project || ""}
                      placeholder="–"
                      onChange=${(e) => updateSession(s.id, { project: e.currentTarget.value })}
                    />
                  </div>
                </td>
                <td>
                  <div class="sheet__td sheet__td--right">
                    <input
                      class="session-row__input"
                      type="number"
                      min="1"
                      max="10"
                      value=${s.quality ?? ""}
                      onChange=${(e) =>
                        updateSession(s.id, {
                          quality: e.currentTarget.value ? Number(e.currentTarget.value) : null,
                        })}
                    />
                  </div>
                </td>
                <td>
                  <div class="sheet__td sheet__td--note">
                    <input
                      class="session-row__input"
                      type="text"
                      value=${s.note || ""}
                      onChange=${(e) => updateSession(s.id, { note: e.currentTarget.value })}
                    />
                  </div>
                </td>
              </tr>
            `;
          })}
        </tbody>
      </table>
    </div>
    <div class="footer-bar">
      <span>${view.length} of ${sessions.length} sessions</span>
      <span>total: ${fmtHours(totalMin)}h</span>
      <span class="footer-bar__spacer"></span>
      ${byCat.slice(0, 4).map(([c, m]) => html`<span>${c}: ${fmtHours(m)}h</span>`)}
    </div>
  `;
}

// ---------------- Events tab ----------------

function EventsTab({ events, setEvents, liveMode = false, onOpenRecord }) {
  const { sort, toggleSort, filters, setFilter, search, setSearch } = useSheetState("events", {
    id: "date",
    dir: "asc",
  });

  const kinds = useMemo(() => [...new Set(events.map((e) => e.kind))].sort(), [events]);

  const columns = useMemo(
    () => [
      { id: "date", label: "date", thClass: "col-w--md" },
      { id: "kind", label: "kind", thClass: "col-w--md", filterOptions: kinds, filterMode: "exact" },
      {
        id: "severity",
        label: "severity",
        thClass: "col-w--sm",
        filterOptions: ["info", "warning", "danger"],
        filterMode: "exact",
      },
      { id: "end_date", label: "конец", thClass: "col-w--md" },
      { id: "detail", label: "detail", thClass: "col-w--lg" },
      {
        id: "budget_amount",
        label: "бюджет",
        thClass: "col-w--sm",
        sortAccessor: (r) => Number(r.budget_amount) || 0,
      },
    ],
    [kinds],
  );

  const view = useMemo(
    () => applySheet(events, sort, filters, search, columns),
    [events, sort, filters, search, columns],
  );

  const exportCsv = useCallback(() => {
    const headers = ["date", "kind", "severity", "detail"];
    const rows = view.map((e) => [e.date, e.kind, e.severity, e.detail]);
    download("schedule-events.csv", toCsv([headers, ...rows]), "text/csv;charset=utf-8");
  }, [view]);

  const addEvent = useCallback(() => {
    const row = {
      _new: true,
      id: uid(),
      date: localTodayISO(),
      end_date: "",
      kind: "visa",
      severity: "warning",
      detail: "",
      budget_amount: "",
      budget_currency: "RUB",
      budget_account: "savings_rub",
    };
    if (liveMode && onOpenRecord) {
      onOpenRecord({ kind: "event", record: row });
      return;
    }
    setEvents((prev) => [...prev, row]);
  }, [liveMode, onOpenRecord]);

  const updateEvent = useCallback(
    (id, patch) => {
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    },
    [setEvents],
  );

  const removeEvent = useCallback(
    (id) => {
      setEvents((prev) => prev.filter((e) => e.id !== id));
    },
    [setEvents],
  );

  return html`
    <${Toolbar}
      search=${search}
      setSearch=${setSearch}
      onExport=${exportCsv}
      extraLeft=${html`
        <button class="btn" onClick=${addEvent}>
          <span class="btn__icon-wrap">${I.plus()}</span>
          <span class="btn__text-wrap">add event</span>
        </button>
      `}
    />
    <div class="table-wrap">
      <table class="sheet">
        <${SheetHeader}
          columns=${columns}
          sort=${sort}
          toggleSort=${toggleSort}
          filters=${filters}
          setFilter=${setFilter}
        />
        <tbody>
          ${view.map((e) => {
            const editable = liveMode && onOpenRecord;
            return html`
              <tr
                key=${e.id}
                class=${editable ? "sheet-row--clickable" : ""}
                onClick=${editable ? () => onOpenRecord({ kind: "event", record: e }) : undefined}
              >
                <td>
                  <div class="sheet__td">
                    ${editable
                      ? html`<span>${e.date}</span>`
                      : html`
                        <input
                          class="session-row__input"
                          type="date"
                          value=${e.date}
                          onChange=${(ev) => updateEvent(e.id, { date: ev.currentTarget.value })}
                        />
                      `}
                  </div>
                </td>
                <td>
                  <div class="sheet__td">
                    ${editable
                      ? html`<span>${e.kind || "—"}</span>`
                      : html`
                        <input
                          class="session-row__input"
                          type="text"
                          value=${e.kind}
                          onChange=${(ev) => updateEvent(e.id, { kind: ev.currentTarget.value })}
                        />
                      `}
                  </div>
                </td>
                <td>
                  <div class="sheet__td">
                    ${editable
                      ? html`<span>${e.severity}</span>`
                      : html`
                        <select
                          class="session-row__select"
                          value=${e.severity}
                          onChange=${(ev) => updateEvent(e.id, { severity: ev.currentTarget.value })}
                        >
                          <option value="info">info</option>
                          <option value="warning">warning</option>
                          <option value="danger">danger</option>
                        </select>
                      `}
                  </div>
                </td>
                <td>
                  <div class="sheet__td">
                    <span>${e.end_date || "—"}</span>
                  </div>
                </td>
                <td>
                  <div class="sheet__td">
                    <span>${e.detail || "—"}</span>
                  </div>
                </td>
                <td>
                  <div class="sheet__td">
                    <span>${e.budget_amount ? `${e.budget_amount} ${e.budget_currency || "RUB"}` : "—"}</span>
                  </div>
                </td>
              </tr>
            `;
          })}
        </tbody>
      </table>
    </div>
    <div class="footer-bar">
      <span>${view.length} of ${events.length} timeline rows</span>
    </div>
    ${events.length === 0 &&
    html`
      <div class="cal-detail-empty-wrap events-tab-hint-wrap">
        <span class="events-tab-hint">
          Пусто — в таблице events только крупные вехи (визаран, поездка, бюджет на график).
          Еда, работа, такси, зал — это sessions в календаре; части с отдельными чеками — session_events (видны в календаре, если их больше одной на сессию).
          planner_events в этом UI пока нет.
        </span>
      </div>
    `}
  `;
}

// ---------------- shared helpers for new views ----------------

function diffMinutes(start, end) {
  const s = timeToMin(start);
  const e = timeToMin(end);
  return ((e - s + 24 * 60) % (24 * 60)) || 0;
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

const NUTRITION_TARGET = { kcal: 1800, carbs: 180, protein: 116, fat: 64 };

const MEAL_SLOT_RU = {
  breakfast: "завтрак",
  lunch: "обед",
  dinner: "ужин",
  snack: "снек",
};


// ---------------- calendar view ----------------

function CalendarTab({
  days,
  sessions,
  meals = [],
  finance = [],
  activities = [],
  sessionEvents = [],
  substances = [],
  liveMode = false,
  setSessions,
  setDays,
  onOpenRecord,
}) {
  const byDate = useMemo(() => {
    const map = new Map();
    for (const d of days) map.set(d.date, d);
    return map;
  }, [days]);

  const sessionsByDate = useMemo(() => {
    const map = new Map();
    for (const s of sessions) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date).push(s);
    }
    return map;
  }, [sessions]);

  const mealsByDate = useMemo(() => {
    const map = new Map();
    for (const m of meals) {
      if (!map.has(m.date)) map.set(m.date, []);
      map.get(m.date).push(m);
    }
    return map;
  }, [meals]);

  const activitiesByDate = useMemo(() => {
    const map = new Map();
    for (const a of activities) {
      if (!map.has(a.date)) map.set(a.date, []);
      map.get(a.date).push(a);
    }
    return map;
  }, [activities]);

  const today = localTodayISO();

  // Default cursor: today's month (so empty months still render correctly).
  const todayMonth = useMemo(() => today.slice(0, 7), [today]);

  const [cursor, setCursor] = useState(todayMonth);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setCursor(todayMonth);
  }, [todayMonth]);

  const [year, monthIdx] = cursor.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, monthIdx - 1, 1));
  const lastOfMonth = new Date(Date.UTC(year, monthIdx, 0));
  const startDow = (firstOfMonth.getUTCDay() + 6) % 7;
  const daysInMonth = lastOfMonth.getUTCDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${cursor}-${String(d).padStart(2, "0")}`;
    cells.push({ date, day: d });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = firstOfMonth.toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });

  const shift = (delta) => {
    const nextMonth = new Date(Date.UTC(year, monthIdx - 1 + delta, 1));
    setCursor(`${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  const kcalInOf = (date) =>
    (mealsByDate.get(date) || []).reduce((a, m) => a + (m.kcal || 0), 0);
  const kcalOutOf = (date) =>
    dayKcalOut(date, activitiesByDate.get(date) || [], sessionEvents, sessions);

  return html`
    <div class="cal-wrap">
      <div class="cal-toolbar-wrap">
        <button class="btn btn--ghost btn--icon" onClick=${() => shift(-1)} title="previous month">
          <span class="btn__icon-wrap">${I.chevronLeft()}</span>
        </button>
        <div class="cal-month-title-wrap">
          <span class="cal-month-title">${monthLabel.toLowerCase()}</span>
        </div>
        <button class="btn btn--ghost btn--icon" onClick=${() => shift(1)} title="next month">
          <span class="btn__icon-wrap">${I.chevronRight()}</span>
        </button>
        <button class="btn btn--ghost" onClick=${() => setCursor(todayMonth)} title="jump to today">
          <span class="btn__text-wrap">today</span>
        </button>
      </div>

      <div class="cal-grid-wrap">
        <div class="cal-grid-head">
          ${["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(
            (d) => html`<div class="cal-grid-head__cell"><span>${d}</span></div>`,
          )}
        </div>
        <div class="cal-grid-body">
          ${cells.map((c, i) => {
            if (!c) return html`<div class="cal-cell cal-cell--empty"></div>`;
            const row = byDate.get(c.date);
            const list = sessionsByDate.get(c.date) || [];
            const businessMin = list
              .filter((s) => BUSINESS_CATS.has(s.category))
              .reduce((a, s) => a + (s.min || 0), 0);
            const kcalIn = kcalInOf(c.date);
            const kcalOut = kcalOutOf(c.date);
            const isSelected = selected === c.date;
            const isToday = c.date === today;
            return html`
              <button
                key=${i}
                class=${`cal-cell ${row ? "cal-cell--has" : ""} ${isSelected ? "cal-cell--selected" : ""} ${isToday ? "cal-cell--today" : ""}`}
                onClick=${() => setSelected(isSelected ? null : c.date)}
              >
                <div class="cal-cell__head-wrap">
                  <span class="cal-cell__day">${c.day}</span>
                  ${row && row.modafinil_mg > 0 && html`<span class="cal-cell__mod">${row.modafinil_mg}</span>`}
                </div>
                <div class="cal-cell__body-wrap">
                  ${row && row.sleep_h !== null && html`<div class="cal-cell__line"><span>😴 ${fmt(row.sleep_h, 1)}h</span></div>`}
                  ${businessMin > 0 && html`<div class="cal-cell__line"><span>💼 ${fmtHours(businessMin)}h</span></div>`}
                  ${kcalIn > 0 && html`<div class="cal-cell__line cal-cell__line--food"><span>🍴 ${Math.round(kcalIn)}</span></div>`}
                  ${kcalOut > 0 && html`<div class="cal-cell__line cal-cell__line--burn"><span>🔥 ${Math.round(kcalOut)}</span></div>`}
                </div>
              </button>
            `;
          })}
        </div>
      </div>

      ${selected && html`
        <div class="cal-detail-wrap">
          <div class="cal-detail-head-wrap">
            <span class="cal-detail-title">${selected}${selected === today ? " · today" : ""}</span>
            <button class="btn btn--ghost btn--icon" onClick=${() => setSelected(null)} title="close">
              <span class="btn__icon-wrap">${I.x()}</span>
            </button>
          </div>
          <${CalendarDayDetail}
            date=${selected}
            day=${byDate.get(selected)}
            sessions=${sessionsByDate.get(selected) || []}
            meals=${mealsByDate.get(selected) || []}
            finance=${finance}
            activitiesList=${activitiesByDate.get(selected) || []}
            sessionEvents=${sessionEvents}
            substances=${substances}
            liveMode=${liveMode}
            setSessions=${setSessions}
            setDays=${setDays}
            onOpenRecord=${onOpenRecord}
          />
        </div>
      `}
    </div>
  `;
}

/** Kanban: one diary session per row — no session_events list, no substance rows. */
function KanbanSessionCard({ session: s, onClick, disabled }) {
  const title = (s.project || "").trim() || (s.category || "").replace(/_/g, " ") || "—";
  const showCat = Boolean(s.project && s.category);
  const dur = fmtSessionDuration(sessionDurationMin(s));

  return html`
    <button
      type="button"
      class=${`kanban-card kanban-card--${(s.category || "x").replace(/[^a-z0-9_]/gi, "_")}`}
      onClick=${onClick}
      disabled=${disabled}
      title=${[s.start, s.end, s.category, s.project, s.note].filter(Boolean).join(" · ")}
    >
      <div class="kanban-card-inner-wrap">
        <div class="kanban-card-row-wrap kanban-card-row-wrap--head">
          <div class="kanban-card-time-wrap">
            <span class="kanban-card__time">${s.start}–${s.end}</span>
          </div>
          <div class="kanban-card-dur-wrap">
            <span class="kanban-card__dur">${dur}</span>
          </div>
        </div>
        <div class="kanban-card-row-wrap kanban-card-row-wrap--title">
          <div class="kanban-card-title-wrap">
            <span class="kanban-card__title">${title}</span>
          </div>
          ${showCat &&
          html`<div class="kanban-card-cat-wrap"><span class="kanban-card__cat">${s.category}</span></div>`}
        </div>
      </div>
    </button>
  `;
}

/** Compact session row: time + category, project/note, optional session_events parts. */
function SessionCompactContent({
  session: s,
  sessionEvents = [],
  finance = [],
  suffix = null,
  compact = false,
  scheduleLayout = false,
}) {
  const allParts = childEventsForSession(s.id, sessionEvents);
  const redundant = scheduleLayout && isRedundantMirrorPart(s, allParts);
  const parts = redundant ? [] : allParts;
  const showParts = parts.length > 0;
  const exp = showParts ? [] : expensesForSession(s.id, finance);
  const trailNote = s.note || "";
  const trailExp = !showParts && exp.length ? fmtExpensesShort(exp) : "";
  const trail = [trailNote, trailExp].filter(Boolean).join(trailNote && trailExp ? " · " : "");
  const hasBody = Boolean(s.project || (!compact && trail));
  const durLabel = fmtSessionDuration(sessionDurationMin(s));

  return html`
    <div class=${`session-compact-inner-wrap ${compact ? "session-compact-inner-wrap--compact" : ""} ${scheduleLayout ? "session-compact-inner-wrap--schedule" : ""}`}>
      <div class="session-compact-head-wrap">
        <div class="session-compact-head-main-wrap">
          <div class="session-compact-time-wrap">
            <span class="session-compact__time">${s.start}</span>
            <span class="session-compact__sep">–</span>
            <span class="session-compact__time">${s.end}</span>
          </div>
          <span class="session-compact__cat">${s.category}</span>
        </div>
        ${scheduleLayout
          ? html`<span class="session-compact__dur">${durLabel}</span>`
          : suffix}
      </div>
      ${hasBody && html`
        <div class="session-compact-body-wrap">
          ${s.project &&
          html`<span class="session-compact__proj u-truncate-1" title=${s.project}>${s.project}</span>`}
          ${!compact && trail &&
          html`<span class="session-compact__trail u-truncate-1" title=${trail}>${trail}</span>`}
        </div>
      `}
      ${showParts && html`
        <div class="session-compact-parts-wrap">
          ${parts.map((p) => {
            const t0 = String(p.start_time || "").slice(0, 5);
            const t1 = String(p.end_time || "").slice(0, 5);
            const instant = p.is_instant || p.kind === "wake" || p.kind === "substance" ||
              (p.duration_min === 0 && t0 === t1);
            const pexp = expensesForSessionEvent(p.id, finance);
            const label = linkedEventLabel(p, finance);
            const pDur = scheduleLayout && !instant ? fmtSessionDuration(partDurationMin(p)) : "";
            return html`
              <div class="session-compact-part-wrap ${instant ? "session-compact-part-wrap--instant" : ""}" key=${p.id}>
                <span class="session-compact-part__time">${instant ? t0 : `${t0}–${t1}`}</span>
                <span class="session-compact-part__label u-truncate-1" title=${label}>${label}</span>
                ${scheduleLayout && pDur &&
                html`<span class="session-compact-part__dur">${pDur}</span>`}
                ${pexp.length &&
                html`<span class="session-compact-part__exp session-compact-part__exp--desk-only">${fmtExpensesShort(pexp)}</span>`}
              </div>
            `;
          })}
        </div>
      `}
    </div>
  `;
}

function CalDetailNutriColumn({ meal, activity, slotLabel, bars = [], liveMode = false, onOpenRecord }) {
  const isAct = Boolean(activity);
  const mk = meal ? Number(meal.kcal) || 0 : 0;
  const burn = activity ? Number(activity.calories_burned) || 0 : 0;
  const open = () => {
    if (meal) onOpenRecord?.({ kind: "meal", record: meal });
    else if (activity) onOpenRecord?.({ kind: "activity", record: activity });
  };

  return html`
    <${RecordOpenRow}
      className=${`cal-detail-col-wrap ${isAct ? "cal-detail-col-wrap--act" : ""}`}
      onOpen=${onOpenRecord ? open : null}
      disabled=${!liveMode}
    >
      <div class="cal-detail-col-slot-wrap">
        <span class=${`cal-detail-col-slot ${isAct ? "cal-detail-col-slot--act" : ""}`}>${slotLabel}</span>
      </div>
      <div class="cal-detail-col-name-wrap">
        <span class="cal-detail-col-name">${meal ? meal.name : activityDetailLabel(activity)}</span>
      </div>
      <div class="cal-detail-col-kcal-wrap">
        <span class=${`cal-detail-col-kcal ${isAct ? "cal-detail-col-kcal--burn" : ""}`}>
          ${meal ? (mk > 0 ? `${Math.round(mk)} kcal` : "—") : burn > 0 ? `${Math.round(burn)} kcal` : "—"}
        </span>
      </div>
      ${meal &&
      html`
        <div class="cal-detail-col-macros-wrap">
          <span class="cal-detail-col-macro">
            ${meal.carbs_g != null ? `C${Math.round(Number(meal.carbs_g))}` : "C—"}
            ${meal.protein_g != null ? ` P${Math.round(Number(meal.protein_g))}` : " P—"}
            ${meal.fat_g != null ? ` F${Math.round(Number(meal.fat_g))}` : " F—"}
          </span>
        </div>
      `}
      ${activity && activity.duration_min != null &&
      html`
        <div class="cal-detail-col-dur-wrap">
          <span class="cal-detail-col-dur">${activity.duration_min}m</span>
        </div>
      `}
      ${bars.length > 0 && html`<${NutriMicroBars} items=${bars} layout="col" />`}
    </${RecordOpenRow}>
  `;
}


function CalendarDayDetail({
  date,
  day,
  sessions,
  meals = [],
  finance = [],
  activitiesList = [],
  sessionEvents = [],
  substances = [],
  liveMode = false,
  setSessions,
  setDays,
  onOpenRecord,
}) {
  const sortedMeals = useMemo(() => meals, [meals]);

  const sortedActs = useMemo(
    () => [...activitiesList].sort((a, b) => String(a.time || "").localeCompare(String(b.time || ""))),
    [activitiesList],
  );

  const sorted = useMemo(() => {
    if (!day) return [...sessions];
    return [...sessions].sort(
      (a, b) => wakeRelativeMin(a.start, day.wake || "00:00") - wakeRelativeMin(b.start, day.wake || "00:00"),
    );
  }, [sessions, day]);

  const daySubstances = useMemo(() => substancesForDate(date, substances), [date, substances]);
  const dayFinanceExpenses = useMemo(() => dayExpenses(date, finance), [date, finance]);
  const dayAgg = useMemo(() => aggregateDay(date, sessions), [date, sessions]);

  const kcalIn = meals.reduce((a, m) => a + (Number(m.kcal) || 0), 0);
  const kcalOut = dayKcalOut(date, activitiesList, sessionEvents, sessions);
  const kcalTarget = NUTRITION_TARGET.kcal;
  const gapToGoal = kcalTarget - kcalIn;
  const macros = meals.reduce(
    (acc, m) => ({
      p: acc.p + (Number(m.protein_g) || 0),
      f: acc.f + (Number(m.fat_g) || 0),
      c: acc.c + (Number(m.carbs_g) || 0),
    }),
    { p: 0, f: 0, c: 0 },
  );

  const hasNutrition = kcalIn > 0 || kcalOut > 0 || meals.length > 0 || activitiesList.length > 0;
  const hasBodyCol = hasNutrition || dayFinanceExpenses.length > 0;

  const overlapPairs = useMemo(() => findSessionOverlapPairs(sessions), [sessions]);

  const insightLines = useMemo(
    () =>
      buildCalendarDayInsights({
        date,
        day,
        sessions,
        meals,
        activities: activitiesList,
        substances,
        kcalIn,
        kcalOut,
        kcalTarget: NUTRITION_TARGET.kcal,
      }),
    [date, day, sessions, meals, activitiesList, substances, kcalIn, kcalOut],
  );

  const patchDay = useCallback(
    async (patch) => {
      if (!liveMode) return;
      if (setDays) {
        setDays((prev) => prev.map((d) => (d.date === date ? { ...d, ...patch } : d)));
      }
      const row = {};
      if (patch.wake !== undefined) row.wake_time = patch.wake || null;
      if (patch.sleep_start !== undefined) row.sleep_time = patch.sleep_start || null;
      if (patch.sleep_h !== undefined) row.sleep_hours = patch.sleep_h;
      if (patch.modafinil_mg !== undefined) row.modafinil_mg = patch.modafinil_mg;
      if (patch.day_type !== undefined) row.day_type = patch.day_type || null;
      if (patch.notes !== undefined) row.notes = patch.notes || null;
      if (patch.weight_kg !== undefined) row.weight_kg = patch.weight_kg;
      await manualUpsertDay(date, row);
    },
    [date, liveMode, setDays],
  );

  return html`
    <div class="cal-detail-body-wrap">
      <div class="cal-detail-meta-wrap">
        <${EditableField}
          value=${day?.wake ?? ""}
          display=${day?.wake ? `wake ${day.wake}` : "wake —"}
          type="time"
          disabled=${!liveMode}
          className="cal-detail-meta editable-field-btn--meta"
          onSave=${(v) => patchDay({ wake: v })}
        />
        <${EditableField}
          value=${day?.sleep_start ?? ""}
          display=${day?.sleep_start ? `sleep ${day.sleep_start}` : "sleep —"}
          type="time"
          disabled=${!liveMode}
          className="cal-detail-meta editable-field-btn--meta"
          onSave=${(v) => patchDay({ sleep_start: v })}
        />
        ${day?.sleep_h != null &&
        html`<span class="cal-detail-meta cal-detail-meta--static">${fmt(day.sleep_h, 1)}h</span>`}
        <${EditableField}
          type="number"
          value=${day?.modafinil_mg ?? 0}
          display=${day?.modafinil_mg ? `mod ${day.modafinil_mg}mg` : "mod —"}
          disabled=${!liveMode}
          className="cal-detail-meta editable-field-btn--meta"
          onSave=${(v) => patchDay({ modafinil_mg: v })}
        />
        <${EditableField}
          value=${day?.day_type ?? ""}
          display=${day?.day_type || "type —"}
          disabled=${!liveMode}
          className="cal-detail-meta editable-field-btn--meta"
          onSave=${(v) => patchDay({ day_type: v })}
        />
        ${day?.weight_kg != null &&
        html`<span class="cal-detail-meta cal-detail-meta--static">${fmt(day.weight_kg, 1)}kg</span>`}
      </div>

      <div class="cal-detail-notes-wrap">
        <${EditableField}
          value=${day?.notes ?? ""}
          display=${day?.notes || "заметки…"}
          disabled=${!liveMode}
          className="editable-field-btn--notes"
          onSave=${(v) => patchDay({ notes: v })}
        />
      </div>

      <div class="cal-detail-grid-wrap">
        <div class="cal-detail-col-wrap cal-detail-col-wrap--schedule">
          <div class="cal-detail-panel-head-wrap">
            <span class="cal-detail-panel-title">расписание</span>
          </div>
          <div class="cal-detail-col-body-wrap">
            ${overlapPairs.length > 0 && html`
              <div class="cal-detail-overlap-wrap">
                <span class="cal-detail-overlap__text">
                  пересечение: ${overlapPairs
                    .slice(0, 2)
                    .map(([a, b]) => `${a.project || a.category} ${a.start}–${a.end} / ${b.project || b.category} ${b.start}–${b.end}`)
                    .join(" · ")}
                </span>
              </div>
            `}
            <div class="cal-detail-sessions-wrap">
              ${sorted.length === 0 &&
              html`<div class="cal-detail-empty-wrap"><span>сессии не записаны</span></div>`}
              ${sorted.map(
                (s) => html`
                  <div class="cal-detail-session-block-wrap" key=${s.id}>
                    <${RecordOpenRow}
                      className="cal-detail-session"
                      onOpen=${onOpenRecord ? () => onOpenRecord({ kind: "session", record: s }) : null}
                      disabled=${!liveMode}
                    >
                      <${SessionCompactContent}
                        session=${s}
                        sessionEvents=${sessionEvents}
                        finance=${finance}
                        scheduleLayout=${true}
                      />
                    </${RecordOpenRow}>
                  </div>
                `,
              )}
            </div>
          </div>
        </div>

        <div class="cal-detail-col-wrap cal-detail-col-wrap--body">
          <div class="cal-detail-panel-head-wrap">
            <span class="cal-detail-panel-title">питание · траты · активность</span>
          </div>
          <div class="cal-detail-col-body-wrap">
            ${!hasBodyCol &&
            html`<div class="cal-detail-empty-wrap"><span>нет данных</span></div>`}
            ${hasNutrition && html`
              <div class="cal-detail-nutri-summary-wrap cal-detail-nutri-summary-wrap--col">
                <div class="cal-detail-nutri-summary-head-wrap">
                  <span class=${`cal-detail-balance ${kcalIn > kcalTarget ? "cal-detail-balance--over" : ""}`}>
                    ${Math.round(kcalIn)} / ${kcalTarget} ккал
                    ${gapToGoal > 50
                      ? ` · осталось ${Math.round(gapToGoal)}`
                      : gapToGoal < -50
                        ? ` · перебор +${Math.round(-gapToGoal)}`
                        : ""}
                  </span>
                </div>
                <${NutriMicroBars}
                  layout="row"
                  items=${[
                    { key: "kin", label: "in", value: kcalIn, target: NUTRITION_TARGET.kcal, kind: "kcal" },
                    { key: "kout", label: "out", value: kcalOut, target: NUTRITION_TARGET.kcal, kind: "activity" },
                    { key: "c", label: "C", value: macros.c, target: NUTRITION_TARGET.carbs, kind: "carbs" },
                    { key: "p", label: "P", value: macros.p, target: NUTRITION_TARGET.protein, kind: "protein" },
                    { key: "f", label: "F", value: macros.f, target: NUTRITION_TARGET.fat, kind: "fat" },
                  ]}
                />
              </div>
            `}
            ${(sortedMeals.length > 0 || sortedActs.length > 0) && html`
              <div class="cal-detail-section-wrap cal-detail-section-wrap--cols cal-detail-section-wrap--in-col">
                <div class="cal-detail-columns-wrap cal-detail-columns-wrap--stack">
                  ${sortedMeals.map((m) => html`
                      <${CalDetailNutriColumn}
                        key=${m.id}
                        meal=${m}
                        liveMode=${liveMode}
                        onOpenRecord=${onOpenRecord}
                        slotLabel=${MEAL_SLOT_RU[m.slot] || m.slot || "еда"}
                        bars=${barsForMeal(m, NUTRITION_TARGET)}
                      />
                    `)}
                  ${sortedActs.map((a) => {
                    const burn = Number(a.calories_burned) || 0;
                    return html`
                      <${CalDetailNutriColumn}
                        key=${a.id}
                        activity=${a}
                        liveMode=${liveMode}
                        onOpenRecord=${onOpenRecord}
                        slotLabel=${activityTypeLabel(a)}
                        bars=${burn > 0
                          ? [
                              {
                                key: "b",
                                label: "out",
                                value: burn,
                                target: NUTRITION_TARGET.kcal,
                                kind: "activity",
                              },
                            ]
                          : []}
                      />
                    `;
                  })}
                </div>
              </div>
            `}
            ${dayFinanceExpenses.length > 0 && html`
              <div class="cal-detail-subsection-wrap">
                <span class="cal-detail-subsection-title">траты</span>
                <div class="cal-detail-list-wrap">
                  ${dayFinanceExpenses.map((txn) => html`
                    <div class="cal-detail-list-row-wrap" key=${txn.id}>
                      <${RecordOpenRow}
                        className="cal-detail-list-row"
                        onOpen=${onOpenRecord ? () => onOpenRecord({ kind: "finance", record: txn }) : null}
                        disabled=${!liveMode}
                      >
                        <div class="cal-detail-list-row-inner-wrap">
                          <span class="cal-detail-list-row__main">${expenseRowLabel(txn)}</span>
                          ${txn.time &&
                          html`<span class="cal-detail-list-row__meta">${String(txn.time).slice(0, 5)}</span>`}
                        </div>
                      </${RecordOpenRow}>
                    </div>
                  `)}
                </div>
              </div>
            `}
          </div>
        </div>

        <div class="cal-detail-col-wrap cal-detail-col-wrap--insights">
          <div class="cal-detail-panel-head-wrap">
            <span class="cal-detail-panel-title">субстанции · работа</span>
          </div>
          <div class="cal-detail-col-body-wrap">
            <div class="cal-detail-subsection-wrap">
              <span class="cal-detail-subsection-title">субстанции</span>
              <div class="cal-detail-list-wrap">
                ${daySubstances.length === 0 &&
                html`<div class="cal-detail-empty-wrap"><span>нет записей</span></div>`}
                ${daySubstances.map((sub) => html`
                  <div class="cal-detail-list-row-wrap" key=${sub.id}>
                    <${RecordOpenRow}
                      className="cal-detail-list-row cal-detail-list-row--substance"
                      onOpen=${onOpenRecord ? () => onOpenRecord({ kind: "substance", record: sub }) : null}
                      disabled=${!liveMode}
                    >
                      <div class="cal-detail-list-row-inner-wrap">
                        <span class="cal-detail-list-row__time">${String(sub.time || "").slice(0, 5) || "—"}</span>
                        <span class="cal-detail-list-row__main">${substanceRowLabel(sub)}</span>
                      </div>
                    </${RecordOpenRow}>
                  </div>
                `)}
              </div>
            </div>

            <div class="cal-detail-subsection-wrap">
              <span class="cal-detail-subsection-title">часы</span>
              <div class="cal-detail-hours-wrap">
                ${businessHourRows(dayAgg).map((row) => html`
                  <div
                    class=${`cal-detail-hours-row-wrap ${row.breakdown ? "cal-detail-hours-row-wrap--breakdown" : ""}`}
                    key=${row.label + (row.sub || "")}
                  >
                    <span class="cal-detail-hours-row__label">
                      ${row.label}${row.sub ? html`<span class="cal-detail-hours-row__sub"> · ${row.sub}</span>` : ""}
                    </span>
                    <span class="cal-detail-hours-row__val">${fmtHours(row.h * 60)}h</span>
                  </div>
                `)}
                ${dayAgg.sport_h > 0 && html`
                  <div class="cal-detail-hours-row-wrap">
                    <span class="cal-detail-hours-row__label">спорт</span>
                    <span class="cal-detail-hours-row__val">${fmtHours(dayAgg.sport_h * 60)}h</span>
                  </div>
                `}
                ${dayAgg.chill_h > 0 && html`
                  <div class="cal-detail-hours-row-wrap">
                    <span class="cal-detail-hours-row__label">chill</span>
                    <span class="cal-detail-hours-row__val">${fmtHours(dayAgg.chill_h * 60)}h</span>
                  </div>
                `}
                ${dayAgg.business_h <= 0 &&
                dayAgg.sport_h <= 0 &&
                dayAgg.chill_h <= 0 &&
                html`<div class="cal-detail-empty-wrap"><span>—</span></div>`}
              </div>
            </div>

            ${insightLines.length > 0 && html`
              <div class="cal-detail-subsection-wrap">
                <span class="cal-detail-subsection-title">инсайты</span>
                <div class="cal-detail-list-wrap">
                  ${insightLines.map((line) => html`
                    <div class="cal-detail-insight-row-wrap" key=${line.key}>
                      <div class="cal-detail-insight-row-inner-wrap">
                        <span class=${`cal-detail-insight-row__label ${line.tone ? `cal-detail-insight-row__label--${line.tone}` : ""}`}>
                          ${line.label}
                        </span>
                        ${line.hint &&
                        html`<span class="cal-detail-insight-row__hint">${line.hint}</span>`}
                      </div>
                    </div>
                  `)}
                </div>
              </div>
            `}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ---------------- kanban view ----------------

const KANBAN_CATEGORIES = [
  "work_paid",
  "personal",
  "byt",
  "sport_surf",
  "sport_pickleball",
  "sport_muay_thai",
  "sport_bouldering",
  "sport_gym",
  "sport_run",
  "sport_hike",
  "sport_walk",
  "chill",
  "food",
  "chores",
  "shower",
  "transport",
  "social",
  "sleep",
];

function KanbanTab({
  days,
  sessions,
  meals = [],
  activities = [],
  sessionEvents = [],
  substances = [],
  finance = [],
  setSessions,
  liveMode = false,
  active = true,
  onOpenRecord,
}) {
  const byDate = useMemo(() => {
    const map = new Map();
    for (const d of days) map.set(d.date, d);
    return map;
  }, [days]);

  const knownDates = useMemo(() => {
    const set = new Set();
    for (const d of days) set.add(d.date);
    for (const s of sessions) set.add(s.date);
    return [...set];
  }, [days, sessions]);

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

  const sessionsByDate = useMemo(() => {
    const map = new Map();
    for (const s of sessions) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date).push(s);
    }
    return map;
  }, [sessions]);

  const mealsByDate = useMemo(() => {
    const map = new Map();
    for (const m of meals) {
      if (!map.has(m.date)) map.set(m.date, []);
      map.get(m.date).push(m);
    }
    return map;
  }, [meals]);

  const activitiesByDate = useMemo(() => {
    const map = new Map();
    for (const a of activities) {
      if (!map.has(a.date)) map.set(a.date, []);
      map.get(a.date).push(a);
    }
    return map;
  }, [activities]);

  const [adding, setAdding] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copiedDate, setCopiedDate] = useState(null);

  const onCopyDay = useCallback(
    async (date) => {
      const day = byDate.get(date);
      const text = formatKanbanDayCopy({
        date,
        day,
        sessions,
        sessionEvents,
        meals,
        activities,
        substances,
        finance,
        wakeRelativeMin,
      });
      const ok = await copyTextToClipboard(text);
      if (ok) {
        setCopiedDate(date);
        setTimeout(() => setCopiedDate((d) => (d === date ? null : d)), 2000);
      } else {
        alert("Не удалось скопировать");
      }
    },
    [byDate, sessions, sessionEvents, meals, activities, substances, finance],
  );

  const onAddSession = useCallback(
    async (date, row) => {
      const min = diffMinutes(row.start, row.end);
      const localId = `tmp-${Date.now()}`;
      const optimistic = {
        id: localId,
        date,
        start: row.start,
        end: row.end,
        min,
        category: row.category,
        project: row.project || "",
        quality: null,
        note: row.note || "",
      };
      setSessions((prev) => [...prev, optimistic]);
      setAdding(null);
      if (!liveMode) return;
      setSaving(true);
      try {
        const { insertRow, notifyDataChanged } = await import("../api/manual");
        await insertRow("sessions", {
          date,
          start_time: row.start,
          end_time: row.end,
          duration_min: min,
          type: inferSessionType(row.category),
          category: row.category || null,
          project: row.project || null,
          notes: row.note || null,
        });
        notifyDataChanged();
      } catch (e) {
        alert(`Не удалось создать: ${e?.message || e}`);
      } finally {
        setSaving(false);
      }
    },
    [setSessions, liveMode],
  );

  return html`
    <div class="kanban-wrap">
      ${saving && html`<div class="kanban-saving"><span>сохраняю…</span></div>`}
      <${DateStripControls} canLoadPast=${canLoadPast} canLoadFuture=${canLoadFuture} onToday=${scrollToToday} />
      <div class="kanban-scroll-wrap date-strip-scroll" ref=${scrollRef} onScroll=${onScroll}>
        <div class="date-strip-sentinel date-strip-sentinel--past" ref=${pastSentinelRef}></div>
        ${visibleDates.map((date) => {
          const day = byDate.get(date);
          const list = sessionsByDate.get(date) || [];
          const sorted = day
            ? [...list].sort(
                (a, b) => wakeRelativeMin(a.start, day.wake || "00:00") - wakeRelativeMin(b.start, day.wake || "00:00"),
              )
            : [...list].sort((a, b) => a.start.localeCompare(b.start));
          const isToday = date === today;
          const isFuture = date > today;
          const colMeals = mealsByDate.get(date) || [];
          const colActs = activitiesByDate.get(date) || [];
          const kcalIn = colMeals.reduce((a, m) => a + (m.kcal || 0), 0);
          const kcalOut = dayKcalOut(date, colActs, sessionEvents, sessions);
          return html`
            <div
              class=${`kanban-col-wrap ${isToday ? "kanban-col-wrap--today" : ""} ${isFuture ? "kanban-col-wrap--future" : ""}`}
              key=${date}
              ref=${isToday ? todayColRef : null}
            >
              <div class="kanban-col-head-wrap">
                <div class="kanban-col-head-main-wrap">
                  <span class="kanban-col-head__date">${date}${isToday ? " · today" : ""}</span>
                  ${day && html`<span class="kanban-col-head__dow">${day.dow}</span>`}
                  ${day && day.modafinil_mg > 0 && html`<span class="kanban-col-head__mod">${day.modafinil_mg}mg</span>`}
                </div>
                <button
                  type="button"
                  class="kanban-copy-btn"
                  onClick=${(e) => {
                    e.stopPropagation();
                    onCopyDay(date);
                  }}
                  title="копировать краткое описание дня"
                >
                  <span class="kanban-copy-btn__text">${copiedDate === date ? "скопировано" : "копировать"}</span>
                </button>
              </div>
              ${day && html`
                <div class="kanban-col-meta-wrap">
                  ${day.wake && html`<span class="kanban-col-meta">↑${day.wake}</span>`}
                  ${day.sleep_start && html`<span class="kanban-col-meta">↓${day.sleep_start}</span>`}
                  ${day.sleep_h !== null && html`<span class="kanban-col-meta">${fmt(day.sleep_h, 1)}h</span>`}
                </div>
              `}
              ${(kcalIn > 0 || kcalOut > 0) && html`
                <div class="kanban-col-nutri-wrap">
                  ${kcalIn > 0 && html`<span class="kanban-col-nutri">🍴${Math.round(kcalIn)}</span>`}
                  ${kcalOut > 0 && html`<span class="kanban-col-nutri">🔥${Math.round(kcalOut)}</span>`}
                </div>
              `}
              <div class="kanban-col-body-wrap">
                ${sorted.length === 0 && adding !== date && html`<div class="kanban-empty-col"><span>—</span></div>`}
                ${sorted.map(
                  (s) => html`
                    <${KanbanSessionCard}
                      key=${s.id}
                      session=${s}
                      disabled=${!onOpenRecord}
                      onClick=${() => onOpenRecord?.({ kind: "session", record: s })}
                    />
                  `,
                )}
                ${adding === date && html`
                  <${KanbanSessionEditor}
                    isNew
                    value=${{
                      start: sorted.length ? sorted[sorted.length - 1].end : day?.wake || "08:00",
                      end: "",
                      category: "work_paid",
                      project: "",
                      note: "",
                    }}
                    onSave=${(row) => onAddSession(date, row)}
                    onCancel=${() => setAdding(null)}
                  />
                `}
                ${adding !== date && html`
                  <button
                    class="kanban-add-btn"
                    onClick=${() => setAdding(date)}
                    title="добавить сессию"
                  >
                    <span class="btn__icon-wrap">${I.plus()}</span>
                    <span class="btn__text-wrap">сессия</span>
                  </button>
                `}
              </div>
            </div>
          `;
        })}
        <div class="date-strip-sentinel date-strip-sentinel--future" ref=${futureSentinelRef}></div>
      </div>
    </div>
  `;
}

function inferSessionType(category) {
  if (!category) return "chill";
  if (["work_paid", "personal", "byt"].includes(category)) return "work";
  if (category.startsWith("sport_")) return "sport";
  if (category === "walk" || category === "sport_walk") return "sport";
  if (category === "chill") return "chill";
  if (category === "food") return "food";
  if (category === "shower" || category === "chores") return "chores";
  if (category === "transport") return "transport";
  if (category === "sleep") return "sleep";
  if (category === "social") return "chill";
  return category;
}

function KanbanSessionEditor({ value, isNew = false, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState({
    start: value.start || "",
    end: value.end || "",
    category: value.category || "work_paid",
    project: value.project || "",
    note: value.note || "",
  });

  const dur = diffMinutes(form.start, form.end);
  const valid = form.start && form.end && dur > 0;

  return html`
    <div class="kanban-editor-wrap">
      <div class="kanban-editor-row-wrap">
        <label class="kanban-editor-label-wrap">
          <span class="kanban-editor-label">start</span>
          <input
            type="time"
            class="kanban-editor-input"
            value=${form.start}
            onInput=${(e) => setForm((f) => ({ ...f, start: e.target.value }))}
          />
        </label>
        <label class="kanban-editor-label-wrap">
          <span class="kanban-editor-label">end</span>
          <input
            type="time"
            class="kanban-editor-input"
            value=${form.end}
            onInput=${(e) => setForm((f) => ({ ...f, end: e.target.value }))}
          />
        </label>
        <div class="kanban-editor-dur-wrap">
          <span class="kanban-editor-dur">${valid ? `${dur}m` : "—"}</span>
        </div>
      </div>
      <div class="kanban-editor-row-wrap">
        <label class="kanban-editor-label-wrap kanban-editor-label-wrap--grow">
          <span class="kanban-editor-label">category</span>
          <select
            class="kanban-editor-input"
            value=${form.category}
            onChange=${(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            ${KANBAN_CATEGORIES.map(
              (cat) => html`<option value=${cat} key=${cat}>${cat}</option>`,
            )}
          </select>
        </label>
      </div>
      <div class="kanban-editor-row-wrap">
        <label class="kanban-editor-label-wrap kanban-editor-label-wrap--grow">
          <span class="kanban-editor-label">project</span>
          <input
            type="text"
            class="kanban-editor-input"
            value=${form.project}
            placeholder="app / ai_concierge / pyjama / portfolio …"
            onInput=${(e) => setForm((f) => ({ ...f, project: e.target.value }))}
          />
        </label>
      </div>
      <div class="kanban-editor-row-wrap">
        <label class="kanban-editor-label-wrap kanban-editor-label-wrap--grow">
          <span class="kanban-editor-label">note</span>
          <input
            type="text"
            class="kanban-editor-input"
            value=${form.note}
            onInput=${(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          />
        </label>
      </div>
      <div class="kanban-editor-actions-wrap">
        <button
          class="btn btn--primary"
          disabled=${!valid}
          onClick=${() => onSave(form)}
        >
          <span class="btn__text-wrap">${isNew ? "create" : "save"}</span>
        </button>
        <button class="btn btn--ghost" onClick=${onCancel}>
          <span class="btn__text-wrap">cancel</span>
        </button>
        ${!isNew && onDelete && html`
          <button class="btn btn--ghost kanban-editor-delete" onClick=${onDelete}>
            <span class="btn__text-wrap">delete</span>
          </button>
        `}
      </div>
    </div>
  `;
}

// ---------------- nutrition view ----------------

function NutritionTab({
  days,
  sessions = [],
  meals = [],
  finance = [],
  activities = [],
  sessionEvents = [],
  active = true,
  liveMode = false,
  onOpenRecord,
}) {
  const knownDates = useMemo(() => {
    const set = new Set();
    for (const d of days) set.add(d.date);
    for (const m of meals) set.add(m.date);
    for (const a of activities) set.add(a.date);
    for (const ev of sessionEvents) if (ev.date) set.add(ev.date);
    for (const s of sessions) {
      if (s.date && (SPORT_CATS.has(s.category) || s.category === "walk" || s.category === "sport_walk")) {
        set.add(s.date);
      }
    }
    return [...set];
  }, [days, meals, activities, sessionEvents, sessions]);

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

  const mealsByDate = useMemo(() => {
    const map = new Map();
    for (const m of meals) {
      if (!map.has(m.date)) map.set(m.date, []);
      map.get(m.date).push(m);
    }
    return map;
  }, [meals]);

  const actsByDate = useMemo(() => {
    const map = new Map();
    for (const a of activities) {
      if (!map.has(a.date)) map.set(a.date, []);
      map.get(a.date).push(a);
    }
    return map;
  }, [activities]);

  return html`
    <div class="nutri-wrap">
      <div class="nutri-target-wrap">
        <span class="nutri-target-label">цель на день</span>
        <span class="nutri-target-val">${NUTRITION_TARGET.kcal} kcal · C${NUTRITION_TARGET.carbs} · P${NUTRITION_TARGET.protein} · F${NUTRITION_TARGET.fat}</span>
      </div>
      <${DateStripControls} canLoadPast=${canLoadPast} canLoadFuture=${canLoadFuture} onToday=${scrollToToday} />
      <div class="nutri-scroll-wrap date-strip-scroll" ref=${scrollRef} onScroll=${onScroll}>
        <div class="date-strip-sentinel date-strip-sentinel--past" ref=${pastSentinelRef}></div>
        ${visibleDates.map((date) => {
          const dayMeals = mealsByDate.get(date) || [];
          const dayActs = actsByDate.get(date) || [];
          const outBreak = kcalOutBreakdown(date, dayActs, sessionEvents, sessions);
          const kcalIn = dayMeals.reduce((a, m) => a + (Number(m.kcal) || 0), 0);
          const kcalOut = outBreak.total;
          const balance = kcalIn - kcalOut;
          const carbs = dayMeals.reduce((a, m) => a + (Number(m.carbs_g) || 0), 0);
          const protein = dayMeals.reduce((a, m) => a + (Number(m.protein_g) || 0), 0);
          const fat = dayMeals.reduce((a, m) => a + (Number(m.fat_g) || 0), 0);
          const isToday = date === today;
          const isFuture = date > today;
          return html`
            <div class=${`nutri-day-col ${isToday ? "nutri-day-col--today" : ""} ${isFuture ? "nutri-day-col--future" : ""}`} key=${date} ref=${isToday ? todayColRef : null}>
              <div class="nutri-day-head-wrap">
                <span class="nutri-day-date">${date}${isToday ? " · today" : ""}</span>
                <span class="nutri-day-balance ${balance > NUTRITION_TARGET.kcal ? "nutri-day-balance--over" : ""}">
                  баланс ${Math.round(balance)} / ${NUTRITION_TARGET.kcal}
                </span>
              </div>
              <${NutriBar} label="kcal in" value=${kcalIn} target=${NUTRITION_TARGET.kcal} kind="kcal" />
              <${NutriBar} label="kcal out" value=${kcalOut} target=${NUTRITION_TARGET.kcal} kind="activity" />
              <${NutriBar} label="carbs" value=${carbs} target=${NUTRITION_TARGET.carbs} unit="g" kind="carbs" />
              <${NutriBar} label="protein" value=${protein} target=${NUTRITION_TARGET.protein} unit="g" kind="protein" />
              <${NutriBar} label="fat" value=${fat} target=${NUTRITION_TARGET.fat} unit="g" kind="fat" />
              <div class="nutri-meals-wrap">
                ${dayMeals.length === 0 && html`<span class="nutri-meal-empty">нет приёмов пищи</span>`}
                ${dayMeals.map((m) => {
                  const exp = expensesForSession(m.session_id, finance);
                  return html`
                  <${RecordOpenRow}
                    key=${m.id}
                    className="nutri-meal-row"
                    onOpen=${onOpenRecord ? () => onOpenRecord({ kind: "meal", record: m }) : null}
                    disabled=${!liveMode}
                  >
                    <span class="nutri-meal-slot">${m.slot || "—"}</span>
                    <span class="nutri-meal-name">${m.name}</span>
                    <span class="nutri-meal-kcal">${m.kcal != null ? `${Math.round(Number(m.kcal))}` : "—"}</span>
                    <span class="nutri-meal-macro">
                      ${m.carbs_g != null ? `C${Math.round(Number(m.carbs_g))}` : ""}
                      ${m.protein_g != null ? ` P${Math.round(Number(m.protein_g))}` : ""}
                      ${m.fat_g != null ? ` F${Math.round(Number(m.fat_g))}` : ""}
                      ${exp.length ? html` · ${fmtExpensesShort(exp)}` : ""}
                    </span>
                  </${RecordOpenRow}>
                `;
                })}
              </div>
              ${outBreak.outRows.length > 0 && html`
                <div class="nutri-acts-wrap">
                  ${outBreak.outRows.map((row) => html`
                    <${RecordOpenRow}
                      key=${`${row.kind}-${row.record.id}`}
                      className="nutri-act-row"
                      onOpen=${onOpenRecord ? () => onOpenRecord({ kind: row.kind, record: row.record }) : null}
                      disabled=${!liveMode}
                    >
                      <span class="nutri-act-type">${row.label}</span>
                      <span class="nutri-act-kcal">🔥 ${row.kcal > 0 ? Math.round(row.kcal) : "—"}</span>
                      ${row.kind === "activity" && row.record.duration_min != null && html`
                        <span class="nutri-act-dur">${row.record.duration_min}m</span>
                      `}
                      ${row.kind === "session" && row.record.min != null && html`
                        <span class="nutri-act-dur">${row.record.min}m</span>
                      `}
                    </${RecordOpenRow}>
                  `)}
                </div>
              `}
            </div>
          `;
        })}
        <div class="date-strip-sentinel date-strip-sentinel--future" ref=${futureSentinelRef}></div>
      </div>
    </div>
  `;
}

// ---------------- export ----------------

export default App;
