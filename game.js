'use strict';
// Touchline — an original football management sim. Logic here, UI in index.html.
// All clubs and players are fictional and generated.
const FIRST = 'Adam Ben Carlos Dario Emil Felix Goran Hugo Ivan Jonas Karel Luca Milan Nico Oskar Pavel Rafa Stefan Tomas Viktor Wim Yann Zoran Andre Bruno'.split(' ');
const LAST = 'Novak Berg Castell Dvorak Eklund Fontana Greaves Holt Ilic Jansen Kovar Lindqvist Moreau Nemec Okafor Petrov Quint Rossi Svoboda Tanaka Urban Vesely Wolff Ybarra Zeman'.split(' ');
const CLUBS = ['Northgate Athletic', 'Rivermouth FC', 'Ironbridge United', 'Saltmarsh Town', 'Highfield Rovers', 'Oakhaven City',
  'Redcliff Wanderers', 'Stonewell Albion', 'Eastmoor Rangers', 'Larkspur FC', 'Coldharbour Vale', 'Wexley Borough'];
const POS = ['GK', 'DF', 'MF', 'FW'];
const FORMATIONS = { '4-4-2': [1, 4, 4, 2], '4-3-3': [1, 4, 3, 3], '3-5-2': [1, 3, 5, 2], '5-3-2': [1, 5, 3, 2], '4-5-1': [1, 4, 5, 1] };
const W = { GK: [0, 1.5], DF: [0, 1], MF: [.5, .5], FW: [1, 0] }; // [attack weight, defence weight]
const MIN_SQUAD = 14, MAX_SQUAD = 25;

const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const blank = () => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
const slots = f => FORMATIONS[f].flatMap((n, i) => Array(n).fill(POS[i]));
const value = p => Math.round((p.skill / 10) ** 4 * (p.age < 24 ? 1.3 : p.age > 30 ? 0.6 : 1)) * 1000;
const eff = (p, pos) => p.pos === pos ? p.skill : (p.pos === 'GK' || pos === 'GK') ? p.skill * 0.4 : p.skill * 0.75;

function newPlayer(s, pos, base, age = ri(17, 34)) {
  return { id: s.nid++, name: pick(FIRST) + ' ' + pick(LAST), pos, age, skill: clamp(Math.round(base + ri(-12, 12)), 30, 95) };
}

function makeFixtures(n) { // circle method, double round-robin
  const a = [...Array(n).keys()], half = [];
  for (let r = 0; r < n - 1; r++) {
    half.push(Array.from({ length: n / 2 }, (_, i) => r % 2 ? [a[n - 1 - i], a[i]] : [a[i], a[n - 1 - i]]));
    a.splice(1, 0, a.pop());
  }
  return half.concat(half.map(rd => rd.map(([h, w]) => [w, h])));
}

function newGame(me) {
  const s = { nid: 1, me, season: 1, round: 0, done: false, formation: '4-4-2', budget: 3e6, market: [], history: [], last: null };
  s.teams = CLUBS.map((name, i) => {
    const t = { name, players: [], st: blank() };
    for (const [pos, n] of [['GK', 2], ['DF', 6], ['MF', 6], ['FW', 4]])
      for (let k = 0; k < n; k++) t.players.push(newPlayer(s, pos, 72 - i * 1.5));
    return t;
  });
  for (let i = 0; i < 20; i++) s.market.push(newPlayer(s, pick(POS), 62));
  s.fixtures = makeFixtures(CLUBS.length);
  s.lineup = bestXI(s.teams[me], s.formation);
  return s;
}

// ponytail: greedy slot-by-slot pick, not an optimal assignment; swap for Hungarian if AI lineups look dumb.
function bestXI(team, f) {
  const used = new Set();
  return slots(f).map(pos => {
    const p = team.players.filter(p => !used.has(p.id)).sort((a, b) => eff(b, pos) - eff(a, pos))[0];
    used.add(p.id);
    return p.id;
  });
}

function fixLineup(s) {
  const ids = new Set(s.teams[s.me].players.map(p => p.id));
  if (s.lineup.length !== 11 || new Set(s.lineup).size !== 11 || s.lineup.some(id => !ids.has(id)))
    s.lineup = bestXI(s.teams[s.me], s.formation);
}

function strength(team, ids, f) {
  const pos = slots(f), by = new Map(team.players.map(p => [p.id, p]));
  let a = 0, aw = 0, d = 0, dw = 0;
  ids.forEach((id, i) => {
    const e = eff(by.get(id), pos[i]), [wa, wd] = W[pos[i]];
    a += e * wa; aw += wa; d += e * wd; dw += wd;
  });
  const [, nd, , nf] = FORMATIONS[f]; // more forwards = more attack, more defenders = more defence
  return { att: a / aw * (1 + .03 * (nf - 2)), def: d / dw * (1 + .03 * (nd - 4)) };
}

function poisson(l) {
  let k = 0, p = Math.exp(-l), c = p; const u = Math.random();
  while (u > c && k < 12) { k++; p *= l / k; c += p; }
  return k;
}

function simMatch(s, h, a) {
  const side = i => {
    const [ids, f] = i === s.me ? [s.lineup, s.formation] : [bestXI(s.teams[i], '4-4-2'), '4-4-2'];
    return { ids, pos: slots(f), by: new Map(s.teams[i].players.map(p => [p.id, p])), ...strength(s.teams[i], ids, f) };
  };
  const H = side(h), A = side(a);
  const hg = poisson(1.35 * 1.15 * Math.exp((H.att - A.def) / 15)), ag = poisson(1.35 * Math.exp((A.att - H.def) / 15));
  const scorer = T => { // weighted by slot: FW 4, MF 2, DF 1
    const pool = T.ids.flatMap((id, i) => Array({ GK: 0, DF: 1, MF: 2, FW: 4 }[T.pos[i]]).fill(id));
    return T.by.get(pick(pool)).name;
  };
  const ev = [...Array(hg).fill([h, H]), ...Array(ag).fill([a, A])]
    .map(([team, T]) => ({ min: ri(1, 90), team, name: scorer(T) })).sort((x, y) => x.min - y.min);
  return { h, a, hg, ag, ev };
}

function playRound(s) {
  if (s.done) return null;
  fixLineup(s);
  s.last = s.fixtures[s.round].map(([h, a]) => {
    const r = simMatch(s, h, a), H = s.teams[h].st, A = s.teams[a].st;
    H.p++; A.p++; H.gf += r.hg; H.ga += r.ag; A.gf += r.ag; A.ga += r.hg;
    if (r.hg > r.ag) { H.w++; A.l++; H.pts += 3; } else if (r.hg < r.ag) { A.w++; H.l++; A.pts += 3; } else { H.d++; A.d++; H.pts++; A.pts++; }
    if (h === s.me) s.budget += 100e3; // gate receipts
    return r;
  });
  s.budget += 150e3;
  s.done = ++s.round === s.fixtures.length;
  return s.last;
}

function table(s) {
  return s.teams.map((t, i) => i).sort((x, y) => {
    const a = s.teams[x].st, b = s.teams[y].st;
    return b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf;
  });
}

function endSeason(s) {
  if (!s.done) return;
  const tb = table(s), pos = tb.indexOf(s.me) + 1, prize = (CLUBS.length + 1 - pos) * 250e3;
  s.history.push({ season: s.season, champion: s.teams[tb[0]].name, pos, prize });
  s.budget += prize;
  for (const t of s.teams) {
    t.st = blank();
    t.players = t.players.map(p => {
      if (p.age >= 35) return newPlayer(s, p.pos, 58, ri(17, 19)); // retire -> youth intake
      p.age++;
      p.skill = clamp(p.skill + (p.age < 24 ? ri(0, 4) : p.age > 30 ? -ri(0, 4) : ri(-1, 1)), 30, 99);
      return p;
    });
  }
  s.market = Array.from({ length: 20 }, () => newPlayer(s, pick(POS), 62));
  s.fixtures = makeFixtures(CLUBS.length);
  s.round = 0; s.done = false; s.last = null; s.season++;
  fixLineup(s);
}

// ponytail: only the human trades; AI squads change via ageing/youth only. Add AI transfers if the league feels static.
function buy(s, id) {
  const i = s.market.findIndex(p => p.id === id), team = s.teams[s.me];
  if (i < 0) return 'Player not available.';
  if (team.players.length >= MAX_SQUAD) return `Squad is full (${MAX_SQUAD}).`;
  if (value(s.market[i]) > s.budget) return 'Not enough budget.';
  s.budget -= value(s.market[i]);
  team.players.push(...s.market.splice(i, 1));
  return null;
}

function sell(s, id) {
  const team = s.teams[s.me], i = team.players.findIndex(p => p.id === id);
  if (i < 0) return 'Not your player.';
  if (team.players.length <= MIN_SQUAD) return `You need at least ${MIN_SQUAD} players.`;
  const [p] = team.players.splice(i, 1);
  s.budget += Math.round(value(p) * 0.8);
  s.market.push(p);
  fixLineup(s);
  return null;
}

// Self-check: `node game.js`
if (typeof module !== 'undefined' && require.main === module) {
  const assert = require('assert');
  const s = newGame(3), n = CLUBS.length;
  const seen = {};
  s.fixtures.forEach(rd => { assert.equal(new Set(rd.flat()).size, n); rd.forEach(([h, a]) => seen[h + '-' + a] = (seen[h + '-' + a] || 0) + 1); });
  assert.equal(Object.keys(seen).length, n * (n - 1)); // every pair, home and away, exactly once
  assert(Object.values(seen).every(c => c === 1));
  const b0 = s.budget, cheap = [...s.market].sort((a, b) => value(a) - value(b))[0];
  assert.equal(buy(s, cheap.id), null); assert.equal(s.budget, b0 - value(cheap));
  assert.equal(sell(s, s.lineup[0]), null); // selling a starter must leave a valid XI
  for (let season = 0; season < 3; season++) {
    while (!s.done) { playRound(s); assert.equal(new Set(s.lineup).size, 11); }
    const st = s.teams.map(t => t.st), sum = k => st.reduce((x, t) => x + t[k], 0);
    assert(st.every(t => t.p === 2 * (n - 1) && t.p === t.w + t.d + t.l && t.pts === 3 * t.w + t.d));
    assert.equal(sum('w'), sum('l')); assert.equal(sum('gf'), sum('ga'));
    assert.equal(playRound(s), null);
    endSeason(s);
    assert(s.round === 0 && s.teams.every(t => t.st.p === 0 && t.players.length >= MIN_SQUAD));
  }
  assert.equal(s.history.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s); // state survives save/load
  console.log('ok — 3 seasons simulated; champions:', s.history.map(h => h.champion).join(', '));
}
