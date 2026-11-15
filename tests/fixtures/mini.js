// Small fake leagues for engine tests. Sizes 4, 6, 6 so the top division runs out of
// fixtures before the others, like the real 20-club Premier League next to 24-club EFL divisions.
const PALETTE = ['#c8102e', '#003399', '#ffcc00', '#006633', '#ffffff', '#111111'];
const PATTERN_CYCLE = ['plain', 'stripes', 'hoops', 'halves', 'sash', 'sleeves'];
const SHAPE = [['GK', 2], ['DF', 6], ['MF', 6], ['FW', 4]];

let n = 0;
function club(name, rating) {
  const i = n++, main = PALETTE[i % 6], second = PALETTE[(i + 3) % 6];
  const players = [];
  for (const [pos, count] of SHAPE)
    for (let k = 0; k < count; k++) players.push([`${name} ${pos}${k + 1}`, pos, 20 + ((k * 3) % 14), rating]);
  return {
    name, short: name.slice(0, 3).toUpperCase(), colours: [main, second],
    kit: { pattern: PATTERN_CYCLE[i % 6], shirt: main, trim: second, shorts: second, socks: main },
    players,
  };
}

export const MINI = [
  { name: 'Top League', clubs: [club('Alpha', 15), club('Bravo', 15), club('Charlie', 14), club('Delta', 14)] },
  { name: 'Middle League', clubs: [club('Echo', 12), club('Foxtrot', 12), club('Golf', 12), club('Hotel', 11), club('India', 11), club('Juliet', 11)] },
  { name: 'Low League', clubs: [club('Kilo', 9), club('Lima', 9), club('Mike', 8), club('November', 8), club('Oscar', 8), club('Papa', 8)] },
];
