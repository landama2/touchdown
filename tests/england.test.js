import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overall, ALL_ATTRS } from '../src/player.js';
import { validateLeagues } from '../src/data/validate.js';
import { LEAGUES } from '../src/data/england.js';
import STATS, { CALIBRATION } from '../src/data/england-stats.js';
import { createWorld } from '../src/world.js';
import { takeClub, playDay, endSeason } from '../src/season.js';

test('the three English data files are valid together', () => {
  assert.deepEqual(validateLeagues(LEAGUES), []);
  assert.deepEqual(LEAGUES.map(l => [l.name, l.clubs.length]), [['Premier League', 20], ['Championship', 24], ['League One', 24]]);
});

test('the default world is the English pyramid and plays a full season', () => {
  const s = createWorld(1);
  assert.deepEqual(s.divisions.map(d => d.clubIds.length), [20, 24, 24]);
  takeClub(s, 0);
  while (!s.done) playDay(s);
  for (const d of s.divisions) for (const id of d.clubIds) assert.equal(s.clubs[id].st.p, 2 * (d.clubIds.length - 1));
  endSeason(s);
  assert.equal(s.season, 2);
});

test('imported stats refer to real squad players and hold 19 attributes 1-20', () => {
  const clubs = new Map(LEAGUES.flatMap(l => l.clubs).map(c => [c.name, new Set(c.players.map(p => p[0]))]));
  let n = 0;
  for (const [club, players] of Object.entries(STATS)) {
    assert.ok(clubs.has(club), `unknown club ${club}`);
    for (const [name, attrs] of Object.entries(players)) {
      assert.ok(clubs.get(club).has(name), `${club} / ${name} not in the squad data`);
      assert.equal(attrs.length, ALL_ATTRS.length);
      assert.ok(attrs.every(v => Number.isInteger(v) && v >= 1 && v <= 20), `${club} / ${name}`);
      n++;
    }
  }
  assert.ok(n > 0, 'no imported players');
  assert.deepEqual(Object.keys(CALIBRATION).sort(), LEAGUES.map(l => l.name).sort());
  assert.ok(Object.values(CALIBRATION).every(Number.isInteger));
});

test('the Premier League is stronger than the Championship, which is stronger than League One', () => {
  const s = createWorld(2);
  const avg = d => { const ps = s.divisions[d].clubIds.flatMap(id => s.clubs[id].players); return ps.reduce((t, p) => t + overall(p), 0) / ps.length; };
  assert.ok(avg(0) > avg(1) && avg(1) > avg(2), `${avg(0)} ${avg(1)} ${avg(2)}`);
});

test('imported players sit on the same scale as their generated teammates', () => {
  const s = createWorld(1);
  const imported = new Set(Object.entries(STATS).flatMap(([club, ps]) => Object.keys(ps).map(n => `${club}|${n}`)));
  let gap = 0, n = 0;
  for (const c of s.clubs) {
    const own = c.players.filter(p => imported.has(`${c.name}|${p.name}`)), gen = c.players.filter(p => !imported.has(`${c.name}|${p.name}`));
    if (own.length < 3 || gen.length < 3) continue;
    const avg = ps => ps.reduce((t, p) => t + overall(p), 0) / ps.length;
    gap += Math.abs(avg(own) - avg(gen)); n++;
  }
  assert.ok(gap / n < 8, `mean within-club gap ${(gap / n).toFixed(1)}`);
});

test('the free-agent list has players worth signing below the Premier League', () => {
  const s = createWorld(1);
  const best = Math.max(...s.market.map(p => overall(p)));
  const weakestChampionshipXI = Math.min(...s.divisions[1].clubIds.map(id => {
    const o = s.clubs[id].players.map(p => overall(p)).sort((a, b) => b - a);
    return o[10];                                   // the 11th-best player
  }));
  assert.ok(best > weakestChampionshipXI, `${best} vs ${weakestChampionshipXI}`);
});

test('a season of real leagues plays like real football', () => {
  const s = createWorld(1);
  let n = 0, goals = 0, home = 0, yellows = 0, reds = 0, pens = 0;
  while (!s.done) for (const r of playDay(s).filter(x => x.item.comp === 'league')) {
    n++; goals += r.hg + r.ag; if (r.hg > r.ag) home++;
    yellows += r.stats[0].yc + r.stats[1].yc; reds += r.stats[0].rc + r.stats[1].rc;
    pens += r.ev.filter(e => e.kind === 'pen').length;
  }
  assert.ok(goals / n >= 2.5 && goals / n <= 2.9, `goals per match ${goals / n}`);
  assert.ok(home / n >= 0.43 && home / n <= 0.47, `home wins ${home / n}`);
  assert.ok(yellows / n >= 2.5 && yellows / n <= 4, `yellows per match ${yellows / n}`);
  assert.ok(reds / n <= 0.3, `reds per match ${reds / n}`);
  assert.ok(pens / n >= 0.15 && pens / n <= 0.4, `penalties per match ${pens / n}`);
});
