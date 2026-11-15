import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { MINI } from './fixtures/mini.js';
import { takeClub, kickOff, playRound } from '../src/season.js';
import { stepMinute } from '../src/match.js';
import { serialize, deserialize, SAVE_VERSION } from '../src/save.js';
import { BENCH, slots, newFam } from '../src/lineup.js';
import { defaultTactics } from '../src/tactics.js';

test('a career survives a save/load round trip and continues identically', () => {
  const a = createWorld(21, MINI);
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
  assert.equal(deserialize('{"version":1}'), null); // right version, wrong shape
  assert.equal(deserialize(serialize({ ...createWorld(1, MINI), me: 999 })), null); // dangling club index
});

test('a career saved in the middle of a live match resumes identically', () => {
  const a = createWorld(22, MINI);
  takeClub(a, 6);
  kickOff(a);
  for (let k = 0; k < 40; k++) stepMinute(a.live);
  const b = deserialize(serialize(a));
  assert.deepEqual(b, a);
  for (const s of [a, b]) { while (!s.live.done) stepMinute(s.live); playRound(s); }
  assert.deepEqual(b, a);
});

test('a version 2 save loads: the live match slot is added and old results are dropped', () => {
  const s = createWorld(23, MINI);
  takeClub(s, 2);
  playRound(s);
  const old = { ...s, version: 2, last: [[{ h: 0, a: 1, hg: 1, ag: 0, ev: [{ min: 5, club: 0, name: 'X' }] }]] };
  delete old.live;
  const b = deserialize(JSON.stringify(old));
  assert.equal(b.version, SAVE_VERSION);
  assert.equal(b.live, null);
  assert.equal(b.last, null);
  playRound(b);
  assert.equal(b.round, 2);
});

test('a version 3 save loads with default tactics, also in a match in progress', () => {
  const s = createWorld(24, MINI);
  takeClub(s, 1);
  kickOff(s);
  for (let k = 0; k < 30; k++) stepMinute(s.live);
  const old = JSON.parse(serialize(s));
  old.version = 3;
  delete old.bench; delete old.tactics; delete old.fam;
  for (const S of old.live.sides) { delete S.tac; delete S.takers; delete S.fam; for (const o of S.on) { delete o.role; delete o.duty; delete o.shoot; delete o.tackle; } }
  const b = deserialize(JSON.stringify(old));
  assert.equal(b.version, SAVE_VERSION);
  assert.deepEqual(b.tactics, defaultTactics(slots(b.formation)));
  assert.deepEqual(b.fam, newFam());
  assert.equal(b.live.sides[0].tac.mentality, 0);
  while (!b.live.done) stepMinute(b.live);
  playRound(b);
  assert.equal(b.round, 1);
  assert.equal(b.bench.length, BENCH);
});
