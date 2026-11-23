import { overall } from './player.js';
import { PLAYOFF_DAYS } from './calendar.js';

// Club money in euros at real-world scale. Every club keeps books: c.fin = { balance, season }, where
// season is this season's ledger (blankLedger: all positive amounts). Income: broadcast money by
// division, merit prize money by final position, sponsorship and gate receipts by club size (its
// quality), cup prize money. Costs: wages and staff. Broadcast, sponsorship and wages are paid in
// SEASON_WEEKS equal weekly instalments. Wages are small next to transfers (2026-11-19) and there is no wage
// budget: nothing is ever refused for its wages. A club may go into debt (Phase 10's board acts on it).
export const SEASON_WEEKS = Math.floor(PLAYOFF_DAYS[2] / 7) + 1; // weekly payments from day 0 to the play-off finals
export const BROADCAST = [93e6, 12e6, 4e6];   // per season, by division (top first); lower divisions use the last (EFL raised in Phase 7)
export const MERIT = [2.5e6, 0.1e6, 0.05e6];  // per place counted from the bottom: the last club gets 1×, the champion n×
export const CUP_PRIZE = [2e6, 1e6];          // winner, runner-up
export const SCORER_PRIZE = [1e6, 250e3, 100e3], ASSIST_PRIZE = [750e3, 200e3, 75e3]; // to the club of a ranking's winner, by division
// The other rankings pay less: goals + assists mostly repeats the two above; the keepers' get a little more.
export const POINTS_PRIZE = [300e3, 75e3, 30e3], KEEPER_PRIZE = [400e3, 100e3, 40e3];
export const RANK_PRIZE = { goals: SCORER_PRIZE, assists: ASSIST_PRIZE, points: POINTS_PRIZE, cs: KEEPER_PRIZE, save: KEEPER_PRIZE };
export const PAID_RANKS = Object.keys(RANK_PRIZE); // the rankings (keys of VALUE in src/awards.js) whose top 3 are paid
export const PLACE_SHARE = [1, 0.5, 0.25];    // 1st, 2nd and 3rd of a ranking: × the winner's prize
const SPONSOR = { at8: 0.8e6, growth: 0.46 }, GATE = { at8: 125e3, growth: 0.32 }; // quality 8 ≈ a League One club (tuned in Phase 6)
export const WAGE_CUT = 5;                     // wages and staff costs were cut to a fifth of their Phase 6 size (save version 13)
const WAGE = { at50: 2.2e3 / WAGE_CUT, growth: 0.112 }; // a week: overall 50 ≈ a League One regular on €440, 93 ≈ €54k
export const STANDARD = [4, 3, 2];                          // the staff level (src/staff.js) a division's books already pay for
export const STAFF_COST = [2e3, 6e3, 20e3, 60e3, 180e3].map(x => x / WAGE_CUT);     // a week per staff area, by level 1-5
export const START_SHARE = 0.25, TRANSFER_SHARE = 0.75; // in favour of transfers (2026-11-17)

const byDiv = (list, d) => list[Math.min(d, list.length - 1)];
const round = (x, step) => Math.round(x / step) * step;

export const blankLedger = () => ({ broadcast: 0, sponsor: 0, gate: 0, prize: 0, wages: 0, fees: 0, sales: 0, staff: 0, dividends: 0, build: 0 });
// The season's profit so far, before dividends.
export const profit = c => { const L = c.fin.season; return L.broadcast + L.sponsor + L.gate + L.prize + L.sales - L.wages - L.fees - L.staff - L.build; };

// Shares the manager can own in clubs (trade() in src/career.js): a club is worth SHARE.value × its projected
// income; at most SHARE.max percent of each (a majority would be buying the club: a later phase); a sale loses
// sellCut. Dividends: stake × payout × the season's profit. In his own club a stake of `patient` lowers his
// sacking line by `patience`; one of `say` makes the board grant every budget request and adds sayTransfer
// to the transfer share of the balance.
export const SHARE = { value: 2, max: 49, sellCut: 0.05, payout: 0.5, patient: 10, patience: 5, say: 25, sayTransfer: 0.1 };
export const clubValue = (s, c) => round(SHARE.value * projection(s, c), 1e5);
export const stake = (s, id) => s.career?.shares?.[id] ?? 0;

// What a player earns a week at his level; under-21s less. Contracts start from it.
export const wage = p => Math.max(100, round(WAGE.at50 * Math.exp(WAGE.growth * (overall(p) - 50)) * (p.age < 21 ? 0.6 : 1), 100));
export const sponsorship = c => round(SPONSOR.at8 * Math.exp(SPONSOR.growth * (c.quality - 8)), 1e5);
// The stadium (Phase 12): each level adds STADIUM.boost to gate receipts, for good. A level costs `payback` seasons
// of what it adds, paid from the transfer budget. Only the human club builds (AI clubs: a later phase).
export const STADIUM = { max: 5, boost: 0.15, payback: 8 };
const baseGate = c => GATE.at8 * Math.exp(GATE.growth * (c.quality - 8));
export const gate = c => round(baseGate(c) * (1 + STADIUM.boost * c.stadium), 1e3);
export const stadiumCost = (s, c) => round(STADIUM.payback * STADIUM.boost * baseGate(c) * (s.divisions[c.div].clubIds.length - 1), 1e5);
export function buildStadium(s) {
  const c = s.clubs[s.me], cost = stadiumCost(s, c);
  if (c.stadium >= STADIUM.max) return 'The stadium is as big as it gets.';
  if (cost > s.budget) return 'The next stand costs more than your transfer budget.';
  s.budget -= cost; c.fin.balance -= cost; c.fin.season.build += cost; c.stadium++;
  return null;
}
// What club c pays a week: its players' wages (for a player on loan there, the borrower's part) plus
// the part it still pays of the players it has lent out (c.lentPay).
export const lentPart = p => Math.round(p.contract.wage * (1 - p.loan.share)); // the lender's part
export const wageBill = c => c.players.reduce((t, p) => t + (p.contract?.wage ?? 0) - (p.loan ? lentPart(p) : 0), 0) + (c.lentPay ?? 0);

// What club c pays a week for staff beyond its division's standard (negative: a saving). Only the
// human club: every club's books were calibrated with standard staff, and AI clubs keep them.
export function staffBill(s, c) {
  if (c.id !== s.me || !c.staff) return 0;
  const std = STAFF_COST[byDiv(STANDARD, c.div) - 1];
  return Object.values(c.staff).reduce((t, level) => t + STAFF_COST[level - 1] - std, 0);
}

// A season's income for club c finishing mid-table: broadcast, half the merit pot, sponsorship, a gate per home league match.
export function projection(s, c) {
  const n = s.divisions[c.div].clubIds.length;
  return byDiv(BROADCAST, c.div) + byDiv(MERIT, c.div) * n / 2 + sponsorship(c) + gate(c) * (n - 1);
}
export const newBooks = (s, c) => ({ balance: round(START_SHARE * projection(s, c), 1e5), season: blankLedger() });

// Positive amount = income, negative = cost; the ledger records its size.
function book(c, key, amount) { c.fin.balance += amount; c.fin.season[key] += Math.abs(amount); }

// `weeks` weekly instalments for every club: broadcast and sponsorship in, wages and (the human club's) extra staff out.
export function payWeeks(s, weeks) {
  if (weeks <= 0) return;
  for (const c of s.clubs) {
    book(c, 'broadcast', weeks * Math.round(byDiv(BROADCAST, c.div) / SEASON_WEEKS));
    book(c, 'sponsor', weeks * Math.round(sponsorship(c) / SEASON_WEEKS));
    book(c, 'wages', -weeks * Math.round(wageBill(c) * 52 / SEASON_WEEKS));
    const staff = weeks * Math.round(staffBill(s, c) * 52 / SEASON_WEEKS); // net: a saving lowers it
    c.fin.balance -= staff; c.fin.season.staff += staff;
  }
}
export const payGate = c => book(c, 'gate', gate(c));

// End of season: merit prize money for every club by final position (tables[d] = division d's final
// table), cup prize money (cup = { winner, runnerUp } or null). Returns what club `me` earned.
// The prize for place k (0 = 1st) of division d's ranking key (one of PAID_RANKS).
export const rankPrize = (key, d, k) => round(byDiv(RANK_PRIZE[key], d) * PLACE_SHARE[k], 5e3);
// ranks (optional): per division { goals, assists, ... }, each the season's top 3 from ranking() in src/awards.js;
// a key missing (older History entries) pays nothing.
export function payPrizes(s, tables, cup, me, ranks = []) {
  let mine = 0;
  const pay = (id, x) => { book(s.clubs[id], 'prize', x); if (id === me) mine += x; };
  tables.forEach((t, d) => t.forEach((id, k) => pay(id, byDiv(MERIT, d) * (t.length - k))));
  if (cup) { pay(cup.winner, CUP_PRIZE[0]); pay(cup.runnerUp, CUP_PRIZE[1]); }
  ranks.forEach((r, d) => { for (const key of PAID_RANKS) (r[key] || []).forEach((x, k) => pay(x.club, rankPrize(key, d, k))); });
  return mine;
}

// Each summer the owners take out whatever a club holds above OWNER_CAP seasons of projected income (Phase 12):
// without it, wages a fifth of their old size (WAGE_CUT) let Premier League clubs bank about €100M a season forever.
// Booked as dividends, after the manager's own dividends (src/career.js), which come out of the season's profit.
export const OWNER_CAP = 5; // owner's choice, 2026-11-19
export function ownerTake(s) {
  for (const c of s.clubs) {
    const x = Math.max(0, c.fin.balance - round(OWNER_CAP * projection(s, c), 1e5));
    c.fin.balance -= x; c.fin.season.dividends += x;
  }
}

// The board's limit for the human club's season: a transfer budget of TRANSFER_SHARE of its balance (none in
// debt). Wages have no limit, they come out of the balance week by week.
// The manager may ask for more once a season (askBoard in src/career.js).
export function seasonBudgets(s) {
  const c = s.clubs[s.me];
  s.budget = Math.max(0, round((TRANSFER_SHARE + (stake(s, s.me) >= SHARE.say ? SHARE.sayTransfer : 0)) * c.fin.balance, 1e5));
}
