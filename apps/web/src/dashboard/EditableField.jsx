import { h } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import htm from "htm";

const html = htm.bind(h);

/**
 * Click-to-edit field. Calls onSave when committed (blur / Enter).
 * @param {{ value: string|number|null|undefined, display?: string, onSave: (v: string|number) => void|Promise<void>, type?: 'text'|'number'|'time', disabled?: boolean, className?: string, inputClassName?: string, title?: string }} props
 */
export function EditableField({
  value,
  display,
  onSave,
  type = "text",
  disabled = false,
  className = "",
  inputClassName = "",
  title = "нажми, чтобы изменить",
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) {
      setDraft(value === null || value === undefined ? "" : String(value));
    }
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const commit = async () => {
    setEditing(false);
    const raw = draft.trim();
    const next = type === "number" ? (raw === "" ? null : Number(raw)) : raw;
    const prev = type === "number" ? (value === null || value === undefined ? null : Number(value)) : value;
    if (next === prev || (type === "number" && next !== null && Number.isNaN(next))) return;
    try {
      await onSave(next);
    } catch (e) {
      alert(`Не удалось сохранить: ${e?.message || e}`);
      setDraft(value === null || value === undefined ? "" : String(value));
    }
  };

  const shown = display ?? (value === null || value === undefined || value === "" ? "—" : String(value));

  if (disabled) {
    return html`<span class=${className}>${shown}</span>`;
  }

  if (editing) {
    return html`
      <input
        ref=${inputRef}
        class=${`editable-field-input ${inputClassName}`}
        type=${type === "number" ? "number" : type === "time" ? "time" : "text"}
        value=${draft}
        onInput=${(e) => setDraft(e.target.value)}
        onBlur=${() => void commit()}
        onKeyDown=${(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") {
            setDraft(value === null || value === undefined ? "" : String(value));
            setEditing(false);
          }
        }}
      />
    `;
  }

  return html`
    <button
      type="button"
      class=${`editable-field-btn ${className}`}
      title=${title}
      onClick=${() => {
        setDraft(value === null || value === undefined ? "" : String(value));
        setEditing(true);
      }}
    >
      <span class="editable-field-btn__text">${shown}</span>
    </button>
  `;
}
