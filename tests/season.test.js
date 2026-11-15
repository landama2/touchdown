import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, MARKET_SIZE } from '../src/world.js';
import { FORMATIONS, slots, bestXI, fixLineup, strength } from '../src/lineup.js';
import { takeClub, myClub, myFixture, kickOff, playRound, table, endSeason } from '../src/season.js';
import { stepMinute, matchResult } from '../src/match.js';
import { MINI } from './fixtures/mini.js';

const world = seed => createWorld(seed, MINI);

test('slots has 11 entries starting with GK for every formation', () => {
  for (const f of Object.keys(FORMATIONS)) {
    assert.equal(slots(f).length, 11);
    assert.equal(slots(f)[0], 'GK');
  }
});

test('bestXI picks 11 distinct players with a goalkeeper in goal', () => {
  const s = world(1), club = s.clubs[0];
  for (const f of Object.keys(FORMATIONS)) {
    const ids = bestXI(club, f);
    assert.equal(new Set(ids).size, 11);
    assert.equal(club.players.find(p => p.id === ids[0]).pos, 'GK');
    const st = strength(club, ids, f);
    assert.ok(Number.isFinite(st.att) && Number.isFinite(st.def) && st.att > 0 && st.def > 0);
  }
});

test('fixLineup repairs a lineup that references a missing player', () => {
  const s = world(2);
  takeClub(s, 5);
  const gone = s.lineup[3];
  myClub(s).players = myClub(s).players.filter(p => p.id !== gone);
  fixLineup(s);
  assert.equal(new Set(s.lineup).size, 11);
  assert.ok(!s.lineup.includes(gone));
});

test('a full season: every club plays everyone home and away, stats are consistent', () => {
  const s = world(4);
  takeClub(s, 6);
  const budget0 = s.budget, seed0 = s.seed;
  playRound(s);
  assert.notEqual(s.seed, seed0);
  while (!s.done) assert.equal(playRound(s).length, 3);
  assert.equal(s.round, 10);
  assert.equal(playRound(s), null);
  assert.ok(s.budget > budget0);
  assert.ok(s.budget - budget0 <= 2 * budget0, `income ${s.budget - budget0} vs start ${budget0}`);
  s.divisions.forEach((d, i) => {
    const games = 2 * (d.clubIds.length - 1);
    const st = d.clubIds.map(id => s.clubs[id].st), sum = k => st.reduce((t, x) => t + x[k], 0);
    assert.ok(st.every(x => x.p === games && x.p === x.w + x.d + x.l && x.pts === 3 * x.w + x.d));
    assert.equal(sum('w'), sum('l'));
    assert.equal(sum('gf'), sum('ga'));
    const tb = table(s, i);
    assert.deepEqual([...tb].sort((a, b) => a - b), d.clubIds);
    for (let k = 1; k < tb.length; k++) assert.ok(s.clubs[tb[k - 1]].st.pts >= s.clubs[tb[k]].st.pts);
  });
});

test('divisions of different sizes: the smaller one finishes early, the season ends with the longest', () => {
  const s = world(9);
  takeClub(s, 0); // Top League: 4 clubs, 6 rounds; the others have 10
  for (let r = 0; r < 6; r++) { assert.ok(myFixture(s)); playRound(s); }
  assert.equal(myFixture(s), null);
  assert.equal(s.done, false);
  const res = playRound(s);
  assert.deepEqual(res[0], []);
  assert.equal(res[1].length, 3);
  while (!s.done) playRound(s);
  assert.equal(s.round, 10);
  assert.ok(s.divisions[0].clubIds.every(id => s.clubs[id].st.p === 6));
  assert.equal(myFixture(s), null);
});

test('myFixture returns the human club\'s match', () => {
  const s = world(10);
  takeClub(s, 7);
  const f = myFixture(s);
  assert.ok(f.includes(7));
  assert.ok(s.divisions[1].fixtures[0].some(m => m[0] === f[0] && m[1] === f[1]));
});

test('endSeason rolls over; three seasons keep squads intact', () => {
  const s = world(5);
  takeClub(s, 0);
  endSeason(s); // not done yet: no-op
  assert.equal(s.season, 1);
  for (let y = 1; y <= 3; y++) {
    while (!s.done) playRound(s);
    const seedBefore = s.seed;
    endSeason(s);
    assert.notEqual(s.seed, seedBefore);
    assert.equal(s.season, y + 1);
    assert.equal(s.round, 0);
    assert.equal(s.done, false);
    assert.equal(s.history.length, y);
    assert.equal(s.history[y - 1].champions.length, 3);
    assert.ok(s.history[y - 1].pos >= 1 && s.history[y - 1].pos <= 4);
    assert.ok(s.clubs.every(c => c.players.length === 18 && c.st.p === 0 && c.players.every(p => p.age <= 35)));
    assert.equal(new Set(s.lineup).size, 11);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('prize money uses the size of the human club\'s division', () => {
  const s = world(12);
  takeClub(s, 0); // 4-club division, tier 3
  while (!s.done) playRound(s);
  const pos = table(s, 0).indexOf(0) + 1, before = s.budget;
  endSeason(s);
  assert.equal(s.history[0].prize, (4 + 1 - pos) * 40e3 * 3);
  assert.equal(s.budget, before + s.history[0].prize);
});

test('same seed and same choices give the same career; works with no human club', () => {
  const run = () => { const s = world(6); while (!s.done) playRound(s); endSeason(s); return s; };
  assert.deepEqual(run(), run());
});

test("free agents: half of last season's list stays, a year older; the rest are new", () => {
  const s = world(8);
  const ageBefore = new Map(s.market.map(p => [p.id, p.age]));
  while (!s.done) playRound(s);
  endSeason(s);
  assert.equal(s.market.length, MARKET_SIZE);
  assert.equal(new Set(s.market.map(p => p.id)).size, MARKET_SIZE);
  const kept = s.market.filter(p => ageBefore.has(p.id));
  assert.equal(kept.length, MARKET_SIZE / 2); // nobody on a fresh list is old enough to retire yet
  for (const p of kept) assert.equal(p.age, ageBefore.get(p.id) + 1);
});

test('free agents at retirement age leave the list', () => {
  const s = world(8);
  for (const p of s.market) p.age = 35;
  const old = new Set(s.market.map(p => p.id));
  while (!s.done) playRound(s);
  endSeason(s);
  assert.equal(s.market.length, MARKET_SIZE);
  assert.ok(s.market.every(p => !old.has(p.id)));
});

test('a live match: kick off, play it minute by minute, and the round records exactly that result', () => {
  const s = world(13);
  takeClub(s, 6); // Middle League
  const m = kickOff(s);
  assert.equal(kickOff(s), m); // already started: the same match comes back
  assert.equal(m.sides.find(S => !S.auto).club, 6);
  while (!m.done) stepMinute(m);
  const want = matchResult(m), res = playRound(s);
  assert.equal(s.live, null);
  assert.deepEqual(res[1].find(r => r.h === 6 || r.a === 6), want);
  assert.equal(s.clubs[6].st.gf, want.h === 6 ? want.hg : want.ag);
  assert.equal(s.round, 1);
});

test('playing the round during a live match hands the rest of it to the assistant', () => {
  const s = world(14);
  takeClub(s, 6);
  const m = kickOff(s);
  for (let k = 0; k < 30; k++) stepMinute(m);
  const res = playRound(s);
  const mine = res[1].find(r => r.h === 6 || r.a === 6);
  assert.equal(mine.ev.length, m.ev.length);
  assert.ok(m.done && m.sides.every(S => S.auto));
  assert.equal(s.live, null);
  assert.equal(s.clubs[6].st.p, 1);
});

test('kickOff does nothing when the human club has no fixture', () => {
  const s = world(9);
  takeClub(s, 0); // Top League: 6 rounds, the season has 10
  for (let r = 0; r < 6; r++) playRound(s);
  assert.equal(kickOff(s), null);
  assert.equal(s.live, null);
});
