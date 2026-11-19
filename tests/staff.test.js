import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createWorld } from '../src/world.js';
import { takeClub } from '../src/season.js';
import { injure } from '../src/squad.js';
import { trainWeek, defaultTraining, recoverRate } from '../src/training.js';
import { passDays } from '../src/squad.js';
import { wageBill, staffBill, payWeeks, STANDARD, STAFF_COST, SEASON_WEEKS } from '../src/finance.js';
import { AREAS, COACHING, MEDICAL, RECOVERY, coachScale, medicalScale, recoveryScale, aiStaff, standardStaff, setStaff } from '../src/staff.js';
import { MINI } from './fixtures/mini.js';

const median = list => [...list].sort((a, b) => a - b)[list.length >> 1];

test('AI clubs: their division\'s standard level, one up or down for a club well above or below the division\'s median', () => {
  const s = createWorld(1, MINI);
  for (const d of s.divisions) {
    const m = median(d.clubIds.map(id => s.clubs[id].quality));
    for (const id of d.clubIds) {
      const c = s.clubs[id], want = STANDARD[c.div] + Math.max(-1, Math.min(1, Math.round(c.quality - m)));
      assert.deepEqual(c.staff, Object.fromEntries(AREAS.map(a => [a, want])), c.name);
    }
  }
  takeClub(s, 14);
  assert.deepEqual(s.clubs[14].staff, standardStaff(2));
  s.clubs[14].staff.coaching = 5;
  aiStaff(s);
  assert.equal(s.clubs[14].staff.coaching, 5); // yours are left alone
});

test('effects: level 3 changes nothing; coaching scales growth, medical the length of injuries', () => {
  assert.deepEqual([COACHING[2], MEDICAL[2]], [1, 1]);
  assert.deepEqual([coachScale({}), medicalScale({})], [1, 1]); // a club without staff (old tests, hand-built clubs)
  const len = scale => injure(makeRng(5), { inj: null }, scale).days;
  assert.equal(len(1), injure(makeRng(5), { inj: null }).days);
  assert.equal(len(MEDICAL[4]), Math.max(1, Math.round(len(1) * MEDICAL[4])));
  const grown = level => {
    const s = createWorld(2, MINI), c = s.clubs[4], rng = makeRng(9);
    c.staff.coaching = level;
    for (const p of c.players) { p.age = 18; p.pot = 20; }
    for (let w = 0; w < 100; w++) { trainWeek(rng, c, defaultTraining()); for (const p of c.players) p.inj = null; }
    return c.players.reduce((t, p) => t + p.gain, 0);
  };
  assert.ok(grown(5) > grown(1) * 1.4, `${grown(5)} vs ${grown(1)}`);
});

test('the staff bill: only the human club, only beyond its division\'s standard; a saving below it', () => {
  const s = createWorld(3, MINI);
  takeClub(s, 14);
  const me = s.clubs[14], std = STAFF_COST[STANDARD[2] - 1];
  assert.equal(staffBill(s, me), 0);
  assert.equal(staffBill(s, s.clubs[0]), 0);
  assert.equal(setStaff(s, 'coaching', 4), null);
  assert.equal(staffBill(s, me), STAFF_COST[3] - std);
  assert.equal(setStaff(s, 'medical', 1), null);
  assert.equal(staffBill(s, me), STAFF_COST[3] - std + STAFF_COST[0] - std);
  const per = Math.round(staffBill(s, me) * 52 / SEASON_WEEKS);
  payWeeks(s, 2);
  assert.equal(me.fin.season.staff, 2 * per);
  assert.equal(s.clubs[0].fin.season.staff, 0);
});

test('setting levels: 1-5 in a known area; going up or down always works, whatever the bill', () => {
  const s = createWorld(4, MINI);
  takeClub(s, 14);
  const me = s.clubs[14];
  assert.equal(setStaff(s, 'kit', 3), 'Unknown staff level.');
  assert.equal(setStaff(s, 'coaching', 6), 'Unknown staff level.');
  assert.equal(setStaff(s, 'coaching', 5), null);
  assert.equal(me.staff.coaching, 5);
  assert.equal(setStaff(s, 'coaching', 1), null);
  assert.equal(me.staff.coaching, 1);
});

test('medical staff speed up the return of condition between matches; level 3 changes nothing', () => {
  assert.equal(RECOVERY[2], 1);
  assert.equal(recoveryScale({}), 1);
  const rested = level => {
    const s = createWorld(2, MINI), c = s.clubs[4], p = c.players[0];
    c.staff.medical = level; p.cond = 20; p.inj = null;
    passDays([p], 3, recoverRate(defaultTraining(), p) * recoveryScale(c));
    return p.cond;
  };
  assert.ok(rested(5) > rested(3) && rested(3) > rested(1), `${rested(1)} ${rested(3)} ${rested(5)}`);
  assert.equal(rested(3), 20 + 3 * recoverRate(defaultTraining(), null)); // the Normal rate, untouched
  assert.ok(Number.isInteger(rested(4)));
});
