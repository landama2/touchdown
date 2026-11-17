import { table, takeClub, PROMOTED, PLAYOFF, RELEGATED } from './season.js';
import { wageBill, staffBill, SEASON_WEEKS, SHARE, clubValue, profit, stake } from './finance.js';
import { cupRounds } from './cup.js';
import { seeding, BOARD_START as START, REP_START } from './world.js';

// The manager's career. Every club's board judges its manager: c.conf (confidence 0-100) and c.games
// (league matches under the current manager). Results against expectation, the league position against the board's
// target, debt and the cup move it; below the sacking line the manager goes. AI clubs have no manager
// people: a sacking only opens a vacancy (s.jobs) for a while. Draws no random numbers, so the world
// plays exactly as before. The human manager (s.career, null before a club is picked) has a reputation
// that the season's finish moves; it gates job offers, steadies the board and helps persuade players.
// News goes into s.news during a day and into the kept, dated inbox (s.inbox).
// The manager has money of his own (s.career.money, euros): a salary fixed at hiring by the club's size,
// season bonuses, and severance when sacked. He can spend it on players of his own (p.mine: transfers.js
// with `own`; they follow him to every new job and their fees come back to him) and on shares in clubs
// (s.career.shares: club id -> percent; dividends each summer, a say over his own club's board).
// ponytail: imports season.js, which imports this file back; only functions cross, so the cycle is safe.
export { START, REP_START };
export const SACK = 20, MIN_GAMES = 6, WARN = [35, 25], CALM = 45;
export const EXPECT = { base: 1.38, perQuality: 0.26, home: 0.2 }; // league points a match, fitted on the real leagues (seeds 1-3, 2 seasons)
export const MOVE = { match: 1.5, below: 0.5, onTarget: 0.25, debt: 1, overBudget: 1, cupOut: 5, cupWin: 3, met: 10, band: 8, up: 20, down: 30 }; // about 13 sackings a season in 68 clubs (seeds 1-3, 3 seasons)
export const REP = { pull: 0.3, trophy: 5, sacked: 10, gate: 15, patience: 10 };
export const ASK = { conf: 60, cost: 3, transfer: 1.25, wage: 1.1 };
export const VACANCY_DAYS = 14, INBOX_MAX = 150;
export const SALARY = { base: 150e3, growth: 0.045 };          // a year: size 0 €150k, 50 €1.4M, 100 €13.5M
export const BONUS = { target: 0.1, up: 0.25, trophy: 0.25 }, SEVERANCE = 0.25; // × a year's salary

const clamp = x => Math.max(0, Math.min(100, x));
const round = (x, step) => Math.round(x / step) * step;

// Expected league points for club id against opp.
export const expectedPoints = (s, id, opp, home) =>
  Math.max(0.2, Math.min(2.6, EXPECT.base + EXPECT.perQuality * (s.clubs[id].quality - s.clubs[opp].quality) + (home ? EXPECT.home : -EXPECT.home)));

// Expected finish (1 = top): the club's rank by squad quality in its division.
export function expectedPos(s, id) {
  const c = s.clubs[id];
  return 1 + s.divisions[c.div].clubIds.filter(x => s.clubs[x].quality > c.quality || (s.clubs[x].quality === c.quality && x < id)).length;
}
// Division d's targets, most ambitious first: [[text, worst finish that meets it], ...].
export function bands(s, d) {
  const n = s.divisions[d].clubIds.length, last = d === s.divisions.length - 1;
  const all = [['win the league', 1], ...(d ? [['win promotion', PROMOTED], ['reach the play-offs', PROMOTED + PLAYOFF]] : [['finish in the top four', 4]]),
    ['finish in the top half', n >> 1], last ? ['stay out of the bottom three', n - 3] : ['stay up', n - RELEGATED]];
  return all.filter(([, lim], k) => all.slice(0, k).every(([, x]) => x < lim)); // a small division drops the bands that overlap
}
// The board's league target for club id: an index into bands(), the tightest band that holds its expected finish.
export function leagueTarget(s, id) {
  const b = bands(s, s.clubs[id].div), e = expectedPos(s, id), k = b.findIndex(([, lim]) => lim >= e);
  return k < 0 ? b.length - 1 : k;
}
// The cup round the board expects club id to reach: seeded r-th of the n clubs, it should outlast the clubs seeded below it.
export function cupTarget(s, id) {
  const n = s.clubs.length, P = 2 ** Math.floor(Math.log2(n)), r = seeding(s.clubs).indexOf(id) + 1;
  return Math.max(0, Math.min(cupRounds(n) - 1, Math.floor(Math.log2(P / r)) + (n > P ? 1 : 0)));
}
// A club's size, 0-100: its place in the cup seeding (division, then squad quality).
export function level(s, id) {
  const order = seeding(s.clubs);
  return Math.round(100 * (1 - order.indexOf(id) / (order.length - 1)));
}

// After a league match: both boards weigh the points against what they expected.
export function afterLeague(s, r) {
  for (const [id, opp, gf, ga, home] of [[r.h, r.a, r.hg, r.ag, true], [r.a, r.h, r.ag, r.hg, false]]) {
    const c = s.clubs[id], pts = gf > ga ? 3 : gf === ga ? 1 : 0;
    c.conf = clamp(c.conf + MOVE.match * (pts - expectedPoints(s, id, opp, home)));
    c.games++;
  }
}
// After a decided cup tie in round k: out before the target round costs, a win from it on gains.
export function afterCup(s, t, k) {
  for (const id of [t.h, t.a]) {
    const c = s.clubs[id], target = cupTarget(s, id);
    if (id === t.w ? k >= target : k < target) c.conf = clamp(c.conf + (id === t.w ? MOVE.cupWin : -MOVE.cupOut));
  }
}
// Each week: 3 or more places below the target costs, on target gains (once a club has played
// MIN_GAMES league matches); debt costs; so does the human club going over its wage budget.
export function boardWeeks(s, weeks) {
  if (weeks <= 0) return;
  s.divisions.forEach((_, d) => table(s, d).forEach((id, k) => {
    const c = s.clubs[id], lim = bands(s, d)[leagueTarget(s, id)][1];
    let m = c.st.p < MIN_GAMES ? 0 : k + 1 > lim + 2 ? -MOVE.below : k + 1 <= lim ? MOVE.onTarget : 0;
    if (c.fin.balance < 0) m -= MOVE.debt;
    if (id === s.me && wageBill(c) + staffBill(s, c) > s.wageBudget) m -= MOVE.overBudget;
    c.conf = clamp(c.conf + weeks * m);
  }));
}

// End of the season, before promotion and relegation move the clubs (tables = final tables, h = the
// history entry with its up and down lists): target met or missed, promotion, relegation; the human
// manager's reputation moves toward the standing of the finish, plus trophies.
export function seasonReview(s, tables, h) {
  const n = s.clubs.length;
  let above = 0;
  tables.forEach((t, d) => {
    const b = bands(s, d);
    t.forEach((id, k) => {
      const c = s.clubs[id], target = leagueTarget(s, id), got = b.findIndex(([, lim]) => k + 1 <= lim);
      const missed = (got < 0 ? b.length : got) - target;
      c.conf = clamp(c.conf + (missed <= 0 ? MOVE.met : -MOVE.band * missed) + (h.divs[d].up.includes(id) ? MOVE.up : 0) - (h.divs[d].down.includes(id) ? MOVE.down : 0));
      if (id !== s.me || !s.career) return;
      const was = s.career.rep, standing = 100 * (1 - (above + k) / (n - 1));
      const trophies = [h.divs[d].champion === id, h.divs[d].playoff === id, h.cup?.winner === id].filter(Boolean).length;
      s.career.rep = Math.round(clamp(was + REP.pull * (standing - was) + REP.trophy * trophies));
      post(s, { type: 'review', club: id, target: b[target][0], met: missed <= 0, pos: k + 1, rep: s.career.rep, was });
      const bonus = round(salary(s) * ((missed <= 0 ? BONUS.target : 0) + (h.divs[d].up.includes(id) ? BONUS.up : 0) + BONUS.trophy * trophies), 1e3);
      if (bonus) { s.career.money += bonus; post(s, { type: 'bonus', club: id, amount: bonus }); }
    });
    above += t.length;
  });
  if (s.career) payDividends(s);
}

// --- the human manager ---

// A year's salary at club id, set when hired.
export const salaryFor = (s, id) => round(SALARY.base * Math.exp(SALARY.growth * level(s, id)), 10e3);
const salary = s => s.career.spells.at(-1).salary ??= salaryFor(s, s.me); // ??=: a spell from a version 11 save
// The salary in SEASON_WEEKS instalments, like the clubs' wages (payWeeks in src/finance.js).
export function payManager(s, weeks) {
  if (weeks > 0 && s.me !== null && s.career) s.career.money += weeks * Math.round(salary(s) / SEASON_WEEKS);
}

export function post(s, n) {
  s.inbox.push({ ...n, season: s.season, day: s.day, read: false });
  if (s.inbox.length > INBOX_MAX) s.inbox.splice(0, s.inbox.length - INBOX_MAX);
}
const targets = (s, id) => ({ type: 'target', club: id, league: bands(s, s.clubs[id].div)[leagueTarget(s, id)][0], cup: cupTarget(s, id) });

// A new career at club id (the club picker).
export function startCareer(s, id) {
  s.career = { rep: REP_START, asked: null, warned: null, spells: [], money: 0, shares: {} };
  hire(s, id);
}
function hire(s, id) {
  bringOwn(s, id);
  takeClub(s, id);
  const c = s.clubs[id];
  c.conf = START; c.games = 0;
  s.career.spells.push({ club: id, from: s.season, to: null, how: null, salary: salaryFor(s, id) });
  s.career.asked = null; s.career.warned = null;
  s.jobs = s.jobs.filter(j => j.club !== id);
  post(s, targets(s, id));
}
// The manager's own players come with him to club id on their contracts, whatever its wage budget.
// ponytail: one out on loan stays where he is; he goes home at the season's end and comes along at the next hire.
function bringOwn(s, id) {
  for (const c of s.clubs) {
    if (c.id === id) continue;
    for (const p of c.players.filter(x => x.mine && !x.loan)) {
      c.players.splice(c.players.indexOf(p), 1);
      delete p.listed;
      s.clubs[id].players.push(p);
    }
  }
}
// The human manager leaves the club ('sacked' or 'left'): it gets a new manager after a vacancy.
const ended = s => s.day < 0 ? s.season - 1 : s.season; // the season being left: the end-of-season board check runs after the rollover
function leave(s, how) {
  const c = s.clubs[s.me];
  c.conf = START; c.games = 0;
  Object.assign(s.career.spells.at(-1), { to: ended(s), how });
  s.jobs.push({ club: c.id, season: s.season, until: s.day + VACANCY_DAYS, offered: false });
  s.me = null; s.live = null; s.youth = []; s.scouts = []; s.offers = []; s.talks = { win: null, by: {} }; s.budget = 0; s.wageBudget = 0;
}
// Whether club id would offer the human manager its job: the manager's reputation reaches its size less REP.gate
// and, while the manager has a club, it is bigger than that club.
const wants = (s, id) => id !== s.me && s.career.rep >= level(s, id) - REP.gate && (s.me === null || level(s, id) > level(s, s.me));
function offer(s, j) {
  if (j.offered || !s.career || !wants(s, j.club) || s.career.spells.some(x => x.club === j.club && x.how === 'sacked' && x.to === ended(s))) return;
  j.offered = true;
  s.news.push({ type: 'job', club: j.club, until: j.until });
}

// Sackings, once a day and at the end of the season: a club whose manager has had MIN_GAMES league
// matches and whose confidence is under the line sacks the manager. The human manager's line is lower with
// reputation, and he is warned on the way down. Vacancies close after VACANCY_DAYS; one still open at the end of
// a season stays open for the next season's first VACANCY_DAYS days.
export function boardDay(s) {
  for (const j of s.jobs) if (j.season === s.season - 1) Object.assign(j, { season: s.season, until: VACANCY_DAYS - 1 }); // open at the summer rollover: open for the new season's first days
  s.jobs = s.jobs.filter(j => j.season === s.season && j.until >= s.day);
  for (const c of s.clubs) {
    const human = c.id === s.me && !!s.career;
    if (c.id === s.me && !human) continue; // a club taken without a career (tests) is never sacked
    const line = human ? sackLine(s) : SACK;
    if (c.games < MIN_GAMES || c.conf >= line) continue;
    if (human) {
      const pay = round(SEVERANCE * salary(s), 1e4);
      s.career.money += pay;
      s.news.push({ type: 'sacked', club: c.id, pay });
      s.career.rep = Math.round(clamp(s.career.rep - REP.sacked));
      leave(s, 'sacked');
      for (const j of s.jobs) offer(s, j);
    } else {
      c.conf = START; c.games = 0;
      const j = { club: c.id, season: s.season, until: s.day + VACANCY_DAYS, offered: false };
      s.jobs.push(j);
      s.news.push({ type: 'vacancy', club: c.id });
      offer(s, j);
    }
  }
  if (s.me !== null && s.career) {
    const conf = s.clubs[s.me].conf, w = WARN.find(x => conf < x && (s.career.warned === null || x < s.career.warned));
    if (w !== undefined) { s.career.warned = w; s.news.push({ type: 'warning', club: s.me, conf: Math.round(conf) }); }
    if (conf >= CALM) s.career.warned = null;
  }
}
// The day's news into the inbox.
export const file = s => { for (const n of s.news) post(s, n); };

// A new season's start for the human manager: the board's targets.
export function seasonStart(s) {
  if (s.me !== null && s.career) post(s, targets(s, s.me));
}

export function acceptJob(s, id) {
  const j = s.jobs.find(x => x.club === id && x.offered);
  if (!j) return 'That job has gone.';
  if (s.live) return 'Finish the match first.';
  if (s.me !== null) leave(s, 'left');
  s.jobs = s.jobs.filter(x => x !== j);
  hire(s, id);
  return null;
}
export function declineJob(s, id) {
  const j = s.jobs.find(x => x.club === id && x.offered);
  if (j) j.offered = false;
  return null;
}
export const openOffer = (s, id) => s.jobs.some(x => x.club === id && x.offered);

// Once a season the manager may ask for more money: more transfer budget or more wage budget. The
// board agrees while its confidence is at least ASK.conf and the club is not in debt; a refusal costs
// ASK.cost confidence. Returns the answer.
// The human manager's sacking line: lower with reputation, and with a stake of SHARE.patient or more in his club.
export const sackLine = s => SACK - s.career.rep / REP.patience - (stake(s, s.me) >= SHARE.patient ? SHARE.patience : 0);

// With a stake of SHARE.say or more in his club, the board always agrees.
export function askBoard(s, kind) {
  if (s.me === null || !s.career) return 'You have no club.';
  if (kind !== 'transfer' && kind !== 'wage') return 'Unknown request.';
  if (s.career.asked === s.season) return 'The board has already heard you this season.';
  s.career.asked = s.season;
  const c = s.clubs[s.me], yes = (c.conf >= ASK.conf && c.fin.balance > 0) || stake(s, s.me) >= SHARE.say;
  if (yes && kind === 'transfer') s.budget = round(s.budget * ASK.transfer, 1e5);
  if (yes && kind === 'wage') s.wageBudget = round(s.wageBudget * ASK.wage, 1e3);
  if (!yes) c.conf = clamp(c.conf - ASK.cost);
  post(s, { type: 'request', club: c.id, kind, yes });
  return yes ? `The board agrees: more ${kind === 'transfer' ? 'transfer' : 'wage'} budget this season.` : 'The board says no, and is not pleased you asked.';
}

// --- shares ---

// Buys (pct > 0) or sells (pct < 0) whole percents of club id at today's value; a sale loses SHARE.sellCut.
// The money goes to or comes from the other owners, not the club. Error message or null.
export function trade(s, id, pct) {
  if (!s.career) return 'You have no career.';
  if (!s.clubs[id] || !Number.isInteger(pct) || !pct) return 'Unknown deal.';
  const have = stake(s, id), price = round(Math.abs(pct) * clubValue(s, s.clubs[id]) / 100, 1e3);
  if (pct > 0 && have + pct > SHARE.max) return `You can own at most ${SHARE.max}% of a club.`;
  if (pct > 0 && price > s.career.money) return 'You cannot afford that.';
  if (pct < 0 && -pct > have) return 'You do not own that many shares.';
  s.career.money += pct > 0 ? -price : round(price * (1 - SHARE.sellCut), 1e3);
  if (have + pct) s.career.shares[id] = have + pct; else delete s.career.shares[id];
  return null;
}
// End of the season: each club he has a stake in pays him stake × SHARE.payout of its season's profit, from its balance.
function payDividends(s) {
  for (const [id, pct] of Object.entries(s.career.shares)) {
    const c = s.clubs[id], x = round(pct / 100 * SHARE.payout * Math.max(0, profit(c)), 1e3);
    if (!x) continue;
    c.fin.balance -= x; c.fin.season.dividends += x; s.career.money += x;
    post(s, { type: 'dividend', club: c.id, amount: x, pct });
  }
}
