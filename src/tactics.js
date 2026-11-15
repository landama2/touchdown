import { WEIGHTS } from './player.js';

// Team instructions. Each is a whole number from -n to n (the middle label is 0 and changes nothing);
// TEAM lists the labels from lowest to highest. The match engine reads them in src/match.js.
export const TEAM = {
  mentality: ['Very defensive', 'Defensive', 'Balanced', 'Attacking', 'Very attacking'],
  pressing: ['Low', 'Normal', 'High'],
  tempo: ['Slow', 'Normal', 'Fast'],
  width: ['Narrow', 'Normal', 'Wide'],
  line: ['Deep', 'Normal', 'High'],
};
export const TEAM_KEYS = Object.keys(TEAM);
export const TEAM_NAMES = { mentality: 'Mentality', pressing: 'Pressing', tempo: 'Tempo', width: 'Width', line: 'Defensive line' };
const span = key => TEAM[key].length >> 1;
export const teamLabel = (key, v) => TEAM[key][v + span(key)];

// Roles per position. `w` = attribute weights that rate a player in the role (like WEIGHTS in
// player.js); the first role of each position uses exactly WEIGHTS, so defaults change nothing.
// shoot / assist / foul / header multiply how often the player takes the shot, makes the assist,
// commits the foul or gets on the end of a corner. Missing = 1.
export const ROLES = {
  GK: { Goalkeeper: { w: WEIGHTS.GK, header: 0.04 } },
  DF: {
    'Centre-back': { w: WEIGHTS.DF, header: 1.5 },
    'Full-back': { w: { tackling: 2, pace: 2, crossing: 2, stamina: 2, positioning: 2 }, assist: 1.5, shoot: 0.6, header: 0.5 },
    'Ball-playing defender': { w: { tackling: 3, positioning: 2, passing: 2, composure: 2, heading: 1 }, assist: 1.3 },
  },
  MF: {
    'Central midfielder': { w: WEIGHTS.MF },
    'Ball winner': { w: { tackling: 3, workRate: 2, aggression: 2, stamina: 2, positioning: 2 }, foul: 1.6, shoot: 0.6, assist: 0.6 },
    Playmaker: { w: { passing: 3, vision: 3, firstTouch: 2, decisions: 2, composure: 1 }, assist: 2, shoot: 0.8 },
    Winger: { w: { crossing: 3, pace: 3, dribbling: 2, stamina: 1, firstTouch: 1 }, assist: 1.6, header: 0.5 },
  },
  FW: {
    Striker: { w: WEIGHTS.FW },
    Poacher: { w: { finishing: 3, composure: 2, positioning: 2, pace: 2, firstTouch: 1 }, shoot: 1.5, assist: 0.4 },
    'Target man': { w: { heading: 3, strength: 3, finishing: 2, firstTouch: 1 }, header: 2, assist: 1.2 },
    'Deep-lying forward': { w: { passing: 2, firstTouch: 2, vision: 2, finishing: 2, dribbling: 1, composure: 1 }, shoot: 0.7, assist: 2 },
  },
};
// Duty: lean = share of the team's attack/defence balance; shoot multiplies how often he shoots.
export const DUTIES = { Defend: { lean: -1, shoot: 0.6 }, Support: { lean: 0, shoot: 1 }, Attack: { lean: 1, shoot: 1.5 } };
// Per-player instructions, -1 / 0 / 1.
export const INSTR = { shoot: ['Shoot less', 'Normal', 'Shoot more'], tackle: ['Stay on feet', 'Normal', 'Tackle harder'] };
export const TAKERS = { pen: 'Penalties', fk: 'Free kicks', corner: 'Corners' };

export const defaultSlot = pos => ({ role: Object.keys(ROLES[pos])[0], duty: 'Support', shoot: 0, tackle: 0 });

// The human club's tactics: team instructions, one entry per lineup slot, and set-piece takers
// (a player id, or null for "best available").
export const defaultTactics = positions => ({
  ...Object.fromEntries(TEAM_KEYS.map(k => [k, 0])),
  slots: positions.map(defaultSlot),
  takers: { pen: null, fk: null, corner: null },
});

// Keeps each slot's settings when its role still fits the slot's position, else resets it.
export const fitSlots = (slots, positions) => positions.map((pos, k) => slots[k] && has(ROLES[pos], slots[k].role) ? slots[k] : defaultSlot(pos));

const isLevel = (v, n) => Number.isInteger(v) && Math.abs(v) <= n;
export const has = (o, k) => !!o && Object.hasOwn(o, k); // own keys only: 'constructor' is not a role

// Setters return an error message, or null when the change is made. `t` is s.tactics or a live side's tac.
export function setTeam(t, key, v) {
  if (!has(TEAM, key) || !isLevel(v, span(key))) return 'Unknown team instruction.';
  t[key] = v;
  return null;
}

export function setSlot(slot, pos, field, v) {
  if (field === 'role' ? !has(ROLES[pos], v) : field === 'duty' ? !has(DUTIES, v) || pos === 'GK' : !has(INSTR, field) || !isLevel(v, 1))
    return 'Unknown player instruction.';
  slot[field] = v;
  return null;
}

export function setTaker(t, kind, id, squad) {
  if (!has(TAKERS, kind) || (id !== null && !squad.some(p => p.id === id))) return 'Unknown set-piece taker.';
  t.takers[kind] = id;
  return null;
}
