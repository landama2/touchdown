import { ALL_ATTRS, overall } from '../player.js';

// Touchline attribute <- columns of data/player_stats.csv (0-99). Several columns are averaged.
export const STAT_MAP = {
  passing: ['short_pass', 'long_pass'],
  dribbling: ['dribbling'],
  finishing: ['finishing', 'volleys'],
  tackling: ['stand_tackle', 'slide_tackle', 'marking'],
  heading: ['heading', 'jumping'],
  firstTouch: ['ball_control'],
  crossing: ['crossing'],
  vision: ['vision'],
  positioning: { GK: ['gk_positioning'], DF: ['interceptions', 'marking'], MF: ['interceptions', 'att_position'], FW: ['att_position'] },
  composure: ['composure'],
  workRate: ['stamina', 'aggression'],
  decisions: ['reactions'],
  aggression: ['aggression'],
  pace: ['acceleration', 'sprint_speed'],
  stamina: ['stamina'],
  strength: ['strength'],
  agility: ['agility', 'balance'],
  handling: ['gk_handling'],
  reflexes: ['gk_reflexes', 'gk_diving'],
};

const to20 = v => Math.max(1, Math.min(20, Math.round(v / 5)));
const num = v => (v === undefined || v === null || String(v).trim() === '' ? NaN : Number(v));

export function attrsFromStats(row, pos) {
  return ALL_ATTRS.map(k => {
    const cols = Array.isArray(STAT_MAP[k]) ? STAT_MAP[k] : STAT_MAP[k][pos];
    const vals = cols.map(c => num(row[c])).filter(Number.isFinite);
    return vals.length ? to20(vals.reduce((a, b) => a + b) / vals.length) : 1;
  });
}

export const isKeeper = row => (num(row.gk_diving) + num(row.gk_handling) + num(row.gk_reflexes)) / 3 >= 45;

const FOLD = { ø: 'o', æ: 'ae', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', ı: 'i' };
export const normName = name => name.toLowerCase()
  .replace(/[øæßłđðı]/g, c => FOLD[c])
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

export const VINTAGE_GAP = 3; // the dataset is from summer 2023: its ages are 3 years behind ours
const MIN_FOR_CALIBRATION = 10;

// rows: CSV rows as { column: string }. leagues: League[] (src/data/validate.js format).
// A dataset row matches a squad player when the normalised names are equal and the age gap
// is within VINTAGE_GAP ± 1. Same-club rows win; otherwise exactly one age-fitting row is required.
// Each dataset row feeds at most one player: a same-club claim beats a different-club claim,
// then the smaller age error wins; an exact tie gives nobody the row.
export function matchStats(rows, leagues, gap = VINTAGE_GAP) {
  const byName = new Map();
  rows.forEach((r, i) => { const k = normName(r.player); byName.set(k, [...(byName.get(k) || []), i]); });
  const report = { ageRejected: [], ambiguous: [], keeperMismatch: [], duplicateRow: [], differentClub: [] };
  const claims = new Map(); // row index -> [{ key, club, name, pos, same, err }]
  for (const league of leagues) for (const club of league.clubs) {
    const clubKey = normName(club.name);
    for (const [name, pos, age] of club.players) {
      const key = `${club.name} / ${name}`;
      const hits = byName.get(normName(name)) || [];
      if (!hits.length) continue;
      const err = i => Math.abs(age - Number(rows[i].age) - gap);
      const fits = hits.filter(i => err(i) <= 1);
      const sameClub = fits.find(i => normName(rows[i].club) === clubKey);
      const pick = sameClub ?? (fits.length === 1 ? fits[0] : undefined);
      if (pick === undefined) {
        (fits.length ? report.ambiguous : report.ageRejected).push(`${key} (ours ${age}, dataset ${hits.map(i => `${rows[i].age} at ${rows[i].club}`).join(', ')})`);
        continue;
      }
      if ((pos === 'GK') !== isKeeper(rows[pick])) { report.keeperMismatch.push(`${key} (${pos}, dataset club ${rows[pick].club})`); continue; }
      claims.set(pick, [...(claims.get(pick) || []), { key, club: club.name, name, pos, same: sameClub !== undefined, err: err(pick) }]);
    }
  }
  const winners = new Map(); // key -> { row, pos }
  for (const [i, cs] of claims) {
    cs.sort((a, b) => (b.same - a.same) || (a.err - b.err));
    const tie = cs.length > 1 && cs[0].same === cs[1].same && cs[0].err === cs[1].err;
    if (cs.length > 1) report.duplicateRow.push(`${rows[i].player} (${rows[i].club}): ${cs.map(c => c.key).join(' vs ')} -> ${tie ? 'nobody' : cs[0].key}`);
    if (!tie) winners.set(cs[0].key, { row: rows[i], pos: cs[0].pos, same: cs[0].same });
  }
  const stats = {}; // built in league order so the generated file is stable
  for (const league of leagues) for (const club of league.clubs) for (const [name] of club.players) {
    const w = winners.get(`${club.name} / ${name}`);
    if (!w) continue;
    (stats[club.name] ||= {})[name] = attrsFromStats(w.row, w.pos);
    if (!w.same) report.differentClub.push(`${club.name} / ${name} (dataset club ${w.row.club})`);
  }
  return { stats, report };
}

// Per league: the whole-number shift that puts Touchline's data ratings on the dataset's scale,
// measured on the matched players (implied rating = (overall - 6) / 5). 0 with too few matches.
export function calibrate(stats, leagues) {
  const out = {};
  for (const league of leagues) {
    const diffs = [];
    for (const club of league.clubs) for (const [name, pos, , rating] of club.players) {
      const a = stats[club.name]?.[name];
      if (!a) continue;
      const attrs = Object.fromEntries(ALL_ATTRS.map((k, i) => [k, a[i]]));
      diffs.push((overall({ pos, attrs }) - 6) / 5 - rating);
    }
    out[league.name] = diffs.length >= MIN_FOR_CALIBRATION ? Math.round(diffs.reduce((x, y) => x + y) / diffs.length) : 0;
  }
  return out;
}
