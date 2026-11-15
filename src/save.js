// Bump when the shape of State changes, and add a migration in deserialize().
import { slots, newFam } from './lineup.js';
import { TEAM_KEYS, defaultSlot, defaultTactics } from './tactics.js';
import { buildCalendar } from './calendar.js';
import { blankRecords } from './awards.js';

export const SAVE_VERSION = 5; // 2: clubs from real data with short, colours, kit. 3: live match, richer results. 4: tactics. 5: calendar, cup, play-offs, records
export const KEY = 'touchline.save';

export const serialize = state => JSON.stringify(state);

const valid = s => s && typeof s === 'object' && s.version === SAVE_VERSION
  && Array.isArray(s.clubs) && Array.isArray(s.divisions) && Array.isArray(s.market)
  && Array.isArray(s.lineup) && Array.isArray(s.history) && (s.me === null || s.clubs[s.me] !== undefined)
  && (s.live === null || (typeof s.live === 'object' && Array.isArray(s.live.sides)))
  && Array.isArray(s.bench) && !!s.tactics && Array.isArray(s.tactics.slots) && !!s.fam && typeof s.fam === 'object'
  && Array.isArray(s.days) && Number.isInteger(s.next) && Array.isArray(s.playoffs) && Array.isArray(s.records) && (s.cup === null || typeof s.cup === 'object');

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
  4: s => { // the calendar replaces rounds: the rest of this season's league, then its play-offs; no cup until next season
    const played = s.round;
    s.days = s.done ? [] : buildCalendar(s.divisions.map(d => d.fixtures.length), 0)
      .map(d => ({ ...d, items: d.items.filter(i => i.comp !== 'league' || i.round >= played) })).filter(d => d.items.length);
    s.next = 0; s.day = s.days.length ? s.days[0].day - 1 : -1; s.done = !s.days.length;
    s.cup = null; s.playoffs = s.divisions.map(() => null); s.last = null; s.live = null; // a match in progress starts again
    s.records = s.divisions.map(blankRecords);
    for (const c of s.clubs) c.rec = { win: null, goals: null };
    s.history = s.history.map(h => ({ season: h.season, pos: h.pos, div: h.pos === null ? null : s.clubs[s.me].div, prize: h.prize, cup: null,
      divs: h.champions.map(name => ({ champion: s.clubs.findIndex(c => c.name === name), up: [], down: [], playoff: null, awards: null })) }));
    delete s.round;
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
