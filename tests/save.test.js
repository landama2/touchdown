import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { takeClub, playRound } from '../src/season.js';
import { serialize, deserialize, SAVE_VERSION } from '../src/save.js';

test('a career survives a save/load round trip and continues identically', () => {
  const a = createWorld(21);
  takeClub(a, 3);
  playRound(a);
  const b = deserialize(serialize(a));
  assert.deepEqual(b, a);
  playRound(a); playRound(b);
  assert.deepEqual(b, a);
});

test('deserialize returns null for missing, corrupt or wrong-version saves', () => {
  assert.equal(deserialize(null), null);
  assert.equal(deserialize(''), null);
  assert.equal(deserialize('{not json'), null);
  assert.equal(deserialize('42'), null);
  assert.equal(deserialize(JSON.stringify({ version: SAVE_VERSION + 1 })), null);
  assert.equal(deserialize(JSON.stringify({ teams: [] })), null); // the old demo's save shape
});
