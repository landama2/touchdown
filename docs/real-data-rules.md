# Real data rules

How the files in `src/data/england/` are compiled. Tasks that add or update squads follow these rules; `npm test` checks the format.

## Season and sources

- Season **2026–27**. Club membership of each division comes from the Wikipedia article for that division's 2026–27 season (for example "2026–27 Premier League", "2026–27 EFL Championship", "2026–27 EFL League One"). If an article is missing or incomplete, use the 2025–26 final tables plus that summer's promotions and relegations, and say so in the file header.
- Squads come from each club's Wikipedia article, "First-team squad" section (or the club's official site). Leave out players listed as out on loan. If a club lists fewer than 18 first-team players, add players from the club's under-21 or academy list on the same page.
- Knowledge from memory is allowed where a page is unavailable; the file header says which clubs were compiled that way.
- Each file starts with a comment giving the date compiled and the sources used.

## Club fields

- `name`: the club's common English name as written in the division's Wikipedia team list (for example "Brighton & Hove Albion", "Wolverhampton Wanderers").
- `short`: three capital letters, unique across all three files. Use the club's usual broadcast abbreviation where one exists (ARS, MCI, LIV); otherwise three distinctive letters of the name. Check the other files in `src/data/england/` before choosing.
- `colours`: `[main, second]` as `#rrggbb`, the club's two main colours. Used to draw Touchline's own badge.
- `kit`: the 2026–27 home kit, described with Touchline's simple model:
  - `pattern`: `plain`, `stripes` (vertical), `hoops` (horizontal), `halves`, `sash` (diagonal band) or `sleeves` (sleeves in the trim colour, as on a red shirt with white sleeves).
  - `shirt`, `trim`, `shorts`, `socks`: `#rrggbb`. `trim` is the second shirt colour (stripes, hoops, sash, sleeves, collar).
  - Colours only: no badge, sponsor or manufacturer logo is represented.

## Player rows

`[name, pos, age, rating]` or `[name, pos, age, rating, strengths]`, one row per line.

- `name`: as commonly written in English sources (the squad list on Wikipedia).
- `pos`: `GK`, `DF`, `MF` or `FW`, as in the squad list. Wing-backs are `DF`; wingers and attacking midfielders listed as forwards are `FW`.
- `age`: age on 1 August 2026, as an integer. Take it from the player's page where cheap; otherwise estimate. The file header states how many ages are estimates.
- `rating`: **Touchline's own judgement** on a 1–20 scale. Base it on public facts: the league the player plays in, whether he is a regular starter, international caps, recent seasons. If the player appears in `data/player_stats.csv` (the owner's dataset), you may use it as a reference; its 0–99 values divide by 5 onto this scale. Do not look up ratings on any other site or game (FIFA Index, Football Manager and the like). Players found in the dataset get their game attributes from it later (Task 6); the rating still sets club strength and covers everyone else. Scale (overall in the game is roughly 5 × rating + 6):

  | Rating | Meaning |
  |--------|---------|
  | 18–20 | Among the best in the world in his position |
  | 15–17 | Established Premier League starter |
  | 13–14 | Premier League squad player, or one of the best players in the Championship |
  | 11–12 | Championship starter |
  | 9–10 | Championship squad player, or League One starter |
  | 6–8 | League One squad player, young or fringe player |
  | 1–5 | Youth player not yet ready for first-team football |

- `strengths` (optional): up to three attribute keys where the player clearly stands out, from: passing, dribbling, finishing, tackling, heading, firstTouch, crossing, vision, positioning, composure, workRate, decisions, aggression, pace, stamina, strength, agility, handling, reflexes. Each one adds 2 to that attribute in the game. Leave it out when nothing stands out.

## Size

18–32 players per club, at least 2 goalkeepers. Clubs in the order of the division's Wikipedia team list.
