import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ATTRS } from '../src/player.js';
import { STAT_MAP, attrsFromStats, isKeeper, normName } from '../src/data/attrmap.js';

const COLUMNS = 'ball_control,dribbling,marking,slide_tackle,stand_tackle,aggression,reactions,att_position,interceptions,vision,composure,crossing,short_pass,long_pass,acceleration,stamina,strength,balance,sprint_speed,agility,jumping,heading,shot_power,finishing,long_shots,curve,fk_acc,penalties,volleys,gk_positioning,gk_diving,gk_handling,gk_kicking,gk_reflexes'.split(',');
const row = (v, extra = {}) => ({ ...Object.fromEntries(COLUMNS.map(c => [c, String(v)])), ...extra });

test('STAT_MAP covers every Touchline attribute with real dataset columns', () => {
  assert.deepEqual(Object.keys(STAT_MAP).sort(), [...ALL_ATTRS].sort());
  for (const spec of Object.values(STAT_MAP))
    for (const cols of Array.isArray(spec) ? [spec] : Object.values(spec))
      for (const c of cols) assert.ok(COLUMNS.includes(c), c);
});

test('attrsFromStats scales 0-99 onto 1-20 in ALL_ATTRS order', () => {
  const a = attrsFromStats(row(80), 'MF');
  assert.equal(a.length, ALL_ATTRS.length);
  assert.ok(a.every(v => v === 16));
  assert.ok(attrsFromStats(row(99), 'FW').every(v => v === 20));
  assert.ok(attrsFromStats(row(2), 'FW').every(v => v === 1));
});

test('attrsFromStats averages columns and skips empty cells', () => {
  const a = attrsFromStats(row(50, { stand_tackle: '60', slide_tackle: '70', marking: '' }), 'DF');
  assert.equal(a[ALL_ATTRS.indexOf('tackling')], 13);
  const b = attrsFromStats(row(50, { acceleration: '90', sprint_speed: '80' }), 'FW');
  assert.equal(b[ALL_ATTRS.indexOf('pace')], 17);
});

test('positioning depends on the position', () => {
  const r = row(50, { gk_positioning: '90', att_position: '20', interceptions: '40', marking: '40' });
  assert.equal(attrsFromStats(r, 'GK')[ALL_ATTRS.indexOf('positioning')], 18);
  assert.equal(attrsFromStats(r, 'DF')[ALL_ATTRS.indexOf('positioning')], 8);
  assert.equal(attrsFromStats(r, 'FW')[ALL_ATTRS.indexOf('positioning')], 4);
});

test('isKeeper tells goalkeepers from outfield players', () => {
  assert.equal(isKeeper(row(10, { gk_diving: '74', gk_handling: '65', gk_reflexes: '74' })), true);
  assert.equal(isKeeper(row(60, { gk_diving: '10', gk_handling: '8', gk_reflexes: '9' })), false);
});

test('normName folds accents, special letters and punctuation', () => {
  assert.equal(normName('Cédric Zesiger'), 'cedric zesiger');
  assert.equal(normName('Martin Ødegaard'), 'martin odegaard');
  assert.equal(normName('Łukasz  Fabiański'), 'lukasz fabianski');
  assert.equal(normName("Dara O'Shea"), 'dara o shea');
  assert.equal(normName('Thomas Dähne'), 'thomas dahne');
});
