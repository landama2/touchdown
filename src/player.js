import { FIRST, LAST } from './data/names.js';

export const POS = ['GK', 'DF', 'MF', 'FW'];
export const RETIRE_AGE = 35; // a player this old or older retires when the season ends

// Legends (src/legends.js): p.legend = 'star' | 'great' | 'icon'. They grow faster and decline later.
export const LEGEND_GROW = { star: 2, great: 2, icon: 2 };
export const growFactor = p => p.legend ? LEGEND_GROW[p.legend] : 1;
export const declineAge = p => p.legend ? 33 : 31; // physical decline from this age
export const displayName = p => p.legend ? `${p.name} ★` : p.name;
// The season a player joining a club now first plays for it (after the last match day: next season's).
export const joinSeason = s => s.season + (s.done ? 1 : 0);
export const ATTRS = {
  technical: ['passing', 'dribbling', 'finishing', 'tackling', 'heading', 'firstTouch', 'crossing'],
  mental: ['vision', 'positioning', 'composure', 'workRate', 'decisions', 'aggression'],
  physical: ['pace', 'stamina', 'strength', 'agility'],
  goalkeeping: ['handling', 'reflexes'],
};
export const ALL_ATTRS = Object.values(ATTRS).flat();
// What age takes from 31 on: the body for outfield players; a keeper's reflexes and agility (Phase 12: physical
// decline barely touched a keeper's overall, so keepers outlasted the forwards and goals fell over the seasons).
export const ageing = p => p.pos === 'GK' ? ['reflexes', 'agility'] : ATTRS.physical;

// How much each attribute matters for a position. Drives overall(), and with it team strength and selection.
// Rebalanced 2026-11-24 to follow the match engine (src/match.js). The overall feeds team attack, defence and control,
// so every key attribute counts there; the attributes the engine also reads directly weigh more on top:
// a keeper's saves are handling + reflexes alone (one point of either moves goals against about 2%, ~8 times what
// the same point does through team strength), so they carry most of his overall; every shot's quality is
// finishing + composure, so a forward's weigh more, and midfielders (about 40% of a side's shots) now count them too.
export const WEIGHTS = {
  GK: { handling: 5, reflexes: 5, positioning: 1, agility: 1 },
  DF: { tackling: 3, positioning: 3, heading: 2, strength: 2, pace: 1, decisions: 1 },
  MF: { passing: 3, vision: 2, firstTouch: 2, workRate: 2, stamina: 2, decisions: 2, tackling: 1, finishing: 1, composure: 1 },
  FW: { finishing: 4, composure: 3, dribbling: 2, pace: 2, firstTouch: 2, heading: 1 },
};
// How a generated player of each position is shaped: these attributes sit weight - 1 above the club's quality, the
// rest 3 below. The overall's weights before the 2026-11-24 rebalance, kept so the rebalance changes how players are
// rated (and picked), not what the world's players are: the engine's calibration (goals, home wins) rests on them.
export const PROFILE = {
  GK: { handling: 3, reflexes: 3, positioning: 2, agility: 1, composure: 1 },
  DF: WEIGHTS.DF,
  MF: { passing: 3, vision: 2, firstTouch: 2, workRate: 2, stamina: 2, decisions: 2, tackling: 1 },
  FW: { finishing: 3, dribbling: 2, pace: 2, composure: 2, firstTouch: 2, heading: 1 },
};
// Legends' signature attributes (p.sig, src/legends.js) grow past the usual 20, up to SIG_MAX; any other attribute
// that matters for his position stops at his potential p.pot.
export const SIG_MAX = 22;
export const capOf = (p, k) => p.sig?.includes(k) ? SIG_MAX : p.pot;
// The attributes growth picks from: the position's key attributes, and a legend's signature ones.
export const growKeys = p => p.sig ? [...new Set([...Object.keys(WEIGHTS[p.pos]), ...p.sig])] : Object.keys(WEIGHTS[p.pos]);

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Squad-dynamics fields every player carries (their meaning is in src/squad.js). A fresh player
// plays exactly as strong as his attributes say.
export const freshState = () => ({ cond: 100, sharp: 100, morale: 50, form: [], yc: 0, ban: 0, inj: null, gain: 0 });

export function createPlayer(rng, id, pos, quality, age = rng.int(17, 34)) {
  const attrs = {};
  for (const k of ALL_ATTRS) {
    const w = PROFILE[pos][k];
    // Attributes that matter for the position sit above the club's quality; the rest sit below.
    attrs[k] = clamp(Math.round(quality + (w ? w - 1 : -3) + rng.int(-3, 3)), 1, 20);
  }
  const best = Math.max(...Object.keys(WEIGHTS[pos]).map(k => attrs[k]));
  const pot = clamp(best + (age < 23 ? rng.int(0, 2) : 0), 1, 20);
  return { id, name: rng.pick(FIRST) + ' ' + rng.pick(LAST), pos, age, attrs, pot, ...freshState(), contract: null };
}

export function overall(p, pos = p.pos, w = WEIGHTS[pos]) {
  let sum = 0, total = 0;
  for (const k in w) { sum += p.attrs[k] * w[k]; total += w[k]; }
  return Math.round(sum / total * 5);
}

// Transfer value in euros at real-world scale: about €0.45M at overall 50 (a League One regular),
// €10M at 76, €78M at 93; ×1.3 under 24, ×0.6 over 30. Rounded to €10k, never below €10k. A grown legend rates past
// 100 (SIG_MAX): he is priced as a 100, about €180M (€240M young), or the curve would ask half a billion.
const VALUE = { at50: 0.45e6, growth: 0.12, top: 100 };
export function valueAt(ovr, age) {
  const ageFactor = age < 24 ? 1.3 : age > 30 ? 0.6 : 1;
  return Math.max(10e3, Math.round(VALUE.at50 * Math.exp(VALUE.growth * (Math.min(ovr, VALUE.top) - 50)) * ageFactor / 1e4) * 1e4);
}
export const value = p => valueAt(overall(p), p.age);

// Called once per player at season rollover. `pot` caps the attributes that matter for the position (capOf).
export function ageOneYear(rng, p) {
  p.age++;
  if (p.age <= 23) {
    const keys = growKeys(p);
    for (let i = 0; i < Math.round(4 * growFactor(p)); i++) { const k = rng.pick(keys); if (p.attrs[k] < capOf(p, k)) p.attrs[k]++; }
  }
  if (p.age >= declineAge(p)) {
    for (let i = 0; i < 2; i++) { const k = rng.pick(ageing(p)); p.attrs[k] = Math.max(1, p.attrs[k] - 1); }
  }
}
