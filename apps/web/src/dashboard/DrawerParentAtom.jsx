import { h } from "preact";
import { useState, useMemo } from "preact/hooks";
import htm from "htm";
import {
  getParentAtomId,
  dayAtomOptions,
  parentAtomLabel,
  setLeafParentAtom,
} from "./parentAtom.js";

const html = htm.bind(h);

const LEAF_KINDS = new Set(["substance", "meal", "activity", "finance"]);

/**
 * Reassign leaf to exactly one parent session_event on this day.
 */
export default function DrawerParentAtom({
  kind,
  record,
  ctx = {},
  liveMode = false,
  busy = false,
  onOpenRecord,
  onReassigned,
}) {
  const [saving, setSaving] = useState(false);

  if (!LEAF_KINDS.has(kind) || !record?.id) return null;

  const date = record.date || "";
  const parentId = useMemo(
    () => getParentAtomId(kind, record, ctx),
    [kind, record?.id, record?.notes, record?.session_event_id, ctx],
  );

  const options = useMemo(
    () => dayAtomOptions(date, ctx),
    [date, ctx.sessionEvents, ctx.finance, ctx.meals, ctx.substances],
  );

  const onSelect = async (e) => {
    const nextId = e.target.value;
    if (!nextId || nextId === parentId || !liveMode) return;
    setSaving(true);
    try {
      await setLeafParentAtom(kind, record, nextId, ctx);
      onReassigned?.();
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const blockBusy = busy || saving;
  const parentLabel = parentAtomLabel(parentId, ctx);
  const parentEvent = parentId
    ? ctx.sessionEvents?.find((ev) => ev.id === parentId)
    : null;

  return html`
    <div class="drawer-parent-atom-wrap">
      <div class="record-drawer-section-wrap">
        <span class="record-drawer-section-title">родитель · атом</span>
        <span class="record-drawer-section-hint">один session_event на день · не сессия и не зеркало substance</span>
      </div>
      ${parentId && parentEvent && onOpenRecord && html`
        <button
          type="button"
          class="drawer-linked-row-link drawer-parent-atom-current-link"
          disabled=${!liveMode || blockBusy}
          onClick=${() =>
            onOpenRecord({ kind: "session_event", record: parentEvent })}
        >
          <span class="drawer-linked-row-link__text">${parentLabel}</span>
        </button>
      `}
      ${!parentId && html`
        <span class="drawer-parent-atom-empty">не привязан к атому</span>
      `}
      <div class="record-drawer-field-wrap">
        <label class="record-drawer-label-wrap" for="drawer-parent-atom-select">
          <span class="record-drawer-label">переназначить на атом</span>
        </label>
        <select
          id="drawer-parent-atom-select"
          class="record-drawer-input"
          disabled=${!liveMode || blockBusy || !options.length}
          value=${parentId || ""}
          onChange=${onSelect}
        >
          <option value="">— выберите атом —</option>
          ${options.map(
            (o) => html`<option value=${o.id}>${o.label}</option>`,
          )}
        </select>
      </div>
    </div>
  `;
}
