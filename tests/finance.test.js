import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createPlayer, value } from '../src/player.js';
import { wage, sponsorship, gate, wageBill, blankLedger, newBooks, projection, payWeeks, payGate, payPrizes, seasonBudgets, SEASON_WEEKS, BROADCAST, MERIT, CUP_PRIZE, OWNER_CAP, ownerTake, STADIUM, stadiumCost, buildStadium } from '../src/finance.js';
import { createWorld } from '../src/world.js';
import { startCareer } from '../src/career.js';

test('the stadium: a level adds 15% to gate receipts for good and costs eight seasons of what it adds, from the transfer budget', () => {
  const s = createWorld(1);
  startCareer(s, 0);
  const c = s.clubs[0], g = gate(c), cost = stadiumCost(s, c), homeGames = s.divisions[c.div].clubIds.length - 1;
  assert.equal(c.stadium, 0);
  assert.ok(Math.abs(cost - STADIUM.payback * STADIUM.boost * g * homeGames) <= 1e5, `${cost}`);
  s.budget = cost;
  const balance = c.fin.balance;
  assert.equal(buildStadium(s), null);
  assert.equal(c.stadium, 1);
  assert.ok(Math.abs(gate(c) - g * (1 + STADIUM.boost)) <= 1e3, `${gate(c)} vs ${g}`);
  assert.equal(s.budget, 0);
  assert.equal(c.fin.balance, balance - cost);
  assert.equal(c.fin.season.build, cost);
  assert.match(buildStadium(s), /budget/);      // the next level costs more than the budget left
  c.stadium = STADIUM.max; s.budget = 1e12;
  assert.match(buildStadium(s), /as big/);
});

test('owners take the surplus: each summer a balance above five seasons of projected income is paid out', () => {
  const s = createWorld(1), [rich, poor] = s.clubs;
  const cap = c => Math.round(OWNER_CAP * projection(s, c) / 1e5) * 1e5;
  rich.fin.balance = 3 * cap(rich);
  poor.fin.balance = cap(poor) / 2;
  ownerTake(s);
  assert.equal(rich.fin.balance, cap(rich));
  assert.equal(rich.fin.season.dividends, 2 * cap(rich));
  assert.equal(poor.fin.balance, cap(poor) / 2);
  assert.equal(poor.fin.season.dividends, 0);
});

// A midfielder whose overall is exactly `ovr` (a multiple of 5): every attribute is ovr / 5.
const at = (ovr, age = 25) => { const p = createPlayer(makeRng(1), 1, 'MF', 10, age); for (const k in p.attrs) p.attrs[k] = ovr / 5; return p; };
// Three clubs: 0 and 1 in the top division, 2 in the second; each pays two wages.
function books(quality = 12, wages = [10e3, 5e3]) {
  const club = id => ({ id, div: id < 2 ? 0 : 1, quality, stadium: 0, players: wages.map(w => ({ contract: { wage: w } })) });
  const s = { me: 0, clubs: [club(0), club(1), club(2)], divisions: [{ clubIds: [0, 1] }, { clubIds: [2] }] };
  for (const c of s.clubs) c.fin = newBooks(s, c);
  return s;
}

test('value: real-world scale, falling with age, never below €10k', () => {
  assert.equal(value(at(50)), 450e3);
  assert.ok(value(at(95)) >= 90e6 && value(at(95)) <= 110e6, `${value(at(95))}`);
  assert.ok(value(at(70)) >= 4e6 && value(at(70)) <= 6e6, `${value(at(70))}`);
  assert.ok(value(at(50, 20)) > value(at(50)) && value(at(50)) > value(at(50, 31)));
  assert.equal(value(at(5)), 10e3);
  for (const o of [30, 55, 80]) assert.equal(value(at(o)) % 10e3, 0);
});

test('wage: small next to the fees, per week, less for under-21s, in steps of €100', () => {
  assert.equal(wage(at(50)), 400);
  assert.equal(wage(at(50, 19)), 300);
  assert.ok(wage(at(95)) >= 50e3 && wage(at(95)) <= 90e3, `${wage(at(95))}`);
  assert.equal(wage(at(5)), 100);
  for (const o of [35, 60, 85]) assert.equal(wage(at(o)) % 100, 0);
  assert.equal(createPlayer(makeRng(1), 1, 'FW', 10).contract, null);
});

test('sponsorship and gate grow with club quality', () => {
  assert.equal(sponsorship({ quality: 8 }), 0.8e6);
  assert.equal(gate({ quality: 8, stadium: 0 }), 125e3);
  assert.ok(sponsorship({ quality: 16 }) >= 30e6 && sponsorship({ quality: 16 }) <= 90e6);
  assert.ok(gate({ quality: 16, stadium: 0 }) >= 1.5e6 && gate({ quality: 16, stadium: 0 }) <= 5e6);
  assert.equal(sponsorship({ quality: 12.37 }) % 1e5, 0);
});

test('books open at a quarter of a season, and weekly instalments are the same every week', () => {
  const s = books(), c = s.clubs[0];
  assert.equal(wageBill(c), 15e3);
  assert.deepEqual(blankLedger(), { broadcast: 0, sponsor: 0, gate: 0, prize: 0, wages: 0, fees: 0, sales: 0, staff: 0, dividends: 0, build: 0 });
  assert.equal(c.fin.balance, Math.round(0.25 * projection(s, c) / 1e5) * 1e5);
  assert.equal(projection(s, c), BROADCAST[0] + MERIT[0] * 2 / 2 + sponsorship(c) + gate(c) * 1);
  const start = c.fin.balance, per = x => Math.round(x / SEASON_WEEKS);
  payWeeks(s, 0);
  assert.equal(c.fin.balance, start);
  payWeeks(s, 2);
  assert.equal(c.fin.balance, start + 2 * (per(BROADCAST[0]) + per(sponsorship(c)) - per(15e3 * 52)));
  assert.deepEqual(c.fin.season, { ...blankLedger(), broadcast: 2 * per(BROADCAST[0]), sponsor: 2 * per(sponsorship(c)), wages: 2 * per(15e3 * 52) });
  assert.equal(s.clubs[2].fin.season.broadcast, 2 * per(BROADCAST[1]));
  payGate(c);
  assert.equal(c.fin.season.gate, gate(c));
  assert.equal(SEASON_WEEKS, 43);
});

test('prizes: merit by final position for every club, the cup winner and runner-up', () => {
  const s = books(), bal = s.clubs.map(c => c.fin.balance);
  const mine = payPrizes(s, [[1, 0], [2]], { winner: 2, runnerUp: 0 }, 0);
  assert.equal(s.clubs[1].fin.balance - bal[1], 2 * MERIT[0]);
  assert.equal(s.clubs[0].fin.balance - bal[0], MERIT[0] + CUP_PRIZE[1]);
  assert.equal(s.clubs[2].fin.balance - bal[2], MERIT[1] + CUP_PRIZE[0]);
  assert.equal(mine, MERIT[0] + CUP_PRIZE[1]);
  assert.equal(payPrizes(books(), [[0, 1], [2]], null, null), 0);
});

test('season budgets: three quarters of the balance for fees, nothing in debt; wages have no budget', () => {
  const s = books(), c = s.clubs[0];
  c.fin.balance = 10e6; seasonBudgets(s);
  assert.equal(s.budget, 7.5e6);
  assert.equal(s.wageBudget, undefined);
  c.fin.balance = -1e6; seasonBudgets(s);
  assert.equal(s.budget, 0);
});
