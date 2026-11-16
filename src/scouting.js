import { ALL_ATTRS, overall, valueAt } from './player.js';
import { loanable } from './market.js';
import { scoutsFor, scoutSpeed } from './staff.js';

// What the human club knows about other players. Premier League players are famous and fully known;
// so is everyone at your own club. Everyone else (EFL squads, free agents) shows each attribute as a
// range up to MAX_WIDTH points wide, and the overall as a range up to OVR_WIDTH wide; both always
// hold the true value. Scout reports raise knowledge
// (0-100) and narrow the ranges; knowledge fades by 100 every FADE_DAYS. Knowledge lives in
// s.known = { [playerId]: { k, at } } (k at clock time `at`). AI clubs always see the truth.
// Scouts: s.scouts = [{ task: null | { kind, id }, days }]; how many, and how fast they report, follow
// the club's scouting staff level (src/staff.js).
export const MAX_WIDTH = 3, OVR_WIDTH = 8, FADE_DAYS = 730, YEAR = 365;
export const TASKS = {                          // days to report (at scouting level 3), knowledge reached for everyone covered
  player: { days: 7, level: 100 },
  club: { days: 14, level: 80 },
  division: { days: 28, level: 50 },
  free: { days: 7, level: 80 },                 // the free-agent list
};

// Days since the first day of the career (a season counts YEAR days).
export const clock = s => (s.season - 1) * YEAR + Math.max(0, s.day);
// club: the player's club, or null for a free agent.
export const fogged = (s, p, club) => !club ? true : club.id !== s.me && club.div > 0;

export function knowledge(s, p, club) {
  if (!fogged(s, p, club)) return 100;
  const e = s.known[p.id];
  return e ? Math.max(0, Math.round(e.k - 100 * (clock(s) - e.at) / FADE_DAYS)) : 0;
}

// A stable pseudo-random offset 0..w for player id and attribute index i (no RNG: ranges don't flicker).
const offset = (id, i, w) => (((id * 2654435761) ^ (i * 40503)) >>> 0) % (w + 1);
// { attr: [lo, hi] }, both ends 1-20; lo <= true <= hi.
export function ranges(s, p, club) {
  const w = Math.round(MAX_WIDTH * (1 - knowledge(s, p, club) / 100));
  return Object.fromEntries(ALL_ATTRS.map((k, i) => {
    const lo = Math.max(1, p.attrs[k] - offset(p.id, i, w));
    return [k, [lo, Math.min(20, lo + w)]];
  }));
}
// What you can tell about p: knowledge, overall as [lo, hi] (its own range: errors in single
// attributes partly cancel out), and value as [lo, hi] at those overalls (exact when lo === hi).
export function estimate(s, p, club) {
  const k = knowledge(s, p, club), w = Math.round(OVR_WIDTH * (1 - k / 100)), o = overall(p);
  const lo = Math.max(0, o - offset(p.id, ALL_ATTRS.length, w)), hi = lo + w;
  return { k, ovr: [lo, hi], value: [valueAt(lo, p.age), valueAt(hi, p.age)] };
}

// Raises knowledge of the players with these ids to `level` now (fading knowledge first).
export function learn(s, ids, level) {
  const now = clock(s);
  for (const id of ids) {
    const e = s.known[id], k = e ? Math.max(0, e.k - 100 * (now - e.at) / FADE_DAYS) : 0;
    s.known[id] = { k: Math.max(level, Math.round(k)), at: now };
  }
}
// End of season: forget what has faded away.
export function prune(s) {
  const now = clock(s);
  for (const id in s.known) if (s.known[id].k - 100 * (now - s.known[id].at) / FADE_DAYS <= 0) delete s.known[id];
}

export const scoutCount = s => scoutsFor(s.clubs[s.me]);
export const taskDays = (s, kind) => Math.round(TASKS[kind].days * scoutSpeed(s.clubs[s.me]));
// Keeps the human club's scouts at its scouting level's number (a scout let go loses his task).
export function staffScouts(s) {
  const n = s.me === null ? 0 : scoutCount(s);
  s.scouts = s.scouts.slice(0, n);
  while (s.scouts.length < n) s.scouts.push({ task: null, days: 0 });
}

// Who a task covers now: player ids (only those you can't see fully).
function covered(s, task) {
  const outside = c => c.players.filter(p => fogged(s, p, c)).map(p => p.id);
  if (task.kind === 'player') return [task.id];
  if (task.kind === 'club') return outside(s.clubs[task.id]);
  if (task.kind === 'division') return s.divisions[task.id].clubIds.flatMap(id => outside(s.clubs[id]));
  return s.market.map(p => p.id);
}
const where = (s, id) => s.clubs.find(c => c.players.some(p => p.id === id)) ?? (s.market.some(p => p.id === id) ? null : undefined);

// Sends scout k on a task ({ kind: 'player', id } | { kind: 'club', id } | { kind: 'division', id } |
// { kind: 'free' }), replacing what he was doing. Error message or null.
export function assign(s, k, task) {
  const scout = s.scouts[k];
  if (!scout) return 'No such scout.';
  if (!TASKS[task.kind]) return 'Unknown task.';
  if (task.kind === 'player') {
    const c = where(s, task.id);
    if (c === undefined) return 'Player not found.';
    if (!fogged(s, { id: task.id }, c)) return 'You already know everything about him.';
  }
  if (task.kind === 'club' && (!s.clubs[task.id] || task.id === s.me)) return 'Pick another club.';
  if (task.kind === 'division' && !s.divisions[task.id]) return 'No such division.';
  scout.task = { ...task }; scout.days = taskDays(s, task.kind);
  return null;
}
export const recall = (s, k) => { if (s.scouts[k]) { s.scouts[k].task = null; s.scouts[k].days = 0; } };

// `days` days of scouting. A scout who finishes reports: everyone his task covers is learnt to the
// task's level, and the report goes into s.news. The scout is then free.
export function scoutDays(s, days) {
  if (days <= 0 || s.me === null) return;
  for (const sc of s.scouts) {
    if (!sc.task || (sc.days -= days) > 0) continue;
    const ids = covered(s, sc.task);
    learn(s, ids, TASKS[sc.task.kind].level);
    s.news.push({ type: 'scout', club: s.me, task: sc.task, n: ids.length });
    sc.task = null; sc.days = 0;
  }
}

// Adds player id to the shortlist (s.shortlist, player ids), or takes him off it.
export function toggleShortlist(s, id) {
  s.shortlist = s.shortlist.includes(id) ? s.shortlist.filter(x => x !== id) : [...s.shortlist, id];
}

// Every player outside your club, as [{ p, c (club, or null for a free agent), est }]: those
// matching the filters (all optional: pos; div — a division number or 'free'; club — a club id;
// maxAge; minOvr and maxValue, judged on what you can tell (the top of the overall range, the bottom
// of the value range); listed — on a transfer list; loan — available on loan; name — part of the
// name, any case), best estimated overall first, at most `limit`.
export function searchPlayers(s, f = {}, limit = 60) {
  const pool = [...s.clubs.filter(c => c.id !== s.me).flatMap(c => c.players.map(p => ({ p, c }))), ...s.market.map(p => ({ p, c: null }))];
  const name = (f.name ?? '').trim().toLowerCase(), out = [];
  for (const { p, c } of pool) {
    if (f.pos && p.pos !== f.pos) continue;
    if (f.div === 'free' ? c : f.div != null && f.div !== '' && (!c || c.div !== +f.div)) continue;
    if (f.club != null && f.club !== '' && c?.id !== +f.club) continue;
    if (f.maxAge && p.age > f.maxAge) continue;
    if (f.listed && p.listed !== 'sale') continue;
    if (f.loan && (!c || !loanable(s, c, p))) continue;
    if (name && !p.name.toLowerCase().includes(name)) continue;
    const est = estimate(s, p, c);
    if (f.minOvr && est.ovr[1] < f.minOvr) continue;
    if (f.maxValue && est.value[0] > f.maxValue) continue;
    out.push({ p, c, est });
  }
  const mid = x => x.est.ovr[0] + x.est.ovr[1];
  return out.sort((a, b) => mid(b) - mid(a) || a.p.id - b.p.id).slice(0, limit);
}
