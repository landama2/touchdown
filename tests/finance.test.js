import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createPlayer, value } from '../src/player.js';
import { wage, sponsorship, gate, wageBill, blankLedger, newBooks, projection, payWeeks, payGate, payPrizes, seasonBudgets, SAVINGS_WEEKS, DEBT_CUT, SEASON_WEEKS, BROADCAST, MERIT, CUP_PRIZE } from '../src/finance.js';

// A midfielder whose overall is exactly `ovr` (a multiple of 5): every attribute is ovr / 5.
const at = (ovr, age = 25) => { const p = createPlayer(makeRng(1), 1, 'MF', 10, age); for (const k in p.attrs) p.attrs[k] = ovr / 5; return p; };
// Three clubs: 0 and 1 in the top division, 2 in the second; each pays two wages.
function books(quality = 12, wages = [10e3, 5e3]) {
  const club = id => ({ id, div: id < 2 ? 0 : 1, quality, players: wages.map(w => ({ contract: { wage: w } })) });
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

test('wage: real-world scale per week, less for under-21s, in steps of €500', () => {
  assert.equal(wage(at(50)), 2000);
  assert.equal(wage(at(50, 19)), 1500);
  assert.ok(wage(at(95)) >= 250e3 && wage(at(95)) <= 450e3, `${wage(at(95))}`);
  assert.equal(wage(at(5)), 500);
  for (const o of [35, 60, 85]) assert.equal(wage(at(o)) % 500, 0);
  assert.equal(createPlayer(makeRng(1), 1, 'FW', 10).contract, null);
});

test('sponsorship and gate grow with club quality', () => {
  assert.equal(sponsorship({ quality: 8 }), 0.8e6);
  assert.equal(gate({ quality: 8 }), 125e3);
  assert.ok(sponsorship({ quality: 16 }) >= 30e6 && sponsorship({ quality: 16 }) <= 90e6);
  assert.ok(gate({ quality: 16 }) >= 1.5e6 && gate({ quality: 16 }) <= 5e6);
  assert.equal(sponsorship({ quality: 12.37 }) % 1e5, 0);
});

test('books open at a quarter of a season, and weekly instalments are the same every week', () => {
  const s = books(), c = s.clubs[0];
  assert.equal(wageBill(c), 15e3);
  assert.deepEqual(blankLedger(), { broadcast: 0, sponsor: 0, gate: 0, prize: 0, wages: 0, fees: 0, sales: 0, staff: 0 });
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

test('season budgets: three quarters of the balance for fees; wages up to 55% of income or the current bill, plus the other quarter over two years', () => {
  const s = books(), c = s.clubs[0];
  c.fin.balance = 10e6; seasonBudgets(s);
  assert.equal(s.budget, 7.5e6);
  assert.equal(s.wageBudget, Math.round((0.55 * projection(s, c) / 52 + 2.5e6 / SAVINGS_WEEKS) / 1e3) * 1e3);
  c.fin.balance = -1e6; seasonBudgets(s);
  assert.equal(s.budget, 0);
  assert.equal(s.wageBudget, Math.round(DEBT_CUT * 0.55 * projection(s, c) / 52 / 1e3) * 1e3); // in debt: no savings, less income
  const rich = books(12, [5e6]); rich.clubs[0].fin.balance = 0; seasonBudgets(rich);
  assert.equal(rich.wageBudget, 5e6); // never below what the club pays now: wages are frozen, not cut
});
