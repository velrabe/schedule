import { h } from "preact";
import { useCallback, useMemo, useRef, useState } from "preact/hooks";
import htm from "htm";

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

function fmtNum(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

function fmtAxisY(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return `${Math.round(n / 100) / 10}k`;
  return Math.abs(n) >= 10 ? String(Math.round(n)) : n.toFixed(1);
}

/**
 * Y-axis from data min/max plus margin. Zero is not forced unless `includeZero`.
 */
export function chartYDomain(
  vals,
  { margin, includeZero = false, floorAtZero = true, minMargin = 1 } = {},
) {
  const finite = vals.filter((v) => v != null && Number.isFinite(v));
  if (!finite.length) return { yMin: 0, yMax: 1, range: 1 };

  let minV = Math.min(...finite);
  let maxV = Math.max(...finite);
  if (includeZero) {
    minV = Math.min(minV, 0);
    maxV = Math.max(maxV, 0);
  }
  const span = maxV - minV;
  const pad =
    margin != null && Number.isFinite(margin)
      ? margin
      : span > 0
        ? Math.max(span * 0.08, minMargin)
        : minMargin;

  let yMin = minV - pad;
  const yMax = maxV + pad;
  if (floorAtZero && !includeZero && minV >= 0) {
    yMin = Math.max(0, yMin);
  }
  const range = yMax - yMin || 1;
  return { yMin, yMax, range };
}

function linePath(data, xAt, yAt) {
  const parts = [];
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v == null || !Number.isFinite(v)) continue;
    const x = xAt(i);
    const y = yAt(v);
    parts.push(`${parts.length ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return parts.join(" ");
}

/**
 * Multi-series line chart: Y labels in HTML (no stretch), hover tooltip, crosshair.
 * @param {string[]} dates — ISO dates
 * @param {{ key: string, label: string, color: string, data: (number|null)[], unit?: string, formatValue?: (v:number)=>string }[]} series
 * @param {(date: string, index: number) => string[]} [extraLines]
 */
export function InsightsLineChart({
  dates = [],
  series = [],
  extraLines,
  hint,
  yMargin,
  includeZero = false,
}) {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const [tooltipPos, setTooltipPos] = useState(null);

  const chart = useMemo(() => {
    const n = dates.length;
    if (!n || !series.length) return null;

    const W = 800;
    const H = 220;
    const padL = 4;
    const padR = 8;
    const padT = 12;
    const padB = 4;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const vals = series.flatMap((s) => s.data).filter((v) => v != null && Number.isFinite(v));
    if (!vals.length) return null;

    const { yMin, yMax, range } = chartYDomain(vals, {
      margin: yMargin,
      includeZero,
    });

    const xStep = innerW / Math.max(n - 1, 1);
    const xAt = (i) => padL + i * xStep;
    const yAt = (v) => padT + innerH - ((v - yMin) / range) * innerH;

    const yTicks = 4;
    const ticks = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (range * i) / yTicks);
    const labelEvery = Math.max(1, Math.ceil(n / 8));

    return { W, H, padL, padR, padT, innerH, n, xAt, yAt, yMin, ticks, labelEvery, xStep };
  }, [dates, series, yMargin, includeZero]);

  const indexFromSvgX = useCallback(
    (svgX) => {
      if (!chart) return -1;
      const raw = (svgX - chart.padL) / chart.xStep;
      return Math.max(0, Math.min(dates.length - 1, Math.round(raw)));
    },
    [chart, dates.length],
  );

  const pickIndex = useCallback(
    (clientX, clientY) => {
      const svg = svgRef.current;
      const wrap = wrapRef.current;
      if (!svg || !wrap || !chart) return;
      const { x } = clientToSvg(svg, clientX, clientY);
      const idx = indexFromSvgX(x);
      if (idx < 0) return;
      setHoverIdx(idx);
      const rect = wrap.getBoundingClientRect();
      setTooltipPos({ left: clientX - rect.left, top: clientY - rect.top });
    },
    [chart, indexFromSvgX],
  );

  const clearHover = useCallback(() => {
    setHoverIdx(-1);
    setTooltipPos(null);
  }, []);

  const tooltipLines = useMemo(() => {
    if (hoverIdx < 0 || !dates[hoverIdx]) return [];
    const date = dates[hoverIdx];
    const lines = [date];
    if (extraLines) {
      for (const line of extraLines(date, hoverIdx) || []) {
        if (line) lines.push(line);
      }
    }
    for (const s of series) {
      const v = s.data[hoverIdx];
      if (v == null || !Number.isFinite(v)) {
        lines.push(`${s.label}: —`);
        continue;
      }
      const text = s.formatValue ? s.formatValue(v) : fmtNum(v, Math.abs(v) >= 10 ? 0 : 1);
      lines.push(`${s.label}: ${text}${s.unit || ""}`);
    }
    return lines;
  }, [hoverIdx, dates, series, extraLines]);

  if (!chart) {
    return html`
      <div class="insights-chart-empty-wrap">
        <span class="insights-chart-empty-text">нет данных для графика</span>
      </div>
    `;
  }

  const { W, H, padL, padR, padT, innerH, n, xAt, yAt, ticks, labelEvery, xStep } = chart;
  const yAxisTicks = [...ticks].reverse();

  return html`
    <div class="insights-line-chart-wrap" ref=${wrapRef}>
      <div class="insights-chart-layout">
        <div class="insights-chart-yaxis-wrap" aria-hidden="true">
          ${yAxisTicks.map(
            (t) => html`
              <span class="insights-chart-yaxis-tick" key=${t}>${fmtAxisY(t)}</span>
            `,
          )}
        </div>
        <div class="insights-chart-plot-wrap">
          <svg
            ref=${svgRef}
            class="insights-chart-svg"
            viewBox=${`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            onMouseMove=${(e) => pickIndex(e.clientX, e.clientY)}
            onMouseLeave=${clearHover}
          >
            ${ticks.map((t) => {
              const y = yAt(t);
              return html`
                <line
                  key=${t}
                  x1=${padL}
                  x2=${W - padR}
                  y1=${y}
                  y2=${y}
                  stroke="var(--border)"
                  stroke-width="1"
                />
              `;
            })}
            ${series.map(
              (s) => html`
                <path
                  key=${s.key}
                  d=${linePath(s.data, xAt, yAt)}
                  fill="none"
                  stroke=${s.color}
                  stroke-width="2"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                />
              `,
            )}
            ${hoverIdx >= 0 &&
            series.map((s) => {
              const v = s.data[hoverIdx];
              if (v == null || !Number.isFinite(v)) return null;
              return html`
                <circle
                  key=${"dot-" + s.key}
                  cx=${xAt(hoverIdx)}
                  cy=${yAt(v)}
                  r="3.5"
                  fill=${s.color}
                  stroke="var(--bg)"
                  stroke-width="1.5"
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
            ${dates.map(
              (_, i) => html`
                <rect
                  key=${"hit-" + i}
                  x=${xAt(i) - xStep / 2}
                  y=${padT}
                  width=${xStep}
                  height=${innerH}
                  fill="transparent"
                />
              `,
            )}
          </svg>
        </div>
      </div>
      <div
        class="insights-chart-xaxis-wrap"
        style=${`grid-template-columns: repeat(${n}, 1fr)`}
        aria-hidden="true"
      >
        ${dates.map((d, i) => {
          const show = i % labelEvery === 0 || i === n - 1;
          return html`
            <span class="insights-chart-xaxis-tick" key=${"x-" + d}>
              ${show ? d.slice(5) : ""}
            </span>
          `;
        })}
      </div>
      ${tooltipLines.length > 0 &&
      tooltipPos &&
      html`
        <div
          class="insights-chart-tooltip-wrap"
          style=${`left: ${tooltipPos.left}px; top: ${tooltipPos.top}px`}
        >
          ${tooltipLines.map((line, i) => html`
            <span
              key=${i}
              class=${i === 0 ? "insights-chart-tooltip-title" : "insights-chart-tooltip-line"}
            >${line}</span>
          `)}
        </div>
      `}
      <div class="legend-wrap">
        ${series.map(
          (s) => html`
            <div class="legend-item-wrap" key=${s.key}>
              <span class="legend-swatch" style=${`background: ${s.color}`}></span>
              <span class="legend-label">${s.label}</span>
            </div>
          `,
        )}
        ${hint &&
        html`
          <span class="insights-chart-hint">${hint}</span>
        `}
        <span class="insights-chart-hint">наведи на график — значения по дню</span>
      </div>
    </div>
  `;
}

/**
 * Horizontal bar chart with stable labels and row hover tooltip.
 */
export function InsightsBarChart({ rows = [], unit = "", valueFmt, hint }) {
  const wrapRef = useRef(null);
  const [hoverKey, setHoverKey] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);

  const max = Math.max(...rows.map((r) => r.value), 1);
  const showVal = valueFmt || ((v) => fmtNum(v, v >= 10 ? 0 : 1));

  const hoverRow = rows.find((r) => r.label === hoverKey);

  const onRowMove = (e, label) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    setHoverKey(label);
    const rect = wrap.getBoundingClientRect();
    setTooltipPos({ left: e.clientX - rect.left, top: e.clientY - rect.top });
  };

  const clearHover = () => {
    setHoverKey(null);
    setTooltipPos(null);
  };

  return html`
    <div class="insights-bar-chart-wrap" ref=${wrapRef}>
      <div class="insights-bar-chart-list-wrap">
        ${rows.map(
          (r) => html`
            <div
              class=${`insights-bar-row-wrap${hoverKey === r.label ? " insights-bar-row-wrap--hover" : ""}`}
              key=${r.label}
              onMouseEnter=${(e) => onRowMove(e, r.label)}
              onMouseMove=${(e) => onRowMove(e, r.label)}
              onMouseLeave=${clearHover}
            >
              <div class="insights-bar-row-label-wrap">
                <span class="insights-bar-row-label">${r.shortLabel || r.label}</span>
              </div>
              <div class="insights-bar-row-track-wrap">
                <div
                  class=${`insights-bar-row-fill insights-bar-row-fill--${r.tone || "info"}`}
                  style=${`width: ${(r.value / max) * 100}%;`}
                ></div>
              </div>
              <div class="insights-bar-row-value-wrap">
                <span class="insights-bar-row-value">${showVal(r.value)}${unit}</span>
              </div>
            </div>
          `,
        )}
      </div>
      ${hoverRow &&
      tooltipPos &&
      html`
        <div
          class="insights-chart-tooltip-wrap"
          style=${`left: ${tooltipPos.left}px; top: ${tooltipPos.top}px`}
        >
          <span class="insights-chart-tooltip-title">${hoverRow.label}</span>
          <span class="insights-chart-tooltip-line"
            >${showVal(hoverRow.value)}${unit}${hoverRow.detail ? ` · ${hoverRow.detail}` : ""}</span
          >
        </div>
      `}
      ${hint &&
      html`
        <span class="insights-chart-hint">${hint}</span>
      `}
    </div>
  `;
}
