import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { cupRounds, cupRoundName, tie, draw, newCup, nextCupRound, addLeg, aggregate, decide, playoffSemis, playoffFinal } from '../src/cup.js';

test('rounds and names: a preliminary round when the clubs are not a power of two', () => {
  assert.equal(cupRounds(64), 6);
  assert.equal(cupRounds(68), 7);
  assert.equal(cupRounds(20), 5);
  assert.deepEqual([...Array(7).keys()].map(k => cupRoundName(k, 68)),
    ['Preliminary round', 'Round 1', 'Round 2', 'Round 3', 'Quarter-finals', 'Semi-finals', 'Final']);
  assert.deepEqual([...Array(4).keys()].map(k => cupRoundName(k, 16)), ['Round 1', 'Quarter-finals', 'Semi-finals', 'Final']);
});

test('the draw pairs every club once', () => {
  const ties = draw(makeRng(1), [1, 2, 3, 4, 5, 6]);
  assert.equal(ties.length, 3);
  assert.deepEqual(ties.flatMap(t => [t.h, t.a]).sort(), [1, 2, 3, 4, 5, 6]);
  assert.ok(ties.every(t => t.legs.length === 0 && t.pens === null && t.w === null));
});

test('a new cup: the weakest clubs meet in the preliminary round, the rest join in round 1', () => {
  const ranked = [...Array(68).keys()], rng = makeRng(2), cup = newCup(rng, ranked);
  assert.deepEqual(cup.byes, ranked.slice(0, 60));
  assert.deepEqual(cup.rounds[0].ties.flatMap(t => [t.h, t.a]).sort((a, b) => a - b), ranked.slice(60));
  for (const t of cup.rounds[0].ties) t.w = t.h;
  nextCupRound(rng, cup);
  assert.equal(cup.rounds[1].ties.length, 32);
  assert.equal(new Set(cup.rounds[1].ties.flatMap(t => [t.h, t.a])).size, 64);
  for (const t of cup.rounds[1].ties) t.w = t.a;
  nextCupRound(rng, cup);
  assert.equal(cup.rounds[2].ties.length, 16); // the byes join only once
  const even = newCup(rng, [...Array(16).keys()]);
  assert.deepEqual(even.byes, []);
  assert.equal(even.rounds[0].ties.length, 8);
});

test('ties: one leg or two, aggregate score, penalties when level', () => {
  const one = tie(1, 2);
  assert.equal(addLeg(one, 2, 1, 1), false);
  assert.equal(one.w, 1);
  const level = tie(1, 2);
  assert.equal(addLeg(level, 1, 1, 1), true);
  assert.equal(level.w, null);
  decide(level, [3, 4]);
  assert.deepEqual([level.w, level.pens], [2, [3, 4]]);
  const two = tie(5, 6);
  assert.equal(addLeg(two, 0, 2, 2), false);
  assert.equal(two.w, null); // first leg decides nothing
  assert.equal(addLeg(two, 3, 0, 2), false);
  assert.deepEqual(aggregate(two), [3, 2]);
  assert.equal(two.w, 5);
});

test('play-offs: 3rd v 6th and 4th v 5th, then the winners meet', () => {
  const p = playoffSemis([10, 11, 12, 13, 14, 15, 16]);
  assert.deepEqual(p.rounds[0].ties.map(t => [t.h, t.a]), [[12, 15], [13, 14]]);
  p.rounds[0].ties[0].w = 15; p.rounds[0].ties[1].w = 13;
  playoffFinal(p);
  assert.deepEqual([p.rounds[1].ties[0].h, p.rounds[1].ties[0].a], [15, 13]);
});
