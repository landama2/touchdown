import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { takeClub, playDay, endSeason } from '../src/season.js';
import { startCareer, acceptJob, boardDay, MIN_GAMES } from '../src/career.js';
import { lend } from '../src/market.js';
import { promote, ageYouth, ceilingRange, ceiling, YOUTH_MAX, LEAVE_AGE } from '../src/youth.js';
import { trainWeek, defaultTraining } from '../src/training.js';
import { SEASON_WEEKS } from '../src/finance.js';
import { makeRng } from '../src/rng.js';
import { overall, ageOneYear, displayName, ATTRS, ALL_ATTRS, WEIGHTS, createPlayer } from '../src/player.js';
import { serialize, deserialize, SAVE_VERSION } from '../src/save.js';
import {
  TIERS, STAR, OWN_DISCOUNT, starLines, starPoints, retireStars, awardsOf, available, makeLegend, signLegend, aiLegends,
} from '../src/legends.js';
import LIST from '../src/data/legends.js';
import { MINI } from './fixtures/mini.js';

const world = seed => createWorld(seed, MINI);
const entry = name => { const [n, pos, tier, sig] = LIST.find(x => x[0] === name); return { name: n, pos, tier, sig }; };
const makeStar = p => { for (const k of ALL_ATTRS) p.attrs[k] = 20; };
const playSeason = s => { while (!s.done) playDay(s); };

test('Star points: 2, +1 a season at the club after the first (up to 4), +1 an award (up to 3), +1 in the top division', () => {
  assert.equal(starPoints(1, 0, 1), STAR.base);
  assert.equal(starPoints(3, 1, 1), 2 + 2 + 1);
  assert.equal(starPoints(12, 9, 0), 2 + 4 + 3 + 1);
  assert.equal(starPoints(1, 0, 0), 3);
});

test('a star retiring from your club earns points and a Hall of fame row; a non-star nothing; an AI club\'s star gives you nothing', () => {
  const s = world(1);
  startCareer(s, 0);
  const [star, plain] = s.clubs[0].players, ai = s.clubs[1].players[0];
  makeStar(star); makeStar(ai);
  star.since = s.season - 5; star.tally = { apps: 150, goals: 40 }; star.stats = { apps: 20, goals: 5, assists: 1, rating: 140 };
  for (const p of [star, plain, ai]) p.age = 35;
  s.history.push({ season: 0, divs: [{ awards: { player: { id: star.id }, scorer: { id: star.id }, assists: null, young: null } }] });
  const list = [star, plain, ai].map(p => ({ p, club: p === ai ? 1 : 0, div: 0 }));
  const stars = retireStars(s, list, starLines(s), []);
  assert.deepEqual(stars.map(x => x.p), [star, ai]);
  const points = 2 + 4 + 2 + 1;
  assert.equal(s.career.stars, points);
  assert.deepEqual(s.career.hall, [{ name: star.name, pos: star.pos, club: 0, season: s.season, ovr: overall(star), seasons: 6, awards: 2, apps: 170, goals: 45, points }]);
  assert.equal(s.news.at(-1).type, 'retired');
  // Both stars retired from the top division: both become legends (once they have left); yours is marked as yours and cheaper.
  for (const c of s.clubs) c.players = c.players.filter(p => p !== star && p !== ai);
  const offer = available(s), mine = offer.find(e => e.name === star.name), theirs = offer.find(e => e.name === ai.name);
  assert.ok(mine.own && !theirs.own);
  assert.equal(mine.cost, TIERS[mine.tier].cost - OWN_DISCOUNT);
  assert.equal(mine.tier, 'icon');
});

test('an award winner is a star even below the line; a lower-division star becomes a legend only when he was yours', () => {
  const s = world(2);
  startCareer(s, 4);
  const [mine, theirs, winner] = [s.clubs[4].players[0], s.clubs[5].players[0], s.clubs[5].players[1]];
  makeStar(mine); makeStar(theirs);
  const now = [{ player: { id: winner.id } }];
  assert.equal(awardsOf(s, winner.id, now), 1);
  const stars = retireStars(s, [mine, theirs, winner].map(p => ({ p, club: p === mine ? 4 : 5, div: 1 })), [999, 999, 999], now);
  assert.deepEqual(stars.map(x => x.p), [winner]); // the line is out of reach: only the award counts
  retireStars(s, [mine, theirs].map(p => ({ p, club: p === mine ? 4 : 5, div: 1 })), starLines(s), []);
  assert.deepEqual(s.legends.extra.map(e => e.name), [mine.name]);
});

test('through a season: your retiring star is counted even when he was out on loan; AI retirees are replaced', () => {
  const s = world(3);
  startCareer(s, 0);
  const star = s.clubs[0].players.find(p => p.pos === 'MF');
  makeStar(star); star.age = 35;
  lend(s, star, s.clubs[0], s.clubs[2]);
  const old = s.clubs[1].players[0]; old.age = 35;
  playSeason(s);
  endSeason(s);
  assert.deepEqual(s.career.hall.map(h => h.name), [star.name]);
  assert.ok(s.career.stars >= 3);
  assert.ok(!s.clubs.some(c => c.players.includes(star)) && !s.market.includes(star)); // retired
  assert.ok(!s.clubs.some(c => c.players.includes(old)));
  assert.ok(s.inbox.some(n => n.type === 'retired'));
});

test('makeLegend: 17, potential 20, the tier\'s overall within 1, signature attributes high, a rounded player', () => {
  for (const [name, pos, tier, sig] of LIST) for (const seed of [1, 2, 3]) {
    const p = makeLegend(makeRng(seed), 1, { name, pos, tier, sig }), T = TIERS[tier];
    assert.equal(p.age, 17); assert.equal(p.pot, 20); assert.equal(p.legend, tier); assert.equal(p.name, name);
    assert.ok(Math.abs(overall(p) - T.ovr) <= 1, `${name}: ${overall(p)}`);
    for (const k of sig) assert.ok(p.attrs[k] >= Math.min(20, T.sig), `${name} ${k}`);
    const keys = Object.keys(WEIGHTS[pos]), avg = Math.round(keys.reduce((t, k) => t + p.attrs[k], 0) / keys.length);
    const rounded = (pos === 'GK' ? [...ATTRS.mental, ...ATTRS.physical] : ALL_ATTRS.filter(k => !ATTRS.goalkeeping.includes(k))).filter(k => !WEIGHTS[pos][k]);
    for (const k of rounded) assert.ok(p.attrs[k] >= Math.min(20, avg - 2), `${name} ${k}`);
    assert.ok(ALL_ATTRS.every(k => p.attrs[k] >= 1 && p.attrs[k] <= 20));
  }
});

test('the hand-made list: known positions, tiers and attributes, no name twice', () => {
  assert.equal(new Set(LIST.map(x => x[0])).size, LIST.length);
  for (const [, pos, tier, sig] of LIST) {
    assert.ok(WEIGHTS[pos] && TIERS[tier] && sig.length === 3 && sig.every(k => ALL_ATTRS.includes(k)));
  }
});

test('a legend grows faster than a free player with the same attributes, and declines from 33, not 31', () => {
  const club = { players: [], staff: { coaching: 3, medical: 3 } }, t = defaultTraining(), rng = makeRng(9);
  const pairs = Array.from({ length: 20 }, (_, i) => {
    const a = createPlayer(makeRng(100 + i), 2 * i, 'MF', 10, 19), b = structuredClone(a);
    a.pot = b.pot = 20; b.id = 2 * i + 1; b.legend = 'star';
    club.players.push(a, b);
    return [a, b];
  });
  const sum = p => ALL_ATTRS.reduce((t, k) => t + p.attrs[k], 0), start = pairs.map(([a]) => sum(a));
  for (let w = 0; w < SEASON_WEEKS; w++) { trainWeek(rng, club, t); for (const p of club.players) p.inj = null; }
  const gain = k => pairs.reduce((t, pair, i) => t + sum(pair[k]) - start[i], 0);
  assert.ok(gain(1) > 1.5 * gain(0), `legend ${gain(1)} vs ${gain(0)}`);
  const free = createPlayer(makeRng(3), 1, 'FW', 12, 31), legend = { ...structuredClone(free), legend: 'great' };
  const phys = p => ATTRS.physical.reduce((t, k) => t + p.attrs[k], 0), before = phys(free);
  ageOneYear(makeRng(4), free); ageOneYear(makeRng(4), legend);
  assert.equal(phys(free), before - 2);
  assert.equal(phys(legend), before);
});

test('an Icon trained at Normal from 17 is 95 or better by 20', () => {
  const s = world(4);
  takeClub(s, 0);
  const club = s.clubs[0], p = makeLegend(makeRng(5), s.nid++, entry('Thierry Henry')), rng = makeRng(6);
  club.players.push(p);
  for (let w = 0; w < 3 * SEASON_WEEKS; w++) {
    if (w && w % SEASON_WEEKS === 0) p.age++;
    trainWeek(rng, club, defaultTraining());
    p.inj = null;
  }
  assert.equal(p.age, 19);
  assert.ok(overall(p) >= 95, String(overall(p)));
});

test('at the strongest Premier League club, a Star-tier legend at 17 is better than every free youngster', () => {
  for (const seed of [2, 3, 5]) { // ponytail: a likely outcome, not a certain one (youth is random): some seeds give an 80+ youngster
    const s = createWorld(seed), top = s.divisions[0].clubIds.reduce((a, b) => s.clubs[a].quality >= s.clubs[b].quality ? a : b);
    takeClub(s, top);
    const best = Math.max(...s.youth.map(p => overall(p)));
    assert.ok(TIERS.star.ovr - 1 > best, `seed ${seed}: youth ${best}`);
  }
});

test('signLegend: needs a club, a legend on offer, the points and a youth place; takes the points; two in a season work', () => {
  const s = world(5);
  assert.equal(signLegend(s, 'Thierry Henry'), 'You need a club to sign a legend.');
  startCareer(s, 2);
  assert.match(signLegend(s, 'Nobody'), /not on offer/);
  assert.match(signLegend(s, 'Thierry Henry'), /costs 10 Star points; you have 0/);
  s.career.stars = 14;
  const n = s.youth.length;
  assert.equal(signLegend(s, 'Thierry Henry'), null);
  assert.equal(signLegend(s, 'Wayne Rooney'), null);
  assert.equal(s.career.stars, 0);
  assert.equal(s.youth.length, n + 2);
  const henry = s.youth.find(p => p.name === 'Thierry Henry');
  assert.equal(henry.contract, null);
  assert.equal(henry.legend, 'icon');
  assert.deepEqual(ceilingRange(s, henry), [ceiling(henry), ceiling(henry)]); // known exactly
  s.career.stars = 99;
  assert.match(signLegend(s, 'Thierry Henry'), /not on offer/); // once a world
  while (s.youth.length < YOUTH_MAX) s.youth.push(createPlayer(makeRng(s.youth.length), s.nid++, 'DF', 5, 16));
  assert.match(signLegend(s, 'Paolo Maldini'), /youth squad is full/);
});

test('a legend whose namesake still plays in the world is hidden until he retires', () => {
  const s = world(6);
  s.clubs[3].players[0].name = 'Thierry Henry';
  assert.ok(!available(s).some(e => e.name === 'Thierry Henry'));
  s.clubs[3].players[0].name = 'Somebody Else';
  assert.ok(available(s).some(e => e.name === 'Thierry Henry'));
});

test('legends in the youth squad come along to a new job, wait through a sacking, and leave at 19 like everyone', () => {
  const s = world(7);
  startCareer(s, 6);
  s.career.stars = 20;
  signLegend(s, 'Thierry Henry'); signLegend(s, 'Wayne Rooney');
  const kid = s.youth.find(p => !p.legend);
  s.jobs.push({ club: 9, season: s.season, until: s.day + 10, offered: true });
  assert.equal(acceptJob(s, 9), null);
  assert.deepEqual(s.youth.filter(p => p.legend).map(p => p.name), ['Thierry Henry', 'Wayne Rooney']);
  assert.ok(!s.youth.includes(kid));
  const c = s.clubs[9]; c.conf = 0; c.games = MIN_GAMES;
  boardDay(s);
  assert.equal(s.me, null);
  assert.deepEqual(s.career.waiting.map(p => p.name), ['Thierry Henry', 'Wayne Rooney']);
  s.jobs.push({ club: 12, season: s.season, until: s.day + 10, offered: true });
  acceptJob(s, 12);
  assert.deepEqual(s.youth.filter(p => p.legend).map(p => p.name), ['Thierry Henry', 'Wayne Rooney']);
  assert.deepEqual(s.career.waiting, []);
  const rooney = s.youth.find(p => p.name === 'Wayne Rooney');
  assert.equal(promote(s, rooney.id, 99), null);
  assert.equal(rooney.since, s.season);
  for (const p of s.youth) if (p.legend) p.age = LEAVE_AGE - 1;
  assert.ok(ageYouth(s).includes('Thierry Henry'));
  assert.ok(!s.youth.some(p => p.legend));
});

test('displayName marks legends only', () => {
  assert.equal(displayName({ name: 'Thierry Henry', legend: 'icon' }), 'Thierry Henry ★');
  assert.equal(displayName({ name: 'Joe Bloggs' }), 'Joe Bloggs');
});

test('AI legends: drawn now and then from AI clubs\' retiring stars, without touching the world\'s random sequence', () => {
  const setUp = () => {
    const s = world(8);
    takeClub(s, 0);
    for (const c of s.clubs.slice(1)) for (const p of c.players.slice(0, 5)) { p.age = 35; makeStar(p); }
    playSeason(s);
    return s;
  };
  const a = setUp(), b = setUp();
  b.legends.used = LIST.map(x => x[0]); // nothing on offer: no draws
  const drawn = aiLegends(a, a.clubs.slice(1).flatMap(c => c.players.filter(p => p.age >= 35).map(p => ({ p, club: c.id }))));
  assert.ok(drawn.size > 0);
  assert.ok([...drawn.keys()].every(id => !a.clubs[0].players.some(p => p.id === id)));
  endSeason(a); endSeason(b);
  assert.equal(a.seed, b.seed);
  assert.equal(a.nid, b.nid);
  const legends = a.clubs.flatMap(c => c.players.filter(p => p.legend));
  assert.ok(legends.length > 0 && legends.every(p => p.age === 17 && p.contract && a.legends.used.includes(p.name)));
  assert.ok(a.inbox.some(n => n.type === 'aiLegend'));
  assert.ok(!b.clubs.some(c => c.players.some(p => p.legend)));
});

test('a version 14 save gets seasons at the club from now, no Star points or legends yet, and plays a season', () => {
  const a = world(9);
  startCareer(a, 1);
  const o = JSON.parse(serialize(a));
  o.version = 14;
  delete o.legends; delete o.career.stars; delete o.career.hall; delete o.career.waiting;
  for (const c of o.clubs) for (const p of c.players) delete p.since;
  const b = deserialize(JSON.stringify(o));
  assert.equal(b.version, SAVE_VERSION);
  assert.deepEqual([b.career.stars, b.career.hall, b.career.waiting, b.legends], [0, [], [], { used: [], extra: [] }]);
  assert.ok(b.clubs.every(c => c.players.every(p => p.since === b.season)));
  playSeason(b);
  endSeason(b);
  assert.equal(b.season, 2);
});
