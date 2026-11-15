import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createWorld } from '../src/world.js';
import { FORMATIONS, bestXI, strength } from '../src/lineup.js';
import { startMatch, stepMinute, matchResult, simMatch, power } from '../src/match.js';
import { MINI } from './fixtures/mini.js';

const s = createWorld(3, MINI);
const side = (id, formation = '4-4-2') => ({ club: s.clubs[id], ids: bestXI(s.clubs[id], formation), formation });
const play = (seed, h, a) => { const m = startMatch(seed, h, a); while (!m.done) stepMinute(m); return m; };
const SHOTS = ['goal', 'save', 'miss'];

test('at kick-off a side is exactly as strong as its lineup, formation edge included', () => {
  for (const f of Object.keys(FORMATIONS)) {
    const m = startMatch(1, side(0, f), side(1));
    const want = strength(s.clubs[0], bestXI(s.clubs[0], f), f), got = power(m, 0);
    assert.ok(Math.abs(got.att - want.att) < 1e-9 && Math.abs(got.def - want.def) < 1e-9, f);
  }
});

test('a match lasts 90 minutes and its result adds up', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const m = play(seed, side(4), side(5)), r = matchResult(m);
    assert.equal(m.min, 90);
    assert.deepEqual([r.h, r.a], [4, 5]);
    for (const k of [0, 1]) {
      const st = r.stats[k], goals = r.ev.filter(e => e.side === k && e.type === 'goal').length;
      assert.equal(goals, k ? r.ag : r.hg);
      assert.equal(st.shots, r.ev.filter(e => e.side === k && SHOTS.includes(e.type)).length);
      assert.ok(st.shots >= st.on && st.on >= goals);
    }
    assert.equal(r.stats[0].poss + r.stats[1].poss, 90);
    assert.ok(r.ev.every((e, i) => i === 0 || r.ev[i - 1].min <= e.min));
    assert.ok(r.ratings.length >= 22 && r.ratings.every(x => x.rt >= 3 && x.rt <= 10));
    for (let i = 1; i < r.ratings.length; i++) assert.ok(r.ratings[i - 1].rt >= r.ratings[i].rt);
  }
});

test('players tire, and the fitter ones are the ones with more stamina', () => {
  const m = play(9, side(4), side(5));
  const subbedOn = new Set(m.ev.filter(e => e.type === 'sub').map(e => e.in));
  const full = m.sides.flatMap(S => S.on).filter(o => o.pos !== 'GK' && !subbedOn.has(o.id)).map(o => m.pl[o.id]);
  assert.ok(full.length > 10 && full.every(p => p.fit < 100));
  for (const a of full) for (const b of full) if (a.attrs.stamina > b.attrs.stamina) assert.ok(a.fit > b.fit);
});

test('the same seed plays the same match, also when saved and reloaded at half-time', () => {
  const a = startMatch(77, side(0), side(2));
  for (let k = 0; k < 45; k++) stepMinute(a);
  const b = JSON.parse(JSON.stringify(a));
  while (!a.done) stepMinute(a);
  while (!b.done) stepMinute(b);
  assert.deepEqual(matchResult(b), matchResult(a));
  assert.deepEqual(matchResult(play(77, side(0), side(2))), matchResult(a));
});

test('over many matches: sensible scores, a home edge, and the stronger side usually wins', () => {
  const rng = makeRng(3), strong = side(0), weak = side(15), peer = side(1);
  let goals = 0, home = 0, away = 0, strongWins = 0, weakWins = 0;
  for (let i = 0; i < 400; i++) {
    const r = simMatch(rng, strong, peer);
    goals += r.hg + r.ag;
    if (r.hg > r.ag) home++; else if (r.ag > r.hg) away++;
    const m = simMatch(rng, weak, strong);
    if (m.ag > m.hg) strongWins++; else if (m.hg > m.ag) weakWins++;
  }
  assert.ok(goals / 400 > 2.2 && goals / 400 < 3.4, `goals per match ${goals / 400}`);
  assert.ok(home > away, `home ${home} away ${away}`);
  assert.ok(strongWins > weakWins * 5, `${strongWins} vs ${weakWins}`);
});
