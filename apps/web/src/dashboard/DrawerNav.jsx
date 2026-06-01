import { h } from "preact";
import htm from "htm";
import { buildBreadcrumbItems, getRelatedLinks } from "./recordLinks.js";
import { filterDrawerNavLinks } from "./recordDisplay.js";

const html = htm.bind(h);

/**
 * Breadcrumbs, back, and quick links for nested drawer navigation.
 */
export default function DrawerNav({
  stack = [],
  ctx = {},
  liveMode = false,
  onBack,
  onNavigateToIndex,
  onOpenLinked,
  currentKind,
  currentRecord,
  excludeKinds = [],
}) {
  const crumbs = buildBreadcrumbItems(stack, ctx);
  const related = filterDrawerNavLinks(
    getRelatedLinks(currentKind, currentRecord, ctx).filter(
      (l) => !excludeKinds.includes(l.kind),
    ),
    { currentKind, currentRecord, stack },
  );

  return html`
    <div class="drawer-nav-wrap">
      ${crumbs.length > 1 && html`
        <div class="drawer-nav-crumbs-wrap">
          ${crumbs.map((c, i) => html`
            <span class="drawer-nav-crumb-segment-wrap" key=${`${c.kind}-${c.record?.id || i}`}>
              ${i > 0 && html`<span class="drawer-nav-crumb-sep">›</span>`}
              <button
                type="button"
                class=${`drawer-nav-crumb-btn ${c.isCurrent ? "drawer-nav-crumb-btn--current" : ""}`}
                disabled=${c.isCurrent || !liveMode}
                onClick=${() => !c.isCurrent && onNavigateToIndex?.(c.index)}
              >
                <span class="drawer-nav-crumb-btn__text">${c.label}</span>
              </button>
            </span>
          `)}
        </div>
      `}
      ${stack.length > 1 && html`
        <div class="drawer-nav-back-wrap">
          <button type="button" class="btn btn--ghost drawer-nav-back-btn" onClick=${onBack}>
            <span class="btn__text-wrap">← назад</span>
          </button>
        </div>
      `}
      ${related.length > 0 && html`
        <div class="drawer-nav-links-wrap">
          <span class="drawer-nav-links-title">связи</span>
          <div class="drawer-nav-links-list-wrap">
            ${related.map((l) => html`
              <button
                type="button"
                class="drawer-nav-link-btn"
                key=${`${l.kind}-${l.record?.id}`}
                disabled=${!liveMode || !onOpenLinked}
                onClick=${() => onOpenLinked?.({ kind: l.kind, record: l.record })}
              >
                <span class="drawer-nav-link-btn__text">${l.label} →</span>
              </button>
            `)}
          </div>
        </div>
      `}
    </div>
  `;
}
