# Touchline Phase 6 — Contracts & Finances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Money works like real football:
- player values and wages at real-world scale;
- every player at a club is on a contract (wage, length, sometimes a release clause);
- every club keeps books: broadcast, sponsorship, gate and prize income against wages;
- the human club manages a transfer budget, a wage budget and contract renewals.

**Architecture:**
- **`src/finance.js` (new):** the money formulas (`wage`, `sponsorship`, `gate`, `projection`), each club's books (`c.fin`), weekly instalments (`payWeeks`), gate receipts (`payGate`), end-of-season prizes (`payPrizes`) and the human club's season budgets (`seasonBudgets`). Pure.
- **`src/contracts.js` (new):** starting contracts, a player's terms (`terms`), renewals (`renew`), end-of-season expiry (`expireContracts`) and academy players (`academy`).
- **`src/player.js`:** `value()` moves to real-world scale.
- **`src/transfers.js`:** signing needs the fee within the transfer budget and the wage within the wage budget.
- **`src/season.js`:** books for every club. Every home match pays a gate, every calendar week pays instalments, and the end of season pays prizes, expires contracts and sets the next season's budgets.
- **Saves:** version 7.
- **UI:** new Contracts and Finances screens; the Transfers screen shows wage demands.

**Tech Stack:** Vanilla JavaScript ES modules, HTML/CSS, Node ≥ 22 built-in test runner (`node:test`, `node:assert/strict`). No npm dependencies. Local preview via the `touchline` server in `.claude/launch.json` (port 8127).

## Global Constraints

- Node version: 22 or newer. No packages are installed; `package.json` has no `dependencies` or `devDependencies`.
- Engine code (`src/*.js`, `src/data/**/*.js`) must not reference `document`, `window`, `localStorage`, `Math.random` or `Date`. Randomness comes only from an `rng` built with `makeRng` from a stored seed. `src/ui/commentary.js` follows the same rule.
- State must survive `JSON.parse(JSON.stringify(state))` unchanged: no `Map`, `Set`, class instances, functions or `undefined` values in state.
- Determinism: same seed + same inputs = same career, including a career saved and reloaded in the middle of a live match.
- Every money amount in state is a whole number of euros.
- Match calibration is unchanged (money does not touch the match engine). On a full season of the real leagues (seed 1) the targets are:
  - goals per match 2.5–2.9;
  - home wins 43–47%;
  - yellow cards 2.5–4 per match;
  - red cards at most 0.3 per match;
  - penalties 0.15–0.4 per match;
  - players unavailable 0.5–3 per club.
- **New money targets** (real leagues, seed 1):
  - the best Premier League player is valued at €50–150M and earns €120–350k a week;
  - the median League One player is valued at €0.1–1.5M and earns €1.5–10k a week;
  - over a season, wages divided by income (broadcast + sponsorship + gate) average 0.4–0.8 for Premier League clubs, 0.75–1.3 for the Championship and 0.6–1.2 for League One;
  - the average Premier League club's income is at least 5× the average Championship club's.
- This is a private personal project: real club, player and competition names are used.
- Fun surprises rule: a minor quirk that is fun or interesting for the player is kept, not fixed. Record it in `docs/fun-surprises.md` and mention it in the end-of-phase summary. If a phase rewrites the code a quirk lives in, carry the quirk over or note that it was retired and why.
- Run all tests with `npm test`. Every task ends with all tests passing and a commit. Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Design decisions (made while planning, 2026-11-16)

Choices made by the owner while planning:
- real-world money scale;
- AI clubs keep full books but do not trade yet;
- one-shot contract talks: the player names his terms, and you accept or let him go.

**Player value** (`value(p)` in `src/player.js`):

`max(€10k, round(€450k × e^(0.12 × (overall − 50)) × age factor, to €10k))`

| Overall | Value (age 24–30) |
|---------|-------------------|
| 50 (League One regular) | about €0.45M |
| 66 (Championship starter) | about €3M |
| 76 (Premier League squad player) | about €10M |
| 93 (world class) | about €78M |

The age factor is unchanged (×1.3 under 24, ×0.6 over 30), so fun surprise #2 (youth flipping) keeps its shape.

**Wages** (`wage(p)` in `src/finance.js`, euros a week):

`max(€500, round(€4.5k × e^(0.088 × (overall − 50)) × (0.6 if under 21), to €500))`

| Overall | Weekly wage |
|---------|-------------|
| 50 | €4.5k |
| 66 | about €18k |
| 76 | about €45k |
| 93 | about €200k |

**Contracts.**
- `p.contract = { wage, until, clause }`:
  - `wage` is euros a week;
  - `until` is the last season the contract covers;
  - `clause` is a release clause in euros, or null.
- Free agents have `contract: null`.
- **New world:** every squad player starts at `wage(p)` with `until = 1 + (id % 4)`. That staggers expiries over seasons 1–4 without touching the RNG, so the existing seeded tests keep their numbers.
- **Terms** (`terms(s, p)`, what a player asks of the human club):
  - wage = his going rate × 1.25 if morale < 40, × 0.9 if morale ≥ 80, rounded to €500. It is never below what he earns now.
  - years: age ≤ 23: 5; ≤ 29: 4; ≤ 32: 2; otherwise 1.
  - release clause: 2 × value, rounded to €100k, if his overall is at least 5 above the average of your best 11 players; otherwise none.
- **Renewal:** allowed when a contract ends this season or next. The new contract runs to `season + years`. It is refused if it would push the wage bill over the wage budget.
- **End of season:** contracts with `until` equal to the season just played end.
  - AI clubs renew them at `wage(p)` for `years(age)`.
  - The human club's player leaves for the free-agent list, with no contract.
  - If that leaves your squad below 16, academy players (age 17–19, club quality − 2, 3-season contract) fill the gap.
  - Retiring players are also replaced by academy players with contracts.
- Release clauses are stored and shown but do nothing until Phase 7, when AI clubs can pay them.

**Club books.**
- `c.fin = { balance, season }`, where `season` is this season's ledger `{ broadcast, sponsor, gate, prize, wages, fees, sales }` (all positive amounts).
- Income per season:

  | Source | Amount |
  |--------|--------|
  | Broadcast | €100M Premier League · €12M Championship · €3M League One |
  | Merit prize, per place counted from the bottom | €2.5M · €0.1M · €0.05M |
  | Sponsorship | €0.5M × e^(0.6 × (quality − 8)), rounded to €100k |
  | Gate, per home match (not neutral finals) | €80k × e^(0.45 × (quality − 8)), rounded to €1k |
  | FA Cup prize | €2M winner, €1M runner-up |

  Sponsorship and gate come out at about €0.5M and €80k for a League One club (quality 8), and about €61M and €2.9M for a big Premier League club (quality 16).
- Divisions beyond the third use the last value.
- Broadcast, sponsorship and wages are paid in `SEASON_WEEKS` = 43 weekly instalments (day 0 to the play-off finals, counted like the old weekly income). Each instalment is rounded once, so a week is always the same amount. Wages per instalment: wage bill × 52 / 43.
- **Opening balance:** a quarter of `projection(s, c)` (a season's income at mid-table), rounded to €100k.
- No other costs yet. Staff costs come with Phase 9.
- A club can go into debt. Debt has no consequence yet: Phase 10's board will act on it.

**The human club's budgets** (set by `seasonBudgets` at `takeClub` and at every season start):
- **Transfer budget** `s.budget`: half the balance, rounded to €100k; 0 when in debt. Fees come out of it and sales go back into it.
- **Wage budget** `s.wageBudget` (euros a week): the larger of 1.05 × the current wage bill and 0.7 × projected income / 52, rounded to €1k.

**The free-agent list still charges a fee** equal to his value, as before. A real free signing that could be sold straight on at 80% of value would print money. Phase 7 replaces the list with a real market.

**Saves:**
- Version 7.
- The migration:
  - gives every squad player a starting contract (counted from the current season);
  - gives every club opening books;
  - sets the human club's budgets.
- Prize amounts already in History stay in the old scale.

**Later phases:**
- Phase 7 uses `c.fin.balance` for AI bids, pays release clauses, and replaces the free-agent fee rule.
- Phase 10's board acts on debt and sets budgets itself instead of `seasonBudgets`' fixed shares.

## File map

| File | Change |
|------|--------|
| `src/player.js` | `value()` at real-world scale; `createPlayer` adds `contract: null` |
| `src/finance.js` | **new**: `wage`, `sponsorship`, `gate`, `wageBill`, `projection`, `newBooks`, `blankLedger`, `payWeeks`, `payGate`, `payPrizes`, `seasonBudgets`, constants |
| `src/contracts.js` | **new**: `yearsFor`, `startContract`, `terms`, `canRenew`, `renew`, `expireContracts`, `academy` |
| `src/transfers.js` | `buy`/`sell` use budgets, contracts and the books; no import from `season.js` |
| `src/season.js` | gates, weekly instalments, prizes, contract expiry, academy players, budgets; `tier` and `CUP_PRIZE` removed |
| `src/world.js`, `src/save.js` | contracts and books in a new world; save version 7 |
| `src/ui/app.js` | header, Transfers, profile, History; new Contracts and Finances screens |
| `tests/finance.test.js`, `tests/contracts.test.js` | **new** |
| `tests/season.test.js`, `tests/transfers.test.js`, `tests/save.test.js`, `tests/england.test.js` | updated and extended |
| `docs/fun-surprises.md`, roadmap | #3 updated; phase marked done |

---

### Task 1: Real-world value and the money formulas

**Files:**
- Modify: `src/player.js` (`value`; `createPlayer` return)
- Create: `src/finance.js`
- Test: `tests/finance.test.js`

**Interfaces:**
- Consumes: `overall(p)` from `src/player.js`; `PLAYOFF_DAYS` from `src/calendar.js`.
- Produces (all in `src/finance.js` unless noted):
  - `value(p) → euros` (player.js, rescaled)
  - `createPlayer(...)` now also returns `contract: null` (player.js)
  - `wage(p) → euros a week`
  - `sponsorship(c)`, `gate(c) → euros`
  - `wageBill(c) → euros a week`
  - `projection(s, c) → euros a season`
  - `newBooks(s, c) → { balance, season }`
  - `blankLedger()`
  - `payWeeks(s, weeks)`, `payGate(c)`
  - `payPrizes(s, tables, cup, me) → euros earned by me`
  - `seasonBudgets(s)` (sets `s.budget`, `s.wageBudget`)
  - constants `SEASON_WEEKS`, `BROADCAST`, `MERIT`, `CUP_PRIZE`

- [ ] **Step 1: Write the failing tests** — create `tests/finance.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createPlayer, value } from '../src/player.js';
import { wage, sponsorship, gate, wageBill, blankLedger, newBooks, projection, payWeeks, payGate, payPrizes, seasonBudgets, SEASON_WEEKS, BROADCAST, MERIT, CUP_PRIZE } from '../src/finance.js';

// A midfielder whose overall is exactly `ovr` (a multiple of 5): every attribute is ovr / 5.
const at = (ovr, age = 25) => { const p = createPlayer(makeRng(1), 1, 'MF', 10, age); for (const k in p.attrs) p.attrs[k] = ovr / 5; return p; };
// Three clubs: 0 and 1 in the top division, 2 in the second; each pays two wages.
function books(quality = 12, wages = [10e3, 5e3]) {
  const club = id => ({ id, div: id < 2 ? 0 : 1, quality, players: wages.map(w => ({ contract: { wage: w } })) });
  const s = { me: 0, clubs: [club(0), club(1), club(2)], divisions: [{ clubIds: [0, 1] }, { clubIds: [2] }] };
  for (const c of s.clubs) c.fin = newBooks(s, c);
  return s;
}

test('value: real-world scale, falling with age, never below €10k', () => {
  assert.equal(value(at(50)), 450e3);
  assert.ok(value(at(95)) >= 90e6 && value(at(95)) <= 110e6, `${value(at(95))}`);
  assert.ok(value(at(70)) >= 4e6 && value(at(70)) <= 6e6, `${value(at(70))}`);
  assert.ok(value(at(50, 20)) > value(at(50)) && value(at(50)) > value(at(50, 31)));
  assert.equal(value(at(5)), 10e3);
  for (const o of [30, 55, 80]) assert.equal(value(at(o)) % 10e3, 0);
});

test('wage: real-world scale per week, less for under-21s, in steps of €500', () => {
  assert.equal(wage(at(50)), 4500);
  assert.equal(wage(at(50, 19)), 2500);
  assert.ok(wage(at(95)) >= 200e3 && wage(at(95)) <= 280e3, `${wage(at(95))}`);
  assert.equal(wage(at(5)), 500);
  for (const o of [35, 60, 85]) assert.equal(wage(at(o)) % 500, 0);
  assert.equal(createPlayer(makeRng(1), 1, 'FW', 10).contract, null);
});

test('sponsorship and gate grow with club quality', () => {
  assert.equal(sponsorship({ quality: 8 }), 0.5e6);
  assert.equal(gate({ quality: 8 }), 80e3);
  assert.ok(sponsorship({ quality: 16 }) >= 50e6 && sponsorship({ quality: 16 }) <= 70e6);
  assert.ok(gate({ quality: 16 }) >= 2e6 && gate({ quality: 16 }) <= 4e6);
  assert.equal(sponsorship({ quality: 12.37 }) % 1e5, 0);
});

test('books open at a quarter of a season, and weekly instalments are the same every week', () => {
  const s = books(), c = s.clubs[0];
  assert.equal(wageBill(c), 15e3);
  assert.deepEqual(blankLedger(), { broadcast: 0, sponsor: 0, gate: 0, prize: 0, wages: 0, fees: 0, sales: 0 });
  assert.equal(c.fin.balance, Math.round(0.25 * projection(s, c) / 1e5) * 1e5);
  assert.equal(projection(s, c), BROADCAST[0] + MERIT[0] * 2 / 2 + sponsorship(c) + gate(c) * 1);
  const start = c.fin.balance, per = x => Math.round(x / SEASON_WEEKS);
  payWeeks(s, 0);
  assert.equal(c.fin.balance, start);
  payWeeks(s, 2);
  assert.equal(c.fin.balance, start + 2 * (per(BROADCAST[0]) + per(sponsorship(c)) - per(15e3 * 52)));
  assert.deepEqual(c.fin.season, { ...blankLedger(), broadcast: 2 * per(BROADCAST[0]), sponsor: 2 * per(sponsorship(c)), wages: 2 * per(15e3 * 52) });
  assert.equal(s.clubs[2].fin.season.broadcast, 2 * per(BROADCAST[1]));
  payGate(c);
  assert.equal(c.fin.season.gate, gate(c));
  assert.equal(SEASON_WEEKS, 43);
});

test('prizes: merit by final position for every club, the cup winner and runner-up', () => {
  const s = books(), bal = s.clubs.map(c => c.fin.balance);
  const mine = payPrizes(s, [[1, 0], [2]], { winner: 2, runnerUp: 0 }, 0);
  assert.equal(s.clubs[1].fin.balance - bal[1], 2 * MERIT[0]);
  assert.equal(s.clubs[0].fin.balance - bal[0], MERIT[0] + CUP_PRIZE[1]);
  assert.equal(s.clubs[2].fin.balance - bal[2], MERIT[1] + CUP_PRIZE[0]);
  assert.equal(mine, MERIT[0] + CUP_PRIZE[1]);
  assert.equal(payPrizes(books(), [[0, 1], [2]], null, null), 0);
});

test('season budgets: half the balance to spend on fees (none in debt), wages up to 70% of income', () => {
  const s = books(), c = s.clubs[0];
  c.fin.balance = 10e6; seasonBudgets(s);
  assert.equal(s.budget, 5e6);
  assert.ok(s.wageBudget >= 1.05 * wageBill(c) && s.wageBudget % 1e3 === 0);
  assert.ok(Math.abs(s.wageBudget - 0.7 * projection(s, c) / 52) <= 500);
  c.fin.balance = -1e6; seasonBudgets(s);
  assert.equal(s.budget, 0);
  const rich = books(12, [5e6]); seasonBudgets(rich);
  assert.equal(rich.wageBudget, Math.round(1.05 * 5e6 / 1e3) * 1e3);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/finance.test.js`
Expected: FAIL with `Cannot find module '.../src/finance.js'`.

- [ ] **Step 3: Rescale `value` in `src/player.js`** — replace `value` with:

```js
// Transfer value in euros at real-world scale: about €0.45M at overall 50 (a League One regular),
// €10M at 76, €78M at 93; ×1.3 under 24, ×0.6 over 30. Rounded to €10k, never below €10k.
const VALUE = { at50: 0.45e6, growth: 0.12 };
export function value(p) {
  const ageFactor = p.age < 24 ? 1.3 : p.age > 30 ? 0.6 : 1;
  return Math.max(10e3, Math.round(VALUE.at50 * Math.exp(VALUE.growth * (overall(p) - 50)) * ageFactor / 1e4) * 1e4);
}
```

and change the last line of `createPlayer` to:

```js
  return { id, name: rng.pick(FIRST) + ' ' + rng.pick(LAST), pos, age, attrs, pot, ...freshState(), contract: null };
```

- [ ] **Step 4: Create `src/finance.js`**

```js
import { overall } from './player.js';
import { PLAYOFF_DAYS } from './calendar.js';

// Club money in euros at real-world scale. Every club keeps books: c.fin = { balance, season }, where
// season is this season's ledger (blankLedger: all positive amounts). Income: broadcast money by
// division, merit prize money by final position, sponsorship and gate receipts by club size (its
// quality), cup prize money. Costs: wages (staff costs arrive in Phase 9). Broadcast, sponsorship and
// wages are paid in SEASON_WEEKS equal weekly instalments. A club may go into debt (Phase 10's board acts on it).
export const SEASON_WEEKS = Math.floor(PLAYOFF_DAYS[2] / 7) + 1; // weekly payments from day 0 to the play-off finals
export const BROADCAST = [100e6, 12e6, 3e6];  // per season, by division (top first); lower divisions use the last
export const MERIT = [2.5e6, 0.1e6, 0.05e6];  // per place counted from the bottom: the last club gets 1×, the champion n×
export const CUP_PRIZE = [2e6, 1e6];          // winner, runner-up
const SPONSOR = { at8: 0.5e6, growth: 0.6 }, GATE = { at8: 80e3, growth: 0.45 }; // quality 8 ≈ a League One club
const WAGE = { at50: 4.5e3, growth: 0.088 };  // a week: overall 50 ≈ a League One regular, 93 ≈ €200k
const START_SHARE = 0.25, TRANSFER_SHARE = 0.5, WAGE_SHARE = 0.7, WAGE_HEADROOM = 1.05;

const byDiv = (list, d) => list[Math.min(d, list.length - 1)];
const round = (x, step) => Math.round(x / step) * step;

export const blankLedger = () => ({ broadcast: 0, sponsor: 0, gate: 0, prize: 0, wages: 0, fees: 0, sales: 0 });

// What a player earns a week at his level; under-21s less. Contracts start from it.
export const wage = p => Math.max(500, round(WAGE.at50 * Math.exp(WAGE.growth * (overall(p) - 50)) * (p.age < 21 ? 0.6 : 1), 500));
export const sponsorship = c => round(SPONSOR.at8 * Math.exp(SPONSOR.growth * (c.quality - 8)), 1e5);
export const gate = c => round(GATE.at8 * Math.exp(GATE.growth * (c.quality - 8)), 1e3);
export const wageBill = c => c.players.reduce((t, p) => t + (p.contract?.wage ?? 0), 0);

// A season's income for club c finishing mid-table: broadcast, half the merit pot, sponsorship, a gate per home league match.
export function projection(s, c) {
  const n = s.divisions[c.div].clubIds.length;
  return byDiv(BROADCAST, c.div) + byDiv(MERIT, c.div) * n / 2 + sponsorship(c) + gate(c) * (n - 1);
}
export const newBooks = (s, c) => ({ balance: round(START_SHARE * projection(s, c), 1e5), season: blankLedger() });

// Positive amount = income, negative = cost; the ledger records its size.
function book(c, key, amount) { c.fin.balance += amount; c.fin.season[key] += Math.abs(amount); }

// `weeks` weekly instalments for every club: broadcast and sponsorship in, wages out.
export function payWeeks(s, weeks) {
  if (weeks <= 0) return;
  for (const c of s.clubs) {
    book(c, 'broadcast', weeks * Math.round(byDiv(BROADCAST, c.div) / SEASON_WEEKS));
    book(c, 'sponsor', weeks * Math.round(sponsorship(c) / SEASON_WEEKS));
    book(c, 'wages', -weeks * Math.round(wageBill(c) * 52 / SEASON_WEEKS));
  }
}
export const payGate = c => book(c, 'gate', gate(c));

// End of season: merit prize money for every club by final position (tables[d] = division d's final
// table), cup prize money (cup = { winner, runnerUp } or null). Returns what club `me` earned.
export function payPrizes(s, tables, cup, me) {
  let mine = 0;
  const pay = (id, x) => { book(s.clubs[id], 'prize', x); if (id === me) mine += x; };
  tables.forEach((t, d) => t.forEach((id, k) => pay(id, byDiv(MERIT, d) * (t.length - k))));
  if (cup) { pay(cup.winner, CUP_PRIZE[0]); pay(cup.runnerUp, CUP_PRIZE[1]); }
  return mine;
}

// The human club's limits for a season, from its books: a transfer budget of half its balance (none
// in debt) and a weekly wage budget of 70% of its projected income, never below its wage bill + 5%.
// ponytail: fixed shares; Phase 10's board sets budgets.
export function seasonBudgets(s) {
  const c = s.clubs[s.me];
  s.budget = Math.max(0, round(TRANSFER_SHARE * c.fin.balance, 1e5));
  s.wageBudget = round(Math.max(WAGE_HEADROOM * wageBill(c), WAGE_SHARE * projection(s, c) / 52), 1e3);
}
```

- [ ] **Step 5: Run the new tests, then everything**

Run: `node --test tests/finance.test.js` — Expected: PASS (6 tests).
Run: `npm test` — Expected: all pass. The transfer tests compare budgets with `value()` itself, so the new scale doesn't break them.

- [ ] **Step 6: Commit**

```bash
git add src/player.js src/finance.js tests/finance.test.js
git commit -m "feat: real-world player values, wages and club money formulas"
```

---

### Task 2: Contracts (`src/contracts.js`)

**Files:**
- Create: `src/contracts.js`
- Modify: `src/world.js` (contracts and books in `createWorld`; `wageBudget` in state)
- Test: `tests/contracts.test.js`

**Interfaces:**
- Consumes:
  - from Task 1: `wage`, `wageBill`, `newBooks` from `src/finance.js`;
  - `createPlayer`, `overall`, `value` from `src/player.js`.
- Produces:
  - `yearsFor(age)`
  - `startContract(p, season) → { wage, until, clause: null }`
  - `terms(s, p) → { wage, years, clause }`
  - `canRenew(s, p) → boolean`
  - `renew(s, id) → error | null`
  - `expireContracts(s, rng, minSquad) → names[]`
  - `academy(s, rng, club, pos) → player with contract`
  - `createWorld` gives every squad player a contract, every club `fin`, and the state `wageBudget: 0`.

- [ ] **Step 1: Write the failing tests** — create `tests/contracts.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { overall, value } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { wage, wageBill } from '../src/finance.js';
import { yearsFor, startContract, terms, canRenew, renew, expireContracts, academy } from '../src/contracts.js';
import { MINI } from './fixtures/mini.js';

// A mini world managed from club 6 with a wage budget that never gets in the way.
const fresh = seed => { const s = createWorld(seed, MINI); s.me = 6; s.wageBudget = 1e12; return s; };

test('a new world: every squad player on his going rate, contracts ending over the next four seasons; free agents have none', () => {
  const s = createWorld(1, MINI);
  for (const c of s.clubs) {
    assert.ok(c.fin && Number.isInteger(c.fin.balance) && c.fin.balance > 0);
    for (const p of c.players) assert.deepEqual(p.contract, { wage: wage(p), until: 1 + p.id % 4, clause: null });
  }
  assert.ok(s.market.every(p => p.contract === null));
  assert.equal(s.wageBudget, 0);
  assert.deepEqual(startContract({ id: 7, age: 25, attrs: s.clubs[0].players[0].attrs, pos: 'MF' }, 3).until, 6);
});

test('terms: the going rate moved by morale, never a pay cut, years by age, a release clause for stars', () => {
  const s = fresh(1), club = s.clubs[6], p = club.players.find(x => wage(x) >= 5e3);
  p.contract.wage = 0;
  p.morale = 50; assert.equal(terms(s, p).wage, wage(p));
  p.morale = 20; assert.ok(terms(s, p).wage > wage(p));
  p.morale = 90; assert.ok(terms(s, p).wage < wage(p));
  p.contract.wage = 1e6; assert.equal(terms(s, p).wage, 1e6);
  assert.deepEqual([18, 23, 24, 29, 30, 32, 33].map(yearsFor), [5, 5, 4, 4, 2, 2, 1]);
  assert.equal(terms(s, p).years, yearsFor(p.age));
  const star = club.players[0];
  for (const k in star.attrs) star.attrs[k] = 20;
  assert.ok(terms(s, star).clause >= value(star) && terms(s, star).clause % 1e5 === 0);
  const weakest = club.players.reduce((b, x) => overall(x) < overall(b) ? x : b);
  assert.equal(terms(s, weakest).clause, null);
  assert.equal(terms(s, s.market[0]).wage >= 500, true); // a free agent has no contract yet
});

test('renew: only in the last two seasons of a contract and within the wage budget; the new deal starts next season', () => {
  const s = fresh(2), club = s.clubs[6];
  const long = club.players.find(p => p.contract.until >= s.season + 2), soon = club.players.find(p => p.contract.until === s.season);
  assert.ok(!canRenew(s, long) && canRenew(s, soon));
  assert.ok(renew(s, long.id));
  s.wageBudget = wageBill(club) - 1;
  assert.equal(renew(s, soon.id), 'Over the wage budget.');
  s.wageBudget = 1e12;
  const t = terms(s, soon);
  assert.equal(renew(s, soon.id), null);
  assert.deepEqual(soon.contract, { wage: t.wage, until: s.season + t.years, clause: t.clause });
  assert.ok(renew(s, s.clubs[0].players[0].id)); // not your player
});

test('expiry: AI clubs renew; your players whose contracts end leave, and academy players fill the squad to the minimum', () => {
  const s = fresh(3), club = s.clubs[6], rng = makeRng(1);
  const leaving = club.players.filter(p => p.contract.until === s.season);
  const kept = club.players.length - leaving.length;
  const aiEnding = s.clubs[0].players.filter(p => p.contract.until === s.season);
  const left = expireContracts(s, rng, 16);
  assert.deepEqual(left, leaving.map(p => p.name));
  assert.ok(leaving.length > 0 && leaving.every(p => p.contract === null && s.market.includes(p) && !club.players.includes(p)));
  assert.equal(club.players.length, Math.max(16, kept));
  assert.ok(club.players.every(p => p.contract && p.contract.until > s.season));
  assert.ok(aiEnding.length > 0 && aiEnding.every(p => s.clubs[0].players.includes(p) && p.contract.until === s.season + yearsFor(p.age) && p.contract.wage === wage(p)));
  const kid = academy(s, makeRng(2), club, 'GK');
  assert.ok(kid.age >= 17 && kid.age <= 19 && kid.pos === 'GK');
  assert.deepEqual(kid.contract, { wage: wage(kid), until: s.season + 3, clause: null });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/contracts.test.js`
Expected: FAIL with `Cannot find module '.../src/contracts.js'`.

- [ ] **Step 3: Create `src/contracts.js`**

```js
import { createPlayer, overall, value } from './player.js';
import { wage, wageBill } from './finance.js';

// Contracts. p.contract = { wage (euros a week), until (the last season it covers), clause (release
// clause in euros, or null) }; free agents have none. A contract ends after season `until`.
// Talks are one-shot: your player names his terms, and you accept them or let him go when his
// contract ends. AI clubs renew every contract that ends at the player's going rate.
// Release clauses are stored and shown; clubs can pay them from Phase 7.
const CLAUSE = { above: 5, times: 2 }; // 5+ overall above your best XI's average: a clause of twice his value
const ACADEMY_YEARS = 3;

export const yearsFor = age => age <= 23 ? 5 : age <= 29 ? 4 : age <= 32 ? 2 : 1;
// A new world's contracts: the going rate, ending 0-3 seasons after `season`, staggered by id (no RNG).
export const startContract = (p, season) => ({ wage: wage(p), until: season + p.id % 4, clause: null });

const roundWage = x => Math.round(x / 500) * 500;
const xiAverage = club => { const o = club.players.map(p => overall(p)).sort((a, b) => b - a).slice(0, 11); return o.reduce((t, x) => t + x, 0) / o.length; };

// What player p asks to sign for, or to stay at, the human club: his going rate (×1.25 when unhappy,
// ×0.9 when happy, never less than he earns now), years by age, and a release clause if he would be a star there.
export function terms(s, p) {
  const ask = roundWage(wage(p) * (p.morale < 40 ? 1.25 : p.morale >= 80 ? 0.9 : 1));
  const star = overall(p) >= xiAverage(s.clubs[s.me]) + CLAUSE.above;
  return { wage: Math.max(p.contract?.wage ?? 0, ask), years: yearsFor(p.age), clause: star ? Math.round(CLAUSE.times * value(p) / 1e5) * 1e5 : null };
}

export const canRenew = (s, p) => !!p.contract && p.contract.until <= s.season + 1;

// Accepts the terms of the human club's player `id`: a new contract from next season. Error message or null.
export function renew(s, id) {
  const club = s.clubs[s.me], p = club.players.find(x => x.id === id);
  if (!p) return 'Not your player.';
  if (!canRenew(s, p)) return 'He has more than a season left on his contract.';
  const t = terms(s, p);
  if (wageBill(club) - p.contract.wage + t.wage > s.wageBudget) return 'Over the wage budget.';
  p.contract = { wage: t.wage, until: s.season + t.years, clause: t.clause };
  return null;
}

// A 17-19-year-old from club c's academy, on a starter contract.
export function academy(s, rng, c, pos) {
  const p = createPlayer(rng, s.nid++, pos, c.quality - 2, rng.int(17, 19));
  p.contract = { wage: wage(p), until: s.season + ACADEMY_YEARS, clause: null };
  return p;
}

// End of season s.season (before the season number moves on): contracts ending now. AI clubs renew
// them; the human club's players leave for the free-agent list. If that leaves the squad below
// minSquad, academy players in the leavers' positions fill the gap. Returns the leavers' names.
export function expireContracts(s, rng, minSquad) {
  const left = [];
  for (const c of s.clubs) for (const p of [...c.players]) {
    if (!p.contract || p.contract.until > s.season) continue;
    if (c.id !== s.me) { p.contract = { wage: wage(p), until: s.season + yearsFor(p.age), clause: null }; continue; }
    c.players.splice(c.players.indexOf(p), 1);
    p.contract = null;
    s.market.push(p);
    left.push(p);
  }
  if (s.me !== null) for (const p of left) if (s.clubs[s.me].players.length < minSquad) s.clubs[s.me].players.push(academy(s, rng, s.clubs[s.me], p.pos));
  return left.map(p => p.name);
}
```

- [ ] **Step 4: Change `src/world.js`**
  - Add `import { newBooks } from './finance.js';` and `import { startContract } from './contracts.js';`.
  - In the `createWorld` state literal, add `wageBudget: 0,` right after `budget: 0,`.
  - After the `leagues.forEach(...)` block (before the free-agent loop), add:

```js
  for (const c of s.clubs) { for (const p of c.players) p.contract = startContract(p, s.season); c.fin = newBooks(s, c); }
```

- [ ] **Step 5: Run the new tests, then everything**

Run: `node --test tests/contracts.test.js` — Expected: PASS (4 tests).
Run: `npm test` — Expected: all pass. Nothing in the season reads contracts or books yet. One possible failure: `tests/save.test.js` round-trip tests must still pass, which needs the new fields to be JSON-safe; they are.

- [ ] **Step 6: Commit**

```bash
git add src/contracts.js src/world.js tests/contracts.test.js
git commit -m "feat: player contracts with terms, renewals, expiry and academy players"
```

---

### Task 3: The books in the career; signings with wages

**Files:**
- Modify: `src/transfers.js` (whole file)
- Modify: `src/season.js` (imports, `tier` and `CUP_PRIZE` removed, `takeClub`, gate and weekly lines in `playDay`, `endSeason`)
- Test: `tests/season.test.js`, `tests/transfers.test.js`

**Interfaces:**
- Consumes:
  - from Task 1: `payWeeks`, `payGate`, `payPrizes`, `seasonBudgets`, `blankLedger`, `wageBill`;
  - from Task 2: `terms`, `expireContracts`, `academy`.
- Produces:
  - `buy`/`sell` keep their signatures;
  - history entries gain `fin` (the human club's ledger plus `balance`, or null) and `left` (names);
  - `s.budget` is now the transfer budget and `s.wageBudget` the weekly wage budget.

- [ ] **Step 1: Write the failing tests**

In `tests/season.test.js`, add to the imports `import { SEASON_WEEKS, BROADCAST, MERIT, CUP_PRIZE, sponsorship, gate, wageBill } from '../src/finance.js';` and `import { MIN_SQUAD } from '../src/transfers.js';`.

(a) In 'a full season: every club plays everyone home and away, stats are consistent':
- replace `const budget0 = s.budget, seed0 = s.seed;` with `const bal0 = myClub(s).fin.balance, seed0 = s.seed;`;
- replace the two `assert.ok(s.budget ...)` lines with:

```js
  assert.notEqual(myClub(s).fin.balance, bal0);
```

(b) In 'endSeason rolls over; three seasons keep squads intact', replace the `assert.ok(s.clubs.every(c => c.players.length === 18 && ...` line with:

```js
    assert.ok(s.clubs.every(c => (c.players.length === 18 || (c.id === s.me && c.players.length >= MIN_SQUAD)) && c.st.p === 0 && c.players.every(p => p.age <= 35 && p.contract && p.contract.until >= s.season)));
```

(c) Replace the whole test 'prize money uses the size of the human club\'s division' with:

```js
test('prize money: every club by final position, the cup winner and runner-up; the season goes into History', () => {
  const s = world(12);
  takeClub(s, 0);
  while (!s.done) playDay(s);
  const tables = s.divisions.map((_, d) => table(s, d)), bal = s.clubs.map(c => c.fin.balance), final = s.cup.rounds.at(-1).ties[0];
  const want = id => {
    const d = tables.findIndex(t => t.includes(id)), t = tables[d];
    return MERIT[d] * (t.length - t.indexOf(id)) + (id === final.w ? CUP_PRIZE[0] : id === final.h || id === final.a ? CUP_PRIZE[1] : 0);
  };
  const season = { ...myClub(s).fin.season };
  endSeason(s);
  s.clubs.forEach((c, id) => assert.equal(c.fin.balance - bal[id], want(id), c.name));
  assert.equal(s.history[0].prize, want(0));
  assert.deepEqual(s.history[0].fin, { ...season, prize: want(0), balance: s.clubs[0].fin.balance });
  assert.ok(s.clubs.every(c => c.fin.season.wages === 0 && c.fin.season.prize === 0)); // a new ledger
  assert.ok(Array.isArray(s.history[0].left));
});
```

(d) Replace the whole test 'weekly income: one payment per week of the season, whatever the number of matches' with:

```js
test('weekly books: every club gets broadcast and sponsorship money and pays wages once a week; gates for home matches', () => {
  const s = world(19);
  takeClub(s, 0);
  const c = s.clubs[0], start = c.fin.balance, per = x => Math.round(x / SEASON_WEEKS);
  let gates = 0;
  while (!s.done) for (const r of playDay(s)) if (r.h === 0 && !(r.item.comp === 'cup' && r.item.round === cupRounds(s.clubs.length) - 1)) gates++;
  assert.equal(Math.floor(s.days.at(-1).day / 7) + 1, SEASON_WEEKS);
  const w = SEASON_WEEKS;
  assert.deepEqual(c.fin.season, { broadcast: w * per(BROADCAST[0]), sponsor: w * per(sponsorship(c)), gate: gates * gate(c), prize: 0, wages: w * per(wageBill(c) * 52), fees: 0, sales: 0 });
  assert.equal(c.fin.balance - start, c.fin.season.broadcast + c.fin.season.sponsor + c.fin.season.gate - c.fin.season.wages);
  assert.ok(s.clubs.every(x => x.fin.season.broadcast > 0 && x.fin.season.wages > 0)); // AI clubs keep books too
});

test('budgets: set when you take a club and again each season from the books', () => {
  const s = world(20);
  takeClub(s, 6);
  assert.equal(s.budget, Math.max(0, Math.round(myClub(s).fin.balance / 2 / 1e5) * 1e5));
  assert.ok(s.wageBudget >= wageBill(myClub(s)));
  while (!s.done) playDay(s);
  endSeason(s);
  assert.equal(s.budget, Math.max(0, Math.round(myClub(s).fin.balance / 2 / 1e5) * 1e5));
});
```

In `tests/transfers.test.js`:
- change `fresh` to give the club an unlimited wage budget:

```js
const fresh = () => { const s = createWorld(11, MINI); takeClub(s, 12); s.wageBudget = 1e12; return s; };
```

- add `import { terms } from '../src/contracts.js';` and `import { wageBill } from '../src/finance.js';`, then append:

```js
test('signing: the fee from the transfer budget and the books, his terms as the contract, refused over the wage budget', () => {
  const s = fresh(), p = [...s.market].sort((a, b) => value(a) - value(b))[0], club = myClub(s);
  const t = terms(s, p), bal = club.fin.balance;
  s.budget = value(p);
  s.wageBudget = wageBill(club) + t.wage - 1;
  assert.equal(buy(s, p.id), 'Over the wage budget.');
  s.wageBudget = 1e12;
  assert.equal(buy(s, p.id), null);
  assert.deepEqual(p.contract, { wage: t.wage, until: s.season + t.years - 1, clause: t.clause });
  assert.equal(club.fin.balance, bal - value(p));
  assert.equal(club.fin.season.fees, value(p));
  assert.equal(s.budget, 0);
});

test('selling: the price into the transfer budget and the books; the player leaves without a contract', () => {
  const s = fresh(), club = myClub(s), p = club.players.find(x => x.id === s.lineup[0]), bal = club.fin.balance;
  assert.equal(sell(s, p.id), null);
  assert.equal(club.fin.balance, bal + Math.round(value(p) * SELL_RATE));
  assert.equal(club.fin.season.sales, Math.round(value(p) * SELL_RATE));
  assert.equal(p.contract, null);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/season.test.js tests/transfers.test.js`
Expected: the changed and new tests FAIL (`fin.season` stays blank; `buy` ignores the wage budget; `history[0].fin` is undefined).

- [ ] **Step 3: Replace `src/transfers.js`**

```js
import { value } from './player.js';
import { fixLineup } from './lineup.js';
import { wageBill } from './finance.js';
import { terms } from './contracts.js';

export const MIN_SQUAD = 16, MAX_SQUAD = 32, SELL_RATE = 0.8;

// Only the human club trades until Phase 7. A free agent costs his value as a fee and joins on his
// terms. ponytail: a free signing that could be sold straight on at 80% would print money; Phase 7's
// market replaces the fee rule.
export function buy(s, id) {
  const i = s.market.findIndex(p => p.id === id), club = s.clubs[s.me];
  if (i < 0) return 'Player not available.';
  if (club.players.length >= MAX_SQUAD) return `Squad is full (${MAX_SQUAD}).`;
  const p = s.market[i], cost = value(p), t = terms(s, p);
  if (cost > s.budget) return 'Not enough transfer budget.';
  if (wageBill(club) + t.wage > s.wageBudget) return 'Over the wage budget.';
  s.budget -= cost; club.fin.balance -= cost; club.fin.season.fees += cost;
  p.contract = { wage: t.wage, until: s.season + t.years - 1, clause: t.clause };
  club.players.push(...s.market.splice(i, 1));
  return null;
}

export function sell(s, id) {
  const club = s.clubs[s.me], i = club.players.findIndex(p => p.id === id);
  if (i < 0) return 'Not your player.';
  if (club.players.length <= MIN_SQUAD) return `You need at least ${MIN_SQUAD} players.`;
  const [p] = club.players.splice(i, 1), price = Math.round(value(p) * SELL_RATE);
  s.budget += price; club.fin.balance += price; club.fin.season.sales += price;
  p.contract = null;
  s.market.push(p);
  fixLineup(s);
  return null;
}
```

- [ ] **Step 4: Change `src/season.js`**

1. Imports. Add these three lines:

   ```js
   import { payWeeks, payGate, payPrizes, seasonBudgets, blankLedger } from './finance.js';
   import { expireContracts, academy } from './contracts.js';
   import { MIN_SQUAD } from './transfers.js';
   ```

2. Delete `const CUP_PRIZE = 500e3;` and the `const tier = ...` line with its comment.

3. `takeClub`: delete the line `s.budget = tier(s.clubs[clubId]) * 1.5e6;`, and add `seasonBudgets(s);` as its last line.

4. `playDay`: replace the gate line with:

   ```js
       if (!f.neutral) payGate(s.clubs[f.h]); // gate receipts, every club
   ```

   and the weekly-income line with:

   ```js
     payWeeks(s, Math.floor(today.day / 7) - Math.floor(s.day / 7)); // weekly instalments, every club
   ```

5. `endSeason`:
   - Update the comment's first line to `// Closes the season: prize money, awards, records, promotion and relegation, contracts, the history entry;`.
   - Replace the `if (s.me !== null) { ... }` block (`h.div`, `h.pos`, the prize and `s.budget += h.prize`) with:

     ```js
       if (s.me !== null) { h.div = myClub(s).div; h.pos = tables[h.div].indexOf(s.me) + 1; }
       h.prize = payPrizes(s, tables, h.cup, s.me);
       h.fin = s.me === null ? null : { ...myClub(s).fin.season, balance: myClub(s).fin.balance };
     ```

   - Directly before `s.history.push(h);`, add:

     ```js
       h.left = expireContracts(s, rng, MIN_SQUAD);
     ```

   - In the player loop, replace the retiree line with:

     ```js
           if (p.age >= RETIRE_AGE) return academy(s, rng, c, p.pos); // youth replaces retiree
     ```

   - After `s.season++;` (before the final `if (s.me !== null) fixLineup(s);`), add:

     ```js
       for (const c of s.clubs) c.fin.season = blankLedger();
       if (s.me !== null) seasonBudgets(s);
     ```

Check that nothing in `src/` still references `tier(` or `CUP_PRIZE` from season.js: run `grep -n "tier(\|CUP_PRIZE" src/season.js`; it should print nothing.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all pass.

The retiree replacement draws from the RNG exactly as before (`createPlayer(rng, s.nid++, p.pos, c.quality - 2, rng.int(17, 19))`), so the seeded tests are unaffected by that change. Your expired players' academy replacements draw extra numbers, which only matters for careers with a human club.

If 'endSeason rolls over' fails on squad size, print `s.clubs.map(c => [c.id, c.players.length])`: only club `s.me` may differ from 18.

- [ ] **Step 6: Commit**

```bash
git add src/transfers.js src/season.js tests/season.test.js tests/transfers.test.js
git commit -m "feat: every club keeps books; budgets, prize money, contract expiry and signings with wages"
```

---

### Task 4: Save version 7

**Files:**
- Modify: `src/save.js`
- Test: `tests/save.test.js`

**Interfaces:**
- Consumes: `startContract` (Task 2), `newBooks`, `seasonBudgets` (Task 1).
- Produces: `SAVE_VERSION = 7`, and migration 6 → 7.

- [ ] **Step 1: Write the failing test** — append to `tests/save.test.js`:

```js
// A save as Phase 5 (version 6) wrote it: no contracts, no books, no wage budget.
function asV6(s) {
  const o = JSON.parse(serialize(s));
  o.version = 6;
  delete o.wageBudget;
  for (const c of o.clubs) { delete c.fin; for (const p of c.players) delete p.contract; }
  for (const p of o.market) delete p.contract;
  return o;
}

test('a version 6 save gets contracts, books and budgets, and plays on', () => {
  const a = createWorld(24, MINI);
  takeClub(a, 3);
  playDay(a);
  const b = deserialize(JSON.stringify(asV6(a)));
  assert.equal(b.version, SAVE_VERSION);
  for (const c of b.clubs) {
    assert.ok(Number.isInteger(c.fin.balance) && c.fin.season.wages === 0);
    for (const p of c.players) assert.ok(p.contract.wage > 0 && p.contract.until >= b.season && p.contract.until <= b.season + 3);
  }
  assert.ok(b.market.every(p => p.contract === null));
  assert.ok(b.wageBudget > 0 && b.budget >= 0);
  assert.ok(playDay(b).length);
});
```

In the existing test 'deserialize returns null for missing, corrupt or wrong-version saves', add:

```js
  assert.equal(deserialize(serialize({ ...createWorld(1, MINI), wageBudget: undefined })), null); // books missing
```

(`serialize` drops the `undefined` key, so the save lacks `wageBudget`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/save.test.js`
Expected: the new test FAILS (the save is version 6, so `deserialize` returns null or has no contracts).

- [ ] **Step 3: Change `src/save.js`**

```js
import { startContract } from './contracts.js';
import { newBooks, seasonBudgets } from './finance.js';
```

```js
export const SAVE_VERSION = 7; // 2: clubs from real data with short, colours, kit. 3: live match, richer results. 4: tactics. 5: calendar, cup, play-offs, records. 6: squad dynamics, training. 7: contracts, club books, budgets
```

Add to the end of `valid`'s expression:

```js
  && Number.isFinite(s.wageBudget) && s.clubs.every(c => c.fin && Number.isFinite(c.fin.balance) && !!c.fin.season);
```

Add to `MIGRATIONS`:

```js
  6: s => { // contracts from this season, opening books, budgets (money in History stays in the old scale)
    for (const c of s.clubs) { for (const p of c.players) p.contract = startContract(p, s.season); c.fin = newBooks(s, c); }
    for (const p of s.market) p.contract = null;
    s.wageBudget = 0;
    if (s.me !== null) seasonBudgets(s);
  },
```

- [ ] **Step 4: Run the tests**

Run: `npm test` — Expected: all pass, including the v2 → v7 and v4 → v7 migration chains.

- [ ] **Step 5: Commit**

```bash
git add src/save.js tests/save.test.js
git commit -m "feat: save version 7 with contracts, club books and budgets"
```

---

### Task 5: Money calibration on the real leagues

**Files:**
- Modify: `tests/england.test.js` (two new tests)
- Modify, only if a target is missed: the constants in `src/finance.js` and `VALUE` in `src/player.js`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: the money calibration tests.

- [ ] **Step 1: Add the tests** — in `tests/england.test.js`, add `value` to the existing import from `'../src/player.js'` (the file already imports `overall` from there). Append:

```js
const median = list => [...list].sort((a, b) => a - b)[list.length >> 1];

test('real-world money: stars cost tens of millions, League One regulars a few hundred thousand', () => {
  const s = createWorld(1), squad = d => s.divisions[d].clubIds.flatMap(id => s.clubs[id].players);
  const best = squad(0).reduce((b, p) => overall(p) > overall(b) ? p : b), l1 = squad(2);
  const v = { best: value(best), bestWage: best.contract.wage, l1: median(l1.map(value)), l1Wage: median(l1.map(p => p.contract.wage)) };
  assert.ok(v.best >= 50e6 && v.best <= 150e6, JSON.stringify(v));
  assert.ok(v.bestWage >= 120e3 && v.bestWage <= 350e3, JSON.stringify(v));
  assert.ok(v.l1 >= 0.1e6 && v.l1 <= 1.5e6, JSON.stringify(v));
  assert.ok(v.l1Wage >= 1.5e3 && v.l1Wage <= 10e3, JSON.stringify(v));
});

test('a season of real club books: the Premier League is rich, the EFL spends most of its income on wages', () => {
  const s = createWorld(1);
  while (!s.done) playDay(s);
  const div = d => {
    const L = s.divisions[d].clubIds.map(id => s.clubs[id].fin.season);
    const income = L.reduce((t, x) => t + x.broadcast + x.sponsor + x.gate, 0);
    return { income: income / L.length, ratio: L.reduce((t, x) => t + x.wages, 0) / income };
  };
  const [pl, ch, l1] = [0, 1, 2].map(div), info = JSON.stringify({ pl, ch, l1 });
  assert.ok(pl.ratio >= 0.4 && pl.ratio <= 0.8, info);
  assert.ok(ch.ratio >= 0.75 && ch.ratio <= 1.3, info);
  assert.ok(l1.ratio >= 0.6 && l1.ratio <= 1.2, info);
  assert.ok(pl.income >= 5 * ch.income, info);
});
```

- [ ] **Step 2: Run them and record the numbers**

Run: `node --test tests/england.test.js` (Bash timeout up to 600000 ms).
Temporarily `console.log(v)` and `console.log({ pl, ch, l1 })` to record the actual values for the summary, then remove the lines.

- [ ] **Step 3: Tune only what is out of range, one knob at a time, re-running after each**

| Missed target | Knob | Step |
|---------------|------|------|
| best value | `VALUE.growth` in `src/player.js` | ±0.005 |
| League One median value | `VALUE.at50` | ±0.05e6 |
| best wage | `WAGE.growth` in `src/finance.js` | ±0.004 |
| League One median wage | `WAGE.at50` | ±0.5e3 |
| Premier League wage ratio | `BROADCAST[0]` | ±10e6 (higher broadcast → lower ratio) |
| Championship wage ratio | `BROADCAST[1]` | ±2e6 |
| League One wage ratio | `BROADCAST[2]` | ±0.5e6 |
| PL income ≥ 5 × Championship | `BROADCAST[0]`, then `SPONSOR.growth` | as above |

If you change a value or wage constant, re-run `tests/finance.test.js` too. Its exact-value assertions (`value(at(50)) === 450e3`, `wage(at(50)) === 4500`, `sponsorship({ quality: 8 }) === 0.5e6`, `gate({ quality: 8 }) === 80e3`) must be updated to the new constants, the only test edit allowed, and the commit message must say so. Each changed constant keeps its comment, plus `(tuned in Phase 6)`. The plan's Design decisions table must be updated to match.

- [ ] **Step 4: Run everything**

Run: `npm test` — Expected: all pass. Run it twice to confirm the same results (determinism).

- [ ] **Step 5: Commit**

```bash
git add tests/england.test.js src/finance.js src/player.js tests/finance.test.js docs/superpowers/plans/2026-11-16-touchline-phase-6-contracts-finances.md
git commit -m "test: money calibration on the real leagues"
```

(Only add files you changed.)

---

### Task 6: Interface — Contracts, Finances, wage demands

**Files:**
- Modify: `src/ui/app.js`

**Interfaces:**
- Consumes: `wageBill`, `projection` from `src/finance.js`; `terms`, `canRenew`, `renew` from `src/contracts.js`; `s.budget`, `s.wageBudget`, `c.fin`, `p.contract`, `h.fin`, `h.left`.
- Produces: Contracts and Finances tabs; the header, Transfers, profile and History changes.

- [ ] **Step 1: Imports**

```js
import { wageBill, projection } from '../finance.js';
import { terms, canRenew, renew as renewContract } from '../contracts.js';
```

- [ ] **Step 2: Helpers** — below the `money` line:

```js
const perWeek = n => `€${n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.round(n / 1e3) + 'k'}/wk`;
const termsText = t => `${perWeek(t.wage)} for ${t.years} season${t.years > 1 ? 's' : ''}${t.clause ? ` · release clause ${money(t.clause)}` : ''}`;
const untilText = p => !p.contract ? '–' : p.contract.until === s.season ? '<span class="oop">ends this season</span>' : `season ${p.contract.until}`;
```

- [ ] **Step 3: Header** — in `render()`, replace `· Budget ${money(s.budget)}` with:

```js
· Transfers ${money(s.budget)} · Wages ${perWeek(wageBill(myClub(s)))} of ${perWeek(s.wageBudget)}
```

- [ ] **Step 4: Profile** — in `profile()`, insert this right before the closing `</p>` of the line that starts with `<p>Condition ${p.cond}%`:

```js
${p.contract ? ` · contract ${perWeek(p.contract.wage)} until season ${p.contract.until}${p.contract.clause ? `, release clause ${money(p.contract.clause)}` : ''}` : ''}
```

- [ ] **Step 5: Transfers** — replace `views.Transfers` with:

```js
  Transfers() {
    const list = (players, act, text, asks) => `<div class="wrap"><table><tr>${HEAD}<th>${asks ? 'Asks' : ''}</th><th></th></tr>${byPos(players).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td class="dim">${asks ? termsText(terms(s, p)) : ''}</td><td><button data-act="${act}" data-id="${p.id}">${text}</button></td></tr>`).join('')}</table></div>`;
    return `<p class="dim">Transfer budget ${money(s.budget)} · wage bill ${perWeek(wageBill(myClub(s)))} of ${perWeek(s.wageBudget)}. A free agent costs his value as a fee, and his wage must fit the wage budget.</p>
      <h2>Free agents</h2>${list(s.market, 'buy', 'Sign', true)}
      <h2>Your squad (${myClub(s).players.length}/${MAX_SQUAD}) <span class="dim">— sells for 80% of value</span></h2>${list(myClub(s).players, 'sell', 'Sell', false)}`;
  },
```

- [ ] **Step 6: Contracts and Finances** — add to `views`, directly after `Transfers() {...},`:

```js
  Contracts() {
    const club = myClub(s);
    const row = p => {
      const t = canRenew(s, p) ? terms(s, p) : null;
      return `<tr>${nameBtn(p, 'view')}<td>${p.pos}</td><td class="n">${p.age}</td><td class="n">${overall(p)}</td><td class="n">${perWeek(p.contract.wage)}</td><td>${untilText(p)}</td>
        <td class="n">${p.contract.clause ? money(p.contract.clause) : ''}</td><td>${t ? `<span class="dim">asks ${termsText(t)}</span> <button data-act="renew" data-id="${p.id}">Accept</button>` : ''}</td></tr>`;
    };
    return `<h2>Contracts</h2><p>Wage bill ${perWeek(wageBill(club))} of a wage budget of ${perWeek(s.wageBudget)}.</p>
      <p class="dim">A player whose contract ends this season or next names his terms for a new one: accept them, or he leaves when his contract ends. If too many leave, academy players fill the squad.</p>
      <div class="wrap"><table><tr><th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Ovr</th><th class="n">Wage</th><th>Until</th><th class="n">Clause</th><th>New contract</th></tr>${byPos(club.players).map(row).join('')}</table></div>`;
  },
  Finances() {
    const c = myClub(s), L = c.fin.season, line = (name, v) => `<tr><td>${name}</td><td class="n">${money(v)}</td></tr>`;
    return `<h2>Finances · season ${s.season}</h2>
      <p>Balance <b>${money(c.fin.balance)}</b> · transfer budget ${money(s.budget)} · wage bill ${perWeek(wageBill(c))} of ${perWeek(s.wageBudget)}</p>
      <div class="wrap"><table><tr><th>Income this season</th><th></th></tr>${line('Broadcasting', L.broadcast)}${line('Sponsorship', L.sponsor)}${line('Gate receipts', L.gate)}${line('Prize money', L.prize)}${line('Player sales', L.sales)}
      <tr><th>Costs this season</th><th></th></tr>${line('Wages', L.wages)}${line('Transfer fees', L.fees)}</table></div>
      <p class="dim">Expected income for a mid-table season: ${money(projection(s, c))}. Each season starts with a transfer budget of half the balance (none in debt) and a wage budget of 70% of the expected income.</p>`;
  },
```

- [ ] **Step 7: History** — in `views.History`, in the `seasons` template, directly after `${h.pos ? `<p>You finished ...</p>` : ''}`, add:

```js
      ${h.fin ? `<div class="dim">Books: income ${money(h.fin.broadcast + h.fin.sponsor + h.fin.gate + h.fin.prize + h.fin.sales)}, wages ${money(h.fin.wages)}, fees ${money(h.fin.fees)} · balance ${money(h.fin.balance)}</div>` : ''}
      ${h.left?.length ? `<div class="dim">Left when their contracts ended: ${h.left.map(esc).join(', ')}</div>` : ''}
```

- [ ] **Step 8: Action** — in `actions`, add:

```js
  renew(id) { msg = renewContract(s, id) || 'Contract agreed.'; },
```

- [ ] **Step 9: Run the tests and a syntax check**

Run: `npm test` — Expected: all pass.
Run: `node --input-type=module --check < src/ui/app.js` — Expected: no output.

- [ ] **Step 10: Verify in the browser** — `preview_start` with `{ name: "touchline" }`:
  1. The existing save (version 6) loads; the header shows Transfers €…M · Wages €…k/wk of €…k/wk; no console errors.
  2. **Contracts**: every player has a wage and an Until. Players ending this season show orange "ends this season", their terms, and an Accept button. Click Accept: the message says "Contract agreed." and Until moves on.
  3. **Finances**: the balance and ledger lines. Play a few days (Match → Continue) and come back: broadcasting, sponsorship and wages grow, and gate receipts grow after a home match.
  4. **Transfers**: free agents show "Asks …" and a Sign button. Sign one you can afford: the transfer budget drops by his value, and the wage bill rises by his wage.
  5. Start a **New game** with a League One club and check the numbers look like that division (wages in thousands a week, transfer budget under €2M).
  6. Play to the end of season 1 and start season 2. History shows "Books: …" and "Left when their contracts ended: …" for players you didn't renew.

- [ ] **Step 11: Commit**

```bash
git add src/ui/app.js
git commit -m "feat: contracts and finances screens, wage demands on transfers"
```

---

### Task 7: Docs

**Files:**
- Modify: `docs/fun-surprises.md`
- Modify: `docs/superpowers/plans/2026-11-15-touchline-roadmap.md`

- [ ] **Step 1: Fun surprises**
  - In row 3 (**Second chances**), add at the end of the Surprise cell: ` Since Phase 6, your players whose contracts end go onto the list too.`
  - Record any quirk found while implementing or reviewing this phase as a new row, following the rule at the top of the file.
  - Row 2 (youth flipping) needs no change: the age factor of `value()` is unchanged.

- [ ] **Step 2: Roadmap**
  - In row 6, change `to write` to `` `2026-11-16-touchline-phase-6-contracts-finances.md` (done YYYY-MM-DD) `` with the actual completion date.
  - Add below the Phase 9 note:

```markdown
Phase 6 notes (decided 2026-11-16):
- Phase 7 uses each club's `fin.balance` for bids, pays release clauses (`p.contract.clause`), and replaces the rule that a free agent costs his value as a fee.
- Phase 10's board acts on debt and sets the season budgets that `seasonBudgets()` in `src/finance.js` now sets with fixed shares.
```

- [ ] **Step 3: Run the tests and commit**

Run: `npm test` — Expected: all pass.

```bash
git add docs/fun-surprises.md docs/superpowers/plans/2026-11-15-touchline-roadmap.md
git commit -m "docs: mark Phase 6 done"
```

- [ ] **Step 4: End-of-phase summary** (in chat, not a file):
  - what changed;
  - the money calibration numbers from Task 5;
  - the browser check;
  - any fun surprises added or updated.
