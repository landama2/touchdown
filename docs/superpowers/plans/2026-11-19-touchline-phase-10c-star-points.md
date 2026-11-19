# Touchline Phase 10c: Star points, young legends and a hall of fame

Status: proposal, waiting for the owner's answers (open questions at the end). Base: main @ 91567f4.
One save bump (13 → 14) covers everything below.

## Decisions already made (2026-11-17, Phase 10b discussion)
1. Only stars retiring **from your club** earn Star points.
2. Current stars can be legends too (not only retired greats).
3. Real names.
4. Potential always high: no flops.
5. AI clubs can get legends too, at a much smaller chance.

## The loop in one paragraph

Keep a star to the end of his career and, when he retires at your club, you earn Star points. Points belong to the
manager (`s.career`), so they follow you from job to job and survive a sacking. Spend them on a 17-year-old "young
version" of a legend: a hand-made list of greats (Henry, Zidane, Maldini, Yamal…), plus every real star who retires
anywhere in the world during your career. The youngster arrives on a starter contract with modest attributes, a
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
| Each full season at your club after the first (cap 4) | +1 |
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

Tiers set the cost and the ceiling:

| Tier | Potential (`pot`) | Peak overall, roughly | Cost |
|------|-------------------|-----------------------|------|
| Star | 18 | ~86 | 4 |
| Great | 19 | ~91 | 7 |
| Icon | 20 | ~95 | 10 |

**How a legend is built** (`makeLegend()` in new `src/legends.js`): `createPlayer(rng, id, pos, quality, 17)` at
`pot − 7` quality, then the signature attributes +3 (never above `pot`), then `p.pot` set by tier.
At 17 he is about overall 62–68 (a League One starter, a Premier League squad kid). Phase 10b training gives about
4 key-attribute points a season to 23, so with Normal training he reaches ~85+ around 22–23; with Hard and good
coaching, sooner. A legend left on the bench at a club with level-1 coaching never gets there: no flops in the
ceiling, but the manager can still waste him.

Legends carry `p.legend = 'icon' | 'great' | 'star'` (shown as ★ on the profile and in squad lists) and their
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
- **Sign** button: one legend per season, any time of the season; needs a free squad place. He joins the first team on
  a starter contract (`YOUTH_YEARS`, 3 seasons, wage from `wage(p)`), no fee. When it ends he negotiates like anyone
  else: a 20-year-old at 85 will ask for a lot, and a club that can't pay may lose him. That is deliberate.
- Each legend exists once per world. Once you or an AI club has him, he is gone from the list.
- Unemployed: points keep, signing waits for a job.

## 5. AI clubs

Each summer, for each star retiring from an AI club: a 1-in-20 chance that a legend replaces the academy kid who fills
his place. Pick weighted 6 : 3 : 1 Star : Great : Icon from what is left. About 6–10 stars retire world-wide a
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
- `src/season.js` `endSeason()`: collect retirees before the academy swap; call `retireStars` and `aiLegends`; add
  `p.stats` into `p.tally`.
- `src/market.js` `move()`, `src/youth.js` `promote()`/`fromYouth()`, `src/contracts.js` `academy()`: set `p.since`,
  reset `p.tally`.
- `src/career.js`: `stars`, `hall`, `legendSeason` on `s.career`; inbox post types `retired`, `legend`.
- `src/ui/app.js`: Legends tab + Hall of fame; ★ marker; retirement inbox texts.
- `src/save.js`: v14: `p.since = s.season`, `p.tally = { apps: 0, goals: 0 }` on every player; `s.career.stars = 0`,
  `hall = []`, `legendSeason = null`; `s.legends = { used: [], extra: [] }`; `valid()` checks them.

## Tests (`tests/legends.test.js`)

- A top-10% player retiring from your club makes a hall row and the right points (tenure cap, award cap, Premier
  League bonus); a non-star gives none; a star retiring at an AI club gives you nothing.
- A loaned-out star of yours retiring counts for you.
- `makeLegend`: age 17, `pot` by tier, signature attributes above the rest, overall in 60–70 for every list entry.
- `signLegend`: rejects no points, one-a-season, full squad, unknown or used legend; takes points, adds a starter
  contract.
- Namesake still in the world → hidden; after he retires → offered next summer.
- AI legends: the world's own RNG sequence is unchanged by the AI roll (same world after a season with and without it).
- Save: a v13 save migrates and plays a season.
- A legend trained at Normal for 6 seasons ends within 4 of his ceiling (guards the "no flops" promise).

## Fun surprises to record (candidates)

- **The retirement home.** A 34-year-old Premier League star bought in the summer earns 3 points when he retires a
  year later, whatever he cost.
- **Lend him, keep him.** A star you loaned out still retires from your club: his points come home with him.
- **The race for Henry.** Legends are once per world. An AI club can draw the one you were saving for.

## Open questions for the owner

1. **Tenure: at the club, or under you?** A veteran who spent 8 seasons at a club you took over last year: does he
   bring 8 seasons of points (as above, rewards taking over clubs with loyal veterans) or only the seasons he played for
   you?
2. **Where does a legend arrive?** First team at 17 (as above), or the youth squad (then he leaves at 19 if not
   promoted, and squad room is not needed)?
3. **One legend a season** — or no limit, with points as the only brake?
4. **Name**: plain real name ("Thierry Henry"), or marked as the young version on screen ("Thierry Henry ★")? The
   save keeps the real name either way.
5. **Hall of fame stats**: worth the `p.tally` field (apps and goals at the club), or keep the hall to seasons, awards
   and overall?
6. **Your own retired stars as legends** at 2 points off: yes, or keep only the hand-made list plus Premier League stars?

## Order of work if approved
1 (stars, `p.since`) → 2 (points, hall, inbox) → 3 (legend list and builder) → 4 (Legends tab, signing) →
5 (AI legends) → save v14. Each with tests, `npm test` green, fun-surprises updated, roadmap row 10c.
