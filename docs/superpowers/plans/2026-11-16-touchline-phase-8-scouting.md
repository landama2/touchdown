# Touchline Phase 8 — Scouting & Knowledge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** You no longer see every player exactly:
- Premier League players and your own squad are fully known;
- everyone else (EFL squads, free agents) shows attribute and overall **ranges** that always hold the true value;
- scouts sent to watch a player, a club, a division or the free agents narrow the ranges, and what they learn fades slowly;
- a shortlist and a player search with filters replace browsing one club at a time.

**Architecture:**
- **`src/scouting.js` (new):** fog rules, knowledge and its fading, attribute and overall ranges (`ranges`, `estimate`), learning, scouts and their tasks, the shortlist, and the player search (`searchPlayers`). Pure; no RNG (range offsets come from a hash of the player id, so they never flicker).
- **`src/player.js`:** `valueAt(overall, age)` splits out of `value(p)`, so a value can be priced for an estimated overall.
- **`src/season.js`:** scouts work every day that passes; at the season end faded knowledge is pruned, retired players leave the shortlist, and the number of scouts follows your division.
- **Saves:** version 9.
- **UI:** the Transfers screen gets a player search with filters and shows estimates (overall, value, asking price, signing fee) for players you don't fully know. Profiles show attribute ranges. A new **Scouting** tab has the scouts and the shortlist, and scout reports arrive as news.
- **AI clubs are not fogged:** they keep using true values, so Phase 7's market and its calibration are untouched.

**Tech Stack:** Vanilla JavaScript ES modules, HTML/CSS, Node ≥ 22 built-in test runner. No npm dependencies. Local preview via the `touchline` server in `.claude/launch.json` (port 8127).

**Prototype:** every code block below was run on a copy of the repository at commit `b852be4` (2026-11-16). With all tasks applied, `npm test` passed 191 tests. A headless-browser run (search, shortlist, profile, sending scouts, two reports arriving as news) logged no errors.

## Global Constraints

- Node 22 or newer; no packages.
- Engine code must not reference `document`, `window`, `localStorage`, `Math.random` or `Date`. Scouting uses no randomness at all.
- State survives `JSON.parse(JSON.stringify(state))` unchanged.
- Determinism: same seed + same inputs = same career. Scouting never draws from the RNG, so seeded results are unchanged.
- Calibration (Phases 2–7) is unchanged: fog is only what the human sees. `valueAt` is a pure refactor of `value`.
- This is a private personal project: real names are used.
- Fun surprises rule: keep minor fun quirks, record them in `docs/fun-surprises.md`, mention them in the end-of-phase summary.
- Every task ends with `npm test` passing and a commit. Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Design decisions (made while planning, 2026-11-16)

Choices made by the owner while planning:
- **Who is hidden:** only lower-profile players. The Premier League is famous and fully known; EFL squads and free agents show ranges until scouted.
- **Scouts:** a fixed number by your division, sent on assignments (player, club, division, free agents); reports after some days. Phase 9 adds hiring and scout quality.
- **Fading:** knowledge fades slowly, so rescouting is worthwhile.
- **AI:** not fogged; AI clubs judge on true values.

**Fog** (`fogged(s, p, club)`):
- A player is fogged when he is a free agent, or at a club other than yours outside the top division.
- Fame follows the club's division at that moment. A club promoted to the Premier League becomes fully known; a relegated one goes foggy.
- Loaned-in players are at your club, so they are known.

**Knowledge** (`knowledge`, 0–100):
- 100 when not fogged.
- Otherwise from `s.known[id] = { k, at }`, fading by 100 every `FADE_DAYS` = 730 days.
- The clock counts 365 days a season (`clock(s) = (season − 1) × 365 + day`), so knowledge lasts about two seasons.
- Unscouted: 0.

**Ranges** (`ranges`, `estimate`):

| | Width at knowledge k | Unknown (k = 0) | After a division report (50) | After a club report (80) |
|---|---|---|---|---|
| Each attribute | `round(MAX_WIDTH × (1 − k/100))`, `MAX_WIDTH` = 3 | 3 | 2 | 1 |
| Overall | `round(OVR_WIDTH × (1 − k/100))`, `OVR_WIDTH` = 8 | 8 | 4 | 2 |

- Each range is placed by a stable offset hashed from the player id and the attribute, so it always holds the true value and doesn't reveal where in the range the truth sits.
- The overall has its own range because errors in single attributes partly cancel out. In the prototype, building it from the attribute extremes gave 15-point overall ranges and 6× value ranges, which was useless.
- Value is shown as `[valueAt(lo, age), valueAt(hi, age)]`: about 2.6× wide unknown.
- Prices on the Transfers screen move with value. The asking price and signing fee are shown scaled over the value range; the true price is charged.

**Scouts:**
- `SCOUTS` by your division: 3 · 2 · 2.
- `s.scouts = [{ task, days }]`, with `task` one of `{ kind: 'player', id }`, `{ kind: 'club', id }`, `{ kind: 'division', id }` or `{ kind: 'free' }`.

| Task | Days | Knowledge reached |
|------|------|-------------------|
| a player | 7 | 100 |
| a club | 14 | 80 |
| a division | 28 | 50 |
| the free agents | 7 | 80 |

- A report covers everyone the task covers **at that moment** (fogged players only) and is news (`type: 'scout'`).
- Learning never lowers knowledge.
- A new assignment replaces the old one; recalling makes the scout idle.
- Scouts work every day that passes in `playDay`, but not over the summer break.
- The number of scouts is set at `takeClub` and at every season start. Extra scouts are let go with their tasks.

**Shortlist:** `s.shortlist` = player ids, toggled with ☆ anywhere a player outside your club is listed. Players who retire drop off at the season end.

**Search** (`searchPlayers(s, filters, limit = 60)`):
- Covers every player outside your club, plus free agents.
- Filters: position, division (or free agents), club, maximum age, minimum overall, maximum value, listed, available on loan, and part of the name.
- Overall and value are judged on what you can tell: the top of the overall range, the bottom of the value range.
- Results are sorted by the middle of the overall estimate.

**Saves:** version 9. The migration adds `known: {}`, `shortlist: []` and idle scouts for your division.

**Known tells (kept on purpose, see Fun surprises):** some true values still leak, and a curious player can use them:
- a free agent's wage demand comes from his true overall;
- a refusal ("won't come") means he is a regular at his club;
- the Loan button appears only for non-regulars;
- a club's counter-offer reveals its asking price.

**Later phases:** Phase 9's scouts get attributes and wages. Their judging can scale `TASKS` days and levels and `MAX_WIDTH` / `OVR_WIDTH`, and hiring replaces `SCOUTS`.

## File map

| File | Change |
|------|--------|
| `src/scouting.js` | **new** |
| `src/player.js` | `valueAt(ovr, age)`; `value(p)` uses it |
| `src/world.js` | `known`, `scouts`, `shortlist` in a new world |
| `src/season.js` | scouts work daily; prune, shortlist clean-up and scout numbers at the season end; scouts at `takeClub` |
| `src/save.js` | version 9 |
| `src/ui/app.js` | search and estimates on Transfers, ranges in profiles, Scouting tab, scout news |
| `tests/scouting.test.js` | **new** |
| `tests/save.test.js` | v8 → v9 |
| `docs/fun-surprises.md`, roadmap | two new rows; phase marked done; Phase 9 note |

---

### Task 1: Knowledge, ranges, scouts and search (`src/scouting.js`)

**Files:**
- Create: `src/scouting.js`
- Modify: `src/player.js` (`valueAt`), `src/world.js` (state)
- Test: `tests/scouting.test.js`

**Interfaces:**
- Consumes: `ALL_ATTRS`, `overall` and the new `valueAt` from `src/player.js`; `loanable` from `src/market.js`.
- Produces (`src/scouting.js`):
  - constants `MAX_WIDTH`, `OVR_WIDTH`, `FADE_DAYS`, `YEAR`, `SCOUTS`, `TASKS`;
  - `clock`, `fogged`, `knowledge`, `ranges`, `estimate`, `learn`, `prune`;
  - `scoutCount`, `staffScouts`, `assign`, `recall`, `scoutDays`;
  - `toggleShortlist`, `searchPlayers`.

- [ ] **Step 1: Write the failing tests** — create `tests/scouting.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ATTRS, overall, value } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { takeClub, playDay, endSeason } from '../src/season.js';
import { MINI } from './fixtures/mini.js';
import { MAX_WIDTH, OVR_WIDTH, FADE_DAYS, YEAR, SCOUTS, TASKS, clock, fogged, knowledge, ranges, estimate, learn, prune, scoutCount, staffScouts,
  assign, recall, scoutDays, toggleShortlist, searchPlayers } from '../src/scouting.js';

// Managing Kilo (bottom division, club 14), with its scouts. Clubs 0-3 are the top division: famous, fully known.
const fresh = seed => { const s = createWorld(seed, MINI); takeClub(s, 14); staffScouts(s); return s; };
const width = r => Math.max(...Object.values(r).map(([lo, hi]) => hi - lo));

test('fog: your own players and the top division are known; the EFL and free agents are not', () => {
  const s = fresh(1), top = s.clubs[0], mid = s.clubs[4], me = s.clubs[14];
  assert.ok(!fogged(s, top.players[0], top) && !fogged(s, me.players[0], me));
  assert.ok(fogged(s, mid.players[0], mid) && fogged(s, s.market[0], null));
  assert.equal(knowledge(s, top.players[0], top), 100);
  assert.equal(knowledge(s, mid.players[0], mid), 0);
  const p = top.players[0];
  assert.deepEqual(estimate(s, p, top), { k: 100, ovr: [overall(p), overall(p)], value: [value(p), value(p)] });
});

test('ranges: always hold the true value, as wide as MAX_WIDTH unknown, exact when fully known, stable', () => {
  const s = fresh(2), c = s.clubs[5];
  for (const p of c.players) {
    const r = ranges(s, p, c);
    for (const k of ALL_ATTRS) assert.ok(r[k][0] <= p.attrs[k] && p.attrs[k] <= r[k][1] && r[k][0] >= 1 && r[k][1] <= 20, `${p.name} ${k}`);
    assert.ok(width(r) <= MAX_WIDTH && width(r) >= MAX_WIDTH - 1);
    assert.deepEqual(ranges(s, p, c), r);
    const e = estimate(s, p, c);
    assert.ok(e.ovr[0] <= overall(p) && overall(p) <= e.ovr[1] && e.value[0] <= value(p) && value(p) <= e.value[1]);
    assert.equal(e.ovr[1] - e.ovr[0], OVR_WIDTH);
  }
  const p = c.players[0];
  learn(s, [p.id], 50);
  assert.equal(width(ranges(s, p, c)), Math.round(MAX_WIDTH / 2));
  learn(s, [p.id], 100);
  assert.equal(width(ranges(s, p, c)), 0);
  assert.deepEqual(estimate(s, p, c).ovr, [overall(p), overall(p)]);
});

test('knowledge fades by 100 every FADE_DAYS; learning never lowers it; prune forgets the faded', () => {
  const s = fresh(3), c = s.clubs[6], [a, b] = c.players;
  learn(s, [a.id, b.id], 100);
  s.day += FADE_DAYS / 4;
  assert.equal(knowledge(s, a, c), 75);
  learn(s, [a.id], 50);
  assert.equal(knowledge(s, a, c), 75);
  assert.equal(clock(s), s.day);
  s.season += 2; // two seasons later (2 × YEAR days ≥ FADE_DAYS)
  assert.ok(2 * YEAR >= FADE_DAYS);
  assert.equal(knowledge(s, a, c), 0);
  prune(s);
  assert.deepEqual(s.known, {});
});

test('scouts: as many as your division allows, sent on tasks, reporting after the task\'s days', () => {
  const s = fresh(4);
  assert.equal(s.scouts.length, SCOUTS[2]);
  assert.equal(scoutCount(s), SCOUTS[2]);
  assert.equal(assign(s, 9, { kind: 'free' }), 'No such scout.');
  assert.equal(assign(s, 0, { kind: 'player', id: s.clubs[0].players[0].id }), 'You already know everything about him.');
  assert.equal(assign(s, 0, { kind: 'club', id: 14 }), 'Pick another club.');
  const target = s.clubs[4].players[0];
  assert.equal(assign(s, 0, { kind: 'player', id: target.id }), null);
  assert.equal(assign(s, 1, { kind: 'club', id: 5 }), null);
  assert.deepEqual(s.scouts.map(x => x.days), [TASKS.player.days, TASKS.club.days]);
  s.news = [];
  scoutDays(s, TASKS.player.days);
  assert.equal(knowledge(s, target, s.clubs[4]), 100);
  assert.deepEqual(s.news, [{ type: 'scout', club: 14, task: { kind: 'player', id: target.id }, n: 1 }]);
  assert.equal(s.scouts[0].task, null);
  scoutDays(s, TASKS.club.days - TASKS.player.days);
  assert.ok(s.clubs[5].players.every(p => knowledge(s, p, s.clubs[5]) === TASKS.club.level));
  assert.equal(s.news.at(-1).n, s.clubs[5].players.length);
  assign(s, 0, { kind: 'division', id: 1 }); recall(s, 0);
  assert.deepEqual(s.scouts[0], { task: null, days: 0 });
  s.clubs[14].div = 0; staffScouts(s);
  assert.equal(s.scouts.length, SCOUTS[0]);
});

test('search: filters on what you can tell, best estimate first; your own players never appear', () => {
  const s = fresh(6);
  const all = searchPlayers(s, {}, 1e4);
  assert.equal(all.length, s.clubs.reduce((t, c) => t + (c.id === 14 ? 0 : c.players.length), 0) + s.market.length);
  assert.ok(all.every(x => x.c?.id !== 14));
  const mids = all.map(x => x.est.ovr[0] + x.est.ovr[1]);
  assert.ok(mids.every((m, i) => i === 0 || mids[i - 1] >= m));
  assert.ok(searchPlayers(s, { pos: 'GK' }, 1e4).every(x => x.p.pos === 'GK'));
  assert.ok(searchPlayers(s, { div: 'free' }, 1e4).every(x => x.c === null));
  assert.ok(searchPlayers(s, { div: '1' }, 1e4).every(x => x.c?.div === 1));
  assert.ok(searchPlayers(s, { club: 4 }, 1e4).every(x => x.c?.id === 4));
  assert.ok(searchPlayers(s, { maxAge: 21, minOvr: 60 }, 1e4).every(x => x.p.age <= 21 && x.est.ovr[1] >= 60));
  assert.ok(searchPlayers(s, { maxValue: 1e6 }, 1e4).every(x => x.est.value[0] <= 1e6));
  const name = s.clubs[7].players[3].name;
  assert.ok(searchPlayers(s, { name: name.toUpperCase() }).some(x => x.p.name === name));
  assert.equal(searchPlayers(s, {}, 5).length, 5);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/scouting.test.js` — Expected: FAIL with `Cannot find module '.../src/scouting.js'`.

- [ ] **Step 3: `valueAt` in `src/player.js`** — replace the `value` function with:

```js
export function valueAt(ovr, age) {
  const ageFactor = age < 24 ? 1.3 : age > 30 ? 0.6 : 1;
  return Math.max(10e3, Math.round(VALUE.at50 * Math.exp(VALUE.growth * (ovr - 50)) * ageFactor / 1e4) * 1e4);
}
export const value = p => valueAt(overall(p), p.age);
```

- [ ] **Step 4: Create `src/scouting.js`**

```js
import { ALL_ATTRS, overall, valueAt } from './player.js';
import { loanable } from './market.js';

// What the human club knows about other players. Premier League players are famous and fully known;
// so is everyone at your own club. Everyone else (EFL squads, free agents) shows each attribute as a
// range up to MAX_WIDTH points wide, and the overall as a range up to OVR_WIDTH wide; both always
// hold the true value. Scout reports raise knowledge
// (0-100) and narrow the ranges; knowledge fades by 100 every FADE_DAYS. Knowledge lives in
// s.known = { [playerId]: { k, at } } (k at clock time `at`). AI clubs always see the truth.
// Scouts: s.scouts = [{ task: null | { kind, id }, days }], SCOUTS[division] of them.
export const MAX_WIDTH = 3, OVR_WIDTH = 8, FADE_DAYS = 730, YEAR = 365;
export const SCOUTS = [3, 2, 2];                 // by the human club's division (lower divisions use the last)
export const TASKS = {                          // days to report, knowledge reached for everyone covered
  player: { days: 7, level: 100 },
  club: { days: 14, level: 80 },
  division: { days: 28, level: 50 },
  free: { days: 7, level: 80 },                 // the free-agent list
};

// Days since the first day of the career (a season counts YEAR days).
export const clock = s => (s.season - 1) * YEAR + Math.max(0, s.day);
// club: the player's club, or null for a free agent.
export const fogged = (s, p, club) => !club ? true : club.id !== s.me && club.div > 0;

export function knowledge(s, p, club) {
  if (!fogged(s, p, club)) return 100;
  const e = s.known[p.id];
  return e ? Math.max(0, Math.round(e.k - 100 * (clock(s) - e.at) / FADE_DAYS)) : 0;
}

// A stable pseudo-random offset 0..w for player id and attribute index i (no RNG: ranges don't flicker).
const offset = (id, i, w) => (((id * 2654435761) ^ (i * 40503)) >>> 0) % (w + 1);
// { attr: [lo, hi] }, both ends 1-20; lo <= true <= hi.
export function ranges(s, p, club) {
  const w = Math.round(MAX_WIDTH * (1 - knowledge(s, p, club) / 100));
  return Object.fromEntries(ALL_ATTRS.map((k, i) => {
    const lo = Math.max(1, p.attrs[k] - offset(p.id, i, w));
    return [k, [lo, Math.min(20, lo + w)]];
  }));
}
// What you can tell about p: knowledge, overall as [lo, hi] (its own range: errors in single
// attributes partly cancel out), and value as [lo, hi] at those overalls (exact when lo === hi).
export function estimate(s, p, club) {
  const k = knowledge(s, p, club), w = Math.round(OVR_WIDTH * (1 - k / 100)), o = overall(p);
  const lo = Math.max(0, o - offset(p.id, ALL_ATTRS.length, w)), hi = lo + w;
  return { k, ovr: [lo, hi], value: [valueAt(lo, p.age), valueAt(hi, p.age)] };
}

// Raises knowledge of the players with these ids to `level` now (fading knowledge first).
export function learn(s, ids, level) {
  const now = clock(s);
  for (const id of ids) {
    const e = s.known[id], k = e ? Math.max(0, e.k - 100 * (now - e.at) / FADE_DAYS) : 0;
    s.known[id] = { k: Math.max(level, Math.round(k)), at: now };
  }
}
// End of season: forget what has faded away.
export function prune(s) {
  const now = clock(s);
  for (const id in s.known) if (s.known[id].k - 100 * (now - s.known[id].at) / FADE_DAYS <= 0) delete s.known[id];
}

export const scoutCount = s => SCOUTS[Math.min(s.clubs[s.me].div, SCOUTS.length - 1)];
// Keeps the human club's scouts at its division's number (a scout let go loses his task).
export function staffScouts(s) {
  const n = s.me === null ? 0 : scoutCount(s);
  s.scouts = s.scouts.slice(0, n);
  while (s.scouts.length < n) s.scouts.push({ task: null, days: 0 });
}

// Who a task covers now: player ids (only those you can't see fully).
function covered(s, task) {
  const outside = c => c.players.filter(p => fogged(s, p, c)).map(p => p.id);
  if (task.kind === 'player') return [task.id];
  if (task.kind === 'club') return outside(s.clubs[task.id]);
  if (task.kind === 'division') return s.divisions[task.id].clubIds.flatMap(id => outside(s.clubs[id]));
  return s.market.map(p => p.id);
}
const where = (s, id) => s.clubs.find(c => c.players.some(p => p.id === id)) ?? (s.market.some(p => p.id === id) ? null : undefined);

// Sends scout k on a task ({ kind: 'player', id } | { kind: 'club', id } | { kind: 'division', id } |
// { kind: 'free' }), replacing what he was doing. Error message or null.
export function assign(s, k, task) {
  const scout = s.scouts[k];
  if (!scout) return 'No such scout.';
  if (!TASKS[task.kind]) return 'Unknown task.';
  if (task.kind === 'player') {
    const c = where(s, task.id);
    if (c === undefined) return 'Player not found.';
    if (!fogged(s, { id: task.id }, c)) return 'You already know everything about him.';
  }
  if (task.kind === 'club' && (!s.clubs[task.id] || task.id === s.me)) return 'Pick another club.';
  if (task.kind === 'division' && !s.divisions[task.id]) return 'No such division.';
  scout.task = { ...task }; scout.days = TASKS[task.kind].days;
  return null;
}
export const recall = (s, k) => { if (s.scouts[k]) { s.scouts[k].task = null; s.scouts[k].days = 0; } };

// `days` days of scouting. A scout who finishes reports: everyone his task covers is learnt to the
// task's level, and the report goes into s.news. The scout is then free.
export function scoutDays(s, days) {
  if (days <= 0 || s.me === null) return;
  for (const sc of s.scouts) {
    if (!sc.task || (sc.days -= days) > 0) continue;
    const ids = covered(s, sc.task);
    learn(s, ids, TASKS[sc.task.kind].level);
    s.news.push({ type: 'scout', club: s.me, task: sc.task, n: ids.length });
    sc.task = null; sc.days = 0;
  }
}

// Adds player id to the shortlist (s.shortlist, player ids), or takes him off it.
export function toggleShortlist(s, id) {
  s.shortlist = s.shortlist.includes(id) ? s.shortlist.filter(x => x !== id) : [...s.shortlist, id];
}

// Every player outside your club, as [{ p, c (club, or null for a free agent), est }]: those
// matching the filters (all optional: pos; div — a division number or 'free'; club — a club id;
// maxAge; minOvr and maxValue, judged on what you can tell (the top of the overall range, the bottom
// of the value range); listed — on a transfer list; loan — available on loan; name — part of the
// name, any case), best estimated overall first, at most `limit`.
export function searchPlayers(s, f = {}, limit = 60) {
  const pool = [...s.clubs.filter(c => c.id !== s.me).flatMap(c => c.players.map(p => ({ p, c }))), ...s.market.map(p => ({ p, c: null }))];
  const name = (f.name ?? '').trim().toLowerCase(), out = [];
  for (const { p, c } of pool) {
    if (f.pos && p.pos !== f.pos) continue;
    if (f.div === 'free' ? c : f.div != null && f.div !== '' && (!c || c.div !== +f.div)) continue;
    if (f.club != null && f.club !== '' && c?.id !== +f.club) continue;
    if (f.maxAge && p.age > f.maxAge) continue;
    if (f.listed && p.listed !== 'sale') continue;
    if (f.loan && (!c || !loanable(s, c, p))) continue;
    if (name && !p.name.toLowerCase().includes(name)) continue;
    const est = estimate(s, p, c);
    if (f.minOvr && est.ovr[1] < f.minOvr) continue;
    if (f.maxValue && est.value[0] > f.maxValue) continue;
    out.push({ p, c, est });
  }
  const mid = x => x.est.ovr[0] + x.est.ovr[1];
  return out.sort((a, b) => mid(b) - mid(a) || a.p.id - b.p.id).slice(0, limit);
}
```

- [ ] **Step 5: New state in `src/world.js`** — in the `createWorld` state literal, after `deals: [],` add `known: {}, scouts: [], shortlist: [],`.

- [ ] **Step 6: Run the tests**

Run: `node --test tests/scouting.test.js` — Expected: PASS (5 tests).
Run: `npm test` — Expected: all pass. `value()` gives the same numbers as before.

- [ ] **Step 7: Commit**

```bash
git add src/scouting.js src/player.js src/world.js tests/scouting.test.js
git commit -m "feat: scouting knowledge: fog outside the Premier League, ranges, scouts, shortlist and player search"
```

---

### Task 2: Scouting in the season

**Files:**
- Modify: `src/season.js`
- Test: `tests/scouting.test.js`

**Interfaces:**
- Consumes: `scoutDays`, `staffScouts`, `prune` from `src/scouting.js`.
- Produces:
  - `takeClub` gives you your division's scouts;
  - `playDay` runs `scoutDays` for the days since the last match day;
  - `endSeason` prunes faded knowledge, drops retired players from the shortlist and re-staffs the scouts.

- [ ] **Step 1: Write the failing tests** — append to `tests/scouting.test.js`:

```js
test('scouts work as the days pass in the season; a free-agent report covers the list', () => {
  const s = fresh(5);
  assert.equal(assign(s, 0, { kind: 'free' }), null);
  let news = [];
  while (s.scouts[0].task) { playDay(s); news.push(...s.news.filter(n => n.type === 'scout')); }
  assert.equal(news.length, 1);
  assert.ok(s.day >= TASKS.free.days - 1);
  assert.ok(news[0].n > 0 && Object.keys(s.known).length === news[0].n);
  assert.ok(Object.values(s.known).every(e => e.k === TASKS.free.level)); // free agents signed or released later that day aside
});

test('the shortlist: toggled on and off; retired players drop off at the end of the season; scouts follow your division', () => {
  const s = fresh(7), p = s.clubs[4].players[0], old = s.clubs[5].players[0];
  toggleShortlist(s, p.id); toggleShortlist(s, old.id);
  assert.deepEqual(s.shortlist, [p.id, old.id]);
  toggleShortlist(s, p.id);
  assert.deepEqual(s.shortlist, [old.id]);
  old.age = 35;
  while (!s.done) playDay(s);
  endSeason(s);
  assert.deepEqual(s.shortlist, []);
  assert.equal(s.scouts.length, scoutCount(s));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/scouting.test.js` — Expected: the two new tests FAIL (reports never arrive during the season; retired players stay on the shortlist).

- [ ] **Step 3: Change `src/season.js`**

1. Imports — add:

   ```js
   import { scoutDays, staffScouts, prune } from './scouting.js';
   ```

2. `takeClub`: after `s.offers = [];` add:

   ```js
     s.scouts = []; staffScouts(s);
   ```

3. `playDay`: directly before `s.day = today.day;` add:

   ```js
     scoutDays(s, today.day - s.day); // scouts work every day up to this one
   ```

4. `endSeason`: replace the last line `if (s.me !== null) { seasonBudgets(s); fixLineup(s); }` with:

   ```js
     prune(s);
     const exists = new Set([...s.clubs.flatMap(c => c.players), ...s.market].map(p => p.id));
     s.shortlist = s.shortlist.filter(id => exists.has(id)); // retired players drop off
     if (s.me !== null) { seasonBudgets(s); staffScouts(s); fixLineup(s); }
   ```

   Extend the comment above `playDay` with: "Scouts work every day that passes (src/scouting.js)."

- [ ] **Step 4: Run the tests**

Run: `npm test` — Expected: all pass, twice with the same results.

- [ ] **Step 5: Commit**

```bash
git add src/season.js tests/scouting.test.js
git commit -m "feat: scouts work through the season; knowledge fades and the shortlist tidies itself"
```

---

### Task 3: Save version 9

**Files:**
- Modify: `src/save.js`
- Test: `tests/save.test.js`

- [ ] **Step 1: Write the failing tests** — append to `tests/save.test.js`:

```js
// A save as Phase 7 (version 8) wrote it: no scouting.
function asV8(s) {
  const o = JSON.parse(serialize(s));
  o.version = 8;
  delete o.known; delete o.scouts; delete o.shortlist;
  return o;
}

test('a version 8 save gets scouts and an empty notebook, and plays on', () => {
  const a = createWorld(26, MINI);
  takeClub(a, 14);
  playDay(a);
  const b = deserialize(JSON.stringify(asV8(a)));
  assert.equal(b.version, SAVE_VERSION);
  assert.deepEqual([b.known, b.shortlist], [{}, []]);
  assert.deepEqual(b.scouts, a.scouts.map(() => ({ task: null, days: 0 })));
  assert.ok(b.scouts.length > 0 && playDay(b).length);
});
```

In 'deserialize returns null for missing, corrupt or wrong-version saves', after the `// market missing` line, add:

```js
  assert.equal(deserialize(serialize({ ...createWorld(1, MINI), known: undefined })), null); // scouting missing
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/save.test.js` — Expected: the new test FAILS.

- [ ] **Step 3: Change `src/save.js`**
  - Add `import { staffScouts } from './scouting.js';`.
  - Change `SAVE_VERSION` to 9, and append `. 9: scouting, shortlist` to its comment.
  - Add to the end of `valid`'s expression:

```js
  && !!s.known && typeof s.known === 'object' && Array.isArray(s.scouts) && Array.isArray(s.shortlist)
```

  - Add to `MIGRATIONS`:

```js
  8: s => { s.known = {}; s.shortlist = []; s.scouts = []; staffScouts(s); }, // scouts start with nothing known
```

- [ ] **Step 4: Run the tests** — `npm test`: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/save.js tests/save.test.js
git commit -m "feat: save version 9 with scouts, knowledge and the shortlist"
```

---

### Task 4: Interface — search, estimates, Scouting tab

**Files:**
- Modify: `src/ui/app.js`

**Interfaces:**
- Consumes: `TASKS`, `estimate`, `ranges`, `assign`, `recall`, `toggleShortlist`, `searchPlayers`.
- Produces:
  - the `filters` UI state, replacing `browse`;
  - helpers `clubOfPlayer`, `allPlayers`, `span`, `moneySpan`, `scale`, `estCells`, `EST_HEAD`, `clubCell`, `star`, `taskText`;
  - the `scout` news line;
  - fogged profiles;
  - the Transfers screen with Find players, and estimates in the transfer list and free agents;
  - the `Scouting` view;
  - actions `browse` (now sets the club filter), `search`, `clearSearch`, `shortlist`, `assign`, `scoutPlayer`.

- [ ] **Step 1: Apply the change** — the full change to `src/ui/app.js`, as a patch against the file after Phase 7. Save it to a file and run `git apply`, or make the same edits by hand:

```diff
diff --git a/src/ui/app.js b/src/ui/app.js
index 3437bae..49ea914 100644
--- a/src/ui/app.js
+++ b/src/ui/app.js
@@ -12,6 +12,7 @@ import { line } from './commentary.js';
 import { buy, sell, bid, acceptCounter, talksOn, loanIn, setListing, acceptOffer, rejectOffer, counterOffer, MAX_SQUAD } from '../transfers.js';
 import { SUMMER_END, JANUARY, QUICK_SALE, inWindow, windowOpen, justJoined, asking, signingFee, refusal, loanable, loanPay } from '../market.js';
 import { KEY, serialize, deserialize } from '../save.js';
+import { TASKS, estimate, ranges, assign, recall, toggleShortlist, searchPlayers } from '../scouting.js';
 import { wageBill, projection } from '../finance.js';
 import { terms, canRenew, renew as renewContract } from '../contracts.js';
 import { crestSvg, kitSvg } from './art.js';
@@ -22,7 +23,7 @@ const load = () => { try { return deserialize(localStorage.getItem(KEY)); } catc
 const save = () => { try { localStorage.setItem(KEY, serialize(s)); } catch {} };
 
 let s = load() || newWorld();
-let tab = 'Squad', sel = null, viewing = null, tableDiv = s.me === null ? 0 : s.clubs[s.me].div, msg = '', browse = null; // browse: the club shown on Transfers
+let tab = 'Squad', sel = null, viewing = null, tableDiv = s.me === null ? 0 : s.clubs[s.me].div, msg = '', filters = {}; // filters: the player search on Transfers
 let timer = null, speed = 400, subOut = null; // live match: clock, ms per match minute, player picked to come off
 const SPEEDS = [['Slow', 1000], ['Normal', 400], ['Fast', 100], ['Very fast', 25]];
 
@@ -52,6 +53,7 @@ const NEWS = {
   offer: n => `💶 ${clubName(n.from)} bid ${money(n.fee)} for ${esc(n.name)} (see Transfers).`,
   clause: n => `💶 ${clubName(n.to)} paid ${esc(n.name)}'s ${money(n.fee)} release clause: he has gone.`,
   loan: n => `🔁 ${esc(n.name)} joins ${clubName(n.to)} on loan.`,
+  scout: n => `🔎 Scout report on ${taskText(n.task)}: ${n.n} player${n.n === 1 ? '' : 's'} (see Scouting).`,
 };
 const newsText = () => s.news.map(n => NEWS[n.type](n)).join('<br>');
 
@@ -61,6 +63,21 @@ const dealText = d => `${esc(d.name)} ${d.from === null ? 'from the free-agent l
 const windowText = () => s.done ? `Summer window open until ${dateLabel(SUMMER_END - 1)}` : inWindow(s.day) ? `${s.day < SUMMER_END ? 'Summer' : 'January'} window open until ${dateLabel(s.day < SUMMER_END ? SUMMER_END - 1 : JANUARY[1])}`
   : `Window closed: the ${s.day < JANUARY[0] ? `January window opens ${dateLabel(JANUARY[0])}` : 'summer window opens when the season ends'}`;
 const feeOf = id => Math.round(+$(`fee-${id}`).value * 1e6);
+// Where a player is: his club, or null on the free-agent list.
+const clubOfPlayer = p => s.clubs.find(c => c.players.includes(p)) ?? null;
+const allPlayers = () => [...s.clubs.flatMap(c => c.players), ...s.market];
+// A [lo, hi] estimate as text: one number when known exactly.
+const span = ([lo, hi], f = String) => lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`;
+const moneySpan = ([lo, hi]) => lo === hi ? money(lo) : `€${(lo / 1e6).toFixed(2)}–${(hi / 1e6).toFixed(2)}M`;
+const scale = (x, [lo, hi], v) => [lo, hi].map(e => Math.round(x * e / v / 1e4) * 1e4); // a price that moves with value, over the value estimate
+// Cells for a player you may not know fully: position, age, overall and value as estimates, knowledge.
+const estCells = (p, e) => `<td>${p.pos}</td><td class="n">${p.age}</td><td class="n">${span(e.ovr)}</td><td class="n">${moneySpan(e.value)}</td><td class="n dim">${e.k}%</td>`;
+const EST_HEAD = '<th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Ovr</th><th class="n">Value</th><th class="n">Known</th>';
+// A club in a narrow column: badge and three-letter code (full name on hover).
+const clubCell = c => c ? `<span title="${esc(c.name)}">${badge(c.id, 16)} ${esc(c.short)}</span>` : '<span class="dim">free</span>';
+const star = id => `<button class="link" data-act="shortlist" data-id="${id}" title="shortlist" aria-label="shortlist">${s.shortlist.includes(id) ? '★' : '☆'}</button>`;
+const taskText = t => t.kind === 'free' ? 'the free agents' : t.kind === 'division' ? esc(s.divisions[t.id].name) : t.kind === 'club' ? clubName(t.id)
+  : esc(allPlayers().find(p => p.id === t.id)?.name ?? 'a player who has gone');
 const options = (pairs, current) => pairs.map(([v, text]) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(text)}</option>`).join('');
 const fieldSelect = (act, field, pairs, current, id = '') => `<select data-act="${act}" data-field="${field}"${id === '' ? '' : ` data-id="${id}"`}>${options(pairs, current)}</select>`;
 const levels = key => TEAM[key].map((text, k) => [k - (TEAM[key].length >> 1), text]);
@@ -133,10 +150,13 @@ const knockout = rounds => rounds.map(([title, ties]) => `<h3>${esc(title)}</h3>
   <td class="dim">${t.pens ? `${t.pens[0]}–${t.pens[1]} pens` : t.legs.length > 1 ? 'agg.' : ''}</td></tr>`).join('')}</table></div>`).join('');
 
 function profile() {
-  const p = [...s.clubs.flatMap(c => c.players), ...s.market].find(x => x.id === viewing);
+  const p = allPlayers().find(x => x.id === viewing);
   if (!p) return '';
-  const group = ([title, keys]) => `<h3>${title}</h3>` + keys.map(k => `<div><span>${label(k)}</span><b class="${p.attrs[k] >= 15 ? 'hi' : ''}">${p.attrs[k]}</b></div>`).join('');
-  return `<div class="attrs"><h3>${esc(p.name)} · ${p.pos} · age ${p.age} · overall ${overall(p)} · ${money(value(p))}
+  const c = clubOfPlayer(p), e = estimate(s, p, c), r = e.k < 100 ? ranges(s, p, c) : null;
+  const shown = k => r ? span(r[k]) : p.attrs[k], high = k => (r ? r[k][0] : p.attrs[k]) >= 15;
+  const group = ([title, keys]) => `<h3>${title}</h3>` + keys.map(k => `<div><span>${label(k)}</span><b class="${high(k) ? 'hi' : ''}">${shown(k)}</b></div>`).join('');
+  const known = e.k < 100 ? ` · <span class="dim">known ${e.k}%</span> ${e.ovr[0] < e.ovr[1] && s.scouts.some(x => !x.task) ? `<button data-act="scoutPlayer" data-id="${p.id}">Scout him</button>` : ''}` : '';
+  return `<div class="attrs"><h3>${c?.id === s.me ? '' : star(p.id) + ' '}${esc(p.name)} · ${p.pos} · age ${p.age} · ${c ? clubName(c.id) : 'free agent'} · overall ${span(e.ovr)} · ${moneySpan(e.value)}${known}
     <button data-act="close" style="float:right">Close</button></h3>
     <p>Condition ${p.cond}% · sharpness ${Math.round(p.sharp)}% · morale ${moraleLabel(p.morale)} · form ${formAvg(p) ?? '–'} · ${p.yc} league yellow${p.yc === 1 ? '' : 's'}${status(p) ? ` · <span class="oop">${status(p)}</span>` : ''}${p.contract ? ` · contract ${perWeek(p.contract.wage)} until season ${p.contract.until}${p.contract.clause ? `, release clause ${money(p.contract.clause)}` : ''}` : ''}</p>${Object.entries(ATTRS).map(group).join('')}</div>`;
 }
@@ -251,29 +271,40 @@ const views = {
     const table = (head, rows) => rows.length ? `<div class="wrap"><table><tr>${head}</tr>${rows.join('')}</table></div>` : '<p class="dim">None.</p>';
     const offers = s.offers.map(o => [o, me.players.find(p => p.id === o.id)]).filter(([, p]) => p).map(([o, p]) => `<tr>${nameBtn(p, 'view')}${cells(p)}<td>${clubName(o.club)}</td><td class="n">${money(o.fee)}</td>
       <td><button data-act="acceptOffer" data-id="${p.id}">Accept</button> <button data-act="rejectOffer" data-id="${p.id}">Reject</button> ${feeBox(p.id, o.fee * 1.2)} <button data-act="counterOffer" data-id="${p.id}">Ask for</button></td></tr>`);
-    const c = browse === null ? null : s.clubs[browse];
-    const theirs = !c ? [] : byPos(c.players).map(p => {
-      const t = talksOn(s, p.id), why = p.loan ? `on loan from ${clubName(p.loan.from)}` : justJoined(s, p) ? 'just joined' : refusal(c, me, p);
-      const deal = why ? `<span class="dim">${why}</span>` : `${feeBox(p.id, t?.counter ?? asking(s, c, p))} <button data-act="bid" data-id="${p.id}">Bid</button>${t?.counter ? ` <button data-act="counter" data-id="${p.id}">Pay ${money(t.counter)}</button>` : ''}${loanable(s, c, p) ? ` <button data-act="loan" data-id="${p.id}">Loan (${perWeek(loanPay(p.contract.wage))})</button>` : ''}`;
-      return `<tr>${nameBtn(p, 'view')}${cells(p)}<td class="n">${money(asking(s, c, p))}</td><td>${untilText(p)}</td><td>${deal}</td></tr>`;
-    });
-    const listed = s.clubs.filter(x => x !== me).flatMap(x => x.players.filter(p => p.listed === 'sale').map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td><button class="link" data-act="browse" data-id="${x.id}">${clubName(x.id)}</button></td><td class="n">${money(asking(s, x, p))}</td></tr>`));
+    const askSpan = (p, c, e) => scale(asking(s, c, p), e.value, value(p));
+    const deal = (p, c, e) => {
+      if (!c) return `<button data-act="buy" data-id="${p.id}">Sign</button>`;
+      const t = talksOn(s, p.id), why = !open ? '' : p.loan ? `on loan from ${clubName(p.loan.from)}` : justJoined(s, p) ? 'just joined' : refusal(c, me, p);
+      if (!open || why) return `<span class="dim" title="${esc(why)}">${why.includes("won't") ? "won't come" : why}</span>`;
+      const a = askSpan(p, c, e);
+      return `${feeBox(p.id, t?.counter ?? Math.round((a[0] + a[1]) / 2e4) * 1e4)} <button data-act="bid" data-id="${p.id}">Bid</button>${t?.counter ? ` <button data-act="counter" data-id="${p.id}">Pay ${money(t.counter)}</button>` : ''}${loanable(s, c, p) ? ` <button data-act="loan" data-id="${p.id}">Loan (${perWeek(loanPay(p.contract.wage))})</button>` : ''}`;
+    };
+    const found = searchPlayers(s, filters).map(({ p, c, est: e }) => `<tr><td>${star(p.id)}</td>${nameBtn(p, 'view')}<td>${clubCell(c)}</td>${estCells(p, e)}
+      <td class="n">${c ? moneySpan(askSpan(p, c, e)) : moneySpan(scale(signingFee(p), e.value, value(p)))}</td><td>${deal(p, c, e)}</td></tr>`);
+    const listed = s.clubs.filter(x => x !== me).flatMap(x => x.players.filter(p => p.listed === 'sale').map(p => { const e = estimate(s, p, x); return `<tr>${nameBtn(p, 'view')}${estCells(p, e)}<td><button class="link" data-act="browse" data-id="${x.id}">${clubName(x.id)}</button></td><td class="n">${moneySpan(askSpan(p, x, e))}</td></tr>`; }));
     const listing = p => `<select data-act="listing" data-id="${p.id}">${options([['', 'Not listed'], ['sale', 'For sale'], ...(p.age <= 23 ? [['loan', 'For loan']] : [])], p.listed ?? '')}</select>`;
     const mine = byPos(me.players).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td>${p.loan ? `<span class="dim">on loan from ${clubName(p.loan.from)}</span>` : listing(p)}</td>
       <td>${p.loan || justJoined(s, p) ? '' : `<button data-act="sell" data-id="${p.id}">Quick sale ${money(Math.round(QUICK_SALE * value(p) / 1e4) * 1e4)}</button>`}</td></tr>`);
     const away = s.clubs.flatMap(x => x.players.filter(p => p.loan?.from === s.me).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td>at ${clubName(x.id)} until the end of season ${p.loan.until}</td></tr>`));
-    const free = byPos(s.market).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td class="n">${money(signingFee(p))}</td><td class="dim">${termsText(terms(s, p))}</td><td><button data-act="buy" data-id="${p.id}">Sign</button></td></tr>`);
+    const free = byPos(s.market).map(p => { const e = estimate(s, p, null); return `<tr><td>${star(p.id)}</td>${nameBtn(p, 'view')}${estCells(p, e)}<td class="n">${moneySpan(scale(signingFee(p), e.value, value(p)))}</td><td class="dim">${termsText(terms(s, p))}</td><td><button data-act="buy" data-id="${p.id}">Sign</button></td></tr>`; });
     const biggest = s.deals.filter(d => !d.loan && d.from !== null && d.to !== null).sort((a, b) => b.fee - a.fee).slice(0, 10).map(d => `<div>${dealText(d)}</div>`).join('');
-    const clubOptions = s.divisions.map(d => `<optgroup label="${esc(d.name)}">${d.clubIds.filter(id => id !== s.me).map(id => `<option value="${id}"${id === browse ? ' selected' : ''}>${clubName(id)}</option>`).join('')}</optgroup>`).join('');
+    const f = filters, pick = (id, pairs, v) => `<select id="${id}">${options(pairs, v ?? '')}</select>`;
+    const divPairs = [['', 'Any division'], ...s.divisions.map((d, i) => [String(i), d.name]), ['free', 'Free agents']];
+    const clubPairs = [['', 'Any club'], ...s.clubs.filter(c => c.id !== s.me).map(c => [String(c.id), c.name])];
+    const num = (id, v, label, w = 5) => `<label>${label} <input type="number" id="${id}" min="0" value="${v ?? ''}" style="width:${w}em"></label>`;
+    const search = `<div class="bar">${pick('f-pos', [['', 'Any position'], ...POS.map(x => [x, x])], f.pos)}${pick('f-div', divPairs, f.div)}${pick('f-club', clubPairs, f.club)}
+      ${num('f-age', f.maxAge, 'Age ≤')}${num('f-ovr', f.minOvr, 'Ovr ≥')}${num('f-val', f.maxValue ? f.maxValue / 1e6 : '', 'Value ≤ €M')}
+      <label><input type="checkbox" id="f-listed"${f.listed ? ' checked' : ''}> listed</label><label><input type="checkbox" id="f-loan"${f.loan ? ' checked' : ''}> loan</label>
+      <input type="text" id="f-name" placeholder="name" value="${esc(f.name ?? '')}" style="width:9em"><button class="primary" data-act="search">Search</button> <button data-act="clearSearch">Clear</button></div>`;
     return `<p><b>${windowText()}</b> · transfer budget ${money(s.budget)} · wage bill ${perWeek(wageBill(me))} of ${perWeek(s.wageBudget)}</p>
       <p class="dim">Bid for players at other clubs while a window is open: a club takes ${Math.round(0.9 * 100)}% of its asking price or counters, and talks stop after three rounds. Players under 24 who are not regulars can come on loan for half their wage. Free agents sign at any time for a signing-on fee of half their value.</p>
       <h2>Offers for your players</h2>${table(`${HEAD}<th>From</th><th class="n">Fee</th><th></th>`, offers)}
-      <h2>Other clubs</h2><p><select data-act="browse"><option value="">Pick a club…</option>${clubOptions}</select></p>
-      ${c ? `<h3>${badge(c.id)} ${clubName(c.id)} <span class="dim">· balance ${money(c.fin.balance)}</span></h3>${table(`${HEAD}<th class="n">Asking</th><th>Contract</th><th>${open ? 'Deal' : 'Window closed'}</th>`, theirs)}` : ''}
-      <h2>Transfer list</h2><p class="dim">Clubs in debt put their best-paid players up for sale, cheaper.</p>${table(`${HEAD}<th>Club</th><th class="n">Asking</th>`, listed)}
+      <h2>Find players</h2><p class="dim">Premier League players are well known. Elsewhere you see estimates until your scouts report (Scouting); ☆ adds a player to your shortlist. Best 60 shown.</p>${search}
+      ${table(`<th></th><th>Name</th><th>Club</th>${EST_HEAD.replace('<th>Name</th>', '')}<th class="n">Price</th><th>${open ? 'Deal' : 'Window closed: free agents only'}</th>`, found)}
+      <h2>Transfer list</h2><p class="dim">Clubs in debt put their best-paid players up for sale, cheaper.</p>${table(`${EST_HEAD}<th>Club</th><th class="n">Asking</th>`, listed)}
       <h2>Your squad (${me.players.length}/${MAX_SQUAD})</h2><p class="dim">List a player and clubs bid for him during a window. A quick sale gets ${QUICK_SALE * 100}% of his value at once.</p>${table(`${HEAD}<th>Listing</th><th></th>`, mine)}
       <h2>Out on loan</h2>${table(`${HEAD}<th></th>`, away)}
-      <h2>Free agents</h2>${table(`${HEAD}<th class="n">Signing fee</th><th>Asks</th><th></th>`, free)}
+      <h2>Free agents</h2>${table(`<th></th>${EST_HEAD}<th class="n">Signing fee</th><th>Asks</th><th></th>`, free)}
       <h2>Biggest deals this season</h2>${biggest || '<p class="dim">None yet.</p>'}`;
   },
   Contracts() {
@@ -297,6 +328,22 @@ const views = {
   },
 };
 
+views.Scouting = () => {
+  const taskPairs = [['', 'Idle'], ['free', 'Free agents'], ...s.divisions.map((d, i) => ['division:' + i, 'Division: ' + d.name]),
+    ...s.clubs.filter(c => c.id !== s.me).map(c => ['club:' + c.id, 'Club: ' + c.name]), ...s.shortlist.map(id => ['player:' + id, 'Player: ' + (allPlayers().find(p => p.id === id)?.name ?? '?')])];
+  const taskValue = sc => sc.task ? sc.task.kind === 'free' ? 'free' : `${sc.task.kind}:${sc.task.id}` : '';
+  const scouts = s.scouts.map((sc, k) => `<tr><td>Scout ${k + 1}</td><td>${sc.task ? `${taskText(sc.task)} · reports in ${outFor(sc.days)}` : '<span class="dim">idle</span>'}</td>
+    <td><select data-act="assign" data-id="${k}">${options(taskPairs.some(([v]) => v === taskValue(sc)) ? taskPairs : [...taskPairs, [taskValue(sc), 'Player: ' + taskText(sc.task)]], taskValue(sc))}</select></td></tr>`).join('');
+  const list = s.shortlist.map(id => allPlayers().find(p => p.id === id)).filter(Boolean).map(p => {
+    const c = clubOfPlayer(p), e = estimate(s, p, c);
+    return `<tr><td>${star(p.id)}</td>${nameBtn(p, 'view')}<td>${clubCell(c)}</td>${estCells(p, e)}<td>${e.ovr[0] < e.ovr[1] && s.scouts.some(x => !x.task) ? `<button data-act="scoutPlayer" data-id="${p.id}">Scout</button>` : ''}</td></tr>`;
+  });
+  const days = Object.entries(TASKS).map(([k, t]) => `${k === 'free' ? 'the free agents' : 'a ' + k}: ${t.days} days, to ${t.level}%`).join(' · ');
+  return `<h2>Scouts</h2><p class="dim">Send a scout to watch a player, a club, a division or the free agents. When he reports, you know everyone he watched: ${days}. What you know fades over two seasons, and Premier League players are always known.</p>
+    <div class="wrap"><table>${scouts}</table></div>
+    <h2>Shortlist</h2>${list.length ? `<div class="wrap"><table><tr><th></th><th>Name</th><th>Club</th>${EST_HEAD.replace('<th>Name</th>', '')}<th></th></tr>${list.join('')}</table></div>` : '<p class="dim">Empty: add players with ☆ on Transfers or a profile.</p>'}`;
+};
+
 const actions = {
   start(id) { takeClub(s, id); tab = 'Squad'; tableDiv = s.clubs[id].div; },
   reset() { if (s.me === null || confirm('Abandon this career and start a new game?')) { stopClock(); s = newWorld(); sel = viewing = null; tableDiv = 0; } },
@@ -331,7 +378,20 @@ const actions = {
   },
   end() { endSeason(s); tab = 'History'; tableDiv = myClub(s).div; },
   buy(id) { msg = buy(s, id) || 'Signed.'; },
-  browse(id, el) { browse = el.tagName === 'SELECT' ? (el.value === '' ? null : +el.value) : id; tab = 'Transfers'; },
+  browse(id) { filters = { club: String(id) }; tab = 'Transfers'; },
+  search() {
+    const v = id => $(id).value, n = id => +v(id) || null;
+    filters = { pos: v('f-pos'), div: v('f-div'), club: v('f-club'), maxAge: n('f-age'), minOvr: n('f-ovr'), maxValue: n('f-val') && n('f-val') * 1e6,
+      listed: $('f-listed').checked, loan: $('f-loan').checked, name: v('f-name') };
+  },
+  clearSearch() { filters = {}; },
+  shortlist(id) { toggleShortlist(s, id); },
+  assign(k, el) {
+    if (!el.value) { recall(s, k); msg = 'Scout recalled.'; return; }
+    const [kind, id] = el.value.split(':');
+    msg = assign(s, k, id === undefined ? { kind } : { kind, id: +id }) || 'Scout sent.';
+  },
+  scoutPlayer(id) { const k = s.scouts.findIndex(x => !x.task); msg = k < 0 ? 'Every scout is busy.' : assign(s, k, { kind: 'player', id }) || `Scout ${k + 1} sent: report in ${TASKS.player.days} days.`; },
   bid(id) { msg = bid(s, id, feeOf(id)) || 'Bid accepted: he has signed.'; },
   counter(id) { msg = acceptCounter(s, id) || 'Deal done: he has signed.'; },
   loan(id) { msg = loanIn(s, id) || 'He joins on loan.'; },
```

- [ ] **Step 2: Checks**

Run: `node --input-type=module --check < src/ui/app.js` — Expected: no output.
Run: `npm test` — Expected: all pass.

- [ ] **Step 3: Verify in the browser** — `preview_start` with `{ name: "touchline" }`:
  1. The existing save (version 8) loads, with no console errors. A **Scouting** tab is present with your division's scouts, all idle.
  2. **Transfers → Find players:** pick FW, Championship, Age ≤ 23 and click Search. Rows show ranges such as "73–81" and "€9.24–24.14M", with "0%" known. Premier League rows show single numbers and 100%. Club cells are badges with three-letter codes. Refusals read "won't come", with the reason on hover.
  3. Click ☆ on a row: it becomes ★, and the player appears on the Scouting shortlist.
  4. Open a fogged player's profile: attributes show as ranges like "11–13", with "known 0%" and **Scout him**. Click it: "Scout 1 sent: report in 7 days."
  5. On Scouting, set Scout 2 to "Free agents". Play days (Match → Continue). The news shows "🔎 Scout report on …", and the player's profile then shows exact numbers.
  6. Bid on a fogged player: the fee box starts at the middle of the price estimate, and the club still answers on its true asking price.
  7. Play to the end of the season and start the next: the scouts still match your division, and knowledge has dropped by about 10 points over the summer (it fades 50 a season).

- [ ] **Step 4: Commit**

```bash
git add src/ui/app.js
git commit -m "feat: player search with estimates, attribute ranges in profiles, and a Scouting tab"
```

---

### Task 5: Docs

**Files:**
- Modify: `docs/fun-surprises.md`
- Modify: `docs/superpowers/plans/2026-11-15-touchline-roadmap.md`

- [ ] **Step 1: Fun surprises** — add after row 18:

```markdown
| 19 | **Players give themselves away.** Some true values leak through the fog: a free agent's wage demand comes from his true overall; "won't come" means he is a regular at his club; the Loan button only appears for non-regulars; and a club's counter-offer tells you its asking price. | Check a free agent's asking wage against others at the same estimate before paying to scout him. | `terms()` in `src/contracts.js`, `refusal()` and `loanable()` in `src/market.js`, `bid()` in `src/transfers.js` | Phase 8 |
| 20 | **Promotion makes them famous.** Fame follows the division: when a club goes up to the Premier League, everyone there becomes fully known overnight, and a relegated club's players go back into the fog. | Scout the Championship's promotion race late in the season, or just wait for the summer and see the promoted clubs for free. | `fogged()` in `src/scouting.js` | Phase 8 |
```

  Record any other quirk found while implementing or reviewing this phase.

- [ ] **Step 2: Roadmap**
  - Row 8: change `to write` to `` `2026-11-16-touchline-phase-8-scouting.md` (done YYYY-MM-DD) ``.
  - Add below the Phase 7 notes:

```markdown
Phase 8 notes (decided 2026-11-16):
- Phase 9's scouts get attributes and wages: their judging can scale `TASKS` (days and knowledge reached) and `MAX_WIDTH` / `OVR_WIDTH` in `src/scouting.js`, and hiring replaces the fixed `SCOUTS` numbers.
- AI clubs see true values; only the human club is fogged.
```

- [ ] **Step 3: Run the tests and commit**

```bash
git add docs/fun-surprises.md docs/superpowers/plans/2026-11-15-touchline-roadmap.md
git commit -m "docs: mark Phase 8 done"
```

- [ ] **Step 4: End-of-phase summary** (in chat): what changed, the browser check, fun surprises #19 and #20.
