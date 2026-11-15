import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ATTRS } from '../src/player.js';
import { STAT_MAP, attrsFromStats, isKeeper, normName, matchStats, calibrate } from '../src/data/attrmap.js';

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

const league = (clubs) => [{ name: 'L', clubs: clubs.map(([name, players]) => ({ name, players })) }];
const field = extra => row(60, { gk_diving: '10', gk_handling: '10', gk_reflexes: '10', ...extra });

test('matchStats: rejects a same-name player whose age does not fit the dataset vintage', () => {
  const rows = [field({ player: 'Luke Chambers', club: 'Colchester ', age: '34' })];
  const { stats, report } = matchStats(rows, league([['Liverpool', [['Luke Chambers', 'DF', 22, 12]]]]));
  assert.deepEqual(stats, {});
  assert.equal(report.ageRejected.length, 1);
});

test('matchStats: accepts a different-club match whose age fits, and reports it', () => {
  const rows = [field({ player: 'Ann Example', club: 'Old Club ', age: '24' })];
  const { stats, report } = matchStats(rows, league([['New Club', [['Ann Example', 'MF', 27, 12]]]]));
  assert.ok(stats['New Club']['Ann Example']);
  assert.equal(report.differentClub.length, 1);
});

test('matchStats: age settles an ambiguous name', () => {
  const rows = [row(60, { player: 'Danny Ward', club: 'Huddersfield ', age: '32' }), row(70, { player: 'Danny Ward', club: 'Leicester City ', age: '30', gk_diving: '70', gk_handling: '70', gk_reflexes: '70' })];
  const { stats } = matchStats(rows, league([['Wrexham', [['Danny Ward', 'GK', 33, 10]]]]));
  assert.ok(stats.Wrexham['Danny Ward']);
});

test('matchStats: one dataset row feeds one player; the same-club claim wins', () => {
  const rows = [field({ player: 'Reece James', club: 'Sheffield Wed ', age: '26' })];
  const { stats, report } = matchStats(rows, league([['Chelsea', [['Reece James', 'DF', 29, 16]]], ['Sheffield Wed', [['Reece James', 'MF', 29, 10]]]]));
  assert.equal(stats.Chelsea, undefined);
  assert.ok(stats['Sheffield Wed']['Reece James']);
  assert.equal(report.duplicateRow.length, 1);
});

test('matchStats: an exact tie for one dataset row gives it to nobody', () => {
  const rows = [field({ player: 'Ben Davies', club: 'Elsewhere ', age: '30' })];
  const { stats } = matchStats(rows, league([['Tottenham', [['Ben Davies', 'DF', 33, 14]]], ['Bolton', [['Ben Davies', 'DF', 33, 10]]]]));
  assert.deepEqual(stats, {});
});

test('matchStats: goalkeeper/outfield mismatch is skipped', () => {
  const rows = [row(60, { player: 'Liam Kelly', club: 'Motherwell ', age: '27', gk_diving: '75', gk_handling: '75', gk_reflexes: '75' })];
  const { stats, report } = matchStats(rows, league([['Peterborough', [['Liam Kelly', 'MF', 30, 9]]]]));
  assert.deepEqual(stats, {});
  assert.equal(report.keeperMismatch.length, 1);
});

test('calibrate: measures the whole-number shift per league, 0 with too few matches', () => {
  const players = Array.from({ length: 12 }, (_, i) => [`P${i}`, 'MF', 25, 9]);
  const lg = [{ name: 'L', clubs: [{ name: 'C', players }] }, { name: 'Tiny', clubs: [{ name: 'T', players: [['Q', 'MF', 25, 9]] }] }];
  const stats = { C: Object.fromEntries(players.map(([n]) => [n, Array(ALL_ATTRS.length).fill(12)])), T: { Q: Array(ALL_ATTRS.length).fill(12) } };
  // every attribute 12 -> overall 60 -> implied rating (60 - 6) / 5 = 10.8 -> shift round(10.8 - 9) = 2
  assert.deepEqual(calibrate(stats, lg), { L: 2, Tiny: 0 });
});
