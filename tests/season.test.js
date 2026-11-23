import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, MARKET_SIZE } from '../src/world.js';
import { FORMATIONS, BENCH, slots, bestXI, autoBench, autoPick, fixLineup, strength, swap, newFam, learnFam } from '../src/lineup.js';
import { available } from '../src/squad.js';
import { setTraining } from '../src/training.js';
import { takeClub, myClub, myFixture, upcoming, kickOff, playDay, table, zone, endSeason } from '../src/season.js';
import { ranking } from '../src/awards.js';
import { serialize, deserialize } from '../src/save.js';
import { cupRounds, aggregate } from '../src/cup.js';
import { stepMinute, matchResult, setFormation } from '../src/match.js';
import { SEASON_WEEKS, BROADCAST, MERIT, CUP_PRIZE, rankPrize, sponsorship, gate, wageBill } from '../src/finance.js';
import { MIN_SQUAD, MAX_SQUAD, buy } from '../src/transfers.js';
import { lend } from '../src/market.js';
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

test('fixLineup puts an injured or banned player back in his place once he is available', () => {
  const s = world(2);
  takeClub(s, 5);
  const p = myClub(s).players.find(x => x.id === s.lineup[3]), q = myClub(s).players.find(x => x.id === s.bench[2]);
  p.inj = { name: 'knock', days: 3 }; q.ban = 1;
  fixLineup(s);
  assert.ok(!s.lineup.includes(p.id) && !s.bench.includes(q.id));
  delete p.inj; q.ban = 0;
  fixLineup(s);
  assert.equal(s.lineup[3], p.id);
  assert.equal(s.bench[2], q.id);
  assert.equal(new Set([...s.lineup, ...s.bench]).size, 11 + s.bench.length);
  p.inj = { name: 'knock', days: 3 };
  fixLineup(s);
  swap(s, s.lineup[3], s.lineup[4]); // the manager moves the stand-in: the place stays covered
  delete p.inj;
  fixLineup(s);
  assert.ok(s.lineup.includes(p.id));
});

test('autoPick picks as if everyone were fit: an injured star gets his place back', () => {
  const s = world(2);
  takeClub(s, 5);
  autoPick(s);
  const star = myClub(s).players.find(x => x.id === s.lineup[5]), at = s.lineup.indexOf(star.id);
  star.inj = { name: 'knock', days: 3 };
  autoPick(s);
  assert.ok(!s.lineup.includes(star.id));
  delete star.inj;
  fixLineup(s);
  assert.equal(s.lineup[at], star.id);
});

test('the bench has one keeper and every position when the squad allows', () => {
  const s = world(2);
  takeClub(s, 5);
  const club = myClub(s), pos = id => club.players.find(p => p.id === id).pos;
  const keepers = () => s.bench.filter(id => pos(id) === 'GK').length;
  s.bench = s.bench.filter(id => pos(id) === 'GK'); // a bench missing its outfielders
  fixLineup(s);
  assert.equal(s.bench.length, BENCH);
  assert.equal(keepers(), 1);
  for (const x of ['DF', 'MF', 'FW']) assert.ok(s.bench.some(id => pos(id) === x), x);
  autoPick(s);
  assert.equal(keepers(), 1);
});

test('a full season: every club plays everyone home and away, stats are consistent', () => {
  const s = world(4);
  takeClub(s, 6);
  const bal0 = myClub(s).fin.balance, seed0 = s.seed;
  playDay(s);
  assert.notEqual(s.seed, seed0);
  while (!s.done) assert.ok(playDay(s).every(r => r.item && s.days[s.next - 1].items.some(i => i.comp === r.item.comp)));
  assert.equal(s.next, s.days.length);
  assert.equal(s.day, s.days.at(-1).day);
  assert.equal(playDay(s), null);
  assert.notEqual(myClub(s).fin.balance, bal0);
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
  takeClub(s, 0); // a top club: joins the cup in round 3
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
    assert.ok(s.clubs.every(c => c.players.length >= MIN_SQUAD && c.players.length <= MAX_SQUAD && c.st.p === 0 && c.players.every(p => p.age <= 35 && p.contract && p.contract.until >= s.season && (!p.loan || p.loan.until >= s.season))));
    assert.equal(new Set(s.lineup).size, 11);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('prize money: every club by final position, the cup winner and runner-up, the top 3 scorers and assisters; the season goes into History', () => {
  const s = world(12);
  takeClub(s, 0);
  while (!s.done) playDay(s);
  const tables = s.divisions.map((_, d) => table(s, d)), bal = s.clubs.map(c => c.fin.balance), final = s.cup.rounds.at(-1).ties[0];
  const ranks = s.divisions.map((_, d) => ({ goals: ranking(s, d, 'goals', 3), assists: ranking(s, d, 'assists', 3) }));
  const want = id => {
    const d = tables.findIndex(t => t.includes(id)), t = tables[d];
    const rank = ['goals', 'assists'].reduce((sum, key) => sum + ranks[d][key].reduce((x, r, k) => x + (r.club === id ? rankPrize(key, d, k) : 0), 0), 0);
    return MERIT[d] * (t.length - t.indexOf(id)) + (id === final.w ? CUP_PRIZE[0] : id === final.h || id === final.a ? CUP_PRIZE[1] : 0) + rank;
  };
  assert.ok(ranks.every(r => r.goals.length === 3 && r.assists.length === 3));
  const season = { ...myClub(s).fin.season };
  endSeason(s);
  s.clubs.forEach((c, id) => assert.equal(c.fin.balance - bal[id], want(id), c.name));
  assert.equal(s.history[0].prize, want(0));
  assert.deepEqual(s.history[0].fin, { ...season, prize: want(0), balance: s.clubs[0].fin.balance });
  assert.ok(s.clubs.every(c => c.fin.season.wages === 0 && c.fin.season.prize === 0)); // a new ledger
  assert.ok(Array.isArray(s.history[0].left));
  assert.deepEqual(s.history[0].ranks, ranks);
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
  const n = pos => bench.filter(id => club.players.find(p => p.id === id).pos === pos).length;
  assert.deepEqual([n('GK'), n('DF'), n('MF'), n('FW')], [1, 2, 2, 2]);
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

test('familiarity learns by minutes: a shape played for half a match gets half the gain', () => {
  const fam = newFam();
  learnFam(fam, { '4-4-2': 45, '4-3-3': 45 });
  assert.deepEqual(fam, { '4-4-2': 1, '4-3-3': 0.54, '3-5-2': 0.5, '5-3-2': 0.5, '4-5-1': 0.5 });
  learnFam(fam, { '4-3-3': 90 });
  assert.equal(fam['4-3-3'], 0.64); // a whole match, as with a formation name
});

test('switching formation mid-match teaches the new shape for the minutes played in it', () => {
  const s = world(4);
  takeClub(s, 6);
  fixLineup(s);
  const m = kickOff(s), i = m.sides.findIndex(x => !x.auto);
  while (m.min < 30) stepMinute(m);
  assert.equal(setFormation(m, i, '4-3-3'), null);
  playDay(s);
  assert.equal(m.sides[i].mins['4-4-2'], 30);
  assert.equal(m.sides[i].mins['4-3-3'], 60);
  assert.equal(s.fam['4-3-3'], 0.56); // 0.5 + 0.1 × 60/90 − 0.02 × 30/90
  assert.equal(s.fam['4-4-2'], 1); // its half hour outweighs the fade
});

const season = (seed, me = null) => { const s = world(seed); if (me !== null) takeClub(s, me); while (!s.done) playDay(s); return s; };

test('the cup: every club enters, the weakest first, extra time then penalties, one winner after a neutral final', () => {
  const s = world(15), n = s.clubs.length; // 20 clubs: the weakest 16 in round 1, the top 4 join in round 3
  assert.equal(s.cup.rounds[0].ties.length, 8);
  assert.deepEqual(s.cup.entries.flat().sort((a, b) => a - b), s.clubs.map(c => c.id));
  const first = s.cup.rounds[0].ties.flatMap(t => [t.h, t.a]);
  assert.ok(s.divisions[2].clubIds.every(id => first.includes(id)) && s.divisions[0].clubIds.every(id => !first.includes(id)), 'the top division joins later');
  const finals = [];
  while (!s.done) for (const r of playDay(s)) if (r.item.comp === 'cup' && r.item.round === cupRounds(n) - 1) finals.push(r);
  assert.equal(s.cup.rounds.length, cupRounds(n));
  for (const rd of s.cup.rounds) for (const t of rd.ties) {
    assert.ok(t.w === t.h || t.w === t.a);
    assert.equal(t.legs.length, 1);
    assert.equal(t.pens !== null, t.legs[0][0] === t.legs[0][1]); // penalties exactly when level after extra time
    if (t.pens) assert.ok(t.aet);
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
    assert.deepEqual(semi1.legs[0], [first.ag, first.hg], 'first leg stored in the tie\'s h/a order');
    const second = legs.find(r => r.item.div === d && r.item.round === 0 && r.item.leg === 1 && r.h === semi1.h);
    assert.deepEqual([second.a, semi1.legs[1]], [semi1.a, [second.hg, second.ag]]);
    assert.deepEqual([final.h, final.a], [semi1.w, semi2.w]);
    for (const t of [semi1, semi2, final]) { // extra time only when level after the last leg's 90 minutes, then penalties if still level
      const [x, y] = aggregate(t);
      if (t.pens) assert.ok(t.aet && x === y);
      if (!t.aet) assert.notEqual(x, y);
    }
    assert.ok(legs.filter(r => r.item.div === d && r.item.leg === 0 && r.item.round === 0).every(r => !r.aet), 'no extra time in a first leg');
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

test('weekly books: every club gets broadcast and sponsorship money and pays wages once a week; gates for home matches', () => {
  const s = world(19);
  takeClub(s, 0);
  const c = s.clubs[0], start = c.fin.balance, per = x => Math.round(x / SEASON_WEEKS);
  let gates = 0;
  while (!s.done) for (const r of playDay(s)) if (r.h === 0 && !(r.item.comp === 'cup' && r.item.round === cupRounds(s.clubs.length) - 1)) gates++;
  assert.equal(Math.floor(s.days.at(-1).day / 7) + 1, SEASON_WEEKS);
  const w = SEASON_WEEKS;
  assert.deepEqual(c.fin.season, { broadcast: w * per(BROADCAST[0]), sponsor: w * per(sponsorship(c)), gate: gates * gate(c), prize: 0, wages: w * per(wageBill(c) * 52), fees: 0, sales: 0, staff: 0, dividends: 0, build: 0 });
  assert.equal(c.fin.balance - start, c.fin.season.broadcast + c.fin.season.sponsor + c.fin.season.gate - c.fin.season.wages);
  assert.ok(s.clubs.every(x => x.fin.season.broadcast > 0 && x.fin.season.wages > 0)); // AI clubs keep books too
});

test('budgets: set when you take a club and again each season from the books', () => {
  const s = world(20);
  takeClub(s, 6);
  assert.equal(s.budget, Math.max(0, Math.round(0.75 * myClub(s).fin.balance / 1e5) * 1e5));
  assert.equal(s.wageBudget, undefined);
  while (!s.done) playDay(s);
  endSeason(s);
  assert.equal(s.budget, Math.max(0, Math.round(0.75 * myClub(s).fin.balance / 1e5) * 1e5));
});

test('upcoming lists the next matches of the human club in date order, cup ties once drawn', () => {
  const s = world(20);
  takeClub(s, 16); // bottom division: in the cup's first round
  const next = upcoming(s, 5);
  assert.equal(next.length, 5);
  const f = myFixture(s);
  assert.deepEqual([next[0].day, next[0].h, next[0].a, next[0].item, next[0].neutral], [s.days[0].day, f.h, f.a, f.item, false]);
  assert.ok(next.every((x, k) => (x.h === 16 || x.a === 16) && (k === 0 || x.day >= next[k - 1].day)));
  assert.ok(next.some(x => x.item.comp === 'cup'), 'round 1 is drawn at the start of the season');
  assert.deepEqual(upcoming({ ...s, me: null }, 5), []);
});

test('zone: promotion and play-off places below the top division, relegation above the bottom one', () => {
  const s = world(21); // divisions of 4, 10 and 6 clubs
  assert.deepEqual([0, 1, 2, 3].map(k => zone(s, 0, k)), [null, 'down', 'down', 'down']);
  assert.deepEqual([...Array(10).keys()].map(k => zone(s, 1, k)), ['up', 'up', 'playoff', 'playoff', 'playoff', 'playoff', null, 'down', 'down', 'down']);
  assert.deepEqual([...Array(6).keys()].map(k => zone(s, 2, k)), ['up', 'up', 'playoff', 'playoff', 'playoff', 'playoff']);
});

test('injured and banned players are left out of the XI and the bench; the rest of your XI stays', () => {
  const s = world(41);
  takeClub(s, 5);
  const club = myClub(s), keep = [...s.lineup];
  const hurt = club.players.find(p => p.id === s.lineup[5]), banned = club.players.find(p => p.id === s.bench[0]);
  hurt.inj = { name: 'knock', days: 3 }; banned.ban = 1;
  fixLineup(s);
  assert.ok(!s.lineup.includes(hurt.id) && !s.bench.includes(hurt.id) && !s.bench.includes(banned.id) && !s.lineup.includes(banned.id));
  assert.deepEqual(s.lineup.filter((_, k) => k !== 5), keep.filter((_, k) => k !== 5));
  assert.ok(!bestXI(club, '4-4-2').includes(hurt.id) && !autoBench(club, s.lineup).includes(banned.id));
  assert.ok([...s.lineup, ...s.bench].every(id => available(club.players.find(p => p.id === id))));
});

test('the assistant picks fresh players over tired ones', () => {
  const s = world(42), club = s.clubs[5], first = bestXI(club, '4-4-2');
  for (const p of club.players) if (first.includes(p.id)) p.cond = 0;
  const again = bestXI(club, '4-4-2');
  assert.equal(again.filter(id => !first.includes(id)).length, club.players.length - 11); // every fresh player is in
});

test('a season of squad dynamics: nobody plays while out, players get injured and come back', () => {
  const s = world(31);
  takeClub(s, 6);
  const everOut = new Set();
  let returned = 0;
  while (!s.done) {
    const out = new Set(s.clubs.flatMap(c => c.players.filter(p => !available(p)).map(p => p.id)));
    for (const r of playDay(s)) for (const x of r.ratings) {
      assert.ok(!out.has(x.id), `${x.name} played while injured or banned`);
      if (everOut.has(x.id)) returned++;
    }
    for (const id of out) everOut.add(id);
  }
  assert.ok(everOut.size > 10, `only ${everOut.size} players were ever out`);
  assert.ok(returned > 0);
});

test('news lists only your new injuries and bans; condition stays a whole number 0-100', () => {
  const s = world(32);
  takeClub(s, 6);
  let count = 0;
  for (let k = 0; k < 40 && !s.done; k++) {
    playDay(s);
    count += s.news.length;
    for (const n of s.news.filter(x => x.type === 'injury' || x.type === 'ban')) assert.ok(n.club === 6 && myClub(s).players.some(p => p.id === n.id) && ['injury', 'ban'].includes(n.type), JSON.stringify(n));
    assert.ok(s.clubs.every(c => c.players.every(p => Number.isInteger(p.cond) && p.cond >= 0 && p.cond <= 100)));
  }
  assert.ok(count > 0, 'no news in 40 days');
});

test('the random state moves on past the training draws, so the next day does not reuse them', () => {
  const s = world(35);
  takeClub(s, 6);
  let checked = 0;
  while (!s.done && checked < 5) {
    const t = deserialize(serialize(s)), gapEnd = t.days[t.next + 1]?.day, today = t.days[t.next].day;
    if (gapEnd === undefined || Math.floor(gapEnd / 7) === Math.floor(today / 7)) { playDay(s); continue; }
    t.days[t.next + 1].day = today; // the same match day with no week boundary to train in
    playDay(t);
    playDay(s);
    assert.notEqual(s.seed, t.seed, 'training drew from the generator but its state was not kept');
    checked++;
  }
  assert.ok(checked > 0);
});

test('training-injury news shows the days still left, not the days before the next match day', () => {
  const s = world(36);
  takeClub(s, 6);
  setTraining(s, 'intensity', 'Hard');
  let seen = 0;
  while (!s.done) {
    playDay(s);
    for (const n of s.news.filter(n => n.type === 'injury' && n.training)) {
      const p = myClub(s).players.find(p => p.id === n.id);
      assert.ok(p.inj, `${n.name} is already healed`);
      assert.equal(p.inj.days, n.days);
      seen++;
    }
  }
  assert.ok(seen > 0, 'no training injuries in the season');
});

test('your training schedule trains your squad, AI clubs train Balanced; the summer break resets the season', () => {
  const s = world(33);
  takeClub(s, 6);
  setTraining(s, 'focus', 'Rest');
  while (!s.done) playDay(s);
  assert.ok(myClub(s).players.every(p => p.gain === 0));
  assert.ok(s.clubs.some(c => c.id !== 6 && c.players.some(p => p.gain > 0)));
  endSeason(s);
  assert.ok(s.clubs.every(c => c.players.every(p => p.gain === 0 && p.yc === 0 && p.cond === 100 && p.sharp === 100)));
});

test('condition matters: some players start a match day still tired from the last one', () => {
  const s = world(34);
  takeClub(s, 6);
  let tired = 0;
  while (!s.done) { tired += s.clubs.reduce((t, c) => t + c.players.filter(p => p.cond < 100).length, 0); playDay(s); }
  assert.ok(tired > 616, `only ${tired} tired player-days: recovery is too fast`); // 895 at 6/5/3 a day; the old 9/8/6 gave 337; the threshold is midway
});

test('the rollover brings loans home and keeps your deals in History', () => {
  const s = world(33);
  takeClub(s, 14);
  s.budget = 1e12; s.wageBudget = 1e12;
  const me = myClub(s), kid = me.players.find(p => p.age <= 23), fa = s.market[0];
  kid.contract.until = 3;
  lend(s, kid, me, s.clubs[4]);
  assert.equal(buy(s, fa.id), null);
  while (!s.done) playDay(s);
  endSeason(s);
  assert.ok(me.players.includes(kid) && !kid.loan && me.lentPay === 0);
  assert.deepEqual(s.history[0].deals.map(d => [d.id, d.loan]).slice(0, 2), [[kid.id, true], [fa.id, false]]);
  assert.ok(s.history[0].deals.every(d => d.from === 14 || d.to === 14));
  assert.deepEqual(s.deals, []);
});
