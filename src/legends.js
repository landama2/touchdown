import { createPlayer, overall, ATTRS, ALL_ATTRS, WEIGHTS, RETIRE_AGE, joinSeason } from './player.js';
import { makeRng } from './rng.js';
import { YOUTH_MAX } from './youth.js';
import LIST from './data/legends.js';

// Star points and legends. When a star retires from the human manager's club, the manager earns Star points
// (s.career.stars; they follow him from job to job) and the star goes into his Hall of fame (s.career.hall).
// A star: in the top STAR.top of his division's overalls that season, or the winner of any season award ever.
// Points: STAR.base, +1 a season at the club after the first (counted from p.since, before the manager came too),
// +1 an award, +1 retiring in the top division; with caps.
// Any other player retiring from your club gives STAR.retiree point, with no Hall of fame row or note.
// Points buy legends: 17-year-old young versions of great players (src/data/legends.js, plus every star who
// retires from the top division or from your club), with potential 20 and a head start by tier; their three signature
// attributes (p.sig) grow on to SIG_MAX (22), past anyone else's 20, so a grown legend outrates any academy player.
// Each exists once a world (s.legends.used). A signed legend joins the youth squad; AI clubs draw one now and then when a star
// of theirs retires. Legends grow faster and decline later (growFactor and declineAge in player.js).
// s.legends = { used: [names], extra: [{ name, pos, tier, sig, own }] }.
// ovr: his overall at 17 (±1); sig: the signature attributes at least this.
export const TIERS = {
  star: { cost: 4, ovr: 80, sig: 17 },
  great: { cost: 7, ovr: 85, sig: 18 },
  icon: { cost: 10, ovr: 90, sig: 19 },
};
export const STAR = { retiree: 1, top: 0.1, base: 2, seasons: 4, awards: 3, topFlight: 1 };
export const OWN_DISCOUNT = 2;
export const AI_CHANCE = 1 / 30, AI_WEIGHTS = { star: 6, great: 3, icon: 1 };
const AWARDS = ['player', 'scorer', 'assists', 'young'];

export const blankLegends = () => ({ used: [], extra: [] });

// The overall a player needs to be a star of each division: the top STAR.top's lowest.
export function starLines(s) {
  return s.divisions.map(dv => {
    const o = dv.clubIds.flatMap(id => s.clubs[id].players.map(p => overall(p))).sort((a, b) => b - a);
    return o.length ? o[Math.max(0, Math.ceil(o.length * STAR.top) - 1)] : Infinity;
  });
}
// Season awards player id has won: in history, and in `now` (this season's awards per division, not yet in history).
export const awardsOf = (s, id, now = []) =>
  [...s.history.flatMap(h => h.divs.map(x => x.awards)), ...now].reduce((n, a) => n + (a ? AWARDS.filter(k => a[k]?.id === id).length : 0), 0);

export const tenure = (s, p) => s.season - (p.since ?? s.season) + 1;
export function starPoints(seasons, awards, div) {
  return STAR.base + Math.min(STAR.seasons, Math.max(0, seasons - 1)) + Math.min(STAR.awards, awards) + (div === 0 ? STAR.topFlight : 0);
}
// Preview for the UI: the Star points your player p would earn if he retired now (0: not a star, or not at your club).
// `ahead` = seasons until he retires (0: this season, 1: next). Uses the current star line and division; an estimate.
export function projectStar(s, p, ahead = 0) {
  if (!s.career || s.me === null) return 0;
  const club = s.clubs.find(c => c.players.includes(p));
  if (!club || (p.loan ? p.loan.from : club.id) !== s.me) return 0;
  const awards = awardsOf(s, p.id);
  if (overall(p) < starLines(s)[club.div] && !awards) return 0;
  return starPoints(tenure(s, p) + ahead, awards, club.div);
}
const tierFor = ovr => ovr >= 88 ? 'icon' : ovr >= 84 ? 'great' : 'star';
const bestKeys = p => Object.keys(WEIGHTS[p.pos]).sort((a, b) => p.attrs[b] - p.attrs[a] || WEIGHTS[p.pos][b] - WEIGHTS[p.pos][a]).slice(0, 3);

// The season's retirees, collected at the end of the season before contracts end: [{ p, club, div }], div from
// divOf (each club's division in the season just played, before promotion and relegation).
export const retirees = (s, divOf) => s.clubs.flatMap(c => c.players.filter(p => p.age >= RETIRE_AGE).map(p => ({ p, club: c.id, div: divOf[c.id] })));

// Stars among `list` (retirees()): the human manager's earn points, a hall row and an inbox note; top-division
// stars and his own become legends. lines = starLines(s), now = this season's awards. Returns the stars.
export function retireStars(s, list, lines, now) {
  const stars = [];
  for (const { p, club, div } of list) {
    const ovr = overall(p), awards = awardsOf(s, p.id, now);
    if (ovr < lines[div] && !awards) { // not a star: your retiree is still worth a single point, quietly (no Hall of fame, no note)
      if (club === s.me && s.career) s.career.stars += STAR.retiree;
      continue;
    }
    stars.push({ p, club, div });
    const mine = club === s.me && !!s.career;
    if (mine) {
      const seasons = tenure(s, p), points = starPoints(seasons, awards, div);
      s.career.stars += points;
      s.career.hall.push({ name: p.name, pos: p.pos, club, season: s.season, ovr, seasons, awards,
        apps: (p.tally?.apps || 0) + (p.stats?.apps || 0), goals: (p.tally?.goals || 0) + (p.stats?.goals || 0), points });
      s.news.push({ type: 'retired', name: p.name, club, seasons, awards, points });
    }
    if (div !== 0 && !mine) continue;
    const old = s.legends.extra.find(e => e.name === p.name);
    if (old) old.own ||= mine;
    else s.legends.extra.push({ name: p.name, pos: p.pos, tier: tierFor(ovr), sig: bestKeys(p), own: mine });
  }
  return stars;
}

// Names of the players still playing in the world (legends aside): their legends wait until they retire.
const active = s => new Set([...s.clubs.flatMap(c => c.players), ...s.market, ...s.youth].filter(p => !p.legend).map(p => p.name));
// The legends on offer: [{ name, pos, tier, sig, own, cost }], the hand-made list first.
export function available(s) {
  const used = new Set(s.legends.used), playing = active(s), extra = new Map(s.legends.extra.map(e => [e.name, e]));
  const list = LIST.map(([name, pos, tier, sig]) => ({ name, pos, tier, sig, own: !!extra.get(name)?.own }));
  const names = new Set(list.map(e => e.name));
  return [...list, ...s.legends.extra.filter(e => !names.has(e.name))]
    .filter(e => !used.has(e.name) && !playing.has(e.name))
    .map(e => ({ ...e, cost: Math.max(1, TIERS[e.tier].cost - (e.own ? OWN_DISCOUNT : 0)) }));
}

// A legend aged 17 from entry e: the signature attributes at the tier's level, his position's other key attributes
// nudged until his overall is the tier's (±1), every other outfield attribute (a keeper: mental and physical) at
// most 2 under the key attributes' average, potential 20, signature attributes p.sig (growing to SIG_MAX).
export function makeLegend(rng, id, e) {
  const T = TIERS[e.tier], p = createPlayer(rng, id, e.pos, T.ovr / 5 - 2, 17);
  for (const k of e.sig) p.attrs[k] = Math.min(20, Math.max(p.attrs[k], T.sig));
  const free = Object.keys(WEIGHTS[e.pos]).filter(k => !e.sig.includes(k)), by = f => free.reduce((b, k) => f(p.attrs[k], p.attrs[b]) ? k : b);
  for (let i = 0; i < 100 && overall(p) < T.ovr - 1; i++) { const k = by((x, y) => x < y); if (p.attrs[k] >= 20) break; p.attrs[k]++; }
  // Too good: the highest other key attribute down, or a signature attribute still above the tier's level (a keeper's
  // handling and reflexes are most of his overall, so trimming the rest alone cannot bring him down).
  const above = () => [...free, ...e.sig.filter(k => WEIGHTS[e.pos][k] && p.attrs[k] > T.sig)];
  for (let i = 0; i < 100 && overall(p) > T.ovr + 1; i++) { const k = above().reduce((b, x) => p.attrs[x] > p.attrs[b] ? x : b); if (p.attrs[k] <= 1) break; p.attrs[k]--; }
  const keys = Object.keys(WEIGHTS[e.pos]), floor = Math.round(keys.reduce((t, k) => t + p.attrs[k], 0) / keys.length) - 2;
  const rounded = e.pos === 'GK' ? [...ATTRS.mental, ...ATTRS.physical] : ALL_ATTRS.filter(k => !ATTRS.goalkeeping.includes(k));
  for (const k of rounded) if (!WEIGHTS[e.pos][k]) p.attrs[k] = Math.min(20, Math.max(p.attrs[k], floor));
  return Object.assign(p, { name: e.name, pot: 20, legend: e.tier, sig: [...e.sig] });
}
// The signature attributes of the legend called `name`: from the hand-made list or s.legends.extra, else his best
// three key attributes now (for a save from before p.sig).
export const sigOf = (s, p) => LIST.find(e => e[0] === p.name)?.[3] ?? s.legends.extra.find(e => e.name === p.name)?.sig ?? bestKeys(p);
const hash = str => [...str].reduce((h, ch) => Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0, 2166136261);

// The human manager spends Star points on the legend called `name`: he joins the youth squad. Error message or null.
export function signLegend(s, name) {
  if (s.me === null || !s.career) return 'You need a club to sign a legend.';
  const e = available(s).find(x => x.name === name);
  if (!e) return 'That legend is not on offer.';
  if (s.career.stars < e.cost) return `${e.name} costs ${e.cost} Star points; you have ${s.career.stars}.`;
  if (s.youth.length >= YOUTH_MAX) return `The youth squad is full (${YOUTH_MAX}).`;
  const p = makeLegend(makeRng(s.seed ^ hash(name) ^ s.nid), s.nid++, e); // its own sequence: the world's is untouched
  s.career.stars -= e.cost;
  s.legends.used.push(e.name);
  s.youth.push(p);
  return null;
}

// AI clubs: each star of theirs retiring now brings a legend with chance AI_CHANCE, drawn by AI_WEIGHTS from those on
// offer. Uses its own random sequence. Returns a Map: retiree id -> legend entry (each entry once).
export function aiLegends(s, stars) {
  const rng = makeRng(s.seed ^ Math.imul(s.season, 0x85ebca6b)), out = new Map(), taken = new Set();
  for (const { p, club } of stars) {
    if (club === s.me || rng.next() >= AI_CHANCE) continue;
    const pool = available(s).filter(e => !taken.has(e.name));
    if (!pool.length) break;
    let r = rng.next() * pool.reduce((t, e) => t + AI_WEIGHTS[e.tier], 0);
    const e = pool.find(x => (r -= AI_WEIGHTS[x.tier]) < 0) ?? pool.at(-1);
    taken.add(e.name);
    out.set(p.id, e);
  }
  return out;
}
// The legend for entry e taking the place of academy player `kid` at an AI club (his id and contract).
export function aiLegend(s, e, kid) {
  const p = makeLegend(makeRng(s.seed ^ hash(e.name)), kid.id, e);
  Object.assign(p, { contract: kid.contract, since: joinSeason(s) });
  s.legends.used.push(e.name);
  return p;
}
