import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createPlayer, freshState } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { bestXI } from '../src/lineup.js';
import { startMatch, stepMinute } from '../src/match.js';
import { available, readiness, formAvg, moraleLabel, injure, passDays, offseason, afterMatch, INJURIES, SHARP_MIN, YELLOW_LIMIT, OFFSEASON } from '../src/squad.js';
import { MINI } from './fixtures/mini.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;
// A finished AI-v-AI match between clubs 4 and 5 of a fresh mini world.
function setup(seed) {
  const s = createWorld(seed, MINI), side = id => ({ club: s.clubs[id], ids: bestXI(s.clubs[id], '4-4-2'), formation: '4-4-2' });
  const m = startMatch(seed, side(4), side(5));
  while (!m.done) stepMinute(m);
  return { s, m };
}

test('a new player is fresh: available, and readiness exactly 1', () => {
  const p = createPlayer(makeRng(1), 1, 'MF', 10);
  for (const [k, v] of Object.entries(freshState())) assert.deepEqual(p[k], v, k);
  assert.equal(readiness(p), 1);
  assert.ok(available(p));
  assert.equal(formAvg(p), null);
  assert.deepEqual([0, 25, 50, 70, 95].map(moraleLabel), ['Very low', 'Low', 'Okay', 'Good', 'Superb']);
});

test('readiness: morale and form up to 2% each, lost sharpness costs up to 4%', () => {
  const p = freshState();
  assert.ok(near(readiness({ ...p, morale: 100 }), 1.02));
  assert.ok(near(readiness({ ...p, morale: 0 }), 0.98));
  assert.ok(near(readiness({ ...p, form: [8, 8, 8] }), 1.02));
  assert.ok(near(readiness({ ...p, form: [5] }), 0.98));
  assert.ok(near(readiness({ ...p, sharp: SHARP_MIN }), 0.96));
  assert.equal(formAvg({ form: [6, 7, 8.5] }), 7.2);
  assert.ok(!available({ ...p, ban: 1 }) && !available({ ...p, inj: { name: 'knock', days: 2 } }));
});

test('injuries come from the table; a worse one replaces a milder one, never the reverse', () => {
  const rng = makeRng(2), p = freshState();
  for (let k = 0; k < 300; k++) {
    p.inj = null;
    const inj = injure(rng, p), row = INJURIES.find(x => x[0] === inj.name);
    assert.ok(row && inj.days >= row[1] && inj.days <= row[2], JSON.stringify(inj));
  }
  p.inj = { name: 'knee ligaments', days: 500 };
  injure(rng, p);
  assert.deepEqual(p.inj, { name: 'knee ligaments', days: 500 });
});

test('passDays heals, restores condition, wears sharpness down and lets morale drift to 50', () => {
  const p = { ...freshState(), cond: 70, morale: 80, inj: { name: 'knock', days: 3 } };
  passDays([p], 2, 8);
  assert.deepEqual([p.cond, p.sharp, p.morale, p.inj.days], [86, 98.8, 79.4, 1]);
  passDays([p], 1, 8);
  assert.equal(p.inj, null);
  assert.equal(p.cond, 94);
  passDays([p], 400, 8);
  assert.deepEqual([p.cond, p.sharp, p.morale], [100, SHARP_MIN, 50]);
});

test('offseason: fresh and sharp, cards, form and gains wiped; long injuries and bans carry over', () => {
  const p = { ...freshState(), cond: 60, sharp: 50, form: [7], yc: 4, gain: 3, ban: 2, morale: 30, inj: { name: 'knee ligaments', days: OFFSEASON + 10 } };
  offseason(p);
  assert.deepEqual([p.cond, p.sharp, p.form, p.yc, p.gain, p.ban, p.morale, p.inj.days], [100, 100, [], 0, 0, 2, 30, 10]);
  const q = { ...freshState(), inj: { name: 'knock', days: 5 } };
  offseason(q);
  assert.equal(q.inj, null);
});

test('after a match: players who played carry its fatigue, sharpness and rating; the others only the result', () => {
  const { s, m } = setup(1), club = s.clubs[4];
  const p = club.players.find(x => m.pl[x.id]?.played && !m.pl[x.id].inj), x = m.pl[p.id];
  const idle = club.players.find(y => !m.pl[y.id]?.played);
  p.sharp = 80;
  afterMatch(s, m, 'league', makeRng(1));
  const result = Math.sign(m.sides[0].st.goals - m.sides[1].st.goals);
  assert.equal(p.cond, Math.round(x.fit));
  assert.ok(p.cond < 100);
  assert.equal(p.sharp, 92);
  assert.deepEqual(p.form, [Math.round(Math.max(3, Math.min(10, x.rt)) * 10) / 10]);
  assert.equal(idle.cond, 100);
  assert.deepEqual(idle.form, []);
  assert.ok([50 + 4 * result, 50 + 4 * result - 3].includes(idle.morale), `${idle.morale}`); // a fit regular left out loses 3
});

test('an injury in a match gets a recovery time and makes news', () => {
  const { s, m } = setup(2), o = m.sides[1].on.find(x => x.pos !== 'GK');
  m.pl[o.id].inj = true;
  const news = afterMatch(s, m, 'cup', makeRng(3)), p = s.clubs[5].players.find(x => x.id === o.id);
  assert.ok(p.inj && p.inj.days >= 2 && !available(p));
  assert.ok(news.some(n => n.type === 'injury' && n.club === 5 && n.id === p.id && n.injury === p.inj.name && n.days === p.inj.days));
});

test('cards: straight red 3 matches, second yellow 1, every fifth league yellow 1; bans count down every match', () => {
  const { s, m } = setup(3), club = s.clubs[4];
  const [a, b, c] = club.players.filter(p => m.pl[p.id]?.played && p.pos !== 'GK');
  c.yc = YELLOW_LIMIT - 1;
  m.ev = [{ type: 'red', side: 0, id: a.id, second: false }, { type: 'red', side: 0, id: b.id, second: true }, { type: 'yellow', side: 0, id: c.id }];
  const news = afterMatch(s, m, 'league', makeRng(1));
  assert.deepEqual([a.ban, b.ban, c.ban, c.yc], [3, 1, 1, YELLOW_LIMIT]);
  assert.equal(news.filter(n => n.type === 'ban' && n.club === 4).length, 3);
  m.ev = [{ type: 'yellow', side: 0, id: c.id }]; // a cup yellow does not count towards a ban
  afterMatch(s, m, 'cup', makeRng(1));
  assert.deepEqual([a.ban, b.ban, c.ban, c.yc], [2, 0, 0, YELLOW_LIMIT]);
});
