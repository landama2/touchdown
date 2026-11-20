import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overall, value, ALL_ATTRS } from '../src/player.js';
import { validateLeagues } from '../src/data/validate.js';
import { LEAGUES } from '../src/data/england.js';
import STATS, { CALIBRATION } from '../src/data/england-stats.js';
import { createWorld } from '../src/world.js';
import { available } from '../src/squad.js';
import { takeClub, playDay, endSeason } from '../src/season.js';
import { MIN_SQUAD, MAX_SQUAD } from '../src/market.js';

test('the three English data files are valid together', () => {
  assert.deepEqual(validateLeagues(LEAGUES), []);
  assert.deepEqual(LEAGUES.map(l => [l.name, l.clubs.length]), [['Premier League', 20], ['Championship', 24], ['League One', 24]]);
});

test('the default world is the English pyramid and plays a full season', () => {
  const s = createWorld(1);
  assert.deepEqual(s.divisions.map(d => d.clubIds.length), [20, 24, 24]);
  takeClub(s, 0);
  while (!s.done) playDay(s);
  for (const d of s.divisions) for (const id of d.clubIds) assert.equal(s.clubs[id].st.p, 2 * (d.clubIds.length - 1));
  endSeason(s);
  assert.equal(s.season, 2);
});

test('imported stats refer to real squad players and hold 19 attributes 1-20', () => {
  const clubs = new Map(LEAGUES.flatMap(l => l.clubs).map(c => [c.name, new Set(c.players.map(p => p[0]))]));
  let n = 0;
  for (const [club, players] of Object.entries(STATS)) {
    assert.ok(clubs.has(club), `unknown club ${club}`);
    for (const [name, attrs] of Object.entries(players)) {
      assert.ok(clubs.get(club).has(name), `${club} / ${name} not in the squad data`);
      assert.equal(attrs.length, ALL_ATTRS.length);
      assert.ok(attrs.every(v => Number.isInteger(v) && v >= 1 && v <= 20), `${club} / ${name}`);
      n++;
    }
  }
  assert.ok(n > 0, 'no imported players');
  assert.deepEqual(Object.keys(CALIBRATION).sort(), LEAGUES.map(l => l.name).sort());
  assert.ok(Object.values(CALIBRATION).every(Number.isInteger));
});

test('the Premier League is stronger than the Championship, which is stronger than League One', () => {
  const s = createWorld(2);
  const avg = d => { const ps = s.divisions[d].clubIds.flatMap(id => s.clubs[id].players); return ps.reduce((t, p) => t + overall(p), 0) / ps.length; };
  assert.ok(avg(0) > avg(1) && avg(1) > avg(2), `${avg(0)} ${avg(1)} ${avg(2)}`);
});

test('imported players sit on the same scale as their generated teammates', () => {
  const s = createWorld(1);
  const imported = new Set(Object.entries(STATS).flatMap(([club, ps]) => Object.keys(ps).map(n => `${club}|${n}`)));
  let gap = 0, n = 0;
  for (const c of s.clubs) {
    const own = c.players.filter(p => imported.has(`${c.name}|${p.name}`)), gen = c.players.filter(p => !imported.has(`${c.name}|${p.name}`));
    if (own.length < 3 || gen.length < 3) continue;
    const avg = ps => ps.reduce((t, p) => t + overall(p), 0) / ps.length;
    gap += Math.abs(avg(own) - avg(gen)); n++;
  }
  assert.ok(gap / n < 8, `mean within-club gap ${(gap / n).toFixed(1)}`);
});

test('the free-agent list has players worth signing below the Premier League', () => {
  const s = createWorld(1);
  const best = Math.max(...s.market.map(p => overall(p)));
  const weakestChampionshipXI = Math.min(...s.divisions[1].clubIds.map(id => {
    const o = s.clubs[id].players.map(p => overall(p)).sort((a, b) => b - a);
    return o[10];                                   // the 11th-best player
  }));
  assert.ok(best > weakestChampionshipXI, `${best} vs ${weakestChampionshipXI}`);
});

test('a season of real leagues plays like real football', () => {
  const s = createWorld(1);
  let n = 0, goals = 0, home = 0, yellows = 0, reds = 0, pens = 0, out = 0, matchDays = 0;
  while (!s.done) {
    out += s.clubs.reduce((t, c) => t + c.players.filter(p => !available(p)).length, 0); matchDays++;
    for (const r of playDay(s).filter(x => x.item.comp === 'league')) {
      n++; goals += r.hg + r.ag; if (r.hg > r.ag) home++;
      yellows += r.stats[0].yc + r.stats[1].yc; reds += r.stats[0].rc + r.stats[1].rc;
      pens += r.ev.filter(e => e.kind === 'pen').length;
    }
  }
  const missing = out / matchDays / s.clubs.length;
  assert.ok(goals / n >= 2.5 && goals / n <= 2.9, `goals per match ${goals / n}`);
  assert.ok(home / n >= 0.42 && home / n <= 0.47, `home wins ${home / n}`);
  assert.ok(yellows / n >= 2.5 && yellows / n <= 4, `yellows per match ${yellows / n}`);
  assert.ok(reds / n <= 0.3, `reds per match ${reds / n}`);
  assert.ok(pens / n >= 0.15 && pens / n <= 0.4, `penalties per match ${pens / n}`);
  assert.ok(missing >= 0.5 && missing <= 3, `players out per club ${missing}`);
});

const median = list => [...list].sort((a, b) => a - b)[list.length >> 1];

test('real-world money: stars cost tens of millions, League One regulars a few hundred thousand', () => {
  const s = createWorld(1), squad = d => s.divisions[d].clubIds.flatMap(id => s.clubs[id].players);
  const best = squad(0).reduce((b, p) => overall(p) > overall(b) ? p : b), l1 = squad(2);
  const v = { best: value(best), bestWage: best.contract.wage, l1: median(l1.map(value)), l1Wage: median(l1.map(p => p.contract.wage)) };
  assert.ok(v.best >= 50e6 && v.best <= 150e6, JSON.stringify(v));
  assert.ok(v.bestWage >= 30e3 && v.bestWage <= 90e3, JSON.stringify(v));
  assert.ok(v.l1 >= 0.1e6 && v.l1 <= 1.5e6, JSON.stringify(v));
  assert.ok(v.l1Wage >= 300 && v.l1Wage <= 2e3, JSON.stringify(v));
});

test('a season of real club books: the Premier League is rich, wages are a small part of the income of every club', () => {
  const s = createWorld(1);
  while (!s.done) playDay(s);
  const div = d => {
    const L = s.divisions[d].clubIds.map(id => s.clubs[id].fin.season);
    const income = L.reduce((t, x) => t + x.broadcast + x.sponsor + x.gate, 0);
    return { income: income / L.length, ratio: L.reduce((t, x) => t + x.wages, 0) / income };
  };
  const [pl, ch, l1] = [0, 1, 2].map(div), info = JSON.stringify({ pl, ch, l1 });
  assert.ok(pl.ratio >= 0.05 && pl.ratio <= 0.2, info);
  assert.ok(ch.ratio >= 0.1 && ch.ratio <= 0.3, info);
  assert.ok(l1.ratio >= 0.1 && l1.ratio <= 0.3, info);
  assert.ok(pl.income >= 4 * ch.income, info); // 5× before Phase 7 raised EFL broadcast money
});

test('a season of the real transfer market: every division trades, squads keep their shape, the EFL stays solvent', () => {
  const s = createWorld(1);
  while (!s.done) playDay(s);
  const buys = s.deals.filter(d => d.from !== null && d.to !== null && !d.loan);
  const v = {
    buys: buys.length, byDiv: [0, 1, 2].map(d => buys.filter(x => s.clubs[x.to].div === d).length), top: Math.max(...buys.map(d => d.fee)),
    loans: s.deals.filter(d => d.loan).length, eflDebt: s.clubs.filter(c => c.div > 0 && c.fin.balance < 0).length,
    sizes: [Math.min(...s.clubs.map(c => c.players.length)), Math.max(...s.clubs.map(c => c.players.length))],
  }, info = JSON.stringify(v);
  assert.ok(v.buys >= 50 && v.buys <= 200, info);
  assert.ok(v.byDiv.every(n => n >= 10), info);
  assert.ok(v.top >= 20e6 && v.top <= 150e6, info);
  assert.ok(v.loans >= 1 && v.loans <= 40, info);
  assert.ok(v.eflDebt <= 3, info);
  assert.ok(v.sizes[0] >= MIN_SQUAD && v.sizes[1] <= MAX_SQUAD, info);
});
