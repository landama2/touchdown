// The 20-season soak (Phase 12): whole seasons with no human input, measured against TARGETS and BUDGET.
// Run: npm run soak, or npm run soak -- 1,2,3 20 (seeds, seasons). Exits 1 when a target or budget is missed.
// The career is on autopilot: the default lineup every day, and the first job offered while out of work.
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { createWorld } from '../src/world.js';
import { playDay, endSeason } from '../src/season.js';
import { startCareer, acceptJob } from '../src/career.js';
import { serialize, deserialize } from '../src/save.js';
import { overall, value } from '../src/player.js';

const median = l => [...l].sort((a, b) => a - b)[l.length >> 1];
const mean = l => l.reduce((t, x) => t + x, 0) / l.length;

// Plausible ranges (Phase 12 decisions). Rates are judged per block of BLOCK seasons: one season's home-win
// share wanders by ±3 points on its own. Levels are judged every season.
export const TARGETS = {
  goals: [2.5, 2.9],             // per league match (roadmap)
  homeWins: [0.43, 0.47],        // share of league matches (roadmap)
  sackings: [10, 20],            // AI sackings a season (roadmap, Phase 10 note)
  avgOvr: [61, 66],              // club players; 63.3 at the start of the real data
  plBalance: [-Infinity, 800e6], // median Premier League balance (Phase 7 and 10 notes); the owners' cap holds it near 5 × €135M
  bestValue: [50e6, 200e6],      // the most valuable player
  medianWage: [1500, 3000],      // a week, club players; €1,900 at the start
};
export const BUDGET = { ms: 3000, slowestDayMs: 150, saveBytes: 1.2e6, gzBytes: 200e3 }; // Node on the owner's machine; JSON characters; gzip bytes
export const BLOCK = 5;

const LEVELS = { avgOvr: 'average overall', plBalance: 'median PL balance', bestValue: 'best player value', medianWage: 'median wage' };
const COSTS = { ms: 'season ms', slowestDayMs: 'slowest day ms', saveBytes: 'save size', gzBytes: 'gzipped save' };

// The misses in one seed's rows, as text.
export function check(rows) {
  const out = [], miss = (where, what, v, [lo, hi]) => { if (!(v >= lo && v <= hi)) out.push(`${where}: ${what} ${+v.toFixed(3)} outside ${lo}–${hi}`); };
  for (let k = 0; k < rows.length; k += BLOCK) {
    const b = rows.slice(k, k + BLOCK), sum = f => b.reduce((t, r) => t + r[f], 0), where = `seasons ${b[0].season}–${b.at(-1).season}`;
    miss(where, 'goals per match', sum('goals') / sum('matches'), TARGETS.goals);
    miss(where, 'home wins', sum('homeWins') / sum('matches'), TARGETS.homeWins);
    miss(where, 'AI sackings a season', sum('sackings') / b.length, TARGETS.sackings);
  }
  for (const r of rows) {
    const where = `season ${r.season}`;
    for (const [f, what] of Object.entries(LEVELS)) miss(where, what, r[f], TARGETS[f]);
    for (const [f, what] of Object.entries(COSTS)) miss(where, what, r[f], [0, BUDGET[f]]);
    if (!r.loads) out.push(`${where}: the save does not load back`);
  }
  return out;
}

// One season of s; returns its row. now() gives milliseconds (passed in so tests can fake it).
export function soakSeason(s, now = () => performance.now()) {
  const row = { season: s.season, matches: 0, goals: 0, homeWins: 0, sackings: 0, slowestDayMs: 0 };
  // A sacking opens a vacancy in s.jobs. The rollover reopens an open vacancy by changing it in place,
  // so vacancies are told apart by object, not by their fields.
  const seen = new WeakSet(s.jobs), count = () => { for (const j of s.jobs) if (!seen.has(j)) { seen.add(j); row.sackings++; } };
  const humanLeft = () => s.career.spells.filter(x => x.to != null).length, left0 = humanLeft();
  const t0 = now();
  while (!s.done) {
    const t = now();
    for (const r of playDay(s)) if (r.item.comp === 'league') { row.matches++; row.goals += r.hg + r.ag; if (r.hg > r.ag) row.homeWins++; }
    row.slowestDayMs = Math.max(row.slowestDayMs, now() - t);
    count();
    if (s.me === null) { const j = s.jobs.find(x => x.offered); if (j) acceptJob(s, j.club); }
  }
  endSeason(s);
  count();
  row.sackings -= humanLeft() - left0; // the human manager leaving opens a vacancy too; only AI sackings count
  const players = s.clubs.flatMap(c => c.players), pl = s.divisions[0].clubIds.map(id => s.clubs[id]), text = serialize(s);
  return Object.assign(row, {
    ms: now() - t0,
    avgOvr: mean(players.map(p => overall(p))),
    plBalance: median(pl.map(c => c.fin.balance)),
    bestValue: Math.max(...players.map(value)),
    medianWage: median(players.map(p => p.contract.wage)),
    saveBytes: text.length,
    gzBytes: gzipSync(text).length,
    loads: deserialize(text) !== null,
    employed: s.me !== null,
    ovrBy: Object.fromEntries(['GK', 'DF', 'MF', 'FW'].map(pos => [pos, +mean(players.filter(p => p.pos === pos).map(p => overall(p))).toFixed(1)])),
    avgAge: +mean(players.map(p => p.age)).toFixed(1),
    under21: +(players.filter(p => p.age < 21).length / players.length).toFixed(3),
  });
}

const HEAD = ['season', 'ms', 'goals', 'home', 'sacked', 'ovr', 'PL €M', 'best €M', 'wage', 'gz KB', 'employed', 'by position', 'age', 'u21'].join('\t');
const line = r => [r.season, Math.round(r.ms), (r.goals / r.matches).toFixed(2), (r.homeWins / r.matches).toFixed(3), r.sackings,
  r.avgOvr.toFixed(1), Math.round(r.plBalance / 1e6), Math.round(r.bestValue / 1e6), r.medianWage, Math.round(r.gzBytes / 1024), r.employed ? 'yes' : 'no',
  JSON.stringify(r.ovrBy), r.avgAge, r.under21].join('\t');

function main() {
  const [seeds = '1,2,3', seasons = '20'] = process.argv.slice(2);
  let misses = 0;
  for (const seed of seeds.split(',').map(Number)) {
    const s = createWorld(seed), rows = [];
    startCareer(s, 0);
    console.log(`\nseed ${seed}\n${HEAD}`);
    for (let y = 0; y < +seasons; y++) { rows.push(soakSeason(s)); console.log(line(rows.at(-1))); }
    const found = check(rows);
    for (const m of found) console.log(`MISS seed ${seed}, ${m}`);
    console.log(`employed ${rows.filter(r => r.employed).length} of ${rows.length} seasons`);
    misses += found.length;
  }
  console.log(misses ? `\n${misses} misses` : '\nall targets and budgets met');
  process.exitCode = misses ? 1 : 0;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
