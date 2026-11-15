# Fun Surprises

Small quirks in Touchline's rules that a curious player can find and use. They are left in on purpose: they make the game more interesting to poke at. They are not bugs to fix.

**Rule for every phase:** when a review or playtest turns up a minor quirk that is fun or interesting for the player, keep it, add it here, and mention it in the end-of-phase summary. Only remove one if it breaks the game (crashes, corrupts a save, or makes every other choice pointless). If a later phase rewrites the code a quirk lives in, carry the quirk over or note here that it was retired and why.

| # | Surprise | How to use it | Where it lives | Since |
|---|----------|---------------|----------------|-------|
| 1 | **Free formation edge.** 4-3-3 gives +3% attack and 5-3-2 gives +3% defence at no cost. Attack and defence are averages over the players in those lines, so dropping a midfielder to add a forward or defender loses nothing. 3-5-2 and 4-5-1 pay for their extra midfielder with −3% defence and −3% attack respectively. AI clubs always play 4-4-2, so only you can use this. | Pick 4-3-3 when chasing goals, 5-3-2 when protecting a lead or facing a stronger side. | `strength()` in `src/lineup.js` | Phase 1 |
| 2 | **Youth flipping.** Players aged 23 or under gain attributes every season up to their hidden potential, and they are valued 30% higher than players aged 24–30. Buying a young player, holding him for a few seasons and selling just before he turns 24 reliably makes money. | Buy cheap 17–20-year-olds, sell at 23. | `ageOneYear()` and `value()` in `src/player.js` | Phase 1 (kept 2026-11-15) |

## Design decisions that came out of this list

- **Free agents partly carry over (2026-11-15).** The free-agent list used to be fully regenerated each season. It is to keep half of the previous list (aged one year, retirees dropped) and top up with new players. Scheduled in `docs/superpowers/plans/2026-11-15-touchline-phase-1b-real-world.md`, Task 1.
