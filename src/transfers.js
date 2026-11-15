import { value } from './player.js';
import { fixLineup } from './lineup.js';
import { myClub } from './season.js';

export const MIN_SQUAD = 16, MAX_SQUAD = 32, SELL_RATE = 0.8;

// Only the human club trades in Phase 1. AI transfers arrive in Phase 7.
export function buy(s, id) {
  const i = s.market.findIndex(p => p.id === id), club = myClub(s);
  if (i < 0) return 'Player not available.';
  if (club.players.length >= MAX_SQUAD) return `Squad is full (${MAX_SQUAD}).`;
  const cost = value(s.market[i]);
  if (cost > s.budget) return 'Not enough budget.';
  s.budget -= cost;
  club.players.push(...s.market.splice(i, 1));
  return null;
}

export function sell(s, id) {
  const club = myClub(s), i = club.players.findIndex(p => p.id === id);
  if (i < 0) return 'Not your player.';
  if (club.players.length <= MIN_SQUAD) return `You need at least ${MIN_SQUAD} players.`;
  const [p] = club.players.splice(i, 1);
  s.budget += Math.round(value(p) * SELL_RATE);
  s.market.push(p);
  fixLineup(s);
  return null;
}
