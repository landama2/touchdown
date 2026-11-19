// Save slots, export and import, through the UI module with an in-memory localStorage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { startCareer } from '../src/career.js';
import { serialize, slotKey, KEY } from '../src/save.js';
import { playDay } from '../src/season.js';

const world = createWorld(5);
startCareer(world, 2);
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
store.set(KEY, serialize(world)); // an autosave from before saves were compressed
globalThis.document = { getElementById: () => ({ innerHTML: '', textContent: '', querySelector: () => null }), addEventListener() {} };
const ui = await import('../src/ui/app.js');

test('an uncompressed autosave from before still loads', () => {
  assert.equal(serialize(ui.current()), serialize(world));
});

test('a game saved to a slot is stored compressed and loads back as it was', async () => {
  assert.equal(await ui.saveSlot(1), '');
  const saved = serialize(ui.current()), stored = store.get(slotKey(1));
  assert.ok(stored.startsWith('gz:') && stored.length < saved.length / 4, `stored ${stored.length} vs ${saved.length}`);
  playDay(ui.current());
  assert.notEqual(serialize(ui.current()), saved);
  assert.equal(await ui.loadSlot(1), '');
  assert.equal(serialize(ui.current()), saved);
  const [one, two] = ui.slotList();
  assert.match(one.name, new RegExp(world.clubs[2].name));
  assert.equal(two, null);
});

test('the autosave is compressed too, and writes land in order', async () => {
  playDay(ui.current()); ui.save();
  playDay(ui.current()); await ui.save();
  assert.ok(store.get(KEY).startsWith('gz:'));
  assert.equal(await ui.loadSlot(1), ''); // loading writes the autosave
  const want = serialize(ui.current());
  store.set(slotKey(3), store.get(KEY));
  assert.equal(await ui.loadSlot(3), '');
  assert.equal(serialize(ui.current()), want);
  store.delete(slotKey(3));
});

test('an old uncompressed slot still loads', async () => {
  store.set(slotKey(2), serialize(world));
  assert.equal(await ui.loadSlot(2), '');
  assert.equal(serialize(ui.current()), serialize(world));
  store.delete(slotKey(2));
});

test('an exported save re-imports to the same club and season', async () => {
  const text = ui.exportText();
  assert.doesNotThrow(() => JSON.parse(text)); // exports stay plain JSON
  playDay(ui.current());
  assert.equal(await ui.importText(text), '');
  assert.equal(serialize(ui.current()), text);
});

test('a corrupt file or slot is refused and changes nothing', async () => {
  const before = serialize(ui.current()), slot1 = store.get(slotKey(1));
  assert.match(await ui.importText('{"version":13,"clubs":"nope"}'), /not a Touchline save/);
  store.set(slotKey(2), '{broken');
  assert.match(await ui.loadSlot(2), /cannot be read/);
  store.set(slotKey(2), 'gz:bm90IGd6aXA=');
  assert.match(await ui.loadSlot(2), /cannot be read/);
  assert.equal(serialize(ui.current()), before);
  assert.equal(store.get(slotKey(1)), slot1);
  store.delete(slotKey(2));
});

test('a full storage reports instead of throwing', async () => {
  const set = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  try { assert.match(await ui.saveSlot(3), /storage/); } finally { localStorage.setItem = set; }
  assert.equal(ui.slotList()[2], null);
});
