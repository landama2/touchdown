import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';

test('same seed gives the same sequence', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('different seeds give different sequences', () => {
  assert.notEqual(makeRng(1).next(), makeRng(2).next());
});

test('next is in [0,1) and int is inclusive on both ends', () => {
  const r = makeRng(7), seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const x = r.next();
    assert.ok(x >= 0 && x < 1);
    seen.add(r.int(3, 6));
  }
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6]);
});

test('pick returns an element of the array', () => {
  const r = makeRng(9), arr = ['a', 'b', 'c'];
  for (let i = 0; i < 50; i++) assert.ok(arr.includes(r.pick(arr)));
});

test('an rng rebuilt from .seed continues the sequence', () => {
  const a = makeRng(123);
  a.next(); a.next();
  const b = makeRng(a.seed);
  assert.equal(a.next(), b.next());
});
