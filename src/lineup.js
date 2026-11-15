import { POS, overall } from './player.js';
import { ROLES, fitSlots } from './tactics.js';
import { available, readiness } from './squad.js';

export const FORMATIONS = { '4-4-2': [1, 4, 4, 2], '4-3-3': [1, 4, 3, 3], '3-5-2': [1, 3, 5, 2], '5-3-2': [1, 5, 3, 2], '4-5-1': [1, 4, 5, 1] };
export const SLOT_WEIGHT = { GK: [0, 1.5], DF: [0, 1], MF: [0.5, 0.5], FW: [1, 0] }; // [attack, defence]

export const slots = f => FORMATIONS[f].flatMap((n, i) => Array(n).fill(POS[i]));
// How well a player fits a slot: rated by the role's attributes (the position's when no role), less out of position.
export const eff = (p, pos, role) => overall(p, pos, role ? ROLES[pos][role].w : undefined) * (p.pos === pos ? 1 : 0.85);

// How much a manager wants player p in a slot: his fit for it (rated by the position's default
// role), less when he is tired, out of form or unhappy. Injured and banned players only when
// nobody else is left. ponytail: no "too few fit players" rule.
const pickScore = (p, pos) => available(p) ? eff(p, pos) * (0.7 + 0.3 * p.cond / 100) * readiness(p) : -1;
function pickFor(club, pos, used) {
  let best = null;
  for (const p of club.players) if (!used.has(p.id) && (!best || pickScore(p, pos) > pickScore(best, pos))) best = p;
  used.add(best.id);
  return best.id;
}

// Greedy slot-by-slot pick.
export function bestXI(club, formation) {
  const used = new Set();
  return slots(formation).map(pos => pickFor(club, pos, used));
}

// Repairs the human club's matchday plan after a sale, an injury, a ban or a formation change:
// each XI slot holding a missing, unavailable or repeated player gets the best one left, the other
// slots stay; the bench keeps up to BENCH available squad players outside the XI (gaps filled by
// autoBench); slot tactics are made to fit.
export function fixLineup(s) {
  const club = s.clubs[s.me], pos = slots(s.formation), byId = new Map(club.players.map(p => [p.id, p])), used = new Set();
  const kept = pos.map((_, k) => {
    const p = byId.get(s.lineup[k]);
    if (!p || !available(p) || used.has(p.id)) return null;
    used.add(p.id);
    return p.id;
  });
  s.lineup = kept.map((id, k) => id ?? pickFor(club, pos[k], used));
  const bench = [...new Set(s.bench)].filter(id => byId.has(id) && available(byId.get(id)) && !s.lineup.includes(id));
  s.bench = [...bench, ...autoBench(club, [...s.lineup, ...bench])].slice(0, BENCH);
  s.tactics.slots = fitSlots(s.tactics.slots, pos);
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

// Matchday bench, from the available squad players not in `taken`: the best of each position first, then the best of the rest.
export const BENCH = 7;
export function autoBench(club, taken) {
  const rest = club.players.filter(p => !taken.includes(p.id) && available(p)).sort((a, b) => overall(b) - overall(a) || a.id - b.id);
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
