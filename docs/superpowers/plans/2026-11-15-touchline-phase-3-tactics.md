# Touchline Phase 3 — Tactics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the manager real tactical choices that the Phase 2 match engine reads: team instructions (mentality, pressing, tempo, width, defensive line), a role, a duty and two instructions per player, set-piece takers (with penalties, corners and direct free kicks added to the engine), a seven-man matchday bench, and formation familiarity.

**Architecture:** A new pure module `src/tactics.js` holds the tactics vocabulary (team instruction levels, roles with their attribute weights and event multipliers, duties, per-player instructions, takers), the defaults and the validating setters. The human club's choices live in the career state next to `formation` and `lineup` (`s.tactics`, `s.bench`, `s.fam`) and are copied into each side of a match by `makeSide()`. The engine (`src/match.js`) reads them in `power()`, `stepMinute()`, `shot()`, `foul()` and `tire()`. Every default is neutral, and AI clubs always play the defaults, so the Phase 2 calibration still holds.

**Tech Stack:** Vanilla JavaScript ES modules, HTML/CSS, Node ≥ 22 built-in test runner (`node:test`, `node:assert/strict`). No npm dependencies. Local preview via the `touchline` server in `.claude/launch.json` (port 8127).

## Global Constraints

- Node version: 22 or newer. No packages are installed; `package.json` has no `dependencies` or `devDependencies`.
- Engine code (`src/*.js`, `src/data/**/*.js`) must not reference `document`, `window`, `localStorage`, `Math.random` or `Date`. Randomness comes only from an `rng` built with `makeRng` from a stored seed. `src/ui/commentary.js` follows the same rule (it is unit-tested in Node).
- State must survive `JSON.parse(JSON.stringify(state))` unchanged: no `Map`, `Set`, class instances, functions or `undefined` values in state (a live match included).
- Determinism: same seed + same inputs = same career, including a career saved and reloaded in the middle of a live match.
- `simMatch(rng, home, away)` keeps its signature. `home`/`away` are `{ club, ids, formation }`, optionally with `bench`, `tactics` and `fam` (defined in Task 2).
- Statistical targets on a full season of the real leagues (seed 1): goals per match 2.5–2.9, home wins 43–47%, yellow cards 2.5–4 per match, red cards at most 0.3 per match, penalties 0.15–0.4 per match.
- Every default (team instruction 0, the first role of each position, duty Support, instructions 0, automatic takers, full familiarity) must leave the engine exactly as strong as Phase 2: at kick-off with default tactics a side's attack and defence equal `strength()` from `src/lineup.js`.
- Substitutions: at most 5 per side per match. A player who goes off cannot come back. The matchday bench holds 7 players.
- Fun surprises rule: a minor quirk that is fun or interesting for the player is kept, not fixed. Record it in `docs/fun-surprises.md` and mention it in the end-of-phase summary. Quirk #1 (the free formation edge) must survive this phase (roadmap: "the formation edge … must survive the tactics rewrite").
- This is a private personal project: real club and player names are used.
- Run all tests with `npm test`. Every task ends with all tests passing and a commit. Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Design decisions (made while planning, 2026-11-15)

- **Tuning is already calibrated.** A prototype of exactly the code in this plan was run before writing it.
  - **Real-league seasons, seeds 1–3:** 2.61–2.79 goals per match, 43.5–45.4% home wins, ≈24% draws, ≈2.94 yellows, ≈0.20 reds, ≈24 shots. There are 0.28 penalties per match, 76–79% of them scored. Corners produce ≈0.35 goals and direct free kicks ≈0.08 goals per match.
  - **Each team instruction:** tested over 3,000 matches on two different pairings. Every one changes points per game by at most ±0.05 against Balanced; it is a trade-off, not a free win. Which side of it pays off depends on the squad: width on crossing against passing, the high line on the defenders' pace, pressing on stamina.
  - **Best-fitting roles:** picking the best role for every slot adds on average +1.4% attack and +0.8% defence.
  - **Familiarity:** 4-3-3 unlearnt (familiarity 0.5) gives 1.05 points per game, learnt 1.20, and 4-4-2 1.12.
  - **Do not retune** unless a calibration test fails.
- **Defaults are neutral, and AI clubs use them.** AI clubs keep 4-4-2, default tactics, the best seven on the bench and full familiarity with every formation. Smarter AI managers are a later phase; until then, only you use tactics.
- **Tactics belong to slots, not players.** `s.tactics.slots[k]` is the role, duty and instructions of lineup slot `k`. Swapping two players swaps who carries out each slot's job. A formation change keeps a slot's settings when its role still fits the slot's new position, and resets it otherwise.
- **Set pieces reuse the shot budget.** A share of the shots each minute becomes a corner (18%, more when playing wide) or a direct free kick (5%), so goal rates stay calibrated. Penalties are new: 2.5% of fouls give one away.
- **Takers:** a taker is picked per kind (penalties, free kicks, corners), or "Best available". A taker who is off the pitch or injured is replaced by the best available player.
- **Matchday bench of seven.** The best player of each position first, then the best of the rest. You choose by swapping players between the XI, the bench and the reserves on the Squad screen. Only the XI and bench are copied into a match, which also makes live saves smaller.
- **Formation familiarity, human club only.** Each formation has a familiarity from 0.5 to 1. A new club knows only 4-4-2. Each match played teaches its formation +0.1 and fades the others −0.02. Familiarity 0.5 costs 3% of attack, defence and control. Quirk #1 therefore still works, but only once the shape has been learnt. Quirk #5 (re-slotting mid-match is free) still costs no substitution, but the new shape plays at its own familiarity.
- **Mid-match changes:** formation and the five team instructions can be changed. Roles, duties and player instructions cannot be changed mid-match (`ponytail:` they ride along with substitutions and formation changes; add a mid-match editor if playtests ask for it).
- **Input checks (deferred from Phase 2):** `substitute()` rejects an unknown position and `setFormation()` an unknown formation. Every setter checks own keys only, so `'constructor'` is not a role or formation.
- **Tackle harder is nearly free (new fun surprise #6).** It adds 2% to a player's defensive contribution, and its cost is more yellow cards. Until suspensions arrive in Phase 5, a yellow only matters when it is the second.
- **Save version 4.** The migration adds `bench: []` (filled by `fixLineup`), default `tactics` and a fresh `fam`. It also gives both sides of a match in progress default tactics.
- **Performance and size:** save size after one round is ≈0.84 MB (unchanged), a live match is ≈18 KB, and a round takes ≈34 ms.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/tactics.js` | New: tactics vocabulary, defaults, `fitSlots`, validating setters |
| `src/player.js` | `overall()` accepts custom attribute weights (a role's) |
| `src/lineup.js` | `eff()` rates by role; `BENCH`, `autoBench`; `fixLineup` repairs bench and slots; `swap`; familiarity (`newFam`, `learnFam`) |
| `src/match.js` | Rewritten: the engine reads tactics, adds penalties, corners and free kicks, matchday bench, `setLiveTactic`, `preview`, input checks |
| `src/world.js`, `src/season.js` | New career fields; human tactics go into the match; playing teaches familiarity |
| `src/save.js` | Version 4 and its migration |
| `src/ui/app.js`, `src/ui/commentary.js`, `index.html` | Tactics screen, bench on the Squad screen, live team instructions, set-piece commentary |
| `tests/tactics.test.js` | New |
| `tests/match.test.js`, `tests/season.test.js`, `tests/save.test.js`, `tests/england.test.js`, `tests/commentary.test.js` | Extended |
| `docs/fun-surprises.md`, `docs/superpowers/plans/2026-11-15-touchline-roadmap.md` | Phase wrap-up |

---

### Task 1: Tactics vocabulary, role ratings and the matchday bench

Pure data and helpers. Nothing in the engine reads them yet, so every existing test keeps passing.

**Files:**
- Create: `src/tactics.js`, `tests/tactics.test.js`
- Modify: `src/player.js` (`overall`), `src/lineup.js` (`eff`, `BENCH`, `autoBench`)

**Interfaces:**
- Consumes: `WEIGHTS`, `POS`, `overall` (`src/player.js`); `slots(formation)` (`src/lineup.js`).
- Produces:
  - `src/tactics.js`:
    - `TEAM`, `TEAM_KEYS`, `TEAM_NAMES`, `teamLabel(key, v)`.
    - `ROLES[pos][name] = { w, shoot?, assist?, foul?, header? }`, `DUTIES[name] = { lean, shoot }`, `INSTR`, `TAKERS`.
    - `defaultSlot(pos)` → `{ role, duty, shoot, tackle }`.
    - `defaultTactics(positions)` → `{ mentality, pressing, tempo, width, line, slots: [slot × 11], takers: { pen, fk, corner } }`.
    - `fitSlots(slots, positions)` → slots; `has(obj, key)`.
    - `setTeam(t, key, v)`, `setSlot(slot, pos, field, v)`, `setTaker(t, kind, id, squad)` → error string or `null`.
  - `overall(p, pos = p.pos, w = WEIGHTS[pos])`.
  - `eff(p, pos, role?)`.
  - `BENCH = 7`; `autoBench(club, taken)` → up to 7 ids of squad players not in `taken`.

- [ ] **Step 1: Write the failing tests** — create `tests/tactics.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEIGHTS, POS } from '../src/player.js';
import { slots, eff } from '../src/lineup.js';
import { TEAM, TEAM_KEYS, ROLES, DUTIES, INSTR, teamLabel, defaultSlot, defaultTactics, fitSlots, setTeam, setSlot, setTaker } from '../src/tactics.js';
import { createWorld } from '../src/world.js';
import { MINI } from './fixtures/mini.js';

test('defaults change nothing: the first role of a position is rated exactly like the position', () => {
  for (const pos of POS) assert.equal(ROLES[pos][defaultSlot(pos).role].w, WEIGHTS[pos]);
  const p = createWorld(1, MINI).clubs[0].players[3];
  for (const pos of POS) assert.equal(eff(p, pos, defaultSlot(pos).role), eff(p, pos));
  const t = defaultTactics(slots('4-3-3'));
  assert.deepEqual(TEAM_KEYS.map(k => t[k]), [0, 0, 0, 0, 0]);
  assert.deepEqual(t.slots.map(x => x.role), ['Goalkeeper', ...Array(4).fill('Centre-back'), ...Array(3).fill('Central midfielder'), ...Array(3).fill('Striker')]);
  assert.ok(t.slots.every(x => x.duty === 'Support' && x.shoot === 0 && x.tackle === 0));
  assert.deepEqual(t.takers, { pen: null, fk: null, corner: null });
  assert.equal(teamLabel('mentality', 0), 'Balanced');
  assert.equal(teamLabel('mentality', -2), 'Very defensive');
  assert.equal(teamLabel('line', 1), 'High');
  for (const k of TEAM_KEYS) assert.equal(TEAM[k].length % 2, 1);
});

test('every role names only real attributes', () => {
  const attrs = Object.keys(createWorld(1, MINI).clubs[0].players[0].attrs);
  for (const pos of POS) for (const [name, r] of Object.entries(ROLES[pos]))
    assert.ok(Object.keys(r.w).every(k => attrs.includes(k)), `${pos} ${name}`);
  assert.deepEqual(Object.keys(DUTIES), ['Defend', 'Support', 'Attack']);
  assert.deepEqual(Object.keys(INSTR), ['shoot', 'tackle']);
});

test('setters accept valid values and reject everything else', () => {
  const t = defaultTactics(slots('4-4-2'));
  assert.equal(setTeam(t, 'mentality', 2), null);
  assert.equal(t.mentality, 2);
  for (const [k, v] of [['mentality', 3], ['pressing', -2], ['tempo', 0.5], ['width', '1'], ['shape', 0], ['constructor', 0]])
    assert.equal(setTeam(t, k, v), 'Unknown team instruction.', `${k}=${v}`);
  assert.equal(t.mentality, 2);

  const df = t.slots[1];
  assert.equal(setSlot(df, 'DF', 'role', 'Full-back'), null);
  assert.equal(setSlot(df, 'DF', 'duty', 'Attack'), null);
  assert.equal(setSlot(df, 'DF', 'shoot', -1), null);
  assert.equal(setSlot(df, 'DF', 'tackle', 1), null);
  assert.deepEqual(df, { role: 'Full-back', duty: 'Attack', shoot: -1, tackle: 1 });
  for (const [pos, f, v] of [['DF', 'role', 'Playmaker'], ['DF', 'role', 'constructor'], ['GK', 'duty', 'Attack'], ['DF', 'duty', 'Sweep'], ['DF', 'shoot', 2], ['DF', 'pos', 'FW']])
    assert.equal(setSlot(df, pos, f, v), 'Unknown player instruction.', `${pos} ${f}=${v}`);
  assert.deepEqual(df, { role: 'Full-back', duty: 'Attack', shoot: -1, tackle: 1 });

  const squad = createWorld(1, MINI).clubs[0].players;
  assert.equal(setTaker(t, 'pen', squad[5].id, squad), null);
  assert.equal(t.takers.pen, squad[5].id);
  assert.equal(setTaker(t, 'pen', null, squad), null);
  assert.equal(t.takers.pen, null);
  assert.equal(setTaker(t, 'pen', 99999, squad), 'Unknown set-piece taker.');
  assert.equal(setTaker(t, 'throw', squad[5].id, squad), 'Unknown set-piece taker.');
});

test('fitSlots keeps slot settings whose role still fits and resets the rest', () => {
  const t = defaultTactics(slots('4-4-2'));
  setSlot(t.slots[1], 'DF', 'role', 'Full-back');
  setSlot(t.slots[8], 'MF', 'role', 'Winger');
  setSlot(t.slots[8], 'MF', 'shoot', 1);
  const next = fitSlots(t.slots, slots('4-3-3')); // slot 8 turns from MF into FW
  assert.equal(next[1].role, 'Full-back');
  assert.deepEqual(next[8], defaultSlot('FW'));
  assert.equal(next.length, 11);
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test tests/tactics.test.js`
Expected: FAIL — `Cannot find module '…/src/tactics.js'`.

- [ ] **Step 3: Create `src/tactics.js`**

```js
import { WEIGHTS } from './player.js';

// Team instructions. Each is a whole number from -n to n (the middle label is 0 and changes nothing);
// TEAM lists the labels from lowest to highest. The match engine reads them in src/match.js.
export const TEAM = {
  mentality: ['Very defensive', 'Defensive', 'Balanced', 'Attacking', 'Very attacking'],
  pressing: ['Low', 'Normal', 'High'],
  tempo: ['Slow', 'Normal', 'Fast'],
  width: ['Narrow', 'Normal', 'Wide'],
  line: ['Deep', 'Normal', 'High'],
};
export const TEAM_KEYS = Object.keys(TEAM);
export const TEAM_NAMES = { mentality: 'Mentality', pressing: 'Pressing', tempo: 'Tempo', width: 'Width', line: 'Defensive line' };
const span = key => TEAM[key].length >> 1;
export const teamLabel = (key, v) => TEAM[key][v + span(key)];

// Roles per position. `w` = attribute weights that rate a player in the role (like WEIGHTS in
// player.js); the first role of each position uses exactly WEIGHTS, so defaults change nothing.
// shoot / assist / foul / header multiply how often the player takes the shot, makes the assist,
// commits the foul or gets on the end of a corner. Missing = 1.
export const ROLES = {
  GK: { Goalkeeper: { w: WEIGHTS.GK } },
  DF: {
    'Centre-back': { w: WEIGHTS.DF, header: 1.5 },
    'Full-back': { w: { tackling: 2, pace: 2, crossing: 2, stamina: 2, positioning: 2 }, assist: 1.5, shoot: 0.6, header: 0.5 },
    'Ball-playing defender': { w: { tackling: 3, positioning: 2, passing: 2, composure: 2, heading: 1 }, assist: 1.3 },
  },
  MF: {
    'Central midfielder': { w: WEIGHTS.MF },
    'Ball winner': { w: { tackling: 3, workRate: 2, aggression: 2, stamina: 2, positioning: 2 }, foul: 1.6, shoot: 0.6, assist: 0.6 },
    Playmaker: { w: { passing: 3, vision: 3, firstTouch: 2, decisions: 2, composure: 1 }, assist: 2, shoot: 0.8 },
    Winger: { w: { crossing: 3, pace: 3, dribbling: 2, stamina: 1, firstTouch: 1 }, assist: 1.6, header: 0.5 },
  },
  FW: {
    Striker: { w: WEIGHTS.FW },
    Poacher: { w: { finishing: 3, composure: 2, positioning: 2, pace: 2, firstTouch: 1 }, shoot: 1.5, assist: 0.4 },
    'Target man': { w: { heading: 3, strength: 3, finishing: 2, firstTouch: 1 }, header: 2, assist: 1.2 },
    'Deep-lying forward': { w: { passing: 2, firstTouch: 2, vision: 2, finishing: 2, dribbling: 1, composure: 1 }, shoot: 0.7, assist: 2 },
  },
};
// Duty: lean = share of the team's attack/defence balance; shoot multiplies how often he shoots.
export const DUTIES = { Defend: { lean: -1, shoot: 0.6 }, Support: { lean: 0, shoot: 1 }, Attack: { lean: 1, shoot: 1.5 } };
// Per-player instructions, -1 / 0 / 1.
export const INSTR = { shoot: ['Shoot less', 'Normal', 'Shoot more'], tackle: ['Stay on feet', 'Normal', 'Tackle harder'] };
export const TAKERS = { pen: 'Penalties', fk: 'Free kicks', corner: 'Corners' };

export const defaultSlot = pos => ({ role: Object.keys(ROLES[pos])[0], duty: 'Support', shoot: 0, tackle: 0 });

// The human club's tactics: team instructions, one entry per lineup slot, and set-piece takers
// (a player id, or null for "best available").
export const defaultTactics = positions => ({
  ...Object.fromEntries(TEAM_KEYS.map(k => [k, 0])),
  slots: positions.map(defaultSlot),
  takers: { pen: null, fk: null, corner: null },
});

// Keeps each slot's settings when its role still fits the slot's position, else resets it.
export const fitSlots = (slots, positions) => positions.map((pos, k) => slots[k] && has(ROLES[pos], slots[k].role) ? slots[k] : defaultSlot(pos));

const isLevel = (v, n) => Number.isInteger(v) && Math.abs(v) <= n;
export const has = (o, k) => !!o && Object.hasOwn(o, k); // own keys only: 'constructor' is not a role

// Setters return an error message, or null when the change is made. `t` is s.tactics or a live side's tac.
export function setTeam(t, key, v) {
  if (!has(TEAM, key) || !isLevel(v, span(key))) return 'Unknown team instruction.';
  t[key] = v;
  return null;
}

export function setSlot(slot, pos, field, v) {
  if (field === 'role' ? !has(ROLES[pos], v) : field === 'duty' ? !has(DUTIES, v) || pos === 'GK' : !has(INSTR, field) || !isLevel(v, 1))
    return 'Unknown player instruction.';
  slot[field] = v;
  return null;
}

export function setTaker(t, kind, id, squad) {
  if (!has(TAKERS, kind) || (id !== null && !squad.some(p => p.id === id))) return 'Unknown set-piece taker.';
  t.takers[kind] = id;
  return null;
}
```

- [ ] **Step 4: Let `overall()` take a role's weights** — in `src/player.js` replace

```js
export function overall(p, pos = p.pos) {
  const w = WEIGHTS[pos];
```

with

```js
export function overall(p, pos = p.pos, w = WEIGHTS[pos]) {
```

- [ ] **Step 5: Rate by role, add the bench** — in `src/lineup.js`:

Replace the first line with

```js
import { POS, overall } from './player.js';
import { ROLES } from './tactics.js';
```

Replace the `eff` line with

```js
// How well a player fits a slot: rated by the role's attributes (the position's when no role), less out of position.
export const eff = (p, pos, role) => overall(p, pos, role ? ROLES[pos][role].w : undefined) * (p.pos === pos ? 1 : 0.85);
```

Change the comment above `bestXI` to `// Greedy slot-by-slot pick, rated by each position's default role.`

Append at the end of the file:

```js
// Matchday bench, from the squad players not in `taken`: the best of each position first, then the best of the rest.
export const BENCH = 7;
export function autoBench(club, taken) {
  const rest = club.players.filter(p => !taken.includes(p.id)).sort((a, b) => overall(b) - overall(a) || a.id - b.id);
  const first = POS.map(pos => rest.find(p => p.pos === pos)).filter(Boolean);
  return [...first, ...rest.filter(p => !first.includes(p))].slice(0, BENCH).map(p => p.id);
}
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: PASS, 0 failures (the 88 existing tests plus the 4 new ones).

- [ ] **Step 7: Commit**

```bash
git add src/tactics.js src/player.js src/lineup.js tests/tactics.test.js
git commit -m "feat: tactics vocabulary, role ratings and a matchday bench"
```

---

### Task 2: The match engine reads tactics; penalties, corners and free kicks

**Files:**
- Rewrite: `src/match.js`
- Modify: `tests/match.test.js` (imports, new tests at the end), `tests/england.test.js` (penalty target)

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces:
  - **`makeSide` input:** `{ club, ids, formation, bench?, tactics?, fam? }`. When left out: `bench` = `autoBench(club, ids)`, `tactics` = `defaultTactics(slots(formation))`, `fam` = `{}` (fully familiar). This is the shape `startMatch`/`simMatch` take.
  - **Match side:** gains `tac: { mentality, pressing, tempo, width, line }`, `takers: { pen, fk, corner }` and `fam: { [formation]: 0.5–1 }`. Each `on` entry becomes `{ id, pos, role, duty, shoot, tackle }`. `bench` holds at most 7 ids, and `m.pl` holds only the XI and bench of both sides.
  - **Events:** shot events (`goal`/`save`/`miss`) from set pieces carry `kind: 'pen' | 'corner' | 'fk'`; open-play shots have no `kind`. A corner goal's `assist` is the corner taker.
  - **New exports:** `setLiveTactic(m, i, key, v)` and `preview(entry)` → `{ att, def, ctrl }`.
  - **Errors:** `substitute(…, pos)` returns `'Unknown position.'` for a bad `pos`; `setFormation` returns `'Unknown formation.'` or `null`.

- [ ] **Step 1: Write the failing tests** — in `tests/match.test.js` replace the two import lines

```js
import { FORMATIONS, bestXI, strength } from '../src/lineup.js';
import { startMatch, stepMinute, matchResult, simMatch, power, substitute, setFormation, MAX_SUBS } from '../src/match.js';
```

with

```js
import { FORMATIONS, BENCH, slots, bestXI, strength } from '../src/lineup.js';
import { ROLES, defaultTactics } from '../src/tactics.js';
import { startMatch, stepMinute, matchResult, simMatch, power, preview, substitute, setFormation, setLiveTactic, MAX_SUBS } from '../src/match.js';
```

and append at the end of the file:

```js
const tac = (formation, change = () => {}) => { const t = defaultTactics(slots(formation)); change(t); return t; };
const mine = (id, change, formation = '4-4-2', fam = {}) => ({ ...side(id, formation), tactics: tac(formation, change), fam });
// Plays n matches of club 4 (home, with the given tactics) against club 5 and sums side 0's numbers.
function tally(change, n = 300) {
  const t = { shots: 0, against: 0, poss: 0, fouls: 0, corners: 0, xg: 0, open: 0 };
  for (let seed = 1; seed <= n; seed++) {
    const m = play(seed, mine(4, change), side(5));
    t.shots += m.sides[0].st.shots; t.against += m.sides[1].st.shots; t.poss += m.sides[0].st.poss; t.fouls += m.sides[0].st.fouls;
    for (const e of m.ev.filter(x => x.side === 0 && SHOTS.includes(x.type))) {
      if (e.kind === 'corner') t.corners++;
      if (!e.kind) { t.xg += e.xg; t.open++; }
    }
  }
  return t;
}

test('the matchday bench is seven players, a keeper among them; only they are in the match', () => {
  const m = startMatch(1, side(4), side(5));
  for (const S of m.sides) {
    assert.equal(S.bench.length, BENCH);
    assert.ok(S.bench.some(id => m.pl[id].pos === 'GK'));
    assert.ok(S.bench.every(id => !S.on.some(o => o.id === id)));
  }
  assert.equal(Object.keys(m.pl).length, 2 * (11 + BENCH));
});

test('preview is the side at kick-off; an unfamiliar formation costs 3% at familiarity 0.5', () => {
  const entry = mine(4, t => { t.mentality = 1; t.slots[5].role = 'Playmaker'; });
  assert.deepEqual(preview(entry), power(startMatch(9, entry, side(5)), 0));
  const known = preview(mine(4, undefined, '4-3-3')), raw = preview(mine(4, undefined, '4-3-3', { '4-3-3': 0.5 }));
  for (const k of ['att', 'def', 'ctrl']) assert.ok(Math.abs(raw[k] / known[k] - 0.97) < 1e-9, k);
});

test('team instructions move the match the way their names say', () => {
  const base = tally();
  const attacking = tally(t => { t.mentality = 2; }), pressing = tally(t => { t.pressing = 1; });
  const fast = tally(t => { t.tempo = 1; }), wide = tally(t => { t.width = 1; }), high = tally(t => { t.line = 1; });
  assert.ok(attacking.shots > base.shots * 1.08 && attacking.against > base.against * 1.08, 'attacking: more shots both ways');
  assert.ok(pressing.poss > base.poss && pressing.fouls > base.fouls * 1.15 && pressing.against < base.against, 'pressing');
  assert.ok(fast.shots > base.shots * 1.05 && fast.xg / fast.open < base.xg / base.open * 0.95, 'fast tempo: more, poorer shots');
  assert.ok(wide.corners > base.corners * 1.15, 'wide: more corners');
  assert.ok(high.against < base.against * 0.97, 'high line: fewer shots against');
});

test('roles, duties and instructions change who shoots and who sets up goals', () => {
  const count = (change, k) => {
    let shots = 0, assists = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const m = play(seed, mine(4, change), side(5)), id = m.sides[0].on[k]?.id ?? -1;
      for (const e of m.ev) if (e.side === 0) { if (SHOTS.includes(e.type) && !e.kind && e.id === id) shots++; if (e.assist === id) assists++; }
    }
    return { shots, assists };
  };
  const cm = count(undefined, 5), playmaker = count(t => { t.slots[5].role = 'Playmaker'; }, 5);
  assert.ok(playmaker.assists > cm.assists * 1.25, `${playmaker.assists} vs ${cm.assists}`);
  const st = count(undefined, 9), keen = count(t => { t.slots[9].duty = 'Attack'; t.slots[9].shoot = 1; }, 9);
  assert.ok(keen.shots > st.shots * 1.5, `${keen.shots} vs ${st.shots}`);
});

test('the chosen set-piece takers take penalties, free kicks and corners while they are on', () => {
  let pens = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const h = mine(4), [, , pen, fk, corner] = h.ids;
    h.tactics.takers = { pen, fk, corner };
    const m = startMatch(seed, h, side(5));
    m.sides[0].auto = false; // no AI substitutions for side 0
    while (!m.done) {
      stepMinute(m);
      const e = m.ev.at(-1), on = id => m.sides[0].on.some(o => o.id === id && !m.pl[id].inj);
      if (!e || e.side !== 0 || e.min !== m.min) continue;
      if (e.kind === 'pen' && on(pen)) { pens++; assert.equal(e.id, pen); }
      if (e.kind === 'fk' && on(fk)) assert.equal(e.id, fk);
      if (e.kind === 'corner' && e.type === 'goal' && on(corner)) assert.equal(e.assist, corner);
    }
  }
  assert.ok(pens > 20, `${pens} penalties`);
});

test('penalties: about one match in four has one, and most are scored', () => {
  let pens = 0, scored = 0;
  for (let seed = 1; seed <= 400; seed++) for (const e of play(seed, side(4), side(5)).ev) if (e.kind === 'pen') { pens++; if (e.type === 'goal') scored++; }
  assert.ok(pens / 400 > 0.15 && pens / 400 < 0.4, `${pens / 400} per match`);
  assert.ok(scored / pens > 0.65 && scored / pens < 0.9, `${scored / pens} scored`);
});

test('mid-match changes are checked; a new formation keeps the roles that still fit', () => {
  const m = startMatch(5, mine(4, t => { t.slots[1].role = 'Full-back'; t.slots[6].role = 'Playmaker'; }), side(5));
  const S = m.sides[0];
  assert.equal(setFormation(m, 0, '4-4-4'), 'Unknown formation.');
  assert.equal(setFormation(m, 0, 'constructor'), 'Unknown formation.');
  assert.equal(S.formation, '4-4-2');
  assert.equal(substitute(m, 0, S.on[3].id, S.bench[0], 'XX'), 'Unknown position.');
  assert.equal(S.subs, 0);
  assert.equal(setLiveTactic(m, 0, 'pressing', 1), null);
  assert.equal(S.tac.pressing, 1);
  assert.equal(setLiveTactic(m, 0, 'pressing', 5), 'Unknown team instruction.');
  const fb = S.on[1].id, pm = S.on[6].id;
  assert.equal(setFormation(m, 0, '4-3-3'), null);
  const slot = id => S.on.find(o => o.id === id);
  assert.equal(slot(fb).pos === 'DF' ? slot(fb).role : 'Full-back', 'Full-back');
  assert.ok(S.on.every(o => ROLES[o.pos][o.role]));
  if (slot(pm).pos === 'MF') assert.equal(slot(pm).role, 'Playmaker');
  const out = S.on.find(o => o.pos === 'MF');
  assert.equal(substitute(m, 0, out.id, S.bench[0], 'FW'), null);
  assert.deepEqual(out.role, 'Striker');
});
```

In `tests/england.test.js`, in the test `'a season of real leagues plays like real football'`:
- change `let n = 0, goals = 0, home = 0, yellows = 0, reds = 0;` to `let n = 0, goals = 0, home = 0, yellows = 0, reds = 0, pens = 0;`;
- after the line `yellows += r.stats[0].yc + r.stats[1].yc; reds += r.stats[0].rc + r.stats[1].rc;` add `    pens += r.ev.filter(e => e.kind === 'pen').length;`;
- after the `reds` assertion add `  assert.ok(pens / n >= 0.15 && pens / n <= 0.4, \`penalties per match ${pens / n}\`);`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test tests/match.test.js tests/england.test.js`
Expected: FAIL. There is a SyntaxError for the missing `preview`/`setLiveTactic` exports, and the penalty target fails.

- [ ] **Step 3: Replace `src/match.js` with**

```js
import { makeRng } from './rng.js';
import { POS } from './player.js';
import { FORMATIONS, slots, eff, SLOT_WEIGHT, formationBonus, autoBench } from './lineup.js';
import { ROLES, DUTIES, TEAM_KEYS, defaultSlot, defaultTactics, setTeam, has } from './tactics.js';

// Minute-by-minute match engine. A match is a plain JSON object (see startMatch), so a live match
// can sit in the career state and be saved half-way through. Each minute: one side has the ball,
// may shoot (open play, a corner or a direct free kick; chance quality xG, the finisher and the
// keeper decide the outcome), the other side may foul (cards, sometimes a penalty), anyone may get
// injured, everyone tires, and AI sides make substitutions. Tactics (src/tactics.js) shift all of it.
// Tuning: calibrated on the real leagues, see the 'a season of real leagues' test in tests/england.test.js.
export const MAX_SUBS = 5;
const MINUTES = 90;
const HOME_EDGE = 1.12;      // home side's extra share of the ball and of chances
const K = { // tuning; see the calibration note above
  SHOT_RATE: 0.25,      // chance per minute that the side on the ball shoots, between equal sides
  SPREAD: 40,           // how strongly an attack-vs-defence gap changes that chance
  FOUL_RATE: 0.12, YELLOW_BASE: 0.17, STRAIGHT_RED: 0.002, INJURY_RATE: 0.003,
  FATIGUE: 0.3,         // fitness lost per minute by an outfielder with stamina 12
  PEN_SHARE: 0.025,     // share of fouls that give away a penalty
  CORNER_SHARE: 0.18, FK_SHARE: 0.05, // share of shots from a corner / a direct free kick
  FAM_WEIGHT: 0.06,     // a side wholly unfamiliar with its formation loses this share of its power
  MENTALITY: 0.04, LEAN: 0.015, TACKLE_DEF: 0.02, TACKLE_CARD: 0.05,
  PRESS_CTRL: 0.05, PRESS_SHOTS: 0.03, PRESS_FOULS: 0.3, PRESS_TIRE: 0.3,
  TEMPO_SHOTS: 0.12, TEMPO_XG: 0.1, TEMPO_CTRL: 0.04, TEMPO_TIRE: 0.05,
  WIDTH_XG: 0.02, WIDTH0: -2, WIDTH_CORNERS: 0.3,
  LINE_SHOTS: 0.06, LINE_XG: 0.06, LINE_PACE: 0.012, LINE_PACE0: 12,
};
const SHOOT_WEIGHT = { GK: 0, DF: 1, MF: 2, FW: 4 };
const ASSIST_WEIGHT = { GK: 0, DF: 1, MF: 3, FW: 2 };
const CONTROL_WEIGHT = { GK: 0, DF: 0.5, MF: 1, FW: 0.5 };
const SHOOT_INSTR = [[0.5, 1.1], [1, 1], [1.6, 0.88]]; // shoot less / normal / more: [how often, chance quality]
const TACKLE_FOUL = [0.6, 1, 1.6];
const TAKER = { // who takes a set piece when the manager has not picked anyone (or he is off the pitch)
  pen: p => p.attrs.finishing + p.attrs.composure,
  fk: p => p.attrs.finishing + p.attrs.crossing,
  corner: p => p.attrs.crossing + p.attrs.vision,
};

function pickWeighted(rng, items, weight) {
  const total = items.reduce((t, x) => t + weight(x), 0);
  if (!total) return null;
  let r = rng.next() * total;
  for (const x of items) if ((r -= weight(x)) < 0) return x;
  return items[items.length - 1];
}
const active = (m, i) => m.sides[i].on.filter(o => !m.pl[o.id].inj);
const keeperOf = (m, i) => { const k = active(m, i).find(o => o.pos === 'GK'); return k ? m.pl[k.id] : null; };
const role = o => ROLES[o.pos][o.role];
const avg = (list, f) => list.length ? list.reduce((t, x) => t + f(x), 0) / list.length : 0;

// home/away: { club, ids, formation, bench, tactics, fam } as built by entry() in season.js. AI sides
// leave out the last three: the best bench, default tactics, and full familiarity with every formation.
function makeSide({ club, ids, formation, bench = autoBench(club, ids), tactics = defaultTactics(slots(formation)), fam = {} }, side, pl) {
  const pos = slots(formation);
  for (const id of [...ids, ...bench]) {
    const p = club.players.find(x => x.id === id);
    pl[id] = { name: p.name, pos: p.pos, attrs: p.attrs, side, fit: 100, rt: 6, yc: 0, inj: false, played: ids.includes(id) };
  }
  return {
    club: club.id, formation, auto: true, subs: 0,
    tac: Object.fromEntries(TEAM_KEYS.map(k => [k, tactics[k]])), takers: { ...tactics.takers }, fam: { ...fam },
    on: ids.map((id, k) => ({ id, pos: pos[k], ...tactics.slots[k] })),
    bench: [...bench],
    st: { goals: 0, shots: 0, on: 0, poss: 0, fouls: 0, yc: 0, rc: 0 },
  };
}

export function startMatch(seed, home, away) {
  const pl = {};
  return { seed, min: 0, done: false, pl, sides: [makeSide(home, 0, pl), makeSide(away, 1, pl)], ev: [] };
}

// Attack, defence and ball control of side i right now. Like strength() (lineup.js) at kick-off with
// default tactics, but tired players count for less, injured or sent-off players for nothing (the
// divisors stay those of a full XI), and tactics and formation familiarity shift the result.
export function power(m, i) {
  const S = m.sides[i], t = S.tac, bonus = formationBonus(S.formation);
  const fam = 1 - K.FAM_WEIGHT * (1 - (S.fam[S.formation] ?? 1));
  let a = 0, d = 0, c = 0, aw = 0, dw = 0, cw = 0, lean = 0;
  for (const pos of slots(S.formation)) { aw += SLOT_WEIGHT[pos][0]; dw += SLOT_WEIGHT[pos][1]; cw += CONTROL_WEIGHT[pos]; }
  for (const o of active(m, i)) {
    const p = m.pl[o.id], e = eff(p, o.pos, o.role) * (0.7 + 0.3 * p.fit / 100);
    a += e * SLOT_WEIGHT[o.pos][0]; d += e * SLOT_WEIGHT[o.pos][1] * (1 + K.TACKLE_DEF * o.tackle); c += e * CONTROL_WEIGHT[o.pos];
    lean += DUTIES[o.duty].lean;
  }
  const tilt = K.MENTALITY * t.mentality + K.LEAN * lean;
  return {
    att: a / aw * bonus.att * fam * (1 + tilt),
    def: d / dw * bonus.def * fam * (1 - tilt),
    ctrl: c / cw * fam * (1 + K.PRESS_CTRL * t.pressing - K.TEMPO_CTRL * t.tempo),
  };
}

function taker(m, i, kind) {
  const team = active(m, i).filter(o => o.pos !== 'GK'), want = m.sides[i].takers[kind];
  return team.find(o => o.id === want) || team.reduce((b, o) => !b || TAKER[kind](m.pl[o.id]) > TAKER[kind](m.pl[b.id]) ? o : b, null);
}

// One attempt on goal by player o of side i. pGoal null = decided by chance quality and the keeper.
function attempt(m, rng, i, o, xg, kind, assistFrom, pGoal = null) {
  const S = m.sides[i], p = m.pl[o.id], keeper = keeperOf(m, 1 - i);
  const stop = keeper ? (keeper.attrs.handling + keeper.attrs.reflexes) / 2 : 0; // nobody in goal: stop 0
  pGoal ??= Math.min(0.95, xg * (1.3 - stop / 33));
  const e = { min: m.min, side: i, type: 'miss', id: o.id, name: p.name, xg: Math.round(xg * 100) / 100 };
  if (kind !== 'open') e.kind = kind;
  S.st.shots++;
  const r = rng.next();
  if (r < pGoal) {
    e.type = 'goal'; S.st.on++; S.st.goals++; p.rt += 1;
    const a = assistFrom && assistFrom();
    if (a) { m.pl[a.id].rt += 0.6; e.assist = a.id; e.assistName = m.pl[a.id].name; }
    for (const x of m.sides[1 - i].on) if (x.pos === 'GK') m.pl[x.id].rt -= 0.4; else if (x.pos === 'DF') m.pl[x.id].rt -= 0.2;
  } else if (r < pGoal + (kind === 'pen' ? 0.7 * (1 - pGoal) : 0.3)) { e.type = 'save'; S.st.on++; p.rt += 0.1; if (keeper) keeper.rt += 0.2; }
  else p.rt -= 0.05;
  m.ev.push(e);
}

function shot(m, rng, i) {
  const S = m.sides[i], D = m.sides[1 - i], team = active(m, i), r = rng.next();
  const defs = active(m, 1 - i).filter(o => o.pos === 'DF');
  const pace = defs.length ? avg(defs, o => m.pl[o.id].attrs.pace) : K.LINE_PACE0;
  const conceded = 1 + D.tac.line * (K.LINE_XG + K.LINE_PACE * (K.LINE_PACE0 - pace)); // a high line with slow defenders leaks chances
  const corner = K.CORNER_SHARE * (1 + K.WIDTH_CORNERS * S.tac.width);
  if (r < corner) {
    const t = taker(m, i, 'corner'), o = t && pickWeighted(rng, team.filter(x => x !== t), x => (m.pl[x.id].attrs.heading + 1) * (role(x).header ?? 1));
    if (!o) return;
    const xg = Math.min(0.9, (0.02 + 0.2 * rng.next() ** 2.2) * (0.6 + (m.pl[o.id].attrs.heading + m.pl[t.id].attrs.crossing) / 50) * conceded);
    return attempt(m, rng, i, o, xg, 'corner', () => t);
  }
  if (r < corner + K.FK_SHARE) {
    const o = taker(m, i, 'fk');
    if (!o) return;
    const p = m.pl[o.id], xg = Math.min(0.9, (0.03 + 0.08 * rng.next()) * (0.6 + (p.attrs.finishing + p.attrs.crossing) / 50) * conceded);
    return attempt(m, rng, i, o, xg, 'fk', null);
  }
  const o = pickWeighted(rng, team, x => SHOOT_WEIGHT[x.pos] * (role(x).shoot ?? 1) * DUTIES[x.duty].shoot * SHOOT_INSTR[x.shoot + 1][0]);
  if (!o) return;
  const p = m.pl[o.id], outfield = team.filter(x => x.pos !== 'GK');
  const width = 1 + K.WIDTH_XG * S.tac.width * (avg(outfield, x => m.pl[x.id].attrs.crossing - m.pl[x.id].attrs.passing) - K.WIDTH0);
  const xg = Math.min(0.9, (0.02 + 0.33 * rng.next() ** 2.2) * (0.6 + (p.attrs.finishing + p.attrs.composure) / 50)
    * SHOOT_INSTR[o.shoot + 1][1] * (1 - K.TEMPO_XG * S.tac.tempo) * width * conceded);
  attempt(m, rng, i, o, xg, 'open', () => rng.next() < 0.75 ? pickWeighted(rng, team.filter(x => x !== o), x => ASSIST_WEIGHT[x.pos] * (role(x).assist ?? 1)) : null);
}

function penalty(m, rng, i) {
  const o = taker(m, i, 'pen');
  if (!o) return;
  const p = m.pl[o.id], keeper = keeperOf(m, 1 - i), stop = keeper ? (keeper.attrs.handling + keeper.attrs.reflexes) / 2 : 0;
  attempt(m, rng, i, o, 0.76, 'pen', null, Math.max(0.4, Math.min(0.95, 0.6 + 0.01 * (p.attrs.finishing + p.attrs.composure) - 0.008 * stop)));
}

function sendOff(m, i, o, second) {
  const S = m.sides[i], p = m.pl[o.id];
  S.on = S.on.filter(x => x !== o);
  S.st.rc++; p.rt -= 1.5;
  m.ev.push({ min: m.min, side: i, type: 'red', id: o.id, name: p.name, second });
}

function foul(m, rng, i) {
  const S = m.sides[i], o = pickWeighted(rng, active(m, i), x => (m.pl[x.id].attrs.aggression + 1) * (role(x).foul ?? 1) * TACKLE_FOUL[x.tackle + 1]);
  if (!o) return;
  const p = m.pl[o.id], r = rng.next();
  S.st.fouls++;
  if (r < K.STRAIGHT_RED) sendOff(m, i, o, false);
  else if (r < K.YELLOW_BASE + p.attrs.aggression / 100 + K.TACKLE_CARD * o.tackle) {
    p.yc++; p.rt -= 0.3; S.st.yc++;
    m.ev.push({ min: m.min, side: i, type: 'yellow', id: o.id, name: p.name });
    if (p.yc === 2) sendOff(m, i, o, true);
  }
  if (rng.next() < K.PEN_SHARE) penalty(m, rng, 1 - i);
}

// ponytail: the injury ends this match only; injuries with recovery time arrive in Phase 5.
function injury(m, rng, i) {
  const team = active(m, i);
  if (!team.length) return;
  const o = team[rng.int(0, team.length - 1)], p = m.pl[o.id];
  p.inj = true;
  m.ev.push({ min: m.min, side: i, type: 'injury', id: o.id, name: p.name });
}

function tire(m) {
  for (const S of m.sides) {
    const t = 1 + K.PRESS_TIRE * S.tac.pressing + K.TEMPO_TIRE * S.tac.tempo;
    for (const o of S.on) {
      const p = m.pl[o.id];
      p.fit = Math.max(0, p.fit - K.FATIGUE * t * (o.pos === 'GK' ? 0.4 : 1) * (1.6 - p.attrs.stamina / 20));
    }
  }
}

// Returns an error message, or null when the change is made. The new player takes the slot of the
// one going off, with its role and instructions (or `pos` with that position's default role).
// A player who goes off cannot come back.
export function substitute(m, i, outId, inId, pos) {
  const S = m.sides[i], slot = S.on.find(o => o.id === outId);
  if (m.done) return 'The match is over.';
  if (!slot) return 'That player is not on the pitch.';
  if (!S.bench.includes(inId)) return 'That player is not on the bench.';
  if (S.subs >= MAX_SUBS) return `All ${MAX_SUBS} substitutions are used.`;
  if (pos !== undefined && !POS.includes(pos)) return 'Unknown position.';
  S.subs++;
  S.bench = S.bench.filter(id => id !== inId);
  m.pl[inId].played = true;
  slot.id = inId;
  if (!pos && m.pl[inId].pos === 'GK' && !S.on.some(o => o.pos === 'GK')) pos = 'GK'; // keeper back in goal after a red card
  if (pos && pos !== slot.pos) Object.assign(slot, defaultSlot(pos), { pos });
  m.ev.push({ min: m.min, side: i, type: 'sub', id: outId, name: m.pl[outId].name, in: inId, inName: m.pl[inId].name });
  return null;
}

// Re-slots the players on the pitch into a new shape, greedily, like bestXI(); each keeps his role
// and instructions where the role fits his new position. With fewer than eleven on the pitch the
// last slots (forwards first) stay empty. Returns an error message or null.
export function setFormation(m, i, formation) {
  if (!has(FORMATIONS, formation)) return 'Unknown formation.';
  const S = m.sides[i], old = S.on, used = new Set();
  S.formation = formation;
  S.on = slots(formation).flatMap(pos => {
    let best = null;
    for (const o of old) if (!used.has(o) && (best === null || eff(m.pl[o.id], pos) > eff(m.pl[best.id], pos))) best = o;
    if (best === null) return [];
    used.add(best);
    const { id, role, ...instr } = best;
    return [{ ...instr, ...(has(ROLES[pos], role) ? { role } : defaultSlot(pos)), id, pos }];
  });
  return null;
}

// Changes one team instruction of side i mid-match (see TEAM in tactics.js).
export const setLiveTactic = (m, i, key, v) => setTeam(m.sides[i].tac, key, v);

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

function finish(m) {
  m.done = true;
  const g = m.sides.map(S => S.st.goals);
  for (const p of Object.values(m.pl)) if (p.played) {
    p.rt += 0.3 * Math.sign(g[p.side] - g[1 - p.side]);
    if (g[1 - p.side] === 0 && (p.pos === 'GK' || p.pos === 'DF')) p.rt += 0.5; // clean sheet
  }
}

// ponytail: no stoppage time.
export function stepMinute(m) {
  if (m.done) return;
  const rng = makeRng(m.seed);
  m.min++;
  const P = [power(m, 0), power(m, 1)], home = P[0].ctrl * HOME_EDGE;
  const atk = rng.next() < home / (home + P[1].ctrl) ? 0 : 1, def = 1 - atk, ta = m.sides[atk].tac, td = m.sides[def].tac;
  m.sides[atk].st.poss++;
  const chance = K.SHOT_RATE * (atk === 0 ? HOME_EDGE : 1) * Math.exp((P[atk].att - P[def].def) / K.SPREAD)
    * (1 + K.TEMPO_SHOTS * ta.tempo) * (1 - K.LINE_SHOTS * td.line - K.PRESS_SHOTS * td.pressing);
  if (rng.next() < chance) shot(m, rng, atk);
  if (rng.next() < K.FOUL_RATE * (1 + K.PRESS_FOULS * td.pressing)) foul(m, rng, def);
  if (rng.next() < K.INJURY_RATE) injury(m, rng, rng.int(0, 1));
  tire(m);
  for (const i of [0, 1]) if (m.sides[i].auto) autoSubs(m, i);
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

// Attack, defence and control of a lineup before kick-off, tactics included (for the Squad screen).
export function preview(entry) {
  const pl = {};
  return power({ pl, sides: [makeSide(entry, 0, pl)] }, 0);
}
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, 0 failures. The calibration test should print nothing. On seed 1 the prototype gave 2.613 goals, 0.454 home wins and 0.276 penalties per match. The parity test (`at kick-off a side is exactly as strong as its lineup`) must still pass unchanged: it guards quirk #1 and the neutral defaults.

- [ ] **Step 5: Commit**

```bash
git add src/match.js tests/match.test.js tests/england.test.js
git commit -m "feat: match engine reads tactics; penalties, corners and free kicks"
```

---

### Task 3: Tactics in the career, familiarity, save version 4

**Files:**
- Modify: `src/lineup.js`, `src/world.js`, `src/season.js`, `src/save.js`
- Modify: `tests/season.test.js`, `tests/save.test.js`

**Interfaces:**
- Consumes:
  - `defaultTactics`, `fitSlots`, `defaultSlot` and `TEAM_KEYS` from Task 1.
  - `startMatch`'s optional `bench` / `tactics` / `fam` from Task 2.
- Produces:
  - **New state fields:** `s.bench` (ids), `s.tactics` (as `defaultTactics`) and `s.fam` (`{ formation: 0.5–1 }`).
  - **`src/lineup.js`:** `fixLineup(s)` also repairs the bench and the slot tactics. New exports `swap(s, a, b)`, `newFam()` and `learnFam(fam, formation)`.
  - **`playRound`:** teaches `s.formation` when the human club played this round.
  - **Save:** `SAVE_VERSION = 4`.

- [ ] **Step 1: Write the failing tests**

In `tests/season.test.js` replace the line `import { FORMATIONS, slots, bestXI, fixLineup, strength } from '../src/lineup.js';` with

```js
import { FORMATIONS, BENCH, slots, bestXI, autoBench, fixLineup, strength, swap, newFam, learnFam } from '../src/lineup.js';
```

and append at the end of the file:

```js
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
  playRound(s);
  assert.equal(s.fam['4-3-3'], 0.6);
});
```

In `tests/save.test.js` replace the line `import { serialize, deserialize, SAVE_VERSION } from '../src/save.js';` with

```js
import { serialize, deserialize, SAVE_VERSION } from '../src/save.js';
import { BENCH, slots, newFam } from '../src/lineup.js';
import { defaultTactics } from '../src/tactics.js';
```

and append at the end of the file:

```js
test('a version 3 save loads with default tactics, also in a match in progress', () => {
  const s = createWorld(24, MINI);
  takeClub(s, 1);
  kickOff(s);
  for (let k = 0; k < 30; k++) stepMinute(s.live);
  const old = JSON.parse(serialize(s));
  old.version = 3;
  delete old.bench; delete old.tactics; delete old.fam;
  for (const S of old.live.sides) { delete S.tac; delete S.takers; delete S.fam; for (const o of S.on) { delete o.role; delete o.duty; delete o.shoot; delete o.tackle; } }
  const b = deserialize(JSON.stringify(old));
  assert.equal(b.version, SAVE_VERSION);
  assert.deepEqual(b.tactics, defaultTactics(slots(b.formation)));
  assert.deepEqual(b.fam, newFam());
  assert.equal(b.live.sides[0].tac.mentality, 0);
  while (!b.live.done) stepMinute(b.live);
  playRound(b);
  assert.equal(b.round, 1);
  assert.equal(b.bench.length, BENCH);
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test tests/season.test.js tests/save.test.js`
Expected: FAIL — SyntaxError: `swap` (and `newFam`, `learnFam`) are not exported by `src/lineup.js`.

- [ ] **Step 3: `src/lineup.js`** — change the tactics import to

```js
import { ROLES, fitSlots } from './tactics.js';
```

replace the whole `fixLineup` function with

```js
// Repairs the human club's matchday plan after a sale or a formation change: a valid XI, a bench of
// up to BENCH squad players outside the XI (gaps filled by autoBench), and slot tactics that fit.
export function fixLineup(s) {
  const club = s.clubs[s.me], ids = new Set(club.players.map(p => p.id));
  if (s.lineup.length !== 11 || new Set(s.lineup).size !== 11 || s.lineup.some(id => !ids.has(id)))
    s.lineup = bestXI(club, s.formation);
  const bench = [...new Set(s.bench)].filter(id => ids.has(id) && !s.lineup.includes(id));
  s.bench = [...bench, ...autoBench(club, [...s.lineup, ...bench])].slice(0, BENCH);
  s.tactics.slots = fitSlots(s.tactics.slots, slots(s.formation));
}

// Swaps two of the human club's players between XI slots, the bench and the reserves.
export function swap(s, a, b) {
  for (const list of [s.lineup, s.bench]) list.forEach((id, k) => { if (id === a) list[k] = b; else if (id === b) list[k] = a; });
}
```

and append at the end of the file:

```js
// Formation familiarity, 0.5-1 per formation: AI clubs play 4-4-2, so a club you take over knows only that.
// Each match played in a shape teaches it; the others fade a little.
const FAM_GAIN = 0.1, FAM_LOSS = 0.02, FAM_MIN = 0.5;
export const newFam = () => Object.fromEntries(Object.keys(FORMATIONS).map(f => [f, f === '4-4-2' ? 1 : FAM_MIN]));
export function learnFam(fam, used) {
  for (const f in fam) fam[f] = Math.round(Math.min(1, Math.max(FAM_MIN, fam[f] + (f === used ? FAM_GAIN : -FAM_LOSS))) * 100) / 100;
}
```

- [ ] **Step 4: `src/world.js`** — after `import { SAVE_VERSION } from './save.js';` add

```js
import { slots, newFam } from './lineup.js';
import { defaultTactics } from './tactics.js';
```

and in `createWorld` replace `    me: null, formation: '4-4-2', lineup: [], budget: 0,` with

```js
    me: null, formation: '4-4-2', lineup: [], bench: [], tactics: defaultTactics(slots('4-4-2')), fam: newFam(), budget: 0,
```

- [ ] **Step 5: `src/season.js`**:

Replace `import { bestXI, fixLineup } from './lineup.js';` with

```js
import { slots, bestXI, autoBench, fixLineup, newFam, learnFam } from './lineup.js';
import { defaultTactics } from './tactics.js';
```

In `takeClub`, after `s.lineup = bestXI(s.clubs[clubId], s.formation);` add

```js
  s.bench = autoBench(s.clubs[clubId], s.lineup);
  s.tactics = defaultTactics(slots(s.formation));
  s.fam = newFam();
```

Replace the `return` line of `entry()` with

```js
  return id === s.me ? { club, ids: s.lineup, formation: s.formation, bench: s.bench, tactics: s.tactics, fam: s.fam }
    : { club, ids: bestXI(club, '4-4-2'), formation: '4-4-2' }; // AI: best bench, default tactics (see makeSide)
```

In `playRound`, replace `  const live = s.live;` with `  const live = s.live, played = s.me !== null && myFixture(s);`. After the weekly-income line, add `  if (played) learnFam(s.fam, s.formation);`.

- [ ] **Step 6: `src/save.js`** — replace the `SAVE_VERSION` line with

```js
import { slots, newFam } from './lineup.js';
import { TEAM_KEYS, defaultSlot, defaultTactics } from './tactics.js';

export const SAVE_VERSION = 4; // 2: clubs from real data with short, colours, kit. 3: live match, richer results. 4: tactics
```

In `valid`, replace the last line `  && (s.live === null || (typeof s.live === 'object' && Array.isArray(s.live.sides)));` with

```js
  && (s.live === null || (typeof s.live === 'object' && Array.isArray(s.live.sides)))
  && Array.isArray(s.bench) && !!s.tactics && Array.isArray(s.tactics.slots) && !!s.fam && typeof s.fam === 'object';
```

and add to `MIGRATIONS` after the `2:` entry:

```js
  3: s => { // default tactics, also for both sides of a match in progress
    s.bench = []; s.tactics = defaultTactics(slots(s.formation)); s.fam = newFam();
    for (const S of s.live?.sides || []) {
      S.tac = Object.fromEntries(TEAM_KEYS.map(k => [k, 0])); S.takers = { pen: null, fk: null, corner: null }; S.fam = {};
      for (const o of S.on) Object.assign(o, defaultSlot(o.pos));
    }
  },
```

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: PASS, 0 failures. The existing version-2 migration test now runs through both migrations (2 → 3 → 4).

- [ ] **Step 8: Commit**

```bash
git add src/lineup.js src/world.js src/season.js src/save.js tests/season.test.js tests/save.test.js
git commit -m "feat: tactics, bench and familiarity in the career; save version 4"
```

---

### Task 4: Tactics screen, bench selection, live instructions, set-piece commentary

**Files:**
- Modify: `src/ui/app.js`, `src/ui/commentary.js`, `index.html`, `tests/commentary.test.js`

**Interfaces:**
- Consumes:
  - From `src/tactics.js`: `TEAM`, `TEAM_KEYS`, `TEAM_NAMES`, `ROLES`, `DUTIES`, `INSTR`, `TAKERS`, `setTeam`, `setSlot`, `setTaker`.
  - From `src/lineup.js`: `BENCH`, `swap`.
  - From `src/match.js`: `setLiveTactic`, `preview`.
  - The event `kind` from Task 2.
- Produces:
  - **New Tactics tab**, between Squad and Match.
  - **Squad screen** shows the XI, the bench (7) and the reserves; clicking two names swaps them.
  - **Live view** gets the five team-instruction selects.
  - **Commentary and match report:** commentary has lines for penalties, corners and free kicks, and the report marks penalty goals "(pen)".

- [ ] **Step 1: Write the failing test** — append to `tests/commentary.test.js`:

```js
test('penalties, corners and free kicks get their own lines', () => {
  assert.match(line({ min: 30, side: 0, type: 'goal', kind: 'pen', id: 1, name: 'Spot Man' }, 'ARS'), /^30' ARS — GOAL! .*Spot Man.*(spot|penalty)/);
  assert.equal(line({ min: 9, side: 1, type: 'save', kind: 'pen', id: 2, name: 'Spot Man' }, 'CHE'), "9' CHE — Penalty saved! Spot Man is denied from the spot.");
  assert.match(line({ min: 40, side: 0, type: 'goal', kind: 'corner', id: 3, name: 'Big Head', assistName: 'Good Foot' }, 'X'), /Big Head heads in from the corner, set up by Good Foot\.$/);
  for (const type of ['goal', 'save', 'miss']) for (const kind of ['pen', 'corner', 'fk'])
    assert.match(line({ min: 5, side: 0, type, kind, id: 1, name: 'Z Name' }, 'X'), /Z Name/);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/commentary.test.js`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'length')` (no `goal_pen` lines yet).

- [ ] **Step 3: `src/ui/commentary.js`** — in `T`, after the `sub:` line, add

```js
  goal_pen: ['GOAL! {name} sends the keeper the wrong way from the spot.', 'GOAL! {name} converts the penalty.'],
  save_pen: ['Penalty saved! {name} is denied from the spot.'],
  miss_pen: ['{name} misses the penalty!'],
  goal_corner: ['GOAL! {name} heads in from the corner{assist}.'],
  save_corner: ['{name} meets the corner, but the keeper holds on.'],
  miss_corner: ['{name} heads the corner wide.'],
  goal_fk: ['GOAL! {name} curls the free kick into the net.'],
  save_fk: ['{name} forces a save from a free kick.'],
  miss_fk: ['{name} puts the free kick over the bar.'],
```

and in `line()` replace `T[e.type === 'red' && e.second ? 'second' : e.type]` with ``T[e.type === 'red' && e.second ? 'second' : e.kind ? `${e.type}_${e.kind}` : e.type]``.

- [ ] **Step 4: Run it**

Run: `node --test tests/commentary.test.js`
Expected: PASS.

- [ ] **Step 5: `src/ui/app.js`** — make these replacements. Each "old" text occurs exactly once.

5a. Imports. Replace `import { FORMATIONS, slots, bestXI, fixLineup, strength } from '../lineup.js';` with

```js
import { FORMATIONS, BENCH, slots, bestXI, fixLineup, swap } from '../lineup.js';
```

and replace `import { stepMinute, substitute, setFormation, MAX_SUBS } from '../match.js';` with

```js
import { stepMinute, substitute, setFormation, setLiveTactic, preview, MAX_SUBS } from '../match.js';
import { TEAM, TEAM_KEYS, TEAM_NAMES, ROLES, DUTIES, INSTR, TAKERS, setTeam, setSlot, setTaker } from '../tactics.js';
```

5b. Select helpers. Directly above the line starting `const formationSelect = (act, current) =>` insert

```js
const options = (pairs, current) => pairs.map(([v, text]) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(text)}</option>`).join('');
const fieldSelect = (act, field, pairs, current, id = '') => `<select data-act="${act}" data-field="${field}"${id === '' ? '' : ` data-id="${id}"`}>${options(pairs, current)}</select>`;
const levels = key => TEAM[key].map((text, k) => [k - (TEAM[key].length >> 1), text]);
// One select per team instruction; t is s.tactics or a live side's tac.
const teamSelects = (act, t) => TEAM_KEYS.map(k => `<label>${TEAM_NAMES[k]} ${fieldSelect(act, k, levels(k), t[k])}</label>`).join('');
```

5c. Live view: a second bar with the team instructions. In `liveView()` replace

```js
      <button data-act="play">Skip to result</button>`;
```

with

```js
      <button data-act="play">Skip to result</button></div><div class="bar">${teamSelects('liveTeam', S.tac)}`;
```

5d. Report: mark penalties. In `report()` replace ``${esc(e.name)}${e.assistName`` with ``${esc(e.name)}${e.kind === 'pen' ? ' (pen)' : ''}${e.assistName``.

5e. Squad screen and new Tactics screen. Replace the whole `Squad() { … },` entry of `views` (from `  Squad() {` down to and including its closing `  },`) with

```js
  Squad() {
    fixLineup(s);
    const club = myClub(s), pos = slots(s.formation), find = id => club.players.find(p => p.id === id);
    const st = preview({ club, ids: s.lineup, formation: s.formation, bench: s.bench, tactics: s.tactics, fam: s.fam });
    const row = (p, slot) => `<tr class="${sel === p.id ? 'sel' : ''}"><td class="${slot && slot !== p.pos ? 'oop' : 'dim'}">${slot || (s.bench.includes(p.id) ? 'Sub' : '–')}</td>${nameBtn(p, 'pick')}${cells(p)}<td><button data-act="view" data-id="${p.id}">Profile</button></td></tr>`;
    const reserves = byPos(club.players.filter(p => !s.lineup.includes(p.id) && !s.bench.includes(p.id)));
    return `<div class="club">${crestSvg(club, 56)}${kitSvg(club.kit, 56)}<b>${esc(club.name)}</b></div>
      <div class="bar"><label>Formation ${formationSelect('formation', s.formation)}</label>
      <button data-act="auto">Auto-pick best XI</button><span class="dim">Attack ${st.att.toFixed(1)} · Defence ${st.def.toFixed(1)} · Control ${st.ctrl.toFixed(1)} · knows ${s.formation} ${Math.round(s.fam[s.formation] * 100)}%</span></div>
      <p class="dim">Click two names to swap them between the XI, the bench and the reserves. Orange slot = playing out of position.</p>
      <div class="wrap"><table><tr><th>Slot</th>${HEAD}<th></th></tr>${s.lineup.map((id, i) => row(find(id), pos[i])).join('')}
      <tr><th colspan="7">Bench (${s.bench.length}/${BENCH})</th></tr>${s.bench.map(id => row(find(id))).join('')}
      <tr><th colspan="7">Reserves</th></tr>${reserves.map(p => row(p)).join('')}</table></div>`;
  },
  Tactics() {
    fixLineup(s);
    const club = myClub(s), pos = slots(s.formation), t = s.tactics, find = id => club.players.find(p => p.id === id);
    const pick = (k, field, pairs) => fieldSelect('slot', field, pairs, t.slots[k][field], k);
    const instr = key => INSTR[key].map((text, k) => [k - 1, text]);
    const row = (id, k) => `<tr><td>${pos[k]}</td><td>${esc(find(id).name)}</td><td>${pick(k, 'role', Object.keys(ROLES[pos[k]]).map(r => [r, r]))}</td>
      <td>${pos[k] === 'GK' ? '' : pick(k, 'duty', Object.keys(DUTIES).map(d => [d, d]))}</td><td>${pick(k, 'shoot', instr('shoot'))}</td><td>${pick(k, 'tackle', instr('tackle'))}</td></tr>`;
    const takers = Object.entries(TAKERS).map(([kind, text]) => `<label>${text} ${fieldSelect('taker', kind, [['', 'Best available'], ...s.lineup.map(id => [String(id), find(id).name])], t.takers[kind] === null ? '' : String(t.takers[kind]))}</label>`).join('');
    return `<h2>Team instructions</h2><div class="bar">${teamSelects('team', t)}</div>
      <h2>Players</h2><div class="wrap"><table><tr><th>Pos</th><th>Player</th><th>Role</th><th>Duty</th><th>Shooting</th><th>Tackling</th></tr>${s.lineup.map(row).join('')}</table></div>
      <h2>Set pieces</h2><p class="dim">A taker who is not on the pitch is replaced by the best available player.</p><div class="bar">${takers}</div>
      <h2>Formation familiarity</h2><p class="dim">Each match in a formation teaches it; an unfamiliar one costs up to 3% of the team's strength.</p>
      <div class="bar">${Object.keys(FORMATIONS).map(f => `<span>${f} ${Math.round(s.fam[f] * 100)}%</span>`).join(' · ')}</div>`;
  },
```

5f. Actions. Replace the whole `pick(id) { … },` action with

```js
  pick(id) {
    if (sel === null || sel === id) { sel = sel === id ? null : id; return; }
    swap(s, sel, id);
    sel = null;
  },
  team(_, el) { msg = setTeam(s.tactics, el.dataset.field, +el.value) || ''; },
  slot(k, el) { const f = el.dataset.field; msg = setSlot(s.tactics.slots[k], slots(s.formation)[k], f, f === 'role' || f === 'duty' ? el.value : +el.value) || ''; },
  taker(_, el) { msg = setTaker(s.tactics, el.dataset.field, el.value === '' ? null : +el.value, myClub(s).players) || ''; },
  liveTeam(_, el) { msg = setLiveTactic(s.live, mySide(), el.dataset.field, +el.value) || ''; },
```

and replace `  liveFormation(_, el) { setFormation(s.live, mySide(), el.value); subOut = null; },` with

```js
  liveFormation(_, el) { msg = setFormation(s.live, mySide(), el.value) || ''; subOut = null; },
```

- [ ] **Step 6: `index.html`** — after the `.bar { … }` rule add

```css
  td select { padding:3px 6px; }
```

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 8: Check it in the browser** — start the `touchline` preview (port 8127).
  - **Protect the owner's save first.** Copy `localStorage['touchline.save']` to `localStorage['touchline.backup']` before testing, and restore it (and remove the backup) afterwards. The save is version 3 or older, so loading it also exercises the migration.
  - **Check, with no console errors:**
    1. The old save loads.
    2. The Tactics tab shows five team selects, one row per slot (GK without a duty select), three taker selects and the five familiarity figures.
    3. Changing mentality, a role, a duty, an instruction and a taker survives a reload.
    4. The Squad screen shows XI / Bench (7/7) / Reserves, and swapping a bench player with a reserve works.
    5. The Attack/Defence/Control figures change when mentality changes.
    6. In a live match the second bar shows the five team selects, and changing one mid-match works.
    7. A finished match report shows "(pen)" next to penalty goals. Play quick rounds until one appears, or check in the console that `kind: 'pen'` events reach the report.
    8. At 375 px wide, the Tactics tab has no horizontal page scroll; the table scrolls inside its box.
  - Take a screenshot of the Tactics tab for the end-of-phase summary.

- [ ] **Step 9: Commit**

```bash
git add src/ui/app.js src/ui/commentary.js index.html tests/commentary.test.js
git commit -m "feat: tactics screen, matchday bench, live team instructions, set-piece commentary"
```

---

### Task 5: Phase wrap-up

**Files:**
- Modify: `docs/fun-surprises.md`
- Modify: `docs/superpowers/plans/2026-11-15-touchline-roadmap.md`

- [ ] **Step 1: Carry quirks #1 and #5 over** — in `docs/fun-surprises.md`:
  - In row 1's "How to use it" cell append: `Since Phase 3 a formation the team has not learnt yet costs up to 3% until it has played a few matches in it (Tactics → Formation familiarity), so the edge pays off once the shape is learnt.`
  - In row 5's "How to use it" cell append: `The new shape plays at its own familiarity (Phase 3).`

- [ ] **Step 2: Record new quirks** — add row 6:

| 6 | **Hard tackling is nearly free.** "Tackle harder" adds 2% to a player's defensive contribution; its only cost is more yellow cards, which until suspensions arrive (Phase 5) matter only when a second one sends him off. | Set "Tackle harder" on defenders and holding midfielders; switch it off for a player already on a yellow. | `power()` and `foul()` in `src/match.js` | Phase 3 |

Add any other minor, fun quirk the reviews or the browser check of this phase turned up and kept, numbered on from 7, "Since" = `Phase 3`.

- [ ] **Step 3: Mark the phase done** — in the roadmap table, change row 3's last cell from `to write` to `` `2026-11-15-touchline-phase-3-tactics.md` (done YYYY-MM-DD) `` with the actual completion date. Under the existing "Phase 3 note" line, add: `Phase 5 note: suspensions give "Tackle harder" its price (fun surprise #6); decide then whether to keep it cheap.`

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add docs/fun-surprises.md docs/superpowers/plans/2026-11-15-touchline-roadmap.md
git commit -m "docs: mark Phase 3 done; formation edge survives with familiarity"
```

- [ ] **Step 6: End-of-phase summary** — report to the owner, as the roadmap requires:
  - what was built
  - the calibration figures from a full real-league season (goals, home wins, cards, penalties)
  - the Tactics screenshot from Task 4
  - the fun-surprises list, new and carried-over entries
