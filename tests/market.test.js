import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { overall, value } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { wage, wageBill } from '../src/finance.js';
import { yearsFor } from '../src/contracts.js';
import { takeClub, playDay, endSeason } from '../src/season.js';
import { MINI } from './fixtures/mini.js';
import { MIN_SQUAD, MAX_SQUAD, SUMMER_END, JANUARY, LOAN_SHARE, inWindow, windowOpen, windowId, justJoined, loanEnd, bar, regular,
  asking, signingFee, refusal, move, lend, loanable, returnLoans, marketDay } from '../src/market.js';

const world = seed => createWorld(seed, MINI);
const sumBalances = s => s.clubs.reduce((t, c) => t + c.fin.balance, 0);
const byOverall = c => [...c.players].sort((a, b) => overall(b) - overall(a));

test('windows: summer to 1 September and all of January; the summer window opens when the season ends', () => {
  assert.deepEqual([-1, 0, SUMMER_END - 1, SUMMER_END, 100, JANUARY[0], JANUARY[1], JANUARY[1] + 1].map(inWindow), [true, true, true, false, false, true, true, false]);
  const s = world(1);
  assert.ok(windowOpen(s));
  assert.equal(windowId(s), 2);
  s.day = 100; assert.ok(!windowOpen(s)); assert.equal(windowId(s), null);
  s.day = 150; assert.equal(windowId(s), 3);
  s.done = true; assert.ok(windowOpen(s)); assert.equal(windowId(s), 4); // next season's summer
  assert.equal(loanEnd(s), 2);
});

test('regulars and asking prices: value, less in the last two seasons, more for a regular, less when listed or in debt', () => {
  const s = world(2), c = s.clubs[0], [star] = byOverall(c), fringe = byOverall(c).filter(p => p.pos === star.pos).at(-1);
  assert.equal(bar(c, 'GK'), overall(byOverall(c).find(p => p.pos === 'GK')));
  assert.ok(regular(c, star) && !regular(c, fringe));
  star.contract.until = s.season + 2;
  const full = asking(s, c, star);
  assert.equal(full, Math.round(value(star) * 1.3 / 1e4) * 1e4);
  star.contract.until = s.season + 1; assert.equal(asking(s, c, star), Math.round(value(star) * 1.3 * 0.85 / 1e4) * 1e4);
  star.contract.until = s.season; assert.equal(asking(s, c, star), Math.round(value(star) * 1.3 * 0.6 / 1e4) * 1e4);
  star.contract.until = s.season + 2; star.listed = 'sale'; c.fin.balance = -1;
  assert.equal(asking(s, c, star), Math.round(value(star) * 1.3 * 0.85 * 0.85 / 1e4) * 1e4);
  fringe.contract.until = s.season + 3;
  assert.equal(asking(s, c, fringe), Math.round(value(fringe) * 0.85 / 1e4) * 1e4);
  assert.equal(signingFee(fringe), Math.round(value(fringe) / 2 / 1e4) * 1e4);
});

test('refusal: nobody drops two divisions; regulars under 31 won\'t drop one or join a much weaker club; unhappy, listed and older players will', () => {
  const s = world(3), top = s.clubs[0], mid = s.clubs[4], low = s.clubs[14], [star] = byOverall(top);
  const fringe = byOverall(top).filter(p => p.pos === star.pos).at(-1);
  star.age = 25; star.morale = 50; fringe.morale = 50;
  assert.equal(refusal(null, low, star), null);
  assert.match(refusal(top, low, star), /two divisions/);
  assert.match(refusal(top, low, fringe), /two divisions/);
  assert.match(refusal(top, mid, star), /drop a division/);
  assert.equal(refusal(top, mid, fringe), null);
  assert.equal(refusal(top, s.clubs[1], star), null);
  const weak = { ...top, id: 99, quality: top.quality - 4 };
  assert.match(refusal(top, weak, star), /weaker club/);
  for (const change of [() => { star.morale = 30; }, () => { star.morale = 50; star.listed = 'sale'; }, () => { delete star.listed; star.age = 31; }]) {
    change();
    assert.equal(refusal(top, mid, star), null);
  }
});

test('a move: the buyer pays, the seller is paid, nothing else changes hands; contracts and the log follow', () => {
  const s = world(4), from = s.clubs[0], to = s.clubs[1], p = from.players[5], total = sumBalances(s);
  move(s, p, from, to, 3e6);
  assert.equal(sumBalances(s), total);
  assert.ok(to.players.includes(p) && !from.players.includes(p));
  assert.deepEqual([to.fin.season.fees, from.fin.season.sales], [3e6, 3e6]);
  assert.deepEqual(p.contract, { wage: Math.max(wage(p), p.contract.wage), until: s.season - 1 + yearsFor(p.age), clause: null });
  assert.ok(justJoined(s, p));
  assert.deepEqual(s.deals.at(-1), { season: 1, day: -1, id: p.id, name: p.name, from: 0, to: 1, fee: 3e6, loan: false });
  const fa = s.market[0];
  move(s, fa, null, to, signingFee(fa));
  assert.equal(sumBalances(s), total - signingFee(fa)); // a signing-on fee leaves the game
  move(s, p, to, null, 0);
  assert.ok(s.market.includes(p) && p.contract === null && s.deals.at(-1).to === null);
});

test('a loan: the borrower pays half the wage, the lender the rest, and he goes home at the end of the season', () => {
  const s = world(5), from = s.clubs[0], to = s.clubs[10];
  const p = from.players.find(x => loanable(s, from, x)) ?? Object.assign(byOverall(from).at(-1), { age: 20 });
  p.contract.until = s.season + 2;
  assert.ok(loanable(s, from, p));
  const bills = [wageBill(from), wageBill(to)], w = p.contract.wage;
  lend(s, p, from, to);
  assert.deepEqual(p.loan, { from: 0, until: 1, share: LOAN_SHARE });
  assert.equal(wageBill(from) + wageBill(to), bills[0] + bills[1]);
  assert.equal(wageBill(to) - bills[1], w - Math.round(w * (1 - LOAN_SHARE)));
  assert.ok(to.players.includes(p) && !loanable(s, to, p));
  assert.ok(s.deals.at(-1).loan);
  returnLoans(s);
  assert.ok(from.players.includes(p) && !to.players.includes(p) && !p.loan);
  assert.deepEqual([wageBill(from), wageBill(to), from.lentPay], [...bills, 0]);
});

test('a market day: an AI club short of keepers signs one, and nobody else spends money that is not there', () => {
  const s = world(6), c = s.clubs[12];
  for (const gk of c.players.filter(p => p.pos === 'GK').slice(1)) move(s, gk, c, null, 0);
  for (const x of s.clubs) if (x !== c) x.fin.balance = -1; // nobody else can afford anything
  const keepers = new Set(s.market.filter(p => p.pos === 'GK').map(p => p.id)), bal = c.fin.balance;
  assert.ok(keepers.size > 0);
  marketDay(s, makeRng(1));
  const signed = c.players.find(p => keepers.has(p.id));
  assert.ok(signed && c.players.filter(p => p.pos === 'GK').length === 2);
  assert.equal(c.fin.balance, bal - signingFee(signed));
  assert.ok(s.clubs.every(x => x === c || x.fin.season.fees === 0));
});
