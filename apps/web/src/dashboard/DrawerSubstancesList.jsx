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
        ${rows.map((sub) => {
          const time = String(sub.time || "").slice(0, 5) || "—";
          const label = substanceRowLabel(sub);
          const canOpen = Boolean(onOpenRecord && liveMode);
          if (!onOpenRecord) {
            return html`
              <div class="drawer-substances-row-wrap" key=${sub.id}>
                <span class="drawer-substances-row-main-wrap">
                  <span class="drawer-substances-row-time">${time}</span>
                  <span class="drawer-substances-row-label">${label}</span>
                </span>
              </div>
            `;
          }
          return html`
            <button
              type="button"
              class="drawer-substances-row-wrap drawer-substances-row-wrap--link"
              key=${sub.id}
              disabled=${!canOpen}
              onClick=${() => onOpenRecord({ kind: "substance", record: sub })}
            >
              <span class="drawer-substances-row-main-wrap">
                <span class="drawer-substances-row-time">${time}</span>
                <span class="drawer-substances-row-label">${label}</span>
              </span>
              <span class="drawer-substances-row-arrow">→</span>
            </button>
          `;
        })}
      </div>
    </section>
  `;
}
