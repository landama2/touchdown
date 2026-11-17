# Touchline Phase 10b: training for every age, per-player intensity, budget split, manager money (+ Star points discussion)

Status: done 2026-11-17 (approved by the owner after the answers below). Base: main @ a896451.
One save bump (11 → 12) covers everything below.

## User answers (2026-11-17)
1. Age taper as proposed, AI clubs included: yes.
2. Per-player options include Rest (no growth, recovery +2/day like the team Rest focus).
3. Budget split: fixed numbers, no slider.
4. Salary scale / "back your own team": NO, something else. Clarification pending.
5. Star points (later phase): only players retiring from your club; current stars allowed; real names; potential always high (no flops);
   AI clubs can get legends too, with a much smaller chance.

## 1. Training helps players over 23

Today (`src/training.js` `trainWeek`): growth only when `p.age <= 23`; chance per week = `GROWTH 0.1 × INTENSITY.grow × coachScale`.
From 31, `DECLINE 0.05` a week takes a physical point whatever the schedule. So Hard is pure injury risk (×2.5) for anyone over 23.

Change: multiply the growth chance by an age factor instead of the `age <= 23` gate.

```js
// ponytail: linear taper, tune in Phase 12
export const ageGrow = age => age <= 23 ? 1 : Math.max(0.1, 0.7 - 0.08 * (age - 23));
```

| Age | factor | gains a season, Normal | Hard (injury ×2.5) |
|-----|--------|------------------------|--------------------|
| ≤23 | 1.0 | ~4.2 | ~5.5 |
| 24 | 0.62 | ~2.6 | ~3.4 |
| 26 | 0.46 | ~1.9 | ~2.5 |
| 28 | 0.30 | ~1.3 | ~1.6 |
| 30 | 0.14 | ~0.6 | ~0.8 |
| 31+ | 0.10 | ~0.4 | ~0.5 (decline stays ~2 physical a season) |

- The cap stays the hidden potential `pot`. For anyone created at 23+, `pot` = their best key attribute (`src/world.js:44`),
  so older players can only fill in their weaker key attributes up to their best one. They round out; they do not break through.
- Decline from 31 unchanged. A veteran on Hard gains a little and gets hurt a lot: a real trade-off, not a free buff.
- Applies to AI clubs too (they train at Normal), so the world stays fair.
- Risk: world-wide rating drift. Every 24–30-year-old drifts toward their pot. Test below bounds it.

Files: `src/training.js` (gate → factor, header comment), `src/ui/app.js` Training help text.
Tests (`tests/training.test.js`): replace "adults none" with: 26-year-olds gain between 1 and 3 a season at Normal and less than 19-year-olds;
Hard > Normal > Light for a 28-year-old; a 2-season world run (`createWorld` + sim) moves the average overall of players aged 24–30 by under N points.

## 2. Per-player training intensity

Mirror individual focus: `s.training.load = { [playerId]: 'Light'|'Normal'|'Hard' }`, absent = team intensity.

- `src/training.js`: `intensityOf(t, p) = INTENSITY[t.load?.[p.id] ?? t.intensity]` used in `trainWeek` for grow and injury;
  `recoverRate(t, p)` per player; `setLoad(s, id, v)` setter (v null = with the team), same checks as `setFocus`.
  `defaultTraining()` gains `load: {}`; `AI_TRAINING` freezes it too.
- `src/squad.js` `passDays(players, days, perDay)`: `perDay` may be a number or a function `p => rate`.
- `src/season.js` `between()`: `passDays(c.players, days, p => recoverRate(t, p))`.
- `src/ui/app.js` Training tab: an "Intensity" column next to "Individual focus" (With the team / Light / Normal / Hard), wired like `focus`.
- `src/save.js`: v12 migration `s.training.load = {}`; `valid()` checks it.
Tests: a Hard override on one player raises only his injuries/growth; recovery per player follows his own intensity; setter rejects junk and unknown ids.

## 3. Wage / transfer budget split in favour of transfers

Today (`src/finance.js` `seasonBudgets`): transfer = 50% of balance; wages = max(current bill, 70% of projected income / 52) + balance / 104.
A mid-table Premier League club (~€140M projected) gets ~€98M/yr for wages and starts with ~€17M to spend on fees.

Change constants only:
- `TRANSFER_SHARE 0.5 → 0.75`
- `WAGE_SHARE 0.7 → 0.55`
- savings top-up of wages from the part of the balance not given to transfers: `(1 - TRANSFER_SHARE) × balance / SAVINGS_WEEKS` (today the same euros back both budgets).

Effect: the wage budget never drops below the current bill (the `max` stays), so nobody is forced to sell; the 15 points of income no
longer earmarked for wages pile into the balance and come back as next season's transfer budget (75% of it). Start-of-career
PL mid-table: transfer ~€26M, wages ~€77M/yr + bill floor.
Files: `src/finance.js`, Finances help text in `src/ui/app.js:340`. Tests (`tests/finance.test.js`): update the budget numbers; transfer budget > old one for the same books; wage budget still ≥ wage bill.
Option (question 3): a once-a-season slider on Finances that moves money between the two at a rate (e.g. €1 of weekly wage = €52 of transfer × 0.8).

## 4. Manager's own money (career mode)

State: `s.career.money` (€, starts 0) and `salary` on each spell (`s.career.spells[i].salary`, €/year). New file not needed: all in `src/career.js`.

Income
- **Salary**, set when hired (`hire()`), from the club's size `level(s, id)` 0–100:
  `salary = round(150e3 × e^(0.045 × level), 10e3)` → League One €150k–700k, Championship €0.7–3.5M, Premier League €3.6–13.5M a year.
  Paid in the same weekly instalments as wages: `payManager(s, weeks)` called beside `payWeeks` in `src/season.js`.
- **Bonuses** in `seasonReview()` (where trophies are already counted): target met +10% of salary; promotion +25%; each trophy +25%.
- **Severance** when sacked (`leave(s, 'sacked')`): a quarter of a year's salary. Nothing when you walk out for another job.
- All of it goes into the inbox (`post()`), and the Board tab shows "Your money" and each spell's salary.

### REVISED after user answers: two spending options, replacing "Back your own team"

**4a. Buy a player yourself.** `p.mine = true` marks a player the manager owns.
- `src/transfers.js`: `buy(s, id, own)`, `bid(s, id, fee, own)`, `acceptCounter(s, id, own)`. With `own`, the fee is checked against
  `s.career.money` instead of `s.budget`. The club still pays his wages, so they must fit the wage budget as usual.
- `src/market.js` `move(s, p, from, to, fee, own)`: with `own` the buyer side is paid from `s.career.money` (club books untouched).
  Selling a `mine` player (your sale, an accepted offer, or an AI club selling him while you are out of work): the fee goes to
  `s.career.money`, not the club. Released / contract runs out / retires: ownership ends (`delete p.mine`).
- `src/career.js` `hire()`: every `mine` player, wherever he is, moves to the new club on his current contract (no fee),
  even over the wage budget (the board's over-budget penalty then applies). While you are out of work he stays at his club.
- UI: a "Pay yourself" checkbox next to the bid/sign buttons; a ★ (or "yours") mark in squad lists.

**4b. Buy a share of a club.** `s.career.shares = { [clubId]: percent }`, whole percents, any of the 68 clubs, max 49% each for now
(majority = buying the whole club = a later phase).
- Club value `V = 2 × projection(s, c)` (`src/finance.js`): League One about €20M, Championship about €40-60M, Premier League €200-300M.
  1% costs V/100 at today's value. Selling back pays today's value less 5%. Value moves with division, so a promotion lifts it.
- Dividends at the end of the season (`seasonReview()`): `stake × 50% × max(0, the season's profit)`, paid out of the club's balance into
  `s.career.money` (only your share is paid out). A PL club banking €60M pays 1% about €300k.
- Say over your own club's budgets: ≥10%: the board is more patient (sacking line −5); ≥25%: the once-a-season budget request is always
  granted, whatever the confidence; the transfer share of the balance gets +10 points.
- Inbox: dividend notice each summer. Board tab: "Your money", your stakes with value and last dividend, a buy/sell form (club select + %).

Fun quirks to record: shares bought in a League One club just before it goes up jump in value; you keep your stakes (and dividends) after
being sacked; an owned player comes with you to any job, whatever that club's wage budget says.

Save v12: `career.money = 0`, `career.shares = {}`, salary on the current spell; `p.mine` absent = not owned.
Tests: own purchase takes personal money, not budget; owned player follows on hire; his sale fee goes to the manager; release ends ownership;
share buy/sell prices; 49% cap; dividends only from profit; 25% stake makes the request succeed at low confidence.

### (superseded) First spending option: **Back your own team.** On Board: "Put €X into the club" → `invest(s, amount)`:
money −X, club balance +X (new ledger line `owner`), transfer budget +X. That is "buy a player out of my own pocket" without new
transfer code, and the money is gone when you leave the club. Minimum €100k; not while out of work.

Why not buying a club first: owning needs new rules (who sets budgets, can an owner be sacked, sell the club, AI owners) — a phase of its own.
Sketch for later: club price ≈ 2× projected income (League One ~€10–20M, PL €250M+); reachable from a few seasons' PL salary for
a League One club. Owner-manager: unsackable, sets own budgets, takes losses from own pocket.

Files: `src/career.js` (salary, payManager, bonuses, severance, invest), `src/finance.js` (`owner` in `blankLedger`), `src/season.js` (call payManager),
`src/ui/app.js` (Board: money, invest form, spells salary; inbox texts), `src/save.js` (v12: `career.money = 0`, salary on current spell from `level`, `owner: 0` in every ledger).
Tests (`tests/career.test.js`): salary grows with club size; a season pays one year's salary; bonus on promotion/trophy; sacking pays severance; invest moves money and rejects more than you have / no club.

Fun quirks to record in `docs/fun-surprises.md`:
- Getting sacked pays a quarter's salary; a quick sacking at a big club can pay more than a season at a small one.
- Salary is fixed at hiring from the club's size, so a promotion does not raise it until you change job.

## 5. Star points and young legends (discussion only — no implementation)

Idea: an older star retires → Star points → spend them on a 17-year-old "young version" of a past legend.

Design thoughts
- **Who counts as a star.** Simplest: overall ≥ 80 when they retire (or ≥ 75 in the lower divisions). Richer: seasons at your club, awards (awards.js keeps them per season).
  Only players who retire *from your club* — it makes keeping a veteran to the end worth something, instead of selling at 30.
- **Points.** e.g. 1 point per retiring star, +1 for each season they spent at your club over three, +1 per award. Legends cost 3–10 by tier.
- **The legends.** A hand-made list `src/data/legends.js`: name, position, nationality, attribute shape (pace-heavy forward for Henry, physical striker for Ibrahimović),
  potential 18–20. They arrive at 17 with modest attributes and must be trained — this is where item 1 matters.
- **The loop.** In-game retirements are real players today (Salah, De Bruyne-types); retire them at your club and they could appear on the legends list themselves.
- **Limits.** One legend a season; each legend once per career; arrive on a youth contract, no fee; count against the wage budget.

Open questions
1. Only players retiring from your club, or any star in the world (points for "being around")?
2. Yamal is an active player, not a past legend — current stars allowed, or only retired players?
3. Do legends keep their real name, or "Thierry Henry Jr."-style names? (Real names are fine per the project rule.)
4. Fixed potential or a range with a chance of a flop?
5. Can AI clubs get legends too, or only you?
6. Does the save/career keep a "hall of fame" of your retired stars (needs career stats, which today are wiped each season)?

## Order of work if approved
1 → 2 (both training, one save bump) → 3 → 4. Each with tests, `npm test` green, fun-surprises updated, plan file in `docs/superpowers/plans/`.
