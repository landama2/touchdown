// The 2D pitch for the live match: where to draw each player and the ball. Pure: no DOM, so tests can cover it.
// Pitch units: W along the length (home attacks to the right), H across.
import { POS } from '../player.js';

export const W = 105, H = 68;
const LINE = { GK: 5, DF: 20, MF: 35, FW: 47 }; // depth of each line in the home half; the away side mirrors it

// [{ id, side, pos, x, y }] for the players on the pitch: each line spread evenly across its width. Lines are taken
// from the players actually on (sides[i].on), so a red card closes the line up and a formation change re-lays it.
export const pitchLayout = sides => sides.flatMap((S, side) => POS.flatMap(pos => {
  const line = S.on.filter(o => o.pos === pos), depth = side ? W - LINE[pos] : LINE[pos];
  return line.map((o, k) => ({ id: o.id, side, pos, x: depth, y: Math.round(H * (k + 1) / (line.length + 1) * 10) / 10 }));
}));

// The away side's [fill, rim]: its first colour unless that looks like the home side's, then its second.
// ponytail: plain RGB distance; a perceptual one (CIE Lab) if odd pairs turn up.
const rgb = hex => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16));
const far = (a, b) => rgb(a).reduce((t, v, k) => t + Math.abs(v - rgb(b)[k]), 0);
export const awayKit = (home, away) => far(home[0], away[0]) >= far(home[0], away[1]) || far(home[0], away[0]) > 150 ? away : [away[1], away[0]];

// The ball: with the player in the latest event of the last few minutes, otherwise on the centre spot.
// ponytail: the engine does not record who has the ball each minute, so events stand in for possession.
const RECENT = 3;
export function ballAt(dots, ev, min) {
  for (let k = ev.length - 1; k >= 0 && min - ev[k].min < RECENT; k--) {
    const d = dots.find(x => x.id === (ev[k].type === 'sub' ? ev[k].in : ev[k].id));
    if (d) return { x: d.x, y: d.y, id: d.id };
  }
  return { x: W / 2, y: H / 2, id: null };
}
