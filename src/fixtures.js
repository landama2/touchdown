// Circle method. First half: every pair once; second half: same pairs with home/away reversed.
export function makeFixtures(ids) {
  const n = ids.length, a = [...ids], half = [];
  for (let r = 0; r < n - 1; r++) {
    half.push(Array.from({ length: n / 2 }, (_, i) => r % 2 ? [a[n - 1 - i], a[i]] : [a[i], a[n - 1 - i]]));
    a.splice(1, 0, a.pop());
  }
  return half.concat(half.map(rd => rd.map(([h, w]) => [w, h])));
}
