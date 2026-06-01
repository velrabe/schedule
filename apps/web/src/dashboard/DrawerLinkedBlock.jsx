import { h } from "preact";
import htm from "htm";

const html = htm.bind(h);

export function DrawerLinkedBlock({ rows = [], onOpenRecord, liveMode }) {
  if (!rows.length) return null;
  return html`
    <div class="drawer-linked-block-wrap">
      ${rows.map((row) => {
        const linkText = row.linkText || row.linkLabel || row.value || "—";
        const hasLink = Boolean(row.linkRecord && onOpenRecord);
        return html`
          <div class="drawer-linked-row-wrap" key=${row.key}>
            <div class="drawer-linked-row-head-wrap">
              <span class="drawer-linked-row-label">${row.label}</span>
              ${row.value && html`
                <span class="drawer-linked-row-amount">${row.value}</span>
              `}
            </div>
            ${hasLink && html`
              <button
                type="button"
                class="drawer-linked-row-link"
                disabled=${!liveMode}
                onClick=${() => onOpenRecord({ kind: row.linkKind, record: row.linkRecord })}
              >
                <span class="drawer-linked-row-link__text">${linkText}</span>
              </button>
            `}
            ${!hasLink && linkText && html`
              <span class="drawer-linked-row-static">${linkText}</span>
            `}
            ${row.detail && html`
              <span class="drawer-linked-row-detail">${row.detail}</span>
            `}
          </div>
        `;
      })}
    </div>
  `;
}
