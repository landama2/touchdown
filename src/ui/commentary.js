// Turns a match event (src/match.js) into a line of plain-text commentary. The caller escapes it.
// The template is picked from the minute and player id, so the same match always reads the same.
const T = {
  goal: ['GOAL! {name} scores{assist}.', 'GOAL! {name} finds the net{assist}.', 'GOAL! A cool finish from {name}{assist}.'],
  save: ['{name} forces a save.', '{name} tests the keeper.', 'Good stop from a {name} effort.'],
  miss: ['{name} shoots wide.', '{name} fires over the bar.', '{name} drags it off target.'],
  yellow: ['Yellow card for {name}.', '{name} goes into the book.'],
  red: ['RED CARD! {name} is sent off.', '{name} sees red!'],
  second: ['Second yellow for {name}, and that is an early bath.'],
  injury: ['{name} is down injured and cannot continue.', '{name} pulls up injured.'],
  sub: ['Substitution: {in} replaces {name}.'],
  extra: ['All square after 90 minutes: we go to extra time.'],
  goal_pen: ['GOAL! {name} sends the keeper the wrong way from the spot.', 'GOAL! {name} converts the penalty.'],
  save_pen: ['Penalty saved! {name} is denied from the spot.'],
  miss_pen: ['{name} misses the penalty!'],
  goal_corner: ['GOAL! {name} heads in from the corner{assist}.'],
  save_corner: ['{name} meets the corner, but the keeper holds on.'],
  miss_corner: ['{name} heads the corner wide.'],
  goal_fk: ['GOAL! {name} curls the free kick into the net.'],
  save_fk: ['{name} forces a save from a free kick.'],
  miss_fk: ['{name} puts the free kick over the bar.'],
};

export function line(e, team) {
  const list = T[e.type === 'red' && e.second ? 'second' : e.kind ? `${e.type}_${e.kind}` : e.type], text = list[(e.min + e.id) % list.length];
  return `${e.min}' ${e.type === 'extra' ? '' : `${team} — `}` + text.replace('{name}', () => e.name).replace('{in}', () => e.inName)
    .replace('{assist}', () => (e.assistName ? `, set up by ${e.assistName}` : ''));
}
