import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { takeClub, playDay, endSeason, table } from '../src/season.js';
import { ranking, seasonAwards, noteSeason } from '../src/awards.js';
import { rankPrize, SCORER_PRIZE, ASSIST_PRIZE } from '../src/finance.js';
import { startCareer, seasonReview, salaryFor, BONUS } from '../src/career.js';
import { MINI } from './fixtures/mini.js';

const world = seed => createWorld(seed, MINI);
const setStats = (p, goals, assists, apps = 10) => { p.stats = { apps, goals, assists, rating: 7 * apps }; };

test('ranking orders by the number, then fewer games, then the lower id; leaves out players with none; takes n', () => {
  const s = world(1), d = 0, [a, b] = s.divisions[d].clubIds.map(id => s.clubs[id]);
  const [p, q, r, t] = [a.players[0], a.players[1], b.players[0], b.players[1]];
  setStats(p, 5, 0, 10); setStats(q, 5, 2, 8); setStats(r, 7, 2, 12); setStats(t, 0, 2, 8);
  assert.deepEqual(ranking(s, d, 'goals').map(x => x.id), [r.id, q.id, p.id]);
  const tie = [q, t].sort((x, y) => x.id - y.id).map(x => x.id);
  assert.deepEqual(ranking(s, d, 'assists').map(x => x.id), [...tie, r.id]);
  assert.equal(ranking(s, d, 'goals', 2).length, 2);
  assert.deepEqual(ranking(s, d, 'goals', 1)[0], { id: r.id, name: r.name, club: b.id, apps: 12, v: 7 });
});

test('after a season the rankings\' leaders are the awards, and the records hold the most assists', () => {
  const s = world(3);
  while (!s.done) playDay(s);
  s.divisions.forEach((_, d) => {
    const aw = seasonAwards(s, d);
    for (const [key, a] of [['goals', aw.scorer], ['assists', aw.assists]]) {
      const top = ranking(s, d, key, 1)[0];
      assert.deepEqual(a, { id: top.id, name: top.name, club: top.club, v: top.v });
    }
  });
  const tables = s.divisions.map((_, d) => table(s, d)), awards = s.divisions.map((_, d) => seasonAwards(s, d));
  noteSeason(s, tables, awards);
  s.records.forEach((r, d) => assert.equal(r.assists.v, awards[d].assists.v));
  for (const c of s.clubs) {
    const most = Math.max(0, ...c.players.map(p => p.stats?.assists || 0));
    assert.equal(c.rec.assists?.v ?? 0, most);
  }
  const before = s.records[0].assists.v;
  noteSeason(s, tables, s.divisions.map((_, d) => ({ ...awards[d], assists: { ...awards[d].assists, v: before - 1 } })));
  assert.equal(s.records[0].assists.v, before); // a lower number does not replace the record
});

test('ranking prizes: by division and place, the 2nd half and the 3rd a quarter of the winner\'s', () => {
  assert.deepEqual([0, 1, 2].map(k => rankPrize('goals', 0, k)), [SCORER_PRIZE[0], SCORER_PRIZE[0] / 2, SCORER_PRIZE[0] / 4]);
  assert.equal(rankPrize('assists', 2, 0), ASSIST_PRIZE[2]);
  assert.equal(rankPrize('assists', 5, 0), ASSIST_PRIZE[2]); // lower divisions use the last
  assert.equal(rankPrize('assists', 2, 2) % 5e3, 0);
});

test('the manager gets a salary bonus for each of his players in a top 3, nothing for other clubs\' players', () => {
  const s = world(1);
  startCareer(s, 0);
  s.career.money = 0;
  const tables = s.divisions.map((_, d) => table(s, d)), pay = salaryFor(s, 0);
  const row = (club, k) => ({ id: 100 + k, name: `P${k}`, club, apps: 10, v: 10 - k });
  const ranks = s.divisions.map(() => ({ goals: [], assists: [] }));
  ranks[0] = { goals: [row(0, 0), row(1, 1), row(0, 2)], assists: [row(1, 3), row(0, 4)] };
  const h = { cup: null, divs: s.divisions.map(() => ({ champion: null, playoff: null, up: [], down: [] })), ranks };
  seasonReview(s, tables, h);
  const r = x => Math.round(x / 1e3) * 1e3;
  const want = r(pay * BONUS.ranking[0]) + r(pay * BONUS.ranking[2]) + r(pay * BONUS.ranking[1]);
  const seasonBonus = // the season bonus is not part of it
    s.inbox.filter(n => n.type === 'bonus').reduce((x, n) => x + n.amount, 0);
  assert.equal(s.career.money - seasonBonus, want);
  const posts = s.inbox.filter(n => n.type === 'ranking');
  assert.deepEqual(posts.map(n => [n.key, n.place, n.amount]), [['goals', 0, rankPrize('goals', 0, 0)], ['goals', 2, rankPrize('goals', 0, 2)], ['assists', 1, rankPrize('assists', 0, 1)]]);
});

test('a place in a top 3 lifts the player\'s morale, the winner most', () => {
  const s = world(5);
  takeClub(s, 0);
  while (!s.done) playDay(s);
  const top = ranking(s, 0, 'goals', 1)[0], p = s.clubs[top.club].players.find(x => x.id === top.id);
  const before = p.morale, alsoAssists = ranking(s, 0, 'assists', 3).some(x => x.id === p.id);
  endSeason(s);
  if (!alsoAssists) assert.equal(p.morale, Math.min(100, before + 15));
  else assert.ok(p.morale >= Math.min(100, before + 15));
});
