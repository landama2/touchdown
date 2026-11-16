import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ATTRS, overall, value } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { takeClub, playDay, endSeason } from '../src/season.js';
import { MINI } from './fixtures/mini.js';
import { MAX_WIDTH, OVR_WIDTH, FADE_DAYS, YEAR, SCOUTS, TASKS, clock, fogged, knowledge, ranges, estimate, learn, prune, scoutCount, staffScouts,
  assign, recall, scoutDays, toggleShortlist, searchPlayers } from '../src/scouting.js';

// Managing Kilo (bottom division, club 14), with its scouts. Clubs 0-3 are the top division: famous, fully known.
const fresh = seed => { const s = createWorld(seed, MINI); takeClub(s, 14); staffScouts(s); return s; };
const width = r => Math.max(...Object.values(r).map(([lo, hi]) => hi - lo));

test('fog: your own players and the top division are known; the EFL and free agents are not', () => {
  const s = fresh(1), top = s.clubs[0], mid = s.clubs[4], me = s.clubs[14];
  assert.ok(!fogged(s, top.players[0], top) && !fogged(s, me.players[0], me));
  assert.ok(fogged(s, mid.players[0], mid) && fogged(s, s.market[0], null));
  assert.equal(knowledge(s, top.players[0], top), 100);
  assert.equal(knowledge(s, mid.players[0], mid), 0);
  const p = top.players[0];
  assert.deepEqual(estimate(s, p, top), { k: 100, ovr: [overall(p), overall(p)], value: [value(p), value(p)] });
});

test('ranges: always hold the true value, as wide as MAX_WIDTH unknown, exact when fully known, stable', () => {
  const s = fresh(2), c = s.clubs[5];
  for (const p of c.players) {
    const r = ranges(s, p, c);
    for (const k of ALL_ATTRS) assert.ok(r[k][0] <= p.attrs[k] && p.attrs[k] <= r[k][1] && r[k][0] >= 1 && r[k][1] <= 20, `${p.name} ${k}`);
    assert.ok(width(r) <= MAX_WIDTH && width(r) >= MAX_WIDTH - 1);
    assert.deepEqual(ranges(s, p, c), r);
    const e = estimate(s, p, c);
    assert.ok(e.ovr[0] <= overall(p) && overall(p) <= e.ovr[1] && e.value[0] <= value(p) && value(p) <= e.value[1]);
    assert.equal(e.ovr[1] - e.ovr[0], OVR_WIDTH);
  }
  const p = c.players[0];
  learn(s, [p.id], 50);
  assert.equal(width(ranges(s, p, c)), Math.round(MAX_WIDTH / 2));
  learn(s, [p.id], 100);
  assert.equal(width(ranges(s, p, c)), 0);
  assert.deepEqual(estimate(s, p, c).ovr, [overall(p), overall(p)]);
});

test('knowledge fades by 100 every FADE_DAYS; learning never lowers it; prune forgets the faded', () => {
  const s = fresh(3), c = s.clubs[6], [a, b] = c.players;
  learn(s, [a.id, b.id], 100);
  s.day += FADE_DAYS / 4;
  assert.equal(knowledge(s, a, c), 75);
  learn(s, [a.id], 50);
  assert.equal(knowledge(s, a, c), 75);
  assert.equal(clock(s), s.day);
  s.season += 2; // two seasons later (2 × YEAR days ≥ FADE_DAYS)
  assert.ok(2 * YEAR >= FADE_DAYS);
  assert.equal(knowledge(s, a, c), 0);
  prune(s);
  assert.deepEqual(s.known, {});
});

test('scouts: as many as your division allows, sent on tasks, reporting after the task\'s days', () => {
  const s = fresh(4);
  assert.equal(s.scouts.length, SCOUTS[2]);
  assert.equal(scoutCount(s), SCOUTS[2]);
  assert.equal(assign(s, 9, { kind: 'free' }), 'No such scout.');
  assert.equal(assign(s, 0, { kind: 'player', id: s.clubs[0].players[0].id }), 'You already know everything about him.');
  assert.equal(assign(s, 0, { kind: 'club', id: 14 }), 'Pick another club.');
  const target = s.clubs[4].players[0];
  assert.equal(assign(s, 0, { kind: 'player', id: target.id }), null);
  assert.equal(assign(s, 1, { kind: 'club', id: 5 }), null);
  assert.deepEqual(s.scouts.map(x => x.days), [TASKS.player.days, TASKS.club.days]);
  s.news = [];
  scoutDays(s, TASKS.player.days);
  assert.equal(knowledge(s, target, s.clubs[4]), 100);
  assert.deepEqual(s.news, [{ type: 'scout', club: 14, task: { kind: 'player', id: target.id }, n: 1 }]);
  assert.equal(s.scouts[0].task, null);
  scoutDays(s, TASKS.club.days - TASKS.player.days);
  assert.ok(s.clubs[5].players.every(p => knowledge(s, p, s.clubs[5]) === TASKS.club.level));
  assert.equal(s.news.at(-1).n, s.clubs[5].players.length);
  assign(s, 0, { kind: 'division', id: 1 }); recall(s, 0);
  assert.deepEqual(s.scouts[0], { task: null, days: 0 });
  s.clubs[14].div = 0; staffScouts(s);
  assert.equal(s.scouts.length, SCOUTS[0]);
});

test('search: filters on what you can tell, best estimate first; your own players never appear', () => {
  const s = fresh(6);
  const all = searchPlayers(s, {}, 1e4);
  assert.equal(all.length, s.clubs.reduce((t, c) => t + (c.id === 14 ? 0 : c.players.length), 0) + s.market.length);
  assert.ok(all.every(x => x.c?.id !== 14));
  const mids = all.map(x => x.est.ovr[0] + x.est.ovr[1]);
  assert.ok(mids.every((m, i) => i === 0 || mids[i - 1] >= m));
  assert.ok(searchPlayers(s, { pos: 'GK' }, 1e4).every(x => x.p.pos === 'GK'));
  assert.ok(searchPlayers(s, { div: 'free' }, 1e4).every(x => x.c === null));
  assert.ok(searchPlayers(s, { div: '1' }, 1e4).every(x => x.c?.div === 1));
  assert.ok(searchPlayers(s, { club: 4 }, 1e4).every(x => x.c?.id === 4));
  assert.ok(searchPlayers(s, { maxAge: 21, minOvr: 60 }, 1e4).every(x => x.p.age <= 21 && x.est.ovr[1] >= 60));
  assert.ok(searchPlayers(s, { maxValue: 1e6 }, 1e4).every(x => x.est.value[0] <= 1e6));
  const name = s.clubs[7].players[3].name;
  assert.ok(searchPlayers(s, { name: name.toUpperCase() }).some(x => x.p.name === name));
  assert.equal(searchPlayers(s, {}, 5).length, 5);
});
