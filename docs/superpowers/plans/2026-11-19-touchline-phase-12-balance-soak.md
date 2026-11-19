# Touchline Phase 12: balance and soak

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: in progress. Decisions accepted by the owner 2026-11-19 (decision 1 changed to five seasons; decision 6 added at the owner's request). Base: main @ 85a3315.

**Goal:** Prove that a 20-season career stays plausible, and fix whatever drifts: a soak script plays whole seasons with no input and checks the world against statistical targets, a performance budget and a save-size budget.

**Architecture:** One new script, `scripts/soak.mjs`, plays seasons through the same engine calls the UI uses (`playDay` until `s.done`, then `endSeason`), with the career on autopilot. It records one row of numbers per season and checks the rows against `TARGETS` and `BUDGET`. Fixes go into the engine modules that own each number, one constant or rule at a time, re-measured by the soak after each change.

**Tech Stack:** Plain ES modules, Node's built-in test runner, `node:zlib` for the gzipped size (the browser stores saves gzipped, see `src/ui/app.js`). No new dependencies.

## Global Constraints

- No build step, no runtime dependencies. Tests use `node --test`.
- Engine is pure: no DOM, no `Math.random`, no `Date` under `src/` outside `src/ui/`. The soak script lives in `scripts/`, so it may use `performance.now()`; it passes the clock into `soakSeason()`.
- Determinism: same seed + same inputs = same career. The soak must give the same rows on every run except `ms` and `slowestDayMs`.
- Every save carries `version`; a change to the state's shape bumps `SAVE_VERSION` in `src/save.js` with a migration and a test. One bump is planned: version 14 for the stadium (Task 5).
- Fun surprises (roadmap rule): a quirk that is fun is kept, not fixed, and recorded in `docs/fun-surprises.md`. Every triage in this phase applies it.
- `npm test` stays fast (about 8 s today). The 20-season soak is `npm run soak`, not part of `npm test`.

## What the baseline shows (measured 2026-11-19, seed 1, career at club 0, 20 seasons)

| Measure | Season 1 | Worst | Target |
|---|---|---|---|
| Goals per league match | 2.69 | 2.44 (season 18); seasons 16–20 average 2.50 | 2.5–2.9 |
| Home wins | 44.7% | 41.0% in one season; every 5-season block 43–45% | 43–47% |
| AI sackings a season | 1 (first season) | 22 (season 9); seasons 6–10 average 20.2 | 10–20 |
| Average overall, club players | 63.3 | 66.3 (season 6), 61.1 (season 15) | levels off |
| Median Premier League balance | €157M | €1.93B (season 20), still rising | reined in |
| Most valuable player | €115M | €186M | plausible |
| Median wage, club players | €1,900/wk | €900/wk (season 15) | plausible |
| One season, Node | 1.3 s | 1.44 s | budget |
| Save, JSON / gzipped | 957 KB / 117 KB | stable, slightly shrinking | budget |
| Human manager | sacked in season 2 | never hired again (the script took no offers) | survives 20 seasons |

Causes as far as known:
- **Money.** Wages were cut to a fifth in save version 13 (`WAGE_CUT` in `src/finance.js`) while income stayed the same, so every Premier League club banks about €100M a season and nothing spends it. The roadmap left this for Phase 12 (Phase 7 and Phase 10 notes).
- **Overall swing and wage fall.** Not known yet. The real squads start with real ages, the old stars retire over seasons 5–15, and they are replaced by academy players (`academy()` in `src/contracts.js`) and free agents (`newFreeAgent` in `src/world.js`). Wages follow overall (`wage()` in `src/finance.js`, ×0.6 under 21), so the wage fall probably follows the overall fall and a younger league. Task 6 measures this before changing anything.
- **Goals falling late.** Not known yet. Probably tied to the same change in who plays: positions may age and be replaced at different quality. Task 6 again.
- **Sackings.** Slightly high in the middle seasons; may move once money and squads are steadier. Task 7.

## Decisions (owner, please say yes or change)

1. **Owners take the surplus (owner, 2026-11-19: five seasons, every club).** Each summer every club, yours included, pays out anything above five seasons of its projected income (`projection()` in `src/finance.js`) to its owners, booked as dividends. Projected income at the start: Premier League median €135M (cap about €675M), Championship €26M (€130M), League One €11M (€55M). In the baseline the median Premier League club reaches the cap around season 6, so the first five seasons barely change. Your own shares still pay you first, from the season's profit, as now.
2. **Soak setup.** Seeds 1, 2 and 3, 20 seasons each, career at club 0, about 80 s in total. `npm run soak`, not in `npm test`; `npm test` gets a one-season smoke test and the checking rules.
3. **Autopilot career.** The soak's manager makes no choices: default lineup and tactics, and while out of work he takes the first job offered. A "career that survives 20 seasons" means 20 seasons that play without an error and save and reload every season. How long he is out of work is reported, not judged.
4. **Noisy rates are judged per block of five seasons.** Goals, home wins and sackings per block (one season of about 1,500 league matches is too noisy for a 4-point band; home wins varied from 41% to 46% between single seasons). Levels (overall, balances, values, wages) and budgets are judged every season.
5. **Targets.** As in the table in Task 2: goals 2.5–2.9, home wins 43–47%, AI sackings 10–20 a season (roadmap), average overall 61–66, median Premier League balance at most €800M (just above the five-season cap), most valuable player €50M–€200M, median club wage €1,500–€3,000 a week. Budgets: one season ≤ 3 s, one day ≤ 150 ms (Node, this machine), save ≤ 1.2 MB of JSON and ≤ 200 KB gzipped.
6. **Something to spend on: the stadium (owner, 2026-11-19: "consider new spending opportunities, such as the stadium").** Proposal: your club can build its stadium up, five levels, each adding 15% to gate receipts for good. A level costs eight seasons of what it adds, paid from the transfer budget (Premier League median about €12M, League One about €6M), so it pays back in about eight seasons. Gate receipts matter most lower down: about €5M of League One's €11M a season, against €10M of €135M in the Premier League. Only your club builds in this phase, so the soak's world numbers stay comparable. Needs save version 14. Later candidates, not in this phase: a training ground and an academy building (both overlap the staff levels from Phase 9, which already raise growth and the youth intake), AI clubs building with their surplus.

## File map

- Create `scripts/soak.mjs`: `soakSeason()`, `check()`, `TARGETS`, `BUDGET`, and the command-line run.
- Create `tests/soak.test.js`: the checking rules on made-up rows, and one real season.
- Modify `package.json`: the `soak` script.
- Modify `src/finance.js`: `OWNER_CAP` and `ownerTake()` (Task 4).
- Modify `src/season.js`: call `ownerTake()` in `endSeason()` (Task 4).
- Modify `tests/finance.test.js`: the owner-take test (Task 4).
- Modify `src/finance.js`, `src/world.js`, `src/save.js`, `src/ui/app.js`, `tests/save.test.js`: the stadium and save version 14 (Task 5).
- Tasks 6 and 7 modify whichever constants the measurements point at; candidates are listed in each task.
- Modify `docs/superpowers/plans/2026-11-15-touchline-roadmap.md` and this file: results and notes (Task 8).

---

### Task 1: the soak harness

**Files:**
- Create: `scripts/soak.mjs`
- Create: `tests/soak.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createWorld(seed)` (`src/world.js`), `startCareer(s, clubId)` and `acceptJob(s, clubId)` (`src/career.js`), `playDay(s)` and `endSeason(s)` (`src/season.js`), `serialize(s)` and `deserialize(text)` (`src/save.js`), `overall(p)` and `value(p)` (`src/player.js`).
- Produces: `soakSeason(s, now?) → row`, where row is `{ season, matches, goals, homeWins, sackings, slowestDayMs, ms, avgOvr, plBalance, bestValue, medianWage, saveBytes, gzBytes, loads, employed }` (counts for one season of league matches; `saveBytes` is the JSON length in characters).

- [ ] **Step 1: Write the failing test** in `tests/soak.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { startCareer } from '../src/career.js';
import { soakSeason } from '../scripts/soak.mjs';

test('soakSeason: one season of the real world, the career on autopilot', () => {
  const s = createWorld(1);
  startCareer(s, 0);
  let t = 0;
  const r = soakSeason(s, () => t++); // a fake clock: the row's timings are counts of calls, not real time
  assert.equal(r.season, 1);
  assert.equal(s.season, 2);           // endSeason ran
  assert.ok(r.matches > 1000, `${r.matches} league matches`);
  assert.ok(r.goals / r.matches > 2 && r.goals / r.matches < 3.5);
  assert.ok(r.sackings >= 0 && r.sackings < 40, `${r.sackings} sackings`);
  assert.ok(r.avgOvr > 50 && r.avgOvr < 80);
  assert.ok(r.loads, 'the save loads back');
  assert.ok(r.gzBytes > 0 && r.gzBytes < r.saveBytes);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/soak.test.js`
Expected: FAIL, `Cannot find module '.../scripts/soak.mjs'`.

- [ ] **Step 3: Write `scripts/soak.mjs`** (the `check()` part comes in Task 2):

```js
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
```

- [ ] **Step 4: Add the npm script** in `package.json`, after `"test"`:

```json
    "soak": "node scripts/soak.mjs",
```

- [ ] **Step 5: Run the test and the full suite**

Run: `node --test tests/soak.test.js`, then `npm test`
Expected: PASS for both (264 tests).

- [ ] **Step 6: Run a short soak by hand**

Run: `npm run soak -- 1 3`
Expected: three rows close to the baseline table above (season 1: goals 2.69, home 0.447, ovr 63.3).

- [ ] **Step 7: Commit**

```bash
git add scripts/soak.mjs tests/soak.test.js package.json
git commit -m "feat: Phase 12 task 1: the soak harness"
```

### Task 2: targets, budgets and the check

**Files:**
- Modify: `scripts/soak.mjs`
- Modify: `tests/soak.test.js`

**Interfaces:**
- Consumes: the row from Task 1.
- Produces: `TARGETS`, `BUDGET`, `BLOCK` (5) and `check(rows) → string[]`, one line per miss, each starting with `seasons a–b:` (block rates) or `season n:` (levels and budgets).

- [ ] **Step 1: Write the failing test**. Add to `tests/soak.test.js`, and add `check` to its import from `../scripts/soak.mjs`:

```js
const good = season => ({ season, matches: 1484, goals: 1484 * 2.7, homeWins: 1484 * 0.45, sackings: 15, ms: 1300, slowestDayMs: 40,
  avgOvr: 63, plBalance: 150e6, bestValue: 115e6, medianWage: 1900, saveBytes: 957e3, gzBytes: 117e3, loads: true, employed: true });

test('check: rates are judged per block of five seasons, levels and budgets every season', () => {
  const rows = Array.from({ length: 10 }, (_, k) => good(k + 1));
  assert.deepEqual(check(rows), []);
  rows[0].goals = 1484 * 2.0;          // one low season: seasons 1-5 still average 2.56
  assert.deepEqual(check(rows), []);
  rows[1].goals = 1484 * 2.0;          // two: the block averages 2.42
  assert.deepEqual(check(rows).map(m => m.split(':')[0]), ['seasons 1–5']);
  rows[7].plBalance = 900e6;           // a level: judged in its own season
  rows[7].loads = false;
  assert.deepEqual(check(rows).map(m => m.split(':')[0]), ['seasons 1–5', 'season 8', 'season 8']);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/soak.test.js`
Expected: FAIL, `check` is not exported.

- [ ] **Step 3: Add the targets and `check()`** to `scripts/soak.mjs`, below `mean`:

```js
// Plausible ranges (Phase 12 decisions). Rates are judged per block of BLOCK seasons: one season's home-win
// share wanders by ±3 points on its own. Levels are judged every season.
export const TARGETS = {
  goals: [2.5, 2.9],           // per league match (roadmap)
  homeWins: [0.43, 0.47],      // share of league matches (roadmap)
  sackings: [10, 20],          // AI sackings a season (roadmap, Phase 10 note)
  avgOvr: [61, 66],            // club players; 63.3 at the start of the real data
  plBalance: [-Infinity, 800e6], // median Premier League balance (Phase 7 and 10 notes); the owners' cap holds it near 5 × €135M
  bestValue: [50e6, 200e6],    // the most valuable player
  medianWage: [1500, 3000],    // a week, club players; €1,900 at the start
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
```

- [ ] **Step 4: Make the command line report misses**. Replace `main()` in `scripts/soak.mjs` with:

```js
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
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS (265 tests).

- [ ] **Step 6: Record the baseline**

Run: `npm run soak` (about 80 s; run it in the background).
Expected: exit code 1. From seed 1 the misses should include the median PL balance from about season 7, the median wage from about season 10, sackings in seasons 6–10 and goals in seasons 16–20. Copy the `MISS` lines of all three seeds into "Results" at the end of this file.

- [ ] **Step 7: Commit**

```bash
git add scripts/soak.mjs tests/soak.test.js docs/superpowers/plans/2026-11-19-touchline-phase-12-balance-soak.md
git commit -m "feat: Phase 12 task 2: soak targets, budgets and baseline"
```

### Task 3: show the decisions' effect on fun surprises before changing rules

No code. Read `docs/fun-surprises.md` and mark which entries Tasks 4–7 could touch. Known now:
- The stadium (Task 5) adds to the club's projected income, so it raises the owners' cap, the club's share value (#32: `clubValue` is 2 × projection) and the board's view of the wage bill. A stand worth €12M raises a Premier League club's value by about €3M, so building is no shortcut to rich shares; check that stays true.
- #32 (shares outlive the job; 25% makes the board say yes): owners taking the surplus caps what a yes is worth. The quirk itself stays.
- #31 (bring your own squad) and every money quirk: smaller club balances make fees smaller. Check they still work in a short game after Task 4.
- #1 (the formation edge) and #5 (re-slotting): must survive any match-engine change in Task 6.

- [ ] **Step 1:** Add a "Fun surprises at risk" list to "Results" at the end of this file. No commit on its own; it goes in with Task 4.

### Task 4: owners take the surplus (decision 1)

**Files:**
- Modify: `src/finance.js` (next to `payPrizes`)
- Modify: `src/season.js:endSeason`, right after `seasonReview(s, tables, h);`
- Test: `tests/finance.test.js`

**Interfaces:**
- Consumes: `projection(s, c)` and the private `round(x, step)` in `src/finance.js`.
- Produces: `OWNER_CAP` (5) and `ownerTake(s)`, which changes `c.fin.balance` and `c.fin.season.dividends` for every club and returns nothing.

- [ ] **Step 1: Write the failing test** in `tests/finance.test.js`. Add `OWNER_CAP`, `ownerTake` and `projection` to its import from `../src/finance.js`, and `createWorld` from `../src/world.js` if it is not imported yet:

```js
test('owners take the surplus: each summer a balance above five seasons of projected income is paid out', () => {
  const s = createWorld(1), [rich, poor] = s.clubs;
  const cap = c => Math.round(OWNER_CAP * projection(s, c) / 1e5) * 1e5;
  rich.fin.balance = 3 * cap(rich);
  poor.fin.balance = cap(poor) / 2;
  ownerTake(s);
  assert.equal(rich.fin.balance, cap(rich));
  assert.equal(rich.fin.season.dividends, 2 * cap(rich));
  assert.equal(poor.fin.balance, cap(poor) / 2);
  assert.equal(poor.fin.season.dividends, 0);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/finance.test.js`
Expected: FAIL, `ownerTake` is not exported.

- [ ] **Step 3: Implement** in `src/finance.js`:

```js
// Each summer the owners take out whatever a club holds above OWNER_CAP seasons of projected income (Phase 12):
// without it, wages a fifth of their old size (WAGE_CUT) let Premier League clubs bank about €100M a season forever.
// Booked as dividends, after the manager's own dividends (src/career.js), which come out of the season's profit.
export const OWNER_CAP = 5; // owner's choice, 2026-11-19
export function ownerTake(s) {
  for (const c of s.clubs) {
    const x = Math.max(0, c.fin.balance - round(OWNER_CAP * projection(s, c), 1e5));
    c.fin.balance -= x; c.fin.season.dividends += x;
  }
}
```

In `src/season.js`, add `ownerTake` to the import from `./finance.js`, and in `endSeason()` change

```js
  seasonReview(s, tables, h); // boards and the manager's reputation, before the clubs move
```

to

```js
  seasonReview(s, tables, h); // boards and the manager's reputation, before the clubs move
  ownerTake(s); // owners take the surplus, by the division the club played in
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS. If a season test assumed balances only grow, fix the test's expectation, not the rule, and say so in the commit message.

- [ ] **Step 5: Soak**

Run: `npm run soak` (background).
Expected: no PL-balance misses, and the median PL balance flat from about season 6. Note the new sackings, overall and wage numbers in "Results": rich AI clubs now stop growing richer, which may change the market from then on.

- [ ] **Step 6: Check the fun surprises at risk** (Task 3 list) in a short game in the browser: buy 25% of your club, ask the board for money, buy a player with your own money. Record what still works.

- [ ] **Step 7: Commit**

```bash
git add src/finance.js src/season.js tests/finance.test.js docs/superpowers/plans/2026-11-19-touchline-phase-12-balance-soak.md
git commit -m "feat: Phase 12 task 4: owners take the surplus each summer"
```

### Task 5: the stadium (decision 6)

**Files:**
- Modify: `src/finance.js` (`GATE` line and `gate`, `blankLedger`, `profit`, new `STADIUM`, `stadiumCost`, `buildStadium`)
- Modify: `src/world.js:72` (new clubs start at level 0)
- Modify: `src/save.js` (`SAVE_VERSION` 14, migration `13`)
- Modify: `src/ui/app.js` (`Finances()` view, a `build` action)
- Test: `tests/finance.test.js`, `tests/save.test.js`

**Interfaces:**
- Consumes: `s.me`, `s.budget` (set by `seasonBudgets()`), `c.quality`, `s.divisions[c.div].clubIds`.
- Produces: `c.stadium` (0..`STADIUM.max`) on every club; `c.fin.season.build` in every ledger; `STADIUM = { max: 5, boost: 0.15, payback: 8 }`; `stadiumCost(s, c) → euros`; `buildStadium(s) → null | message`.

- [ ] **Step 1: Write the failing tests**. In `tests/finance.test.js` add `STADIUM`, `stadiumCost` and `buildStadium` to the import from `../src/finance.js`, import `createWorld` from `../src/world.js` and `startCareer` from `../src/career.js` if not imported yet, and add:

```js
test('the stadium: a level adds 15% to gate receipts for good and costs eight seasons of what it adds, from the transfer budget', () => {
  const s = createWorld(1);
  startCareer(s, 0);
  const c = s.clubs[0], g = gate(c), cost = stadiumCost(s, c), homeGames = s.divisions[c.div].clubIds.length - 1;
  assert.equal(c.stadium, 0);
  assert.ok(Math.abs(cost - STADIUM.payback * STADIUM.boost * g * homeGames) <= 1e5, `${cost}`);
  s.budget = cost;
  const balance = c.fin.balance;
  assert.equal(buildStadium(s), null);
  assert.equal(c.stadium, 1);
  assert.ok(Math.abs(gate(c) - g * (1 + STADIUM.boost)) <= 1e3, `${gate(c)} vs ${g}`);
  assert.equal(s.budget, 0);
  assert.equal(c.fin.balance, balance - cost);
  assert.equal(c.fin.season.build, cost);
  assert.match(buildStadium(s), /budget/);      // the next level costs more than the budget left
  c.stadium = STADIUM.max; s.budget = 1e12;
  assert.match(buildStadium(s), /as big/);
});
```

In `tests/save.test.js` add:

```js
test('version 13 saves get stadiums at level 0 and a building line in the books', () => {
  const s = createWorld(3);
  s.version = 13;
  for (const c of s.clubs) { delete c.stadium; delete c.fin.season.build; }
  const t = deserialize(serialize(s));
  assert.equal(t.version, SAVE_VERSION);
  assert.ok(t.clubs.every(c => c.stadium === 0 && c.fin.season.build === 0));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/finance.test.js tests/save.test.js`
Expected: FAIL, `stadiumCost` is not exported; the save test fails on `c.stadium === 0`.

- [ ] **Step 3: Implement** in `src/finance.js`. Change the `GATE` line's `gate` export and add the stadium below it:

```js
// The stadium (Phase 12): each level adds STADIUM.boost to gate receipts, for good. A level costs `payback` seasons
// of what it adds, paid from the transfer budget. Only the human club builds (AI clubs: a later phase).
export const STADIUM = { max: 5, boost: 0.15, payback: 8 };
const baseGate = c => GATE.at8 * Math.exp(GATE.growth * (c.quality - 8));
export const gate = c => round(baseGate(c) * (1 + STADIUM.boost * c.stadium), 1e3);
export const stadiumCost = (s, c) => round(STADIUM.payback * STADIUM.boost * baseGate(c) * (s.divisions[c.div].clubIds.length - 1), 1e5);
export function buildStadium(s) {
  const c = s.clubs[s.me], cost = stadiumCost(s, c);
  if (c.stadium >= STADIUM.max) return 'The stadium is as big as it gets.';
  if (cost > s.budget) return 'The next stand costs more than your transfer budget.';
  s.budget -= cost; c.fin.balance -= cost; c.fin.season.build += cost; c.stadium++;
  return null;
}
```

Remove the old `export const gate = c => round(GATE.at8 * Math.exp(GATE.growth * (c.quality - 8)), 1e3);`. At level 0 the new `gate` gives the same numbers, so the world's results do not change.

In `blankLedger` add `build: 0` after `staff: 0`, and in `profit` subtract `L.build`:

```js
export const blankLedger = () => ({ broadcast: 0, sponsor: 0, gate: 0, prize: 0, wages: 0, fees: 0, sales: 0, staff: 0, dividends: 0, build: 0 });
export const profit = c => { const L = c.fin.season; return L.broadcast + L.sponsor + L.gate + L.prize + L.sales - L.wages - L.fees - L.staff - L.build; };
```

In `src/world.js:72` set the level first in the loop body: `newBooks()` calls `projection()`, which calls `gate(c)`, so `c.stadium` must exist before it:

```js
  for (const c of s.clubs) { c.stadium = 0; for (const p of c.players) p.contract = startContract(p, s.season); c.fin = newBooks(s, c); c.lentPay = 0; }
```

In `src/save.js` set `SAVE_VERSION = 14`, append `14: stadium levels, a building line in the books` to its comment, and add the migration after `12:`:

```js
  13: s => { // stadiums start at level 0; the books get a line for building
    for (const c of s.clubs) { c.stadium = 0; c.fin.season.build = 0; }
  },
```

Check `valid()` in `src/save.js`: if it lists required club fields, add `stadium`.

- [ ] **Step 4: The screen.** In `src/ui/app.js` add `STADIUM`, `stadiumCost` and `buildStadium` to the import from `../finance.js`. In `Finances()`, add a costs row after the staff row:

```js
${line('Stadium building', L.build)}
```

and, after the table's closing `</div>`, the stadium line:

```js
      <p>Stadium level ${c.stadium} of ${STADIUM.max} · gate ${money(gate(c))} a home match${c.stadium < STADIUM.max ? ` <button data-act="build">Build a stand: ${money(stadiumCost(s, c))}, +${Math.round(STADIUM.boost * 100)}% gate for good</button>` : ''}</p>
```

(import `gate` from `../finance.js` too if `app.js` does not have it). Add the action next to `staff` in `actions`:

```js
  build() { msg = buildStadium(s) || 'The new stand is open: gate receipts are up for good.'; },
```

Add one sentence to the Finances `help()` text: `A bigger stadium earns more at every home game; a stand pays for itself in about ${STADIUM.payback} seasons.`

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: PASS. Tests that compare a whole ledger with `blankLedger()` or a hand-written ledger get `build: 0`; fix those expectations, not the rule.

- [ ] **Step 6: Try it in the browser**: start a League One career, open Finances, build a stand, check that the budget and balance fall by the cost, the level and gate rise, and that the game saves and reloads with the new level. Keyboard check: the button is reachable and named.

- [ ] **Step 7: Soak** `npm run soak -- 1 3`: the rows must match Task 4's for the same seasons, timings apart (the autopilot never builds, and level 0 changes nothing).

- [ ] **Step 8: Commit**

```bash
git add src/finance.js src/world.js src/save.js src/ui/app.js tests/finance.test.js tests/save.test.js
git commit -m "feat: Phase 12 task 5: build up your stadium (save version 14)"
```

### Task 6: the overall swing, the wage fall and late goals

Measure first; the fix depends on what the numbers show. If a fix would change how the game feels (stars weaker, young players worse, fewer goals for strong attacks), stop and ask the owner before making it.

**Files:**
- Modify: `scripts/soak.mjs` (extra columns, kept afterwards)
- Then one of the candidates below, chosen by the measurements.

- [ ] **Step 1: Add diagnosis columns** to the row in `soakSeason()`, after `employed`:

```js
    ovrBy: Object.fromEntries(['GK', 'DF', 'MF', 'FW'].map(pos => [pos, +mean(players.filter(p => p.pos === pos).map(p => overall(p))).toFixed(1)])),
    avgAge: +mean(players.map(p => p.age)).toFixed(1),
    under21: +(players.filter(p => p.age < 21).length / players.length).toFixed(3),
```

and print them, replacing `HEAD` and `line` with:

```js
const HEAD = ['season', 'ms', 'goals', 'home', 'sacked', 'ovr', 'PL €M', 'best €M', 'wage', 'gz KB', 'employed', 'by position', 'age', 'u21'].join('\t');
const line = r => [r.season, Math.round(r.ms), (r.goals / r.matches).toFixed(2), (r.homeWins / r.matches).toFixed(3), r.sackings,
  r.avgOvr.toFixed(1), Math.round(r.plBalance / 1e6), Math.round(r.bestValue / 1e6), r.medianWage, Math.round(r.gzBytes / 1024), r.employed ? 'yes' : 'no',
  JSON.stringify(r.ovrBy), r.avgAge, r.under21].join('\t');
```

- [ ] **Step 2: Run** `npm run soak` and answer in "Results":
  - Does the overall fall when the real squads' old players retire (seasons 5–15), and does it come back when academy players mature?
  - Does `under21` rise while the median wage falls? Wages under 21 are ×0.6, so a younger league pays less by design.
  - Does one position fall more than the others? Goals come from attackers against defenders and keepers; if FW falls faster than DF and GK, fewer goals follow.

- [ ] **Step 3: Pick the smallest fix the numbers support**, one at a time, re-running the soak after each:
  - Academy players too weak or too many: the quality in `academy()` (`src/contracts.js`) and the youth intake (`src/youth.js`).
  - Free agents too weak to replace retirees: `FREE_AGENT_QUALITY` in `src/world.js`.
  - Growth too fast in the first seasons (the peak at season 6): `ageGrow()` in `src/training.js` (Phase 10b note: "the soak should check this levels off").
  - Wage target wrong, not the game: if the league is younger but just as good, widen `TARGETS.medianWage` and say why.
  - Goals: only if they still fall after the squads are steady, look at the shot and chance numbers in `src/match.js`; `tests/england.test.js` and `tests/match.test.js` must stay green.

- [ ] **Step 4: Run** `npm test` and `npm run soak`. Expected: no overall, wage or goals misses, or a written reason in "Results" for any target that was changed instead.

- [ ] **Step 5: Commit**, naming the constant changed and the before and after numbers:

```bash
git add -A scripts src tests docs/superpowers/plans/2026-11-19-touchline-phase-12-balance-soak.md
git commit -m "feat: Phase 12 task 6: <the fix>, overall and wages level off"
```

### Task 7: the sacking rate

- [ ] **Step 1:** After Tasks 4 to 6, read the sackings blocks from the last soak. If every block is 10–20, write "no change" in "Results" and skip to Task 8.
- [ ] **Step 2:** Otherwise change one weight in `MOVE` in `src/career.js` (`match` moves confidence most per result; `below` is the steady pull of a bad position), re-run `npm run soak -- 1,2,3 10` until every block is in range, then a full `npm run soak`. Update the comment beside `MOVE` with the new measured rate.
- [ ] **Step 3:** Run `npm test`: `tests/career.test.js` must stay green. Commit:

```bash
git add src/career.js docs/superpowers/plans/2026-11-19-touchline-phase-12-balance-soak.md
git commit -m "feat: Phase 12 task 7: sacking rate inside 10-20 a season"
```

### Task 8: wrap-up

- [ ] **Step 1:** Final `npm test` and `npm run soak`; paste the summary lines (misses, employed seasons) into "Results".
- [ ] **Step 2:** Roadmap: mark Phase 12 done, add "Phase 12 notes" with what changed and any target that was widened, and why.
- [ ] **Step 3:** `docs/fun-surprises.md`: record any quirk the soak found that is worth keeping, and any entry whose numbers changed.
- [ ] **Step 4:** Phase summary to the owner: what drifted, what was changed, what the soak now guarantees, fun surprises touched.
- [ ] **Step 5:** Commit:

```bash
git add docs
git commit -m "docs: Phase 12 done: soak results and notes"
```

## Done when

- `npm test` passes, with `tests/soak.test.js`, the owner-take test and the stadium tests.
- Your club can build its stadium from the Finances screen, by mouse and by keyboard, and the level survives save, reload and export.
- `npm run soak` (seeds 1–3, 20 seasons) exits 0, or every remaining miss has an owner-approved reason in "Results".
- Every season of every seed saves and loads back; one season stays under 3 s and one day under 150 ms in Node; the save stays under 1.2 MB of JSON and 200 KB gzipped.
- Save version 14 with its migration in `src/save.js` and a test; no other bump, or each with its own migration and test.

## Notes and risks

- The soak measures Node on this machine. A phone in the browser is slower; if the budget is ever tight, measure a season in the browser before tuning for it.
- Owners taking the surplus changes AI money, so the transfer market changes with it; every number after Task 4 is a new baseline.
- The autopilot manager picks nothing, so the human club plays a default game. That is fine for world numbers; it says nothing about how strong a good human manager is.
- Club 0 is a Premier League club; the career numbers (sackings, offers) would differ from a League One start. Not a target in this phase.

## Results

### Baseline (Task 2, 2026-11-19, main @ e6ece56: seeds 1–3, 20 seasons, 85 misses)

- **Median PL balance** over €800M from season 7–10 on every seed, about €2.0–2.3B by season 20.
- **Median wage** under €1,500 from season 10–11 on every seed (lowest €900, seasons 14–16), recovering to €1,300 by season 20.
- **Average overall** above 66 in seasons 4–7 (peak 66.6) and just under 61 in season 15 on seed 1. Same shape on all seeds: up about 3 by season 5, down about 5 by season 15, back up about 2.5 by season 20.
- **Goals per match**, seasons 16–20: 2.496 and 2.497 on seeds 2 and 3 (2.52 on seed 1). **Home wins**, seasons 16–20: 0.419 on seed 1. Both fall in the same late seasons.
- **Best player value** €209M in seasons 8–9 (seeds 2 and 3), just over €200M.
- In range everywhere: AI sackings (every block 13.6–19.8 a season), season time (1.2–1.6 s), slowest day, save size (101–119 KB gzipped, shrinking slowly), every save loads back.
- The autopilot manager was employed 11, 11 and 12 seasons of 20.

### Owners take the surplus (Task 4, main @ 8f1e581: 52 misses)

- The median PL balance levels off at €600–670M from season 6 on seeds 1 and 2, and €400–670M on seed 3. No balance misses (was €2.0–2.3B by season 20).
- Sackings stay in range (block averages 13.2–20.0). Every save loads; times and sizes unchanged.
- Still missing: the median wage (33 seasons), average overall (seasons 4–6 and 15), best player value (up to €236M on seed 3, seasons 5–11), goals in seasons 16–20 on seed 2 (2.47), home wins in seasons 11–15 on seed 1 (0.421).
- The stadium (Task 5) left every row unchanged, as planned: level 0 gives the same gate. Browser check: Reading in League One, a stand at €5.80M refused on a €2.10M budget, then built with €20M (budget and balance −€5.80M, gate €0.21M → €0.24M, cost in the books), kept after a reload, all by keyboard.

### Diagnosis (Task 6, after Task 4; seeds 1–3 × 20 seasons, and seed 1 × 40 seasons)

- **The overall swing is a generational wave, not a drift.** Every AI retiree (35) is replaced one for one by an academy player of club quality − 2 (start overall about 52, potential 13.6 against 15.0 for the real players). The real squads age out over seasons 8–16, then the academy cohort matures. Seed 1 over 40 seasons: overall 66.0 (season 4, the Phase 10b training lift), 61.3 (16), 64.0 (24), 61.1 (32), 64.0 (40). After the first peak it swings about ±1.5 around 62.5, on a cycle of about 16 seasons, and does not run away.
- **The median wage follows the share of under-21s**, not a change in what a player of a given quality earns: the under-21 share swings 6% → 25% → 8% → 25% → 8% in step with the wage (€2,100 → €900–1,000 → €1,900 → €900 → €1,500). Under-21s earn ×0.6, and new academy players are rated about 52. The median player is simply younger in the troughs.
- **Goals fall because keepers outlast forwards.** Across 60 seasons (3 seeds), goals per match fall 0.034 for each point keepers gain on forwards (correlation −0.83). Forwards start 4.3 points above keepers (real data); by seasons 16–20 keepers are up to 3.6 points above forwards. Cause: from 31, age took only physical attributes, and agility (weight 1 of 10) is the only one in a keeper's overall, so old keepers kept their overall while old forwards lost pace (weight 2 of 12), midfielders stamina, defenders strength and pace. Training is not the cause: AI clubs train on the default focus, so outfield players train their key attributes too.
- **Home wins** dip with goals (fewer goals, more draws), from 0.44 to 0.42–0.43 in the late blocks.
- **Training made it worse for midfielders.** A training gain raises one key attribute, which lifts the overall by 5 ÷ (number of key attributes): 1.0 for a keeper (5), 0.83 for defenders and forwards (6), 0.71 for midfielders (7). A season's training gave young keepers 4.27 overall and young midfielders 3.05.

### The fixes (Task 6)

1. **Age takes a keeper's reflexes and agility** (`ageing()` in `src/player.js`, used by `trainWeek` and `ageOneYear`); outfield players still lose physical attributes.
2. **Every position gains the same overall from training** (`posGrow()` in `src/training.js`: the growth chance × keys / 6). Forwards and defenders are unchanged; keepers grow 1/6 less often, midfielders 1/6 more. Same number of random draws, so the world's dice are unchanged.

Result (seeds 1–3 × 20 seasons, 43 misses): goals per match 2.50–2.85 in every block (late blocks 2.56, 2.53, 2.50; were 2.47–2.53); keepers no longer pull away in the long run (seed 1 × 40 seasons: positions within 1.5 of each other from season 20 on, goals 2.53–2.64). Sackings in range everywhere (block averages 12.6–19.6), so Task 7 needs no change. `tests/england.test.js` (season 1 calibration) still passes.

Still missing, all owner decisions on targets: median wage (31 seasons), average overall (66.0–66.3 in seasons 4–6, 60.9 once), best player value (€209–236M, 2 seasons), home wins in seasons 16–20 of seed 3 (0.419).

### Fun surprises at risk (Task 3)

- #30 (buy low before promotion) and #32 (shares outlive the job): share prices are 2 × projected income, which the stadium raises. A €12M Premier League stand adds about €1.5M of income, so about €3M of club value; with a 49% stake that is about €1.5M of your own money for €12M of the club's. A small edge, not a shortcut; keep it if it holds.
- #25 (ask at the right time) and #32's 25% say: the transfer budget is 75% (85% with a say) of the balance, so the owners' cap limits what a yes is worth to 3.75–4.25 seasons of income. The quirk itself is unchanged.
- #18 (fire sales) and #31 (bring your own squad): no change expected; the cap only touches clubs far above their income.
- #1 (the formation edge) and #5 (re-slotting): only at risk if Task 6 changes the match engine.
