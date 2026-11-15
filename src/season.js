import { makeRng } from './rng.js';
import { createPlayer, ageOneYear } from './player.js';
import { makeFixtures } from './fixtures.js';
import { blankStats, MARKET_SIZE, newFreeAgent } from './world.js';
import { slots, bestXI, autoBench, fixLineup, newFam, learnFam } from './lineup.js';
import { defaultTactics } from './tactics.js';
import { simMatch, startMatch, stepMinute, matchResult } from './match.js';

const RETIRE_AGE = 35;
const MARKET_KEEP = MARKET_SIZE / 2; // half of last season's free agents stay on the list

function sample(rng, list, n) { // n distinct random elements (Fisher–Yates on a copy)
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

const tier = club => 3 - club.div; // 3 for the top division, 1 for the bottom: scales all money

export const myClub = s => s.clubs[s.me];

export function myFixture(s) {
  const round = s.divisions[myClub(s).div].fixtures[s.round];
  return round ? round.find(m => m.includes(s.me)) : null;
}

export function takeClub(s, clubId) {
  s.me = clubId;
  s.budget = tier(s.clubs[clubId]) * 1.5e6;
  s.lineup = bestXI(s.clubs[clubId], s.formation);
  s.bench = autoBench(s.clubs[clubId], s.lineup);
  s.tactics = defaultTactics(slots(s.formation));
  s.fam = newFam();
}

function entry(s, id) {
  const club = s.clubs[id];
  return id === s.me ? { club, ids: s.lineup, formation: s.formation, bench: s.bench, tactics: s.tactics, fam: s.fam }
    : { club, ids: bestXI(club, '4-4-2'), formation: '4-4-2' }; // AI: best bench, default tactics (see makeSide)
}

function record(st, scored, conceded) {
  st.p++; st.gf += scored; st.ga += conceded;
  if (scored > conceded) { st.w++; st.pts += 3; } else if (scored < conceded) st.l++; else { st.d++; st.pts++; }
}

// Starts the human club's match of this round as a live match in s.live (returns it), or returns
// the one already started. Null when the club has no fixture this round.
export function kickOff(s) {
  const f = myFixture(s);
  if (s.live || s.done || !f) return s.live;
  fixLineup(s);
  const rng = makeRng(s.seed);
  s.live = startMatch(rng.int(0, 0xffffffff), entry(s, f[0]), entry(s, f[1]));
  s.live.sides[f[0] === s.me ? 0 : 1].auto = false;
  s.seed = rng.seed;
  return s.live;
}

// Plays the round. A live match is played out first; whatever is left of it is handed to the
// assistant manager (AI substitutions for both sides).
export function playRound(s) {
  if (s.done) return null;
  if (s.me !== null) fixLineup(s);
  const live = s.live, played = s.me !== null && myFixture(s);
  if (live) { for (const S of live.sides) S.auto = true; while (!live.done) stepMinute(live); }
  const rng = makeRng(s.seed);
  s.last = s.divisions.map(d => (d.fixtures[s.round] || []).map(([h, a]) => { // a smaller division has finished
    const r = live && live.sides[0].club === h ? matchResult(live) : simMatch(rng, entry(s, h), entry(s, a));
    record(s.clubs[h].st, r.hg, r.ag);
    record(s.clubs[a].st, r.ag, r.hg);
    if (h === s.me) s.budget += 20e3 * tier(s.clubs[h]); // gate receipts
    return r;
  }));
  if (s.me !== null) s.budget += 25e3 * tier(myClub(s)); // weekly income
  if (played) learnFam(s.fam, s.formation); // the formation you prepared, not mid-match switches
  s.live = null;
  s.seed = rng.seed;
  s.round++;
  s.done = s.round === Math.max(...s.divisions.map(d => d.fixtures.length));
  return s.last;
}

export function table(s, d) {
  return [...s.divisions[d].clubIds].sort((x, y) => {
    const a = s.clubs[x].st, b = s.clubs[y].st;
    return b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || x - y;
  });
}

export function endSeason(s) {
  if (!s.done) return;
  const rng = makeRng(s.seed);
  const champions = s.divisions.map((_, i) => s.clubs[table(s, i)[0]].name);
  let pos = null, prize = 0;
  if (s.me !== null) {
    pos = table(s, myClub(s).div).indexOf(s.me) + 1;
    prize = (s.divisions[myClub(s).div].clubIds.length + 1 - pos) * 40e3 * tier(myClub(s));
    s.budget += prize;
  }
  s.history.push({ season: s.season, champions, pos, prize });
  for (const c of s.clubs) {
    c.st = blankStats();
    c.players = c.players.map(p => {
      if (p.age >= RETIRE_AGE) return createPlayer(rng, s.nid++, p.pos, c.quality - 2, rng.int(17, 19)); // youth replaces retiree
      ageOneYear(rng, p);
      return p;
    });
  }
  const kept = sample(rng, s.market, MARKET_KEEP).filter(p => p.age < RETIRE_AGE);
  for (const p of kept) ageOneYear(rng, p);
  s.market = [...kept, ...Array.from({ length: MARKET_SIZE - kept.length }, () => newFreeAgent(rng, s.nid++))];
  for (const d of s.divisions) d.fixtures = makeFixtures(d.clubIds);
  s.seed = rng.seed;
  s.round = 0; s.done = false; s.last = null; s.season++;
  if (s.me !== null) fixLineup(s);
}
