import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEIGHTS, POS } from '../src/player.js';
import { slots, eff } from '../src/lineup.js';
import { TEAM, TEAM_KEYS, ROLES, DUTIES, INSTR, teamLabel, defaultSlot, defaultTactics, fitSlots, setTeam, setSlot, setTaker } from '../src/tactics.js';
import { createWorld } from '../src/world.js';
import { MINI } from './fixtures/mini.js';

test('defaults change nothing: the first role of a position is rated exactly like the position', () => {
  for (const pos of POS) assert.equal(ROLES[pos][defaultSlot(pos).role].w, WEIGHTS[pos]);
  const p = createWorld(1, MINI).clubs[0].players[3];
  for (const pos of POS) assert.equal(eff(p, pos, defaultSlot(pos).role), eff(p, pos));
  const t = defaultTactics(slots('4-3-3'));
  assert.deepEqual(TEAM_KEYS.map(k => t[k]), [0, 0, 0, 0, 0]);
  assert.deepEqual(t.slots.map(x => x.role), ['Goalkeeper', ...Array(4).fill('Centre-back'), ...Array(3).fill('Central midfielder'), ...Array(3).fill('Striker')]);
  assert.ok(t.slots.every(x => x.duty === 'Support' && x.shoot === 0 && x.tackle === 0));
  assert.deepEqual(t.takers, { pen: null, fk: null, corner: null });
  assert.equal(teamLabel('mentality', 0), 'Balanced');
  assert.equal(teamLabel('mentality', -2), 'Very defensive');
  assert.equal(teamLabel('line', 1), 'High');
  for (const k of TEAM_KEYS) assert.equal(TEAM[k].length % 2, 1);
});

test('every role names only real attributes', () => {
  const attrs = Object.keys(createWorld(1, MINI).clubs[0].players[0].attrs);
  for (const pos of POS) for (const [name, r] of Object.entries(ROLES[pos]))
    assert.ok(Object.keys(r.w).every(k => attrs.includes(k)), `${pos} ${name}`);
  assert.deepEqual(Object.keys(DUTIES), ['Defend', 'Support', 'Attack']);
  assert.deepEqual(Object.keys(INSTR), ['shoot', 'tackle']);
});

test('setters accept valid values and reject everything else', () => {
  const t = defaultTactics(slots('4-4-2'));
  assert.equal(setTeam(t, 'mentality', 2), null);
  assert.equal(t.mentality, 2);
  for (const [k, v] of [['mentality', 3], ['pressing', -2], ['tempo', 0.5], ['width', '1'], ['shape', 0], ['constructor', 0]])
    assert.equal(setTeam(t, k, v), 'Unknown team instruction.', `${k}=${v}`);
  assert.equal(t.mentality, 2);

  const df = t.slots[1];
  assert.equal(setSlot(df, 'DF', 'role', 'Full-back'), null);
  assert.equal(setSlot(df, 'DF', 'duty', 'Attack'), null);
  assert.equal(setSlot(df, 'DF', 'shoot', -1), null);
  assert.equal(setSlot(df, 'DF', 'tackle', 1), null);
  assert.deepEqual(df, { role: 'Full-back', duty: 'Attack', shoot: -1, tackle: 1 });
  for (const [pos, f, v] of [['DF', 'role', 'Playmaker'], ['DF', 'role', 'constructor'], ['GK', 'duty', 'Attack'], ['DF', 'duty', 'Sweep'], ['DF', 'shoot', 2], ['DF', 'pos', 'FW']])
    assert.equal(setSlot(df, pos, f, v), 'Unknown player instruction.', `${pos} ${f}=${v}`);
  assert.deepEqual(df, { role: 'Full-back', duty: 'Attack', shoot: -1, tackle: 1 });

  const squad = createWorld(1, MINI).clubs[0].players;
  assert.equal(setTaker(t, 'pen', squad[5].id, squad), null);
  assert.equal(t.takers.pen, squad[5].id);
  assert.equal(setTaker(t, 'pen', null, squad), null);
  assert.equal(t.takers.pen, null);
  assert.equal(setTaker(t, 'pen', 99999, squad), 'Unknown set-piece taker.');
  assert.equal(setTaker(t, 'throw', squad[5].id, squad), 'Unknown set-piece taker.');
});

test('fitSlots keeps slot settings whose role still fits and resets the rest', () => {
  const t = defaultTactics(slots('4-4-2'));
  setSlot(t.slots[1], 'DF', 'role', 'Full-back');
  setSlot(t.slots[8], 'MF', 'role', 'Winger');
  setSlot(t.slots[8], 'MF', 'shoot', 1);
  const next = fitSlots(t.slots, slots('4-3-3')); // slot 8 turns from MF into FW
  assert.equal(next[1].role, 'Full-back');
  assert.deepEqual(next[8], defaultSlot('FW'));
  assert.equal(next.length, 11);
});
