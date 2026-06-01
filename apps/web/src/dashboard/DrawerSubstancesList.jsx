import { h } from "preact";
import htm from "htm";
import { substanceRowLabel } from "./substanceSession.js";

const html = htm.bind(h);

/**
 * Read-only substance doses with time + link to substance drawer.
 */
export default function DrawerSubstancesList({
  title = "субстанции",
  hint = "",
  rows = [],
  onOpenRecord,
  liveMode = false,
  emptyText = "нет записей в этом интервале",
}) {
  return html`
    <section class="drawer-substances-section-wrap">
      <div class="record-drawer-section-wrap record-drawer-section-wrap--card">
        <span class="record-drawer-section-title">${title}</span>
        ${hint && html`<span class="record-drawer-section-hint">${hint}</span>`}
      </div>
      <div class="drawer-substances-list-wrap">
        ${rows.length === 0 && html`
          <div class="drawer-substances-empty-wrap">
            <span class="drawer-substances-empty">${emptyText}</span>
          </div>
        `}
        ${rows.map((sub) => html`
          <div class="drawer-substances-row-wrap" key=${sub.id}>
            <div class="drawer-substances-row-main-wrap">
              <span class="drawer-substances-row-time">${String(sub.time || "").slice(0, 5) || "—"}</span>
              <span class="drawer-substances-row-label">${substanceRowLabel(sub)}</span>
            </div>
            ${onOpenRecord && html`
              <button
                type="button"
                class="drawer-nav-link-btn drawer-nav-link-btn--source"
                disabled=${!liveMode}
                onClick=${() => onOpenRecord({ kind: "substance", record: sub })}
              >
                <span class="drawer-nav-link-btn__text">→</span>
              </button>
            `}
          </div>
        `)}
      </div>
    </section>
  `;
}
