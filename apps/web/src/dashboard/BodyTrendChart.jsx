import { h } from "preact";
import { chartYDomain } from "./insightsCharts.jsx";
import { useCallback, useMemo, useRef, useState } from "preact/hooks";
import htm from "htm";

const html = htm.bind(h);

function clientToSvg(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  return pt.matrixTransform(ctm.inverse());
}

function fmtVal(v, decimals = 1) {
  if (v == null || !Number.isFinite(v)) return "—";
  return decimals === 0 ? String(Math.round(v)) : Number(v).toFixed(decimals);
}

function fmtAxis(v, decimals) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return decimals === 0 ? String(Math.round(n)) : n.toFixed(1);
}

function linePath(data, xAt, yAt) {
  const parts = [];
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v == null || !Number.isFinite(v)) continue;
    parts.push(`${parts.length ? "L" : "M"} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`);
  }
  return parts.join(" ");
}

function areaPath(data, xAt, yAt, baseY) {
  let first = -1;
  let last = -1;
  const pts = [];
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v == null || !Number.isFinite(v)) continue;
    if (first < 0) first = i;
    last = i;
    pts.push(`${pts.length ? "L" : "M"} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`);
  }
  if (first < 0) return "";
  return `${pts.join(" ")} L ${xAt(last).toFixed(1)} ${baseY.toFixed(1)} L ${xAt(first).toFixed(1)} ${baseY.toFixed(1)} Z`;
}

/**
 * @param {{ date: string, value: number|null, verified?: boolean }[]} points
 */
export default function BodyTrendChart({
  points = [],
  unit = "",
  decimals = 1,
  color = "var(--info)",
  targetValue = null,
  yMargin,
}) {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const [tooltipPos, setTooltipPos] = useState(null);

  const dates = points.map((p) => p.date);
  const values = points.map((p) => p.value);

  const chart = useMemo(() => {
    const n = dates.length;
    if (!n) return null;
    const vals = values.filter((v) => v != null && Number.isFinite(v));
    if (!vals.length) return null;

    const W = 800;
    const H = 260;
    const padL = 4;
    const padR = 8;
    const padT = 16;
    const padB = 4;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const domainVals = [...vals];
    if (targetValue != null && Number.isFinite(targetValue)) {
      domainVals.push(targetValue);
    }
    const { yMin, yMax, range } = chartYDomain(domainVals, { margin: yMargin });

    const xStep = innerW / Math.max(n - 1, 1);
    const xAt = (i) => padL + i * xStep;
    const yAt = (v) => padT + innerH - ((v - yMin) / range) * innerH;
    const baseY = padT + innerH;

    const yTicks = 4;
    const ticks = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (range * i) / yTicks);
    const labelEvery = Math.max(1, Math.ceil(n / 8));

    return { W, H, padL, padR, padT, innerH, n, xAt, yAt, yMin, ticks, labelEvery, xStep, baseY };
  }, [dates, values, targetValue, yMargin]);

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

  if (!chart) {
    return html`
      <div class="body-chart-empty-wrap">
        <span class="body-chart-empty-text">нет замеров за период — внеси вес ниже</span>
      </div>
    `;
  }

  const { W, H, padL, padR, padT, innerH, n, xAt, yAt, ticks, labelEvery, xStep, baseY } = chart;
  const yAxisTicks = [...ticks].reverse();
  const areaD = areaPath(values, xAt, yAt, baseY);
  const lineD = linePath(values, xAt, yAt);
  const targetY =
    targetValue != null && Number.isFinite(targetValue) ? yAt(targetValue) : null;

  const tooltipLines = useMemo(() => {
    if (hoverIdx < 0 || !points[hoverIdx]) return [];
    const p = points[hoverIdx];
    const lines = [p.time ? `${String(p.date).slice(0, 10)} ${p.time}` : p.date];
    lines.push(`${fmtVal(p.value, decimals)}${unit}`);
    if (p.verified) lines.push("✓ замер (весы / аппарат)");
    else lines.push("расчёт по формуле");
    return lines;
  }, [hoverIdx, points, decimals, unit]);

  return html`
    <div class="body-trend-chart-wrap" ref=${wrapRef}>
      <div class="body-chart-layout">
        <div class="body-chart-yaxis-wrap" aria-hidden="true">
          ${yAxisTicks.map(
            (t) => html`
              <span class="body-chart-yaxis-tick" key=${t}>${fmtAxis(t, decimals)}</span>
            `,
          )}
        </div>
        <div class="body-chart-plot-wrap">
          <svg
            ref=${svgRef}
            class="body-chart-svg"
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
                  stroke-dasharray="4 4"
                />
              `;
            })}
            ${targetY != null &&
            html`
              <line
                x1=${padL}
                x2=${W - padR}
                y1=${targetY}
                y2=${targetY}
                stroke=${color}
                stroke-width="1"
                stroke-dasharray="6 4"
                stroke-opacity="0.7"
              />
            `}
            ${areaD &&
            html`
              <path d=${areaD} fill=${color} fill-opacity="0.12" stroke="none" />
            `}
            ${lineD &&
            html`
              <path
                d=${lineD}
                fill="none"
                stroke=${color}
                stroke-width="2.5"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
            `}
            ${points.map((p, i) => {
              const v = values[i];
              if (v == null || !Number.isFinite(v)) return null;
              const isHover = hoverIdx === i;
              const isEnd = i === 0 || i === n - 1;
              const showLabel = isHover || isEnd;
              return html`
                <g key=${"pt-" + i}>
                  ${p.verified
                    ? html`
                        <polygon
                          points=${`${xAt(i)},${yAt(v) - 5} ${xAt(i) + 4},${yAt(v)} ${xAt(i)},${yAt(v) + 5} ${xAt(i) - 4},${yAt(v)}`}
                          fill=${color}
                          stroke="var(--bg)"
                          stroke-width="1"
                        />
                      `
                    : html`
                        <circle
                          cx=${xAt(i)}
                          cy=${yAt(v)}
                          r=${isHover ? 4 : 3}
                          fill=${color}
                          stroke="var(--bg)"
                          stroke-width="1.5"
                        />
                      `}
                  ${showLabel &&
                  html`
                    <text
                      x=${xAt(i)}
                      y=${yAt(v) - 8}
                      text-anchor="middle"
                      font-size="10"
                      font-weight="600"
                      fill=${color}
                      font-family="ui-monospace, monospace"
                    >${fmtVal(v, decimals)}</text>
                  `}
                </g>
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
        class="body-chart-xaxis-wrap"
        style=${`grid-template-columns: repeat(${n}, 1fr)`}
        aria-hidden="true"
      >
        ${dates.map((d, i) => {
          const show = i % labelEvery === 0 || i === n - 1;
          return html`
            <span class="body-chart-xaxis-tick" key=${"x-" + d}>
              ${show ? d.slice(5).replace("-", "/") : ""}
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
    </div>
  `;
}
