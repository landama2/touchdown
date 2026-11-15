import { ATTRS, ALL_ATTRS, WEIGHTS } from './player.js';
import { injure } from './squad.js';
import { has } from './tactics.js';

// Training. Every club has a weekly schedule, a focus and an intensity; AI clubs keep the default.
// The human club can also give any player an individual focus: one attribute.
// Each week a fit player aged 23 or under raises one attribute by 1 with chance GROWTH × the
// intensity's grow factor (about 4 a season at Normal), never above his hidden potential `pot`:
// half the time his individual focus, otherwise one from the team focus (keepers: always their
// position's key attributes). Players aged 31 and over lose a physical point now and then,
// whatever the schedule. Training can injure, Hard more often, Light less.
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
const GROWTH = 0.1, DECLINE = 0.05, INJURY = 0.004, REST_RECOVER = 2; // chances per player per week

export const defaultTraining = () => ({ focus: 'Balanced', intensity: 'Normal', ind: {} });
const AI_TRAINING = defaultTraining();
export const trainingOf = (s, club) => club.id === s.me ? s.training : AI_TRAINING;
export const recoverRate = t => INTENSITY[t.intensity].recover + (t.focus === 'Rest' ? REST_RECOVER : 0);

// ponytail: a pick at the cap is lost, not re-rolled (fun surprise #10).
function raise(rng, p, t) {
  const own = t.ind[p.id], team = p.pos === 'GK' || !FOCUS[t.focus] ? Object.keys(WEIGHTS[p.pos]) : FOCUS[t.focus];
  const k = own && rng.next() < 0.5 ? own : rng.pick(team);
  if (p.attrs[k] < p.pot) { p.attrs[k]++; p.gain++; }
}

// One week of training for `club` under schedule t. Injured players sit it out. Returns the players injured in training.
export function trainWeek(rng, club, t) {
  const I = INTENSITY[t.intensity], hurt = [];
  for (const p of club.players) {
    if (p.inj) continue;
    if (rng.next() < INJURY * I.injury) { injure(rng, p); hurt.push(p); continue; }
    if (p.age <= 23 && t.focus !== 'Rest' && rng.next() < GROWTH * I.grow) raise(rng, p, t);
    if (p.age >= 31 && rng.next() < DECLINE) { const k = rng.pick(ATTRS.physical); p.attrs[k] = Math.max(1, p.attrs[k] - 1); }
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
