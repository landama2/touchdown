import { FIRST, LAST } from './data/names.js';

export const POS = ['GK', 'DF', 'MF', 'FW'];
export const RETIRE_AGE = 35; // a player this old or older retires when the season ends
export const ATTRS = {
  technical: ['passing', 'dribbling', 'finishing', 'tackling', 'heading', 'firstTouch', 'crossing'],
  mental: ['vision', 'positioning', 'composure', 'workRate', 'decisions', 'aggression'],
  physical: ['pace', 'stamina', 'strength', 'agility'],
  goalkeeping: ['handling', 'reflexes'],
};
export const ALL_ATTRS = Object.values(ATTRS).flat();

// How much each attribute matters for a position. Drives overall() and generation bias.
export const WEIGHTS = {
  GK: { handling: 3, reflexes: 3, positioning: 2, agility: 1, composure: 1 },
  DF: { tackling: 3, positioning: 3, heading: 2, strength: 2, pace: 1, decisions: 1 },
  MF: { passing: 3, vision: 2, firstTouch: 2, workRate: 2, stamina: 2, decisions: 2, tackling: 1 },
  FW: { finishing: 3, dribbling: 2, pace: 2, composure: 2, firstTouch: 2, heading: 1 },
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Squad-dynamics fields every player carries (their meaning is in src/squad.js). A fresh player
// plays exactly as strong as his attributes say.
export const freshState = () => ({ cond: 100, sharp: 100, morale: 50, form: [], yc: 0, ban: 0, inj: null, gain: 0 });

export function createPlayer(rng, id, pos, quality, age = rng.int(17, 34)) {
  const attrs = {};
  for (const k of ALL_ATTRS) {
    const w = WEIGHTS[pos][k];
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
// €10M at 76, €78M at 93; ×1.3 under 24, ×0.6 over 30. Rounded to €10k, never below €10k.
const VALUE = { at50: 0.45e6, growth: 0.12 };
export function valueAt(ovr, age) {
  const ageFactor = age < 24 ? 1.3 : age > 30 ? 0.6 : 1;
  return Math.max(10e3, Math.round(VALUE.at50 * Math.exp(VALUE.growth * (ovr - 50)) * ageFactor / 1e4) * 1e4);
}
export const value = p => valueAt(overall(p), p.age);

// Called once per player at season rollover. `pot` caps the attributes that matter for the position.
export function ageOneYear(rng, p) {
  p.age++;
  if (p.age <= 23) {
    const keys = Object.keys(WEIGHTS[p.pos]);
    for (let i = 0; i < 4; i++) { const k = rng.pick(keys); if (p.attrs[k] < p.pot) p.attrs[k]++; }
  }
  if (p.age >= 31) {
    for (let i = 0; i < 2; i++) { const k = rng.pick(ATTRS.physical); p.attrs[k] = Math.max(1, p.attrs[k] - 1); }
  }
}
