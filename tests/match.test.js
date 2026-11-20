import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/rng.js';
import { createWorld } from '../src/world.js';
import { FORMATIONS, BENCH, slots, bestXI, strength } from '../src/lineup.js';
import { ROLES, defaultTactics } from '../src/tactics.js';
import { startMatch, stepMinute, matchResult, simMatch, power, preview, substitute, swapPositions, emptySlots, moveTo, setFormation, setLiveTactic, shootout, MAX_SUBS, subLimit } from '../src/match.js';
import { MINI } from './fixtures/mini.js';

const s = createWorld(3, MINI);
const side = (id, formation = '4-4-2') => ({ club: s.clubs[id], ids: bestXI(s.clubs[id], formation), formation });
const play = (seed, h, a) => { const m = startMatch(seed, h, a); while (!m.done) stepMinute(m); return m; };
const SHOTS = ['goal', 'save', 'miss'];

test('at kick-off a side is exactly as strong as its lineup, formation edge included', () => {
  for (const f of Object.keys(FORMATIONS)) {
    const m = startMatch(1, side(0, f), side(1));
    const want = strength(s.clubs[0], bestXI(s.clubs[0], f), f), got = power(m, 0);
    assert.ok(Math.abs(got.att - want.att) < 1e-9 && Math.abs(got.def - want.def) < 1e-9, f);
  }
});

test('a match lasts 90 minutes and its result adds up', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const m = play(seed, side(4), side(5)), r = matchResult(m);
    assert.equal(m.min, 90);
    assert.deepEqual([r.h, r.a], [4, 5]);
    for (const k of [0, 1]) {
      const st = r.stats[k], goals = r.ev.filter(e => e.side === k && e.type === 'goal').length;
      assert.equal(goals, k ? r.ag : r.hg);
      assert.equal(st.shots, r.ev.filter(e => e.side === k && SHOTS.includes(e.type)).length);
      assert.ok(st.shots >= st.on && st.on >= goals);
    }
    assert.equal(r.stats[0].poss + r.stats[1].poss, 90);
    assert.ok(r.ev.every((e, i) => i === 0 || r.ev[i - 1].min <= e.min));
    assert.ok(r.ratings.length >= 22 && r.ratings.every(x => x.rt >= 3 && x.rt <= 10));
    for (let i = 1; i < r.ratings.length; i++) assert.ok(r.ratings[i - 1].rt >= r.ratings[i].rt);
  }
});

test('players tire, and the fitter ones are the ones with more stamina', () => {
  const m = play(9, side(4), side(5));
  const subbedOn = new Set(m.ev.filter(e => e.type === 'sub').map(e => e.in));
  const full = m.sides.flatMap(S => S.on).filter(o => o.pos !== 'GK' && !subbedOn.has(o.id)).map(o => m.pl[o.id]);
  assert.ok(full.length > 10 && full.every(p => p.fit < 100));
  for (const a of full) for (const b of full) if (a.attrs.stamina > b.attrs.stamina) assert.ok(a.fit > b.fit);
});

test('the same seed plays the same match, also when saved and reloaded at half-time', () => {
  const a = startMatch(77, side(0), side(2));
  for (let k = 0; k < 45; k++) stepMinute(a);
  const b = JSON.parse(JSON.stringify(a));
  while (!a.done) stepMinute(a);
  while (!b.done) stepMinute(b);
  assert.deepEqual(matchResult(b), matchResult(a));
  assert.deepEqual(matchResult(play(77, side(0), side(2))), matchResult(a));
});

test('over many matches: sensible scores, a home edge, and the stronger side usually wins', () => {
  const rng = makeRng(3), strong = side(0), weak = side(15), peer = side(1);
  let goals = 0, home = 0, away = 0, strongWins = 0, weakWins = 0;
  for (let i = 0; i < 400; i++) {
    const r = simMatch(rng, strong, peer);
    goals += r.hg + r.ag;
    if (r.hg > r.ag) home++; else if (r.ag > r.hg) away++;
    const m = simMatch(rng, weak, strong);
    if (m.ag > m.hg) strongWins++; else if (m.hg > m.ag) weakWins++;
  }
  assert.ok(goals / 400 > 2.2 && goals / 400 < 3.4, `goals per match ${goals / 400}`);
  assert.ok(home > away, `home ${home} away ${away}`);
  assert.ok(strongWins > weakWins * 5, `${strongWins} vs ${weakWins}`);
});

test('swapPositions swaps two players on the pitch, keeping the slots', () => {
  const m = startMatch(1, side(4), side(5)), S = m.sides[0], [x, y] = [S.on[1], S.on[9]], [a, b] = [x.id, y.id];
  assert.equal(swapPositions(m, 0, a, 99999), 'Pick two players on the pitch.');
  assert.equal(swapPositions(m, 0, a, b), null);
  assert.deepEqual([x.id, y.id, x.pos, y.pos], [b, a, 'DF', 'FW']);
});

test('cards: a second yellow or a straight red sends a player off for good', () => {
  let reds = 0, yellows = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const m = play(seed, side(4), side(5));
    for (const e of m.ev.filter(x => x.type === 'red')) {
      reds++;
      assert.ok(!m.sides[e.side].on.some(o => o.id === e.id), 'sent-off player is still on');
      assert.ok(m.sides[e.side].sent.includes(e.id), 'sent-off player is not remembered');
      const y = m.ev.filter(x => x.type === 'yellow' && x.id === e.id).length;
      assert.ok(e.second ? y === 2 : y <= 1, `${y} yellows before a ${e.second ? 'second-yellow' : 'straight'} red`);
    }
    for (const k of [0, 1]) {
      assert.equal(m.sides[k].on.length, 11 - m.sides[k].st.rc);
      assert.equal(m.sides[k].st.yc, m.ev.filter(x => x.side === k && x.type === 'yellow').length);
    }
    yellows += m.sides[0].st.yc + m.sides[1].st.yc;
  }
  assert.ok(reds > 0 && yellows > 300, `${reds} reds, ${yellows} yellows`);
});

test('AI sides replace injured players at once and use at most five substitutes', () => {
  let injuries = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const m = play(seed, side(4), side(5));
    for (const e of m.ev.filter(x => x.type === 'injury')) {
      injuries++;
      const before = m.ev.slice(0, m.ev.indexOf(e)).filter(x => x.type === 'sub' && x.side === e.side).length;
      if (before < MAX_SUBS) assert.ok(m.ev.some(x => x.type === 'sub' && x.id === e.id && x.min === e.min), 'injured player not replaced');
    }
    for (const S of m.sides) {
      assert.ok(S.subs <= MAX_SUBS);
      assert.equal(new Set([...S.on.map(o => o.id), ...S.bench]).size, S.on.length + S.bench.length);
    }
  }
  assert.ok(injuries > 0);
});

test('substitute: checks the request, swaps the player in, and nobody comes back', () => {
  const m = startMatch(5, side(4), side(5));
  m.sides[0].auto = false;
  const S = m.sides[0], out = S.on[5].id, sub = S.bench[0];
  assert.equal(substitute(m, 0, 99999, sub), 'That player is not on the pitch.');
  assert.equal(substitute(m, 0, out, 99999), 'That player is not on the bench.');
  assert.equal(substitute(m, 0, out, sub), null);
  assert.equal(S.on[5].id, sub);
  assert.ok(!S.bench.includes(sub) && !S.bench.includes(out));
  assert.ok(m.pl[sub].played);
  assert.deepEqual(m.ev.at(-1), { min: 0, side: 0, type: 'sub', id: out, name: m.pl[out].name, in: sub, inName: m.pl[sub].name });
  for (let k = 1; k < MAX_SUBS; k++) assert.equal(substitute(m, 0, S.on[k].id, S.bench[0]), null);
  assert.equal(substitute(m, 0, S.on[6].id, S.bench[0]), `All ${MAX_SUBS} substitutions are used.`);
  while (!m.done) stepMinute(m);
  assert.equal(m.sides[0].subs, MAX_SUBS);
  assert.equal(substitute(m, 1, m.sides[1].on[3].id, m.sides[1].bench[0]), 'The match is over.');
});

test('substitute: a keeper brought on with no GK slot takes the goal; outfielders keep the slot pos', () => {
  const m = startMatch(5, side(4), side(5)), S = m.sides[0];
  S.auto = false;
  S.on = S.on.filter(o => o.pos !== 'GK'); // as if the keeper was sent off
  const gk = S.bench.find(id => m.pl[id].pos === 'GK'), out = S.on[5], outPos = out.pos;
  assert.ok(gk);
  const before = power(m, 0).def;
  assert.equal(substitute(m, 0, out.id, gk), null);
  assert.equal(S.on.find(o => o.id === gk).pos, 'GK');
  assert.ok(power(m, 0).def > before);
  const mf = S.bench.find(id => m.pl[id].pos !== 'GK'), o2 = S.on[1], p2 = o2.pos;
  assert.equal(substitute(m, 0, o2.id, mf), null);
  assert.equal(S.on.find(o => o.id === mf).pos, p2);
});

test('setFormation re-slots the same players; a side down to ten loses its last slot', () => {
  const m = startMatch(5, side(4), side(5)), ids = m.sides[0].on.map(o => o.id).sort();
  setFormation(m, 0, '4-3-3');
  assert.equal(m.sides[0].formation, '4-3-3');
  assert.deepEqual(m.sides[0].on.map(o => o.id).sort(), ids);
  assert.deepEqual(m.sides[0].on.map(o => o.pos), ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW']);
  m.sides[0].on.pop(); // as if sent off
  setFormation(m, 0, '4-4-2');
  assert.deepEqual(m.sides[0].on.map(o => o.pos), ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW']);
  assert.deepEqual(emptySlots(m, 0), ['FW']);
  const df = m.sides[0].on[1].id;
  assert.equal(moveTo(m, 0, df, 'MF'), 'That position is not empty.');
  assert.equal(moveTo(m, 0, df, 'FW'), null); // play two up front, a defender short
  assert.equal(m.sides[0].on[1].pos, 'FW');
  assert.deepEqual(emptySlots(m, 0), ['DF']);
});
const tac = (formation, change = () => {}) => { const t = defaultTactics(slots(formation)); change(t); return t; };
const mine = (id, change, formation = '4-4-2', fam = {}) => ({ ...side(id, formation), tactics: tac(formation, change), fam });
// Plays n matches of club 4 (home, with the given tactics) against club 5 and sums side 0's numbers.
function tally(change, n = 300) {
  const t = { shots: 0, against: 0, poss: 0, fouls: 0, corners: 0, xg: 0, open: 0 };
  for (let seed = 1; seed <= n; seed++) {
    const m = play(seed, mine(4, change), side(5));
    t.shots += m.sides[0].st.shots; t.against += m.sides[1].st.shots; t.poss += m.sides[0].st.poss; t.fouls += m.sides[0].st.fouls;
    for (const e of m.ev.filter(x => x.side === 0 && SHOTS.includes(x.type))) {
      if (e.kind === 'corner') t.corners++;
      if (!e.kind) { t.xg += e.xg; t.open++; }
    }
  }
  return t;
}

test('the matchday bench is seven players, a keeper among them; only they are in the match', () => {
  const m = startMatch(1, side(4), side(5));
  for (const S of m.sides) {
    assert.equal(S.bench.length, BENCH);
    assert.ok(S.bench.some(id => m.pl[id].pos === 'GK'));
    assert.ok(S.bench.every(id => !S.on.some(o => o.id === id)));
  }
  assert.equal(Object.keys(m.pl).length, 2 * (11 + BENCH));
});

test('preview is the side at kick-off; an unfamiliar formation costs 3% at familiarity 0.5', () => {
  const entry = mine(4, t => { t.mentality = 1; t.slots[5].role = 'Playmaker'; });
  assert.deepEqual(preview(entry), power(startMatch(9, entry, side(5)), 0));
  const known = preview(mine(4, undefined, '4-3-3')), raw = preview(mine(4, undefined, '4-3-3', { '4-3-3': 0.5 }));
  for (const k of ['att', 'def', 'ctrl']) assert.ok(Math.abs(raw[k] / known[k] - 0.97) < 1e-9, k);
});

test('team instructions move the match the way their names say', () => {
  const base = tally();
  const attacking = tally(t => { t.mentality = 2; }), pressing = tally(t => { t.pressing = 1; });
  const fast = tally(t => { t.tempo = 1; }), wide = tally(t => { t.width = 1; }), high = tally(t => { t.line = 1; });
  assert.ok(attacking.shots > base.shots * 1.08 && attacking.against > base.against * 1.08, 'attacking: more shots both ways');
  assert.ok(pressing.poss > base.poss && pressing.fouls > base.fouls * 1.15 && pressing.against < base.against, 'pressing');
  assert.ok(fast.shots > base.shots * 1.05 && fast.xg / fast.open < base.xg / base.open * 0.95, 'fast tempo: more, poorer shots');
  assert.ok(wide.corners > base.corners * 1.15, 'wide: more corners');
  assert.ok(high.against < base.against * 0.97, 'high line: fewer shots against');
});

test('roles, duties and instructions change who shoots and who sets up goals', () => {
  const count = (change, k) => {
    let shots = 0, assists = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const m = play(seed, mine(4, change), side(5)), id = m.sides[0].on[k]?.id ?? -1;
      for (const e of m.ev) if (e.side === 0) { if (SHOTS.includes(e.type) && !e.kind && e.id === id) shots++; if (e.assist === id) assists++; }
    }
    return { shots, assists };
  };
  const cm = count(undefined, 5), playmaker = count(t => { t.slots[5].role = 'Playmaker'; }, 5);
  assert.ok(playmaker.assists > cm.assists * 1.25, `${playmaker.assists} vs ${cm.assists}`);
  const st = count(undefined, 9), keen = count(t => { t.slots[9].duty = 'Attack'; t.slots[9].shoot = 1; }, 9);
  assert.ok(keen.shots > st.shots * 1.5, `${keen.shots} vs ${st.shots}`);
});

test('the chosen set-piece takers take penalties, free kicks and corners while they are on', () => {
  let pens = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const h = mine(4), [, , pen, fk, corner] = h.ids;
    h.tactics.takers = { pen, fk, corner };
    const m = startMatch(seed, h, side(5));
    m.sides[0].auto = false; // no AI substitutions for side 0
    while (!m.done) {
      const before = m.ev.length;
      stepMinute(m);
      const on = id => m.sides[0].on.some(o => o.id === id && !m.pl[id].inj);
      for (const e of m.ev.slice(before)) {
        if (e.side !== 0 || e.min !== m.min) continue;
        if (e.kind === 'pen' && on(pen)) { pens++; assert.equal(e.id, pen); }
        if (e.kind === 'fk' && on(fk)) assert.equal(e.id, fk);
        if (e.kind === 'corner' && e.type === 'goal' && on(corner)) assert.equal(e.assist, corner);
      }
    }
  }
  assert.ok(pens > 20, `${pens} penalties`);
});

test('penalties: about one match in four has one, and most are scored', () => {
  let pens = 0, scored = 0;
  for (let seed = 1; seed <= 400; seed++) for (const e of play(seed, side(4), side(5)).ev) if (e.kind === 'pen') { pens++; if (e.type === 'goal') scored++; }
  assert.ok(pens / 400 > 0.15 && pens / 400 < 0.4, `${pens / 400} per match`);
  assert.ok(scored / pens > 0.65 && scored / pens < 0.9, `${scored / pens} scored`);
});

test('keepers rarely go up for corners', () => {
  let corners = 0, keepers = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const m = play(seed, side(4), side(5));
    for (const e of m.ev) if (e.kind === 'corner') { corners++; if (m.pl[e.id].pos === 'GK') keepers++; }
  }
  assert.ok(corners > 100, `${corners} corners`);
  assert.ok(keepers / corners < 0.01, `${keepers} of ${corners} corner attempts by keepers`);
});

test('mid-match changes are checked; a new formation keeps the roles that still fit', () => {
  const m = startMatch(5, mine(4, t => { t.slots[1].role = 'Full-back'; t.slots[6].role = 'Playmaker'; }), side(5));
  const S = m.sides[0];
  assert.equal(setFormation(m, 0, '4-4-4'), 'Unknown formation.');
  assert.equal(setFormation(m, 0, 'constructor'), 'Unknown formation.');
  assert.equal(S.formation, '4-4-2');
  assert.equal(substitute(m, 0, S.on[3].id, S.bench[0], 'XX'), 'Unknown position.');
  assert.equal(S.subs, 0);
  assert.equal(setLiveTactic(m, 0, 'pressing', 1), null);
  assert.equal(S.tac.pressing, 1);
  assert.equal(setLiveTactic(m, 0, 'pressing', 5), 'Unknown team instruction.');
  const fb = S.on[1].id, pm = S.on[6].id;
  assert.equal(setFormation(m, 0, '4-3-3'), null);
  const slot = id => S.on.find(o => o.id === id);
  assert.equal(slot(fb).pos === 'DF' ? slot(fb).role : 'Full-back', 'Full-back');
  assert.ok(S.on.every(o => ROLES[o.pos][o.role]));
  if (slot(pm).pos === 'MF') assert.equal(slot(pm).role, 'Playmaker');
  const out = S.on.find(o => o.pos === 'MF');
  assert.equal(substitute(m, 0, out.id, S.bench[0], 'FW'), null);
  assert.deepEqual(out.role, 'Striker');
});

test('a neutral ground takes away the home edge', () => {
  let homeWins = 0, neutralWins = 0, homePoss = 0, neutralPoss = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const h = play(seed, side(4), side(5)), n = startMatch(seed, side(4), side(5), true);
    while (!n.done) stepMinute(n);
    if (h.sides[0].st.goals > h.sides[1].st.goals) homeWins++;
    if (n.sides[0].st.goals > n.sides[1].st.goals) neutralWins++;
    homePoss += h.sides[0].st.poss; neutralPoss += n.sides[0].st.poss;
  }
  assert.ok(homeWins > neutralWins && homePoss > neutralPoss, `${homeWins} v ${neutralWins}, ${homePoss} v ${neutralPoss}`);
  assert.equal(startMatch(1, side(4), side(5)).neutral, undefined); // only neutral matches carry the flag
});

test('penalty shootout: a winner, a real score, the same every time, in the match result', () => {
  let early = 0, sudden = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const m = play(seed, side(4), side(5)), [a, b] = shootout(m);
    assert.notEqual(a, b);
    assert.deepEqual(m.pens, [a, b]);
    assert.deepEqual(matchResult(m).pens, [a, b]);
    assert.ok(Math.max(a, b) - Math.min(a, b) <= 3 && Math.min(a, b) >= 0);
    if (Math.max(a, b) < 5 && Math.max(a, b) - Math.min(a, b) >= 2) early++;
    if (Math.min(a, b) >= 5) sudden++;
    assert.deepEqual(shootout(JSON.parse(JSON.stringify({ ...m, pens: undefined }))), [a, b]);
  }
  assert.ok(early > 10 && sudden > 5, `${early} ended early, ${sudden} went to sudden death`);
  assert.equal(matchResult(play(1, side(4), side(5))).pens, undefined);
});

test('a player starts a match with his condition, and readiness scales his strength', () => {
  const w = createWorld(3, MINI), club = w.clubs[0], ids = bestXI(club, '4-4-2');
  const home = { club, ids, formation: '4-4-2' }, away = { club: w.clubs[1], ids: bestXI(w.clubs[1], '4-4-2'), formation: '4-4-2' };
  const set = fields => { for (const id of ids) Object.assign(club.players.find(p => p.id === id), fields); };
  const fresh = power(startMatch(1, home, away), 0);
  set({ cond: 60 });
  const m = startMatch(1, home, away), tired = power(m, 0);
  assert.equal(m.pl[ids[0]].fit, 60);
  assert.ok(tired.att < fresh.att && tired.def < fresh.def && tired.ctrl < fresh.ctrl);
  set({ cond: 100, morale: 100 });
  const happy = power(startMatch(1, home, away), 0);
  for (const k of ['att', 'def', 'ctrl']) assert.ok(Math.abs(happy[k] / fresh[k] - 1.02) < 1e-9, k);
});

test('extra time: a knockout match level after 90 plays on to 120, with one more substitution', () => {
  let went = 0, decided = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const m = startMatch(seed, side(4), side(5), false, true);
    while (m.min < 90) stepMinute(m);
    const level = m.sides[0].st.goals === m.sides[1].st.goals;
    assert.equal(m.done, !level);
    if (!level) { decided++; assert.equal(matchResult(m).aet, undefined); continue; }
    went++;
    assert.equal(subLimit(m), MAX_SUBS + 1);
    assert.equal(m.ev.at(-1).type, 'extra');
    while (!m.done) stepMinute(m);
    assert.equal(m.min, 120);
    assert.equal(matchResult(m).aet, true);
    assert.equal(subLimit(m), MAX_SUBS);
  }
  assert.ok(went > 5 && decided > 5, `${went} to extra time, ${decided} decided in 90`);
  assert.equal(play(1, side(4), side(5)).min, 90); // no extra time unless asked
});
