import { value } from './player.js';
import { wageBill, staffBill } from './finance.js';
import { terms } from './contracts.js';
import { MIN_SQUAD, MAX_SQUAD, FLOOR, WALKAWAY, ROUNDS, QUICK_SALE, MAX_LOANS, LOAN_AGE, round10k, eur, windowOpen, windowId, justJoined,
  loanEnd, loanPay, asking, signingFee, refusal, move, lend, loanable } from './market.js';

export { MIN_SQUAD, MAX_SQUAD };

// The human club's side of the market. Every action returns an error message, or null when done.
// Club-to-club deals and loans need an open window; free agents sign at any time.

const CLOSED = 'The transfer window is closed.';
const mine = (s, id) => s.clubs[s.me].players.find(p => p.id === id);
// A player at an AI club: { p, c }, or null.
function atClub(s, id) {
  for (const c of s.clubs) if (c.id !== s.me) { const p = c.players.find(x => x.id === id); if (p) return { p, c }; }
  return null;
}
const overWages = (s, extra) => wageBill(s.clubs[s.me]) + staffBill(s, s.clubs[s.me]) + extra > s.wageBudget; // staff beyond the standard count too
// Why the human club can't take p on now (any deal), or null.
function cannotTake(s, p) {
  if (s.clubs[s.me].players.length >= MAX_SQUAD) return `Squad is full (${MAX_SQUAD}).`;
  if (p.loan) return `${p.name} is on loan.`;
  if (justJoined(s, p)) return `${p.name} only just joined his club.`;
  return null;
}
// Why the human club can't let its player p go now, or null.
function cannotLose(s, p) {
  if (!p) return 'Not your player.';
  if (p.loan) return `${p.name} is on loan here.`;
  if (justJoined(s, p)) return `${p.name} only just joined: wait for the next window.`;
  if (s.clubs[s.me].players.length <= MIN_SQUAD) return `You need at least ${MIN_SQUAD} players.`;
  return null;
}

// Free agents: a signing-on fee (half his value) from the transfer budget, his terms within the wage budget.
export function buy(s, id) {
  const p = s.market.find(x => x.id === id), club = s.clubs[s.me];
  if (!p) return 'Player not available.';
  const no = cannotTake(s, p);
  if (no) return no;
  if (signingFee(p) > s.budget) return 'Not enough transfer budget.';
  if (overWages(s, terms(s, p).wage)) return 'Over the wage budget.';
  move(s, p, null, club, signingFee(p));
  return null;
}

// Talks with an AI club in this window: { rounds, counter } for player id.
function talks(s, id) {
  const win = windowId(s);
  if (s.talks.win !== win) s.talks = { win, by: {} };
  return s.talks.by[id] ??= { rounds: 0, counter: null };
}
export const talksOn = (s, id) => s.talks.win === windowId(s) ? s.talks.by[id] ?? null : null;

// A bid of `fee` for a player at an AI club. Accepted at once when it reaches his release clause,
// FLOOR of the asking price, or the club's last counter; then he signs his terms. Otherwise it is a
// round of talks: from WALKAWAY of the asking price up the club counters halfway between bid and
// asking price (never below FLOOR), lower bids are rejected. After ROUNDS rounds talks stop until
// the next window. Returns null when he signs, else a message.
export function bid(s, id, fee) {
  if (!windowOpen(s)) return CLOSED;
  const at = atClub(s, id);
  if (!at) return 'Player not available.';
  const { p, c } = at, me = s.clubs[s.me];
  fee = round10k(fee);
  const no = cannotTake(s, p) ?? refusal(c, me, p, s.career?.rep);
  if (no) return no;
  if (c.players.length <= MIN_SQUAD) return `${c.name} won't sell: they need every player.`;
  if (fee > s.budget) return 'Not enough transfer budget.';
  if (overWages(s, terms(s, p).wage)) return 'Over the wage budget.';
  const t = talks(s, id), ask = asking(s, c, p);
  if ((p.contract.clause && fee >= p.contract.clause) || fee >= round10k(FLOOR * ask) || (t.counter && fee >= t.counter)) {
    move(s, p, c, me, fee);
    return null;
  }
  if (t.rounds >= ROUNDS) return `${c.name} have stopped talking about ${p.name} until the next window.`;
  t.rounds++;
  t.counter = fee >= WALKAWAY * ask ? Math.max(round10k((fee + ask) / 2), round10k(FLOOR * ask)) : t.counter;
  const left = ROUNDS - t.rounds, more = left ? ` ${left} round${left > 1 ? 's' : ''} of talks left.` : ' Talks are over for this window.';
  return (fee >= WALKAWAY * ask ? `${c.name} want ${eur(t.counter)} for ${p.name}.` : `${c.name} rejected the bid.`) + more;
}
// Pays the club's last counter-offer.
export function acceptCounter(s, id) {
  const t = talksOn(s, id);
  return t?.counter ? bid(s, id, t.counter) : 'There is no counter-offer.';
}

// A season-long loan from an AI club: a young player who is not one of his club's regulars; you pay half his wage.
export function loanIn(s, id) {
  if (!windowOpen(s)) return CLOSED;
  const at = atClub(s, id);
  if (!at) return 'Player not available.';
  const { p, c } = at, me = s.clubs[s.me];
  const no = cannotTake(s, p) ?? (loanable(s, c, p) ? refusal(c, me, p, s.career?.rep) : `${c.name} won't lend ${p.name}.`);
  if (no) return no;
  if (me.players.filter(x => x.loan).length >= MAX_LOANS) return `You can have at most ${MAX_LOANS} players on loan.`;
  if (overWages(s, loanPay(p.contract.wage))) return 'Over the wage budget.';
  lend(s, p, c, me);
  return null;
}

// Quick sale to whichever club in reach pays QUICK_SALE of his value at once: the richest AI club
// within a division of yours that can afford it and that he'd join.
export function sell(s, id) {
  if (!windowOpen(s)) return CLOSED;
  const me = s.clubs[s.me], p = mine(s, id), no = cannotLose(s, p);
  if (no) return no;
  const price = round10k(QUICK_SALE * value(p));
  let buyer = null;
  for (const c of s.clubs)
    if (c !== me && Math.abs(c.div - me.div) <= 1 && c.players.length < MAX_SQUAD && c.fin.balance / 2 >= price && !refusal(me, c, p) && (!buyer || c.fin.balance > buyer.fin.balance)) buyer = c;
  if (!buyer) return `No club will pay ${eur(price)} for ${p.name} today.`;
  move(s, p, me, buyer, price);
  return null;
}

// Transfer list: 'sale' (AI clubs bid, more often and lower), 'loan' (an AI club that would play him
// takes him on loan; aged 23 or under, contract beyond this season) or null (off the list).
export function setListing(s, id, kind) {
  const p = mine(s, id);
  if (!p) return 'Not your player.';
  if (p.loan) return `${p.name} is on loan here.`;
  if (kind === 'loan' && (p.age > LOAN_AGE || p.contract.until <= loanEnd(s))) return `Only players aged ${LOAN_AGE} or under with more than the loan left on their contract can go out on loan.`;
  if (kind) p.listed = kind; else delete p.listed;
  return null;
}

export function acceptOffer(s, id) {
  const o = s.offers.find(x => x.id === id), p = mine(s, id);
  if (!o) return 'That offer has gone.';
  const no = cannotLose(s, p);
  if (no) return no;
  move(s, p, s.clubs[s.me], s.clubs[o.club], o.fee);
  return null;
}
export function rejectOffer(s, id) { s.offers = s.offers.filter(o => o.id !== id); return null; }
// Ask an AI bidder for `fee`: up to the most it will pay it agrees at once, above that it walks away.
export function counterOffer(s, id, fee) {
  const o = s.offers.find(x => x.id === id), p = mine(s, id);
  if (!o) return 'That offer has gone.';
  fee = round10k(fee);
  if (fee <= o.fee) return acceptOffer(s, id);
  const no = cannotLose(s, p);
  if (no) return no;
  if (fee > o.max) { rejectOffer(s, id); return `${s.clubs[o.club].name} walked away.`; }
  move(s, p, s.clubs[s.me], s.clubs[o.club], fee);
  return null;
}
