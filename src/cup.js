// Knockout football: the cup for every club in the game, and the play-offs below the top division.
// A tie is { h, a, legs: [[goals of h, goals of a], ...], pens: [h, a] | null, w: winner id | null };
// h is the home side of a one-legged tie and the higher seed of a two-legged one.
export const CUP_NAME = 'FA Cup';

const pow2 = n => 2 ** Math.floor(Math.log2(n));
// Rounds for n clubs: a preliminary round first when n is not a power of two.
export const cupRounds = n => Math.log2(pow2(n)) + (n > pow2(n) ? 1 : 0);

export function cupRoundName(k, n) {
  const r = cupRounds(n), prelim = n > pow2(n);
  return ['Final', 'Semi-finals', 'Quarter-finals'][r - 1 - k] ?? (prelim && k === 0 ? 'Preliminary round' : `Round ${k + (prelim ? 0 : 1)}`);
}

export const tie = (h, a) => ({ h, a, legs: [], pens: null, w: null });

// Random pairings; the first club drawn of each pair is at home.
export function draw(rng, ids) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return Array.from({ length: a.length / 2 }, (_, k) => tie(a[2 * k], a[2 * k + 1]));
}

// A new cup: `ranked` lists every club, strongest first. The weakest clubs beyond a power of two
// meet in the preliminary round; the rest wait in `byes` for round 1.
export function newCup(rng, ranked) {
  const extra = ranked.length - pow2(ranked.length), cut = ranked.length - 2 * extra;
  const first = extra ? ranked.slice(cut) : ranked;
  return { byes: extra ? ranked.slice(0, cut) : [], rounds: [{ ties: draw(rng, first) }] };
}

// Draws the cup's next round from the winners of the last one (plus the byes after the preliminary round).
export function nextCupRound(rng, cup) {
  const winners = cup.rounds.at(-1).ties.map(t => t.w);
  cup.rounds.push({ ties: draw(rng, [...winners, ...(cup.rounds.length === 1 ? cup.byes : [])]) });
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
