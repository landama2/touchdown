import { makeRng } from './rng.js';
import { createPlayer, ageOneYear } from './player.js';
import { blankStats, MARKET_SIZE, newFreeAgent, scheduleSeason } from './world.js';
import { slots, bestXI, autoBench, fixLineup, newFam, learnFam } from './lineup.js';
import { defaultTactics } from './tactics.js';
import { startMatch, stepMinute, matchResult, shootout } from './match.js';
import { cupRounds, nextCupRound, addLeg, decide, playoffSemis, playoffFinal } from './cup.js';
import { addMatch, seasonAwards, noteSeason } from './awards.js';
import { afterMatch, passDays, offseason } from './squad.js';
import { defaultTraining, trainingOf, recoverRate, trainWeek, INTENSITY } from './training.js';

const RETIRE_AGE = 35;
const MARKET_KEEP = MARKET_SIZE / 2; // half of last season's free agents stay on the list
// Between each division and the one below: PROMOTED go up automatically, the next PLAYOFF clubs
// play off for one more place, RELEGATED come down. The bottom division has no relegation.
// ponytail: no size checks; a middle division needs 2 + 4 + 3 = 9 clubs or more, a division with play-offs 6.
export const PROMOTED = 2, PLAYOFF = 4, RELEGATED = 3;
const CUP_PRIZE = 500e3;

function sample(rng, list, n) { // n distinct random elements (Fisher–Yates on a copy)
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

const tier = club => 3 - club.div; // 3 for the top division, 1 for the bottom: scales all money

export const myClub = s => s.clubs[s.me];

// The matches of one calendar item: [{ h, a, tie?, legs?, neutral }]. Knockout rounds not drawn yet
// (or a cup missing after a save migration) have none.
function fixtures(s, it) {
  if (it.comp === 'league') return s.divisions[it.div].fixtures[it.round].map(([h, a]) => ({ h, a, neutral: false }));
  const round = (it.comp === 'cup' ? s.cup : s.playoffs[it.div])?.rounds[it.round];
  if (!round) return [];
  const legs = it.comp === 'playoff' && it.round === 0 ? 2 : 1;
  const neutral = it.comp === 'cup' ? it.round === cupRounds(s.clubs.length) - 1 : it.round === 1;
  return round.ties.map(t => legs === 2 && it.leg === 0 ? { h: t.a, a: t.h, tie: t, legs, neutral } : { h: t.h, a: t.a, tie: t, legs, neutral });
}

// The human club's match on the next calendar day, with its calendar item, or null.
export function myFixture(s) {
  if (s.me === null || s.done) return null;
  for (const item of s.days[s.next].items) {
    const f = fixtures(s, item).find(x => x.h === s.me || x.a === s.me);
    if (f) return { ...f, item };
  }
  return null;
}

// The human club's next n known matches: [{ day, item, h, a, neutral }]. Knockout ties appear once drawn.
export function upcoming(s, n) {
  const out = [];
  for (let k = s.next; s.me !== null && k < s.days.length && out.length < n; k++)
    for (const item of s.days[k].items) {
      const f = fixtures(s, item).find(x => x.h === s.me || x.a === s.me);
      if (f) out.push({ day: s.days[k].day, item, h: f.h, a: f.a, neutral: f.neutral });
    }
  return out.slice(0, n);
}

export function takeClub(s, clubId) {
  s.me = clubId;
  s.budget = tier(s.clubs[clubId]) * 1.5e6;
  s.lineup = bestXI(s.clubs[clubId], s.formation);
  s.bench = autoBench(s.clubs[clubId], s.lineup);
  s.tactics = defaultTactics(slots(s.formation));
  s.fam = newFam();
  s.training = defaultTraining();
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

// Starts the human club's next match as a live match in s.live (returns it), or returns the one
// already started. Null when the club has no match on the next calendar day.
export function kickOff(s) {
  const f = myFixture(s);
  if (s.live || !f) return s.live;
  fixLineup(s);
  const rng = makeRng(s.seed);
  s.live = startMatch(rng.int(0, 0xffffffff), entry(s, f.h), entry(s, f.a), f.neutral);
  s.live.sides[f.h === s.me ? 0 : 1].auto = false;
  s.seed = rng.seed;
  return s.live;
}

function play(rng, s, f) {
  const m = startMatch(rng.int(0, 0xffffffff), entry(s, f.h), entry(s, f.a), f.neutral);
  while (!m.done) stepMinute(m);
  return m;
}

// Adds a finished knockout match to its tie; a tie level after its last leg goes to penalties.
function settle(f, m) {
  const t = f.tie, flip = f.h !== t.h, g = [m.sides[0].st.goals, m.sides[1].st.goals];
  if (addLeg(t, flip ? g[1] : g[0], flip ? g[0] : g[1], f.legs)) {
    const p = shootout(m);
    decide(t, flip ? [p[1], p[0]] : p);
  }
}

// Draws what follows a played calendar item: the cup's next round, the play-off semi-finals once a
// division's league is complete, the play-off final once both semi-finals are decided.
function advance(s, rng, it) {
  if (it.comp === 'cup' && s.cup && s.cup.rounds.length === it.round + 1 && it.round + 1 < cupRounds(s.clubs.length)) nextCupRound(rng, s.cup);
  if (it.comp === 'league' && it.div > 0 && it.round === s.divisions[it.div].fixtures.length - 1) s.playoffs[it.div] = playoffSemis(table(s, it.div));
  if (it.comp === 'playoff' && it.round === 0 && it.leg === 1) playoffFinal(s.playoffs[it.div]);
}

// The days from one match day to the next: every club trains once per calendar week crossed, then
// injuries heal and condition, sharpness and morale move (free agents rest at the Normal rate).
// Training injuries at the human club become news.
function between(s, rng, from, to) {
  const weeks = Math.floor(to / 7) - Math.floor(from / 7);
  for (const c of s.clubs) {
    const t = trainingOf(s, c);
    const hurt = [];
    for (let w = 0; w < weeks; w++) hurt.push(...trainWeek(rng, c, t));
    passDays(c.players, to - from, recoverRate(t));
    if (c.id === s.me) for (const p of hurt) if (p.inj) // only those still hurt when the next match day comes
      s.news.push({ type: 'injury', club: c.id, id: p.id, name: p.name, injury: p.inj.name, days: p.inj.days, training: true });
  }
  passDays(s.market, to - from, INTENSITY.Normal.recover);
}

// Plays the next calendar day: every match of every competition on it. A live match is played out
// first; whatever is left of it is handed to the assistant manager (AI substitutions for both sides).
// Each match leaves condition, form, morale, injuries and bans on both squads (src/squad.js); then
// the days up to the next match day pass. s.news collects the human club's new injuries and bans.
// Returns the day's results: matchResult() plus item (the calendar item it belongs to).
export function playDay(s) {
  if (s.done) return null;
  if (s.me !== null) fixLineup(s);
  const today = s.days[s.next], live = s.live, played = !!myFixture(s);
  if (live) { for (const S of live.sides) S.auto = true; while (!live.done) stepMinute(live); }
  const rng = makeRng(s.seed);
  s.last = []; s.news = [];
  for (const it of today.items) for (const f of fixtures(s, it)) {
    const m = live && live.sides[0].club === f.h && live.sides[1].club === f.a ? live : play(rng, s, f);
    if (f.tie) settle(f, m);
    const r = { ...matchResult(m), item: { ...it } };
    if (it.comp === 'league') { record(s.clubs[f.h].st, r.hg, r.ag); record(s.clubs[f.a].st, r.ag, r.hg); addMatch(s, it.div, r); }
    if (f.h === s.me && !f.neutral) s.budget += 20e3 * tier(s.clubs[f.h]); // gate receipts
    s.news.push(...afterMatch(s, m, it.comp, rng).filter(n => n.club === s.me));
    s.last.push(r);
  }
  for (const it of today.items) advance(s, rng, it);
  if (s.me !== null) s.budget += 25e3 * tier(myClub(s)) * (Math.floor(today.day / 7) - Math.floor(s.day / 7)); // weekly income
  if (played) learnFam(s.fam, s.formation); // the formation you prepared, not mid-match switches
  s.live = null;
  s.day = today.day;
  s.next++;
  s.done = s.next === s.days.length;
  if (!s.done) between(s, rng, today.day, s.days[s.next].day);
  s.seed = rng.seed; // after the training draws too, so the next day does not reuse them
  return s.last;
}

export function table(s, d) {
  return [...s.divisions[d].clubIds].sort((x, y) => {
    const a = s.clubs[x].st, b = s.clubs[y].st;
    return b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || x - y;
  });
}

// 'up' (promoted), 'playoff', 'down' (relegated) or null for table position pos (0 = top) in division d.
export function zone(s, d, pos) {
  if (d > 0 && pos < PROMOTED) return 'up';
  if (d > 0 && pos < PROMOTED + PLAYOFF) return 'playoff';
  if (d < s.divisions.length - 1 && pos >= s.divisions[d].clubIds.length - RELEGATED) return 'down';
  return null;
}

const winnerOf = p => p?.rounds[1]?.ties[0].w ?? null;

// Closes the season: prize money, awards, records, promotion and relegation, the history entry;
// then ages the players (club players develop in training, free agents at rollover), gives everyone the summer break,
// refreshes the free agents and schedules the next season.
export function endSeason(s) {
  if (!s.done) return;
  const rng = makeRng(s.seed);
  const tables = s.divisions.map((_, d) => table(s, d)), awards = s.divisions.map((_, d) => seasonAwards(s, d));
  const final = s.cup?.rounds[cupRounds(s.clubs.length) - 1]?.ties[0];
  const h = {
    season: s.season, pos: null, div: null, prize: 0,
    cup: final?.w == null ? null : { winner: final.w, runnerUp: final.w === final.h ? final.a : final.h },
    divs: tables.map((t, d) => ({ champion: t[0], up: [], down: [], playoff: winnerOf(s.playoffs[d]), awards: awards[d] })),
  };
  if (s.me !== null) {
    h.div = myClub(s).div; h.pos = tables[h.div].indexOf(s.me) + 1;
    h.prize = (tables[h.div].length + 1 - h.pos) * 40e3 * tier(myClub(s));
    if (h.cup?.winner === s.me) h.prize += CUP_PRIZE;
    s.budget += h.prize;
  }
  noteSeason(s, tables, awards);
  for (let d = 0; d + 1 < tables.length; d++) {
    const below = tables[d + 1];
    h.divs[d + 1].up = [...below.slice(0, PROMOTED), h.divs[d + 1].playoff ?? below[PROMOTED]]; // no play-offs (old save): 3rd goes up
    h.divs[d].down = tables[d].slice(-RELEGATED);
  }
  h.divs.forEach((x, d) => { for (const id of x.up) s.clubs[id].div = d - 1; for (const id of x.down) s.clubs[id].div = d + 1; });
  s.divisions.forEach((dv, d) => { dv.clubIds = s.clubs.filter(c => c.div === d).map(c => c.id); });
  s.history.push(h);
  for (const c of s.clubs) {
    c.st = blankStats();
    c.players = c.players.map(p => {
      if (p.age >= RETIRE_AGE) return createPlayer(rng, s.nid++, p.pos, c.quality - 2, rng.int(17, 19)); // youth replaces retiree
      delete p.stats;
      p.age++; // growth and decline happen week by week in training (src/training.js)
      offseason(p);
      return p;
    });
  }
  for (const p of s.market) delete p.stats;
  const kept = sample(rng, s.market, MARKET_KEEP).filter(p => p.age < RETIRE_AGE);
  for (const p of kept) { ageOneYear(rng, p); offseason(p); }
  s.market = [...kept, ...Array.from({ length: MARKET_SIZE - kept.length }, () => newFreeAgent(rng, s.nid++))];
  scheduleSeason(s, rng);
  s.seed = rng.seed;
  s.season++;
  if (s.me !== null) fixLineup(s);
}
