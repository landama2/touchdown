// The season calendar. Day 0 is Saturday 8 August; a day number is all the engine stores, the
// label is for people. League rounds fall on Saturdays (Tuesdays when a division has more rounds
// than there are weekends), cup rounds on Wednesdays, the end-of-season knockouts after the league.
export const WEEKS = 40;              // league weekends: weeks 0-39
const SAT = 0, TUE = 3, WED = 4;      // day within a week
export const PLAYOFF_DAYS = [277, 280, 294]; // semi-final 1st leg (Wed), 2nd leg (Sat), final (Sat)
export const CUP_FINAL_DAY = 287;     // Saturday after the league ends

// Day numbers of n league rounds: one per weekend, spread evenly; rounds beyond WEEKS on midweek Tuesdays.
export function leagueDays(n) {
  const sat = Array.from({ length: Math.min(n, WEEKS) }, (_, k) => 7 * Math.floor(k * WEEKS / Math.min(n, WEEKS)) + SAT);
  const tue = Array.from({ length: Math.max(0, n - WEEKS) }, (_, j) => 7 * Math.floor((j + 0.5) * WEEKS / (n - WEEKS)) + TUE);
  return [...sat, ...tue].sort((a, b) => a - b);
}

// Day numbers of r cup rounds: Wednesdays from week 3 to week 37, the final on CUP_FINAL_DAY.
export const cupDays = r => [...Array.from({ length: r - 1 }, (_, k) => 7 * (3 + Math.floor(k * 34 / Math.max(1, r - 1))) + WED), CUP_FINAL_DAY];

// The whole season: [{ day, items }] in day order. An item is { comp: 'league', div, round },
// { comp: 'cup', round } or { comp: 'playoff', div, round: 0 | 1, leg } (round 0 = semi-finals,
// two legs; round 1 = final). rounds[d] = league rounds of division d; divisions below the top have play-offs.
export function buildCalendar(rounds, cupRounds) {
  const byDay = new Map(), add = (day, item) => byDay.set(day, [...(byDay.get(day) || []), item]);
  rounds.forEach((n, div) => leagueDays(n).forEach((day, round) => add(day, { comp: 'league', div, round })));
  if (cupRounds) cupDays(cupRounds).forEach((day, round) => add(day, { comp: 'cup', round }));
  rounds.forEach((_, div) => {
    if (!div) return;
    add(PLAYOFF_DAYS[0], { comp: 'playoff', div, round: 0, leg: 0 });
    add(PLAYOFF_DAYS[1], { comp: 'playoff', div, round: 0, leg: 1 });
    add(PLAYOFF_DAYS[2], { comp: 'playoff', div, round: 1, leg: 0 });
  });
  return [...byDay].sort((a, b) => a[0] - b[0]).map(([day, items]) => ({ day, items }));
}

const MONTHS = [['Aug', 31], ['Sep', 30], ['Oct', 31], ['Nov', 30], ['Dec', 31], ['Jan', 31], ['Feb', 28], ['Mar', 31], ['Apr', 30], ['May', 31], ['Jun', 30], ['Jul', 31]];
const WEEKDAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// 'Sat 8 Aug' for day 0. No leap years: every season starts on a Saturday.
export function dateLabel(day) {
  let d = day + 8; // day 0 is 8 August
  for (const [name, len] of MONTHS) { if (d <= len) return `${WEEKDAYS[day % 7]} ${d} ${name}`; d -= len; }
  return `Day ${day}`;
}
