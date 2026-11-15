import { POS, overall } from './player.js';
import { ROLES, fitSlots } from './tactics.js';

export const FORMATIONS = { '4-4-2': [1, 4, 4, 2], '4-3-3': [1, 4, 3, 3], '3-5-2': [1, 3, 5, 2], '5-3-2': [1, 5, 3, 2], '4-5-1': [1, 4, 5, 1] };
export const SLOT_WEIGHT = { GK: [0, 1.5], DF: [0, 1], MF: [0.5, 0.5], FW: [1, 0] }; // [attack, defence]

export const slots = f => FORMATIONS[f].flatMap((n, i) => Array(n).fill(POS[i]));
// How well a player fits a slot: rated by the role's attributes (the position's when no role), less out of position.
export const eff = (p, pos, role) => overall(p, pos, role ? ROLES[pos][role].w : undefined) * (p.pos === pos ? 1 : 0.85);

// Greedy slot-by-slot pick, rated by each position's default role.
export function bestXI(club, formation) {
  const used = new Set();
  return slots(formation).map(pos => {
    let best = null;
    for (const p of club.players)
      if (!used.has(p.id) && (!best || eff(p, pos) > eff(best, pos))) best = p;
    used.add(best.id);
    return best.id;
  });
}

// Repairs the human club's matchday plan after a sale or a formation change: a valid XI, a bench of
// up to BENCH squad players outside the XI (gaps filled by autoBench), and slot tactics that fit.
export function fixLineup(s) {
  const club = s.clubs[s.me], ids = new Set(club.players.map(p => p.id));
  if (s.lineup.length !== 11 || new Set(s.lineup).size !== 11 || s.lineup.some(id => !ids.has(id)))
    s.lineup = bestXI(club, s.formation);
  const bench = [...new Set(s.bench)].filter(id => ids.has(id) && !s.lineup.includes(id));
  s.bench = [...bench, ...autoBench(club, [...s.lineup, ...bench])].slice(0, BENCH);
  s.tactics.slots = fitSlots(s.tactics.slots, slots(s.formation));
}

// Swaps two of the human club's players between XI slots, the bench and the reserves.
export function swap(s, a, b) {
  for (const list of [s.lineup, s.bench]) list.forEach((id, k) => { if (id === a) list[k] = b; else if (id === b) list[k] = a; });
}

export function strength(club, ids, formation) {
  const pos = slots(formation);
  let a = 0, aw = 0, d = 0, dw = 0;
  ids.forEach((id, i) => {
    const e = eff(club.players.find(p => p.id === id), pos[i]), [wa, wd] = SLOT_WEIGHT[pos[i]];
    a += e * wa; aw += wa; d += e * wd; dw += wd;
  });
  const bonus = formationBonus(formation);
  return { att: a / aw * bonus.att, def: d / dw * bonus.def };
}

// The formation edge (docs/fun-surprises.md #1): each forward beyond two adds 3% attack, each
// defender beyond four adds 3% defence. The match engine applies the same multipliers.
export function formationBonus(formation) {
  const [, nd, , nf] = FORMATIONS[formation];
  return { att: 1 + 0.03 * (nf - 2), def: 1 + 0.03 * (nd - 4) };
}

// Matchday bench, from the squad players not in `taken`: the best of each position first, then the best of the rest.
export const BENCH = 7;
export function autoBench(club, taken) {
  const rest = club.players.filter(p => !taken.includes(p.id)).sort((a, b) => overall(b) - overall(a) || a.id - b.id);
  const first = POS.map(pos => rest.find(p => p.pos === pos)).filter(Boolean);
  return [...first, ...rest.filter(p => !first.includes(p))].slice(0, BENCH).map(p => p.id);
}

// Formation familiarity, 0.5-1 per formation: AI clubs play 4-4-2, so a club you take over knows only that.
// Each match played in a shape teaches it; the others fade a little.
const FAM_GAIN = 0.1, FAM_LOSS = 0.02, FAM_MIN = 0.5;
export const newFam = () => Object.fromEntries(Object.keys(FORMATIONS).map(f => [f, f === '4-4-2' ? 1 : FAM_MIN]));
export function learnFam(fam, used) {
  for (const f in fam) fam[f] = Math.round(Math.min(1, Math.max(FAM_MIN, fam[f] + (f === used ? FAM_GAIN : -FAM_LOSS))) * 100) / 100;
}
