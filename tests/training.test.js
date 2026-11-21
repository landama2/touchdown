import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createPlayer, WEIGHTS, ATTRS, overall } from '../src/player.js';
import { playDay } from '../src/season.js';
import { createWorld } from '../src/world.js';
import { FOCUS, defaultTraining, trainWeek, recoverRate, setTraining, setFocus, setLoad } from '../src/training.js';
import { MINI } from './fixtures/mini.js';

const WEEKS = 42; // training weeks from the first match day (day 0) to the play-off finals (day 294)
const squad = (seed, n, age, pos = 'MF') => {
  const rng = makeRng(seed);
  return { id: 99, players: Array.from({ length: n }, (_, i) => Object.assign(createPlayer(rng, i, pos, 8, age), { pot: 20 })) };
};
// One season of training; injuries are healed at once so they cost only the week they happen. Average gain.
function season(club, t, seed = 1) {
  const rng = makeRng(seed);
  for (let w = 0; w < WEEKS; w++) { trainWeek(rng, club, t); for (const p of club.players) p.inj = null; }
  return club.players.reduce((n, p) => n + p.gain, 0) / club.players.length;
}
const plan = changes => ({ ...defaultTraining(), ...changes });

test('young players gain about four attributes a season at Normal; Hard more, Light less, Rest none', () => {
  const normal = season(squad(1, 300, 19), plan({}));
  const hard = season(squad(1, 300, 19), plan({ intensity: 'Hard' })), light = season(squad(1, 300, 19), plan({ intensity: 'Light' }));
  assert.ok(normal > 3.4 && normal < 4.8, `normal ${normal}`);
  assert.ok(hard > normal && normal > light, `${hard} ${normal} ${light}`);
  assert.equal(season(squad(1, 300, 19), plan({ focus: 'Rest' })), 0);

});

test('the team focus decides which attributes grow; keepers always train as keepers', () => {
  for (const [pos, allowed] of [['MF', FOCUS.Attacking], ['GK', Object.keys(WEIGHTS.GK)]]) {
    const club = squad(2, 100, 19, pos), before = club.players.map(p => ({ ...p.attrs }));
    season(club, plan({ focus: 'Attacking' }));
    club.players.forEach((p, i) => { for (const k in p.attrs) if (p.attrs[k] !== before[i][k]) assert.ok(allowed.includes(k), `${pos} ${k}`); });
  }
});

test('an individual focus takes about half the gains; nothing grows past the hidden potential', () => {
  const club = squad(4, 200, 19), t = plan({ ind: {} }), before = club.players.map(p => p.attrs.pace);
  for (const p of club.players) t.ind[p.id] = 'pace';
  season(club, t);
  const pace = club.players.reduce((n, p, i) => n + p.attrs.pace - before[i], 0), all = club.players.reduce((n, p) => n + p.gain, 0);
  assert.ok(pace / all > 0.4 && pace / all < 0.6, `pace share ${pace / all}`);
  const capped = squad(5, 50, 19);
  for (const p of capped.players) p.pot = 1;
  assert.equal(season(capped, plan({})), 0);
});

test('a pick at the hidden potential is re-rolled, not lost', () => {
  const club = squad(7, 50, 19), t = plan({ ind: {} });
  for (const p of club.players) { p.attrs.pace = p.pot; t.ind[p.id] = 'pace'; }
  const before = club.players.map(p => ({ ...p.attrs })), base = season(squad(7, 50, 19), plan({}));
  const gained = season(club, t);
  assert.ok(Math.abs(gained - base) / base < 0.15, `gain ${gained} vs ${base}`);
  club.players.forEach((p, i) => assert.equal(p.attrs.pace, before[i].pace));
});

test('veterans lose about two physical points a season whatever the schedule', () => {
  const club = squad(6, 300, 32), sum = () => club.players.reduce((n, p) => n + ATTRS.physical.reduce((t, k) => t + p.attrs[k], 0), 0);
  const before = sum();
  season(club, plan({ intensity: 'Hard' }));
  const lost = (before - sum()) / 300;
  assert.ok(lost > 1.6 && lost < 2.6, `lost ${lost}`);
});

test('hard training injures more than light; recovery per day follows the schedule', () => {
  const injuries = intensity => {
    const club = squad(7, 500, 25), rng = makeRng(7);
    let n = 0;
    for (let w = 0; w < WEEKS; w++) { n += trainWeek(rng, club, plan({ intensity })).length; for (const p of club.players) p.inj = null; }
    return n;
  };
  assert.ok(injuries('Hard') > 2 * injuries('Light'));
  assert.deepEqual(['Light', 'Normal', 'Hard'].map(intensity => recoverRate(plan({ intensity }))), [6, 5, 3]);
  assert.equal(recoverRate(plan({ focus: 'Rest' })), 7);
});

test('training setters check what they are given', () => {
  const s = createWorld(1, MINI);
  s.me = 0; s.training = defaultTraining();
  assert.equal(setTraining(s, 'focus', 'Physical'), null);
  assert.equal(setTraining(s, 'intensity', 'Hard'), null);
  assert.deepEqual([s.training.focus, s.training.intensity], ['Physical', 'Hard']);
  for (const [f, v] of [['focus', 'Juggling'], ['intensity', 'constructor'], ['ind', {}]]) assert.ok(setTraining(s, f, v), `${f}=${v}`);
  const id = s.clubs[0].players[0].id;
  assert.equal(setFocus(s, id, 'finishing'), null);
  assert.equal(s.training.ind[id], 'finishing');
  assert.equal(setFocus(s, id, null), null);
  assert.equal(s.training.ind[id], undefined);
  assert.ok(setFocus(s, id, 'luck'));
  assert.ok(setFocus(s, s.clubs[1].players[0].id, 'pace')); // not your player
});

test('older players still improve, less with every year; Hard is faster for them too', () => {
  const at = (age, intensity = 'Normal') => season(squad(1, 300, age), plan({ intensity }));
  const [young, mid, late, old] = [19, 26, 29, 32].map(a => at(a));
  assert.ok(young > mid && mid > late && late > old && old > 0, `${young} ${mid} ${late} ${old}`);
  assert.ok(mid > 1.2 && mid < 2.6, `26: ${mid}`);
  assert.ok(old < 0.8, `32: ${old}`);
  assert.ok(at(28, 'Hard') > at(28, 'Light'));
});

test('a personal intensity overrides the team: Hard injures more, Rest never grows or gets hurt and recovers fastest', () => {
  const run = load => {
    const club = squad(8, 400, 25), t = plan({ load: {} }), rng = makeRng(8);
    for (const p of club.players) if (load) t.load[p.id] = load;
    let hurt = 0;
    for (let w = 0; w < WEEKS; w++) { hurt += trainWeek(rng, club, t).length; for (const p of club.players) p.inj = null; }
    return { hurt, gain: club.players.reduce((n, p) => n + p.gain, 0), rate: recoverRate(t, club.players[0]) };
  };
  const team = run(null), hard = run('Hard'), rest = run('Rest');
  assert.ok(hard.hurt > 1.5 * team.hurt, `${hard.hurt} ${team.hurt}`);
  assert.deepEqual([rest.hurt, rest.gain], [0, 0]);
  assert.deepEqual([team.rate, hard.rate, rest.rate], [5, 3, 8]);
});

test('setLoad checks the player and the value', () => {
  const s = createWorld(1, MINI);
  s.me = 0; s.training = defaultTraining();
  const id = s.clubs[0].players[0].id;
  assert.equal(setLoad(s, id, 'Rest'), null);
  assert.equal(s.training.load[id], 'Rest');
  assert.equal(setLoad(s, id, null), null);
  assert.equal(s.training.load[id], undefined);
  assert.ok(setLoad(s, id, 'Extreme'));
  assert.ok(setLoad(s, s.clubs[1].players[0].id, 'Hard'));
});

test('a season in a whole world raises players aged 24-30 by a little, not a lot', () => {
  const s = createWorld(3, MINI), prime = () => s.clubs.flatMap(c => c.players).filter(p => p.age >= 24 && p.age <= 30);
  const avg = ps => ps.reduce((t, p) => t + overall(p), 0) / ps.length, ids = new Set(prime().map(p => p.id));
  const before = avg(prime());
  while (!s.done) playDay(s);
  const after = avg(s.clubs.flatMap(c => c.players).filter(p => ids.has(p.id)));
  assert.ok(after - before > 0 && after - before < 3, `${before} -> ${after}`);
});

test('each gain is recorded against the attribute that rose, and the record matches p.gain', () => {
  const club = squad(5, 8, 19);
  const before = club.players.map(p => ({ ...p.attrs }));
  season(club, plan({}), 3);
  club.players.forEach((p, i) => {
    const rose = Object.entries(p.attrs).filter(([k, v]) => v > before[i][k]);
    assert.deepEqual(Object.fromEntries(rose.map(([k, v]) => [k, v - before[i][k]])), p.gains || {});
    assert.equal(Object.values(p.gains || {}).reduce((a, b) => a + b, 0), p.gain);
  });
  assert.ok(club.players.some(p => p.gain > 0));
});

test('an older player\'s physical losses are recorded, so gains and losses together explain every change', () => {
  const club = squad(6, 8, 34);
  const before = club.players.map(p => ({ ...p.attrs }));
  season(club, plan({}), 4);
  club.players.forEach((p, i) => {
    for (const k of Object.keys(p.attrs)) assert.equal(p.attrs[k] - before[i][k], (p.gains?.[k] || 0) - (p.losses?.[k] || 0));
  });
  assert.ok(club.players.some(p => p.losses));
});
