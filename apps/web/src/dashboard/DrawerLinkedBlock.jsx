import { h } from "preact";
import htm from "htm";

const html = htm.bind(h);

export function DrawerLinkedBlock({ rows = [], onOpenRecord, liveMode }) {
  if (!rows.length) return null;
  return html`
    <div class="drawer-linked-block-wrap">
      ${rows.map((row) => html`
        <div class="drawer-linked-row-wrap" key=${row.key}>
          <div class="drawer-linked-row-main-wrap">
            <span class="drawer-linked-row-label">${row.label}</span>
            <span class="drawer-linked-row-value">${row.value || "—"}</span>
          </div>
          ${row.detail && html`
            <span class="drawer-linked-row-detail">${row.detail}</span>
          `}
          ${row.linkRecord && onOpenRecord && html`
            <button
              type="button"
              class="drawer-nav-link-btn drawer-nav-link-btn--source"
              disabled=${!liveMode}
              onClick=${() => onOpenRecord({ kind: row.linkKind, record: row.linkRecord })}
            >
              <span class="drawer-nav-link-btn__text">${row.linkLabel} →</span>
            </button>
          `}
        </div>
      `)}
    </div>
  `;
}
