import { h } from "preact";
import htm from "htm";

const html = htm.bind(h);

/** @returns {'ok' | 'over' | 'over2x'} */
export function nutriFillState(value, target) {
  if (!target || target <= 0) return "ok";
  if (value >= target * 2) return "over2x";
  if (value > target) return "over";
  return "ok";
}

function pctOf(value, target) {
  if (!target || target <= 0) return 0;
  return Math.min(1, value / target);
}

/**
 * Compact 24×24 ring for calendar rows.
 * @param {{ value: number, target: number, kind?: string, size?: number, title?: string }} props
 */
export function NutriRing({ value, target, kind = "kcal", size = 24, title = "" }) {
  const state = nutriFillState(value, target);
  const pct = pctOf(value, target);
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  const cx = size / 2;
  const cy = size / 2;
  const tip =
    title || `${Math.round(value)} / ${target}`;

  return html`
    <span class="nutri-ring-wrap" title=${tip}>
      <svg class=${`nutri-ring nutri-ring--${kind} nutri-ring--${state}`} width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`}>
        <circle class="nutri-ring__bg" cx=${cx} cy=${cy} r=${r} fill="none" stroke-width=${stroke} />
        <circle
          class="nutri-ring__fg"
          cx=${cx}
          cy=${cy}
          r=${r}
          fill="none"
          stroke-width=${stroke}
          stroke-dasharray=${c}
          stroke-dashoffset=${offset}
          transform=${`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
    </span>
  `;
}

/** Inline rings with short labels (calendar). layout: row | col */
export function NutriRingRow({ items, layout = "row" }) {
  return html`
    <div class=${`nutri-ring-row-wrap ${layout === "col" ? "nutri-ring-row-wrap--col" : ""}`}>
      ${items.map(
        (it) => html`
          <div class="nutri-ring-row__item" key=${it.key || it.label}>
            <${NutriRing} value=${it.value} target=${it.target} kind=${it.kind} title=${it.title || ""} />
            <span class="nutri-ring-row__label">${it.label}</span>
          </div>
        `,
      )}
    </div>
  `;
}

/**
 * Horizontal bar (Nutrition / Kanban day columns).
 * kind: kcal | protein | carbs | fat | activity
 */
export function NutriBar({ label, value, target, unit = "", kind = "kcal", compact = false }) {
  const state = nutriFillState(value, target);
  const pct = pctOf(value, target) * 100;
  const overflow =
    target > 0 && value > target ? Math.min(100, ((value - target) / target) * 100) : 0;

  return html`
    <div class=${`nutri-bar-wrap ${compact ? "nutri-bar-wrap--compact" : ""}`}>
      <div class="nutri-bar-head-wrap">
        <span class="nutri-bar-label">${label}</span>
        <span class="nutri-bar-val">${Math.round(value)}${unit} / ${target}${unit}</span>
      </div>
      <div class="nutri-bar-track">
        <div
          class=${`nutri-bar-fill nutri-bar-fill--${kind} nutri-bar-fill--${state}`}
          style=${{ width: `${pct}%` }}
        ></div>
        ${overflow > 0 &&
        html`<div
          class=${`nutri-bar-fill nutri-bar-fill--${kind} nutri-bar-fill--overflow`}
          style=${{ width: `${overflow}%` }}
        ></div>`}
      </div>
    </div>
  `;
}

export function activityTypeLabel(a) {
  const type = String(a?.type || "").toLowerCase();
  const source = String(a?.source || "").toLowerCase();
  if (type === "move" || source === "move" || source === "base_move") return "move";
  if (type === "walking" && (source === "base_move" || source === "move")) return "move";
  return type.replace(/_/g, " ") || "activity";
}

export function activityDetailLabel(a) {
  if (a?.notes) return a.notes;
  const type = activityTypeLabel(a);
  if (type === "move") return "движение за день";
  return type;
}

/** Ring items for one meal column. */
export function ringsForMeal(m, target) {
  const mk = Number(m.kcal) || 0;
  const rings = [];
  if (mk > 0) rings.push({ key: "k", label: "kcal", value: mk, target: target.kcal, kind: "kcal" });
  if (m.carbs_g != null)
    rings.push({ key: "c", label: "C", value: Number(m.carbs_g), target: target.carbs, kind: "carbs" });
  if (m.protein_g != null)
    rings.push({ key: "p", label: "P", value: Number(m.protein_g), target: target.protein, kind: "protein" });
  if (m.fat_g != null)
    rings.push({ key: "f", label: "F", value: Number(m.fat_g), target: target.fat, kind: "fat" });
  return rings;
}

export function mealMacroText(m) {
  const parts = [];
  if (m.carbs_g != null) parts.push(`C${Math.round(Number(m.carbs_g))}`);
  if (m.protein_g != null) parts.push(`P${Math.round(Number(m.protein_g))}`);
  if (m.fat_g != null) parts.push(`F${Math.round(Number(m.fat_g))}`);
  return parts.join(" ");
}
