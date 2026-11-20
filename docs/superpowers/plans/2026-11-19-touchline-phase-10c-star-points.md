# Touchline Phase 10c: Star points, young legends and a hall of fame

Status: done 2026-11-20 (save version 15; Phase 10d took 14). Base: main @ 91567f4. See "As built" at the end.

## Decisions already made (2026-11-17, Phase 10b discussion)
1. Only stars retiring **from your club** earn Star points.
2. Current stars can be legends too (not only retired greats).
3. Real names.
4. Potential always high: no flops.
5. AI clubs can get legends too, at a much smaller chance.

## Owner's answers (2026-11-19)
1. Tenure counts from when he joined the club, not from when you arrived.
2. A legend arrives in the **youth squad**, not the first team.
3. No limit on legends a season: points are the only brake.
4. Marked on screen: "Thierry Henry ★". The save keeps the plain name with `p.legend`.
5. Hall of fame keeps apps and goals (`p.tally`).
6. Your own retired stars become legends at 2 points off.

## The loop in one paragraph

Keep a star to the end of his career and, when he retires at your club, you earn Star points. Points belong to the
manager (`s.career`), so they follow you from job to job and survive a sacking. Spend them on a 17-year-old "young
version" of a legend: a hand-made list of greats (Henry, Zidane, Maldini, Yamal…), plus every real star who retires
anywhere in the world during your career. The youngster joins your youth squad with modest attributes, a
guaranteed high ceiling, and a signature shape (a pace-and-finishing forward, a vision-and-touch playmaker). He has to be
trained to get there. Your retired stars go into a Hall of fame.

## What the code does today (the hooks this phase uses)

- `endSeason()` in `src/season.js:241`: every player aged `RETIRE_AGE` (35) or more is swapped for an `academy()` kid.
  Nobody looks at who retired. Loans have already come home (`returnLoans` runs first), so a star you loaned out
  retires from your club.
- The world starts with old stars who retire after season one: Van Dijk (35, overall 84), Trippier (35, 80),
  Walker (36, 79), Vardy (39, 78); Dunk (34, 88) and Leno (34, 86) a year later.
- Season awards are kept per season in `s.history[i].divs[d].awards` with player ids, so a player's award count can be
  read from history: no new storage needed.
- Season stats (`p.stats`) are deleted every summer; there is no record of how long a player has been at his club
  (`p.joined` is only the transfer window, for the "only just joined" rule).
- Overall per division at the start (seed 1): top 10% line is **82** in the Premier League, **75** in the Championship,
  **66** in League One. Medians 70 / 65 / 56.

## 1. Who is a star

A player who retires from your club is a **star** if either:
- his overall is in the top 10% of his division that season (computed live at `endSeason`, so it follows the
  rating drift Phase 10b's training brings), or
- he won any season award (player, top scorer, young player) in any season, at any club.

Live line rather than fixed numbers: a 70-rated League One captain is a star there; the same 70 in the Premier League
is a squad player.

## 2. Star points

| For | Points |
|-----|--------|
| A star retiring from your club | 2 |
| Each full season at the club after the first, counted from when he joined it, also before you arrived (cap 4) | +1 |
| Each season award he ever won (cap 3) | +1 |
| He retires in the Premier League | +1 |

Range 2–10. Examples from the real data:
- Manage Liverpool from day one: Van Dijk retires after season 1 → 2 + 0 + 0 + 1 = **3**.
- A League One captain who stays four seasons and wins one player of the season → 2 + 3 + 1 = **6**.
- Buy a 34-year-old Premier League star in the summer and let him retire → 3. Not enough for a legend on its own:
  the tenure bonus is where the points are, which is the point of the feature (keep your veterans).

**Tenure needs a new field**: `p.since`, the season he joined his current club. Set in `move()` (`src/market.js`),
`promote()`/`fromYouth()` (`src/youth.js`), `academy()` (`src/contracts.js`) and at world creation (`s.season`, as
the data has no join dates). A loan does not reset it.

## 3. The legends

New file `src/data/legends.js`, hand-made, about 40 entries:

```js
// [name, pos, tier, signature attributes]
['Thierry Henry', 'FW', 'icon', ['pace', 'finishing', 'composure']],
['Zinedine Zidane', 'MF', 'icon', ['firstTouch', 'vision', 'dribbling']],
['Paolo Maldini', 'DF', 'icon', ['positioning', 'tackling', 'composure']],
['Gianluigi Buffon', 'GK', 'icon', ['reflexes', 'handling', 'positioning']],
['Lamine Yamal', 'FW', 'great', ['dribbling', 'vision', 'agility']],
['N\'Golo Kanté', 'MF', 'great', ['workRate', 'stamina', 'tackling']],
['Andrea Pirlo', 'MF', 'great', ['passing', 'vision', 'composure']],
['Peter Crouch', 'FW', 'star', ['heading', 'firstTouch', 'composure']],
```

**Why the ceiling alone can't make a legend special** (owner's point, 2026-11-19). Attributes stop at 20, so the
best possible ceiling is overall 100. A top club's free youth intake already reaches it. Measured over 30 seeds, at the
strongest club of each division:

| Division | Youth with `pot` 20 | Median ceiling | Median overall at 15–16 |
|----------|---------------------|----------------|-------------------------|
| Premier League | 73% | 100 | 70 |
| Championship | 17% | 90 | 55 |
| League One | 0% | 70 | 35 |

The first draft (`pot` 18–20, overall 62–68 at 17) was worse than a free kid at a Premier League club. Revised:
**every legend gets `pot` 20**, and the tiers differ in how good he is **now** and how fast he grows. A legend
should be the best youngster in the country the day he arrives, at any club.

| Tier | `pot` | Overall at 17 | Growth | Peak, roughly | Cost |
|------|-------|---------------|--------|---------------|------|
| Star | 20 | ~76 | ×1.5 | 95+ by 21 | 4 |
| Great | 20 | ~82 | ×2 | 97+ by 20 | 7 |
| Icon | 20 | ~88 | ×2 | 99–100 by 19–20 | 10 |

What else sets them apart from a free youth:
- **Ready now.** An Icon at 17 starts for most Premier League clubs; a free top-club kid at 70 does not.
- **Faster growth** (`LEGEND_GROW` by tier): a factor on the growth chance in `trainYouth` and `trainWeek`, on top of
  coaching and age. A free kid takes about six seasons from 70 to the 90s; an Icon is there in two.
- **Late decline.** Physical decline starts at 33 instead of 31 (`DECLINE_AGE` per player via `p.legend`): two more
  seasons at the peak.
- **A rounded player.** The signature attributes start at 17–18 and every non-key attribute sits only 2 below the key
  ones (a free player's sit 4 below), so his overall holds up in a second position.
- **Known for sure.** His ceiling is shown exactly (100), not as a coaching-dependent range.

For a League One or Championship club, where free youth rarely pass 70–90, a legend is the only way to get a
100-ceiling player at all.

**How a legend is built** (`makeLegend()` in new `src/legends.js`): `createPlayer(rng, id, pos, quality, 17)` at the
tier's start quality (Star 14, Great 15, Icon 16), non-key attributes raised to key − 2, the signature attributes set
to 17 (Icon 18), `p.pot = 20`. Tests check every list entry lands within ±3 of the tier's overall at 17.

A legend left on the bench at a club with level-1 coaching still grows slowly: no flops in the ceiling, but the
manager can still waste him.

Legends carry `p.legend = 'icon' | 'great' | 'star'`; the UI writes the name with a ★ ("Thierry Henry ★") everywhere
it shows a player (squad, youth, profile, match, commentary, tables), via one `pname(p)` helper. Their
potential is shown exactly, not as a range: you paid for it.

**Current stars and name clashes.** Most of the list plays outside England, so they are not in the world. A legend
whose namesake is still playing in the world (e.g. Haaland, Salah) is hidden until the real one retires.

**The loop: new legends from in-game retirements.** Every player who retires anywhere as a star of the Premier
League (top-10% line) joins `s.legends.extra` the next summer, with tier from his overall at retirement
(≥ 88 Icon, ≥ 84 Great, else Star) and signature = his three best key attributes. Your own retired stars
(any division) join too and cost **2 points less**: a young version of the captain who just retired for you.

## 4. Getting one

- New tab **Legends** (also reachable from Youth): your points, the list grouped by tier with cost, signature and
  position, filters by position; and the Hall of fame below it.
- **Sign** button: any time, as many as your points buy; needs a free youth place (`YOUTH_MAX` 20). No fee, no wage
  while in the youth squad.
- In the youth squad he trains with the youth (`trainYouth`, coaching-scaled) and is promoted like any youth player
  with `promote()` onto a starter contract (`YOUTH_YEARS`, 3 seasons). When that ends he negotiates like anyone
  else: a 20-year-old at 85 will ask for a lot. That is deliberate.
- **He must be promoted before 19** (`LEAVE_AGE`): at 17 that gives two summers. A legend left in the youth squad at
  19 leaves like any other youth player, and is gone from the list for good. The Youth tab warns a season ahead.
- **Changing jobs.** Today the youth squad is wiped when you change club (fun surprise #23). Legends in it come with you
  instead (like players of your own, fun surprise #31): `takeClub()` keeps youth players with `p.legend`. If the new
  youth squad is full, the intake is cut, not the legend. When you are sacked they wait with you
  (`s.career.waiting`) and join your next club's youth squad.
- Each legend exists once per world. Once you or an AI club has him, he is gone from the list.
- Unemployed: points keep, signing waits for a job.

## 5. AI clubs

Each summer, for each star retiring from an AI club: a 1-in-20 chance that a legend replaces the academy kid who fills
his place, straight into the first team (AI clubs have no youth squads). Pick weighted 6 : 3 : 1 Star : Great : Icon from what is left. About 6–10 stars retire world-wide a
season, so an AI legend turns up roughly every two or three seasons, and sometimes takes the one you were saving for.

**Determinism and calibration.** The AI roll uses its own RNG seeded from `(s.seed, s.season)`, not the world's
stream, so the existing random sequence and every calibration test stay unchanged (the same trick as Phase 10's
AI managers).

## 6. Hall of fame

`s.career.hall`: one row per star who retired at a club you managed, kept for the whole career:
`{ name, pos, club, season, ovr, seasons, awards, apps, goals, points }`.

`apps` and `goals` need a career tally that survives the summer wipe: `p.tally = { apps, goals }` at his current
club, added from `p.stats` in `endSeason` before `delete p.stats`, reset by `move()`. About 2,000 players × ~20 bytes,
≈ 40 kB of save: fine under the storage ceiling.

The inbox gets a message on each retirement: "Virgil van Dijk retires. 8 seasons, 1 award. +3 Star points."

## Files

- `src/legends.js` (new): `isStar()`, `starPoints()`, `retireStars(s, retirees)`, `makeLegend()`, `available(s)`,
  `signLegend(s, key)` (error message or null), `aiLegends(s, retirees)`.
- `src/data/legends.js` (new): the hand-made list, with a header comment on sources and the real-names rule.
- `src/youth.js`: `ageYouth()` warns on legends turning 18; legends keep a place over the intake.
- `src/season.js` `takeClub()`: keep legends in the youth squad (and `s.career.waiting`) instead of wiping them.
- `src/season.js` `endSeason()`: collect retirees before the academy swap; call `retireStars` and `aiLegends`; add
  `p.stats` into `p.tally`.
- `src/market.js` `move()`, `src/youth.js` `promote()`/`fromYouth()`, `src/contracts.js` `academy()`: set `p.since`,
  reset `p.tally`.
- `src/career.js`: `stars`, `hall`, `waiting` on `s.career`; sacking moves youth legends to `waiting`; inbox post types `retired`, `legend`.
- `src/ui/app.js`: Legends tab + Hall of fame; ★ marker; retirement inbox texts.
- `src/save.js`: v14: `p.since = s.season`, `p.tally = { apps: 0, goals: 0 }` on every player; `s.career.stars = 0`,
  `hall = []`, `waiting = []`; `s.legends = { used: [], extra: [] }`; `valid()` checks them.

## Tests (`tests/legends.test.js`)

- A top-10% player retiring from your club makes a hall row and the right points (tenure cap, award cap, Premier
  League bonus); a non-star gives none; a star retiring at an AI club gives you nothing.
- A loaned-out star of yours retiring counts for you.
- `makeLegend`: age 17, `pot` 20, overall within ±3 of the tier's start (76 / 82 / 88) for every list entry;
  signature attributes at 17–18; non-key attributes key − 2.
- A legend grows faster than a free youth with the same attributes (tier factor), and declines from 33, not 31.
- At the strongest Premier League club, a Star-tier legend at 17 is better than every player in the free intake.
- `signLegend`: rejects no points, full youth squad, unknown or used legend, no job; takes points, puts him in
  `s.youth` with no contract; two in one season both work.
- A legend in the youth squad survives a job change and a sacking (via `waiting`); one left there at 19 leaves.
- `pname()` adds the ★ only for legends.
- Namesake still in the world → hidden; after he retires → offered next summer.
- AI legends: the world's own RNG sequence is unchanged by the AI roll (same world after a season with and without it).
- Save: a v13 save migrates and plays a season.
- An Icon trained at Normal reaches overall 95 by 20 (guards the "no flops" promise).

## Fun surprises to record (candidates)

- **The retirement home.** A 34-year-old Premier League star bought in the summer earns 3 points when he retires a
  year later, whatever he cost.
- **Lend him, keep him.** A star you loaned out still retires from your club: his points come home with him.
- **The race for Henry.** Legends are once per world. An AI club can draw the one you were saving for.

## Owner's follow-up (2026-11-19)
Legend potential capped around the first draft's 86–95 was too low next to free top-club youth. Revised above: `pot`
20 for all, tiers by starting level and growth speed, late decline.

## Fun surprises to add if they survive

- **The legend ladder.** A legend in the youth squad costs nothing until promoted, and youth players need no squad
  place. Bank a few and promote them one by one as the first team has room.

## Order of work if approved
1 (stars, `p.since`) → 2 (points, hall, inbox) → 3 (legend list and builder) → 4 (Legends tab, signing) →
5 (AI legends) → save v14. Each with tests, `npm test` green, fun-surprises updated, roadmap row 10c.

## As built (2026-11-20)

- **Starting levels raised again.** Free youth at the strongest Premier League club peak at overall 73–79 (20 seeds, usually
  75–76), so the tiers start at **80 / 85 / 90** (Star / Great / Icon), not 76 / 82 / 88. `makeLegend` nudges the
  non-signature key attributes until the overall is the tier's ±1 (every list entry checked in tests).
- **Growth ×2 for every tier** (`LEGEND_GROW` in `src/player.js`); Star was ×1.5 and too slow. Measured at Arsenal,
  promoted at once: Icons 89 → 99 by 20, Stars 75 → 94–98 by 20 (with the old start levels).
- **AI chance 1 in 30**, not 1 in 20: award winners count as stars too, so 1 in 20 gave 0.69 AI legends a season
  (4 seeds × 4 seasons); 1 in 30 gives about one every two seasons.
- **Your retirees are counted before contracts end.** A 35-year-old's contract always ends in his last season, so at
  your club he leaves through `expireContracts` (to the free-agent list, where he retires), never through the AI
  retirement swap. `retireStars` therefore runs right after loans come home and before contracts expire, with each
  club's division from before promotion and relegation.
- **Seasons at the club start at the world's start** (`p.since = 1`): the data has no join dates, so Van Dijk retiring
  from Liverpool after season 1 counts one season (3 points).
- An AI legend takes the academy youngster's id and contract and arrives at 17 straight into the first team; the
  inbox reports it ("⭐ Burnley have signed a young Didier Drogba ★"). The world's random sequence and ids are
  unchanged (tested).
- The ★ comes from `displayName()` in `src/player.js`: squad lists, profile, youth, match screen and commentary, the
  scorer/assist rankings and the awards. Free youth ceilings above 100 on the Youth screen are a range artefact from
  before this phase (left as it is).
- Disabled buttons are now greyed out (`index.html`), so unaffordable legends show it.
- Fun surprises #36–#39 recorded.
