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
  });
}

const HEAD = ['season', 'ms', 'goals', 'home', 'sacked', 'ovr', 'PL €M', 'best €M', 'wage', 'gz KB', 'employed'].join('\t');
const line = r => [r.season, Math.round(r.ms), (r.goals / r.matches).toFixed(2), (r.homeWins / r.matches).toFixed(3), r.sackings,
  r.avgOvr.toFixed(1), Math.round(r.plBalance / 1e6), Math.round(r.bestValue / 1e6), r.medianWage, Math.round(r.gzBytes / 1024), r.employed ? 'yes' : 'no'].join('\t');

function main() {
  const [seeds = '1,2,3', seasons = '20'] = process.argv.slice(2);
  for (const seed of seeds.split(',').map(Number)) {
    const s = createWorld(seed);
    startCareer(s, 0);
    console.log(`\nseed ${seed}\n${HEAD}`);
    for (let y = 0; y < +seasons; y++) console.log(line(soakSeason(s)));
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
