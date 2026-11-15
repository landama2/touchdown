import { POS, ATTRS, ALL_ATTRS, overall, value } from '../player.js';
import { available, formAvg, moraleLabel, YELLOW_LIMIT } from '../squad.js';
import { FOCUS, INTENSITY, setTraining, setFocus } from '../training.js';
import { createWorld } from '../world.js';
import { FORMATIONS, BENCH, slots, bestXI, fixLineup, swap } from '../lineup.js';
import { takeClub, myClub, myFixture, upcoming, kickOff, playDay, table, zone, endSeason } from '../season.js';
import { dateLabel } from '../calendar.js';
import { CUP_NAME, cupRoundName, aggregate } from '../cup.js';
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
const outFor = d => d < 14 ? `${d} days` : `${Math.round(d / 7)} weeks`;
const status = p => p.inj ? `${esc(p.inj.name)}, ${outFor(p.inj.days)}` : p.ban ? `banned for ${p.ban} match${p.ban > 1 ? 'es' : ''}`
  : p.yc % YELLOW_LIMIT === YELLOW_LIMIT - 1 ? '🟨 one more yellow is a ban' : '';
const SQUAD_HEAD = '<th class="n">Cond</th><th>Morale</th><th class="n">Form</th><th>Status</th>';
const squadCells = p => `<td class="n">${p.cond}%</td><td>${moraleLabel(p.morale)}</td><td class="n">${formAvg(p) ?? '–'}</td><td class="${available(p) ? 'dim' : 'oop'}">${status(p)}</td>`;
// The human club's new injuries and bans from the day just played.
const newsText = () => s.news.map(n => n.type === 'injury'
  ? `🚑 ${esc(n.name)} is out for ${outFor(n.days)} (${esc(n.injury)}${n.training ? ', in training' : ''}).`
  : `🟥 ${esc(n.name)} is banned for ${n.matches} match${n.matches > 1 ? 'es' : ''}.`).join('<br>');

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

// 'Premier League, round 5', 'FA Cup Quarter-finals', 'Championship play-off semi-final, 2nd leg'.
function compLabel(it) {
  if (it.comp === 'league') return `${s.divisions[it.div].name}, round ${it.round + 1}`;
  if (it.comp === 'cup') return `${CUP_NAME} ${cupRoundName(it.round, s.clubs.length)}`;
  return `${s.divisions[it.div].name} play-off ${it.round ? 'final' : `semi-final, ${it.leg ? '2nd' : '1st'} leg`}`;
}
// ' (4–3 on penalties)' and, after a second leg, the aggregate score; '' otherwise.
function koNote(r) {
  const t = r.item.comp === 'playoff' && r.item.leg === 1 ? s.playoffs[r.item.div]?.rounds[0].ties.find(x => x.h === r.h && x.a === r.a) : null;
  const agg = t ? ` · aggregate ${aggregate(t).join('–')}` : '';
  return agg + (r.pens ? ` · ${r.pens[0]}–${r.pens[1]} on penalties` : '');
}
const scoreLine = r => `${clubName(r.h)} ${r.hg} – ${r.ag} ${clubName(r.a)}${koNote(r) ? `<span class="dim">${koNote(r)}</span>` : ''}`;

function report(r) {
  const icon = { goal: '⚽', yellow: '🟨', red: '🟥' }, key = r.ev.filter(e => icon[e.type]);
  const total = r.stats[0].poss + r.stats[1].poss;
  const stat = (name, f) => `<tr><td class="n">${f(r.stats[0])}</td><td>${name}</td><td class="n">${f(r.stats[1])}</td></tr>`;
  const mine = r.ratings.filter(x => x.side === (r.h === s.me ? 0 : 1)), best = r.ratings[0];
  return `<h2>${esc(compLabel(r.item))}</h2><div class="score">${scoreLine(r)}</div>
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

// Rounds of knockout ties: [[title, ties], ...].
const knockout = rounds => rounds.map(([title, ties]) => `<h3>${esc(title)}</h3><div class="wrap"><table>${ties.map(t => `<tr class="${t.h === s.me || t.a === s.me ? 'me' : ''}">
  <td class="${t.w === t.h ? 'win' : ''}">${clubName(t.h)}</td><td class="n">${t.legs.length ? aggregate(t).join(' – ') : 'v'}</td><td class="${t.w === t.a ? 'win' : ''}">${clubName(t.a)}</td>
  <td class="dim">${t.pens ? `${t.pens[0]}–${t.pens[1]} pens` : t.legs.length > 1 ? 'agg.' : ''}</td></tr>`).join('')}</table></div>`).join('');

function profile() {
  const p = [...myClub(s).players, ...s.market].find(x => x.id === viewing);
  if (!p) return '';
  const group = ([title, keys]) => `<h3>${title}</h3>` + keys.map(k => `<div><span>${label(k)}</span><b class="${p.attrs[k] >= 15 ? 'hi' : ''}">${p.attrs[k]}</b></div>`).join('');
  return `<div class="attrs"><h3>${esc(p.name)} · ${p.pos} · age ${p.age} · overall ${overall(p)} · ${money(value(p))}
    <button data-act="close" style="float:right">Close</button></h3>
    <p>Condition ${p.cond}% · sharpness ${Math.round(p.sharp)}% · morale ${moraleLabel(p.morale)} · form ${formAvg(p) ?? '–'} · ${p.yc} league yellow${p.yc === 1 ? '' : 's'}${status(p) ? ` · <span class="oop">${status(p)}</span>` : ''}</p>${Object.entries(ATTRS).map(group).join('')}</div>`;
}

const views = {
  Squad() {
    fixLineup(s);
    const club = myClub(s), pos = slots(s.formation), find = id => club.players.find(p => p.id === id);
    const st = preview({ club, ids: s.lineup, formation: s.formation, bench: s.bench, tactics: s.tactics, fam: s.fam });
    const row = (p, slot) => `<tr class="${sel === p.id ? 'sel' : ''}"><td class="${slot && slot !== p.pos ? 'oop' : 'dim'}">${slot || (s.bench.includes(p.id) ? 'Sub' : '–')}</td>${nameBtn(p, 'pick')}${cells(p)}${squadCells(p)}<td><button data-act="view" data-id="${p.id}">Profile</button></td></tr>`;
    const reserves = byPos(club.players.filter(p => !s.lineup.includes(p.id) && !s.bench.includes(p.id)));
    return `<div class="club">${crestSvg(club, 56)}${kitSvg(club.kit, 56)}<b>${esc(club.name)}</b></div>
      <div class="bar"><label>Formation ${formationSelect('formation', s.formation)}</label>
      <button data-act="auto">Auto-pick best XI</button><span class="dim">Attack ${st.att.toFixed(1)} · Defence ${st.def.toFixed(1)} · Control ${st.ctrl.toFixed(1)} · knows ${s.formation} ${Math.round(s.fam[s.formation] * 100)}%</span></div>
      <p class="dim">Click two names to swap them between the XI, the bench and the reserves. Orange slot = playing out of position. Injured and banned players cannot play: the assistant puts someone else in their place.</p>
      <div class="wrap"><table><tr><th>Slot</th>${HEAD}${SQUAD_HEAD}<th></th></tr>${s.lineup.map((id, i) => row(find(id), pos[i])).join('')}
      <tr><th colspan="11">Bench (${s.bench.length}/${BENCH})</th></tr>${s.bench.map(id => row(find(id))).join('')}
      <tr><th colspan="11">Reserves</th></tr>${reserves.map(p => row(p)).join('')}</table></div>`;
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
  Training() {
    const t = s.training, pairs = o => Object.keys(o).map(k => [k, k]);
    const focus = p => fieldSelect('focus', 'attr', [['', 'With the team'], ...ALL_ATTRS.map(k => [k, label(k)])], t.ind[p.id] ?? '', p.id);
    return `<h2>Weekly schedule</h2><div class="bar"><label>Focus ${fieldSelect('trainField', 'focus', pairs(FOCUS), t.focus)}</label>
      <label>Intensity ${fieldSelect('trainField', 'intensity', pairs(INTENSITY), t.intensity)}</label></div>
      <p class="dim">Each week, players aged 23 or under may improve one attribute, never beyond their hidden potential: about four a season at Normal.
      Hard trains faster, but players recover less between matches and get hurt more often; Light is the reverse. Rest stops improvement and speeds recovery.
      Keepers always work on goalkeeping. An individual focus takes half of a player's improvement. Players aged 31 and over slowly lose pace, stamina, strength and agility whatever you do.</p>
      <div class="wrap"><table><tr><th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Gained</th><th>Individual focus</th></tr>
      ${byPos(myClub(s).players).map(p => `<tr>${nameBtn(p, 'view')}<td>${p.pos}</td><td class="n">${p.age}</td><td class="n">${p.gain ? '+' + p.gain : ''}</td><td>${focus(p)}</td></tr>`).join('')}</table></div>`;
  },
  Match() {
    if (s.live) return liveView();
    const d = myClub(s).div, venue = f => f.neutral ? 'neutral ground' : f.h === s.me ? 'home' : 'away';
    let h = '';
    if (s.done) {
      const pos = table(s, d).indexOf(s.me), z = zone(s, d, pos);
      const playoff = s.playoffs[d] ? s.playoffs[d].rounds[1]?.ties[0].w === s.me : d > 0 && pos === 2; // no play-offs (old save): 3rd goes up
      h += `<h2>Season ${s.season} complete — you finished ${pos + 1} in the ${esc(s.divisions[d].name)}.</h2>
        <p>${z === 'up' || playoff ? 'Promoted!' : z === 'down' ? 'Relegated.' : z === 'playoff' ? 'The play-offs did not go your way.' : ''}</p>
        <button class="primary" data-act="end">Start next season</button>`;
    } else {
      const f = myFixture(s), today = s.days[s.next];
      h += `<h2>${dateLabel(today.day)}</h2>` + (f
        ? `<p>${esc(compLabel(f.item))}</p><p class="fixture">${badge(f.h, 28)} ${clubName(f.h)} v ${clubName(f.a)} ${badge(f.a, 28)} <span class="dim">(${venue(f)})</span></p>`
        + '<button class="primary" data-act="live">Play live</button> <button data-act="play">Quick result</button>'
        : `<p class="dim">No match for ${clubName(s.me)} today: ${esc([...new Set(today.items.map(compLabel))].join(' · '))}.</p>`
        + '<button class="primary" data-act="play">Continue</button>');
      const next = upcoming(s, 6).slice(f ? 1 : 0);
      if (next.length) h += `<h2>Coming up</h2><div class="wrap"><table>${next.map(x => `<tr><td>${dateLabel(x.day)}</td><td>${esc(compLabel(x.item))}</td><td>${clubName(x.h === s.me ? x.a : x.h)} <span class="dim">(${venue(x)})</span></td></tr>`).join('')}</table></div>`;
    }
    if (s.last) {
      const mine = s.last.find(r => r.h === s.me || r.a === s.me);
      const others = s.last.filter(r => r !== mine && (r.item.comp !== 'league' || r.item.div === d));
      if (mine) h += report(mine);
      if (others.length) h += `<h2>Other results</h2>${others.map(r => `<div>${scoreLine(r)} <span class="dim">· ${esc(compLabel(r.item))}</span></div>`).join('')}`;
    }
    return h;
  },
  Table() {
    const cols = ['P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'];
    const row = (id, k) => { const t = s.clubs[id].st; return `<tr class="${id === s.me ? 'me' : ''} ${zone(s, tableDiv, k) || ''}"><td class="n">${k + 1}</td><td>${badge(id, 18)}${clubName(id)}</td>${[t.p, t.w, t.d, t.l, t.gf, t.ga, t.gf - t.ga, t.pts].map(v => `<td class="n">${v}</td>`).join('')}</tr>`; };
    return `<div class="bar">${s.divisions.map((d, i) => `<button data-act="div" data-id="${i}" class="${i === tableDiv ? 'on' : ''}">${esc(d.name)}</button>`).join('')}</div>
      <h2>Season ${s.season}</h2><div class="wrap"><table><tr><th class="n">#</th><th>Club</th>${cols.map(c => `<th class="n">${c}</th>`).join('')}</tr>${table(s, tableDiv).map(row).join('')}</table></div>
      <p class="dim">${[['up', 'promoted'], ['playoff', 'play-offs'], ['down', 'relegated']].filter(([z]) => s.divisions[tableDiv].clubIds.some((_, k) => zone(s, tableDiv, k) === z)).map(([z, text]) => `<span class="key ${z}"></span>${text}`).join(' ')}</p>
      ${s.playoffs[tableDiv] ? `<h2>Play-offs</h2>${knockout(s.playoffs[tableDiv].rounds.map((rd, k) => [k ? 'Final' : 'Semi-finals', rd.ties]))}` : ''}`;
  },
  Cup() {
    return `<h2>${CUP_NAME} · season ${s.season}</h2>${s.cup ? knockout(s.cup.rounds.map((rd, k) => [cupRoundName(k, s.clubs.length), rd.ties]).reverse()) : '<p class="dim">No cup this season.</p>'}`;
  },
  History() {
    const name = id => id === null ? '—' : clubName(id), names = ids => ids.map(name).join(', ') || '—';
    const award = (title, a, unit) => a ? `<div>${title}: <b>${esc(a.name)}</b> <span class="dim">(${name(a.club)}, ${a.v}${unit})</span></div>` : '';
    const seasons = [...s.history].reverse().map(h => `<h3>Season ${h.season}</h3>
      ${h.pos ? `<p>You finished ${h.pos} in the ${esc(s.divisions[h.div].name)} (prize ${money(h.prize)}).</p>` : ''}
      ${h.cup ? `<div>${CUP_NAME}: <b>${name(h.cup.winner)}</b> <span class="dim">beat ${name(h.cup.runnerUp)} in the final</span></div>` : ''}
      ${h.divs.map((x, d) => `<div><b>${esc(s.divisions[d].name)}</b> champions: ${name(x.champion)}${x.up.length ? ` · promoted: ${names(x.up)}` : ''}${x.down.length ? ` · relegated: ${names(x.down)}` : ''}</div>
        ${x.awards ? award('Player of the season', x.awards.player, ' avg') + award('Top scorer', x.awards.scorer, ' goals') + award('Young player', x.awards.young, ' avg') : ''}`).join('')}`).join('');
    const rec = (title, r, f) => r ? `<div>${title}: ${f(r)} <span class="dim">(season ${r.season})</span></div>` : '';
    const win = r => `${name(r.h)} ${r.hg} – ${r.ag} ${name(r.a)}`;
    const records = s.divisions.map((dv, d) => `<h3>${esc(dv.name)}</h3>${rec('Most points', s.records[d].points, r => `${r.v}, ${name(r.club)}`)}${rec('Most goals', s.records[d].goals, r => `${r.v}, ${esc(r.name)} (${name(r.club)})`)}${rec('Biggest win', s.records[d].win, win)}`).join('');
    const club = myClub(s), honours = [];
    for (const h of s.history) {
      h.divs.forEach((x, d) => { if (x.champion === s.me) honours.push(`${esc(s.divisions[d].name)} champions ${h.season}`); if (x.playoff === s.me) honours.push(`${esc(s.divisions[d].name)} play-off winners ${h.season}`); });
      if (h.cup?.winner === s.me) honours.push(`${CUP_NAME} winners ${h.season}`);
    }
    return `<h2>${esc(club.name)}</h2>${honours.map(x => `<div>🏆 ${x}</div>`).join('') || '<p class="dim">No honours yet.</p>'}
      ${rec('Biggest win', club.rec.win, win)}${rec('Most goals in a season', club.rec.goals, r => `${r.v}, ${esc(r.name)}`)}
      <h2>Seasons</h2>${seasons || '<p class="dim">The first season is still going.</p>'}<h2>Records</h2>${records}`;
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
  play() { stopClock(); playDay(s); subOut = null; msg = newsText(); },
  trainField(_, el) { msg = setTraining(s, el.dataset.field, el.value) || ''; },
  focus(id, el) { msg = setFocus(s, id, el.value || null) || ''; },
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
  end() { endSeason(s); tab = 'History'; tableDiv = myClub(s).div; },
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
  $('info').innerHTML = `${badge(s.me, 22)}${clubName(s.me)} · ${esc(s.divisions[myClub(s).div].name)} · Season ${s.season} · ${s.done ? 'season over' : dateLabel(s.days[s.next].day)} · Budget ${money(s.budget)}`;
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
