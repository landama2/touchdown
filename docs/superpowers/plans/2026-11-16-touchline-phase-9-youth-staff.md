# Touchline Phase 9 — Youth & Staff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Every club has backroom staff in three areas: **coaching**, **scouting** and **medical**, each a level from 1 to 5.
  - Coaching scales how fast young players develop, and the size of the youth intake.
  - Scouting sets how many scouts you have and how fast they report.
  - Medical scales how long injuries last.
- You pick your club's levels and pay for anything above your division's standard.
- A **youth squad** gets a yearly intake. You promote youngsters to the first team or release them, and when contracts end and the first team runs short, the youth squad fills the gaps first.

**Architecture:**
- **`src/staff.js` (new):** the areas, each level's effect, AI clubs' levels (`aiStaff`) and setting your own (`setStaff`). Pure.
- **`src/youth.js` (new):** the intake, youth training, the ceiling estimate, promote and release, filling first-team gaps (`fromYouth`) and ageing out. Pure.
- **`src/finance.js`:** the staff costs (`STANDARD`, `STAFF_COST`, `staffBill`) and a `staff` line in the club ledger. Only your club pays, and only beyond the standard.
- **`src/squad.js`, `src/training.js`:** injury length is scaled by Medical, and training growth by Coaching.
- **`src/scouting.js`:** the number of scouts and the days to report follow the Scouting level, replacing Phase 8's per-division `SCOUTS`.
- **`src/contracts.js`, `src/transfers.js`:** wage-budget checks count staff costs; expiring contracts are refilled from the youth squad first.
- **`src/season.js`, `src/world.js`:** staff at `takeClub` and every season start; the youth squad's intake, training and ageing.
- **Saves:** version 10.
- **UI:** new **Staff** and **Youth** tabs, a staff line in Finances, youth leavers in History, and Scouting's report times follow your level.

**Tech Stack:** Vanilla JavaScript ES modules, HTML/CSS, Node ≥ 22 built-in test runner. No npm dependencies. Local preview via the `touchline` server in `.claude/launch.json` (port 8127).

**Prototype:** every change below was built and run on a copy of the repository at commit `20a234f` (2026-11-16), one task at a time. The suite passed after each task: 195, then 201, then 202 tests. A headless-browser run logged no errors:
- a version 9 save loads;
- staff levels change, and an over-budget upgrade is refused;
- a new game's youth intake shows;
- promote and release work;
- Finances shows the staff line.

## Global Constraints

- Node 22 or newer; no packages.
- Engine code must not reference `document`, `window`, `localStorage`, `Math.random` or `Date`.
- State survives `JSON.parse(JSON.stringify(state))`. Determinism: same seed + same inputs = same career.
- **Calibration must still hold** (real leagues, seed 1): every target from Phases 2–7 in `tests/england.test.js`, including players unavailable 0.5–3 per club, the money ratios and the transfer-market targets. Level 3 is neutral by design, and the prototype passed them all unchanged.
- This is a private personal project: real names are used.
- Fun surprises rule: keep minor fun quirks, record them in `docs/fun-surprises.md`, mention them in the end-of-phase summary.
- Every task ends with `npm test` passing and a commit. Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Design decisions (made while planning, 2026-11-16)

Choices made by the owner while planning:
- **Youth:** a separate youth squad: a yearly intake, no wages, no matches; promote or release.
- **Staff roles:** coaching, scouting, medical. A head of youth is folded into coaching.
- **Getting staff:** **upgrade levels**, not individual staff: you pay to set each area's level 1–5, with weekly running costs.
- **AI clubs:** staff effects apply to them too, scaled by club size.

**Levels and effects** (level 3 = exactly the game as calibrated so far):

| Level | 1 | 2 | 3 | 4 | 5 |
|-------|---|---|---|---|---|
| Coaching: × growth chance (first team and youth) | 0.7 | 0.85 | 1 | 1.15 | 1.3 |
| Coaching: youth intake a year | 3 | 4 | 5 | 6 | 7 |
| Coaching: width of the youth ceiling estimate | 12 | 9 | 6 | 4 | 2 |
| Scouting: scouts (yours) | 1 | 2 | 2 | 3 | 3 |
| Scouting: × days to report | 1.4 | 1.2 | 1 | 0.85 | 0.7 |
| Medical: × injury length | 1.25 | 1.1 | 1 | 0.9 | 0.8 |
| Cost a week, per area | €2k | €6k | €20k | €60k | €180k |

- Injury length is scaled when the injury happens: `injure(rng, p, scale)` multiplies the drawn days and rounds, with at least 1 day. It draws exactly the same random numbers as before.
- Medical affects match and training injuries alike.

**Standard levels and costs:**
- Each division's books already pay for a standard level, `STANDARD` = 4 · 3 · 2 (Premier League · Championship · League One).
- Your club starts at its standard in all three areas.
- `staffBill(s, c)` is what your club pays each week beyond the standard: Σ (cost of your level − cost of the standard), negative when you save.
  - It is paid with the weekly instalments into a new ledger line, `staff`.
  - It counts against the wage budget, for raising a level, signing, renewing and promoting.
- AI clubs pay nothing extra: their books were calibrated with standard staff.
- After promotion or relegation your levels stay put but the standard moves, so your bill changes.
- Levels can be changed at any time.

**AI clubs' levels** (`aiStaff`, at a new world and every season start):
- The division's standard, +1 for a club whose quality is at least a point above its division's median, −1 at least a point below (clamped to 1–5).
- Prototype: one Premier League club at 5 and some at 3; Championship 2–4; League One 1–3.
- AI clubs have no scouts and no youth squad. Their gaps are still filled by the Phase 6 academy rule.

**Youth squad** (`s.youth`, your club only):
- **Intake:** each summer `2 + coaching level` players arrive (also when you take a club), aged 15–16, at your club's quality − 3 + (coaching − 3), with at most 20 in the squad.
  - Their hidden potential sits 2–6 above their best key attribute, so youngsters have real room to grow.
  - The first intake at `takeClub` uses an RNG built from the seed, without advancing the career's sequence.
- **Training:** every calendar week each youngster raises one key attribute with chance 0.15 × coaching, never above his potential. He has no injuries, no matches and no contract.
- **Ceiling:** the overall he would reach with every key attribute at potential. It is shown as a range whose width depends on coaching and that always holds the truth.
- **Promote:** he joins the first team on a starter contract (his going rate, 3 seasons) within the squad limit and the wage budget.
- **Release:** he leaves the game.
- **Leaving:** at 19 those still in the youth squad leave (History lists them).
- **Gaps:** when contracts end and your first team falls below 16, the best youth player in each leaver's position steps up before a generated academy player.

**Saves:** version 10. The migration gives AI clubs their levels and your club its division's standard, an empty youth squad (the first intake comes in the summer), and `staff: 0` in this season's ledgers.

**Later phases:** Phase 10's board can tie the wage budget, which now includes staff, to income and debt. The roadmap's original note had coaches scale `GROWTH` and `INTENSITY` and physios scale recovery and injuries. Here Coaching scales growth and Medical scales injury length; intensity and recovery rates stay as calibrated.

## File map

| File | Change |
|------|--------|
| `src/staff.js` | **new** |
| `src/youth.js` | **new** |
| `src/finance.js` | `STANDARD`, `STAFF_COST`, `staffBill`; ledger `staff`; `payWeeks` charges it |
| `src/squad.js` | `injure(rng, p, scale)`; match injuries scaled by medical |
| `src/training.js` | growth × coaching; training injuries scaled by medical |
| `src/scouting.js` | scouts and report days follow the Scouting level (`taskDays`); `SCOUTS` moves to `staff.js` |
| `src/contracts.js` | renewals count staff costs; gaps filled from the youth squad first |
| `src/transfers.js` | signings count staff costs |
| `src/season.js`, `src/world.js` | staff and youth through the career |
| `src/save.js` | version 10 |
| `src/ui/app.js` | Staff and Youth tabs, Finances, History, Scouting |
| `tests/staff.test.js`, `tests/youth.test.js` | **new** |
| `tests/finance.test.js`, `tests/season.test.js`, `tests/scouting.test.js`, `tests/save.test.js` | updated |

---

### Task 1: Staff levels

**Files:**
- Create: `src/staff.js`, `tests/staff.test.js`
- Modify: `src/finance.js`, `src/squad.js`, `src/training.js`, `src/scouting.js`, `src/contracts.js`, `src/transfers.js`, `src/season.js`, `src/world.js`
- Test: `tests/finance.test.js`, `tests/season.test.js`, `tests/scouting.test.js`

**Interfaces:**
- Produces:
  - `src/staff.js`: `AREAS`, `COACHING`, `MEDICAL`, `SCOUTS`, `SCOUT_SPEED`, `coachScale`, `medicalScale`, `scoutsFor`, `scoutSpeed`, `standardStaff`, `aiStaff`, `setStaff`;
  - `src/finance.js`: `STANDARD`, `STAFF_COST`, `staffBill`;
  - `src/scouting.js`: `taskDays`;
  - `injure(rng, p, scale = 1)` in `src/squad.js`.
- `src/scouting.js` no longer exports `SCOUTS`.

- [ ] **Step 1: Write the failing tests** — create `tests/staff.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createWorld } from '../src/world.js';
import { takeClub } from '../src/season.js';
import { injure } from '../src/squad.js';
import { trainWeek, defaultTraining } from '../src/training.js';
import { wageBill, staffBill, payWeeks, STANDARD, STAFF_COST, SEASON_WEEKS } from '../src/finance.js';
import { AREAS, COACHING, MEDICAL, coachScale, medicalScale, aiStaff, standardStaff, setStaff } from '../src/staff.js';
import { MINI } from './fixtures/mini.js';

const median = list => [...list].sort((a, b) => a - b)[list.length >> 1];

test('AI clubs: their division\'s standard level, one up or down for a club well above or below the division\'s median', () => {
  const s = createWorld(1, MINI);
  for (const d of s.divisions) {
    const m = median(d.clubIds.map(id => s.clubs[id].quality));
    for (const id of d.clubIds) {
      const c = s.clubs[id], want = STANDARD[c.div] + Math.max(-1, Math.min(1, Math.round(c.quality - m)));
      assert.deepEqual(c.staff, Object.fromEntries(AREAS.map(a => [a, want])), c.name);
    }
  }
  takeClub(s, 14);
  assert.deepEqual(s.clubs[14].staff, standardStaff(2));
  s.clubs[14].staff.coaching = 5;
  aiStaff(s);
  assert.equal(s.clubs[14].staff.coaching, 5); // yours are left alone
});

test('effects: level 3 changes nothing; coaching scales growth, medical the length of injuries', () => {
  assert.deepEqual([COACHING[2], MEDICAL[2]], [1, 1]);
  assert.deepEqual([coachScale({}), medicalScale({})], [1, 1]); // a club without staff (old tests, hand-built clubs)
  const len = scale => injure(makeRng(5), { inj: null }, scale).days;
  assert.equal(len(1), injure(makeRng(5), { inj: null }).days);
  assert.equal(len(MEDICAL[4]), Math.max(1, Math.round(len(1) * MEDICAL[4])));
  const grown = level => {
    const s = createWorld(2, MINI), c = s.clubs[4], rng = makeRng(9);
    c.staff.coaching = level;
    for (const p of c.players) { p.age = 18; p.pot = 20; }
    for (let w = 0; w < 100; w++) { trainWeek(rng, c, defaultTraining()); for (const p of c.players) p.inj = null; }
    return c.players.reduce((t, p) => t + p.gain, 0);
  };
  assert.ok(grown(5) > grown(1) * 1.4, `${grown(5)} vs ${grown(1)}`);
});

test('the staff bill: only the human club, only beyond its division\'s standard; a saving below it', () => {
  const s = createWorld(3, MINI);
  takeClub(s, 14);
  const me = s.clubs[14], std = STAFF_COST[STANDARD[2] - 1];
  assert.equal(staffBill(s, me), 0);
  assert.equal(staffBill(s, s.clubs[0]), 0);
  s.wageBudget = 1e12;
  assert.equal(setStaff(s, 'coaching', 4), null);
  assert.equal(staffBill(s, me), STAFF_COST[3] - std);
  assert.equal(setStaff(s, 'medical', 1), null);
  assert.equal(staffBill(s, me), STAFF_COST[3] - std + STAFF_COST[0] - std);
  const bal = me.fin.balance, per = Math.round(staffBill(s, me) * 52 / SEASON_WEEKS);
  payWeeks(s, 2);
  assert.equal(me.fin.season.staff, 2 * per);
  assert.ok(me.fin.balance < bal);
  assert.equal(s.clubs[0].fin.season.staff, 0);
});

test('setting levels: 1-5 in a known area; going up must fit the wage budget, going down always works', () => {
  const s = createWorld(4, MINI);
  takeClub(s, 14);
  const me = s.clubs[14];
  assert.equal(setStaff(s, 'kit', 3), 'Unknown staff level.');
  assert.equal(setStaff(s, 'coaching', 6), 'Unknown staff level.');
  s.wageBudget = wageBill(me);
  assert.equal(setStaff(s, 'coaching', 5), 'Over the wage budget.');
  assert.equal(me.staff.coaching, STANDARD[2]);
  assert.equal(setStaff(s, 'coaching', 1), null);
  assert.equal(me.staff.coaching, 1);
});
```

  The changes to the existing tests are in the patch in Step 4: the ledger gains `staff: 0`, and the scouting tests use the Scouting level instead of the division.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/staff.test.js` — Expected: FAIL with `Cannot find module '.../src/staff.js'`.

- [ ] **Step 3: Create `src/staff.js`**

```js
import { wageBill, staffBill, STANDARD } from './finance.js';

// Backroom staff as levels 1-5 in three areas, for every club: c.staff = { coaching, scouting, medical }.
// Level 3 changes nothing (the game was calibrated without staff); each step up or down moves:
//   coaching: training growth (and the youth intake: src/youth.js)
//   scouting: how many scouts the human club has and how fast they report (src/scouting.js)
//   medical:  how long injuries last
// AI clubs get their division's standard level (STANDARD in finance.js), one higher or lower when
// their squad quality is a point or more above or below the division's median. The human club picks
// its own levels and pays for them: see staffBill() in finance.js.
export const AREAS = ['coaching', 'scouting', 'medical'];
export const COACHING = [0.7, 0.85, 1, 1.15, 1.3];     // × growth chance, by level 1-5
export const MEDICAL = [1.25, 1.1, 1, 0.9, 0.8];       // × injury length
export const SCOUTS = [1, 2, 2, 3, 3];                 // the human club's scouts
export const SCOUT_SPEED = [1.4, 1.2, 1, 0.85, 0.7];   // × days to report

const at = (list, level) => list[Math.max(1, Math.min(5, level)) - 1];
export const coachScale = c => at(COACHING, c.staff?.coaching ?? 3);
export const medicalScale = c => at(MEDICAL, c.staff?.medical ?? 3);
export const scoutsFor = c => at(SCOUTS, c.staff?.scouting ?? 3);
export const scoutSpeed = c => at(SCOUT_SPEED, c.staff?.scouting ?? 3);
const standard = div => STANDARD[Math.min(div, STANDARD.length - 1)];
export const standardStaff = div => Object.fromEntries(AREAS.map(a => [a, standard(div)]));

// Every AI club's levels from its division and size (at a new world and every season start).
export function aiStaff(s) {
  for (const d of s.divisions) {
    const q = d.clubIds.map(id => s.clubs[id].quality).sort((a, b) => a - b), median = q[q.length >> 1];
    for (const id of d.clubIds) {
      if (id === s.me) continue;
      const c = s.clubs[id], step = Math.max(-1, Math.min(1, Math.round(c.quality - median)));
      c.staff = Object.fromEntries(AREAS.map(a => [a, Math.max(1, Math.min(5, standard(c.div) + step))]));
    }
  }
}

// Sets the human club's level in one area. Going up must fit the wage budget together with the wage
// bill (staff costs count against it). Error message or null.
export function setStaff(s, area, level) {
  const c = s.clubs[s.me];
  if (!AREAS.includes(area) || !Number.isInteger(level) || level < 1 || level > 5) return 'Unknown staff level.';
  const old = c.staff[area];
  c.staff[area] = level;
  if (level > old && wageBill(c) + staffBill(s, c) > s.wageBudget) { c.staff[area] = old; return 'Over the wage budget.'; }
  return null;
}
```

- [ ] **Step 4: Change the existing files** — apply this patch (`git apply`), or make the same edits by hand:

```diff
diff --git a/src/contracts.js b/src/contracts.js
index 98cdd5e..e46326f 100644
--- a/src/contracts.js
+++ b/src/contracts.js
@@ -1,5 +1,5 @@
 import { createPlayer, overall, value } from './player.js';
-import { wage, wageBill } from './finance.js';
+import { wage, wageBill, staffBill } from './finance.js';
 
 // Contracts. p.contract = { wage (euros a week), until (the last season it covers), clause (release
 // clause in euros, or null) }; free agents have none. A contract ends after season `until`.
@@ -34,7 +34,7 @@ export function renew(s, id) {
   if (p.loan) return `${p.name} is on loan here.`;
   if (!canRenew(s, p)) return 'He has more than a season left on his contract.';
   const t = terms(s, p);
-  if (t.wage > p.contract.wage && wageBill(club) - p.contract.wage + t.wage > s.wageBudget) return 'Over the wage budget.';
+  if (t.wage > p.contract.wage && wageBill(club) + staffBill(s, club) - p.contract.wage + t.wage > s.wageBudget) return 'Over the wage budget.';
   p.contract = { wage: t.wage, until: s.season + t.years, clause: t.clause };
   return null;
 }
diff --git a/src/finance.js b/src/finance.js
index ebd3393..2351431 100644
--- a/src/finance.js
+++ b/src/finance.js
@@ -12,12 +12,14 @@ export const MERIT = [2.5e6, 0.1e6, 0.05e6];  // per place counted from the bott
 export const CUP_PRIZE = [2e6, 1e6];          // winner, runner-up
 const SPONSOR = { at8: 0.8e6, growth: 0.46 }, GATE = { at8: 125e3, growth: 0.32 }; // quality 8 ≈ a League One club (tuned in Phase 6)
 const WAGE = { at50: 2.2e3, growth: 0.112 };  // a week: overall 50 ≈ a League One regular, 93 ≈ €270k (tuned in Phase 6)
+export const STANDARD = [4, 3, 2];                          // the staff level (src/staff.js) a division's books already pay for
+export const STAFF_COST = [2e3, 6e3, 20e3, 60e3, 180e3];     // a week per staff area, by level 1-5
 const START_SHARE = 0.25, TRANSFER_SHARE = 0.5, WAGE_SHARE = 0.7, WAGE_HEADROOM = 1.15; // (raised from 1.05 in Phase 6 review: 5% left no room to renew)
 
 const byDiv = (list, d) => list[Math.min(d, list.length - 1)];
 const round = (x, step) => Math.round(x / step) * step;
 
-export const blankLedger = () => ({ broadcast: 0, sponsor: 0, gate: 0, prize: 0, wages: 0, fees: 0, sales: 0 });
+export const blankLedger = () => ({ broadcast: 0, sponsor: 0, gate: 0, prize: 0, wages: 0, fees: 0, sales: 0, staff: 0 });
 
 // What a player earns a week at his level; under-21s less. Contracts start from it.
 export const wage = p => Math.max(500, round(WAGE.at50 * Math.exp(WAGE.growth * (overall(p) - 50)) * (p.age < 21 ? 0.6 : 1), 500));
@@ -28,6 +30,14 @@ export const gate = c => round(GATE.at8 * Math.exp(GATE.growth * (c.quality - 8)
 export const lentPart = p => Math.round(p.contract.wage * (1 - p.loan.share)); // the lender's part
 export const wageBill = c => c.players.reduce((t, p) => t + (p.contract?.wage ?? 0) - (p.loan ? lentPart(p) : 0), 0) + (c.lentPay ?? 0);
 
+// What club c pays a week for staff beyond its division's standard (negative: a saving). Only the
+// human club: every club's books were calibrated with standard staff, and AI clubs keep them.
+export function staffBill(s, c) {
+  if (c.id !== s.me || !c.staff) return 0;
+  const std = STAFF_COST[byDiv(STANDARD, c.div) - 1];
+  return Object.values(c.staff).reduce((t, level) => t + STAFF_COST[level - 1] - std, 0);
+}
+
 // A season's income for club c finishing mid-table: broadcast, half the merit pot, sponsorship, a gate per home league match.
 export function projection(s, c) {
   const n = s.divisions[c.div].clubIds.length;
@@ -38,13 +48,15 @@ export const newBooks = (s, c) => ({ balance: round(START_SHARE * projection(s,
 // Positive amount = income, negative = cost; the ledger records its size.
 function book(c, key, amount) { c.fin.balance += amount; c.fin.season[key] += Math.abs(amount); }
 
-// `weeks` weekly instalments for every club: broadcast and sponsorship in, wages out.
+// `weeks` weekly instalments for every club: broadcast and sponsorship in, wages and (the human club's) extra staff out.
 export function payWeeks(s, weeks) {
   if (weeks <= 0) return;
   for (const c of s.clubs) {
     book(c, 'broadcast', weeks * Math.round(byDiv(BROADCAST, c.div) / SEASON_WEEKS));
     book(c, 'sponsor', weeks * Math.round(sponsorship(c) / SEASON_WEEKS));
     book(c, 'wages', -weeks * Math.round(wageBill(c) * 52 / SEASON_WEEKS));
+    const staff = weeks * Math.round(staffBill(s, c) * 52 / SEASON_WEEKS); // net: a saving lowers it
+    c.fin.balance -= staff; c.fin.season.staff += staff;
   }
 }
 export const payGate = c => book(c, 'gate', gate(c));
diff --git a/src/scouting.js b/src/scouting.js
index db5775e..3920d4d 100644
--- a/src/scouting.js
+++ b/src/scouting.js
@@ -1,5 +1,6 @@
 import { ALL_ATTRS, overall, valueAt } from './player.js';
 import { loanable } from './market.js';
+import { scoutsFor, scoutSpeed } from './staff.js';
 
 // What the human club knows about other players. Premier League players are famous and fully known;
 // so is everyone at your own club. Everyone else (EFL squads, free agents) shows each attribute as a
@@ -7,10 +8,10 @@ import { loanable } from './market.js';
 // hold the true value. Scout reports raise knowledge
 // (0-100) and narrow the ranges; knowledge fades by 100 every FADE_DAYS. Knowledge lives in
 // s.known = { [playerId]: { k, at } } (k at clock time `at`). AI clubs always see the truth.
-// Scouts: s.scouts = [{ task: null | { kind, id }, days }], SCOUTS[division] of them.
+// Scouts: s.scouts = [{ task: null | { kind, id }, days }]; how many, and how fast they report, follow
+// the club's scouting staff level (src/staff.js).
 export const MAX_WIDTH = 3, OVR_WIDTH = 8, FADE_DAYS = 730, YEAR = 365;
-export const SCOUTS = [3, 2, 2];                 // by the human club's division (lower divisions use the last)
-export const TASKS = {                          // days to report, knowledge reached for everyone covered
+export const TASKS = {                          // days to report (at scouting level 3), knowledge reached for everyone covered
   player: { days: 7, level: 100 },
   club: { days: 14, level: 80 },
   division: { days: 28, level: 50 },
@@ -60,8 +61,9 @@ export function prune(s) {
   for (const id in s.known) if (s.known[id].k - 100 * (now - s.known[id].at) / FADE_DAYS <= 0) delete s.known[id];
 }
 
-export const scoutCount = s => SCOUTS[Math.min(s.clubs[s.me].div, SCOUTS.length - 1)];
-// Keeps the human club's scouts at its division's number (a scout let go loses his task).
+export const scoutCount = s => scoutsFor(s.clubs[s.me]);
+export const taskDays = (s, kind) => Math.round(TASKS[kind].days * scoutSpeed(s.clubs[s.me]));
+// Keeps the human club's scouts at its scouting level's number (a scout let go loses his task).
 export function staffScouts(s) {
   const n = s.me === null ? 0 : scoutCount(s);
   s.scouts = s.scouts.slice(0, n);
@@ -91,7 +93,7 @@ export function assign(s, k, task) {
   }
   if (task.kind === 'club' && (!s.clubs[task.id] || task.id === s.me)) return 'Pick another club.';
   if (task.kind === 'division' && !s.divisions[task.id]) return 'No such division.';
-  scout.task = { ...task }; scout.days = TASKS[task.kind].days;
+  scout.task = { ...task }; scout.days = taskDays(s, task.kind);
   return null;
 }
 export const recall = (s, k) => { if (s.scouts[k]) { s.scouts[k].task = null; s.scouts[k].days = 0; } };
diff --git a/src/season.js b/src/season.js
index 2264188..5157578 100644
--- a/src/season.js
+++ b/src/season.js
@@ -12,6 +12,7 @@ import { payWeeks, payGate, payPrizes, seasonBudgets, blankLedger } from './fina
 import { expireContracts, academy } from './contracts.js';
 import { MIN_SQUAD, inWindow, windowId, marketDay, returnLoans } from './market.js';
 import { scoutDays, staffScouts, prune } from './scouting.js';
+import { aiStaff, standardStaff } from './staff.js';
 
 const RETIRE_AGE = 35;
 const MARKET_KEEP = MARKET_SIZE / 2; // half of last season's free agents stay on the list
@@ -68,6 +69,7 @@ export function takeClub(s, clubId) {
   s.fam = newFam();
   s.training = defaultTraining();
   s.offers = [];
+  s.clubs[clubId].staff = standardStaff(s.clubs[clubId].div);
   s.scouts = []; staffScouts(s);
   seasonBudgets(s);
 }
@@ -237,6 +239,7 @@ export function endSeason(s) {
   s.seed = rng.seed;
   s.season++;
   for (const c of s.clubs) c.fin.season = blankLedger();
+  aiStaff(s); // AI clubs' staff follow their new division
   prune(s);
   const exists = new Set([...s.clubs.flatMap(c => c.players), ...s.market].map(p => p.id));
   s.shortlist = s.shortlist.filter(id => exists.has(id)); // retired players drop off
diff --git a/src/squad.js b/src/squad.js
index a3aefca..88f34fc 100644
--- a/src/squad.js
+++ b/src/squad.js
@@ -1,4 +1,5 @@
 import { overall } from './player.js';
+import { medicalScale } from './staff.js';
 
 // Squad dynamics: what matches and the days between them leave on players. Every player (club
 // squads and free agents) carries the fields of freshState() in player.js:
@@ -34,11 +35,12 @@ export function readiness(p) {
     - EDGE.sharp * (100 - p.sharp) / (100 - SHARP_MIN);
 }
 
-// Gives player p an injury from INJURIES; a worse one replaces a milder one he already has. Returns p.inj.
-export function injure(rng, p) {
+// Gives player p an injury from INJURIES, its length × scale (his club's medical staff: src/staff.js);
+// a worse one replaces a milder one he already has. Returns p.inj.
+export function injure(rng, p, scale = 1) {
   let r = rng.next() * INJURIES.reduce((t, x) => t + x[3], 0), pick = INJURIES[INJURIES.length - 1];
   for (const x of INJURIES) if ((r -= x[3]) < 0) { pick = x; break; }
-  const days = rng.int(pick[1], pick[2]);
+  const days = Math.max(1, Math.round(rng.int(pick[1], pick[2]) * scale));
   if (!p.inj || days > p.inj.days) p.inj = { name: pick[0], days };
   return p.inj;
 }
@@ -81,7 +83,7 @@ export function afterMatch(s, m, comp, rng) {
         p.sharp = Math.min(100, p.sharp + SHARP_GAIN);
         p.form = [...p.form, rt].slice(-FORM_LEN);
         mood += Math.round((rt - 6.5) * MORALE_RATING);
-        if (x.inj) { injure(rng, p); news.push({ type: 'injury', club: club.id, id: p.id, name: p.name, injury: p.inj.name, days: p.inj.days }); }
+        if (x.inj) { injure(rng, p, medicalScale(club)); news.push({ type: 'injury', club: club.id, id: p.id, name: p.name, injury: p.inj.name, days: p.inj.days }); }
       } else if (!out && regulars.has(p.id)) mood -= MORALE_DROPPED;
       p.morale = clamp(p.morale + mood, 0, 100);
     }
diff --git a/src/training.js b/src/training.js
index 852e517..4acd76e 100644
--- a/src/training.js
+++ b/src/training.js
@@ -1,6 +1,7 @@
 import { ATTRS, ALL_ATTRS, WEIGHTS } from './player.js';
 import { injure } from './squad.js';
 import { has } from './tactics.js';
+import { coachScale, medicalScale } from './staff.js';
 
 // Training. Every club has a weekly schedule, a focus and an intensity; AI clubs keep the default.
 // The human club can also give any player an individual focus: one attribute.
@@ -8,7 +9,8 @@ import { has } from './tactics.js';
 // intensity's grow factor (about 4 a season at Normal), never above his hidden potential `pot`:
 // half the time his individual focus, otherwise one from the team focus (keepers: always their
 // position's key attributes). Players aged 31 and over lose a physical point now and then,
-// whatever the schedule. Training can injure, Hard more often, Light less.
+// whatever the schedule. Training can injure, Hard more often, Light less. The club's coaching staff
+// scale growth, its medical staff the length of injuries (src/staff.js).
 export const FOCUS = {
   Balanced: null, // the position's key attributes (WEIGHTS in player.js)
   Attacking: ['finishing', 'dribbling', 'firstTouch', 'crossing', 'composure'],
@@ -35,11 +37,11 @@ function raise(rng, p, t) {
 
 // One week of training for `club` under schedule t. Injured players sit it out. Returns the players injured in training.
 export function trainWeek(rng, club, t) {
-  const I = INTENSITY[t.intensity], hurt = [];
+  const I = INTENSITY[t.intensity], hurt = [], grow = GROWTH * I.grow * coachScale(club), heal = medicalScale(club);
   for (const p of club.players) {
     if (p.inj) continue;
-    if (rng.next() < INJURY * I.injury) { injure(rng, p); hurt.push(p); continue; }
-    if (p.age <= 23 && t.focus !== 'Rest' && rng.next() < GROWTH * I.grow) raise(rng, p, t);
+    if (rng.next() < INJURY * I.injury) { injure(rng, p, heal); hurt.push(p); continue; }
+    if (p.age <= 23 && t.focus !== 'Rest' && rng.next() < grow) raise(rng, p, t);
     if (p.age >= 31 && rng.next() < DECLINE) { const k = rng.pick(ATTRS.physical); p.attrs[k] = Math.max(1, p.attrs[k] - 1); }
   }
   return hurt;
diff --git a/src/transfers.js b/src/transfers.js
index 7778183..d7a84ad 100644
--- a/src/transfers.js
+++ b/src/transfers.js
@@ -1,5 +1,5 @@
 import { value } from './player.js';
-import { wageBill } from './finance.js';
+import { wageBill, staffBill } from './finance.js';
 import { terms } from './contracts.js';
 import { MIN_SQUAD, MAX_SQUAD, FLOOR, WALKAWAY, ROUNDS, QUICK_SALE, MAX_LOANS, LOAN_AGE, round10k, eur, windowOpen, windowId, justJoined,
   loanEnd, loanPay, asking, signingFee, refusal, move, lend, loanable } from './market.js';
@@ -16,7 +16,7 @@ function atClub(s, id) {
   for (const c of s.clubs) if (c.id !== s.me) { const p = c.players.find(x => x.id === id); if (p) return { p, c }; }
   return null;
 }
-const overWages = (s, extra) => wageBill(s.clubs[s.me]) + extra > s.wageBudget;
+const overWages = (s, extra) => wageBill(s.clubs[s.me]) + staffBill(s, s.clubs[s.me]) + extra > s.wageBudget; // staff beyond the standard count too
 // Why the human club can't take p on now (any deal), or null.
 function cannotTake(s, p) {
   if (s.clubs[s.me].players.length >= MAX_SQUAD) return `Squad is full (${MAX_SQUAD}).`;
diff --git a/src/world.js b/src/world.js
index 73ca2c1..a35278d 100644
--- a/src/world.js
+++ b/src/world.js
@@ -10,6 +10,7 @@ import { blankRecords } from './awards.js';
 import { defaultTraining } from './training.js';
 import { newBooks } from './finance.js';
 import { startContract } from './contracts.js';
+import { aiStaff } from './staff.js';
 import { LEAGUES } from './data/england.js';
 import STATS, { CALIBRATION } from './data/england-stats.js';
 
@@ -66,6 +67,7 @@ export function createWorld(seed, leagues = LEAGUES, stats = STATS, calibration
     s.records.push(blankRecords());
   });
   for (const c of s.clubs) { for (const p of c.players) p.contract = startContract(p, s.season); c.fin = newBooks(s, c); c.lentPay = 0; }
+  aiStaff(s);
   for (let i = 0; i < MARKET_SIZE; i++) s.market.push(newFreeAgent(rng, s.nid++));
   scheduleSeason(s, rng);
   s.seed = rng.seed;
diff --git a/tests/finance.test.js b/tests/finance.test.js
index 3e80dc4..493a71d 100644
--- a/tests/finance.test.js
+++ b/tests/finance.test.js
@@ -43,7 +43,7 @@ test('sponsorship and gate grow with club quality', () => {
 test('books open at a quarter of a season, and weekly instalments are the same every week', () => {
   const s = books(), c = s.clubs[0];
   assert.equal(wageBill(c), 15e3);
-  assert.deepEqual(blankLedger(), { broadcast: 0, sponsor: 0, gate: 0, prize: 0, wages: 0, fees: 0, sales: 0 });
+  assert.deepEqual(blankLedger(), { broadcast: 0, sponsor: 0, gate: 0, prize: 0, wages: 0, fees: 0, sales: 0, staff: 0 });
   assert.equal(c.fin.balance, Math.round(0.25 * projection(s, c) / 1e5) * 1e5);
   assert.equal(projection(s, c), BROADCAST[0] + MERIT[0] * 2 / 2 + sponsorship(c) + gate(c) * 1);
   const start = c.fin.balance, per = x => Math.round(x / SEASON_WEEKS);
diff --git a/tests/scouting.test.js b/tests/scouting.test.js
index b47932c..9ed8405 100644
--- a/tests/scouting.test.js
+++ b/tests/scouting.test.js
@@ -4,7 +4,8 @@ import { ALL_ATTRS, overall, value } from '../src/player.js';
 import { createWorld } from '../src/world.js';
 import { takeClub, playDay, endSeason } from '../src/season.js';
 import { MINI } from './fixtures/mini.js';
-import { MAX_WIDTH, OVR_WIDTH, FADE_DAYS, YEAR, SCOUTS, TASKS, clock, fogged, knowledge, ranges, estimate, learn, prune, scoutCount, staffScouts,
+import { SCOUTS, SCOUT_SPEED } from '../src/staff.js';
+import { MAX_WIDTH, OVR_WIDTH, FADE_DAYS, YEAR, TASKS, taskDays, clock, fogged, knowledge, ranges, estimate, learn, prune, scoutCount, staffScouts,
   assign, recall, scoutDays, toggleShortlist, searchPlayers } from '../src/scouting.js';
 
 // Managing Kilo (bottom division, club 14), with its scouts. Clubs 0-3 are the top division: famous, fully known.
@@ -55,9 +56,10 @@ test('knowledge fades by 100 every FADE_DAYS; learning never lowers it; prune fo
   assert.deepEqual(s.known, {});
 });
 
-test('scouts: as many as your division allows, sent on tasks, reporting after the task\'s days', () => {
+test('scouts: as many as your scouting level allows, sent on tasks, reporting after the task\'s days', () => {
   const s = fresh(4);
-  assert.equal(s.scouts.length, SCOUTS[2]);
+  assert.equal(s.scouts.length, SCOUTS[s.clubs[14].staff.scouting - 1]);
+  s.clubs[14].staff.scouting = 3; staffScouts(s); // level 3: the base number of scouts and days
   assert.equal(scoutCount(s), SCOUTS[2]);
   assert.equal(assign(s, 9, { kind: 'free' }), 'No such scout.');
   assert.equal(assign(s, 0, { kind: 'player', id: s.clubs[0].players[0].id }), 'You already know everything about him.');
@@ -76,8 +78,9 @@ test('scouts: as many as your division allows, sent on tasks, reporting after th
   assert.equal(s.news.at(-1).n, s.clubs[5].players.length);
   assign(s, 0, { kind: 'division', id: 1 }); recall(s, 0);
   assert.deepEqual(s.scouts[0], { task: null, days: 0 });
-  s.clubs[14].div = 0; staffScouts(s);
-  assert.equal(s.scouts.length, SCOUTS[0]);
+  s.clubs[14].staff.scouting = 5; staffScouts(s);
+  assert.equal(s.scouts.length, SCOUTS[4]);
+  assert.equal(taskDays(s, 'division'), Math.round(TASKS.division.days * SCOUT_SPEED[4]));
 });
 
 test('search: filters on what you can tell, best estimate first; your own players never appear', () => {
diff --git a/tests/season.test.js b/tests/season.test.js
index 964464c..cb1f813 100644
--- a/tests/season.test.js
+++ b/tests/season.test.js
@@ -355,7 +355,7 @@ test('weekly books: every club gets broadcast and sponsorship money and pays wag
   while (!s.done) for (const r of playDay(s)) if (r.h === 0 && !(r.item.comp === 'cup' && r.item.round === cupRounds(s.clubs.length) - 1)) gates++;
   assert.equal(Math.floor(s.days.at(-1).day / 7) + 1, SEASON_WEEKS);
   const w = SEASON_WEEKS;
-  assert.deepEqual(c.fin.season, { broadcast: w * per(BROADCAST[0]), sponsor: w * per(sponsorship(c)), gate: gates * gate(c), prize: 0, wages: w * per(wageBill(c) * 52), fees: 0, sales: 0 });
+  assert.deepEqual(c.fin.season, { broadcast: w * per(BROADCAST[0]), sponsor: w * per(sponsorship(c)), gate: gates * gate(c), prize: 0, wages: w * per(wageBill(c) * 52), fees: 0, sales: 0, staff: 0 });
   assert.equal(c.fin.balance - start, c.fin.season.broadcast + c.fin.season.sponsor + c.fin.season.gate - c.fin.season.wages);
   assert.ok(s.clubs.every(x => x.fin.season.broadcast > 0 && x.fin.season.wages > 0)); // AI clubs keep books too
 });
```

- [ ] **Step 5: Run the tests**

Run: `npm test` — Expected: all pass, including every calibration test in `tests/england.test.js`. Run it twice: the results must be identical.

- [ ] **Step 6: Commit**

```bash
git add src/staff.js tests/staff.test.js src/finance.js src/squad.js src/training.js src/scouting.js src/contracts.js src/transfers.js src/season.js src/world.js tests/finance.test.js tests/season.test.js tests/scouting.test.js
git commit -m "feat: staff levels for coaching, scouting and medical; your club pays beyond its division's standard"
```

---

### Task 2: The youth squad

**Files:**
- Create: `src/youth.js`, `tests/youth.test.js`
- Modify: `src/contracts.js`, `src/season.js`, `src/world.js`

**Interfaces:**
- Produces (`src/youth.js`):
  - constants `YOUTH_MAX`, `YOUTH_YEARS`, `LEAVE_AGE`;
  - `intake`, `trainYouth`, `ceiling`, `ceilingRange`;
  - `promote(s, id, maxSquad)`, `release`, `fromYouth`, `ageYouth`.
- History entries gain `youthLeft` (names).

- [ ] **Step 1: Write the failing tests** — create `tests/youth.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { WEIGHTS, overall } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { takeClub, playDay, endSeason } from '../src/season.js';
import { wage, wageBill } from '../src/finance.js';
import { expireContracts } from '../src/contracts.js';
import { MAX_SQUAD, MIN_SQUAD } from '../src/market.js';
import { YOUTH_MAX, YOUTH_YEARS, intake, trainYouth, ceiling, ceilingRange, promote, release, fromYouth, ageYouth } from '../src/youth.js';
import { MINI } from './fixtures/mini.js';

// Managing Kilo (bottom division, club 14): standard coaching there is level 2.
const fresh = seed => { const s = createWorld(seed, MINI); takeClub(s, 14); s.wageBudget = 1e12; return s; };
const best = p => Math.max(...Object.keys(WEIGHTS[p.pos]).map(k => p.attrs[k]));

test('taking a club brings a first intake: 2 + coaching level, aged 15-16, no contracts, room to grow', () => {
  const s = fresh(1), seed = s.seed;
  assert.equal(s.youth.length, 2 + s.clubs[14].staff.coaching);
  assert.ok(s.youth.every(p => p.age >= 15 && p.age <= 16 && p.contract === null && p.pot >= best(p) + 2 && p.pot <= 20));
  assert.equal(s.seed, seed); // the career's random sequence is untouched
  s.youth = Array(YOUTH_MAX - 1).fill(null).map((_, k) => s.youth[0] && { ...s.youth[0], id: -k });
  assert.equal(intake(s, makeRng(1)), 1); // never above YOUTH_MAX
});

test('youth training: key attributes grow, never above potential, faster with better coaching', () => {
  const grown = level => {
    const s = fresh(2);
    s.clubs[14].staff.coaching = level;
    const before = s.youth.map(p => ({ ...p.attrs }));
    trainYouth(s, makeRng(3), 60);
    assert.ok(s.youth.every(p => Object.keys(WEIGHTS[p.pos]).every(k => p.attrs[k] <= Math.max(p.pot, before[s.youth.indexOf(p)][k]))));
    return s.youth.reduce((t, p, i) => t + Object.keys(p.attrs).reduce((u, k) => u + p.attrs[k] - before[i][k], 0), 0) / s.youth.length;
  };
  const low = grown(1), high = grown(5);
  assert.ok(low > 0 && high > low, `${low} vs ${high}`);
});

test('the ceiling: the overall at full potential, shown as a range that narrows with coaching', () => {
  const s = fresh(3), p = s.youth[0];
  assert.ok(ceiling(p) >= overall(p));
  for (const level of [1, 3, 5]) {
    s.clubs[14].staff.coaching = level;
    const [lo, hi] = ceilingRange(s, p);
    assert.ok(lo <= ceiling(p) && ceiling(p) <= hi);
    assert.equal(hi - lo, [12, 9, 6, 4, 2][level - 1]);
  }
});

test('promote and release: a promoted player joins the first team on a starter contract', () => {
  const s = fresh(4), me = s.clubs[14], [a, b] = s.youth;
  s.wageBudget = wageBill(me);
  assert.equal(promote(s, a.id, MAX_SQUAD), 'Over the wage budget.');
  s.wageBudget = 1e12;
  assert.equal(promote(s, a.id, MAX_SQUAD), null);
  assert.ok(me.players.includes(a) && !s.youth.includes(a));
  assert.deepEqual(a.contract, { wage: wage(a), until: s.season + YOUTH_YEARS, clause: null });
  assert.equal(release(s, b.id), null);
  assert.ok(!s.youth.includes(b));
  assert.equal(release(s, b.id), 'Not in your youth squad.');
  assert.equal(promote(s, s.youth[0].id, me.players.length), `Squad is full (${me.players.length}).`);
});

test('the first team\'s gaps are filled from the youth squad first', () => {
  const s = fresh(5), me = s.clubs[14];
  const keeper = { ...s.youth[0], id: s.nid++, pos: 'GK' };
  s.youth.push(keeper);
  assert.equal(fromYouth(s, 'GK')?.pos, 'GK');
  for (const p of me.players.filter(p => p.pos === 'GK')) p.contract.until = s.season;
  while (me.players.length > MIN_SQUAD) me.players.pop();
  const gks = s.youth.filter(p => p.pos === 'GK');
  expireContracts(s, makeRng(1), MIN_SQUAD);
  assert.ok(gks.every(p => me.players.includes(p) && p.contract));
});

test('the season: youth at 19 leave, the summer intake arrives, the leavers are in History', () => {
  const s = fresh(6), old = s.youth[0];
  old.age = 18;
  for (const p of s.clubs[14].players) p.contract.until = 9; // no gaps to fill from the youth squad
  while (!s.done) playDay(s);
  endSeason(s);
  assert.ok(!s.youth.includes(old));
  assert.deepEqual(s.history[0].youthLeft, [old.name]);
  assert.ok(s.youth.some(p => p.age <= 16));
  assert.deepEqual(ageYouth({ youth: [] }), []);
});
```

- [ ] **Step 2: Run them to verify they fail** — `node --test tests/youth.test.js`: FAIL, module not found.

- [ ] **Step 3: Create `src/youth.js`**

```js
import { createPlayer, overall, WEIGHTS } from './player.js';
import { wage, wageBill, staffBill } from './finance.js';
import { coachScale } from './staff.js';

// The human club's youth squad, s.youth: players aged 15-18 outside the first team, on no contract
// and no wages, who play no matches. Each summer an intake of 2 + coaching level joins (at most
// YOUTH_MAX in all), at the club's quality - 3 plus the coaching level's step, with room to grow:
// their hidden potential sits 2-6 above their best key attribute. They train every week (growth
// only, scaled by coaching). Promote one to the first team on a starter contract, or release him;
// at 19 those still here leave. The first team's gap-filling academy players come from here first.
export const YOUTH_MAX = 20, YOUTH_YEARS = 3, LEAVE_AGE = 19;
const GROWTH = 0.15;                                   // chance per player per week, × coaching
const CEILING_WIDTH = [12, 9, 6, 4, 2];                // how sure your coaches are of a ceiling, by coaching level
const SHAPE = ['GK', 'DF', 'DF', 'MF', 'MF', 'FW'];

// The summer intake (also when you take a club).
export function intake(s, rng) {
  const c = s.clubs[s.me], level = c.staff.coaching, n = Math.min(2 + level, YOUTH_MAX - s.youth.length);
  for (let k = 0; k < n; k++) {
    const p = createPlayer(rng, s.nid++, rng.pick(SHAPE), c.quality - 3 + (level - 3), rng.int(15, 16));
    p.pot = Math.min(20, Math.max(...Object.keys(WEIGHTS[p.pos]).map(a => p.attrs[a])) + rng.int(2, 6));
    s.youth.push(p);
  }
  return n;
}

// `weeks` weeks of youth training: a key attribute up by 1 now and then, never above potential.
export function trainYouth(s, rng, weeks) {
  if (s.me === null) return;
  const chance = GROWTH * coachScale(s.clubs[s.me]);
  for (let w = 0; w < weeks; w++) for (const p of s.youth) {
    if (rng.next() >= chance) continue;
    const k = rng.pick(Object.keys(WEIGHTS[p.pos]));
    if (p.attrs[k] < p.pot) p.attrs[k]++;
  }
}

// The overall he would reach with every key attribute at his potential.
export const ceiling = p => overall({ ...p, attrs: Object.fromEntries(Object.entries(p.attrs).map(([k, v]) => [k, WEIGHTS[p.pos][k] ? Math.max(v, p.pot) : v])) });
// What your coaches can tell of it: a range as wide as your coaching level allows, holding the truth.
export function ceilingRange(s, p) {
  const w = CEILING_WIDTH[s.clubs[s.me].staff.coaching - 1], o = ceiling(p), off = ((p.id * 2654435761) >>> 0) % (w + 1);
  return [o - off, o - off + w];
}

const take = (s, p) => s.youth.splice(s.youth.indexOf(p), 1)[0];
const starter = (s, p) => ({ wage: wage(p), until: s.season + YOUTH_YEARS, clause: null });

// Moves youth player id into the first team on a starter contract. Error message or null.
export function promote(s, id, maxSquad) {
  const p = s.youth.find(x => x.id === id), c = s.clubs[s.me];
  if (!p) return 'Not in your youth squad.';
  if (c.players.length >= maxSquad) return `Squad is full (${maxSquad}).`;
  if (wageBill(c) + staffBill(s, c) + wage(p) > s.wageBudget) return 'Over the wage budget.';
  take(s, p).contract = starter(s, p);
  c.players.push(p);
  return null;
}
export function release(s, id) {
  const p = s.youth.find(x => x.id === id);
  if (!p) return 'Not in your youth squad.';
  take(s, p);
  return null;
}
// For the first team's gaps: the youth player with the best overall at pos, on a starter contract, or null.
export function fromYouth(s, pos) {
  const p = s.youth.filter(x => x.pos === pos).sort((a, b) => overall(b) - overall(a) || a.id - b.id)[0];
  if (!p) return null;
  take(s, p).contract = starter(s, p);
  return p;
}
// End of season: everyone a year older; those reaching LEAVE_AGE leave. Returns their names.
export function ageYouth(s) {
  for (const p of s.youth) p.age++;
  const gone = s.youth.filter(p => p.age >= LEAVE_AGE);
  s.youth = s.youth.filter(p => p.age < LEAVE_AGE);
  return gone.map(p => p.name);
}
```

- [ ] **Step 4: Change the existing files**

```diff
diff --git a/src/contracts.js b/src/contracts.js
index e46326f..b1e872a 100644
--- a/src/contracts.js
+++ b/src/contracts.js
@@ -1,5 +1,6 @@
 import { createPlayer, overall, value } from './player.js';
 import { wage, wageBill, staffBill } from './finance.js';
+import { fromYouth } from './youth.js';
 
 // Contracts. p.contract = { wage (euros a week), until (the last season it covers), clause (release
 // clause in euros, or null) }; free agents have none. A contract ends after season `until`.
@@ -48,7 +49,8 @@ export function academy(s, rng, c, pos) {
 
 // End of season s.season (before the season number moves on): contracts ending now. AI clubs renew
 // them; the human club's players leave for the free-agent list. If that leaves the squad below
-// minSquad, academy players in the leavers' positions fill the gap. Returns the leavers' names.
+// minSquad, academy players in the leavers' positions fill the gap: the best of the youth squad
+// there, else a new one. Returns the leavers' names.
 export function expireContracts(s, rng, minSquad) {
   const left = [];
   for (const c of s.clubs) for (const p of [...c.players]) {
@@ -59,6 +61,6 @@ export function expireContracts(s, rng, minSquad) {
     s.market.push(p);
     left.push(p);
   }
-  if (s.me !== null) for (const p of left) if (s.clubs[s.me].players.length < minSquad) s.clubs[s.me].players.push(academy(s, rng, s.clubs[s.me], p.pos));
+  if (s.me !== null) for (const p of left) if (s.clubs[s.me].players.length < minSquad) s.clubs[s.me].players.push(fromYouth(s, p.pos) ?? academy(s, rng, s.clubs[s.me], p.pos));
   return left.map(p => p.name);
 }
diff --git a/src/season.js b/src/season.js
index 5157578..0558b69 100644
--- a/src/season.js
+++ b/src/season.js
@@ -13,6 +13,7 @@ import { expireContracts, academy } from './contracts.js';
 import { MIN_SQUAD, inWindow, windowId, marketDay, returnLoans } from './market.js';
 import { scoutDays, staffScouts, prune } from './scouting.js';
 import { aiStaff, standardStaff } from './staff.js';
+import { intake, trainYouth, ageYouth } from './youth.js';
 
 const RETIRE_AGE = 35;
 const MARKET_KEEP = MARKET_SIZE / 2; // half of last season's free agents stay on the list
@@ -71,6 +72,7 @@ export function takeClub(s, clubId) {
   s.offers = [];
   s.clubs[clubId].staff = standardStaff(s.clubs[clubId].div);
   s.scouts = []; staffScouts(s);
+  s.youth = []; intake(s, makeRng(s.seed ^ 0x9e3779b9)); // a first intake, without touching the career's random sequence
   seasonBudgets(s);
 }
 
@@ -135,6 +137,7 @@ function between(s, rng, from, to) {
       s.news.push({ type: 'injury', club: c.id, id: p.id, name: p.name, injury: p.inj.name, days: p.inj.days, training: true });
   }
   passDays(s.market, to - from, INTENSITY.Normal.recover);
+  trainYouth(s, rng, weeks);
 }
 
 // Plays the next calendar day: every match of every competition on it. A live match is played out
@@ -218,6 +221,7 @@ export function endSeason(s) {
   s.divisions.forEach((dv, d) => { dv.clubIds = s.clubs.filter(c => c.div === d).map(c => c.id); });
   returnLoans(s);
   h.left = expireContracts(s, rng, MIN_SQUAD);
+  h.youthLeft = s.me === null ? [] : ageYouth(s);
   h.deals = s.deals.filter(d => d.from === s.me || d.to === s.me);
   s.deals = [];
   s.history.push(h);
@@ -240,6 +244,7 @@ export function endSeason(s) {
   s.season++;
   for (const c of s.clubs) c.fin.season = blankLedger();
   aiStaff(s); // AI clubs' staff follow their new division
+  if (s.me !== null) intake(s, rng);
   prune(s);
   const exists = new Set([...s.clubs.flatMap(c => c.players), ...s.market].map(p => p.id));
   s.shortlist = s.shortlist.filter(id => exists.has(id)); // retired players drop off
diff --git a/src/world.js b/src/world.js
index a35278d..59e1720 100644
--- a/src/world.js
+++ b/src/world.js
@@ -46,7 +46,7 @@ export function createWorld(seed, leagues = LEAGUES, stats = STATS, calibration
   const rng = makeRng(seed);
   const s = {
     version: SAVE_VERSION, seed, nid: 1,
-    me: null, formation: '4-4-2', lineup: [], bench: [], tactics: defaultTactics(slots('4-4-2')), fam: newFam(), budget: 0, wageBudget: 0, training: defaultTraining(), news: [], offers: [], talks: { win: null, by: {} }, deals: [], known: {}, scouts: [], shortlist: [],
+    me: null, formation: '4-4-2', lineup: [], bench: [], tactics: defaultTactics(slots('4-4-2')), fam: newFam(), budget: 0, wageBudget: 0, training: defaultTraining(), news: [], offers: [], talks: { win: null, by: {} }, deals: [], known: {}, scouts: [], shortlist: [], youth: [],
     season: 1, day: -1, next: 0, days: [], done: false, cup: null, playoffs: [],
     clubs: [], divisions: [], market: [], history: [], records: [], last: null, live: null,
   };
```

- [ ] **Step 5: Run the tests** — `npm test`: all pass, twice with the same results.

- [ ] **Step 6: Commit**

```bash
git add src/youth.js tests/youth.test.js src/contracts.js src/season.js src/world.js
git commit -m "feat: youth squad with a yearly intake, training, ceilings, promotion and release"
```

---

### Task 3: Save version 10

**Files:**
- Modify: `src/save.js`, `tests/save.test.js`

- [ ] **Step 1: Apply the change, tests first** — the new test and the extra "missing" check in `tests/save.test.js`, then `src/save.js`. Run the tests between the two halves: the new test should fail first.

```diff
diff --git a/src/save.js b/src/save.js
index 2a277f3..33a890e 100644
--- a/src/save.js
+++ b/src/save.js
@@ -8,8 +8,9 @@ import { defaultTraining } from './training.js';
 import { startContract } from './contracts.js';
 import { newBooks, seasonBudgets } from './finance.js';
 import { staffScouts } from './scouting.js';
+import { aiStaff, standardStaff } from './staff.js';
 
-export const SAVE_VERSION = 9; // 2: clubs from real data with short, colours, kit. 3: live match, richer results. 4: tactics. 5: calendar, cup, play-offs, records. 6: squad dynamics, training. 7: contracts, club books, budgets. 8: transfer market, loans. 9: scouting, shortlist
+export const SAVE_VERSION = 10; // 2: clubs from real data with short, colours, kit. 3: live match, richer results. 4: tactics. 5: calendar, cup, play-offs, records. 6: squad dynamics, training. 7: contracts, club books, budgets. 8: transfer market, loans. 9: scouting, shortlist. 10: staff levels, youth squad
 export const KEY = 'touchline.save';
 
 export const serialize = state => JSON.stringify(state);
@@ -23,7 +24,8 @@ const valid = s => s && typeof s === 'object' && s.version === SAVE_VERSION
   && !!s.training && !!s.training.ind && typeof s.training.ind === 'object' && Array.isArray(s.news)
   && Number.isFinite(s.wageBudget) && s.clubs.every(c => c.fin && Number.isFinite(c.fin.balance) && !!c.fin.season)
   && Array.isArray(s.offers) && !!s.talks && Array.isArray(s.deals) && s.clubs.every(c => Number.isFinite(c.lentPay))
-  && !!s.known && typeof s.known === 'object' && Array.isArray(s.scouts) && Array.isArray(s.shortlist);
+  && !!s.known && typeof s.known === 'object' && Array.isArray(s.scouts) && Array.isArray(s.shortlist)
+  && Array.isArray(s.youth) && s.clubs.every(c => c.staff && Number.isInteger(c.staff.coaching));
 
 // MIGRATIONS[v] upgrades a save from version v to v + 1.
 const MIGRATIONS = {
@@ -59,6 +61,10 @@ const MIGRATIONS = {
   },
   7: s => { s.offers = []; s.talks = { win: null, by: {} }; s.deals = []; for (const c of s.clubs) c.lentPay = 0; }, // the market opens
   8: s => { s.known = {}; s.shortlist = []; s.scouts = []; staffScouts(s); }, // scouts start with nothing known
+  9: s => { // standard staff everywhere, an empty youth squad (the first intake comes in the summer); staff costs in the ledger
+    aiStaff(s); if (s.me !== null) s.clubs[s.me].staff = standardStaff(s.clubs[s.me].div);
+    s.youth = []; for (const c of s.clubs) c.fin.season.staff = 0;
+  },
 };
 
 export function deserialize(text) {
diff --git a/tests/save.test.js b/tests/save.test.js
index d953967..b27c064 100644
--- a/tests/save.test.js
+++ b/tests/save.test.js
@@ -43,6 +43,7 @@ test('deserialize returns null for missing, corrupt or wrong-version saves', ()
   assert.equal(deserialize(serialize({ ...createWorld(1, MINI), wageBudget: undefined })), null); // books missing
   assert.equal(deserialize(serialize({ ...createWorld(1, MINI), offers: undefined })), null); // market missing
   assert.equal(deserialize(serialize({ ...createWorld(1, MINI), known: undefined })), null); // scouting missing
+  assert.equal(deserialize(serialize({ ...createWorld(1, MINI), youth: undefined })), null); // staff and youth missing
   const noContract = createWorld(1, MINI); noContract.clubs[0].players[0].contract = null;
   assert.equal(deserialize(serialize(noContract)), null); // a squad player without a contract
 });
@@ -215,3 +216,24 @@ test('a version 8 save gets scouts and an empty notebook, and plays on', () => {
   assert.deepEqual(b.scouts, a.scouts.map(() => ({ task: null, days: 0 })));
   assert.ok(b.scouts.length > 0 && playDay(b).length);
 });
+
+// A save as Phase 8 (version 9) wrote it: no staff, no youth squad, no staff line in the ledger.
+function asV9(s) {
+  const o = JSON.parse(serialize(s));
+  o.version = 9;
+  delete o.youth;
+  for (const c of o.clubs) { delete c.staff; delete c.fin.season.staff; }
+  return o;
+}
+
+test('a version 9 save gets standard staff and an empty youth squad, and plays on', () => {
+  const a = createWorld(27, MINI);
+  takeClub(a, 14);
+  playDay(a);
+  const b = deserialize(JSON.stringify(asV9(a)));
+  assert.equal(b.version, SAVE_VERSION);
+  assert.deepEqual(b.youth, []);
+  assert.deepEqual(b.clubs.map(c => c.staff), a.clubs.map(c => c.staff));
+  assert.ok(b.clubs.every(c => c.fin.season.staff === 0));
+  assert.ok(playDay(b).length);
+});
```

- [ ] **Step 2: Run the tests** — `npm test`: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/save.js tests/save.test.js
git commit -m "feat: save version 10 with staff levels and the youth squad"
```

---

### Task 4: Interface — Staff and Youth tabs

**Files:**
- Modify: `src/ui/app.js`

- [ ] **Step 1: Apply the change**

```diff
diff --git a/src/ui/app.js b/src/ui/app.js
index 49ea914..56578c3 100644
--- a/src/ui/app.js
+++ b/src/ui/app.js
@@ -12,8 +12,10 @@ import { line } from './commentary.js';
 import { buy, sell, bid, acceptCounter, talksOn, loanIn, setListing, acceptOffer, rejectOffer, counterOffer, MAX_SQUAD } from '../transfers.js';
 import { SUMMER_END, JANUARY, QUICK_SALE, inWindow, windowOpen, justJoined, asking, signingFee, refusal, loanable, loanPay } from '../market.js';
 import { KEY, serialize, deserialize } from '../save.js';
-import { TASKS, estimate, ranges, assign, recall, toggleShortlist, searchPlayers } from '../scouting.js';
-import { wageBill, projection } from '../finance.js';
+import { TASKS, taskDays, estimate, ranges, assign, recall, toggleShortlist, searchPlayers } from '../scouting.js';
+import { AREAS, COACHING, MEDICAL, SCOUTS, SCOUT_SPEED, setStaff } from '../staff.js';
+import { YOUTH_MAX, LEAVE_AGE, ceilingRange, promote, release } from '../youth.js';
+import { wage, wageBill, projection, staffBill, STAFF_COST, STANDARD } from '../finance.js';
 import { terms, canRenew, renew as renewContract } from '../contracts.js';
 import { crestSvg, kitSvg } from './art.js';
 
@@ -64,8 +66,8 @@ const windowText = () => s.done ? `Summer window open until ${dateLabel(SUMMER_E
   : `Window closed: the ${s.day < JANUARY[0] ? `January window opens ${dateLabel(JANUARY[0])}` : 'summer window opens when the season ends'}`;
 const feeOf = id => Math.round(+$(`fee-${id}`).value * 1e6);
 // Where a player is: his club, or null on the free-agent list.
-const clubOfPlayer = p => s.clubs.find(c => c.players.includes(p)) ?? null;
-const allPlayers = () => [...s.clubs.flatMap(c => c.players), ...s.market];
+const clubOfPlayer = p => s.youth.includes(p) ? myClub(s) : s.clubs.find(c => c.players.includes(p)) ?? null; // youth players are yours
+const allPlayers = () => [...s.clubs.flatMap(c => c.players), ...s.market, ...s.youth];
 // A [lo, hi] estimate as text: one number when known exactly.
 const span = ([lo, hi], f = String) => lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`;
 const moneySpan = ([lo, hi]) => lo === hi ? money(lo) : `€${(lo / 1e6).toFixed(2)}–${(hi / 1e6).toFixed(2)}M`;
@@ -250,6 +252,7 @@ const views = {
       ${h.fin ? `<div class="dim">Books: income ${money(h.fin.broadcast + h.fin.sponsor + h.fin.gate + h.fin.prize + h.fin.sales)}, wages ${money(h.fin.wages)}, fees ${money(h.fin.fees)} · balance ${money(h.fin.balance)}</div>` : ''}
       ${h.left?.length ? `<div class="dim">Left when their contracts ended: ${h.left.map(esc).join(', ')}</div>` : ''}
       ${h.deals?.length ? `<div class="dim">Your deals: ${h.deals.map(dealText).join(' · ')}</div>` : ''}
+      ${h.youthLeft?.length ? `<div class="dim">Left the youth squad at ${LEAVE_AGE}: ${h.youthLeft.map(esc).join(', ')}</div>` : ''}
       ${h.cup ? `<div>${CUP_NAME}: <b>${name(h.cup.winner)}</b> <span class="dim">beat ${name(h.cup.runnerUp)} in the final</span></div>` : ''}
       ${h.divs.map((x, d) => `<div><b>${esc(s.divisions[d].name)}</b> champions: ${name(x.champion)}${x.up.length ? ` · promoted: ${names(x.up)}` : ''}${x.down.length ? ` · relegated: ${names(x.down)}` : ''}</div>
         ${x.awards ? award('Player of the season', x.awards.player, ' avg') + award('Top scorer', x.awards.scorer, ' goals') + award('Young player', x.awards.young, ' avg') : ''}`).join('')}`).join('');
@@ -323,7 +326,7 @@ const views = {
     return `<h2>Finances · season ${s.season}</h2>
       <p>Balance <b>${money(c.fin.balance)}</b> · transfer budget ${money(s.budget)} · wage bill ${perWeek(wageBill(c))} of ${perWeek(s.wageBudget)}</p>
       <div class="wrap"><table><tr><th>Income this season</th><th></th></tr>${line('Broadcasting', L.broadcast)}${line('Sponsorship', L.sponsor)}${line('Gate receipts', L.gate)}${line('Prize money', L.prize)}${line('Player sales', L.sales)}
-      <tr><th>Costs this season</th><th></th></tr>${line('Wages', L.wages)}${line('Transfer fees', L.fees)}</table></div>
+      <tr><th>Costs this season</th><th></th></tr>${line('Wages', L.wages)}${line('Transfer fees', L.fees)}${line('Staff beyond the standard', L.staff)}</table></div>
       <p class="dim">Expected income for a mid-table season: ${money(projection(s, c))}. Each season starts with a transfer budget of half the balance (none in debt) and a wage budget of 70% of the expected income, never below the wage bill + 15%. Renewing a player at the same wage always fits.</p>`;
   },
 };
@@ -338,12 +341,33 @@ views.Scouting = () => {
     const c = clubOfPlayer(p), e = estimate(s, p, c);
     return `<tr><td>${star(p.id)}</td>${nameBtn(p, 'view')}<td>${clubCell(c)}</td>${estCells(p, e)}<td>${e.ovr[0] < e.ovr[1] && s.scouts.some(x => !x.task) ? `<button data-act="scoutPlayer" data-id="${p.id}">Scout</button>` : ''}</td></tr>`;
   });
-  const days = Object.entries(TASKS).map(([k, t]) => `${k === 'free' ? 'the free agents' : 'a ' + k}: ${t.days} days, to ${t.level}%`).join(' · ');
-  return `<h2>Scouts</h2><p class="dim">Send a scout to watch a player, a club, a division or the free agents. When he reports, you know everyone he watched: ${days}. What you know fades over two seasons, and Premier League players are always known.</p>
+  const days = Object.entries(TASKS).map(([k, t]) => `${k === 'free' ? 'the free agents' : 'a ' + k}: ${taskDays(s, k)} days, to ${t.level}%`).join(' · ');
+  return `<h2>Scouts</h2><p class="dim">Send a scout to watch a player, a club, a division or the free agents. When he reports, you know everyone he watched: ${days}. What you know fades over two seasons, and Premier League players are always known. Your scouting staff level (Staff) sets how many scouts you have and how fast they work.</p>
     <div class="wrap"><table>${scouts}</table></div>
     <h2>Shortlist</h2>${list.length ? `<div class="wrap"><table><tr><th></th><th>Name</th><th>Club</th>${EST_HEAD.replace('<th>Name</th>', '')}<th></th></tr>${list.join('')}</table></div>` : '<p class="dim">Empty: add players with ☆ on Transfers or a profile.</p>'}`;
 };
 
+views.Staff = () => {
+  const c = myClub(s), std = STANDARD[Math.min(c.div, STANDARD.length - 1)];
+  const effect = {
+    coaching: l => `young players grow ×${COACHING[l - 1]} as fast; youth intake ${2 + l} a year`,
+    scouting: l => `${SCOUTS[l - 1]} scout${SCOUTS[l - 1] > 1 ? 's' : ''}, reports in ×${SCOUT_SPEED[l - 1]} the time`,
+    medical: l => `injuries last ×${MEDICAL[l - 1]} as long`,
+  };
+  const row = a => `<tr><td>${a[0].toUpperCase() + a.slice(1)}</td><td><select data-act="staff" data-field="${a}">${options([1, 2, 3, 4, 5].map(l => [String(l), `Level ${l} · ${perWeek(STAFF_COST[l - 1])}`]), String(c.staff[a]))}</select></td><td class="dim">${effect[a](c.staff[a])}</td></tr>`;
+  const extra = staffBill(s, c);
+  return `<h2>Staff</h2><p class="dim">Your club's budget already pays for level ${std} staff in every area (the ${esc(s.divisions[c.div].name)} standard). Each area above it costs the difference every week, and below it saves it; the difference counts against your wage budget.</p>
+    <div class="wrap"><table>${AREAS.map(row).join('')}</table></div>
+    <p>Beyond the standard: <b>${extra < 0 ? 'saving ' + perWeek(-extra) : perWeek(extra)}</b> · wage bill ${perWeek(wageBill(c))} · wage budget ${perWeek(s.wageBudget)}</p>`;
+};
+
+views.Youth = () => {
+  const rows = byPos(s.youth).map(p => { const [lo, hi] = ceilingRange(s, p); return `<tr>${nameBtn(p, 'view')}<td>${p.pos}</td><td class="n">${p.age}</td><td class="n">${overall(p)}</td><td class="n">${lo}–${hi}</td>
+    <td><button data-act="promote" data-id="${p.id}">Promote (${perWeek(wage(p))})</button> <button data-act="releaseYouth" data-id="${p.id}">Release</button></td></tr>`; }).join('');
+  return `<h2>Youth squad (${s.youth.length}/${YOUTH_MAX})</h2><p class="dim">Youngsters train every week but play no matches and earn nothing. A new intake arrives each summer; at ${LEAVE_AGE} those still here leave. Ceiling: the overall your coaches think he can reach (better coaching, a closer guess). When contracts end and the first team runs short, the best youth player in the position steps up.</p>
+    ${rows ? `<div class="wrap"><table><tr><th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Ovr</th><th class="n">Ceiling</th><th></th></tr>${rows}</table></div>` : '<p class="dim">Empty until the summer intake.</p>'}`;
+};
+
 const actions = {
   start(id) { takeClub(s, id); tab = 'Squad'; tableDiv = s.clubs[id].div; },
   reset() { if (s.me === null || confirm('Abandon this career and start a new game?')) { stopClock(); s = newWorld(); sel = viewing = null; tableDiv = 0; } },
@@ -391,6 +415,9 @@ const actions = {
     const [kind, id] = el.value.split(':');
     msg = assign(s, k, id === undefined ? { kind } : { kind, id: +id }) || 'Scout sent.';
   },
+  staff(_, el) { msg = setStaff(s, el.dataset.field, +el.value) || 'Staff changed.'; },
+  promote(id) { msg = promote(s, id, MAX_SQUAD) || 'Promoted to the first team.'; },
+  releaseYouth(id) { msg = release(s, id) || 'Released.'; if (viewing === id) viewing = null; },
   scoutPlayer(id) { const k = s.scouts.findIndex(x => !x.task); msg = k < 0 ? 'Every scout is busy.' : assign(s, k, { kind: 'player', id }) || `Scout ${k + 1} sent: report in ${TASKS.player.days} days.`; },
   bid(id) { msg = bid(s, id, feeOf(id)) || 'Bid accepted: he has signed.'; },
   counter(id) { msg = acceptCounter(s, id) || 'Deal done: he has signed.'; },
```

- [ ] **Step 2: Checks** — `node --input-type=module --check < src/ui/app.js` prints nothing; `npm test` passes.

- [ ] **Step 3: Verify in the browser** — `preview_start` with `{ name: "touchline" }`:
  1. The existing save (version 9) loads with no console errors. **Staff** and **Youth** tabs appear. Youth is empty until the summer.
  2. **Staff**:
     - three areas at your division's standard, each with its weekly cost and effect, and "Beyond the standard: €0.0k/wk";
     - at a Championship club, Coaching level 5 is refused ("Over the wage budget.");
     - Medical level 1 shows a saving.
  3. **Scouting**: report times follow the Scouting level (a player: 7 days at level 3).
  4. **New game** with a League One club, then **Youth**: 4 youngsters aged 15–16, each with an overall and a ceiling range. Open a profile. Promote one (he appears in Squad and Contracts on a starter contract) and release one.
  5. **Finances** shows "Staff beyond the standard".
  6. Play to the end of a season: History lists youngsters who left at 19, and a new intake arrives.

- [ ] **Step 4: Commit**

```bash
git add src/ui/app.js
git commit -m "feat: Staff and Youth tabs; staff costs in Finances, youth leavers in History"
```

---

### Task 5: Docs

**Files:**
- Modify: `docs/fun-surprises.md`, `docs/superpowers/plans/2026-11-15-touchline-roadmap.md`

- [ ] **Step 1: Fun surprises** — add after row 20:

```markdown
| 21 | **Staff on demand.** Staff levels can be changed at any time and are paid week by week, and Medical scales an injury when it happens. Pay for a top physio through the busy winter fixtures and drop back in the summer; cut coaching while you have no young players to develop. | Before a run of midweek fixtures, raise Medical; in the close season, drop everything to level 1 and pocket the saving. | `setStaff()` in `src/staff.js`, `staffBill()` in `src/finance.js` | Phase 9 |
| 22 | **Coaches judge their own.** The youth ceiling is a range whose width depends on coaching. Raise Coaching for a week to see the real stars among your youngsters, then drop it back before the bill bites. | Raise Coaching, open Youth, note the ceilings, set it back. | `ceilingRange()` in `src/youth.js` | Phase 9 |
```

  Record any other quirk found while implementing or reviewing this phase.

- [ ] **Step 2: Roadmap**
  - Row 9: change `to write` to `` `2026-11-16-touchline-phase-9-youth-staff.md` (done YYYY-MM-DD) ``.
  - Replace the "Phase 9 note" line (coaches scale `GROWTH` and `INTENSITY`…) with:

```markdown
Phase 9 note (done 2026-11-16): staff are levels 1-5 per area (owner's choice), not individual people. Coaching scales growth and the youth intake, Scouting the number and speed of scouts, Medical injury length; level 3 is the calibrated game. Training intensity and recovery rates were left as calibrated.
```

  - Add below the Phase 8 notes:

```markdown
Phase 9 notes (decided 2026-11-16):
- Only the human club pays for staff, and only beyond its division's standard (`STANDARD` in `src/finance.js`); staff costs count against the wage budget. Phase 10's board should set that budget from income and debt.
- AI clubs have no youth squads; their gaps are still filled by generated academy players.
```

- [ ] **Step 3: Run the tests and commit**

```bash
git add docs/fun-surprises.md docs/superpowers/plans/2026-11-15-touchline-roadmap.md
git commit -m "docs: mark Phase 9 done"
```

- [ ] **Step 4: End-of-phase summary** (in chat): what changed, the browser check, fun surprises #21 and #22.
