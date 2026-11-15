# Touchline — Full Game Roadmap

**Goal:** Grow Touchline from a one-league demo into a full-depth football management game with the mechanics the genre is known for.

**Not a goal:** reproducing any existing commercial game. Touchline keeps its own name, visual identity, screen layouts and wording. Genre mechanics (tactics, transfers, scouting, training…) are fair game; another product's name, database, ratings, UI look or text are not.

**Real names (decided 2026-11-15):** this is a personal, private project, so real club and player names are wanted, not avoided. Phase 1 shipped with generated fictional names and a deny-list that blocks real town names; that is to be replaced by a real-world data set (see "Real-world data" below). Attribute values are our own estimates, not taken from any game's database. No crests, kits or other artwork.

**Fun surprises (decided 2026-11-15):** minor quirks that are fun or interesting for the player are kept, not fixed. Each one is recorded in `docs/fun-surprises.md` and mentioned in the end-of-phase summary. Every phase's review triage must apply this rule.

**How to use this file:** each phase below is its own implementation plan in this folder, written in detail just before that phase starts (so it can reference the real code that exists by then). Every phase ends with a playable, tested game. Phases are ordered by dependency; do not skip ahead.

| # | Phase | Delivers | Depends on | Plan file |
|---|-------|----------|------------|-----------|
| 1 | Foundation | ES-module engine, seeded RNG, attribute-based players with hidden potential, 3 divisions × 16 clubs, versioned saves, UI ported | — | `2026-11-15-touchline-phase-1-foundation.md` (written) |
| 1b | Real world | English top 3 divisions 2026–27 with real clubs and squads, our own ratings, original badges and kits in club colours, free agents partly carry over | 1 | `2026-11-15-touchline-phase-1b-real-world.md` (written) |
| 2 | Match engine | Minute-by-minute simulation: possession chains, shots with chance quality, cards, in-match injuries, fatigue, substitutions, player ratings; live commentary view with speed control and in-match changes | 1 | to write |
| 3 | Tactics | Player roles and duties, mentality, pressing, tempo, width, defensive line, set-piece takers, per-player instructions, tactical familiarity; the engine from Phase 2 reads all of it | 2 | to write |
| 4 | Competitions & calendar | Day-based calendar, promotion/relegation with play-offs, a knockout cup across all divisions, season awards, club and league records | 1 | to write |
| 5 | Squad dynamics | Match fitness and condition, injuries with recovery times, suspensions, morale, form, training schedules that drive attribute development | 2, 4 | to write |
| 6 | Contracts & finances | Wages, contract lengths, renewals, release clauses, negotiations; club income (gate, sponsorship, prize, broadcast) and costs; separate transfer and wage budgets | 4 | to write |
| 7 | Transfer market | Transfer windows, AI clubs buying and selling, bids and counter-offers, loans, free agents, player willingness to move | 6 | to write |
| 8 | Scouting & knowledge | Attributes of unknown players shown as ranges, scouts with assignments and reports, shortlists, player search and filters | 7 | to write |
| 9 | Youth & staff | Annual academy intake, youth squad, staff (coaches, scouts, physios) with their own attributes that affect training, scouting accuracy and recovery; hiring and firing | 5, 8 | to write |
| 10 | Manager career | Board expectations and confidence, job security, sackings, job offers at other clubs, manager reputation, inbox with news and decisions | 6, 7 | to write |
| 11 | Interface | Touchline's own visual identity, player and club profile screens, 2D pitch match view, sortable/filterable tables, save slots with export/import, keyboard and screen-reader support | 2–10 | to write |
| 12 | Balance & soak | 20-season automated runs checked against statistical targets (goals per match 2.5–2.9, home wins 43–47%, plausible wage/value curves), performance budget, save-size budget | all | to write |

## Real-world data (decided 2026-11-15, planned as Phase 1b)

English Premier League, Championship and League One, 2026–27. Squads from public sources (Wikipedia) or memory. Ratings are Touchline's own 1–20 estimates, not copied from EA SPORTS FC / FIFA Index or any game database. Badges are original designs in club colours with a three-letter code; kits use real club colours and simple patterns, without crests or logos.

Phase 3 note: the formation edge listed in `docs/fun-surprises.md` must survive the tactics rewrite.

## Architecture decisions that hold for every phase

- **No build step, no runtime dependencies.** Browser loads ES modules directly; tests use Node's built-in runner.
- **Engine is pure.** Everything under `src/` except `src/ui/` takes state and an RNG and returns/mutates plain JSON-serialisable data. No DOM, no `Math.random`, no `Date` in the engine.
- **One state object.** The whole career is one plain object so save/load is `JSON.stringify`/`JSON.parse`. Every save carries `version`; each phase that changes the shape bumps it and adds a migration in `src/save.js`.
- **Determinism.** Same seed + same inputs = same career. This is what makes Phase 12 soak tests and bug reports reproducible.
- **Storage ceiling.** `localStorage` (≈5 MB). Phase 1 state is ≈0.5 MB. If Phase 8–9 push past ≈3 MB, switch `src/save.js` to IndexedDB — nothing else needs to change.
