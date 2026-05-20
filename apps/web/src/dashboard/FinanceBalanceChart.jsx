import { h } from "preact";
import { useCallback, useMemo, useRef, useState } from "preact/hooks";
import htm from "htm";
import { fmtRub, formatDayBreakdownTooltip, getDayBreakdown, downsampleChartSeries } from "./financeInsights.js";

const html = htm.bind(h);

function clientToSvg(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/**
 * Plan/fact balance step chart (same SVG shell as Insights LineChart).
 */
export default function FinanceBalanceChart({
  dates = [],
  fact = [],
  plan = [],
  markers = [],
  finance = [],
  balance_snapshots = [],
  finance_planned_items = [],
  today = "",
  hoverDate = null,
  onHoverDate,
  onDayClick,
}) {
  const svgRef = useRef(null);
  const [localHover, setLocalHover] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);

  const activeDate = hoverDate ?? localHover;

  const sampled = useMemo(
    () => downsampleChartSeries(dates, fact, plan, 120),
    [dates, fact, plan],
  );

  const planVals = sampled.plan.filter((v) => v != null && Number.isFinite(v));
  const factVals = sampled.fact.filter((v) => v != null && Number.isFinite(v));
  const all = [...planVals, ...factVals];

  const chart = useMemo(() => {
    if (!sampled.dates.length || !all.length) return null;

    const W = 800;
    const H = 220;
    const padL = 48;
    const padB = 24;
    const padT = 8;
    const padR = 12;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const maxV = Math.max(...all, 0);
    const minV = Math.min(...all, 0);
    const padY = Math.max((maxV - minV) * 0.1, 5000);
    const yMax = maxV + padY;
    const yMin = minV - padY;
    const range = yMax - yMin || 1;
    const n = sampled.dates.length;
    const xStep = innerW / Math.max(n - 1, 1);
    const xAt = (i) => padL + i * xStep;
    const yAt = (v) => padT + innerH - ((v - yMin) / range) * innerH;

    const stepPath = (data) => {
      const parts = [];
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (v == null || !Number.isFinite(v)) continue;
        const x = xAt(i);
        const y = yAt(v);
        if (parts.length === 0) parts.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
        else {
          parts.push(`L ${x.toFixed(1)} ${yAt(data[i - 1] ?? v).toFixed(1)}`);
          parts.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
        }
      }
      return parts.join(" ");
    };

    const yTicks = 4;
    const ticks = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (range * i) / yTicks);
    const labelEvery = Math.max(1, Math.ceil(n / 10));

    return { W, H, padL, padR, padT, innerH, n, xAt, yAt, yMin, ticks, labelEvery, stepPath, xStep };
  }, [sampled, all]);

  const indexFromSvgX = useCallback(
    (svgX) => {
      if (!chart) return -1;
      const raw = (svgX - chart.padL) / chart.xStep;
      return Math.max(0, Math.min(sampled.dates.length - 1, Math.round(raw)));
    },
    [chart, sampled.dates.length],
  );

  const pickDate = useCallback(
    (clientX, clientY) => {
      const svg = svgRef.current;
      if (!svg || !chart) return;
      const { x } = clientToSvg(svg, clientX, clientY);
      const idx = indexFromSvgX(x);
      if (idx < 0) return;
      const date = sampled.dates[idx];
      const fullIdx = dates.indexOf(date);
      const resolved = fullIdx >= 0 ? dates[fullIdx] : date;
      setLocalHover(resolved);
      onHoverDate?.(resolved);
      const rect = svg.getBoundingClientRect();
      setTooltipPos({ left: clientX - rect.left, top: clientY - rect.top });
    },
    [chart, dates, sampled.dates, indexFromSvgX, onHoverDate],
  );

  const clearHover = useCallback(() => {
    setLocalHover(null);
    setTooltipPos(null);
    onHoverDate?.(null);
  }, [onHoverDate]);

  const onSvgClick = (e) => {
    const svg = svgRef.current;
    if (!svg || !chart) return;
    const { x } = clientToSvg(svg, e.clientX, e.clientY);
    const idx = indexFromSvgX(x);
    if (idx >= 0 && sampled.dates[idx]) {
      const fullIdx = dates.indexOf(sampled.dates[idx]);
      onDayClick?.(fullIdx >= 0 ? dates[fullIdx] : sampled.dates[idx]);
    }
  };

  const fullHoverIdx = activeDate ? dates.indexOf(activeDate) : -1;

  const tooltipLines = useMemo(() => {
    if (!chart || !activeDate || fullHoverIdx < 0) return [];
    const breakdown = getDayBreakdown(activeDate, {
      finance,
      snapshots: balance_snapshots,
      plannedItems: finance_planned_items,
      today,
    });
    return formatDayBreakdownTooltip(breakdown, {
      factBalance: fact[fullHoverIdx],
      planBalance: plan[fullHoverIdx],
    });
  }, [
    chart,
    activeDate,
    fullHoverIdx,
    finance,
    balance_snapshots,
    finance_planned_items,
    today,
    fact,
    plan,
  ]);

  if (!chart) {
    return html`
      <div class="balance-chart-empty-wrap">
        <span class="balance-chart-empty">
          нет данных для графика — залогируй баланс (клик по дню) или проверь счета в LIVE
        </span>
      </div>
    `;
  }

  const { W, H, padL, padR, padT, innerH, n, xAt, yAt, yMin, ticks, labelEvery, stepPath, xStep } = chart;
  const planD = stepPath(sampled.plan);
  const factD = stepPath(sampled.fact);
  const hoverIdx = activeDate ? sampled.dates.indexOf(activeDate) : -1;

  return html`
    <div class="line-chart-wrap balance-chart-wrap--interactive">
      <svg
        ref=${svgRef}
        viewBox=${`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove=${(e) => pickDate(e.clientX, e.clientY)}
        onMouseLeave=${clearHover}
        onClick=${onSvgClick}
      >
        ${ticks.map((t) => {
          const y = yAt(t);
          return html`
            <g key=${t}>
              <line x1=${padL} x2=${W - padR} y1=${y} y2=${y} stroke="var(--border)" stroke-width="1" />
              <text
                x=${padL - 4}
                y=${y + 3}
                text-anchor="end"
                font-size="9"
                fill="var(--text-3)"
                font-family="ui-monospace, monospace"
              >${fmtRub(t)}</text>
            </g>
          `;
        })}
        ${sampled.dates.map((d, i) => {
          if (i % labelEvery !== 0 && i !== n - 1) return null;
          return html`
            <text
              key=${"lbl-" + d}
              x=${xAt(i)}
              y=${H - 6}
              text-anchor="middle"
              font-size="9"
              fill="var(--text-3)"
              font-family="ui-monospace, monospace"
            >${d.slice(5)}</text>
          `;
        })}
        ${planD &&
        html`
          <path
            d=${planD}
            fill="none"
            stroke="var(--success)"
            stroke-width="1.5"
            stroke-dasharray="5 4"
          />
        `}
        ${factD &&
        html`
          <path d=${factD} fill="none" stroke="var(--info)" stroke-width="2" />
        `}
        ${markers.map((m, i) => {
          const idx = dates.indexOf(m.date);
          if (idx < 0 || plan[idx] == null) return null;
          const si = sampled.dates.indexOf(m.date);
          if (si < 0 || sampled.plan[si] == null) return null;
          return html`
            <circle
              key=${"m-" + i}
              cx=${xAt(si)}
              cy=${yAt(sampled.plan[si])}
              r="4"
              fill=${m.deltaRub < 0 ? "var(--danger)" : "var(--success)"}
            />
          `;
        })}
        ${hoverIdx >= 0 &&
        html`
          <line
            x1=${xAt(hoverIdx)}
            x2=${xAt(hoverIdx)}
            y1=${padT}
            y2=${padT + innerH}
            stroke="var(--text-2)"
            stroke-width="1"
            stroke-dasharray="3 3"
          />
        `}
        ${sampled.dates.map((d, i) => html`
          <rect
            key=${"hit-" + d}
            x=${xAt(i) - xStep / 2}
            y=${padT}
            width=${xStep}
            height=${innerH}
            fill="transparent"
          />
        `)}
      </svg>
      ${tooltipLines.length > 0 &&
      tooltipPos &&
      html`
        <div
          class="balance-chart-tooltip-wrap"
          style=${`left: ${tooltipPos.left}px; top: ${tooltipPos.top}px`}
        >
          ${tooltipLines.map((line, i) => html`
            <span
              key=${i}
              class=${i === 0 ? "balance-chart-tooltip-title" : "balance-chart-tooltip-line"}
            >${line}</span>
          `)}
        </div>
      `}
      <div class="legend-wrap">
        <div class="legend-item-wrap">
          <span class="legend-swatch" style="background: var(--info)"></span>
          <span class="legend-label">факт</span>
        </div>
        <div class="legend-item-wrap">
          <span class="legend-swatch legend-swatch--dashed" style="border-color: var(--success)"></span>
          <span class="legend-label">план</span>
        </div>
        <span class="balance-chart-hint">клик по дню — операции и баланс</span>
      </div>
    </div>
  `;
}
