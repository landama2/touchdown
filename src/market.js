import { POS, overall, value } from './player.js';
import { wage, wageBill, projection, lentPart } from './finance.js';
import { terms, yearsFor } from './contracts.js';
import { fixLineup } from './lineup.js';

// The transfer market. Clubs trade players with each other in two windows: summer (from the end of
// a season to 1 September) and January. Every club values its players with an asking price and
// sells for at least FLOOR of it. Players can refuse a move down. Season-long loans: the borrower
// pays LOAN_SHARE of the wage. AI clubs fill gaps and buy upgrades on match days in a window; they
// bid for the human club's players, and can pay a release clause. A move is logged in s.deals.
export const MIN_SQUAD = 16, MAX_SQUAD = 32;
export const SUMMER_END = 24, JANUARY = [146, 176];        // 1 September; 1-31 January (day 0 = 8 August)
export const FLOOR = 0.9, WALKAWAY = 0.7, ROUNDS = 3;      // a bid of FLOOR × asking is accepted; below WALKAWAY × asking, no counter
export const SIGNING_FEE = 0.5, QUICK_SALE = 0.5;          // × value: a free agent's signing-on fee; a quick sale's price
export const LOAN_AGE = 23, LOAN_SHARE = 0.5, MAX_LOANS = 4;
const XI = { GK: 1, DF: 4, MF: 4, FW: 2 };                 // a 4-4-2: the regulars at each position
const MIN_POS = { GK: 2, DF: 5, MF: 5, FW: 3 };            // an AI club below this at a position signs a replacement
const PRICE = { lastSeason: 0.6, twoSeasons: 0.85, regular: 1.3, listed: 0.85, debt: 0.85 };
const AI = { activity: 0.15, upgrade: 3, room: 0.5, wageShare: 1 };
const OFFER = { listed: 0.5, unsolicited: 0.03, perDay: 2, low: [0.75, 0.95], high: [0.9, 1.1], max: 1.15, clause: 0.25 };

export const round10k = x => Math.max(10e3, Math.round(x / 1e4) * 1e4);
export const eur = n => '€' + (n / 1e6).toFixed(2) + 'M';

export const inWindow = day => day < SUMMER_END || (day >= JANUARY[0] && day <= JANUARY[1]);
export const windowOpen = s => s.done || inWindow(s.day);
// The open window's id, or null: 2 × season for summer (it belongs to the season it opens), + 1 for January.
export const windowId = s => s.done ? 2 * (s.season + 1) : !inWindow(s.day) ? null : 2 * s.season + (s.day < SUMMER_END ? 0 : 1);
export const justJoined = (s, p) => p.joined != null && p.joined === windowId(s);
// The last season a loan agreed now covers.
export const loanEnd = s => s.season + (s.done ? 1 : 0);
// What the borrower pays a week for a player on wage w.
export const loanPay = w => w - Math.round(w * (1 - LOAN_SHARE));

// The overall a player needs to be one of club c's regulars at position pos: the n-th best there (0 when short).
export function bar(c, pos) {
  const o = c.players.filter(p => p.pos === pos).map(p => overall(p)).sort((a, b) => b - a);
  return o[XI[pos] - 1] ?? 0;
}
export const regular = (c, p) => overall(p) >= bar(c, p.pos);

// What club c wants for player p: his value, less in the last two seasons of his contract, more for a
// regular, less when listed or when c is in debt. Rounded to €10k.
export function asking(s, c, p) {
  const left = p.contract.until - s.season - (s.done ? 1 : 0); // seasons after the current one
  const f = (left <= 0 ? PRICE.lastSeason : left === 1 ? PRICE.twoSeasons : 1) * (regular(c, p) ? PRICE.regular : 1)
    * (p.listed === 'sale' ? PRICE.listed : 1) * (c.fin.balance < 0 ? PRICE.debt : 1);
  return round10k(value(p) * f);
}
export const signingFee = p => round10k(SIGNING_FEE * value(p));

// Why p (at club `from`; null for a free agent) won't join club `to`, or null. Free agents, unhappy
// players (morale under 40) and listed players go anywhere within a division's drop. Nobody drops two
// divisions; a regular under 31 won't drop one, nor join a club 3+ quality weaker in his division.
export function refusal(from, to, p) {
  if (!from || p.morale < 40) return null;
  const drop = to.div - from.div;
  if (drop >= 2) return `${p.name} won't drop two divisions.`;
  if (p.age >= 31 || p.listed || !regular(from, p)) return null;
  if (drop === 1) return `${p.name} won't give up a regular place to drop a division.`;
  if (drop === 0 && to.quality < from.quality - 3) return `${p.name} won't join a weaker club.`;
  return null;
}

// AI money: half the balance for fees (nothing in debt); wages up to a season's expected income.
const room = c => Math.max(0, AI.room * c.fin.balance);
const wageRoom = (s, c, w) => (wageBill(c) + w) * 52 <= AI.wageShare * projection(s, c);
const aiWage = p => Math.max(wage(p), p.contract?.wage ?? 0);

const log = (s, p, from, to, fee, loan) => s.deals.push({ season: s.season, day: s.day, id: p.id, name: p.name, from: from?.id ?? null, to: to?.id ?? null, fee, loan });
function leave(s, p, list) {
  list.splice(list.indexOf(p), 1);
  delete p.listed;
  s.offers = s.offers.filter(o => o.id !== p.id);
}

// Moves p from club `from` (null: the free-agent list) to club `to` (null: released to the list) for
// `fee` (from null: his signing-on fee). The buyer pays, the seller is paid; the human club's transfer
// budget moves with its books. He signs his terms at the human club, his going rate at an AI club.
export function move(s, p, from, to, fee) {
  leave(s, p, from ? from.players : s.market);
  if (to) { to.fin.balance -= fee; to.fin.season.fees += fee; if (to.id === s.me) s.budget -= fee; }
  if (from) { from.fin.balance += fee; from.fin.season.sales += fee; if (from.id === s.me) s.budget += fee; }
  if (!to) { p.contract = null; s.market.push(p); }
  else {
    const start = s.season - (s.done ? 0 : 1); // a contract agreed after the last match day counts from next season
    const t = to.id === s.me ? terms(s, p) : { wage: aiWage(p), years: yearsFor(p.age), clause: null };
    p.contract = { wage: t.wage, until: start + t.years, clause: t.clause };
    p.joined = windowId(s);
    to.players.push(p);
  }
  log(s, p, from, to, fee, false);
  if (from?.id === s.me) fixLineup(s);
}

// p is lent by `from` to `to` to the end of the season (loanEnd): `to` pays LOAN_SHARE of his wage.
export const loanable = (s, c, p) => c.id !== s.me && !p.loan && p.age <= LOAN_AGE && !regular(c, p) && !justJoined(s, p) && p.contract.until > loanEnd(s);
export function lend(s, p, from, to) {
  leave(s, p, from.players);
  p.loan = { from: from.id, until: loanEnd(s), share: LOAN_SHARE };
  from.lentPay += lentPart(p);
  p.joined = windowId(s);
  to.players.push(p);
  log(s, p, from, to, 0, true);
  if (from.id === s.me) fixLineup(s);
}
// End of season s.season: loans ending now go home.
export function returnLoans(s) {
  for (const c of s.clubs) for (const p of [...c.players]) {
    if (!p.loan || p.loan.until > s.season) continue;
    const home = s.clubs[p.loan.from];
    c.players.splice(c.players.indexOf(p), 1);
    home.lentPay -= lentPart(p);
    delete p.loan;
    home.players.push(p);
  }
}

// ---- AI clubs, on match days in a window ----

const count = (c, pos) => c.players.reduce((n, p) => n + (p.pos === pos), 0);
const weakest = c => POS.reduce((w, pos) => bar(c, pos) < bar(c, w) ? pos : w);
const better = (a, b) => !b || overall(a) > overall(b);

// The best loan for AI club c at position pos at least `need` overall, or null.
function bestLoan(s, c, pos, need) {
  let best = null;
  for (const d of s.clubs) if (d !== c) for (const p of d.players)
    if (p.pos === pos && overall(p) >= need && better(p, best?.p) && loanable(s, d, p) && wageRoom(s, c, loanPay(p.contract.wage)) && !refusal(d, c, p)) best = { p, d };
  return best;
}

// A gap at pos: the best free agent there on no more than the club's median wage; else the best loan.
function replace(s, c, pos) {
  const wages = c.players.map(p => p.contract.wage).sort((a, b) => a - b), cap = wages[wages.length >> 1] ?? 0;
  let fa = null;
  for (const p of s.market) if (p.pos === pos && wage(p) <= cap && better(p, fa)) fa = p;
  if (fa) return move(s, fa, null, c, signingFee(fa));
  const l = bestLoan(s, c, pos, 0);
  if (l) lend(s, l.p, l.d, c);
}

// An upgrade at pos: the best affordable player 3+ overall above the club's bar there; else a loan.
// A squad over MAX_SQUAD releases its least valuable player.
function upgrade(s, c, pos) {
  const need = bar(c, pos) + AI.upgrade, money = room(c);
  let best = null;
  for (const d of s.clubs) {
    if (d === c || d.id === s.me || d.players.length <= MIN_SQUAD) continue;
    for (const p of d.players) {
      if (p.pos !== pos || p.loan || overall(p) < need || !better(p, best?.p) || justJoined(s, p)) continue;
      const fee = asking(s, d, p);
      if (fee <= money && wageRoom(s, c, aiWage(p)) && !refusal(d, c, p)) best = { p, d, fee };
    }
  }
  for (const p of s.market) {
    if (p.pos !== pos || overall(p) < need || !better(p, best?.p)) continue;
    const fee = signingFee(p);
    if (fee <= money && wageRoom(s, c, wage(p))) best = { p, d: null, fee };
  }
  if (best) move(s, best.p, best.d, c, best.fee);
  else { const l = bestLoan(s, c, pos, need); if (l) lend(s, l.p, l.d, c); }
  if (c.players.length > MAX_SQUAD) {
    const cut = c.players.filter(p => !p.loan).reduce((w, p) => value(p) < value(w) ? p : w);
    move(s, cut, c, null, 0);
  }
}

// The human club's players draw offers: a listed player often, anyone now and then (at most
// OFFER.perDay unsolicited a day). The bidder is the richest club he'd be a regular at. A loan
// listing is taken at once. A bigger club may pay a release clause: the player is gone.
function offersFor(s, rng) {
  const me = s.clubs[s.me], win = windowId(s);
  let unsolicited = 0;
  for (const p of [...me.players]) {
    if (p.loan || justJoined(s, p) || (!p.listed && unsolicited >= OFFER.perDay)) continue;
    if (rng.next() >= (p.listed ? OFFER.listed : OFFER.unsolicited)) continue;
    const ask = asking(s, me, p), loan = p.listed === 'loan';
    let buyer = null;
    for (const c of s.clubs) {
      if (c === me || c.players.length >= MAX_SQUAD || overall(p) < bar(c, p.pos) || refusal(me, c, p)) continue;
      if (loan ? !wageRoom(s, c, loanPay(p.contract.wage)) : room(c) < OFFER.low[0] * ask || !wageRoom(s, c, aiWage(p))) continue;
      if (!buyer || c.fin.balance > buyer.fin.balance) buyer = c;
    }
    if (!buyer) continue;
    if (loan) { lend(s, p, me, buyer); s.news.push({ type: 'loan', club: s.me, id: p.id, name: p.name, to: buyer.id }); continue; }
    const clause = p.contract.clause;
    if (clause && clause <= room(buyer) && buyer.quality > me.quality && rng.next() < OFFER.clause) {
      move(s, p, me, buyer, clause);
      s.news.push({ type: 'clause', club: s.me, id: p.id, name: p.name, to: buyer.id, fee: clause });
      continue;
    }
    const [lo, hi] = p.listed ? OFFER.low : OFFER.high, max = Math.min(room(buyer), round10k(OFFER.max * ask));
    const fee = Math.min(max, round10k(ask * (lo + (hi - lo) * rng.next())));
    if (s.offers.some(o => o.id === p.id && o.fee >= fee)) continue;
    s.offers = [...s.offers.filter(o => o.id !== p.id), { id: p.id, club: buyer.id, fee, max, win }];
    if (!p.listed) unsolicited++;
    s.news.push({ type: 'offer', club: s.me, id: p.id, name: p.name, from: buyer.id, fee });
  }
}

// A match day in a window. AI clubs in debt list their two best-paid players. Each AI club fills a
// gap (a position below MIN_POS, or a squad below MIN_SQUAD), else with chance AI.activity buys an
// upgrade at its weakest position. Then the human club's players draw offers.
export function marketDay(s, rng) {
  for (const c of s.clubs) if (c.id !== s.me) {
    for (const p of c.players) delete p.listed;
    if (c.fin.balance < 0) for (const p of c.players.filter(x => !x.loan).sort((a, b) => b.contract.wage - a.contract.wage).slice(0, 2)) p.listed = 'sale';
  }
  for (const c of s.clubs) {
    if (c.id === s.me) continue;
    const gap = POS.find(pos => count(c, pos) < MIN_POS[pos]) ?? (c.players.length < MIN_SQUAD ? weakest(c) : null);
    if (gap) replace(s, c, gap);
    else if (rng.next() < AI.activity) upgrade(s, c, weakest(c));
  }
  if (s.me !== null) offersFor(s, rng);
}
