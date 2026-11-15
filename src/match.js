import { makeRng } from './rng.js';
import { slots, eff, SLOT_WEIGHT, formationBonus } from './lineup.js';

// Minute-by-minute match engine. A match is a plain JSON object (see startMatch), so a live match
// can sit in the career state and be saved half-way through. Each minute: one side has the ball and
// may shoot (chance quality xG, the finisher and the keeper decide the outcome), and everyone tires.
// Tuning: calibrated on the real leagues, see the 'a season of real leagues' test in tests/england.test.js.
const MINUTES = 90;
const HOME_EDGE = 1.12;      // home side's extra share of the ball and of chances
const SHOT_RATE = 0.25;      // chance per minute that the side on the ball shoots, between equal sides
const SPREAD = 40;           // how strongly an attack-vs-defence gap changes that chance
const FATIGUE = 0.3;         // fitness lost per minute by an outfielder with stamina 12
const SHOOT_WEIGHT = { GK: 0, DF: 1, MF: 2, FW: 4 };
const ASSIST_WEIGHT = { GK: 0, DF: 1, MF: 3, FW: 2 };
const CONTROL_WEIGHT = { GK: 0, DF: 0.5, MF: 1, FW: 0.5 };

function pickWeighted(rng, items, weight) {
  const total = items.reduce((t, x) => t + weight(x), 0);
  if (!total) return null;
  let r = rng.next() * total;
  for (const x of items) if ((r -= weight(x)) < 0) return x;
  return items[items.length - 1];
}
const active = (m, i) => m.sides[i].on.filter(o => !m.pl[o.id].inj);
const keeperOf = (m, i) => { const k = active(m, i).find(o => o.pos === 'GK'); return k ? m.pl[k.id] : null; };

// The whole squad snapshots into m.pl; everyone not in the XI is on the bench.
// ponytail: whole squad on the bench; a 7-man matchday squad when Phase 3 adds squad selection.
function makeSide({ club, ids, formation }, side, pl) {
  const pos = slots(formation);
  for (const p of club.players)
    pl[p.id] = { name: p.name, pos: p.pos, attrs: p.attrs, side, fit: 100, rt: 6, yc: 0, inj: false, played: ids.includes(p.id) };
  return {
    club: club.id, formation, auto: true, subs: 0,
    on: ids.map((id, k) => ({ id, pos: pos[k] })),
    bench: club.players.filter(p => !ids.includes(p.id)).map(p => p.id),
    st: { goals: 0, shots: 0, on: 0, poss: 0, fouls: 0, yc: 0, rc: 0 },
  };
}

// home/away: { club, ids, formation } as built by entry() in season.js.
export function startMatch(seed, home, away) {
  const pl = {};
  return { seed, min: 0, done: false, pl, sides: [makeSide(home, 0, pl), makeSide(away, 1, pl)], ev: [] };
}

// Attack and defence as in strength() (lineup.js), but tired players count for less, and injured or
// sent-off players count for nothing (the divisors stay those of a full XI). ctrl decides possession.
export function power(m, i) {
  const S = m.sides[i], bonus = formationBonus(S.formation);
  let a = 0, d = 0, c = 0, aw = 0, dw = 0, cw = 0;
  for (const pos of slots(S.formation)) { aw += SLOT_WEIGHT[pos][0]; dw += SLOT_WEIGHT[pos][1]; cw += CONTROL_WEIGHT[pos]; }
  for (const { id, pos } of active(m, i)) {
    const p = m.pl[id], e = eff(p, pos) * (0.7 + 0.3 * p.fit / 100);
    a += e * SLOT_WEIGHT[pos][0]; d += e * SLOT_WEIGHT[pos][1]; c += e * CONTROL_WEIGHT[pos];
  }
  return { att: a / aw * bonus.att, def: d / dw * bonus.def, ctrl: c / cw };
}

function shot(m, rng, i) {
  const S = m.sides[i], team = active(m, i), o = pickWeighted(rng, team, x => SHOOT_WEIGHT[x.pos]);
  if (!o) return;
  const p = m.pl[o.id], keeper = keeperOf(m, 1 - i);
  const xg = Math.min(0.9, (0.02 + 0.33 * rng.next() ** 2.2) * (0.6 + (p.attrs.finishing + p.attrs.composure) / 50));
  const stop = keeper ? (keeper.attrs.handling + keeper.attrs.reflexes) / 2 : 0; // nobody in goal: stop 0
  const pGoal = Math.min(0.95, xg * (1.3 - stop / 33));
  const e = { min: m.min, side: i, type: 'miss', id: o.id, name: p.name, xg: Math.round(xg * 100) / 100 };
  S.st.shots++;
  const r = rng.next();
  if (r < pGoal) {
    e.type = 'goal'; S.st.on++; S.st.goals++; p.rt += 1;
    const a = rng.next() < 0.75 ? pickWeighted(rng, team.filter(x => x !== o), x => ASSIST_WEIGHT[x.pos]) : null;
    if (a) { m.pl[a.id].rt += 0.6; e.assist = a.id; e.assistName = m.pl[a.id].name; }
    for (const x of m.sides[1 - i].on) if (x.pos === 'GK') m.pl[x.id].rt -= 0.4; else if (x.pos === 'DF') m.pl[x.id].rt -= 0.2;
  } else if (r < pGoal + 0.3) { e.type = 'save'; S.st.on++; p.rt += 0.1; if (keeper) keeper.rt += 0.2; }
  else p.rt -= 0.05;
  m.ev.push(e);
}

function tire(m) {
  for (const S of m.sides) for (const o of S.on) {
    const p = m.pl[o.id];
    p.fit = Math.max(0, p.fit - FATIGUE * (o.pos === 'GK' ? 0.4 : 1) * (1.6 - p.attrs.stamina / 20));
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

// ponytail: no stoppage time, penalties or set pieces; set pieces come with Phase 3 takers.
export function stepMinute(m) {
  if (m.done) return;
  const rng = makeRng(m.seed);
  m.min++;
  const P = [power(m, 0), power(m, 1)], home = P[0].ctrl * HOME_EDGE;
  const atk = rng.next() < home / (home + P[1].ctrl) ? 0 : 1, def = 1 - atk;
  m.sides[atk].st.poss++;
  if (rng.next() < SHOT_RATE * (atk === 0 ? HOME_EDGE : 1) * Math.exp((P[atk].att - P[def].def) / SPREAD)) shot(m, rng, atk);
  tire(m);
  if (m.min === MINUTES) finish(m);
  m.seed = rng.seed;
}

// The shape season.js stores in state.last: ratings are 3.0-10.0, best first.
export function matchResult(m) {
  const [H, A] = m.sides;
  const ratings = Object.entries(m.pl).filter(([, p]) => p.played)
    .map(([id, p]) => ({ id: +id, name: p.name, side: p.side, rt: Math.round(Math.max(3, Math.min(10, p.rt)) * 10) / 10 }))
    .sort((x, y) => y.rt - x.rt);
  return { h: H.club, a: A.club, hg: H.st.goals, ag: A.st.goals, ev: m.ev, stats: [H.st, A.st], ratings };
}

export function simMatch(rng, home, away) {
  const m = startMatch(rng.int(0, 0xffffffff), home, away);
  while (!m.done) stepMinute(m);
  return matchResult(m);
}
