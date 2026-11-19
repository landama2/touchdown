# Touchline Phase 10d: top scorers and top assists, with prize money

Status: proposal, waiting for the owner's answers (open questions at the end). Base: main @ 91567f4.
Independent of Phase 10c (Star points); either can go first. One save bump (the next free version number).

## The owner's request (2026-11-19)
Seasonal rankings of top scorers and top assists, and a cash bonus for winning them.

## What the code does today

- `addMatch()` in `src/awards.js` keeps `p.stats = { apps, goals, assists, rating }` for every player in **league**
  matches. Assists are counted already but never shown or rewarded.
- `seasonAwards()` gives three awards per division at the season's end: player of the season, top scorer, young player.
  Top-scorer ties go to the player with fewer games. The awards are stored in `s.history[i].divs[d].awards` and shown
  on History.
- There is no ranking during the season. The only place a player's goals show is his own season line.
- Stats live on the player, so a player sold in January takes his goals with him and is ranked in his new club's
  division. `endSeason()` deletes `p.stats` for everyone.
- Prize money: `payPrizes()` in `src/finance.js` pays league merit money (`MERIT`) and the cup (`CUP_PRIZE`), booked as
  `prize` in the club's ledger.

## 1. Live rankings

New in `src/awards.js`:

```js
// The top n of division d by goals (or assists): [{ id, name, club, apps, v }], live during the season.
// Ties: fewer games first, then the lower id (stable).
export function ranking(s, d, key, n = 20)
```

Players at the division's clubs who have `p.stats` with `v > 0`. The same tie-break as the top-scorer award, so the
leader of the ranking on the last day is the award winner.

UI (`src/ui/app.js`): the **Table** tab gets three sub-views: *Table · Scorers · Assists*, with the same division
picker it has now. Columns: rank, player, club badge, games, goals (or assists), per game. Your players in bold;
clicking a name opens the profile. On the Squad screen's season columns, a small "3rd" marker next to a player's goals
or assists when he is in his division's top 3.

## 2. A top-assists award

`seasonAwards()` gets a fourth award, `assists`, chosen like `scorer` (most assists, fewer games on a tie). History shows
"Top assists" under "Top scorer". Old seasons in history have no `assists` award; the History view skips missing awards
(it already does for `awards: undefined`).

Records (`noteSeason`):
- per division: **most assists in a season** (`s.records[d].assists`), next to most goals;
- per club: best assister in a season (`c.rec.assists`), next to its best scorer.

## 3. Prize money for winning

Paid in `payPrizes()` at the season's end, booked as `prize` in the club's ledger, so it appears in the club's books
and in History's prize line for your club.

| Division | Top scorer | Top assists |
|----------|-----------|-------------|
| Premier League | €1.0M | €0.75M |
| Championship | €250k | €200k |
| League One | €100k | €75k |

For scale: one league place is worth €2.5M in the Premier League (`MERIT`), so the bonus is about half a league place.
A nice extra, not a reason to field a weaker team. In League One €100k is a decent signing.

Kept in `finance.js` as `SCORER_PRIZE` / `ASSIST_PRIZE` by division (`byDiv`), like `MERIT`.

The winner himself:
- morale +15 (capped at 100), which by fun surprise #15 makes him cheaper to renew in the summer;
- his transfer value is unchanged (it comes from overall and age only).

The inbox gets a message when your player wins: "Erling Haaland is the Premier League's top scorer with 27 goals.
The club receives €1.0M."

## Files

- `src/awards.js`: `ranking()`, the `assists` award, assists records.
- `src/finance.js`: `SCORER_PRIZE`, `ASSIST_PRIZE`; `payPrizes(s, tables, cup, me, awards)` pays them.
- `src/season.js` `endSeason()`: pass `awards` to `payPrizes` (awards are computed before it already); morale boost.
- `src/career.js`: inbox post type `goldenBoot` (scorer or assists, with amount).
- `src/ui/app.js`: Table sub-views, Squad top-3 markers, History "Top assists" and the assists records.
- `src/save.js`: migration `s.records[d].assists = null`, `c.rec.assists = null`; `valid()` checks them.

## Tests (`tests/awards.test.js`, new, plus `tests/finance.test.js`)

- `ranking()` orders by goals, then fewer games, then id; leaves out players with none; respects `n`.
- After a full simulated season the ranking's leader is the `scorer` award's winner, and likewise for assists.
- `payPrizes` pays the top scorer's and top assister's clubs the right amount by division, booked as `prize`; a club
  with both gets both.
- Records: most assists per division and per club update only on a higher number.
- A v-old save migrates and plays a season; old history entries without an assists award render.

## Fun surprises to record (candidates)

- **Buy the Golden Boot.** Goals travel with the player: sign the league's top scorer in January and, if he stays on
  top, your club collects the prize, even with most of his goals scored for someone else.
- **Change the division, change the race.** A striker sold to a club in another division takes his goals into that
  division's race.

## Open questions for the owner

1. **Who gets the cash: the club or you?** As planned the club gets it (prize money in its books). Alternative or as
   well: the manager gets a personal bonus (`s.career.money`) when his player wins, like the trophy bonus.
2. **Ties: shared or decided?** As planned, fewer games wins (today's rule). Real leagues share the award: shared,
   with the money split?
3. **League only, or the cup too?** Today only league goals are counted. A separate cup top-scorer ranking needs cup
   stats (`addMatch` only runs for league matches); no prize planned for it.
4. **Places 2 and 3:** prize only for the winner, or smaller amounts for 2nd and 3rd?
5. **Amounts:** happy with the table above, or bigger so it changes how you pick the team (e.g. ×3)?

## Order of work if approved
1 (ranking + Table sub-views) → 2 (assists award, records) → 3 (prize money, morale, inbox) → save bump.
Each with tests, `npm test` green, fun-surprises updated, roadmap row 10d.
