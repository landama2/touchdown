import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { overall, value } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { wage, wageBill } from '../src/finance.js';
import { yearsFor, startContract, terms, canRenew, renew, expireContracts, academy, lastSeason } from '../src/contracts.js';
import { MINI } from './fixtures/mini.js';

// A mini world managed from club 6 with a wage budget that never gets in the way.
const fresh = seed => { const s = createWorld(seed, MINI); s.me = 6; return s; };

test('a new world: every squad player on his going rate, contracts ending over the next four seasons; free agents have none', () => {
  const s = createWorld(1, MINI);
  for (const c of s.clubs) {
    assert.ok(c.fin && Number.isInteger(c.fin.balance) && c.fin.balance > 0);
    for (const p of c.players) assert.deepEqual(p.contract, { wage: wage(p), until: 1 + p.id % 4, clause: null });
  }
  assert.ok(s.market.every(p => p.contract === null));
  assert.deepEqual(startContract({ id: 7, age: 25, attrs: s.clubs[0].players[0].attrs, pos: 'MF' }, 3).until, 6);
});

test('terms: the going rate moved by morale, never a pay cut, years by age, a release clause for stars', () => {
  const s = fresh(1), club = s.clubs[6], p = club.players.find(x => wage(x) >= 5e3);
  p.contract.wage = 0;
  p.morale = 50; assert.equal(terms(s, p).wage, wage(p));
  p.morale = 20; assert.ok(terms(s, p).wage > wage(p));
  p.morale = 90; assert.ok(terms(s, p).wage < wage(p));
  p.contract.wage = 1e6; assert.equal(terms(s, p).wage, 1e6);
  assert.deepEqual([18, 23, 24, 29, 30, 32, 33].map(yearsFor), [5, 5, 4, 4, 2, 2, 1]);
  assert.equal(terms(s, p).years, yearsFor(p.age));
  const star = club.players[0];
  for (const k in star.attrs) star.attrs[k] = 20;
  assert.ok(terms(s, star).clause >= value(star) && terms(s, star).clause % 1e5 === 0);
  const weakest = club.players.reduce((b, x) => overall(x) < overall(b) ? x : b);
  assert.equal(terms(s, weakest).clause, null);
  assert.equal(terms(s, s.market[0]).wage >= 500, true); // a free agent has no contract yet
});

test('renew: only in the last two seasons of a contract, whatever the raise; the new deal starts next season', () => {
  const s = fresh(2), club = s.clubs[6];
  const long = club.players.find(p => p.contract.until >= s.season + 2), soon = club.players.find(p => p.contract.until === s.season);
  assert.ok(!canRenew(s, long) && canRenew(s, soon));
  assert.ok(renew(s, long.id));
  soon.contract.wage = Math.max(0, terms(s, soon).wage - 200); // so the renewal is a raise
  const t = terms(s, soon);
  assert.equal(renew(s, soon.id), null);
  assert.deepEqual(soon.contract, { wage: t.wage, until: s.season + t.years, clause: t.clause });
  assert.ok(renew(s, s.clubs[0].players[0].id)); // not your player
});

test('renew: a renewal at the same wage works', () => {
  const s = fresh(2), soon = s.clubs[6].players.find(p => p.contract.until === s.season);
  soon.contract.wage = terms(s, soon).wage;
  assert.equal(renew(s, soon.id), null);
});

test('canRenew: only when the new deal would run longer than the old one', () => {
  const s = fresh(2), p = s.clubs[6].players[0];
  p.age = 33; p.contract.until = s.season + 1;
  assert.ok(!canRenew(s, p));
  p.contract.until = s.season;
  assert.ok(canRenew(s, p));
});

test('expiry: AI clubs renew; your players whose contracts end leave, and academy players fill the squad to the minimum', () => {
  const s = fresh(3), club = s.clubs[6], rng = makeRng(1);
  const leaving = club.players.filter(p => p.contract.until === s.season);
  const kept = club.players.length - leaving.length;
  const aiEnding = s.clubs[0].players.filter(p => p.contract.until === s.season);
  const left = expireContracts(s, rng, 16);
  assert.deepEqual(left, leaving.map(p => p.name));
  assert.ok(leaving.length > 0 && leaving.every(p => p.contract === null && s.market.includes(p) && !club.players.includes(p)));
  assert.equal(club.players.length, Math.max(16, kept));
  assert.ok(club.players.every(p => p.contract && p.contract.until > s.season));
  assert.ok(aiEnding.length > 0 && aiEnding.every(p => s.clubs[0].players.includes(p) && p.contract.until === s.season + yearsFor(p.age) && p.contract.wage === wage(p)));
  const kid = academy(s, makeRng(2), club, 'GK');
  assert.ok(kid.age >= 17 && kid.age <= 19 && kid.pos === 'GK');
  assert.deepEqual(kid.contract, { wage: wage(kid), until: s.season + 3, clause: null });
});

test('no contract runs past retirement', () => {
  const s = createWorld(9, MINI), c = s.clubs[0], p = c.players[0];
  s.me = c.id;
  p.age = 34; p.contract.until = s.season;
  assert.equal(terms(s, p).years, 1);
  assert.equal(lastSeason(s, p), s.season + 1);
  p.age = 35;
  assert.equal(terms(s, p).years, 0);
  assert.equal(canRenew(s, p), false);
  p.age = 30;
  assert.ok(canRenew(s, p) && terms(s, p).years === 2);
});
