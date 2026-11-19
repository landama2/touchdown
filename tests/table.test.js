import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortRows, nextSort, sortHead } from '../src/ui/table.js';

const rows = [{ n: 'B', v: 10 }, { n: 'a', v: 9 }, { n: 'C', v: 10 }];
const by = k => ({ key: k, get: r => r[k] });

test('numbers sort as numbers, not as text', () => {
  const v = sortRows([{ v: 10 }, { v: 9 }, { v: 100 }], by('v'));
  assert.deepEqual(v.map(r => r.v), [9, 10, 100]);
});

test('text sorts case-insensitively', () => {
  assert.deepEqual(sortRows(rows, by('n')).map(r => r.n), ['a', 'B', 'C']);
});

test('descending flips the order and ties keep their input order', () => {
  assert.deepEqual(sortRows(rows, by('v'), -1).map(r => r.n), ['B', 'C', 'a']);
  assert.deepEqual(sortRows(rows, by('v'), 1).map(r => r.n), ['a', 'B', 'C']);
});

test('sorting does not change the input array', () => {
  const copy = [...rows];
  sortRows(rows, by('v'), -1);
  assert.deepEqual(rows, copy);
});

test('first click ascends, second click on the same column descends, a new column ascends', () => {
  const a = nextSort(null, 'ovr');
  assert.deepEqual(a, { key: 'ovr', dir: 1 });
  assert.deepEqual(nextSort(a, 'ovr'), { key: 'ovr', dir: -1 });
  assert.deepEqual(nextSort({ key: 'ovr', dir: -1 }, 'age'), { key: 'age', dir: 1 });
});

test('a sortable header is a native button and marks the sorted column', () => {
  const html = sortHead('Ovr', 'train', 'ovr', { key: 'ovr', dir: -1 }, 'n');
  assert.match(html, /<button class="link" data-act="sortBy" data-table="train" data-key="ovr">Ovr ▼<\/button>/);
  assert.match(html, /aria-sort="descending"/);
  assert.match(sortHead('Age', 'train', 'age', { key: 'ovr', dir: 1 }), /aria-sort="none"/);
});
