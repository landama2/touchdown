import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, MARKET_SIZE } from '../src/world.js';
import { FORMATIONS, BENCH, slots, bestXI, autoBench, fixLineup, strength, swap, newFam, learnFam } from '../src/lineup.js';
import { takeClub, myClub, myFixture, upcoming, kickOff, playDay, table, endSeason } from '../src/season.js';
import { cupRounds } from '../src/cup.js';
import { stepMinute, matchResult } from '../src/match.js';
import { MINI } from './fixtures/mini.js';

const world = seed => createWorld(seed, MINI);

test('slots has 11 entries starting with GK for every formation', () => {
  for (const f of Object.keys(FORMATIONS)) {
    assert.equal(slots(f).length, 11);
    assert.equal(slots(f)[0], 'GK');
  }
});

test('bestXI picks 11 distinct players with a goalkeeper in goal', () => {
  const s = world(1), club = s.clubs[0];
  for (const f of Object.keys(FORMATIONS)) {
    const ids = bestXI(club, f);
    assert.equal(new Set(ids).size, 11);
    assert.equal(club.players.find(p => p.id === ids[0]).pos, 'GK');
    const st = strength(club, ids, f);
    assert.ok(Number.isFinite(st.att) && Number.isFinite(st.def) && st.att > 0 && st.def > 0);
  }
});

test('fixLineup repairs a lineup that references a missing player', () => {
  const s = world(2);
  takeClub(s, 5);
  const gone = s.lineup[3];
  myClub(s).players = myClub(s).players.filter(p => p.id !== gone);
  fixLineup(s);
  assert.equal(new Set(s.lineup).size, 11);
  assert.ok(!s.lineup.includes(gone));
});

test('a full season: every club plays everyone home and away, stats are consistent', () => {
  const s = world(4);
  takeClub(s, 6);
  const budget0 = s.budget, seed0 = s.seed;
  playDay(s);
  assert.notEqual(s.seed, seed0);
  while (!s.done) assert.ok(playDay(s).every(r => r.item && s.days[s.next - 1].items.some(i => i.comp === r.item.comp)));
  assert.equal(s.next, s.days.length);
  assert.equal(s.day, s.days.at(-1).day);
  assert.equal(playDay(s), null);
  assert.ok(s.budget > budget0);
  assert.ok(s.budget - budget0 <= 2 * budget0, `income ${s.budget - budget0} vs start ${budget0}`);
  s.divisions.forEach((d, i) => {
    const games = 2 * (d.clubIds.length - 1);
    const st = d.clubIds.map(id => s.clubs[id].st), sum = k => st.reduce((t, x) => t + x[k], 0);
    assert.ok(st.every(x => x.p === games && x.p === x.w + x.d + x.l && x.pts === 3 * x.w + x.d));
    assert.equal(sum('w'), sum('l'));
    assert.equal(sum('gf'), sum('ga'));
    const tb = table(s, i);
    assert.deepEqual([...tb].sort((a, b) => a - b), d.clubIds);
    for (let k = 1; k < tb.length; k++) assert.ok(s.clubs[tb[k - 1]].st.pts >= s.clubs[tb[k]].st.pts);
  });
});

test('the calendar: days with no match for you, a day can hold several competitions', () => {
  const s = world(9);
  takeClub(s, 0); // a top club: a bye in the cup's preliminary round
  let idle = 0, mine = 0;
  while (!s.done) {
    const f = myFixture(s), today = s.days[s.next];
    if (f) { mine++; assert.ok(today.items.includes(f.item)); assert.ok(f.h === 0 || f.a === 0); } else idle++;
    playDay(s);
  }
  assert.ok(idle > 0 && mine >= 6, `${mine} matches, ${idle} days off`);
  assert.equal(myFixture(s), null);
  assert.ok(s.days.some(d => new Set(d.items.map(i => i.comp)).size > 1 || d.items.length > 1));
});

test('myFixture returns the human club\'s next match with its calendar item', () => {
  const s = world(10);
  takeClub(s, 7);
  const f = myFixture(s);
  assert.ok(f.h === 7 || f.a === 7);
  assert.deepEqual(f.item, { comp: 'league', div: 1, round: 0 });
  assert.ok(s.divisions[1].fixtures[0].some(m => m[0] === f.h && m[1] === f.a));
  assert.equal(f.neutral, false);
});

test('endSeason rolls over; three seasons keep squads intact', () => {
  const s = world(5);
  takeClub(s, 0);
  endSeason(s); // not done yet: no-op
  assert.equal(s.season, 1);
  for (let y = 1; y <= 3; y++) {
    while (!s.done) playDay(s);
    const seedBefore = s.seed;
    endSeason(s);
    assert.notEqual(s.seed, seedBefore);
    assert.equal(s.season, y + 1);
    assert.deepEqual([s.next, s.day, s.done, s.last], [0, -1, false, null]);
    assert.equal(s.history.length, y);
    const h = s.history[y - 1];
    assert.equal(h.divs.length, 3);
    assert.ok(h.pos >= 1 && h.pos <= MINI[h.div].clubs.length);
    assert.deepEqual(s.divisions.map(d => d.clubIds.length), [4, 10, 6]);
    assert.ok(s.clubs.every(c => c.players.length === 18 && c.st.p === 0 && c.players.every(p => p.age <= 35)));
    assert.equal(new Set(s.lineup).size, 11);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('prize money uses the size of the human club\'s division', () => {
  const s = world(12);
  takeClub(s, 0); // 4-club division, tier 3
  while (!s.done) playDay(s);
  const pos = table(s, 0).indexOf(0) + 1, before = s.budget;
  endSeason(s);
  assert.equal(s.history[0].prize, (4 + 1 - pos) * 40e3 * 3 + (s.history[0].cup.winner === 0 ? 500e3 : 0));
  assert.equal(s.budget, before + s.history[0].prize);
});

test('same seed and same choices give the same career; works with no human club', () => {
  const run = () => { const s = world(6); while (!s.done) playDay(s); endSeason(s); return s; };
  assert.deepEqual(run(), run());
});

test("free agents: half of last season's list stays, a year older; the rest are new", () => {
  const s = world(8);
  const ageBefore = new Map(s.market.map(p => [p.id, p.age]));
  while (!s.done) playDay(s);
  endSeason(s);
  assert.equal(s.market.length, MARKET_SIZE);
  assert.equal(new Set(s.market.map(p => p.id)).size, MARKET_SIZE);
  const kept = s.market.filter(p => ageBefore.has(p.id));
  assert.equal(kept.length, MARKET_SIZE / 2); // nobody on a fresh list is old enough to retire yet
  for (const p of kept) assert.equal(p.age, ageBefore.get(p.id) + 1);
});

test('free agents at retirement age leave the list', () => {
  const s = world(8);
  for (const p of s.market) p.age = 35;
  const old = new Set(s.market.map(p => p.id));
  while (!s.done) playDay(s);
  endSeason(s);
  assert.equal(s.market.length, MARKET_SIZE);
  assert.ok(s.market.every(p => !old.has(p.id)));
});

test('a live match: kick off, play it minute by minute, and the round records exactly that result', () => {
  const s = world(13);
  takeClub(s, 6); // Middle League
  const m = kickOff(s);
  assert.equal(kickOff(s), m); // already started: the same match comes back
  assert.equal(m.sides.find(S => !S.auto).club, 6);
  while (!m.done) stepMinute(m);
  const want = matchResult(m), res = playDay(s);
  assert.equal(s.live, null);
  assert.deepEqual(res.find(r => r.h === 6 || r.a === 6), { ...want, item: { comp: 'league', div: 1, round: 0 } });
  assert.equal(s.clubs[6].st.gf, want.h === 6 ? want.hg : want.ag);
  assert.equal(s.next, 1);
});

test('playing the round during a live match hands the rest of it to the assistant', () => {
  const s = world(14);
  takeClub(s, 6);
  const m = kickOff(s);
  for (let k = 0; k < 30; k++) stepMinute(m);
  const res = playDay(s);
  const mine = res.find(r => r.h === 6 || r.a === 6);
  assert.equal(mine.ev.length, m.ev.length);
  assert.ok(m.done && m.sides.every(S => S.auto));
  assert.equal(s.live, null);
  assert.equal(s.clubs[6].st.p, 1);
});

test('kickOff does nothing when the human club has no fixture', () => {
  const s = world(9);
  takeClub(s, 0);
  while (myFixture(s)) playDay(s); // to the first day without a match for club 0
  assert.equal(kickOff(s), null);
  assert.equal(s.live, null);
});

test('autoBench picks seven squad players outside the XI, a keeper first', () => {
  const s = world(1), club = s.clubs[0], ids = bestXI(club, '4-4-2'), bench = autoBench(club, ids);
  assert.equal(bench.length, BENCH);
  assert.equal(new Set(bench).size, BENCH);
  assert.ok(bench.every(id => !ids.includes(id) && club.players.some(p => p.id === id)));
  assert.equal(club.players.find(p => p.id === bench[0]).pos, 'GK');
});

test('fixLineup repairs the bench and the slot tactics', () => {
  const s = world(2);
  takeClub(s, 5);
  assert.equal(s.bench.length, BENCH);
  const [sold] = s.bench;
  myClub(s).players = myClub(s).players.filter(p => p.id !== sold);
  s.bench.push(s.bench[1], s.lineup[0]); // a duplicate and a starter
  s.tactics.slots[8].role = 'Winger';
  s.formation = '4-3-3';
  fixLineup(s);
  assert.equal(s.bench.length, myClub(s).players.length - 11); // 17 players left: room for six
  assert.equal(new Set(s.bench).size, s.bench.length);
  assert.ok(!s.bench.includes(sold) && s.bench.every(id => !s.lineup.includes(id)));
  assert.equal(s.tactics.slots[8].role, 'Striker'); // slot 8 is a forward in 4-3-3
});

test('swap moves players between the XI, the bench and the reserves', () => {
  const s = world(3);
  takeClub(s, 0);
  myClub(s).players.push(s.market.pop()); // test squads hold 18: XI + bench, so add a reserve
  const reserve = myClub(s).players.find(p => !s.lineup.includes(p.id) && !s.bench.includes(p.id)).id;
  const [x, y, b] = [s.lineup[4], s.lineup[7], s.bench[2]];
  swap(s, x, y);
  assert.deepEqual([s.lineup[4], s.lineup[7]], [y, x]);
  swap(s, y, b);
  assert.deepEqual([s.lineup[4], s.bench[2]], [b, y]);
  swap(s, reserve, y);
  assert.equal(s.bench[2], reserve);
  assert.ok(!s.lineup.includes(y) && !s.bench.includes(y));
});

test('familiarity: each match teaches the formation played; the others fade to a floor of 0.5', () => {
  const fam = newFam();
  assert.deepEqual(fam, { '4-4-2': 1, '4-3-3': 0.5, '3-5-2': 0.5, '5-3-2': 0.5, '4-5-1': 0.5 });
  learnFam(fam, '4-3-3');
  assert.deepEqual(fam, { '4-4-2': 0.98, '4-3-3': 0.6, '3-5-2': 0.5, '5-3-2': 0.5, '4-5-1': 0.5 });
  for (let k = 0; k < 9; k++) learnFam(fam, '4-3-3');
  assert.equal(fam['4-3-3'], 1);
  assert.equal(fam['4-4-2'], 0.8);
});

test('your tactics reach your match, and playing teaches the formation', () => {
  const s = world(4);
  takeClub(s, 6);
  s.formation = '4-3-3';
  fixLineup(s);
  s.tactics.mentality = 1;
  s.tactics.slots[6].role = 'Playmaker';
  s.tactics.takers.pen = s.lineup[9];
  const m = kickOff(s), S = m.sides.find(x => !x.auto);
  assert.equal(S.tac.mentality, 1);
  assert.equal(S.on[6].role, 'Playmaker');
  assert.equal(S.takers.pen, s.lineup[9]);
  assert.deepEqual(S.bench, s.bench);
  assert.equal(S.fam['4-3-3'], 0.5);
  s.tactics.mentality = -2; // changes after kick-off stay out of the running match
  assert.equal(S.tac.mentality, 1);
  playDay(s);
  assert.equal(s.fam['4-3-3'], 0.6);
});

const season = (seed, me = null) => { const s = world(seed); if (me !== null) takeClub(s, me); while (!s.done) playDay(s); return s; };

test('the cup: every club enters, the weakest in a preliminary round, one winner after a neutral final', () => {
  const s = world(15), n = s.clubs.length; // 20 clubs: 4 preliminary ties, then 16
  assert.equal(s.cup.rounds[0].ties.length, n - 16);
  assert.deepEqual([...s.cup.byes, ...s.cup.rounds[0].ties.flatMap(t => [t.h, t.a])].sort((a, b) => a - b), s.clubs.map(c => c.id));
  const prelim = s.cup.rounds[0].ties.flatMap(t => [t.h, t.a]);
  assert.ok(s.divisions[2].clubIds.every(id => prelim.includes(id)) && prelim.every(id => s.clubs[id].div > 0), 'the weakest clubs play the preliminary round');
  const finals = [];
  while (!s.done) for (const r of playDay(s)) if (r.item.comp === 'cup' && r.item.round === cupRounds(n) - 1) finals.push(r);
  assert.equal(s.cup.rounds.length, cupRounds(n));
  for (const rd of s.cup.rounds) for (const t of rd.ties) {
    assert.ok(t.w === t.h || t.w === t.a);
    assert.equal(t.legs.length, 1);
    assert.equal(t.pens !== null, t.legs[0][0] === t.legs[0][1]); // penalties exactly when level
  }
  assert.equal(s.cup.rounds.at(-1).ties.length, 1);
  assert.equal(finals.length, 1);
  endSeason(s);
  const final = s.history[0].cup;
  assert.ok(final.winner !== final.runnerUp && [final.winner, final.runnerUp].includes(finals[0].h));
});

test('play-offs: 3rd-6th, two legs with the higher seed at home second, a final; the winner goes up', () => {
  const s = world(16);
  const legs = [];
  while (!s.done) for (const r of playDay(s)) if (r.item.comp === 'playoff') legs.push(r);
  for (const d of [1, 2]) {
    const p = s.playoffs[d], [semi1, semi2] = p.rounds[0].ties, final = p.rounds[1].ties[0];
    assert.ok([semi1, semi2, final].every(t => t.w === t.h || t.w === t.a));
    assert.deepEqual([semi1.legs.length, semi2.legs.length, final.legs.length], [2, 2, 1]);
    const first = legs.find(r => r.item.div === d && r.item.round === 0 && r.item.leg === 0 && (r.h === semi1.a));
    assert.equal(first.a, semi1.h, 'lower seed at home in the first leg');
    assert.deepEqual([final.h, final.a], [semi1.w, semi2.w]);
  }
  const tables = s.divisions.map((_, d) => table(s, d));
  assert.deepEqual(s.playoffs[1].rounds[0].ties.map(t => [t.h, t.a]), [[tables[1][2], tables[1][5]], [tables[1][3], tables[1][4]]]);
  const winners = [1, 2].map(d => s.playoffs[d].rounds[1].ties[0].w);
  endSeason(s);
  const h = s.history[0];
  for (const d of [1, 2]) {
    assert.deepEqual(h.divs[d].up, [tables[d][0], tables[d][1], winners[d - 1]]);
    assert.equal(h.divs[d].playoff, winners[d - 1]);
    for (const id of h.divs[d].up) assert.equal(s.clubs[id].div, d - 1);
  }
});

test('promotion and relegation: three up and three down at each boundary, none down from the bottom', () => {
  const s = season(17), tables = s.divisions.map((_, d) => table(s, d));
  endSeason(s);
  const h = s.history[0];
  assert.deepEqual(h.divs.map(x => [x.up.length, x.down.length]), [[0, 3], [3, 3], [3, 0]]);
  assert.deepEqual(h.divs[0].down, tables[0].slice(-3));
  for (const id of h.divs[0].down) assert.equal(s.clubs[id].div, 1);
  for (const id of h.divs[1].down) assert.equal(s.clubs[id].div, 2);
  assert.deepEqual(s.divisions.map(d => d.clubIds.length), [4, 10, 6]);
  s.divisions.forEach((d, i) => assert.ok(d.clubIds.every(id => s.clubs[id].div === i)));
  assert.equal(new Set(s.divisions.flatMap(d => d.clubIds)).size, s.clubs.length);
  assert.deepEqual(s.divisions.map(d => d.fixtures.length), [6, 18, 10]);
});

test('awards and records: the season\'s best players and the biggest numbers are kept', () => {
  const s = season(18), tables = s.divisions.map((_, d) => table(s, d));
  const players = s.clubs.flatMap(c => c.players.filter(p => p.stats).map(p => ({ p, c })));
  for (const [d, dv] of s.divisions.entries()) {
    const mine = players.filter(x => dv.clubIds.includes(x.c.id));
    const goals = mine.reduce((t, x) => t + x.p.stats.goals, 0), scored = dv.clubIds.reduce((t, id) => t + s.clubs[id].st.gf, 0);
    assert.equal(goals, scored, 'every league goal has a scorer');
  }
  const top = players.filter(x => x.c.div === 1).reduce((b, x) => !b || x.p.stats.goals > b.p.stats.goals ? x : b, null);
  const champPts = s.clubs[tables[0][0]].st.pts, topGoals = top.p.stats.goals;
  endSeason(s);
  const aw = s.history[0].divs[1].awards;
  assert.equal(aw.scorer.v, topGoals);
  assert.ok(aw.player && aw.player.v >= 3 && aw.player.v <= 10);
  assert.deepEqual(s.records[0].points, { v: champPts, club: tables[0][0], season: 1 });
  assert.equal(s.records[1].goals.v, aw.scorer.v);
  assert.ok(s.records[1].win.hg !== s.records[1].win.ag);
  assert.ok(s.clubs.some(c => c.rec.win) && s.clubs.some(c => c.rec.goals));
  assert.ok(s.clubs.every(c => c.players.every(p => p.stats === undefined)), 'season stats are cleared');
});

test('weekly income: one payment per week of the season, whatever the number of matches', () => {
  const s = world(19);
  takeClub(s, 0); // top division: tier 3
  const start = s.budget;
  let gates = 0;
  while (!s.done) for (const r of playDay(s)) if (r.h === 0 && !(r.item.comp === 'cup' && r.item.round === cupRounds(s.clubs.length) - 1)) gates++;
  const weeks = Math.floor(s.days.at(-1).day / 7) + 1;
  assert.equal(s.budget - start, weeks * 25e3 * 3 + gates * 20e3 * 3);
});

test('upcoming lists the next matches of the human club in date order, cup ties once drawn', () => {
  const s = world(20);
  takeClub(s, 16); // bottom division: in the cup's preliminary round
  const next = upcoming(s, 5);
  assert.equal(next.length, 5);
  const f = myFixture(s);
  assert.deepEqual([next[0].day, next[0].h, next[0].a, next[0].item, next[0].neutral], [s.days[0].day, f.h, f.a, f.item, false]);
  assert.ok(next.every((x, k) => (x.h === 16 || x.a === 16) && (k === 0 || x.day >= next[k - 1].day)));
  assert.ok(next.some(x => x.item.comp === 'cup'), 'the preliminary round is drawn at the start of the season');
  assert.deepEqual(upcoming({ ...s, me: null }, 5), []);
});
