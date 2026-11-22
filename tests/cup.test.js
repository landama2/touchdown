import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { cupPlan, cupRounds, cupRoundName, tie, draw, newCup, nextCupRound, addLeg, aggregate, decide, playoffSemis, playoffFinal } from '../src/cup.js';

test('rounds and names: the cup plan for 68, 64, 20 and 16 clubs', () => {
  assert.equal(cupRounds(64), 6);
  assert.equal(cupRounds(68), 7);
  assert.equal(cupRounds(20), 5);
  assert.deepEqual(cupPlan(68), { enter: [40, 12, 16, 0, 0, 0, 0], size: [40, 32, 32, 16, 8, 4, 2] });
  for (const n of [5, 16, 20, 64, 65, 68, 90, 100]) {
    const { enter, size } = cupPlan(n);
    assert.equal(enter.reduce((t, e) => t + e, 0), n);
    assert.equal(size.at(-1), 2);
    assert.ok(size.every(x => x % 2 === 0));
  }
  assert.deepEqual([...Array(7).keys()].map(k => cupRoundName(k, 68)),
    ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Quarter-finals', 'Semi-finals', 'Final']);
  assert.deepEqual([...Array(4).keys()].map(k => cupRoundName(k, 16)), ['Round 1', 'Quarter-finals', 'Semi-finals', 'Final']);
});

test('the draw pairs every club once', () => {
  const ties = draw(makeRng(1), [1, 2, 3, 4, 5, 6]);
  assert.equal(ties.length, 3);
  assert.deepEqual(ties.flatMap(t => [t.h, t.a]).sort(), [1, 2, 3, 4, 5, 6]);
  assert.ok(ties.every(t => t.legs.length === 0 && t.pens === null && t.w === null));
});

test('a new cup: the weakest clubs start, the strongest join in later rounds', () => {
  const ranked = [...Array(68).keys()], rng = makeRng(2), cup = newCup(rng, ranked);
  assert.deepEqual(cup.entries, [ranked.slice(28), ranked.slice(16, 28), ranked.slice(0, 16), [], [], [], []]);
  assert.deepEqual(cup.rounds[0].ties.flatMap(t => [t.h, t.a]).sort((a, b) => a - b), ranked.slice(28));
  for (const [k, n] of [[1, 16], [2, 16], [3, 8]]) {
    for (const t of cup.rounds[k - 1].ties) t.w = t.h;
    nextCupRound(rng, cup);
    assert.equal(cup.rounds[k].ties.length, n);
    const playing = cup.rounds[k].ties.flatMap(t => [t.h, t.a]);
    assert.ok(cup.entries[k].every(id => playing.includes(id)));
  }
  const even = newCup(rng, [...Array(16).keys()]);
  assert.equal(even.rounds[0].ties.length, 8);
  // a cup saved before staged entry: the byes join in round 2
  const old = { byes: [0, 1], rounds: [{ ties: [{ ...tie(2, 3), w: 2 }, { ...tie(4, 5), w: 5 }] }] };
  nextCupRound(rng, old);
  assert.deepEqual(old.rounds[1].ties.flatMap(t => [t.h, t.a]).sort(), [0, 1, 2, 5]);
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
