# Touchline — Full Game Roadmap

**Goal:** Grow Touchline from a one-league demo into a full-depth football management game with the mechanics the genre is known for.

**Not a goal:** reproducing any existing commercial game. Touchline keeps its own name, visual identity, screen layouts and wording. Genre mechanics (tactics, transfers, scouting, training…) are fair game; another product's name, database, ratings, UI look or text are not.

**Real names (decided 2026-11-15):** this is a personal, private project, so real club and player names are wanted, not avoided. Phase 1 shipped with generated fictional names and a deny-list that blocks real town names; that is to be replaced by a real-world data set (see "Real-world data" below). Attribute values are our own estimates, not taken from any game's database. Badges and kits are Touchline's own designs in each club's colours (no real crests or logos).

**Fun surprises (decided 2026-11-15):** minor quirks that are fun or interesting for the player are kept, not fixed. Each one is recorded in `docs/fun-surprises.md` and mentioned in the end-of-phase summary. Every phase's review triage must apply this rule.

**How to use this file:** each phase below is its own implementation plan in this folder, written in detail just before that phase starts (so it can reference the real code that exists by then). Every phase ends with a playable, tested game. Phases are ordered by dependency; do not skip ahead.

| # | Phase | Delivers | Depends on | Plan file |
|---|-------|----------|------------|-----------|
| 1 | Foundation | ES-module engine, seeded RNG, attribute-based players with hidden potential, 3 divisions × 16 clubs, versioned saves, UI ported | — | `2026-11-15-touchline-phase-1-foundation.md` (done 2026-11-15) |
| 1b | Real world | English top 3 divisions 2026–27 with real clubs and squads, our own ratings, original badges and kits in club colours, free agents partly carry over | 1 | `2026-11-15-touchline-phase-1b-real-world.md` (done 2026-11-15) |
| 2 | Match engine | Minute-by-minute simulation: possession chains, shots with chance quality, cards, in-match injuries, fatigue, substitutions, player ratings; live commentary view with speed control and in-match changes | 1 | `2026-11-15-touchline-phase-2-match-engine.md` (done 2026-11-15) |
| 3 | Tactics | Player roles and duties, mentality, pressing, tempo, width, defensive line, set-piece takers, per-player instructions, tactical familiarity; the engine from Phase 2 reads all of it | 2 | `2026-11-15-touchline-phase-3-tactics.md` (done 2026-11-15) |
| 4 | Competitions & calendar | Day-based calendar, promotion/relegation with play-offs, a knockout cup across all divisions, season awards, club and league records | 1 | `2026-11-15-touchline-phase-4-competitions.md` (done 2026-11-15) |
| 5 | Squad dynamics | Match fitness and condition, injuries with recovery times, suspensions, morale, form, training schedules that drive attribute development | 2, 4 | `2026-11-15-touchline-phase-5-squad-dynamics.md` (done 2026-11-15) |
| 6 | Contracts & finances | Wages, contract lengths, renewals, release clauses, negotiations; club income (gate, sponsorship, prize, broadcast) and costs; separate transfer and wage budgets | 4 | `2026-11-16-touchline-phase-6-contracts-finances.md` (done 2026-11-16) |
| 7 | Transfer market | Transfer windows, AI clubs buying and selling, bids and counter-offers, loans, free agents, player willingness to move | 6 | `2026-11-16-touchline-phase-7-transfer-market.md` (done 2026-11-16) |
| 8 | Scouting & knowledge | Attributes of unknown players shown as ranges, scouts with assignments and reports, shortlists, player search and filters | 7 | `2026-11-16-touchline-phase-8-scouting.md` (done 2026-11-16) |
| 9 | Youth & staff | Annual academy intake, youth squad, staff (coaches, scouts, physios) with their own attributes that affect training, scouting accuracy and recovery; hiring and firing | 5, 8 | `2026-11-16-touchline-phase-9-youth-staff.md` (done 2026-11-16) |
| 10 | Manager career | Board expectations and confidence, job security, sackings, job offers at other clubs, manager reputation, inbox with news and decisions | 6, 7 | `2026-11-16-touchline-phase-10-manager-career.md` (done 2026-11-16) |
| 10b | Training & money | Training for every age, per-player intensity, budgets favour transfers, the manager's own money: salary, own players, club shares | 5, 6, 10 | `2026-11-17-touchline-phase-10b-training-money.md` (done 2026-11-17) |
| 11 | Interface | Touchline's own visual identity, player and club profile screens, 2D pitch match view, sortable/filterable tables, save slots with export/import, keyboard and screen-reader support | 2–10 | `2026-11-19-touchline-phase-11-interface.md` (in progress, steps 1–3 of 7 done) |
| 12 | Balance & soak | 20-season automated runs checked against statistical targets (goals per match 2.5–2.9, home wins 43–47%, plausible wage/value curves), performance budget, save-size budget | all | to write |

## Real-world data (decided 2026-11-15, planned as Phase 1b)

English Premier League, Championship and League One, 2026–27. Squads from public sources (Wikipedia) or memory. Ratings are Touchline's own 1–20 estimates, not copied from EA SPORTS FC / FIFA Index or any game database. Badges are original designs in club colours with a three-letter code; kits use real club colours and simple patterns, without crests or logos.

Phase 3 note: the formation edge listed in `docs/fun-surprises.md` must survive the tactics rewrite.

Phase 5 note (decided 2026-11-15): suspensions price "Tackle harder"; it stays as it is (fun surprise #6).

Phase 9 note (done 2026-11-16): staff are levels 1-5 per area (owner's choice), not individual people. Coaching scales growth and the youth intake, Scouting the number and speed of scouts, Medical injury length; level 3 is the calibrated game. Training intensity and recovery rates were left as calibrated.

Phase 6 notes (decided 2026-11-16):
- Phase 7 uses each club's `fin.balance` for bids, pays release clauses (`p.contract.clause`), and replaces the rule that a free agent costs his value as a fee.
- Phase 10's board acts on debt and sets the season budgets that `seasonBudgets()` in `src/finance.js` now sets with fixed shares.
- AI clubs in the EFL run at a loss (Championship wages are about 1.2× income) and drift into debt; Phase 7 must re-tune club money before AI bids use `fin.balance`.
- The wage budget floor (wage bill × 1.15) lets a manager raise wages every season; Phase 10's board should tie the wage budget to income and debt.

Phase 7 notes (decided 2026-11-16):
- EFL broadcast money was raised (Championship €12M, League One €4M) so AI clubs can trade without drifting into debt; the Phase 6 target "PL income ≥ 5× Championship" became 4×.
- Premier League clubs still bank about €60M a season each (median balance about €250M by season 3), and the biggest fees reach about €130M by then. Phase 10's board and Phase 12's soak should rein this in.
- Phase 8 replaces the browse-one-club list on the Transfers screen with player search, filters and shortlists; asking prices and refusals stay in `src/market.js`.

Phase 8 notes (decided 2026-11-16):
- Phase 9's scouts get attributes and wages: their judging can scale `TASKS` (days and knowledge reached) and `MAX_WIDTH` / `OVR_WIDTH` in `src/scouting.js`, and hiring replaces the fixed `SCOUTS` numbers.
- AI clubs see true values; only the human club is fogged.

Phase 9 notes (decided 2026-11-16):
- Only the human club pays for staff, and only beyond its division's standard (`STANDARD` in `src/finance.js`); staff costs count against the wage budget. Phase 10's board should set that budget from income and debt.
- AI clubs have no youth squads; their gaps are still filled by generated academy players.

Phase 10 notes (decided 2026-11-16):
- AI clubs have no manager people: a board's sacking only opens a vacancy (`s.jobs`), so the world's random sequence and every calibration target are unchanged. About 13 AI sackings a season.
- Vacancies still open when a season ends stay open for the new season's first 14 days (an owner-approved fix during implementation).
- The wage budget is max(current wages and staff, 70% of projected income) + savings over two years, frozen in debt; the Phase 6 floor of wage bill + 15% is gone. The Premier League money piles are left for Phase 12.
- Phase 12's soak should check the sacking rate (10–20 a season) and that a managed career survives 20 seasons.

Phase 10b notes (decided 2026-11-17, plan `2026-11-17-touchline-phase-10b-training-money.md`):
- Training now develops players of every age, tapering from 1× at 23 to 0.1× from 31 (`ageGrow()` in `src/training.js`); still capped by the hidden potential. Over 3 seasons of the real data the average overall rises by about 3.2 instead of 1.75 before. Phase 12's soak should check that this levels off.
- Budgets favour transfers: 75% of the balance for fees, wages from 55% of projected income (was 50% / 70%).
- The manager has money of his own: a salary, bonuses and severance; players of his own (`p.mine`); shares in clubs up to 49%. Buying a whole club (majority ownership) and Star points (young versions of past legends, earned when your own star players retire) are later phases. Star points decisions: only stars retiring from your club count; current stars can be legends too; real names; potential always high; AI clubs get legends at a much smaller chance.

## Architecture decisions that hold for every phase

- **No build step, no runtime dependencies.** Browser loads ES modules directly; tests use Node's built-in runner.
- **Engine is pure.** Everything under `src/` except `src/ui/` takes state and an RNG and returns/mutates plain JSON-serialisable data. No DOM, no `Math.random`, no `Date` in the engine.
- **One state object.** The whole career is one plain object so save/load is `JSON.stringify`/`JSON.parse`. Every save carries `version`; each phase that changes the shape bumps it and adds a migration in `src/save.js`.
- **Determinism.** Same seed + same inputs = same career. This is what makes Phase 12 soak tests and bug reports reproducible.
- **Storage ceiling.** `localStorage` (≈5 MB). Phase 1 state is ≈0.5 MB. If Phase 8–9 push past ≈3 MB, switch `src/save.js` to IndexedDB — nothing else needs to change.
