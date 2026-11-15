import { test } from 'node:test';
import assert from 'node:assert/strict';
import { line } from '../src/ui/commentary.js';

test('commentary names the minute, team and players of each kind of event', () => {
  assert.match(line({ min: 12, side: 0, type: 'goal', id: 3, name: 'A Striker', assistName: 'B Winger' }, 'ARS'),
    /^12' ARS — GOAL! .*A Striker.*, set up by B Winger\.$/);
  assert.doesNotMatch(line({ min: 12, side: 0, type: 'goal', id: 3, name: 'A Striker' }, 'ARS'), /set up/);
  assert.equal(line({ min: 70, side: 1, type: 'sub', id: 4, name: 'Off', in: 5, inName: 'On' }, 'CHE'), "70' CHE — Substitution: On replaces Off.");
  assert.match(line({ min: 50, side: 1, type: 'red', id: 9, name: 'Hard Man', second: true }, 'LEE'), /Second yellow for Hard Man/);
  for (const type of ['save', 'miss', 'yellow', 'red', 'injury'])
    for (let min = 1; min <= 3; min++) assert.match(line({ min, side: 0, type, id: 1, name: 'Z Name' }, 'X'), /Z Name/);
});
