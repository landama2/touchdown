# Touchline Phase 7 — Transfer Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real transfer market:
- two windows a season (summer and January);
- every club values its players with an asking price;
- you bid, the selling club accepts, counters or rejects (three rounds), and players can refuse to drop down;
- AI clubs fill gaps, buy upgrades, sell when in debt and bid for your players, and a release clause can't be refused;
- season-long loans in both directions;
- free agents sign for a signing-on fee instead of a full transfer fee.

**Architecture:**
- **`src/market.js` (new):** windows, `asking`, `refusal`, the one place a player changes club (`move`), loans (`lend`, `returnLoans`) and the AI's match-day market (`marketDay`). Pure.
- **`src/transfers.js` (rewritten):** the human club's actions: `buy` (free agents), `bid` / `acceptCounter`, `loanIn`, `sell` (quick sale), `setListing`, and `acceptOffer` / `rejectOffer` / `counterOffer`. Each returns an error message or null, as before.
- **`src/finance.js`:** `wageBill` splits a loaned player's wage between lender and borrower; EFL broadcast money is raised.
- **`src/season.js`:** a market day after each match day in a window; offers lapse when a window shuts; loans come home and your deals go into History at the end of the season.
- **Saves:** version 8.
- **UI:** the Transfers screen is rebuilt (offers, browse a club, bid, loan, transfer list, listings, quick sale, free agents, biggest deals); news and History show deals.

**Tech Stack:** Vanilla JavaScript ES modules, HTML/CSS, Node ≥ 22 built-in test runner (`node:test`, `node:assert/strict`). No npm dependencies. Local preview via the `touchline` server in `.claude/launch.json` (port 8127).

**Prototype:** every code block in this plan was run on a copy of the repository at commit `29cddfc` (2026-11-16). With all tasks applied, `npm test` passed 183 tests twice with the same results, and a headless-browser run of the Transfers screen (bid, counter, loan, listing, offer, accept) logged no errors. The numbers quoted below come from that run.

## Global Constraints

- Node version: 22 or newer. No packages are installed; `package.json` has no `dependencies` or `devDependencies`.
- Engine code (`src/*.js`, `src/data/**/*.js`) must not reference `document`, `window`, `localStorage`, `Math.random` or `Date`. Randomness comes only from an `rng` built with `makeRng` from a stored seed. `src/ui/commentary.js` follows the same rule.
- State must survive `JSON.parse(JSON.stringify(state))` unchanged: no `Map`, `Set`, class instances, functions or `undefined` values in state. Optional player fields (`listed`, `loan`, `joined`) are deleted, never set to `undefined`.
- Determinism: same seed + same inputs = same career. The market draws from the match day's `rng` in `playDay`, so it is part of the seeded sequence.
- Every money amount in state is a whole number of euros. Fees are rounded to €10k.
- Match calibration is unchanged (real leagues, seed 1): goals per match 2.5–2.9; home wins 43–47%; yellow cards 2.5–4 per match; red cards at most 0.3; penalties 0.15–0.4; players unavailable 0.5–3 per club.
- Phase 6 money targets still hold (real leagues, seed 1): best Premier League player valued €50–150M on €150–450k a week; median League One player €0.1–1.5M on €1.5–10k a week; wages ÷ income 0.4–0.8 (Premier League), 0.75–1.3 (Championship), 0.6–1.2 (League One). **Changed:** the average Premier League club's income is at least **4×** (was 5×) the average Championship club's (see Design decisions, Money re-tune).
- **New market targets** (real leagues, seed 1, one season, no human club):
  - club-to-club transfers: 50–200, and at least 10 bought by clubs of each division;
  - the biggest fee: €20–150M;
  - loans: 3–40;
  - EFL clubs in debt at the end of the season: at most 3 of 48;
  - every squad stays within 16–32 players.
- This is a private personal project: real club, player and competition names are used.
- Fun surprises rule: a minor quirk that is fun or interesting for the player is kept, not fixed. Record it in `docs/fun-surprises.md` and mention it in the end-of-phase summary. If a phase rewrites the code a quirk lives in, carry the quirk over or note that it was retired and why.
- Run all tests with `npm test`. Every task ends with all tests passing and a commit. Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Design decisions (made while planning, 2026-11-16)

Choices made by the owner while planning:
- **Bids:** you bid a fee; the club accepts, rejects or counters; you can pay the counter or bid again; three rounds per player per window.
- **Selling:** players can be put on a transfer list for AI clubs to bid on, **and** an instant quick sale stays, at a lower price.
- **Loans:** simple season-long loans in both directions, no recalls.
- **Timing:** replies to your bids come instantly. AI bids for your players arrive on match days, as news.

**Windows** (day 0 = Saturday 8 August):

| Window | Open | Id (`windowId`) |
|--------|------|-----------------|
| Summer | from the last match day of a season (`s.done`) to day 23 (31 August) of the next | `2 × season` of the season it opens into |
| January | days 146–176 (1–31 January) | `2 × season + 1` |

- Your club-to-club deals, loans and quick sales need an open window (`windowOpen(s)`, judged on `s.day`, the last day played). Free agents sign at any time.
- AI clubs trade on each match day inside a window (`inWindow(day)`): about 5 days in summer and 5–8 in January.
- A player who changed club cannot move again in the same window (`p.joined` holds the window id). This stops ping-pong deals and instant flips.

**Regulars.** A club's regulars at a position are its best players there for a 4-4-2: 1 GK, 4 DF, 4 MF, 2 FW. `bar(c, pos)` is the overall of the last regular (0 when the club has too few), and `regular(c, p)` is `overall(p) ≥ bar`. Unlike `bestXI`, it ignores fitness, so it doesn't jump around with injuries.

**Asking price** (`asking(s, c, p)`): `value(p)` × each factor that applies, rounded to €10k:

| Factor | × |
|--------|---|
| contract ends this season (after the last match day: next season) | 0.6 |
| contract ends the season after | 0.85 |
| a regular | 1.3 |
| listed for sale | 0.85 |
| the club is in debt | 0.85 |

**Your bids** (`bid(s, id, fee)`):
- **Accepted at once** when the fee reaches his release clause, `FLOOR` (90%) of the asking price, or the club's last counter. He then signs his terms (`terms`, as in Phase 6) and must fit the wage budget.
- **Countered** when the fee is at least `WALKAWAY` (70%) of the asking price: the club counters halfway between your bid and its asking price, never below 90%.
- **Rejected** below 70%.
- Three rounds per player per window (`ROUNDS`). Then talks stop, but a bid at or above the floor or the counter still goes through.
- A club with 16 players or fewer won't sell.

**Refusal** (`refusal(from, to, p)`, for every move between clubs, AI included):
- Free agents, unhappy players (morale under 40) and listed players go anywhere except two divisions down.
- Nobody drops two divisions.
- A regular under 31 won't drop one division, and won't join a club in his own division whose quality is 3 or more below his club's.

**Free agents:** a signing-on fee (`SIGNING_FEE`) of half his value, from the transfer budget, plus his terms. This replaces Phase 6's full-value fee.

**Quick sale** (`sell`): `QUICK_SALE` = half his value, at once. The buyer is the richest AI club within one division of yours that can pay it from half its balance, has room in its squad, and that he would join. A sold player goes to that club, not the free-agent list. With the signing fee also at half value, a free agent can't be flipped at a profit.

**Transfer list** (`setListing(s, id, 'sale' | 'loan' | null)`):
- **For sale:** on each window match day a listed player draws a bid with chance 0.5 (unlisted: 0.03, at most two unsolicited a day).
- **The bidder** is the richest AI club he would be a regular at, that can afford at least 75% of his asking price, has the wage room, and that he would join.
- **Bid size:** listed players 75–95% of asking, unlisted 90–110%. The bidder's hidden most (`max`) is the smaller of 115% of asking and its spending room.
- **One offer per player:** a new offer replaces the old one only if it is higher.
- **Your answers:** accept, reject, or ask for more. Asking for up to `max` sells at once; above it, the bidder walks away. Offers lapse when the window shuts.
- **Release clause:** a bidder of higher quality than your club that can afford the clause pays it with chance 0.25, and the player leaves at once (news).
- **For loan:** players aged 23 or under whose contract runs past the loan. The first AI club that would play him takes him at once (news).

**Loans:**
- `p.loan = { from, until, share }`: the borrower pays `share` (`LOAN_SHARE` = 0.5) of his wage and the lender pays the rest (`c.lentPay`).
- `wageBill` counts both, so books and budgets need no other change.
- A player is `loanable` from an AI club when he is 23 or under, not a regular, not already on loan or just moved, and his contract runs past the loan.
- You can have at most 4 players on loan (`MAX_LOANS`).
- Loans end when the season ends (`loanEnd`; a loan agreed after the last match day covers next season). At `endSeason`, `returnLoans` runs before contracts expire.
- A player on loan cannot be sold, listed, bid for or renewed until he is back.

**AI clubs** (`marketDay`, each match day in a window, clubs in id order):
1. Clubs in debt list their two best-paid players (`listed: 'sale'`); the listing is recomputed every market day.
2. **Gap:** a club below `MIN_POS` (GK 2, DF 5, MF 5, FW 3) at a position, or below 16 players, signs the best free agent there on no more than its median wage (paying his signing fee even into debt), else the best loan.
3. **Upgrade:** otherwise, with chance `AI.activity` = 0.15, at its weakest position (lowest `bar`):
   - it buys the best player with an overall of at least `bar` + 3, at another AI club or on the free-agent list;
   - the fee (asking price, or a free agent's signing fee) must fit `room` (half its balance; nothing in debt), and the new wage bill must fit 100% of a season's projected income (`AI.wageShare`);
   - the player must be willing; the seller must have more than 16 players;
   - failing that, it borrows a loanable player of that standard;
   - a squad over 32 then releases its least valuable player to the free-agent list.
4. AI clubs never buy the human club's players directly. They go through offers.
5. Then the human club's players draw offers (above).

**Money re-tune** (the roadmap's Phase 6 note: AI bids must not run on EFL debt):
- `BROADCAST` becomes €93M · **€12M** · **€4M** (was €7.5M and €2.5M).
- With the market on the old money, one season (seed 1) ends with 6 EFL clubs in debt (the worst at −€19M); with the new money, 1.
- Wages ÷ income: Championship 0.98, League One 0.89 (Phase 6 targets still met).
- The Premier League ÷ Championship income ratio falls to 4.2×, so that Phase 6 target moves from 5× to 4×. Real football is nearer 8×, but Phase 6's Premier League wage-ratio target limits Premier League income. Phase 12's balance pass can revisit both together.

**Prototype numbers** (real leagues, seed 1, one season):
- 70 club-to-club transfers (by buyer's division 23 / 19 / 28), 9 loans;
- biggest fee €37.8M;
- 1 EFL club in debt;
- squads 20–32;
- save about 1.1 MB.
- Over three seasons the biggest fees reach about €130M: Premier League clubs still bank about €60M a season each, with a median balance of about €250M by season 3. Phase 10's board and Phase 12's soak should rein that in. Recorded as a roadmap note, not fixed here.

**State:**
- `s.offers` = `[{ id, club, fee, max, win }]`;
- `s.talks` = `{ win, by: { [playerId]: { rounds, counter } } }` (reset lazily when the window id changes);
- `s.deals` = this season's moves, `[{ season, day, id, name, from, to, fee, loan }]` (`from` / `to` null = free-agent list), emptied at `endSeason`;
- `c.lentPay` per club;
- optional `p.listed`, `p.loan`, `p.joined`;
- History entries gain `deals`: the season's moves to or from your club.

**Saves:** version 8. The migration adds empty `offers`, `talks` and `deals`, and `lentPay: 0` for every club.

**Later phases:**
- Phase 8 replaces the "browse one club at a time" screen with player search, filters, scouting ranges and shortlists. Asking prices stay as they are.
- Phase 10's board sets budgets and acts on debt; it should also curb Premier League cash hoarding (above).

## File map

| File | Change |
|------|--------|
| `src/market.js` | **new**: windows, `bar`, `regular`, `asking`, `signingFee`, `refusal`, `move`, `loanable`, `lend`, `returnLoans`, `marketDay`, constants |
| `src/finance.js` | `lentPart`; `wageBill` with loans; `BROADCAST` re-tuned (Task 5) |
| `src/contracts.js` | no renewal for a player on loan |
| `src/world.js` | `offers`, `talks`, `deals`, `c.lentPay` in a new world |
| `src/transfers.js` | **rewritten**: `buy`, `bid`, `acceptCounter`, `talksOn`, `loanIn`, `sell`, `setListing`, `acceptOffer`, `rejectOffer`, `counterOffer`; `MIN_SQUAD`/`MAX_SQUAD` re-exported from `market.js` |
| `src/season.js` | market days, offers lapse, loans return, `h.deals` |
| `src/save.js` | version 8 |
| `src/ui/app.js` | Transfers screen rebuilt; news, History, profile, Contracts |
| `tests/market.test.js` | **new** |
| `tests/transfers.test.js` | **rewritten** |
| `tests/season.test.js`, `tests/save.test.js`, `tests/england.test.js` | updated and extended |
| `docs/fun-surprises.md`, roadmap | #2, #3, #16 updated, two new rows, #16 moved into the table; phase marked done; notes |

---

### Task 1: The market core (`src/market.js`)

**Files:**
- Create: `src/market.js`
- Modify: `src/finance.js` (`lentPart`, `wageBill`)
- Modify: `src/contracts.js` (`canRenew`, `renew`)
- Modify: `src/world.js` (new state fields)
- Test: `tests/market.test.js`

**Interfaces:**
- Consumes:
  - `overall`, `value`, `POS` from `src/player.js`;
  - `wage`, `wageBill`, `projection` from `src/finance.js`;
  - `terms`, `yearsFor` from `src/contracts.js`;
  - `fixLineup` from `src/lineup.js`.
- Produces (`src/market.js`):
  - constants `MIN_SQUAD`, `MAX_SQUAD`, `SUMMER_END`, `JANUARY`, `FLOOR`, `WALKAWAY`, `ROUNDS`, `SIGNING_FEE`, `QUICK_SALE`, `LOAN_AGE`, `LOAN_SHARE`, `MAX_LOANS`;
  - `round10k`, `eur`, `inWindow`, `windowOpen`, `windowId`, `justJoined`, `loanEnd`, `loanPay`;
  - `bar`, `regular`, `asking`, `signingFee`, `refusal`;
  - `move`, `loanable`, `lend`, `returnLoans`, `marketDay`.
- Also produces `lentPart(p)` and the loan-aware `wageBill(c)` in `src/finance.js`.

- [ ] **Step 1: Write the failing tests** — create `tests/market.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { overall, value } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { wage, wageBill } from '../src/finance.js';
import { yearsFor } from '../src/contracts.js';
import { takeClub, playDay, endSeason } from '../src/season.js';
import { MINI } from './fixtures/mini.js';
import { MIN_SQUAD, MAX_SQUAD, SUMMER_END, JANUARY, LOAN_SHARE, inWindow, windowOpen, windowId, justJoined, loanEnd, bar, regular,
  asking, signingFee, refusal, move, lend, loanable, returnLoans, marketDay } from '../src/market.js';

const world = seed => createWorld(seed, MINI);
const sumBalances = s => s.clubs.reduce((t, c) => t + c.fin.balance, 0);
const byOverall = c => [...c.players].sort((a, b) => overall(b) - overall(a));

test('windows: summer to 1 September and all of January; the summer window opens when the season ends', () => {
  assert.deepEqual([-1, 0, SUMMER_END - 1, SUMMER_END, 100, JANUARY[0], JANUARY[1], JANUARY[1] + 1].map(inWindow), [true, true, true, false, false, true, true, false]);
  const s = world(1);
  assert.ok(windowOpen(s));
  assert.equal(windowId(s), 2);
  s.day = 100; assert.ok(!windowOpen(s)); assert.equal(windowId(s), null);
  s.day = 150; assert.equal(windowId(s), 3);
  s.done = true; assert.ok(windowOpen(s)); assert.equal(windowId(s), 4); // next season's summer
  assert.equal(loanEnd(s), 2);
});

test('regulars and asking prices: value, less in the last two seasons, more for a regular, less when listed or in debt', () => {
  const s = world(2), c = s.clubs[0], [star] = byOverall(c), fringe = byOverall(c).filter(p => p.pos === star.pos).at(-1);
  assert.equal(bar(c, 'GK'), overall(byOverall(c).find(p => p.pos === 'GK')));
  assert.ok(regular(c, star) && !regular(c, fringe));
  star.contract.until = s.season + 2;
  const full = asking(s, c, star);
  assert.equal(full, Math.round(value(star) * 1.3 / 1e4) * 1e4);
  star.contract.until = s.season + 1; assert.equal(asking(s, c, star), Math.round(value(star) * 1.3 * 0.85 / 1e4) * 1e4);
  star.contract.until = s.season; assert.equal(asking(s, c, star), Math.round(value(star) * 1.3 * 0.6 / 1e4) * 1e4);
  star.contract.until = s.season + 2; star.listed = 'sale'; c.fin.balance = -1;
  assert.equal(asking(s, c, star), Math.round(value(star) * 1.3 * 0.85 * 0.85 / 1e4) * 1e4);
  fringe.contract.until = s.season + 3;
  assert.equal(asking(s, c, fringe), Math.round(value(fringe) * 0.85 / 1e4) * 1e4);
  assert.equal(signingFee(fringe), Math.round(value(fringe) / 2 / 1e4) * 1e4);
});

test('refusal: nobody drops two divisions; regulars under 31 won\'t drop one or join a much weaker club; unhappy, listed and older players will', () => {
  const s = world(3), top = s.clubs[0], mid = s.clubs[4], low = s.clubs[14], [star] = byOverall(top);
  const fringe = byOverall(top).filter(p => p.pos === star.pos).at(-1);
  star.age = 25; star.morale = 50; fringe.morale = 50;
  assert.equal(refusal(null, low, star), null);
  assert.match(refusal(top, low, star), /two divisions/);
  assert.match(refusal(top, low, fringe), /two divisions/);
  assert.match(refusal(top, mid, star), /drop a division/);
  assert.equal(refusal(top, mid, fringe), null);
  assert.equal(refusal(top, s.clubs[1], star), null);
  const weak = { ...top, id: 99, quality: top.quality - 4 };
  assert.match(refusal(top, weak, star), /weaker club/);
  for (const change of [() => { star.morale = 30; }, () => { star.morale = 50; star.listed = 'sale'; }, () => { delete star.listed; star.age = 31; }]) {
    change();
    assert.equal(refusal(top, mid, star), null);
  }
});

test('a move: the buyer pays, the seller is paid, nothing else changes hands; contracts and the log follow', () => {
  const s = world(4), from = s.clubs[0], to = s.clubs[1], p = from.players[5], total = sumBalances(s);
  move(s, p, from, to, 3e6);
  assert.equal(sumBalances(s), total);
  assert.ok(to.players.includes(p) && !from.players.includes(p));
  assert.deepEqual([to.fin.season.fees, from.fin.season.sales], [3e6, 3e6]);
  assert.deepEqual(p.contract, { wage: Math.max(wage(p), p.contract.wage), until: s.season - 1 + yearsFor(p.age), clause: null });
  assert.ok(justJoined(s, p));
  assert.deepEqual(s.deals.at(-1), { season: 1, day: -1, id: p.id, name: p.name, from: 0, to: 1, fee: 3e6, loan: false });
  const fa = s.market[0];
  move(s, fa, null, to, signingFee(fa));
  assert.equal(sumBalances(s), total - signingFee(fa)); // a signing-on fee leaves the game
  move(s, p, to, null, 0);
  assert.ok(s.market.includes(p) && p.contract === null && s.deals.at(-1).to === null);
});

test('a loan: the borrower pays half the wage, the lender the rest, and he goes home at the end of the season', () => {
  const s = world(5), from = s.clubs[0], to = s.clubs[10];
  const p = from.players.find(x => loanable(s, from, x)) ?? Object.assign(byOverall(from).at(-1), { age: 20 });
  p.contract.until = s.season + 2;
  assert.ok(loanable(s, from, p));
  const bills = [wageBill(from), wageBill(to)], w = p.contract.wage;
  lend(s, p, from, to);
  assert.deepEqual(p.loan, { from: 0, until: 1, share: LOAN_SHARE });
  assert.equal(wageBill(from) + wageBill(to), bills[0] + bills[1]);
  assert.equal(wageBill(to) - bills[1], w - Math.round(w * (1 - LOAN_SHARE)));
  assert.ok(to.players.includes(p) && !loanable(s, to, p));
  assert.ok(s.deals.at(-1).loan);
  returnLoans(s);
  assert.ok(from.players.includes(p) && !to.players.includes(p) && !p.loan);
  assert.deepEqual([wageBill(from), wageBill(to), from.lentPay], [...bills, 0]);
});

test('a market day: an AI club short of keepers signs one, and nobody else spends money that is not there', () => {
  const s = world(6), c = s.clubs[12];
  for (const gk of c.players.filter(p => p.pos === 'GK').slice(1)) move(s, gk, c, null, 0);
  for (const x of s.clubs) if (x !== c) x.fin.balance = -1; // nobody else can afford anything
  const keepers = new Set(s.market.filter(p => p.pos === 'GK').map(p => p.id)), bal = c.fin.balance;
  assert.ok(keepers.size > 0);
  marketDay(s, makeRng(1));
  const signed = c.players.find(p => keepers.has(p.id));
  assert.ok(signed && c.players.filter(p => p.pos === 'GK').length === 2);
  assert.equal(c.fin.balance, bal - signingFee(signed));
  assert.ok(s.clubs.every(x => x === c || x.fin.season.fees === 0));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/market.test.js`
Expected: FAIL with `Cannot find module '.../src/market.js'`.

- [ ] **Step 3: Create `src/market.js`**

```js
import { POS, overall, value } from './player.js';
import { wage, wageBill, projection, lentPart } from './finance.js';
import { terms, yearsFor } from './contracts.js';
import { fixLineup } from './lineup.js';

// The transfer market. Clubs trade players with each other in two windows: summer (from the end of
// a season to 1 September) and January. Every club values its players with an asking price and
// sells for at least FLOOR of it. Players can refuse a move down. Season-long loans: the borrower
// pays LOAN_SHARE of the wage. AI clubs fill gaps and buy upgrades on match days in a window; they
// bid for the human club's players, and can pay a release clause. A move is logged in s.deals.
export const MIN_SQUAD = 16, MAX_SQUAD = 32;
export const SUMMER_END = 24, JANUARY = [146, 176];        // 1 September; 1-31 January (day 0 = 8 August)
export const FLOOR = 0.9, WALKAWAY = 0.7, ROUNDS = 3;      // a bid of FLOOR × asking is accepted; below WALKAWAY × asking, no counter
export const SIGNING_FEE = 0.5, QUICK_SALE = 0.5;          // × value: a free agent's signing-on fee; a quick sale's price
export const LOAN_AGE = 23, LOAN_SHARE = 0.5, MAX_LOANS = 4;
const XI = { GK: 1, DF: 4, MF: 4, FW: 2 };                 // a 4-4-2: the regulars at each position
const MIN_POS = { GK: 2, DF: 5, MF: 5, FW: 3 };            // an AI club below this at a position signs a replacement
const PRICE = { lastSeason: 0.6, twoSeasons: 0.85, regular: 1.3, listed: 0.85, debt: 0.85 };
const AI = { activity: 0.15, upgrade: 3, room: 0.5, wageShare: 1 };
const OFFER = { listed: 0.5, unsolicited: 0.03, perDay: 2, low: [0.75, 0.95], high: [0.9, 1.1], max: 1.15, clause: 0.25 };

export const round10k = x => Math.max(10e3, Math.round(x / 1e4) * 1e4);
export const eur = n => '€' + (n / 1e6).toFixed(2) + 'M';

export const inWindow = day => day < SUMMER_END || (day >= JANUARY[0] && day <= JANUARY[1]);
export const windowOpen = s => s.done || inWindow(s.day);
// The open window's id, or null: 2 × season for summer (it belongs to the season it opens), + 1 for January.
export const windowId = s => s.done ? 2 * (s.season + 1) : !inWindow(s.day) ? null : 2 * s.season + (s.day < SUMMER_END ? 0 : 1);
export const justJoined = (s, p) => p.joined != null && p.joined === windowId(s);
// The last season a loan agreed now covers.
export const loanEnd = s => s.season + (s.done ? 1 : 0);
// What the borrower pays a week for a player on wage w.
export const loanPay = w => w - Math.round(w * (1 - LOAN_SHARE));

// The overall a player needs to be one of club c's regulars at position pos: the n-th best there (0 when short).
export function bar(c, pos) {
  const o = c.players.filter(p => p.pos === pos).map(p => overall(p)).sort((a, b) => b - a);
  return o[XI[pos] - 1] ?? 0;
}
export const regular = (c, p) => overall(p) >= bar(c, p.pos);

// What club c wants for player p: his value, less in the last two seasons of his contract, more for a
// regular, less when listed or when c is in debt. Rounded to €10k.
export function asking(s, c, p) {
  const left = p.contract.until - s.season - (s.done ? 1 : 0); // seasons after the current one
  const f = (left <= 0 ? PRICE.lastSeason : left === 1 ? PRICE.twoSeasons : 1) * (regular(c, p) ? PRICE.regular : 1)
    * (p.listed === 'sale' ? PRICE.listed : 1) * (c.fin.balance < 0 ? PRICE.debt : 1);
  return round10k(value(p) * f);
}
export const signingFee = p => round10k(SIGNING_FEE * value(p));

// Why p (at club `from`; null for a free agent) won't join club `to`, or null. Free agents, unhappy
// players (morale under 40) and listed players go anywhere within a division's drop. Nobody drops two
// divisions; a regular under 31 won't drop one, nor join a club 3+ quality weaker in his division.
export function refusal(from, to, p) {
  if (!from || p.morale < 40) return null;
  const drop = to.div - from.div;
  if (drop >= 2) return `${p.name} won't drop two divisions.`;
  if (p.age >= 31 || p.listed || !regular(from, p)) return null;
  if (drop === 1) return `${p.name} won't give up a regular place to drop a division.`;
  if (drop === 0 && to.quality < from.quality - 3) return `${p.name} won't join a weaker club.`;
  return null;
}

// AI money: half the balance for fees (nothing in debt); wages up to 90% of a season's expected income.
const room = c => Math.max(0, AI.room * c.fin.balance);
const wageRoom = (s, c, w) => (wageBill(c) + w) * 52 <= AI.wageShare * projection(s, c);
const aiWage = p => Math.max(wage(p), p.contract?.wage ?? 0);

const log = (s, p, from, to, fee, loan) => s.deals.push({ season: s.season, day: s.day, id: p.id, name: p.name, from: from?.id ?? null, to: to?.id ?? null, fee, loan });
function leave(s, p, list) {
  list.splice(list.indexOf(p), 1);
  delete p.listed;
  s.offers = s.offers.filter(o => o.id !== p.id);
}

// Moves p from club `from` (null: the free-agent list) to club `to` (null: released to the list) for
// `fee` (from null: his signing-on fee). The buyer pays, the seller is paid; the human club's transfer
// budget moves with its books. He signs his terms at the human club, his going rate at an AI club.
export function move(s, p, from, to, fee) {
  leave(s, p, from ? from.players : s.market);
  if (to) { to.fin.balance -= fee; to.fin.season.fees += fee; if (to.id === s.me) s.budget -= fee; }
  if (from) { from.fin.balance += fee; from.fin.season.sales += fee; if (from.id === s.me) s.budget += fee; }
  if (!to) { p.contract = null; s.market.push(p); }
  else {
    const start = s.season - (s.done ? 0 : 1); // a contract agreed after the last match day counts from next season
    const t = to.id === s.me ? terms(s, p) : { wage: aiWage(p), years: yearsFor(p.age), clause: null };
    p.contract = { wage: t.wage, until: start + t.years, clause: t.clause };
    p.joined = windowId(s);
    to.players.push(p);
  }
  log(s, p, from, to, fee, false);
  if (from?.id === s.me) fixLineup(s);
}

// p is lent by `from` to `to` to the end of the season (loanEnd): `to` pays LOAN_SHARE of his wage.
export const loanable = (s, c, p) => c.id !== s.me && !p.loan && p.age <= LOAN_AGE && !regular(c, p) && !justJoined(s, p) && p.contract.until > loanEnd(s);
export function lend(s, p, from, to) {
  leave(s, p, from.players);
  p.loan = { from: from.id, until: loanEnd(s), share: LOAN_SHARE };
  from.lentPay += lentPart(p);
  p.joined = windowId(s);
  to.players.push(p);
  log(s, p, from, to, 0, true);
  if (from.id === s.me) fixLineup(s);
}
// End of season s.season: loans ending now go home.
export function returnLoans(s) {
  for (const c of s.clubs) for (const p of [...c.players]) {
    if (!p.loan || p.loan.until > s.season) continue;
    const home = s.clubs[p.loan.from];
    c.players.splice(c.players.indexOf(p), 1);
    home.lentPay -= lentPart(p);
    delete p.loan;
    home.players.push(p);
  }
}

// ---- AI clubs, on match days in a window ----

const count = (c, pos) => c.players.reduce((n, p) => n + (p.pos === pos), 0);
const weakest = c => POS.reduce((w, pos) => bar(c, pos) < bar(c, w) ? pos : w);
const better = (a, b) => !b || overall(a) > overall(b);

// The best loan for AI club c at position pos at least `need` overall, or null.
function bestLoan(s, c, pos, need) {
  let best = null;
  for (const d of s.clubs) if (d !== c) for (const p of d.players)
    if (p.pos === pos && overall(p) >= need && better(p, best?.p) && loanable(s, d, p) && wageRoom(s, c, loanPay(p.contract.wage)) && !refusal(d, c, p)) best = { p, d };
  return best;
}

// A gap at pos: the best free agent there on no more than the club's median wage; else the best loan.
function replace(s, c, pos) {
  const wages = c.players.map(p => p.contract.wage).sort((a, b) => a - b), cap = wages[wages.length >> 1] ?? 0;
  let fa = null;
  for (const p of s.market) if (p.pos === pos && wage(p) <= cap && better(p, fa)) fa = p;
  if (fa) return move(s, fa, null, c, signingFee(fa));
  const l = bestLoan(s, c, pos, 0);
  if (l) lend(s, l.p, l.d, c);
}

// An upgrade at pos: the best affordable player 3+ overall above the club's bar there; else a loan.
// A squad over MAX_SQUAD releases its least valuable player.
function upgrade(s, c, pos) {
  const need = bar(c, pos) + AI.upgrade, money = room(c);
  let best = null;
  for (const d of s.clubs) {
    if (d === c || d.id === s.me || d.players.length <= MIN_SQUAD) continue;
    for (const p of d.players) {
      if (p.pos !== pos || p.loan || overall(p) < need || !better(p, best?.p) || justJoined(s, p)) continue;
      const fee = asking(s, d, p);
      if (fee <= money && wageRoom(s, c, aiWage(p)) && !refusal(d, c, p)) best = { p, d, fee };
    }
  }
  for (const p of s.market) {
    if (p.pos !== pos || overall(p) < need || !better(p, best?.p)) continue;
    const fee = signingFee(p);
    if (fee <= money && wageRoom(s, c, wage(p))) best = { p, d: null, fee };
  }
  if (best) move(s, best.p, best.d, c, best.fee);
  else { const l = bestLoan(s, c, pos, need); if (l) lend(s, l.p, l.d, c); }
  if (c.players.length > MAX_SQUAD) {
    const cut = c.players.filter(p => !p.loan).reduce((w, p) => value(p) < value(w) ? p : w);
    move(s, cut, c, null, 0);
  }
}

// The human club's players draw offers: a listed player often, anyone now and then (at most
// OFFER.perDay unsolicited a day). The bidder is the richest club he'd be a regular at. A loan
// listing is taken at once. A bigger club may pay a release clause: the player is gone.
function offersFor(s, rng) {
  const me = s.clubs[s.me], win = windowId(s);
  let unsolicited = 0;
  for (const p of [...me.players]) {
    if (p.loan || justJoined(s, p) || (!p.listed && unsolicited >= OFFER.perDay)) continue;
    if (rng.next() >= (p.listed ? OFFER.listed : OFFER.unsolicited)) continue;
    const ask = asking(s, me, p), loan = p.listed === 'loan';
    let buyer = null;
    for (const c of s.clubs) {
      if (c === me || c.players.length >= MAX_SQUAD || overall(p) < bar(c, p.pos) || refusal(me, c, p)) continue;
      if (loan ? !wageRoom(s, c, loanPay(p.contract.wage)) : room(c) < OFFER.low[0] * ask || !wageRoom(s, c, aiWage(p))) continue;
      if (!buyer || c.fin.balance > buyer.fin.balance) buyer = c;
    }
    if (!buyer) continue;
    if (loan) { lend(s, p, me, buyer); s.news.push({ type: 'loan', club: s.me, id: p.id, name: p.name, to: buyer.id }); continue; }
    const clause = p.contract.clause;
    if (clause && clause <= room(buyer) && buyer.quality > me.quality && rng.next() < OFFER.clause) {
      move(s, p, me, buyer, clause);
      s.news.push({ type: 'clause', club: s.me, id: p.id, name: p.name, to: buyer.id, fee: clause });
      continue;
    }
    const [lo, hi] = p.listed ? OFFER.low : OFFER.high, max = Math.min(room(buyer), round10k(OFFER.max * ask));
    const fee = Math.min(max, round10k(ask * (lo + (hi - lo) * rng.next())));
    if (s.offers.some(o => o.id === p.id && o.fee >= fee)) continue;
    s.offers = [...s.offers.filter(o => o.id !== p.id), { id: p.id, club: buyer.id, fee, max, win }];
    if (!p.listed) unsolicited++;
    s.news.push({ type: 'offer', club: s.me, id: p.id, name: p.name, from: buyer.id, fee });
  }
}

// A match day in a window. AI clubs in debt list their two best-paid players. Each AI club fills a
// gap (a position below MIN_POS, or a squad below MIN_SQUAD), else with chance AI.activity buys an
// upgrade at its weakest position. Then the human club's players draw offers.
export function marketDay(s, rng) {
  for (const c of s.clubs) if (c.id !== s.me) {
    for (const p of c.players) delete p.listed;
    if (c.fin.balance < 0) for (const p of c.players.filter(x => !x.loan).sort((a, b) => b.contract.wage - a.contract.wage).slice(0, 2)) p.listed = 'sale';
  }
  for (const c of s.clubs) {
    if (c.id === s.me) continue;
    const gap = POS.find(pos => count(c, pos) < MIN_POS[pos]) ?? (c.players.length < MIN_SQUAD ? weakest(c) : null);
    if (gap) replace(s, c, gap);
    else if (rng.next() < AI.activity) upgrade(s, c, weakest(c));
  }
  if (s.me !== null) offersFor(s, rng);
}
```

- [ ] **Step 4: Loans in the wage bill** — in `src/finance.js` replace the `wageBill` line with:

```js
// What club c pays a week: its players' wages (for a player on loan there, the borrower's part) plus
// the part it still pays of the players it has lent out (c.lentPay).
export const lentPart = p => Math.round(p.contract.wage * (1 - p.loan.share)); // the lender's part
export const wageBill = c => c.players.reduce((t, p) => t + (p.contract?.wage ?? 0) - (p.loan ? lentPart(p) : 0), 0) + (c.lentPay ?? 0);
```

(`?? 0` keeps the hand-built clubs in `tests/finance.test.js` working.)

- [ ] **Step 5: No renewals on loan** — in `src/contracts.js`:
  - `canRenew` starts `!!p.contract && !p.loan && …`;
  - in `renew`, after the `if (!p) return 'Not your player.';` line, add:

```js
  if (p.loan) return `${p.name} is on loan here.`;
```

- [ ] **Step 6: New state in `src/world.js`**
  - In the `createWorld` state literal, after `news: [],` add `offers: [], talks: { win: null, by: {} }, deals: [],`.
  - In the contracts-and-books loop, after `c.fin = newBooks(s, c);` add ` c.lentPay = 0;`.

- [ ] **Step 7: Run the new tests, then everything**

Run: `node --test tests/market.test.js` — Expected: PASS (6 tests).
Run: `npm test` — Expected: all pass. Nothing in the season calls the market yet, and `transfers.js` is unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/market.js src/finance.js src/contracts.js src/world.js tests/market.test.js
git commit -m "feat: transfer market core: windows, asking prices, refusals, moves and loans"
```

---

### Task 2: The human club's market (`src/transfers.js`)

**Files:**
- Replace: `src/transfers.js`
- Replace: `tests/transfers.test.js`

**Interfaces:**
- Consumes: Task 1's `src/market.js`; `terms` from `src/contracts.js`; `wageBill` from `src/finance.js`.
- Produces (`src/transfers.js`), each returning an error/status message or null when done:
  - `buy(s, id)`
  - `bid(s, id, fee)`
  - `acceptCounter(s, id)`
  - `talksOn(s, id) → { rounds, counter } | null`
  - `loanIn(s, id)`
  - `sell(s, id)`
  - `setListing(s, id, kind)`
  - `acceptOffer(s, id)`, `rejectOffer(s, id)`, `counterOffer(s, id, fee)`
  - `MIN_SQUAD`, `MAX_SQUAD` (re-exported); `SELL_RATE` is gone.

- [ ] **Step 1: Write the failing tests** — replace `tests/transfers.test.js` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { overall, value } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { terms } from '../src/contracts.js';
import { wageBill } from '../src/finance.js';
import { MINI } from './fixtures/mini.js';
import { takeClub, myClub, playDay, endSeason } from '../src/season.js';
import { asking, signingFee, marketDay, regular, FLOOR, QUICK_SALE, LOAN_SHARE, SUMMER_END } from '../src/market.js';
import { buy, sell, bid, acceptCounter, talksOn, loanIn, setListing, acceptOffer, rejectOffer, counterOffer, MIN_SQUAD, MAX_SQUAD } from '../src/transfers.js';

// Managing Kilo (bottom division, club 14) with money to spare, on day -1 of season 1: the summer window is open.
const fresh = () => { const s = createWorld(11, MINI); takeClub(s, 14); s.budget = 1e12; s.wageBudget = 1e12; return s; };
const r10k = x => Math.round(x / 1e4) * 1e4;
// A player at AI club `id` who would join you: not a regular there (a regular won't drop a division).
const target = (s, id) => { const c = s.clubs[id]; return c.players.find(p => !regular(c, p)); };

test('free agents: a signing-on fee of half his value, his terms within the wage budget, at any time', () => {
  const s = fresh(), p = [...s.market].sort((a, b) => value(a) - value(b))[0], club = myClub(s), t = terms(s, p), bal = club.fin.balance;
  s.day = 100; // window closed: free agents still sign
  s.wageBudget = wageBill(club) + t.wage - 1;
  assert.equal(buy(s, p.id), 'Over the wage budget.');
  s.wageBudget = 1e12; s.budget = signingFee(p) - 1;
  assert.equal(buy(s, p.id), 'Not enough transfer budget.');
  s.budget = signingFee(p);
  assert.equal(buy(s, p.id), null);
  assert.ok(club.players.includes(p) && !s.market.includes(p));
  assert.deepEqual(p.contract, { wage: t.wage, until: s.season + t.years - 1, clause: t.clause });
  assert.deepEqual([s.budget, club.fin.balance, club.fin.season.fees], [0, bal - signingFee(p), signingFee(p)]);
  assert.equal(buy(s, -1), 'Player not available.');
});

test('a full squad signs nobody', () => {
  const s = fresh();
  while (myClub(s).players.length < MAX_SQUAD) assert.equal(buy(s, s.market[0].id), null);
  assert.equal(buy(s, s.market[0].id), `Squad is full (${MAX_SQUAD}).`);
});

test('bids: rejected, countered, the counter accepted; the fee moves between the clubs', () => {
  const s = fresh(), p = target(s, 4), c = s.clubs[4], me = myClub(s), ask = asking(s, c, p);
  const bal = [me.fin.balance, c.fin.balance], b0 = s.budget;
  assert.match(bid(s, p.id, ask * 0.5), /rejected the bid\. 2 rounds/);
  assert.equal(talksOn(s, p.id).counter, null);
  assert.match(bid(s, p.id, ask * 0.8), /want €/);
  const counter = talksOn(s, p.id).counter;
  assert.equal(counter, Math.max(r10k((r10k(ask * 0.8) + ask) / 2), r10k(FLOOR * ask)));
  assert.equal(acceptCounter(s, p.id), null);
  assert.ok(me.players.includes(p) && !c.players.includes(p));
  assert.deepEqual([me.fin.balance, c.fin.balance, s.budget], [bal[0] - counter, bal[1] + counter, b0 - counter]);
  assert.equal(p.contract.wage, terms(s, p).wage);
});

test('bids: the floor is accepted at once, a release clause always; three rounds and talks stop', () => {
  const s = fresh(), c = s.clubs[4], [a, b] = c.players.filter(p => !regular(c, p)), d = target(s, 5);
  assert.equal(bid(s, a.id, FLOOR * asking(s, c, a)), null);
  b.contract.clause = 1e5;
  assert.equal(bid(s, b.id, 1e5), null);
  const c5 = s.clubs[5];
  for (let k = 0; k < 3; k++) assert.match(bid(s, d.id, 1e4), /rejected/);
  assert.match(bid(s, d.id, 1e4), /stopped talking/);
  assert.equal(bid(s, d.id, asking(s, c5, d)), null); // a full asking price still gets him
});

test('bids need an open window, a player willing to come and a seller with players to spare', () => {
  const s = fresh(), top = s.clubs[0], star = top.players.find(p => regular(top, p) && p.age < 31);
  star.morale = 50;
  assert.match(bid(s, star.id, 1e9), /two divisions/);
  const p = target(s, 4);
  s.day = SUMMER_END;
  assert.equal(bid(s, p.id, 1e9), 'The transfer window is closed.');
  s.day = -1;
  s.clubs[4].players.splice(MIN_SQUAD);
  assert.match(bid(s, target(s, 4).id, 1e9), /need every player/);
});

test('loans in: a young fringe player for half his wage, at most four', () => {
  const s = fresh(), c = s.clubs[4], me = myClub(s);
  const p = c.players.find(x => !regular(c, x));
  p.age = 20; p.contract.until = 3;
  const bill = wageBill(me);
  assert.equal(loanIn(s, p.id), null);
  assert.deepEqual(p.loan, { from: 4, until: 1, share: LOAN_SHARE });
  assert.equal(wageBill(me), bill + p.contract.wage - Math.round(p.contract.wage * (1 - LOAN_SHARE)));
  assert.match(sell(s, p.id), /on loan here/);
  const regularOne = c.players.find(x => regular(c, x));
  regularOne.age = 20;
  assert.match(loanIn(s, regularOne.id), /won't lend/);
});

test('quick sale: half his value from the richest club in reach that he would join; not a player who just joined', () => {
  const s = fresh(), me = myClub(s), p = me.players.find(x => x.id === s.lineup[0]), b0 = s.budget;
  assert.equal(sell(s, p.id), null);
  const buyer = s.clubs.find(c => c.players.includes(p));
  assert.ok(buyer && buyer !== me && Math.abs(buyer.div - me.div) <= 1);
  assert.equal(s.budget, b0 + r10k(QUICK_SALE * value(p)));
  assert.equal(new Set(s.lineup).size, 11);
  const fa = s.market[0];
  assert.equal(buy(s, fa.id), null);
  assert.match(sell(s, fa.id), /only just joined/);
  while (me.players.length > MIN_SQUAD) { const x = me.players.find(q => q !== fa); assert.equal(sell(s, x.id), null); }
  assert.equal(sell(s, me.players.find(q => q !== fa).id), `You need at least ${MIN_SQUAD} players.`);
});

test('offers: a listed player draws bids; accept, reject or counter', () => {
  const s = fresh(), me = myClub(s), rng = makeRng(3);
  for (const p of me.players) assert.equal(setListing(s, p.id, 'sale'), null);
  for (let k = 0; k < 5 && s.offers.length < 3; k++) marketDay(s, rng);
  assert.ok(s.offers.length >= 3, `${s.offers.length} offers`);
  assert.ok(s.news.some(n => n.type === 'offer'));
  const [o1, o2, o3] = s.offers, p1 = me.players.find(p => p.id === o1.id), bal = me.fin.balance;
  assert.equal(acceptOffer(s, o1.id), null);
  assert.ok(s.clubs[o1.club].players.includes(p1));
  assert.equal(me.fin.balance, bal + o1.fee);
  assert.equal(rejectOffer(s, o2.id), null);
  assert.equal(acceptOffer(s, o2.id), 'That offer has gone.');
  assert.match(counterOffer(s, o3.id, o3.max + 1e5), /walked away/);
  assert.ok(!s.offers.some(o => o.id === o3.id));
});

test('a signing after the last match day counts from next season and survives the rollover', () => {
  const s = fresh();
  while (!s.done) playDay(s);
  const p = [...s.market].sort((a, b) => value(a) - value(b))[0], t = terms(s, p);
  assert.equal(buy(s, p.id), null);
  assert.equal(p.contract.until, s.season + t.years);
  endSeason(s);
  assert.ok(myClub(s).players.includes(p));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/transfers.test.js`
Expected: FAIL (`bid`, `loanIn`, `setListing`… are not exported).

- [ ] **Step 3: Replace `src/transfers.js`**

```js
import { value } from './player.js';
import { wageBill } from './finance.js';
import { terms } from './contracts.js';
import { MIN_SQUAD, MAX_SQUAD, FLOOR, WALKAWAY, ROUNDS, QUICK_SALE, MAX_LOANS, LOAN_AGE, round10k, eur, windowOpen, windowId, justJoined,
  loanEnd, loanPay, asking, signingFee, refusal, move, lend, loanable } from './market.js';

export { MIN_SQUAD, MAX_SQUAD };

// The human club's side of the market. Every action returns an error message, or null when done.
// Club-to-club deals and loans need an open window; free agents sign at any time.

const CLOSED = 'The transfer window is closed.';
const mine = (s, id) => s.clubs[s.me].players.find(p => p.id === id);
// A player at an AI club: { p, c }, or null.
function atClub(s, id) {
  for (const c of s.clubs) if (c.id !== s.me) { const p = c.players.find(x => x.id === id); if (p) return { p, c }; }
  return null;
}
const overWages = (s, extra) => wageBill(s.clubs[s.me]) + extra > s.wageBudget;
// Why the human club can't take p on now (any deal), or null.
function cannotTake(s, p) {
  if (s.clubs[s.me].players.length >= MAX_SQUAD) return `Squad is full (${MAX_SQUAD}).`;
  if (p.loan) return `${p.name} is on loan.`;
  if (justJoined(s, p)) return `${p.name} only just joined his club.`;
  return null;
}
// Why the human club can't let its player p go now, or null.
function cannotLose(s, p) {
  if (!p) return 'Not your player.';
  if (p.loan) return `${p.name} is on loan here.`;
  if (justJoined(s, p)) return `${p.name} only just joined: wait for the next window.`;
  if (s.clubs[s.me].players.length <= MIN_SQUAD) return `You need at least ${MIN_SQUAD} players.`;
  return null;
}

// Free agents: a signing-on fee (half his value) from the transfer budget, his terms within the wage budget.
export function buy(s, id) {
  const p = s.market.find(x => x.id === id), club = s.clubs[s.me];
  if (!p) return 'Player not available.';
  const no = cannotTake(s, p);
  if (no) return no;
  if (signingFee(p) > s.budget) return 'Not enough transfer budget.';
  if (overWages(s, terms(s, p).wage)) return 'Over the wage budget.';
  move(s, p, null, club, signingFee(p));
  return null;
}

// Talks with an AI club in this window: { rounds, counter } for player id.
function talks(s, id) {
  const win = windowId(s);
  if (s.talks.win !== win) s.talks = { win, by: {} };
  return s.talks.by[id] ??= { rounds: 0, counter: null };
}
export const talksOn = (s, id) => s.talks.win === windowId(s) ? s.talks.by[id] ?? null : null;

// A bid of `fee` for a player at an AI club. Accepted at once when it reaches his release clause,
// FLOOR of the asking price, or the club's last counter; then he signs his terms. Otherwise it is a
// round of talks: from WALKAWAY of the asking price up the club counters halfway between bid and
// asking price (never below FLOOR), lower bids are rejected. After ROUNDS rounds talks stop until
// the next window. Returns null when he signs, else a message.
export function bid(s, id, fee) {
  if (!windowOpen(s)) return CLOSED;
  const at = atClub(s, id);
  if (!at) return 'Player not available.';
  const { p, c } = at, me = s.clubs[s.me];
  fee = round10k(fee);
  const no = cannotTake(s, p) ?? refusal(c, me, p);
  if (no) return no;
  if (c.players.length <= MIN_SQUAD) return `${c.name} won't sell: they need every player.`;
  if (fee > s.budget) return 'Not enough transfer budget.';
  if (overWages(s, terms(s, p).wage)) return 'Over the wage budget.';
  const t = talks(s, id), ask = asking(s, c, p);
  if ((p.contract.clause && fee >= p.contract.clause) || fee >= round10k(FLOOR * ask) || (t.counter && fee >= t.counter)) {
    move(s, p, c, me, fee);
    return null;
  }
  if (t.rounds >= ROUNDS) return `${c.name} have stopped talking about ${p.name} until the next window.`;
  t.rounds++;
  t.counter = fee >= WALKAWAY * ask ? Math.max(round10k((fee + ask) / 2), round10k(FLOOR * ask)) : t.counter;
  const left = ROUNDS - t.rounds, more = left ? ` ${left} round${left > 1 ? 's' : ''} of talks left.` : ' Talks are over for this window.';
  return (fee >= WALKAWAY * ask ? `${c.name} want ${eur(t.counter)} for ${p.name}.` : `${c.name} rejected the bid.`) + more;
}
// Pays the club's last counter-offer.
export function acceptCounter(s, id) {
  const t = talksOn(s, id);
  return t?.counter ? bid(s, id, t.counter) : 'There is no counter-offer.';
}

// A season-long loan from an AI club: a young player who is not one of his club's regulars; you pay half his wage.
export function loanIn(s, id) {
  if (!windowOpen(s)) return CLOSED;
  const at = atClub(s, id);
  if (!at) return 'Player not available.';
  const { p, c } = at, me = s.clubs[s.me];
  const no = cannotTake(s, p) ?? (loanable(s, c, p) ? refusal(c, me, p) : `${c.name} won't lend ${p.name}.`);
  if (no) return no;
  if (me.players.filter(x => x.loan).length >= MAX_LOANS) return `You can have at most ${MAX_LOANS} players on loan.`;
  if (overWages(s, loanPay(p.contract.wage))) return 'Over the wage budget.';
  lend(s, p, c, me);
  return null;
}

// Quick sale to whichever club in reach pays QUICK_SALE of his value at once: the richest AI club
// within a division of yours that can afford it and that he'd join.
export function sell(s, id) {
  if (!windowOpen(s)) return CLOSED;
  const me = s.clubs[s.me], p = mine(s, id), no = cannotLose(s, p);
  if (no) return no;
  const price = round10k(QUICK_SALE * value(p));
  let buyer = null;
  for (const c of s.clubs)
    if (c !== me && Math.abs(c.div - me.div) <= 1 && c.players.length < MAX_SQUAD && c.fin.balance / 2 >= price && !refusal(me, c, p) && (!buyer || c.fin.balance > buyer.fin.balance)) buyer = c;
  if (!buyer) return `No club will pay ${eur(price)} for ${p.name} today.`;
  move(s, p, me, buyer, price);
  return null;
}

// Transfer list: 'sale' (AI clubs bid, more often and lower), 'loan' (an AI club that would play him
// takes him on loan; aged 23 or under, contract beyond this season) or null (off the list).
export function setListing(s, id, kind) {
  const p = mine(s, id);
  if (!p) return 'Not your player.';
  if (p.loan) return `${p.name} is on loan here.`;
  if (kind === 'loan' && (p.age > LOAN_AGE || p.contract.until <= loanEnd(s))) return `Only players aged ${LOAN_AGE} or under with more than the loan left on their contract can go out on loan.`;
  if (kind) p.listed = kind; else delete p.listed;
  return null;
}

export function acceptOffer(s, id) {
  const o = s.offers.find(x => x.id === id), p = mine(s, id);
  if (!o) return 'That offer has gone.';
  const no = cannotLose(s, p);
  if (no) return no;
  move(s, p, s.clubs[s.me], s.clubs[o.club], o.fee);
  return null;
}
export function rejectOffer(s, id) { s.offers = s.offers.filter(o => o.id !== id); return null; }
// Ask an AI bidder for `fee`: up to the most it will pay it agrees at once, above that it walks away.
export function counterOffer(s, id, fee) {
  const o = s.offers.find(x => x.id === id), p = mine(s, id);
  if (!o) return 'That offer has gone.';
  fee = round10k(fee);
  if (fee <= o.fee) return acceptOffer(s, id);
  const no = cannotLose(s, p);
  if (no) return no;
  if (fee > o.max) { rejectOffer(s, id); return `${s.clubs[o.club].name} walked away.`; }
  move(s, p, s.clubs[s.me], s.clubs[o.club], fee);
  return null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test` — Expected: all pass.
- `src/ui/app.js` still imports `buy`, `sell` and `MAX_SQUAD`, which all still exist. Its Transfers text is stale until Task 6.
- `season.js` keeps importing `MIN_SQUAD` from `transfers.js` until Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/transfers.js tests/transfers.test.js
git commit -m "feat: bids with counters, loans, transfer list, offers and quick sales for your club"
```

---

### Task 3: The market in the season

**Files:**
- Modify: `src/season.js`
- Test: `tests/season.test.js`, `tests/market.test.js`, `tests/transfers.test.js`

**Interfaces:**
- Consumes: `inWindow`, `windowId`, `marketDay`, `returnLoans`, `MIN_SQUAD` from `src/market.js`.
- Produces:
  - `playDay` runs a market day after each match day in a window, and drops lapsed offers;
  - `takeClub` clears offers;
  - `endSeason` brings loans home before contracts expire, writes `h.deals` and empties `s.deals`.

- [ ] **Step 1: Write the failing tests**

(a) Append to `tests/market.test.js`:

```js
test('a season of market days: AI clubs trade, squads stay between the limits, money only leaves as signing-on fees', () => {
  const s = world(7);
  takeClub(s, 6);
  const total = sumBalances(s), income = () => s.clubs.reduce((t, c) => t + c.fin.season.broadcast + c.fin.season.sponsor + c.fin.season.gate - c.fin.season.wages, 0);
  while (!s.done) playDay(s);
  const deals = s.deals.filter(d => d.from !== null && d.to !== null && !d.loan);
  assert.ok(deals.length > 0, 'no club-to-club deals');
  assert.ok(deals.every(d => d.day < SUMMER_END || (d.day >= JANUARY[0] && d.day <= JANUARY[1])));
  const fees = s.deals.filter(d => d.from === null).reduce((t, d) => t + d.fee, 0);
  assert.equal(sumBalances(s), total + income() - fees);
  assert.ok(s.clubs.every(c => c.id === 6 || (c.players.length >= MIN_SQUAD && c.players.length <= MAX_SQUAD)), s.clubs.map(c => c.players.length).join());
  endSeason(s);
  assert.ok(s.clubs.every(c => c.players.every(p => !p.loan || p.loan.until >= s.season)));
  const lent = c => s.clubs.flatMap(x => x.players).filter(p => p.loan?.from === c.id).reduce((t, p) => t + Math.round(p.contract.wage * (1 - p.loan.share)), 0);
  assert.ok(s.clubs.every(c => c.lentPay === lent(c)));
});
```

(b) Append to `tests/transfers.test.js`:

```js
test('offers lapse when the window shuts; a player listed for loan goes out on loan', () => {
  const s = fresh(), me = myClub(s), kid = me.players.find(p => p.age <= 23);
  kid.contract.until = 3;
  assert.equal(setListing(s, kid.id, 'loan'), null);
  for (const p of me.players) if (p !== kid) setListing(s, p.id, 'sale');
  while (s.day < SUMMER_END) playDay(s);
  assert.equal(s.offers.length, 0);
  assert.ok(kid.loan?.from === 14 && !me.players.includes(kid), 'kid not loaned out');
  const old = me.players.find(p => p.age > 23);
  assert.match(setListing(s, old.id, 'loan'), /23 or under/);
});
```

(c) In `tests/season.test.js`:
- replace `import { MIN_SQUAD } from '../src/transfers.js';` with:

```js
import { MIN_SQUAD, MAX_SQUAD, buy } from '../src/transfers.js';
import { lend } from '../src/market.js';
```

- in 'endSeason rolls over; three seasons keep squads intact', replace the `assert.ok(s.clubs.every(c => (c.players.length === 18 || …` line (AI squads now change size) with:

```js
    assert.ok(s.clubs.every(c => c.players.length >= MIN_SQUAD && c.players.length <= MAX_SQUAD && c.st.p === 0 && c.players.every(p => p.age <= 35 && p.contract && p.contract.until >= s.season && (!p.loan || p.loan.until >= s.season))));
```

- in 'news lists only your new injuries and bans…', change `for (const n of s.news) assert.ok(n.club === 6 &&` to:

```js
    for (const n of s.news.filter(x => x.type === 'injury' || x.type === 'ban')) assert.ok(n.club === 6 &&
```

  (transfer news is about players who may have left).

- append:

```js
test('the rollover brings loans home and keeps your deals in History', () => {
  const s = world(33);
  takeClub(s, 14);
  s.budget = 1e12; s.wageBudget = 1e12;
  const me = myClub(s), kid = me.players.find(p => p.age <= 23), fa = s.market[0];
  kid.contract.until = 3;
  lend(s, kid, me, s.clubs[4]);
  assert.equal(buy(s, fa.id), null);
  while (!s.done) playDay(s);
  endSeason(s);
  assert.ok(me.players.includes(kid) && !kid.loan && me.lentPay === 0);
  assert.deepEqual(s.history[0].deals.map(d => [d.id, d.loan]).slice(0, 2), [[kid.id, true], [fa.id, false]]);
  assert.ok(s.history[0].deals.every(d => d.from === 14 || d.to === 14));
  assert.deepEqual(s.deals, []);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/season.test.js tests/market.test.js tests/transfers.test.js`
Expected: the new tests FAIL (no market days, no club-to-club deals, loans never return, `history[0].deals` undefined).

- [ ] **Step 3: Change `src/season.js`**

1. Imports: replace `import { MIN_SQUAD } from './transfers.js';` with:

   ```js
   import { MIN_SQUAD, inWindow, windowId, marketDay, returnLoans } from './market.js';
   ```

2. `takeClub`: after `s.training = defaultTraining();` add `s.offers = [];`.
3. `playDay`: directly after `s.day = today.day;` add:

   ```js
     if (inWindow(s.day)) marketDay(s, rng); // AI clubs trade; offers for your players
   ```

   and directly after `s.done = s.next === s.days.length;` add:

   ```js
     s.offers = s.offers.filter(o => o.win === windowId(s)); // offers lapse when the window shuts
   ```

4. `endSeason`: replace `h.left = expireContracts(s, rng, MIN_SQUAD);` with:

   ```js
     returnLoans(s);
     h.left = expireContracts(s, rng, MIN_SQUAD);
     h.deals = s.deals.filter(d => d.from === s.me || d.to === s.me);
     s.deals = [];
   ```

   Update the comment above `playDay` to mention that a match day in a window is also a market day.

- [ ] **Step 4: Run the tests**

Run: `npm test` — Expected: all pass. Run it twice: the results must be identical (determinism).

If a seeded test fails on exact numbers rather than structure, print what changed. The market draws extra random numbers on window days, so a seed-specific expectation can move. Change only that expectation, and say so in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/season.js tests/season.test.js tests/market.test.js tests/transfers.test.js
git commit -m "feat: AI clubs trade on window match days; loans return and your deals go into History"
```

---

### Task 4: Save version 8

**Files:**
- Modify: `src/save.js`
- Test: `tests/save.test.js`

**Interfaces:**
- Produces: `SAVE_VERSION = 8`, migration 7 → 8.

- [ ] **Step 1: Write the failing tests** — append to `tests/save.test.js`:

```js
// A save as Phase 6 (version 7) wrote it: no offers, talks, deals or loans.
function asV7(s) {
  const o = JSON.parse(serialize(s));
  o.version = 7;
  delete o.offers; delete o.talks; delete o.deals;
  for (const c of o.clubs) delete c.lentPay;
  return o;
}

test('a version 7 save opens the transfer market and plays on', () => {
  const a = createWorld(25, MINI);
  takeClub(a, 3);
  playDay(a);
  const b = deserialize(JSON.stringify(asV7(a)));
  assert.equal(b.version, SAVE_VERSION);
  assert.deepEqual([b.offers, b.talks, b.deals], [[], { win: null, by: {} }, []]);
  assert.ok(b.clubs.every(c => c.lentPay === 0));
  assert.ok(playDay(b).length);
});
```

In 'deserialize returns null for missing, corrupt or wrong-version saves', after the `// books missing` line, add:

```js
  assert.equal(deserialize(serialize({ ...createWorld(1, MINI), offers: undefined })), null); // market missing
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/save.test.js` — Expected: the new test FAILS (a version 7 save is current and has no `offers`).

- [ ] **Step 3: Change `src/save.js`**

```js
export const SAVE_VERSION = 8; // 2: clubs from real data with short, colours, kit. 3: live match, richer results. 4: tactics. 5: calendar, cup, play-offs, records. 6: squad dynamics, training. 7: contracts, club books, budgets. 8: transfer market, loans
```

Add to the end of `valid`'s expression:

```js
  && Array.isArray(s.offers) && !!s.talks && Array.isArray(s.deals) && s.clubs.every(c => Number.isFinite(c.lentPay))
```

Add to `MIGRATIONS`:

```js
  7: s => { s.offers = []; s.talks = { win: null, by: {} }; s.deals = []; for (const c of s.clubs) c.lentPay = 0; }, // the market opens
```

- [ ] **Step 4: Run the tests**

Run: `npm test` — Expected: all pass, including the v2 → v8 chains.

- [ ] **Step 5: Commit**

```bash
git add src/save.js tests/save.test.js
git commit -m "feat: save version 8 with offers, talks, deals and loans"
```

---

### Task 5: Money re-tune and market calibration

**Files:**
- Modify: `src/finance.js` (`BROADCAST`)
- Modify: `tests/england.test.js`
- Modify, only if a target is missed: `AI` and `PRICE` in `src/market.js`, `BROADCAST` in `src/finance.js`

- [ ] **Step 1: Add the market test** — in `tests/england.test.js`, add `import { MIN_SQUAD, MAX_SQUAD } from '../src/market.js';` and append:

```js
test('a season of the real transfer market: every division trades, squads keep their shape, the EFL stays solvent', () => {
  const s = createWorld(1);
  while (!s.done) playDay(s);
  const buys = s.deals.filter(d => d.from !== null && d.to !== null && !d.loan);
  const v = {
    buys: buys.length, byDiv: [0, 1, 2].map(d => buys.filter(x => s.clubs[x.to].div === d).length), top: Math.max(...buys.map(d => d.fee)),
    loans: s.deals.filter(d => d.loan).length, eflDebt: s.clubs.filter(c => c.div > 0 && c.fin.balance < 0).length,
    sizes: [Math.min(...s.clubs.map(c => c.players.length)), Math.max(...s.clubs.map(c => c.players.length))],
  }, info = JSON.stringify(v);
  assert.ok(v.buys >= 50 && v.buys <= 200, info);
  assert.ok(v.byDiv.every(n => n >= 10), info);
  assert.ok(v.top >= 20e6 && v.top <= 150e6, info);
  assert.ok(v.loans >= 3 && v.loans <= 40, info);
  assert.ok(v.eflDebt <= 3, info);
  assert.ok(v.sizes[0] >= MIN_SQUAD && v.sizes[1] <= MAX_SQUAD, info);
});
```

- [ ] **Step 2: Run it before re-tuning**

Run: `node --test tests/england.test.js` (Bash timeout up to 600000 ms).
Expected: FAIL on `eflDebt`. With the old EFL money the Championship spends about 1.2× its income on wages, and the prototype ended the season with 6 EFL clubs in debt.

- [ ] **Step 3: Re-tune** — in `src/finance.js`:

```js
export const BROADCAST = [93e6, 12e6, 4e6];   // per season, by division (top first); lower divisions use the last (EFL raised in Phase 7)
```

In `src/market.js`, `AI.wageShare` is already 1 (an AI club may spend up to its projected income on wages).

In `tests/england.test.js`, in 'a season of real club books…', replace `assert.ok(pl.income >= 5 * ch.income, info);` with:

```js
  assert.ok(pl.income >= 4 * ch.income, info); // 5× before Phase 7 raised EFL broadcast money
```

This is the one Phase 6 target this phase changes, by the owner's money re-tune decision. Say so in the commit message.

- [ ] **Step 4: Run and record**

Run: `node --test tests/england.test.js`. Temporarily `console.log(info)` in the new test and in the books test to record the numbers for the summary, then remove the lines.

The prototype recorded:
- transfers: 70 (23 / 19 / 28 by division);
- biggest fee: €37.8M;
- loans: 9;
- EFL clubs in debt: 1;
- squads: 20–32;
- books: PL ratio 0.43, Championship 0.98, League One 0.89; PL ÷ Championship income 4.2×.

If a target is missed, tune one knob at a time:

| Missed target | Knob | Step |
|---------------|------|------|
| too few / too many transfers | `AI.activity` | ±0.03 |
| a division buys fewer than 10 | `BROADCAST[d]` | ±1e6 (Championship), ±0.5e6 (League One) |
| biggest fee out of range | `AI.room` | ±0.1 |
| too few loans | `LOAN_AGE` | +1 |
| EFL debt | `BROADCAST[1]`, `BROADCAST[2]` | as above |
| a Phase 6 wage ratio | `BROADCAST[d]` for that division | as above |

- [ ] **Step 5: Run everything**

Run: `npm test` — Expected: all pass. Run it twice to confirm the same results.

- [ ] **Step 6: Commit**

```bash
git add src/finance.js src/market.js tests/england.test.js
git commit -m "test: transfer market calibration on the real leagues; EFL broadcast money raised (PL/Championship income target 5x -> 4x)"
```

---

### Task 6: Interface — the Transfers screen

**Files:**
- Modify: `src/ui/app.js`

**Interfaces:**
- Consumes: everything from `src/transfers.js` and the market helpers.
- Produces: the rebuilt Transfers screen, a `browse` club picker, and the new actions `browse`, `bid`, `counter`, `loan`, `listing`, `acceptOffer`, `rejectOffer`, `counterOffer`. Transfer news, History deals, profiles of any player, and "on loan" in Contracts.

- [ ] **Step 1: Imports** — replace `import { buy, sell, MAX_SQUAD } from '../transfers.js';` with:

```js
import { buy, sell, bid, acceptCounter, talksOn, loanIn, setListing, acceptOffer, rejectOffer, counterOffer, MAX_SQUAD } from '../transfers.js';
import { SUMMER_END, JANUARY, QUICK_SALE, inWindow, windowOpen, justJoined, asking, signingFee, refusal, loanable, loanPay } from '../market.js';
```

- [ ] **Step 2: UI state** — add `browse = null` to the `let tab = …` line (`, browse = null; // browse: the club shown on Transfers`).

- [ ] **Step 3: Helpers**
  - `perWeek`: show small wages with a decimal (a €250 loan share was showing as €0k/wk):

```js
const perWeek = n => `€${n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n < 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n / 1e3) + 'k'}/wk`;
```

  - `untilText`: after `!p.contract ? '–' :` insert `` p.loan ? `on loan from ${clubName(p.loan.from)}` : ``.
  - Directly after the `mySide` line add:

```js
const dealText = d => `${esc(d.name)} ${d.from === null ? 'from the free-agent list' : `from ${clubName(d.from)}`} ${d.to === null ? 'released' : `to ${clubName(d.to)}`}${d.loan ? ' on loan' : d.fee ? ` (${money(d.fee)})` : ''}`;
// Which window is open, or when the next one opens.
const windowText = () => s.done ? `Summer window open until ${dateLabel(SUMMER_END - 1)}` : inWindow(s.day) ? `${s.day < SUMMER_END ? 'Summer' : 'January'} window open until ${dateLabel(s.day < SUMMER_END ? SUMMER_END - 1 : JANUARY[1])}`
  : `Window closed: the ${s.day < JANUARY[0] ? `January window opens ${dateLabel(JANUARY[0])}` : 'summer window opens when the season ends'}`;
const feeOf = id => Math.round(+$(`fee-${id}`).value * 1e6);
```

- [ ] **Step 4: News** — replace `newsText` (and its comment's body) with:

```js
const NEWS = {
  injury: n => `🚑 ${esc(n.name)} is out for ${outFor(n.days)} (${esc(n.injury)}${n.training ? ', in training' : ''}).`,
  ban: n => `🟥 ${esc(n.name)} is banned for ${n.matches} match${n.matches > 1 ? 'es' : ''}.`,
  offer: n => `💶 ${clubName(n.from)} bid ${money(n.fee)} for ${esc(n.name)} (see Transfers).`,
  clause: n => `💶 ${clubName(n.to)} paid ${esc(n.name)}'s ${money(n.fee)} release clause: he has gone.`,
  loan: n => `🔁 ${esc(n.name)} joins ${clubName(n.to)} on loan.`,
};
const newsText = () => s.news.map(n => NEWS[n.type](n)).join('<br>');
```

  Change the comment above it to `// The human club's news from the day just played: injuries, bans, offers, clauses paid, loans.`

- [ ] **Step 5: Profile of any player** — in `profile()`, replace the first line's lookup with:

```js
  const p = [...s.clubs.flatMap(c => c.players), ...s.market].find(x => x.id === viewing);
```

- [ ] **Step 6: History** — in `views.History`, directly after the `h.left` line, add:

```js
      ${h.deals?.length ? `<div class="dim">Your deals: ${h.deals.map(dealText).join(' · ')}</div>` : ''}
```

- [ ] **Step 7: Transfers** — replace `views.Transfers` with:

```js
  Transfers() {
    const me = myClub(s), open = windowOpen(s);
    const feeBox = (id, v) => `<input type="number" id="fee-${id}" min="0" step="0.05" value="${(v / 1e6).toFixed(2)}" style="width:6.5em" aria-label="fee in millions of euros"> €M`;
    const table = (head, rows) => rows.length ? `<div class="wrap"><table><tr>${head}</tr>${rows.join('')}</table></div>` : '<p class="dim">None.</p>';
    const offers = s.offers.map(o => [o, me.players.find(p => p.id === o.id)]).filter(([, p]) => p).map(([o, p]) => `<tr>${nameBtn(p, 'view')}${cells(p)}<td>${clubName(o.club)}</td><td class="n">${money(o.fee)}</td>
      <td><button data-act="acceptOffer" data-id="${p.id}">Accept</button> <button data-act="rejectOffer" data-id="${p.id}">Reject</button> ${feeBox(p.id, o.fee * 1.2)} <button data-act="counterOffer" data-id="${p.id}">Ask for</button></td></tr>`);
    const c = browse === null ? null : s.clubs[browse];
    const theirs = !c ? [] : byPos(c.players).map(p => {
      const t = talksOn(s, p.id), why = p.loan ? `on loan from ${clubName(p.loan.from)}` : justJoined(s, p) ? 'just joined' : refusal(c, me, p);
      const deal = why ? `<span class="dim">${why}</span>` : `${feeBox(p.id, t?.counter ?? asking(s, c, p))} <button data-act="bid" data-id="${p.id}">Bid</button>${t?.counter ? ` <button data-act="counter" data-id="${p.id}">Pay ${money(t.counter)}</button>` : ''}${loanable(s, c, p) ? ` <button data-act="loan" data-id="${p.id}">Loan (${perWeek(loanPay(p.contract.wage))})</button>` : ''}`;
      return `<tr>${nameBtn(p, 'view')}${cells(p)}<td class="n">${money(asking(s, c, p))}</td><td>${untilText(p)}</td><td>${deal}</td></tr>`;
    });
    const listed = s.clubs.filter(x => x !== me).flatMap(x => x.players.filter(p => p.listed === 'sale').map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td><button class="link" data-act="browse" data-id="${x.id}">${clubName(x.id)}</button></td><td class="n">${money(asking(s, x, p))}</td></tr>`));
    const listing = p => `<select data-act="listing" data-id="${p.id}">${options([['', 'Not listed'], ['sale', 'For sale'], ...(p.age <= 23 ? [['loan', 'For loan']] : [])], p.listed ?? '')}</select>`;
    const mine = byPos(me.players).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td>${p.loan ? `<span class="dim">on loan from ${clubName(p.loan.from)}</span>` : listing(p)}</td>
      <td>${p.loan || justJoined(s, p) ? '' : `<button data-act="sell" data-id="${p.id}">Quick sale ${money(Math.round(QUICK_SALE * value(p) / 1e4) * 1e4)}</button>`}</td></tr>`);
    const away = s.clubs.flatMap(x => x.players.filter(p => p.loan?.from === s.me).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td>at ${clubName(x.id)} until the end of season ${p.loan.until}</td></tr>`));
    const free = byPos(s.market).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td class="n">${money(signingFee(p))}</td><td class="dim">${termsText(terms(s, p))}</td><td><button data-act="buy" data-id="${p.id}">Sign</button></td></tr>`);
    const biggest = s.deals.filter(d => !d.loan && d.from !== null && d.to !== null).sort((a, b) => b.fee - a.fee).slice(0, 10).map(d => `<div>${dealText(d)}</div>`).join('');
    const clubOptions = s.divisions.map(d => `<optgroup label="${esc(d.name)}">${d.clubIds.filter(id => id !== s.me).map(id => `<option value="${id}"${id === browse ? ' selected' : ''}>${clubName(id)}</option>`).join('')}</optgroup>`).join('');
    return `<p><b>${windowText()}</b> · transfer budget ${money(s.budget)} · wage bill ${perWeek(wageBill(me))} of ${perWeek(s.wageBudget)}</p>
      <p class="dim">Bid for players at other clubs while a window is open: a club takes ${Math.round(0.9 * 100)}% of its asking price or counters, and talks stop after three rounds. Players under 24 who are not regulars can come on loan for half their wage. Free agents sign at any time for a signing-on fee of half their value.</p>
      <h2>Offers for your players</h2>${table(`${HEAD}<th>From</th><th class="n">Fee</th><th></th>`, offers)}
      <h2>Other clubs</h2><p><select data-act="browse"><option value="">Pick a club…</option>${clubOptions}</select></p>
      ${c ? `<h3>${badge(c.id)} ${clubName(c.id)} <span class="dim">· balance ${money(c.fin.balance)}</span></h3>${table(`${HEAD}<th class="n">Asking</th><th>Contract</th><th>${open ? 'Deal' : 'Window closed'}</th>`, theirs)}` : ''}
      <h2>Transfer list</h2><p class="dim">Clubs in debt put their best-paid players up for sale, cheaper.</p>${table(`${HEAD}<th>Club</th><th class="n">Asking</th>`, listed)}
      <h2>Your squad (${me.players.length}/${MAX_SQUAD})</h2><p class="dim">List a player and clubs bid for him during a window. A quick sale gets ${QUICK_SALE * 100}% of his value at once.</p>${table(`${HEAD}<th>Listing</th><th></th>`, mine)}
      <h2>Out on loan</h2>${table(`${HEAD}<th></th>`, away)}
      <h2>Free agents</h2>${table(`${HEAD}<th class="n">Signing fee</th><th>Asks</th><th></th>`, free)}
      <h2>Biggest deals this season</h2>${biggest || '<p class="dim">None yet.</p>'}`;
  },
```

- [ ] **Step 8: Actions** — directly after `buy(id) { … },` add:

```js
  browse(id, el) { browse = el.tagName === 'SELECT' ? (el.value === '' ? null : +el.value) : id; tab = 'Transfers'; },
  bid(id) { msg = bid(s, id, feeOf(id)) || 'Bid accepted: he has signed.'; },
  counter(id) { msg = acceptCounter(s, id) || 'Deal done: he has signed.'; },
  loan(id) { msg = loanIn(s, id) || 'He joins on loan.'; },
  listing(id, el) { msg = setListing(s, id, el.value || null) || (el.value ? 'Listed.' : 'Taken off the list.'); },
  acceptOffer(id) { msg = acceptOffer(s, id) || 'Sold.'; },
  rejectOffer(id) { msg = rejectOffer(s, id) || 'Offer rejected.'; },
  counterOffer(id) { msg = counterOffer(s, id, feeOf(id)) || 'They agreed: sold.'; },
```

The existing `sell` action stays as it is: it is now the quick sale.

- [ ] **Step 9: Run the tests and a syntax check**

Run: `npm test` — Expected: all pass.
Run: `node --input-type=module --check < src/ui/app.js` — Expected: no output.

- [ ] **Step 10: Verify in the browser** — `preview_start` with `{ name: "touchline" }`:
  1. The existing save (version 7) loads, with no console errors.
  2. Pick **New game**, a League One club, then **Transfers**. The first line reads "Summer window open until Mon 31 Aug".
  3. Pick a club under **Other clubs**. Every player shows an asking price and either a fee box with **Bid** (and **Loan** for young fringe players) or a reason in grey ("won't drop two divisions", "just joined").
  4. Bid far too low: "rejected the bid. 2 rounds of talks left." Bid about 80% of asking: "want €…", and a **Pay €…** button appears. Pay it, or say why not (budget).
  5. Loan a young player: "He joins on loan." He appears in Squad, and Contracts shows "on loan from …".
  6. List two players **For sale**, then play a few days (Match → Continue). News shows "💶 … bid €… for …". Under **Offers**: Accept sells him, Reject removes the offer, and "Ask for" more than the bidder will pay makes it walk away.
  7. Quick sale: the budget rises by the quoted amount, and the player now shows at his new club (open his profile from Biggest deals or that club).
  8. Play past 1 September: the line reads "Window closed: the January window opens Fri 1 Jan". Bids are refused, and free agents still sign.
  9. Play to the end of the season and start the next. History lists "Your deals: …", and loaned players are back.

- [ ] **Step 11: Commit**

```bash
git add src/ui/app.js
git commit -m "feat: transfer market screen: bids, counters, loans, listings, offers and quick sales"
```

---

### Task 7: Docs

**Files:**
- Modify: `docs/fun-surprises.md`
- Modify: `docs/superpowers/plans/2026-11-15-touchline-roadmap.md`

- [ ] **Step 1: Fun surprises**
  - **Fix the table:** row 16 (**The academy conveyor**) sits below the "Design decisions" heading, outside the table. Move it up, directly after row 15.
  - **#2 Youth flipping**, How to use: "Buy cheap 17–20-year-olds, train them hard, and list them at 23: clubs that would play them bid up to their asking price."
  - **#3 Second chances**, add at the end of the Surprise cell: " Since Phase 7 a player you sell joins the club that bought him (bid for him there to get him back). Only players whose contracts end, and players AI clubs release, reach the list."
  - **#16 The academy conveyor**, How to use: replace "sell the kids" with "list the kids or quick-sell them".
  - Add two rows:

```markdown
| 17 | **Nine-tenths is enough.** Every club accepts a bid of 90% of its asking price at once, before any haggling. | Type in 90% of the asking price and skip the talks. Below that, a bid between 70% and 90% gets a counter halfway up. | `bid()` in `src/transfers.js` (`FLOOR`) | Phase 7 |
| 18 | **Fire sales.** A club in debt lists its two best-paid players, and both its debt and the listing take 15% off the asking price each, so they cost about 72% of the usual price. A regular who would normally refuse to drop a division will join you, because listed players go anywhere within one division. | Check the Transfer list after a bad run of results in the Championship: relegated big earners are often there. | `marketDay()`, `asking()` and `refusal()` in `src/market.js` | Phase 7 |
```

  - Record any other quirk found while implementing or reviewing this phase as a new row.

- [ ] **Step 2: Roadmap**
  - Row 7: change `to write` to `` `2026-11-16-touchline-phase-7-transfer-market.md` (done YYYY-MM-DD) `` with the actual completion date.
  - Add below the Phase 6 notes:

```markdown
Phase 7 notes (decided 2026-11-16):
- EFL broadcast money was raised (Championship €12M, League One €4M) so AI clubs can trade without drifting into debt; the Phase 6 target "PL income ≥ 5× Championship" became 4×.
- Premier League clubs still bank about €60M a season each (median balance about €250M by season 3), and the biggest fees reach about €130M by then. Phase 10's board and Phase 12's soak should rein this in.
- Phase 8 replaces the browse-one-club list on the Transfers screen with player search, filters and shortlists; asking prices and refusals stay in `src/market.js`.
```

- [ ] **Step 3: Run the tests and commit**

Run: `npm test` — Expected: all pass.

```bash
git add docs/fun-surprises.md docs/superpowers/plans/2026-11-15-touchline-roadmap.md
git commit -m "docs: mark Phase 7 done"
```

- [ ] **Step 4: End-of-phase summary** (in chat, not a file):
  - what changed;
  - the market and money calibration numbers from Task 5;
  - the browser check;
  - fun surprises added or updated (#2, #3, #16, #17, #18).
