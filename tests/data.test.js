import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { validateLeagues } from '../src/data/validate.js';

const DIR = new URL('../src/data/england/', import.meta.url);
const EXPECTED = { 'premier-league.js': ['Premier League', 20], 'championship.js': ['Championship', 24], 'league-one.js': ['League One', 24] };
const files = existsSync(DIR) ? readdirSync(DIR).filter(f => f.endsWith('.js')) : [];

for (const file of files) {
  test(`${file} is valid league data`, async () => {
    assert.ok(EXPECTED[file], `unexpected data file ${file}`);
    const league = (await import(new URL(file, DIR))).default;
    assert.deepEqual(validateLeagues([league]), []);
    assert.equal(league.name, EXPECTED[file][0]);
    assert.equal(league.clubs.length, EXPECTED[file][1]);
  });
}
