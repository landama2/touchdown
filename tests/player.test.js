import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { POS, WEIGHTS, ALL_ATTRS, createPlayer, overall, value, ageOneYear } from '../src/player.js';

test('createPlayer fills every attribute with an integer 1..20', () => {
  const rng = makeRng(1);
  for (const pos of POS) for (const q of [1, 10, 20]) {
    const p = createPlayer(rng, 1, pos, q);
    assert.deepEqual(Object.keys(p.attrs).sort(), [...ALL_ATTRS].sort());
    for (const k of ALL_ATTRS) assert.ok(Number.isInteger(p.attrs[k]) && p.attrs[k] >= 1 && p.attrs[k] <= 20, `${k}=${p.attrs[k]}`);
    assert.ok(p.pot >= 1 && p.pot <= 20);
    assert.ok(p.age >= 17 && p.age <= 34);
    assert.equal(p.pos, pos);
  }
});

test('createPlayer is deterministic for a seed', () => {
  assert.deepEqual(createPlayer(makeRng(5), 1, 'MF', 12), createPlayer(makeRng(5), 1, 'MF', 12));
});

test('overall is an integer 5..100 and players rate best in their own position', () => {
  const rng = makeRng(2);
  let own = 0, other = 0;
  for (let i = 0; i < 100; i++) {
    const p = createPlayer(rng, i, 'GK', 12);
    const o = overall(p);
    assert.ok(Number.isInteger(o) && o >= 5 && o <= 100);
    own += o; other += overall(p, 'FW');
  }
  assert.ok(own > other + 500, `GK as GK ${own} vs as FW ${other}`);
});

test('higher quality gives higher overall on average', () => {
  const rng = makeRng(3);
  const avg = q => { let t = 0; for (let i = 0; i < 100; i++) t += overall(createPlayer(rng, i, 'DF', q)); return t / 100; };
  assert.ok(avg(15) > avg(8) + 20);
});

test('value falls with age for identical attributes', () => {
  const p = createPlayer(makeRng(4), 1, 'FW', 14, 22);
  const old = { ...p, age: 32 };
  assert.ok(value(p) > value(old));
  assert.ok(Number.isInteger(value(p)) && value(p) > 0);
});

test('ageOneYear: young players improve up to potential, old players lose physical attributes', () => {
  const rng = makeRng(6);
  const young = createPlayer(rng, 1, 'MF', 8, 18); young.pot = 20;
  const before = overall(young);
  for (let i = 0; i < 4; i++) ageOneYear(rng, young);
  assert.equal(young.age, 22);
  assert.ok(overall(young) > before);
  for (const k of ALL_ATTRS) assert.ok(young.attrs[k] <= 20);

  const old = createPlayer(rng, 2, 'MF', 12, 32);
  const phys = p => p.attrs.pace + p.attrs.stamina + p.attrs.strength + p.attrs.agility;
  const physBefore = phys(old);
  for (let i = 0; i < 3; i++) ageOneYear(rng, old);
  assert.ok(phys(old) < physBefore);
  for (const k of ALL_ATTRS) assert.ok(old.attrs[k] >= 1);
});

test('potential is never below the key attributes at creation', () => {
  const rng = makeRng(11);
  for (const pos of POS) for (const q of [1, 5, 10, 15, 20]) for (let i = 0; i < 20; i++) {
    const p = createPlayer(rng, 1, pos, q);
    for (const k of Object.keys(WEIGHTS[pos])) assert.ok(p.pot >= p.attrs[k], `${pos} q${q} ${k}=${p.attrs[k]} pot=${p.pot}`);
  }
});

test('ageing a young player never pushes a key attribute above pot', () => {
  const rng = makeRng(12);
  for (const pos of POS) for (let i = 0; i < 20; i++) {
    const p = createPlayer(rng, 1, pos, 10, 17);
    for (let y = 0; y < 8; y++) {
      ageOneYear(rng, p);
      for (const k of Object.keys(WEIGHTS[pos])) assert.ok(p.attrs[k] <= p.pot, `${pos} ${k}=${p.attrs[k]} pot=${p.pot}`);
    }
  }
});
