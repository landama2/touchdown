// UI smoke test: render the player and club profiles for a seeded career.
// app.js runs in the browser, so the few globals it touches at load are stubbed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { startCareer } from '../src/career.js';
import { serialize } from '../src/save.js';
import { overall } from '../src/player.js';
import { wageBill } from '../src/finance.js';

const world = createWorld(7);
startCareer(world, 0);
globalThis.localStorage = { getItem: () => serialize(world), setItem() {} };
globalThis.document = { getElementById: () => ({ innerHTML: '', textContent: '', querySelector: () => null }), addEventListener() {} };
const { playerView, clubView } = await import('../src/ui/app.js');

const lastDiv = world.divisions.length - 1;
const far = world.clubs[world.divisions[lastDiv].clubIds[0]]; // an unscouted club outside the Premier League

test('own player profile shows his name, overall and wage', () => {
  const p = world.clubs[0].players[0], html = playerView(p.id);
  assert.match(html, new RegExp(p.name));
  assert.match(html, new RegExp(`overall <b>${overall(p)}</b>`));
  assert.match(html, /\/wk/);
});

test('an unscouted player shows an overall range, not the true value', () => {
  const p = far.players[0];
  assert.match(playerView(p.id), /overall <b>\d+–\d+<\/b>/);
});

test('club profile shows name, division, wage bill and squad', () => {
  const c = world.clubs[0], html = clubView(c.id);
  assert.match(html, new RegExp(c.name));
  assert.match(html, new RegExp(world.divisions[c.div].name));
  assert.ok(html.includes(String(Math.round(wageBill(c) / 1e3))), 'wage bill');
  assert.ok(c.players.every(p => html.includes(p.name.replace(/'/g, '&#39;'))), 'every player listed');
});

test('another club\'s squad is shown as estimates', () => {
  const html = clubView(far.id);
  assert.match(html, new RegExp(far.name));
  assert.match(html, /\d+–\d+/);
});
