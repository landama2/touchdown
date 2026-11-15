import { value } from './player.js';
import { fixLineup } from './lineup.js';
import { wageBill } from './finance.js';
import { terms } from './contracts.js';

export const MIN_SQUAD = 16, MAX_SQUAD = 32, SELL_RATE = 0.8;

// Only the human club trades until Phase 7. A free agent costs his value as a fee and joins on his
// terms. ponytail: a free signing that could be sold straight on at 80% would print money; Phase 7's
// market replaces the fee rule.
export function buy(s, id) {
  const i = s.market.findIndex(p => p.id === id), club = s.clubs[s.me];
  if (i < 0) return 'Player not available.';
  if (club.players.length >= MAX_SQUAD) return `Squad is full (${MAX_SQUAD}).`;
  const p = s.market[i], cost = value(p), t = terms(s, p);
  if (cost > s.budget) return 'Not enough transfer budget.';
  if (wageBill(club) + t.wage > s.wageBudget) return 'Over the wage budget.';
  s.budget -= cost; club.fin.balance -= cost; club.fin.season.fees += cost;
  p.contract = { wage: t.wage, until: s.season + t.years - 1, clause: t.clause };
  club.players.push(...s.market.splice(i, 1));
  return null;
}

export function sell(s, id) {
  const club = s.clubs[s.me], i = club.players.findIndex(p => p.id === id);
  if (i < 0) return 'Not your player.';
  if (club.players.length <= MIN_SQUAD) return `You need at least ${MIN_SQUAD} players.`;
  const [p] = club.players.splice(i, 1), price = Math.round(value(p) * SELL_RATE);
  s.budget += price; club.fin.balance += price; club.fin.season.sales += price;
  p.contract = null;
  s.market.push(p);
  fixLineup(s);
  return null;
}
