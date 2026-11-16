import { createPlayer, overall, value } from './player.js';
import { wage, wageBill, staffBill } from './finance.js';

// Contracts. p.contract = { wage (euros a week), until (the last season it covers), clause (release
// clause in euros, or null) }; free agents have none. A contract ends after season `until`.
// Talks are one-shot: your player names his terms, and you accept them or let him go when his
// contract ends. AI clubs renew every contract that ends at the player's going rate.
// Release clauses are stored and shown; clubs can pay them from Phase 7.
const CLAUSE = { above: 5, times: 2 }; // 5+ overall above your best XI's average: a clause of twice his value
const ACADEMY_YEARS = 3;

export const yearsFor = age => age <= 23 ? 5 : age <= 29 ? 4 : age <= 32 ? 2 : 1;
// A new world's contracts: the going rate, ending 0-3 seasons after `season`, staggered by id (no RNG).
export const startContract = (p, season) => ({ wage: wage(p), until: season + p.id % 4, clause: null });

const roundWage = x => Math.round(x / 500) * 500;
const xiAverage = club => { const o = club.players.map(p => overall(p)).sort((a, b) => b - a).slice(0, 11); return o.reduce((t, x) => t + x, 0) / o.length; };

// What player p asks to sign for, or to stay at, the human club: his going rate (×1.25 when unhappy,
// ×0.9 when happy, never less than he earns now), years by age, and a release clause if he would be a star there.
export function terms(s, p) {
  const ask = roundWage(wage(p) * (p.morale < 40 ? 1.25 : p.morale >= 80 ? 0.9 : 1));
  const star = overall(p) >= xiAverage(s.clubs[s.me]) + CLAUSE.above;
  return { wage: Math.max(p.contract?.wage ?? 0, ask), years: yearsFor(p.age), clause: star ? Math.round(CLAUSE.times * value(p) / 1e5) * 1e5 : null };
}

export const canRenew = (s, p) => !!p.contract && !p.loan && p.contract.until <= s.season + 1 && s.season + yearsFor(p.age) > p.contract.until;

// Accepts the terms of the human club's player `id`: the new terms apply now and the contract runs to
// `season + years`. A raise must fit the wage budget; the same wage always does. Error message or null.
export function renew(s, id) {
  const club = s.clubs[s.me], p = club.players.find(x => x.id === id);
  if (!p) return 'Not your player.';
  if (p.loan) return `${p.name} is on loan here.`;
  if (!canRenew(s, p)) return 'He has more than a season left on his contract.';
  const t = terms(s, p);
  if (t.wage > p.contract.wage && wageBill(club) + staffBill(s, club) - p.contract.wage + t.wage > s.wageBudget) return 'Over the wage budget.';
  p.contract = { wage: t.wage, until: s.season + t.years, clause: t.clause };
  return null;
}

// A 17-19-year-old from club c's academy, on a starter contract.
export function academy(s, rng, c, pos) {
  const p = createPlayer(rng, s.nid++, pos, c.quality - 2, rng.int(17, 19));
  p.contract = { wage: wage(p), until: s.season + ACADEMY_YEARS, clause: null };
  return p;
}

// End of season s.season (before the season number moves on): contracts ending now. AI clubs renew
// them; the human club's players leave for the free-agent list. If that leaves the squad below
// minSquad, academy players in the leavers' positions fill the gap. Returns the leavers' names.
export function expireContracts(s, rng, minSquad) {
  const left = [];
  for (const c of s.clubs) for (const p of [...c.players]) {
    if (!p.contract || p.contract.until > s.season) continue;
    if (c.id !== s.me) { p.contract = { wage: wage(p), until: s.season + yearsFor(p.age), clause: null }; continue; }
    c.players.splice(c.players.indexOf(p), 1);
    p.contract = null;
    s.market.push(p);
    left.push(p);
  }
  if (s.me !== null) for (const p of left) if (s.clubs[s.me].players.length < minSquad) s.clubs[s.me].players.push(academy(s, rng, s.clubs[s.me], p.pos));
  return left.map(p => p.name);
}
