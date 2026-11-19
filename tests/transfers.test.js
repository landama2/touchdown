import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { overall, value } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { terms } from '../src/contracts.js';
import { wageBill } from '../src/finance.js';
import { MINI } from './fixtures/mini.js';
import { takeClub, myClub, playDay, endSeason } from '../src/season.js';
import { asking, signingFee, marketDay, regular, FLOOR, QUICK_SALE, LOAN_SHARE, SUMMER_END } from '../src/market.js';
import { buy, sell, bid, acceptCounter, talksOn, loanIn, setListing, acceptOffer, rejectOffer, counterOffer, MIN_SQUAD, MAX_SQUAD } from '../src/transfers.js';

// Managing Kilo (bottom division, club 14) with money to spare, on day -1 of season 1: the summer window is open.
const fresh = () => { const s = createWorld(11, MINI); takeClub(s, 14); s.budget = 1e12; return s; };
const r10k = x => Math.round(x / 1e4) * 1e4;
// A player at AI club `id` who would join you: not a regular there (a regular won't drop a division).
const target = (s, id) => { const c = s.clubs[id]; return c.players.find(p => !regular(c, p)); };

test('free agents: a signing-on fee of half his value, his terms whatever they are, at any time', () => {
  const s = fresh(), p = [...s.market].sort((a, b) => value(a) - value(b))[0], club = myClub(s), t = terms(s, p), bal = club.fin.balance;
  s.day = 100; // window closed: free agents still sign
  s.budget = signingFee(p) - 1;
  assert.equal(buy(s, p.id), 'Not enough transfer budget.');
  s.budget = signingFee(p);
  assert.equal(buy(s, p.id), null);
  assert.ok(club.players.includes(p) && !s.market.includes(p));
  assert.deepEqual(p.contract, { wage: t.wage, until: s.season + t.years - 1, clause: t.clause });
  assert.deepEqual([s.budget, club.fin.balance, club.fin.season.fees], [0, bal - signingFee(p), signingFee(p)]);
  assert.equal(buy(s, -1), 'Player not available.');
});

test('a full squad signs nobody', () => {
  const s = fresh();
  while (myClub(s).players.length < MAX_SQUAD) assert.equal(buy(s, s.market[0].id), null);
  assert.equal(buy(s, s.market[0].id), `Squad is full (${MAX_SQUAD}).`);
});

test('bids: rejected, countered, the counter accepted; the fee moves between the clubs', () => {
  const s = fresh(), p = target(s, 4), c = s.clubs[4], me = myClub(s), ask = asking(s, c, p);
  const bal = [me.fin.balance, c.fin.balance], b0 = s.budget;
  assert.match(bid(s, p.id, ask * 0.5), /rejected the bid\. 2 rounds/);
  assert.equal(talksOn(s, p.id).counter, null);
  assert.match(bid(s, p.id, ask * 0.8), /want €/);
  const counter = talksOn(s, p.id).counter;
  assert.equal(counter, Math.max(r10k((r10k(ask * 0.8) + ask) / 2), r10k(FLOOR * ask)));
  assert.equal(acceptCounter(s, p.id), null);
  assert.ok(me.players.includes(p) && !c.players.includes(p));
  assert.deepEqual([me.fin.balance, c.fin.balance, s.budget], [bal[0] - counter, bal[1] + counter, b0 - counter]);
  assert.equal(p.contract.wage, terms(s, p).wage);
});

test('bids: the floor is accepted at once, a release clause always; three rounds and talks stop', () => {
  const s = fresh(), c = s.clubs[4], [a, b] = c.players.filter(p => !regular(c, p)), d = target(s, 5);
  assert.equal(bid(s, a.id, FLOOR * asking(s, c, a)), null);
  b.contract.clause = 1e5;
  assert.equal(bid(s, b.id, 1e5), null);
  const c5 = s.clubs[5];
  for (let k = 0; k < 3; k++) assert.match(bid(s, d.id, 1e4), /rejected/);
  assert.match(bid(s, d.id, 1e4), /stopped talking/);
  assert.equal(bid(s, d.id, asking(s, c5, d)), null); // a full asking price still gets him
});

test('bids need an open window, a player willing to come and a seller with players to spare', () => {
  const s = fresh(), top = s.clubs[0], star = top.players.find(p => regular(top, p) && p.age < 31);
  star.morale = 50;
  assert.match(bid(s, star.id, 1e9), /two divisions/);
  const p = target(s, 4);
  s.day = SUMMER_END;
  assert.equal(bid(s, p.id, 1e9), 'The transfer window is closed.');
  s.day = -1;
  s.clubs[4].players.splice(MIN_SQUAD);
  assert.match(bid(s, target(s, 4).id, 1e9), /need every player/);
});

test('loans in: a young fringe player for half his wage, at most four', () => {
  const s = fresh(), c = s.clubs[4], me = myClub(s);
  const p = c.players.find(x => !regular(c, x));
  p.age = 20; p.contract.until = 3;
  const bill = wageBill(me);
  assert.equal(loanIn(s, p.id), null);
  assert.deepEqual(p.loan, { from: 4, until: 1, share: LOAN_SHARE });
  assert.equal(wageBill(me), bill + p.contract.wage - Math.round(p.contract.wage * (1 - LOAN_SHARE)));
  assert.match(sell(s, p.id), /on loan here/);
  const regularOne = c.players.find(x => regular(c, x));
  regularOne.age = 20;
  assert.match(loanIn(s, regularOne.id), /won't lend/);
});

test('quick sale: half his value from the richest club in reach that he would join; not a player who just joined', () => {
  const s = fresh(), me = myClub(s), p = me.players.find(x => x.id === s.lineup[0]), b0 = s.budget;
  assert.equal(sell(s, p.id), null);
  const buyer = s.clubs.find(c => c.players.includes(p));
  assert.ok(buyer && buyer !== me && Math.abs(buyer.div - me.div) <= 1);
  assert.equal(s.budget, b0 + r10k(QUICK_SALE * value(p)));
  assert.equal(new Set(s.lineup).size, 11);
  const fa = s.market[0];
  assert.equal(buy(s, fa.id), null);
  assert.match(sell(s, fa.id), /only just joined/);
  while (me.players.length > MIN_SQUAD) { const x = me.players.find(q => q !== fa); assert.equal(sell(s, x.id), null); }
  assert.equal(sell(s, me.players.find(q => q !== fa).id), `You need at least ${MIN_SQUAD} players.`);
});

test('offers: a listed player draws bids; accept, reject or counter', () => {
  const s = fresh(), me = myClub(s), rng = makeRng(3);
  for (const p of me.players) assert.equal(setListing(s, p.id, 'sale'), null);
  for (let k = 0; k < 5 && s.offers.length < 3; k++) marketDay(s, rng);
  assert.ok(s.offers.length >= 3, `${s.offers.length} offers`);
  assert.ok(s.news.some(n => n.type === 'offer'));
  const [o1, o2, o3] = s.offers, p1 = me.players.find(p => p.id === o1.id), bal = me.fin.balance;
  assert.equal(acceptOffer(s, o1.id), null);
  assert.ok(s.clubs[o1.club].players.includes(p1));
  assert.equal(me.fin.balance, bal + o1.fee);
  assert.equal(rejectOffer(s, o2.id), null);
  assert.equal(acceptOffer(s, o2.id), 'That offer has gone.');
  assert.match(counterOffer(s, o3.id, o3.max + 1e5), /walked away/);
  assert.ok(!s.offers.some(o => o.id === o3.id));
});

test('offers lapse when the window shuts; a player listed for loan goes out on loan', () => {
  const s = fresh(), me = myClub(s), kid = me.players.find(p => p.age <= 23);
  kid.contract.until = 3;
  assert.equal(setListing(s, kid.id, 'loan'), null);
  for (const p of me.players) if (p !== kid) setListing(s, p.id, 'sale');
  while (s.day < SUMMER_END) playDay(s);
  assert.equal(s.offers.length, 0);
  assert.ok(kid.loan?.from === 14 && !me.players.includes(kid), 'kid not loaned out');
  const old = me.players.find(p => p.age > 23);
  assert.match(setListing(s, old.id, 'loan'), /23 or under/);
});

test('a signing after the last match day counts from next season and survives the rollover', () => {
  const s = fresh();
  while (!s.done) playDay(s);
  const p = [...s.market].sort((a, b) => value(a) - value(b))[0], t = terms(s, p);
  assert.equal(buy(s, p.id), null);
  assert.equal(p.contract.until, s.season + t.years);
  endSeason(s);
  assert.ok(myClub(s).players.includes(p));
});
