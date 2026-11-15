// Players' season statistics, the season awards and the records. League matches only.
// p.stats = { apps, goals, assists, rating } (rating = sum of match ratings) exists once a player has
// played a league match this season; endSeason removes it.
const blank = () => ({ apps: 0, goals: 0, assists: 0, rating: 0 });
export const blankRecords = () => ({ points: null, goals: null, win: null });

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
// among players with at least half (young: a quarter) of the league games; top scorer by goals,
// fewer games first on a tie. Each is { id, name, club, v } or null.
export function seasonAwards(s, d) {
  const games = 2 * (s.divisions[d].clubIds.length - 1);
  const all = s.divisions[d].clubIds.flatMap(club => s.clubs[club].players.filter(p => p.stats).map(p => ({ p, club })));
  const avg = x => x.p.stats.rating / x.p.stats.apps, goals = x => x.p.stats.goals;
  const best = (list, f) => list.reduce((b, x) => b === null || f(x) > f(b) ? x : b, null);
  const pack = (x, f) => x && { id: x.p.id, name: x.p.name, club: x.club, v: Math.round(f(x) * 100) / 100 };
  return {
    player: pack(best(all.filter(x => x.p.stats.apps >= games / 2), avg), avg),
    scorer: pack(best(all.filter(goals), x => goals(x) - x.p.stats.apps / 1000), goals),
    young: pack(best(all.filter(x => x.p.age <= 21 && x.p.stats.apps >= games / 4), avg), avg),
  };
}

// At the end of a season (tables = final tables, awards = seasonAwards of each division):
// most points and most goals by a player in a season, per division; each club's best scorer in a season.
export function noteSeason(s, tables, awards) {
  tables.forEach((t, d) => {
    const champ = s.clubs[t[0]], rec = s.records[d], top = awards[d].scorer;
    if (!rec.points || champ.st.pts > rec.points.v) rec.points = { v: champ.st.pts, club: champ.id, season: s.season };
    if (top && (!rec.goals || top.v > rec.goals.v)) rec.goals = { ...top, season: s.season };
  });
  for (const c of s.clubs) {
    const top = c.players.filter(p => p.stats?.goals).reduce((b, p) => b === null || p.stats.goals > b.stats.goals ? p : b, null);
    if (top && (!c.rec.goals || top.stats.goals > c.rec.goals.v)) c.rec.goals = { v: top.stats.goals, id: top.id, name: top.name, season: s.season };
  }
}
