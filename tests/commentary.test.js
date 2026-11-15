import { test } from 'node:test';
import assert from 'node:assert/strict';
import { line } from '../src/ui/commentary.js';

test('commentary names the minute, team and players of each kind of event', () => {
  assert.match(line({ min: 12, side: 0, type: 'goal', id: 3, name: 'A Striker', assistName: 'B Winger' }, 'ARS'),
    /^12' ARS — GOAL! .*A Striker.*, set up by B Winger\.$/);
  assert.doesNotMatch(line({ min: 12, side: 0, type: 'goal', id: 3, name: 'A Striker' }, 'ARS'), /set up/);
  assert.equal(line({ min: 70, side: 1, type: 'sub', id: 4, name: 'Off', in: 5, inName: 'On' }, 'CHE'), "70' CHE — Substitution: On replaces Off.");
  // (min + id) % 2 === 1 picks 'goes into the book'; a `$&` in the name must stay literal.
  assert.equal(line({ min: 1, side: 0, type: 'yellow', id: 2, name: 'A $& B' }, 'X'), "1' X — A $& B goes into the book.");
  assert.match(line({ min: 50, side: 1, type: 'red', id: 9, name: 'Hard Man', second: true }, 'LEE'), /Second yellow for Hard Man/);
  for (const type of ['save', 'miss', 'yellow', 'red', 'injury'])
    for (let min = 1; min <= 3; min++) assert.match(line({ min, side: 0, type, id: 1, name: 'Z Name' }, 'X'), /Z Name/);
});

test('penalties, corners and free kicks get their own lines', () => {
  assert.match(line({ min: 30, side: 0, type: 'goal', kind: 'pen', id: 1, name: 'Spot Man' }, 'ARS'), /^30' ARS — GOAL! .*Spot Man.*(spot|penalty)/);
  assert.equal(line({ min: 9, side: 1, type: 'save', kind: 'pen', id: 2, name: 'Spot Man' }, 'CHE'), "9' CHE — Penalty saved! Spot Man is denied from the spot.");
  assert.match(line({ min: 40, side: 0, type: 'goal', kind: 'corner', id: 3, name: 'Big Head', assistName: 'Good Foot' }, 'X'), /Big Head heads in from the corner, set up by Good Foot\.$/);
  for (const type of ['goal', 'save', 'miss']) for (const kind of ['pen', 'corner', 'fk'])
    assert.match(line({ min: 5, side: 0, type, kind, id: 1, name: 'Z Name' }, 'X'), /Z Name/);
});
