# Touchline Phase 10d: top scorers and top assists, with prize money

Status: approved 2026-11-19 with the answers below; ready to implement. Base: main @ 91567f4.
Independent of Phase 10c (Star points); either can go first. One save bump (the next free version number).

## The owner's request (2026-11-19)
Seasonal rankings of top scorers and top assists, and a cash bonus for winning them.

## Owner's answers (2026-11-19)
1. The cash goes to **both** the club and the manager.
2. Ties: today's rule (fewer games wins, then the lower id). No shared awards.
3. League goals only.
4. Prizes for the **top 3**.
5. Amounts as proposed.

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

## 3. Prize money for the top 3

Paid in `payPrizes()` at the season's end, booked as `prize` in the club's ledger, so it appears in the club's books
and in History's prize line for your club. Places 2 and 3 get half and a quarter of the winner's amount.

| Division | Top scorer 1st / 2nd / 3rd | Top assists 1st / 2nd / 3rd |
|----------|----------------------------|-----------------------------|
| Premier League | €1.0M / €500k / €250k | €750k / €375k / €190k |
| Championship | €250k / €125k / €60k | €200k / €100k / €50k |
| League One | €100k / €50k / €25k | €75k / €40k / €20k |

For scale: one league place is worth €2.5M in the Premier League (`MERIT`), so the winner's bonus is about half a
league place: a nice extra, not a reason to field a weaker team. A club with two players in the top 3 gets both.

Kept in `finance.js` as `SCORER_PRIZE` / `ASSIST_PRIZE` by division (`byDiv`, like `MERIT`) and `PLACE_SHARE = [1, 0.5, 0.25]`
(amounts rounded to €10k).

**The manager's bonus.** When one of your players makes a top 3, you get a personal bonus too, in `s.career.money`
next to the season bonuses in `src/career.js`: 2% of your salary for a win, 1% for 2nd, 0.5% for 3rd, per ranking.
Tied to your salary like the trophy bonus, so it scales with the job, not the division.

The top 3 come from `ranking(s, d, key, 3)`, the same list the Table view shows, so the order on the last day is the
order paid. The award in history is still the winner only (plus `assists`).

The winner himself: morale +15 (capped at 100), which by fun surprise #15 makes him cheaper to renew in the summer;
2nd and 3rd +5. His transfer value is unchanged (it comes from overall and age only).

The inbox gets a message for each of your players in a top 3: "Erling Haaland is the Premier League's top scorer with
27 goals. The club receives €1.0M; your bonus is €40k."

## Files

- `src/awards.js`: `ranking()`, the `assists` award, assists records.
- `src/finance.js`: `SCORER_PRIZE`, `ASSIST_PRIZE`, `PLACE_SHARE`; `payPrizes(s, tables, cup, me)` pays the top 3 of each ranking.
- `src/season.js` `endSeason()`: pass `awards` to `payPrizes` (awards are computed before it already); morale boost.
- `src/career.js`: the manager's ranking bonus (`BONUS.ranking`) in the season review; inbox post type `ranking` (which, place, club amount, bonus).
- `src/ui/app.js`: Table sub-views, Squad top-3 markers, History "Top assists" and the assists records.
- `src/save.js`: migration `s.records[d].assists = null`, `c.rec.assists = null`; `valid()` checks them.

## Tests (`tests/awards.test.js`, new, plus `tests/finance.test.js`)

- `ranking()` orders by goals, then fewer games, then id; leaves out players with none; respects `n`.
- After a full simulated season the ranking's leader is the `scorer` award's winner, and likewise for assists.
- `payPrizes` pays the top 3 scorers' and assisters' clubs the right amounts by division and place, booked as
  `prize`; a club with several places gets them all; a tie on goals is decided by fewer games.
- The manager gets the salary-based bonus for each of his players in a top 3, and nothing for other clubs' players.
- Records: most assists per division and per club update only on a higher number.
- A v-old save migrates and plays a season; old history entries without an assists award render.

## Fun surprises to record (candidates)

- **Buy the Golden Boot.** Goals travel with the player: sign the league's top scorer in January and, if he stays on
  top, your club collects the prize, even with most of his goals scored for someone else.
- **Change the division, change the race.** A striker sold to a club in another division takes his goals into that
  division's race.

## Order of work if approved
1 (ranking + Table sub-views) → 2 (assists award, records) → 3 (top-3 prize money, manager bonus, morale, inbox) → save bump.
Each with tests, `npm test` green, fun-surprises updated, roadmap row 10d.
