// Sorting for the UI's tables. Pure: no DOM, so the engine's tests can cover it.
// A column is { key, get }: get(row) returns the value to sort on. Numbers sort as numbers,
// everything else as text. Ties keep their order (Array.prototype.sort is stable).

export const sortRows = (rows, col, dir = 1) => [...rows].sort((a, b) => {
  const x = col.get(a), y = col.get(b);
  const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
  return c * dir;
});

// Clicking a header sorts by it; clicking the same header again flips the direction.
export const nextSort = (cur, key) => cur?.key === key ? { key, dir: -cur.dir } : { key, dir: 1 };

// A sortable header cell: a native button, so Enter and Space work with no extra code.
// table names the list on the screen (each has its own sort), key the column.
export const sortHead = (label, table, key, state, cls = '') => {
  const on = state?.key === key;
  const mark = on ? (state.dir > 0 ? ' ▲' : ' ▼') : '';
  return `<th class="${cls}" aria-sort="${on ? (state.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button class="link" data-act="sortBy" data-table="${table}" data-key="${key}">${label}${mark}</button></th>`;
};
