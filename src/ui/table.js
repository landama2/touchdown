// Sorting for the UI's tables. Pure: no DOM, so the engine's tests can cover it.
// A column is { key, get }: get(row) returns the value to sort on. Numbers sort as numbers,
// everything else as text. Ties keep their order (Array.prototype.sort is stable).

export const sortRows = (rows, col, dir = 1) => [...rows].sort((a, b) => {
  const x = col.get(a), y = col.get(b);
  const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
  return c * dir;
});

// Clicking a header sorts by it ascending, again descending, a third time back to the table's own order (null).
export const nextSort = (cur, key) => cur?.key !== key ? { key, dir: 1 } : cur.dir > 0 ? { key, dir: -1 } : null;

// A sortable header cell: a native button, so Enter and Space work with no extra code.
// table names the list on the screen (each has its own sort), key the column.
export const sortHead = (label, table, key, state, cls = '') => {
  const on = state?.key === key;
  const mark = on ? (state.dir > 0 ? ' ▲' : ' ▼') : '';
  const next = !on ? 'Sort by this column' : state.dir > 0 ? 'Sort descending' : 'Back to the default order';
  return `<th class="${cls}" aria-sort="${on ? (state.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button class="link" data-act="sortBy" data-table="${table}" data-key="${key}" title="${next}">${label}${mark}</button></th>`;
};
