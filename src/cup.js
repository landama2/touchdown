// Knockout football: the cup for every club in the game, and the play-offs below the top division.
// A tie is { h, a, legs: [[goals of h, goals of a], ...], pens: [h, a] | null, w: winner id | null, aet? };
// h is the home side of a one-legged tie and the higher seed of a two-legged one.
export const CUP_NAME = 'FA Cup';

const pow2 = n => 2 ** Math.floor(Math.log2(n));

// The cup's shape for n clubs (n >= 4), like the real FA Cup: the weakest clubs start in round 1 and
// the strongest join later, so the big clubs never meet before they have entered. With M half the
// largest power of two in n, round 1 holds the weakest clubs, round 2 brings the field to M, then
// rounds of M clubs take M/2 new entrants each (the strongest in the last of them), and from there
// it halves to the final. enter[k] = clubs joining in round k, size[k] = clubs playing round k.
// 68 clubs: 40 (League One and the weakest of the Championship), 32 (+12), 32 (+16 strongest), 16, 8, 4, 2.
export function cupPlan(n) {
  const M = pow2(n) / 2;
  let K = 2;
  while (n - M - (K - 2) * M / 2 > M) K++;
  const first = 2 * (n - M - (K - 2) * M / 2);
  const enter = [first, M - first / 2, ...Array(K - 2).fill(M / 2), ...Array(Math.log2(M) - 1).fill(0)];
  const size = [];
  enter.forEach((e, k) => size.push((k ? size[k - 1] / 2 : 0) + e));
  return { enter, size };
}
export const cupRounds = n => cupPlan(n).enter.length;

export function cupRoundName(k, n) {
  return ['Final', 'Semi-finals', 'Quarter-finals'][cupRounds(n) - 1 - k] ?? `Round ${k + 1}`;
}

export const tie = (h, a) => ({ h, a, legs: [], pens: null, w: null });

// Random pairings, no seeding (like the real draw); the first club drawn of each pair is at home.
export function draw(rng, ids) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return Array.from({ length: a.length / 2 }, (_, k) => tie(a[2 * k], a[2 * k + 1]));
}

// A new cup: `ranked` lists every club, strongest first. entries[k] are the clubs that join in
// round k (see cupPlan); round 1 is drawn at once.
export function newCup(rng, ranked) {
  let end = ranked.length;
  const entries = cupPlan(ranked.length).enter.map(e => ranked.slice(end - e, (end -= e) + e));
  return { entries, rounds: [{ ties: draw(rng, entries[0]) }] };
}

// Draws the cup's next round from the winners of the last one plus the clubs entering now.
// (A cup from a save before staged entry has `byes`, who all join in round 2.)
export function nextCupRound(rng, cup) {
  const k = cup.rounds.length, winners = cup.rounds.at(-1).ties.map(t => t.w);
  const joining = cup.entries ? cup.entries[k] ?? [] : k === 1 ? cup.byes : [];
  cup.rounds.push({ ties: draw(rng, [...winners, ...joining]) });
}

// Records one leg, given in the tie's h/a order. Returns true when the tie needs a penalty shootout
// to be decided (the caller then calls decide with the shootout score).
export function addLeg(t, hg, ag, legs) {
  t.legs.push([hg, ag]);
  if (t.legs.length < legs) return false;
  const [x, y] = aggregate(t);
  if (x === y) return true;
  t.w = x > y ? t.h : t.a;
  return false;
}
export const aggregate = t => t.legs.reduce(([x, y], [p, q]) => [x + p, y + q], [0, 0]);
export function decide(t, pens) { t.pens = pens; t.w = pens[0] > pens[1] ? t.h : t.a; }

// Play-off semi-finals for a final table (club ids, top first): 3rd v 6th and 4th v 5th, two legs.
export const playoffSemis = table => ({ rounds: [{ ties: [tie(table[2], table[5]), tie(table[3], table[4])] }] });
export const playoffFinal = p => p.rounds.push({ ties: [tie(p.rounds[0].ties[0].w, p.rounds[0].ties[1].w)] });
