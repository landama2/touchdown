import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLeagues, PATTERNS } from '../src/data/validate.js';
import { MINI } from './fixtures/mini.js';

const broken = change => { const l = structuredClone(MINI); change(l); return validateLeagues(l); };
const has = (errors, text) => assert.ok(errors.some(e => e.includes(text)), `expected an error containing "${text}", got:\n${errors.join('\n')}`);

test('the fixture is valid', () => {
  assert.deepEqual(validateLeagues(MINI), []);
});

test('PATTERNS lists the six kit patterns', () => {
  assert.deepEqual(PATTERNS, ['plain', 'stripes', 'hoops', 'halves', 'sash', 'sleeves']);
});

test('club-level problems are reported', () => {
  has(broken(l => l[0].clubs.pop()), 'even number of clubs');
  has(broken(l => { l[0].clubs[0].short = 'Al'; }), 'short must be 3 capital letters');
  has(broken(l => { l[0].clubs[0].colours = ['red', '#ffffff']; }), 'colours');
  has(broken(l => { l[0].clubs[0].kit.pattern = 'checks'; }), 'kit.pattern');
  has(broken(l => { delete l[0].clubs[0].kit.socks; }), 'kit.socks');
  has(broken(l => { l[0].clubs[0].players.length = 17; }), 'players, has 17');
  has(broken(l => { l[0].clubs[0].players = l[0].clubs[0].players.filter(p => p[1] !== 'GK').concat([['Only Keeper', 'GK', 25, 10]]); }), 'goalkeepers');
});

test('the same player (name and age) at two clubs is reported; a namesake of another age is not', () => {
  has(broken(l => { l[2].clubs[0].players[0] = [...l[0].clubs[0].players[0]]; }), 'player listed at two clubs');
  assert.deepEqual(broken(l => { const p = [...l[0].clubs[0].players[0]]; p[2] += 5; l[2].clubs[0].players[0] = p; }), []);
});

test('player-level problems are reported', () => {
  has(broken(l => { l[0].clubs[0].players[3][1] = 'ST'; }), 'position');
  has(broken(l => { l[0].clubs[0].players[3][2] = 14; }), 'age');
  has(broken(l => { l[0].clubs[0].players[3][3] = 21; }), 'rating');
  has(broken(l => { l[0].clubs[0].players[3][3] = 12.5; }), 'rating');
  has(broken(l => { l[0].clubs[0].players[3][4] = ['speed']; }), 'strengths');
  has(broken(l => { l[0].clubs[0].players[3][4] = ['pace', 'stamina', 'strength', 'agility']; }), 'strengths');
  has(broken(l => { l[0].clubs[0].players[3][0] = l[0].clubs[0].players[4][0]; }), 'listed twice');
});

test('names and codes must be unique across all leagues', () => {
  has(broken(l => { l[2].clubs[0].name = 'Alpha'; }), 'club name used twice: Alpha');
  has(broken(l => { l[2].clubs[0].short = 'ALP'; }), 'short code used twice: ALP');
});
