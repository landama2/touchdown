import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { startCareer } from '../src/career.js';
import { soakSeason } from '../scripts/soak.mjs';

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
