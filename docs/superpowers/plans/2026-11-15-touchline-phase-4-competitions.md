# Touchline Phase 4 — Competitions & Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "rounds" with a day-based season calendar that holds:
- the leagues;
- a knockout cup for every club;
- promotion and relegation with two-legged play-offs;
- season awards;
- club and league records, shown on new Cup and History screens.

**Architecture:**
- **Calendar:** `src/calendar.js` builds the season as a list of calendar days (`s.days`). Each day holds items: a league round of one division, a cup round, or a play-off leg. `playDay()` in `src/season.js` replaces `playRound()` and plays the next day.
- **Knockouts:** `src/cup.js` holds the pure knockout helpers: draws, ties, legs, aggregate scores and play-off pairings. The match engine gains neutral grounds and penalty shootouts.
- **End of season:** `endSeason()` applies promotion and relegation, hands out awards (`src/awards.js`), updates records and writes a richer history entry. It then schedules the next season.
- **Saves:** save version 5 migrates an old save mid-season.

**Tech Stack:** Vanilla JavaScript ES modules, HTML/CSS, Node ≥ 22 built-in test runner (`node:test`, `node:assert/strict`). No npm dependencies. Local preview via the `touchline` server in `.claude/launch.json` (port 8127).

## Global Constraints

- Node version: 22 or newer. No packages are installed; `package.json` has no `dependencies` or `devDependencies`.
- Engine code (`src/*.js`, `src/data/**/*.js`) must not reference `document`, `window`, `localStorage`, `Math.random` or `Date`. Randomness comes only from an `rng` built with `makeRng` from a stored seed. `src/ui/commentary.js` follows the same rule. The calendar's date labels are computed from day numbers without `Date`.
- State must survive `JSON.parse(JSON.stringify(state))` unchanged: no `Map`, `Set`, class instances, functions or `undefined` values in state.
- Determinism: same seed + same inputs = same career, including a career saved and reloaded in the middle of a live match.
- League calibration is unchanged. On a full season of the real leagues (seed 1) the targets are:
  - goals per match 2.5–2.9;
  - home wins 43–47%;
  - yellow cards 2.5–4 per match;
  - red cards at most 0.3 per match;
  - penalties 0.15–0.4 per match.
- Every division keeps its size from season to season. Between each division and the one below:
  - the top 2 go up automatically, plus the winner of a play-off between 3rd–6th;
  - the bottom 3 of the upper division go down;
  - the bottom division has no relegation.
- This is a private personal project: real club, player and competition names are used.
- Fun surprises rule: a minor quirk that is fun or interesting for the player is kept, not fixed. Record it in `docs/fun-surprises.md` and mention it in the end-of-phase summary. If a phase rewrites the code a quirk lives in, carry the quirk over or note that it was retired and why.
- Run all tests with `npm test`. Every task ends with all tests passing and a commit. Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Design decisions (made while planning, 2026-11-15)

- **The season calendar.** Day 0 is Saturday 8 August, and every season starts on a Saturday, so there are no leap years.
  - League rounds are spread over 40 weekends. A division with more than 40 rounds plays the extra ones on midweek Tuesdays: the 46-round EFL plays 6 of them.
  - Cup rounds are on Wednesdays, with the final on Saturday 22 May (day 287).
  - Play-off semi-finals: the 1st leg is on Wednesday 12 May (day 277) and the 2nd leg on Saturday 15 May (day 280).
  - The play-off finals are on Saturday 29 May (day 294).
  - `s.round` is gone. `s.days` is the calendar, `s.next` is the index of the next day to play, and `s.day` is the day number last played (−1 before the season starts).
- **The cup is the FA Cup**, with every club in the game (68), seeded by division and then squad quality.
  - Beyond a power of two, the weakest clubs meet in a preliminary round (4 ties). Then come rounds 1–3, the quarter-finals, the semi-finals and the final.
  - Every tie is one match, and a draw goes straight to penalties (`ponytail:` no extra time). The final is at a neutral ground, with no home edge.
  - The cup winner earns €0.5M.
- **Play-offs:** 3rd v 6th and 4th v 5th over two legs, the lower seed at home first. Level on aggregate goes to penalties (no away goals). The final is one match at a neutral ground.
- **Promotion and relegation** are applied in `endSeason()`, before the history entry is written: 3 up and 3 down at each boundary. A season without play-offs (an old save) promotes 3rd place instead.
- **Test fixture:** the Middle League of `tests/fixtures/mini.js` grows from 6 to 10 clubs, so its promotion, play-off and relegation places (2 + 4 + 3) do not overlap. The four new clubs go at the end of the Middle League, so the Low League's club ids move from 10–15 to 14–19. All tests in this plan use the new ids.
- **Money:**
  - Weekly income is paid once per calendar week, for every club the same. Fun surprise #4 (idle-round income) is retired.
  - Gate receipts come from every home match, cup ties included, but not from neutral finals.
  - League prize money is unchanged.
- **Season statistics, awards and records come from league matches only.**
  - `p.stats` (`apps`, `goals`, `assists`, `rating` sum) is added on a player's first league match and removed at the end of the season.
  - **Awards per division:** player of the season and young player (21 or under) by average rating, and top scorer.
  - **Records per division** (`s.records[d]`): most points, most goals by a player in a season, and the biggest win.
  - **Club records** (`club.rec`): the biggest win, and the most goals by a player in a season.
  - Honours are derived from the history when shown.
- **History entry:** `{ season, pos, div, prize, cup: { winner, runnerUp } | null, divs: [{ champion, up, down, playoff, awards }] }`.
  - `up` lists the clubs promoted out of that division, and `down` the clubs relegated out of it.
  - `playoff` is the play-off winner, and `awards` is `{ player, scorer, young }`.
- **Save version 5.**
  - A save from Phase 3 in mid-season gets a calendar with the rest of its league rounds and the play-offs.
  - It has no cup until next season.
  - Old history entries are converted.
  - A match in progress starts again (`s.live = null`): its fixture cannot be matched to the new calendar for every division at once.
  - A save whose league had already finished goes straight to "season complete".
- **Calibration checked in the prototype.** These are three real-league seasons played with this code, seeds 1–3, with a human club at Cardiff:
  - league goals 2.64–2.76 per match, home wins 43.7–44.5%;
  - 77 knockout matches per season, 10–17 of them going to penalties;
  - 10–16 cup ties per season won by a club from a lower division;
  - about 1.9 s per real season, and a save of 0.70 MB after a season.
- **Fun surprises:**
  - **#4 is retired** (income is weekly now).
  - **New #8: League One is a safe haven.** Nobody can be relegated from the bottom division, because League Two is not in the game.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/calendar.js` | New: day numbers of league, cup and play-off dates; `buildCalendar`; `dateLabel` |
| `src/cup.js` | New: knockout helpers: rounds and names, draws, ties, legs, aggregate, play-off pairings |
| `src/awards.js` | New: players' season stats, awards, records |
| `src/match.js` | Neutral grounds, `shootout()`, `pens` in the match result |
| `src/world.js` | `scheduleSeason()`; new career fields |
| `src/season.js` | Rewritten around the calendar: `playDay`, `myFixture`, `upcoming`, `zone`, play-offs, promotion and relegation, awards, history |
| `src/save.js` | Version 5 and its migration |
| `src/ui/app.js`, `index.html` | Date, calendar-aware Match screen, table zones, Cup and History tabs |
| `tests/calendar.test.js`, `tests/cup.test.js` | New |
| `tests/season.test.js`, `tests/save.test.js` | Rewritten |
| `tests/match.test.js`, `tests/world.test.js`, `tests/england.test.js`, `tests/fixtures/mini.js` | Extended |
| `docs/fun-surprises.md`, `docs/superpowers/plans/2026-11-15-touchline-roadmap.md` | Phase wrap-up |

---

### Task 1: Calendar and knockout helpers

Two new pure modules. Nothing uses them yet.

**Files:**
- Create: `src/calendar.js`, `src/cup.js`, `tests/calendar.test.js`, `tests/cup.test.js`

**Interfaces:**
- Produces, in `src/calendar.js`:
  - `WEEKS = 40`, `PLAYOFF_DAYS = [277, 280, 294]`, `CUP_FINAL_DAY = 287`.
  - `leagueDays(n)` and `cupDays(r)` → day numbers.
  - `buildCalendar(rounds, cupRounds)` → `[{ day, items }]`. An item is one of:
    - `{ comp: 'league', div, round }`;
    - `{ comp: 'cup', round }`;
    - `{ comp: 'playoff', div, round: 0 | 1, leg }`.
  - `dateLabel(day)` → `'Sat 8 Aug'`.
- Produces, in `src/cup.js`:
  - `CUP_NAME = 'FA Cup'`.
  - `cupRounds(n)` and `cupRoundName(k, n)`.
  - `tie(h, a)` → `{ h, a, legs: [], pens: null, w: null }`.
  - `draw(rng, ids)`.
  - `newCup(rng, ranked)` → `{ byes, rounds: [{ ties }] }`; `nextCupRound(rng, cup)`.
  - `addLeg(t, hg, ag, legs)` → `true` when penalties are needed; `aggregate(t)`; `decide(t, pens)`.
  - `playoffSemis(table)` → `{ rounds: [{ ties }] }`; `playoffFinal(p)`.

- [ ] **Step 1: Write the failing tests** — create `tests/calendar.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEEKS, PLAYOFF_DAYS, CUP_FINAL_DAY, leagueDays, cupDays, buildCalendar, dateLabel } from '../src/calendar.js';

test('league rounds: one per weekend, extra rounds on midweek Tuesdays, all in the same 40 weeks', () => {
  for (const n of [6, 10, 18, 38, 46]) {
    const days = leagueDays(n);
    assert.equal(days.length, n);
    assert.equal(new Set(days).size, n);
    assert.ok(days.every((d, k) => k === 0 || d > days[k - 1]), `${n}: in order`);
    assert.ok(days[0] === 0 && days.at(-1) < 7 * WEEKS, `${n}: within the season`);
    assert.equal(days.filter(d => d % 7 === 0).length, Math.min(n, WEEKS), `${n}: Saturdays`);
    assert.equal(days.filter(d => d % 7 === 3).length, Math.max(0, n - WEEKS), `${n}: Tuesdays`);
  }
});

test('cup rounds on Wednesdays, the final on the Saturday after the league', () => {
  const days = cupDays(7);
  assert.equal(days.length, 7);
  assert.ok(days.slice(0, -1).every(d => d % 7 === 4 && d < 7 * WEEKS));
  assert.equal(days.at(-1), CUP_FINAL_DAY);
  assert.ok(CUP_FINAL_DAY % 7 === 0 && CUP_FINAL_DAY > Math.max(...leagueDays(46)));
  assert.deepEqual(cupDays(1), [CUP_FINAL_DAY]);
});

test('the calendar: every league round, cup round and play-off leg once, in day order', () => {
  const cal = buildCalendar([38, 46, 46], 7), items = cal.flatMap(d => d.items);
  assert.ok(cal.every((d, k) => k === 0 || d.day > cal[k - 1].day));
  for (const [div, n] of [[0, 38], [1, 46], [2, 46]])
    assert.deepEqual(items.filter(i => i.comp === 'league' && i.div === div).map(i => i.round), [...Array(n).keys()]);
  assert.deepEqual(items.filter(i => i.comp === 'cup').map(i => i.round), [...Array(7).keys()]);
  const po = cal.flatMap(d => d.items.filter(i => i.comp === 'playoff').map(i => ({ ...i, day: d.day })));
  assert.deepEqual(po.map(i => [i.div, i.round, i.leg, i.day]).sort(),
    [[1, 0, 0, PLAYOFF_DAYS[0]], [1, 0, 1, PLAYOFF_DAYS[1]], [1, 1, 0, PLAYOFF_DAYS[2]], [2, 0, 0, PLAYOFF_DAYS[0]], [2, 0, 1, PLAYOFF_DAYS[1]], [2, 1, 0, PLAYOFF_DAYS[2]]].sort());
  assert.ok(PLAYOFF_DAYS[0] > Math.max(...leagueDays(46)), 'play-offs after the league');
  assert.ok(!buildCalendar([6], 0).some(d => d.items.some(i => i.comp !== 'league')), 'one division, no cup: league only');
});

test('dates: day 0 is Saturday 8 August', () => {
  assert.equal(dateLabel(0), 'Sat 8 Aug');
  assert.equal(dateLabel(3), 'Tue 11 Aug');
  assert.equal(dateLabel(24), 'Tue 1 Sep');
  assert.equal(dateLabel(146), 'Fri 1 Jan');
  assert.equal(dateLabel(294), 'Sat 29 May');
});
```

and `tests/cup.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { cupRounds, cupRoundName, tie, draw, newCup, nextCupRound, addLeg, aggregate, decide, playoffSemis, playoffFinal } from '../src/cup.js';

test('rounds and names: a preliminary round when the clubs are not a power of two', () => {
  assert.equal(cupRounds(64), 6);
  assert.equal(cupRounds(68), 7);
  assert.equal(cupRounds(20), 5);
  assert.deepEqual([...Array(7).keys()].map(k => cupRoundName(k, 68)),
    ['Preliminary round', 'Round 1', 'Round 2', 'Round 3', 'Quarter-finals', 'Semi-finals', 'Final']);
  assert.deepEqual([...Array(4).keys()].map(k => cupRoundName(k, 16)), ['Round 1', 'Quarter-finals', 'Semi-finals', 'Final']);
});

test('the draw pairs every club once', () => {
  const ties = draw(makeRng(1), [1, 2, 3, 4, 5, 6]);
  assert.equal(ties.length, 3);
  assert.deepEqual(ties.flatMap(t => [t.h, t.a]).sort(), [1, 2, 3, 4, 5, 6]);
  assert.ok(ties.every(t => t.legs.length === 0 && t.pens === null && t.w === null));
});

test('a new cup: the weakest clubs meet in the preliminary round, the rest join in round 1', () => {
  const ranked = [...Array(68).keys()], rng = makeRng(2), cup = newCup(rng, ranked);
  assert.deepEqual(cup.byes, ranked.slice(0, 60));
  assert.deepEqual(cup.rounds[0].ties.flatMap(t => [t.h, t.a]).sort((a, b) => a - b), ranked.slice(60));
  for (const t of cup.rounds[0].ties) t.w = t.h;
  nextCupRound(rng, cup);
  assert.equal(cup.rounds[1].ties.length, 32);
  assert.equal(new Set(cup.rounds[1].ties.flatMap(t => [t.h, t.a])).size, 64);
  for (const t of cup.rounds[1].ties) t.w = t.a;
  nextCupRound(rng, cup);
  assert.equal(cup.rounds[2].ties.length, 16); // the byes join only once
  const even = newCup(rng, [...Array(16).keys()]);
  assert.deepEqual(even.byes, []);
  assert.equal(even.rounds[0].ties.length, 8);
});

test('ties: one leg or two, aggregate score, penalties when level', () => {
  const one = tie(1, 2);
  assert.equal(addLeg(one, 2, 1, 1), false);
  assert.equal(one.w, 1);
  const level = tie(1, 2);
  assert.equal(addLeg(level, 1, 1, 1), true);
  assert.equal(level.w, null);
  decide(level, [3, 4]);
  assert.deepEqual([level.w, level.pens], [2, [3, 4]]);
  const two = tie(5, 6);
  assert.equal(addLeg(two, 0, 2, 2), false);
  assert.equal(two.w, null); // first leg decides nothing
  assert.equal(addLeg(two, 3, 0, 2), false);
  assert.deepEqual(aggregate(two), [3, 2]);
  assert.equal(two.w, 5);
});

test('play-offs: 3rd v 6th and 4th v 5th, then the winners meet', () => {
  const p = playoffSemis([10, 11, 12, 13, 14, 15, 16]);
  assert.deepEqual(p.rounds[0].ties.map(t => [t.h, t.a]), [[12, 15], [13, 14]]);
  p.rounds[0].ties[0].w = 15; p.rounds[0].ties[1].w = 13;
  playoffFinal(p);
  assert.deepEqual([p.rounds[1].ties[0].h, p.rounds[1].ties[0].a], [15, 13]);
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test tests/calendar.test.js tests/cup.test.js`
Expected: FAIL — `Cannot find module '…/src/calendar.js'` (and `…/src/cup.js`).

- [ ] **Step 3: Create `src/calendar.js`**

```js
// The season calendar. Day 0 is Saturday 8 August; a day number is all the engine stores, the
// label is for people. League rounds fall on Saturdays (Tuesdays when a division has more rounds
// than there are weekends), cup rounds on Wednesdays, the end-of-season knockouts after the league.
export const WEEKS = 40;              // league weekends: weeks 0-39
const SAT = 0, TUE = 3, WED = 4;      // day within a week
export const PLAYOFF_DAYS = [277, 280, 294]; // semi-final 1st leg (Wed), 2nd leg (Sat), final (Sat)
export const CUP_FINAL_DAY = 287;     // Saturday after the league ends

// Day numbers of n league rounds: one per weekend, spread evenly; rounds beyond WEEKS on midweek Tuesdays.
export function leagueDays(n) {
  const sat = Array.from({ length: Math.min(n, WEEKS) }, (_, k) => 7 * Math.floor(k * WEEKS / Math.min(n, WEEKS)) + SAT);
  const tue = Array.from({ length: Math.max(0, n - WEEKS) }, (_, j) => 7 * Math.floor((j + 0.5) * WEEKS / (n - WEEKS)) + TUE);
  return [...sat, ...tue].sort((a, b) => a - b);
}

// Day numbers of r cup rounds: Wednesdays from week 3 to week 37, the final on CUP_FINAL_DAY.
export const cupDays = r => [...Array.from({ length: r - 1 }, (_, k) => 7 * (3 + Math.floor(k * 34 / Math.max(1, r - 1))) + WED), CUP_FINAL_DAY];

// The whole season: [{ day, items }] in day order. An item is { comp: 'league', div, round },
// { comp: 'cup', round } or { comp: 'playoff', div, round: 0 | 1, leg } (round 0 = semi-finals,
// two legs; round 1 = final). rounds[d] = league rounds of division d; divisions below the top have play-offs.
export function buildCalendar(rounds, cupRounds) {
  const byDay = new Map(), add = (day, item) => byDay.set(day, [...(byDay.get(day) || []), item]);
  rounds.forEach((n, div) => leagueDays(n).forEach((day, round) => add(day, { comp: 'league', div, round })));
  if (cupRounds) cupDays(cupRounds).forEach((day, round) => add(day, { comp: 'cup', round }));
  rounds.forEach((_, div) => {
    if (!div) return;
    add(PLAYOFF_DAYS[0], { comp: 'playoff', div, round: 0, leg: 0 });
    add(PLAYOFF_DAYS[1], { comp: 'playoff', div, round: 0, leg: 1 });
    add(PLAYOFF_DAYS[2], { comp: 'playoff', div, round: 1, leg: 0 });
  });
  return [...byDay].sort((a, b) => a[0] - b[0]).map(([day, items]) => ({ day, items }));
}

const MONTHS = [['Aug', 31], ['Sep', 30], ['Oct', 31], ['Nov', 30], ['Dec', 31], ['Jan', 31], ['Feb', 28], ['Mar', 31], ['Apr', 30], ['May', 31], ['Jun', 30], ['Jul', 31]];
const WEEKDAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// 'Sat 8 Aug' for day 0. No leap years: every season starts on a Saturday.
export function dateLabel(day) {
  let d = day + 8; // day 0 is 8 August
  for (const [name, len] of MONTHS) { if (d <= len) return `${WEEKDAYS[day % 7]} ${d} ${name}`; d -= len; }
  return `Day ${day}`;
}
```

- [ ] **Step 4: Create `src/cup.js`**

```js
// Knockout football: the cup for every club in the game, and the play-offs below the top division.
// A tie is { h, a, legs: [[goals of h, goals of a], ...], pens: [h, a] | null, w: winner id | null };
// h is the home side of a one-legged tie and the higher seed of a two-legged one.
export const CUP_NAME = 'FA Cup';

const pow2 = n => 2 ** Math.floor(Math.log2(n));
// Rounds for n clubs: a preliminary round first when n is not a power of two.
export const cupRounds = n => Math.log2(pow2(n)) + (n > pow2(n) ? 1 : 0);

export function cupRoundName(k, n) {
  const r = cupRounds(n), prelim = n > pow2(n);
  return ['Final', 'Semi-finals', 'Quarter-finals'][r - 1 - k] ?? (prelim && k === 0 ? 'Preliminary round' : `Round ${k + (prelim ? 0 : 1)}`);
}

export const tie = (h, a) => ({ h, a, legs: [], pens: null, w: null });

// Random pairings; the first club drawn of each pair is at home.
export function draw(rng, ids) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return Array.from({ length: a.length / 2 }, (_, k) => tie(a[2 * k], a[2 * k + 1]));
}

// A new cup: `ranked` lists every club, strongest first. The weakest clubs beyond a power of two
// meet in the preliminary round; the rest wait in `byes` for round 1.
export function newCup(rng, ranked) {
  const extra = ranked.length - pow2(ranked.length), cut = ranked.length - 2 * extra;
  const first = extra ? ranked.slice(cut) : ranked;
  return { byes: extra ? ranked.slice(0, cut) : [], rounds: [{ ties: draw(rng, first) }] };
}

// Draws the cup's next round from the winners of the last one (plus the byes after the preliminary round).
export function nextCupRound(rng, cup) {
  const winners = cup.rounds.at(-1).ties.map(t => t.w);
  cup.rounds.push({ ties: draw(rng, [...winners, ...(cup.rounds.length === 1 ? cup.byes : [])]) });
}

// Records one leg, given in the tie's h/a order. Returns true when the tie needs a penalty shootout
// to be decided (the caller then calls decide with the shootout score).
export function addLeg(t, hg, ag, legs) {
  t.legs.push([hg, ag]);
  if (t.legs.length < legs) return false;
  const [x, y] = aggregate(t);
  if (x === y) return true;
  t.w = x > y ? t.h : t.a;
  return false;
}
export const aggregate = t => t.legs.reduce(([x, y], [p, q]) => [x + p, y + q], [0, 0]);
export function decide(t, pens) { t.pens = pens; t.w = pens[0] > pens[1] ? t.h : t.a; }

// Play-off semi-finals for a final table (club ids, top first): 3rd v 6th and 4th v 5th, two legs.
export const playoffSemis = table => ({ rounds: [{ ties: [tie(table[2], table[5]), tie(table[3], table[4])] }] });
export const playoffFinal = p => p.rounds.push({ ties: [tie(p.rounds[0].ties[0].w, p.rounds[0].ties[1].w)] });
```

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: PASS, 0 failures (the 107 existing tests plus 9 new ones).

- [ ] **Step 6: Commit**

```bash
git add src/calendar.js src/cup.js tests/calendar.test.js tests/cup.test.js
git commit -m "feat: season calendar and knockout helpers"
```

---

### Task 2: Neutral grounds and penalty shootouts in the match engine

**Files:**
- Modify: `src/match.js`, `tests/match.test.js`

**Interfaces:**
- Produces:
  - `startMatch(seed, home, away, neutral = false)`. A neutral match carries `m.neutral = true`, and side 0 gets no home edge. A normal match has no `neutral` key at all.
  - `shootout(m)` → `[home, away]`. It is stored in `m.pens`, and it is deterministic from `m.seed`.
  - `matchResult(m)` has `pens` only when there was a shootout.

- [ ] **Step 1: Write the failing tests** — in `tests/match.test.js` add `shootout` to the import from `'../src/match.js'`:

```js
import { startMatch, stepMinute, matchResult, simMatch, power, preview, substitute, setFormation, setLiveTactic, shootout, MAX_SUBS } from '../src/match.js';
```

and append at the end of the file:

```js
test('a neutral ground takes away the home edge', () => {
  let homeWins = 0, neutralWins = 0, homePoss = 0, neutralPoss = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const h = play(seed, side(4), side(5)), n = startMatch(seed, side(4), side(5), true);
    while (!n.done) stepMinute(n);
    if (h.sides[0].st.goals > h.sides[1].st.goals) homeWins++;
    if (n.sides[0].st.goals > n.sides[1].st.goals) neutralWins++;
    homePoss += h.sides[0].st.poss; neutralPoss += n.sides[0].st.poss;
  }
  assert.ok(homeWins > neutralWins && homePoss > neutralPoss, `${homeWins} v ${neutralWins}, ${homePoss} v ${neutralPoss}`);
  assert.equal(startMatch(1, side(4), side(5)).neutral, undefined); // only neutral matches carry the flag
});

test('penalty shootout: a winner, a real score, the same every time, in the match result', () => {
  let early = 0, sudden = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const m = play(seed, side(4), side(5)), [a, b] = shootout(m);
    assert.notEqual(a, b);
    assert.deepEqual(m.pens, [a, b]);
    assert.deepEqual(matchResult(m).pens, [a, b]);
    assert.ok(Math.max(a, b) - Math.min(a, b) <= 3 && Math.min(a, b) >= 0);
    if (Math.max(a, b) < 5 && Math.max(a, b) - Math.min(a, b) >= 2) early++;
    if (Math.min(a, b) >= 5) sudden++;
    assert.deepEqual(shootout(JSON.parse(JSON.stringify({ ...m, pens: undefined }))), [a, b]);
  }
  assert.ok(early > 10 && sudden > 5, `${early} ended early, ${sudden} went to sudden death`);
  assert.equal(matchResult(play(1, side(4), side(5))).pens, undefined);
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test tests/match.test.js`
Expected: FAIL — SyntaxError: `shootout` is not exported.

- [ ] **Step 3: Change `src/match.js`** — make these replacements; each "old" text occurs exactly once:

1. Replace

```js
function penalty(m, rng, i) {
  const o = taker(m, i, 'pen');
  if (!o) return;
  const p = m.pl[o.id], keeper = keeperOf(m, 1 - i), stop = keeper ? (keeper.attrs.handling + keeper.attrs.reflexes) / 2 : 0;
  attempt(m, rng, i, o, 0.76, 'pen', null, Math.max(0.4, Math.min(0.95, 0.6 + 0.01 * (p.attrs.finishing + p.attrs.composure) - 0.008 * stop)));
}
```

with

```js
// Chance that player p scores a penalty against side i's keeper (no keeper: an open goal, nearly).
function penScore(m, p, i) {
  const keeper = keeperOf(m, i), stop = keeper ? (keeper.attrs.handling + keeper.attrs.reflexes) / 2 : 0;
  return Math.max(0.4, Math.min(0.95, 0.6 + 0.01 * (p.attrs.finishing + p.attrs.composure) - 0.008 * stop));
}

function penalty(m, rng, i) {
  const o = taker(m, i, 'pen');
  if (!o) return;
  attempt(m, rng, i, o, 0.76, 'pen', null, penScore(m, m.pl[o.id], 1 - i));
}
```

2. Replace

```js
export function startMatch(seed, home, away) {
  const pl = {};
  return { seed, min: 0, done: false, pl, sides: [makeSide(home, 0, pl), makeSide(away, 1, pl)], ev: [] };
}
```

with

```js
// neutral: a final at a neutral ground, where side 0 has no home edge.
export function startMatch(seed, home, away, neutral = false) {
  const pl = {}, m = { seed, min: 0, done: false, pl, sides: [makeSide(home, 0, pl), makeSide(away, 1, pl)], ev: [] };
  if (neutral) m.neutral = true;
  return m;
}
```

3. Replace

```js
  const P = [power(m, 0), power(m, 1)], home = P[0].ctrl * HOME_EDGE;
```

with

```js
  const edge = m.neutral ? 1 : HOME_EDGE, P = [power(m, 0), power(m, 1)], home = P[0].ctrl * edge;
```

4. Replace

```js
  const chance = K.SHOT_RATE * (atk === 0 ? HOME_EDGE : 1) * Math.exp(
```

with

```js
  const chance = K.SHOT_RATE * (atk === 0 ? edge : 1) * Math.exp(
```

5. Replace

```js
  return { h: H.club, a: A.club, hg: H.st.goals, ag: A.st.goals, ev: m.ev, stats: [H.st, A.st], ratings };
}
```

with

```js
  const r = { h: H.club, a: A.club, hg: H.st.goals, ag: A.st.goals, ev: m.ev, stats: [H.st, A.st], ratings };
  if (m.pens) r.pens = m.pens;
  return r;
}

// Penalty shootout after a finished match: five kicks each, then sudden death; it stops as soon as
// one side cannot be caught. Each side's takers in order: the chosen penalty taker, then the
// players on the pitch by penalty skill (keepers last), round again if needed. Stores m.pens = [home, away].
export function shootout(m) {
  const rng = makeRng(m.seed), skill = p => p.attrs.finishing + p.attrs.composure;
  const order = m.sides.map((S, i) => {
    const team = active(m, i).map(o => m.pl[o.id]).sort((a, b) => (a.pos === 'GK') - (b.pos === 'GK') || skill(b) - skill(a));
    const first = m.pl[S.takers.pen];
    return first && team.includes(first) ? [first, ...team.filter(p => p !== first)] : team;
  });
  const score = [0, 0];
  for (let k = 0; k < 100; k++) {
    for (const i of [0, 1]) {
      const takers = order[i], p = takers[k % takers.length];
      if (p && rng.next() < penScore(m, p, 1 - i)) score[i]++;
      const left = j => Math.max(0, 5 - k - (j <= i ? 1 : 0)); // kicks still to come in the first five
      if (k < 5 && (score[0] > score[1] + left(1) || score[1] > score[0] + left(0))) return (m.pens = score);
    }
    if (k >= 4 && score[0] !== score[1]) return (m.pens = score);
  }
  return (m.pens = [score[0] + 1, score[1]]); // ponytail: only reached when neither side has a player left
}
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/match.js tests/match.test.js
git commit -m "feat: neutral grounds and penalty shootouts"
```

---

### Task 3: The season runs on the calendar: cup, play-offs, promotion, awards, records; save version 5

This is the core task. It replaces rounds with calendar days in the engine and saves, and it changes many tests at once. Most files are given whole.

**Files:**
- Create: `src/awards.js`
- Rewrite: `src/season.js`, `tests/season.test.js`, `tests/save.test.js`
- Modify: `src/world.js`, `src/save.js`, `tests/fixtures/mini.js`, `tests/world.test.js`, `tests/england.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1–2.
- Produces:
  - **State:**
    - `s.days`, `s.next`, `s.day`, `s.cup`, `s.playoffs` (one per division, `null` until drawn), `s.records` (one per division).
    - `club.rec`, and `p.stats` during a season.
    - The history entry shape is in the Design decisions. `s.round` is gone.
  - **`src/season.js`:**
    - `playDay(s)` → the day's results, each `matchResult()` plus `item`. It returns `null` once the season is done.
    - `myFixture(s)` → `{ h, a, tie?, legs, neutral, item }` or `null`.
    - `upcoming(s, n)`, `zone(s, d, pos)`, and the constants `PROMOTED`, `PLAYOFF`, `RELEGATED`.
    - `kickOff`, `table`, `endSeason`, `takeClub` and `myClub` keep their names.
  - **`src/world.js`:** `scheduleSeason(s, rng)`.
  - **`src/awards.js`:** `blankRecords`, `addMatch`, `seasonAwards`, `noteSeason`.
  - **Save:** `SAVE_VERSION = 5`.

- [ ] **Step 1: Grow the test fixture** — in `tests/fixtures/mini.js` replace the first two comment lines with

```js
// Small fake leagues for engine tests. Sizes 4, 10, 6: the top division plays fewer rounds than the
// others, like the real 20-club Premier League next to 24-club EFL divisions, and the middle one is
// big enough for promotion, play-off and relegation places not to overlap (2 + 4 + 3).
```

and replace `club('India', 11), club('Juliet', 11)] },` with

```js
club('India', 11), club('Juliet', 11),
    club('Quebec', 11), club('Romeo', 10), club('Sierra', 10), club('Tango', 10)] },
```

- [ ] **Step 2: Write the failing tests**
  - Replace `tests/season.test.js` with the file below.
  - Replace `tests/save.test.js` with the file further below.
  - In `tests/world.test.js` and `tests/england.test.js`, make the replacements listed after the two files.

`tests/season.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, MARKET_SIZE } from '../src/world.js';
import { FORMATIONS, BENCH, slots, bestXI, autoBench, fixLineup, strength, swap, newFam, learnFam } from '../src/lineup.js';
import { takeClub, myClub, myFixture, upcoming, kickOff, playDay, table, endSeason } from '../src/season.js';
import { cupRounds } from '../src/cup.js';
import { stepMinute, matchResult } from '../src/match.js';
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

test('a full season: every club plays everyone home and away, stats are consistent', () => {
  const s = world(4);
  takeClub(s, 6);
  const budget0 = s.budget, seed0 = s.seed;
  playDay(s);
  assert.notEqual(s.seed, seed0);
  while (!s.done) assert.ok(playDay(s).every(r => r.item && s.days[s.next - 1].items.some(i => i.comp === r.item.comp)));
  assert.equal(s.next, s.days.length);
  assert.equal(s.day, s.days.at(-1).day);
  assert.equal(playDay(s), null);
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

test('the calendar: days with no match for you, a day can hold several competitions', () => {
  const s = world(9);
  takeClub(s, 0); // a top club: a bye in the cup's preliminary round
  let idle = 0, mine = 0;
  while (!s.done) {
    const f = myFixture(s), today = s.days[s.next];
    if (f) { mine++; assert.ok(today.items.includes(f.item)); assert.ok(f.h === 0 || f.a === 0); } else idle++;
    playDay(s);
  }
  assert.ok(idle > 0 && mine >= 6, `${mine} matches, ${idle} days off`);
  assert.equal(myFixture(s), null);
  assert.ok(s.days.some(d => new Set(d.items.map(i => i.comp)).size > 1 || d.items.length > 1));
});

test('myFixture returns the human club\'s next match with its calendar item', () => {
  const s = world(10);
  takeClub(s, 7);
  const f = myFixture(s);
  assert.ok(f.h === 7 || f.a === 7);
  assert.deepEqual(f.item, { comp: 'league', div: 1, round: 0 });
  assert.ok(s.divisions[1].fixtures[0].some(m => m[0] === f.h && m[1] === f.a));
  assert.equal(f.neutral, false);
});

test('endSeason rolls over; three seasons keep squads intact', () => {
  const s = world(5);
  takeClub(s, 0);
  endSeason(s); // not done yet: no-op
  assert.equal(s.season, 1);
  for (let y = 1; y <= 3; y++) {
    while (!s.done) playDay(s);
    const seedBefore = s.seed;
    endSeason(s);
    assert.notEqual(s.seed, seedBefore);
    assert.equal(s.season, y + 1);
    assert.deepEqual([s.next, s.day, s.done, s.last], [0, -1, false, null]);
    assert.equal(s.history.length, y);
    const h = s.history[y - 1];
    assert.equal(h.divs.length, 3);
    assert.ok(h.pos >= 1 && h.pos <= MINI[h.div].clubs.length);
    assert.deepEqual(s.divisions.map(d => d.clubIds.length), [4, 10, 6]);
    assert.ok(s.clubs.every(c => c.players.length === 18 && c.st.p === 0 && c.players.every(p => p.age <= 35)));
    assert.equal(new Set(s.lineup).size, 11);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('prize money uses the size of the human club\'s division', () => {
  const s = world(12);
  takeClub(s, 0); // 4-club division, tier 3
  while (!s.done) playDay(s);
  const pos = table(s, 0).indexOf(0) + 1, before = s.budget;
  endSeason(s);
  assert.equal(s.history[0].prize, (4 + 1 - pos) * 40e3 * 3 + (s.history[0].cup.winner === 0 ? 500e3 : 0));
  assert.equal(s.budget, before + s.history[0].prize);
});

test('same seed and same choices give the same career; works with no human club', () => {
  const run = () => { const s = world(6); while (!s.done) playDay(s); endSeason(s); return s; };
  assert.deepEqual(run(), run());
});

test("free agents: half of last season's list stays, a year older; the rest are new", () => {
  const s = world(8);
  const ageBefore = new Map(s.market.map(p => [p.id, p.age]));
  while (!s.done) playDay(s);
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
  while (!s.done) playDay(s);
  endSeason(s);
  assert.equal(s.market.length, MARKET_SIZE);
  assert.ok(s.market.every(p => !old.has(p.id)));
});

test('a live match: kick off, play it minute by minute, and the round records exactly that result', () => {
  const s = world(13);
  takeClub(s, 6); // Middle League
  const m = kickOff(s);
  assert.equal(kickOff(s), m); // already started: the same match comes back
  assert.equal(m.sides.find(S => !S.auto).club, 6);
  while (!m.done) stepMinute(m);
  const want = matchResult(m), res = playDay(s);
  assert.equal(s.live, null);
  assert.deepEqual(res.find(r => r.h === 6 || r.a === 6), { ...want, item: { comp: 'league', div: 1, round: 0 } });
  assert.equal(s.clubs[6].st.gf, want.h === 6 ? want.hg : want.ag);
  assert.equal(s.next, 1);
});

test('playing the round during a live match hands the rest of it to the assistant', () => {
  const s = world(14);
  takeClub(s, 6);
  const m = kickOff(s);
  for (let k = 0; k < 30; k++) stepMinute(m);
  const res = playDay(s);
  const mine = res.find(r => r.h === 6 || r.a === 6);
  assert.equal(mine.ev.length, m.ev.length);
  assert.ok(m.done && m.sides.every(S => S.auto));
  assert.equal(s.live, null);
  assert.equal(s.clubs[6].st.p, 1);
});

test('kickOff does nothing when the human club has no fixture', () => {
  const s = world(9);
  takeClub(s, 0);
  while (myFixture(s)) playDay(s); // to the first day without a match for club 0
  assert.equal(kickOff(s), null);
  assert.equal(s.live, null);
});

test('autoBench picks seven squad players outside the XI, a keeper first', () => {
  const s = world(1), club = s.clubs[0], ids = bestXI(club, '4-4-2'), bench = autoBench(club, ids);
  assert.equal(bench.length, BENCH);
  assert.equal(new Set(bench).size, BENCH);
  assert.ok(bench.every(id => !ids.includes(id) && club.players.some(p => p.id === id)));
  assert.equal(club.players.find(p => p.id === bench[0]).pos, 'GK');
});

test('fixLineup repairs the bench and the slot tactics', () => {
  const s = world(2);
  takeClub(s, 5);
  assert.equal(s.bench.length, BENCH);
  const [sold] = s.bench;
  myClub(s).players = myClub(s).players.filter(p => p.id !== sold);
  s.bench.push(s.bench[1], s.lineup[0]); // a duplicate and a starter
  s.tactics.slots[8].role = 'Winger';
  s.formation = '4-3-3';
  fixLineup(s);
  assert.equal(s.bench.length, myClub(s).players.length - 11); // 17 players left: room for six
  assert.equal(new Set(s.bench).size, s.bench.length);
  assert.ok(!s.bench.includes(sold) && s.bench.every(id => !s.lineup.includes(id)));
  assert.equal(s.tactics.slots[8].role, 'Striker'); // slot 8 is a forward in 4-3-3
});

test('swap moves players between the XI, the bench and the reserves', () => {
  const s = world(3);
  takeClub(s, 0);
  myClub(s).players.push(s.market.pop()); // test squads hold 18: XI + bench, so add a reserve
  const reserve = myClub(s).players.find(p => !s.lineup.includes(p.id) && !s.bench.includes(p.id)).id;
  const [x, y, b] = [s.lineup[4], s.lineup[7], s.bench[2]];
  swap(s, x, y);
  assert.deepEqual([s.lineup[4], s.lineup[7]], [y, x]);
  swap(s, y, b);
  assert.deepEqual([s.lineup[4], s.bench[2]], [b, y]);
  swap(s, reserve, y);
  assert.equal(s.bench[2], reserve);
  assert.ok(!s.lineup.includes(y) && !s.bench.includes(y));
});

test('familiarity: each match teaches the formation played; the others fade to a floor of 0.5', () => {
  const fam = newFam();
  assert.deepEqual(fam, { '4-4-2': 1, '4-3-3': 0.5, '3-5-2': 0.5, '5-3-2': 0.5, '4-5-1': 0.5 });
  learnFam(fam, '4-3-3');
  assert.deepEqual(fam, { '4-4-2': 0.98, '4-3-3': 0.6, '3-5-2': 0.5, '5-3-2': 0.5, '4-5-1': 0.5 });
  for (let k = 0; k < 9; k++) learnFam(fam, '4-3-3');
  assert.equal(fam['4-3-3'], 1);
  assert.equal(fam['4-4-2'], 0.8);
});

test('your tactics reach your match, and playing teaches the formation', () => {
  const s = world(4);
  takeClub(s, 6);
  s.formation = '4-3-3';
  fixLineup(s);
  s.tactics.mentality = 1;
  s.tactics.slots[6].role = 'Playmaker';
  s.tactics.takers.pen = s.lineup[9];
  const m = kickOff(s), S = m.sides.find(x => !x.auto);
  assert.equal(S.tac.mentality, 1);
  assert.equal(S.on[6].role, 'Playmaker');
  assert.equal(S.takers.pen, s.lineup[9]);
  assert.deepEqual(S.bench, s.bench);
  assert.equal(S.fam['4-3-3'], 0.5);
  s.tactics.mentality = -2; // changes after kick-off stay out of the running match
  assert.equal(S.tac.mentality, 1);
  playDay(s);
  assert.equal(s.fam['4-3-3'], 0.6);
});

const season = (seed, me = null) => { const s = world(seed); if (me !== null) takeClub(s, me); while (!s.done) playDay(s); return s; };

test('the cup: every club enters, the weakest in a preliminary round, one winner after a neutral final', () => {
  const s = world(15), n = s.clubs.length; // 20 clubs: 4 preliminary ties, then 16
  assert.equal(s.cup.rounds[0].ties.length, n - 16);
  assert.deepEqual([...s.cup.byes, ...s.cup.rounds[0].ties.flatMap(t => [t.h, t.a])].sort((a, b) => a - b), s.clubs.map(c => c.id));
  const prelim = s.cup.rounds[0].ties.flatMap(t => [t.h, t.a]);
  assert.ok(s.divisions[2].clubIds.every(id => prelim.includes(id)) && prelim.every(id => s.clubs[id].div > 0), 'the weakest clubs play the preliminary round');
  const finals = [];
  while (!s.done) for (const r of playDay(s)) if (r.item.comp === 'cup' && r.item.round === cupRounds(n) - 1) finals.push(r);
  assert.equal(s.cup.rounds.length, cupRounds(n));
  for (const rd of s.cup.rounds) for (const t of rd.ties) {
    assert.ok(t.w === t.h || t.w === t.a);
    assert.equal(t.legs.length, 1);
    assert.equal(t.pens !== null, t.legs[0][0] === t.legs[0][1]); // penalties exactly when level
  }
  assert.equal(s.cup.rounds.at(-1).ties.length, 1);
  assert.equal(finals.length, 1);
  endSeason(s);
  const final = s.history[0].cup;
  assert.ok(final.winner !== final.runnerUp && [final.winner, final.runnerUp].includes(finals[0].h));
});

test('play-offs: 3rd-6th, two legs with the higher seed at home second, a final; the winner goes up', () => {
  const s = world(16);
  const legs = [];
  while (!s.done) for (const r of playDay(s)) if (r.item.comp === 'playoff') legs.push(r);
  for (const d of [1, 2]) {
    const p = s.playoffs[d], [semi1, semi2] = p.rounds[0].ties, final = p.rounds[1].ties[0];
    assert.ok([semi1, semi2, final].every(t => t.w === t.h || t.w === t.a));
    assert.deepEqual([semi1.legs.length, semi2.legs.length, final.legs.length], [2, 2, 1]);
    const first = legs.find(r => r.item.div === d && r.item.round === 0 && r.item.leg === 0 && (r.h === semi1.a));
    assert.equal(first.a, semi1.h, 'lower seed at home in the first leg');
    assert.deepEqual([final.h, final.a], [semi1.w, semi2.w]);
  }
  const tables = s.divisions.map((_, d) => table(s, d));
  assert.deepEqual(s.playoffs[1].rounds[0].ties.map(t => [t.h, t.a]), [[tables[1][2], tables[1][5]], [tables[1][3], tables[1][4]]]);
  const winners = [1, 2].map(d => s.playoffs[d].rounds[1].ties[0].w);
  endSeason(s);
  const h = s.history[0];
  for (const d of [1, 2]) {
    assert.deepEqual(h.divs[d].up, [tables[d][0], tables[d][1], winners[d - 1]]);
    assert.equal(h.divs[d].playoff, winners[d - 1]);
    for (const id of h.divs[d].up) assert.equal(s.clubs[id].div, d - 1);
  }
});

test('promotion and relegation: three up and three down at each boundary, none down from the bottom', () => {
  const s = season(17), tables = s.divisions.map((_, d) => table(s, d));
  endSeason(s);
  const h = s.history[0];
  assert.deepEqual(h.divs.map(x => [x.up.length, x.down.length]), [[0, 3], [3, 3], [3, 0]]);
  assert.deepEqual(h.divs[0].down, tables[0].slice(-3));
  for (const id of h.divs[0].down) assert.equal(s.clubs[id].div, 1);
  for (const id of h.divs[1].down) assert.equal(s.clubs[id].div, 2);
  assert.deepEqual(s.divisions.map(d => d.clubIds.length), [4, 10, 6]);
  s.divisions.forEach((d, i) => assert.ok(d.clubIds.every(id => s.clubs[id].div === i)));
  assert.equal(new Set(s.divisions.flatMap(d => d.clubIds)).size, s.clubs.length);
  assert.deepEqual(s.divisions.map(d => d.fixtures.length), [6, 18, 10]);
});

test('awards and records: the season\'s best players and the biggest numbers are kept', () => {
  const s = season(18), tables = s.divisions.map((_, d) => table(s, d));
  const players = s.clubs.flatMap(c => c.players.filter(p => p.stats).map(p => ({ p, c })));
  for (const [d, dv] of s.divisions.entries()) {
    const mine = players.filter(x => dv.clubIds.includes(x.c.id));
    const goals = mine.reduce((t, x) => t + x.p.stats.goals, 0), scored = dv.clubIds.reduce((t, id) => t + s.clubs[id].st.gf, 0);
    assert.equal(goals, scored, 'every league goal has a scorer');
  }
  const top = players.filter(x => x.c.div === 1).reduce((b, x) => !b || x.p.stats.goals > b.p.stats.goals ? x : b, null);
  const champPts = s.clubs[tables[0][0]].st.pts, topGoals = top.p.stats.goals;
  endSeason(s);
  const aw = s.history[0].divs[1].awards;
  assert.equal(aw.scorer.v, topGoals);
  assert.ok(aw.player && aw.player.v >= 3 && aw.player.v <= 10);
  assert.deepEqual(s.records[0].points, { v: champPts, club: tables[0][0], season: 1 });
  assert.equal(s.records[1].goals.v, aw.scorer.v);
  assert.ok(s.records[1].win.hg !== s.records[1].win.ag);
  assert.ok(s.clubs.some(c => c.rec.win) && s.clubs.some(c => c.rec.goals));
  assert.ok(s.clubs.every(c => c.players.every(p => p.stats === undefined)), 'season stats are cleared');
});

test('weekly income: one payment per week of the season, whatever the number of matches', () => {
  const s = world(19);
  takeClub(s, 0); // top division: tier 3
  const start = s.budget;
  let gates = 0;
  while (!s.done) for (const r of playDay(s)) if (r.h === 0 && !(r.item.comp === 'cup' && r.item.round === cupRounds(s.clubs.length) - 1)) gates++;
  const weeks = Math.floor(s.days.at(-1).day / 7) + 1;
  assert.equal(s.budget - start, weeks * 25e3 * 3 + gates * 20e3 * 3);
});

test('upcoming lists the next matches of the human club in date order, cup ties once drawn', () => {
  const s = world(20);
  takeClub(s, 16); // bottom division: in the cup's preliminary round
  const next = upcoming(s, 5);
  assert.equal(next.length, 5);
  const f = myFixture(s);
  assert.deepEqual([next[0].day, next[0].h, next[0].a, next[0].item, next[0].neutral], [s.days[0].day, f.h, f.a, f.item, false]);
  assert.ok(next.every((x, k) => (x.h === 16 || x.a === 16) && (k === 0 || x.day >= next[k - 1].day)));
  assert.ok(next.some(x => x.item.comp === 'cup'), 'the preliminary round is drawn at the start of the season');
  assert.deepEqual(upcoming({ ...s, me: null }, 5), []);
});
```

`tests/save.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { MINI } from './fixtures/mini.js';
import { takeClub, kickOff, playDay, endSeason, table } from '../src/season.js';
// A save as Phase 3 (version 4) wrote it: league rounds instead of a calendar; no cup, play-offs or records.
function asV4(s, round) {
  const o = JSON.parse(serialize(s));
  o.version = 4; o.round = round;
  for (const k of ['days', 'next', 'day', 'cup', 'playoffs', 'records']) delete o[k];
  for (const c of o.clubs) delete c.rec;
  o.history = o.history.map(h => ({ season: h.season, champions: h.divs.map(d => o.clubs[d.champion].name), pos: h.pos, prize: h.prize }));
  return o;
}
const games = s => s.clubs.reduce((t, c) => t + c.st.p, 0);
import { stepMinute } from '../src/match.js';
import { serialize, deserialize, SAVE_VERSION } from '../src/save.js';
import { BENCH, slots, newFam } from '../src/lineup.js';
import { defaultTactics } from '../src/tactics.js';

test('a career survives a save/load round trip and continues identically', () => {
  const a = createWorld(21, MINI);
  takeClub(a, 3);
  playDay(a);
  const b = deserialize(serialize(a));
  assert.deepEqual(b, a);
  playDay(a); playDay(b);
  assert.deepEqual(b, a);
});

test('deserialize returns null for missing, corrupt or wrong-version saves', () => {
  assert.equal(deserialize(null), null);
  assert.equal(deserialize(''), null);
  assert.equal(deserialize('{not json'), null);
  assert.equal(deserialize('42'), null);
  assert.equal(deserialize(JSON.stringify({ version: SAVE_VERSION + 1 })), null);
  assert.equal(deserialize(JSON.stringify({ teams: [] })), null); // the old demo's save shape
  assert.equal(deserialize('{"version":1}'), null); // right version, wrong shape
  assert.equal(deserialize(serialize({ ...createWorld(1, MINI), me: 999 })), null); // dangling club index
});

test('a career saved in the middle of a live match resumes identically', () => {
  const a = createWorld(22, MINI);
  takeClub(a, 6);
  kickOff(a);
  for (let k = 0; k < 40; k++) stepMinute(a.live);
  const b = deserialize(serialize(a));
  assert.deepEqual(b, a);
  for (const s of [a, b]) { while (!s.live.done) stepMinute(s.live); playDay(s); }
  assert.deepEqual(b, a);
});

test('a version 2 save loads: the live match slot is added and old results are dropped', () => {
  const s = createWorld(23, MINI);
  takeClub(s, 2);
  playDay(s); // round 0 of every division
  const old = { ...asV4(s, 1), version: 2, last: [[{ h: 0, a: 1, hg: 1, ag: 0, ev: [{ min: 5, club: 0, name: 'X' }] }]] };
  delete old.live; delete old.bench; delete old.tactics; delete old.fam;
  const b = deserialize(JSON.stringify(old));
  assert.equal(b.version, SAVE_VERSION);
  assert.equal(b.live, null);
  assert.equal(b.last, null);
  const before = games(b);
  playDay(b);
  assert.ok(games(b) > before);
});

test('a version 3 save loads with default tactics, also in a match in progress', () => {
  const s = createWorld(24, MINI);
  takeClub(s, 1);
  kickOff(s);
  for (let k = 0; k < 30; k++) stepMinute(s.live);
  const old = asV4(s, 0);
  old.version = 3;
  old.formation = '4-3-3'; old.lineup = [];
  delete old.bench; delete old.tactics; delete old.fam;
  for (const S of old.live.sides) { delete S.tac; delete S.takers; delete S.fam; for (const o of S.on) { delete o.role; delete o.duty; delete o.shoot; delete o.tackle; } }
  const b = deserialize(JSON.stringify(old));
  assert.equal(b.version, SAVE_VERSION);
  assert.deepEqual(b.tactics, defaultTactics(slots(b.formation)));
  assert.equal(b.fam['4-3-3'], 1);
  assert.equal(b.fam['3-5-2'], 0.5);
  assert.equal(b.live, null); // version 5: a match in progress starts again
  playDay(b);
  assert.equal(b.next, 1);
  assert.equal(b.bench.length, BENCH);
});

test('a version 4 save in mid-season: the rest of the league on the calendar, play-offs, no cup until next season', () => {
  const s = createWorld(25, MINI);
  takeClub(s, 6);
  const old = asV4(s, 5);
  old.history = [{ season: 0, champions: ['Bravo', 'Golf', 'Lima'], pos: 3, prize: 1 }];
  const b = deserialize(JSON.stringify(old));
  assert.equal(b.version, SAVE_VERSION);
  assert.deepEqual([b.cup, b.round, b.live, b.last], [null, undefined, null, null]);
  assert.deepEqual(b.history[0].divs.map(d => d.champion), [1, 6, 15]);
  assert.equal(b.history[0].div, 1);
  const leagueItems = b.days.flatMap(d => d.items).filter(i => i.comp === 'league');
  assert.equal(leagueItems.length, (6 - 5) + (18 - 5) + (10 - 5));
  assert.ok(leagueItems.every(i => i.round >= 5));
  while (!b.done) playDay(b);
  assert.ok(b.playoffs[1] && b.playoffs[2]);
  endSeason(b);
  assert.equal(b.history[1].cup, null);
  assert.equal(b.cup.rounds.length, 1); // next season has a cup again
  const done = asV4(s, 5); done.done = true;
  const c = deserialize(JSON.stringify(done));
  assert.equal(c.done, true);
  endSeason(c); // no play-offs were played: 3rd place goes up instead
  assert.equal(c.history[0].divs[1].up.length, 3);
});
```

`tests/world.test.js`:

1. Replace

```js
  assert.deepEqual(s.divisions.map(d => d.clubIds.length), [4, 6, 6]);
  assert.deepEqual(s.divisions.map(d => d.fixtures.length), [6, 10, 10]);
```

with

```js
  assert.deepEqual(s.divisions.map(d => d.clubIds.length), [4, 10, 6]);
  assert.deepEqual(s.divisions.map(d => d.fixtures.length), [6, 18, 10]);
  assert.deepEqual([s.season, s.day, s.next, s.done, s.last], [1, -1, 0, false, null]);
  assert.equal(s.days.flatMap(d => d.items).filter(i => i.comp === 'league').length, 6 + 18 + 10);
  assert.deepEqual(s.playoffs, [null, null, null]);
  assert.equal(s.cup.rounds.length, 1);
  assert.deepEqual(s.records, [0, 1, 2].map(() => ({ points: null, goals: null, win: null })));
```

2. Replace

```js
    assert.deepEqual(c.st, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
```

with

```js
    assert.deepEqual(c.st, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    assert.deepEqual(c.rec, { win: null, goals: null });
```

`tests/england.test.js`:

1. Replace

```js
import { takeClub, playRound, endSeason } from '../src/season.js';
```

with

```js
import { takeClub, playDay, endSeason } from '../src/season.js';
```

2. Replace

```js
  while (!s.done) playRound(s);
  assert.equal(s.round, 46);
```

with

```js
  while (!s.done) playDay(s);
```

3. Replace

```js
  while (!s.done) for (const div of playRound(s)) for (const r of div) {
```

with

```js
  while (!s.done) for (const r of playDay(s).filter(x => x.item.comp === 'league')) {
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `node --test tests/season.test.js tests/save.test.js tests/world.test.js tests/england.test.js`
Expected: FAIL. `playDay` and `upcoming` are not exported by `src/season.js`, and the world has no calendar.

- [ ] **Step 4: Create `src/awards.js`**

```js
// Players' season statistics, the season awards and the records. League matches only.
// p.stats = { apps, goals, assists, rating } (rating = sum of match ratings) exists once a player has
// played a league match this season; endSeason removes it.
const blank = () => ({ apps: 0, goals: 0, assists: 0, rating: 0 });
export const blankRecords = () => ({ points: null, goals: null, win: null });

// After a league match r in division d: the players' stats, and the biggest-win records of the
// division and of the winning club (a bigger winning margin replaces the old record).
export function addMatch(s, d, r) {
  const find = id => s.clubs[r.h].players.find(p => p.id === id) || s.clubs[r.a].players.find(p => p.id === id);
  for (const x of r.ratings) { const p = find(x.id); if (p) { p.stats ??= blank(); p.stats.apps++; p.stats.rating += x.rt; } }
  for (const e of r.ev) if (e.type === 'goal') {
    const p = find(e.id), a = e.assist === undefined ? null : find(e.assist);
    if (p?.stats) p.stats.goals++;
    if (a?.stats) a.stats.assists++;
  }
  const margin = Math.abs(r.hg - r.ag), win = { h: r.h, a: r.a, hg: r.hg, ag: r.ag, season: s.season };
  if (!margin) return;
  const better = old => !old || margin > Math.abs(old.hg - old.ag);
  if (better(s.records[d].win)) s.records[d].win = win;
  const club = s.clubs[r.hg > r.ag ? r.h : r.a];
  if (better(club.rec.win)) club.rec.win = win;
}

// Awards of division d: player of the season and young player (age 21 or under) by average rating,
// among players with at least half (young: a quarter) of the league games; top scorer by goals,
// fewer games first on a tie. Each is { id, name, club, v } or null.
export function seasonAwards(s, d) {
  const games = 2 * (s.divisions[d].clubIds.length - 1);
  const all = s.divisions[d].clubIds.flatMap(club => s.clubs[club].players.filter(p => p.stats).map(p => ({ p, club })));
  const avg = x => x.p.stats.rating / x.p.stats.apps, goals = x => x.p.stats.goals;
  const best = (list, f) => list.reduce((b, x) => b === null || f(x) > f(b) ? x : b, null);
  const pack = (x, f) => x && { id: x.p.id, name: x.p.name, club: x.club, v: Math.round(f(x) * 100) / 100 };
  return {
    player: pack(best(all.filter(x => x.p.stats.apps >= games / 2), avg), avg),
    scorer: pack(best(all.filter(goals), x => goals(x) - x.p.stats.apps / 1000), goals),
    young: pack(best(all.filter(x => x.p.age <= 21 && x.p.stats.apps >= games / 4), avg), avg),
  };
}

// At the end of a season (tables = final tables, awards = seasonAwards of each division):
// most points and most goals by a player in a season, per division; each club's best scorer in a season.
export function noteSeason(s, tables, awards) {
  tables.forEach((t, d) => {
    const champ = s.clubs[t[0]], rec = s.records[d], top = awards[d].scorer;
    if (!rec.points || champ.st.pts > rec.points.v) rec.points = { v: champ.st.pts, club: champ.id, season: s.season };
    if (top && (!rec.goals || top.v > rec.goals.v)) rec.goals = { ...top, season: s.season };
  });
  for (const c of s.clubs) {
    const top = c.players.filter(p => p.stats?.goals).reduce((b, p) => b === null || p.stats.goals > b.stats.goals ? p : b, null);
    if (top && (!c.rec.goals || top.stats.goals > c.rec.goals.v)) c.rec.goals = { v: top.stats.goals, id: top.id, name: top.name, season: s.season };
  }
}
```

- [ ] **Step 5: Replace `src/season.js` with**

```js
import { makeRng } from './rng.js';
import { createPlayer, ageOneYear } from './player.js';
import { blankStats, MARKET_SIZE, newFreeAgent, scheduleSeason } from './world.js';
import { slots, bestXI, autoBench, fixLineup, newFam, learnFam } from './lineup.js';
import { defaultTactics } from './tactics.js';
import { startMatch, stepMinute, matchResult, shootout } from './match.js';
import { cupRounds, nextCupRound, addLeg, decide, playoffSemis, playoffFinal } from './cup.js';
import { addMatch, seasonAwards, noteSeason } from './awards.js';

const RETIRE_AGE = 35;
const MARKET_KEEP = MARKET_SIZE / 2; // half of last season's free agents stay on the list
// Between each division and the one below: PROMOTED go up automatically, the next PLAYOFF clubs
// play off for one more place, RELEGATED come down. The bottom division has no relegation.
export const PROMOTED = 2, PLAYOFF = 4, RELEGATED = 3;
const CUP_PRIZE = 500e3;

function sample(rng, list, n) { // n distinct random elements (Fisher–Yates on a copy)
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

const tier = club => 3 - club.div; // 3 for the top division, 1 for the bottom: scales all money

export const myClub = s => s.clubs[s.me];

// The matches of one calendar item: [{ h, a, tie?, legs?, neutral }]. Knockout rounds not drawn yet
// (or a cup missing after a save migration) have none.
function fixtures(s, it) {
  if (it.comp === 'league') return s.divisions[it.div].fixtures[it.round].map(([h, a]) => ({ h, a, neutral: false }));
  const round = (it.comp === 'cup' ? s.cup : s.playoffs[it.div])?.rounds[it.round];
  if (!round) return [];
  const legs = it.comp === 'playoff' && it.round === 0 ? 2 : 1;
  const neutral = it.comp === 'cup' ? it.round === cupRounds(s.clubs.length) - 1 : it.round === 1;
  return round.ties.map(t => legs === 2 && it.leg === 0 ? { h: t.a, a: t.h, tie: t, legs, neutral } : { h: t.h, a: t.a, tie: t, legs, neutral });
}

// The human club's match on the next calendar day, with its calendar item, or null.
export function myFixture(s) {
  if (s.me === null || s.done) return null;
  for (const item of s.days[s.next].items) {
    const f = fixtures(s, item).find(x => x.h === s.me || x.a === s.me);
    if (f) return { ...f, item };
  }
  return null;
}

// The human club's next n known matches: [{ day, item, h, a, neutral }]. Knockout ties appear once drawn.
export function upcoming(s, n) {
  const out = [];
  for (let k = s.next; s.me !== null && k < s.days.length && out.length < n; k++)
    for (const item of s.days[k].items) {
      const f = fixtures(s, item).find(x => x.h === s.me || x.a === s.me);
      if (f) out.push({ day: s.days[k].day, item, h: f.h, a: f.a, neutral: f.neutral });
    }
  return out.slice(0, n);
}

export function takeClub(s, clubId) {
  s.me = clubId;
  s.budget = tier(s.clubs[clubId]) * 1.5e6;
  s.lineup = bestXI(s.clubs[clubId], s.formation);
  s.bench = autoBench(s.clubs[clubId], s.lineup);
  s.tactics = defaultTactics(slots(s.formation));
  s.fam = newFam();
}

function entry(s, id) {
  const club = s.clubs[id];
  return id === s.me ? { club, ids: s.lineup, formation: s.formation, bench: s.bench, tactics: s.tactics, fam: s.fam }
    : { club, ids: bestXI(club, '4-4-2'), formation: '4-4-2' }; // AI: best bench, default tactics (see makeSide)
}

function record(st, scored, conceded) {
  st.p++; st.gf += scored; st.ga += conceded;
  if (scored > conceded) { st.w++; st.pts += 3; } else if (scored < conceded) st.l++; else { st.d++; st.pts++; }
}

// Starts the human club's next match as a live match in s.live (returns it), or returns the one
// already started. Null when the club has no match on the next calendar day.
export function kickOff(s) {
  const f = myFixture(s);
  if (s.live || !f) return s.live;
  fixLineup(s);
  const rng = makeRng(s.seed);
  s.live = startMatch(rng.int(0, 0xffffffff), entry(s, f.h), entry(s, f.a), f.neutral);
  s.live.sides[f.h === s.me ? 0 : 1].auto = false;
  s.seed = rng.seed;
  return s.live;
}

function play(rng, s, f) {
  const m = startMatch(rng.int(0, 0xffffffff), entry(s, f.h), entry(s, f.a), f.neutral);
  while (!m.done) stepMinute(m);
  return m;
}

// Adds a finished knockout match to its tie; a tie level after its last leg goes to penalties.
function settle(f, m) {
  const t = f.tie, flip = f.h !== t.h, g = [m.sides[0].st.goals, m.sides[1].st.goals];
  if (addLeg(t, flip ? g[1] : g[0], flip ? g[0] : g[1], f.legs)) {
    const p = shootout(m);
    decide(t, flip ? [p[1], p[0]] : p);
  }
}

// Draws what follows a played calendar item: the cup's next round, the play-off semi-finals once a
// division's league is complete, the play-off final once both semi-finals are decided.
function advance(s, rng, it) {
  if (it.comp === 'cup' && s.cup && s.cup.rounds.length === it.round + 1 && it.round + 1 < cupRounds(s.clubs.length)) nextCupRound(rng, s.cup);
  if (it.comp === 'league' && it.div > 0 && it.round === s.divisions[it.div].fixtures.length - 1) s.playoffs[it.div] = playoffSemis(table(s, it.div));
  if (it.comp === 'playoff' && it.round === 0 && it.leg === 1) playoffFinal(s.playoffs[it.div]);
}

// Plays the next calendar day: every match of every competition on it. A live match is played out
// first; whatever is left of it is handed to the assistant manager (AI substitutions for both sides).
// Returns the day's results: matchResult() plus item (the calendar item it belongs to).
export function playDay(s) {
  if (s.done) return null;
  if (s.me !== null) fixLineup(s);
  const today = s.days[s.next], live = s.live, played = !!myFixture(s);
  if (live) { for (const S of live.sides) S.auto = true; while (!live.done) stepMinute(live); }
  const rng = makeRng(s.seed);
  s.last = [];
  for (const it of today.items) for (const f of fixtures(s, it)) {
    const m = live && live.sides[0].club === f.h && live.sides[1].club === f.a ? live : play(rng, s, f);
    if (f.tie) settle(f, m);
    const r = { ...matchResult(m), item: { ...it } };
    if (it.comp === 'league') { record(s.clubs[f.h].st, r.hg, r.ag); record(s.clubs[f.a].st, r.ag, r.hg); addMatch(s, it.div, r); }
    if (f.h === s.me && !f.neutral) s.budget += 20e3 * tier(s.clubs[f.h]); // gate receipts
    s.last.push(r);
  }
  for (const it of today.items) advance(s, rng, it);
  if (s.me !== null) s.budget += 25e3 * tier(myClub(s)) * (Math.floor(today.day / 7) - Math.floor(s.day / 7)); // weekly income
  if (played) learnFam(s.fam, s.formation); // the formation you prepared, not mid-match switches
  s.live = null;
  s.seed = rng.seed;
  s.day = today.day;
  s.next++;
  s.done = s.next === s.days.length;
  return s.last;
}

export function table(s, d) {
  return [...s.divisions[d].clubIds].sort((x, y) => {
    const a = s.clubs[x].st, b = s.clubs[y].st;
    return b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || x - y;
  });
}

// 'up' (promoted), 'playoff', 'down' (relegated) or null for table position pos (0 = top) in division d.
export function zone(s, d, pos) {
  if (d > 0 && pos < PROMOTED) return 'up';
  if (d > 0 && pos < PROMOTED + PLAYOFF) return 'playoff';
  if (d < s.divisions.length - 1 && pos >= s.divisions[d].clubIds.length - RELEGATED) return 'down';
  return null;
}

const winnerOf = p => p?.rounds[1]?.ties[0].w ?? null;

// Closes the season: prize money, awards, records, promotion and relegation, the history entry;
// then ages the players, refreshes the free agents and schedules the next season.
export function endSeason(s) {
  if (!s.done) return;
  const rng = makeRng(s.seed);
  const tables = s.divisions.map((_, d) => table(s, d)), awards = s.divisions.map((_, d) => seasonAwards(s, d));
  const final = s.cup?.rounds[cupRounds(s.clubs.length) - 1]?.ties[0];
  const h = {
    season: s.season, pos: null, div: null, prize: 0,
    cup: final?.w == null ? null : { winner: final.w, runnerUp: final.w === final.h ? final.a : final.h },
    divs: tables.map((t, d) => ({ champion: t[0], up: [], down: [], playoff: winnerOf(s.playoffs[d]), awards: awards[d] })),
  };
  if (s.me !== null) {
    h.div = myClub(s).div; h.pos = tables[h.div].indexOf(s.me) + 1;
    h.prize = (tables[h.div].length + 1 - h.pos) * 40e3 * tier(myClub(s));
    if (h.cup?.winner === s.me) h.prize += CUP_PRIZE;
    s.budget += h.prize;
  }
  noteSeason(s, tables, awards);
  for (let d = 0; d + 1 < tables.length; d++) {
    const below = tables[d + 1];
    h.divs[d + 1].up = [...below.slice(0, PROMOTED), h.divs[d + 1].playoff ?? below[PROMOTED]]; // no play-offs (old save): 3rd goes up
    h.divs[d].down = tables[d].slice(-RELEGATED);
  }
  h.divs.forEach((x, d) => { for (const id of x.up) s.clubs[id].div = d - 1; for (const id of x.down) s.clubs[id].div = d + 1; });
  s.divisions.forEach((dv, d) => { dv.clubIds = s.clubs.filter(c => c.div === d).map(c => c.id); });
  s.history.push(h);
  for (const c of s.clubs) {
    c.st = blankStats();
    c.players = c.players.map(p => {
      if (p.age >= RETIRE_AGE) return createPlayer(rng, s.nid++, p.pos, c.quality - 2, rng.int(17, 19)); // youth replaces retiree
      delete p.stats;
      ageOneYear(rng, p);
      return p;
    });
  }
  for (const p of s.market) delete p.stats;
  const kept = sample(rng, s.market, MARKET_KEEP).filter(p => p.age < RETIRE_AGE);
  for (const p of kept) ageOneYear(rng, p);
  s.market = [...kept, ...Array.from({ length: MARKET_SIZE - kept.length }, () => newFreeAgent(rng, s.nid++))];
  scheduleSeason(s, rng);
  s.seed = rng.seed;
  s.season++;
  if (s.me !== null) fixLineup(s);
}
```

- [ ] **Step 6: `src/world.js`** — make these replacements:

1. Replace

```js
import { defaultTactics } from './tactics.js';
```

with

```js
import { defaultTactics } from './tactics.js';
import { buildCalendar } from './calendar.js';
import { cupRounds, newCup } from './cup.js';
import { blankRecords } from './awards.js';
```

2. Replace

```js
    season: 1, round: 0, done: false,
    clubs: [], divisions: [], market: [], history: [], last: null, live: null,
  };
```

with

```js
    season: 1, day: -1, next: 0, days: [], done: false, cup: null, playoffs: [],
    clubs: [], divisions: [], market: [], history: [], records: [], last: null, live: null,
  };
```

3. Replace

```js
        st: blankStats(),
      });
```

with

```js
        st: blankStats(), rec: { win: null, goals: null },
      });
```

4. Replace

```js
    s.divisions.push({ name: league.name, clubIds, fixtures: makeFixtures(clubIds) });
  });
  for (let i = 0; i < MARKET_SIZE; i++) s.market.push(newFreeAgent(rng, s.nid++));
  s.seed = rng.seed;
  return s;
}
```

with

```js
    s.divisions.push({ name: league.name, clubIds, fixtures: [] });
    s.records.push(blankRecords());
  });
  for (let i = 0; i < MARKET_SIZE; i++) s.market.push(newFreeAgent(rng, s.nid++));
  scheduleSeason(s, rng);
  s.seed = rng.seed;
  return s;
}

// Cup seeding: top division first, then by squad quality. The weakest clubs play the preliminary round.
const seeding = clubs => [...clubs].sort((a, b) => a.div - b.div || b.quality - a.quality || a.id - b.id).map(c => c.id);

// A new season's schedule: league fixtures, the calendar, the cup's first round, no play-offs yet.
export function scheduleSeason(s, rng) {
  for (const d of s.divisions) d.fixtures = makeFixtures(d.clubIds);
  s.days = buildCalendar(s.divisions.map(d => d.fixtures.length), cupRounds(s.clubs.length));
  s.cup = newCup(rng, seeding(s.clubs));
  s.playoffs = s.divisions.map(() => null);
  s.day = -1; s.next = 0; s.done = false; s.last = null;
}
```

- [ ] **Step 7: `src/save.js`** — make these replacements:

1. Replace

```js
import { TEAM_KEYS, defaultSlot, defaultTactics } from './tactics.js';
```

with

```js
import { TEAM_KEYS, defaultSlot, defaultTactics } from './tactics.js';
import { buildCalendar } from './calendar.js';
import { blankRecords } from './awards.js';
```

2. Replace

```js
export const SAVE_VERSION = 4; // 2: clubs from real data with short, colours, kit. 3: live match, richer results. 4: tactics
```

with

```js
export const SAVE_VERSION = 5; // 2: clubs from real data with short, colours, kit. 3: live match, richer results. 4: tactics. 5: calendar, cup, play-offs, records
```

3. Replace

```js
  && Array.isArray(s.bench) && !!s.tactics && Array.isArray(s.tactics.slots) && !!s.fam && typeof s.fam === 'object';
```

with

```js
  && Array.isArray(s.bench) && !!s.tactics && Array.isArray(s.tactics.slots) && !!s.fam && typeof s.fam === 'object'
  && Array.isArray(s.days) && Number.isInteger(s.next) && Array.isArray(s.playoffs) && Array.isArray(s.records) && (s.cup === null || typeof s.cup === 'object');
```

4. Replace

```js
      for (const o of S.on) Object.assign(o, defaultSlot(o.pos));
    }
  },
```

with

```js
      for (const o of S.on) Object.assign(o, defaultSlot(o.pos));
    }
  },
  4: s => { // the calendar replaces rounds: the rest of this season's league, then its play-offs; no cup until next season
    const played = s.round;
    s.days = s.done ? [] : buildCalendar(s.divisions.map(d => d.fixtures.length), 0)
      .map(d => ({ ...d, items: d.items.filter(i => i.comp !== 'league' || i.round >= played) })).filter(d => d.items.length);
    s.next = 0; s.day = s.days.length ? s.days[0].day - 1 : -1; s.done = !s.days.length;
    s.cup = null; s.playoffs = s.divisions.map(() => null); s.last = null; s.live = null; // a match in progress starts again
    s.records = s.divisions.map(blankRecords);
    for (const c of s.clubs) c.rec = { win: null, goals: null };
    s.history = s.history.map(h => ({ season: h.season, pos: h.pos, div: h.pos === null ? null : s.clubs[s.me].div, prize: h.prize, cup: null,
      divs: h.champions.map(name => ({ champion: s.clubs.findIndex(c => c.name === name), up: [], down: [], playoff: null, awards: null })) }));
    delete s.round;
  },
```

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: PASS, 0 failures, about 125 tests. The match and England files take the longest, so the whole suite takes about 12 s.

- [ ] **Step 9: Check purity**

Run: `grep -nE "Math\.random|Date|document|window|localStorage" src/*.js src/ui/commentary.js`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add src/awards.js src/season.js src/world.js src/save.js tests/fixtures/mini.js tests/season.test.js tests/save.test.js tests/world.test.js tests/england.test.js
git commit -m "feat: season calendar with cup, play-offs, promotion and relegation, awards and records; save version 5"
```

---

### Task 4: Screens: date, calendar-aware Match screen, table zones, Cup and History tabs

**Files:**
- Modify: `src/ui/app.js`, `index.html`

**Interfaces:**
- Consumes:
  - From `src/season.js`: `playDay`, `myFixture`, `upcoming`, `zone`, `table`, `endSeason`.
  - From `src/calendar.js`: `dateLabel`.
  - From `src/cup.js`: `CUP_NAME`, `cupRoundName`, `aggregate`.
  - State: `s.days`, `s.next`, `s.cup`, `s.playoffs`, `s.history`, `s.records`, `club.rec`, `r.item`, `r.pens`.
- Produces:
  - The header shows the date of the next day.
  - The Match screen shows:
    - the competition and the venue;
    - "Continue" on days without a match for you;
    - a "Coming up" list;
    - penalties and aggregate scores in results;
    - an end-of-season line: promoted / relegated / play-offs.
  - The Table tab marks the zones and shows that division's play-offs.
  - New Cup tab: the rounds, newest first.
  - New History tab: honours, club records, seasons with champions, cup, promotions and awards, and league records. "Start next season" opens History.

- [ ] **Step 1: `src/ui/app.js`** — make these replacements; each "old" text occurs exactly once:

1. Replace

```js
import { takeClub, myClub, myFixture, kickOff, playRound, table, endSeason } from '../season.js';
```

with

```js
import { takeClub, myClub, myFixture, upcoming, kickOff, playDay, table, zone, endSeason } from '../season.js';
import { dateLabel } from '../calendar.js';
import { CUP_NAME, cupRoundName, aggregate } from '../cup.js';
```

2. Replace

```js
function report(r) {
```

with

```js
// 'Premier League, round 5', 'FA Cup Quarter-finals', 'Championship play-off semi-final, 2nd leg'.
function compLabel(it) {
  if (it.comp === 'league') return `${s.divisions[it.div].name}, round ${it.round + 1}`;
  if (it.comp === 'cup') return `${CUP_NAME} ${cupRoundName(it.round, s.clubs.length)}`;
  return `${s.divisions[it.div].name} play-off ${it.round ? 'final' : `semi-final, ${it.leg ? '2nd' : '1st'} leg`}`;
}
// ' (4–3 on penalties)' and, after a second leg, the aggregate score; '' otherwise.
function koNote(r) {
  const t = r.item.comp === 'playoff' && r.item.leg === 1 ? s.playoffs[r.item.div]?.rounds[0].ties.find(x => x.h === r.h && x.a === r.a) : null;
  const agg = t ? ` · aggregate ${aggregate(t).join('–')}` : '';
  return agg + (r.pens ? ` · ${r.pens[0]}–${r.pens[1]} on penalties` : '');
}
const scoreLine = r => `${clubName(r.h)} ${r.hg} – ${r.ag} ${clubName(r.a)}${koNote(r) ? `<span class="dim">${koNote(r)}</span>` : ''}`;

function report(r) {
```

3. Replace

```js
  return `<h2>Last round</h2><div class="score">${clubName(r.h)} ${r.hg} – ${r.ag} ${clubName(r.a)}</div>
```

with

```js
  return `<h2>${esc(compLabel(r.item))}</h2><div class="score">${scoreLine(r)}</div>
```

4. Replace

```js
  Match() {
    if (s.live) return liveView();
    const d = myClub(s).div, rounds = Math.max(...s.divisions.map(x => x.fixtures.length));
    let h = '';
    if (s.done) h += `<h2>Season ${s.season} complete — you finished ${table(s, d).indexOf(s.me) + 1} in the ${esc(s.divisions[d].name)}.</h2><button class="primary" data-act="end">Start next season</button>`;
    else {
      const f = myFixture(s);
      h += `<h2>Round ${s.round + 1} of ${rounds}</h2>` + (f
        ? `<p class="fixture">${badge(f[0], 28)} ${clubName(f[0])} v ${clubName(f[1])} ${badge(f[1], 28)} <span class="dim">(${f[0] === s.me ? 'home' : 'away'})</span></p>`
        + '<button class="primary" data-act="live">Play live</button> <button data-act="play">Quick result</button>'
        : `<p class="dim">No fixture for ${clubName(s.me)} this round — the ${esc(s.divisions[d].name)} season is over. Other divisions are still playing.</p>`
        + '<button class="primary" data-act="play">Play round</button>');
    }
    if (s.last) {
      const res = s.last[d], mine = res.find(r => r.h === s.me || r.a === s.me), others = res.filter(r => r !== mine);
      if (mine) h += report(mine);
      if (others.length) h += `<h2>Other results</h2>${others.map(r => `<div>${clubName(r.h)} ${r.hg} – ${r.ag} ${clubName(r.a)}</div>`).join('')}`;
    }
    return h;
  },
```

with

```js
  Match() {
    if (s.live) return liveView();
    const d = myClub(s).div, venue = f => f.neutral ? 'neutral ground' : f.h === s.me ? 'home' : 'away';
    let h = '';
    if (s.done) {
      const pos = table(s, d).indexOf(s.me), z = zone(s, d, pos);
      const playoff = s.playoffs[d]?.rounds[1]?.ties[0].w === s.me;
      h += `<h2>Season ${s.season} complete — you finished ${pos + 1} in the ${esc(s.divisions[d].name)}.</h2>
        <p>${z === 'up' || playoff ? 'Promoted!' : z === 'down' ? 'Relegated.' : z === 'playoff' ? 'The play-offs did not go your way.' : ''}</p>
        <button class="primary" data-act="end">Start next season</button>`;
    } else {
      const f = myFixture(s), today = s.days[s.next];
      h += `<h2>${dateLabel(today.day)}</h2>` + (f
        ? `<p>${esc(compLabel(f.item))}</p><p class="fixture">${badge(f.h, 28)} ${clubName(f.h)} v ${clubName(f.a)} ${badge(f.a, 28)} <span class="dim">(${venue(f)})</span></p>`
        + '<button class="primary" data-act="live">Play live</button> <button data-act="play">Quick result</button>'
        : `<p class="dim">No match for ${clubName(s.me)} today: ${esc([...new Set(today.items.map(compLabel))].join(' · '))}.</p>`
        + '<button class="primary" data-act="play">Continue</button>');
      const next = upcoming(s, 6).slice(f ? 1 : 0);
      if (next.length) h += `<h2>Coming up</h2><div class="wrap"><table>${next.map(x => `<tr><td>${dateLabel(x.day)}</td><td>${esc(compLabel(x.item))}</td><td>${clubName(x.h === s.me ? x.a : x.h)} <span class="dim">(${venue(x)})</span></td></tr>`).join('')}</table></div>`;
    }
    if (s.last) {
      const mine = s.last.find(r => r.h === s.me || r.a === s.me);
      const others = s.last.filter(r => r !== mine && (r.item.comp !== 'league' || r.item.div === d));
      if (mine) h += report(mine);
      if (others.length) h += `<h2>Other results</h2>${others.map(r => `<div>${scoreLine(r)} <span class="dim">· ${esc(compLabel(r.item))}</span></div>`).join('')}`;
    }
    return h;
  },
```

5. Replace

```js
    const row = (id, k) => { const t = s.clubs[id].st; return `<tr class="${id === s.me ? 'me' : ''}"><td class="n">${k + 1}</td>
```

with

```js
    const row = (id, k) => { const t = s.clubs[id].st; return `<tr class="${id === s.me ? 'me' : ''} ${zone(s, tableDiv, k) || ''}"><td class="n">${k + 1}</td>
```

6. Replace

```js
      <h2>Season ${s.season}</h2><div class="wrap"><table><tr><th class="n">#</th><th>Club</th>${cols.map(c => `<th class="n">${c}</th>`).join('')}</tr>${table(s, tableDiv).map(row).join('')}</table></div>
      ${s.history.length ? '<h2>History</h2>' + s.history.map(h => `<div>Season ${h.season}: ${esc(h.champions[0])} won the ${esc(s.divisions[0].name)} — you finished ${h.pos} (prize ${money(h.prize)})</div>`).join('') : ''}`;
  },
```

with

```js
      <h2>Season ${s.season}</h2><div class="wrap"><table><tr><th class="n">#</th><th>Club</th>${cols.map(c => `<th class="n">${c}</th>`).join('')}</tr>${table(s, tableDiv).map(row).join('')}</table></div>
      <p class="dim"><span class="key up"></span>promoted <span class="key playoff"></span>play-offs <span class="key down"></span>relegated</p>
      ${s.playoffs[tableDiv] ? `<h2>Play-offs</h2>${knockout(s.playoffs[tableDiv].rounds.map((rd, k) => [k ? 'Final' : 'Semi-finals', rd.ties]))}` : ''}`;
  },
  Cup() {
    return `<h2>${CUP_NAME} · season ${s.season}</h2>${s.cup ? knockout(s.cup.rounds.map((rd, k) => [cupRoundName(k, s.clubs.length), rd.ties]).reverse()) : '<p class="dim">No cup this season.</p>'}`;
  },
  History() {
    const name = id => id === null ? '—' : clubName(id), names = ids => ids.map(name).join(', ') || '—';
    const award = (title, a, unit) => a ? `<div>${title}: <b>${esc(a.name)}</b> <span class="dim">(${name(a.club)}, ${a.v}${unit})</span></div>` : '';
    const seasons = [...s.history].reverse().map(h => `<h3>Season ${h.season}</h3>
      ${h.pos ? `<p>You finished ${h.pos} in the ${esc(s.divisions[h.div].name)} (prize ${money(h.prize)}).</p>` : ''}
      ${h.cup ? `<div>${CUP_NAME}: <b>${name(h.cup.winner)}</b> <span class="dim">beat ${name(h.cup.runnerUp)} in the final</span></div>` : ''}
      ${h.divs.map((x, d) => `<div><b>${esc(s.divisions[d].name)}</b> champions: ${name(x.champion)}${x.up.length ? ` · promoted: ${names(x.up)}` : ''}${x.down.length ? ` · relegated: ${names(x.down)}` : ''}</div>
        ${x.awards ? award('Player of the season', x.awards.player, ' avg') + award('Top scorer', x.awards.scorer, ' goals') + award('Young player', x.awards.young, ' avg') : ''}`).join('')}`).join('');
    const rec = (title, r, f) => r ? `<div>${title}: ${f(r)} <span class="dim">(season ${r.season})</span></div>` : '';
    const win = r => `${name(r.h)} ${r.hg} – ${r.ag} ${name(r.a)}`;
    const records = s.divisions.map((dv, d) => `<h3>${esc(dv.name)}</h3>${rec('Most points', s.records[d].points, r => `${r.v}, ${name(r.club)}`)}${rec('Most goals', s.records[d].goals, r => `${r.v}, ${esc(r.name)} (${name(r.club)})`)}${rec('Biggest win', s.records[d].win, win)}`).join('');
    const club = myClub(s), honours = [];
    for (const h of s.history) {
      h.divs.forEach((x, d) => { if (x.champion === s.me) honours.push(`${esc(s.divisions[d].name)} champions ${h.season}`); if (x.playoff === s.me) honours.push(`${esc(s.divisions[d].name)} play-off winners ${h.season}`); });
      if (h.cup?.winner === s.me) honours.push(`${CUP_NAME} winners ${h.season}`);
    }
    return `<h2>${esc(club.name)}</h2>${honours.map(x => `<div>🏆 ${x}</div>`).join('') || '<p class="dim">No honours yet.</p>'}
      ${rec('Biggest win', club.rec.win, win)}${rec('Most goals in a season', club.rec.goals, r => `${r.v}, ${esc(r.name)}`)}
      <h2>Seasons</h2>${seasons || '<p class="dim">The first season is still going.</p>'}<h2>Records</h2>${records}`;
  },
```

7. Replace

```js
function profile() {
```

with

```js
// Rounds of knockout ties: [[title, ties], ...].
const knockout = rounds => rounds.map(([title, ties]) => `<h3>${esc(title)}</h3><div class="wrap"><table>${ties.map(t => `<tr class="${t.h === s.me || t.a === s.me ? 'me' : ''}">
  <td class="${t.w === t.h ? 'win' : ''}">${clubName(t.h)}</td><td class="n">${t.legs.length ? aggregate(t).join(' – ') : 'v'}</td><td class="${t.w === t.a ? 'win' : ''}">${clubName(t.a)}</td>
  <td class="dim">${t.pens ? `${t.pens[0]}–${t.pens[1]} pens` : t.legs.length > 1 ? 'agg.' : ''}</td></tr>`).join('')}</table></div>`).join('');

function profile() {
```

8. Replace

```js
  play() { stopClock(); playRound(s); subOut = null; },
```

with

```js
  play() { stopClock(); playDay(s); subOut = null; },
```

9. Replace

```js
  end() { endSeason(s); tab = 'Table'; tableDiv = myClub(s).div; },
```

with

```js
  end() { endSeason(s); tab = 'History'; tableDiv = myClub(s).div; },
```

10. Replace

```js
  $('info').innerHTML = `${badge(s.me, 22)}${clubName(s.me)} · ${esc(s.divisions[myClub(s).div].name)} · Season ${s.season} · Budget ${money(s.budget)}`;
```

with

```js
  $('info').innerHTML = `${badge(s.me, 22)}${clubName(s.me)} · ${esc(s.divisions[myClub(s).div].name)} · Season ${s.season} · ${s.done ? 'season over' : dateLabel(s.days[s.next].day)} · Budget ${money(s.budget)}`;
```

- [ ] **Step 2: `index.html`** — make this replacement:

1. Replace

```html
  tr.me td { background:#1f3a2a; font-weight:600; }
```

with

```html
  tr.me td { background:#1f3a2a; font-weight:600; }
  tr.up td:first-child, .key.up { border-left:4px solid var(--accent); }
  tr.playoff td:first-child, .key.playoff { border-left:4px solid var(--warn); }
  tr.down td:first-child, .key.down { border-left:4px solid #e0605a; }
  .key { display:inline-block; width:0; height:12px; margin:0 4px 0 10px; vertical-align:middle; }
  td.win { font-weight:600; color:var(--accent); }
```

- [ ] **Step 3: Run all tests and a syntax check of the UI**

Run: `npm test` and `node --check src/ui/app.js`
Expected: PASS, 0 failures; no syntax error.

- [ ] **Step 4: Check it in the browser** — start the `touchline` preview (port 8127).
  - **Protect the owner's save first.** Copy `localStorage['touchline.save']` to `localStorage['touchline.backup']` before testing, and restore it (and remove the backup) afterwards. Then reload the page so the restored save is the one in memory.
  - The owner's save is an old version and exercises the migration. If the browser serves cached modules, fetch each `src/**` file with `{ cache: 'reload' }` and reload.
  - **Check, with no console errors:**
    1. The old save loads, and the header shows a date.
    2. Match shows the competition, the venue and "Coming up". Quick results move the date forward, and days without a match for you say so with a "Continue" button.
    3. A cup tie appears in "Coming up", and its result appears on the Match screen.
    4. Table shows the zone marks and the legend.
    5. Cup shows the rounds with scores and penalties.
    6. Playing to the end of the season shows the end-of-season line. The play-offs appear on the Table tab of an EFL division.
    7. "Start next season" opens History, which shows champions, cup winner, promotions, relegations, awards and records.
    8. At 375 px wide, Match, Table, Cup and History have no horizontal page scroll.
  - Take a screenshot of the History tab for the end-of-phase summary.

- [ ] **Step 5: Commit**

```bash
git add src/ui/app.js index.html
git commit -m "feat: calendar, cup and history screens; table zones"
```

---

### Task 5: Phase wrap-up

**Files:**
- Modify: `docs/fun-surprises.md`, `docs/superpowers/plans/2026-11-15-touchline-roadmap.md`

- [ ] **Step 1: Retire quirk #4** — in `docs/fun-surprises.md`, in row 4:
  - prefix the "Surprise" cell with `**Retired in Phase 4.** `;
  - replace the "How to use it" cell with `Gone: since Phase 4 weekly income is paid once per calendar week, the same for every club, whatever the number of matches.`;
  - replace the "Where it lives" cell with `` `playDay()` in `src/season.js` ``.

- [ ] **Step 2: Record new quirks** — add row 8:

| 8 | **League One is a safe haven.** Nobody is relegated from the bottom division, because League Two is not in the game. A bad season there costs prize money, nothing more. | Take over a League One club and rebuild without fear of the drop. | `endSeason()` and `zone()` in `src/season.js` | Phase 4 |

Add any other minor, fun quirk the reviews or the browser check of this phase turned up and kept, numbered on from 9, "Since" = `Phase 4`.

- [ ] **Step 3: Mark the phase done** — in the roadmap table, change row 4's last cell from `to write` to `` `2026-11-15-touchline-phase-4-competitions.md` (done YYYY-MM-DD) `` with the actual completion date.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add docs/fun-surprises.md docs/superpowers/plans/2026-11-15-touchline-roadmap.md
git commit -m "docs: mark Phase 4 done; idle-round income retired, League One safe haven"
```

- [ ] **Step 6: End-of-phase summary** — report to the owner, as the roadmap requires:
  - what was built
  - the season figures (league goals and home wins, knockout matches and shootouts, cup upsets)
  - the History screenshot from Task 4
  - the fun-surprises list, new, carried-over and retired entries
