import { h } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import htm from "htm";

const html = htm.bind(h);

const I = {
  search: () => svgIcon("M11 19a8 8 0 1 1 5.3-14 8 8 0 0 1-5.3 14Zm10 2-4.35-4.35"),
  download: () => svgIcon("M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"),
  sortAsc: () => svgIcon("m6 15 6-6 6 6"),
  sortDesc: () => svgIcon("m6 9 6 6 6-6"),
  sort: () => svgIcon("M8 7h12M8 12h9M8 17h6"),
  plus: () => svgIcon("M12 5v14M5 12h14"),
};

function svgIcon(d) {
  return html`
    <span class="icon" aria-hidden="true">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d=${d}></path>
      </svg>
    </span>
  `;
}

export function useSheetState(key, initialSort) {
  const [sort, setSort] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`schedule-tracker:sort:${key}`)) || initialSort;
    } catch {
      return initialSort;
    }
  });
  const [filters, setFilters] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`schedule-tracker:filter:${key}`)) || {};
    } catch {
      return {};
    }
  });
  const [search, setSearch] = useState("");

  useEffect(() => {
    localStorage.setItem(`schedule-tracker:sort:${key}`, JSON.stringify(sort));
  }, [sort, key]);
  useEffect(() => {
    localStorage.setItem(`schedule-tracker:filter:${key}`, JSON.stringify(filters));
  }, [filters, key]);

  const toggleSort = useCallback((id) => {
    setSort((prev) => {
      if (prev?.id !== id) return { id, dir: "asc" };
      if (prev.dir === "asc") return { id, dir: "desc" };
      return null;
    });
  }, []);

  const setFilter = useCallback((id, value) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (!value) delete next[id];
      else next[id] = value;
      return next;
    });
  }, []);

  return { sort, toggleSort, filters, setFilter, search, setSearch };
}

export function applySheet(rows, sort, filters, search, columns) {
  const q = search.trim().toLowerCase();
  let out = rows;

  if (q) {
    out = out.filter((row) =>
      columns.some((c) => {
        const v = c.accessor ? c.accessor(row) : row[c.id];
        if (v === null || v === undefined) return false;
        return String(v).toLowerCase().includes(q);
      }),
    );
  }

  for (const [id, val] of Object.entries(filters)) {
    if (!val) continue;
    const col = columns.find((c) => c.id === id);
    if (!col) continue;
    if (col.filterMode === "exact") {
      out = out.filter((row) => {
        const v = col.accessor ? col.accessor(row) : row[col.id];
        return String(v ?? "") === val;
      });
    } else {
      const lc = val.toLowerCase();
      out = out.filter((row) => {
        const v = col.accessor ? col.accessor(row) : row[col.id];
        if (v === null || v === undefined) return false;
        return String(v).toLowerCase().includes(lc);
      });
    }
  }

  if (sort) {
    const col = columns.find((c) => c.id === sort.id);
    if (col) {
      const dir = sort.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = col.sortAccessor
          ? col.sortAccessor(a)
          : col.accessor
            ? col.accessor(a)
            : a[col.id];
        const bv = col.sortAccessor
          ? col.sortAccessor(b)
          : col.accessor
            ? col.accessor(b)
            : b[col.id];
        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
  }

  return out;
}

export function SheetHeader({ columns, sort, toggleSort, filters, setFilter }) {
  return html`
    <thead>
      <tr>
        ${columns.map((col) => {
          const active = sort?.id === col.id;
          const dirIcon = !active ? I.sort() : sort.dir === "asc" ? I.sortAsc() : I.sortDesc();
          return html`
            <th key=${col.id} class=${col.thClass || ""}>
              <div class="sheet__th">
                <div
                  class="sheet__th-top"
                  onClick=${() => col.sortable !== false && toggleSort(col.id)}
                  title=${col.title || col.label}
                >
                  <div class="sheet__th-label-wrap">
                    <span class="sheet__th-label">${col.label}</span>
                  </div>
                  ${col.sortable !== false &&
                  html`
                    <div
                      class=${`sheet__th-sort-wrap ${active ? "sheet__th-sort-wrap--active" : ""}`}
                    >
                      ${dirIcon}
                    </div>
                  `}
                </div>
                ${col.filterable !== false &&
                html`
                  <div class="sheet__th-filter-wrap">
                    ${col.filterOptions
                      ? html`
                          <select
                            class="sheet__th-filter-input"
                            value=${filters[col.id] || ""}
                            onChange=${(e) => setFilter(col.id, e.currentTarget.value)}
                          >
                            <option value="">все</option>
                            ${col.filterOptions.map(
                              (opt) =>
                                html`<option value=${opt.value || opt}>${opt.label || opt}</option>`,
                            )}
                          </select>
                        `
                      : html`
                          <input
                            type="text"
                            class="sheet__th-filter-input"
                            placeholder="filter…"
                            value=${filters[col.id] || ""}
                            onInput=${(e) => setFilter(col.id, e.currentTarget.value)}
                          />
                        `}
                  </div>
                `}
              </div>
            </th>
          `;
        })}
      </tr>
    </thead>
  `;
}

export function Toolbar({ search, setSearch, onExport, extraLeft, extraRight, hint }) {
  return html`
    <div class="toolbar">
      <div class="toolbar__left">
        <div class="search-wrap">
          <span class="search-wrap__icon">${I.search()}</span>
          <input
            type="search"
            class="search-wrap__input"
            placeholder="search across columns…"
            value=${search}
            onInput=${(e) => setSearch(e.currentTarget.value)}
          />
        </div>
        ${extraLeft}
      </div>
      <div class="toolbar__right">
        ${hint && html`<span class="kbd"><span>${hint}</span></span>`}
        ${extraRight}
        ${onExport &&
        html`
          <button class="btn" onClick=${onExport}>
            <span class="btn__icon-wrap">${I.download()}</span>
            <span class="btn__text-wrap">CSV</span>
          </button>
        `}
      </div>
    </div>
  `;
}

export { I as sheetIcons };
