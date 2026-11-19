import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { takeClub, playDay, endSeason, table } from '../src/season.js';
import {
  START, SACK, MIN_GAMES, MOVE, REP_START, REP, ASK, VACANCY_DAYS, INBOX_MAX,
  expectedPoints, expectedPos, bands, leagueTarget, cupTarget, level, afterLeague, afterCup, boardDay, boardWeeks, seasonReview,
  post, startCareer, acceptJob, declineJob, openOffer, askBoard,
  SALARY, BONUS, SEVERANCE, salaryFor, payManager, trade, sackLine,
} from '../src/career.js';
import { SEASON_WEEKS, SHARE, clubValue, seasonBudgets } from '../src/finance.js';
import { regular } from '../src/market.js';
import { bid, buy, sell } from '../src/transfers.js';
import { MINI } from './fixtures/mini.js';
import { serialize, deserialize } from '../src/save.js';

const world = seed => createWorld(seed, MINI);
// MINI: Top League clubs 0-3 (Alpha strongest), Middle League 4-13, Low League 14-19.

test('expected points rise with the quality gap and at home', () => {
  const s = world(1);
  assert.ok(expectedPoints(s, 0, 19, true) > expectedPoints(s, 19, 0, false));
  assert.ok(expectedPoints(s, 4, 5, true) > expectedPoints(s, 4, 5, false));
  assert.ok(expectedPoints(s, 0, 19, true) <= 2.6 && expectedPoints(s, 19, 0, false) >= 0.2);
});

test('the board expects a finish by squad quality and sets the tightest band that holds it', () => {
  const s = world(1);
  assert.equal(expectedPos(s, 0), 1);
  assert.equal(bands(s, 0)[leagueTarget(s, 0)][0], 'win the league');
  assert.deepEqual(bands(s, 1).map(b => b[1]), [1, 2, 6, 7]); // 10 clubs: top half (5) overlaps the play-offs and drops out
  assert.equal(bands(s, 1)[leagueTarget(s, 13)][0], 'stay up');
  assert.deepEqual(bands(s, 2).map(b => b[1]), [1, 2, 6]); // the bottom division's 'stay out of the bottom three' (3) overlaps too
  assert.ok(bands(s, 0).every(([, lim], k, a) => !k || lim > a[k - 1][1]));
});

test('cup targets: the top seed should reach the final, the weakest clubs only play the first round', () => {
  const s = world(1);
  assert.equal(cupTarget(s, 0), 4);   // 20 clubs: preliminary round + 4 rounds; index 4 is the final
  assert.equal(cupTarget(s, 19), 0);
  assert.ok(level(s, 0) === 100 && level(s, 19) === 0);
});

test('a result above expectation raises confidence, below it lowers it, and counts a league game', () => {
  const s = world(1);
  afterLeague(s, { h: 19, a: 0, hg: 2, ag: 0 });
  assert.ok(s.clubs[19].conf > START && s.clubs[0].conf < START);
  assert.deepEqual([s.clubs[19].games, s.clubs[0].games], [1, 1]);
});

test('going out of the cup early costs confidence; winning from the target round on gains', () => {
  const s = world(1), t = { h: 0, a: 19, w: 19 };
  afterCup(s, t, 0);
  assert.equal(s.clubs[0].conf, START - MOVE.cupOut);
  assert.equal(s.clubs[19].conf, START + MOVE.cupWin);
});

test('each week the board looks at the table and the books', () => {
  const s = world(1);
  startCareer(s, 13); // the weakest Middle League club: its target is to stay up (7th of 10)
  for (const c of s.clubs) c.st.p = MIN_GAMES;
  s.clubs[13].st.pts = 30;           // top of the Middle League: on target
  s.clubs[4].st.pts = -1;            // the strongest Middle League club, bottom: 3+ places below 'win the league'
  s.clubs[14].fin.balance = -1;      // top of the Low League on goal difference ties (lowest id) and in debt
  boardWeeks(s, 2);
  assert.equal(s.clubs[13].conf, START + 2 * MOVE.onTarget);
  assert.equal(s.clubs[4].conf, START - 2 * MOVE.below);
  assert.equal(s.clubs[14].conf, START + 2 * (MOVE.onTarget - MOVE.debt));
  boardWeeks(s, 1);
  assert.equal(s.clubs[13].conf, START + 3 * MOVE.onTarget); // a big wage bill costs nothing with the board
  const early = world(1); early.clubs[4].st.pts = -1; boardWeeks(early, 1);
  assert.equal(early.clubs[4].conf, START); // before MIN_GAMES league games the table does not count yet
});

test('an AI club under the line sacks its manager after MIN_GAMES league games and opens a vacancy', () => {
  const s = world(1), c = s.clubs[5];
  c.conf = SACK - 1; c.games = MIN_GAMES - 1;
  boardDay(s);
  assert.equal(s.jobs.length, 0);
  c.games = MIN_GAMES;
  boardDay(s);
  assert.deepEqual(s.jobs.map(j => j.club), [5]);
  assert.deepEqual([c.conf, c.games], [START, 0]);
  assert.equal(s.news.at(-1).type, 'vacancy');
  s.day += VACANCY_DAYS + 1; boardDay(s);
  assert.equal(s.jobs.length, 0); // filled
});

test('a club taken without a career (the engine tests) is never sacked', () => {
  const s = world(1);
  takeClub(s, 5);
  s.clubs[5].conf = 0; s.clubs[5].games = MIN_GAMES;
  boardDay(s);
  assert.equal(s.me, 5);
});

test('the human manager is warned, then sacked: no club, lower reputation, a spell that ended', () => {
  const s = world(1);
  startCareer(s, 5);
  assert.equal(s.career.rep, REP_START);
  assert.equal(s.inbox.at(-1).type, 'target');
  const c = s.clubs[5];
  c.games = MIN_GAMES; c.conf = 30;
  boardDay(s);
  assert.equal(s.news.at(-1).type, 'warning');
  c.conf = SACK - REP_START / REP.patience - 1;
  boardDay(s);
  assert.equal(s.me, null);
  assert.equal(s.career.rep, REP_START - REP.sacked);
  assert.deepEqual(s.career.spells.map(x => [x.club, x.how]), [[5, 'sacked']]);
  assert.ok(s.jobs.some(j => j.club === 5 && !j.offered)); // the old club does not ask the manager back
  assert.deepEqual([s.youth, s.scouts, s.budget], [[], [], 0]);
});

test('vacancies offer the job when the reputation is high enough; accepting moves the manager', () => {
  const s = world(1);
  startCareer(s, 15);
  s.clubs[0].conf = 0; s.clubs[0].games = MIN_GAMES;   // the biggest club: out of reach at REP_START
  s.clubs[12].conf = 0; s.clubs[12].games = MIN_GAMES; // a weak middle club, bigger than his and within reach
  boardDay(s);
  assert.ok(!openOffer(s, 0) && openOffer(s, 12));
  assert.equal(acceptJob(s, 0), 'That job has gone.');
  assert.equal(acceptJob(s, 12), null);
  assert.equal(s.me, 12);
  assert.deepEqual(s.career.spells.map(x => [x.club, x.how]), [[15, 'left'], [12, null]]);
  assert.ok(s.jobs.some(j => j.club === 15)); // the old club looks for a new manager
});

test('declining an offer withdraws it', () => {
  const s = world(1);
  startCareer(s, 15);
  s.clubs[12].conf = 0; s.clubs[12].games = MIN_GAMES;
  boardDay(s);
  assert.ok(openOffer(s, 12));
  declineJob(s, 12);
  assert.ok(!openOffer(s, 12));
});

test('a vacancy still open when the season ends stays open for the first days of the next', () => {
  const s = world(1);
  startCareer(s, 15);
  s.clubs[12].conf = 0; s.clubs[12].games = MIN_GAMES;
  boardDay(s);
  assert.ok(openOffer(s, 12));
  s.season++; s.day = -1; // as endSeason leaves the state before its boardDay
  boardDay(s);
  assert.ok(openOffer(s, 12));
  assert.equal(s.jobs.find(j => j.club === 12).until, VACANCY_DAYS - 1);
  s.day = VACANCY_DAYS; boardDay(s);
  assert.ok(!openOffer(s, 12));
});

test('the board grants one request a season while confident and out of debt; a refusal costs confidence', () => {
  const s = world(1);
  startCareer(s, 5);
  const w = s.budget;
  assert.equal(askBoard(s, 'wage'), 'Unknown request.');
  assert.equal(askBoard(s, 'transfer').startsWith('The board agrees'), true);
  assert.equal(s.budget, Math.round(w * ASK.transfer / 1e5) * 1e5);
  assert.equal(askBoard(s, 'transfer'), 'The board has already heard you this season.');
  s.career.asked = null; s.clubs[5].conf = ASK.conf - 1;
  const b = s.budget;
  assert.equal(askBoard(s, 'transfer').startsWith('The board says no'), true);
  assert.equal(s.budget, b);
  assert.equal(s.clubs[5].conf, ASK.conf - 1 - ASK.cost);
});

test('the season review rewards a met target and moves the reputation toward the finish', () => {
  const s = world(1);
  startCareer(s, 0);
  const tables = s.divisions.map((_, d) => s.divisions[d].clubIds); // the expected order: Alpha wins the top league
  const h = { cup: null, divs: s.divisions.map((_, d) => ({ champion: tables[d][0], playoff: null, up: [], down: [] })) };
  seasonReview(s, tables, h);
  assert.equal(s.clubs[0].conf, START + MOVE.met);
  assert.equal(s.career.rep, Math.round(REP_START + REP.pull * (100 - REP_START) + REP.trophy));
  const review = s.inbox.find(n => n.type === 'review');
  assert.ok(review.met);
});

test('the inbox keeps the newest INBOX_MAX items', () => {
  const s = world(1);
  for (let k = 0; k < INBOX_MAX + 5; k++) post(s, { type: 'vacancy', club: 0, k });
  assert.equal(s.inbox.length, INBOX_MAX);
  assert.equal(s.inbox[0].k, 5);
});

test('a career season plays out: boards move, the inbox fills, and the world stays deterministic', () => {
  const run = () => { const s = world(9); startCareer(s, 10); while (!s.done) playDay(s); endSeason(s); return s; };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(a.clubs.some(c => c.conf !== START));
  assert.ok(a.inbox.length > 1);
  assert.ok(a.inbox.every(n => Number.isInteger(n.season) && typeof n.read === 'boolean'));
});

test('a summer sacking is recorded under the season it ended, and that club does not offer the job back that summer', () => {
  const s = world(1);
  startCareer(s, 5);
  s.career.rep = 100; // within reach of every club
  s.clubs[5].conf = 0; s.clubs[5].games = MIN_GAMES;
  s.season++; s.day = -1; // as endSeason leaves the state before its boardDay
  boardDay(s);
  assert.equal(s.me, null);
  assert.deepEqual(s.career.spells.map(x => [x.club, x.to, x.how]), [[5, s.season - 1, 'sacked']]);
  assert.ok(s.jobs.some(j => j.club === 5 && !j.offered));
});

test('a human sacking through the real game loop: out of work, the world plays on and saves', () => {
  const s = world(2);
  startCareer(s, 10);
  while (s.clubs[10].games < MIN_GAMES) playDay(s);
  s.clubs[10].conf = 0;
  playDay(s);
  assert.equal(s.me, null);
  assert.deepEqual(s.career.spells.map(x => [x.club, x.how]), [[10, 'sacked']]);
  assert.equal(s.career.spells[0].to, s.season);
  for (let i = 0; i < 5; i++) playDay(s);
  assert.deepEqual(deserialize(serialize(s)), s);
  while (!s.done) playDay(s);
  endSeason(s);
  assert.equal(s.me, null);
  assert.deepEqual(deserialize(serialize(s)), s);
});

test('a vacancy opened on the last day of the season carries into the next through endSeason', () => {
  const s = world(3);
  startCareer(s, 10);
  while (s.next < s.days.length - 1) playDay(s);
  s.clubs[10].conf = 100;
  s.clubs[12].conf = 0; s.clubs[12].games = MIN_GAMES;
  const season = s.season;
  playDay(s);
  assert.ok(s.done && s.jobs.some(j => j.club === 12 && j.season === season));
  endSeason(s);
  assert.equal(s.season, season + 1);
  assert.deepEqual(s.jobs.filter(j => j.club === 12).map(j => [j.season, j.until]), [[s.season, VACANCY_DAYS - 1]]);
});

// --- the manager's money ---

test('the salary grows with the club size and is paid week by week; a met target and trophies pay a bonus', () => {
  const s = world(1);
  assert.ok(salaryFor(s, 0) > salaryFor(s, 10) && salaryFor(s, 10) > salaryFor(s, 19));
  assert.equal(salaryFor(s, 19), SALARY.base); // the smallest club: size 0
  startCareer(s, 0);
  const pay = salaryFor(s, 0);
  assert.equal(s.career.spells[0].salary, pay);
  payManager(s, SEASON_WEEKS);
  assert.equal(s.career.money, SEASON_WEEKS * Math.round(pay / SEASON_WEEKS));
  s.career.money = 0;
  const tables = s.divisions.map(d => d.clubIds), h = { cup: { winner: 0 }, divs: s.divisions.map((_, d) => ({ champion: tables[d][0], playoff: null, up: [], down: [] })) };
  seasonReview(s, tables, h); // champion (target met) and cup winner
  assert.equal(s.career.money, Math.round(pay * (BONUS.target + 2 * BONUS.trophy) / 1e3) * 1e3);
  assert.equal(s.inbox.at(-1).type, 'bonus');
});

test('a sacked manager gets severance; one who leaves for a job does not', () => {
  const s = world(1);
  startCareer(s, 5);
  const c = s.clubs[5];
  c.games = MIN_GAMES; c.conf = 0;
  boardDay(s);
  assert.equal(s.me, null);
  assert.equal(s.career.money, Math.round(SEVERANCE * salaryFor(s, 5) / 1e4) * 1e4);
  assert.equal(s.news.find(n => n.type === 'sacked').pay, s.career.money);
});

test('shares: bought and sold at the club value, at most 49%, dividends from profit only', () => {
  const s = world(1);
  startCareer(s, 15);
  const v = clubValue(s, s.clubs[4]);
  s.career.money = v; // enough for anything allowed
  assert.equal(trade(s, 4, 50), `You can own at most ${SHARE.max}% of a club.`);
  assert.equal(trade(s, 4, 10), null);
  assert.equal(s.career.money, v - Math.round(v / 10 / 1e3) * 1e3);
  assert.equal(trade(s, 4, -11), 'You do not own that many shares.');
  const before = s.career.money;
  assert.equal(trade(s, 4, -5), null);
  assert.equal(s.career.money - before, Math.round(Math.round(v / 20 / 1e3) * 1e3 * (1 - SHARE.sellCut) / 1e3) * 1e3);
  assert.deepEqual(s.career.shares, { 4: 5 });
  s.career.money = 0;
  assert.equal(trade(s, 6, 1), 'You cannot afford that.');
  assert.equal(trade(s, 6, 1.5), 'Unknown deal.');
  // dividends: club 4 makes a profit of 10M, club 15 (also 5%) a loss
  s.career.shares[15] = 5;
  Object.assign(s.clubs[4].fin.season, { broadcast: 10e6 });
  Object.assign(s.clubs[15].fin.season, { wages: 10e6 });
  const bal = s.clubs[4].fin.balance, tables = s.divisions.map(d => d.clubIds);
  seasonReview(s, tables, { cup: null, divs: s.divisions.map(() => ({ champion: null, playoff: null, up: [], down: [] })) });
  const div = 0.05 * SHARE.payout * 10e6;
  assert.equal(s.clubs[4].fin.balance, bal - div);
  assert.equal(s.inbox.filter(n => n.type === 'dividend').length, 1);
  assert.ok(s.career.money >= div);
});

test('a stake in your own club: patience at 10%, every request granted and a bigger transfer share at 25%', () => {
  const s = world(1);
  startCareer(s, 5);
  const line = sackLine(s);
  s.career.shares[5] = SHARE.patient;
  assert.equal(sackLine(s), line - SHARE.patience);
  s.clubs[5].conf = 0; s.clubs[5].fin.balance = 10e6;
  assert.match(askBoard(s, 'transfer'), /says no/);
  s.career.asked = null; s.career.shares[5] = SHARE.say;
  assert.match(askBoard(s, 'transfer'), /agrees/);
  seasonBudgets(s);
  assert.equal(s.budget, Math.round((0.75 + SHARE.sayTransfer) * 10e6 / 1e5) * 1e5);
});

test('a player bought with your own money is yours: you pay, he follows you, his sale pays you', () => {
  const s = world(11);
  startCareer(s, 14);
  s.budget = 0;
  const p = s.market[0];
  s.career.money = 0;
  assert.equal(buy(s, p.id, true), 'You cannot afford that yourself.');
  s.career.money = 1e9;
  const bal = s.clubs[14].fin.balance;
  assert.equal(buy(s, p.id, true), null);
  assert.ok(p.mine && s.clubs[14].players.includes(p));
  assert.equal(s.clubs[14].fin.balance, bal); // the club paid nothing
  assert.ok(s.career.money < 1e9);
  // an AI player bought with your own money
  const c = s.clubs[13], q = c.players.find(x => !regular(c, x));
  assert.equal(bid(s, q.id, 1e8, true), null);
  assert.ok(q.mine && s.clubs[14].players.includes(q));
  // a new job: both come along
  s.clubs[12].conf = 0; s.clubs[12].games = MIN_GAMES;
  boardDay(s);
  assert.equal(acceptJob(s, 12), null);
  assert.ok(s.clubs[12].players.includes(p) && s.clubs[12].players.includes(q) && !s.clubs[14].players.includes(p));
  // sold: the fee is the manager's, and he is no longer yours
  const money = s.career.money, cbal = s.clubs[12].fin.balance;
  p.joined = null; // as if he joined in an earlier window
  assert.equal(sell(s, p.id), null);
  assert.ok(s.career.money > money && !p.mine);
  assert.equal(s.clubs[12].fin.balance, cbal);
});
