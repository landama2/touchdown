# Touchline Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-file demo with a tested, deterministic, modular engine: attribute-based players, three divisions of 16 clubs, versioned saves, and the existing UI ported onto it.

**Architecture:** Pure engine modules under `src/` (state + seeded RNG in, plain JSON data out; no DOM, no `Math.random`, no `Date`). One UI module under `src/ui/` renders from state and calls the engine. The browser loads ES modules directly; Node's built-in test runner tests the engine. The whole career is one plain object.

**Tech Stack:** Vanilla JavaScript ES modules, HTML/CSS, Node ≥ 22 built-in test runner (`node:test`, `node:assert/strict`). No npm dependencies. Local preview via `python -m http.server 8127` (already in `.claude/launch.json`).

## Global Constraints

- Node version: 22 or newer (`node --version`). No packages are installed; `package.json` has no `dependencies` or `devDependencies`.
- Engine code (`src/*.js`, `src/data/*.js`) must not reference `document`, `window`, `localStorage`, `Math.random` or `Date`. Randomness comes only from the `rng` passed in or built from `state.seed`.
- State must survive `JSON.parse(JSON.stringify(state))` unchanged: no `Map`, `Set`, class instances, functions or `undefined` values in state.
- Everything is fictional. Club and player names come only from `src/data/names.js`. If a generated club name matches a real club, add its town part to `DENY` in that file. Do not copy names, data, screen layouts or text from any existing game.
- The game is called **Touchline**.
- Player attributes are integers 1–20. `overall()` returns an integer 5–100.
- Run all tests with `npm test`. Every task ends with all tests passing and a commit.
- The old `game.js` stays untouched until Task 6 deletes it, so the demo keeps working until the port is done.

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | Marks the project as ES modules; `npm test` script |
| `src/rng.js` | Seeded random number generator whose position can be saved |
| `src/data/names.js` | Name fragments for players and clubs, deny-list |
| `src/player.js` | Attribute model, player creation, overall rating, value, ageing |
| `src/fixtures.js` | Double round-robin fixture generation |
| `src/world.js` | Builds a new career state: divisions, clubs, squads, free agents |
| `src/lineup.js` | Formations, best XI, lineup repair, team strength |
| `src/match.js` | Quick match result (replaced by the full engine in Phase 2) |
| `src/season.js` | Taking a club, playing a round in every division, tables, season rollover |
| `src/transfers.js` | Buying free agents, selling players (human club only until Phase 7) |
| `src/save.js` | Save version, serialise, deserialise with version check |
| `src/ui/app.js` | All rendering and event handling |
| `index.html` | Markup, styles, loads `src/ui/app.js` |
| `tests/*.test.js` | One test file per engine module |

---

### Task 1: Project scaffold and seeded RNG

**Files:**
- Create: `package.json`, `src/rng.js`, `tests/rng.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `makeRng(seed: number) → { next(): number in [0,1), int(lo, hi): integer inclusive, pick(arr): element, seed: number (current position, read-only) }`. Building a new rng from `rng.seed` continues the same sequence.

- [ ] **Step 1: Check Node and initialise git**

Run: `node --version` — expected `v22` or higher. If lower, stop and report.

Run:
```bash
git init
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "touchline",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"tests/*.test.js\""
  }
}
```

- [ ] **Step 3: Write the failing test** — `tests/rng.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';

test('same seed gives the same sequence', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('different seeds give different sequences', () => {
  assert.notEqual(makeRng(1).next(), makeRng(2).next());
});

test('next is in [0,1) and int is inclusive on both ends', () => {
  const r = makeRng(7), seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const x = r.next();
    assert.ok(x >= 0 && x < 1);
    seen.add(r.int(3, 6));
  }
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6]);
});

test('pick returns an element of the array', () => {
  const r = makeRng(9), arr = ['a', 'b', 'c'];
  for (let i = 0; i < 50; i++) assert.ok(arr.includes(r.pick(arr)));
});

test('an rng rebuilt from .seed continues the sequence', () => {
  const a = makeRng(123);
  a.next(); a.next();
  const b = makeRng(a.seed);
  assert.equal(a.next(), b.next());
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/rng.js'`

- [ ] **Step 5: Implement** — `src/rng.js`

```js
// mulberry32. `seed` is the generator's whole state, so storing rng.seed in the
// save and calling makeRng(savedSeed) later resumes the exact same sequence.
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: arr => arr[Math.floor(next() * arr.length)],
    get seed() { return a; },
  };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: 5 tests pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add package.json src/rng.js tests/rng.test.js game.js index.html .claude/launch.json docs
git commit -m "chore: scaffold ES-module project with seeded RNG"
```

---

### Task 2: Player model

**Files:**
- Create: `src/data/names.js`, `src/player.js`, `tests/player.test.js`

**Interfaces:**
- Consumes: `makeRng` from Task 1.
- Produces:
  - `POS: ['GK','DF','MF','FW']`
  - `ATTRS: { technical: string[], mental: string[], physical: string[], goalkeeping: string[] }`, `ALL_ATTRS: string[]`
  - `WEIGHTS: { [pos]: { [attr]: number } }`
  - `createPlayer(rng, id: number, pos: string, quality: number, age?: number) → Player` where `Player = { id, name, pos, age, attrs: { [attr]: 1..20 }, pot: 1..20 }`
  - `overall(player, pos = player.pos) → integer 5..100`
  - `value(player) → integer (euros)`
  - `ageOneYear(rng, player) → void` (mutates)
  - From `names.js`: `FIRST, LAST, PRE, STEM, SUFFIX, DENY` (string arrays)

- [ ] **Step 1: Create `src/data/names.js`**

```js
// All names are invented fragments. If a combination turns out to match a real
// club, add the town part (PRE+STEM, e.g. 'Ashfield') to DENY.
export const FIRST = 'Adam Ben Carlos Dario Emil Felix Goran Hugo Ivan Jonas Karel Luca Milan Nico Oskar Pavel Rafa Stefan Tomas Viktor Wim Yann Zoran Andre Bruno Cyril Denis Erik Filip Gabriel'.split(' ');
export const LAST = 'Novak Berg Castell Dvorak Eklund Fontana Greaves Holt Ilic Jansen Kovar Lindqvist Moreau Nemec Okafor Petrov Quint Rossi Svoboda Tanaka Urban Vesely Wolff Ybarra Zeman Adler Brandt Corvin Drummond Estrada'.split(' ');
export const PRE = 'North East West South Iron Salt High Oak Red Stone Lark Cold Wex Ash Grey Elm'.split(' ');
export const STEM = 'gate mouth bridge marsh field haven cliff well moor spur harbour combe'.split(' ');
export const SUFFIX = ['Athletic', 'FC', 'United', 'Town', 'Rovers', 'City', 'Wanderers', 'Albion', 'Rangers', 'Vale', 'Borough'];
export const DENY = [];
```

- [ ] **Step 2: Write the failing test** — `tests/player.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { POS, ALL_ATTRS, createPlayer, overall, value, ageOneYear } from '../src/player.js';

test('createPlayer fills every attribute with an integer 1..20', () => {
  const rng = makeRng(1);
  for (const pos of POS) for (const q of [1, 10, 20]) {
    const p = createPlayer(rng, 1, pos, q);
    assert.deepEqual(Object.keys(p.attrs).sort(), [...ALL_ATTRS].sort());
    for (const k of ALL_ATTRS) assert.ok(Number.isInteger(p.attrs[k]) && p.attrs[k] >= 1 && p.attrs[k] <= 20, `${k}=${p.attrs[k]}`);
    assert.ok(p.pot >= 1 && p.pot <= 20);
    assert.ok(p.age >= 17 && p.age <= 34);
    assert.equal(p.pos, pos);
  }
});

test('createPlayer is deterministic for a seed', () => {
  assert.deepEqual(createPlayer(makeRng(5), 1, 'MF', 12), createPlayer(makeRng(5), 1, 'MF', 12));
});

test('overall is an integer 5..100 and players rate best in their own position', () => {
  const rng = makeRng(2);
  let own = 0, other = 0;
  for (let i = 0; i < 100; i++) {
    const p = createPlayer(rng, i, 'GK', 12);
    const o = overall(p);
    assert.ok(Number.isInteger(o) && o >= 5 && o <= 100);
    own += o; other += overall(p, 'FW');
  }
  assert.ok(own > other + 500, `GK as GK ${own} vs as FW ${other}`);
});

test('higher quality gives higher overall on average', () => {
  const rng = makeRng(3);
  const avg = q => { let t = 0; for (let i = 0; i < 100; i++) t += overall(createPlayer(rng, i, 'DF', q)); return t / 100; };
  assert.ok(avg(15) > avg(8) + 20);
});

test('value falls with age for identical attributes', () => {
  const p = createPlayer(makeRng(4), 1, 'FW', 14, 22);
  const old = { ...p, age: 32 };
  assert.ok(value(p) > value(old));
  assert.ok(Number.isInteger(value(p)) && value(p) > 0);
});

test('ageOneYear: young players improve up to potential, old players lose physical attributes', () => {
  const rng = makeRng(6);
  const young = createPlayer(rng, 1, 'MF', 8, 18); young.pot = 20;
  const before = overall(young);
  for (let i = 0; i < 4; i++) ageOneYear(rng, young);
  assert.equal(young.age, 22);
  assert.ok(overall(young) > before);
  for (const k of ALL_ATTRS) assert.ok(young.attrs[k] <= 20);

  const old = createPlayer(rng, 2, 'MF', 12, 32);
  const phys = p => p.attrs.pace + p.attrs.stamina + p.attrs.strength + p.attrs.agility;
  const physBefore = phys(old);
  for (let i = 0; i < 3; i++) ageOneYear(rng, old);
  assert.ok(phys(old) < physBefore);
  for (const k of ALL_ATTRS) assert.ok(old.attrs[k] >= 1);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/player.js'`

- [ ] **Step 4: Implement** — `src/player.js`

```js
import { FIRST, LAST } from './data/names.js';

export const POS = ['GK', 'DF', 'MF', 'FW'];
export const ATTRS = {
  technical: ['passing', 'dribbling', 'finishing', 'tackling', 'heading', 'firstTouch', 'crossing'],
  mental: ['vision', 'positioning', 'composure', 'workRate', 'decisions', 'aggression'],
  physical: ['pace', 'stamina', 'strength', 'agility'],
  goalkeeping: ['handling', 'reflexes'],
};
export const ALL_ATTRS = Object.values(ATTRS).flat();

// How much each attribute matters for a position. Drives overall() and generation bias.
export const WEIGHTS = {
  GK: { handling: 3, reflexes: 3, positioning: 2, agility: 1, composure: 1 },
  DF: { tackling: 3, positioning: 3, heading: 2, strength: 2, pace: 1, decisions: 1 },
  MF: { passing: 3, vision: 2, firstTouch: 2, workRate: 2, stamina: 2, decisions: 2, tackling: 1 },
  FW: { finishing: 3, dribbling: 2, pace: 2, composure: 2, firstTouch: 2, heading: 1 },
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function createPlayer(rng, id, pos, quality, age = rng.int(17, 34)) {
  const attrs = {};
  for (const k of ALL_ATTRS) {
    const w = WEIGHTS[pos][k];
    // Attributes that matter for the position sit above the club's quality; the rest sit below.
    attrs[k] = clamp(Math.round(quality + (w ? w - 1 : -3) + rng.int(-3, 3)), 1, 20);
  }
  const pot = clamp(Math.round(quality) + (age < 23 ? rng.int(1, 5) : rng.int(0, 1)), 1, 20);
  return { id, name: rng.pick(FIRST) + ' ' + rng.pick(LAST), pos, age, attrs, pot };
}

export function overall(p, pos = p.pos) {
  const w = WEIGHTS[pos];
  let sum = 0, total = 0;
  for (const k in w) { sum += p.attrs[k] * w[k]; total += w[k]; }
  return Math.round(sum / total * 5);
}

export function value(p) {
  const ageFactor = p.age < 24 ? 1.3 : p.age > 30 ? 0.6 : 1;
  return Math.round((overall(p) / 10) ** 4 * ageFactor) * 1000;
}

// Called once per player at season rollover. `pot` caps the attributes that matter for the position.
export function ageOneYear(rng, p) {
  p.age++;
  if (p.age <= 23) {
    const keys = Object.keys(WEIGHTS[p.pos]);
    for (let i = 0; i < 4; i++) { const k = rng.pick(keys); if (p.attrs[k] < p.pot) p.attrs[k]++; }
  }
  if (p.age >= 31) {
    for (let i = 0; i < 2; i++) { const k = rng.pick(ATTRS.physical); p.attrs[k] = Math.max(1, p.attrs[k] - 1); }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: all tests in `rng.test.js` and `player.test.js` pass.

Note on the last test: four random increments per year over four years on an 18-year-old with `pot` 20 always raises `overall`; three years of two physical decrements each on a 32-year-old lowers the physical sum unless every attribute is already 1, which quality 12 rules out.

- [ ] **Step 6: Commit**

```bash
git add src/data/names.js src/player.js tests/player.test.js
git commit -m "feat: attribute-based player model"
```

---

### Task 3: Fixtures and world generation

**Files:**
- Create: `src/fixtures.js`, `src/save.js`, `src/world.js`, `tests/world.test.js`

**Interfaces:**
- Consumes: `makeRng`; `POS`, `createPlayer`, `overall` from Task 2; `PRE, STEM, SUFFIX, DENY` from `names.js`.
- Produces:
  - `makeFixtures(ids: number[]) → Array<Array<[homeId, awayId]>>` — `2·(n−1)` rounds, `n` must be even.
  - `SAVE_VERSION = 1` (from `src/save.js`; the rest of that file arrives in Task 5).
  - `DIVISIONS: string[]` (3 names), `CLUBS_PER_DIV = 16`, `SQUAD_SHAPE = [['GK',3],['DF',7],['MF',7],['FW',5]]`
  - `blankStats() → { p, w, d, l, gf, ga, pts }` all 0
  - `clubNames(rng, n) → string[]` unique
  - `createWorld(seed: number) → State`:
    ```
    State = {
      version: 1, seed: number, nid: number,          // nid = next player id
      me: null | clubId, formation: '4-4-2', lineup: number[], budget: number,
      season: 1, round: 0, done: false,
      clubs: Club[],                                   // index === club.id
      divisions: { name, clubIds: number[], fixtures }[],
      market: Player[], history: [], last: null
    }
    Club = { id, name, div: 0|1|2, quality: number, players: Player[], st: Stats }
    ```

- [ ] **Step 1: Write the failing test** — `tests/world.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { overall } from '../src/player.js';
import { makeFixtures } from '../src/fixtures.js';
import { createWorld, clubNames, DIVISIONS, CLUBS_PER_DIV } from '../src/world.js';

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

test('clubNames returns n unique names with unique town parts', () => {
  const names = clubNames(makeRng(1), 48);
  assert.equal(new Set(names).size, 48);
  assert.equal(new Set(names.map(n => n.split(' ')[0])).size, 48);
});

test('createWorld builds 3 divisions of 16 clubs with 22-player squads', () => {
  const s = createWorld(99);
  assert.equal(s.version, 1);
  assert.equal(s.divisions.length, DIVISIONS.length);
  assert.equal(s.clubs.length, DIVISIONS.length * CLUBS_PER_DIV);
  s.clubs.forEach((c, i) => {
    assert.equal(c.id, i);
    assert.equal(c.players.length, 22);
    assert.equal(c.players.filter(p => p.pos === 'GK').length, 3);
    assert.deepEqual(c.st, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  });
  s.divisions.forEach((d, i) => {
    assert.equal(d.clubIds.length, CLUBS_PER_DIV);
    assert.ok(d.clubIds.every(id => s.clubs[id].div === i));
    assert.equal(d.fixtures.length, 30);
  });
  const ids = [...s.clubs.flatMap(c => c.players), ...s.market].map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => id < s.nid));
  assert.equal(s.market.length, 40);
  assert.equal(s.me, null);
});

test('higher divisions are stronger', () => {
  const s = createWorld(7);
  const avg = d => { const ps = s.divisions[d].clubIds.flatMap(id => s.clubs[id].players); return ps.reduce((t, p) => t + overall(p), 0) / ps.length; };
  assert.ok(avg(0) > avg(1) && avg(1) > avg(2));
});

test('createWorld is deterministic and JSON-safe', () => {
  const a = createWorld(1234);
  assert.deepEqual(a, createWorld(1234));
  assert.notDeepEqual(a.clubs.map(c => c.name), createWorld(1235).clubs.map(c => c.name));
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/fixtures.js'`

- [ ] **Step 3: Implement** — `src/fixtures.js`

```js
// Circle method. First half: every pair once; second half: same pairs with home/away reversed.
export function makeFixtures(ids) {
  const n = ids.length, a = [...ids], half = [];
  for (let r = 0; r < n - 1; r++) {
    half.push(Array.from({ length: n / 2 }, (_, i) => r % 2 ? [a[n - 1 - i], a[i]] : [a[i], a[n - 1 - i]]));
    a.splice(1, 0, a.pop());
  }
  return half.concat(half.map(rd => rd.map(([h, w]) => [w, h])));
}
```

- [ ] **Step 4: Implement** — `src/save.js` (version constant only for now)

```js
// Bump when the shape of State changes, and add a migration in deserialize().
export const SAVE_VERSION = 1;
```

- [ ] **Step 5: Implement** — `src/world.js`

```js
import { makeRng } from './rng.js';
import { POS, createPlayer } from './player.js';
import { makeFixtures } from './fixtures.js';
import { SAVE_VERSION } from './save.js';
import { PRE, STEM, SUFFIX, DENY } from './data/names.js';

export const DIVISIONS = ['First Division', 'Second Division', 'Third Division'];
export const CLUBS_PER_DIV = 16;
export const SQUAD_SHAPE = [['GK', 3], ['DF', 7], ['MF', 7], ['FW', 5]];
export const MARKET_SIZE = 40;

export const blankStats = () => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });

export function clubNames(rng, n) {
  const towns = new Set(), names = [];
  while (names.length < n) {
    const town = rng.pick(PRE) + rng.pick(STEM);
    if (towns.has(town) || DENY.includes(town)) continue;
    towns.add(town);
    names.push(town + ' ' + rng.pick(SUFFIX));
  }
  return names;
}

export function createWorld(seed) {
  const rng = makeRng(seed);
  const s = {
    version: SAVE_VERSION, seed, nid: 1,
    me: null, formation: '4-4-2', lineup: [], budget: 0,
    season: 1, round: 0, done: false,
    clubs: [], divisions: [], market: [], history: [], last: null,
  };
  const names = clubNames(rng, DIVISIONS.length * CLUBS_PER_DIV);
  DIVISIONS.forEach((name, d) => {
    const clubIds = [];
    for (let i = 0; i < CLUBS_PER_DIV; i++) {
      const id = s.clubs.length, quality = 15 - d * 3 - i * 0.2;
      const club = { id, name: names[id], div: d, quality, players: [], st: blankStats() };
      for (const [pos, n] of SQUAD_SHAPE)
        for (let k = 0; k < n; k++) club.players.push(createPlayer(rng, s.nid++, pos, quality));
      s.clubs.push(club);
      clubIds.push(id);
    }
    s.divisions.push({ name, clubIds, fixtures: makeFixtures(clubIds) });
  });
  for (let i = 0; i < MARKET_SIZE; i++) s.market.push(createPlayer(rng, s.nid++, rng.pick(POS), 9));
  s.seed = rng.seed;
  return s;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/fixtures.js src/save.js src/world.js tests/world.test.js
git commit -m "feat: generate a three-division world"
```

---

### Task 4: Lineups, quick match, season loop

**Files:**
- Create: `src/lineup.js`, `src/match.js`, `src/season.js`, `tests/season.test.js`

**Interfaces:**
- Consumes: `makeRng`; `overall`, `createPlayer`, `ageOneYear`, `POS`; `makeFixtures`; `createWorld`, `blankStats`, `CLUBS_PER_DIV`, `MARKET_SIZE`.
- Produces:
  - `FORMATIONS: { [name]: [gk, df, mf, fw] }`, `slots(formation) → string[11]`
  - `eff(player, pos) → number` (overall in that slot, ×0.85 when out of natural position)
  - `bestXI(club, formation) → number[11]` (player ids in slot order)
  - `fixLineup(state) → void` (re-picks `state.lineup` if it is not 11 distinct ids of the human club)
  - `strength(club, ids, formation) → { att: number, def: number }`
  - `simMatch(rng, home, away) → { h, a, hg, ag, ev: { min, club, name }[] }` where `home`/`away` are `{ club, ids, formation }`
  - `myClub(state) → Club`
  - `takeClub(state, clubId) → void` (sets `me`, `budget`, `lineup`)
  - `playRound(state) → results | null` — `results[divisionIndex]` is that division's array of match results; also stored in `state.last`. Returns `null` when `state.done`.
  - `table(state, divisionIndex) → clubId[]` sorted best first
  - `endSeason(state) → void` — no-op unless `state.done`; pushes `{ season, champions: string[], pos: number|null, prize: number }` to `state.history`

- [ ] **Step 1: Write the failing test** — `tests/season.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createWorld } from '../src/world.js';
import { FORMATIONS, slots, bestXI, fixLineup, strength } from '../src/lineup.js';
import { simMatch } from '../src/match.js';
import { takeClub, myClub, playRound, table, endSeason } from '../src/season.js';

test('slots has 11 entries starting with GK for every formation', () => {
  for (const f of Object.keys(FORMATIONS)) {
    assert.equal(slots(f).length, 11);
    assert.equal(slots(f)[0], 'GK');
  }
});

test('bestXI picks 11 distinct players with a goalkeeper in goal', () => {
  const s = createWorld(1), club = s.clubs[0];
  for (const f of Object.keys(FORMATIONS)) {
    const ids = bestXI(club, f);
    assert.equal(new Set(ids).size, 11);
    assert.equal(club.players.find(p => p.id === ids[0]).pos, 'GK');
    const st = strength(club, ids, f);
    assert.ok(Number.isFinite(st.att) && Number.isFinite(st.def) && st.att > 0 && st.def > 0);
  }
});

test('fixLineup repairs a lineup that references a missing player', () => {
  const s = createWorld(2);
  takeClub(s, 5);
  const gone = s.lineup[3];
  myClub(s).players = myClub(s).players.filter(p => p.id !== gone);
  fixLineup(s);
  assert.equal(new Set(s.lineup).size, 11);
  assert.ok(!s.lineup.includes(gone));
});

test('simMatch: sensible goal totals, stronger side wins more, events match the score', () => {
  const s = createWorld(3), rng = makeRng(3);
  const side = id => ({ club: s.clubs[id], ids: bestXI(s.clubs[id], '4-4-2'), formation: '4-4-2' });
  const strong = side(0), weak = side(47), peer = side(1);
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

test('a full season: every club plays 30, stats are consistent in every division', () => {
  const s = createWorld(4);
  takeClub(s, 20);
  const budget0 = s.budget;
  while (!s.done) assert.equal(playRound(s).length, 3);
  assert.equal(s.round, 30);
  assert.equal(playRound(s), null);
  assert.ok(s.budget > budget0);
  s.divisions.forEach((d, i) => {
    const st = d.clubIds.map(id => s.clubs[id].st), sum = k => st.reduce((t, x) => t + x[k], 0);
    assert.ok(st.every(x => x.p === 30 && x.p === x.w + x.d + x.l && x.pts === 3 * x.w + x.d));
    assert.equal(sum('w'), sum('l'));
    assert.equal(sum('gf'), sum('ga'));
    const tb = table(s, i);
    assert.deepEqual([...tb].sort((a, b) => a - b), d.clubIds);
    for (let k = 1; k < tb.length; k++) assert.ok(s.clubs[tb[k - 1]].st.pts >= s.clubs[tb[k]].st.pts);
  });
});

test('endSeason rolls over; three seasons keep squads intact', () => {
  const s = createWorld(5);
  takeClub(s, 0);
  endSeason(s); // not done yet: no-op
  assert.equal(s.season, 1);
  for (let y = 1; y <= 3; y++) {
    while (!s.done) playRound(s);
    endSeason(s);
    assert.equal(s.season, y + 1);
    assert.equal(s.round, 0);
    assert.equal(s.done, false);
    assert.equal(s.history.length, y);
    assert.equal(s.history[y - 1].champions.length, 3);
    assert.ok(s.history[y - 1].pos >= 1 && s.history[y - 1].pos <= 16);
    assert.ok(s.clubs.every(c => c.players.length === 22 && c.st.p === 0 && c.players.every(p => p.age <= 35)));
    assert.equal(new Set(s.lineup).size, 11);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('same seed and same choices give the same career; works with no human club', () => {
  const run = () => { const s = createWorld(6); while (!s.done) playRound(s); endSeason(s); return s; };
  assert.deepEqual(run(), run());
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/lineup.js'`

- [ ] **Step 3: Implement** — `src/lineup.js`

```js
import { POS, overall } from './player.js';

export const FORMATIONS = { '4-4-2': [1, 4, 4, 2], '4-3-3': [1, 4, 3, 3], '3-5-2': [1, 3, 5, 2], '5-3-2': [1, 5, 3, 2], '4-5-1': [1, 4, 5, 1] };
const SLOT_WEIGHT = { GK: [0, 1.5], DF: [0, 1], MF: [0.5, 0.5], FW: [1, 0] }; // [attack, defence]

export const slots = f => FORMATIONS[f].flatMap((n, i) => Array(n).fill(POS[i]));
export const eff = (p, pos) => overall(p, pos) * (p.pos === pos ? 1 : 0.85);

// Greedy slot-by-slot pick. Good enough until Phase 3 introduces roles.
export function bestXI(club, formation) {
  const used = new Set();
  return slots(formation).map(pos => {
    let best = null;
    for (const p of club.players)
      if (!used.has(p.id) && (!best || eff(p, pos) > eff(best, pos))) best = p;
    used.add(best.id);
    return best.id;
  });
}

export function fixLineup(s) {
  const club = s.clubs[s.me], ids = new Set(club.players.map(p => p.id));
  if (s.lineup.length !== 11 || new Set(s.lineup).size !== 11 || s.lineup.some(id => !ids.has(id)))
    s.lineup = bestXI(club, s.formation);
}

export function strength(club, ids, formation) {
  const pos = slots(formation);
  let a = 0, aw = 0, d = 0, dw = 0;
  ids.forEach((id, i) => {
    const e = eff(club.players.find(p => p.id === id), pos[i]), [wa, wd] = SLOT_WEIGHT[pos[i]];
    a += e * wa; aw += wa; d += e * wd; dw += wd;
  });
  const [, nd, , nf] = FORMATIONS[formation];
  return { att: a / aw * (1 + 0.03 * (nf - 2)), def: d / dw * (1 + 0.03 * (nd - 4)) };
}
```

- [ ] **Step 4: Implement** — `src/match.js`

```js
import { slots, strength } from './lineup.js';

// Quick result model: Poisson goals from attack-vs-defence. Phase 2 replaces this file
// with the minute-by-minute engine; keep the simMatch signature and result shape.
// SPREAD 25: top v bottom of one division (≈15 overall apart) averages roughly 2.4–0.7.
const BASE_GOALS = 1.35, HOME_EDGE = 1.15, SPREAD = 25;
const SCORER_WEIGHT = { GK: 0, DF: 1, MF: 2, FW: 4 };

function poisson(rng, lambda) {
  let k = 0, p = Math.exp(-lambda), c = p;
  const u = rng.next();
  while (u > c && k < 12) { k++; p *= lambda / k; c += p; }
  return k;
}

function prepare({ club, ids, formation }) {
  return { club, ids, pos: slots(formation), ...strength(club, ids, formation) };
}

function scorer(rng, side) {
  const pool = side.ids.flatMap((id, i) => Array(SCORER_WEIGHT[side.pos[i]]).fill(id));
  const id = rng.pick(pool);
  return side.club.players.find(p => p.id === id).name;
}

export function simMatch(rng, home, away) {
  const H = prepare(home), A = prepare(away);
  const hg = poisson(rng, BASE_GOALS * HOME_EDGE * Math.exp((H.att - A.def) / SPREAD));
  const ag = poisson(rng, BASE_GOALS * Math.exp((A.att - H.def) / SPREAD));
  const ev = [];
  for (const [side, n] of [[H, hg], [A, ag]])
    for (let i = 0; i < n; i++) ev.push({ min: rng.int(1, 90), club: side.club.id, name: scorer(rng, side) });
  ev.sort((x, y) => x.min - y.min);
  return { h: H.club.id, a: A.club.id, hg, ag, ev };
}
```

- [ ] **Step 5: Implement** — `src/season.js`

```js
import { makeRng } from './rng.js';
import { POS, createPlayer, ageOneYear } from './player.js';
import { makeFixtures } from './fixtures.js';
import { blankStats, CLUBS_PER_DIV, MARKET_SIZE } from './world.js';
import { bestXI, fixLineup } from './lineup.js';
import { simMatch } from './match.js';

const RETIRE_AGE = 35;
const tier = club => 3 - club.div; // 3 for the top division, 1 for the bottom: scales all money

export const myClub = s => s.clubs[s.me];

export function takeClub(s, clubId) {
  s.me = clubId;
  s.budget = tier(s.clubs[clubId]) * 1.5e6;
  s.lineup = bestXI(s.clubs[clubId], s.formation);
}

function entry(s, id) {
  const club = s.clubs[id];
  return id === s.me ? { club, ids: s.lineup, formation: s.formation } : { club, ids: bestXI(club, '4-4-2'), formation: '4-4-2' };
}

function record(st, scored, conceded) {
  st.p++; st.gf += scored; st.ga += conceded;
  if (scored > conceded) { st.w++; st.pts += 3; } else if (scored < conceded) st.l++; else { st.d++; st.pts++; }
}

export function playRound(s) {
  if (s.done) return null;
  if (s.me !== null) fixLineup(s);
  const rng = makeRng(s.seed);
  s.last = s.divisions.map(d => d.fixtures[s.round].map(([h, a]) => {
    const r = simMatch(rng, entry(s, h), entry(s, a));
    record(s.clubs[h].st, r.hg, r.ag);
    record(s.clubs[a].st, r.ag, r.hg);
    if (h === s.me) s.budget += 60e3 * tier(s.clubs[h]); // gate receipts
    return r;
  }));
  if (s.me !== null) s.budget += 100e3 * tier(myClub(s)); // weekly income
  s.seed = rng.seed;
  s.round++;
  s.done = s.round === s.divisions[0].fixtures.length;
  return s.last;
}

export function table(s, d) {
  return [...s.divisions[d].clubIds].sort((x, y) => {
    const a = s.clubs[x].st, b = s.clubs[y].st;
    return b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || x - y;
  });
}

export function endSeason(s) {
  if (!s.done) return;
  const rng = makeRng(s.seed);
  const champions = s.divisions.map((_, i) => s.clubs[table(s, i)[0]].name);
  let pos = null, prize = 0;
  if (s.me !== null) {
    pos = table(s, myClub(s).div).indexOf(s.me) + 1;
    prize = (CLUBS_PER_DIV + 1 - pos) * 100e3 * tier(myClub(s));
    s.budget += prize;
  }
  s.history.push({ season: s.season, champions, pos, prize });
  for (const c of s.clubs) {
    c.st = blankStats();
    c.players = c.players.map(p => {
      if (p.age >= RETIRE_AGE) return createPlayer(rng, s.nid++, p.pos, c.quality - 2, rng.int(17, 19)); // youth replaces retiree
      ageOneYear(rng, p);
      return p;
    });
  }
  s.market = Array.from({ length: MARKET_SIZE }, () => createPlayer(rng, s.nid++, rng.pick(POS), 9));
  for (const d of s.divisions) d.fixtures = makeFixtures(d.clubIds);
  s.seed = rng.seed;
  s.round = 0; s.done = false; s.last = null; s.season++;
  if (s.me !== null) fixLineup(s);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: all tests pass.

If only the `simMatch` balance assertions fail, tune `BASE_GOALS` (goals per match) or `SPREAD` (smaller = stronger sides win more) in `src/match.js` until they hold; do not loosen the test bounds.

- [ ] **Step 7: Commit**

```bash
git add src/lineup.js src/match.js src/season.js tests/season.test.js
git commit -m "feat: lineups, quick match and season loop across divisions"
```

---

### Task 5: Transfers and save/load

**Files:**
- Create: `src/transfers.js`, `tests/transfers.test.js`, `tests/save.test.js`
- Modify: `src/save.js` (currently one line; replace whole file)

**Interfaces:**
- Consumes: `value`; `myClub`, `takeClub`; `fixLineup`; `createWorld`.
- Produces:
  - `MIN_SQUAD = 16`, `MAX_SQUAD = 30`, `SELL_RATE = 0.8`
  - `buy(state, playerId) → null | string` — `null` on success, otherwise a message to show the user
  - `sell(state, playerId) → null | string`
  - `SAVE_VERSION = 1`, `KEY = 'touchline.save'`
  - `serialize(state) → string`
  - `deserialize(text: string | null) → State | null` — `null` for missing, corrupt or wrong-version data; never throws

- [ ] **Step 1: Write the failing tests** — `tests/transfers.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { value } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { takeClub, myClub } from '../src/season.js';
import { buy, sell, MIN_SQUAD, MAX_SQUAD, SELL_RATE } from '../src/transfers.js';

const fresh = () => { const s = createWorld(11); takeClub(s, 40); return s; };

test('buy moves the player and charges their value', () => {
  const s = fresh(), p = [...s.market].sort((a, b) => value(a) - value(b))[0];
  s.budget = value(p) + 5;
  assert.equal(buy(s, p.id), null);
  assert.equal(s.budget, 5);
  assert.ok(myClub(s).players.includes(p));
  assert.ok(!s.market.includes(p));
});

test('buy refuses: unknown player, not enough money, full squad', () => {
  const s = fresh(), p = s.market[0];
  assert.equal(typeof buy(s, -1), 'string');
  s.budget = value(p) - 1;
  assert.equal(typeof buy(s, p.id), 'string');
  assert.equal(s.market.length, 40);
  s.budget = 1e12;
  while (myClub(s).players.length < MAX_SQUAD) assert.equal(buy(s, s.market[0].id), null);
  assert.equal(typeof buy(s, s.market[0].id), 'string');
});

test('sell pays 80% of value, lists the player, and keeps a valid lineup', () => {
  const s = fresh(), id = s.lineup[0], p = myClub(s).players.find(x => x.id === id), b0 = s.budget;
  assert.equal(sell(s, id), null);
  assert.equal(s.budget, b0 + Math.round(value(p) * SELL_RATE));
  assert.ok(s.market.includes(p));
  assert.equal(new Set(s.lineup).size, 11);
  assert.ok(!s.lineup.includes(id));
});

test('sell refuses: not your player, squad at minimum', () => {
  const s = fresh();
  assert.equal(typeof sell(s, s.market[0].id), 'string');
  while (myClub(s).players.length > MIN_SQUAD) assert.equal(sell(s, myClub(s).players[0].id), null);
  assert.equal(typeof sell(s, myClub(s).players[0].id), 'string');
  assert.equal(myClub(s).players.length, MIN_SQUAD);
});
```

`tests/save.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { takeClub, playRound } from '../src/season.js';
import { serialize, deserialize, SAVE_VERSION } from '../src/save.js';

test('a career survives a save/load round trip and continues identically', () => {
  const a = createWorld(21);
  takeClub(a, 3);
  playRound(a);
  const b = deserialize(serialize(a));
  assert.deepEqual(b, a);
  playRound(a); playRound(b);
  assert.deepEqual(b, a);
});

test('deserialize returns null for missing, corrupt or wrong-version saves', () => {
  assert.equal(deserialize(null), null);
  assert.equal(deserialize(''), null);
  assert.equal(deserialize('{not json'), null);
  assert.equal(deserialize('42'), null);
  assert.equal(deserialize(JSON.stringify({ version: SAVE_VERSION + 1 })), null);
  assert.equal(deserialize(JSON.stringify({ teams: [] })), null); // the old demo's save shape
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/transfers.js'` and `serialize` is not exported from `save.js`.

- [ ] **Step 3: Implement** — `src/transfers.js`

```js
import { value } from './player.js';
import { fixLineup } from './lineup.js';
import { myClub } from './season.js';

export const MIN_SQUAD = 16, MAX_SQUAD = 30, SELL_RATE = 0.8;

// Only the human club trades in Phase 1. AI transfers arrive in Phase 7.
export function buy(s, id) {
  const i = s.market.findIndex(p => p.id === id), club = myClub(s);
  if (i < 0) return 'Player not available.';
  if (club.players.length >= MAX_SQUAD) return `Squad is full (${MAX_SQUAD}).`;
  const cost = value(s.market[i]);
  if (cost > s.budget) return 'Not enough budget.';
  s.budget -= cost;
  club.players.push(...s.market.splice(i, 1));
  return null;
}

export function sell(s, id) {
  const club = myClub(s), i = club.players.findIndex(p => p.id === id);
  if (i < 0) return 'Not your player.';
  if (club.players.length <= MIN_SQUAD) return `You need at least ${MIN_SQUAD} players.`;
  const [p] = club.players.splice(i, 1);
  s.budget += Math.round(value(p) * SELL_RATE);
  s.market.push(p);
  fixLineup(s);
  return null;
}
```

- [ ] **Step 4: Implement** — replace `src/save.js` with

```js
// Bump when the shape of State changes, and add a migration in deserialize().
export const SAVE_VERSION = 1;
export const KEY = 'touchline.save';

export const serialize = state => JSON.stringify(state);

export function deserialize(text) {
  if (!text) return null;
  try {
    const s = JSON.parse(text);
    return s && typeof s === 'object' && s.version === SAVE_VERSION ? s : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/transfers.js src/save.js tests/transfers.test.js tests/save.test.js
git commit -m "feat: transfers and versioned saves"
```

---

### Task 6: Port the UI to the new engine and remove the demo

**Files:**
- Create: `src/ui/app.js`
- Modify: `index.html` — replace the two `<script>` elements at the bottom (the `<script src="game.js">` line and the whole inline `<script>…</script>` block after it) and add CSS rules
- Delete: `game.js`

**Interfaces:**
- Consumes: everything produced by Tasks 2–5, by the exact names listed there.
- Produces: the playable game. No exports.

- [ ] **Step 1: Add styles to `index.html`**

Inside the existing `<style>` block, before `</style>`, add:

```css
  .attrs { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:4px 16px; background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; margin:12px 0; }
  .attrs h3 { grid-column:1/-1; margin:8px 0 2px; font-size:13px; color:var(--dim); font-weight:500; }
  .attrs div { display:flex; justify-content:space-between; }
  .attrs b.hi { color:var(--accent); }
```

- [ ] **Step 2: Replace the scripts in `index.html`**

Delete `<script src="game.js"></script>` and the entire inline `<script>…</script>` that follows it. In their place put exactly:

```html
<script type="module" src="src/ui/app.js"></script>
```

- [ ] **Step 3: Create `src/ui/app.js`**

```js
import { POS, ATTRS, overall, value } from '../player.js';
import { createWorld } from '../world.js';
import { FORMATIONS, slots, bestXI, fixLineup, strength } from '../lineup.js';
import { takeClub, myClub, playRound, table, endSeason } from '../season.js';
import { buy, sell, MAX_SQUAD } from '../transfers.js';
import { KEY, serialize, deserialize } from '../save.js';

// The UI is the only place allowed to touch Date, localStorage and the DOM.
const newWorld = () => createWorld(Date.now() >>> 0);
const load = () => { try { return deserialize(localStorage.getItem(KEY)); } catch { return null; } };
const save = () => { try { localStorage.setItem(KEY, serialize(s)); } catch {} };

let s = load() || newWorld();
let tab = 'Squad', sel = null, viewing = null, tableDiv = 0, msg = '';

const $ = id => document.getElementById(id);
const money = n => '€' + (n / 1e6).toFixed(2) + 'M';
const byPos = list => [...list].sort((a, b) => POS.indexOf(a.pos) - POS.indexOf(b.pos) || overall(b) - overall(a));
const label = k => k.replace(/[A-Z]/g, c => ' ' + c.toLowerCase());
const HEAD = '<th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Ovr</th><th class="n">Value</th>';
const cells = p => `<td>${p.pos}</td><td class="n">${p.age}</td><td class="n">${overall(p)}</td><td class="n">${money(value(p))}</td>`;
const nameBtn = (p, act) => `<td><button class="link" data-act="${act}" data-id="${p.id}">${p.name}</button></td>`;

function profile() {
  const p = [...myClub(s).players, ...s.market].find(x => x.id === viewing);
  if (!p) return '';
  const group = ([title, keys]) => `<h3>${title}</h3>` + keys.map(k => `<div><span>${label(k)}</span><b class="${p.attrs[k] >= 15 ? 'hi' : ''}">${p.attrs[k]}</b></div>`).join('');
  return `<div class="attrs"><h3>${p.name} · ${p.pos} · age ${p.age} · overall ${overall(p)} · ${money(value(p))}
    <button data-act="close" style="float:right">Close</button></h3>${Object.entries(ATTRS).map(group).join('')}</div>`;
}

const views = {
  Squad() {
    fixLineup(s);
    const club = myClub(s), pos = slots(s.formation), st = strength(club, s.lineup, s.formation);
    const row = (p, slot) => `<tr class="${sel === p.id ? 'sel' : ''}"><td class="${slot && slot !== p.pos ? 'oop' : 'dim'}">${slot || 'Sub'}</td>${nameBtn(p, 'pick')}${cells(p)}<td><button data-act="view" data-id="${p.id}">Profile</button></td></tr>`;
    const bench = byPos(club.players.filter(p => !s.lineup.includes(p.id)));
    return `<div class="bar"><label>Formation <select data-act="formation">${Object.keys(FORMATIONS).map(f => `<option${f === s.formation ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
      <button data-act="auto">Auto-pick best XI</button><span class="dim">Attack ${st.att.toFixed(1)} · Defence ${st.def.toFixed(1)}</span></div>
      <p class="dim">Click two names to swap them. Orange slot = playing out of position.</p>
      <div class="wrap"><table><tr><th>Slot</th>${HEAD}<th></th></tr>${s.lineup.map((id, i) => row(club.players.find(p => p.id === id), pos[i])).join('')}
      <tr><th colspan="7">Bench</th></tr>${bench.map(p => row(p)).join('')}</table></div>`;
  },
  Match() {
    const name = id => s.clubs[id].name, d = myClub(s).div, total = s.divisions[d].fixtures.length;
    let h = '';
    if (s.done) h += `<h2>Season ${s.season} complete — you finished ${table(s, d).indexOf(s.me) + 1} in the ${s.divisions[d].name}.</h2><button class="primary" data-act="end">Start next season</button>`;
    else {
      const [a, b] = s.divisions[d].fixtures[s.round].find(f => f.includes(s.me));
      h += `<h2>Round ${s.round + 1} of ${total}</h2><p>${name(a)} v ${name(b)} <span class="dim">(${a === s.me ? 'home' : 'away'})</span></p><button class="primary" data-act="play">Play round</button>`;
    }
    if (s.last) {
      const mine = s.last[d].find(r => r.h === s.me || r.a === s.me);
      h += `<h2>Last round</h2><div class="score">${name(mine.h)} ${mine.hg} – ${mine.ag} ${name(mine.a)}</div>
        ${mine.ev.map(e => `<div>${e.min}' ⚽ ${e.name} <span class="dim">(${name(e.club)})</span></div>`).join('') || '<div class="dim">No goals.</div>'}
        <h2>Other results</h2>${s.last[d].filter(r => r !== mine).map(r => `<div>${name(r.h)} ${r.hg} – ${r.ag} ${name(r.a)}</div>`).join('')}`;
    }
    return h;
  },
  Table() {
    const cols = ['P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'];
    const row = (id, k) => { const t = s.clubs[id].st; return `<tr class="${id === s.me ? 'me' : ''}"><td class="n">${k + 1}</td><td>${s.clubs[id].name}</td>${[t.p, t.w, t.d, t.l, t.gf, t.ga, t.gf - t.ga, t.pts].map(v => `<td class="n">${v}</td>`).join('')}</tr>`; };
    return `<div class="bar">${s.divisions.map((d, i) => `<button data-act="div" data-id="${i}" class="${i === tableDiv ? 'on' : ''}">${d.name}</button>`).join('')}</div>
      <h2>Season ${s.season}</h2><div class="wrap"><table><tr><th class="n">#</th><th>Club</th>${cols.map(c => `<th class="n">${c}</th>`).join('')}</tr>${table(s, tableDiv).map(row).join('')}</table></div>
      ${s.history.length ? '<h2>History</h2>' + s.history.map(h => `<div>Season ${h.season}: ${h.champions[0]} won the ${s.divisions[0].name} — you finished ${h.pos} (prize ${money(h.prize)})</div>`).join('') : ''}`;
  },
  Transfers() {
    const list = (players, act, text) => `<div class="wrap"><table><tr>${HEAD}<th></th></tr>${byPos(players).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td><button data-act="${act}" data-id="${p.id}">${text}</button></td></tr>`).join('')}</table></div>`;
    return `<h2>Free agents</h2>${list(s.market, 'buy', 'Buy')}
      <h2>Your squad (${myClub(s).players.length}/${MAX_SQUAD}) <span class="dim">— sells for 80% of value</span></h2>${list(myClub(s).players, 'sell', 'Sell')}`;
  },
};

const actions = {
  start(id) { takeClub(s, id); tab = 'Squad'; tableDiv = s.clubs[id].div; },
  reset() { if (confirm('Abandon this career and start a new game?')) { s = newWorld(); sel = viewing = null; } },
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
    $('nav').innerHTML = '<button data-act="reset">Re-roll world</button>';
    $('main').innerHTML = s.divisions.map(d => `<h2>${d.name}</h2><div class="grid">${d.clubIds.map(id => `<button data-act="start" data-id="${id}">${s.clubs[id].name}</button>`).join('')}</div>`).join('');
    return;
  }
  $('info').textContent = `${myClub(s).name} · ${s.divisions[myClub(s).div].name} · Season ${s.season} · Budget ${money(s.budget)}`;
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

- [ ] **Step 4: Delete the demo engine**

```bash
git rm game.js
```

- [ ] **Step 5: Run the engine tests**

Run: `npm test`
Expected: all tests pass (nothing imported `game.js`).

- [ ] **Step 6: Check for banned globals in the engine**

Run:
```bash
grep -rnE "Math\.random|Date\.|document|window|localStorage" src --include=*.js --exclude-dir=ui
```
Expected: no output.

- [ ] **Step 7: Verify in the browser**

Start the preview server named `touchline` from `.claude/launch.json` (serves the project root on port 8127) and open `http://localhost:8127`. ES modules do not load from `file://`, so the server is required. Check each of these and confirm the browser console shows no errors:

1. The club picker shows three division headings with 16 club buttons each.
2. Choosing a Third Division club shows the Squad tab with 11 starters and 11 on the bench; the header shows the club, "Third Division", "Season 1" and a budget of €1.50M.
3. Clicking two names swaps them; changing formation re-picks the XI; "Profile" opens the attribute panel with four groups and "Close" hides it.
4. Match → "Play round" shows a score line for your club and seven other results.
5. Table shows 16 rows with your club highlighted; the three division buttons switch tables.
6. Transfers → "Buy" on an affordable player lowers the budget and shows "Signed."; "Sell" raises it and shows "Sold.".
7. Reload the page: the career is still there at the same round.
8. Play "Play round" until "Start next season" appears, click it: header shows "Season 2", Table shows a History line.
9. "New game" (after confirming) returns to the club picker with different club names.

- [ ] **Step 8: Commit**

```bash
git add index.html src/ui/app.js
git commit -m "feat: port UI to modular engine and remove demo script"
```

---

## Definition of done for Phase 1

- `npm test` passes with tests for rng, player, world, season, transfers and save.
- The grep in Task 6 Step 6 prints nothing.
- All nine browser checks in Task 6 Step 7 pass.
- `game.js` no longer exists.

## What Phase 1 deliberately leaves out

Each of these has a phase in `2026-11-15-touchline-roadmap.md`; do not start them here.

- Promotion and relegation, cups, a real calendar (Phase 4) — divisions are simulated side by side but clubs do not move between them yet.
- Minute-by-minute matches, cards, injuries, substitutions (Phase 2).
- Wages, contracts, AI transfers (Phases 6–7). Attributes of other clubs' players are fully visible until Phase 8.
