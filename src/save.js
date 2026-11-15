// Bump when the shape of State changes, and add a migration in deserialize().
import { slots, newFam } from './lineup.js';
import { TEAM_KEYS, defaultSlot, defaultTactics } from './tactics.js';

export const SAVE_VERSION = 4; // 2: clubs from real data with short, colours, kit. 3: live match, richer results. 4: tactics
export const KEY = 'touchline.save';

export const serialize = state => JSON.stringify(state);

const valid = s => s && typeof s === 'object' && s.version === SAVE_VERSION
  && Array.isArray(s.clubs) && Array.isArray(s.divisions) && Array.isArray(s.market)
  && Array.isArray(s.lineup) && Array.isArray(s.history) && (s.me === null || s.clubs[s.me] !== undefined)
  && (s.live === null || (typeof s.live === 'object' && Array.isArray(s.live.sides)))
  && Array.isArray(s.bench) && !!s.tactics && Array.isArray(s.tactics.slots) && !!s.fam && typeof s.fam === 'object';

// MIGRATIONS[v] upgrades a save from version v to v + 1.
const MIGRATIONS = {
  2: s => { s.live = null; s.last = null; }, // old results have no stats or ratings: drop them
  3: s => { // default tactics, also for both sides of a match in progress
    s.bench = []; s.tactics = defaultTactics(slots(s.formation)); s.fam = newFam(); s.fam[s.formation] = 1;
    for (const S of s.live?.sides || []) {
      S.tac = Object.fromEntries(TEAM_KEYS.map(k => [k, 0])); S.takers = { pen: null, fk: null, corner: null }; S.fam = {};
      for (const o of S.on) Object.assign(o, defaultSlot(o.pos));
    }
  },
};

export function deserialize(text) {
  if (!text) return null;
  try {
    const s = JSON.parse(text);
    while (s && MIGRATIONS[s.version]) MIGRATIONS[s.version](s), s.version++;
    return valid(s) ? s : null;
  } catch {
    return null;
  }
}
