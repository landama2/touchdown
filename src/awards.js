import { displayName } from './player.js';
// Players' season statistics, the season awards and the records. League matches only.
// p.stats = { apps, goals, assists, rating } (rating = sum of match ratings) exists once a player has
// played a league match this season; endSeason removes it.
const blank = () => ({ apps: 0, goals: 0, assists: 0, rating: 0 });
export const blankRecords = () => ({ points: null, goals: null, assists: null, win: null });

// The top n of division d by key ('goals' or 'assists'), live during the season: [{ id, name, club, apps, v }].
// Players with none are left out. Ties: fewer games first, then the lower id. The season's winner of each
// ranking is its award, and the top 3 are paid prize money (payPrizes in src/finance.js).
export function ranking(s, d, key, n = 20) {
  const all = s.divisions[d].clubIds.flatMap(club => s.clubs[club].players.filter(p => p.stats?.[key]).map(p => ({ id: p.id, name: displayName(p), club, apps: p.stats.apps, v: p.stats[key] })));
  return all.sort((a, b) => b.v - a.v || a.apps - b.apps || a.id - b.id).slice(0, n);
}
const top = r => r[0] ? { id: r[0].id, name: r[0].name, club: r[0].club, v: r[0].v } : null;

// After a league match r in division d: the players' stats, and the biggest-win records of the
// division and of the winning club (a bigger winning margin replaces the old record).
export function addMatch(s, d, r) {
  const find = id => s.clubs[r.h].players.find(p => p.id === id) || s.clubs[r.a].players.find(p => p.id === id);
  for (const x of r.ratings) { const p = find(x.id); if (p) { p.stats ??= blank(); p.stats.apps++; p.stats.rating += x.rt; } }
  for (const e of r.ev) if (e.type === 'goal') {
    const p = find(e.id), a = e.assist === undefined ? null : find(e.assist);
    if (p?.stats) p.stats.goals++;
    if (a?.stats) a.stats.assists++;
  }
  const margin = Math.abs(r.hg - r.ag), win = { h: r.h, a: r.a, hg: r.hg, ag: r.ag, season: s.season };
  if (!margin) return;
  const better = old => !old || margin > Math.abs(old.hg - old.ag);
  if (better(s.records[d].win)) s.records[d].win = win;
  const club = s.clubs[r.hg > r.ag ? r.h : r.a];
  if (better(club.rec.win)) club.rec.win = win;
}

// Awards of division d: player of the season and young player (age 21 or under) by average rating,
// among players with at least half (young: a quarter) of the league games; top scorer and top assists:
// the leaders of ranking(). Each is { id, name, club, v } or null.
export function seasonAwards(s, d) {
  const games = 2 * (s.divisions[d].clubIds.length - 1);
  const all = s.divisions[d].clubIds.flatMap(club => s.clubs[club].players.filter(p => p.stats).map(p => ({ p, club })));
  const avg = x => x.p.stats.rating / x.p.stats.apps;
  const best = (list, f) => list.reduce((b, x) => b === null || f(x) > f(b) ? x : b, null);
  const pack = (x, f) => x && { id: x.p.id, name: displayName(x.p), club: x.club, v: Math.round(f(x) * 100) / 100 };
  return {
    player: pack(best(all.filter(x => x.p.stats.apps >= games / 2), avg), avg),
    scorer: top(ranking(s, d, 'goals', 1)),
    assists: top(ranking(s, d, 'assists', 1)),
    young: pack(best(all.filter(x => x.p.age <= 21 && x.p.stats.apps >= games / 4), avg), avg),
  };
}

// At the end of a season (tables = final tables, awards = seasonAwards of each division):
// most points, most goals and most assists by a player in a season, per division; each club's best scorer and
// best assister in a season.
export function noteSeason(s, tables, awards) {
  tables.forEach((t, d) => {
    const champ = s.clubs[t[0]], rec = s.records[d];
    if (!rec.points || champ.st.pts > rec.points.v) rec.points = { v: champ.st.pts, club: champ.id, season: s.season };
    for (const [key, a] of [['goals', awards[d].scorer], ['assists', awards[d].assists]])
      if (a && (!rec[key] || a.v > rec[key].v)) rec[key] = { ...a, season: s.season };
  });
  for (const c of s.clubs) for (const key of ['goals', 'assists']) {
    const top = c.players.filter(p => p.stats?.[key]).reduce((b, p) => b === null || p.stats[key] > b.stats[key] ? p : b, null);
    if (top && (!c.rec[key] || top.stats[key] > c.rec[key].v)) c.rec[key] = { v: top.stats[key], id: top.id, name: top.name, season: s.season };
  }
}
