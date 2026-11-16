import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { takeClub, playDay, endSeason, table } from '../src/season.js';
import {
  START, SACK, MIN_GAMES, MOVE, REP_START, REP, ASK, VACANCY_DAYS, INBOX_MAX,
  expectedPoints, expectedPos, bands, leagueTarget, cupTarget, level, afterLeague, afterCup, boardDay, boardWeeks, seasonReview,
  post, startCareer, acceptJob, declineJob, openOffer, askBoard,
} from '../src/career.js';
import { MINI } from './fixtures/mini.js';

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
  s.wageBudget = 0;                  // the human club now over its wage budget
  boardWeeks(s, 1);
  assert.equal(s.clubs[13].conf, START + 3 * MOVE.onTarget - MOVE.overBudget);
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
  const w = s.wageBudget;
  assert.equal(askBoard(s, 'wage').startsWith('The board agrees'), true);
  assert.equal(s.wageBudget, Math.round(w * ASK.wage / 1e3) * 1e3);
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
  assert.equal(s.inbox.at(-1).type, 'review');
  assert.ok(s.inbox.at(-1).met);
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
