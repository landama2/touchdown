// Bump when the shape of State changes, and add a migration in deserialize().
export const SAVE_VERSION = 1;
export const KEY = 'touchline.save';

export const serialize = state => JSON.stringify(state);

const valid = s => s && typeof s === 'object' && s.version === SAVE_VERSION
  && Array.isArray(s.clubs) && Array.isArray(s.divisions) && Array.isArray(s.market)
  && Array.isArray(s.lineup) && Array.isArray(s.history) && (s.me === null || s.clubs[s.me] !== undefined);

export function deserialize(text) {
  if (!text) return null;
  try {
    const s = JSON.parse(text);
    return valid(s) ? s : null;
  } catch {
    return null;
  }
}
