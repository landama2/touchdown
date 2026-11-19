import test from 'node:test';
import assert from 'node:assert/strict';
import { pitchLayout, ballAt, awayKit, W, H } from '../src/ui/pitch.js';
import { slots } from '../src/lineup.js';

const side = (formation, base) => ({ on: slots(formation).map((pos, k) => ({ id: base + k, pos })) });
const dots = (fh, fa) => pitchLayout([side(fh, 0), side(fa, 100)]);

test('eleven dots a side, all inside the pitch', () => {
  const d = dots('4-4-2', '4-3-3');
  assert.equal(d.filter(x => x.side === 0).length, 11);
  assert.equal(d.filter(x => x.side === 1).length, 11);
  for (const x of d) assert.ok(x.x > 0 && x.x < W && x.y > 0 && x.y < H, JSON.stringify(x));
});

test('the home side keeps its own half, the away side the other', () => {
  for (const x of dots('4-4-2', '4-4-2')) assert.ok(x.side === 0 ? x.x < W / 2 : x.x > W / 2, JSON.stringify(x));
});

test('a 4-3-3 and a 5-3-2 are laid out differently', () => {
  const at = f => dots(f, f).filter(x => x.side === 0).map(x => `${x.x},${x.y}`).sort().join(' ');
  assert.notEqual(at('4-3-3'), at('5-3-2'));
});

test('a sent-off player is left out and his line closes up', () => {
  const home = side('4-4-2', 0);
  home.on = home.on.filter(o => o.id !== 2); // a defender sent off
  const d = pitchLayout([home, side('4-4-2', 100)]);
  assert.equal(d.filter(x => x.side === 0).length, 10);
  assert.ok(!d.some(x => x.side === 0 && x.id === 2));
  assert.equal(new Set(d.filter(x => x.side === 0 && x.pos === 'DF').map(x => x.x)).size, 1); // still one straight line
});

test('the ball goes to the player in the latest recent event, else the centre spot', () => {
  const d = dots('4-4-2', '4-4-2');
  const shooter = d.find(x => x.id === 109);
  assert.deepEqual(ballAt(d, [{ min: 30, id: 109, side: 1, type: 'miss' }], 31), { x: shooter.x, y: shooter.y, id: 109 });
  assert.deepEqual(ballAt(d, [{ min: 30, id: 109, side: 1, type: 'miss' }], 40), { x: W / 2, y: H / 2, id: null });
  assert.deepEqual(ballAt(d, [], 1), { x: W / 2, y: H / 2, id: null });
});

test("an away side whose colour looks like the home side's wears its second colour", () => {
  assert.deepEqual(awayKit(['#eb172b', '#ffffff'], ['#ef0107', '#ffffff']), ['#ffffff', '#ef0107']); // red v red
  assert.deepEqual(awayKit(['#eb172b', '#ffffff'], ['#034694', '#ffffff']), ['#034694', '#ffffff']); // red v blue
});
