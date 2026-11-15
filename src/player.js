import { FIRST, LAST } from './data/names.js';

export const POS = ['GK', 'DF', 'MF', 'FW'];
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

export function createPlayer(rng, id, pos, quality, age = rng.int(17, 34)) {
  const attrs = {};
  for (const k of ALL_ATTRS) {
    const w = WEIGHTS[pos][k];
    // Attributes that matter for the position sit above the club's quality; the rest sit below.
    attrs[k] = clamp(Math.round(quality + (w ? w - 1 : -3) + rng.int(-3, 3)), 1, 20);
  }
  const best = Math.max(...Object.keys(WEIGHTS[pos]).map(k => attrs[k]));
  const pot = clamp(best + (age < 23 ? rng.int(0, 2) : 0), 1, 20);
  return { id, name: rng.pick(FIRST) + ' ' + rng.pick(LAST), pos, age, attrs, pot };
}

export function overall(p, pos = p.pos, w = WEIGHTS[pos]) {
  let sum = 0, total = 0;
  for (const k in w) { sum += p.attrs[k] * w[k]; total += w[k]; }
  return Math.round(sum / total * 5);
}

export function value(p) {
  const ageFactor = p.age < 24 ? 1.3 : p.age > 30 ? 0.6 : 1;
  return Math.round((overall(p) / 10) ** 4 * ageFactor) * 1000;
}

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
