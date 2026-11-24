// Bump when the shape of State changes, and add a migration in deserialize().
import { slots, newFam } from './lineup.js';
import { TEAM_KEYS, defaultSlot, defaultTactics } from './tactics.js';
import { buildCalendar } from './calendar.js';
import { blankRecords } from './awards.js';
import { freshState, joinSeason } from './player.js';
import { blankLegends, sigOf } from './legends.js';
import { defaultTraining } from './training.js';
import { startContract } from './contracts.js';
import { newBooks, seasonBudgets, WAGE_CUT } from './finance.js';
import { staffScouts } from './scouting.js';
import { aiStaff, standardStaff } from './staff.js';
import { BOARD_START, REP_START } from './world.js';

export const SAVE_VERSION = 17; // 2: clubs from real data with short, colours, kit. 3: live match, richer results. 4: tactics. 5: calendar, cup, play-offs, records. 6: squad dynamics, training. 7: contracts, club books, budgets. 8: transfer market, loans. 9: scouting, shortlist. 10: staff levels, youth squad. 11: boards, the manager's career, the inbox. 12: per-player training intensity, the manager's money. 13: no wage budget, wages cut to a fifth. 14: assists records. 15: Star points, legends, the Hall of fame, players' seasons at their club. 16: stadium levels, a building line in the books. 17: legends' signature attributes (p.sig)
export const KEY = 'touchline.save'; // the autosave
export const SLOTS = 3;
export const slotKey = n => `${KEY}:slot:${n}`; // n = 1..SLOTS; same save format as the autosave

export const serialize = state => JSON.stringify(state);

const valid = s => s && typeof s === 'object' && s.version === SAVE_VERSION
  && Array.isArray(s.clubs) && s.clubs.every(c => c.players.every(p => p.contract)) && Array.isArray(s.divisions) && Array.isArray(s.market)
  && Array.isArray(s.lineup) && Array.isArray(s.history) && (s.me === null || s.clubs[s.me] !== undefined)
  && (s.live === null || (typeof s.live === 'object' && Array.isArray(s.live.sides)))
  && Array.isArray(s.bench) && !!s.tactics && Array.isArray(s.tactics.slots) && !!s.fam && typeof s.fam === 'object'
  && Array.isArray(s.days) && Number.isInteger(s.next) && Array.isArray(s.playoffs) && Array.isArray(s.records) && s.records.every(r => 'assists' in r) && (s.cup === null || typeof s.cup === 'object')
  && !!s.training && !!s.training.ind && typeof s.training.ind === 'object' && !!s.training.load && typeof s.training.load === 'object' && Array.isArray(s.news)
  && s.clubs.every(c => c.fin && Number.isFinite(c.fin.balance) && !!c.fin.season)
  && Array.isArray(s.offers) && !!s.talks && Array.isArray(s.deals) && s.clubs.every(c => Number.isFinite(c.lentPay))
  && !!s.known && typeof s.known === 'object' && Array.isArray(s.scouts) && Array.isArray(s.shortlist)
  && Array.isArray(s.youth) && s.clubs.every(c => c.staff && Number.isInteger(c.staff.coaching))
  && Array.isArray(s.jobs) && Array.isArray(s.inbox) && (s.career === null || (Number.isFinite(s.career.rep) && Number.isFinite(s.career.money) && !!s.career.shares && Number.isFinite(s.career.stars) && Array.isArray(s.career.hall) && Array.isArray(s.career.waiting)))
  && !!s.legends && Array.isArray(s.legends.used) && Array.isArray(s.legends.extra) && s.clubs.every(c => Number.isFinite(c.conf) && Number.isInteger(c.games));

// MIGRATIONS[v] upgrades a save from version v to v + 1.
const MIGRATIONS = {
  2: s => { s.live = null; s.last = null; }, // old results have no stats or ratings: drop them
  3: s => { // default tactics, also for both sides of a match in progress
    s.bench = []; s.tactics = defaultTactics(slots(s.formation)); s.fam = newFam(); s.fam[s.formation] = 1;
    for (const S of s.live?.sides || []) {
      S.tac = Object.fromEntries(TEAM_KEYS.map(k => [k, 0])); S.takers = { pen: null, fk: null, corner: null }; S.fam = {};
      for (const o of S.on) Object.assign(o, defaultSlot(o.pos));
    }
  },
  4: s => { // the calendar replaces rounds: the rest of this season's league, then its play-offs; no cup until next season
    const played = s.round;
    s.days = s.done ? [] : buildCalendar(s.divisions.map(d => d.fixtures.length), 0)
      .map(d => ({ ...d, items: d.items.filter(i => i.comp !== 'league' || i.round >= played) })).filter(d => d.items.length);
    s.next = 0; s.day = s.days.length ? s.days[0].day - 1 : -1; s.done = !s.days.length;
    s.cup = null; s.playoffs = s.divisions.map(() => null); s.last = null; s.live = null; // a match in progress starts again
    s.records = s.divisions.map(blankRecords);
    for (const c of s.clubs) c.rec = { win: null, goals: null };
    s.history = s.history.map(h => ({ season: h.season, pos: h.pos, div: h.pos === null ? null : s.clubs[s.me].div, prize: h.prize, cup: null,
      divs: h.champions.map(name => ({ champion: s.clubs.find(c => c.name === name)?.id ?? null, up: [], down: [], playoff: null, awards: null })) }));
    delete s.round;
  },
  5: s => { // squad dynamics: everyone fresh, default training. A live match's players read edge ?? 1.
    for (const p of [...s.clubs.flatMap(c => c.players), ...s.market]) Object.assign(p, freshState());
    s.training = defaultTraining(); s.news = [];
  },
  6: s => { // contracts from this season, opening books, budgets (money in History stays in the old scale)
    for (const c of s.clubs) { for (const p of c.players) { p.contract = startContract(p, s.season); p.contract.wage *= WAGE_CUT; } c.fin = newBooks(s, c); } // Phase 6 wages: migration 12 cuts them
    for (const p of s.market) p.contract = null;
    if (s.me !== null) seasonBudgets(s);
  },
  7: s => { s.offers = []; s.talks = { win: null, by: {} }; s.deals = []; for (const c of s.clubs) c.lentPay = 0; }, // the market opens
  8: s => { s.known = {}; s.shortlist = []; s.scouts = []; staffScouts(s); }, // scouts start with nothing known
  9: s => { // standard staff everywhere, an empty youth squad (the first intake comes in the summer); staff costs in the ledger
    aiStaff(s); if (s.me !== null) s.clubs[s.me].staff = standardStaff(s.clubs[s.me].div);
    s.youth = []; for (const c of s.clubs) c.fin.season.staff = 0;
  },
  10: s => { // every board starts at BOARD_START with this season's league games counted; a career in progress starts at REP_START; empty inbox
    for (const c of s.clubs) { c.conf = BOARD_START; c.games = c.st.p; }
    s.career = s.me === null ? null : { rep: REP_START, asked: null, warned: null, spells: [{ club: s.me, from: s.season, to: null, how: null }] };
    s.jobs = []; s.inbox = [];
  },
  11: s => { // everyone trains at the team's intensity; the manager starts with no money, on his club's salary from now
    s.training.load = {};
    for (const c of s.clubs) c.fin.season.dividends = 0;
    if (s.career) Object.assign(s.career, { money: 0, shares: {} }); // the current spell's salary is set when first paid (career.js)
  },
  12: s => { // no wage budget; every wage (contracts, the part still paid for loans) falls to a fifth
    delete s.wageBudget;
    const cut = w => Math.max(100, Math.round(w / WAGE_CUT / 100) * 100);
    for (const p of [...s.clubs.flatMap(c => c.players), ...s.youth]) if (p.contract) p.contract.wage = cut(p.contract.wage);
    for (const c of s.clubs) c.lentPay = Math.round(c.lentPay / WAGE_CUT);
  },
  13: s => { for (const r of s.records) r.assists = null; for (const c of s.clubs) c.rec.assists = null; }, // no assists records yet
  14: s => { // everyone's time at his club starts now; no Star points, legends or Hall of fame yet
    for (const c of s.clubs) for (const p of c.players) p.since = joinSeason(s);
    s.legends = blankLegends();
    if (s.career) Object.assign(s.career, { stars: 0, hall: [], waiting: [] });
  },
  15: s => { // stadiums start at level 0; the books get a line for building
    for (const c of s.clubs) { c.stadium = 0; c.fin.season.build = 0; }
  },
  16: s => { // every legend learns his signature attributes, which may now grow to SIG_MAX
    for (const p of [...s.clubs.flatMap(c => c.players), ...s.market, ...s.youth]) if (p.legend && !p.sig) p.sig = [...sigOf(s, p)];
  },
};

export function deserialize(text) {
  if (!text) return null;
  try {
    const s = JSON.parse(text);
    while (s && MIGRATIONS[s.version]) MIGRATIONS[s.version](s), s.version++;
    return valid(s) ? s : null;
  } catch {
    return null;
  }
}
