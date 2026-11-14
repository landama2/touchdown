// Bump when the shape of State changes, and add a migration in deserialize().
export const SAVE_VERSION = 1;
export const KEY = 'touchline.save';

export const serialize = state => JSON.stringify(state);

export function deserialize(text) {
  if (!text) return null;
  try {
    const s = JSON.parse(text);
    return s && typeof s === 'object' && s.version === SAVE_VERSION ? s : null;
  } catch {
    return null;
  }
}
