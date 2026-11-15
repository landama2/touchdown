import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEEKS, PLAYOFF_DAYS, CUP_FINAL_DAY, leagueDays, cupDays, buildCalendar, dateLabel } from '../src/calendar.js';

test('league rounds: one per weekend, extra rounds on midweek Tuesdays, all in the same 40 weeks', () => {
  for (const n of [6, 10, 18, 38, 46]) {
    const days = leagueDays(n);
    assert.equal(days.length, n);
    assert.equal(new Set(days).size, n);
    assert.ok(days.every((d, k) => k === 0 || d > days[k - 1]), `${n}: in order`);
    assert.ok(days[0] === 0 && days.at(-1) < 7 * WEEKS, `${n}: within the season`);
    assert.equal(days.filter(d => d % 7 === 0).length, Math.min(n, WEEKS), `${n}: Saturdays`);
    assert.equal(days.filter(d => d % 7 === 3).length, Math.max(0, n - WEEKS), `${n}: Tuesdays`);
  }
});

test('cup rounds on Wednesdays, the final on the Saturday after the league', () => {
  const days = cupDays(7);
  assert.equal(days.length, 7);
  assert.ok(days.slice(0, -1).every(d => d % 7 === 4 && d < 7 * WEEKS));
  assert.equal(days.at(-1), CUP_FINAL_DAY);
  assert.ok(CUP_FINAL_DAY % 7 === 0 && CUP_FINAL_DAY > Math.max(...leagueDays(46)));
  assert.deepEqual(cupDays(1), [CUP_FINAL_DAY]);
});

test('the calendar: every league round, cup round and play-off leg once, in day order', () => {
  const cal = buildCalendar([38, 46, 46], 7), items = cal.flatMap(d => d.items);
  assert.ok(cal.every((d, k) => k === 0 || d.day > cal[k - 1].day));
  for (const [div, n] of [[0, 38], [1, 46], [2, 46]])
    assert.deepEqual(items.filter(i => i.comp === 'league' && i.div === div).map(i => i.round), [...Array(n).keys()]);
  assert.deepEqual(items.filter(i => i.comp === 'cup').map(i => i.round), [...Array(7).keys()]);
  const po = cal.flatMap(d => d.items.filter(i => i.comp === 'playoff').map(i => ({ ...i, day: d.day })));
  assert.deepEqual(po.map(i => [i.div, i.round, i.leg, i.day]).sort(),
    [[1, 0, 0, PLAYOFF_DAYS[0]], [1, 0, 1, PLAYOFF_DAYS[1]], [1, 1, 0, PLAYOFF_DAYS[2]], [2, 0, 0, PLAYOFF_DAYS[0]], [2, 0, 1, PLAYOFF_DAYS[1]], [2, 1, 0, PLAYOFF_DAYS[2]]].sort());
  assert.ok(PLAYOFF_DAYS[0] > Math.max(...leagueDays(46)), 'play-offs after the league');
  assert.ok(!buildCalendar([6], 0).some(d => d.items.some(i => i.comp !== 'league')), 'one division, no cup: league only');
});

test('dates: day 0 is Saturday 8 August', () => {
  assert.equal(dateLabel(0), 'Sat 8 Aug');
  assert.equal(dateLabel(3), 'Tue 11 Aug');
  assert.equal(dateLabel(24), 'Tue 1 Sep');
  assert.equal(dateLabel(146), 'Fri 1 Jan');
  assert.equal(dateLabel(294), 'Sat 29 May');
});
