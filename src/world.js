import { makeRng } from './rng.js';
import { POS, createPlayer } from './player.js';
import { makeFixtures } from './fixtures.js';
import { SAVE_VERSION } from './save.js';
import { PRE, STEM, SUFFIX, DENY } from './data/names.js';

export const DIVISIONS = ['First Division', 'Second Division', 'Third Division'];
export const CLUBS_PER_DIV = 16;
export const SQUAD_SHAPE = [['GK', 3], ['DF', 7], ['MF', 7], ['FW', 5]];
export const MARKET_SIZE = 40;

export const blankStats = () => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });

export function clubNames(rng, n) {
  const towns = new Set(), names = [];
  while (names.length < n) {
    const town = rng.pick(PRE) + rng.pick(STEM);
    if (towns.has(town) || DENY.includes(town)) continue;
    towns.add(town);
    names.push(town + ' ' + rng.pick(SUFFIX));
  }
  return names;
}

export function createWorld(seed) {
  const rng = makeRng(seed);
  const s = {
    version: SAVE_VERSION, seed, nid: 1,
    me: null, formation: '4-4-2', lineup: [], budget: 0,
    season: 1, round: 0, done: false,
    clubs: [], divisions: [], market: [], history: [], last: null,
  };
  const names = clubNames(rng, DIVISIONS.length * CLUBS_PER_DIV);
  DIVISIONS.forEach((name, d) => {
    const clubIds = [];
    for (let i = 0; i < CLUBS_PER_DIV; i++) {
      const id = s.clubs.length, quality = 15 - d * 3 - i * 0.2;
      const club = { id, name: names[id], div: d, quality, players: [], st: blankStats() };
      for (const [pos, n] of SQUAD_SHAPE)
        for (let k = 0; k < n; k++) club.players.push(createPlayer(rng, s.nid++, pos, quality));
      s.clubs.push(club);
      clubIds.push(id);
    }
    s.divisions.push({ name, clubIds, fixtures: makeFixtures(clubIds) });
  });
  for (let i = 0; i < MARKET_SIZE; i++) s.market.push(createPlayer(rng, s.nid++, rng.pick(POS), 9));
  s.seed = rng.seed;
  return s;
}
