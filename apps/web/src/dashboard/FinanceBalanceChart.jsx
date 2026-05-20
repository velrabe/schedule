import { h } from "preact";
import htm from "htm";
import { fmtRub } from "./financeInsights.js";

const html = htm.bind(h);

/**
 * Step chart: solid fact, dashed plan (RUB total balance).
 */
export default function FinanceBalanceChart({ dates = [], fact = [], plan = [], markers = [] }) {
  const W = 900;
  const H = 260;
  const padL = 56;
  const padB = 28;
  const padT = 12;
  const padR = 16;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const planVals = plan.filter((v) => v != null && Number.isFinite(v));
  const factVals = fact.filter((v) => v != null && Number.isFinite(v));
  const all = [...planVals, ...factVals];
  if (!dates.length || !all.length) {
    return html`
      <div class="balance-chart-empty-wrap">
        <span class="balance-chart-empty">нет данных для графика — залогируй баланс на сегодня</span>
      </div>
    `;
  }

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

  const factPath = stepPath(fact, false);
  const planPath = stepPath(plan, true);

  const yTicks = 5;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (range * i) / yTicks);

  const labelEvery = Math.max(1, Math.ceil(n / 12));

  return html`
    <div class="balance-chart-wrap">
      <svg class="balance-chart-svg" viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        ${ticks.map((t) => {
          const y = yAt(t);
          return html`
            <g key=${t}>
              <line x1=${padL} x2=${W - padR} y1=${y} y2=${y} stroke="var(--border)" stroke-width="1" />
              <text x=${padL - 6} y=${y + 3} text-anchor="end" font-size="9" fill="var(--text-3)" font-family="var(--mono)">
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
              key=${d}
              x=${xAt(i)}
              y=${H - 8}
              text-anchor="middle"
              font-size="9"
              fill="var(--text-3)"
              font-family="var(--mono)"
            >${label}</text>
          `;
        })}
        ${planPath.d &&
        html`
          <path
            d=${planPath.d}
            fill="none"
            stroke="var(--success)"
            stroke-width="1.5"
            stroke-dasharray="6 4"
            stroke-linejoin="round"
          />
        `}
        ${factPath.d &&
        html`
          <path
            d=${factPath.d}
            fill="none"
            stroke="var(--info)"
            stroke-width="2"
            stroke-linejoin="round"
          />
        `}
        ${markers.map((m, i) => {
          const idx = dates.indexOf(m.date);
          if (idx < 0 || plan[idx] == null) return null;
          const isExp = m.deltaRub < 0;
          return html`
            <circle
              key=${i}
              cx=${xAt(idx)}
              cy=${yAt(plan[idx])}
              r="4"
              fill=${isExp ? "var(--danger)" : "var(--success)"}
            />
          `;
        })}
      </svg>
      <div class="balance-chart-legend-wrap">
        <div class="legend-item-wrap">
          <span class="legend-swatch" style="background: var(--info)"></span>
          <span class="legend-label">факт</span>
        </div>
        <div class="legend-item-wrap">
          <span class="legend-swatch legend-swatch--dashed" style="border-color: var(--success)"></span>
          <span class="legend-label">план</span>
        </div>
      </div>
    </div>
  `;
}
