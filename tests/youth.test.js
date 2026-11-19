import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { WEIGHTS, overall } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { takeClub, playDay, endSeason } from '../src/season.js';
import { wage, wageBill } from '../src/finance.js';
import { expireContracts } from '../src/contracts.js';
import { MAX_SQUAD, MIN_SQUAD } from '../src/market.js';
import { YOUTH_MAX, YOUTH_YEARS, intake, trainYouth, ceiling, ceilingRange, promote, release, fromYouth, ageYouth } from '../src/youth.js';
import { MINI } from './fixtures/mini.js';

// Managing Kilo (bottom division, club 14): standard coaching there is level 2.
const fresh = seed => { const s = createWorld(seed, MINI); takeClub(s, 14); return s; };
const best = p => Math.max(...Object.keys(WEIGHTS[p.pos]).map(k => p.attrs[k]));

test('taking a club brings a first intake: 2 + coaching level, aged 15-16, no contracts, room to grow', () => {
  const s = fresh(1), seed = s.seed;
  assert.equal(s.youth.length, 2 + s.clubs[14].staff.coaching);
  assert.ok(s.youth.every(p => p.age >= 15 && p.age <= 16 && p.contract === null && p.pot >= best(p) + 2 && p.pot <= 20));
  assert.equal(s.seed, seed); // the career's random sequence is untouched
  s.youth = Array(YOUTH_MAX - 1).fill(null).map((_, k) => s.youth[0] && { ...s.youth[0], id: -k });
  assert.equal(intake(s, makeRng(1)), 1); // never above YOUTH_MAX
});

test('youth training: key attributes grow, never above potential, faster with better coaching', () => {
  const grown = level => {
    const s = fresh(2);
    s.clubs[14].staff.coaching = level;
    const before = s.youth.map(p => ({ ...p.attrs }));
    trainYouth(s, makeRng(3), 60);
    assert.ok(s.youth.every(p => Object.keys(WEIGHTS[p.pos]).every(k => p.attrs[k] <= Math.max(p.pot, before[s.youth.indexOf(p)][k]))));
    return s.youth.reduce((t, p, i) => t + Object.keys(p.attrs).reduce((u, k) => u + p.attrs[k] - before[i][k], 0), 0) / s.youth.length;
  };
  const low = grown(1), high = grown(5);
  assert.ok(low > 0 && high > low, `${low} vs ${high}`);
});

test('the ceiling: the overall at full potential, shown as a range that narrows with coaching', () => {
  const s = fresh(3), p = s.youth[0];
  assert.ok(ceiling(p) >= overall(p));
  for (const level of [1, 3, 5]) {
    s.clubs[14].staff.coaching = level;
    const [lo, hi] = ceilingRange(s, p);
    assert.ok(lo <= ceiling(p) && ceiling(p) <= hi);
    assert.equal(hi - lo, [12, 9, 6, 4, 2][level - 1]);
  }
});

test('promote and release: a promoted player joins the first team on a starter contract', () => {
  const s = fresh(4), me = s.clubs[14], [a, b] = s.youth;
  assert.equal(promote(s, a.id, MAX_SQUAD), null);
  assert.ok(me.players.includes(a) && !s.youth.includes(a));
  assert.deepEqual(a.contract, { wage: wage(a), until: s.season + YOUTH_YEARS, clause: null });
  assert.equal(release(s, b.id), null);
  assert.ok(!s.youth.includes(b));
  assert.equal(release(s, b.id), 'Not in your youth squad.');
  assert.equal(promote(s, s.youth[0].id, me.players.length), `Squad is full (${me.players.length}).`);
});

test('the first team\'s gaps are filled from the youth squad first', () => {
  const s = fresh(5), me = s.clubs[14];
  const keeper = { ...s.youth[0], id: s.nid++, pos: 'GK' };
  s.youth.push(keeper);
  assert.equal(fromYouth(s, 'GK')?.pos, 'GK');
  for (const p of me.players.filter(p => p.pos === 'GK')) p.contract.until = s.season;
  while (me.players.length > MIN_SQUAD) me.players.pop();
  const gks = s.youth.filter(p => p.pos === 'GK');
  expireContracts(s, makeRng(1), MIN_SQUAD);
  assert.ok(gks.every(p => me.players.includes(p) && p.contract));
});

test('the season: youth at 19 leave, the summer intake arrives, the leavers are in History', () => {
  const s = fresh(6), old = s.youth[0];
  old.age = 18;
  for (const p of s.clubs[14].players) p.contract.until = 9; // no gaps to fill from the youth squad
  while (!s.done) playDay(s);
  endSeason(s);
  assert.ok(!s.youth.includes(old));
  assert.deepEqual(s.history[0].youthLeft, [old.name]);
  assert.ok(s.youth.some(p => p.age <= 16));
  assert.deepEqual(ageYouth({ youth: [] }), []);
});
