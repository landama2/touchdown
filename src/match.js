import { makeRng } from './rng.js';
import { POS, displayName } from './player.js';
import { FORMATIONS, slots, eff, SLOT_WEIGHT, formationBonus, autoBench } from './lineup.js';
import { ROLES, DUTIES, TEAM_KEYS, defaultSlot, defaultTactics, setTeam, has } from './tactics.js';
import { readiness } from './squad.js';

// Minute-by-minute match engine. A match is a plain JSON object (see startMatch), so a live match
// can sit in the career state and be saved half-way through. Each minute: one side has the ball,
// may shoot (open play, a corner or a direct free kick; chance quality xG, the finisher and the
// keeper decide the outcome), the other side may foul (cards, sometimes a penalty), anyone may get
// injured, everyone tires, and AI sides make substitutions. Tactics (src/tactics.js) shift all of it.
// Tuning: calibrated on the real leagues, see the 'a season of real leagues' test in tests/england.test.js.
export const MAX_SUBS = 5;
const MINUTES = 90;
const HOME_EDGE = 1.12;      // home side's extra share of the ball and of chances
const K = { // tuning; see the calibration note above
  SHOT_RATE: 0.25,      // chance per minute that the side on the ball shoots, between equal sides
  SPREAD: 40,           // how strongly an attack-vs-defence gap changes that chance
  FOUL_RATE: 0.12, YELLOW_BASE: 0.17, STRAIGHT_RED: 0.002, INJURY_RATE: 0.003,
  FATIGUE: 0.3,         // fitness lost per minute by an outfielder with stamina 12
  PEN_SHARE: 0.025,     // share of fouls that give away a penalty
  CORNER_SHARE: 0.18, FK_SHARE: 0.05, // share of shots from a corner / a direct free kick
  FAM_WEIGHT: 0.06,     // a side wholly unfamiliar with its formation loses this share of its power
  MENTALITY: 0.04, LEAN: 0.015, TACKLE_DEF: 0.02, TACKLE_CARD: 0.05,
  PRESS_CTRL: 0.05, PRESS_SHOTS: 0.03, PRESS_FOULS: 0.3, PRESS_TIRE: 0.3,
  PRESS_AGG: 0.5, AGG0: 10, // a High press's control and shots-against effects grow by this share per AGG0 of the outfield's average aggression above AGG0
  TEMPO_SHOTS: 0.12, TEMPO_XG: 0.1, TEMPO_CTRL: 0.04, TEMPO_TIRE: 0.05,
  WIDTH_XG: 0.02, WIDTH0: -2, WIDTH_CORNERS: 0.3,
  LINE_SHOTS: 0.06, LINE_XG: 0.06, LINE_PACE: 0.012, LINE_PACE0: 12,
};
const SHOOT_WEIGHT = { GK: 0, DF: 1, MF: 2, FW: 4 };
const ASSIST_WEIGHT = { GK: 0, DF: 1, MF: 3, FW: 2 };
const CONTROL_WEIGHT = { GK: 0, DF: 0.5, MF: 1, FW: 0.5 };
const SHOOT_INSTR = [[0.5, 1.1], [1, 1], [1.6, 0.88]]; // shoot less / normal / more: [how often, chance quality]
const TACKLE_FOUL = [0.6, 1, 1.6];
const TAKER = { // who takes a set piece when the manager has not picked anyone (or he is off the pitch)
  pen: p => p.attrs.finishing + p.attrs.composure,
  fk: p => p.attrs.finishing + p.attrs.crossing,
  corner: p => p.attrs.crossing + p.attrs.vision,
};

function pickWeighted(rng, items, weight) {
  const total = items.reduce((t, x) => t + weight(x), 0);
  if (!total) return null;
  let r = rng.next() * total;
  for (const x of items) if ((r -= weight(x)) < 0) return x;
  return items[items.length - 1];
}
const active = (m, i) => m.sides[i].on.filter(o => !m.pl[o.id].inj);
const keeperOf = (m, i) => { const k = active(m, i).find(o => o.pos === 'GK'); return k ? m.pl[k.id] : null; };
const role = o => ROLES[o.pos][o.role];
const avg = (list, f) => list.length ? list.reduce((t, x) => t + f(x), 0) / list.length : 0;
// Side i's pressing instruction as it plays out: a High press grows with the outfield's average aggression
// (x1 at AGG0, x1.5 at twice it, x0.5 at none); Normal and Low are never changed by it.
const pressing = (m, i) => { const p = m.sides[i].tac.pressing; return p > 0 ? p * (1 + K.PRESS_AGG * (avg(active(m, i).filter(o => o.pos !== 'GK'), o => m.pl[o.id].attrs.aggression) / K.AGG0 - 1)) : p; };

// home/away: { club, ids, formation, bench, tactics, fam } as built by entry() in season.js. AI sides
// leave out the last three: the best bench, default tactics, and full familiarity with every formation.
function makeSide({ club, ids, formation, bench = autoBench(club, ids), tactics = defaultTactics(slots(formation)), fam = {} }, side, pl) {
  const pos = slots(formation);
  for (const id of [...ids, ...bench]) {
    const p = club.players.find(x => x.id === id);
    pl[id] = { name: displayName(p), pos: p.pos, attrs: p.attrs, side, fit: p.cond, edge: readiness(p), rt: 6, yc: 0, inj: false, played: ids.includes(id) };
  }
  return {
    club: club.id, formation, auto: true, subs: 0,
    tac: Object.fromEntries(TEAM_KEYS.map(k => [k, tactics[k]])), takers: { ...tactics.takers }, fam: { ...fam },
    on: ids.map((id, k) => ({ id, pos: pos[k], ...tactics.slots[k] })),
    bench: [...bench],
    st: { goals: 0, shots: 0, on: 0, poss: 0, fouls: 0, yc: 0, rc: 0 },
  };
}

// neutral: a final at a neutral ground, where side 0 has no home edge.
export function startMatch(seed, home, away, neutral = false) {
  const pl = {}, m = { seed, min: 0, done: false, pl, sides: [makeSide(home, 0, pl), makeSide(away, 1, pl)], ev: [] };
  if (neutral) m.neutral = true;
  return m;
}

// Attack, defence and ball control of side i right now. Like strength() (lineup.js) at kick-off with
// default tactics and fresh players, but tired players count for less, injured or sent-off players
// for nothing (the divisors stay those of a full XI), each player's readiness (morale, form,
// sharpness: src/squad.js) scales him, and tactics and formation familiarity shift the result.
export function power(m, i) {
  const S = m.sides[i], t = S.tac, bonus = formationBonus(S.formation);
  const fam = 1 - K.FAM_WEIGHT * (1 - (S.fam[S.formation] ?? 1));
  let a = 0, d = 0, c = 0, aw = 0, dw = 0, cw = 0, lean = 0;
  for (const pos of slots(S.formation)) { aw += SLOT_WEIGHT[pos][0]; dw += SLOT_WEIGHT[pos][1]; cw += CONTROL_WEIGHT[pos]; }
  for (const o of active(m, i)) {
    const p = m.pl[o.id], e = eff(p, o.pos, o.role) * (0.7 + 0.3 * p.fit / 100) * (p.edge ?? 1); // edge: missing in a version 5 live match
    a += e * SLOT_WEIGHT[o.pos][0]; d += e * SLOT_WEIGHT[o.pos][1] * (1 + K.TACKLE_DEF * o.tackle); c += e * CONTROL_WEIGHT[o.pos];
    lean += DUTIES[o.duty].lean;
  }
  const tilt = K.MENTALITY * t.mentality + K.LEAN * lean;
  return {
    att: a / aw * bonus.att * fam * (1 + tilt),
    def: d / dw * bonus.def * fam * (1 - tilt),
    ctrl: c / cw * fam * (1 + K.PRESS_CTRL * pressing(m, i) - K.TEMPO_CTRL * t.tempo),
  };
}

function taker(m, i, kind) {
  const team = active(m, i).filter(o => o.pos !== 'GK'), want = m.sides[i].takers[kind];
  return team.find(o => o.id === want) || team.reduce((b, o) => !b || TAKER[kind](m.pl[o.id]) > TAKER[kind](m.pl[b.id]) ? o : b, null);
}

// One attempt on goal by player o of side i. pGoal null = decided by chance quality and the keeper.
function attempt(m, rng, i, o, xg, kind, assistFrom, pGoal = null) {
  const S = m.sides[i], p = m.pl[o.id], keeper = keeperOf(m, 1 - i);
  const stop = keeper ? (keeper.attrs.handling + keeper.attrs.reflexes) / 2 : 0; // nobody in goal: stop 0
  pGoal ??= Math.min(0.95, xg * (1.3 - stop / 33));
  const e = { min: m.min, side: i, type: 'miss', id: o.id, name: p.name, xg: Math.round(xg * 100) / 100 };
  if (kind !== 'open') e.kind = kind;
  S.st.shots++;
  const r = rng.next();
  if (r < pGoal) {
    e.type = 'goal'; S.st.on++; S.st.goals++; p.rt += 1;
    const a = assistFrom && assistFrom();
    if (a) { m.pl[a.id].rt += 0.6; e.assist = a.id; e.assistName = m.pl[a.id].name; }
    for (const x of m.sides[1 - i].on) if (x.pos === 'GK') m.pl[x.id].rt -= 0.4; else if (x.pos === 'DF') m.pl[x.id].rt -= 0.2;
  } else if (r < pGoal + (kind === 'pen' ? 0.7 * (1 - pGoal) : 0.3)) { e.type = 'save'; S.st.on++; p.rt += 0.1; if (keeper) keeper.rt += 0.2; }
  else p.rt -= 0.05;
  m.ev.push(e);
}

function shot(m, rng, i) {
  const S = m.sides[i], D = m.sides[1 - i], team = active(m, i), r = rng.next();
  const defs = active(m, 1 - i).filter(o => o.pos === 'DF');
  const pace = defs.length ? avg(defs, o => m.pl[o.id].attrs.pace) : K.LINE_PACE0;
  const conceded = 1 + D.tac.line * (K.LINE_XG + K.LINE_PACE * (K.LINE_PACE0 - pace)); // a high line with slow defenders leaks chances
  const corner = K.CORNER_SHARE * (1 + K.WIDTH_CORNERS * S.tac.width);
  if (r < corner) {
    const t = taker(m, i, 'corner'), o = t && pickWeighted(rng, team.filter(x => x !== t), x => (m.pl[x.id].attrs.heading + 1) * (role(x).header ?? 1));
    if (!o) return;
    const xg = Math.min(0.9, (0.02 + 0.2 * rng.next() ** 2.2) * (0.6 + (m.pl[o.id].attrs.heading + m.pl[t.id].attrs.crossing) / 50) * conceded);
    return attempt(m, rng, i, o, xg, 'corner', () => t);
  }
  if (r < corner + K.FK_SHARE) {
    const o = taker(m, i, 'fk');
    if (!o) return;
    const p = m.pl[o.id], xg = Math.min(0.9, (0.03 + 0.08 * rng.next()) * (0.6 + (p.attrs.finishing + p.attrs.crossing) / 50) * conceded);
    return attempt(m, rng, i, o, xg, 'fk', null);
  }
  const o = pickWeighted(rng, team, x => SHOOT_WEIGHT[x.pos] * (role(x).shoot ?? 1) * DUTIES[x.duty].shoot * SHOOT_INSTR[x.shoot + 1][0]);
  if (!o) return;
  const p = m.pl[o.id], outfield = team.filter(x => x.pos !== 'GK');
  const width = 1 + K.WIDTH_XG * S.tac.width * (avg(outfield, x => m.pl[x.id].attrs.crossing - m.pl[x.id].attrs.passing) - K.WIDTH0);
  const xg = Math.min(0.9, (0.02 + 0.33 * rng.next() ** 2.2) * (0.6 + (p.attrs.finishing + p.attrs.composure) / 50)
    * SHOOT_INSTR[o.shoot + 1][1] * (1 - K.TEMPO_XG * S.tac.tempo) * width * conceded);
  attempt(m, rng, i, o, xg, 'open', () => rng.next() < 0.75 ? pickWeighted(rng, team.filter(x => x !== o), x => ASSIST_WEIGHT[x.pos] * (role(x).assist ?? 1)) : null);
}

// Chance that player p scores a penalty against side i's keeper (no keeper: an open goal, nearly).
function penScore(m, p, i) {
  const keeper = keeperOf(m, i), stop = keeper ? (keeper.attrs.handling + keeper.attrs.reflexes) / 2 : 0;
  return Math.max(0.4, Math.min(0.95, 0.6 + 0.01 * (p.attrs.finishing + p.attrs.composure) - 0.008 * stop));
}

function penalty(m, rng, i) {
  const o = taker(m, i, 'pen');
  if (!o) return;
  attempt(m, rng, i, o, 0.76, 'pen', null, penScore(m, m.pl[o.id], 1 - i));
}

function sendOff(m, i, o, second) {
  const S = m.sides[i], p = m.pl[o.id];
  S.on = S.on.filter(x => x !== o);
  (S.sent ??= []).push(o.id); // kept for the match screen: shown, never subbed
  S.st.rc++; p.rt -= 1.5;
  m.ev.push({ min: m.min, side: i, type: 'red', id: o.id, name: p.name, second });
}

function foul(m, rng, i) {
  const S = m.sides[i], o = pickWeighted(rng, active(m, i), x => (m.pl[x.id].attrs.aggression + 1) * (role(x).foul ?? 1) * TACKLE_FOUL[x.tackle + 1]);
  if (!o) return;
  const p = m.pl[o.id], r = rng.next();
  S.st.fouls++;
  if (r < K.STRAIGHT_RED) sendOff(m, i, o, false);
  else if (r < K.YELLOW_BASE + p.attrs.aggression / 100 + K.TACKLE_CARD * o.tackle) {
    p.yc++; p.rt -= 0.3; S.st.yc++;
    m.ev.push({ min: m.min, side: i, type: 'yellow', id: o.id, name: p.name });
    if (p.yc === 2) sendOff(m, i, o, true);
  }
  if (rng.next() < K.PEN_SHARE) penalty(m, rng, 1 - i);
}

// The match only marks the injury; afterMatch() in src/squad.js gives it a recovery time.
function injury(m, rng, i) {
  const team = active(m, i);
  if (!team.length) return;
  const o = team[rng.int(0, team.length - 1)], p = m.pl[o.id];
  p.inj = true;
  m.ev.push({ min: m.min, side: i, type: 'injury', id: o.id, name: p.name });
}

function tire(m) {
  for (const S of m.sides) {
    const t = 1 + K.PRESS_TIRE * S.tac.pressing + K.TEMPO_TIRE * S.tac.tempo;
    for (const o of S.on) {
      const p = m.pl[o.id];
      p.fit = Math.max(0, p.fit - K.FATIGUE * t * (o.pos === 'GK' ? 0.4 : 1) * (1.6 - p.attrs.stamina / 20));
    }
  }
}

// Returns an error message, or null when the change is made. The new player takes the slot of the
// one going off, with its role and instructions (or `pos` with that position's default role).
// A player who goes off cannot come back.
export function substitute(m, i, outId, inId, pos) {
  const S = m.sides[i], slot = S.on.find(o => o.id === outId);
  if (m.done) return 'The match is over.';
  if (!slot) return 'That player is not on the pitch.';
  if (!S.bench.includes(inId)) return 'That player is not on the bench.';
  if (S.subs >= MAX_SUBS) return `All ${MAX_SUBS} substitutions are used.`;
  if (pos !== undefined && !POS.includes(pos)) return 'Unknown position.';
  S.subs++;
  S.bench = S.bench.filter(id => id !== inId);
  m.pl[inId].played = true;
  slot.id = inId;
  if (!pos && m.pl[inId].pos === 'GK' && !S.on.some(o => o.pos === 'GK')) pos = 'GK'; // keeper back in goal after a red card
  if (pos && pos !== slot.pos) Object.assign(slot, defaultSlot(pos), { pos });
  m.ev.push({ min: m.min, side: i, type: 'sub', id: outId, name: m.pl[outId].name, in: inId, inName: m.pl[inId].name });
  return null;
}

// Swaps the positions of two of side i's players on the pitch; each takes the other's slot with
// its role and instructions. Returns an error message or null.
export function swapPositions(m, i, a, b) {
  const on = m.sides[i].on, x = on.find(o => o.id === a), y = on.find(o => o.id === b);
  if (m.done) return 'The match is over.';
  if (!x || !y || a === b) return 'Pick two players on the pitch.';
  [x.id, y.id] = [b, a];
  return null;
}

// The formation's positions nobody on the pitch fills (after a red card), one entry per empty slot.
export function emptySlots(m, i) {
  const left = m.sides[i].on.map(o => o.pos);
  return slots(m.sides[i].formation).filter(pos => { const k = left.indexOf(pos); if (k < 0) return true; left.splice(k, 1); return false; });
}

// Moves one of side i's players into an empty slot of the formation; his old slot is left empty.
// He keeps his role and instructions where the role fits. Returns an error message or null.
export function moveTo(m, i, id, pos) {
  const o = m.sides[i].on.find(x => x.id === id);
  if (m.done) return 'The match is over.';
  if (!o) return 'That player is not on the pitch.';
  if (!emptySlots(m, i).includes(pos)) return 'That position is not empty.';
  if (pos !== o.pos) Object.assign(o, has(ROLES[pos], o.role) ? {} : defaultSlot(pos), { pos });
  return null;
}

// Re-slots the players on the pitch into a new shape, greedily, like bestXI(); each keeps his role
// and instructions where the role fits his new position. With fewer than eleven on the pitch the
// last slots (forwards first) stay empty. Returns an error message or null.
export function setFormation(m, i, formation) {
  if (!has(FORMATIONS, formation)) return 'Unknown formation.';
  const S = m.sides[i], old = S.on, used = new Set();
  S.formation = formation;
  S.on = slots(formation).flatMap(pos => {
    let best = null;
    for (const o of old) if (!used.has(o) && (best === null || eff(m.pl[o.id], pos) > eff(m.pl[best.id], pos))) best = o;
    if (best === null) return [];
    used.add(best);
    const { id, role, ...instr } = best;
    return [{ ...instr, ...(has(ROLES[pos], role) ? { role } : defaultSlot(pos)), id, pos }];
  });
  return null;
}

// Changes one team instruction of side i mid-match (see TEAM in tactics.js).
export const setLiveTactic = (m, i, key, v) => setTeam(m.sides[i].tac, key, v);

const bestFor = (m, S, pos) => S.bench.reduce((b, id) => b === null || eff(m.pl[id], pos) > eff(m.pl[b], pos) ? id : b, null);

// AI manager: replace the injured at once, put a keeper back in goal after a keeper's red card,
// and from the hour mark take off the most tired outfielder (one per ten minutes, three at most).
function autoSubs(m, i) {
  const S = m.sides[i];
  if (S.subs >= MAX_SUBS || !S.bench.length || !S.on.length) return;
  const hurt = S.on.find(o => m.pl[o.id].inj);
  if (hurt) return void substitute(m, i, hurt.id, bestFor(m, S, hurt.pos));
  if (!S.on.some(o => o.pos === 'GK')) {
    const worst = S.on.reduce((w, o) => eff(m.pl[o.id], o.pos) < eff(m.pl[w.id], w.pos) ? o : w);
    return void substitute(m, i, worst.id, bestFor(m, S, 'GK'), 'GK');
  }
  if (m.min >= 60 && m.min % 10 === 0 && S.subs < 3) {
    const tired = S.on.filter(o => o.pos !== 'GK').reduce((w, o) => w === null || m.pl[o.id].fit < m.pl[w.id].fit ? o : w, null);
    if (tired && m.pl[tired.id].fit < 75) substitute(m, i, tired.id, bestFor(m, S, tired.pos));
  }
}

function finish(m) {
  m.done = true;
  const g = m.sides.map(S => S.st.goals);
  for (const p of Object.values(m.pl)) if (p.played) {
    p.rt += 0.3 * Math.sign(g[p.side] - g[1 - p.side]);
    if (g[1 - p.side] === 0 && (p.pos === 'GK' || p.pos === 'DF')) p.rt += 0.5; // clean sheet
  }
}

// ponytail: no stoppage time.
export function stepMinute(m) {
  if (m.done) return;
  const rng = makeRng(m.seed);
  m.min++;
  const edge = m.neutral ? 1 : HOME_EDGE, P = [power(m, 0), power(m, 1)], home = P[0].ctrl * edge;
  const atk = rng.next() < home / (home + P[1].ctrl) ? 0 : 1, def = 1 - atk, ta = m.sides[atk].tac, td = m.sides[def].tac;
  m.sides[atk].st.poss++;
  const chance = K.SHOT_RATE * (atk === 0 ? edge : 1) * Math.exp((P[atk].att - P[def].def) / K.SPREAD)
    * (1 + K.TEMPO_SHOTS * ta.tempo) * (1 - K.LINE_SHOTS * td.line - K.PRESS_SHOTS * pressing(m, def));
  if (rng.next() < chance) shot(m, rng, atk);
  if (rng.next() < K.FOUL_RATE * (1 + K.PRESS_FOULS * td.pressing)) foul(m, rng, def);
  if (rng.next() < K.INJURY_RATE) injury(m, rng, rng.int(0, 1));
  tire(m);
  for (const i of [0, 1]) if (m.sides[i].auto) autoSubs(m, i);
  if (m.min === MINUTES) finish(m);
  m.seed = rng.seed;
}

// The shape season.js stores in state.last: ratings are 3.0-10.0, best first.
export function matchResult(m) {
  const [H, A] = m.sides;
  const ratings = Object.entries(m.pl).filter(([, p]) => p.played)
    .map(([id, p]) => ({ id: +id, name: p.name, side: p.side, rt: Math.round(Math.max(3, Math.min(10, p.rt)) * 10) / 10 }))
    .sort((x, y) => y.rt - x.rt);
  const r = { h: H.club, a: A.club, hg: H.st.goals, ag: A.st.goals, ev: m.ev, stats: [H.st, A.st], ratings };
  if (m.pens) r.pens = m.pens;
  return r;
}

// Penalty shootout after a finished match: five kicks each, then sudden death; it stops as soon as
// one side cannot be caught. Each side's takers in order: the chosen penalty taker, then the
// players on the pitch by penalty skill (keepers last), round again if needed. Stores m.pens = [home, away].
export function shootout(m) {
  const rng = makeRng(m.seed), skill = p => p.attrs.finishing + p.attrs.composure;
  const order = m.sides.map((S, i) => {
    const team = active(m, i).map(o => m.pl[o.id]).sort((a, b) => (a.pos === 'GK') - (b.pos === 'GK') || skill(b) - skill(a));
    const first = m.pl[S.takers.pen];
    return first && team.includes(first) ? [first, ...team.filter(p => p !== first)] : team;
  });
  const score = [0, 0];
  for (let k = 0; k < 100; k++) {
    for (const i of [0, 1]) {
      const takers = order[i], p = takers[k % takers.length];
      if (p && rng.next() < penScore(m, p, 1 - i)) score[i]++;
      const left = j => Math.max(0, 5 - k - (j <= i ? 1 : 0)); // kicks still to come in the first five
      if (k < 5 && (score[0] > score[1] + left(1) || score[1] > score[0] + left(0))) return (m.pens = score);
    }
    if (k >= 4 && score[0] !== score[1]) return (m.pens = score);
  }
  return (m.pens = [score[0] + 1, score[1]]); // ponytail: only reached when neither side has a player left
}

export function simMatch(rng, home, away) {
  const m = startMatch(rng.int(0, 0xffffffff), home, away);
  while (!m.done) stepMinute(m);
  return matchResult(m);
}

// Attack, defence and control of a lineup before kick-off, tactics included (for the Squad screen).
export function preview(entry) {
  const pl = {};
  return power({ pl, sides: [makeSide(entry, 0, pl)] }, 0);
}
