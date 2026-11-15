import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overall, ALL_ATTRS } from '../src/player.js';
import { validateLeagues } from '../src/data/validate.js';
import { LEAGUES } from '../src/data/england.js';
import STATS, { CALIBRATION } from '../src/data/england-stats.js';
import { createWorld } from '../src/world.js';
import { takeClub, playRound, endSeason } from '../src/season.js';

test('the three English data files are valid together', () => {
  assert.deepEqual(validateLeagues(LEAGUES), []);
  assert.deepEqual(LEAGUES.map(l => [l.name, l.clubs.length]), [['Premier League', 20], ['Championship', 24], ['League One', 24]]);
});

test('the default world is the English pyramid and plays a full season', () => {
  const s = createWorld(1);
  assert.deepEqual(s.divisions.map(d => d.clubIds.length), [20, 24, 24]);
  takeClub(s, 0);
  while (!s.done) playRound(s);
  assert.equal(s.round, 46);
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
