import { h } from "preact";
import { useMemo } from "preact/hooks";
import htm from "htm";
import { buildInsightsModel } from "./insightsCompute.js";
import { fmtRub } from "./financeInsights.js";
import { InsightsLineChart, InsightsBarChart } from "./insightsCharts.jsx";

const html = htm.bind(h);

function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

const fmtNum = fmt;

export default function InsightsTab({
  days,
  sessions,
  meals = [],
  activities = [],
  sessionEvents = [],
  finance = [],
  substances = [],
  liveMode = false,
}) {
  const model = useMemo(
    () =>
      buildInsightsModel({
        days,
        sessions,
        meals,
        activities,
        sessionEvents,
        finance,
        substances,
      }),
    [days, sessions, meals, activities, sessionEvents, finance, substances],
  );

  const {
    enriched,
    kpis,
    timeBudget,
    sportMix,
    topProjects,
    modBuckets,
    sleepBuckets,
    byDow,
    dayTypeCounts,
    morningSport,
    financeTop,
    substanceRows,
    moodStats,
    hasMood,
    extremes,
    insights,
    hasNutrition,
    hasFinance,
    hasSubstances,
  } = model;

  const timeBudgetTotal = timeBudget.reduce((s, r) => s + r.h, 0) || 1;

  return html`
    <div class="insights-page-wrap">
      <div class="insights-kpi-strip-wrap">
        <${KpiPill} label="дней" value=${String(kpis.days)} />
        <${KpiPill} label="работа/день" value=${`${fmt(kpis.avgBusiness)}ч`} />
        <${KpiPill}
          label="сон"
          value=${kpis.avgSleep != null ? `${fmt(kpis.avgSleep)}ч` : "—"}
        />
        <${KpiPill} label="спорт/день" value=${`${fmt(kpis.avgSport)}ч`} />
        <${KpiPill} label="мод" value=${`${kpis.modPct}%`} sub="дней с дозой" />
        <${KpiPill}
          label="burnout"
          value=${String(kpis.burnoutCount)}
          tone=${kpis.burnoutCount > 0 ? "danger" : "neutral"}
        />
        ${hasNutrition &&
        html`
          <${KpiPill}
            label="ккал in"
            value=${kpis.avgKcalIn != null ? String(Math.round(kpis.avgKcalIn)) : "—"}
          />
          <${KpiPill}
            label="ккал out"
            value=${kpis.avgKcalOut != null ? String(Math.round(kpis.avgKcalOut)) : "—"}
          />
        `}
      </div>

      ${!liveMode &&
      html`
        <div class="insights-hint-wrap">
          <span class="insights-hint-text"
            >Локальный seed: питание и финансы появятся после подключения Supabase.</span
          >
        </div>
      `}

      <div class="insights-grid">
        <${InsightCard}
          title="Баланс времени (среднее/день)"
          subtitle="сессии по категориям · ${fmt(timeBudgetTotal)}ч в день"
        >
          <${StackedBudgetBar} rows=${timeBudget} total=${timeBudgetTotal} />
        </${InsightCard}>

        <${InsightCard} title="Динамика" subtitle="сон · работа · спорт по дням">
          <${InsightsLineChart}
            dates=${enriched.map((d) => d.date)}
            series=${[
              {
                key: "sleep",
                label: "Сон",
                color: "var(--info)",
                data: enriched.map((d) => d.sleep_h),
                unit: " ч",
                formatValue: (v) => fmtNum(v, 1),
              },
              {
                key: "business",
                label: "Работа",
                color: "var(--success)",
                data: enriched.map((d) => d.business_h),
                unit: " ч",
              },
              {
                key: "sport",
                label: "Спорт",
                color: "var(--danger)",
                data: enriched.map((d) => d.sport_h),
                unit: " ч",
              },
            ]}
            extraLines=${(date, i) => {
              const d = enriched[i];
              if (!d) return [];
              const lines = [`${d.dow || "—"} · ${d.day_type || "—"}`];
              if (d.modafinil_mg > 0) lines.push(`Модафинил: ${d.modafinil_mg} мг`);
              return lines;
            }}
          />
        </${InsightCard}>

        ${hasNutrition &&
        html`
          <${InsightCard} title="Питание" subtitle="meals + activities / session_events">
            <${InsightsLineChart}
              dates=${enriched.map((d) => d.date)}
              series=${[
                {
                  key: "kcal_in",
                  label: "Ккал приход",
                  color: "var(--warning)",
                  data: enriched.map((d) => (d.kcalIn > 0 ? d.kcalIn : null)),
                  unit: " ккал",
                  formatValue: (v) => String(Math.round(v)),
                },
                {
                  key: "kcal_out",
                  label: "Ккал расход",
                  color: "var(--danger)",
                  data: enriched.map((d) => (d.kcalOut > 0 ? d.kcalOut : null)),
                  unit: " ккал",
                  formatValue: (v) => String(Math.round(v)),
                },
              ]}
              extraLines=${(date, i) => {
                const d = enriched[i];
                if (!d || (d.kcalIn <= 0 && d.kcalOut <= 0)) return [];
                if (d.kcalBalance == null) return [];
                return [`Баланс: ${d.kcalBalance >= 0 ? "+" : ""}${d.kcalBalance} ккал`];
              }}
            />
            <div class="insights-mini-table-wrap">
              ${enriched
                .filter((d) => d.kcalIn > 0 || d.kcalOut > 0)
                .slice(-5)
                .map(
                  (d) => html`
                    <div class="insights-mini-row-wrap" key=${d.date}>
                      <span class="insights-mini-row-date">${d.date.slice(5)}</span>
                      <span class="insights-mini-row-val"
                        >+${d.kcalIn} / −${d.kcalOut}
                        ${d.kcalBalance != null
                          ? ` · ${d.kcalBalance >= 0 ? "+" : ""}${d.kcalBalance}`
                          : ""}</span
                      >
                    </div>
                  `,
                )}
            </div>
          </${InsightCard}>
        `}

        <div class="insights-duo-wrap">
          <${InsightCard} title="Спорт-микс" subtitle="минуты по виду">
            <${InsightsBarChart}
              rows=${sportMix.map((r) => ({
                label: r.label,
                value: r.hours,
                tone: "danger",
              }))}
              unit=" ч"
              hint="сумма минут sport_* сессий"
            />
          </${InsightCard}>

          <${InsightCard} title="Проекты" subtitle="work_paid + personal + byt">
            <${InsightsBarChart}
              rows=${topProjects.map((r) => ({
                label: r.label,
                value: r.hours,
                tone: "success",
              }))}
              unit=" ч"
            />
          </${InsightCard}>
        </div>

        ${hasFinance &&
        html`
          <${InsightCard} title="Расходы" subtitle="finance_transactions · факт">
            <${InsightsBarChart}
              rows=${financeTop.map((r) => ({
                label: r.label,
                shortLabel: r.label.length > 20 ? `${r.label.slice(0, 18)}…` : r.label,
                value: r.rub,
                tone: "warning",
              }))}
              unit=""
              valueFmt=${(v) => fmtRub(v)}
            />
          </${InsightCard}>
        `}

        ${hasSubstances &&
        html`
          <${InsightCard} title="Вещества" subtitle="substances · записей">
            <div class="insights-tag-list-wrap">
              ${substanceRows.map(
                (r) => html`
                  <div class="insights-tag-chip-wrap" key=${r.name}>
                    <span class="insights-tag-chip-text">${r.name} ×${r.count}</span>
                  </div>
                `,
              )}
            </div>
          </${InsightCard}>
        `}

        <div class="insights-duo-wrap">
          <${InsightCard} title="Модафинил → работа" subtitle="n = ${enriched.length}">
            <${InsightsBarChart}
              rows=${modBuckets
                .filter((b) => b.count > 0)
                .map((b) => ({
                  label: `${b.key} (n=${b.count})`,
                  shortLabel: b.key,
                  value: b.avgWork,
                  tone: "info",
                  detail: `средняя работа, n=${b.count}`,
                }))}
              unit=" ч"
            />
          </${InsightCard}>

          <${InsightCard} title="Сон → работа" subtitle="средняя работа по бакету сна">
            <${InsightsBarChart}
              rows=${sleepBuckets
                .filter((b) => b.count > 0)
                .map((b) => ({
                  label: `${b.key} (n=${b.count})`,
                  shortLabel: b.key,
                  value: b.avgWork,
                  tone: "success",
                  detail: `n=${b.count}`,
                }))}
              unit=" ч"
            />
          </${InsightCard}>
        </div>

        <div class="insights-duo-wrap">
          <${InsightCard} title="День недели" subtitle="работа и спорт">
            <${InsightsBarChart}
              rows=${byDow
                .filter((b) => b.count > 0)
                .map((b) => ({
                  label: `${b.key} — работа (n=${b.count})`,
                  shortLabel: b.key,
                  value: b.avgWork,
                  tone: "warning",
                }))}
              unit=" ч"
              hint="среднее business_h"
            />
            <${InsightsBarChart}
              rows=${byDow
                .filter((b) => b.count > 0)
                .map((b) => ({
                  label: `${b.key} — спорт (n=${b.count})`,
                  shortLabel: b.key,
                  value: b.avgSport,
                  tone: "danger",
                }))}
              unit=" ч"
            />
          </${InsightCard}>

          <${InsightCard} title="Тип дня" subtitle="${enriched.length} дней · day_type">
            <${InsightsBarChart}
              rows=${dayTypeCounts.map(([t, c]) => ({
                label: t,
                value: c,
                tone:
                  t === "burnout"
                    ? "danger"
                    : t === "work"
                      ? "success"
                      : t === "mixed"
                        ? "info"
                        : "warning",
                detail: "дней",
              }))}
              unit=" дн."
              valueFmt=${(v) => String(Math.round(v))}
            />
          </${InsightCard}>
        </div>

        <${InsightCard} title="Утренний спорт" subtitle="сессии до 12:00">
          <${InsightsBarChart}
            rows=${[
              {
                label: `С утренним спортом (n=${morningSport.morning.count})`,
                shortLabel: "с утром",
                value: morningSport.morning.avg,
                tone: "danger",
              },
              {
                label: `Без утреннего спорта (n=${morningSport.noMorning.count})`,
                shortLabel: "без",
                value: morningSport.noMorning.avg,
                tone: "success",
              },
            ]}
            unit=" ч"
            hint="спорт-сессии до 12:00"
          />
        </${InsightCard}>

        <${InsightCard} title="Экстремумы" subtitle="по текущей выборке">
          <div class="insights-extremes-wrap">
            ${extremes.bestWork &&
            html`<${ExtremeRow}
              label="макс. работа"
              date=${extremes.bestWork.date}
              detail=${`${fmt(extremes.bestWork.business_h)}ч · ${extremes.bestWork.day_type || "—"}`}
            />`}
            ${extremes.worstWork &&
            html`<${ExtremeRow}
              label="мин. работа"
              date=${extremes.worstWork.date}
              detail=${`${fmt(extremes.worstWork.business_h)}ч · ${extremes.worstWork.day_type || "—"}`}
            />`}
            ${extremes.shortestSleepWork &&
            html`<${ExtremeRow}
              label="мало сна, много работы"
              date=${extremes.shortestSleepWork.date}
              detail=${`${fmt(extremes.shortestSleepWork.sleep_h)}ч сна → ${fmt(extremes.shortestSleepWork.business_h)}ч`}
            />`}
            ${extremes.maxKcalIn &&
            html`<${ExtremeRow}
              label="макс. ккал in"
              date=${extremes.maxKcalIn.date}
              detail=${`${extremes.maxKcalIn.kcalIn} ккал`}
            />`}
            ${extremes.maxKcalOut &&
            html`<${ExtremeRow}
              label="макс. ккал out"
              date=${extremes.maxKcalOut.date}
              detail=${`${extremes.maxKcalOut.kcalOut} ккал`}
            />`}
          </div>
          ${hasMood &&
          html`
            <div class="insights-mood-wrap">
              <span class="insights-mood-text"
                >mood ${fmt(moodStats.mood, 1)} · energy ${fmt(moodStats.energy, 1)} · focus
                ${fmt(moodStats.focus, 1)}</span
              >
            </div>
          `}
        </${InsightCard}>

        <${InsightCard} title="Выводы" subtitle="авто по данным, не шаблон">
          ${insights.length === 0 &&
          html`
            <div class="insights-hint-wrap">
              <span class="insights-hint-text">Недостаточно дней для сравнений — добавь выборку.</span>
            </div>
          `}
          ${insights.map(
            (item) => html`
              <div class=${`callout callout--${item.tone}`} key=${item.title}>
                <div class="callout__title-wrap">
                  <span class="callout__title">${item.title}</span>
                </div>
                <div class="callout__body-wrap">
                  <span>${item.body}</span>
                </div>
              </div>
            `,
          )}
        </${InsightCard}>
      </div>
    </div>
  `;
}

function KpiPill({ label, value, sub, tone = "neutral" }) {
  return html`
    <div class=${`insights-kpi-pill-wrap insights-kpi-pill-wrap--${tone}`}>
      <div class="insights-kpi-pill-label-wrap">
        <span class="insights-kpi-pill-label">${label}</span>
      </div>
      <div class="insights-kpi-pill-value-wrap">
        <span class="insights-kpi-pill-value">${value}</span>
      </div>
      ${sub &&
      html`
        <div class="insights-kpi-pill-sub-wrap">
          <span class="insights-kpi-pill-sub">${sub}</span>
        </div>
      `}
    </div>
  `;
}

function ExtremeRow({ label, date, detail }) {
  return html`
    <div class="insights-extreme-row-wrap">
      <span class="insights-extreme-row-label">${label}</span>
      <span class="insights-extreme-row-date">${date?.slice(5) || "—"}</span>
      <span class="insights-extreme-row-detail">${detail}</span>
    </div>
  `;
}

function StackedBudgetBar({ rows, total }) {
  return html`
    <div class="insights-stacked-wrap">
      <div class="insights-stacked-track-wrap">
        ${rows.map(
          (r) => html`
            <div
              class=${`insights-stacked-seg insights-stacked-seg--${r.tone}`}
              key=${r.key}
              style=${`flex: ${r.h} 1 0;`}
              title=${`${r.label}: ${fmt(r.h)}ч`}
            ></div>
          `,
        )}
      </div>
      <div class="insights-stacked-legend-wrap">
        ${rows.map(
          (r) => html`
            <div class="insights-stacked-legend-item-wrap" key=${r.key}>
              <span class=${`insights-stacked-swatch insights-stacked-swatch--${r.tone}`}></span>
              <span class="insights-stacked-legend-text">${r.label} ${fmt(r.h)}ч</span>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

function InsightCard({ title, subtitle, children }) {
  return html`
    <div class="insight-card">
      <div class="insight-card__header">
        <div class="insight-card__title-wrap">
          <span class="insight-card__title">${title}</span>
          ${subtitle && html`<span class="insight-card__subtitle">${subtitle}</span>`}
        </div>
      </div>
      <div class="insight-card__body">${children}</div>
    </div>
  `;
}
