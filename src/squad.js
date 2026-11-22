import { overall } from './player.js';
import { medicalScale } from './staff.js';

// Squad dynamics: what matches and the days between them leave on players. Every player (club
// squads and free agents) carries the fields of freshState() in player.js:
//   cond   0-100   condition: the fitness he starts his next match with; a match drains it, rest restores it
//   sharp  40-100  match sharpness: playing raises it, days without a match wear it down
//   morale 0-100   results and playing time move it; it drifts back to 50 between matches
//   form           his last FORM_LEN match ratings, any competition
//   yc             league yellow cards this season; every YELLOW_LIMIT-th brings a one-match ban
//   ban            matches still to sit out, counted down by every match of his club, any competition
//   inj            null, or { name, days } until he is fit again
//   gain           attributes raised by training this season (src/training.js)
export const FORM_LEN = 5, YELLOW_LIMIT = 5, SHARP_MIN = 40, OFFSEASON = 70; // OFFSEASON: days from the last final to the next season
const MORALE_MID = 50, MORALE_DRIFT = 0.3, SHARP_GAIN = 12, SHARP_LOSS = 0.6; // drift and loss per day, gain per match
const MORALE_RESULT = 4, MORALE_RATING = 3, MORALE_DROPPED = 3, REGULARS = 14; // the 14 best expect to play
const BAN = { second: 1, straight: 3 };
const EDGE = { morale: 0.02, form: 0.02, sharp: 0.04 };
// [name, fewest days, most days, weight]
export const INJURIES = [['knock', 2, 6, 40], ['calf strain', 7, 20, 30], ['hamstring strain', 14, 35, 18], ['ankle ligaments', 28, 70, 9], ['knee ligaments', 90, 200, 3]];

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const r1 = x => Math.round(x * 10) / 10;

export const available = p => !p.inj && !p.ban;
export const formAvg = p => p.form.length ? r1(p.form.reduce((t, x) => t + x, 0) / p.form.length) : null;
export const moraleLabel = v => v < 20 ? 'Very low' : v < 40 ? 'Low' : v < 60 ? 'Okay' : v < 80 ? 'Good' : 'Superb';

// Multiplier on a player's match strength: morale and form up to ±2% each, lost sharpness up to -4%.
// A fresh player (morale 50, sharpness 100, no form) is exactly 1.
export function readiness(p) {
  const f = formAvg(p);
  return 1 + EDGE.morale * (p.morale - MORALE_MID) / MORALE_MID
    + (f === null ? 0 : EDGE.form * clamp((f - 6.6) / 1.4, -1, 1))
    - EDGE.sharp * (100 - p.sharp) / (100 - SHARP_MIN);
}

// Gives player p an injury from INJURIES, its length × scale (his club's medical staff: src/staff.js);
// a worse one replaces a milder one he already has. Returns p.inj.
export function injure(rng, p, scale = 1) {
  let r = rng.next() * INJURIES.reduce((t, x) => t + x[3], 0), pick = INJURIES[INJURIES.length - 1];
  for (const x of INJURIES) if ((r -= x[3]) < 0) { pick = x; break; }
  const days = Math.max(1, Math.round(rng.int(pick[1], pick[2]) * scale));
  if (!p.inj || days > p.inj.days) p.inj = { name: pick[0], days };
  return p.inj;
}

// `days` days pass: injuries heal, condition comes back by perDay a day, sharpness fades, morale drifts to 50.
export function passDays(players, days, perDay) {
  for (const p of players) {
    if (p.inj && (p.inj.days -= days) <= 0) p.inj = null;
    p.cond = Math.min(100, p.cond + (typeof perDay === 'function' ? perDay(p) : perDay) * days); // perDay: a rate, or p => his rate
    p.sharp = r1(Math.max(SHARP_MIN, p.sharp - SHARP_LOSS * days));
    p.morale = r1(p.morale + clamp(MORALE_MID - p.morale, -MORALE_DRIFT * days, MORALE_DRIFT * days));
  }
}

// The summer break: injuries heal by OFFSEASON days; everyone starts the season fresh and sharp;
// yellow cards, form and the season's training gains are wiped. Bans and morale carry over.
export function offseason(p) {
  if (p.inj && (p.inj.days -= OFFSEASON) <= 0) p.inj = null;
  Object.assign(p, { cond: 100, sharp: 100, form: [], yc: 0, gain: 0 });
  delete p.gains; delete p.losses;
}

// What a finished match m leaves on both squads (comp: 'league', 'cup' or 'playoff'). Every ban
// at both clubs counts down by one. Players who played keep their end-of-match fitness as
// condition, gain sharpness and add their rating to their form; an injury gets a recovery time.
// Red cards and every fifth league yellow bring bans. Morale: the result for the whole squad, the
// rating for those who played, a knock for fit regulars left out.
// Returns news: [{ type: 'injury', club, id, name, injury, days } | { type: 'ban', club, id, name, matches }].
export function afterMatch(s, m, comp, rng) {
  const news = [];
  m.sides.forEach((S, i) => {
    const club = s.clubs[S.club], result = Math.sign(S.st.goals - m.sides[1 - i].st.goals);
    const regulars = new Set([...club.players].sort((a, b) => overall(b) - overall(a) || a.id - b.id).slice(0, REGULARS).map(p => p.id));
    for (const p of club.players) {
      const x = m.pl[p.id], out = !available(p);
      if (p.ban) p.ban--;
      let mood = MORALE_RESULT * result;
      if (x?.played) {
        const rt = r1(clamp(x.rt, 3, 10));
        p.cond = Math.round(x.fit);
        p.sharp = Math.min(100, p.sharp + SHARP_GAIN);
        p.form = [...p.form, rt].slice(-FORM_LEN);
        mood += Math.round((rt - 6.5) * MORALE_RATING);
        if (x.inj) { injure(rng, p, medicalScale(club)); news.push({ type: 'injury', club: club.id, id: p.id, name: p.name, injury: p.inj.name, days: p.inj.days }); }
      } else if (!out && regulars.has(p.id)) mood -= MORALE_DROPPED;
      p.morale = clamp(p.morale + mood, 0, 100);
    }
  });
  for (const e of m.ev) {
    if (e.type !== 'yellow' && e.type !== 'red') continue;
    const club = s.clubs[m.sides[e.side].club], p = club.players.find(x => x.id === e.id);
    if (!p) continue;
    const ban = e.type === 'red' ? (e.second ? BAN.second : BAN.straight) : comp === 'league' && ++p.yc % YELLOW_LIMIT === 0 ? 1 : 0;
    if (ban) { p.ban += ban; news.push({ type: 'ban', club: club.id, id: p.id, name: p.name, matches: p.ban }); }
  }
  return news;
}
