import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createPlayer, WEIGHTS, ATTRS } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { FOCUS, defaultTraining, trainWeek, recoverRate, setTraining, setFocus } from '../src/training.js';
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

test('young players gain about four attributes a season at Normal; Hard more, Light less, Rest none, adults none', () => {
  const normal = season(squad(1, 300, 19), plan({}));
  const hard = season(squad(1, 300, 19), plan({ intensity: 'Hard' })), light = season(squad(1, 300, 19), plan({ intensity: 'Light' }));
  assert.ok(normal > 3.4 && normal < 4.8, `normal ${normal}`);
  assert.ok(hard > normal && normal > light, `${hard} ${normal} ${light}`);
  assert.equal(season(squad(1, 300, 19), plan({ focus: 'Rest' })), 0);
  assert.equal(season(squad(1, 300, 26), plan({})), 0);
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
