import { h } from "preact";
import htm from "htm";

const html = htm.bind(h);

/** Clickable row/column that opens the record editor drawer. */
export function RecordOpenRow({ className = "", children, onOpen, disabled, title }) {
  if (disabled || !onOpen) {
    return html`<div class=${className}>${children}</div>`;
  }
  return html`
    <button
      type="button"
      class=${`record-open-row ${className}`.trim()}
      onClick=${onOpen}
      title=${title || "редактировать"}
    >
      ${children}
    </button>
  `;
}
