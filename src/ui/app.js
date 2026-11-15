import { POS, ATTRS, overall, value } from '../player.js';
import { createWorld } from '../world.js';
import { FORMATIONS, BENCH, slots, bestXI, fixLineup, swap } from '../lineup.js';
import { takeClub, myClub, myFixture, kickOff, playRound, table, endSeason } from '../season.js';
import { stepMinute, substitute, setFormation, setLiveTactic, preview, MAX_SUBS } from '../match.js';
import { TEAM, TEAM_KEYS, TEAM_NAMES, ROLES, DUTIES, INSTR, TAKERS, setTeam, setSlot, setTaker } from '../tactics.js';
import { line } from './commentary.js';
import { buy, sell, MAX_SQUAD } from '../transfers.js';
import { KEY, serialize, deserialize } from '../save.js';
import { crestSvg, kitSvg } from './art.js';

// The UI is the only place allowed to touch Date, localStorage and the DOM.
const newWorld = () => createWorld(Date.now() >>> 0);
const load = () => { try { return deserialize(localStorage.getItem(KEY)); } catch { return null; } };
const save = () => { try { localStorage.setItem(KEY, serialize(s)); } catch {} };

let s = load() || newWorld();
let tab = 'Squad', sel = null, viewing = null, tableDiv = s.me === null ? 0 : s.clubs[s.me].div, msg = '';
let timer = null, speed = 400, subOut = null; // live match: clock, ms per match minute, player picked to come off
const SPEEDS = [['Slow', 1000], ['Normal', 400], ['Fast', 100], ['Very fast', 25]];

const $ = id => document.getElementById(id);
// Real names contain characters such as & and ' — escape everything taken from data.
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '€' + (n / 1e6).toFixed(2) + 'M';
const byPos = list => [...list].sort((a, b) => POS.indexOf(a.pos) - POS.indexOf(b.pos) || overall(b) - overall(a));
const label = k => k.replace(/[A-Z]/g, c => ' ' + c.toLowerCase());
const clubName = id => esc(s.clubs[id].name);
const badge = (id, size = 20) => crestSvg(s.clubs[id], size);
const HEAD = '<th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Ovr</th><th class="n">Value</th>';
const cells = p => `<td>${p.pos}</td><td class="n">${p.age}</td><td class="n">${overall(p)}</td><td class="n">${money(value(p))}</td>`;
const nameBtn = (p, act) => `<td><button class="link" data-act="${act}" data-id="${p.id}">${esc(p.name)}</button></td>`;

const mySide = () => s.live.sides.findIndex(S => !S.auto);
const options = (pairs, current) => pairs.map(([v, text]) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(text)}</option>`).join('');
const fieldSelect = (act, field, pairs, current, id = '') => `<select data-act="${act}" data-field="${field}"${id === '' ? '' : ` data-id="${id}"`}>${options(pairs, current)}</select>`;
const levels = key => TEAM[key].map((text, k) => [k - (TEAM[key].length >> 1), text]);
// One select per team instruction; t is s.tactics or a live side's tac.
const teamSelects = (act, t) => TEAM_KEYS.map(k => `<label>${TEAM_NAMES[k]} ${fieldSelect(act, k, levels(k), t[k])}</label>`).join('');
const formationSelect = (act, current) => `<select data-act="${act}">${Object.keys(FORMATIONS).map(f => `<option${f === current ? ' selected' : ''}>${f}</option>`).join('')}</select>`;

function liveView() {
  const m = s.live, S = m.sides[mySide()], [H, A] = m.sides;
  const feed = [...m.ev].reverse().map(e => `<div class="${e.type === 'goal' ? 'goal' : ''}">${esc(line(e, s.clubs[m.sides[e.side].club].short))}</div>`).join('');
  const btn = (act, id, text) => m.done ? '' : `<button data-act="${act}" data-id="${id}">${text}</button>`;
  const onRow = o => { const p = m.pl[o.id]; return `<tr class="${subOut === o.id ? 'sel' : ''}"><td class="${o.pos !== p.pos ? 'oop' : ''}">${o.pos}</td><td>${esc(p.name)}${p.yc ? ' 🟨' : ''}${p.inj ? ' <span class="oop">injured</span>' : ''}</td><td class="n">${Math.round(p.fit)}%</td><td class="n">${p.rt.toFixed(1)}</td><td>${btn('off', o.id, 'Off')}</td></tr>`; };
  const benchRow = id => { const p = m.pl[id]; return `<tr><td class="dim">${p.pos}</td><td>${esc(p.name)}</td><td></td><td></td><td>${btn('on', id, 'On')}</td></tr>`; };
  const controls = m.done ? '<button class="primary" data-act="play">Continue</button>'
    : `<button class="primary" data-act="${timer ? 'pause' : 'go'}">${timer ? 'Pause' : m.min ? 'Resume' : 'Kick off'}</button>
      <label>Speed <select data-act="speed">${SPEEDS.map(([t, ms]) => `<option value="${ms}"${ms === speed ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Formation ${formationSelect('liveFormation', S.formation)}</label>
      <button data-act="play">Skip to result</button></div><div class="bar">${teamSelects('liveTeam', S.tac)}`;
  return `<p class="fixture score">${badge(H.club, 28)} ${clubName(H.club)} ${H.st.goals} – ${A.st.goals} ${clubName(A.club)} ${badge(A.club, 28)}</p>
    <h2>${m.done ? 'Full time' : m.min ? `${m.min}'` : 'Kick-off'}</h2><div class="bar">${controls}</div>
    <div class="live"><div class="feed" aria-live="polite">${feed || '<div class="dim">The teams are walking out.</div>'}</div>
    <div class="wrap"><table><tr><th>Pos</th><th>On the pitch</th><th class="n">Fit</th><th class="n">Rating</th><th></th></tr>${S.on.map(onRow).join('')}
    <tr><th colspan="5">Bench · substitutions ${S.subs}/${MAX_SUBS}${subOut !== null ? ` · ${esc(m.pl[subOut].name)} comes off: pick who comes on` : ''}</th></tr>${S.bench.map(benchRow).join('')}</table></div></div>`;
}

function report(r) {
  const icon = { goal: '⚽', yellow: '🟨', red: '🟥' }, key = r.ev.filter(e => icon[e.type]);
  const total = r.stats[0].poss + r.stats[1].poss;
  const stat = (name, f) => `<tr><td class="n">${f(r.stats[0])}</td><td>${name}</td><td class="n">${f(r.stats[1])}</td></tr>`;
  const mine = r.ratings.filter(x => x.side === (r.h === s.me ? 0 : 1)), best = r.ratings[0];
  return `<h2>Last round</h2><div class="score">${clubName(r.h)} ${r.hg} – ${r.ag} ${clubName(r.a)}</div>
    ${key.map(e => `<div>${e.min}' ${icon[e.type]} ${esc(e.name)}${e.kind === 'pen' ? ' (pen)' : ''}${e.assistName ? ` <span class="dim">(assist ${esc(e.assistName)})</span>` : ''} <span class="dim">— ${clubName(e.side ? r.a : r.h)}</span></div>`).join('') || '<div class="dim">No goals or cards.</div>'}
    <div class="wrap"><table class="stats"><tr><th class="n">${esc(s.clubs[r.h].short)}</th><th></th><th class="n">${esc(s.clubs[r.a].short)}</th></tr>
    ${stat('Possession', st => Math.round(st.poss / total * 100) + '%')}${stat('Shots', st => st.shots)}${stat('On target', st => st.on)}${stat('Fouls', st => st.fouls)}${stat('Yellow cards', st => st.yc)}${stat('Red cards', st => st.rc)}</table></div>
    <p>Player of the match: <b>${esc(best.name)}</b> (${best.rt.toFixed(1)}, ${clubName(best.side ? r.a : r.h)})</p>
    <h3>Your ratings</h3><div class="wrap"><table>${mine.map(x => `<tr><td>${esc(x.name)}</td><td class="n">${x.rt.toFixed(1)}</td></tr>`).join('')}</table></div>`;
}

const stopClock = () => { clearInterval(timer); timer = null; };
const startClock = () => { stopClock(); timer = setInterval(tick, speed); };
function tick() {
  const m = s.live;
  if (!m || m.done) return stopClock();
  const seen = m.ev.length, i = mySide();
  stepMinute(m);
  if (subOut !== null && !m.sides[i].on.some(o => o.id === subOut)) subOut = null;
  if (m.done) stopClock();
  if (m.ev.slice(seen).some(e => e.side === i && (e.type === 'injury' || e.type === 'red'))) { stopClock(); msg = 'Play paused: make a change if you need one.'; }
  if (!timer || m.min % 5 === 0) save();
  if (!timer || document.activeElement?.tagName !== 'SELECT') render(); // ponytail: routine ticks skip a redraw so an open dropdown survives; a tick that stopped the clock (full time, pause) always renders
}

function profile() {
  const p = [...myClub(s).players, ...s.market].find(x => x.id === viewing);
  if (!p) return '';
  const group = ([title, keys]) => `<h3>${title}</h3>` + keys.map(k => `<div><span>${label(k)}</span><b class="${p.attrs[k] >= 15 ? 'hi' : ''}">${p.attrs[k]}</b></div>`).join('');
  return `<div class="attrs"><h3>${esc(p.name)} · ${p.pos} · age ${p.age} · overall ${overall(p)} · ${money(value(p))}
    <button data-act="close" style="float:right">Close</button></h3>${Object.entries(ATTRS).map(group).join('')}</div>`;
}

const views = {
  Squad() {
    fixLineup(s);
    const club = myClub(s), pos = slots(s.formation), find = id => club.players.find(p => p.id === id);
    const st = preview({ club, ids: s.lineup, formation: s.formation, bench: s.bench, tactics: s.tactics, fam: s.fam });
    const row = (p, slot) => `<tr class="${sel === p.id ? 'sel' : ''}"><td class="${slot && slot !== p.pos ? 'oop' : 'dim'}">${slot || (s.bench.includes(p.id) ? 'Sub' : '–')}</td>${nameBtn(p, 'pick')}${cells(p)}<td><button data-act="view" data-id="${p.id}">Profile</button></td></tr>`;
    const reserves = byPos(club.players.filter(p => !s.lineup.includes(p.id) && !s.bench.includes(p.id)));
    return `<div class="club">${crestSvg(club, 56)}${kitSvg(club.kit, 56)}<b>${esc(club.name)}</b></div>
      <div class="bar"><label>Formation ${formationSelect('formation', s.formation)}</label>
      <button data-act="auto">Auto-pick best XI</button><span class="dim">Attack ${st.att.toFixed(1)} · Defence ${st.def.toFixed(1)} · Control ${st.ctrl.toFixed(1)} · knows ${s.formation} ${Math.round(s.fam[s.formation] * 100)}%</span></div>
      <p class="dim">Click two names to swap them between the XI, the bench and the reserves. Orange slot = playing out of position.</p>
      <div class="wrap"><table><tr><th>Slot</th>${HEAD}<th></th></tr>${s.lineup.map((id, i) => row(find(id), pos[i])).join('')}
      <tr><th colspan="7">Bench (${s.bench.length}/${BENCH})</th></tr>${s.bench.map(id => row(find(id))).join('')}
      <tr><th colspan="7">Reserves</th></tr>${reserves.map(p => row(p)).join('')}</table></div>`;
  },
  Tactics() {
    fixLineup(s);
    const club = myClub(s), pos = slots(s.formation), t = s.tactics, find = id => club.players.find(p => p.id === id);
    const pick = (k, field, pairs) => fieldSelect('slot', field, pairs, t.slots[k][field], k);
    const instr = key => INSTR[key].map((text, k) => [k - 1, text]);
    const row = (id, k) => `<tr><td>${pos[k]}</td><td>${esc(find(id).name)}</td><td>${pick(k, 'role', Object.keys(ROLES[pos[k]]).map(r => [r, r]))}</td>
      <td>${pos[k] === 'GK' ? '' : pick(k, 'duty', Object.keys(DUTIES).map(d => [d, d]))}</td><td>${pick(k, 'shoot', instr('shoot'))}</td><td>${pick(k, 'tackle', instr('tackle'))}</td></tr>`;
    const takers = Object.entries(TAKERS).map(([kind, text]) => `<label>${text} ${fieldSelect('taker', kind, [['', 'Best available'], ...[...s.lineup, ...s.bench].filter(id => find(id).pos !== 'GK').map(id => [String(id), find(id).name])], t.takers[kind] === null ? '' : String(t.takers[kind]))}</label>`).join('');
    return `<h2>Team instructions</h2><div class="bar">${teamSelects('team', t)}</div>
      <h2>Players</h2><div class="wrap"><table><tr><th>Pos</th><th>Player</th><th>Role</th><th>Duty</th><th>Shooting</th><th>Tackling</th></tr>${s.lineup.map(row).join('')}</table></div>
      <h2>Set pieces</h2><p class="dim">A taker who is not on the pitch is replaced by the best available player.</p><div class="bar">${takers}</div>
      <h2>Formation familiarity</h2><p class="dim">Each match in a formation teaches it; an unfamiliar one costs up to 3% of the team's strength.</p>
      <div class="bar">${Object.keys(FORMATIONS).map(f => `<span>${f} ${Math.round(s.fam[f] * 100)}%</span>`).join(' · ')}</div>`;
  },
  Match() {
    if (s.live) return liveView();
    const d = myClub(s).div, rounds = Math.max(...s.divisions.map(x => x.fixtures.length));
    let h = '';
    if (s.done) h += `<h2>Season ${s.season} complete — you finished ${table(s, d).indexOf(s.me) + 1} in the ${esc(s.divisions[d].name)}.</h2><button class="primary" data-act="end">Start next season</button>`;
    else {
      const f = myFixture(s);
      h += `<h2>Round ${s.round + 1} of ${rounds}</h2>` + (f
        ? `<p class="fixture">${badge(f[0], 28)} ${clubName(f[0])} v ${clubName(f[1])} ${badge(f[1], 28)} <span class="dim">(${f[0] === s.me ? 'home' : 'away'})</span></p>`
        + '<button class="primary" data-act="live">Play live</button> <button data-act="play">Quick result</button>'
        : `<p class="dim">No fixture for ${clubName(s.me)} this round — the ${esc(s.divisions[d].name)} season is over. Other divisions are still playing.</p>`
        + '<button class="primary" data-act="play">Play round</button>');
    }
    if (s.last) {
      const res = s.last[d], mine = res.find(r => r.h === s.me || r.a === s.me), others = res.filter(r => r !== mine);
      if (mine) h += report(mine);
      if (others.length) h += `<h2>Other results</h2>${others.map(r => `<div>${clubName(r.h)} ${r.hg} – ${r.ag} ${clubName(r.a)}</div>`).join('')}`;
    }
    return h;
  },
  Table() {
    const cols = ['P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'];
    const row = (id, k) => { const t = s.clubs[id].st; return `<tr class="${id === s.me ? 'me' : ''}"><td class="n">${k + 1}</td><td>${badge(id, 18)}${clubName(id)}</td>${[t.p, t.w, t.d, t.l, t.gf, t.ga, t.gf - t.ga, t.pts].map(v => `<td class="n">${v}</td>`).join('')}</tr>`; };
    return `<div class="bar">${s.divisions.map((d, i) => `<button data-act="div" data-id="${i}" class="${i === tableDiv ? 'on' : ''}">${esc(d.name)}</button>`).join('')}</div>
      <h2>Season ${s.season}</h2><div class="wrap"><table><tr><th class="n">#</th><th>Club</th>${cols.map(c => `<th class="n">${c}</th>`).join('')}</tr>${table(s, tableDiv).map(row).join('')}</table></div>
      ${s.history.length ? '<h2>History</h2>' + s.history.map(h => `<div>Season ${h.season}: ${esc(h.champions[0])} won the ${esc(s.divisions[0].name)} — you finished ${h.pos} (prize ${money(h.prize)})</div>`).join('') : ''}`;
  },
  Transfers() {
    const list = (players, act, text) => `<div class="wrap"><table><tr>${HEAD}<th></th></tr>${byPos(players).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td><button data-act="${act}" data-id="${p.id}">${text}</button></td></tr>`).join('')}</table></div>`;
    return `<h2>Free agents</h2>${list(s.market, 'buy', 'Buy')}
      <h2>Your squad (${myClub(s).players.length}/${MAX_SQUAD}) <span class="dim">— sells for 80% of value</span></h2>${list(myClub(s).players, 'sell', 'Sell')}`;
  },
};

const actions = {
  start(id) { takeClub(s, id); tab = 'Squad'; tableDiv = s.clubs[id].div; },
  reset() { if (s.me === null || confirm('Abandon this career and start a new game?')) { stopClock(); s = newWorld(); sel = viewing = null; tableDiv = 0; } },
  tab(_, el) { tab = el.dataset.tab; sel = viewing = null; },
  div(id) { tableDiv = id; },
  view(id) { viewing = id; },
  close() { viewing = null; },
  auto() { s.lineup = bestXI(myClub(s), s.formation); sel = null; },
  formation(_, el) { s.formation = el.value; s.lineup = bestXI(myClub(s), s.formation); sel = null; },
  pick(id) {
    if (sel === null || sel === id) { sel = sel === id ? null : id; return; }
    swap(s, sel, id);
    sel = null;
  },
  team(_, el) { msg = setTeam(s.tactics, el.dataset.field, +el.value) || ''; },
  slot(k, el) { const f = el.dataset.field; msg = setSlot(s.tactics.slots[k], slots(s.formation)[k], f, f === 'role' || f === 'duty' ? el.value : +el.value) || ''; },
  taker(_, el) { msg = setTaker(s.tactics, el.dataset.field, el.value === '' ? null : +el.value, myClub(s).players) || ''; },
  liveTeam(_, el) { msg = setLiveTactic(s.live, mySide(), el.dataset.field, +el.value) || ''; },
  play() { stopClock(); playRound(s); subOut = null; },
  live() { kickOff(s); subOut = null; },
  go() { startClock(); },
  pause() { stopClock(); },
  speed(_, el) { speed = +el.value; if (timer) startClock(); },
  liveFormation(_, el) { msg = setFormation(s.live, mySide(), el.value) || ''; subOut = null; },
  off(id) { subOut = subOut === id ? null : id; },
  on(id) {
    if (subOut === null) { msg = 'Click Off next to the player who is coming off first.'; return; }
    msg = substitute(s.live, mySide(), subOut, id) || 'Substitution made.';
    subOut = null;
  },
  end() { endSeason(s); tab = 'Table'; tableDiv = myClub(s).div; },
  buy(id) { msg = buy(s, id) || 'Signed.'; },
  sell(id) { msg = sell(s, id) || 'Sold.'; if (viewing === id) viewing = null; },
};

function render() {
  if (s.me === null) {
    $('info').textContent = 'Pick a club to manage';
    $('nav').innerHTML = '';
    $('main').innerHTML = s.divisions.map(d => `<h2>${esc(d.name)}</h2><div class="grid">${d.clubIds.map(id => `<button data-act="start" data-id="${id}">${badge(id, 24)}${clubName(id)}</button>`).join('')}</div>`).join('');
    return;
  }
  $('info').innerHTML = `${badge(s.me, 22)}${clubName(s.me)} · ${esc(s.divisions[myClub(s).div].name)} · Season ${s.season} · Budget ${money(s.budget)}`;
  if (s.live) tab = 'Match'; // the other screens wait for the final whistle
  $('nav').innerHTML = (s.live ? ['Match'] : Object.keys(views)).map(t => `<button data-act="tab" data-tab="${t}" class="${t === tab ? 'on' : ''}">${t}</button>`).join('') + '<button data-act="reset">New game</button>';
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
