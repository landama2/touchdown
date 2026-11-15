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
};

export function line(e, team) {
  const list = T[e.type === 'red' && e.second ? 'second' : e.type], text = list[(e.min + e.id) % list.length];
  return `${e.min}' ${team} — ` + text.replace('{name}', () => e.name).replace('{in}', () => e.inName)
    .replace('{assist}', () => (e.assistName ? `, set up by ${e.assistName}` : ''));
}
