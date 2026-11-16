import { overall } from './player.js';
import { PLAYOFF_DAYS } from './calendar.js';

// Club money in euros at real-world scale. Every club keeps books: c.fin = { balance, season }, where
// season is this season's ledger (blankLedger: all positive amounts). Income: broadcast money by
// division, merit prize money by final position, sponsorship and gate receipts by club size (its
// quality), cup prize money. Costs: wages (staff costs arrive in Phase 9). Broadcast, sponsorship and
// wages are paid in SEASON_WEEKS equal weekly instalments. A club may go into debt (Phase 10's board acts on it).
export const SEASON_WEEKS = Math.floor(PLAYOFF_DAYS[2] / 7) + 1; // weekly payments from day 0 to the play-off finals
export const BROADCAST = [93e6, 7.5e6, 2.5e6];  // per season, by division (top first); lower divisions use the last (tuned in Phase 6)
export const MERIT = [2.5e6, 0.1e6, 0.05e6];  // per place counted from the bottom: the last club gets 1×, the champion n×
export const CUP_PRIZE = [2e6, 1e6];          // winner, runner-up
const SPONSOR = { at8: 0.8e6, growth: 0.46 }, GATE = { at8: 125e3, growth: 0.32 }; // quality 8 ≈ a League One club (tuned in Phase 6)
const WAGE = { at50: 2.2e3, growth: 0.112 };  // a week: overall 50 ≈ a League One regular, 93 ≈ €270k (tuned in Phase 6)
const START_SHARE = 0.25, TRANSFER_SHARE = 0.5, WAGE_SHARE = 0.7, WAGE_HEADROOM = 1.15; // (raised from 1.05 in Phase 6 review: 5% left no room to renew)

const byDiv = (list, d) => list[Math.min(d, list.length - 1)];
const round = (x, step) => Math.round(x / step) * step;

export const blankLedger = () => ({ broadcast: 0, sponsor: 0, gate: 0, prize: 0, wages: 0, fees: 0, sales: 0 });

// What a player earns a week at his level; under-21s less. Contracts start from it.
export const wage = p => Math.max(500, round(WAGE.at50 * Math.exp(WAGE.growth * (overall(p) - 50)) * (p.age < 21 ? 0.6 : 1), 500));
export const sponsorship = c => round(SPONSOR.at8 * Math.exp(SPONSOR.growth * (c.quality - 8)), 1e5);
export const gate = c => round(GATE.at8 * Math.exp(GATE.growth * (c.quality - 8)), 1e3);
// What club c pays a week: its players' wages (for a player on loan there, the borrower's part) plus
// the part it still pays of the players it has lent out (c.lentPay).
export const lentPart = p => Math.round(p.contract.wage * (1 - p.loan.share)); // the lender's part
export const wageBill = c => c.players.reduce((t, p) => t + (p.contract?.wage ?? 0) - (p.loan ? lentPart(p) : 0), 0) + (c.lentPay ?? 0);

// A season's income for club c finishing mid-table: broadcast, half the merit pot, sponsorship, a gate per home league match.
export function projection(s, c) {
  const n = s.divisions[c.div].clubIds.length;
  return byDiv(BROADCAST, c.div) + byDiv(MERIT, c.div) * n / 2 + sponsorship(c) + gate(c) * (n - 1);
}
export const newBooks = (s, c) => ({ balance: round(START_SHARE * projection(s, c), 1e5), season: blankLedger() });

// Positive amount = income, negative = cost; the ledger records its size.
function book(c, key, amount) { c.fin.balance += amount; c.fin.season[key] += Math.abs(amount); }

// `weeks` weekly instalments for every club: broadcast and sponsorship in, wages out.
export function payWeeks(s, weeks) {
  if (weeks <= 0) return;
  for (const c of s.clubs) {
    book(c, 'broadcast', weeks * Math.round(byDiv(BROADCAST, c.div) / SEASON_WEEKS));
    book(c, 'sponsor', weeks * Math.round(sponsorship(c) / SEASON_WEEKS));
    book(c, 'wages', -weeks * Math.round(wageBill(c) * 52 / SEASON_WEEKS));
  }
}
export const payGate = c => book(c, 'gate', gate(c));

// End of season: merit prize money for every club by final position (tables[d] = division d's final
// table), cup prize money (cup = { winner, runnerUp } or null). Returns what club `me` earned.
export function payPrizes(s, tables, cup, me) {
  let mine = 0;
  const pay = (id, x) => { book(s.clubs[id], 'prize', x); if (id === me) mine += x; };
  tables.forEach((t, d) => t.forEach((id, k) => pay(id, byDiv(MERIT, d) * (t.length - k))));
  if (cup) { pay(cup.winner, CUP_PRIZE[0]); pay(cup.runnerUp, CUP_PRIZE[1]); }
  return mine;
}

// The human club's limits for a season, from its books: a transfer budget of half its balance (none
// in debt) and a weekly wage budget of 70% of its projected income, never below its wage bill + 5%.
// ponytail: fixed shares; Phase 10's board sets budgets.
export function seasonBudgets(s) {
  const c = s.clubs[s.me];
  s.budget = Math.max(0, round(TRANSFER_SHARE * c.fin.balance, 1e5));
  s.wageBudget = round(Math.max(WAGE_HEADROOM * wageBill(c), WAGE_SHARE * projection(s, c) / 52), 1e3);
}
