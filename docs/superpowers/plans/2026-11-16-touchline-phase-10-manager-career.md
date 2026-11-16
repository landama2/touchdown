# Touchline Phase 10 — Manager Career Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Every club's **board** judges its manager with a **confidence** score from 0 to 100. It moves:
  - after every league result, against what a squad like his should get;
  - each week, with the league position against the board's target and with the books;
  - with the cup run;
  - at the end of the season, on whether the target was met, plus promotion and relegation.
- Below the sacking line the manager goes. AI clubs then have a **vacancy** for 14 days.
- You can be sacked. You are then **out of work**: the world plays on, and clubs with vacancies may **offer you their job**.
- You have a **reputation** (0–100) that follows your finishes and trophies. It:
  - decides which clubs will offer you a job;
  - lowers your sacking line a little;
  - persuades players to join you.
- The board now sets your **budgets** from income, savings and debt. Once a season you may **ask for more**.
- A kept, dated **inbox** collects all news: injuries, transfers, scout reports, board targets, warnings, sackings and job offers. Job offers can be accepted or declined from it.

**Architecture:**
- **`src/career.js` (new):** expectations, confidence, sackings, vacancies, job offers, reputation, the budget request and the inbox. Pure, and draws no random numbers.
  - AI clubs have no manager people: a sacking only resets the board and opens a vacancy.
  - So the world plays exactly as before, and every calibration target holds unchanged.
- **`src/world.js`:** every club gets `conf` and `games`. The state gets `career: null`, `jobs: []` and `inbox: []`. `seeding` is exported, and `BOARD_START` and `REP_START` live here.
- **`src/season.js`:** calls the career hooks after each league match and cup tie, each week, each day, and at the end of the season.
- **`src/finance.js`:** `seasonBudgets` follows income, savings and debt. This replaces the Phase 6 floor of wage bill + 15%.
- **`src/market.js`, `src/transfers.js`:** `refusal()` takes the manager's reputation.
- **Saves:** version 11.
- **UI:**
  - new **Board** and **Inbox** tabs, with an unread count on Inbox;
  - an out-of-work screen;
  - news lines for the new events;
  - the club picker starts a career.

**Tech Stack:** Vanilla JavaScript ES modules, HTML/CSS, Node ≥ 22 built-in test runner. No npm dependencies. Local preview via the `touchline` server in `.claude/launch.json` (port 8127).

**Prototype:** every change below was built and run on a copy of the repository at commit `4fddbc5` (2026-11-16).
- The patches were then applied one task at a time to a second clean copy. The suite passed after each task: 203, then 217, then 218, then 218 tests.
- Calibration runs on the real leagues used seeds 1–3:
  - **Expected points** were fitted on 17,808 league results: 1.38 + 0.26 × quality gap, ± 0.2 at home or away.
  - **AI sackings:** about 13 a season across 68 clubs (range 10–17). Real English football sees roughly 15–20.
  - **Human on autopilot:** a manager who only renews contracts was sacked in 3 of 9 careers over two seasons.
  - **Offers:** a lower-league manager received several within a season.
- The browser preview of the prototype was blocked in the planning session, so the UI was checked in Node with a minimal DOM stub instead. It covered:
  - every tab rendering;
  - the club picker starting a career;
  - Board and Inbox, including the unread count and the budget request;
  - a sacking that leads to the out-of-work screen, with Continue;
  - accepting a job offer from the inbox.
- Task 4's browser check is the first real-browser run.

## Global Constraints

- Node 22 or newer; no packages.
- Engine code must not reference `document`, `window`, `localStorage`, `Math.random` or `Date`.
- State survives `JSON.parse(JSON.stringify(state))`. Determinism: same seed + same inputs = same career.
- **Calibration must still hold** (real leagues, seed 1): every target from Phases 2–9 in `tests/england.test.js`. `src/career.js` draws no random numbers and nothing in the world reads `conf`, so these stay unchanged by design. The prototype passed them all.
- **Import order:** `src/career.js` imports `src/season.js`, which imports it back. Only functions and constants used inside functions cross, so the cycle is safe.
  - `src/world.js` and `src/save.js` must **not** import `src/career.js`. Either would put `season.js` ahead of `world.js` (`MARKET_SIZE` used at load). That is why `BOARD_START` and `REP_START` live in `world.js`.
- This is a private personal project: real names are used.
- Fun surprises rule: keep minor fun quirks, record them in `docs/fun-surprises.md`, mention them in the end-of-phase summary.
- Every task ends with `npm test` passing and a commit. Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Design decisions (made while planning, 2026-11-16)

Choices made by the owner while planning:
- **Sacked:** you become unemployed. The world plays on, and clubs that sack their manager may offer you their job. Starting a new game is up to you.
- **The board judges:** the league target, finances, the cup run and recent form, so a bad run can cost you your job mid-season.
- **Job offers:** they come from vacancies at any time. AI clubs "sack" by the same rules but have no manager people.
- **Inbox:** persistent and dated, with an unread count. Job offers are answered in it.
- **Budgets:** set by formula, plus one request a season.
- **Premier League money piles:** left for Phase 12.
- **Reputation:** gates job offers, buys board patience and makes players more willing. It starts at 30 whichever club you pick.

Decided by Claude while planning (owner may overrule):
- No penalty for an inherited wage bill: the wage budget never starts below what the club pays now.
- The board answers a budget request by a fixed rule, not a dice roll.

**Confidence** (`c.conf`, every club, 0–100, starts at `BOARD_START` = 60 with every new manager):

| When | Change |
|------|--------|
| A league match | 1.5 × (points − expected points). Expected = 1.38 + 0.26 × (own quality − opponent's quality) ± 0.2 home/away, clamped to 0.2–2.6 |
| A cup tie decided | out before the target round: −5. Won in or after the target round: +3 |
| Each week (after 6 league games) | 3+ places below the league target: −0.5. Meeting it: +0.25 |
| Each week | in debt: −1. The human club over its wage budget (wages + staff): −1 |
| End of season | target met: +10. Otherwise −8 per band missed. Promoted: +20. Relegated: −30 |
| A budget request refused | −3 |

**Targets:**
- **League:** the club's expected finish is its rank by squad quality in its division. The target is the tightest of the division's bands that holds that finish.
  - Premier League bands: win the league (1), finish in the top four (4), top half (10), stay up (17).
  - EFL bands: win the league (1), win promotion (2), reach the play-offs (6), top half (12), and then stay up (21) or, in the bottom division, stay out of the bottom three (21).
  - A small division (the test leagues) drops bands that overlap the ones before.
- **Cup:** a club seeded r-th of n should reach round ⌊log₂(P/r)⌋, plus 1 when there is a preliminary round, where P is the largest power of two ≤ n.
  - With 68 clubs the top seed should reach the final, and clubs seeded 65th or lower should only win their preliminary-round tie at best (target: the preliminary round).

**Sackings** (`boardDay`, every played day and at the end of the season):
- A manager with at least 6 league games (`MIN_GAMES`) whose confidence is below the line is sacked. The line is `SACK` = 20, and 20 − reputation/10 for the human.
- An AI club resets to `BOARD_START` and 0 games, and opens a vacancy for 14 days (`VACANCY_DAYS`).
- A club taken with `takeClub` but no career (the engine tests) is never sacked.
- The human manager is warned when confidence first drops below 35 and again below 25. The warning resets once confidence is back at 45.

**When you are sacked:**
- Your reputation drops by 10.
- `s.me` becomes null.
- Your youth squad, scouts, offers, talks and budgets go.
- Your old club opens a vacancy that is never offered to you.
- Open vacancies you now qualify for are offered at once.

**Job offers:**
- A vacancy at club X is offered when your reputation ≥ X's size − 15. A club's size (`level`) is 0–100 by its place in the cup seeding.
- While you have a club, only clubs bigger than yours offer.
- An offer is open while its vacancy lasts.
- **Accept:** if you have a club you leave it (its spell ends as `'left'` and it opens a vacancy). Then `takeClub` runs at the new club. It resets tactics, scouts and budgets and brings a fresh youth intake, and the board starts at 60.
- **Decline:** withdraws the offer.

**Reputation** (`s.career.rep`, 0–100, starts at `REP_START` = 30):
- **End of season:** it moves 30% of the way toward your finish's standing across the pyramid, where the top of the Premier League is 100 and the bottom of League One is 0. Each trophy adds +5: league, play-offs, cup.
- **Sacked:** −10.
- **Effects:**
  - job offers, as above;
  - the sacking line;
  - player willingness: `refusal()` lets a regular join a club up to 3 + rep/25 quality weaker, and from rep 75 he drops a division to play for you.

**Budgets** (`seasonBudgets`, each season and on taking a club):
- **Transfer budget:** half the balance, none in debt (unchanged).
- **Wage budget:** max(wages + staff now, 70% of projected income / 52) + max(0, balance) / 104.
  - In debt there are no savings and the income part is × 0.8, so wages are frozen at what the club pays.
  - This replaces the Phase 6 floor of wage bill + 15%, which let a manager raise wages every season.
  - At a new game it gives almost the same headroom: EFL wage bills run at about 1.2× the 70% line.
- **Request:** once a season you may ask for +25% transfer budget or +10% wage budget. The board agrees if its confidence is ≥ 60 and the balance is > 0. Otherwise it refuses, and confidence drops by 3.

**Inbox** (`s.inbox`):
- Every item of `s.news` from a played day is filed with its season and day, plus `read: false`. Items from outside a day are posted directly: the season review, targets, request answers.
- It is capped at 150 items, oldest dropped. Items are marked read when the Inbox tab shows them.
- News types added: `vacancy`, `job`, `warning`, `sacked`, `target`, `review`, `request`.

**State added:**
- per club: `c.conf`, `c.games`;
- `s.career`: `null` before a club is picked, else `{ rep, asked, warned, spells: [{ club, from, to, how }] }`;
- `s.jobs`: `[{ club, season, until, offered }]`;
- `s.inbox`.

**Saves:** version 11. The migration:
- gives every board `BOARD_START`, with this season's league games counted;
- gives a career in progress `REP_START` and one open spell at its club (a save still on the club picker gets `career: null`);
- adds empty `jobs` and `inbox`.

**Later phases:**
- Phase 11 (Interface) can give the Board a confidence history and the inbox filters.
- Phase 12 (Balance & soak) should check:
  - the sacking rate (target 10–20 a season);
  - the Premier League money piles, which this phase leaves alone;
  - that a managed career survives 20 seasons.

## File map

| File | Change |
|------|--------|
| `src/career.js` | **new** |
| `src/world.js` | `BOARD_START`, `REP_START`; clubs get `conf`, `games`; state gets `career`, `jobs`, `inbox`; `seeding` exported |
| `src/season.js` | career hooks in `playDay` and `endSeason` |
| `src/finance.js` | `seasonBudgets` from income, savings and debt (`SAVINGS_WEEKS`, `DEBT_CUT`) |
| `src/market.js` | `refusal(from, to, p, rep)`, `REP_PULL`, `REP_DROP` |
| `src/transfers.js` | your bids and loans pass your reputation |
| `src/save.js` | version 11 |
| `src/ui/app.js` | Board and Inbox tabs, the out-of-work screen, news lines, `startCareer` |
| `tests/career.test.js` | **new** |
| `tests/finance.test.js`, `tests/market.test.js`, `tests/save.test.js` | updated |

---

### Task 1: The board's budgets, and reputation in player willingness

**Files:**
- Modify: `src/finance.js`, `src/market.js`, `src/transfers.js`
- Test: `tests/finance.test.js`, `tests/market.test.js`

**Interfaces:**
- Produces: `SAVINGS_WEEKS` (104) and `DEBT_CUT` (0.8) exported from `src/finance.js`. `seasonBudgets(s)` keeps its signature.
- Produces: `refusal(from, to, p, rep = 0)`, plus `REP_PULL` (25) and `REP_DROP` (75) from `src/market.js`. AI callers pass no `rep`. `bid` and `loanIn` pass `s.career?.rep`, which is `undefined` (so 0) until Task 2 adds `s.career`.

- [ ] **Step 1: Write the failing tests** — apply to `tests/` (`git apply`), or make the same edits by hand:

```diff
diff --git a/tests/finance.test.js b/tests/finance.test.js
index 493a71d..36e222c 100644
--- a/tests/finance.test.js
+++ b/tests/finance.test.js
@@ -2,7 +2,7 @@ import { test } from 'node:test';
 import assert from 'node:assert/strict';
 import { makeRng } from '../src/rng.js';
 import { createPlayer, value } from '../src/player.js';
-import { wage, sponsorship, gate, wageBill, blankLedger, newBooks, projection, payWeeks, payGate, payPrizes, seasonBudgets, SEASON_WEEKS, BROADCAST, MERIT, CUP_PRIZE } from '../src/finance.js';
+import { wage, sponsorship, gate, wageBill, blankLedger, newBooks, projection, payWeeks, payGate, payPrizes, seasonBudgets, SAVINGS_WEEKS, DEBT_CUT, SEASON_WEEKS, BROADCAST, MERIT, CUP_PRIZE } from '../src/finance.js';
 
 // A midfielder whose overall is exactly `ovr` (a multiple of 5): every attribute is ovr / 5.
 const at = (ovr, age = 25) => { const p = createPlayer(makeRng(1), 1, 'MF', 10, age); for (const k in p.attrs) p.attrs[k] = ovr / 5; return p; };
@@ -68,14 +68,14 @@ test('prizes: merit by final position for every club, the cup winner and runner-
   assert.equal(payPrizes(books(), [[0, 1], [2]], null, null), 0);
 });
 
-test('season budgets: half the balance to spend on fees (none in debt), wages up to 70% of income', () => {
+test('season budgets: half the balance for fees; wages up to 70% of income or the current bill, plus savings over two years', () => {
   const s = books(), c = s.clubs[0];
   c.fin.balance = 10e6; seasonBudgets(s);
   assert.equal(s.budget, 5e6);
-  assert.ok(s.wageBudget >= 1.15 * wageBill(c) && s.wageBudget % 1e3 === 0);
-  assert.ok(Math.abs(s.wageBudget - 0.7 * projection(s, c) / 52) <= 500);
+  assert.equal(s.wageBudget, Math.round((0.7 * projection(s, c) / 52 + 10e6 / SAVINGS_WEEKS) / 1e3) * 1e3);
   c.fin.balance = -1e6; seasonBudgets(s);
   assert.equal(s.budget, 0);
-  const rich = books(12, [5e6]); seasonBudgets(rich);
-  assert.equal(rich.wageBudget, Math.round(1.15 * 5e6 / 1e3) * 1e3);
+  assert.equal(s.wageBudget, Math.round(DEBT_CUT * 0.7 * projection(s, c) / 52 / 1e3) * 1e3); // in debt: no savings, less income
+  const rich = books(12, [5e6]); rich.clubs[0].fin.balance = 0; seasonBudgets(rich);
+  assert.equal(rich.wageBudget, 5e6); // never below what the club pays now: wages are frozen, not cut
 });
diff --git a/tests/market.test.js b/tests/market.test.js
index a52384c..3a0672a 100644
--- a/tests/market.test.js
+++ b/tests/market.test.js
@@ -8,7 +8,7 @@ import { yearsFor } from '../src/contracts.js';
 import { takeClub, playDay, endSeason } from '../src/season.js';
 import { MINI } from './fixtures/mini.js';
 import { MIN_SQUAD, MAX_SQUAD, SUMMER_END, JANUARY, LOAN_SHARE, inWindow, windowOpen, windowId, justJoined, loanEnd, bar, regular,
-  asking, signingFee, refusal, move, lend, loanable, returnLoans, marketDay } from '../src/market.js';
+  asking, signingFee, refusal, REP_PULL, REP_DROP, move, lend, loanable, returnLoans, marketDay } from '../src/market.js';
 
 const world = seed => createWorld(seed, MINI);
 const sumBalances = s => s.clubs.reduce((t, c) => t + c.fin.balance, 0);
@@ -59,6 +59,16 @@ test('refusal: nobody drops two divisions; regulars under 31 won\'t drop one or
   }
 });
 
+test("refusal: a manager's reputation widens the quality gap a regular accepts, and from REP_DROP he drops a division", () => {
+  const s = world(3), top = s.clubs[0], mid = s.clubs[4], [star] = byOverall(top);
+  star.age = 25; star.morale = 50;
+  const weak = { ...top, id: 99, quality: top.quality - 4 };
+  assert.match(refusal(top, weak, star, REP_PULL - 1), /weaker club/);
+  assert.equal(refusal(top, weak, star, REP_PULL + 1), null); // a gap of 3 + rep / REP_PULL
+  assert.match(refusal(top, mid, star, REP_DROP - 1), /drop a division/);
+  assert.equal(refusal(top, mid, star, REP_DROP), null);
+});
+
 test('a move: the buyer pays, the seller is paid, nothing else changes hands; contracts and the log follow', () => {
   const s = world(4), from = s.clubs[0], to = s.clubs[1], p = from.players[5], total = sumBalances(s);
   move(s, p, from, to, 3e6);
```

- [ ] **Step 2: Run them to verify they fail** — `node --test tests/finance.test.js tests/market.test.js`. Expected: FAIL. `SAVINGS_WEEKS` is undefined, so the budget test fails, and the new refusal test fails because `REP_PULL` and `REP_DROP` are undefined.

- [ ] **Step 3: Change the source**

```diff
diff --git a/src/finance.js b/src/finance.js
index 2351431..25dc46a 100644
--- a/src/finance.js
+++ b/src/finance.js
@@ -14,7 +14,8 @@ const SPONSOR = { at8: 0.8e6, growth: 0.46 }, GATE = { at8: 125e3, growth: 0.32
 const WAGE = { at50: 2.2e3, growth: 0.112 };  // a week: overall 50 ≈ a League One regular, 93 ≈ €270k (tuned in Phase 6)
 export const STANDARD = [4, 3, 2];                          // the staff level (src/staff.js) a division's books already pay for
 export const STAFF_COST = [2e3, 6e3, 20e3, 60e3, 180e3];     // a week per staff area, by level 1-5
-const START_SHARE = 0.25, TRANSFER_SHARE = 0.5, WAGE_SHARE = 0.7, WAGE_HEADROOM = 1.15; // (raised from 1.05 in Phase 6 review: 5% left no room to renew)
+const START_SHARE = 0.25, TRANSFER_SHARE = 0.5, WAGE_SHARE = 0.7;
+export const SAVINGS_WEEKS = 104, DEBT_CUT = 0.8; // savings fund extra wages over two years; Phase 10 replaced the Phase 6 floor of wage bill + 15%
 
 const byDiv = (list, d) => list[Math.min(d, list.length - 1)];
 const round = (x, step) => Math.round(x / step) * step;
@@ -71,11 +72,13 @@ export function payPrizes(s, tables, cup, me) {
   return mine;
 }
 
-// The human club's limits for a season, from its books: a transfer budget of half its balance (none
-// in debt) and a weekly wage budget of 70% of its projected income, never below its wage bill + 5%.
-// ponytail: fixed shares; Phase 10's board sets budgets.
+// The board's limits for the human club's season, from its books: a transfer budget of half its
+// balance (none in debt); a weekly wage budget of 70% of its projected income or what it pays now in
+// wages and staff, whichever is more, plus what its savings can carry over SAVINGS_WEEKS. In debt
+// there are no savings and the income part shrinks by DEBT_CUT, so wages are frozen.
+// The manager may ask for more once a season (askBoard in src/career.js).
 export function seasonBudgets(s) {
-  const c = s.clubs[s.me];
+  const c = s.clubs[s.me], debt = c.fin.balance < 0;
   s.budget = Math.max(0, round(TRANSFER_SHARE * c.fin.balance, 1e5));
-  s.wageBudget = round(Math.max(WAGE_HEADROOM * wageBill(c), WAGE_SHARE * projection(s, c) / 52), 1e3);
+  s.wageBudget = round(Math.max(wageBill(c) + staffBill(s, c), WAGE_SHARE * (debt ? DEBT_CUT : 1) * projection(s, c) / 52) + Math.max(0, c.fin.balance) / SAVINGS_WEEKS, 1e3);
 }
diff --git a/src/market.js b/src/market.js
index 93ad3bd..0c85b72 100644
--- a/src/market.js
+++ b/src/market.js
@@ -52,13 +52,16 @@ export const signingFee = p => round10k(SIGNING_FEE * value(p));
 // Why p (at club `from`; null for a free agent) won't join club `to`, or null. Free agents, unhappy
 // players (morale under 40) and listed players go anywhere within a division's drop. Nobody drops two
 // divisions; a regular under 31 won't drop one, nor join a club 3+ quality weaker in his division.
-export function refusal(from, to, p) {
+// A manager's reputation `rep` (0-100; the human's, src/career.js) widens that gap by rep / REP_PULL,
+// and from REP_DROP a regular drops a division to play for that manager.
+export const REP_PULL = 25, REP_DROP = 75;
+export function refusal(from, to, p, rep = 0) {
   if (!from || p.morale < 40) return null;
   const drop = to.div - from.div;
   if (drop >= 2) return `${p.name} won't drop two divisions.`;
   if (p.age >= 31 || p.listed || !regular(from, p)) return null;
-  if (drop === 1) return `${p.name} won't give up a regular place to drop a division.`;
-  if (drop === 0 && to.quality < from.quality - 3) return `${p.name} won't join a weaker club.`;
+  if (drop === 1 && rep < REP_DROP) return `${p.name} won't give up a regular place to drop a division.`;
+  if (drop === 0 && to.quality < from.quality - 3 - rep / REP_PULL) return `${p.name} won't join a weaker club.`;
   return null;
 }
 
diff --git a/src/transfers.js b/src/transfers.js
index d7a84ad..3ff4d6e 100644
--- a/src/transfers.js
+++ b/src/transfers.js
@@ -64,7 +64,7 @@ export function bid(s, id, fee) {
   if (!at) return 'Player not available.';
   const { p, c } = at, me = s.clubs[s.me];
   fee = round10k(fee);
-  const no = cannotTake(s, p) ?? refusal(c, me, p);
+  const no = cannotTake(s, p) ?? refusal(c, me, p, s.career?.rep);
   if (no) return no;
   if (c.players.length <= MIN_SQUAD) return `${c.name} won't sell: they need every player.`;
   if (fee > s.budget) return 'Not enough transfer budget.';
@@ -92,7 +92,7 @@ export function loanIn(s, id) {
   const at = atClub(s, id);
   if (!at) return 'Player not available.';
   const { p, c } = at, me = s.clubs[s.me];
-  const no = cannotTake(s, p) ?? (loanable(s, c, p) ? refusal(c, me, p) : `${c.name} won't lend ${p.name}.`);
+  const no = cannotTake(s, p) ?? (loanable(s, c, p) ? refusal(c, me, p, s.career?.rep) : `${c.name} won't lend ${p.name}.`);
   if (no) return no;
   if (me.players.filter(x => x.loan).length >= MAX_LOANS) return `You can have at most ${MAX_LOANS} players on loan.`;
   if (overWages(s, loanPay(p.contract.wage))) return 'Over the wage budget.';
```

- [ ] **Step 4: Run the tests** — `npm test`. Expected: 203 pass, 0 fail. `tests/england.test.js` is unchanged and passes.

- [ ] **Step 5: Commit**

```bash
git add src/finance.js src/market.js src/transfers.js tests/finance.test.js tests/market.test.js
git commit -m "feat: board budgets from income, savings and debt; reputation in player willingness"
```

---

### Task 2: Boards, sackings, vacancies, job offers, reputation and the inbox

**Files:**
- Create: `src/career.js`, `tests/career.test.js`
- Modify: `src/world.js`, `src/season.js`

**Interfaces:**
- Consumes: `table`, `takeClub`, `PROMOTED`, `PLAYOFF`, `RELEGATED` (season.js); `wageBill`, `staffBill` (finance.js); `cupRounds` (cup.js); `seeding`, `BOARD_START`, `REP_START` (world.js, this task).
- Produces, from `src/career.js`:
  - **Constants:** `START`, `REP_START`, `SACK`, `MIN_GAMES`, `WARN`, `CALM`, `EXPECT`, `MOVE`, `REP`, `ASK`, `VACANCY_DAYS`, `INBOX_MAX`.
  - **Expectations:**
    - `expectedPoints(s, id, opp, home)` → number;
    - `expectedPos(s, id)` → 1-based finish;
    - `bands(s, d)` → `[[text, worst finish], ...]`;
    - `leagueTarget(s, id)` → index into `bands`;
    - `cupTarget(s, id)` → round index;
    - `level(s, id)` → 0–100.
  - **Hooks** (called by season.js):
    - `afterLeague(s, r)`;
    - `afterCup(s, tie, round)`;
    - `boardWeeks(s, weeks)`;
    - `boardDay(s)`;
    - `seasonReview(s, tables, h)`;
    - `seasonStart(s)`;
    - `file(s)`.
  - **The human manager:**
    - `post(s, item)`;
    - `startCareer(s, id)`;
    - `acceptJob(s, id)` → error or null;
    - `declineJob(s, id)`;
    - `openOffer(s, id)` → boolean;
    - `askBoard(s, 'transfer' | 'wage')` → message.

- [ ] **Step 1: Write the failing tests** — create `tests/career.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { takeClub, playDay, endSeason, table } from '../src/season.js';
import {
  START, SACK, MIN_GAMES, MOVE, REP_START, REP, ASK, VACANCY_DAYS, INBOX_MAX,
  expectedPoints, expectedPos, bands, leagueTarget, cupTarget, level, afterLeague, afterCup, boardDay, seasonReview,
  post, startCareer, acceptJob, declineJob, openOffer, askBoard,
} from '../src/career.js';
import { MINI } from './fixtures/mini.js';

const world = seed => createWorld(seed, MINI);
// MINI: Top League clubs 0-3 (Alpha strongest), Middle League 4-13, Low League 14-19.

test('expected points rise with the quality gap and at home', () => {
  const s = world(1);
  assert.ok(expectedPoints(s, 0, 19, true) > expectedPoints(s, 19, 0, false));
  assert.ok(expectedPoints(s, 4, 5, true) > expectedPoints(s, 4, 5, false));
  assert.ok(expectedPoints(s, 0, 19, true) <= 2.6 && expectedPoints(s, 19, 0, false) >= 0.2);
});

test('the board expects a finish by squad quality and sets the tightest band that holds it', () => {
  const s = world(1);
  assert.equal(expectedPos(s, 0), 1);
  assert.equal(bands(s, 0)[leagueTarget(s, 0)][0], 'win the league');
  assert.deepEqual(bands(s, 1).map(b => b[1]), [1, 2, 6, 7]); // 10 clubs: top half (5) overlaps the play-offs and drops out
  assert.equal(bands(s, 1)[leagueTarget(s, 13)][0], 'stay up');
  assert.deepEqual(bands(s, 2).map(b => b[1]), [1, 2, 6]); // the bottom division's 'stay out of the bottom three' (3) overlaps too
  assert.ok(bands(s, 0).every(([, lim], k, a) => !k || lim > a[k - 1][1]));
});

test('cup targets: the top seed should reach the final, the weakest clubs only play the first round', () => {
  const s = world(1);
  assert.equal(cupTarget(s, 0), 4);   // 20 clubs: preliminary round + 4 rounds; index 4 is the final
  assert.equal(cupTarget(s, 19), 0);
  assert.ok(level(s, 0) === 100 && level(s, 19) === 0);
});

test('a result above expectation raises confidence, below it lowers it, and counts a league game', () => {
  const s = world(1);
  afterLeague(s, { h: 19, a: 0, hg: 2, ag: 0 });
  assert.ok(s.clubs[19].conf > START && s.clubs[0].conf < START);
  assert.deepEqual([s.clubs[19].games, s.clubs[0].games], [1, 1]);
});

test('going out of the cup early costs confidence; winning from the target round on gains', () => {
  const s = world(1), t = { h: 0, a: 19, w: 19 };
  afterCup(s, t, 0);
  assert.equal(s.clubs[0].conf, START - MOVE.cupOut);
  assert.equal(s.clubs[19].conf, START + MOVE.cupWin);
});

test('an AI club under the line sacks its manager after MIN_GAMES league games and opens a vacancy', () => {
  const s = world(1), c = s.clubs[5];
  c.conf = SACK - 1; c.games = MIN_GAMES - 1;
  boardDay(s);
  assert.equal(s.jobs.length, 0);
  c.games = MIN_GAMES;
  boardDay(s);
  assert.deepEqual(s.jobs.map(j => j.club), [5]);
  assert.deepEqual([c.conf, c.games], [START, 0]);
  assert.equal(s.news.at(-1).type, 'vacancy');
  s.day += VACANCY_DAYS + 1; boardDay(s);
  assert.equal(s.jobs.length, 0); // filled
});

test('a club taken without a career (the engine tests) is never sacked', () => {
  const s = world(1);
  takeClub(s, 5);
  s.clubs[5].conf = 0; s.clubs[5].games = MIN_GAMES;
  boardDay(s);
  assert.equal(s.me, 5);
});

test('the human manager is warned, then sacked: no club, lower reputation, a spell that ended', () => {
  const s = world(1);
  startCareer(s, 5);
  assert.equal(s.career.rep, REP_START);
  assert.equal(s.inbox.at(-1).type, 'target');
  const c = s.clubs[5];
  c.games = MIN_GAMES; c.conf = 30;
  boardDay(s);
  assert.equal(s.news.at(-1).type, 'warning');
  c.conf = SACK - REP_START / REP.patience - 1;
  boardDay(s);
  assert.equal(s.me, null);
  assert.equal(s.career.rep, REP_START - REP.sacked);
  assert.deepEqual(s.career.spells.map(x => [x.club, x.how]), [[5, 'sacked']]);
  assert.ok(s.jobs.some(j => j.club === 5 && !j.offered)); // the old club does not ask the manager back
  assert.deepEqual([s.youth, s.scouts, s.budget], [[], [], 0]);
});

test('vacancies offer the job when the reputation is high enough; accepting moves the manager', () => {
  const s = world(1);
  startCareer(s, 15);
  s.clubs[0].conf = 0; s.clubs[0].games = MIN_GAMES;   // the biggest club: out of reach at REP_START
  s.clubs[12].conf = 0; s.clubs[12].games = MIN_GAMES; // a weak middle club, bigger than his and within reach
  boardDay(s);
  assert.ok(!openOffer(s, 0) && openOffer(s, 12));
  assert.equal(acceptJob(s, 0), 'That job has gone.');
  assert.equal(acceptJob(s, 12), null);
  assert.equal(s.me, 12);
  assert.deepEqual(s.career.spells.map(x => [x.club, x.how]), [[15, 'left'], [12, null]]);
  assert.ok(s.jobs.some(j => j.club === 15)); // the old club looks for a new manager
});

test('declining an offer withdraws it', () => {
  const s = world(1);
  startCareer(s, 15);
  s.clubs[12].conf = 0; s.clubs[12].games = MIN_GAMES;
  boardDay(s);
  assert.ok(openOffer(s, 12));
  declineJob(s, 12);
  assert.ok(!openOffer(s, 12));
});

test('the board grants one request a season while confident and out of debt; a refusal costs confidence', () => {
  const s = world(1);
  startCareer(s, 5);
  const w = s.wageBudget;
  assert.equal(askBoard(s, 'wage').startsWith('The board agrees'), true);
  assert.equal(s.wageBudget, Math.round(w * ASK.wage / 1e3) * 1e3);
  assert.equal(askBoard(s, 'transfer'), 'The board has already heard you this season.');
  s.career.asked = null; s.clubs[5].conf = ASK.conf - 1;
  const b = s.budget;
  assert.equal(askBoard(s, 'transfer').startsWith('The board says no'), true);
  assert.equal(s.budget, b);
  assert.equal(s.clubs[5].conf, ASK.conf - 1 - ASK.cost);
});

test('the season review rewards a met target and moves the reputation toward the finish', () => {
  const s = world(1);
  startCareer(s, 0);
  const tables = s.divisions.map((_, d) => s.divisions[d].clubIds); // the expected order: Alpha wins the top league
  const h = { cup: null, divs: s.divisions.map((_, d) => ({ champion: tables[d][0], playoff: null, up: [], down: [] })) };
  seasonReview(s, tables, h);
  assert.equal(s.clubs[0].conf, START + MOVE.met);
  assert.equal(s.career.rep, Math.round(REP_START + REP.pull * (100 - REP_START) + REP.trophy));
  assert.equal(s.inbox.at(-1).type, 'review');
  assert.ok(s.inbox.at(-1).met);
});

test('the inbox keeps the newest INBOX_MAX items', () => {
  const s = world(1);
  for (let k = 0; k < INBOX_MAX + 5; k++) post(s, { type: 'vacancy', club: 0, k });
  assert.equal(s.inbox.length, INBOX_MAX);
  assert.equal(s.inbox[0].k, 5);
});

test('a career season plays out: boards move, the inbox fills, and the world stays deterministic', () => {
  const run = () => { const s = world(9); startCareer(s, 10); while (!s.done) playDay(s); endSeason(s); return s; };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(a.clubs.some(c => c.conf !== START));
  assert.ok(a.inbox.length > 1);
  assert.ok(a.inbox.every(n => Number.isInteger(n.season) && typeof n.read === 'boolean'));
});
```

- [ ] **Step 2: Run them to verify they fail** — `node --test tests/career.test.js`. Expected: FAIL, `Cannot find module '../src/career.js'`.

- [ ] **Step 3: Create `src/career.js`**

```js
import { table, takeClub, PROMOTED, PLAYOFF, RELEGATED } from './season.js';
import { wageBill, staffBill } from './finance.js';
import { cupRounds } from './cup.js';
import { seeding, BOARD_START as START, REP_START } from './world.js';

// The manager's career. Every club's board judges its manager: c.conf (confidence 0-100) and c.games
// (league matches under the current manager). Results against expectation, the league position against the board's
// target, debt and the cup move it; below the sacking line the manager goes. AI clubs have no manager
// people: a sacking only opens a vacancy (s.jobs) for a while. Draws no random numbers, so the world
// plays exactly as before. The human manager (s.career, null before a club is picked) has a reputation
// that the season's finish moves; it gates job offers, steadies the board and helps persuade players.
// News goes into s.news during a day and into the kept, dated inbox (s.inbox).
// ponytail: imports season.js, which imports this file back; only functions cross, so the cycle is safe.
export { START, REP_START };
export const SACK = 20, MIN_GAMES = 6, WARN = [35, 25], CALM = 45;
export const EXPECT = { base: 1.38, perQuality: 0.26, home: 0.2 }; // league points a match, fitted on the real leagues (seeds 1-3, 2 seasons)
export const MOVE = { match: 1.5, below: 0.5, onTarget: 0.25, debt: 1, overBudget: 1, cupOut: 5, cupWin: 3, met: 10, band: 8, up: 20, down: 30 }; // about 13 sackings a season in 68 clubs (seeds 1-3, 3 seasons)
export const REP = { pull: 0.3, trophy: 5, sacked: 10, gate: 15, patience: 10 };
export const ASK = { conf: 60, cost: 3, transfer: 1.25, wage: 1.1 };
export const VACANCY_DAYS = 14, INBOX_MAX = 150;

const clamp = x => Math.max(0, Math.min(100, x));
const round = (x, step) => Math.round(x / step) * step;

// Expected league points for club id against opp.
export const expectedPoints = (s, id, opp, home) =>
  Math.max(0.2, Math.min(2.6, EXPECT.base + EXPECT.perQuality * (s.clubs[id].quality - s.clubs[opp].quality) + (home ? EXPECT.home : -EXPECT.home)));

// Expected finish (1 = top): the club's rank by squad quality in its division.
export function expectedPos(s, id) {
  const c = s.clubs[id];
  return 1 + s.divisions[c.div].clubIds.filter(x => s.clubs[x].quality > c.quality || (s.clubs[x].quality === c.quality && x < id)).length;
}
// Division d's targets, most ambitious first: [[text, worst finish that meets it], ...].
export function bands(s, d) {
  const n = s.divisions[d].clubIds.length, last = d === s.divisions.length - 1;
  const all = [['win the league', 1], ...(d ? [['win promotion', PROMOTED], ['reach the play-offs', PROMOTED + PLAYOFF]] : [['finish in the top four', 4]]),
    ['finish in the top half', n >> 1], last ? ['stay out of the bottom three', n - 3] : ['stay up', n - RELEGATED]];
  return all.filter(([, lim], k) => all.slice(0, k).every(([, x]) => x < lim)); // a small division drops the bands that overlap
}
// The board's league target for club id: an index into bands(), the tightest band that holds its expected finish.
export function leagueTarget(s, id) {
  const b = bands(s, s.clubs[id].div), e = expectedPos(s, id), k = b.findIndex(([, lim]) => lim >= e);
  return k < 0 ? b.length - 1 : k;
}
// The cup round the board expects club id to reach: seeded r-th of the n clubs, it should outlast the clubs seeded below it.
export function cupTarget(s, id) {
  const n = s.clubs.length, P = 2 ** Math.floor(Math.log2(n)), r = seeding(s.clubs).indexOf(id) + 1;
  return Math.max(0, Math.min(cupRounds(n) - 1, Math.floor(Math.log2(P / r)) + (n > P ? 1 : 0)));
}
// A club's size, 0-100: its place in the cup seeding (division, then squad quality).
export function level(s, id) {
  const order = seeding(s.clubs);
  return Math.round(100 * (1 - order.indexOf(id) / (order.length - 1)));
}

// After a league match: both boards weigh the points against what they expected.
export function afterLeague(s, r) {
  for (const [id, opp, gf, ga, home] of [[r.h, r.a, r.hg, r.ag, true], [r.a, r.h, r.ag, r.hg, false]]) {
    const c = s.clubs[id], pts = gf > ga ? 3 : gf === ga ? 1 : 0;
    c.conf = clamp(c.conf + MOVE.match * (pts - expectedPoints(s, id, opp, home)));
    c.games++;
  }
}
// After a decided cup tie in round k: out before the target round costs, a win from it on gains.
export function afterCup(s, t, k) {
  for (const id of [t.h, t.a]) {
    const c = s.clubs[id], target = cupTarget(s, id);
    if (id === t.w ? k >= target : k < target) c.conf = clamp(c.conf + (id === t.w ? MOVE.cupWin : -MOVE.cupOut));
  }
}
// Each week: 3 or more places below the target costs, on target gains (once a club has played
// MIN_GAMES league matches); debt costs; so does the human club going over its wage budget.
export function boardWeeks(s, weeks) {
  if (weeks <= 0) return;
  s.divisions.forEach((_, d) => table(s, d).forEach((id, k) => {
    const c = s.clubs[id], lim = bands(s, d)[leagueTarget(s, id)][1];
    let m = c.st.p < MIN_GAMES ? 0 : k + 1 > lim + 2 ? -MOVE.below : k + 1 <= lim ? MOVE.onTarget : 0;
    if (c.fin.balance < 0) m -= MOVE.debt;
    if (id === s.me && wageBill(c) + staffBill(s, c) > s.wageBudget) m -= MOVE.overBudget;
    c.conf = clamp(c.conf + weeks * m);
  }));
}

// End of the season, before promotion and relegation move the clubs (tables = final tables, h = the
// history entry with its up and down lists): target met or missed, promotion, relegation; the human
// manager's reputation moves toward the standing of the finish, plus trophies.
export function seasonReview(s, tables, h) {
  const n = s.clubs.length;
  let above = 0;
  tables.forEach((t, d) => {
    const b = bands(s, d);
    t.forEach((id, k) => {
      const c = s.clubs[id], target = leagueTarget(s, id), got = b.findIndex(([, lim]) => k + 1 <= lim);
      const missed = (got < 0 ? b.length : got) - target;
      c.conf = clamp(c.conf + (missed <= 0 ? MOVE.met : -MOVE.band * missed) + (h.divs[d].up.includes(id) ? MOVE.up : 0) - (h.divs[d].down.includes(id) ? MOVE.down : 0));
      if (id !== s.me || !s.career) return;
      const was = s.career.rep, standing = 100 * (1 - (above + k) / (n - 1));
      const trophies = [h.divs[d].champion === id, h.divs[d].playoff === id, h.cup?.winner === id].filter(Boolean).length;
      s.career.rep = Math.round(clamp(was + REP.pull * (standing - was) + REP.trophy * trophies));
      post(s, { type: 'review', club: id, target: b[target][0], met: missed <= 0, pos: k + 1, rep: s.career.rep, was });
    });
    above += t.length;
  });
}

// --- the human manager ---

export function post(s, n) {
  s.inbox.push({ ...n, season: s.season, day: s.day, read: false });
  if (s.inbox.length > INBOX_MAX) s.inbox.splice(0, s.inbox.length - INBOX_MAX);
}
const targets = (s, id) => ({ type: 'target', club: id, league: bands(s, s.clubs[id].div)[leagueTarget(s, id)][0], cup: cupTarget(s, id) });

// A new career at club id (the club picker).
export function startCareer(s, id) {
  s.career = { rep: REP_START, asked: null, warned: null, spells: [] };
  hire(s, id);
}
function hire(s, id) {
  takeClub(s, id);
  const c = s.clubs[id];
  c.conf = START; c.games = 0;
  s.career.spells.push({ club: id, from: s.season, to: null, how: null });
  s.career.asked = null; s.career.warned = null;
  s.jobs = s.jobs.filter(j => j.club !== id);
  post(s, targets(s, id));
}
// The human manager leaves the club ('sacked' or 'left'): it gets a new manager after a vacancy.
function leave(s, how) {
  const c = s.clubs[s.me];
  c.conf = START; c.games = 0;
  Object.assign(s.career.spells.at(-1), { to: s.season, how });
  s.jobs.push({ club: c.id, season: s.season, until: s.day + VACANCY_DAYS, offered: false });
  s.me = null; s.live = null; s.youth = []; s.scouts = []; s.offers = []; s.talks = { win: null, by: {} }; s.budget = 0; s.wageBudget = 0;
}
// Whether club id would offer the human manager its job: the manager's reputation reaches its size less REP.gate
// and, while the manager has a club, it is bigger than that club.
const wants = (s, id) => id !== s.me && s.career.rep >= level(s, id) - REP.gate && (s.me === null || level(s, id) > level(s, s.me));
function offer(s, j) {
  if (j.offered || !s.career || !wants(s, j.club) || s.career.spells.some(x => x.club === j.club && x.how === 'sacked' && x.to === s.season)) return;
  j.offered = true;
  s.news.push({ type: 'job', club: j.club, until: j.until });
}

// Sackings, once a day and at the end of the season: a club whose manager has had MIN_GAMES league
// matches and whose confidence is under the line sacks the manager. The human manager's line is lower with
// reputation, and he is warned on the way down. Vacancies close after VACANCY_DAYS.
export function boardDay(s) {
  s.jobs = s.jobs.filter(j => j.season === s.season && j.until >= s.day);
  for (const c of s.clubs) {
    const human = c.id === s.me && !!s.career;
    if (c.id === s.me && !human) continue; // a club taken without a career (tests) is never sacked
    const line = human ? SACK - s.career.rep / REP.patience : SACK;
    if (c.games < MIN_GAMES || c.conf >= line) continue;
    if (human) {
      s.news.push({ type: 'sacked', club: c.id });
      s.career.rep = Math.round(clamp(s.career.rep - REP.sacked));
      leave(s, 'sacked');
      for (const j of s.jobs) offer(s, j);
    } else {
      c.conf = START; c.games = 0;
      const j = { club: c.id, season: s.season, until: s.day + VACANCY_DAYS, offered: false };
      s.jobs.push(j);
      s.news.push({ type: 'vacancy', club: c.id });
      offer(s, j);
    }
  }
  if (s.me !== null && s.career) {
    const conf = s.clubs[s.me].conf, w = WARN.find(x => conf < x && (s.career.warned === null || x < s.career.warned));
    if (w !== undefined) { s.career.warned = w; s.news.push({ type: 'warning', club: s.me, conf: Math.round(conf) }); }
    if (conf >= CALM) s.career.warned = null;
  }
}
// The day's news into the inbox.
export const file = s => { for (const n of s.news) post(s, n); };

// A new season's start for the human manager: the board's targets.
export function seasonStart(s) {
  if (s.me !== null && s.career) post(s, targets(s, s.me));
}

export function acceptJob(s, id) {
  const j = s.jobs.find(x => x.club === id && x.offered);
  if (!j) return 'That job has gone.';
  if (s.live) return 'Finish the match first.';
  if (s.me !== null) leave(s, 'left');
  s.jobs = s.jobs.filter(x => x !== j);
  hire(s, id);
  return null;
}
export function declineJob(s, id) {
  const j = s.jobs.find(x => x.club === id && x.offered);
  if (j) j.offered = false;
  return null;
}
export const openOffer = (s, id) => s.jobs.some(x => x.club === id && x.offered);

// Once a season the manager may ask for more money: more transfer budget or more wage budget. The
// board agrees while its confidence is at least ASK.conf and the club is not in debt; a refusal costs
// ASK.cost confidence. Returns the answer.
export function askBoard(s, kind) {
  if (s.me === null || !s.career) return 'You have no club.';
  if (kind !== 'transfer' && kind !== 'wage') return 'Unknown request.';
  if (s.career.asked === s.season) return 'The board has already heard you this season.';
  s.career.asked = s.season;
  const c = s.clubs[s.me], yes = c.conf >= ASK.conf && c.fin.balance > 0;
  if (yes && kind === 'transfer') s.budget = round(s.budget * ASK.transfer, 1e5);
  if (yes && kind === 'wage') s.wageBudget = round(s.wageBudget * ASK.wage, 1e3);
  if (!yes) c.conf = clamp(c.conf - ASK.cost);
  post(s, { type: 'request', club: c.id, kind, yes });
  return yes ? `The board agrees: more ${kind === 'transfer' ? 'transfer' : 'wage'} budget this season.` : 'The board says no, and is not pleased you asked.';
}
```

- [ ] **Step 4: Change the existing files** — apply this patch (`git apply`), or make the same edits by hand:

```diff
diff --git a/src/season.js b/src/season.js
index 0558b69..4b528c1 100644
--- a/src/season.js
+++ b/src/season.js
@@ -14,6 +14,7 @@ import { MIN_SQUAD, inWindow, windowId, marketDay, returnLoans } from './market.
 import { scoutDays, staffScouts, prune } from './scouting.js';
 import { aiStaff, standardStaff } from './staff.js';
 import { intake, trainYouth, ageYouth } from './youth.js';
+import { afterLeague, afterCup, boardWeeks, boardDay, seasonReview, seasonStart, file } from './career.js';
 
 const RETIRE_AGE = 35;
 const MARKET_KEEP = MARKET_SIZE / 2; // half of last season's free agents stay on the list
@@ -145,7 +146,8 @@ function between(s, rng, from, to) {
 // Each match leaves condition, form, morale, injuries and bans on both squads (src/squad.js); then
 // the days up to the next match day pass. A match day in a transfer window is also a market day
 // (src/market.js). Scouts work every day that passes (src/scouting.js). s.news collects the human
-// club's injuries, bans, transfer news and scout reports.
+// club's injuries, bans, transfer news and scout reports, and the career's news (src/career.js); the inbox keeps them.
+// Boards weigh every league result and cup tie, and look at the table and the books each week.
 // Returns the day's results: matchResult() plus item (the calendar item it belongs to).
 export function playDay(s) {
   if (s.done) return null;
@@ -158,13 +160,16 @@ export function playDay(s) {
     const m = live && live.sides[0].club === f.h && live.sides[1].club === f.a ? live : play(rng, s, f);
     if (f.tie) settle(f, m);
     const r = { ...matchResult(m), item: { ...it } };
-    if (it.comp === 'league') { record(s.clubs[f.h].st, r.hg, r.ag); record(s.clubs[f.a].st, r.ag, r.hg); addMatch(s, it.div, r); }
+    if (it.comp === 'league') { record(s.clubs[f.h].st, r.hg, r.ag); record(s.clubs[f.a].st, r.ag, r.hg); addMatch(s, it.div, r); afterLeague(s, r); }
+    if (it.comp === 'cup' && f.tie.w !== null) afterCup(s, f.tie, it.round);
     if (!f.neutral) payGate(s.clubs[f.h]); // gate receipts, every club
     s.news.push(...afterMatch(s, m, it.comp, rng).filter(n => n.club === s.me));
     s.last.push(r);
   }
   for (const it of today.items) advance(s, rng, it);
-  payWeeks(s, Math.floor(today.day / 7) - Math.floor(s.day / 7)); // weekly instalments, every club
+  const weeks = Math.floor(today.day / 7) - Math.floor(s.day / 7);
+  payWeeks(s, weeks); // weekly instalments, every club
+  boardWeeks(s, weeks); // boards look at the table and the books
   if (played) learnFam(s.fam, s.formation); // the formation you prepared, not mid-match switches
   s.live = null;
   scoutDays(s, today.day - s.day); // scouts work every day up to this one
@@ -174,6 +179,8 @@ export function playDay(s) {
   s.done = s.next === s.days.length;
   s.offers = s.offers.filter(o => o.win === windowId(s)); // offers lapse when the window shuts
   if (!s.done) between(s, rng, today.day, s.days[s.next].day);
+  boardDay(s); // sackings, vacancies, job offers, warnings
+  file(s);
   s.seed = rng.seed; // after the training draws too, so the next day does not reuse them
   return s.last;
 }
@@ -201,6 +208,7 @@ const winnerOf = p => p?.rounds[1]?.ties[0].w ?? null;
 export function endSeason(s) {
   if (!s.done) return;
   const rng = makeRng(s.seed);
+  s.news = [];
   const tables = s.divisions.map((_, d) => table(s, d)), awards = s.divisions.map((_, d) => seasonAwards(s, d));
   const final = s.cup?.rounds[cupRounds(s.clubs.length) - 1]?.ties[0];
   const h = {
@@ -217,6 +225,7 @@ export function endSeason(s) {
     h.divs[d + 1].up = [...below.slice(0, PROMOTED), h.divs[d + 1].playoff ?? below[PROMOTED]]; // no play-offs (old save): 3rd goes up
     h.divs[d].down = tables[d].slice(-RELEGATED);
   }
+  seasonReview(s, tables, h); // boards and the manager's reputation, before the clubs move
   h.divs.forEach((x, d) => { for (const id of x.up) s.clubs[id].div = d - 1; for (const id of x.down) s.clubs[id].div = d + 1; });
   s.divisions.forEach((dv, d) => { dv.clubIds = s.clubs.filter(c => c.div === d).map(c => c.id); });
   returnLoans(s);
@@ -249,4 +258,7 @@ export function endSeason(s) {
   const exists = new Set([...s.clubs.flatMap(c => c.players), ...s.market].map(p => p.id));
   s.shortlist = s.shortlist.filter(id => exists.has(id)); // retired players drop off
   if (s.me !== null) { seasonBudgets(s); staffScouts(s); fixLineup(s); }
+  boardDay(s); // summer sackings
+  seasonStart(s);
+  file(s);
 }
diff --git a/src/world.js b/src/world.js
index 59e1720..987de03 100644
--- a/src/world.js
+++ b/src/world.js
@@ -20,6 +20,9 @@ const STRENGTH_BONUS = 2;
 export const FREE_AGENT_QUALITY = [7, 14]; // each new free agent: random quality in this range
 export const newFreeAgent = (rng, id) => createPlayer(rng, id, rng.pick(POS), rng.int(...FREE_AGENT_QUALITY));
 
+// A board's confidence in a new manager and a new manager's reputation, 0-100 (src/career.js).
+export const BOARD_START = 60, REP_START = 30;
+
 export const blankStats = () => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
 
 // A data row becomes a full player. With imported stats the dataset supplies the profile (the
@@ -46,7 +49,7 @@ export function createWorld(seed, leagues = LEAGUES, stats = STATS, calibration
   const rng = makeRng(seed);
   const s = {
     version: SAVE_VERSION, seed, nid: 1,
-    me: null, formation: '4-4-2', lineup: [], bench: [], tactics: defaultTactics(slots('4-4-2')), fam: newFam(), budget: 0, wageBudget: 0, training: defaultTraining(), news: [], offers: [], talks: { win: null, by: {} }, deals: [], known: {}, scouts: [], shortlist: [], youth: [],
+    me: null, formation: '4-4-2', lineup: [], bench: [], tactics: defaultTactics(slots('4-4-2')), fam: newFam(), budget: 0, wageBudget: 0, training: defaultTraining(), news: [], offers: [], talks: { win: null, by: {} }, deals: [], known: {}, scouts: [], shortlist: [], youth: [], career: null, jobs: [], inbox: [],
     season: 1, day: -1, next: 0, days: [], done: false, cup: null, playoffs: [],
     clubs: [], divisions: [], market: [], history: [], records: [], last: null, live: null,
   };
@@ -59,7 +62,7 @@ export function createWorld(seed, leagues = LEAGUES, stats = STATS, calibration
         id, name: c.name, short: c.short, colours: [...c.colours], kit: { ...c.kit }, div,
         quality: rows.reduce((t, row) => t + row[3], 0) / rows.length,
         players: rows.map(row => playerFromData(rng, s.nid++, row, stats[c.name]?.[row[0]])),
-        st: blankStats(), rec: { win: null, goals: null },
+        st: blankStats(), rec: { win: null, goals: null }, conf: BOARD_START, games: 0,
       });
       return id;
     });
@@ -75,7 +78,7 @@ export function createWorld(seed, leagues = LEAGUES, stats = STATS, calibration
 }
 
 // Cup seeding: top division first, then by squad quality. The weakest clubs play the preliminary round.
-const seeding = clubs => [...clubs].sort((a, b) => a.div - b.div || b.quality - a.quality || a.id - b.id).map(c => c.id);
+export const seeding = clubs => [...clubs].sort((a, b) => a.div - b.div || b.quality - a.quality || a.id - b.id).map(c => c.id);
 
 // A new season's schedule: league fixtures, the calendar, the cup's first round, no play-offs yet.
 export function scheduleSeason(s, rng) {
```

- [ ] **Step 5: Run the tests** — `npm test`. Expected: 217 pass, 0 fail. Run it twice and get the same results; the career test also checks that a season with a career is deterministic.

- [ ] **Step 6: Commit**

```bash
git add src/career.js src/world.js src/season.js tests/career.test.js
git commit -m "feat: boards judge their managers; sackings, vacancies, job offers, reputation and the inbox"
```

---

### Task 3: Save version 11

**Files:**
- Modify: `src/save.js`
- Test: `tests/save.test.js`

- [ ] **Step 1: Write the failing test**

```diff
diff --git a/tests/save.test.js b/tests/save.test.js
index b27c064..ca09341 100644
--- a/tests/save.test.js
+++ b/tests/save.test.js
@@ -1,6 +1,6 @@
 import { test } from 'node:test';
 import assert from 'node:assert/strict';
-import { createWorld } from '../src/world.js';
+import { createWorld, BOARD_START, REP_START } from '../src/world.js';
 import { MINI } from './fixtures/mini.js';
 import { takeClub, kickOff, playDay, endSeason, table } from '../src/season.js';
 // A save as Phase 3 (version 4) wrote it: league rounds instead of a calendar; no cup, play-offs or records.
@@ -44,6 +44,7 @@ test('deserialize returns null for missing, corrupt or wrong-version saves', ()
   assert.equal(deserialize(serialize({ ...createWorld(1, MINI), offers: undefined })), null); // market missing
   assert.equal(deserialize(serialize({ ...createWorld(1, MINI), known: undefined })), null); // scouting missing
   assert.equal(deserialize(serialize({ ...createWorld(1, MINI), youth: undefined })), null); // staff and youth missing
+  assert.equal(deserialize(serialize({ ...createWorld(1, MINI), inbox: undefined })), null); // career missing
   const noContract = createWorld(1, MINI); noContract.clubs[0].players[0].contract = null;
   assert.equal(deserialize(serialize(noContract)), null); // a squad player without a contract
 });
@@ -237,3 +238,26 @@ test('a version 9 save gets standard staff and an empty youth squad, and plays o
   assert.ok(b.clubs.every(c => c.fin.season.staff === 0));
   assert.ok(playDay(b).length);
 });
+
+// A save as Phase 9 (version 10) wrote it: no boards, no career, no vacancies, no inbox.
+function asV10(s) {
+  const o = JSON.parse(serialize(s));
+  o.version = 10;
+  for (const k of ['career', 'jobs', 'inbox']) delete o[k];
+  for (const c of o.clubs) { delete c.conf; delete c.games; }
+  return o;
+}
+
+test('a version 10 save gets boards, a career at its club and an empty inbox, and plays on', () => {
+  const a = createWorld(28, MINI);
+  takeClub(a, 9);
+  playDay(a);
+  const b = deserialize(JSON.stringify(asV10(a)));
+  assert.equal(b.version, SAVE_VERSION);
+  assert.ok(b.clubs.every(c => c.conf === BOARD_START && c.games === c.st.p));
+  assert.deepEqual(b.career, { rep: REP_START, asked: null, warned: null, spells: [{ club: 9, from: a.season, to: null, how: null }] });
+  assert.deepEqual([b.jobs, b.inbox], [[], []]);
+  assert.ok(playDay(b).length);
+  const picker = deserialize(JSON.stringify(asV10(createWorld(28, MINI))));
+  assert.equal(picker.career, null); // no club picked yet: the club picker, not a career
+});
```

- [ ] **Step 2: Run it to verify it fails** — `node --test tests/save.test.js`. Expected: FAIL. Without a migration the version 10 save loads with no boards (`conf` undefined), and a save without `inbox` is still accepted.

- [ ] **Step 3: Change `src/save.js`**

```diff
diff --git a/src/save.js b/src/save.js
index 33a890e..42c1395 100644
--- a/src/save.js
+++ b/src/save.js
@@ -9,8 +9,9 @@ import { startContract } from './contracts.js';
 import { newBooks, seasonBudgets } from './finance.js';
 import { staffScouts } from './scouting.js';
 import { aiStaff, standardStaff } from './staff.js';
+import { BOARD_START, REP_START } from './world.js';
 
-export const SAVE_VERSION = 10; // 2: clubs from real data with short, colours, kit. 3: live match, richer results. 4: tactics. 5: calendar, cup, play-offs, records. 6: squad dynamics, training. 7: contracts, club books, budgets. 8: transfer market, loans. 9: scouting, shortlist. 10: staff levels, youth squad
+export const SAVE_VERSION = 11; // 2: clubs from real data with short, colours, kit. 3: live match, richer results. 4: tactics. 5: calendar, cup, play-offs, records. 6: squad dynamics, training. 7: contracts, club books, budgets. 8: transfer market, loans. 9: scouting, shortlist. 10: staff levels, youth squad. 11: boards, the manager's career, the inbox
 export const KEY = 'touchline.save';
 
 export const serialize = state => JSON.stringify(state);
@@ -25,7 +26,8 @@ const valid = s => s && typeof s === 'object' && s.version === SAVE_VERSION
   && Number.isFinite(s.wageBudget) && s.clubs.every(c => c.fin && Number.isFinite(c.fin.balance) && !!c.fin.season)
   && Array.isArray(s.offers) && !!s.talks && Array.isArray(s.deals) && s.clubs.every(c => Number.isFinite(c.lentPay))
   && !!s.known && typeof s.known === 'object' && Array.isArray(s.scouts) && Array.isArray(s.shortlist)
-  && Array.isArray(s.youth) && s.clubs.every(c => c.staff && Number.isInteger(c.staff.coaching));
+  && Array.isArray(s.youth) && s.clubs.every(c => c.staff && Number.isInteger(c.staff.coaching))
+  && Array.isArray(s.jobs) && Array.isArray(s.inbox) && (s.career === null || Number.isFinite(s.career.rep)) && s.clubs.every(c => Number.isFinite(c.conf) && Number.isInteger(c.games));
 
 // MIGRATIONS[v] upgrades a save from version v to v + 1.
 const MIGRATIONS = {
@@ -65,6 +67,11 @@ const MIGRATIONS = {
     aiStaff(s); if (s.me !== null) s.clubs[s.me].staff = standardStaff(s.clubs[s.me].div);
     s.youth = []; for (const c of s.clubs) c.fin.season.staff = 0;
   },
+  10: s => { // every board starts at BOARD_START with this season's league games counted; a career in progress starts at REP_START; empty inbox
+    for (const c of s.clubs) { c.conf = BOARD_START; c.games = c.st.p; }
+    s.career = s.me === null ? null : { rep: REP_START, asked: null, warned: null, spells: [{ club: s.me, from: s.season, to: null, how: null }] };
+    s.jobs = []; s.inbox = [];
+  },
 };
 
 export function deserialize(text) {
```

- [ ] **Step 4: Run the tests** — `npm test`. Expected: 218 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/save.js tests/save.test.js
git commit -m "feat: save version 11 with boards, the career and the inbox"
```

---

### Task 4: Interface — Board and Inbox tabs, out of work

**Files:**
- Modify: `src/ui/app.js`

- [ ] **Step 1: Apply the change**

```diff
diff --git a/src/ui/app.js b/src/ui/app.js
index 56578c3..604263a 100644
--- a/src/ui/app.js
+++ b/src/ui/app.js
@@ -17,6 +17,7 @@ import { AREAS, COACHING, MEDICAL, SCOUTS, SCOUT_SPEED, setStaff } from '../staf
 import { YOUTH_MAX, LEAVE_AGE, ceilingRange, promote, release } from '../youth.js';
 import { wage, wageBill, projection, staffBill, STAFF_COST, STANDARD } from '../finance.js';
 import { terms, canRenew, renew as renewContract } from '../contracts.js';
+import { SACK, MIN_GAMES, ASK, REP, bands, leagueTarget, cupTarget, level, startCareer, acceptJob, declineJob, openOffer, askBoard } from '../career.js';
 import { crestSvg, kitSvg } from './art.js';
 
 // The UI is the only place allowed to touch Date, localStorage and the DOM.
@@ -56,6 +57,13 @@ const NEWS = {
   clause: n => `💶 ${clubName(n.to)} paid ${esc(n.name)}'s ${money(n.fee)} release clause: he has gone.`,
   loan: n => `🔁 ${esc(n.name)} joins ${clubName(n.to)} on loan.`,
   scout: n => `🔎 Scout report on ${taskText(n.task)}: ${n.n} player${n.n === 1 ? '' : 's'} (see Scouting).`,
+  vacancy: n => `📰 ${clubName(n.club)} have sacked their manager.`,
+  job: n => `📨 ${clubName(n.club)} offer you their job (see Inbox).`,
+  warning: n => `⚠️ The ${clubName(n.club)} board is losing patience (confidence ${n.conf}).`,
+  sacked: n => `❌ ${clubName(n.club)} have sacked you.`,
+  target: n => `🎯 The ${clubName(n.club)} board wants you to ${n.league} and reach the ${CUP_NAME} ${cupRoundName(n.cup, s.clubs.length).toLowerCase()}.`,
+  review: n => `📋 Season review: you finished ${n.pos}; the board wanted you to ${n.target}${n.met ? ' — target met' : ' — target missed'}. Reputation ${n.was} → ${n.rep}.`,
+  request: n => `🏦 You asked the board for more ${n.kind} budget: ${n.yes ? 'agreed' : 'refused'}.`,
 };
 const newsText = () => s.news.map(n => NEWS[n.type](n)).join('<br>');
 
@@ -327,7 +335,7 @@ const views = {
       <p>Balance <b>${money(c.fin.balance)}</b> · transfer budget ${money(s.budget)} · wage bill ${perWeek(wageBill(c))} of ${perWeek(s.wageBudget)}</p>
       <div class="wrap"><table><tr><th>Income this season</th><th></th></tr>${line('Broadcasting', L.broadcast)}${line('Sponsorship', L.sponsor)}${line('Gate receipts', L.gate)}${line('Prize money', L.prize)}${line('Player sales', L.sales)}
       <tr><th>Costs this season</th><th></th></tr>${line('Wages', L.wages)}${line('Transfer fees', L.fees)}${line('Staff beyond the standard', L.staff)}</table></div>
-      <p class="dim">Expected income for a mid-table season: ${money(projection(s, c))}. Each season starts with a transfer budget of half the balance (none in debt) and a wage budget of 70% of the expected income, never below the wage bill + 15%. Renewing a player at the same wage always fits.</p>`;
+      <p class="dim">Expected income for a mid-table season: ${money(projection(s, c))}. The board sets each season's budgets: half the balance for transfers (none in debt); for wages and staff, 70% of the expected income or what you pay now, whichever is more, plus what your savings can carry over two years. In debt there is no extra, so wages are frozen. Renewing a player at the same wage always fits. You may ask the board for more once a season (Board).</p>`;
   },
 };
 
@@ -368,9 +376,49 @@ views.Youth = () => {
     ${rows ? `<div class="wrap"><table><tr><th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Ovr</th><th class="n">Ceiling</th><th></th></tr>${rows}</table></div>` : '<p class="dim">Empty until the summer intake.</p>'}`;
 };
 
+// When a news item happened: 'Season 2, Sat 8 Aug', or 'Season 2, pre-season'.
+const when = n => `Season ${n.season}, ${n.day < 0 ? 'pre-season' : dateLabel(n.day)}`;
+const unread = () => s.inbox.filter(n => !n.read).length;
+const confText = c => `<meter min="0" max="100" low="35" high="60" optimum="100" value="${c.conf}"></meter> ${Math.round(c.conf)}`;
+
+views.Board = () => {
+  const c = myClub(s), b = bands(s, c.div), k = leagueTarget(s, c.id), pos = table(s, c.div).indexOf(c.id) + 1, line = Math.max(0, SACK - s.career.rep / REP.patience);
+  const spell = x => `<tr><td>${clubName(x.club)}</td><td>season ${x.from}${x.to === null ? ' – now' : x.to === x.from ? '' : ` – ${x.to}`}</td><td class="dim">${x.how === 'sacked' ? 'sacked' : x.how === 'left' ? 'left for another job' : ''}</td></tr>`;
+  const asked = s.career.asked === s.season;
+  return `<h2>The board</h2><p>Confidence ${confText(c)} <span class="dim">· below ${Math.round(line)} you are sacked (after ${MIN_GAMES} league games)</span></p>
+    <div class="wrap"><table><tr><th>Target</th><th>Now</th></tr>
+    <tr><td>League: ${esc(b[k][0])} (${b[k][1] === 1 ? '1st' : `top ${b[k][1]}`})</td><td>${pos ? `${pos}${pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'}` : '–'}</td></tr>
+    <tr><td>${CUP_NAME}: reach the ${cupRoundName(cupTarget(s, c.id), s.clubs.length).toLowerCase()}</td><td></td></tr></table></div>
+    <p class="dim">Every league result is weighed against what a squad like yours should get; the board also watches the table each week and does not like debt or a wage bill over budget. Going out of the cup early costs, cup wins from the target round on help. At the end of the season the target is judged, and promotion and relegation count.</p>
+    <h2>Budgets</h2><p>Transfer budget ${money(s.budget)} · wage budget ${perWeek(s.wageBudget)} (wages and staff ${perWeek(wageBill(c) + staffBill(s, c))})</p>
+    <p class="dim">Once a season you may ask for more. The board agrees while its confidence is ${ASK.conf} or more and the club is out of debt; otherwise it says no and thinks less of you for asking.</p>
+    <div class="bar">${asked ? '<span class="dim">You have asked this season.</span>' : `<button data-act="ask" data-field="transfer">Ask for ${Math.round((ASK.transfer - 1) * 100)}% more transfer budget</button> <button data-act="ask" data-field="wage">Ask for ${Math.round((ASK.wage - 1) * 100)}% more wage budget</button>`}</div>
+    <h2>Your reputation: ${s.career.rep}</h2><p class="dim">Your club's size is ${level(s, c.id)} on the same scale. Reputation follows where you finish and the trophies you win, and drops when you are sacked. Clubs up to ${REP.gate} above it may offer you their job when they sack their manager; it buys a little patience from the board and persuades players to join.</p>
+    <h2>Career</h2><div class="wrap"><table>${s.career.spells.map(spell).join('')}</table></div>`;
+};
+
+views.Inbox = () => {
+  const item = n => `<tr class="${n.read ? '' : 'me'}"><td class="dim">${when(n)}</td><td>${NEWS[n.type](n)}${n.type === 'job' && openOffer(s, n.club)
+    ? ` <button class="primary" data-act="acceptJob" data-id="${n.club}">Accept</button> <button data-act="declineJob" data-id="${n.club}">Decline</button> <span class="dim">open until ${dateLabel(n.until)}</span>` : ''}</td></tr>`;
+  const html = `<h2>Inbox</h2>${s.inbox.length ? `<div class="wrap"><table>${[...s.inbox].reverse().map(item).join('')}</table></div>` : '<p class="dim">Nothing yet.</p>'}`;
+  for (const n of s.inbox) n.read = true; // read once shown
+  return html;
+};
+
+// Out of work: the season goes on; job offers arrive in the inbox.
+function outOfWork() {
+  return `<h2>Out of work</h2><p>Reputation ${s.career.rep}. Clubs that sack their manager may offer you the job: watch the inbox.</p>
+    <div class="bar">${s.done ? '<button class="primary" data-act="end">Start next season</button>' : `<button class="primary" data-act="play">Continue</button> <span class="dim">${dateLabel(s.days[s.next].day)}</span>`}</div>`;
+}
+const UNEMPLOYED = ['Inbox', 'Table', 'Cup'];
+const navButton = t => `<button data-act="tab" data-tab="${t}" class="${t === tab ? 'on' : ''}">${t === 'Inbox' && unread() ? `Inbox (${unread()})` : t}</button>`;
+
 const actions = {
-  start(id) { takeClub(s, id); tab = 'Squad'; tableDiv = s.clubs[id].div; },
-  reset() { if (s.me === null || confirm('Abandon this career and start a new game?')) { stopClock(); s = newWorld(); sel = viewing = null; tableDiv = 0; } },
+  start(id) { startCareer(s, id); tab = 'Squad'; tableDiv = s.clubs[id].div; },
+  acceptJob(id) { msg = acceptJob(s, id) || `Welcome to ${clubName(id)}.`; if (s.me === id) { tab = 'Board'; tableDiv = s.clubs[id].div; sel = viewing = null; } },
+  declineJob(id) { declineJob(s, id); msg = 'Offer declined.'; },
+  ask(_, el) { msg = askBoard(s, el.dataset.field); },
+  reset() { if ((s.me === null && !s.career) || confirm('Abandon this career and start a new game?')) { stopClock(); s = newWorld(); sel = viewing = null; tableDiv = 0; } },
   tab(_, el) { tab = el.dataset.tab; sel = viewing = null; },
   div(id) { tableDiv = id; },
   view(id) { viewing = id; },
@@ -400,7 +448,7 @@ const actions = {
     msg = substitute(s.live, mySide(), subOut, id) || 'Substitution made.';
     subOut = null;
   },
-  end() { endSeason(s); tab = 'History'; tableDiv = myClub(s).div; },
+  end() { endSeason(s); tab = s.me === null ? 'Inbox' : 'History'; if (s.me !== null) tableDiv = myClub(s).div; },
   buy(id) { msg = buy(s, id) || 'Signed.'; },
   browse(id) { filters = { club: String(id) }; tab = 'Transfers'; },
   search() {
@@ -431,6 +479,15 @@ const actions = {
 };
 
 function render() {
+  if (s.me === null && s.career) {
+    if (!UNEMPLOYED.includes(tab)) tab = 'Inbox';
+    $('info').textContent = `Out of work · reputation ${s.career.rep} · Season ${s.season}`;
+    const main = `<div class="msg" role="status">${msg}</div>` + outOfWork() + views[tab](); // first: the inbox marks what it shows as read
+    $('nav').innerHTML = UNEMPLOYED.map(navButton).join('') + '<button data-act="reset">New game</button>';
+    $('main').innerHTML = main;
+    msg = '';
+    return;
+  }
   if (s.me === null) {
     $('info').textContent = 'Pick a club to manage';
     $('nav').innerHTML = '';
@@ -439,8 +496,9 @@ function render() {
   }
   $('info').innerHTML = `${badge(s.me, 22)}${clubName(s.me)} · ${esc(s.divisions[myClub(s).div].name)} · Season ${s.season} · ${s.done ? 'season over' : dateLabel(s.days[s.next].day)} · Transfers ${money(s.budget)} · Wages ${perWeek(wageBill(myClub(s)))} of ${perWeek(s.wageBudget)}`;
   if (s.live) tab = 'Match'; // the other screens wait for the final whistle
-  $('nav').innerHTML = (s.live ? ['Match'] : Object.keys(views)).map(t => `<button data-act="tab" data-tab="${t}" class="${t === tab ? 'on' : ''}">${t}</button>`).join('') + '<button data-act="reset">New game</button>';
-  $('main').innerHTML = `<div class="msg" role="status">${msg}</div>` + profile() + views[tab]();
+  const main = `<div class="msg" role="status">${msg}</div>` + profile() + views[tab](); // first: the inbox marks what it shows as read
+  $('nav').innerHTML = (s.live ? ['Match'] : Object.keys(views)).map(navButton).join('') + '<button data-act="reset">New game</button>';
+  $('main').innerHTML = main;
   msg = '';
 }
 
```

What it does:
- **The club picker** now calls `startCareer`.
- **The out-of-work state** (`s.me === null && s.career`):
  - shows only Inbox, Table and Cup;
  - has a **Continue** button, or **Start next season** once the season is over;
  - lists job offers in the Inbox.
- **Rendering:** `render()` builds the main view before the nav, so the Inbox marks items read before the nav counts unread ones.
- **New game:** asks for confirmation whenever a career exists, employed or not.

- [ ] **Step 2: Checks** — `node --input-type=module --check < src/ui/app.js` prints nothing; `npm test` passes.

- [ ] **Step 3: Verify in the browser** — `preview_start` with `{ name: "touchline" }`:
  1. **An old save:** a version 10 save loads with no console errors. **Board** and **Inbox** tabs appear. The career starts at reputation 30 at your club.
  2. **New game** with a Championship club:
     - Inbox shows "Inbox (1)" with the board's targets. Opening it clears the count.
     - **Board** shows:
       - confidence 60 on a meter, and "below 17 you are sacked (after 6 league games)";
       - the league target and the cup round;
       - budgets, the two request buttons, reputation 30, club size, and a one-line career table.
  3. **Ask for more wage budget:** the message says agreed. The buttons are replaced by "You have asked this season", and the header's wage budget has risen 10%.
  4. **Finances:** the budget text describes the board's rules.
  5. **Play a dozen match days with Quick result:**
     - news lines for other clubs' sackings appear and land in the Inbox;
     - confidence moves.
  6. **A sacking:** in the console run
     `const s = JSON.parse(localStorage['touchline.save']); s.clubs[s.me].conf = 0; s.clubs[s.me].games = 6; localStorage['touchline.save'] = JSON.stringify(s); location.reload()`,
     then click **Continue**. Expected:
     - "have sacked you";
     - the header reads "Out of work · reputation 20";
     - the nav shows Inbox, Table, Cup and New game.
  7. **Out of work:** keep pressing **Continue** until a job offer appears in the Inbox with Accept and Decline. **Accept** it: the header shows the new club, the Board tab opens, and the career table lists the sacking.
  8. **Season end:** play to the end of a season. The Inbox has a season review with the reputation change and next season's targets.

- [ ] **Step 4: Commit**

```bash
git add src/ui/app.js
git commit -m "feat: Board and Inbox tabs; out of work, job offers and the budget request"
```

---

### Task 5: Docs

**Files:**
- Modify: `docs/fun-surprises.md`, `docs/superpowers/plans/2026-11-15-touchline-roadmap.md`

- [ ] **Step 1: Fun surprises** — add after row 22:

```markdown
| 23 | **A new job, a new academy.** Every job you take comes with a fresh youth intake at your new club, and the youth squad you leave behind is gone. Hop between jobs and you meet a new batch of youngsters each time. | A move in mid-season brings a second intake that year: open the new club's Youth tab straight away. | `takeClub()` in `src/season.js`, `hire()` in `src/career.js` | Phase 10 |
| 24 | **The rescue job.** Every new manager starts with the board at 60 and cannot be sacked before six league games, however deep the crisis they inherit; that includes the summer check. The revolving door spins for AI clubs too: some sack twice in a season. | Out of work in spring? Take a job with fewer than six league games left: you cannot be sacked before the next season's sixth match. | `hire()`, `boardDay()` in `src/career.js` | Phase 10 |
| 25 | **Ask at the right time.** The board answers a budget request by a fixed rule: yes when its confidence is 60 or more and the club is out of debt. There is no luck in it. | Check the meter on Board after a winning run, then ask. | `askBoard()` in `src/career.js` | Phase 10 |
```

  Record any other quirk found while implementing or reviewing this phase.

- [ ] **Step 2: Roadmap**
  - Row 10: change `to write` to `` `2026-11-16-touchline-phase-10-manager-career.md` (done YYYY-MM-DD) ``.
  - Add below the Phase 9 notes:

```markdown
Phase 10 notes (decided 2026-11-16):
- AI clubs have no manager people: a board's sacking only opens a vacancy (`s.jobs`), so the world's random sequence and every calibration target are unchanged. About 13 AI sackings a season.
- The wage budget is max(current wages and staff, 70% of projected income) + savings over two years, frozen in debt; the Phase 6 floor of wage bill + 15% is gone. The Premier League money piles are left for Phase 12.
- Phase 12's soak should check the sacking rate (10–20 a season) and that a managed career survives 20 seasons.
```

- [ ] **Step 3: Run the tests and commit**

```bash
git add docs/fun-surprises.md docs/superpowers/plans/2026-11-15-touchline-roadmap.md
git commit -m "docs: mark Phase 10 done"
```

- [ ] **Step 4: End-of-phase summary** (in chat): what changed, the browser check, and fun surprises #23–#25.
