import { ATTRS, ALL_ATTRS, WEIGHTS, growFactor, declineAge } from './player.js';
import { injure } from './squad.js';
import { has } from './tactics.js';
import { coachScale, medicalScale } from './staff.js';

// Training. Every club has a weekly schedule, a focus and an intensity; AI clubs keep the default.
// The human club can also give any player an individual focus (one attribute) and an individual
// intensity (t.load: Light, Normal, Hard or Rest; absent = the team's intensity).
// Each week a fit player raises one attribute by 1 with chance GROWTH × his intensity's grow factor ×
// ageGrow(age): about 4 a season at Normal for 23 and under, tapering to about 0.4 from 31. Never above
// his hidden potential `pot`: half the time his individual focus, otherwise one from the team focus
// (keepers: always their position's key attributes). Players aged 31 and over lose a physical point
// now and then, whatever the schedule (legends from 33, and they grow faster: growFactor in player.js). Training can injure, Hard more often, Light less, a personal
// Rest never. The club's coaching staff scale growth, its medical staff the length of injuries (src/staff.js).
export const FOCUS = {
  Balanced: null, // the position's key attributes (WEIGHTS in player.js)
  Attacking: ['finishing', 'dribbling', 'firstTouch', 'crossing', 'composure'],
  Defending: ['tackling', 'positioning', 'heading', 'strength', 'decisions'],
  Technical: ['passing', 'firstTouch', 'dribbling', 'vision', 'crossing'],
  Physical: ATTRS.physical,
  Rest: [],       // nobody improves; condition comes back REST_RECOVER a day faster
};
// grow: × the growth chance; recover: condition regained per day; injury: × the training-injury chance. (tuned in Phase 5: a full match takes about a week to recover)
export const INTENSITY = { Light: { grow: 0.7, recover: 6, injury: 0.5 }, Normal: { grow: 1, recover: 5, injury: 1 }, Hard: { grow: 1.3, recover: 3, injury: 2.5 } };
const REST = { grow: 0, recover: 6, injury: 0 }; // a personal Rest: no growth, no training injuries, Light's recovery + REST_RECOVER
export const LOADS = [...Object.keys(INTENSITY), 'Rest'];
const GROWTH = 0.1, DECLINE = 0.05, INJURY = 0.004, REST_RECOVER = 2; // chances per player per week

// ponytail: a linear taper with a floor; tune in Phase 12.
export const ageGrow = age => age <= 23 ? 1 : Math.max(0.1, 0.7 - 0.08 * (age - 23));

export const defaultTraining = () => ({ focus: 'Balanced', intensity: 'Normal', ind: {}, load: {} });
const AI_TRAINING = Object.freeze({ ...defaultTraining(), ind: Object.freeze({}), load: Object.freeze({}) });
export const trainingOf = (s, club) => club.id === s.me ? s.training : AI_TRAINING;
const loadOf = (t, p) => (p && t.load?.[p.id]) || t.intensity;
const intensityOf = (t, p) => loadOf(t, p) === 'Rest' ? REST : INTENSITY[loadOf(t, p)];
// Condition regained per day by player p (left out: the team's rate). Rest, the team's or his own, adds REST_RECOVER.
export const recoverRate = (t, p) => intensityOf(t, p).recover + (t.focus === 'Rest' || loadOf(t, p) === 'Rest' ? REST_RECOVER : 0);

// ponytail: a pick at the cap is lost, not re-rolled (fun surprise #10).
function raise(rng, p, t) {
  const own = t.ind[p.id], team = p.pos === 'GK' || !FOCUS[t.focus] ? Object.keys(WEIGHTS[p.pos]) : FOCUS[t.focus];
  const k = own && rng.next() < 0.5 ? own : rng.pick(team);
  if (p.attrs[k] < p.pot) { p.attrs[k]++; p.gain++; }
}

// One week of training for `club` under schedule t. Injured players sit it out. Returns the players injured in training.
export function trainWeek(rng, club, t) {
  const hurt = [], grow = GROWTH * coachScale(club), heal = medicalScale(club);
  for (const p of club.players) {
    if (p.inj) continue;
    const I = intensityOf(t, p);
    if (rng.next() < INJURY * I.injury) { injure(rng, p, heal); hurt.push(p); continue; }
    if (t.focus !== 'Rest' && rng.next() < grow * I.grow * ageGrow(p.age) * growFactor(p)) raise(rng, p, t);
    if (p.age >= declineAge(p) && rng.next() < DECLINE) { const k = rng.pick(ATTRS.physical); p.attrs[k] = Math.max(1, p.attrs[k] - 1); }
  }
  return hurt;
}

// Setters return an error message, or null when the change is made.
export function setTraining(s, field, v) {
  if (!(field === 'focus' ? has(FOCUS, v) : field === 'intensity' && has(INTENSITY, v))) return 'Unknown training setting.';
  s.training[field] = v;
  return null;
}

// attr: an attribute key, or null for "train with the team".
export function setFocus(s, id, attr) {
  if (!s.clubs[s.me].players.some(p => p.id === id) || (attr !== null && !ALL_ATTRS.includes(attr))) return 'Unknown training focus.';
  if (attr === null) delete s.training.ind[id]; else s.training.ind[id] = attr;
  return null;
}

// v: one of LOADS, or null for "train at the team's intensity".
export function setLoad(s, id, v) {
  if (!s.clubs[s.me].players.some(p => p.id === id) || (v !== null && !LOADS.includes(v))) return 'Unknown training intensity.';
  if (v === null) delete s.training.load[id]; else s.training.load[id] = v;
  return null;
}
