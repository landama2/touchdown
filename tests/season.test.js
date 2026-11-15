import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createWorld, MARKET_SIZE } from '../src/world.js';
import { FORMATIONS, slots, bestXI, fixLineup, strength } from '../src/lineup.js';
import { simMatch } from '../src/match.js';
import { takeClub, myClub, playRound, table, endSeason } from '../src/season.js';

test('slots has 11 entries starting with GK for every formation', () => {
  for (const f of Object.keys(FORMATIONS)) {
    assert.equal(slots(f).length, 11);
    assert.equal(slots(f)[0], 'GK');
  }
});

test('bestXI picks 11 distinct players with a goalkeeper in goal', () => {
  const s = createWorld(1), club = s.clubs[0];
  for (const f of Object.keys(FORMATIONS)) {
    const ids = bestXI(club, f);
    assert.equal(new Set(ids).size, 11);
    assert.equal(club.players.find(p => p.id === ids[0]).pos, 'GK');
    const st = strength(club, ids, f);
    assert.ok(Number.isFinite(st.att) && Number.isFinite(st.def) && st.att > 0 && st.def > 0);
  }
});

test('fixLineup repairs a lineup that references a missing player', () => {
  const s = createWorld(2);
  takeClub(s, 5);
  const gone = s.lineup[3];
  myClub(s).players = myClub(s).players.filter(p => p.id !== gone);
  fixLineup(s);
  assert.equal(new Set(s.lineup).size, 11);
  assert.ok(!s.lineup.includes(gone));
});

test('simMatch: sensible goal totals, stronger side wins more, events match the score', () => {
  const s = createWorld(3), rng = makeRng(3);
  const side = id => ({ club: s.clubs[id], ids: bestXI(s.clubs[id], '4-4-2'), formation: '4-4-2' });
  const strong = side(0), weak = side(47), peer = side(1);
  let goals = 0, strongWins = 0, weakWins = 0;
  for (let i = 0; i < 400; i++) {
    const r = simMatch(rng, strong, peer);
    goals += r.hg + r.ag;
    assert.equal(r.ev.length, r.hg + r.ag);
    assert.equal(r.ev.filter(e => e.club === 0).length, r.hg);
    const m = simMatch(rng, weak, strong);
    if (m.ag > m.hg) strongWins++; else if (m.hg > m.ag) weakWins++;
  }
  const perMatch = goals / 400;
  assert.ok(perMatch > 2 && perMatch < 3.6, `goals per match ${perMatch}`);
  assert.ok(strongWins > weakWins * 5, `${strongWins} vs ${weakWins}`);
});

test('a full season: every club plays 30, stats are consistent in every division', () => {
  const s = createWorld(4);
  takeClub(s, 20);
  const budget0 = s.budget;
  const seed0 = s.seed;
  playRound(s);
  assert.notEqual(s.seed, seed0);
  while (!s.done) assert.equal(playRound(s).length, 3);
  assert.equal(s.round, 30);
  assert.equal(playRound(s), null);
  assert.ok(s.budget > budget0);
  assert.ok(s.budget - budget0 <= 2 * budget0, `income ${s.budget - budget0} vs start ${budget0}`);
  s.divisions.forEach((d, i) => {
    const st = d.clubIds.map(id => s.clubs[id].st), sum = k => st.reduce((t, x) => t + x[k], 0);
    assert.ok(st.every(x => x.p === 30 && x.p === x.w + x.d + x.l && x.pts === 3 * x.w + x.d));
    assert.equal(sum('w'), sum('l'));
    assert.equal(sum('gf'), sum('ga'));
    const tb = table(s, i);
    assert.deepEqual([...tb].sort((a, b) => a - b), d.clubIds);
    for (let k = 1; k < tb.length; k++) assert.ok(s.clubs[tb[k - 1]].st.pts >= s.clubs[tb[k]].st.pts);
  });
});

test('endSeason rolls over; three seasons keep squads intact', () => {
  const s = createWorld(5);
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
    assert.ok(s.history[y - 1].pos >= 1 && s.history[y - 1].pos <= 16);
    assert.ok(s.clubs.every(c => c.players.length === 22 && c.st.p === 0 && c.players.every(p => p.age <= 35)));
    assert.equal(new Set(s.lineup).size, 11);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('same seed and same choices give the same career; works with no human club', () => {
  const run = () => { const s = createWorld(6); while (!s.done) playRound(s); endSeason(s); return s; };
  assert.deepEqual(run(), run());
});

test("free agents: half of last season's list stays, a year older; the rest are new", () => {
  const s = createWorld(8);
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
  const s = createWorld(8);
  for (const p of s.market) p.age = 35;
  const old = new Set(s.market.map(p => p.id));
  while (!s.done) playRound(s);
  endSeason(s);
  assert.equal(s.market.length, MARKET_SIZE);
  assert.ok(s.market.every(p => !old.has(p.id)));
});
