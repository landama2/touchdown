# Touchline Phase 5 — Squad Dynamics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players stop being identical from match to match. Each one carries:
- condition (freshness), carried from one match to the next;
- match sharpness;
- morale;
- form;
- injuries with recovery times;
- suspensions from cards.

A weekly training schedule (a team focus and intensity, plus an optional individual focus per player) now drives attribute growth, in place of the once-a-season jump.

**Architecture:**
- **`src/squad.js` (new):** what a match leaves on players (`afterMatch`), what the days between matches do (`passDays`), the summer break (`offseason`), injuries (`injure`), availability and the strength multiplier (`readiness`). Pure functions on players and the state.
- **`src/training.js` (new):** schedules, the weekly development and training-injury roll (`trainWeek`), recovery per day (`recoverRate`) and the setters the UI calls.
- **Match engine:** a player starts a match with his condition as fitness, and his `readiness` (morale, form, sharpness) multiplies his strength.
- **Selection:** `bestXI`, `autoBench` and `fixLineup` leave out injured and banned players and prefer fresh ones. `fixLineup` now repairs only the bad slots, so one injury no longer resets your whole XI.
- **Career:** `playDay` runs `afterMatch` on every match and then `between` up to the next match day. `endSeason` replaces the rollover growth of club players with `offseason`. Save version 6.

**Tech Stack:** Vanilla JavaScript ES modules, HTML/CSS, Node ≥ 22 built-in test runner (`node:test`, `node:assert/strict`). No npm dependencies. Local preview via the `touchline` server in `.claude/launch.json` (port 8127).

## Global Constraints

- Node version: 22 or newer. No packages are installed; `package.json` has no `dependencies` or `devDependencies`.
- Engine code (`src/*.js`, `src/data/**/*.js`) must not reference `document`, `window`, `localStorage`, `Math.random` or `Date`. Randomness comes only from an `rng` built with `makeRng` from a stored seed. `src/ui/commentary.js` follows the same rule.
- State must survive `JSON.parse(JSON.stringify(state))` unchanged: no `Map`, `Set`, class instances, functions or `undefined` values in state.
- Determinism: same seed + same inputs = same career, including a career saved and reloaded in the middle of a live match.
- League calibration is unchanged. On a full season of the real leagues (seed 1) the targets are:
  - goals per match 2.5–2.9;
  - home wins 43–47%;
  - yellow cards 2.5–4 per match;
  - red cards at most 0.3 per match;
  - penalties 0.15–0.4 per match;
  - **new:** players unavailable (injured or banned), averaged over match days, 0.5–3 per club.
- A fresh player (condition 100, sharpness 100, morale 50, no form) plays exactly as strong as before Phase 5. The test 'at kick-off a side is exactly as strong as its lineup' in `tests/match.test.js` must keep passing unchanged.
- This is a private personal project: real club, player and competition names are used.
- Fun surprises rule: a minor quirk that is fun or interesting for the player is kept, not fixed. Record it in `docs/fun-surprises.md` and mention it in the end-of-phase summary. If a phase rewrites the code a quirk lives in, carry the quirk over or note that it was retired and why.
- Run all tests with `npm test`. Every task ends with all tests passing and a commit. Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Design decisions (made while planning, 2026-11-15)

Choices made by the owner while planning:
- training is a team schedule **plus** a per-player focus;
- bans price "Tackle harder";
- morale and form are a small nudge of about ±2% each.

**Player fields.** Every player (club squads and free agents) carries `freshState()` from `src/player.js`:

| Field | Range | Meaning |
|-------|-------|---------|
| `cond` | 0–100 | Condition: the fitness he starts his next match with. A match drains it; days between matches restore it. |
| `sharp` | 40–100 | Match sharpness: +12 per match played, −0.6 per day, floor 40. |
| `morale` | 0–100 | Moved by results and playing time; drifts back to 50 by 0.3 a day. |
| `form` | list | His last 5 match ratings (any competition). |
| `yc` | int | League yellow cards this season. |
| `ban` | int | Matches still to sit out. |
| `inj` | null or `{ name, days }` | Injury and days until fit. |
| `gain` | int | Attributes raised by training this season (shown on the Training screen). |

**Strength in a match.**
- `readiness(p) = 1 + 0.02·(morale−50)/50 + 0.02·clamp((formAvg−6.6)/1.4, −1, 1) − 0.04·(100−sharp)/60`. That is +4% at best and −8% at worst; a fresh player is exactly 1.
- Condition is the existing fatigue factor `0.7 + 0.3·fit/100`, applied from kick-off.

**Selection.**
- The assistant, the AI and Auto-pick rate a player for a slot as `eff × (0.7 + 0.3·cond/100) × readiness`.
- Injured and banned players score −1, so they play only if a club has nobody else (`ponytail:` no minimum-squad rule).

**Injuries.**
- An in-match injury (the existing event) now gets a recovery time from a weighted table:

  | Injury | Days out | Weight |
  |--------|----------|--------|
  | knock | 2–6 | 40 |
  | calf strain | 7–20 | 30 |
  | hamstring strain | 14–35 | 18 |
  | ankle ligaments | 28–70 | 9 |
  | knee ligaments | 90–200 | 3 |

- Training also injures: 0.4% per fit player per week, ×0.5 Light, ×1 Normal, ×2.5 Hard.
- A worse injury replaces a milder one.

**Suspensions.**
- Second yellow in a match: 1-match ban. Straight red: 3 matches. Every 5th league yellow of the season: 1 match.
- A ban counts down by one with every match the player's club plays, in **any** competition (`ponytail:` real rules split bans by competition; see fun surprise #9).
- Yellows reset at the end of the season; bans carry over.
- "Tackle harder" stays as it is; the bans are its price (fun surprise #6 updated).

**Morale after each match** (every squad player of both clubs):
- result: +4 for a win, −4 for a loss;
- players who played: + round((rating − 6.5) × 3);
- fit players among the club's 14 best by overall who did not play: −3;
- the result is clamped to 0–100.

Labels: Very low < 20 ≤ Low < 40 ≤ Okay < 60 ≤ Good < 80 ≤ Superb.

**Training.**
- `s.training = { focus, intensity, ind }`. Team focus is one of Balanced (the position's key attributes), Attacking, Defending, Technical, Physical or Rest. Intensity is Light, Normal or Hard. `ind[playerId]` is one attribute key.
- AI clubs always train Balanced at Normal.
- Each calendar week (counted like weekly income), a fit player aged 23 or under raises one attribute with chance 0.1 × the grow factor (Light 0.7, Normal 1, Hard 1.3). That is about 4 a season at Normal, matching the old rollover growth. Rest: no growth.
  - Half the time the attribute is his individual focus; otherwise it comes from the team focus. Keepers always train their own key attributes.
  - Nothing grows above the hidden potential `pot`. A pick at the cap is lost (fun surprise #10).
- Players aged 31 and over lose a physical point with chance 0.05 a week (about 2 a season, as before), whatever the schedule.
- Condition regained per day: Light 6, Normal 5, Hard 3, plus 2 on Rest (lowered from 9/8/6 after playtesting: at those rates every player was fresh on every match day).
- Free agents do not train. They keep the old `ageOneYear()` rollover, and they heal and recover at the Normal rate.

**Days between matches.**
- After a match day, `between(s, rng, today, nextMatchDay)` does two things:
  - trains every club once per calendar week crossed;
  - then calls `passDays`: injuries heal, condition and morale recover, sharpness fades.
- So injuries and bans for the next match are known before you pick your team.
- **Summer break (`offseason`):**
  - injuries heal by 70 days;
  - condition and sharpness go back to 100;
  - form, yellows and `gain` are wiped;
  - bans and morale carry over.

**News.**
- `s.news` is reset by each `playDay`.
- It holds the human club's new injuries (from matches and training) and bans: `{ type: 'injury', club, id, name, injury, days, training? }` or `{ type: 'ban', club, id, name, matches }`.
- The UI shows it after Continue / Quick result.

**Saves.**
- Version 6.
- The migration gives every player `freshState()`, and the career `defaultTraining()` and `news: []`.
- A live match saved by version 5 has no `edge` on its players. The engine reads `p.edge ?? 1`.

**Later phases.**
- Phase 9 staff (coaches, physios) will scale growth, recovery and injury length. The knobs are `GROWTH` and `INTENSITY` in `src/training.js`, and `INJURIES` and `passDays` in `src/squad.js`.
- Contract and transfer unhappiness (Phase 6–7) will feed `morale`.

## File map

| File | Change |
|------|--------|
| `src/player.js` | `freshState()`; `createPlayer` adds it |
| `src/squad.js` | **new**: `available`, `readiness`, `formAvg`, `moraleLabel`, `injure`, `passDays`, `offseason`, `afterMatch` |
| `src/training.js` | **new**: `FOCUS`, `INTENSITY`, `defaultTraining`, `trainingOf`, `recoverRate`, `trainWeek`, `setTraining`, `setFocus` |
| `src/match.js` | `makeSide` takes `fit` from `cond` and stores `edge`; `power` multiplies by `edge` |
| `src/lineup.js` | `pickScore`, `pickFor`; `bestXI`, `autoBench`, `fixLineup` respect availability |
| `src/season.js` | `playDay` runs `afterMatch` and `between`, fills `s.news`; `endSeason` uses `offseason`; `takeClub` resets training |
| `src/world.js`, `src/save.js` | `training`, `news`; save version 6 |
| `src/ui/app.js` | Squad columns, Training screen, profile line, news message |
| `tests/squad.test.js`, `tests/training.test.js` | **new** |
| `tests/match.test.js`, `tests/season.test.js`, `tests/save.test.js`, `tests/england.test.js` | additions |
| `docs/fun-surprises.md`, roadmap | #2 and #6 updated, #9 and #10 new; phase marked done |

---

### Task 1: Player state and `src/squad.js`

**Files:**
- Modify: `src/player.js` (add `freshState`, change the `return` of `createPlayer`)
- Create: `src/squad.js`
- Test: `tests/squad.test.js`

**Interfaces:**
- Consumes: `overall(p)` from `src/player.js`; `startMatch`, `stepMinute` from `src/match.js` (tests only); `bestXI` from `src/lineup.js` (tests only).
- Produces:
  - `freshState() → { cond: 100, sharp: 100, morale: 50, form: [], yc: 0, ban: 0, inj: null, gain: 0 }` (player.js)
  - `available(p) → boolean`
  - `readiness(p) → number`
  - `formAvg(p) → number | null`
  - `moraleLabel(v) → string`
  - `injure(rng, p) → p.inj`
  - `passDays(players, days, perDay)`
  - `offseason(p)`
  - `afterMatch(s, m, comp, rng) → news[]`
  - constants `FORM_LEN`, `YELLOW_LIMIT`, `SHARP_MIN`, `OFFSEASON`, `INJURIES`

- [ ] **Step 1: Write the failing tests** — create `tests/squad.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createPlayer, freshState } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { bestXI } from '../src/lineup.js';
import { startMatch, stepMinute } from '../src/match.js';
import { available, readiness, formAvg, moraleLabel, injure, passDays, offseason, afterMatch, INJURIES, SHARP_MIN, YELLOW_LIMIT, OFFSEASON } from '../src/squad.js';
import { MINI } from './fixtures/mini.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;
// A finished AI-v-AI match between clubs 4 and 5 of a fresh mini world.
function setup(seed) {
  const s = createWorld(seed, MINI), side = id => ({ club: s.clubs[id], ids: bestXI(s.clubs[id], '4-4-2'), formation: '4-4-2' });
  const m = startMatch(seed, side(4), side(5));
  while (!m.done) stepMinute(m);
  return { s, m };
}

test('a new player is fresh: available, and readiness exactly 1', () => {
  const p = createPlayer(makeRng(1), 1, 'MF', 10);
  for (const [k, v] of Object.entries(freshState())) assert.deepEqual(p[k], v, k);
  assert.equal(readiness(p), 1);
  assert.ok(available(p));
  assert.equal(formAvg(p), null);
  assert.deepEqual([0, 25, 50, 70, 95].map(moraleLabel), ['Very low', 'Low', 'Okay', 'Good', 'Superb']);
});

test('readiness: morale and form up to 2% each, lost sharpness costs up to 4%', () => {
  const p = freshState();
  assert.ok(near(readiness({ ...p, morale: 100 }), 1.02));
  assert.ok(near(readiness({ ...p, morale: 0 }), 0.98));
  assert.ok(near(readiness({ ...p, form: [8, 8, 8] }), 1.02));
  assert.ok(near(readiness({ ...p, form: [5] }), 0.98));
  assert.ok(near(readiness({ ...p, sharp: SHARP_MIN }), 0.96));
  assert.equal(formAvg({ form: [6, 7, 8.5] }), 7.2);
  assert.ok(!available({ ...p, ban: 1 }) && !available({ ...p, inj: { name: 'knock', days: 2 } }));
});

test('injuries come from the table; a worse one replaces a milder one, never the reverse', () => {
  const rng = makeRng(2), p = freshState();
  for (let k = 0; k < 300; k++) {
    p.inj = null;
    const inj = injure(rng, p), row = INJURIES.find(x => x[0] === inj.name);
    assert.ok(row && inj.days >= row[1] && inj.days <= row[2], JSON.stringify(inj));
  }
  p.inj = { name: 'knee ligaments', days: 500 };
  injure(rng, p);
  assert.deepEqual(p.inj, { name: 'knee ligaments', days: 500 });
});

test('passDays heals, restores condition, wears sharpness down and lets morale drift to 50', () => {
  const p = { ...freshState(), cond: 70, morale: 80, inj: { name: 'knock', days: 3 } };
  passDays([p], 2, 8);
  assert.deepEqual([p.cond, p.sharp, p.morale, p.inj.days], [86, 98.8, 79.4, 1]);
  passDays([p], 1, 8);
  assert.equal(p.inj, null);
  assert.equal(p.cond, 94);
  passDays([p], 400, 8);
  assert.deepEqual([p.cond, p.sharp, p.morale], [100, SHARP_MIN, 50]);
});

test('offseason: fresh and sharp, cards, form and gains wiped; long injuries and bans carry over', () => {
  const p = { ...freshState(), cond: 60, sharp: 50, form: [7], yc: 4, gain: 3, ban: 2, morale: 30, inj: { name: 'knee ligaments', days: OFFSEASON + 10 } };
  offseason(p);
  assert.deepEqual([p.cond, p.sharp, p.form, p.yc, p.gain, p.ban, p.morale, p.inj.days], [100, 100, [], 0, 0, 2, 30, 10]);
  const q = { ...freshState(), inj: { name: 'knock', days: 5 } };
  offseason(q);
  assert.equal(q.inj, null);
});

test('after a match: players who played carry its fatigue, sharpness and rating; the others only the result', () => {
  const { s, m } = setup(1), club = s.clubs[4];
  const p = club.players.find(x => m.pl[x.id]?.played && !m.pl[x.id].inj), x = m.pl[p.id];
  const idle = club.players.find(y => !m.pl[y.id]?.played);
  p.sharp = 80;
  afterMatch(s, m, 'league', makeRng(1));
  const result = Math.sign(m.sides[0].st.goals - m.sides[1].st.goals);
  assert.equal(p.cond, Math.round(x.fit));
  assert.ok(p.cond < 100);
  assert.equal(p.sharp, 92);
  assert.deepEqual(p.form, [Math.round(Math.max(3, Math.min(10, x.rt)) * 10) / 10]);
  assert.equal(idle.cond, 100);
  assert.deepEqual(idle.form, []);
  assert.ok([50 + 4 * result, 50 + 4 * result - 3].includes(idle.morale), `${idle.morale}`); // a fit regular left out loses 3
});

test('an injury in a match gets a recovery time and makes news', () => {
  const { s, m } = setup(2), o = m.sides[1].on.find(x => x.pos !== 'GK');
  m.pl[o.id].inj = true;
  const news = afterMatch(s, m, 'cup', makeRng(3)), p = s.clubs[5].players.find(x => x.id === o.id);
  assert.ok(p.inj && p.inj.days >= 2 && !available(p));
  assert.ok(news.some(n => n.type === 'injury' && n.club === 5 && n.id === p.id && n.injury === p.inj.name && n.days === p.inj.days));
});

test('cards: straight red 3 matches, second yellow 1, every fifth league yellow 1; bans count down every match', () => {
  const { s, m } = setup(3), club = s.clubs[4];
  const [a, b, c] = club.players.filter(p => m.pl[p.id]?.played && p.pos !== 'GK');
  c.yc = YELLOW_LIMIT - 1;
  m.ev = [{ type: 'red', side: 0, id: a.id, second: false }, { type: 'red', side: 0, id: b.id, second: true }, { type: 'yellow', side: 0, id: c.id }];
  const news = afterMatch(s, m, 'league', makeRng(1));
  assert.deepEqual([a.ban, b.ban, c.ban, c.yc], [3, 1, 1, YELLOW_LIMIT]);
  assert.equal(news.filter(n => n.type === 'ban' && n.club === 4).length, 3);
  m.ev = [{ type: 'yellow', side: 0, id: c.id }]; // a cup yellow does not count towards a ban
  afterMatch(s, m, 'cup', makeRng(1));
  assert.deepEqual([a.ban, b.ban, c.ban, c.yc], [2, 0, 0, YELLOW_LIMIT]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/squad.test.js`
Expected: FAIL with `Cannot find module '.../src/squad.js'` (or `freshState` is not exported).

- [ ] **Step 3: Add `freshState` to `src/player.js`** — above `createPlayer`:

```js
// Squad-dynamics fields every player carries (their meaning is in src/squad.js). A fresh player
// plays exactly as strong as his attributes say.
export const freshState = () => ({ cond: 100, sharp: 100, morale: 50, form: [], yc: 0, ban: 0, inj: null, gain: 0 });
```

and change the last line of `createPlayer` to:

```js
  return { id, name: rng.pick(FIRST) + ' ' + rng.pick(LAST), pos, age, attrs, pot, ...freshState() };
```

- [ ] **Step 4: Create `src/squad.js`**

```js
import { overall } from './player.js';

// Squad dynamics: what matches and the days between them leave on players. Every player (club
// squads and free agents) carries the fields of freshState() in player.js:
//   cond   0-100   condition: the fitness he starts his next match with; a match drains it, rest restores it
//   sharp  40-100  match sharpness: playing raises it, days without a match wear it down
//   morale 0-100   results and playing time move it; it drifts back to 50 between matches
//   form           his last FORM_LEN match ratings, any competition
//   yc             league yellow cards this season; every YELLOW_LIMIT-th brings a one-match ban
//   ban            matches still to sit out, counted down by every match of his club, any competition
//   inj            null, or { name, days } until he is fit again
//   gain           attributes raised by training this season (src/training.js)
export const FORM_LEN = 5, YELLOW_LIMIT = 5, SHARP_MIN = 40, OFFSEASON = 70; // OFFSEASON: days from the last final to the next season
const MORALE_MID = 50, MORALE_DRIFT = 0.3, SHARP_GAIN = 12, SHARP_LOSS = 0.6; // drift and loss per day, gain per match
const MORALE_RESULT = 4, MORALE_RATING = 3, MORALE_DROPPED = 3, REGULARS = 14; // the 14 best expect to play
const BAN = { second: 1, straight: 3 };
const EDGE = { morale: 0.02, form: 0.02, sharp: 0.04 };
// [name, fewest days, most days, weight]
export const INJURIES = [['knock', 2, 6, 40], ['calf strain', 7, 20, 30], ['hamstring strain', 14, 35, 18], ['ankle ligaments', 28, 70, 9], ['knee ligaments', 90, 200, 3]];

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const r1 = x => Math.round(x * 10) / 10;

export const available = p => !p.inj && !p.ban;
export const formAvg = p => p.form.length ? r1(p.form.reduce((t, x) => t + x, 0) / p.form.length) : null;
export const moraleLabel = v => v < 20 ? 'Very low' : v < 40 ? 'Low' : v < 60 ? 'Okay' : v < 80 ? 'Good' : 'Superb';

// Multiplier on a player's match strength: morale and form up to ±2% each, lost sharpness up to -4%.
// A fresh player (morale 50, sharpness 100, no form) is exactly 1.
export function readiness(p) {
  const f = formAvg(p);
  return 1 + EDGE.morale * (p.morale - MORALE_MID) / MORALE_MID
    + (f === null ? 0 : EDGE.form * clamp((f - 6.6) / 1.4, -1, 1))
    - EDGE.sharp * (100 - p.sharp) / (100 - SHARP_MIN);
}

// Gives player p an injury from INJURIES; a worse one replaces a milder one he already has. Returns p.inj.
export function injure(rng, p) {
  let r = rng.next() * INJURIES.reduce((t, x) => t + x[3], 0), pick = INJURIES[INJURIES.length - 1];
  for (const x of INJURIES) if ((r -= x[3]) < 0) { pick = x; break; }
  const days = rng.int(pick[1], pick[2]);
  if (!p.inj || days > p.inj.days) p.inj = { name: pick[0], days };
  return p.inj;
}

// `days` days pass: injuries heal, condition comes back by perDay a day, sharpness fades, morale drifts to 50.
export function passDays(players, days, perDay) {
  for (const p of players) {
    if (p.inj && (p.inj.days -= days) <= 0) p.inj = null;
    p.cond = Math.min(100, p.cond + perDay * days);
    p.sharp = r1(Math.max(SHARP_MIN, p.sharp - SHARP_LOSS * days));
    p.morale = r1(p.morale + clamp(MORALE_MID - p.morale, -MORALE_DRIFT * days, MORALE_DRIFT * days));
  }
}

// The summer break: injuries heal by OFFSEASON days; everyone starts the season fresh and sharp;
// yellow cards, form and the season's training gains are wiped. Bans and morale carry over.
export function offseason(p) {
  if (p.inj && (p.inj.days -= OFFSEASON) <= 0) p.inj = null;
  Object.assign(p, { cond: 100, sharp: 100, form: [], yc: 0, gain: 0 });
}

// What a finished match m leaves on both squads (comp: 'league', 'cup' or 'playoff'). Every ban
// at both clubs counts down by one. Players who played keep their end-of-match fitness as
// condition, gain sharpness and add their rating to their form; an injury gets a recovery time.
// Red cards and every fifth league yellow bring bans. Morale: the result for the whole squad, the
// rating for those who played, a knock for fit regulars left out.
// Returns news: [{ type: 'injury', club, id, name, injury, days } | { type: 'ban', club, id, name, matches }].
export function afterMatch(s, m, comp, rng) {
  const news = [];
  m.sides.forEach((S, i) => {
    const club = s.clubs[S.club], result = Math.sign(S.st.goals - m.sides[1 - i].st.goals);
    const regulars = new Set([...club.players].sort((a, b) => overall(b) - overall(a) || a.id - b.id).slice(0, REGULARS).map(p => p.id));
    for (const p of club.players) {
      const x = m.pl[p.id], out = !available(p);
      if (p.ban) p.ban--;
      let mood = MORALE_RESULT * result;
      if (x?.played) {
        const rt = r1(clamp(x.rt, 3, 10));
        p.cond = Math.round(x.fit);
        p.sharp = Math.min(100, p.sharp + SHARP_GAIN);
        p.form = [...p.form, rt].slice(-FORM_LEN);
        mood += Math.round((rt - 6.5) * MORALE_RATING);
        if (x.inj) { injure(rng, p); news.push({ type: 'injury', club: club.id, id: p.id, name: p.name, injury: p.inj.name, days: p.inj.days }); }
      } else if (!out && regulars.has(p.id)) mood -= MORALE_DROPPED;
      p.morale = clamp(p.morale + mood, 0, 100);
    }
  });
  for (const e of m.ev) {
    if (e.type !== 'yellow' && e.type !== 'red') continue;
    const club = s.clubs[m.sides[e.side].club], p = club.players.find(x => x.id === e.id);
    if (!p) continue;
    const ban = e.type === 'red' ? (e.second ? BAN.second : BAN.straight) : comp === 'league' && ++p.yc % YELLOW_LIMIT === 0 ? 1 : 0;
    if (ban) { p.ban += ban; news.push({ type: 'ban', club: club.id, id: p.id, name: p.name, matches: p.ban }); }
  }
  return news;
}
```

- [ ] **Step 5: Run the new tests, then everything**

Run: `node --test tests/squad.test.js` — Expected: PASS (8 tests).
Run: `npm test` — Expected: all pass. Players have new fields, but nothing reads them yet, and `createPlayer` draws from the RNG in the same order as before.

- [ ] **Step 6: Commit**

```bash
git add src/player.js src/squad.js tests/squad.test.js
git commit -m "feat: player condition, sharpness, morale, form, injuries and bans"
```

---

### Task 2: Training (`src/training.js`)

**Files:**
- Create: `src/training.js`
- Test: `tests/training.test.js`

**Interfaces:**
- Consumes: `ATTRS`, `ALL_ATTRS`, `WEIGHTS`, `createPlayer` from `src/player.js`; `injure` from `src/squad.js`; `has` from `src/tactics.js`.
- Produces:
  - `FOCUS` (`{ Balanced: null, Attacking: [...], Defending: [...], Technical: [...], Physical: [...], Rest: [] }`)
  - `INTENSITY` (`{ Light|Normal|Hard: { grow, recover, injury } }`)
  - `defaultTraining() → { focus: 'Balanced', intensity: 'Normal', ind: {} }`
  - `trainingOf(s, club) → schedule`
  - `recoverRate(t) → number`
  - `trainWeek(rng, club, t) → injured players[]`
  - `setTraining(s, field, v) → error | null`
  - `setFocus(s, id, attr | null) → error | null`

- [ ] **Step 1: Write the failing tests** — create `tests/training.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createPlayer, WEIGHTS, ATTRS } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { FOCUS, defaultTraining, trainWeek, recoverRate, setTraining, setFocus } from '../src/training.js';
import { MINI } from './fixtures/mini.js';

const WEEKS = 42; // training weeks from the first match day (day 0) to the play-off finals (day 294)
const squad = (seed, n, age, pos = 'MF') => {
  const rng = makeRng(seed);
  return { id: 99, players: Array.from({ length: n }, (_, i) => Object.assign(createPlayer(rng, i, pos, 8, age), { pot: 20 })) };
};
// One season of training; injuries are healed at once so they cost only the week they happen. Average gain.
function season(club, t, seed = 1) {
  const rng = makeRng(seed);
  for (let w = 0; w < WEEKS; w++) { trainWeek(rng, club, t); for (const p of club.players) p.inj = null; }
  return club.players.reduce((n, p) => n + p.gain, 0) / club.players.length;
}
const plan = changes => ({ ...defaultTraining(), ...changes });

test('young players gain about four attributes a season at Normal; Hard more, Light less, Rest none, adults none', () => {
  const normal = season(squad(1, 300, 19), plan({}));
  const hard = season(squad(1, 300, 19), plan({ intensity: 'Hard' })), light = season(squad(1, 300, 19), plan({ intensity: 'Light' }));
  assert.ok(normal > 3.4 && normal < 4.8, `normal ${normal}`);
  assert.ok(hard > normal && normal > light, `${hard} ${normal} ${light}`);
  assert.equal(season(squad(1, 300, 19), plan({ focus: 'Rest' })), 0);
  assert.equal(season(squad(1, 300, 26), plan({})), 0);
});

test('the team focus decides which attributes grow; keepers always train as keepers', () => {
  for (const [pos, allowed] of [['MF', FOCUS.Attacking], ['GK', Object.keys(WEIGHTS.GK)]]) {
    const club = squad(2, 100, 19, pos), before = club.players.map(p => ({ ...p.attrs }));
    season(club, plan({ focus: 'Attacking' }));
    club.players.forEach((p, i) => { for (const k in p.attrs) if (p.attrs[k] !== before[i][k]) assert.ok(allowed.includes(k), `${pos} ${k}`); });
  }
});

test('an individual focus takes about half the gains; nothing grows past the hidden potential', () => {
  const club = squad(4, 200, 19), t = plan({ ind: {} }), before = club.players.map(p => p.attrs.pace);
  for (const p of club.players) t.ind[p.id] = 'pace';
  season(club, t);
  const pace = club.players.reduce((n, p, i) => n + p.attrs.pace - before[i], 0), all = club.players.reduce((n, p) => n + p.gain, 0);
  assert.ok(pace / all > 0.4 && pace / all < 0.6, `pace share ${pace / all}`);
  const capped = squad(5, 50, 19);
  for (const p of capped.players) p.pot = 1;
  assert.equal(season(capped, plan({})), 0);
});

test('veterans lose about two physical points a season whatever the schedule', () => {
  const club = squad(6, 300, 32), sum = () => club.players.reduce((n, p) => n + ATTRS.physical.reduce((t, k) => t + p.attrs[k], 0), 0);
  const before = sum();
  season(club, plan({ intensity: 'Hard' }));
  const lost = (before - sum()) / 300;
  assert.ok(lost > 1.6 && lost < 2.6, `lost ${lost}`);
});

test('hard training injures more than light; recovery per day follows the schedule', () => {
  const injuries = intensity => {
    const club = squad(7, 500, 25), rng = makeRng(7);
    let n = 0;
    for (let w = 0; w < WEEKS; w++) { n += trainWeek(rng, club, plan({ intensity })).length; for (const p of club.players) p.inj = null; }
    return n;
  };
  assert.ok(injuries('Hard') > 2 * injuries('Light'));
  assert.deepEqual(['Light', 'Normal', 'Hard'].map(intensity => recoverRate(plan({ intensity }))), [6, 5, 3]);
  assert.equal(recoverRate(plan({ focus: 'Rest' })), 7);
});

test('training setters check what they are given', () => {
  const s = createWorld(1, MINI);
  s.me = 0; s.training = defaultTraining();
  assert.equal(setTraining(s, 'focus', 'Physical'), null);
  assert.equal(setTraining(s, 'intensity', 'Hard'), null);
  assert.deepEqual([s.training.focus, s.training.intensity], ['Physical', 'Hard']);
  for (const [f, v] of [['focus', 'Juggling'], ['intensity', 'constructor'], ['ind', {}]]) assert.ok(setTraining(s, f, v), `${f}=${v}`);
  const id = s.clubs[0].players[0].id;
  assert.equal(setFocus(s, id, 'finishing'), null);
  assert.equal(s.training.ind[id], 'finishing');
  assert.equal(setFocus(s, id, null), null);
  assert.equal(s.training.ind[id], undefined);
  assert.ok(setFocus(s, id, 'luck'));
  assert.ok(setFocus(s, s.clubs[1].players[0].id, 'pace')); // not your player
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/training.test.js`
Expected: FAIL with `Cannot find module '.../src/training.js'`.

- [ ] **Step 3: Create `src/training.js`**

```js
import { ATTRS, ALL_ATTRS, WEIGHTS } from './player.js';
import { injure } from './squad.js';
import { has } from './tactics.js';

// Training. Every club has a weekly schedule, a focus and an intensity; AI clubs keep the default.
// The human club can also give any player an individual focus: one attribute.
// Each week a fit player aged 23 or under raises one attribute by 1 with chance GROWTH × the
// intensity's grow factor (about 4 a season at Normal), never above his hidden potential `pot`:
// half the time his individual focus, otherwise one from the team focus (keepers: always their
// position's key attributes). Players aged 31 and over lose a physical point now and then,
// whatever the schedule. Training can injure, Hard more often, Light less.
export const FOCUS = {
  Balanced: null, // the position's key attributes (WEIGHTS in player.js)
  Attacking: ['finishing', 'dribbling', 'firstTouch', 'crossing', 'composure'],
  Defending: ['tackling', 'positioning', 'heading', 'strength', 'decisions'],
  Technical: ['passing', 'firstTouch', 'dribbling', 'vision', 'crossing'],
  Physical: ATTRS.physical,
  Rest: [],       // nobody improves; condition comes back REST_RECOVER a day faster
};
// grow: × the growth chance; recover: condition regained per day; injury: × the training-injury chance.
export const INTENSITY = { Light: { grow: 0.7, recover: 6, injury: 0.5 }, Normal: { grow: 1, recover: 5, injury: 1 }, Hard: { grow: 1.3, recover: 3, injury: 2.5 } };
const GROWTH = 0.1, DECLINE = 0.05, INJURY = 0.004, REST_RECOVER = 2; // chances per player per week

export const defaultTraining = () => ({ focus: 'Balanced', intensity: 'Normal', ind: {} });
const AI_TRAINING = defaultTraining();
export const trainingOf = (s, club) => club.id === s.me ? s.training : AI_TRAINING;
export const recoverRate = t => INTENSITY[t.intensity].recover + (t.focus === 'Rest' ? REST_RECOVER : 0);

// ponytail: a pick at the cap is lost, not re-rolled (fun surprise #10).
function raise(rng, p, t) {
  const own = t.ind[p.id], team = p.pos === 'GK' || !FOCUS[t.focus] ? Object.keys(WEIGHTS[p.pos]) : FOCUS[t.focus];
  const k = own && rng.next() < 0.5 ? own : rng.pick(team);
  if (p.attrs[k] < p.pot) { p.attrs[k]++; p.gain++; }
}

// One week of training for `club` under schedule t. Injured players sit it out. Returns the players injured in training.
export function trainWeek(rng, club, t) {
  const I = INTENSITY[t.intensity], hurt = [];
  for (const p of club.players) {
    if (p.inj) continue;
    if (rng.next() < INJURY * I.injury) { injure(rng, p); hurt.push(p); continue; }
    if (p.age <= 23 && t.focus !== 'Rest' && rng.next() < GROWTH * I.grow) raise(rng, p, t);
    if (p.age >= 31 && rng.next() < DECLINE) { const k = rng.pick(ATTRS.physical); p.attrs[k] = Math.max(1, p.attrs[k] - 1); }
  }
  return hurt;
}

// Setters return an error message, or null when the change is made.
export function setTraining(s, field, v) {
  if (!(field === 'focus' ? has(FOCUS, v) : field === 'intensity' && has(INTENSITY, v))) return 'Unknown training setting.';
  s.training[field] = v;
  return null;
}

// attr: an attribute key, or null for "train with the team".
export function setFocus(s, id, attr) {
  if (!s.clubs[s.me].players.some(p => p.id === id) || (attr !== null && !ALL_ATTRS.includes(attr))) return 'Unknown training focus.';
  if (attr === null) delete s.training.ind[id]; else s.training.ind[id] = attr;
  return null;
}
```

- [ ] **Step 4: Run the new tests, then everything**

Run: `node --test tests/training.test.js` — Expected: PASS (6 tests).
Run: `npm test` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/training.js tests/training.test.js
git commit -m "feat: weekly training with team and individual focus"
```

---

### Task 3: The match engine and team selection read squad state

**Files:**
- Modify: `src/match.js` (imports, `makeSide`, `power`, the `ponytail:` comment above `injury`)
- Modify: `src/lineup.js` (imports, `bestXI`, `fixLineup`, `autoBench`; add `pickScore`, `pickFor`)
- Test: `tests/match.test.js`, `tests/season.test.js`

**Interfaces:**
- Consumes: `available(p)`, `readiness(p)` from `src/squad.js` (Task 1).
- Produces:
  - `m.pl[id].fit` starts at `p.cond`;
  - `m.pl[id].edge = readiness(p)`;
  - `bestXI(club, formation)`, `autoBench(club, taken)` and `fixLineup(s)` keep their signatures but skip unavailable players;
  - `fixLineup` keeps every valid slot of your XI.

- [ ] **Step 1: Write the failing tests**

Append to `tests/match.test.js`:

```js
test('a player starts a match with his condition, and readiness scales his strength', () => {
  const w = createWorld(3, MINI), club = w.clubs[0], ids = bestXI(club, '4-4-2');
  const home = { club, ids, formation: '4-4-2' }, away = { club: w.clubs[1], ids: bestXI(w.clubs[1], '4-4-2'), formation: '4-4-2' };
  const set = fields => { for (const id of ids) Object.assign(club.players.find(p => p.id === id), fields); };
  const fresh = power(startMatch(1, home, away), 0);
  set({ cond: 60 });
  const m = startMatch(1, home, away), tired = power(m, 0);
  assert.equal(m.pl[ids[0]].fit, 60);
  assert.ok(tired.att < fresh.att && tired.def < fresh.def && tired.ctrl < fresh.ctrl);
  set({ cond: 100, morale: 100 });
  const happy = power(startMatch(1, home, away), 0);
  for (const k of ['att', 'def', 'ctrl']) assert.ok(Math.abs(happy[k] / fresh[k] - 1.02) < 1e-9, k);
});
```

In `tests/season.test.js`, add `import { available } from '../src/squad.js';` to the imports and append:

```js
test('injured and banned players are left out of the XI and the bench; the rest of your XI stays', () => {
  const s = world(41);
  takeClub(s, 5);
  const club = myClub(s), keep = [...s.lineup];
  const hurt = club.players.find(p => p.id === s.lineup[5]), banned = club.players.find(p => p.id === s.bench[0]);
  hurt.inj = { name: 'knock', days: 3 }; banned.ban = 1;
  fixLineup(s);
  assert.ok(!s.lineup.includes(hurt.id) && !s.bench.includes(hurt.id) && !s.bench.includes(banned.id) && !s.lineup.includes(banned.id));
  assert.deepEqual(s.lineup.filter((_, k) => k !== 5), keep.filter((_, k) => k !== 5));
  assert.ok(!bestXI(club, '4-4-2').includes(hurt.id) && !autoBench(club, s.lineup).includes(banned.id));
  assert.ok([...s.lineup, ...s.bench].every(id => available(club.players.find(p => p.id === id))));
});

test('the assistant picks fresh players over tired ones', () => {
  const s = world(42), club = s.clubs[5], first = bestXI(club, '4-4-2');
  for (const p of club.players) if (first.includes(p.id)) p.cond = 0;
  const again = bestXI(club, '4-4-2');
  assert.equal(again.filter(id => !first.includes(id)).length, club.players.length - 11); // every fresh player is in
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/match.test.js tests/season.test.js`
Expected: the three new tests FAIL (`fit` is 100, not 60; the injured player is still picked).

- [ ] **Step 3: Change `src/match.js`**

Add the import:

```js
import { readiness } from './squad.js';
```

In `makeSide`, replace the `pl[id] = ...` line with:

```js
    pl[id] = { name: p.name, pos: p.pos, attrs: p.attrs, side, fit: p.cond, edge: readiness(p), rt: 6, yc: 0, inj: false, played: ids.includes(id) };
```

In `power`, replace the comment above it and the `const p = ..., e = ...` line:

```js
// Attack, defence and ball control of side i right now. Like strength() (lineup.js) at kick-off with
// default tactics and fresh players, but tired players count for less, injured or sent-off players
// for nothing (the divisors stay those of a full XI), each player's readiness (morale, form,
// sharpness: src/squad.js) scales him, and tactics and formation familiarity shift the result.
```

```js
    const p = m.pl[o.id], e = eff(p, o.pos, o.role) * (0.7 + 0.3 * p.fit / 100) * (p.edge ?? 1); // edge: missing in a version 5 live match
```

Replace the comment above `function injury` with:

```js
// The match only marks the injury; afterMatch() in src/squad.js gives it a recovery time.
```

- [ ] **Step 4: Change `src/lineup.js`**

Add the import:

```js
import { available, readiness } from './squad.js';
```

Replace `bestXI` (with its comment) by:

```js
// How much a manager wants player p in a slot: his fit for it (rated by the position's default
// role), less when he is tired, out of form or unhappy. Injured and banned players only when
// nobody else is left. ponytail: no "too few fit players" rule.
const pickScore = (p, pos) => available(p) ? eff(p, pos) * (0.7 + 0.3 * p.cond / 100) * readiness(p) : -1;
function pickFor(club, pos, used) {
  let best = null;
  for (const p of club.players) if (!used.has(p.id) && (!best || pickScore(p, pos) > pickScore(best, pos))) best = p;
  used.add(best.id);
  return best.id;
}

// Greedy slot-by-slot pick.
export function bestXI(club, formation) {
  const used = new Set();
  return slots(formation).map(pos => pickFor(club, pos, used));
}
```

Replace `fixLineup` (with its comment) by:

```js
// Repairs the human club's matchday plan after a sale, an injury, a ban or a formation change:
// each XI slot holding a missing, unavailable or repeated player gets the best one left, the other
// slots stay; the bench keeps up to BENCH available squad players outside the XI (gaps filled by
// autoBench); slot tactics are made to fit.
export function fixLineup(s) {
  const club = s.clubs[s.me], pos = slots(s.formation), byId = new Map(club.players.map(p => [p.id, p])), used = new Set();
  const kept = pos.map((_, k) => {
    const p = byId.get(s.lineup[k]);
    if (!p || !available(p) || used.has(p.id)) return null;
    used.add(p.id);
    return p.id;
  });
  s.lineup = kept.map((id, k) => id ?? pickFor(club, pos[k], used));
  const bench = [...new Set(s.bench)].filter(id => byId.has(id) && available(byId.get(id)) && !s.lineup.includes(id));
  s.bench = [...bench, ...autoBench(club, [...s.lineup, ...bench])].slice(0, BENCH);
  s.tactics.slots = fitSlots(s.tactics.slots, pos);
}
```

In `autoBench`, change the first line of the body to:

```js
  const rest = club.players.filter(p => !taken.includes(p.id) && available(p)).sort((a, b) => overall(b) - overall(a) || a.id - b.id);
```

and its comment to `// Matchday bench, from the available squad players not in \`taken\`: the best of each position first, then the best of the rest.`

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all pass, including 'at kick-off a side is exactly as strong as its lineup' (fresh players have `edge` exactly 1 and `fit` 100). If 'the assistant picks fresh players over tired ones' fails with 10 instead of 7, a fresh outfielder lost a slot to a tired player rated far higher. Print `again.map(id => club.players.find(p => p.id === id).pos)` to confirm, then try seed 43 or 44. Change only the seed, not the rule.

- [ ] **Step 6: Commit**

```bash
git add src/match.js src/lineup.js tests/match.test.js tests/season.test.js
git commit -m "feat: condition and readiness in the match engine; injured and banned players are not picked"
```

---

### Task 4: The career — match aftermath, days between matches, summer break, save version 6

**Files:**
- Modify: `src/season.js` (imports, `takeClub`, `playDay`, new `between`, `endSeason`)
- Modify: `src/world.js` (`createWorld` state)
- Modify: `src/save.js` (version 6, migration, `valid`)
- Test: `tests/season.test.js`, `tests/save.test.js`

**Interfaces:**
- Consumes:
  - from Task 1: `afterMatch`, `passDays`, `offseason`, `available`;
  - from Task 2: `defaultTraining`, `trainingOf`, `recoverRate`, `trainWeek`, `INTENSITY`, `setTraining`;
  - from Task 3: selection that respects availability.
- Produces:
  - `s.training`, `s.news` (state);
  - `SAVE_VERSION = 6`;
  - `playDay` keeps its signature and return value and fills `s.news`.

- [ ] **Step 1: Write the failing tests**

In `tests/season.test.js`, add `import { setTraining } from '../src/training.js';` and append:

```js
test('a season of squad dynamics: nobody plays while out, players get injured and come back', () => {
  const s = world(31);
  takeClub(s, 6);
  const everOut = new Set();
  let returned = 0;
  while (!s.done) {
    const out = new Set(s.clubs.flatMap(c => c.players.filter(p => !available(p)).map(p => p.id)));
    for (const r of playDay(s)) for (const x of r.ratings) {
      assert.ok(!out.has(x.id), `${x.name} played while injured or banned`);
      if (everOut.has(x.id)) returned++;
    }
    for (const id of out) everOut.add(id);
  }
  assert.ok(everOut.size > 10, `only ${everOut.size} players were ever out`);
  assert.ok(returned > 0);
});

test('news lists only your new injuries and bans; condition stays a whole number 0-100', () => {
  const s = world(32);
  takeClub(s, 6);
  for (let k = 0; k < 40 && !s.done; k++) {
    playDay(s);
    for (const n of s.news) assert.ok(n.club === 6 && myClub(s).players.some(p => p.id === n.id) && ['injury', 'ban'].includes(n.type), JSON.stringify(n));
    assert.ok(s.clubs.every(c => c.players.every(p => Number.isInteger(p.cond) && p.cond >= 0 && p.cond <= 100)));
  }
});

test('your training schedule trains your squad, AI clubs train Balanced; the summer break resets the season', () => {
  const s = world(33);
  takeClub(s, 6);
  setTraining(s, 'focus', 'Rest');
  while (!s.done) playDay(s);
  assert.ok(myClub(s).players.every(p => p.gain === 0));
  assert.ok(s.clubs.some(c => c.id !== 6 && c.players.some(p => p.gain > 0)));
  endSeason(s);
  assert.ok(s.clubs.every(c => c.players.every(p => p.gain === 0 && p.yc === 0 && p.cond === 100 && p.sharp === 100)));
});
```

In `tests/save.test.js`, add `import { freshState } from '../src/player.js';` and `import { defaultTraining } from '../src/training.js';`, then append:

```js
// A save as Phase 4 (version 5) wrote it: no squad dynamics and no training.
function asV5(s) {
  const o = JSON.parse(serialize(s));
  o.version = 5;
  delete o.training; delete o.news;
  for (const p of [...o.clubs.flatMap(c => c.players), ...o.market]) for (const k of Object.keys(freshState())) delete p[k];
  return o;
}

test('a version 5 save gets fresh players and default training, and plays on', () => {
  const a = createWorld(22, MINI);
  takeClub(a, 3);
  playDay(a);
  const b = deserialize(JSON.stringify(asV5(a)));
  assert.equal(b.version, SAVE_VERSION);
  assert.deepEqual(b.training, defaultTraining());
  assert.deepEqual(b.news, []);
  for (const p of [...b.clubs[3].players, ...b.market]) for (const [k, v] of Object.entries(freshState())) assert.deepEqual(p[k], v, k);
  assert.ok(playDay(b).length);
});

test('a live match saved by version 5 carries on without readiness', () => {
  const a = createWorld(23, MINI);
  takeClub(a, 3);
  const m = kickOff(a);
  for (let k = 0; k < 20; k++) stepMinute(m);
  const o = asV5(a);
  for (const p of Object.values(o.live.pl)) delete p.edge;
  const b = deserialize(JSON.stringify(o));
  while (!b.live.done) stepMinute(b.live);
  assert.ok(playDay(b).some(r => r.h === 3 || r.a === 3));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/season.test.js tests/save.test.js`
Expected: the new tests FAIL (`s.news` undefined; save version is 5, not 6).

- [ ] **Step 3: Change `src/season.js`**

Imports:

```js
import { afterMatch, passDays, offseason } from './squad.js';
import { defaultTraining, trainingOf, recoverRate, trainWeek, INTENSITY } from './training.js';
```

In `takeClub`, add as the last line:

```js
  s.training = defaultTraining();
```

Add above `playDay`:

```js
// The days from one match day to the next: every club trains once per calendar week crossed, then
// injuries heal and condition, sharpness and morale move (free agents rest at the Normal rate).
// Training injuries at the human club become news.
function between(s, rng, from, to) {
  const weeks = Math.floor(to / 7) - Math.floor(from / 7);
  for (const c of s.clubs) {
    const t = trainingOf(s, c);
    for (let w = 0; w < weeks; w++) for (const p of trainWeek(rng, c, t))
      if (c.id === s.me) s.news.push({ type: 'injury', club: c.id, id: p.id, name: p.name, injury: p.inj.name, days: p.inj.days, training: true });
    passDays(c.players, to - from, recoverRate(t));
  }
  passDays(s.market, to - from, INTENSITY.Normal.recover);
}
```

Replace `playDay` with:

```js
// Plays the next calendar day: every match of every competition on it. A live match is played out
// first; whatever is left of it is handed to the assistant manager (AI substitutions for both sides).
// Each match leaves condition, form, morale, injuries and bans on both squads (src/squad.js); then
// the days up to the next match day pass. s.news collects the human club's new injuries and bans.
// Returns the day's results: matchResult() plus item (the calendar item it belongs to).
export function playDay(s) {
  if (s.done) return null;
  if (s.me !== null) fixLineup(s);
  const today = s.days[s.next], live = s.live, played = !!myFixture(s);
  if (live) { for (const S of live.sides) S.auto = true; while (!live.done) stepMinute(live); }
  const rng = makeRng(s.seed);
  s.last = []; s.news = [];
  for (const it of today.items) for (const f of fixtures(s, it)) {
    const m = live && live.sides[0].club === f.h && live.sides[1].club === f.a ? live : play(rng, s, f);
    if (f.tie) settle(f, m);
    const r = { ...matchResult(m), item: { ...it } };
    if (it.comp === 'league') { record(s.clubs[f.h].st, r.hg, r.ag); record(s.clubs[f.a].st, r.ag, r.hg); addMatch(s, it.div, r); }
    if (f.h === s.me && !f.neutral) s.budget += 20e3 * tier(s.clubs[f.h]); // gate receipts
    s.news.push(...afterMatch(s, m, it.comp, rng).filter(n => n.club === s.me));
    s.last.push(r);
  }
  for (const it of today.items) advance(s, rng, it);
  if (s.me !== null) s.budget += 25e3 * tier(myClub(s)) * (Math.floor(today.day / 7) - Math.floor(s.day / 7)); // weekly income
  if (played) learnFam(s.fam, s.formation); // the formation you prepared, not mid-match switches
  s.live = null;
  s.day = today.day;
  s.next++;
  s.done = s.next === s.days.length;
  if (!s.done) between(s, rng, today.day, s.days[s.next].day);
  s.seed = rng.seed;
  return s.last;
}
```

In `endSeason`, update the comment's second line to `// then ages the players (club players develop in training, free agents at rollover), gives everyone the summer break,` / `// refreshes the free agents and schedules the next season.` Then change the club-player loop and the free-agent line:

```js
    c.players = c.players.map(p => {
      if (p.age >= RETIRE_AGE) return createPlayer(rng, s.nid++, p.pos, c.quality - 2, rng.int(17, 19)); // youth replaces retiree
      delete p.stats;
      p.age++; // growth and decline happen week by week in training (src/training.js)
      offseason(p);
      return p;
    });
```

```js
  for (const p of kept) { ageOneYear(rng, p); offseason(p); }
```

- [ ] **Step 4: Change `src/world.js`**

Add `import { defaultTraining } from './training.js';`. In the `createWorld` state object, add `training: defaultTraining(), news: [],` after `fam: newFam(), budget: 0,`.

- [ ] **Step 5: Change `src/save.js`**

Imports:

```js
import { freshState } from './player.js';
import { defaultTraining } from './training.js';
```

```js
export const SAVE_VERSION = 6; // 2: clubs from real data with short, colours, kit. 3: live match, richer results. 4: tactics. 5: calendar, cup, play-offs, records. 6: squad dynamics, training
```

Add to the end of `valid`'s expression:

```js
  && !!s.training && typeof s.training.ind === 'object' && Array.isArray(s.news);
```

Add to `MIGRATIONS`:

```js
  5: s => { // squad dynamics: everyone fresh, default training. A live match's players read edge ?? 1.
    for (const p of [...s.clubs.flatMap(c => c.players), ...s.market]) Object.assign(p, freshState());
    s.training = defaultTraining(); s.news = [];
  },
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: all pass. If 'a season of squad dynamics' fails because a club fielded an unavailable player, that club had fewer than 11 fit players. Print the club and its unavailable count. With 18-player mini squads this should not happen, so treat it as a bug in `between` (injuries not healing), not as a reason to loosen the test.

- [ ] **Step 7: Commit**

```bash
git add src/season.js src/world.js src/save.js tests/season.test.js tests/save.test.js
git commit -m "feat: matches and the days between them shape every squad; summer break; save version 6"
```

---

### Task 5: Calibration on the real leagues

**Files:**
- Modify: `tests/england.test.js` ('a season of real leagues plays like real football')
- Modify, only if a target is missed: `K.SHOT_RATE` in `src/match.js`, `INJURY` in `src/training.js`, the weights of `INJURIES` in `src/squad.js`

**Interfaces:**
- Consumes: `available` from `src/squad.js`; everything from Tasks 1–4.
- Produces: the calibration test with the new availability target.

- [ ] **Step 1: Extend the test** — add `import { available } from '../src/squad.js';` and replace the test with:

```js
test('a season of real leagues plays like real football', () => {
  const s = createWorld(1);
  let n = 0, goals = 0, home = 0, yellows = 0, reds = 0, pens = 0, out = 0, matchDays = 0;
  while (!s.done) {
    out += s.clubs.reduce((t, c) => t + c.players.filter(p => !available(p)).length, 0); matchDays++;
    for (const r of playDay(s).filter(x => x.item.comp === 'league')) {
      n++; goals += r.hg + r.ag; if (r.hg > r.ag) home++;
      yellows += r.stats[0].yc + r.stats[1].yc; reds += r.stats[0].rc + r.stats[1].rc;
      pens += r.ev.filter(e => e.kind === 'pen').length;
    }
  }
  const missing = out / matchDays / s.clubs.length;
  assert.ok(goals / n >= 2.5 && goals / n <= 2.9, `goals per match ${goals / n}`);
  assert.ok(home / n >= 0.43 && home / n <= 0.47, `home wins ${home / n}`);
  assert.ok(yellows / n >= 2.5 && yellows / n <= 4, `yellows per match ${yellows / n}`);
  assert.ok(reds / n <= 0.3, `reds per match ${reds / n}`);
  assert.ok(pens / n >= 0.15 && pens / n <= 0.4, `penalties per match ${pens / n}`);
  assert.ok(missing >= 0.5 && missing <= 3, `players out per club ${missing}`);
});
```

- [ ] **Step 2: Run it and read the numbers**

Run: `node --test tests/england.test.js`
Print the actual values once, even if the test passes: temporarily add `console.log({ goals: goals / n, home: home / n, yellows: yellows / n, reds: reds / n, pens: pens / n, missing })` before the asserts. Note them for the summary, then remove the line.

- [ ] **Step 3: Tune only what is out of range, one knob at a time, re-running after each change**

| Missed target | Knob | Direction |
|---------------|------|-----------|
| goals < 2.5 | `K.SHOT_RATE` in `src/match.js` | +0.005 per step |
| goals > 2.9 | `K.SHOT_RATE` | −0.005 per step |
| home wins outside 43–47% | `HOME_EDGE` in `src/match.js` | ±0.01 per step |
| players out > 3 | `INJURY` in `src/training.js` | −0.001 per step; then halve the `knee ligaments` and `ankle ligaments` weights |
| players out < 0.5 | `INJURY` | +0.001 per step |

Cards and penalties do not depend on Phase 5 and should not move. If they do, stop and look for a bug instead of tuning. Each changed constant keeps its comment, plus `(tuned in Phase 5)`.

- [ ] **Step 4: Run everything**

Run: `npm test`
Expected: all pass. Run it twice: same numbers both times (determinism).

- [ ] **Step 5: Commit**

```bash
git add tests/england.test.js src/match.js src/training.js src/squad.js
git commit -m "test: calibration covers players out injured or banned"
```

---

### Task 6: Interface — squad status, Training screen, profile, news

**Files:**
- Modify: `src/ui/app.js`

**Interfaces:**
- Consumes:
  - `available`, `formAvg`, `moraleLabel`, `YELLOW_LIMIT` from `src/squad.js`;
  - `FOCUS`, `INTENSITY`, `setTraining`, `setFocus` from `src/training.js`;
  - `ALL_ATTRS` from `src/player.js`;
  - `s.news`, `s.training`.
- Produces: the Training tab; status columns on Squad; the news message after a day is played.

- [ ] **Step 1: Imports** — change the first import line and add two:

```js
import { POS, ATTRS, ALL_ATTRS, overall, value } from '../player.js';
import { available, formAvg, moraleLabel, YELLOW_LIMIT } from '../squad.js';
import { FOCUS, INTENSITY, setTraining, setFocus } from '../training.js';
```

- [ ] **Step 2: Helpers** — below the `nameBtn` line:

```js
const outFor = d => d < 14 ? `${d} days` : `${Math.round(d / 7)} weeks`;
const status = p => p.inj ? `${esc(p.inj.name)}, ${outFor(p.inj.days)}` : p.ban ? `banned for ${p.ban} match${p.ban > 1 ? 'es' : ''}`
  : p.yc % YELLOW_LIMIT === YELLOW_LIMIT - 1 ? '🟨 one more yellow is a ban' : '';
const SQUAD_HEAD = '<th class="n">Cond</th><th>Morale</th><th class="n">Form</th><th>Status</th>';
const squadCells = p => `<td class="n">${p.cond}%</td><td>${moraleLabel(p.morale)}</td><td class="n">${formAvg(p) ?? '–'}</td><td class="${available(p) ? 'dim' : 'oop'}">${status(p)}</td>`;
// The human club's new injuries and bans from the day just played.
const newsText = () => s.news.map(n => n.type === 'injury'
  ? `🚑 ${esc(n.name)} is out for ${outFor(n.days)} (${esc(n.injury)}${n.training ? ', in training' : ''}).`
  : `🟥 ${esc(n.name)} is banned for ${n.matches} match${n.matches > 1 ? 'es' : ''}.`).join('<br>');
```

- [ ] **Step 3: Squad screen** — in `views.Squad`:
  - In the `row` template, add `${squadCells(p)}` right after `${cells(p)}`.
  - In the header row, change `<th>Slot</th>${HEAD}<th></th>` to `<th>Slot</th>${HEAD}${SQUAD_HEAD}<th></th>`.
  - Change both `colspan="7"` to `colspan="11"`.
  - Change the hint paragraph to:

```js
      <p class="dim">Click two names to swap them between the XI, the bench and the reserves. Orange slot = playing out of position. Injured and banned players cannot play: the assistant puts someone else in their place.</p>
```

- [ ] **Step 4: Profile** — in `profile()`, insert after the closing `</h3>` of the title (before `${Object.entries(ATTRS)...}`):

```js
<p>Condition ${p.cond}% · sharpness ${Math.round(p.sharp)}% · morale ${moraleLabel(p.morale)} · form ${formAvg(p) ?? '–'} · ${p.yc} league yellow${p.yc === 1 ? '' : 's'}${status(p) ? ` · <span class="oop">${status(p)}</span>` : ''}</p>
```

- [ ] **Step 5: Training screen** — in `views`, directly after `Tactics() {...},` (key order sets the tab order):

```js
  Training() {
    const t = s.training, pairs = o => Object.keys(o).map(k => [k, k]);
    const focus = p => fieldSelect('focus', 'attr', [['', 'With the team'], ...ALL_ATTRS.map(k => [k, label(k)])], t.ind[p.id] ?? '', p.id);
    return `<h2>Weekly schedule</h2><div class="bar"><label>Focus ${fieldSelect('trainField', 'focus', pairs(FOCUS), t.focus)}</label>
      <label>Intensity ${fieldSelect('trainField', 'intensity', pairs(INTENSITY), t.intensity)}</label></div>
      <p class="dim">Each week, players aged 23 or under may improve one attribute, never beyond their hidden potential: about four a season at Normal.
      Hard trains faster, but players recover less between matches and get hurt more often; Light is the reverse. Rest stops improvement and speeds recovery.
      Keepers always work on goalkeeping. An individual focus takes half of a player's improvement. Players aged 31 and over slowly lose pace, stamina, strength and agility whatever you do.</p>
      <div class="wrap"><table><tr><th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Gained</th><th>Individual focus</th></tr>
      ${byPos(myClub(s).players).map(p => `<tr>${nameBtn(p, 'view')}<td>${p.pos}</td><td class="n">${p.age}</td><td class="n">${p.gain ? '+' + p.gain : ''}</td><td>${focus(p)}</td></tr>`).join('')}</table></div>`;
  },
```

- [ ] **Step 6: Actions** — in `actions`, change `play` and add two:

```js
  play() { stopClock(); playDay(s); subOut = null; msg = newsText(); },
  trainField(_, el) { msg = setTraining(s, el.dataset.field, el.value) || ''; },
  focus(id, el) { msg = setFocus(s, id, el.value || null) || ''; },
```

- [ ] **Step 7: Run the tests**

Run: `npm test` — Expected: all pass (the UI has no unit tests, but the engine must be untouched).

- [ ] **Step 8: Verify in the browser** — `preview_start` with `{ name: "touchline" }`:
  1. Click **New game** (the old save migrates, but start clean), pick a Championship club.
  2. **Squad**: four new columns; Cond 100%, Morale Okay, Form –; no console errors (`read_console_messages` with `onlyErrors`).
  3. **Training**: set Focus Attacking and Intensity Hard, give one player "finishing"; switch tabs and back: the choices are kept.
  4. **Match** → Quick result about 15 times. Squad: Cond below 100 for recent starters, Form numbers, morale labels move. When a 🚑 or 🟥 message appears, that player's Status cell is orange and he is not in the XI or on the bench.
  5. Open an injured player's **Profile**: the status line names the injury.
  6. Play a live match: the Fit column starts at each player's condition, not 100%.
  7. Screenshot the Squad screen with an injured player for the summary.

- [ ] **Step 9: Commit**

```bash
git add src/ui/app.js
git commit -m "feat: squad status columns, training screen and injury and ban news"
```

---

### Task 7: Docs — fun surprises and roadmap

**Files:**
- Modify: `docs/fun-surprises.md`
- Modify: `docs/superpowers/plans/2026-11-15-touchline-roadmap.md`

- [ ] **Step 1: Update `docs/fun-surprises.md`**

Replace row 2 with:

```markdown
| 2 | **Youth flipping.** Players aged 23 or under improve every week in training up to their hidden potential, and they are valued 30% higher than players aged 24–30. Buying a young player, holding him for a few seasons and selling just before he turns 24 reliably makes money. Since Phase 5, Hard training speeds it up. | Buy cheap 17–20-year-olds, train them hard, sell at 23. | `trainWeek()` in `src/training.js` (free agents: `ageOneYear()` in `src/player.js`), `value()` in `src/player.js` | Phase 1 (kept 2026-11-15) |
```

Replace row 6 with:

```markdown
| 6 | **Hard tackling has a price.** "Tackle harder" adds 2% to a player's defensive contribution. It costs more yellow cards, and since Phase 5 every fifth league yellow is a one-match ban (second yellow: one match; straight red: three). Kept as it is: the bans are the price. | Set it on defenders and holding midfielders. Switch it off for a player the Squad screen shows one yellow from a ban, or who is already on a yellow in a match. | `power()` and `foul()` in `src/match.js`; bans in `afterMatch()` in `src/squad.js` | Phase 3 (priced in Phase 5) |
```

Add rows 9 and 10:

```markdown
| 9 | **Serve a league ban in the cup.** A ban counts down with every match the club plays, in any competition. A cup tie or a play-off can soak up a ban before a big league match. | Got a key player banned? Check Coming up: if a cup tie is next, he misses that instead of the league game. | `afterMatch()` in `src/squad.js` | Phase 5 |
| 10 | **Training finds the hidden potential.** An individual focus stops raising an attribute once it reaches the player's hidden potential, so a young player's Gained number stalls exactly at his ceiling. | Give a young player an individual focus on his best attribute. When it stops rising, you know his potential, and whether he is worth keeping. | `raise()` in `src/training.js` | Phase 5 |
```

- [ ] **Step 2: Update the roadmap**
  - In row 5 of `docs/superpowers/plans/2026-11-15-touchline-roadmap.md`, change `to write` to `` `2026-11-15-touchline-phase-5-squad-dynamics.md` (done YYYY-MM-DD) `` with the actual completion date.
  - Replace the line `Phase 5 note: suspensions give "Tackle harder" its price (fun surprise #6); decide then whether to keep it cheap.` with:

```markdown
Phase 5 note (decided 2026-11-15): suspensions price "Tackle harder"; it stays as it is (fun surprise #6).

Phase 9 note: staff scale squad dynamics. Coaches scale `GROWTH` and `INTENSITY` in `src/training.js`; physios scale recovery (`passDays`) and injury length (`INJURIES`) in `src/squad.js`.
```

- [ ] **Step 3: Run the tests and commit**

Run: `npm test` — Expected: all pass.

```bash
git add docs/fun-surprises.md docs/superpowers/plans/2026-11-15-touchline-roadmap.md
git commit -m "docs: mark Phase 5 done; tackling priced by bans, cup serves bans, training finds potential"
```

- [ ] **Step 4: End-of-phase summary** (in chat, not a file):
  - what changed;
  - the calibration numbers from Task 5;
  - the screenshot from Task 6;
  - the fun surprises: #2 and #6 updated, #9 and #10 new.
