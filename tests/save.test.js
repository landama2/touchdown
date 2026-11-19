import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, BOARD_START, REP_START } from '../src/world.js';
import { MINI } from './fixtures/mini.js';
import { startCareer } from '../src/career.js';
import { takeClub, kickOff, playDay, endSeason, table } from '../src/season.js';
// A save as Phase 3 (version 4) wrote it: league rounds instead of a calendar; no cup, play-offs or records.
function asV4(s, round) {
  const o = JSON.parse(serialize(s));
  o.version = 4; o.round = round;
  for (const k of ['days', 'next', 'day', 'cup', 'playoffs', 'records']) delete o[k];
  for (const c of o.clubs) delete c.rec;
  o.history = o.history.map(h => ({ season: h.season, champions: h.divs.map(d => o.clubs[d.champion].name), pos: h.pos, prize: h.prize }));
  return o;
}
const games = s => s.clubs.reduce((t, c) => t + c.st.p, 0);
import { stepMinute } from '../src/match.js';
import { serialize, deserialize, SAVE_VERSION, KEY, SLOTS, slotKey } from '../src/save.js';
import { BENCH, slots, newFam } from '../src/lineup.js';
import { defaultTactics } from '../src/tactics.js';
import { freshState } from '../src/player.js';
import { defaultTraining } from '../src/training.js';

test('a career survives a save/load round trip and continues identically', () => {
  const a = createWorld(21, MINI);
  takeClub(a, 3);
  playDay(a);
  const b = deserialize(serialize(a));
  assert.deepEqual(b, a);
  playDay(a); playDay(b);
  assert.deepEqual(b, a);
});

test('save slots have their own keys, apart from the autosave', () => {
  const keys = Array.from({ length: SLOTS }, (_, k) => slotKey(k + 1));
  assert.equal(new Set([KEY, ...keys]).size, SLOTS + 1);
});

test('deserialize returns null for missing, corrupt or wrong-version saves', () => {
  assert.equal(deserialize(null), null);
  assert.equal(deserialize(''), null);
  assert.equal(deserialize('{not json'), null);
  assert.equal(deserialize('42'), null);
  assert.equal(deserialize(JSON.stringify({ version: SAVE_VERSION + 1 })), null);
  assert.equal(deserialize(JSON.stringify({ teams: [] })), null); // the old demo's save shape
  assert.equal(deserialize('{"version":1}'), null); // right version, wrong shape
  assert.equal(deserialize(serialize({ ...createWorld(1, MINI), me: 999 })), null); // dangling club index
  assert.equal(deserialize(serialize({ ...createWorld(1, MINI), training: { ...defaultTraining(), ind: null } })), null); // null is not an object here
  const nobooks = createWorld(1, MINI); delete nobooks.clubs[0].fin;
  assert.equal(deserialize(serialize(nobooks)), null); // books missing
  assert.equal(deserialize(serialize({ ...createWorld(1, MINI), offers: undefined })), null); // market missing
  assert.equal(deserialize(serialize({ ...createWorld(1, MINI), known: undefined })), null); // scouting missing
  assert.equal(deserialize(serialize({ ...createWorld(1, MINI), youth: undefined })), null); // staff and youth missing
  assert.equal(deserialize(serialize({ ...createWorld(1, MINI), inbox: undefined })), null); // career missing
  const noContract = createWorld(1, MINI); noContract.clubs[0].players[0].contract = null;
  assert.equal(deserialize(serialize(noContract)), null); // a squad player without a contract
});

test('a career saved in the middle of a live match resumes identically', () => {
  const a = createWorld(22, MINI);
  takeClub(a, 6);
  kickOff(a);
  for (let k = 0; k < 40; k++) stepMinute(a.live);
  const b = deserialize(serialize(a));
  assert.deepEqual(b, a);
  for (const s of [a, b]) { while (!s.live.done) stepMinute(s.live); playDay(s); }
  assert.deepEqual(b, a);
});

test('a version 2 save loads: the live match slot is added and old results are dropped', () => {
  const s = createWorld(23, MINI);
  takeClub(s, 2);
  playDay(s); // round 0 of every division
  const old = { ...asV4(s, 1), version: 2, last: [[{ h: 0, a: 1, hg: 1, ag: 0, ev: [{ min: 5, club: 0, name: 'X' }] }]] };
  delete old.live; delete old.bench; delete old.tactics; delete old.fam;
  const b = deserialize(JSON.stringify(old));
  assert.equal(b.version, SAVE_VERSION);
  assert.equal(b.live, null);
  assert.equal(b.last, null);
  const before = games(b);
  playDay(b);
  assert.ok(games(b) > before);
});

test('a version 3 save loads with default tactics, also in a match in progress', () => {
  const s = createWorld(24, MINI);
  takeClub(s, 1);
  kickOff(s);
  for (let k = 0; k < 30; k++) stepMinute(s.live);
  const old = asV4(s, 0);
  old.version = 3;
  old.formation = '4-3-3'; old.lineup = [];
  delete old.bench; delete old.tactics; delete old.fam;
  for (const S of old.live.sides) { delete S.tac; delete S.takers; delete S.fam; for (const o of S.on) { delete o.role; delete o.duty; delete o.shoot; delete o.tackle; } }
  const b = deserialize(JSON.stringify(old));
  assert.equal(b.version, SAVE_VERSION);
  assert.deepEqual(b.tactics, defaultTactics(slots(b.formation)));
  assert.equal(b.fam['4-3-3'], 1);
  assert.equal(b.fam['3-5-2'], 0.5);
  assert.equal(b.live, null); // version 5: a match in progress starts again
  playDay(b);
  assert.equal(b.next, 1);
  assert.equal(b.bench.length, BENCH);
});

test('a version 4 save in mid-season: the rest of the league on the calendar, play-offs, no cup until next season', () => {
  const s = createWorld(25, MINI);
  takeClub(s, 6);
  const old = asV4(s, 5);
  old.history = [{ season: 0, champions: ['Bravo', 'Golf', 'Gone FC'], pos: 3, prize: 1 }];
  const b = deserialize(JSON.stringify(old));
  assert.equal(b.version, SAVE_VERSION);
  assert.deepEqual([b.cup, b.round, b.live, b.last], [null, undefined, null, null]);
  assert.deepEqual(b.history[0].divs.map(d => d.champion), [1, 6, null]);
  assert.equal(b.history[0].div, 1);
  const leagueItems = b.days.flatMap(d => d.items).filter(i => i.comp === 'league');
  assert.equal(leagueItems.length, (6 - 5) + (18 - 5) + (10 - 5));
  assert.ok(leagueItems.every(i => i.round >= 5));
  while (!b.done) playDay(b);
  assert.ok(b.playoffs[1] && b.playoffs[2]);
  endSeason(b);
  assert.equal(b.history[1].cup, null);
  assert.equal(b.cup.rounds.length, 1); // next season has a cup again
  const done = asV4(s, 5); done.done = true;
  const c = deserialize(JSON.stringify(done));
  assert.equal(c.done, true);
  endSeason(c); // no play-offs were played: 3rd place goes up instead
  assert.equal(c.history[0].divs[1].up.length, 3);
});

// A save as Phase 4 (version 5) wrote it: no squad dynamics and no training.
function asV5(s) {
  const o = JSON.parse(serialize(s));
  o.version = 5;
  delete o.training; delete o.news;
  for (const p of [...o.clubs.flatMap(c => c.players), ...o.market]) for (const k of Object.keys(freshState())) delete p[k];
  return o;
}

test('a version 5 save gets fresh players and default training, and plays on', () => {
  const a = createWorld(22, MINI);
  takeClub(a, 3);
  playDay(a);
  const b = deserialize(JSON.stringify(asV5(a)));
  assert.equal(b.version, SAVE_VERSION);
  assert.deepEqual(b.training, defaultTraining());
  assert.deepEqual(b.news, []);
  for (const p of [...b.clubs[3].players, ...b.market]) for (const [k, v] of Object.entries(freshState())) assert.deepEqual(p[k], v, k);
  assert.ok(playDay(b).length);
});

test('a live match saved by version 5 carries on without readiness', () => {
  const a = createWorld(23, MINI);
  takeClub(a, 3);
  const m = kickOff(a);
  for (let k = 0; k < 20; k++) stepMinute(m);
  const o = asV5(a);
  for (const p of Object.values(o.live.pl)) delete p.edge;
  const b = deserialize(JSON.stringify(o));
  while (!b.live.done) stepMinute(b.live);
  assert.ok(playDay(b).some(r => r.h === 3 || r.a === 3));
});

// A save as Phase 5 (version 6) wrote it: no contracts, no books, no wage budget.
function asV6(s) {
  const o = JSON.parse(serialize(s));
  o.version = 6;
  delete o.wageBudget;
  for (const c of o.clubs) { delete c.fin; for (const p of c.players) delete p.contract; }
  for (const p of o.market) delete p.contract;
  return o;
}

test('a version 6 save gets contracts, books and budgets, and plays on', () => {
  const a = createWorld(24, MINI);
  takeClub(a, 3);
  playDay(a);
  const b = deserialize(JSON.stringify(asV6(a)));
  assert.equal(b.version, SAVE_VERSION);
  for (const c of b.clubs) {
    assert.ok(Number.isInteger(c.fin.balance) && c.fin.season.wages === 0);
    for (const p of c.players) assert.ok(p.contract.wage > 0 && p.contract.until >= b.season && p.contract.until <= b.season + 3);
  }
  assert.ok(b.market.every(p => p.contract === null));
  assert.ok(b.wageBudget === undefined && b.budget >= 0);
  assert.ok(playDay(b).length);
});

// A save as Phase 6 (version 7) wrote it: no offers, talks, deals or loans.
function asV7(s) {
  const o = JSON.parse(serialize(s));
  o.version = 7;
  delete o.offers; delete o.talks; delete o.deals;
  for (const c of o.clubs) delete c.lentPay;
  return o;
}

test('a version 7 save opens the transfer market and plays on', () => {
  const a = createWorld(25, MINI);
  takeClub(a, 3);
  playDay(a);
  const b = deserialize(JSON.stringify(asV7(a)));
  assert.equal(b.version, SAVE_VERSION);
  assert.deepEqual([b.offers, b.talks, b.deals], [[], { win: null, by: {} }, []]);
  assert.ok(b.clubs.every(c => c.lentPay === 0));
  assert.ok(playDay(b).length);
});

// A save as Phase 7 (version 8) wrote it: no scouting.
function asV8(s) {
  const o = JSON.parse(serialize(s));
  o.version = 8;
  delete o.known; delete o.scouts; delete o.shortlist;
  return o;
}

test('a version 8 save gets scouts and an empty notebook, and plays on', () => {
  const a = createWorld(26, MINI);
  takeClub(a, 14);
  playDay(a);
  const b = deserialize(JSON.stringify(asV8(a)));
  assert.equal(b.version, SAVE_VERSION);
  assert.deepEqual([b.known, b.shortlist], [{}, []]);
  assert.deepEqual(b.scouts, a.scouts.map(() => ({ task: null, days: 0 })));
  assert.ok(b.scouts.length > 0 && playDay(b).length);
});

// A save as Phase 8 (version 9) wrote it: no staff, no youth squad, no staff line in the ledger.
function asV9(s) {
  const o = JSON.parse(serialize(s));
  o.version = 9;
  delete o.youth;
  for (const c of o.clubs) { delete c.staff; delete c.fin.season.staff; }
  return o;
}

test('a version 9 save gets standard staff and an empty youth squad, and plays on', () => {
  const a = createWorld(27, MINI);
  takeClub(a, 14);
  playDay(a);
  const b = deserialize(JSON.stringify(asV9(a)));
  assert.equal(b.version, SAVE_VERSION);
  assert.deepEqual(b.youth, []);
  assert.deepEqual(b.clubs.map(c => c.staff), a.clubs.map(c => c.staff));
  assert.ok(b.clubs.every(c => c.fin.season.staff === 0));
  assert.ok(playDay(b).length);
});

// A save as Phase 9 (version 10) wrote it: no boards, no career, no vacancies, no inbox.
function asV10(s) {
  const o = JSON.parse(serialize(s));
  o.version = 10;
  for (const k of ['career', 'jobs', 'inbox']) delete o[k];
  for (const c of o.clubs) { delete c.conf; delete c.games; }
  return o;
}

test('a version 10 save gets boards, a career at its club and an empty inbox, and plays on', () => {
  const a = createWorld(28, MINI);
  takeClub(a, 9);
  playDay(a);
  const b = deserialize(JSON.stringify(asV10(a)));
  assert.equal(b.version, SAVE_VERSION);
  assert.ok(b.clubs.every(c => c.conf === BOARD_START && c.games === c.st.p));
  assert.deepEqual(b.career, { rep: REP_START, asked: null, warned: null, spells: [{ club: 9, from: a.season, to: null, how: null }], money: 0, shares: {} });
  assert.deepEqual([b.jobs, b.inbox], [[], []]);
  assert.ok(playDay(b).length);
  const picker = deserialize(JSON.stringify(asV10(createWorld(28, MINI))));
  assert.equal(picker.career, null); // no club picked yet: the club picker, not a career
});

// A save as Phase 10 (version 11) wrote it: no per-player intensity, no manager's money, no dividends in the books.
test('a version 11 save gets team intensity for all, a manager with no money yet, and plays on', () => {
  const a = createWorld(28, MINI);
  startCareer(a, 9);
  const o = JSON.parse(serialize(a));
  o.version = 11;
  delete o.training.load; delete o.career.money; delete o.career.shares; delete o.career.spells[0].salary;
  for (const c of o.clubs) delete c.fin.season.dividends;
  const b = deserialize(JSON.stringify(o));
  assert.equal(b.version, SAVE_VERSION);
  assert.deepEqual([b.training.load, b.career.money, b.career.shares], [{}, 0, {}]);
  assert.ok(b.clubs.every(c => c.fin.season.dividends === 0));
  while (b.day < 7) playDay(b);
  assert.ok(b.career.money > 0 && b.career.spells[0].salary > 0); // the salary is set when first paid
});

// A save as Phase 10b (version 12) wrote it: a wage budget, and wages five times today's.
test('a version 12 save loses its wage budget and its wages fall to a fifth', () => {
  const a = createWorld(25, MINI);
  takeClub(a, 3);
  const o = JSON.parse(serialize(a));
  o.version = 12; o.wageBudget = 1e6;
  for (const c of o.clubs) { c.lentPay = 5000; for (const p of c.players) p.contract.wage *= 5; }
  const b = deserialize(JSON.stringify(o));
  assert.equal(b.version, SAVE_VERSION);
  assert.equal(b.wageBudget, undefined);
  for (const [k, c] of b.clubs.entries()) {
    assert.equal(c.lentPay, 1000);
    c.players.forEach((p, i) => assert.equal(p.contract.wage, a.clubs[k].players[i].contract.wage));
  }
  assert.ok(playDay(b).length);
});
