import { ALL_ATTRS } from '../player.js';

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
