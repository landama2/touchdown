import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { startCareer } from '../src/career.js';
import { soakSeason, check } from '../scripts/soak.mjs';

const good = season => ({ season, matches: 1484, goals: 1484 * 2.7, homeWins: 1484 * 0.45, sackings: 15, ms: 1300, slowestDayMs: 40,
  avgOvr: 63, plBalance: 150e6, bestValue: 115e6, medianWage: 1900, saveBytes: 957e3, gzBytes: 117e3, loads: true, employed: true });

test('check: rates are judged per block of five seasons, levels and budgets every season', () => {
  const rows = Array.from({ length: 10 }, (_, k) => good(k + 1));
  assert.deepEqual(check(rows), []);
  rows[0].goals = 1484 * 2.0;          // one low season: seasons 1-5 still average 2.56
  assert.deepEqual(check(rows), []);
  rows[1].goals = 1484 * 2.0;          // two: the block averages 2.42
  assert.deepEqual(check(rows).map(m => m.split(':')[0]), ['seasons 1–5']);
  rows[7].plBalance = 900e6;           // a level: judged in its own season
  rows[7].loads = false;
  assert.deepEqual(check(rows).map(m => m.split(':')[0]), ['seasons 1–5', 'season 8', 'season 8']);
});

test('soakSeason: one season of the real world, the career on autopilot', () => {
  const s = createWorld(1);
  startCareer(s, 0);
  let t = 0;
  const r = soakSeason(s, () => t++); // a fake clock: the row's timings are counts of calls, not real time
  assert.equal(r.season, 1);
  assert.equal(s.season, 2);           // endSeason ran
  assert.ok(r.matches > 1000, `${r.matches} league matches`);
  assert.ok(r.goals / r.matches > 2 && r.goals / r.matches < 3.5);
  assert.ok(r.sackings >= 0 && r.sackings < 40, `${r.sackings} sackings`);
  assert.ok(r.avgOvr > 50 && r.avgOvr < 80);
  assert.ok(r.loads, 'the save loads back');
  assert.ok(r.gzBytes > 0 && r.gzBytes < r.saveBytes);
});
