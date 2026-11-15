import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { overall, WEIGHTS, ALL_ATTRS } from '../src/player.js';
import { makeFixtures } from '../src/fixtures.js';
import { SAVE_VERSION } from '../src/save.js';
import { createWorld, playerFromData, MARKET_SIZE } from '../src/world.js';
import { MINI } from './fixtures/mini.js';

test('makeFixtures: every ordered pair exactly once, every club once per round', () => {
  const ids = [10, 11, 12, 13, 14, 15], rounds = makeFixtures(ids);
  assert.equal(rounds.length, 10);
  const seen = new Map();
  for (const rd of rounds) {
    assert.deepEqual(rd.flat().sort((a, b) => a - b), ids);
    for (const [h, a] of rd) seen.set(`${h}-${a}`, (seen.get(`${h}-${a}`) || 0) + 1);
  }
  assert.equal(seen.size, 30);
  assert.ok([...seen.values()].every(c => c === 1));
});

test('createWorld builds one division per league from the data', () => {
  const s = createWorld(99, MINI), data = MINI.flatMap(l => l.clubs);
  assert.equal(s.version, SAVE_VERSION);
  assert.deepEqual(s.divisions.map(d => d.name), MINI.map(l => l.name));
  assert.deepEqual(s.divisions.map(d => d.clubIds.length), [4, 10, 6]);
  assert.deepEqual(s.divisions.map(d => d.fixtures.length), [6, 18, 10]);
  assert.deepEqual([s.season, s.day, s.next, s.done, s.last], [1, -1, 0, false, null]);
  assert.equal(s.days.flatMap(d => d.items).filter(i => i.comp === 'league').length, 6 + 18 + 10);
  assert.deepEqual(s.playoffs, [null, null, null]);
  assert.equal(s.cup.rounds.length, 1);
  assert.deepEqual(s.records, [0, 1, 2].map(() => ({ points: null, goals: null, win: null })));
  s.clubs.forEach((c, i) => {
    assert.equal(c.id, i);
    assert.equal(c.name, data[i].name);
    assert.equal(c.short, data[i].short);
    assert.deepEqual(c.colours, data[i].colours);
    assert.deepEqual(c.kit, data[i].kit);
    assert.deepEqual(c.players.map(p => [p.name, p.pos, p.age]), data[i].players.map(r => [r[0], r[1], r[2]]));
    assert.equal(c.quality, data[i].players.reduce((t, r) => t + r[3], 0) / data[i].players.length);
    assert.deepEqual(c.st, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    assert.deepEqual(c.rec, { win: null, goals: null });
  });
  s.divisions.forEach((d, i) => assert.ok(d.clubIds.every(id => s.clubs[id].div === i)));
  const ids = [...s.clubs.flatMap(c => c.players), ...s.market].map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => id < s.nid));
  assert.equal(s.market.length, MARKET_SIZE);
  assert.equal(s.me, null);
});

test('createWorld copies club data instead of sharing it', () => {
  const s = createWorld(1, MINI);
  s.clubs[0].kit.shirt = '#000000';
  s.clubs[0].colours[0] = '#000000';
  assert.equal(MINI[0].clubs[0].kit.shirt, '#c8102e');
  assert.equal(MINI[0].clubs[0].colours[0], '#c8102e');
});

test('playerFromData keeps name, age and position and applies strengths', () => {
  const plain = playerFromData(makeRng(3), 7, ['Test Player', 'FW', 27, 14]);
  const strong = playerFromData(makeRng(3), 7, ['Test Player', 'FW', 27, 14, ['pace', 'finishing']]);
  assert.deepEqual([strong.id, strong.name, strong.pos, strong.age], [7, 'Test Player', 'FW', 27]);
  assert.equal(strong.attrs.pace, Math.min(20, plain.attrs.pace + 2));
  assert.equal(strong.attrs.finishing, Math.min(20, plain.attrs.finishing + 2));
  assert.equal(strong.attrs.dribbling, plain.attrs.dribbling);
  for (const k of Object.keys(WEIGHTS.FW)) assert.ok(strong.pot >= strong.attrs[k], k);
});

test('playerFromData keeps the imported profile at the rating\'s level, ignoring strengths', () => {
  const stats = ALL_ATTRS.map((_, i) => 6 + (i % 7));           // a profile with distinct values, far from any clamp
  const row = ['Stat Player', 'MF', 25, 14, ['pace']];
  const plain = playerFromData(makeRng(4), 9, row);
  const p = playerFromData(makeRng(4), 9, row, stats);
  const d = p.attrs[ALL_ATTRS[0]] - stats[0];
  ALL_ATTRS.forEach((k, i) => assert.equal(p.attrs[k], Math.max(1, Math.min(20, stats[i] + d)), k));
  assert.ok(Math.abs(overall(p) - overall(plain)) <= 3, `${overall(p)} vs ${overall(plain)}`);
  const best = Math.max(...Object.keys(WEIGHTS.MF).map(k => p.attrs[k]));
  assert.ok(p.pot >= best && p.pot <= 20);
});

test('createWorld shifts a league\'s data ratings by its calibration', () => {
  const plain = createWorld(1, MINI, {}, {});
  const shifted = createWorld(1, MINI, {}, { 'Top League': 2 });
  assert.equal(shifted.clubs[0].quality, plain.clubs[0].quality + 2);
  assert.equal(shifted.clubs[4].quality, plain.clubs[4].quality); // Middle League untouched
  const avg = s => s.clubs[0].players.reduce((t, p) => t + overall(p), 0) / s.clubs[0].players.length;
  assert.ok(avg(shifted) > avg(plain) + 5);
});

test('createWorld applies stats by club and player name', () => {
  const stats = { Alpha: { 'Alpha GK1': Array(ALL_ATTRS.length).fill(12) } };
  const s = createWorld(1, MINI, stats);
  const gk = s.clubs[0].players.find(p => p.name === 'Alpha GK1');
  const v = ALL_ATTRS.map(k => gk.attrs[k]);
  assert.ok(v.every(x => x === v[0]), 'flat profile stays flat');
  const other = s.clubs[0].players.find(p => p.name === 'Alpha GK2');
  assert.ok(!ALL_ATTRS.every(k => other.attrs[k] === 12));
});

test('higher divisions are stronger', () => {
  const s = createWorld(7, MINI);
  const avg = d => { const ps = s.divisions[d].clubIds.flatMap(id => s.clubs[id].players); return ps.reduce((t, p) => t + overall(p), 0) / ps.length; };
  assert.ok(avg(0) > avg(1) && avg(1) > avg(2));
});

test('createWorld is deterministic and JSON-safe', () => {
  const a = createWorld(1234, MINI);
  assert.deepEqual(a, createWorld(1234, MINI));
  assert.notDeepEqual(a.clubs[0].players, createWorld(1235, MINI).clubs[0].players);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});
