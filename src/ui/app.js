import { POS, ATTRS, overall, value } from '../player.js';
import { createWorld } from '../world.js';
import { FORMATIONS, slots, bestXI, fixLineup, strength } from '../lineup.js';
import { takeClub, myClub, playRound, table, endSeason } from '../season.js';
import { buy, sell, MAX_SQUAD } from '../transfers.js';
import { KEY, serialize, deserialize } from '../save.js';

// The UI is the only place allowed to touch Date, localStorage and the DOM.
const newWorld = () => createWorld(Date.now() >>> 0);
const load = () => { try { return deserialize(localStorage.getItem(KEY)); } catch { return null; } };
const save = () => { try { localStorage.setItem(KEY, serialize(s)); } catch {} };

let s = load() || newWorld();
let tab = 'Squad', sel = null, viewing = null, tableDiv = 0, msg = '';

const $ = id => document.getElementById(id);
const money = n => '€' + (n / 1e6).toFixed(2) + 'M';
const byPos = list => [...list].sort((a, b) => POS.indexOf(a.pos) - POS.indexOf(b.pos) || overall(b) - overall(a));
const label = k => k.replace(/[A-Z]/g, c => ' ' + c.toLowerCase());
const HEAD = '<th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Ovr</th><th class="n">Value</th>';
const cells = p => `<td>${p.pos}</td><td class="n">${p.age}</td><td class="n">${overall(p)}</td><td class="n">${money(value(p))}</td>`;
const nameBtn = (p, act) => `<td><button class="link" data-act="${act}" data-id="${p.id}">${p.name}</button></td>`;

function profile() {
  const p = [...myClub(s).players, ...s.market].find(x => x.id === viewing);
  if (!p) return '';
  const group = ([title, keys]) => `<h3>${title}</h3>` + keys.map(k => `<div><span>${label(k)}</span><b class="${p.attrs[k] >= 15 ? 'hi' : ''}">${p.attrs[k]}</b></div>`).join('');
  return `<div class="attrs"><h3>${p.name} · ${p.pos} · age ${p.age} · overall ${overall(p)} · ${money(value(p))}
    <button data-act="close" style="float:right">Close</button></h3>${Object.entries(ATTRS).map(group).join('')}</div>`;
}

const views = {
  Squad() {
    fixLineup(s);
    const club = myClub(s), pos = slots(s.formation), st = strength(club, s.lineup, s.formation);
    const row = (p, slot) => `<tr class="${sel === p.id ? 'sel' : ''}"><td class="${slot && slot !== p.pos ? 'oop' : 'dim'}">${slot || 'Sub'}</td>${nameBtn(p, 'pick')}${cells(p)}<td><button data-act="view" data-id="${p.id}">Profile</button></td></tr>`;
    const bench = byPos(club.players.filter(p => !s.lineup.includes(p.id)));
    return `<div class="bar"><label>Formation <select data-act="formation">${Object.keys(FORMATIONS).map(f => `<option${f === s.formation ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
      <button data-act="auto">Auto-pick best XI</button><span class="dim">Attack ${st.att.toFixed(1)} · Defence ${st.def.toFixed(1)}</span></div>
      <p class="dim">Click two names to swap them. Orange slot = playing out of position.</p>
      <div class="wrap"><table><tr><th>Slot</th>${HEAD}<th></th></tr>${s.lineup.map((id, i) => row(club.players.find(p => p.id === id), pos[i])).join('')}
      <tr><th colspan="7">Bench</th></tr>${bench.map(p => row(p)).join('')}</table></div>`;
  },
  Match() {
    const name = id => s.clubs[id].name, d = myClub(s).div, total = s.divisions[d].fixtures.length;
    let h = '';
    if (s.done) h += `<h2>Season ${s.season} complete — you finished ${table(s, d).indexOf(s.me) + 1} in the ${s.divisions[d].name}.</h2><button class="primary" data-act="end">Start next season</button>`;
    else {
      const [a, b] = s.divisions[d].fixtures[s.round].find(f => f.includes(s.me));
      h += `<h2>Round ${s.round + 1} of ${total}</h2><p>${name(a)} v ${name(b)} <span class="dim">(${a === s.me ? 'home' : 'away'})</span></p><button class="primary" data-act="play">Play round</button>`;
    }
    if (s.last) {
      const mine = s.last[d].find(r => r.h === s.me || r.a === s.me);
      h += `<h2>Last round</h2><div class="score">${name(mine.h)} ${mine.hg} – ${mine.ag} ${name(mine.a)}</div>
        ${mine.ev.map(e => `<div>${e.min}' ⚽ ${e.name} <span class="dim">(${name(e.club)})</span></div>`).join('') || '<div class="dim">No goals.</div>'}
        <h2>Other results</h2>${s.last[d].filter(r => r !== mine).map(r => `<div>${name(r.h)} ${r.hg} – ${r.ag} ${name(r.a)}</div>`).join('')}`;
    }
    return h;
  },
  Table() {
    const cols = ['P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'];
    const row = (id, k) => { const t = s.clubs[id].st; return `<tr class="${id === s.me ? 'me' : ''}"><td class="n">${k + 1}</td><td>${s.clubs[id].name}</td>${[t.p, t.w, t.d, t.l, t.gf, t.ga, t.gf - t.ga, t.pts].map(v => `<td class="n">${v}</td>`).join('')}</tr>`; };
    return `<div class="bar">${s.divisions.map((d, i) => `<button data-act="div" data-id="${i}" class="${i === tableDiv ? 'on' : ''}">${d.name}</button>`).join('')}</div>
      <h2>Season ${s.season}</h2><div class="wrap"><table><tr><th class="n">#</th><th>Club</th>${cols.map(c => `<th class="n">${c}</th>`).join('')}</tr>${table(s, tableDiv).map(row).join('')}</table></div>
      ${s.history.length ? '<h2>History</h2>' + s.history.map(h => `<div>Season ${h.season}: ${h.champions[0]} won the ${s.divisions[0].name} — you finished ${h.pos} (prize ${money(h.prize)})</div>`).join('') : ''}`;
  },
  Transfers() {
    const list = (players, act, text) => `<div class="wrap"><table><tr>${HEAD}<th></th></tr>${byPos(players).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td><button data-act="${act}" data-id="${p.id}">${text}</button></td></tr>`).join('')}</table></div>`;
    return `<h2>Free agents</h2>${list(s.market, 'buy', 'Buy')}
      <h2>Your squad (${myClub(s).players.length}/${MAX_SQUAD}) <span class="dim">— sells for 80% of value</span></h2>${list(myClub(s).players, 'sell', 'Sell')}`;
  },
};

const actions = {
  start(id) { takeClub(s, id); tab = 'Squad'; tableDiv = s.clubs[id].div; },
  reset() { if (confirm('Abandon this career and start a new game?')) { s = newWorld(); sel = viewing = null; } },
  tab(_, el) { tab = el.dataset.tab; sel = viewing = null; },
  div(id) { tableDiv = id; },
  view(id) { viewing = id; },
  close() { viewing = null; },
  auto() { s.lineup = bestXI(myClub(s), s.formation); sel = null; },
  formation(_, el) { s.formation = el.value; s.lineup = bestXI(myClub(s), s.formation); sel = null; },
  pick(id) {
    if (sel === null || sel === id) { sel = sel === id ? null : id; return; }
    const i = s.lineup.indexOf(sel), j = s.lineup.indexOf(id);
    if (i >= 0 && j >= 0) [s.lineup[i], s.lineup[j]] = [id, sel];
    else if (i >= 0) s.lineup[i] = id;
    else if (j >= 0) s.lineup[j] = sel;
    sel = null;
  },
  play() { playRound(s); },
  end() { endSeason(s); tab = 'Table'; tableDiv = myClub(s).div; },
  buy(id) { msg = buy(s, id) || 'Signed.'; },
  sell(id) { msg = sell(s, id) || 'Sold.'; if (viewing === id) viewing = null; },
};

function render() {
  if (s.me === null) {
    $('info').textContent = 'Pick a club to manage';
    $('nav').innerHTML = '<button data-act="reset">Re-roll world</button>';
    $('main').innerHTML = s.divisions.map(d => `<h2>${d.name}</h2><div class="grid">${d.clubIds.map(id => `<button data-act="start" data-id="${id}">${s.clubs[id].name}</button>`).join('')}</div>`).join('');
    return;
  }
  $('info').textContent = `${myClub(s).name} · ${s.divisions[myClub(s).div].name} · Season ${s.season} · Budget ${money(s.budget)}`;
  $('nav').innerHTML = Object.keys(views).map(t => `<button data-act="tab" data-tab="${t}" class="${t === tab ? 'on' : ''}">${t}</button>`).join('') + '<button data-act="reset">New game</button>';
  $('main').innerHTML = `<div class="msg" role="status">${msg}</div>` + profile() + views[tab]();
  msg = '';
}

function dispatch(e) {
  const el = e.target.closest('[data-act]');
  if (!el || (e.type === 'click') === (el.tagName === 'SELECT')) return; // selects act on change, everything else on click
  actions[el.dataset.act](+el.dataset.id, el);
  save();
  render();
}
document.addEventListener('click', dispatch);
document.addEventListener('change', dispatch);
render();
