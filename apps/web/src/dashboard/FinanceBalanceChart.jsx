import { h } from "preact";
import { useCallback, useMemo, useRef, useState } from "preact/hooks";
import htm from "htm";
import { fmtRub, formatDayBreakdownTooltip, getDayBreakdown } from "./financeInsights.js";

const html = htm.bind(h);

/** SVG presentation attrs often ignore CSS vars — use explicit theme colors. */
const CHART = {
  grid: "#27272a",
  label: "#a1a1aa",
  fact: "#93c5fd",
  plan: "#86efac",
  danger: "#fca5a5",
  success: "#86efac",
  hover: "#a1a1aa",
  planFill: "rgba(134, 239, 172, 0.12)",
};

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
 * Step chart: solid fact, dashed plan (RUB total balance).
 * Hover: tooltip per day. Click: onDayClick(date).
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

  const W = 900;
  const H = 280;
  const padL = 56;
  const padB = 28;
  const padT = 12;
  const padR = 16;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const planVals = plan.filter((v) => v != null && Number.isFinite(v));
  const factVals = fact.filter((v) => v != null && Number.isFinite(v));
  const all = [...planVals, ...factVals];

  const geometry = useMemo(() => {
    if (!dates.length) return null;
    if (!all.length) return null;
    const maxV = Math.max(...all, 0);
    const minV = Math.min(...all, 0);
    const padY = (maxV - minV) * 0.08 || 10000;
    const yMax = maxV + padY;
    const yMin = minV - padY;
    const range = yMax - yMin || 1;
    const n = dates.length;
    const xStep = innerW / Math.max(n - 1, 1);
    const xAt = (i) => padL + i * xStep;
    const yAt = (v) => padT + innerH - ((v - yMin) / range) * innerH;
    return { n, xStep, xAt, yAt, yMin, yMax, range, padL, padR, padT, innerH };
  }, [dates.length, all.join(",")]);

  const indexFromSvgX = useCallback(
    (svgX) => {
      if (!geometry) return -1;
      const { n, xStep, padL } = geometry;
      const raw = (svgX - padL) / xStep;
      return Math.max(0, Math.min(n - 1, Math.round(raw)));
    },
    [geometry],
  );

  const pickDate = useCallback(
    (clientX, clientY) => {
      const svg = svgRef.current;
      if (!svg || !geometry) return;
      const { x } = clientToSvg(svg, clientX, clientY);
      const idx = indexFromSvgX(x);
      if (idx < 0 || idx >= dates.length) return;
      const date = dates[idx];
      setLocalHover(date);
      onHoverDate?.(date);
      const rect = svg.getBoundingClientRect();
      setTooltipPos({
        left: clientX - rect.left,
        top: clientY - rect.top,
      });
    },
    [dates, geometry, indexFromSvgX, onHoverDate],
  );

  const clearHover = useCallback(() => {
    setLocalHover(null);
    setTooltipPos(null);
    onHoverDate?.(null);
  }, [onHoverDate]);

  const onSvgMove = (e) => {
    pickDate(e.clientX, e.clientY);
  };

  const onSvgClick = (e) => {
    const svg = svgRef.current;
    if (!svg || !geometry) return;
    const { x } = clientToSvg(svg, e.clientX, e.clientY);
    const idx = indexFromSvgX(x);
    if (idx >= 0 && dates[idx]) onDayClick?.(dates[idx]);
  };

  if (!dates.length || !all.length || !geometry) {
    return html`
      <div class="balance-chart-empty-wrap">
        <span class="balance-chart-empty">
          нет данных для графика — нужны счета в LIVE или снимок баланса (клик по дню на графике)
        </span>
      </div>
    `;
  }

  const { n, xAt, yAt, yMin, range, padL: pL, padR: pR, padT: pT, innerH: iH } = geometry;

  const stepPath = (data, dashed = false) => {
    const parts = [];
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (v == null || !Number.isFinite(v)) continue;
      const x = xAt(i);
      const y = yAt(v);
      if (parts.length === 0) {
        parts.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
      } else {
        parts.push(`L ${x.toFixed(1)} ${yAt(data[i - 1] ?? v).toFixed(1)}`);
        parts.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
    }
    return { d: parts.join(" "), dashed };
  };

  const areaPath = (data) => {
    const pts = [];
    let firstX = null;
    let lastX = null;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (v == null || !Number.isFinite(v)) continue;
      const x = xAt(i);
      const y = yAt(v);
      if (firstX == null) firstX = x;
      lastX = x;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    if (!pts.length || firstX == null || lastX == null) return "";
    const baseY = pT + iH;
    return `M ${firstX.toFixed(1)} ${baseY} L ${pts.join(" L ")} L ${lastX.toFixed(1)} ${baseY} Z`;
  };

  const factPath = stepPath(fact, false);
  const planPath = stepPath(plan, true);
  const planArea = areaPath(plan);

  const yTicks = 5;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (range * i) / yTicks);
  const labelEvery = Math.max(1, Math.ceil(n / 12));
  const hoverIdx = activeDate ? dates.indexOf(activeDate) : -1;

  const tooltipLines = useMemo(() => {
    if (!activeDate || hoverIdx < 0) return [];
    const breakdown = getDayBreakdown(activeDate, {
      finance,
      snapshots: balance_snapshots,
      plannedItems: finance_planned_items,
      today,
    });
    return formatDayBreakdownTooltip(breakdown, {
      factBalance: fact[hoverIdx],
      planBalance: plan[hoverIdx],
    });
  }, [
    activeDate,
    hoverIdx,
    finance,
    balance_snapshots,
    finance_planned_items,
    today,
    fact,
    plan,
  ]);

  return html`
    <div class="balance-chart-wrap balance-chart-wrap--interactive">
      <svg
        ref=${svgRef}
        class="balance-chart-svg"
        viewBox=${`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove=${onSvgMove}
        onMouseLeave=${clearHover}
        onClick=${onSvgClick}
      >
        ${ticks.map((t) => {
          const y = yAt(t);
          return html`
            <g key=${t}>
              <line x1=${pL} x2=${W - pR} y1=${y} y2=${y} stroke=${CHART.grid} stroke-width="1" />
              <text x=${pL - 6} y=${y + 3} text-anchor="end" font-size="9" fill=${CHART.label} font-family="var(--mono)">
                ${fmtRub(t)}
              </text>
            </g>
          `;
        })}
        ${dates.map((d, i) => {
          if (i % labelEvery !== 0 && i !== n - 1) return null;
          const label = d.slice(8, 10) + "." + d.slice(5, 7);
          return html`
            <text
              key=${"lbl-" + d}
              x=${xAt(i)}
              y=${H - 8}
              text-anchor="middle"
              font-size="9"
              fill=${CHART.label}
              font-family="var(--mono)"
            >${label}</text>
          `;
        })}
        ${planArea &&
        html`
          <path d=${planArea} fill=${CHART.planFill} stroke="none" />
        `}
        ${planPath.d &&
        html`
          <path
            d=${planPath.d}
            fill="none"
            stroke=${CHART.plan}
            stroke-width="1.5"
            stroke-dasharray="6 4"
            stroke-linejoin="round"
            pointer-events="none"
          />
        `}
        ${factPath.d &&
        html`
          <path
            d=${factPath.d}
            fill="none"
            stroke=${CHART.fact}
            stroke-width="2"
            stroke-linejoin="round"
            pointer-events="none"
          />
        `}
        ${markers.map((m, i) => {
          const idx = dates.indexOf(m.date);
          if (idx < 0 || plan[idx] == null) return null;
          const isExp = m.deltaRub < 0;
          return html`
            <circle
              key=${"m-" + i}
              cx=${xAt(idx)}
              cy=${yAt(plan[idx])}
              r="4"
              fill=${isExp ? CHART.danger : CHART.success}
              pointer-events="none"
            />
          `;
        })}
        ${dates.map((d, i) => html`
          <rect
            key=${"hit-" + d}
            x=${xAt(i) - geometry.xStep / 2}
            y=${pT}
            width=${geometry.xStep}
            height=${iH}
            fill="transparent"
            class=${hoverIdx === i ? "balance-chart-hit--active" : "balance-chart-hit"}
          />
        `)}
        ${hoverIdx >= 0 &&
        html`
          <line
            x1=${xAt(hoverIdx)}
            x2=${xAt(hoverIdx)}
            y1=${pT}
            y2=${pT + iH}
            stroke=${CHART.hover}
            stroke-width="1"
            stroke-dasharray="3 3"
            pointer-events="none"
          />
        `}
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
      <div class="balance-chart-legend-wrap">
        <div class="legend-item-wrap">
          <span class="legend-swatch" style=${`background: ${CHART.fact}`}></span>
          <span class="legend-label">факт</span>
        </div>
        <div class="legend-item-wrap">
          <span class="legend-swatch legend-swatch--dashed" style=${`border-color: ${CHART.plan}`}></span>
          <span class="legend-label">план</span>
        </div>
        <span class="balance-chart-hint">клик по дню — операции и баланс</span>
      </div>
    </div>
  `;
}
