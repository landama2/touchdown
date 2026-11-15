import { test } from 'node:test';
import assert from 'node:assert/strict';
import { value } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { MINI } from './fixtures/mini.js';
import { takeClub, myClub } from '../src/season.js';
import { buy, sell, MIN_SQUAD, MAX_SQUAD, SELL_RATE } from '../src/transfers.js';

const fresh = () => { const s = createWorld(11, MINI); takeClub(s, 12); return s; };

test('buy moves the player and charges their value', () => {
  const s = fresh(), p = [...s.market].sort((a, b) => value(a) - value(b))[0];
  s.budget = value(p) + 5;
  assert.equal(buy(s, p.id), null);
  assert.equal(s.budget, 5);
  assert.ok(myClub(s).players.includes(p));
  assert.ok(!s.market.includes(p));
});

test('buy refuses: unknown player, not enough money, full squad', () => {
  const s = fresh(), p = s.market[0];
  assert.equal(typeof buy(s, -1), 'string');
  s.budget = value(p) - 1;
  assert.equal(typeof buy(s, p.id), 'string');
  assert.equal(s.market.length, 40);
  s.budget = 1e12;
  while (myClub(s).players.length < MAX_SQUAD) assert.equal(buy(s, s.market[0].id), null);
  assert.equal(typeof buy(s, s.market[0].id), 'string');
});

test('sell pays 80% of value, lists the player, and keeps a valid lineup', () => {
  const s = fresh(), id = s.lineup[0], p = myClub(s).players.find(x => x.id === id), b0 = s.budget;
  assert.equal(sell(s, id), null);
  assert.equal(s.budget, b0 + Math.round(value(p) * SELL_RATE));
  assert.ok(s.market.includes(p));
  assert.equal(new Set(s.lineup).size, 11);
  assert.ok(!s.lineup.includes(id));
});

test('sell refuses: not your player, squad at minimum', () => {
  const s = fresh();
  assert.equal(typeof sell(s, s.market[0].id), 'string');
  while (myClub(s).players.length > MIN_SQUAD) assert.equal(sell(s, myClub(s).players[0].id), null);
  assert.equal(typeof sell(s, myClub(s).players[0].id), 'string');
  assert.equal(myClub(s).players.length, MIN_SQUAD);
});
