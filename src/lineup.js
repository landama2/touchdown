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
// nobody else is left (all: as if everyone were available). ponytail: no "too few fit players" rule.
const pickScore = (p, pos, all) => all || available(p) ? eff(p, pos) * (0.7 + 0.3 * p.cond / 100) * readiness(p) : -1;
function pickFor(club, pos, used, all) {
  let best = null;
  for (const p of club.players) if (!used.has(p.id) && (!best || pickScore(p, pos, all) > pickScore(best, pos, all))) best = p;
  used.add(best.id);
  return best.id;
}

// Greedy slot-by-slot pick.
export function bestXI(club, formation, all = false) {
  const used = new Set();
  return slots(formation).map(pos => pickFor(club, pos, used, all));
}

// The human club's Auto-pick: the best XI and bench as if everyone were fit, then fixLineup gives
// the injured and banned stand-ins, and their places back when they return.
export function autoPick(s) {
  const club = s.clubs[s.me];
  s.cover = {};
  s.lineup = bestXI(club, s.formation, true);
  s.bench = autoBench(club, s.lineup, [], true);
  fixLineup(s);
}

// Repairs the human club's matchday plan after a sale, an injury, a ban or a formation change:
// each XI slot holding a missing, unavailable or repeated player gets the best one left, the other
// slots stay; the bench keeps up to BENCH available squad players outside the XI (gaps filled by
// autoBench); slot tactics are made to fit. s.cover remembers whose place a stand-in took (key: XI
// slot index, or 'b' + bench index); once that player is fit and free again he gets it back.
export function fixLineup(s) {
  const club = s.clubs[s.me], pos = slots(s.formation), byId = new Map(club.players.map(p => [p.id, p])), used = new Set();
  const cover = s.cover ??= {};
  for (const [k, id] of Object.entries(cover)) {
    const p = byId.get(id);
    if (p && !available(p)) continue;
    delete cover[k];
    if (p && !s.lineup.includes(id) && !s.bench.includes(id)) (k[0] === 'b' ? s.bench : s.lineup)[+k.replace('b', '')] = id;
  }
  const keep = (id, k) => {
    const p = byId.get(id);
    if (p && !available(p) && !used.has(id)) cover[k] ??= id;
    if (!p || !available(p) || used.has(id)) return null;
    used.add(id);
    return id;
  };
  s.lineup = pos.map((_, k) => keep(s.lineup[k], k)).map((id, k) => id ?? pickFor(club, pos[k], used));
  const bench = Array.from(s.bench, (id, k) => keep(id, 'b' + k)), fill = autoBench(club, [...used], bench.filter(id => id !== null));
  s.bench = [...bench.map(id => id ?? fill.shift()), ...fill].filter(id => id !== undefined).slice(0, BENCH);
  s.tactics.slots = fitSlots(s.tactics.slots, pos);
}

// Swaps two of the human club's players between XI slots, the bench and the reserves. A player the
// manager moves himself is no longer waiting for his old place.
export function swap(s, a, b) {
  for (const list of [s.lineup, s.bench]) list.forEach((id, k) => { if (id === a) list[k] = b; else if (id === b) list[k] = a; });
  for (const k in s.cover ?? {}) if (s.cover[k] === a || s.cover[k] === b) delete s.cover[k];
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

// Matchday bench, from the available squad players (all: everyone) not in `taken`, to join `have`
// (already on the bench): the best of each position missing from it first, then the best of the
// rest, never a second keeper.
export const BENCH = 7;
export function autoBench(club, taken, have = [], all = false) {
  const posOf = id => club.players.find(p => p.id === id)?.pos;
  const rest = club.players.filter(p => !taken.includes(p.id) && !have.includes(p.id) && (all || available(p))).sort((a, b) => overall(b) - overall(a) || a.id - b.id);
  const first = POS.filter(x => !have.some(id => posOf(id) === x)).map(x => rest.find(p => p.pos === x)).filter(Boolean);
  const keeper = have.some(id => posOf(id) === 'GK') || first.some(p => p.pos === 'GK');
  return [...first, ...rest.filter(p => !first.includes(p) && !(keeper && p.pos === 'GK'))].slice(0, BENCH - have.length).map(p => p.id);
}

// Formation familiarity, 0.5-1 per formation: AI clubs play 4-4-2, so a club you take over knows only that.
// Each match played in a shape teaches it; the others fade a little.
const FAM_GAIN = 0.1, FAM_LOSS = 0.02, FAM_MIN = 0.5;
export const newFam = () => Object.fromEntries(Object.keys(FORMATIONS).map(f => [f, f === '4-4-2' ? 1 : FAM_MIN]));
export function learnFam(fam, used) {
  for (const f in fam) fam[f] = Math.round(Math.min(1, Math.max(FAM_MIN, fam[f] + (f === used ? FAM_GAIN : -FAM_LOSS))) * 100) / 100;
}
