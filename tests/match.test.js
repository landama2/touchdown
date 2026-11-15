import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createWorld } from '../src/world.js';
import { FORMATIONS, bestXI, strength } from '../src/lineup.js';
import { startMatch, stepMinute, matchResult, simMatch, power, substitute, setFormation, MAX_SUBS } from '../src/match.js';
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

test('cards: a second yellow or a straight red sends a player off for good', () => {
  let reds = 0, yellows = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const m = play(seed, side(4), side(5));
    for (const e of m.ev.filter(x => x.type === 'red')) {
      reds++;
      assert.ok(!m.sides[e.side].on.some(o => o.id === e.id), 'sent-off player is still on');
      const y = m.ev.filter(x => x.type === 'yellow' && x.id === e.id).length;
      assert.ok(e.second ? y === 2 : y <= 1, `${y} yellows before a ${e.second ? 'second-yellow' : 'straight'} red`);
    }
    for (const k of [0, 1]) {
      assert.equal(m.sides[k].on.length, 11 - m.sides[k].st.rc);
      assert.equal(m.sides[k].st.yc, m.ev.filter(x => x.side === k && x.type === 'yellow').length);
    }
    yellows += m.sides[0].st.yc + m.sides[1].st.yc;
  }
  assert.ok(reds > 0 && yellows > 300, `${reds} reds, ${yellows} yellows`);
});

test('AI sides replace injured players at once and use at most five substitutes', () => {
  let injuries = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const m = play(seed, side(4), side(5));
    for (const e of m.ev.filter(x => x.type === 'injury')) {
      injuries++;
      const before = m.ev.slice(0, m.ev.indexOf(e)).filter(x => x.type === 'sub' && x.side === e.side).length;
      if (before < MAX_SUBS) assert.ok(m.ev.some(x => x.type === 'sub' && x.id === e.id && x.min === e.min), 'injured player not replaced');
    }
    for (const S of m.sides) {
      assert.ok(S.subs <= MAX_SUBS);
      assert.equal(new Set([...S.on.map(o => o.id), ...S.bench]).size, S.on.length + S.bench.length);
    }
  }
  assert.ok(injuries > 0);
});

test('substitute: checks the request, swaps the player in, and nobody comes back', () => {
  const m = startMatch(5, side(4), side(5));
  m.sides[0].auto = false;
  const S = m.sides[0], out = S.on[5].id, sub = S.bench[0];
  assert.equal(substitute(m, 0, 99999, sub), 'That player is not on the pitch.');
  assert.equal(substitute(m, 0, out, 99999), 'That player is not on the bench.');
  assert.equal(substitute(m, 0, out, sub), null);
  assert.equal(S.on[5].id, sub);
  assert.ok(!S.bench.includes(sub) && !S.bench.includes(out));
  assert.ok(m.pl[sub].played);
  assert.deepEqual(m.ev.at(-1), { min: 0, side: 0, type: 'sub', id: out, name: m.pl[out].name, in: sub, inName: m.pl[sub].name });
  for (let k = 1; k < MAX_SUBS; k++) assert.equal(substitute(m, 0, S.on[k].id, S.bench[0]), null);
  assert.equal(substitute(m, 0, S.on[6].id, S.bench[0]), `All ${MAX_SUBS} substitutions are used.`);
  while (!m.done) stepMinute(m);
  assert.equal(m.sides[0].subs, MAX_SUBS);
  assert.equal(substitute(m, 1, m.sides[1].on[3].id, m.sides[1].bench[0]), 'The match is over.');
});

test('substitute: a keeper brought on with no GK slot takes the goal; outfielders keep the slot pos', () => {
  const m = startMatch(5, side(4), side(5)), S = m.sides[0];
  S.auto = false;
  S.on = S.on.filter(o => o.pos !== 'GK'); // as if the keeper was sent off
  const gk = S.bench.find(id => m.pl[id].pos === 'GK'), out = S.on[5], outPos = out.pos;
  assert.ok(gk);
  const before = power(m, 0).def;
  assert.equal(substitute(m, 0, out.id, gk), null);
  assert.equal(S.on.find(o => o.id === gk).pos, 'GK');
  assert.ok(power(m, 0).def > before);
  const mf = S.bench.find(id => m.pl[id].pos !== 'GK'), o2 = S.on[1], p2 = o2.pos;
  assert.equal(substitute(m, 0, o2.id, mf), null);
  assert.equal(S.on.find(o => o.id === mf).pos, p2);
});

test('setFormation re-slots the same players; a side down to ten loses its last slot', () => {
  const m = startMatch(5, side(4), side(5)), ids = m.sides[0].on.map(o => o.id).sort();
  setFormation(m, 0, '4-3-3');
  assert.equal(m.sides[0].formation, '4-3-3');
  assert.deepEqual(m.sides[0].on.map(o => o.id).sort(), ids);
  assert.deepEqual(m.sides[0].on.map(o => o.pos), ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW']);
  m.sides[0].on.pop(); // as if sent off
  setFormation(m, 0, '4-4-2');
  assert.deepEqual(m.sides[0].on.map(o => o.pos), ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW']);
});
