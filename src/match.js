import { slots, strength } from './lineup.js';

// Quick result model: Poisson goals from attack-vs-defence. Phase 2 replaces this file
// with the minute-by-minute engine; keep the simMatch signature and result shape.
// SPREAD 25: top v bottom of one division (≈15 overall apart) averages roughly 2.4–0.7.
const BASE_GOALS = 1.35, HOME_EDGE = 1.15, SPREAD = 25;
const SCORER_WEIGHT = { GK: 0, DF: 1, MF: 2, FW: 4 };

function poisson(rng, lambda) {
  let k = 0, p = Math.exp(-lambda), c = p;
  const u = rng.next();
  while (u > c && k < 12) { k++; p *= lambda / k; c += p; }
  return k;
}

function prepare({ club, ids, formation }) {
  return { club, ids, pos: slots(formation), ...strength(club, ids, formation) };
}

function scorer(rng, side) {
  const pool = side.ids.flatMap((id, i) => Array(SCORER_WEIGHT[side.pos[i]]).fill(id));
  const id = rng.pick(pool);
  return side.club.players.find(p => p.id === id).name;
}

export function simMatch(rng, home, away) {
  const H = prepare(home), A = prepare(away);
  const hg = poisson(rng, BASE_GOALS * HOME_EDGE * Math.exp((H.att - A.def) / SPREAD));
  const ag = poisson(rng, BASE_GOALS * Math.exp((A.att - H.def) / SPREAD));
  const ev = [];
  for (const [side, n] of [[H, hg], [A, ag]])
    for (let i = 0; i < n; i++) ev.push({ min: rng.int(1, 90), club: side.club.id, name: scorer(rng, side) });
  ev.sort((x, y) => x.min - y.min);
  return { h: H.club.id, a: A.club.id, hg, ag, ev };
}
