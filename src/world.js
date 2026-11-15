import { makeRng } from './rng.js';
import { POS, WEIGHTS, ALL_ATTRS, createPlayer, overall } from './player.js';
import { makeFixtures } from './fixtures.js';
import { SAVE_VERSION } from './save.js';
import { LEAGUES } from './data/england.js';
import STATS, { CALIBRATION } from './data/england-stats.js';

export const MARKET_SIZE = 40;
const STRENGTH_BONUS = 2;

export const FREE_AGENT_QUALITY = [7, 14]; // each new free agent: random quality in this range
export const newFreeAgent = (rng, id) => createPlayer(rng, id, rng.pick(POS), rng.int(...FREE_AGENT_QUALITY));

export const blankStats = () => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });

// A data row becomes a full player. With imported stats the dataset supplies the profile (the
// relative strengths and weaknesses) and the rating supplies the level: all attributes move by one
// whole shift so the overall matches a generated player of that rating. Otherwise the attributes are
// generated around the rating and the listed strengths are lifted.
// pot always starts at the best key attribute (+0-2 for under-23s), so it never sits below one.
export function playerFromData(rng, id, [name, pos, age, rating, strengths = []], stats) {
  const p = createPlayer(rng, id, pos, rating, age);
  p.name = name;
  if (stats) {
    const target = overall(p);                          // what this rating gives a generated player
    const imported = { pos, attrs: Object.fromEntries(ALL_ATTRS.map((k, i) => [k, stats[i]])) };
    const shift = Math.round((target - overall(imported)) / 5); // overall moves 5 per attribute point
    ALL_ATTRS.forEach((k, i) => { p.attrs[k] = Math.max(1, Math.min(20, stats[i] + shift)); });
  }
  else for (const k of strengths) p.attrs[k] = Math.min(20, p.attrs[k] + STRENGTH_BONUS);
  const best = Math.max(...Object.keys(WEIGHTS[pos]).map(k => p.attrs[k]));
  p.pot = Math.min(20, best + (age < 23 ? rng.int(0, 2) : 0));
  return p;
}

export function createWorld(seed, leagues = LEAGUES, stats = STATS, calibration = CALIBRATION) {
  const rng = makeRng(seed);
  const s = {
    version: SAVE_VERSION, seed, nid: 1,
    me: null, formation: '4-4-2', lineup: [], budget: 0,
    season: 1, round: 0, done: false,
    clubs: [], divisions: [], market: [], history: [], last: null, live: null,
  };
  leagues.forEach((league, div) => {
    const shift = calibration[league.name] || 0;
    const calibrated = ([name, pos, age, rating, strengths]) => [name, pos, age, Math.max(1, Math.min(20, rating + shift)), strengths];
    const clubIds = league.clubs.map(c => {
      const id = s.clubs.length, rows = c.players.map(calibrated);
      s.clubs.push({
        id, name: c.name, short: c.short, colours: [...c.colours], kit: { ...c.kit }, div,
        quality: rows.reduce((t, row) => t + row[3], 0) / rows.length,
        players: rows.map(row => playerFromData(rng, s.nid++, row, stats[c.name]?.[row[0]])),
        st: blankStats(),
      });
      return id;
    });
    s.divisions.push({ name: league.name, clubIds, fixtures: makeFixtures(clubIds) });
  });
  for (let i = 0; i < MARKET_SIZE; i++) s.market.push(newFreeAgent(rng, s.nid++));
  s.seed = rng.seed;
  return s;
}
