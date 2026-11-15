// Bump when the shape of State changes, and add a migration in deserialize().
export const SAVE_VERSION = 3; // 2: clubs from real data with short, colours, kit. 3: live match, richer results
export const KEY = 'touchline.save';

export const serialize = state => JSON.stringify(state);

const valid = s => s && typeof s === 'object' && s.version === SAVE_VERSION
  && Array.isArray(s.clubs) && Array.isArray(s.divisions) && Array.isArray(s.market)
  && Array.isArray(s.lineup) && Array.isArray(s.history) && (s.me === null || s.clubs[s.me] !== undefined)
  && (s.live === null || (typeof s.live === 'object' && Array.isArray(s.live.sides)));

// MIGRATIONS[v] upgrades a save from version v to v + 1.
const MIGRATIONS = {
  2: s => { s.live = null; s.last = null; }, // old results have no stats or ratings: drop them
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
