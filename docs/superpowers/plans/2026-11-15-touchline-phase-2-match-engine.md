# Touchline Phase 2 — Match Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-shot Poisson result with a minute-by-minute match simulation (possession, shots with chance quality, cards, in-match injuries, fatigue, substitutions, player ratings) and let the human manager watch their own match live with commentary, speed control, substitutions and formation changes.

**Architecture:** `src/match.js` becomes a small state machine over one plain JSON match object: `startMatch` builds it, `stepMinute` advances it one minute, `substitute`/`setFormation` change it, `matchResult` reads the result off it. `simMatch(rng, home, away)` keeps its signature and runs a whole match at once for every AI fixture. The human club's match can instead be started with `kickOff(s)` and stored in `s.live`, so it is saved with the career and survives a reload half-way through; `playRound` finishes whatever is left of it and records it like any other result. The UI ticks `stepMinute` on a timer and turns events into commentary in a separate pure module.

**Tech Stack:** Vanilla JavaScript ES modules, HTML/CSS, Node ≥ 22 built-in test runner (`node:test`, `node:assert/strict`). No npm dependencies. Local preview via the `touchline` server in `.claude/launch.json` (port 8127).

## Global Constraints

- Node version: 22 or newer. No packages are installed; `package.json` has no `dependencies` or `devDependencies`.
- Engine code (`src/*.js`, `src/data/**/*.js`) must not reference `document`, `window`, `localStorage`, `Math.random` or `Date`. Randomness comes only from an `rng` built with `makeRng` from a stored seed. `src/ui/commentary.js` follows the same rule (it is unit-tested in Node).
- State must survive `JSON.parse(JSON.stringify(state))` unchanged: no `Map`, `Set`, class instances, functions or `undefined` values in state (a live match included).
- Determinism: same seed + same inputs = same career, including a career saved and reloaded in the middle of a live match.
- `simMatch(rng, home, away)` keeps this signature (`home`/`away` are `{ club, ids, formation }`). Its result shape becomes `{ h, a, hg, ag, ev, stats, ratings }` (defined in Task 1).
- Statistical targets on a full season of the real leagues (seed 1): goals per match 2.5–2.9, home wins 43–47%, yellow cards 2.5–4 per match, red cards at most 0.3 per match.
- Substitutions: at most 5 per side per match. A player who goes off cannot come back.
- Fun surprises rule: a minor quirk that is fun or interesting for the player is kept, not fixed. Record it in `docs/fun-surprises.md` and mention it in the end-of-phase summary. Quirk #1 (the free formation edge) must survive this phase: at kick-off a side's attack and defence equal `strength()` from `src/lineup.js`, formation multipliers included.
- This is a private personal project: real club and player names are used.
- Run all tests with `npm test`. Every task ends with all tests passing and a commit. Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Design decisions (made while planning, 2026-11-15)

- **Tuning constants are already calibrated.** A prototype of exactly the code in Tasks 1–2 was run on full seasons of the real leagues with seeds 1–6: 2.72–2.83 goals per match, 44.8–46.4% home wins, ≈23% draws, ≈24 shots, ≈10 on target, ≈2.9 yellows, ≈0.2 reds and ≈0.3 injuries per match; the strongest Premier League side away at the weakest wins ≈75% of the time. Do not retune unless the calibration test in Task 2 fails.
- **Whole squad on the bench.** Every squad player not in the XI is available as a substitute. A 7-man matchday squad waits for Phase 3 squad selection.
- **Injuries and cards end at the final whistle.** Recovery times and suspensions are Phase 5.
- **No stoppage time, penalties or set pieces.** Set pieces arrive with Phase 3 set-piece takers.
- **The assistant takes over on "Skip to result".** Playing the round while a live match is in progress hands both sides to the AI substitution logic for the remaining minutes.
- **Other screens are locked during a live match.** Only the Match tab is shown while `s.live` exists, so the squad and transfers cannot change under a running match.
- **Play pauses on your own injury or red card** so the manager can react.
- **Save version 3.** `s.live` is added; results gain `stats` and `ratings` and their events gain `type` and `side`. A version-2 save loads with `live: null` and `last: null`.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lineup.js` | Exports `SLOT_WEIGHT` and a new `formationBonus()`, used by both `strength()` and the match engine |
| `src/match.js` | Rewritten: the minute-by-minute engine (`startMatch`, `stepMinute`, `power`, `substitute`, `setFormation`, `matchResult`, `simMatch`, `MAX_SUBS`) |
| `src/season.js` | `kickOff()` starts a live match; `playRound()` finishes and records it |
| `src/world.js` | New careers start with `live: null` |
| `src/save.js` | Version 3 and a migration table |
| `src/ui/commentary.js` | New: event → one line of plain-text commentary |
| `src/ui/app.js` | Live match view, match report, Play live / Quick result |
| `index.html` | Styles for the live view and the stats table |
| `tests/match.test.js` | New: engine tests |
| `tests/commentary.test.js` | New |
| `tests/season.test.js`, `tests/save.test.js`, `tests/england.test.js` | Updated / extended |
| `docs/fun-surprises.md`, `docs/superpowers/plans/2026-11-15-touchline-roadmap.md` | Phase wrap-up |

---

### Task 1: Minute-by-minute engine core

Possession, shots with chance quality, goals and assists, fatigue, player ratings and match stats. Cards, injuries and substitutions come in Task 2.

**Files:**
- Modify: `src/lineup.js` (export `SLOT_WEIGHT`; add `formationBonus`; `strength()` uses it)
- Rewrite: `src/match.js`
- Create: `tests/match.test.js`
- Modify: `tests/season.test.js` (the old `simMatch` test moves to `tests/match.test.js`)
- Modify: `src/ui/app.js` (one line: the goal list reads the new event shape)

**Interfaces:**
- Consumes: `makeRng(seed)` → `{ next, int, pick, seed }` (`src/rng.js`); `slots(formation)` → `['GK','DF',…]` (11 entries), `eff(player, pos)` → number (`src/lineup.js`). `eff` reads only `player.pos` and `player.attrs`.
- Produces:
  - `formationBonus(formation)` → `{ att, def }` multipliers (`src/lineup.js`); `SLOT_WEIGHT` exported.
  - `startMatch(seed, home, away)` → match object `m`:
    `{ seed, min, done, pl: { [playerId]: { name, pos, attrs, side, fit, rt, yc, inj, played } }, sides: [side, side], ev: [] }`
    with `side = { club, formation, auto, subs, on: [{ id, pos }], bench: [ids], st: { goals, shots, on, poss, fouls, yc, rc } }`. Side 0 is home. `auto: true` means the AI makes this side's changes.
  - `stepMinute(m)` → advances one minute (no-op when `m.done`); after minute 90 `m.done === true`.
  - `power(m, i)` → `{ att, def, ctrl }` of side `i` right now.
  - `matchResult(m)` → `{ h, a, hg, ag, ev, stats: [homeSt, awaySt], ratings: [{ id, name, side, rt }] }`, ratings 3.0–10.0, best first.
  - Events: `{ min, side, type, id, name, … }` with `type` in `'goal' | 'save' | 'miss'` in this task (goals may carry `assist`, `assistName`; shots carry `xg`).
  - `simMatch(rng, home, away)` → `matchResult` of a whole match; draws exactly one number from `rng`.

- [ ] **Step 1: Write the failing tests** — create `tests/match.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createWorld } from '../src/world.js';
import { FORMATIONS, bestXI, strength } from '../src/lineup.js';
import { startMatch, stepMinute, matchResult, simMatch, power } from '../src/match.js';
import { MINI } from './fixtures/mini.js';

const s = createWorld(3, MINI);
const side = (id, formation = '4-4-2') => ({ club: s.clubs[id], ids: bestXI(s.clubs[id], formation), formation });
const play = (seed, h, a) => { const m = startMatch(seed, h, a); while (!m.done) stepMinute(m); return m; };
const SHOTS = ['goal', 'save', 'miss'];

test('at kick-off a side is exactly as strong as its lineup, formation edge included', () => {
  for (const f of Object.keys(FORMATIONS)) {
    const m = startMatch(1, side(0, f), side(1));
    const want = strength(s.clubs[0], bestXI(s.clubs[0], f), f), got = power(m, 0);
    assert.ok(Math.abs(got.att - want.att) < 1e-9 && Math.abs(got.def - want.def) < 1e-9, f);
  }
});

test('a match lasts 90 minutes and its result adds up', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const m = play(seed, side(4), side(5)), r = matchResult(m);
    assert.equal(m.min, 90);
    assert.deepEqual([r.h, r.a], [4, 5]);
    for (const k of [0, 1]) {
      const st = r.stats[k], goals = r.ev.filter(e => e.side === k && e.type === 'goal').length;
      assert.equal(goals, k ? r.ag : r.hg);
      assert.equal(st.shots, r.ev.filter(e => e.side === k && SHOTS.includes(e.type)).length);
      assert.ok(st.shots >= st.on && st.on >= goals);
    }
    assert.equal(r.stats[0].poss + r.stats[1].poss, 90);
    assert.ok(r.ev.every((e, i) => i === 0 || r.ev[i - 1].min <= e.min));
    assert.ok(r.ratings.length >= 22 && r.ratings.every(x => x.rt >= 3 && x.rt <= 10));
    for (let i = 1; i < r.ratings.length; i++) assert.ok(r.ratings[i - 1].rt >= r.ratings[i].rt);
  }
});

test('players tire, and the fitter ones are the ones with more stamina', () => {
  const m = play(9, side(4), side(5));
  const subbedOn = new Set(m.ev.filter(e => e.type === 'sub').map(e => e.in));
  const full = m.sides.flatMap(S => S.on).filter(o => o.pos !== 'GK' && !subbedOn.has(o.id)).map(o => m.pl[o.id]);
  assert.ok(full.length > 10 && full.every(p => p.fit < 100));
  for (const a of full) for (const b of full) if (a.attrs.stamina > b.attrs.stamina) assert.ok(a.fit > b.fit);
});

test('the same seed plays the same match, also when saved and reloaded at half-time', () => {
  const a = startMatch(77, side(0), side(2));
  for (let k = 0; k < 45; k++) stepMinute(a);
  const b = JSON.parse(JSON.stringify(a));
  while (!a.done) stepMinute(a);
  while (!b.done) stepMinute(b);
  assert.deepEqual(matchResult(b), matchResult(a));
  assert.deepEqual(matchResult(play(77, side(0), side(2))), matchResult(a));
});

test('over many matches: sensible scores, a home edge, and the stronger side usually wins', () => {
  const rng = makeRng(3), strong = side(0), weak = side(15), peer = side(1);
  let goals = 0, home = 0, away = 0, strongWins = 0, weakWins = 0;
  for (let i = 0; i < 400; i++) {
    const r = simMatch(rng, strong, peer);
    goals += r.hg + r.ag;
    if (r.hg > r.ag) home++; else if (r.ag > r.hg) away++;
    const m = simMatch(rng, weak, strong);
    if (m.ag > m.hg) strongWins++; else if (m.hg > m.ag) weakWins++;
  }
  assert.ok(goals / 400 > 2.2 && goals / 400 < 3.4, `goals per match ${goals / 400}`);
  assert.ok(home > away, `home ${home} away ${away}`);
  assert.ok(strongWins > weakWins * 5, `${strongWins} vs ${weakWins}`);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/match.test.js`
Expected: FAIL — `SyntaxError: The requested module '../src/match.js' does not provide an export named …` (one of `startMatch`, `stepMinute`, `matchResult`, `power`).

- [ ] **Step 3: Refactor `src/lineup.js`** — export the slot weights and pull the formation multipliers into a function both `strength()` and the engine use.

Change the `SLOT_WEIGHT` line to:

```js
export const SLOT_WEIGHT = { GK: [0, 1.5], DF: [0, 1], MF: [0.5, 0.5], FW: [1, 0] }; // [attack, defence]
```

Replace the last two lines of `strength()` (`const [, nd, , nf] = FORMATIONS[formation];` and its `return`) and the closing brace with:

```js
  const bonus = formationBonus(formation);
  return { att: a / aw * bonus.att, def: d / dw * bonus.def };
}

// The formation edge (docs/fun-surprises.md #1): each forward beyond two adds 3% attack, each
// defender beyond four adds 3% defence. The match engine applies the same multipliers.
export function formationBonus(formation) {
  const [, nd, , nf] = FORMATIONS[formation];
  return { att: 1 + 0.03 * (nf - 2), def: 1 + 0.03 * (nd - 4) };
}
```

- [ ] **Step 4: Rewrite `src/match.js`** with the engine core:

```js
import { makeRng } from './rng.js';
import { slots, eff, SLOT_WEIGHT, formationBonus } from './lineup.js';

// Minute-by-minute match engine. A match is a plain JSON object (see startMatch), so a live match
// can sit in the career state and be saved half-way through. Each minute: one side has the ball and
// may shoot (chance quality xG, the finisher and the keeper decide the outcome), and everyone tires.
// Tuning: calibrated on the real leagues, see the 'a season of real leagues' test in tests/england.test.js.
const MINUTES = 90;
const HOME_EDGE = 1.12;      // home side's extra share of the ball and of chances
const SHOT_RATE = 0.25;      // chance per minute that the side on the ball shoots, between equal sides
const SPREAD = 40;           // how strongly an attack-vs-defence gap changes that chance
const FATIGUE = 0.3;         // fitness lost per minute by an outfielder with stamina 12
const SHOOT_WEIGHT = { GK: 0, DF: 1, MF: 2, FW: 4 };
const ASSIST_WEIGHT = { GK: 0, DF: 1, MF: 3, FW: 2 };
const CONTROL_WEIGHT = { GK: 0, DF: 0.5, MF: 1, FW: 0.5 };

function pickWeighted(rng, items, weight) {
  const total = items.reduce((t, x) => t + weight(x), 0);
  if (!total) return null;
  let r = rng.next() * total;
  for (const x of items) if ((r -= weight(x)) < 0) return x;
  return items[items.length - 1];
}
const active = (m, i) => m.sides[i].on.filter(o => !m.pl[o.id].inj);
const keeperOf = (m, i) => { const k = active(m, i).find(o => o.pos === 'GK'); return k ? m.pl[k.id] : null; };

// The whole squad snapshots into m.pl; everyone not in the XI is on the bench.
// ponytail: whole squad on the bench; a 7-man matchday squad when Phase 3 adds squad selection.
function makeSide({ club, ids, formation }, side, pl) {
  const pos = slots(formation);
  for (const p of club.players)
    pl[p.id] = { name: p.name, pos: p.pos, attrs: p.attrs, side, fit: 100, rt: 6, yc: 0, inj: false, played: ids.includes(p.id) };
  return {
    club: club.id, formation, auto: true, subs: 0,
    on: ids.map((id, k) => ({ id, pos: pos[k] })),
    bench: club.players.filter(p => !ids.includes(p.id)).map(p => p.id),
    st: { goals: 0, shots: 0, on: 0, poss: 0, fouls: 0, yc: 0, rc: 0 },
  };
}

// home/away: { club, ids, formation } as built by entry() in season.js.
export function startMatch(seed, home, away) {
  const pl = {};
  return { seed, min: 0, done: false, pl, sides: [makeSide(home, 0, pl), makeSide(away, 1, pl)], ev: [] };
}

// Attack and defence as in strength() (lineup.js), but tired players count for less, and injured or
// sent-off players count for nothing (the divisors stay those of a full XI). ctrl decides possession.
export function power(m, i) {
  const S = m.sides[i], bonus = formationBonus(S.formation);
  let a = 0, d = 0, c = 0, aw = 0, dw = 0, cw = 0;
  for (const pos of slots(S.formation)) { aw += SLOT_WEIGHT[pos][0]; dw += SLOT_WEIGHT[pos][1]; cw += CONTROL_WEIGHT[pos]; }
  for (const { id, pos } of active(m, i)) {
    const p = m.pl[id], e = eff(p, pos) * (0.7 + 0.3 * p.fit / 100);
    a += e * SLOT_WEIGHT[pos][0]; d += e * SLOT_WEIGHT[pos][1]; c += e * CONTROL_WEIGHT[pos];
  }
  return { att: a / aw * bonus.att, def: d / dw * bonus.def, ctrl: c / cw };
}

function shot(m, rng, i) {
  const S = m.sides[i], team = active(m, i), o = pickWeighted(rng, team, x => SHOOT_WEIGHT[x.pos]);
  if (!o) return;
  const p = m.pl[o.id], keeper = keeperOf(m, 1 - i);
  const xg = Math.min(0.9, (0.02 + 0.33 * rng.next() ** 2.2) * (0.6 + (p.attrs.finishing + p.attrs.composure) / 50));
  const stop = keeper ? (keeper.attrs.handling + keeper.attrs.reflexes) / 2 : 0; // nobody in goal: stop 0
  const pGoal = Math.min(0.95, xg * (1.3 - stop / 33));
  const e = { min: m.min, side: i, type: 'miss', id: o.id, name: p.name, xg: Math.round(xg * 100) / 100 };
  S.st.shots++;
  const r = rng.next();
  if (r < pGoal) {
    e.type = 'goal'; S.st.on++; S.st.goals++; p.rt += 1;
    const a = rng.next() < 0.75 ? pickWeighted(rng, team.filter(x => x !== o), x => ASSIST_WEIGHT[x.pos]) : null;
    if (a) { m.pl[a.id].rt += 0.6; e.assist = a.id; e.assistName = m.pl[a.id].name; }
    for (const x of m.sides[1 - i].on) if (x.pos === 'GK') m.pl[x.id].rt -= 0.4; else if (x.pos === 'DF') m.pl[x.id].rt -= 0.2;
  } else if (r < pGoal + 0.3) { e.type = 'save'; S.st.on++; p.rt += 0.1; if (keeper) keeper.rt += 0.2; }
  else p.rt -= 0.05;
  m.ev.push(e);
}

function tire(m) {
  for (const S of m.sides) for (const o of S.on) {
    const p = m.pl[o.id];
    p.fit = Math.max(0, p.fit - FATIGUE * (o.pos === 'GK' ? 0.4 : 1) * (1.6 - p.attrs.stamina / 20));
  }
}

function finish(m) {
  m.done = true;
  const g = m.sides.map(S => S.st.goals);
  for (const p of Object.values(m.pl)) if (p.played) {
    p.rt += 0.3 * Math.sign(g[p.side] - g[1 - p.side]);
    if (g[1 - p.side] === 0 && (p.pos === 'GK' || p.pos === 'DF')) p.rt += 0.5; // clean sheet
  }
}

// ponytail: no stoppage time, penalties or set pieces; set pieces come with Phase 3 takers.
export function stepMinute(m) {
  if (m.done) return;
  const rng = makeRng(m.seed);
  m.min++;
  const P = [power(m, 0), power(m, 1)], home = P[0].ctrl * HOME_EDGE;
  const atk = rng.next() < home / (home + P[1].ctrl) ? 0 : 1, def = 1 - atk;
  m.sides[atk].st.poss++;
  if (rng.next() < SHOT_RATE * (atk === 0 ? HOME_EDGE : 1) * Math.exp((P[atk].att - P[def].def) / SPREAD)) shot(m, rng, atk);
  tire(m);
  if (m.min === MINUTES) finish(m);
  m.seed = rng.seed;
}

// The shape season.js stores in state.last: ratings are 3.0-10.0, best first.
export function matchResult(m) {
  const [H, A] = m.sides;
  const ratings = Object.entries(m.pl).filter(([, p]) => p.played)
    .map(([id, p]) => ({ id: +id, name: p.name, side: p.side, rt: Math.round(Math.max(3, Math.min(10, p.rt)) * 10) / 10 }))
    .sort((x, y) => y.rt - x.rt);
  return { h: H.club, a: A.club, hg: H.st.goals, ag: A.st.goals, ev: m.ev, stats: [H.st, A.st], ratings };
}

export function simMatch(rng, home, away) {
  const m = startMatch(rng.int(0, 0xffffffff), home, away);
  while (!m.done) stepMinute(m);
  return matchResult(m);
}
```

- [ ] **Step 5: Update `tests/season.test.js`** — delete the whole `test('simMatch: sensible goal totals, stronger side wins more, events match the score', …)` block (it is replaced by the last test in `tests/match.test.js`), and delete the two imports it alone used:

```js
import { makeRng } from '../src/rng.js';
```

```js
import { simMatch } from '../src/match.js';
```

- [ ] **Step 6: Keep the UI's goal list working** — in `src/ui/app.js`, inside `views.Match`, replace

```js
        ${mine.ev.map(e => `<div>${e.min}' ⚽ ${esc(e.name)} <span class="dim">(${clubName(e.club)})</span></div>`).join('') || '<div class="dim">No goals.</div>'}`;
```

with

```js
        ${mine.ev.filter(e => e.type === 'goal').map(e => `<div>${e.min}' ⚽ ${esc(e.name)} <span class="dim">(${clubName(e.side ? mine.a : mine.h)})</span></div>`).join('') || '<div class="dim">No goals.</div>'}`;
```

(Task 4 replaces this whole block with the match report.)

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: PASS, 0 failures (the five new match tests included).

- [ ] **Step 8: Commit**

```bash
git add src/lineup.js src/match.js src/ui/app.js tests/match.test.js tests/season.test.js
git commit -m "feat: minute-by-minute match engine with shots, xG, fatigue and ratings"
```

---

### Task 2: Cards, injuries, substitutions and formation changes

**Files:**
- Modify: `src/match.js`
- Modify: `tests/match.test.js`
- Modify: `tests/england.test.js` (calibration test on the real leagues)

**Interfaces:**
- Consumes: everything Task 1 produced in `src/match.js`.
- Produces:
  - `MAX_SUBS` = 5.
  - `substitute(m, i, outId, inId, pos?)` → `null` on success, otherwise one of the error strings `'The match is over.'`, `'That player is not on the pitch.'`, `'That player is not on the bench.'`, `'All 5 substitutions are used.'`. The incoming player takes the outgoing player's slot (or `pos` when given) and is marked `played`. Pushes `{ min, side, type: 'sub', id: outId, name, in: inId, inName }`.
  - `setFormation(m, i, formation)` → re-slots the players on the pitch greedily into the new shape; with fewer than 11 the last slots stay empty.
  - New event types: `'yellow'`, `'red'` (with `second: true|false`), `'injury'`, `'sub'`.
  - A sent-off player is removed from `side.on`; an injured player stays in `side.on` with `pl[id].inj === true` and counts for nothing until substituted.
  - Sides with `auto: true` replace injured players at once, bring a keeper back on after a keeper's red card, and from minute 60 take off the most tired outfielder (fitness below 75) every ten minutes, at most three such changes.

- [ ] **Step 1: Write the failing tests** — in `tests/match.test.js` change the match import to

```js
import { startMatch, stepMinute, matchResult, simMatch, power, substitute, setFormation, MAX_SUBS } from '../src/match.js';
```

and add at the end of the file:

```js
test('cards: a second yellow or a straight red sends a player off for good', () => {
  let reds = 0, yellows = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const m = play(seed, side(4), side(5));
    for (const e of m.ev.filter(x => x.type === 'red')) {
      reds++;
      assert.ok(!m.sides[e.side].on.some(o => o.id === e.id), 'sent-off player is still on');
      const y = m.ev.filter(x => x.type === 'yellow' && x.id === e.id).length;
      assert.ok(e.second ? y === 2 : y <= 1, `${y} yellows before a ${e.second ? 'second-yellow' : 'straight'} red`);
    }
    for (const k of [0, 1]) {
      assert.equal(m.sides[k].on.length, 11 - m.sides[k].st.rc);
      assert.equal(m.sides[k].st.yc, m.ev.filter(x => x.side === k && x.type === 'yellow').length);
    }
    yellows += m.sides[0].st.yc + m.sides[1].st.yc;
  }
  assert.ok(reds > 0 && yellows > 300, `${reds} reds, ${yellows} yellows`);
});

test('AI sides replace injured players at once and use at most five substitutes', () => {
  let injuries = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const m = play(seed, side(4), side(5));
    for (const e of m.ev.filter(x => x.type === 'injury')) {
      injuries++;
      const before = m.ev.slice(0, m.ev.indexOf(e)).filter(x => x.type === 'sub' && x.side === e.side).length;
      if (before < MAX_SUBS) assert.ok(m.ev.some(x => x.type === 'sub' && x.id === e.id && x.min === e.min), 'injured player not replaced');
    }
    for (const S of m.sides) {
      assert.ok(S.subs <= MAX_SUBS);
      assert.equal(new Set([...S.on.map(o => o.id), ...S.bench]).size, S.on.length + S.bench.length);
    }
  }
  assert.ok(injuries > 0);
});

test('substitute: checks the request, swaps the player in, and nobody comes back', () => {
  const m = startMatch(5, side(4), side(5));
  m.sides[0].auto = false;
  const S = m.sides[0], out = S.on[5].id, sub = S.bench[0];
  assert.equal(substitute(m, 0, 99999, sub), 'That player is not on the pitch.');
  assert.equal(substitute(m, 0, out, 99999), 'That player is not on the bench.');
  assert.equal(substitute(m, 0, out, sub), null);
  assert.equal(S.on[5].id, sub);
  assert.ok(!S.bench.includes(sub) && !S.bench.includes(out));
  assert.ok(m.pl[sub].played);
  assert.deepEqual(m.ev.at(-1), { min: 0, side: 0, type: 'sub', id: out, name: m.pl[out].name, in: sub, inName: m.pl[sub].name });
  for (let k = 1; k < MAX_SUBS; k++) assert.equal(substitute(m, 0, S.on[k].id, S.bench[0]), null);
  assert.equal(substitute(m, 0, S.on[6].id, S.bench[0]), `All ${MAX_SUBS} substitutions are used.`);
  while (!m.done) stepMinute(m);
  assert.equal(m.sides[0].subs, MAX_SUBS);
  assert.equal(substitute(m, 1, m.sides[1].on[3].id, m.sides[1].bench[0]), 'The match is over.');
});

test('setFormation re-slots the same players; a side down to ten loses its last slot', () => {
  const m = startMatch(5, side(4), side(5)), ids = m.sides[0].on.map(o => o.id).sort();
  setFormation(m, 0, '4-3-3');
  assert.equal(m.sides[0].formation, '4-3-3');
  assert.deepEqual(m.sides[0].on.map(o => o.id).sort(), ids);
  assert.deepEqual(m.sides[0].on.map(o => o.pos), ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW']);
  m.sides[0].on.pop(); // as if sent off
  setFormation(m, 0, '4-4-2');
  assert.deepEqual(m.sides[0].on.map(o => o.pos), ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW']);
});
```

Add at the end of `tests/england.test.js`:

```js
test('a season of real leagues plays like real football', () => {
  const s = createWorld(1);
  let n = 0, goals = 0, home = 0, yellows = 0, reds = 0;
  while (!s.done) for (const div of playRound(s)) for (const r of div) {
    n++; goals += r.hg + r.ag; if (r.hg > r.ag) home++;
    yellows += r.stats[0].yc + r.stats[1].yc; reds += r.stats[0].rc + r.stats[1].rc;
  }
  assert.ok(goals / n >= 2.5 && goals / n <= 2.9, `goals per match ${goals / n}`);
  assert.ok(home / n >= 0.43 && home / n <= 0.47, `home wins ${home / n}`);
  assert.ok(yellows / n >= 2.5 && yellows / n <= 4, `yellows per match ${yellows / n}`);
  assert.ok(reds / n <= 0.3, `reds per match ${reds / n}`);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/match.test.js tests/england.test.js`
Expected: FAIL — `does not provide an export named 'MAX_SUBS'` (match tests), and the calibration test fails on `yellows per match 0`.

- [ ] **Step 3: Add the new constants** — in `src/match.js`, update the header comment and constants block so it reads:

```js
// Minute-by-minute match engine. A match is a plain JSON object (see startMatch), so a live match
// can sit in the career state and be saved half-way through. Each minute: one side has the ball,
// may shoot (chance quality xG, the finisher and the keeper decide the outcome), the other side may
// foul (cards), anyone may get injured, everyone tires, and AI sides make substitutions.
// Tuning: calibrated on the real leagues, see the 'a season of real leagues' test in tests/england.test.js.
export const MAX_SUBS = 5;
const MINUTES = 90;
const HOME_EDGE = 1.12;      // home side's extra share of the ball and of chances
const SHOT_RATE = 0.25;      // chance per minute that the side on the ball shoots, between equal sides
const SPREAD = 40;           // how strongly an attack-vs-defence gap changes that chance
const FOUL_RATE = 0.12, YELLOW_BASE = 0.17, STRAIGHT_RED = 0.002, INJURY_RATE = 0.003;
const FATIGUE = 0.3;         // fitness lost per minute by an outfielder with stamina 12
```

(the three `*_WEIGHT` constants below it stay as they are).

- [ ] **Step 4: Add cards, injuries, substitutions and formation changes** — in `src/match.js`, insert after the `shot()` function:

```js
function sendOff(m, i, o, second) {
  const S = m.sides[i], p = m.pl[o.id];
  S.on = S.on.filter(x => x !== o);
  S.st.rc++; p.rt -= 1.5;
  m.ev.push({ min: m.min, side: i, type: 'red', id: o.id, name: p.name, second });
}

function foul(m, rng, i) {
  const S = m.sides[i], o = pickWeighted(rng, active(m, i), x => m.pl[x.id].attrs.aggression + 1);
  if (!o) return;
  const p = m.pl[o.id], r = rng.next();
  S.st.fouls++;
  if (r < STRAIGHT_RED) sendOff(m, i, o, false);
  else if (r < YELLOW_BASE + p.attrs.aggression / 100) {
    p.yc++; p.rt -= 0.3; S.st.yc++;
    m.ev.push({ min: m.min, side: i, type: 'yellow', id: o.id, name: p.name });
    if (p.yc === 2) sendOff(m, i, o, true);
  }
}

// ponytail: the injury ends this match only; injuries with recovery time arrive in Phase 5.
function injury(m, rng, i) {
  const team = active(m, i);
  if (!team.length) return;
  const o = team[rng.int(0, team.length - 1)], p = m.pl[o.id];
  p.inj = true;
  m.ev.push({ min: m.min, side: i, type: 'injury', id: o.id, name: p.name });
}
```

and insert after the `tire()` function:

```js
// Returns an error message, or null when the change is made. The new player takes the slot of the
// one going off (or `pos` when given). A player who goes off cannot come back.
export function substitute(m, i, outId, inId, pos) {
  const S = m.sides[i], slot = S.on.find(o => o.id === outId);
  if (m.done) return 'The match is over.';
  if (!slot) return 'That player is not on the pitch.';
  if (!S.bench.includes(inId)) return 'That player is not on the bench.';
  if (S.subs >= MAX_SUBS) return `All ${MAX_SUBS} substitutions are used.`;
  S.subs++;
  S.bench = S.bench.filter(id => id !== inId);
  m.pl[inId].played = true;
  slot.id = inId;
  if (pos) slot.pos = pos;
  m.ev.push({ min: m.min, side: i, type: 'sub', id: outId, name: m.pl[outId].name, in: inId, inName: m.pl[inId].name });
  return null;
}

// Re-slots the players on the pitch into a new shape, greedily, like bestXI(). With fewer than
// eleven on the pitch the last slots (forwards first) stay empty.
export function setFormation(m, i, formation) {
  const S = m.sides[i], ids = S.on.map(o => o.id), used = new Set();
  S.formation = formation;
  S.on = slots(formation).flatMap(pos => {
    let best = null;
    for (const id of ids) if (!used.has(id) && (best === null || eff(m.pl[id], pos) > eff(m.pl[best], pos))) best = id;
    if (best === null) return [];
    used.add(best);
    return [{ id: best, pos }];
  });
}

const bestFor = (m, S, pos) => S.bench.reduce((b, id) => b === null || eff(m.pl[id], pos) > eff(m.pl[b], pos) ? id : b, null);

// AI manager: replace the injured at once, put a keeper back in goal after a keeper's red card,
// and from the hour mark take off the most tired outfielder (one per ten minutes, three at most).
function autoSubs(m, i) {
  const S = m.sides[i];
  if (S.subs >= MAX_SUBS || !S.bench.length || !S.on.length) return;
  const hurt = S.on.find(o => m.pl[o.id].inj);
  if (hurt) return void substitute(m, i, hurt.id, bestFor(m, S, hurt.pos));
  if (!S.on.some(o => o.pos === 'GK')) {
    const worst = S.on.reduce((w, o) => eff(m.pl[o.id], o.pos) < eff(m.pl[w.id], w.pos) ? o : w);
    return void substitute(m, i, worst.id, bestFor(m, S, 'GK'), 'GK');
  }
  if (m.min >= 60 && m.min % 10 === 0 && S.subs < 3) {
    const tired = S.on.filter(o => o.pos !== 'GK').reduce((w, o) => w === null || m.pl[o.id].fit < m.pl[w.id].fit ? o : w, null);
    if (tired && m.pl[tired.id].fit < 75) substitute(m, i, tired.id, bestFor(m, S, tired.pos));
  }
}
```

- [ ] **Step 5: Call them every minute** — in `stepMinute`, replace

```js
  if (rng.next() < SHOT_RATE * (atk === 0 ? HOME_EDGE : 1) * Math.exp((P[atk].att - P[def].def) / SPREAD)) shot(m, rng, atk);
  tire(m);
```

with

```js
  if (rng.next() < SHOT_RATE * (atk === 0 ? HOME_EDGE : 1) * Math.exp((P[atk].att - P[def].def) / SPREAD)) shot(m, rng, atk);
  if (rng.next() < FOUL_RATE) foul(m, rng, def);
  if (rng.next() < INJURY_RATE) injury(m, rng, rng.int(0, 1));
  tire(m);
  for (const i of [0, 1]) if (m.sides[i].auto) autoSubs(m, i);
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: PASS, 0 failures. If only the calibration test fails, print the four figures from its message and adjust `SHOT_RATE` (goals), `HOME_EDGE` (home wins) or `YELLOW_BASE` (yellows) in small steps; the prototype values above passed with seed 1.

- [ ] **Step 7: Commit**

```bash
git add src/match.js tests/match.test.js tests/england.test.js
git commit -m "feat: cards, injuries, substitutions and formation changes in the match engine"
```

---

### Task 3: Live match in the career, save version 3

**Files:**
- Modify: `src/season.js` (`kickOff`, `playRound`)
- Modify: `src/world.js` (`live: null` in a new career)
- Modify: `src/save.js` (version 3, migrations, `live` validation)
- Modify: `tests/season.test.js`, `tests/save.test.js`

**Interfaces:**
- Consumes: `startMatch`, `stepMinute`, `matchResult`, `simMatch` (Task 1); `side.auto` flag.
- Produces:
  - `state.live`: `null`, or the human club's match object while it is being played live.
  - `kickOff(s)` → the live match (creating it if needed; the human side has `auto: false`), or `null` when the season is over or the human club has no fixture this round. Draws one number from the career RNG.
  - `playRound(s)` — if `s.live` exists, sets every side to `auto: true`, plays it to the end, and records `matchResult(s.live)` as the human club's fixture; afterwards `s.live === null`.
  - `SAVE_VERSION` = 3; `deserialize` upgrades a version-2 save (adds `live: null`, sets `last: null`).

- [ ] **Step 1: Write the failing tests** — in `tests/season.test.js`, change the season import to

```js
import { takeClub, myClub, myFixture, kickOff, playRound, table, endSeason } from '../src/season.js';
```

add

```js
import { stepMinute, matchResult } from '../src/match.js';
```

and add at the end of the file:

```js
test('a live match: kick off, play it minute by minute, and the round records exactly that result', () => {
  const s = world(13);
  takeClub(s, 6); // Middle League
  const m = kickOff(s);
  assert.equal(kickOff(s), m); // already started: the same match comes back
  assert.equal(m.sides.find(S => !S.auto).club, 6);
  while (!m.done) stepMinute(m);
  const want = matchResult(m), res = playRound(s);
  assert.equal(s.live, null);
  assert.deepEqual(res[1].find(r => r.h === 6 || r.a === 6), want);
  assert.equal(s.clubs[6].st.gf, want.h === 6 ? want.hg : want.ag);
  assert.equal(s.round, 1);
});

test('playing the round during a live match hands the rest of it to the assistant', () => {
  const s = world(14);
  takeClub(s, 6);
  const m = kickOff(s);
  for (let k = 0; k < 30; k++) stepMinute(m);
  const res = playRound(s);
  const mine = res[1].find(r => r.h === 6 || r.a === 6);
  assert.equal(mine.ev.length, m.ev.length);
  assert.ok(m.done && m.sides.every(S => S.auto));
  assert.equal(s.live, null);
  assert.equal(s.clubs[6].st.p, 1);
});

test('kickOff does nothing when the human club has no fixture', () => {
  const s = world(9);
  takeClub(s, 0); // Top League: 6 rounds, the season has 10
  for (let r = 0; r < 6; r++) playRound(s);
  assert.equal(kickOff(s), null);
  assert.equal(s.live, null);
});
```

In `tests/save.test.js`, change the season import to

```js
import { takeClub, kickOff, playRound } from '../src/season.js';
import { stepMinute } from '../src/match.js';
```

and add at the end of the file:

```js
test('a career saved in the middle of a live match resumes identically', () => {
  const a = createWorld(22, MINI);
  takeClub(a, 6);
  kickOff(a);
  for (let k = 0; k < 40; k++) stepMinute(a.live);
  const b = deserialize(serialize(a));
  assert.deepEqual(b, a);
  for (const s of [a, b]) { while (!s.live.done) stepMinute(s.live); playRound(s); }
  assert.deepEqual(b, a);
});

test('a version 2 save loads: the live match slot is added and old results are dropped', () => {
  const s = createWorld(23, MINI);
  takeClub(s, 2);
  playRound(s);
  const old = { ...s, version: 2, last: [[{ h: 0, a: 1, hg: 1, ag: 0, ev: [{ min: 5, club: 0, name: 'X' }] }]] };
  delete old.live;
  const b = deserialize(JSON.stringify(old));
  assert.equal(b.version, SAVE_VERSION);
  assert.equal(b.live, null);
  assert.equal(b.last, null);
  playRound(b);
  assert.equal(b.round, 2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/season.test.js tests/save.test.js`
Expected: FAIL — `does not provide an export named 'kickOff'`.

- [ ] **Step 3: Add `kickOff` and the live branch of `playRound`** — in `src/season.js` change the match import to

```js
import { simMatch, startMatch, stepMinute, matchResult } from './match.js';
```

and replace the start of `playRound` up to and including the `const r = simMatch(…)` line:

```js
export function playRound(s) {
  if (s.done) return null;
  if (s.me !== null) fixLineup(s);
  const rng = makeRng(s.seed);
  s.last = s.divisions.map(d => (d.fixtures[s.round] || []).map(([h, a]) => { // a smaller division has finished
    const r = simMatch(rng, entry(s, h), entry(s, a));
```

with

```js
// Starts the human club's match of this round as a live match in s.live (returns it), or returns
// the one already started. Null when the club has no fixture this round.
export function kickOff(s) {
  const f = myFixture(s);
  if (s.live || s.done || !f) return s.live;
  fixLineup(s);
  const rng = makeRng(s.seed);
  s.live = startMatch(rng.int(0, 0xffffffff), entry(s, f[0]), entry(s, f[1]));
  s.live.sides[f[0] === s.me ? 0 : 1].auto = false;
  s.seed = rng.seed;
  return s.live;
}

// Plays the round. A live match is played out first; whatever is left of it is handed to the
// assistant manager (AI substitutions for both sides).
export function playRound(s) {
  if (s.done) return null;
  if (s.me !== null) fixLineup(s);
  const live = s.live;
  if (live) { for (const S of live.sides) S.auto = true; while (!live.done) stepMinute(live); }
  const rng = makeRng(s.seed);
  s.last = s.divisions.map(d => (d.fixtures[s.round] || []).map(([h, a]) => { // a smaller division has finished
    const r = live && live.sides[0].club === h ? matchResult(live) : simMatch(rng, entry(s, h), entry(s, a));
```

and, further down in `playRound`, replace

```js
  s.seed = rng.seed;
  s.round++;
```

with

```js
  s.live = null;
  s.seed = rng.seed;
  s.round++;
```

- [ ] **Step 4: New careers carry the live slot** — in `src/world.js`, in `createWorld`, change

```js
    clubs: [], divisions: [], market: [], history: [], last: null,
```

to

```js
    clubs: [], divisions: [], market: [], history: [], last: null, live: null,
```

- [ ] **Step 5: Save version 3 with a migration** — replace `src/save.js` with:

```js
// Bump when the shape of State changes, and add a migration in deserialize().
export const SAVE_VERSION = 3; // 2: clubs from real data with short, colours, kit. 3: live match, richer results
export const KEY = 'touchline.save';

export const serialize = state => JSON.stringify(state);

const valid = s => s && typeof s === 'object' && s.version === SAVE_VERSION
  && Array.isArray(s.clubs) && Array.isArray(s.divisions) && Array.isArray(s.market)
  && Array.isArray(s.lineup) && Array.isArray(s.history) && (s.me === null || s.clubs[s.me] !== undefined)
  && (s.live === null || (typeof s.live === 'object' && Array.isArray(s.live.sides)));

// MIGRATIONS[v] upgrades a save from version v to v + 1.
const MIGRATIONS = {
  2: s => { s.live = null; s.last = null; }, // old results have no stats or ratings: drop them
};

export function deserialize(text) {
  if (!text) return null;
  try {
    const s = JSON.parse(text);
    while (s && MIGRATIONS[s.version]) MIGRATIONS[s.version](s), s.version++;
    return valid(s) ? s : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add src/season.js src/world.js src/save.js tests/season.test.js tests/save.test.js
git commit -m "feat: live match in the career state; save version 3"
```

---

### Task 4: Live match screen, commentary and match report

**Files:**
- Create: `src/ui/commentary.js`, `tests/commentary.test.js`
- Modify: `src/ui/app.js`
- Modify: `index.html` (styles)

**Interfaces:**
- Consumes: `kickOff`, `playRound` (Task 3); `stepMinute`, `substitute`, `setFormation`, `MAX_SUBS` (Tasks 1–2); the result shape `{ h, a, hg, ag, ev, stats, ratings }`.
- Produces: `line(event, teamShort)` → `"<min>' <TEAM> — <text>"` (plain text; the caller escapes it). UI actions `live`, `go`, `pause`, `speed`, `liveFormation`, `off`, `on`; `play` now also stops the clock.

- [ ] **Step 1: Write the failing test** — create `tests/commentary.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { line } from '../src/ui/commentary.js';

test('commentary names the minute, team and players of each kind of event', () => {
  assert.match(line({ min: 12, side: 0, type: 'goal', id: 3, name: 'A Striker', assistName: 'B Winger' }, 'ARS'),
    /^12' ARS — GOAL! .*A Striker.*, set up by B Winger\.$/);
  assert.doesNotMatch(line({ min: 12, side: 0, type: 'goal', id: 3, name: 'A Striker' }, 'ARS'), /set up/);
  assert.equal(line({ min: 70, side: 1, type: 'sub', id: 4, name: 'Off', in: 5, inName: 'On' }, 'CHE'), "70' CHE — Substitution: On replaces Off.");
  assert.match(line({ min: 50, side: 1, type: 'red', id: 9, name: 'Hard Man', second: true }, 'LEE'), /Second yellow for Hard Man/);
  for (const type of ['save', 'miss', 'yellow', 'red', 'injury'])
    for (let min = 1; min <= 3; min++) assert.match(line({ min, side: 0, type, id: 1, name: 'Z Name' }, 'X'), /Z Name/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/commentary.test.js`
Expected: FAIL — `Cannot find module '…/src/ui/commentary.js'`.

- [ ] **Step 3: Create `src/ui/commentary.js`**

```js
// Turns a match event (src/match.js) into a line of plain-text commentary. The caller escapes it.
// The template is picked from the minute and player id, so the same match always reads the same.
const T = {
  goal: ['GOAL! {name} scores{assist}.', 'GOAL! {name} finds the net{assist}.', 'GOAL! A cool finish from {name}{assist}.'],
  save: ['{name} forces a save.', '{name} tests the keeper.', 'Good stop from a {name} effort.'],
  miss: ['{name} shoots wide.', '{name} fires over the bar.', '{name} drags it off target.'],
  yellow: ['Yellow card for {name}.', '{name} goes into the book.'],
  red: ['RED CARD! {name} is sent off.', '{name} sees red!'],
  second: ['Second yellow for {name}, and that is an early bath.'],
  injury: ['{name} is down injured and cannot continue.', '{name} pulls up injured.'],
  sub: ['Substitution: {in} replaces {name}.'],
};

export function line(e, team) {
  const list = T[e.type === 'red' && e.second ? 'second' : e.type], text = list[(e.min + e.id) % list.length];
  return `${e.min}' ${team} — ` + text.replace('{name}', e.name).replace('{in}', e.inName)
    .replace('{assist}', e.assistName ? `, set up by ${e.assistName}` : '');
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/commentary.test.js`
Expected: PASS.

- [ ] **Step 5: Wire up the live view in `src/ui/app.js`.** Make each of these edits.

5a. Imports — replace the season import line with:

```js
import { takeClub, myClub, myFixture, kickOff, playRound, table, endSeason } from '../season.js';
import { stepMinute, substitute, setFormation, MAX_SUBS } from '../match.js';
import { line } from './commentary.js';
```

5b. UI state — directly below the `let tab = 'Squad', …` line, add:

```js
let timer = null, speed = 400, subOut = null; // live match: clock, ms per match minute, player picked to come off
const SPEEDS = [['Slow', 1000], ['Normal', 400], ['Fast', 100], ['Very fast', 25]];
```

5c. Live view, report and clock — directly above `function profile() {`, add:

```js
const mySide = () => s.live.sides.findIndex(S => !S.auto);
const formationSelect = (act, current) => `<select data-act="${act}">${Object.keys(FORMATIONS).map(f => `<option${f === current ? ' selected' : ''}>${f}</option>`).join('')}</select>`;

function liveView() {
  const m = s.live, S = m.sides[mySide()], [H, A] = m.sides;
  const feed = [...m.ev].reverse().map(e => `<div class="${e.type === 'goal' ? 'goal' : ''}">${esc(line(e, s.clubs[m.sides[e.side].club].short))}</div>`).join('');
  const btn = (act, id, text) => m.done ? '' : `<button data-act="${act}" data-id="${id}">${text}</button>`;
  const onRow = o => { const p = m.pl[o.id]; return `<tr class="${subOut === o.id ? 'sel' : ''}"><td class="${o.pos !== p.pos ? 'oop' : ''}">${o.pos}</td><td>${esc(p.name)}${p.yc ? ' 🟨' : ''}${p.inj ? ' <span class="oop">injured</span>' : ''}</td><td class="n">${Math.round(p.fit)}%</td><td class="n">${p.rt.toFixed(1)}</td><td>${btn('off', o.id, 'Off')}</td></tr>`; };
  const benchRow = id => { const p = m.pl[id]; return `<tr><td class="dim">${p.pos}</td><td>${esc(p.name)}</td><td></td><td></td><td>${btn('on', id, 'On')}</td></tr>`; };
  const controls = m.done ? '<button class="primary" data-act="play">Continue</button>'
    : `<button class="primary" data-act="${timer ? 'pause' : 'go'}">${timer ? 'Pause' : m.min ? 'Resume' : 'Kick off'}</button>
      <label>Speed <select data-act="speed">${SPEEDS.map(([t, ms]) => `<option value="${ms}"${ms === speed ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Formation ${formationSelect('liveFormation', S.formation)}</label>
      <button data-act="play">Skip to result</button>`;
  return `<p class="fixture score">${badge(H.club, 28)} ${clubName(H.club)} ${H.st.goals} – ${A.st.goals} ${clubName(A.club)} ${badge(A.club, 28)}</p>
    <h2>${m.done ? 'Full time' : m.min ? `${m.min}'` : 'Kick-off'}</h2><div class="bar">${controls}</div>
    <div class="live"><div class="feed" aria-live="polite">${feed || '<div class="dim">The teams are walking out.</div>'}</div>
    <div class="wrap"><table><tr><th>Pos</th><th>On the pitch</th><th class="n">Fit</th><th class="n">Rating</th><th></th></tr>${S.on.map(onRow).join('')}
    <tr><th colspan="5">Bench · substitutions ${S.subs}/${MAX_SUBS}${subOut !== null ? ` · ${esc(m.pl[subOut].name)} comes off: pick who comes on` : ''}</th></tr>${S.bench.map(benchRow).join('')}</table></div></div>`;
}

function report(r) {
  const icon = { goal: '⚽', yellow: '🟨', red: '🟥' }, key = r.ev.filter(e => icon[e.type]);
  const total = r.stats[0].poss + r.stats[1].poss;
  const stat = (name, f) => `<tr><td class="n">${f(r.stats[0])}</td><td>${name}</td><td class="n">${f(r.stats[1])}</td></tr>`;
  const mine = r.ratings.filter(x => x.side === (r.h === s.me ? 0 : 1)), best = r.ratings[0];
  return `<h2>Last round</h2><div class="score">${clubName(r.h)} ${r.hg} – ${r.ag} ${clubName(r.a)}</div>
    ${key.map(e => `<div>${e.min}' ${icon[e.type]} ${esc(e.name)}${e.assistName ? ` <span class="dim">(assist ${esc(e.assistName)})</span>` : ''} <span class="dim">— ${clubName(e.side ? r.a : r.h)}</span></div>`).join('') || '<div class="dim">No goals or cards.</div>'}
    <div class="wrap"><table class="stats"><tr><th class="n">${esc(s.clubs[r.h].short)}</th><th></th><th class="n">${esc(s.clubs[r.a].short)}</th></tr>
    ${stat('Possession', st => Math.round(st.poss / total * 100) + '%')}${stat('Shots', st => st.shots)}${stat('On target', st => st.on)}${stat('Fouls', st => st.fouls)}${stat('Yellow cards', st => st.yc)}${stat('Red cards', st => st.rc)}</table></div>
    <p>Player of the match: <b>${esc(best.name)}</b> (${best.rt.toFixed(1)}, ${clubName(best.side ? r.a : r.h)})</p>
    <h3>Your ratings</h3><div class="wrap"><table>${mine.map(x => `<tr><td>${esc(x.name)}</td><td class="n">${x.rt.toFixed(1)}</td></tr>`).join('')}</table></div>`;
}

const stopClock = () => { clearInterval(timer); timer = null; };
const startClock = () => { stopClock(); timer = setInterval(tick, speed); };
function tick() {
  const m = s.live;
  if (!m || m.done) return stopClock();
  const seen = m.ev.length, i = mySide();
  stepMinute(m);
  if (m.done) stopClock();
  if (m.ev.slice(seen).some(e => e.side === i && (e.type === 'injury' || e.type === 'red'))) { stopClock(); msg = 'Play paused: make a change if you need one.'; }
  if (!timer || m.min % 5 === 0) save();
  render();
}
```

5d. Squad formation picker reuses the helper — in `views.Squad`, replace

```js
<label>Formation <select data-act="formation">${Object.keys(FORMATIONS).map(f => `<option${f === s.formation ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
```

with

```js
<label>Formation ${formationSelect('formation', s.formation)}</label>
```

5e. Match tab — at the top of `views.Match`, change

```js
  Match() {
    const d
```

to

```js
  Match() {
    if (s.live) return liveView();
    const d
```

then replace the fixture branch

```js
        : `<p class="dim">No fixture for ${clubName(s.me)} this round — the ${esc(s.divisions[d].name)} season is over. Other divisions are still playing.</p>`)
        + '<button class="primary" data-act="play">Play round</button>';
```

with

```js
        + '<button class="primary" data-act="live">Play live</button> <button data-act="play">Quick result</button>'
        : `<p class="dim">No fixture for ${clubName(s.me)} this round — the ${esc(s.divisions[d].name)} season is over. Other divisions are still playing.</p>`
        + '<button class="primary" data-act="play">Play round</button>');
```

and replace the two-line last-round block (the one starting `if (mine) h += \`<h2>Last round</h2>…` and ending with Task 1's goal list line) with

```js
      if (mine) h += report(mine);
```

5f. Actions — in `actions`, change `reset() { if (s.me === null` to `reset() { stopClock(); if (s.me === null`, and replace `play() { playRound(s); },` with:

```js
  play() { stopClock(); playRound(s); subOut = null; },
  live() { kickOff(s); subOut = null; },
  go() { startClock(); },
  pause() { stopClock(); },
  speed(_, el) { speed = +el.value; if (timer) startClock(); },
  liveFormation(_, el) { setFormation(s.live, mySide(), el.value); subOut = null; },
  off(id) { subOut = subOut === id ? null : id; },
  on(id) {
    if (subOut === null) { msg = 'Click Off next to the player who is coming off first.'; return; }
    msg = substitute(s.live, mySide(), subOut, id) || 'Substitution made.';
    subOut = null;
  },
```

5g. Lock the other tabs during a live match — in `render()`, replace

```js
  $('nav').innerHTML = Object.keys(views).map(
```

with

```js
  if (s.live) tab = 'Match'; // the other screens wait for the final whistle
  $('nav').innerHTML = (s.live ? ['Match'] : Object.keys(views)).map(
```

- [ ] **Step 6: Styles** — in `index.html`, directly after the `.fixture { … }` rule, add:

```css
  .live { display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start; }
  .feed { max-height:460px; overflow-y:auto; background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:8px 12px; }
  .feed .goal { color:var(--accent); font-weight:600; }
  table.stats { width:auto; min-width:280px; }
  table.stats td:nth-child(2) { text-align:center; color:var(--dim); }
  @media (max-width:700px) { .live { grid-template-columns:1fr; } }
```

- [ ] **Step 7: Run all tests and a syntax check**

Run: `npm test` then `node --check src/ui/app.js`
Expected: PASS, 0 failures; no syntax error.

- [ ] **Step 8: Check it in the browser** — `preview_start` with name `touchline`, then:
  1. Clear `localStorage`, reload, pick a club, open Match. Expect "Play live" and "Quick result".
  2. Play live → "Kick-off" heading, Kick off button, empty feed. Kick off at "Very fast": the minute counts up, commentary appears newest first, goals in green, fitness drops.
  3. Pause; click Off next to a player, then On next to a bench player → "Substitution made.", the bench header shows 1/5, the feed shows the substitution.
  4. Change Formation → the pitch list re-slots.
  5. Let it run to "Full time" → Continue → the report shows goals and cards, the stats table, player of the match and your ratings; Squad, Table and Transfers tabs are back.
  6. Play a few more matches live at "Very fast": whenever your side gets an injury or a red card, play pauses at that minute with "Play paused: make a change if you need one."
  7. Start a live match, reload the page mid-match → the same minute and score, a Resume button, and only the Match tab.
  8. Quick result still plays the round in one click.
  9. `read_console_messages` with `onlyErrors: true` → none. Resize to mobile (375px): the feed sits above the pitch list, no horizontal page scroll. Reset the viewport to desktop.

Take one screenshot of the live view for the phase summary.

- [ ] **Step 9: Commit**

```bash
git add src/ui/commentary.js src/ui/app.js index.html tests/commentary.test.js
git commit -m "feat: live match view with commentary, speed control, substitutions and a match report"
```

---

### Task 5: Phase wrap-up

**Files:**
- Modify: `docs/fun-surprises.md`
- Modify: `docs/superpowers/plans/2026-11-15-touchline-roadmap.md`

- [ ] **Step 1: Carry quirk #1 over** — in `docs/fun-surprises.md`, change the "Where it lives" cell of row 1 from `` `strength()` in `src/lineup.js` `` to `` `formationBonus()` in `src/lineup.js`, applied by `strength()` and by `power()` in `src/match.js` ``. Add to the row's "How to use it" cell: `It works mid-match too: change formation from the live view.`

- [ ] **Step 2: Record any new quirks** — for every minor, fun quirk the reviews or the browser check of this phase turned up and kept, add a row (numbered on from 5, "Since" = `Phase 2`). If none were found, add nothing.

- [ ] **Step 3: Mark the phase done** — in the roadmap table, change row 2's last cell from `to write` to `` `2026-11-15-touchline-phase-2-match-engine.md` (done YYYY-MM-DD) `` with the actual completion date.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add docs/fun-surprises.md docs/superpowers/plans/2026-11-15-touchline-roadmap.md
git commit -m "docs: mark Phase 2 done; formation edge carried into the match engine"
```

- [ ] **Step 6: End-of-phase summary** — report to the owner: what was built, the calibration figures printed by a full real-league season, the screenshot from Task 4, and the fun-surprises list (new and carried-over entries), as the roadmap requires.
