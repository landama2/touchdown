import { createPlayer, overall, WEIGHTS } from './player.js';
import { wage } from './finance.js';
import { coachScale } from './staff.js';

// The human club's youth squad, s.youth: players aged 15-18 outside the first team, on no contract
// and no wages, who play no matches. Each summer an intake of 2 + coaching level joins (at most
// YOUTH_MAX in all), at the club's quality - 3 plus the coaching level's step, with room to grow:
// their hidden potential sits 2-6 above their best key attribute. They train every week (growth
// only, scaled by coaching). Promote one to the first team on a starter contract, or release him;
// at 19 those still here leave. The first team's gap-filling academy players come from here first.
export const YOUTH_MAX = 20, YOUTH_YEARS = 3, LEAVE_AGE = 19;
const GROWTH = 0.15;                                   // chance per player per week, × coaching
const CEILING_WIDTH = [12, 9, 6, 4, 2];                // how sure your coaches are of a ceiling, by coaching level
const SHAPE = ['GK', 'DF', 'DF', 'MF', 'MF', 'FW'];

// The summer intake (also when you take a club).
export function intake(s, rng) {
  const c = s.clubs[s.me], level = c.staff.coaching, n = Math.min(2 + level, YOUTH_MAX - s.youth.length);
  for (let k = 0; k < n; k++) {
    const p = createPlayer(rng, s.nid++, rng.pick(SHAPE), c.quality - 3 + (level - 3), rng.int(15, 16));
    p.pot = Math.min(20, Math.max(...Object.keys(WEIGHTS[p.pos]).map(a => p.attrs[a])) + rng.int(2, 6));
    s.youth.push(p);
  }
  return n;
}

// `weeks` weeks of youth training: a key attribute up by 1 now and then, never above potential.
export function trainYouth(s, rng, weeks) {
  if (s.me === null) return;
  const chance = GROWTH * coachScale(s.clubs[s.me]);
  for (let w = 0; w < weeks; w++) for (const p of s.youth) {
    if (rng.next() >= chance) continue;
    const k = rng.pick(Object.keys(WEIGHTS[p.pos]));
    if (p.attrs[k] < p.pot) p.attrs[k]++;
  }
}

// The overall he would reach with every key attribute at his potential.
export const ceiling = p => overall({ ...p, attrs: Object.fromEntries(Object.entries(p.attrs).map(([k, v]) => [k, WEIGHTS[p.pos][k] ? Math.max(v, p.pot) : v])) });
// What your coaches can tell of it: a range as wide as your coaching level allows, holding the truth.
export function ceilingRange(s, p) {
  const w = CEILING_WIDTH[s.clubs[s.me].staff.coaching - 1], o = ceiling(p), off = ((p.id * 2654435761) >>> 0) % (w + 1);
  return [o - off, o - off + w];
}

const take = (s, p) => s.youth.splice(s.youth.indexOf(p), 1)[0];
const starter = (s, p) => ({ wage: wage(p), until: s.season + YOUTH_YEARS, clause: null });

// Moves youth player id into the first team on a starter contract. Error message or null.
export function promote(s, id, maxSquad) {
  const p = s.youth.find(x => x.id === id), c = s.clubs[s.me];
  if (!p) return 'Not in your youth squad.';
  if (c.players.length >= maxSquad) return `Squad is full (${maxSquad}).`;
  take(s, p).contract = starter(s, p);
  c.players.push(p);
  return null;
}
export function release(s, id) {
  const p = s.youth.find(x => x.id === id);
  if (!p) return 'Not in your youth squad.';
  take(s, p);
  return null;
}
// For the first team's gaps: the youth player with the best overall at pos, on a starter contract, or null.
export function fromYouth(s, pos) {
  const p = s.youth.filter(x => x.pos === pos).sort((a, b) => overall(b) - overall(a) || a.id - b.id)[0];
  if (!p) return null;
  take(s, p).contract = starter(s, p);
  return p;
}
// End of season: everyone a year older; those reaching LEAVE_AGE leave. Returns their names.
export function ageYouth(s) {
  for (const p of s.youth) p.age++;
  const gone = s.youth.filter(p => p.age >= LEAVE_AGE);
  s.youth = s.youth.filter(p => p.age < LEAVE_AGE);
  return gone.map(p => p.name);
}
