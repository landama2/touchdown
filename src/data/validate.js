import { POS, ALL_ATTRS } from '../player.js';

export const PATTERNS = ['plain', 'stripes', 'hoops', 'halves', 'sash', 'sleeves'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const MIN_PLAYERS = 18, MAX_PLAYERS = 32, MIN_GK = 2, MAX_STRENGTHS = 3;

function validateClub(c, at, errors) {
  if (typeof c.name !== 'string' || !c.name.trim()) errors.push(`${at}: name missing`);
  if (!/^[A-Z]{3}$/.test(c.short)) errors.push(`${at}: short must be 3 capital letters`);
  if (!Array.isArray(c.colours) || c.colours.length !== 2 || !c.colours.every(h => HEX.test(h))) errors.push(`${at}: colours must be two #rrggbb values`);
  const kit = c.kit || {};
  if (!PATTERNS.includes(kit.pattern)) errors.push(`${at}: kit.pattern must be one of ${PATTERNS.join(', ')}`);
  for (const part of ['shirt', 'trim', 'shorts', 'socks']) if (!HEX.test(kit[part])) errors.push(`${at}: kit.${part} must be #rrggbb`);
  const players = Array.isArray(c.players) ? c.players : [];
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) errors.push(`${at}: needs ${MIN_PLAYERS}-${MAX_PLAYERS} players, has ${players.length}`);
  if (players.filter(p => p[1] === 'GK').length < MIN_GK) errors.push(`${at}: needs at least ${MIN_GK} goalkeepers`);
  const seen = new Set();
  for (const row of players) {
    const [name, pos, age, rating, strengths = []] = Array.isArray(row) ? row : [];
    const who = `${at} / ${name}`;
    if (typeof name !== 'string' || !name.trim()) { errors.push(`${at}: player with no name`); continue; }
    if (seen.has(name)) errors.push(`${who}: listed twice`);
    seen.add(name);
    if (!POS.includes(pos)) errors.push(`${who}: position must be one of ${POS.join(', ')}`);
    if (!Number.isInteger(age) || age < 15 || age > 45) errors.push(`${who}: age must be an integer 15-45`);
    if (!Number.isInteger(rating) || rating < 1 || rating > 20) errors.push(`${who}: rating must be an integer 1-20`);
    if (!Array.isArray(strengths) || strengths.length > MAX_STRENGTHS || !strengths.every(k => ALL_ATTRS.includes(k)))
      errors.push(`${who}: strengths must be up to ${MAX_STRENGTHS} of ${ALL_ATTRS.join(', ')}`);
  }
}

export function validateLeagues(leagues) {
  const errors = [], count = { name: {}, short: {} }, where2 = {};
  for (const league of leagues) {
    const where = league?.name || '(unnamed league)';
    if (!league?.name) errors.push('a league has no name');
    if (!Array.isArray(league?.clubs)) { errors.push(`${where}: clubs must be an array`); continue; }
    if (league.clubs.length % 2) errors.push(`${where}: needs an even number of clubs, has ${league.clubs.length}`);
    for (const c of league.clubs) {
      validateClub(c, `${where} / ${c?.name || '(unnamed club)'}`, errors);
      for (const row of Array.isArray(c?.players) ? c.players : []) if (Array.isArray(row)) (where2[`${row[0]}|${row[2]}`] ||= []).push(c.name);
      for (const key of ['name', 'short']) count[key][c[key]] = (count[key][c[key]] || 0) + 1;
    }
  }
  for (const [n, k] of Object.entries(count.name)) if (k > 1) errors.push(`club name used twice: ${n}`);
  for (const [n, k] of Object.entries(count.short)) if (k > 1) errors.push(`short code used twice: ${n}`);
  for (const [key, clubs] of Object.entries(where2)) if (clubs.length > 1) { const [n, a] = key.split('|'); errors.push(`player listed at two clubs: ${n} (${a}) — ${clubs.join(', ')}`); }
  return errors;
}
