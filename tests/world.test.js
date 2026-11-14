import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { overall } from '../src/player.js';
import { makeFixtures } from '../src/fixtures.js';
import { createWorld, clubNames, DIVISIONS, CLUBS_PER_DIV } from '../src/world.js';

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

test('clubNames returns n unique names with unique town parts', () => {
  const names = clubNames(makeRng(1), 48);
  assert.equal(new Set(names).size, 48);
  assert.equal(new Set(names.map(n => n.split(' ')[0])).size, 48);
});

test('createWorld builds 3 divisions of 16 clubs with 22-player squads', () => {
  const s = createWorld(99);
  assert.equal(s.version, 1);
  assert.equal(s.divisions.length, DIVISIONS.length);
  assert.equal(s.clubs.length, DIVISIONS.length * CLUBS_PER_DIV);
  s.clubs.forEach((c, i) => {
    assert.equal(c.id, i);
    assert.equal(c.players.length, 22);
    assert.equal(c.players.filter(p => p.pos === 'GK').length, 3);
    assert.deepEqual(c.st, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  });
  s.divisions.forEach((d, i) => {
    assert.equal(d.clubIds.length, CLUBS_PER_DIV);
    assert.ok(d.clubIds.every(id => s.clubs[id].div === i));
    assert.equal(d.fixtures.length, 30);
  });
  const ids = [...s.clubs.flatMap(c => c.players), ...s.market].map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => id < s.nid));
  assert.equal(s.market.length, 40);
  assert.equal(s.me, null);
});

test('higher divisions are stronger', () => {
  const s = createWorld(7);
  const avg = d => { const ps = s.divisions[d].clubIds.flatMap(id => s.clubs[id].players); return ps.reduce((t, p) => t + overall(p), 0) / ps.length; };
  assert.ok(avg(0) > avg(1) && avg(1) > avg(2));
});

test('createWorld is deterministic and JSON-safe', () => {
  const a = createWorld(1234);
  assert.deepEqual(a, createWorld(1234));
  assert.notDeepEqual(a.clubs.map(c => c.name), createWorld(1235).clubs.map(c => c.name));
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});
