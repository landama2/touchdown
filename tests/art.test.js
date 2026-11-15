import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crestSvg, kitSvg } from '../src/ui/art.js';
import { PATTERNS } from '../src/data/validate.js';
import { MINI } from './fixtures/mini.js';

const clubs = MINI.flatMap(l => l.clubs);
const clean = svg => assert.ok(!/undefined|NaN/.test(svg), svg);

test('crestSvg draws a badge in the club colours with its code', () => {
  for (const c of clubs) {
    const svg = crestSvg(c, 40);
    assert.ok(svg.startsWith('<svg class="crest"') && svg.endsWith('</svg>'));
    assert.ok(svg.includes(`fill="${c.colours[0]}"`));
    assert.ok(svg.includes(`>${c.short}</text>`));
    assert.ok(svg.includes('width="40"'));
    clean(svg);
  }
});

test('crest shapes vary between clubs', () => {
  const shapes = new Set(clubs.map(c => crestSvg(c).match(/<clipPath id="[^"]+"><path d="([^"]+)"/)[1]));
  assert.ok(shapes.size >= 2, `only ${shapes.size} shape(s)`);
});

test('badge text is readable on light and dark colours', () => {
  assert.ok(crestSvg({ short: 'LGT', colours: ['#ffffff', '#c8102e'] }).includes('fill="#111111">LGT'));
  assert.ok(crestSvg({ short: 'DRK', colours: ['#111111', '#ffffff'] }).includes('fill="#ffffff">DRK'));
});

test('kitSvg draws every pattern with the kit colours', () => {
  const base = { shirt: '#c8102e', trim: '#ffffff', shorts: '#003399', socks: '#ffcc00' };
  const outputs = PATTERNS.map(pattern => kitSvg({ ...base, pattern }, 60));
  outputs.forEach(svg => {
    assert.ok(svg.startsWith('<svg class="kit"') && svg.endsWith('</svg>'));
    for (const colour of Object.values(base)) assert.ok(svg.includes(colour), colour);
    assert.ok(svg.includes('width="60"'));
    clean(svg);
  });
  assert.equal(new Set(outputs).size, PATTERNS.length);
});
