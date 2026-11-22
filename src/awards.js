import { displayName } from './player.js';
// Players' season statistics, the season awards and the records. League matches only.
// p.stats = { apps, goals, assists, rating } (rating = sum of match ratings) exists once a player has
// played a league match this season; endSeason removes it. Keepers also get cs (clean sheets), sv (saves)
// and ga (goals conceded), added when first needed, so older saves just start counting.
const blank = () => ({ apps: 0, goals: 0, assists: 0, rating: 0 });
export const blankRecords = () => ({ points: null, goals: null, assists: null, win: null });

// What each ranking counts. save = the share of the shots on target a keeper stopped, in percent.
export const VALUE = {
  goals: st => st.goals, assists: st => st.assists, points: st => st.goals + st.assists, cs: st => st.cs ?? 0,
  save: st => (st.sv ?? 0) + (st.ga ?? 0) ? Math.round(1000 * st.sv / (st.sv + st.ga)) / 10 : 0,
};
// The top n of division d by key (a key of VALUE), live during the season: [{ id, name, club, apps, v }].
// Players with none are left out; the save % only counts keepers with at least half the games the busiest
// club has played. Ties: fewer games first, then the lower id. The season's winner of each ranking is its
// award; the top 3 of goals and assists are paid prize money (payPrizes in src/finance.js).
export function ranking(s, d, key, n = 20) {
  const ids = s.divisions[d].clubIds, minApps = key === 'save' ? Math.max(1, Math.max(...ids.map(c => s.clubs[c].st.p)) / 2) : 0;
  const all = ids.flatMap(club => s.clubs[club].players.filter(p => p.stats && p.stats.apps >= minApps && VALUE[key](p.stats) > 0).map(p => ({ id: p.id, name: displayName(p), club, apps: p.stats.apps, v: VALUE[key](p.stats), ...(key === 'save' && { sv: p.stats.sv ?? 0, ga: p.stats.ga ?? 0 }) })));
  return all.sort((a, b) => b.v - a.v || a.apps - b.apps || a.id - b.id).slice(0, n);
}
const top = r => r[0] ? { id: r[0].id, name: r[0].name, club: r[0].club, v: r[0].v } : null;

// After a league match r in division d: the players' stats, and the biggest-win records of the
// division and of the winning club (a bigger winning margin replaces the old record).
export function addMatch(s, d, r) {
  const find = id => s.clubs[r.h].players.find(p => p.id === id) || s.clubs[r.a].players.find(p => p.id === id);
  for (const x of r.ratings) {
    const p = find(x.id); if (!p) continue;
    p.stats ??= blank(); p.stats.apps++; p.stats.rating += x.rt;
    // ponytail: a keeper who played any part of a match without a goal against gets the clean sheet
    if (p.pos === 'GK' && !(s.clubs[r.h].players.includes(p) ? r.ag : r.hg)) p.stats.cs = (p.stats.cs ?? 0) + 1;
  }
  for (const e of r.ev) {
    if (e.gk !== undefined && (e.type === 'goal' || e.type === 'save')) { // the keeper who faced the shot (older saves' events lack it)
      const g = find(e.gk), k = e.type === 'goal' ? 'ga' : 'sv';
      if (g?.stats) g.stats[k] = (g.stats[k] ?? 0) + 1;
    }
    if (e.type !== 'goal') continue;
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
// among players with at least half (young: a quarter) of the league games; top scorer, top assists, goals + assists,
// Golden Glove (clean sheets) and best save %: the leaders of ranking(). Each is { id, name, club, v } or null.
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
    points: top(ranking(s, d, 'points', 1)),
    glove: top(ranking(s, d, 'cs', 1)),
    saves: top(ranking(s, d, 'save', 1)),
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
