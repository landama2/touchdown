# Touchline Phase 1b — Real World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generated fictional world with the real English top three divisions (Premier League, Championship, League One) for the 2026–27 season, with real club and player names, player attributes imported from the owner's dataset `data/player_stats.csv` where a player appears in it (our own ratings for everyone else), original club badges and kits drawn in club colours, and a free-agent list that partly carries over between seasons.

**Architecture:** Club and squad data lives in three plain ES-module data files under `src/data/england/`, checked by a validator. `createWorld` builds the career from that data instead of generating names; engine tests use a small fake data set so they do not depend on the real squads. Badges and kits are SVG strings built by a pure module in `src/ui/art.js`. Divisions of different sizes (20 and 24 clubs) run side by side; the shorter one simply has no fixtures in the last rounds.

**Tech Stack:** Vanilla JavaScript ES modules, HTML/CSS, inline SVG, Node ≥ 22 built-in test runner (`node:test`, `node:assert/strict`). No npm dependencies. Local preview via the `touchline` server in `.claude/launch.json` (port 8127).

## Global Constraints

- Node version: 22 or newer. No packages are installed; `package.json` has no `dependencies` or `devDependencies`.
- Engine code (`src/*.js`, `src/data/**/*.js`) must not reference `document`, `window`, `localStorage`, `Math.random` or `Date`. Randomness comes only from the `rng` passed in or built from `state.seed`.
- State must survive `JSON.parse(JSON.stringify(state))` unchanged: no `Map`, `Set`, class instances, functions or `undefined` values in state.
- This is a private personal project: real club and player names are wanted.
- Player attributes come from `data/player_stats.csv` (the owner's own dataset, 0–99 scale, columns such as `ball_control`, `stand_tackle`, `gk_reflexes`) through `scripts/import-stats.mjs` where a player appears in it. Every other player gets attributes generated from Touchline's own 1–20 rating. Do not fetch ratings from any other site or game (FIFA Index, Football Manager and the like). `data/player_stats.csv` stays a local input: the browser never loads it.
- Badges and kits are Touchline's own artwork: a club's colours, a simple shape or pattern, and its three-letter code. Do not reproduce any real crest, emblem, sponsor or manufacturer logo.
- Leagues and sizes: Premier League 20 clubs, Championship 24 clubs, League One 24 clubs, season 2026–27.
- Player attributes are integers 1–20. `overall()` returns an integer 5–100.
- Fun surprises rule: a minor quirk that is fun or interesting for the player is kept, not fixed. Record it in `docs/fun-surprises.md` and mention it in the end-of-phase summary. Existing entries (formation edge, youth flipping) must keep working.
- Run all tests with `npm test`. Every task ends with all tests passing and a commit. Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/data/validate.js` | `PATTERNS`, `validateLeagues()` — the data format's rules |
| `src/data/england/premier-league.js` | Premier League 2026–27 clubs and squads |
| `src/data/england/championship.js` | Championship 2026–27 clubs and squads |
| `src/data/england/league-one.js` | League One 2026–27 clubs and squads |
| `src/data/england.js` | `LEAGUES` — the three files in division order |
| `data/player_stats.csv` | The owner's attribute dataset (input only, already present) |
| `src/data/attrmap.js` | Maps a dataset row to Touchline's 19 attributes; name normalisation |
| `scripts/import-stats.mjs` | Node script: matches squad players to the dataset, writes `src/data/england-stats.js` |
| `src/data/england-stats.js` | Generated: `{ clubName: { playerName: number[19] } }` |
| `src/data/names.js` | Name fragments for generated free agents and youth intake only |
| `src/world.js` | Build a career state from league data; `playerFromData` |
| `src/season.js` | Season loop; free-agent carry-over; divisions of different sizes; `myFixture` |
| `src/ui/art.js` | `crestSvg`, `kitSvg` — original badge and kit SVGs |
| `src/ui/app.js` | Rendering and events, now with badges, kits and escaped names |
| `docs/real-data-rules.md` | How to compile and rate squads (read by the data tasks) |
| `tests/fixtures/mini.js` | Small fake leagues (4, 6 and 6 clubs) for engine tests |
| `tests/validate.test.js`, `tests/data.test.js`, `tests/england.test.js`, `tests/art.test.js` | New tests |

---

### Task 1: Free agents partly carry over

**Files:**
- Modify: `src/season.js` (the line `s.market = Array.from({ length: MARKET_SIZE }, …)` in `endSeason`, plus one constant and one helper)
- Modify: `tests/season.test.js` (two tests added at the end, one import added)

**Interfaces:**
- Consumes: `makeRng` (`src/rng.js`), `createPlayer`, `ageOneYear`, `POS` (`src/player.js`), `MARKET_SIZE` (`src/world.js`, value 40).
- Produces: after `endSeason`, `state.market` has exactly `MARKET_SIZE` players: up to `MARKET_SIZE / 2` randomly chosen players from the previous list (each aged one year with `ageOneYear`; those already aged 35 or more are dropped), topped up with newly generated players.

- [ ] **Step 1: Write the failing tests** — add to the end of `tests/season.test.js`, and add `MARKET_SIZE` to the imports by changing line 4 to `import { createWorld, MARKET_SIZE } from '../src/world.js';`

```js
test("free agents: half of last season's list stays, a year older; the rest are new", () => {
  const s = createWorld(8);
  const ageBefore = new Map(s.market.map(p => [p.id, p.age]));
  while (!s.done) playRound(s);
  endSeason(s);
  assert.equal(s.market.length, MARKET_SIZE);
  assert.equal(new Set(s.market.map(p => p.id)).size, MARKET_SIZE);
  const kept = s.market.filter(p => ageBefore.has(p.id));
  assert.equal(kept.length, MARKET_SIZE / 2); // nobody on a fresh list is old enough to retire yet
  for (const p of kept) assert.equal(p.age, ageBefore.get(p.id) + 1);
});

test('free agents at retirement age leave the list', () => {
  const s = createWorld(8);
  for (const p of s.market) p.age = 35;
  const old = new Set(s.market.map(p => p.id));
  while (!s.done) playRound(s);
  endSeason(s);
  assert.equal(s.market.length, MARKET_SIZE);
  assert.ok(s.market.every(p => !old.has(p.id)));
});
```

- [ ] **Step 2: Run to verify the first test fails**

Run: `npm test`
Expected: FAIL in "free agents: half of last season's list stays" — `kept.length` is 0, expected 20. The retirement test may already pass.

- [ ] **Step 3: Implement** — in `src/season.js`, after `const RETIRE_AGE = 35;` add:

```js
const MARKET_KEEP = MARKET_SIZE / 2; // half of last season's free agents stay on the list

function sample(rng, list, n) { // n distinct random elements (Fisher–Yates on a copy)
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
```

and in `endSeason` replace

```js
  s.market = Array.from({ length: MARKET_SIZE }, () => createPlayer(rng, s.nid++, rng.pick(POS), 9));
```

with

```js
  const kept = sample(rng, s.market, MARKET_KEEP).filter(p => p.age < RETIRE_AGE);
  for (const p of kept) ageOneYear(rng, p);
  s.market = [...kept, ...Array.from({ length: MARKET_SIZE - kept.length }, () => createPlayer(rng, s.nid++, rng.pick(POS), 9))];
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `npm test`
Expected: 35 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/season.js tests/season.test.js
git commit -m "feat: free agents partly carry over between seasons"
```

---

### Task 2: Data format, validator, rules and test fixture

**Files:**
- Create: `src/data/validate.js`, `tests/fixtures/mini.js`, `tests/validate.test.js`, `tests/data.test.js`, `docs/real-data-rules.md`

**Interfaces:**
- Consumes: `POS`, `ALL_ATTRS` from `src/player.js`.
- Produces:
  - League data format (used by Tasks 3–9):
    ```
    League = { name: string, clubs: Club[] }
    Club   = { name: string, short: 'ABC', colours: ['#rrggbb', '#rrggbb'],
               kit: { pattern: Pattern, shirt: '#rrggbb', trim: '#rrggbb', shorts: '#rrggbb', socks: '#rrggbb' },
               players: PlayerRow[] }
    PlayerRow = [name: string, pos: 'GK'|'DF'|'MF'|'FW', age: integer, rating: integer 1..20, strengths?: string[] (≤3 keys of ALL_ATTRS)]
    ```
  - `PATTERNS = ['plain', 'stripes', 'hoops', 'halves', 'sash', 'sleeves']`
  - `validateLeagues(leagues: League[]) → string[]` — empty when valid; one readable message per problem.
  - `MINI: League[]` from `tests/fixtures/mini.js` — three leagues of 4, 6 and 6 clubs, 18 players each, ratings 15–14 / 12–11 / 9–8.

- [ ] **Step 1: Create the fixture** — `tests/fixtures/mini.js`

```js
// Small fake leagues for engine tests. Sizes 4, 6, 6 so the top division runs out of
// fixtures before the others, like the real 20-club Premier League next to 24-club EFL divisions.
const PALETTE = ['#c8102e', '#003399', '#ffcc00', '#006633', '#ffffff', '#111111'];
const PATTERN_CYCLE = ['plain', 'stripes', 'hoops', 'halves', 'sash', 'sleeves'];
const SHAPE = [['GK', 2], ['DF', 6], ['MF', 6], ['FW', 4]];

let n = 0;
function club(name, rating) {
  const i = n++, main = PALETTE[i % 6], second = PALETTE[(i + 3) % 6];
  const players = [];
  for (const [pos, count] of SHAPE)
    for (let k = 0; k < count; k++) players.push([`${name} ${pos}${k + 1}`, pos, 20 + ((k * 3) % 14), rating]);
  return {
    name, short: name.slice(0, 3).toUpperCase(), colours: [main, second],
    kit: { pattern: PATTERN_CYCLE[i % 6], shirt: main, trim: second, shorts: second, socks: main },
    players,
  };
}

export const MINI = [
  { name: 'Top League', clubs: [club('Alpha', 15), club('Bravo', 15), club('Charlie', 14), club('Delta', 14)] },
  { name: 'Middle League', clubs: [club('Echo', 12), club('Foxtrot', 12), club('Golf', 12), club('Hotel', 11), club('India', 11), club('Juliet', 11)] },
  { name: 'Low League', clubs: [club('Kilo', 9), club('Lima', 9), club('Mike', 8), club('November', 8), club('Oscar', 8), club('Papa', 8)] },
];
```

- [ ] **Step 2: Write the failing validator tests** — `tests/validate.test.js`

```js
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/data/validate.js'`

- [ ] **Step 4: Implement** — `src/data/validate.js`

```js
import { POS, ALL_ATTRS } from '../player.js';

export const PATTERNS = ['plain', 'stripes', 'hoops', 'halves', 'sash', 'sleeves'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const MIN_PLAYERS = 18, MAX_PLAYERS = 32, MIN_GK = 2, MAX_STRENGTHS = 3;

function validateClub(c, at, errors) {
  if (typeof c.name !== 'string' || !c.name.trim()) errors.push(`${at}: name missing`);
  if (!/^[A-Z]{3}$/.test(c.short)) errors.push(`${at}: short must be 3 capital letters`);
  if (!Array.isArray(c.colours) || c.colours.length !== 2 || !c.colours.every(h => HEX.test(h))) errors.push(`${at}: colours must be two #rrggbb values`);
  const kit = c.kit || {};
  if (!PATTERNS.includes(kit.pattern)) errors.push(`${at}: kit.pattern must be one of ${PATTERNS.join(', ')}`);
  for (const part of ['shirt', 'trim', 'shorts', 'socks']) if (!HEX.test(kit[part])) errors.push(`${at}: kit.${part} must be #rrggbb`);
  const players = Array.isArray(c.players) ? c.players : [];
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) errors.push(`${at}: needs ${MIN_PLAYERS}-${MAX_PLAYERS} players, has ${players.length}`);
  if (players.filter(p => p[1] === 'GK').length < MIN_GK) errors.push(`${at}: needs at least ${MIN_GK} goalkeepers`);
  const seen = new Set();
  for (const row of players) {
    const [name, pos, age, rating, strengths = []] = Array.isArray(row) ? row : [];
    const who = `${at} / ${name}`;
    if (typeof name !== 'string' || !name.trim()) { errors.push(`${at}: player with no name`); continue; }
    if (seen.has(name)) errors.push(`${who}: listed twice`);
    seen.add(name);
    if (!POS.includes(pos)) errors.push(`${who}: position must be one of ${POS.join(', ')}`);
    if (!Number.isInteger(age) || age < 15 || age > 45) errors.push(`${who}: age must be an integer 15-45`);
    if (!Number.isInteger(rating) || rating < 1 || rating > 20) errors.push(`${who}: rating must be an integer 1-20`);
    if (!Array.isArray(strengths) || strengths.length > MAX_STRENGTHS || !strengths.every(k => ALL_ATTRS.includes(k)))
      errors.push(`${who}: strengths must be up to ${MAX_STRENGTHS} of ${ALL_ATTRS.join(', ')}`);
  }
}

export function validateLeagues(leagues) {
  const errors = [], count = { name: {}, short: {} };
  for (const league of leagues) {
    const where = league?.name || '(unnamed league)';
    if (!league?.name) errors.push('a league has no name');
    if (!Array.isArray(league?.clubs)) { errors.push(`${where}: clubs must be an array`); continue; }
    if (league.clubs.length % 2) errors.push(`${where}: needs an even number of clubs, has ${league.clubs.length}`);
    for (const c of league.clubs) {
      validateClub(c, `${where} / ${c?.name || '(unnamed club)'}`, errors);
      for (const key of ['name', 'short']) count[key][c[key]] = (count[key][c[key]] || 0) + 1;
    }
  }
  for (const [n, k] of Object.entries(count.name)) if (k > 1) errors.push(`club name used twice: ${n}`);
  for (const [n, k] of Object.entries(count.short)) if (k > 1) errors.push(`short code used twice: ${n}`);
  return errors;
}
```

- [ ] **Step 5: Create the data test** — `tests/data.test.js`. It checks every data file that exists, so Tasks 3–5 each light up one more test.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { validateLeagues } from '../src/data/validate.js';

const DIR = new URL('../src/data/england/', import.meta.url);
const EXPECTED = { 'premier-league.js': ['Premier League', 20], 'championship.js': ['Championship', 24], 'league-one.js': ['League One', 24] };
const files = existsSync(DIR) ? readdirSync(DIR).filter(f => f.endsWith('.js')) : [];

for (const file of files) {
  test(`${file} is valid league data`, async () => {
    assert.ok(EXPECTED[file], `unexpected data file ${file}`);
    const league = (await import(new URL(file, DIR))).default;
    assert.deepEqual(validateLeagues([league]), []);
    assert.equal(league.name, EXPECTED[file][0]);
    assert.equal(league.clubs.length, EXPECTED[file][1]);
  });
}
```

- [ ] **Step 6: Create `docs/real-data-rules.md`**

````markdown
# Real data rules

How the files in `src/data/england/` are compiled. Tasks that add or update squads follow these rules; `npm test` checks the format.

## Season and sources

- Season **2026–27**. Club membership of each division comes from the Wikipedia article for that division's 2026–27 season (for example "2026–27 Premier League", "2026–27 EFL Championship", "2026–27 EFL League One"). If an article is missing or incomplete, use the 2025–26 final tables plus that summer's promotions and relegations, and say so in the file header.
- Squads come from each club's Wikipedia article, "First-team squad" section (or the club's official site). Leave out players listed as out on loan. If a club lists fewer than 18 first-team players, add players from the club's under-21 or academy list on the same page.
- Knowledge from memory is allowed where a page is unavailable; the file header says which clubs were compiled that way.
- Each file starts with a comment giving the date compiled and the sources used.

## Club fields

- `name`: the club's common English name as written in the division's Wikipedia team list (for example "Brighton & Hove Albion", "Wolverhampton Wanderers").
- `short`: three capital letters, unique across all three files. Use the club's usual broadcast abbreviation where one exists (ARS, MCI, LIV); otherwise three distinctive letters of the name. Check the other files in `src/data/england/` before choosing.
- `colours`: `[main, second]` as `#rrggbb`, the club's two main colours. Used to draw Touchline's own badge.
- `kit`: the 2026–27 home kit, described with Touchline's simple model:
  - `pattern`: `plain`, `stripes` (vertical), `hoops` (horizontal), `halves`, `sash` (diagonal band) or `sleeves` (sleeves in the trim colour, as on a red shirt with white sleeves).
  - `shirt`, `trim`, `shorts`, `socks`: `#rrggbb`. `trim` is the second shirt colour (stripes, hoops, sash, sleeves, collar).
  - Colours only: no badge, sponsor or manufacturer logo is represented.

## Player rows

`[name, pos, age, rating]` or `[name, pos, age, rating, strengths]`, one row per line.

- `name`: as commonly written in English sources (the squad list on Wikipedia).
- `pos`: `GK`, `DF`, `MF` or `FW`, as in the squad list. Wing-backs are `DF`; wingers and attacking midfielders listed as forwards are `FW`.
- `age`: age on 1 August 2026, as an integer. Take it from the player's page where cheap; otherwise estimate. The file header states how many ages are estimates.
- `rating`: **Touchline's own judgement** on a 1–20 scale. Base it on public facts: the league the player plays in, whether he is a regular starter, international caps, recent seasons. If the player appears in `data/player_stats.csv` (the owner's dataset), you may use it as a reference; its 0–99 values divide by 5 onto this scale. Do not look up ratings on any other site or game (FIFA Index, Football Manager and the like). Players found in the dataset get their game attributes from it later (Task 6); the rating still sets club strength and covers everyone else. Scale (overall in the game is roughly 5 × rating + 6):

  | Rating | Meaning |
  |--------|---------|
  | 18–20 | Among the best in the world in his position |
  | 15–17 | Established Premier League starter |
  | 13–14 | Premier League squad player, or one of the best players in the Championship |
  | 11–12 | Championship starter |
  | 9–10 | Championship squad player, or League One starter |
  | 6–8 | League One squad player, young or fringe player |
  | 1–5 | Youth player not yet ready for first-team football |

- `strengths` (optional): up to three attribute keys where the player clearly stands out, from: passing, dribbling, finishing, tackling, heading, firstTouch, crossing, vision, positioning, composure, workRate, decisions, aggression, pace, stamina, strength, agility, handling, reflexes. Each one adds 2 to that attribute in the game. Leave it out when nothing stands out.

## Size

18–32 players per club, at least 2 goalkeepers. Clubs in the order of the division's Wikipedia team list.
````

- [ ] **Step 7: Run to verify all tests pass**

Run: `npm test`
Expected: all tests pass (35 existing + 5 validator tests; `data.test.js` runs no tests yet because `src/data/england/` does not exist).

- [ ] **Step 8: Commit**

```bash
git add src/data/validate.js tests/fixtures/mini.js tests/validate.test.js tests/data.test.js docs/real-data-rules.md
git commit -m "feat: league data format and validator"
```

---

### Task 3: Premier League data

**Files:**
- Create: `src/data/england/premier-league.js`

**Interfaces:**
- Consumes: the data format, `PATTERNS` and `validateLeagues` from Task 2; the rules in `docs/real-data-rules.md`.
- Produces: `export default { name: 'Premier League', clubs: Club[] }` with exactly 20 clubs for 2026–27.

- [ ] **Step 1: Read the rules**

Read `docs/real-data-rules.md` in full. It defines every field, the sources, and the rating scale. Ratings are Touchline's own judgement and must not be taken from any game or ratings database.

- [ ] **Step 2: Find the 20 clubs**

Fetch the Wikipedia article "2026–27 Premier League" and take the team list. Record the clubs in that list's order.

- [ ] **Step 3: Compile each club**

For each club, fetch its Wikipedia article's first-team squad and write the club object with `name`, `short`, `colours`, `kit` and `players` as the rules describe. Write the file in this shape (one player per line):

```js
// Premier League 2026–27. Compiled <YYYY-MM-DD> from Wikipedia season and club squad pages.
// Ratings are Touchline's own estimates (docs/real-data-rules.md). Ages estimated: <n> of <total>.
export default {
  name: 'Premier League',
  clubs: [
    {
      name: '<club>', short: '<ABC>', colours: ['#rrggbb', '#rrggbb'],
      kit: { pattern: '<pattern>', shirt: '#rrggbb', trim: '#rrggbb', shorts: '#rrggbb', socks: '#rrggbb' },
      players: [
        ['<name>', 'GK', 30, 15],
        ['<name>', 'FW', 25, 18, ['finishing', 'strength']],
      ],
    },
  ],
};
```

- [ ] **Step 4: Run the data test**

Run: `node --test tests/data.test.js`
Expected: `premier-league.js is valid league data` passes. Fix every reported problem in the data, never in the validator.

- [ ] **Step 5: Sanity-check the ratings**

Run:
```bash
node --input-type=module -e "import l from './src/data/england/premier-league.js'; for (const c of l.clubs) { const r = c.players.map(p => p[3]).sort((a, b) => b - a).slice(0, 11); console.log(c.name.padEnd(28), (r.reduce((a, b) => a + b) / 11).toFixed(1)); }"
```
Expected: every club's best-XI average between 13 and 18, and the order roughly matches public expectations for the season (title contenders at the top, promoted clubs at the bottom). Adjust individual ratings that are clearly out of line with the rating table.

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test` — all pass.

```bash
git add src/data/england/premier-league.js
git commit -m "data: Premier League 2026-27 clubs and squads"
```

---

### Task 4: Championship data

**Files:**
- Create: `src/data/england/championship.js`

**Interfaces:**
- Consumes: the data format, `PATTERNS` and `validateLeagues` from Task 2; the rules in `docs/real-data-rules.md`; `src/data/england/premier-league.js` (to keep `short` codes unique).
- Produces: `export default { name: 'Championship', clubs: Club[] }` with exactly 24 clubs for 2026–27.

- [ ] **Step 1: Read the rules**

Read `docs/real-data-rules.md` in full. It defines every field, the sources, and the rating scale. Ratings are Touchline's own judgement and must not be taken from any game or ratings database.

- [ ] **Step 2: Find the 24 clubs**

Fetch the Wikipedia article "2026–27 EFL Championship" and take the team list. Record the clubs in that list's order. List the `short` codes already used in `src/data/england/premier-league.js` so you do not reuse one.

- [ ] **Step 3: Compile each club**

For each club, fetch its Wikipedia article's first-team squad and write the club object with `name`, `short`, `colours`, `kit` and `players` as the rules describe. Write the file in this shape (one player per line):

```js
// Championship 2026–27. Compiled <YYYY-MM-DD> from Wikipedia season and club squad pages.
// Ratings are Touchline's own estimates (docs/real-data-rules.md). Ages estimated: <n> of <total>.
export default {
  name: 'Championship',
  clubs: [
    {
      name: '<club>', short: '<ABC>', colours: ['#rrggbb', '#rrggbb'],
      kit: { pattern: '<pattern>', shirt: '#rrggbb', trim: '#rrggbb', shorts: '#rrggbb', socks: '#rrggbb' },
      players: [
        ['<name>', 'GK', 30, 11],
        ['<name>', 'FW', 25, 13, ['pace']],
      ],
    },
  ],
};
```

- [ ] **Step 4: Run the data test**

Run: `node --test tests/data.test.js`
Expected: `championship.js is valid league data` passes. Fix every reported problem in the data, never in the validator.

- [ ] **Step 5: Sanity-check the ratings**

Run:
```bash
node --input-type=module -e "import l from './src/data/england/championship.js'; for (const c of l.clubs) { const r = c.players.map(p => p[3]).sort((a, b) => b - a).slice(0, 11); console.log(c.name.padEnd(28), (r.reduce((a, b) => a + b) / 11).toFixed(1)); }"
```
Expected: every club's best-XI average between 10 and 14, relegated Premier League clubs near the top. Adjust individual ratings that are clearly out of line with the rating table.

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test` — all pass.

```bash
git add src/data/england/championship.js
git commit -m "data: Championship 2026-27 clubs and squads"
```

---

### Task 5: League One data

**Files:**
- Create: `src/data/england/league-one.js`

**Interfaces:**
- Consumes: the data format, `PATTERNS` and `validateLeagues` from Task 2; the rules in `docs/real-data-rules.md`; `src/data/england/premier-league.js` and `src/data/england/championship.js` (to keep `short` codes unique).
- Produces: `export default { name: 'League One', clubs: Club[] }` with exactly 24 clubs for 2026–27.

- [ ] **Step 1: Read the rules**

Read `docs/real-data-rules.md` in full. It defines every field, the sources, and the rating scale. Ratings are Touchline's own judgement and must not be taken from any game or ratings database.

- [ ] **Step 2: Find the 24 clubs**

Fetch the Wikipedia article "2026–27 EFL League One" and take the team list. Record the clubs in that list's order. List the `short` codes already used in the two other files in `src/data/england/` so you do not reuse one.

- [ ] **Step 3: Compile each club**

For each club, fetch its Wikipedia article's first-team squad and write the club object with `name`, `short`, `colours`, `kit` and `players` as the rules describe. Write the file in this shape (one player per line):

```js
// League One 2026–27. Compiled <YYYY-MM-DD> from Wikipedia season and club squad pages.
// Ratings are Touchline's own estimates (docs/real-data-rules.md). Ages estimated: <n> of <total>.
export default {
  name: 'League One',
  clubs: [
    {
      name: '<club>', short: '<ABC>', colours: ['#rrggbb', '#rrggbb'],
      kit: { pattern: '<pattern>', shirt: '#rrggbb', trim: '#rrggbb', shorts: '#rrggbb', socks: '#rrggbb' },
      players: [
        ['<name>', 'GK', 30, 8],
        ['<name>', 'FW', 25, 10, ['finishing']],
      ],
    },
  ],
};
```

- [ ] **Step 4: Run the data test**

Run: `node --test tests/data.test.js`
Expected: `league-one.js is valid league data` passes. Fix every reported problem in the data, never in the validator.

- [ ] **Step 5: Sanity-check the ratings**

Run:
```bash
node --input-type=module -e "import l from './src/data/england/league-one.js'; for (const c of l.clubs) { const r = c.players.map(p => p[3]).sort((a, b) => b - a).slice(0, 11); console.log(c.name.padEnd(28), (r.reduce((a, b) => a + b) / 11).toFixed(1)); }"
```
Expected: every club's best-XI average between 7 and 11, relegated Championship clubs near the top. Adjust individual ratings that are clearly out of line with the rating table.

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test` — all pass.

```bash
git add src/data/england/league-one.js
git commit -m "data: League One 2026-27 clubs and squads"
```

---

### Task 6: Import attributes from the owner's dataset

**Files:**
- Create: `src/data/attrmap.js`, `tests/attrmap.test.js`, `scripts/import-stats.mjs`
- Generate: `src/data/england-stats.js` (by running the script; committed)
- Input (already present, do not modify): `data/player_stats.csv`

**Interfaces:**
- Consumes: `ALL_ATTRS` from `src/player.js` (order: passing, dribbling, finishing, tackling, heading, firstTouch, crossing, vision, positioning, composure, workRate, decisions, aggression, pace, stamina, strength, agility, handling, reflexes); the three data files from Tasks 3–5.
- Produces:
  - `STAT_MAP` — which dataset columns feed each Touchline attribute.
  - `attrsFromStats(row: { [column]: string }, pos) → number[19]` in `ALL_ATTRS` order, each an integer 1–20 (mean of the mapped 0–99 columns ÷ 5, rounded; empty cells skipped; no usable cell → 1).
  - `isKeeper(row) → boolean` — mean of `gk_diving`, `gk_handling`, `gk_reflexes` is at least 45.
  - `normName(name) → string` — lower case, accents and special letters folded to ASCII, punctuation to spaces, single spaces.
  - `src/data/england-stats.js`: `export default { [clubName]: { [playerName]: number[19] } }` — keys exactly as in the data files.

The dataset facts that shape this task: 5,675 rows, 41 columns, no quoted fields and no commas inside fields (a plain `split(',')` is safe), club names have a trailing space, `marking` is empty in 158 rows, 23 player names occur more than once, there is no position column, and English clubs have only 3–17 players each from an older season. Expect a minority of squad players to match.

- [ ] **Step 1: Write the failing test** — `tests/attrmap.test.js`

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/attrmap.test.js`
Expected: FAIL — `Cannot find module '.../src/data/attrmap.js'`

- [ ] **Step 3: Implement** — `src/data/attrmap.js`

```js
import { ALL_ATTRS } from '../player.js';

// Touchline attribute <- columns of data/player_stats.csv (0-99). Several columns are averaged.
export const STAT_MAP = {
  passing: ['short_pass', 'long_pass'],
  dribbling: ['dribbling'],
  finishing: ['finishing', 'volleys'],
  tackling: ['stand_tackle', 'slide_tackle', 'marking'],
  heading: ['heading', 'jumping'],
  firstTouch: ['ball_control'],
  crossing: ['crossing'],
  vision: ['vision'],
  positioning: { GK: ['gk_positioning'], DF: ['interceptions', 'marking'], MF: ['interceptions', 'att_position'], FW: ['att_position'] },
  composure: ['composure'],
  workRate: ['stamina', 'aggression'],
  decisions: ['reactions'],
  aggression: ['aggression'],
  pace: ['acceleration', 'sprint_speed'],
  stamina: ['stamina'],
  strength: ['strength'],
  agility: ['agility', 'balance'],
  handling: ['gk_handling'],
  reflexes: ['gk_reflexes', 'gk_diving'],
};

const to20 = v => Math.max(1, Math.min(20, Math.round(v / 5)));
const num = v => (v === undefined || v === null || String(v).trim() === '' ? NaN : Number(v));

export function attrsFromStats(row, pos) {
  return ALL_ATTRS.map(k => {
    const cols = Array.isArray(STAT_MAP[k]) ? STAT_MAP[k] : STAT_MAP[k][pos];
    const vals = cols.map(c => num(row[c])).filter(Number.isFinite);
    return vals.length ? to20(vals.reduce((a, b) => a + b) / vals.length) : 1;
  });
}

export const isKeeper = row => (num(row.gk_diving) + num(row.gk_handling) + num(row.gk_reflexes)) / 3 >= 45;

const FOLD = { ø: 'o', æ: 'ae', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', ı: 'i' };
export const normName = name => name.toLowerCase()
  .replace(/[øæßłđðı]/g, c => FOLD[c])
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/attrmap.test.js`
Expected: 6 tests pass.

- [ ] **Step 5: Write the import script** — `scripts/import-stats.mjs`

```js
// Builds src/data/england-stats.js from data/player_stats.csv (the owner's dataset).
// Run from the project root: node scripts/import-stats.mjs
// The CSV has no quoted fields and no commas inside fields, so a plain split is safe.
import { readFileSync, writeFileSync } from 'node:fs';
import { ALL_ATTRS } from '../src/player.js';
import { attrsFromStats, isKeeper, normName } from '../src/data/attrmap.js';
import premierLeague from '../src/data/england/premier-league.js';
import championship from '../src/data/england/championship.js';
import leagueOne from '../src/data/england/league-one.js';

const [head, ...lines] = readFileSync(new URL('../data/player_stats.csv', import.meta.url), 'utf8').trim().split(/\r?\n/);
const cols = head.split(',');
const rows = lines.map(line => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v.trim()])));

const byName = new Map();
for (const r of rows) { const k = normName(r.player); byName.set(k, [...(byName.get(k) || []), r]); }

const out = {}, ambiguous = [], keeperMismatch = [], perLeague = [];
let elsewhere = 0;
for (const league of [premierLeague, championship, leagueOne]) {
  let matched = 0, total = 0;
  for (const club of league.clubs) {
    const clubKey = normName(club.name);
    for (const [name, pos] of club.players) {
      total++;
      const hits = byName.get(normName(name)) || [];
      const hit = hits.length === 1 ? hits[0] : hits.find(r => normName(r.club) === clubKey);
      if (!hit) { if (hits.length > 1) ambiguous.push(`${club.name} / ${name}`); continue; }
      if ((pos === 'GK') !== isKeeper(hit)) { keeperMismatch.push(`${club.name} / ${name} (${pos}, dataset club ${hit.club})`); continue; }
      if (normName(hit.club) !== clubKey) elsewhere++;
      (out[club.name] ||= {})[name] = attrsFromStats(hit, pos);
      matched++;
    }
  }
  perLeague.push(`${league.name}: ${matched} of ${total} players matched`);
}

const body = Object.entries(out).map(([club, players]) =>
  `  ${JSON.stringify(club)}: {\n${Object.entries(players).map(([n, a]) => `    ${JSON.stringify(n)}: ${JSON.stringify(a)},`).join('\n')}\n  },`).join('\n');
writeFileSync(new URL('../src/data/england-stats.js', import.meta.url),
  `// Generated by scripts/import-stats.mjs from data/player_stats.csv. Do not edit by hand; re-run the script.\n`
  + `// Each array holds: ${ALL_ATTRS.join(', ')}\nexport default {\n${body}\n};\n`);

console.log(perLeague.join('\n'));
console.log(`Matched at a different club in the dataset (older season): ${elsewhere}`);
console.log(`Ambiguous names skipped (${ambiguous.length}): ${ambiguous.join('; ') || 'none'}`);
console.log(`Goalkeeper/outfield mismatches skipped (${keeperMismatch.length}): ${keeperMismatch.join('; ') || 'none'}`);
```

- [ ] **Step 6: Run the script**

Run: `node scripts/import-stats.mjs`
Expected: three "N of M players matched" lines, then the three report lines. Copy the whole output into the task report. Then run:

```bash
node --input-type=module -e "import s from './src/data/england-stats.js'; const n = Object.values(s).reduce((t, c) => t + Object.keys(c).length, 0); console.log(Object.keys(s).length, 'clubs,', n, 'players')"
```
Expected: a non-zero player count equal to the sum of the matched counts.

- [ ] **Step 7: Spot-check five matches**

Pick five matched players across the three divisions and compare the generated array against their CSV row by hand (for example `finishing` = round(mean(finishing, volleys) ÷ 5)). Note them in the report. If a match is clearly a different person (same name, implausible club history), report it — do not edit the generated file by hand.

- [ ] **Step 8: Run the full suite and commit**

Run: `npm test` — all pass.

```bash
git add src/data/attrmap.js tests/attrmap.test.js scripts/import-stats.mjs src/data/england-stats.js data/player_stats.csv
git commit -m "feat: import player attributes from the owner's dataset"
```

---

### Task 7: Build the world from real data

**Files:**
- Create: `src/data/england.js`, `tests/england.test.js`
- Modify: `src/world.js` (replace whole file), `src/season.js` (imports, `playRound`, prize line, new `myFixture`), `src/save.js` (`SAVE_VERSION`), `src/data/names.js` (remove club-name fragments)
- Modify: `tests/world.test.js` (replace whole file), `tests/season.test.js` (replace whole file), `tests/transfers.test.js` (2 lines), `tests/save.test.js` (3 lines)

**Interfaces:**
- Consumes: Task 2's format and `validateLeagues`; Tasks 3–5's data files; Task 6's generated `src/data/england-stats.js` (`{ clubName: { playerName: number[19] } }` in `ALL_ATTRS` order); `createPlayer(rng, id, pos, quality, age)`, `WEIGHTS`, `POS`, `ALL_ATTRS` from `src/player.js`; `makeFixtures`; `makeRng`.
- Produces:
  - `LEAGUES: League[]` from `src/data/england.js` — `[premier, championship, leagueOne]`.
  - `createWorld(seed: number, leagues = LEAGUES, stats = STATS, calibration = CALIBRATION) → State`. Every data rating in a league is first shifted by `calibration[league.name]` (default 0) and clamped to 1–20, so players without imported attributes sit on the dataset's scale. Club becomes `{ id, name, short, colours, kit, div, quality, players, st }` where `quality` is the mean shifted rating of the squad. A player found in `stats[club.name][player.name]` takes those attributes. `CALIBRATION` is the named export of `src/data/england-stats.js` (`{ [leagueName]: integer }`).
  - `playerFromData(rng, id, row: PlayerRow, stats?: number[19]) → Player` — real name, age and position; `createPlayer` with `quality = rating`; with `stats`, the attributes are replaced by `stats` and strengths are ignored; without, each strength +2 (max 20). In both cases `pot` = best key attribute + (0–2 if under 23), max 20.
  - `MARKET_SIZE = 40`, `blankStats()` unchanged. `DIVISIONS`, `CLUBS_PER_DIV`, `SQUAD_SHAPE`, `clubNames` are removed.
  - `playRound(state)`: a division with no fixture for the current round contributes `[]` to the result; the season is done after the longest division's last round.
  - `myFixture(state) → [homeId, awayId] | null` — the human club's match this round, or `null` when its division has none.
  - Prize money uses the human club's division size: `(clubsInDivision + 1 - position) * 40e3 * tier`.
  - `SAVE_VERSION = 2`. Version-1 saves load as `null`, so the UI starts a new game.

- [ ] **Step 1: Create `src/data/england.js`**

```js
import premierLeague from './england/premier-league.js';
import championship from './england/championship.js';
import leagueOne from './england/league-one.js';

// Division order: index 0 is the top division.
export const LEAGUES = [premierLeague, championship, leagueOne];
```

- [ ] **Step 2: Write the failing tests**

Replace `tests/world.test.js` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { overall, WEIGHTS, ALL_ATTRS } from '../src/player.js';
import { makeFixtures } from '../src/fixtures.js';
import { SAVE_VERSION } from '../src/save.js';
import { createWorld, playerFromData, MARKET_SIZE } from '../src/world.js';
import { MINI } from './fixtures/mini.js';

test('makeFixtures: every ordered pair exactly once, every club once per round', () => {
  const ids = [10, 11, 12, 13, 14, 15], rounds = makeFixtures(ids);
  assert.equal(rounds.length, 10);
  const seen = new Map();
  for (const rd of rounds) {
    assert.deepEqual(rd.flat().sort((a, b) => a - b), ids);
    for (const [h, a] of rd) seen.set(`${h}-${a}`, (seen.get(`${h}-${a}`) || 0) + 1);
  }
  assert.equal(seen.size, 30);
  assert.ok([...seen.values()].every(c => c === 1));
});

test('createWorld builds one division per league from the data', () => {
  const s = createWorld(99, MINI), data = MINI.flatMap(l => l.clubs);
  assert.equal(s.version, SAVE_VERSION);
  assert.deepEqual(s.divisions.map(d => d.name), MINI.map(l => l.name));
  assert.deepEqual(s.divisions.map(d => d.clubIds.length), [4, 6, 6]);
  assert.deepEqual(s.divisions.map(d => d.fixtures.length), [6, 10, 10]);
  s.clubs.forEach((c, i) => {
    assert.equal(c.id, i);
    assert.equal(c.name, data[i].name);
    assert.equal(c.short, data[i].short);
    assert.deepEqual(c.colours, data[i].colours);
    assert.deepEqual(c.kit, data[i].kit);
    assert.deepEqual(c.players.map(p => [p.name, p.pos, p.age]), data[i].players.map(r => [r[0], r[1], r[2]]));
    assert.equal(c.quality, data[i].players.reduce((t, r) => t + r[3], 0) / data[i].players.length);
    assert.deepEqual(c.st, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  });
  s.divisions.forEach((d, i) => assert.ok(d.clubIds.every(id => s.clubs[id].div === i)));
  const ids = [...s.clubs.flatMap(c => c.players), ...s.market].map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => id < s.nid));
  assert.equal(s.market.length, MARKET_SIZE);
  assert.equal(s.me, null);
});

test('createWorld copies club data instead of sharing it', () => {
  const s = createWorld(1, MINI);
  s.clubs[0].kit.shirt = '#000000';
  s.clubs[0].colours[0] = '#000000';
  assert.equal(MINI[0].clubs[0].kit.shirt, '#c8102e');
  assert.equal(MINI[0].clubs[0].colours[0], '#c8102e');
});

test('playerFromData keeps name, age and position and applies strengths', () => {
  const plain = playerFromData(makeRng(3), 7, ['Test Player', 'FW', 27, 14]);
  const strong = playerFromData(makeRng(3), 7, ['Test Player', 'FW', 27, 14, ['pace', 'finishing']]);
  assert.deepEqual([strong.id, strong.name, strong.pos, strong.age], [7, 'Test Player', 'FW', 27]);
  assert.equal(strong.attrs.pace, Math.min(20, plain.attrs.pace + 2));
  assert.equal(strong.attrs.finishing, Math.min(20, plain.attrs.finishing + 2));
  assert.equal(strong.attrs.dribbling, plain.attrs.dribbling);
  for (const k of Object.keys(WEIGHTS.FW)) assert.ok(strong.pot >= strong.attrs[k], k);
});

test('playerFromData uses imported stats when given, ignoring strengths', () => {
  const stats = ALL_ATTRS.map((_, i) => 1 + (i % 20));
  const p = playerFromData(makeRng(4), 9, ['Stat Player', 'MF', 21, 10, ['pace']], stats);
  assert.deepEqual(ALL_ATTRS.map(k => p.attrs[k]), stats);
  const best = Math.max(...Object.keys(WEIGHTS.MF).map(k => p.attrs[k]));
  assert.ok(p.pot >= best && p.pot <= Math.min(20, best + 2));
});

test('createWorld shifts a league\'s data ratings by its calibration', () => {
  const plain = createWorld(1, MINI, {}, {});
  const shifted = createWorld(1, MINI, {}, { 'Top League': 2 });
  assert.equal(shifted.clubs[0].quality, plain.clubs[0].quality + 2);
  assert.equal(shifted.clubs[4].quality, plain.clubs[4].quality); // Middle League untouched
  const avg = s => s.clubs[0].players.reduce((t, p) => t + overall(p), 0) / s.clubs[0].players.length;
  assert.ok(avg(shifted) > avg(plain) + 5);
});

test('createWorld applies stats by club and player name', () => {
  const stats = { Alpha: { 'Alpha GK1': Array(ALL_ATTRS.length).fill(12) } };
  const s = createWorld(1, MINI, stats);
  const gk = s.clubs[0].players.find(p => p.name === 'Alpha GK1');
  assert.ok(ALL_ATTRS.every(k => gk.attrs[k] === 12));
  const other = s.clubs[0].players.find(p => p.name === 'Alpha GK2');
  assert.ok(!ALL_ATTRS.every(k => other.attrs[k] === 12));
});

test('higher divisions are stronger', () => {
  const s = createWorld(7, MINI);
  const avg = d => { const ps = s.divisions[d].clubIds.flatMap(id => s.clubs[id].players); return ps.reduce((t, p) => t + overall(p), 0) / ps.length; };
  assert.ok(avg(0) > avg(1) && avg(1) > avg(2));
});

test('createWorld is deterministic and JSON-safe', () => {
  const a = createWorld(1234, MINI);
  assert.deepEqual(a, createWorld(1234, MINI));
  assert.notDeepEqual(a.clubs[0].players, createWorld(1235, MINI).clubs[0].players);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});
```

Replace `tests/season.test.js` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createWorld, MARKET_SIZE } from '../src/world.js';
import { FORMATIONS, slots, bestXI, fixLineup, strength } from '../src/lineup.js';
import { simMatch } from '../src/match.js';
import { takeClub, myClub, myFixture, playRound, table, endSeason } from '../src/season.js';
import { MINI } from './fixtures/mini.js';

const world = seed => createWorld(seed, MINI);

test('slots has 11 entries starting with GK for every formation', () => {
  for (const f of Object.keys(FORMATIONS)) {
    assert.equal(slots(f).length, 11);
    assert.equal(slots(f)[0], 'GK');
  }
});

test('bestXI picks 11 distinct players with a goalkeeper in goal', () => {
  const s = world(1), club = s.clubs[0];
  for (const f of Object.keys(FORMATIONS)) {
    const ids = bestXI(club, f);
    assert.equal(new Set(ids).size, 11);
    assert.equal(club.players.find(p => p.id === ids[0]).pos, 'GK');
    const st = strength(club, ids, f);
    assert.ok(Number.isFinite(st.att) && Number.isFinite(st.def) && st.att > 0 && st.def > 0);
  }
});

test('fixLineup repairs a lineup that references a missing player', () => {
  const s = world(2);
  takeClub(s, 5);
  const gone = s.lineup[3];
  myClub(s).players = myClub(s).players.filter(p => p.id !== gone);
  fixLineup(s);
  assert.equal(new Set(s.lineup).size, 11);
  assert.ok(!s.lineup.includes(gone));
});

test('simMatch: sensible goal totals, stronger side wins more, events match the score', () => {
  const s = world(3), rng = makeRng(3);
  const side = id => ({ club: s.clubs[id], ids: bestXI(s.clubs[id], '4-4-2'), formation: '4-4-2' });
  const strong = side(0), weak = side(15), peer = side(1);
  let goals = 0, strongWins = 0, weakWins = 0;
  for (let i = 0; i < 400; i++) {
    const r = simMatch(rng, strong, peer);
    goals += r.hg + r.ag;
    assert.equal(r.ev.length, r.hg + r.ag);
    assert.equal(r.ev.filter(e => e.club === 0).length, r.hg);
    const m = simMatch(rng, weak, strong);
    if (m.ag > m.hg) strongWins++; else if (m.hg > m.ag) weakWins++;
  }
  const perMatch = goals / 400;
  assert.ok(perMatch > 2 && perMatch < 3.6, `goals per match ${perMatch}`);
  assert.ok(strongWins > weakWins * 5, `${strongWins} vs ${weakWins}`);
});

test('a full season: every club plays everyone home and away, stats are consistent', () => {
  const s = world(4);
  takeClub(s, 6);
  const budget0 = s.budget, seed0 = s.seed;
  playRound(s);
  assert.notEqual(s.seed, seed0);
  while (!s.done) assert.equal(playRound(s).length, 3);
  assert.equal(s.round, 10);
  assert.equal(playRound(s), null);
  assert.ok(s.budget > budget0);
  assert.ok(s.budget - budget0 <= 2 * budget0, `income ${s.budget - budget0} vs start ${budget0}`);
  s.divisions.forEach((d, i) => {
    const games = 2 * (d.clubIds.length - 1);
    const st = d.clubIds.map(id => s.clubs[id].st), sum = k => st.reduce((t, x) => t + x[k], 0);
    assert.ok(st.every(x => x.p === games && x.p === x.w + x.d + x.l && x.pts === 3 * x.w + x.d));
    assert.equal(sum('w'), sum('l'));
    assert.equal(sum('gf'), sum('ga'));
    const tb = table(s, i);
    assert.deepEqual([...tb].sort((a, b) => a - b), d.clubIds);
    for (let k = 1; k < tb.length; k++) assert.ok(s.clubs[tb[k - 1]].st.pts >= s.clubs[tb[k]].st.pts);
  });
});

test('divisions of different sizes: the smaller one finishes early, the season ends with the longest', () => {
  const s = world(9);
  takeClub(s, 0); // Top League: 4 clubs, 6 rounds; the others have 10
  for (let r = 0; r < 6; r++) { assert.ok(myFixture(s)); playRound(s); }
  assert.equal(myFixture(s), null);
  assert.equal(s.done, false);
  const res = playRound(s);
  assert.deepEqual(res[0], []);
  assert.equal(res[1].length, 3);
  while (!s.done) playRound(s);
  assert.equal(s.round, 10);
  assert.ok(s.divisions[0].clubIds.every(id => s.clubs[id].st.p === 6));
  assert.equal(myFixture(s), null);
});

test('myFixture returns the human club\'s match', () => {
  const s = world(10);
  takeClub(s, 7);
  const f = myFixture(s);
  assert.ok(f.includes(7));
  assert.ok(s.divisions[1].fixtures[0].some(m => m[0] === f[0] && m[1] === f[1]));
});

test('endSeason rolls over; three seasons keep squads intact', () => {
  const s = world(5);
  takeClub(s, 0);
  endSeason(s); // not done yet: no-op
  assert.equal(s.season, 1);
  for (let y = 1; y <= 3; y++) {
    while (!s.done) playRound(s);
    const seedBefore = s.seed;
    endSeason(s);
    assert.notEqual(s.seed, seedBefore);
    assert.equal(s.season, y + 1);
    assert.equal(s.round, 0);
    assert.equal(s.done, false);
    assert.equal(s.history.length, y);
    assert.equal(s.history[y - 1].champions.length, 3);
    assert.ok(s.history[y - 1].pos >= 1 && s.history[y - 1].pos <= 4);
    assert.ok(s.clubs.every(c => c.players.length === 18 && c.st.p === 0 && c.players.every(p => p.age <= 35)));
    assert.equal(new Set(s.lineup).size, 11);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('prize money uses the size of the human club\'s division', () => {
  const s = world(12);
  takeClub(s, 0); // 4-club division, tier 3
  while (!s.done) playRound(s);
  const pos = table(s, 0).indexOf(0) + 1, before = s.budget;
  endSeason(s);
  assert.equal(s.history[0].prize, (4 + 1 - pos) * 40e3 * 3);
  assert.equal(s.budget, before + s.history[0].prize);
});

test('same seed and same choices give the same career; works with no human club', () => {
  const run = () => { const s = world(6); while (!s.done) playRound(s); endSeason(s); return s; };
  assert.deepEqual(run(), run());
});

test("free agents: half of last season's list stays, a year older; the rest are new", () => {
  const s = world(8);
  const ageBefore = new Map(s.market.map(p => [p.id, p.age]));
  while (!s.done) playRound(s);
  endSeason(s);
  assert.equal(s.market.length, MARKET_SIZE);
  assert.equal(new Set(s.market.map(p => p.id)).size, MARKET_SIZE);
  const kept = s.market.filter(p => ageBefore.has(p.id));
  assert.equal(kept.length, MARKET_SIZE / 2); // nobody on a fresh list is old enough to retire yet
  for (const p of kept) assert.equal(p.age, ageBefore.get(p.id) + 1);
});

test('free agents at retirement age leave the list', () => {
  const s = world(8);
  for (const p of s.market) p.age = 35;
  const old = new Set(s.market.map(p => p.id));
  while (!s.done) playRound(s);
  endSeason(s);
  assert.equal(s.market.length, MARKET_SIZE);
  assert.ok(s.market.every(p => !old.has(p.id)));
});
```

In `tests/transfers.test.js` change line 4 and line 8 to:

```js
import { createWorld } from '../src/world.js';
import { MINI } from './fixtures/mini.js';
```
```js
const fresh = () => { const s = createWorld(11, MINI); takeClub(s, 12); return s; };
```

In `tests/save.test.js` add `import { MINI } from './fixtures/mini.js';` after line 5, change `createWorld(21)` to `createWorld(21, MINI)` and `createWorld(1)` to `createWorld(1, MINI)`.

Create `tests/england.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overall, ALL_ATTRS } from '../src/player.js';
import { validateLeagues } from '../src/data/validate.js';
import { LEAGUES } from '../src/data/england.js';
import STATS, { CALIBRATION } from '../src/data/england-stats.js';
import { createWorld } from '../src/world.js';
import { takeClub, playRound, endSeason } from '../src/season.js';

test('the three English data files are valid together', () => {
  assert.deepEqual(validateLeagues(LEAGUES), []);
  assert.deepEqual(LEAGUES.map(l => [l.name, l.clubs.length]), [['Premier League', 20], ['Championship', 24], ['League One', 24]]);
});

test('the default world is the English pyramid and plays a full season', () => {
  const s = createWorld(1);
  assert.deepEqual(s.divisions.map(d => d.clubIds.length), [20, 24, 24]);
  takeClub(s, 0);
  while (!s.done) playRound(s);
  assert.equal(s.round, 46);
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
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `playerFromData` is not exported from `src/world.js` and `myFixture` is not exported from `src/season.js`.

- [ ] **Step 4: Replace `src/world.js`**

```js
import { makeRng } from './rng.js';
import { POS, WEIGHTS, ALL_ATTRS, createPlayer } from './player.js';
import { makeFixtures } from './fixtures.js';
import { SAVE_VERSION } from './save.js';
import { LEAGUES } from './data/england.js';
import STATS, { CALIBRATION } from './data/england-stats.js';

export const MARKET_SIZE = 40;
const FREE_AGENT_QUALITY = 9;
const STRENGTH_BONUS = 2;

export const blankStats = () => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });

// A data row becomes a full player. With imported stats the attributes come from the owner's
// dataset; otherwise they are generated around the rating and the listed strengths are lifted.
// pot always starts at the best key attribute (+0-2 for under-23s), so it never sits below one.
export function playerFromData(rng, id, [name, pos, age, rating, strengths = []], stats) {
  const p = createPlayer(rng, id, pos, rating, age);
  p.name = name;
  if (stats) ALL_ATTRS.forEach((k, i) => { p.attrs[k] = stats[i]; });
  else for (const k of strengths) p.attrs[k] = Math.min(20, p.attrs[k] + STRENGTH_BONUS);
  const best = Math.max(...Object.keys(WEIGHTS[pos]).map(k => p.attrs[k]));
  p.pot = Math.min(20, best + (age < 23 ? rng.int(0, 2) : 0));
  return p;
}

export function createWorld(seed, leagues = LEAGUES, stats = STATS, calibration = CALIBRATION) {
  const rng = makeRng(seed);
  const s = {
    version: SAVE_VERSION, seed, nid: 1,
    me: null, formation: '4-4-2', lineup: [], budget: 0,
    season: 1, round: 0, done: false,
    clubs: [], divisions: [], market: [], history: [], last: null,
  };
  leagues.forEach((league, div) => {
    const shift = calibration[league.name] || 0;
    const calibrated = ([name, pos, age, rating, strengths]) => [name, pos, age, Math.max(1, Math.min(20, rating + shift)), strengths];
    const clubIds = league.clubs.map(c => {
      const id = s.clubs.length, rows = c.players.map(calibrated);
      s.clubs.push({
        id, name: c.name, short: c.short, colours: [...c.colours], kit: { ...c.kit }, div,
        quality: rows.reduce((t, row) => t + row[3], 0) / rows.length,
        players: rows.map(row => playerFromData(rng, s.nid++, row, stats[c.name]?.[row[0]])),
        st: blankStats(),
      });
      return id;
    });
    s.divisions.push({ name: league.name, clubIds, fixtures: makeFixtures(clubIds) });
  });
  for (let i = 0; i < MARKET_SIZE; i++) s.market.push(createPlayer(rng, s.nid++, rng.pick(POS), FREE_AGENT_QUALITY));
  s.seed = rng.seed;
  return s;
}
```

- [ ] **Step 5: Update `src/season.js`**

Change the world import (line 4) to:

```js
import { blankStats, MARKET_SIZE } from './world.js';
```

Add after `export const myClub = …`:

```js
export function myFixture(s) {
  const round = s.divisions[myClub(s).div].fixtures[s.round];
  return round ? round.find(m => m.includes(s.me)) : null;
}
```

In `playRound` replace

```js
  s.last = s.divisions.map(d => d.fixtures[s.round].map(([h, a]) => {
```

with

```js
  s.last = s.divisions.map(d => (d.fixtures[s.round] || []).map(([h, a]) => { // a smaller division has finished
```

and replace

```js
  s.done = s.round === s.divisions[0].fixtures.length;
```

with

```js
  s.done = s.round === Math.max(...s.divisions.map(d => d.fixtures.length));
```

In `endSeason` replace

```js
    prize = (CLUBS_PER_DIV + 1 - pos) * 40e3 * tier(myClub(s));
```

with

```js
    prize = (s.divisions[myClub(s).div].clubIds.length + 1 - pos) * 40e3 * tier(myClub(s));
```

- [ ] **Step 6: Bump the save version** — in `src/save.js` change `export const SAVE_VERSION = 1;` to:

```js
export const SAVE_VERSION = 2; // 2: clubs come from real data and carry short, colours and kit
```

- [ ] **Step 7: Trim `src/data/names.js`** — replace the whole file with:

```js
// Invented name fragments for generated players: free agents and youth intake.
// Clubs and their squads come from src/data/england/.
export const FIRST = 'Adam Ben Carlos Dario Emil Felix Goran Hugo Ivan Jonas Karel Luca Milan Nico Oskar Pavel Rafa Stefan Tomas Viktor Wim Yann Zoran Andre Bruno Cyril Denis Erik Filip Gabriel'.split(' ');
export const LAST = 'Novak Berg Castell Dvorak Eklund Fontana Greaves Holt Ilic Jansen Kovar Lindqvist Moreau Nemec Okafor Petrov Quint Rossi Svoboda Tanaka Urban Vesely Wolff Ybarra Zeman Adler Brandt Corvin Drummond Estrada'.split(' ');
```

Keep the two lines exactly as they are in the current file; only the comment changes and `PRE`, `STEM`, `SUFFIX`, `DENY` are removed.

- [ ] **Step 8: Run to verify all tests pass**

Run: `npm test`
Expected: all tests pass. If only the `simMatch` balance assertions fail, report it — do not change match constants or loosen bounds.

- [ ] **Step 9: Check nothing still uses the removed exports, and engine purity**

Run:
```bash
grep -rnwE "CLUBS_PER_DIV|SQUAD_SHAPE|DIVISIONS|clubNames|DENY|PRE|STEM|SUFFIX" src tests --include=*.js --exclude-dir=england
grep -rnE "Math\.random|Date\.|document|window|localStorage" src --include=*.js --exclude-dir=ui
```
Expected: both print nothing. (The first skips the data files, where a club code such as "PRE" would be a false match.)

- [ ] **Step 10: Commit**

```bash
git add src/data/england.js src/world.js src/season.js src/save.js src/data/names.js tests/world.test.js tests/season.test.js tests/transfers.test.js tests/save.test.js tests/england.test.js
git commit -m "feat: build the world from real English league data"
```

---

### Task 8: Club badges and kits

**Files:**
- Create: `src/ui/art.js`, `tests/art.test.js`

**Interfaces:**
- Consumes: `PATTERNS` from `src/data/validate.js` (tests only); club objects with `short` and `colours`, kit objects as defined in Task 2.
- Produces:
  - `crestSvg(club: { short, colours }, size = 32) → string` — an `<svg class="crest">` badge: one of three shapes and one of three devices chosen from a hash of `short`, filled with the club's colours, with `short` written on it in a readable colour.
  - `kitSvg(kit, size = 48) → string` — an `<svg class="kit">` shirt, shorts and socks with the kit's pattern.
  - Both are pure string functions (no DOM), so Node can test them.

- [ ] **Step 1: Write the failing test** — `tests/art.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crestSvg, kitSvg } from '../src/ui/art.js';
import { PATTERNS } from '../src/data/validate.js';
import { MINI } from './fixtures/mini.js';

const clubs = MINI.flatMap(l => l.clubs);
const clean = svg => assert.ok(!/undefined|NaN/.test(svg), svg);

test('crestSvg draws a badge in the club colours with its code', () => {
  for (const c of clubs) {
    const svg = crestSvg(c, 40);
    assert.ok(svg.startsWith('<svg class="crest"') && svg.endsWith('</svg>'));
    assert.ok(svg.includes(`fill="${c.colours[0]}"`));
    assert.ok(svg.includes(`>${c.short}</text>`));
    assert.ok(svg.includes('width="40"'));
    clean(svg);
  }
});

test('crest shapes vary between clubs', () => {
  const shapes = new Set(clubs.map(c => crestSvg(c).match(/<clipPath id="[^"]+"><path d="([^"]+)"/)[1]));
  assert.ok(shapes.size >= 2, `only ${shapes.size} shape(s)`);
});

test('badge text is readable on light and dark colours', () => {
  assert.ok(crestSvg({ short: 'LGT', colours: ['#ffffff', '#c8102e'] }).includes('fill="#111111">LGT'));
  assert.ok(crestSvg({ short: 'DRK', colours: ['#111111', '#ffffff'] }).includes('fill="#ffffff">DRK'));
});

test('kitSvg draws every pattern with the kit colours', () => {
  const base = { shirt: '#c8102e', trim: '#ffffff', shorts: '#003399', socks: '#ffcc00' };
  const outputs = PATTERNS.map(pattern => kitSvg({ ...base, pattern }, 60));
  outputs.forEach(svg => {
    assert.ok(svg.startsWith('<svg class="kit"') && svg.endsWith('</svg>'));
    for (const colour of Object.values(base)) assert.ok(svg.includes(colour), colour);
    assert.ok(svg.includes('width="60"'));
    clean(svg);
  });
  assert.equal(new Set(outputs).size, PATTERNS.length);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/ui/art.js'`

- [ ] **Step 3: Implement** — `src/ui/art.js`

```js
// Touchline's own artwork. Badges and kits are drawn only from a club's colours, a simple
// shape or pattern and its three-letter code; they are not copies of any real crest or kit.

const hash = str => { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };
const luminance = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const ink = hex => (luminance(hex) > 0.6 ? '#111111' : '#ffffff');

const CREST_SHAPES = [
  'M4 3H36V20Q36 35 20 43Q4 35 4 20Z',                        // shield
  'M20 3A19 19 0 1 1 19.99 3Z',                                // roundel
  'M8 3H32Q37 3 37 8V35Q37 40 32 40H8Q3 40 3 35V8Q3 3 8 3Z',   // rounded square
];
const CREST_DEVICES = [
  '',                                   // plain field
  'M0 31L40 19V26L0 38Z',               // diagonal band
  'M0 28L20 36L40 28V34L20 42L0 34Z',   // chevron
];

export function crestSvg(club, size = 32) {
  const h = hash(club.short), [main, second] = club.colours, id = `crest-${club.short}`;
  const shape = CREST_SHAPES[h % CREST_SHAPES.length], device = CREST_DEVICES[(h >>> 4) % CREST_DEVICES.length];
  return `<svg class="crest" width="${size}" height="${Math.round(size * 46 / 40)}" viewBox="0 0 40 46" aria-hidden="true">`
    + `<defs><clipPath id="${id}"><path d="${shape}"/></clipPath></defs>`
    + `<path d="${shape}" fill="${main}"/>`
    + (device ? `<path d="${device}" fill="${second}" clip-path="url(#${id})"/>` : '')
    + `<path d="${shape}" fill="none" stroke="${second}" stroke-width="2.5"/>`
    + `<text x="20" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="${ink(main)}">${club.short}</text>`
    + '</svg>';
}

const SHIRT = 'M18 6L26 3Q30 8 34 3L42 6L55 16L49 25L44 21V45H16V21L11 25L5 16Z';
const SLEEVES = 'M18 6L5 16L11 25L16 21ZM42 6L55 16L49 25L44 21Z';
const bars = vertical => {
  let out = '';
  for (let i = 2; i < 60; i += 8) out += vertical ? `<rect x="${i}" y="0" width="4" height="48"/>` : `<rect x="0" y="${i + 4}" width="60" height="4"/>`;
  return out;
};
const PATTERN_SHAPES = {
  plain: '',
  stripes: bars(true),
  hoops: bars(false),
  halves: '<rect x="30" y="0" width="30" height="48"/>',
  sash: '<path d="M12 3H22L50 48H40Z"/>',
  sleeves: `<path d="${SLEEVES}"/>`,
};

export function kitSvg(kit, size = 48) {
  const id = `kit-${hash(JSON.stringify(kit)).toString(36)}`;
  return `<svg class="kit" width="${size}" height="${Math.round(size * 72 / 60)}" viewBox="0 0 60 72" aria-hidden="true">`
    + `<defs><clipPath id="${id}"><path d="${SHIRT}"/></clipPath></defs>`
    + `<path d="${SHIRT}" fill="${kit.shirt}"/>`
    + `<g fill="${kit.trim}" clip-path="url(#${id})">${PATTERN_SHAPES[kit.pattern]}</g>`
    + `<path d="M26 3Q30 8 34 3" fill="none" stroke="${kit.trim}" stroke-width="2"/>`
    + `<path d="${SHIRT}" fill="none" stroke="#00000040" stroke-width="1"/>`
    + `<path d="M16 47H44L46 59H32L30 53L28 59H14Z" fill="${kit.shorts}" stroke="#00000040" stroke-width="1"/>`
    + `<rect x="17" y="61" width="8" height="10" rx="1" fill="${kit.socks}"/><rect x="35" y="61" width="8" height="10" rx="1" fill="${kit.socks}"/>`
    + '</svg>';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: all tests pass. If "crest shapes vary between clubs" fails, report it — do not change the test.

- [ ] **Step 5: Commit**

```bash
git add src/ui/art.js tests/art.test.js
git commit -m "feat: original club badges and kits as SVG"
```

---

### Task 9: UI with real clubs, badges and kits

**Files:**
- Modify: `src/ui/app.js` (replace whole file)
- Modify: `index.html` (add CSS rules inside `<style>`)

**Interfaces:**
- Consumes: `crestSvg`, `kitSvg` (Task 8); `myFixture`, `takeClub`, `myClub`, `playRound`, `table`, `endSeason` (`src/season.js`); `createWorld` (`src/world.js`); everything the current `src/ui/app.js` already imports.
- Produces: the playable game. No exports.

- [ ] **Step 1: Add styles** — in `index.html`, inside `<style>`, before `</style>`:

```css
  #info { display:flex; align-items:center; gap:8px; }
  .grid button { display:flex; align-items:center; gap:8px; text-align:left; }
  .crest, .kit { vertical-align:middle; flex:none; }
  td .crest { margin-right:6px; }
  .club { display:flex; align-items:center; gap:16px; margin:12px 0; }
  .club b { font-size:18px; }
  .fixture { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
```

- [ ] **Step 2: Replace `src/ui/app.js`**

```js
import { POS, ATTRS, overall, value } from '../player.js';
import { createWorld } from '../world.js';
import { FORMATIONS, slots, bestXI, fixLineup, strength } from '../lineup.js';
import { takeClub, myClub, myFixture, playRound, table, endSeason } from '../season.js';
import { buy, sell, MAX_SQUAD } from '../transfers.js';
import { KEY, serialize, deserialize } from '../save.js';
import { crestSvg, kitSvg } from './art.js';

// The UI is the only place allowed to touch Date, localStorage and the DOM.
const newWorld = () => createWorld(Date.now() >>> 0);
const load = () => { try { return deserialize(localStorage.getItem(KEY)); } catch { return null; } };
const save = () => { try { localStorage.setItem(KEY, serialize(s)); } catch {} };

let s = load() || newWorld();
let tab = 'Squad', sel = null, viewing = null, tableDiv = s.me === null ? 0 : s.clubs[s.me].div, msg = '';

const $ = id => document.getElementById(id);
// Real names contain characters such as & and ' — escape everything taken from data.
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '€' + (n / 1e6).toFixed(2) + 'M';
const byPos = list => [...list].sort((a, b) => POS.indexOf(a.pos) - POS.indexOf(b.pos) || overall(b) - overall(a));
const label = k => k.replace(/[A-Z]/g, c => ' ' + c.toLowerCase());
const clubName = id => esc(s.clubs[id].name);
const badge = (id, size = 20) => crestSvg(s.clubs[id], size);
const HEAD = '<th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Ovr</th><th class="n">Value</th>';
const cells = p => `<td>${p.pos}</td><td class="n">${p.age}</td><td class="n">${overall(p)}</td><td class="n">${money(value(p))}</td>`;
const nameBtn = (p, act) => `<td><button class="link" data-act="${act}" data-id="${p.id}">${esc(p.name)}</button></td>`;

function profile() {
  const p = [...myClub(s).players, ...s.market].find(x => x.id === viewing);
  if (!p) return '';
  const group = ([title, keys]) => `<h3>${title}</h3>` + keys.map(k => `<div><span>${label(k)}</span><b class="${p.attrs[k] >= 15 ? 'hi' : ''}">${p.attrs[k]}</b></div>`).join('');
  return `<div class="attrs"><h3>${esc(p.name)} · ${p.pos} · age ${p.age} · overall ${overall(p)} · ${money(value(p))}
    <button data-act="close" style="float:right">Close</button></h3>${Object.entries(ATTRS).map(group).join('')}</div>`;
}

const views = {
  Squad() {
    fixLineup(s);
    const club = myClub(s), pos = slots(s.formation), st = strength(club, s.lineup, s.formation);
    const row = (p, slot) => `<tr class="${sel === p.id ? 'sel' : ''}"><td class="${slot && slot !== p.pos ? 'oop' : 'dim'}">${slot || 'Sub'}</td>${nameBtn(p, 'pick')}${cells(p)}<td><button data-act="view" data-id="${p.id}">Profile</button></td></tr>`;
    const bench = byPos(club.players.filter(p => !s.lineup.includes(p.id)));
    return `<div class="club">${crestSvg(club, 56)}${kitSvg(club.kit, 56)}<b>${esc(club.name)}</b></div>
      <div class="bar"><label>Formation <select data-act="formation">${Object.keys(FORMATIONS).map(f => `<option${f === s.formation ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
      <button data-act="auto">Auto-pick best XI</button><span class="dim">Attack ${st.att.toFixed(1)} · Defence ${st.def.toFixed(1)}</span></div>
      <p class="dim">Click two names to swap them. Orange slot = playing out of position.</p>
      <div class="wrap"><table><tr><th>Slot</th>${HEAD}<th></th></tr>${s.lineup.map((id, i) => row(club.players.find(p => p.id === id), pos[i])).join('')}
      <tr><th colspan="7">Bench</th></tr>${bench.map(p => row(p)).join('')}</table></div>`;
  },
  Match() {
    const d = myClub(s).div, rounds = Math.max(...s.divisions.map(x => x.fixtures.length));
    let h = '';
    if (s.done) h += `<h2>Season ${s.season} complete — you finished ${table(s, d).indexOf(s.me) + 1} in the ${esc(s.divisions[d].name)}.</h2><button class="primary" data-act="end">Start next season</button>`;
    else {
      const f = myFixture(s);
      h += `<h2>Round ${s.round + 1} of ${rounds}</h2>` + (f
        ? `<p class="fixture">${badge(f[0], 28)} ${clubName(f[0])} v ${clubName(f[1])} ${badge(f[1], 28)} <span class="dim">(${f[0] === s.me ? 'home' : 'away'})</span></p>`
        : `<p class="dim">No fixture for ${clubName(s.me)} this round — the ${esc(s.divisions[d].name)} season is over. Other divisions are still playing.</p>`)
        + '<button class="primary" data-act="play">Play round</button>';
    }
    if (s.last) {
      const res = s.last[d], mine = res.find(r => r.h === s.me || r.a === s.me), others = res.filter(r => r !== mine);
      if (mine) h += `<h2>Last round</h2><div class="score">${clubName(mine.h)} ${mine.hg} – ${mine.ag} ${clubName(mine.a)}</div>
        ${mine.ev.map(e => `<div>${e.min}' ⚽ ${esc(e.name)} <span class="dim">(${clubName(e.club)})</span></div>`).join('') || '<div class="dim">No goals.</div>'}`;
      if (others.length) h += `<h2>Other results</h2>${others.map(r => `<div>${clubName(r.h)} ${r.hg} – ${r.ag} ${clubName(r.a)}</div>`).join('')}`;
    }
    return h;
  },
  Table() {
    const cols = ['P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'];
    const row = (id, k) => { const t = s.clubs[id].st; return `<tr class="${id === s.me ? 'me' : ''}"><td class="n">${k + 1}</td><td>${badge(id, 18)}${clubName(id)}</td>${[t.p, t.w, t.d, t.l, t.gf, t.ga, t.gf - t.ga, t.pts].map(v => `<td class="n">${v}</td>`).join('')}</tr>`; };
    return `<div class="bar">${s.divisions.map((d, i) => `<button data-act="div" data-id="${i}" class="${i === tableDiv ? 'on' : ''}">${esc(d.name)}</button>`).join('')}</div>
      <h2>Season ${s.season}</h2><div class="wrap"><table><tr><th class="n">#</th><th>Club</th>${cols.map(c => `<th class="n">${c}</th>`).join('')}</tr>${table(s, tableDiv).map(row).join('')}</table></div>
      ${s.history.length ? '<h2>History</h2>' + s.history.map(h => `<div>Season ${h.season}: ${esc(h.champions[0])} won the ${esc(s.divisions[0].name)} — you finished ${h.pos} (prize ${money(h.prize)})</div>`).join('') : ''}`;
  },
  Transfers() {
    const list = (players, act, text) => `<div class="wrap"><table><tr>${HEAD}<th></th></tr>${byPos(players).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td><button data-act="${act}" data-id="${p.id}">${text}</button></td></tr>`).join('')}</table></div>`;
    return `<h2>Free agents</h2>${list(s.market, 'buy', 'Buy')}
      <h2>Your squad (${myClub(s).players.length}/${MAX_SQUAD}) <span class="dim">— sells for 80% of value</span></h2>${list(myClub(s).players, 'sell', 'Sell')}`;
  },
};

const actions = {
  start(id) { takeClub(s, id); tab = 'Squad'; tableDiv = s.clubs[id].div; },
  reset() { if (s.me === null || confirm('Abandon this career and start a new game?')) { s = newWorld(); sel = viewing = null; tableDiv = 0; } },
  tab(_, el) { tab = el.dataset.tab; sel = viewing = null; },
  div(id) { tableDiv = id; },
  view(id) { viewing = id; },
  close() { viewing = null; },
  auto() { s.lineup = bestXI(myClub(s), s.formation); sel = null; },
  formation(_, el) { s.formation = el.value; s.lineup = bestXI(myClub(s), s.formation); sel = null; },
  pick(id) {
    if (sel === null || sel === id) { sel = sel === id ? null : id; return; }
    const i = s.lineup.indexOf(sel), j = s.lineup.indexOf(id);
    if (i >= 0 && j >= 0) [s.lineup[i], s.lineup[j]] = [id, sel];
    else if (i >= 0) s.lineup[i] = id;
    else if (j >= 0) s.lineup[j] = sel;
    sel = null;
  },
  play() { playRound(s); },
  end() { endSeason(s); tab = 'Table'; tableDiv = myClub(s).div; },
  buy(id) { msg = buy(s, id) || 'Signed.'; },
  sell(id) { msg = sell(s, id) || 'Sold.'; if (viewing === id) viewing = null; },
};

function render() {
  if (s.me === null) {
    $('info').textContent = 'Pick a club to manage';
    $('nav').innerHTML = '';
    $('main').innerHTML = s.divisions.map(d => `<h2>${esc(d.name)}</h2><div class="grid">${d.clubIds.map(id => `<button data-act="start" data-id="${id}">${badge(id, 24)}${clubName(id)}</button>`).join('')}</div>`).join('');
    return;
  }
  $('info').innerHTML = `${badge(s.me, 22)}${clubName(s.me)} · ${esc(s.divisions[myClub(s).div].name)} · Season ${s.season} · Budget ${money(s.budget)}`;
  $('nav').innerHTML = Object.keys(views).map(t => `<button data-act="tab" data-tab="${t}" class="${t === tab ? 'on' : ''}">${t}</button>`).join('') + '<button data-act="reset">New game</button>';
  $('main').innerHTML = `<div class="msg" role="status">${msg}</div>` + profile() + views[tab]();
  msg = '';
}

function dispatch(e) {
  const el = e.target.closest('[data-act]');
  if (!el || (e.type === 'click') === (el.tagName === 'SELECT')) return; // selects act on change, everything else on click
  actions[el.dataset.act](+el.dataset.id, el);
  save();
  render();
}
document.addEventListener('click', dispatch);
document.addEventListener('change', dispatch);
render();
```

The club picker no longer offers "Re-roll world": the clubs are real, so there is nothing to re-roll.

- [ ] **Step 3: Static checks**

Run: `node --check src/ui/app.js` and `npm test`.
Expected: no syntax error; all tests pass.

- [ ] **Step 4: Verify in the browser**

Start the preview server `touchline` (port 8127) and open `http://localhost:8127`. Clear `localStorage` first (an old version-1 save is rejected and replaced, but start clean). Check each and confirm the console shows no errors:

1. The picker shows "Premier League" with 20 clubs, "Championship" with 24 and "League One" with 24; every button has a badge; names with `&` (for example "Brighton & Hove Albion" if present) display correctly.
2. Choosing a Premier League club shows its badge, kit and name above the squad; the header shows the badge, "Premier League", "Season 1" and €4.50M.
3. Squad shows real player names; swapping, formation change and Profile work.
4. Match → "Play round" shows a score line with badges in the fixture line and nine other results.
5. Table shows 20 rows with badges; the three division buttons switch to 24-row tables.
6. Transfers: buying and selling a player change the budget and show "Signed." / "Sold.".
7. Reload: the career is still there at the same round.
8. Play to round 39: the Match tab says there is no fixture for your club and other divisions are still playing; keep playing to round 46, "Start next season" appears, click it: Season 2 and a History line.
9. On Transfers in Season 2, at least some free agents from Season 1 are still listed (compare a few names noted before step 8).
10. Phone width (375 px): picker, header and tables have no horizontal page scroll other than inside table wrappers.

- [ ] **Step 5: Commit**

```bash
git add index.html src/ui/app.js
git commit -m "feat: real clubs with badges and kits in the UI"
```

---

## Definition of done for Phase 1b

- `npm test` passes, including `tests/england.test.js` on the real data.
- The engine purity grep prints nothing.
- All ten browser checks in Task 9 Step 4 pass.
- The import report from Task 6 (players matched per division, ambiguous names, keeper mismatches) is in the phase summary.
- Every club in the three data files has a header comment with sources, and each data task's report states how many ages and which clubs were estimated from memory.
- `docs/fun-surprises.md` is updated with any new quirk found during this phase, and the phase summary lists them.

## What Phase 1b deliberately leaves out

- Promotion and relegation between the three divisions (Phase 4). Clubs stay in their 2026–27 division every season.
- Real free agents and real youth intake: generated players fill those, with invented names.
- Away kits, kit changes between seasons, and real-time squad updates: the data is a snapshot.
- Premier League clubs still collect weekly income during the eight rounds when only the EFL plays. Check whether this is worth keeping as a fun surprise when Phase 4 introduces the calendar.
