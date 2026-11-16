import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { MINI } from './fixtures/mini.js';
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
import { serialize, deserialize, SAVE_VERSION } from '../src/save.js';
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
  assert.equal(deserialize(serialize({ ...createWorld(1, MINI), wageBudget: undefined })), null); // books missing
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
  assert.ok(b.wageBudget > 0 && b.budget >= 0);
  assert.ok(playDay(b).length);
});
