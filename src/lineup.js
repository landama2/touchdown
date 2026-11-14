import { POS, overall } from './player.js';

export const FORMATIONS = { '4-4-2': [1, 4, 4, 2], '4-3-3': [1, 4, 3, 3], '3-5-2': [1, 3, 5, 2], '5-3-2': [1, 5, 3, 2], '4-5-1': [1, 4, 5, 1] };
const SLOT_WEIGHT = { GK: [0, 1.5], DF: [0, 1], MF: [0.5, 0.5], FW: [1, 0] }; // [attack, defence]

export const slots = f => FORMATIONS[f].flatMap((n, i) => Array(n).fill(POS[i]));
export const eff = (p, pos) => overall(p, pos) * (p.pos === pos ? 1 : 0.85);

// Greedy slot-by-slot pick. Good enough until Phase 3 introduces roles.
export function bestXI(club, formation) {
  const used = new Set();
  return slots(formation).map(pos => {
    let best = null;
    for (const p of club.players)
      if (!used.has(p.id) && (!best || eff(p, pos) > eff(best, pos))) best = p;
    used.add(best.id);
    return best.id;
  });
}

export function fixLineup(s) {
  const club = s.clubs[s.me], ids = new Set(club.players.map(p => p.id));
  if (s.lineup.length !== 11 || new Set(s.lineup).size !== 11 || s.lineup.some(id => !ids.has(id)))
    s.lineup = bestXI(club, s.formation);
}

export function strength(club, ids, formation) {
  const pos = slots(formation);
  let a = 0, aw = 0, d = 0, dw = 0;
  ids.forEach((id, i) => {
    const e = eff(club.players.find(p => p.id === id), pos[i]), [wa, wd] = SLOT_WEIGHT[pos[i]];
    a += e * wa; aw += wa; d += e * wd; dw += wd;
  });
  const [, nd, , nf] = FORMATIONS[formation];
  return { att: a / aw * (1 + 0.03 * (nf - 2)), def: d / dw * (1 + 0.03 * (nd - 4)) };
}
