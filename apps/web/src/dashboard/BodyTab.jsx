import { h } from "preact";
import { useMemo, useState, useCallback } from "preact/hooks";
import htm from "htm";
import { localTodayISO } from "./useDateStrip.js";
import {
  BODY_PROFILE,
  bmrMifflinStJeor,
  tdeeFromBmr,
  SOURCE_TYPE_LABELS,
} from "./bodyProfile.js";
import {
  buildBodyTimeline,
  filterBodyPeriod,
  periodStats,
  BODY_METRIC_TABS,
} from "./bodySeries.js";
import BodyTrendChart from "./BodyTrendChart.jsx";
import { InsightsLineChart } from "./insightsCharts.jsx";
import { manualUpsertDay } from "./manualSave.js";

const html = htm.bind(h);

const PERIODS = [
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "all", label: "Всё" },
];

function fmtDateRange(from, to) {
  if (!from || !to) return "—";
  const f = from.slice(5).replace("-", "/");
  const t = to.slice(5).replace("-", "/");
  return `${f} – ${t}`;
}

function fmtStat(v, decimals = 1) {
  if (v == null || !Number.isFinite(v)) return "—";
  return decimals === 0 ? String(Math.round(v)) : Number(v).toFixed(decimals);
}

export default function BodyTab({
  days = [],
  body_metrics = [],
  liveMode = false,
  onOpenRecord,
}) {
  const today = localTodayISO();
  const [period, setPeriod] = useState("month");
  const [metricId, setMetricId] = useState("weight_kg");
  const [logDate, setLogDate] = useState(today);
  const [logWeight, setLogWeight] = useState("");
  const [logBf, setLogBf] = useState("");
  const [logMuscle, setLogMuscle] = useState("");
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const { points: allPoints, latestWeight } = useMemo(
    () => buildBodyTimeline({ days, body_metrics }),
    [days, body_metrics],
  );

  const periodPoints = useMemo(
    () => filterBodyPeriod(allPoints, period, today),
    [allPoints, period, today],
  );

  const activeTab = BODY_METRIC_TABS.find((t) => t.id === metricId) || BODY_METRIC_TABS[0];

  const chartPoints = useMemo(
    () =>
      periodPoints.map((p) => ({
        date: p.date,
        value: p[activeTab.id],
        verified: activeTab.verifiedKey ? Boolean(p[activeTab.verifiedKey]) : false,
      })),
    [periodPoints, activeTab],
  );

  const stats = useMemo(
    () => periodStats(periodPoints, activeTab.id),
    [periodPoints, activeTab.id],
  );

  const profileBmr = useMemo(
    () => bmrMifflinStJeor(latestWeight ?? 81),
    [latestWeight],
  );
  const profileTdee = useMemo(() => tdeeFromBmr(profileBmr), [profileBmr]);

  const periodFrom = periodPoints[0]?.date;
  const periodTo = periodPoints[periodPoints.length - 1]?.date;

  const onSave = useCallback(async () => {
    const w = Number(logWeight);
    if (!Number.isFinite(w) || w <= 0) {
      setSaveErr("укажи вес, кг");
      return;
    }
    setSaving(true);
    setSaveErr("");
    try {
      const { insertRow, notifyDataChanged } = await import("../api/manual");
      const source = verified ? "measured" : "estimated";

      await insertRow("body_metrics", {
        date: logDate,
        metric: "weight_kg",
        value: w,
        unit: "kg",
        source_type: source,
      });
      await manualUpsertDay(logDate, { weight_kg: w });

      const bf = Number(logBf);
      if (verified && Number.isFinite(bf) && bf > 0) {
        await insertRow("body_metrics", {
          date: logDate,
          metric: "bf_pct",
          value: bf,
          unit: "%",
          source_type: "measured",
          notes: "замер",
        });
      }

      const muscle = Number(logMuscle);
      if (verified && Number.isFinite(muscle) && muscle > 0) {
        await insertRow("body_metrics", {
          date: logDate,
          metric: "muscle_mass_kg",
          value: muscle,
          unit: "kg",
          source_type: "measured",
        });
      }

      notifyDataChanged();
      setLogWeight("");
      setLogBf("");
      setLogMuscle("");
      setVerified(false);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [logDate, logWeight, logBf, logMuscle, verified]);

  const miniSeries = useMemo(
    () =>
      BODY_METRIC_TABS.map((tab) => ({
        tab,
        points: filterBodyPeriod(allPoints, period, today).map((p) => ({
          date: p.date,
          value: p[tab.id],
        })),
      })),
    [allPoints, period, today],
  );

  return html`
    <div class="body-tab-wrap">
      <div class="body-tab-toolbar-wrap">
        <div class="body-period-bar-wrap">
          ${PERIODS.map(
            (p) => html`
              <button
                type="button"
                key=${p.id}
                class=${`body-period-btn ${period === p.id ? "body-period-btn--active" : ""}`}
                onClick=${() => setPeriod(p.id)}
              >
                <span class="body-period-btn__text">${p.label}</span>
              </button>
            `,
          )}
        </div>
        <div class="body-period-range-wrap">
          <span class="body-period-range-text">${fmtDateRange(periodFrom, periodTo)}</span>
          <span class="body-period-range-sub">${stats.count} дн. с данными</span>
        </div>
      </div>

      <div class="body-profile-strip-wrap">
        <div class="body-profile-pill-wrap">
          <span class="body-profile-pill-label">BMR</span>
          <span class="body-profile-pill-value">${fmtStat(profileBmr, 0)} ккал</span>
        </div>
        <div class="body-profile-pill-wrap">
          <span class="body-profile-pill-label">TDEE</span>
          <span class="body-profile-pill-value">${fmtStat(profileTdee, 0)} ккал</span>
        </div>
        <div class="body-profile-pill-wrap">
          <span class="body-profile-pill-label">профиль</span>
          <span class="body-profile-pill-value"
            >${latestWeight != null ? `${fmtStat(latestWeight)} кг` : "—"} · ${BODY_PROFILE.heightCm} см ·
            ${BODY_PROFILE.age} лет · активность ×${BODY_PROFILE.activityFactor}</span
          >
        </div>
      </div>

      ${liveMode &&
      html`
        <div class="body-log-card-wrap">
          <div class="body-log-title-wrap">
            <span class="body-log-title">Запись</span>
          </div>
          <div class="body-log-form-wrap">
            <div class="body-log-field-wrap">
              <span class="body-log-field-label">дата</span>
              <input
                class="body-log-input"
                type="date"
                value=${logDate}
                onInput=${(e) => setLogDate(e.target.value)}
              />
            </div>
            <div class="body-log-field-wrap">
              <span class="body-log-field-label">вес, кг</span>
              <input
                class="body-log-input"
                type="number"
                step="0.1"
                value=${logWeight}
                onInput=${(e) => setLogWeight(e.target.value)}
              />
            </div>
            <label class="body-log-check-wrap">
              <input type="checkbox" checked=${verified} onChange=${(e) => setVerified(e.target.checked)} />
              <span class="body-log-check-text">замер в зале / точный (не только формула)</span>
            </label>
            ${verified &&
            html`
              <div class="body-log-field-wrap">
                <span class="body-log-field-label">% жира</span>
                <input
                  class="body-log-input"
                  type="number"
                  step="0.1"
                  value=${logBf}
                  onInput=${(e) => setLogBf(e.target.value)}
                />
              </div>
              <div class="body-log-field-wrap">
                <span class="body-log-field-label">мышцы, кг</span>
                <input
                  class="body-log-input"
                  type="number"
                  step="0.1"
                  value=${logMuscle}
                  onInput=${(e) => setLogMuscle(e.target.value)}
                />
              </div>
            `}
            <button type="button" class="btn" disabled=${saving} onClick=${onSave}>
              <span class="btn__text-wrap">${saving ? "сохраняю…" : "сохранить"}</span>
            </button>
            ${saveErr && html`<span class="body-log-error">${saveErr}</span>`}
          </div>
          <div class="body-log-hint-wrap">
            <span class="body-log-hint"
              >◇ ромб на графике — проверенный замер (${SOURCE_TYPE_LABELS.measured} /
              ${SOURCE_TYPE_LABELS.device}), ○ — расчёт</span
            >
          </div>
        </div>
      `}

      <div class="body-main-chart-card-wrap">
        <${BodyTrendChart}
          points=${chartPoints}
          unit=${activeTab.unit ? ` ${activeTab.unit}` : ""}
          decimals=${activeTab.decimals}
          color="var(--info)"
        />
      </div>

      <div class="body-summary-card-wrap">
        <div class="body-summary-head-wrap">
          <span class="body-summary-title">За ${stats.count} дн.</span>
          <span class="body-summary-range">${fmtDateRange(periodFrom, periodTo)}</span>
        </div>
        <div class="body-summary-grid-wrap">
          <div class="body-summary-cell-wrap">
            <span class="body-summary-cell-value">${fmtStat(stats.avg, activeTab.decimals)}</span>
            <span class="body-summary-cell-label">Среднее${activeTab.unit ? ` (${activeTab.unit})` : ""}</span>
          </div>
          <div class="body-summary-cell-wrap">
            <span
              class=${`body-summary-cell-value ${stats.change != null && stats.change < 0 ? "body-summary-cell-value--good" : stats.change > 0 ? "body-summary-cell-value--warn" : ""}`}
            >
              ${stats.change == null
                ? "—"
                : `${stats.change > 0 ? "↑" : "↓"} ${fmtStat(Math.abs(stats.change), activeTab.decimals)}`}
            </span>
            <span class="body-summary-cell-label">Изменение</span>
          </div>
          <div class="body-summary-cell-wrap">
            <span class="body-summary-cell-value">${fmtStat(stats.max, activeTab.decimals)}</span>
            <span class="body-summary-cell-label">Макс.${stats.maxDate ? ` ${stats.maxDate.slice(5)}` : ""}</span>
          </div>
          <div class="body-summary-cell-wrap">
            <span class="body-summary-cell-value">${fmtStat(stats.min, activeTab.decimals)}</span>
            <span class="body-summary-cell-label">Мин.${stats.minDate ? ` ${stats.minDate.slice(5)}` : ""}</span>
          </div>
        </div>
      </div>

      <div class="body-metric-tabs-wrap">
        ${BODY_METRIC_TABS.map(
          (tab) => html`
            <button
              type="button"
              key=${tab.id}
              class=${`body-metric-tab ${metricId === tab.id ? "body-metric-tab--active" : ""}`}
              onClick=${() => setMetricId(tab.id)}
            >
              <span class="body-metric-tab__text">${tab.label}</span>
            </button>
          `,
        )}
      </div>

      <div class="body-mini-charts-wrap">
        <div class="body-mini-charts-title-wrap">
          <span class="body-mini-charts-title">Сводка по метрикам</span>
        </div>
        <div class="body-mini-charts-grid-wrap">
          ${miniSeries.map(
            ({ tab, points: pts }) => html`
              <div class="body-mini-chart-card-wrap" key=${tab.id}>
                <div class="body-mini-chart-head-wrap">
                  <span class="body-mini-chart-label">${tab.label}</span>
                  <button
                    type="button"
                    class="body-mini-chart-link"
                    onClick=${() => setMetricId(tab.id)}
                  >
                    <span class="body-mini-chart-link-text">открыть</span>
                  </button>
                </div>
                ${pts.length >= 2
                  ? html`
                      <${InsightsLineChart}
                        dates=${pts.map((p) => p.date)}
                        series=${[
                          {
                            key: tab.id,
                            label: tab.label,
                            color: "var(--info)",
                            data: pts.map((p) => p.value),
                            unit: tab.unit ? ` ${tab.unit}` : "",
                            formatValue: (v) => fmtStat(v, tab.decimals),
                          },
                        ]}
                      />
                    `
                  : html`
                      <div class="body-chart-empty-wrap">
                        <span class="body-chart-empty-text">мало точек</span>
                      </div>
                    `}
              </div>
            `,
          )}
        </div>
      </div>

      ${body_metrics.length > 0 &&
      html`
        <div class="body-recent-list-wrap">
          <div class="body-recent-title-wrap">
            <span class="body-recent-title">Последние записи body_metrics</span>
          </div>
          <div class="body-recent-rows-wrap">
            ${[...body_metrics]
              .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || "").localeCompare(a.created_at || ""))
              .slice(0, 12)
              .map(
                (m) => html`
                  <button
                    type="button"
                    class="body-recent-row-wrap"
                    key=${m.id}
                    onClick=${() => onOpenRecord?.({ kind: "body_metric", record: m })}
                    disabled=${!liveMode || !onOpenRecord}
                  >
                    <span class="body-recent-row-date">${m.date.slice(5)}</span>
                    <span class="body-recent-row-metric">${m.metric}</span>
                    <span class="body-recent-row-val">${m.value}${m.unit ? ` ${m.unit}` : ""}</span>
                    <span class="body-recent-row-src">${SOURCE_TYPE_LABELS[m.source_type] || m.source_type || "—"}</span>
                  </button>
                `,
              )}
          </div>
        </div>
      `}
    </div>
  `;
}
