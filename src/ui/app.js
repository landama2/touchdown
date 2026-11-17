import { POS, ATTRS, ALL_ATTRS, overall, value } from '../player.js';
import { available, formAvg, moraleLabel, YELLOW_LIMIT } from '../squad.js';
import { FOCUS, INTENSITY, LOADS, setTraining, setFocus, setLoad } from '../training.js';
import { createWorld } from '../world.js';
import { FORMATIONS, BENCH, slots, bestXI, fixLineup, swap } from '../lineup.js';
import { takeClub, myClub, myFixture, upcoming, kickOff, playDay, table, zone, endSeason } from '../season.js';
import { dateLabel } from '../calendar.js';
import { CUP_NAME, cupRoundName, aggregate } from '../cup.js';
import { stepMinute, substitute, setFormation, setLiveTactic, preview, MAX_SUBS } from '../match.js';
import { TEAM, TEAM_KEYS, TEAM_NAMES, ROLES, DUTIES, INSTR, TAKERS, setTeam, setSlot, setTaker } from '../tactics.js';
import { line } from './commentary.js';
import { buy, sell, bid, acceptCounter, talksOn, loanIn, setListing, acceptOffer, rejectOffer, counterOffer, MAX_SQUAD } from '../transfers.js';
import { SUMMER_END, JANUARY, QUICK_SALE, inWindow, windowOpen, justJoined, asking, signingFee, refusal, loanable, loanPay } from '../market.js';
import { KEY, serialize, deserialize } from '../save.js';
import { TASKS, taskDays, estimate, ranges, assign, recall, toggleShortlist, searchPlayers } from '../scouting.js';
import { AREAS, COACHING, MEDICAL, SCOUTS, SCOUT_SPEED, setStaff } from '../staff.js';
import { YOUTH_MAX, LEAVE_AGE, ceilingRange, promote, release } from '../youth.js';
import { wage, wageBill, projection, staffBill, STAFF_COST, STANDARD, SHARE, clubValue, stake } from '../finance.js';
import { terms, canRenew, renew as renewContract } from '../contracts.js';
import { MIN_GAMES, ASK, REP, BONUS, SEVERANCE, bands, leagueTarget, cupTarget, level, startCareer, acceptJob, declineJob, openOffer, askBoard, sackLine, salaryFor, trade } from '../career.js';
import { crestSvg, kitSvg } from './art.js';

// The UI is the only place allowed to touch Date, localStorage and the DOM.
const newWorld = () => createWorld(Date.now() >>> 0);
const load = () => { try { return deserialize(localStorage.getItem(KEY)); } catch { return null; } };
const save = () => { try { localStorage.setItem(KEY, serialize(s)); } catch {} };

let s = load() || newWorld();
let tab = 'Squad', sel = null, viewing = null, tableDiv = s.me === null ? 0 : s.clubs[s.me].div, msg = '', filters = {}; // filters: the player search on Transfers
let ownPay = false; // Transfers: pay fees from the manager's own money
let timer = null, speed = 400, subOut = null; // live match: clock, ms per match minute, player picked to come off
const SPEEDS = [['Slow', 1000], ['Normal', 400], ['Fast', 100], ['Very fast', 25]];

const $ = id => document.getElementById(id);
// Real names contain characters such as & and ' — escape everything taken from data.
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '€' + (n / 1e6).toFixed(2) + 'M';
const perWeek = n => `€${n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n < 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n / 1e3) + 'k'}/wk`;
const termsText = t => `${perWeek(t.wage)} for ${t.years} season${t.years > 1 ? 's' : ''}${t.clause ? ` · release clause ${money(t.clause)}` : ''}`;
const untilText = p => !p.contract ? '–' : p.loan ? `on loan from ${clubName(p.loan.from)}` : p.contract.until === s.season ? '<span class="oop">ends this season</span>' : `season ${p.contract.until}`;
const byPos = list => [...list].sort((a, b) => POS.indexOf(a.pos) - POS.indexOf(b.pos) || overall(b) - overall(a));
const label = k => k.replace(/[A-Z]/g, c => ' ' + c.toLowerCase());
const clubName = id => esc(s.clubs[id].name);
const badge = (id, size = 20) => crestSvg(s.clubs[id], size);
const HEAD = '<th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Ovr</th><th class="n">Value</th>';
const cells = p => `<td>${p.pos}</td><td class="n">${p.age}</td><td class="n">${overall(p)}</td><td class="n">${money(value(p))}</td>`;
const nameBtn = (p, act) => `<td><button class="link" data-act="${act}" data-id="${p.id}">${esc(p.name)}</button>${p.mine ? ' <span title="yours: bought with your own money">💼</span>' : ''}</td>`;
const outFor = d => d === 1 ? '1 day' : d < 14 ? `${d} days` : `${Math.round(d / 7)} weeks`;
const status = p => p.inj ? `${esc(p.inj.name)}, ${outFor(p.inj.days)}` : p.ban ? `banned for ${p.ban} match${p.ban > 1 ? 'es' : ''}`
  : p.yc % YELLOW_LIMIT === YELLOW_LIMIT - 1 ? '🟨 one more yellow is a ban' : '';
const SQUAD_HEAD = '<th class="n">Cond</th><th>Morale</th><th class="n">Form</th><th>Status</th>';
const squadCells = p => `<td class="n">${p.cond}%</td><td>${moraleLabel(p.morale)}</td><td class="n">${formAvg(p) ?? '–'}</td><td class="${available(p) ? 'dim' : 'oop'}">${status(p)}</td>`;
// The human club's new injuries and bans from the day just played.
const cupGoal = k => { const r = cupRoundName(k, s.clubs.length); return /^Round/.test(r) ? `${CUP_NAME} ${r.toLowerCase()}` : `the ${CUP_NAME} ${r.toLowerCase()}`; };
const NEWS = {
  injury: n => `🚑 ${esc(n.name)} is out for ${outFor(n.days)} (${esc(n.injury)}${n.training ? ', in training' : ''}).`,
  ban: n => `🟥 ${esc(n.name)} is banned for ${n.matches} match${n.matches > 1 ? 'es' : ''}.`,
  offer: n => `💶 ${clubName(n.from)} bid ${money(n.fee)} for ${esc(n.name)} (see Transfers).`,
  clause: n => `💶 ${clubName(n.to)} paid ${esc(n.name)}'s ${money(n.fee)} release clause: he has gone.`,
  loan: n => `🔁 ${esc(n.name)} joins ${clubName(n.to)} on loan.`,
  scout: n => `🔎 Scout report on ${taskText(n.task)}: ${n.n} player${n.n === 1 ? '' : 's'} (see Scouting).`,
  vacancy: n => `📰 ${clubName(n.club)} have sacked their manager.`,
  job: n => `📨 ${clubName(n.club)} offer you their job (see Inbox).`,
  warning: n => `⚠️ The ${clubName(n.club)} board is losing patience (confidence ${n.conf}).`,
  sacked: n => `❌ ${clubName(n.club)} have sacked you.${n.pay ? ` Severance: ${money(n.pay)}.` : ''}`,
  bonus: n => `💰 Season bonus from ${clubName(n.club)}: ${money(n.amount)}.`,
  dividend: n => `📈 Your ${n.pct}% of ${clubName(n.club)} paid a dividend of ${money(n.amount)}.`,
  target: n => `🎯 The ${clubName(n.club)} board wants you to ${n.league} and reach ${cupGoal(n.cup)}.`,
  review: n => `📋 Season review: you finished ${ordinal(n.pos)}; the board wanted you to ${n.target}${n.met ? ' — target met' : ' — target missed'}. Reputation ${n.was} → ${n.rep}.`,
  request: n => `🏦 You asked the board for more ${n.kind} budget: ${n.yes ? 'agreed' : 'refused'}.`,
};
const newsText = () => s.news.map(n => NEWS[n.type](n)).join('<br>');

const mySide = () => s.live.sides.findIndex(S => !S.auto);
const dealText = d => `${esc(d.name)} ${d.from === null ? 'from the free-agent list' : `from ${clubName(d.from)}`} ${d.to === null ? 'released' : `to ${clubName(d.to)}`}${d.loan ? ' on loan' : d.fee ? ` (${money(d.fee)})` : ''}`;
// Which window is open, or when the next one opens.
const windowText = () => s.done ? `Summer window open until ${dateLabel(SUMMER_END - 1)}` : inWindow(s.day) ? `${s.day < SUMMER_END ? 'Summer' : 'January'} window open until ${dateLabel(s.day < SUMMER_END ? SUMMER_END - 1 : JANUARY[1])}`
  : `Window closed: the ${s.day < JANUARY[0] ? `January window opens ${dateLabel(JANUARY[0])}` : 'summer window opens when the season ends'}`;
const feeOf = id => Math.round(+$(`fee-${id}`).value * 1e6);
// Where a player is: his club, or null on the free-agent list.
const clubOfPlayer = p => s.youth.includes(p) ? myClub(s) : s.clubs.find(c => c.players.includes(p)) ?? null; // youth players are yours
const allPlayers = () => [...s.clubs.flatMap(c => c.players), ...s.market, ...s.youth];
// A [lo, hi] estimate as text: one number when known exactly.
const span = ([lo, hi], f = String) => lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`;
const moneySpan = ([lo, hi]) => lo === hi ? money(lo) : `€${(lo / 1e6).toFixed(2)}–${(hi / 1e6).toFixed(2)}M`;
const scale = (x, [lo, hi], v) => [lo, hi].map(e => Math.round(x * e / v / 1e4) * 1e4); // a price that moves with value, over the value estimate
// Cells for a player you may not know fully: position, age, overall and value as estimates, knowledge.
const estCells = (p, e) => `<td>${p.pos}</td><td class="n">${p.age}</td><td class="n">${span(e.ovr)}</td><td class="n">${moneySpan(e.value)}</td><td class="n dim">${e.k}%</td>`;
const EST_HEAD = '<th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Ovr</th><th class="n">Value</th><th class="n">Known</th>';
// A club in a narrow column: badge and three-letter code (full name on hover).
const clubCell = c => c ? `<span title="${esc(c.name)}">${badge(c.id, 16)} ${esc(c.short)}</span>` : '<span class="dim">free</span>';
const star = id => `<button class="link" data-act="shortlist" data-id="${id}" title="shortlist" aria-label="shortlist">${s.shortlist.includes(id) ? '★' : '☆'}</button>`;
const taskText = t => t.kind === 'free' ? 'the free agents' : t.kind === 'division' ? esc(s.divisions[t.id].name) : t.kind === 'club' ? clubName(t.id)
  : esc(allPlayers().find(p => p.id === t.id)?.name ?? 'a player who has gone');
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
  const p = allPlayers().find(x => x.id === viewing);
  if (!p) return '';
  const c = clubOfPlayer(p), e = estimate(s, p, c), r = e.k < 100 ? ranges(s, p, c) : null;
  const shown = k => r ? span(r[k]) : p.attrs[k], high = k => (r ? r[k][0] : p.attrs[k]) >= 15;
  const group = ([title, keys]) => `<h3>${title}</h3>` + keys.map(k => `<div><span>${label(k)}</span><b class="${high(k) ? 'hi' : ''}">${shown(k)}</b></div>`).join('');
  const known = e.k < 100 ? ` · <span class="dim">known ${e.k}%</span> ${e.ovr[0] < e.ovr[1] && s.scouts.some(x => !x.task) ? `<button data-act="scoutPlayer" data-id="${p.id}">Scout him</button>` : ''}` : '';
  return `<div class="attrs"><h3>${c?.id === s.me ? '' : star(p.id) + ' '}${esc(p.name)} · ${p.pos} · age ${p.age} · ${c ? clubName(c.id) : 'free agent'} · overall ${span(e.ovr)} · ${moneySpan(e.value)}${known}
    <button data-act="close" style="float:right">Close</button></h3>
    <p>Condition ${p.cond}% · sharpness ${Math.round(p.sharp)}% · morale ${moraleLabel(p.morale)} · form ${formAvg(p) ?? '–'} · ${p.yc} league yellow${p.yc === 1 ? '' : 's'}${status(p) ? ` · <span class="oop">${status(p)}</span>` : ''}${p.contract ? ` · contract ${perWeek(p.contract.wage)} until season ${p.contract.until}${p.contract.clause ? `, release clause ${money(p.contract.clause)}` : ''}` : ''}</p>${Object.entries(ATTRS).map(group).join('')}</div>`;
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
    const load = p => fieldSelect('load', 'load', [['', 'With the team'], ...LOADS.map(k => [k, k])], t.load[p.id] ?? '', p.id);
    return `<h2>Weekly schedule</h2><div class="bar"><label>Focus ${fieldSelect('trainField', 'focus', pairs(FOCUS), t.focus)}</label>
      <label>Intensity ${fieldSelect('trainField', 'intensity', pairs(INTENSITY), t.intensity)}</label></div>
      <p class="dim">Each week a player may improve one attribute, never beyond his hidden potential: about four a season at Normal for players aged 23 or under, less with every year after that (about two at 26, one at 29, almost nothing from 31).
      Hard trains faster, but players recover less between matches and get hurt more often; Light is the reverse. Rest stops improvement and speeds recovery.
      Each player can train at his own intensity; a personal Rest means no improvement and no training injuries.
      Keepers always work on goalkeeping. An individual focus takes half of a player's improvement. Players aged 31 and over slowly lose pace, stamina, strength and agility whatever you do.</p>
      <div class="wrap"><table><tr><th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Gained</th><th>Individual focus</th><th>Intensity</th></tr>
      ${byPos(myClub(s).players).map(p => `<tr>${nameBtn(p, 'view')}<td>${p.pos}</td><td class="n">${p.age}</td><td class="n">${p.gain ? '+' + p.gain : ''}</td><td>${focus(p)}</td><td>${load(p)}</td></tr>`).join('')}</table></div>`;
  },
  Match() {
    if (s.live) return liveView();
    const d = myClub(s).div, venue = f => f.neutral ? 'neutral ground' : f.h === s.me ? 'home' : 'away';
    let h = '';
    if (s.done) {
      const pos = table(s, d).indexOf(s.me), z = zone(s, d, pos);
      const playoff = s.playoffs[d] ? s.playoffs[d].rounds[1]?.ties[0].w === s.me : d > 0 && pos === 2; // no play-offs (old save): 3rd goes up
      const going = myClub(s).players.filter(p => p.contract.until === s.season), n = going.length;
      h += `<h2>Season ${s.season} complete — you finished ${pos + 1} in the ${esc(s.divisions[d].name)}.</h2>
        <p>${z === 'up' || playoff ? 'Promoted!' : z === 'down' ? 'Relegated.' : z === 'playoff' ? 'The play-offs did not go your way.' : ''}</p>
        ${n ? `<p class="oop">${n} contract${n > 1 ? 's end' : ' ends'} now and ${n > 1 ? 'these players leave' : 'this player leaves'}: ${going.map(p => esc(p.name)).join(', ')}. <button data-act="tab" data-tab="Contracts">Contracts</button></p>` : ''}
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
      ${h.fin ? `<div class="dim">Books: income ${money(h.fin.broadcast + h.fin.sponsor + h.fin.gate + h.fin.prize + h.fin.sales)}, wages ${money(h.fin.wages)}, fees ${money(h.fin.fees)} · balance ${money(h.fin.balance)}</div>` : ''}
      ${h.left?.length ? `<div class="dim">Left when their contracts ended: ${h.left.map(esc).join(', ')}</div>` : ''}
      ${h.deals?.length ? `<div class="dim">Your deals: ${h.deals.map(dealText).join(' · ')}</div>` : ''}
      ${h.youthLeft?.length ? `<div class="dim">Left the youth squad at ${LEAVE_AGE}: ${h.youthLeft.map(esc).join(', ')}</div>` : ''}
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
    const me = myClub(s), open = windowOpen(s);
    const feeBox = (id, v) => `<input type="number" id="fee-${id}" min="0" step="0.05" value="${(v / 1e6).toFixed(2)}" style="width:6.5em" aria-label="fee in millions of euros"> €M`;
    const table = (head, rows) => rows.length ? `<div class="wrap"><table><tr>${head}</tr>${rows.join('')}</table></div>` : '<p class="dim">None.</p>';
    const offers = s.offers.map(o => [o, me.players.find(p => p.id === o.id)]).filter(([, p]) => p).map(([o, p]) => `<tr>${nameBtn(p, 'view')}${cells(p)}<td>${clubName(o.club)}</td><td class="n">${money(o.fee)}</td>
      <td><button data-act="acceptOffer" data-id="${p.id}">Accept</button> <button data-act="rejectOffer" data-id="${p.id}">Reject</button> ${feeBox(p.id, o.fee * 1.2)} <button data-act="counterOffer" data-id="${p.id}">Ask for</button></td></tr>`);
    const askSpan = (p, c, e) => scale(asking(s, c, p), e.value, value(p));
    const deal = (p, c, e) => {
      if (!c) return `<button data-act="buy" data-id="${p.id}">Sign</button>`;
      const t = talksOn(s, p.id), why = !open ? '' : p.loan ? `on loan from ${clubName(p.loan.from)}` : justJoined(s, p) ? 'just joined' : refusal(c, me, p);
      if (!open || why) return `<span class="dim" title="${esc(why)}">${why.includes("won't") ? "won't come" : why}</span>`;
      const a = askSpan(p, c, e);
      return `${feeBox(p.id, t?.counter ?? Math.round((a[0] + a[1]) / 2e4) * 1e4)} <button data-act="bid" data-id="${p.id}">Bid</button>${t?.counter ? ` <button data-act="counter" data-id="${p.id}">Pay ${money(t.counter)}</button>` : ''}${loanable(s, c, p) ? ` <button data-act="loan" data-id="${p.id}">Loan (${perWeek(loanPay(p.contract.wage))})</button>` : ''}`;
    };
    const found = searchPlayers(s, filters).map(({ p, c, est: e }) => `<tr><td>${star(p.id)}</td>${nameBtn(p, 'view')}<td>${clubCell(c)}</td>${estCells(p, e)}
      <td class="n">${c ? moneySpan(askSpan(p, c, e)) : moneySpan(scale(signingFee(p), e.value, value(p)))}</td><td>${deal(p, c, e)}</td></tr>`);
    const listed = s.clubs.filter(x => x !== me).flatMap(x => x.players.filter(p => p.listed === 'sale').map(p => { const e = estimate(s, p, x); return `<tr>${nameBtn(p, 'view')}${estCells(p, e)}<td><button class="link" data-act="browse" data-id="${x.id}">${clubName(x.id)}</button></td><td class="n">${moneySpan(askSpan(p, x, e))}</td></tr>`; }));
    const listing = p => `<select data-act="listing" data-id="${p.id}">${options([['', 'Not listed'], ['sale', 'For sale'], ...(p.age <= 23 ? [['loan', 'For loan']] : [])], p.listed ?? '')}</select>`;
    const mine = byPos(me.players).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td>${p.loan ? `<span class="dim">on loan from ${clubName(p.loan.from)}</span>` : listing(p)}</td>
      <td>${p.loan || justJoined(s, p) ? '' : `<button data-act="sell" data-id="${p.id}">Quick sale ${money(Math.round(QUICK_SALE * value(p) / 1e4) * 1e4)}</button>`}</td></tr>`);
    const away = s.clubs.flatMap(x => x.players.filter(p => p.loan?.from === s.me).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td>at ${clubName(x.id)} until the end of season ${p.loan.until}</td></tr>`));
    const free = byPos(s.market).map(p => { const e = estimate(s, p, null); return `<tr><td>${star(p.id)}</td>${nameBtn(p, 'view')}${estCells(p, e)}<td class="n">${moneySpan(scale(signingFee(p), e.value, value(p)))}</td><td class="dim">${termsText(terms(s, p))}</td><td><button data-act="buy" data-id="${p.id}">Sign</button></td></tr>`; });
    const biggest = s.deals.filter(d => !d.loan && d.from !== null && d.to !== null).sort((a, b) => b.fee - a.fee).slice(0, 10).map(d => `<div>${dealText(d)}</div>`).join('');
    const f = filters, pick = (id, pairs, v) => `<select id="${id}">${options(pairs, v ?? '')}</select>`;
    const divPairs = [['', 'Any division'], ...s.divisions.map((d, i) => [String(i), d.name]), ['free', 'Free agents']];
    const clubPairs = [['', 'Any club'], ...s.clubs.filter(c => c.id !== s.me).map(c => [String(c.id), c.name])];
    const num = (id, v, label, w = 5) => `<label>${label} <input type="number" id="${id}" min="0" value="${v ?? ''}" style="width:${w}em"></label>`;
    const search = `<div class="bar">${pick('f-pos', [['', 'Any position'], ...POS.map(x => [x, x])], f.pos)}${pick('f-div', divPairs, f.div)}${pick('f-club', clubPairs, f.club)}
      ${num('f-age', f.maxAge, 'Age ≤')}${num('f-ovr', f.minOvr, 'Ovr ≥')}${num('f-val', f.maxValue ? f.maxValue / 1e6 : '', 'Value ≤ €M')}
      <label><input type="checkbox" id="f-listed"${f.listed ? ' checked' : ''}> listed</label><label><input type="checkbox" id="f-loan"${f.loan ? ' checked' : ''}> loan</label>
      <input type="text" id="f-name" placeholder="name" value="${esc(f.name ?? '')}" style="width:9em"><button class="primary" data-act="search">Search</button> <button data-act="clearSearch">Clear</button></div>`;
    return `<p><b>${windowText()}</b> · transfer budget ${money(s.budget)} · wage bill ${perWeek(wageBill(me))} of ${perWeek(s.wageBudget)}</p>
      <p><label><input type="checkbox" data-act="ownPay"${ownPay ? ' checked' : ''}> Pay fees from your own money (${money(s.career?.money ?? 0)})</label> <span class="dim">A player you pay for is yours 💼: the club pays his wages, he follows you to every new job, and when he is sold the fee is yours.</span></p>
      <p class="dim">Bid for players at other clubs while a window is open: a club takes ${Math.round(0.9 * 100)}% of its asking price or counters, and talks stop after three rounds. Players under 24 who are not regulars can come on loan for half their wage. Free agents sign at any time for a signing-on fee of half their value.</p>
      <h2>Offers for your players</h2>${table(`${HEAD}<th>From</th><th class="n">Fee</th><th></th>`, offers)}
      <h2>Find players</h2><p class="dim">Premier League players are well known. Elsewhere you see estimates until your scouts report (Scouting); ☆ adds a player to your shortlist. Best 60 shown.</p>${search}
      ${table(`<th></th><th>Name</th><th>Club</th>${EST_HEAD.replace('<th>Name</th>', '')}<th class="n">Price</th><th>${open ? 'Deal' : 'Window closed: free agents only'}</th>`, found)}
      <h2>Transfer list</h2><p class="dim">Clubs in debt put their best-paid players up for sale, cheaper.</p>${table(`${EST_HEAD}<th>Club</th><th class="n">Asking</th>`, listed)}
      <h2>Your squad (${me.players.length}/${MAX_SQUAD})</h2><p class="dim">List a player and clubs bid for him during a window. A quick sale gets ${QUICK_SALE * 100}% of his value at once.</p>${table(`${HEAD}<th>Listing</th><th></th>`, mine)}
      <h2>Out on loan</h2>${table(`${HEAD}<th></th>`, away)}
      <h2>Free agents</h2>${table(`<th></th>${EST_HEAD}<th class="n">Signing fee</th><th>Asks</th><th></th>`, free)}
      <h2>Biggest deals this season</h2>${biggest || '<p class="dim">None yet.</p>'}`;
  },
  Contracts() {
    const club = myClub(s);
    const row = p => {
      const t = canRenew(s, p) ? terms(s, p) : null;
      return `<tr>${nameBtn(p, 'view')}<td>${p.pos}</td><td class="n">${p.age}</td><td class="n">${overall(p)}</td><td class="n">${perWeek(p.contract.wage)}</td><td>${untilText(p)}</td>
        <td class="n">${p.contract.clause ? money(p.contract.clause) : ''}</td><td>${t ? `<span class="dim">asks ${termsText(t)}</span> <button data-act="renew" data-id="${p.id}">Accept</button>` : ''}</td></tr>`;
    };
    return `<h2>Contracts</h2><p>Wage bill ${perWeek(wageBill(club))} of a wage budget of ${perWeek(s.wageBudget)}.</p>
      <p class="dim">A player whose contract ends this season or next names his terms for a new one: accept them, or he leaves when his contract ends. If too many leave, academy players fill the squad.</p>
      <div class="wrap"><table><tr><th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Ovr</th><th class="n">Wage</th><th>Until</th><th class="n">Clause</th><th>New contract</th></tr>${byPos(club.players).map(row).join('')}</table></div>`;
  },
  Finances() {
    const c = myClub(s), L = c.fin.season, line = (name, v) => `<tr><td>${name}</td><td class="n">${money(v)}</td></tr>`;
    return `<h2>Finances · season ${s.season}</h2>
      <p>Balance <b>${money(c.fin.balance)}</b> · transfer budget ${money(s.budget)} · wage bill ${perWeek(wageBill(c))} of ${perWeek(s.wageBudget)}</p>
      <div class="wrap"><table><tr><th>Income this season</th><th></th></tr>${line('Broadcasting', L.broadcast)}${line('Sponsorship', L.sponsor)}${line('Gate receipts', L.gate)}${line('Prize money', L.prize)}${line('Player sales', L.sales)}
      <tr><th>Costs this season</th><th></th></tr>${line('Wages', L.wages)}${line('Transfer fees', L.fees)}${line('Staff beyond the standard', L.staff)}</table></div>
      <p class="dim">Expected income for a mid-table season: ${money(projection(s, c))}. The board sets each season's budgets: three quarters of the balance for transfers (none in debt); for wages and staff, 55% of the expected income or what you pay now, whichever is more, plus what the other quarter of your savings can carry over two years. In debt there is no extra, so wages are frozen. Renewing a player at the same wage always fits. You may ask the board for more once a season (Board).</p>`;
  },
};

views.Scouting = () => {
  const taskPairs = [['', 'Idle'], ['free', 'Free agents'], ...s.divisions.map((d, i) => ['division:' + i, 'Division: ' + d.name]),
    ...s.clubs.filter(c => c.id !== s.me).map(c => ['club:' + c.id, 'Club: ' + c.name]), ...s.shortlist.map(id => ['player:' + id, 'Player: ' + (allPlayers().find(p => p.id === id)?.name ?? '?')])];
  const taskValue = sc => sc.task ? sc.task.kind === 'free' ? 'free' : `${sc.task.kind}:${sc.task.id}` : '';
  const scouts = s.scouts.map((sc, k) => `<tr><td>Scout ${k + 1}</td><td>${sc.task ? `${taskText(sc.task)} · reports in ${outFor(sc.days)}` : '<span class="dim">idle</span>'}</td>
    <td><select data-act="assign" data-id="${k}">${options(taskPairs.some(([v]) => v === taskValue(sc)) ? taskPairs : [...taskPairs, [taskValue(sc), 'Player: ' + taskText(sc.task)]], taskValue(sc))}</select></td></tr>`).join('');
  const list = s.shortlist.map(id => allPlayers().find(p => p.id === id)).filter(Boolean).map(p => {
    const c = clubOfPlayer(p), e = estimate(s, p, c);
    return `<tr><td>${star(p.id)}</td>${nameBtn(p, 'view')}<td>${clubCell(c)}</td>${estCells(p, e)}<td>${e.ovr[0] < e.ovr[1] && s.scouts.some(x => !x.task) ? `<button data-act="scoutPlayer" data-id="${p.id}">Scout</button>` : ''}</td></tr>`;
  });
  const days = Object.entries(TASKS).map(([k, t]) => `${k === 'free' ? 'the free agents' : 'a ' + k}: ${taskDays(s, k)} days, to ${t.level}%`).join(' · ');
  return `<h2>Scouts</h2><p class="dim">Send a scout to watch a player, a club, a division or the free agents. When he reports, you know everyone he watched: ${days}. What you know fades over two seasons, and Premier League players are always known. Your scouting staff level (Staff) sets how many scouts you have and how fast they work.</p>
    <div class="wrap"><table>${scouts}</table></div>
    <h2>Shortlist</h2>${list.length ? `<div class="wrap"><table><tr><th></th><th>Name</th><th>Club</th>${EST_HEAD.replace('<th>Name</th>', '')}<th></th></tr>${list.join('')}</table></div>` : '<p class="dim">Empty: add players with ☆ on Transfers or a profile.</p>'}`;
};

views.Staff = () => {
  const c = myClub(s), std = STANDARD[Math.min(c.div, STANDARD.length - 1)];
  const effect = {
    coaching: l => `young players grow ×${COACHING[l - 1]} as fast; youth intake ${2 + l} a year`,
    scouting: l => `${SCOUTS[l - 1]} scout${SCOUTS[l - 1] > 1 ? 's' : ''}, reports in ×${SCOUT_SPEED[l - 1]} the time`,
    medical: l => `injuries last ×${MEDICAL[l - 1]} as long`,
  };
  const row = a => `<tr><td>${a[0].toUpperCase() + a.slice(1)}</td><td><select data-act="staff" data-field="${a}">${options([1, 2, 3, 4, 5].map(l => [String(l), `Level ${l} · ${perWeek(STAFF_COST[l - 1])}`]), String(c.staff[a]))}</select></td><td class="dim">${effect[a](c.staff[a])}</td></tr>`;
  const extra = staffBill(s, c);
  return `<h2>Staff</h2><p class="dim">Your club's budget already pays for level ${std} staff in every area (the ${esc(s.divisions[c.div].name)} standard). Each area above it costs the difference every week, and below it saves it; the difference counts against your wage budget.</p>
    <div class="wrap"><table>${AREAS.map(row).join('')}</table></div>
    <p>Beyond the standard: <b>${extra < 0 ? 'saving ' + perWeek(-extra) : perWeek(extra)}</b> · wage bill ${perWeek(wageBill(c))} · wage budget ${perWeek(s.wageBudget)}</p>`;
};

views.Youth = () => {
  const rows = byPos(s.youth).map(p => { const [lo, hi] = ceilingRange(s, p); return `<tr>${nameBtn(p, 'view')}<td>${p.pos}</td><td class="n">${p.age}</td><td class="n">${overall(p)}</td><td class="n">${lo}–${hi}</td>
    <td><button data-act="promote" data-id="${p.id}">Promote (${perWeek(wage(p))})</button> <button data-act="releaseYouth" data-id="${p.id}">Release</button></td></tr>`; }).join('');
  return `<h2>Youth squad (${s.youth.length}/${YOUTH_MAX})</h2><p class="dim">Youngsters train every week but play no matches and earn nothing. A new intake arrives each summer; at ${LEAVE_AGE} those still here leave. Ceiling: the overall your coaches think he can reach (better coaching, a closer guess). When contracts end and the first team runs short, the best youth player in the position steps up.</p>
    ${rows ? `<div class="wrap"><table><tr><th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Ovr</th><th class="n">Ceiling</th><th></th></tr>${rows}</table></div>` : '<p class="dim">Empty until the summer intake.</p>'}`;
};

// When a news item happened: 'Season 2, Sat 8 Aug', or 'Season 2, pre-season'.
const when = n => `Season ${n.season}, ${n.day < 0 ? 'pre-season' : dateLabel(n.day)}`;
const unread = () => s.inbox.filter(n => !n.read).length;
const confText = c => `<meter min="0" max="100" low="35" high="60" optimum="100" value="${c.conf}"></meter> ${Math.round(c.conf)}`;

views.Board = () => {
  const c = myClub(s), b = bands(s, c.div), k = leagueTarget(s, c.id), pos = table(s, c.div).indexOf(c.id) + 1, line = Math.max(0, sackLine(s));
  const spell = x => `<tr><td>${clubName(x.club)}</td><td>season ${x.from}${x.to === null ? ' – now' : x.to === x.from ? '' : ` – ${x.to}`}</td><td class="n">${x.salary ? money(x.salary) + ' a year' : ''}</td><td class="dim">${x.how === 'sacked' ? 'sacked' : x.how === 'left' ? 'left for another job' : ''}</td></tr>`;
  const asked = s.career.asked === s.season;
  return `<h2>The board</h2><p>Confidence ${confText(c)} <span class="dim">· below ${Math.round(line)} you are sacked (after ${MIN_GAMES} league games)</span></p>
    <div class="wrap"><table><tr><th>Target</th><th>Now</th></tr>
    <tr><td>League: ${esc(b[k][0])} (${b[k][1] === 1 ? '1st' : `top ${b[k][1]}`})</td><td>${c.st.p ? ordinal(pos) : '–'}</td></tr>
    <tr><td>Cup: reach ${cupGoal(cupTarget(s, c.id))}</td><td></td></tr></table></div>
    <p class="dim">Every league result is weighed against what a squad like yours should get; the board also watches the table each week and does not like debt or a wage bill over budget. Going out of the cup early costs, cup wins from the target round on help. At the end of the season the target is judged, and promotion and relegation count.</p>
    <h2>Budgets</h2><p>Transfer budget ${money(s.budget)} · wage budget ${perWeek(s.wageBudget)} (wages and staff ${perWeek(wageBill(c) + staffBill(s, c))})</p>
    <p class="dim">Once a season you may ask for more. The board agrees while its confidence is ${ASK.conf} or more and the club is out of debt (always, if you own ${SHARE.say}% of the club); otherwise it says no and thinks less of you for asking.</p>
    <div class="bar">${asked ? '<span class="dim">You have asked this season.</span>' : `<button data-act="ask" data-field="transfer">Ask for ${Math.round((ASK.transfer - 1) * 100)}% more transfer budget</button> <button data-act="ask" data-field="wage">Ask for ${Math.round((ASK.wage - 1) * 100)}% more wage budget</button>`}</div>
    <h2>Your reputation: ${s.career.rep}</h2><p class="dim">Your club's size is ${level(s, c.id)} on the same scale. Reputation follows where you finish and the trophies you win, and drops when you are sacked. Clubs up to ${REP.gate} above it may offer you their job when they sack their manager; it buys a little patience from the board and persuades players to join.</p>
    <h2>Career</h2><div class="wrap"><table>${s.career.spells.map(spell).join('')}</table></div>`;
};

// The manager's own money: salary, bonuses, severance; players of his own; shares in clubs.
views.Money = () => {
  const spell = s.career.spells.at(-1), own = s.me !== null && spell.to === null;
  const pay = own ? spell.salary ?? salaryFor(s, s.me) : 0;
  const rows = Object.entries(s.career.shares).map(([id, pct]) => { const c = s.clubs[id], v = clubValue(s, c);
    return `<tr><td>${clubName(c.id)}</td><td class="n">${pct}%</td><td class="n">${money(v)}</td><td class="n">${money(pct * v / 100)}</td></tr>`; }).join('');
  const mine = s.clubs.flatMap(c => c.players.filter(p => p.mine).map(p => `<tr>${nameBtn(p, 'view')}<td>${p.pos}</td><td class="n">${p.age}</td><td>${clubName(c.id)}</td><td class="n">${money(value(p))}</td></tr>`)).join('');
  const clubs = [...s.clubs].sort((a, b) => a.div - b.div || a.name.localeCompare(b.name)).map(c => [String(c.id), `${c.name} · ${money(clubValue(s, c) / 100)} per 1%${stake(s, c.id) ? ` · you own ${stake(s, c.id)}%` : ''}`]);
  return `<h2>Your money: ${money(s.career.money)}</h2>
    <p>${own ? `Salary at ${clubName(s.me)}: ${money(pay)} a year, paid week by week through the season.` : 'Out of work: no salary.'}</p>
    <p class="dim">The salary is set by the size of the club when you take the job. Each season the club pays a bonus of ${BONUS.target * 100}% of a year's salary for meeting the board's target, ${BONUS.up * 100}% for promotion and ${BONUS.trophy * 100}% for each trophy. If you are sacked you get a quarter's salary (${SEVERANCE * 100}%); if you leave for another job, nothing.</p>
    <h2>Your players</h2>${mine ? `<div class="wrap"><table><tr><th>Name</th><th>Pos</th><th class="n">Age</th><th>At</th><th class="n">Value</th></tr>${mine}</table></div>` : '<p class="dim">None. Tick "Pay fees from your own money" on Transfers to buy one.</p>'}
    <h2>Shares</h2>${rows ? `<div class="wrap"><table><tr><th>Club</th><th class="n">Stake</th><th class="n">Club value</th><th class="n">Your part</th></tr>${rows}</table></div>` : '<p class="dim">You own no shares.</p>'}
    <div class="bar"><select id="share-club" aria-label="club">${options(clubs, String(s.me ?? clubs[0][0]))}</select>
      <label><input type="number" id="pct" min="1" max="${SHARE.max}" value="1" style="width:4em" aria-label="percent"> %</label>
      <button data-act="shares" data-field="buy">Buy</button> <button data-act="shares" data-field="sell">Sell</button></div>
    <p class="dim">A club is worth ${SHARE.value}× its expected season income, so promotion raises its value. You can own up to ${SHARE.max}% of a club; selling costs ${SHARE.sellCut * 100}%.
    Each summer every club you own part of pays you your share of half its season's profit. In your own club, ${SHARE.patient}% makes the board more patient (the sacking line drops by ${SHARE.patience}), and ${SHARE.say}% gives you a say: every budget request is granted and the transfer budget is ${Math.round(SHARE.sayTransfer * 100)} points more of the balance.</p>`;
};

views.Inbox = () => {
  const item = n => `<tr class="${n.read ? '' : 'me'}"><td class="dim">${when(n)}</td><td>${NEWS[n.type](n)}${n.type === 'job' && openOffer(s, n.club)
    ? ` <button class="primary" data-act="acceptJob" data-id="${n.club}">Accept</button> <button data-act="declineJob" data-id="${n.club}">Decline</button> <span class="dim">open until ${dateLabel(s.jobs.find(j => j.club === n.club && j.offered).until)}</span>` : ''}</td></tr>`;
  const html = `<h2>Inbox</h2>${s.inbox.length ? `<div class="wrap"><table>${[...s.inbox].reverse().map(item).join('')}</table></div>` : '<p class="dim">Nothing yet.</p>'}`;
  for (const n of s.inbox) n.read = true; // read once shown
  return html;
};

// Out of work: the season goes on; job offers arrive in the inbox.
function outOfWork() {
  return `<h2>Out of work</h2><p>Reputation ${s.career.rep}. Clubs that sack their manager may offer you the job: watch the inbox.</p>
    <div class="bar">${s.done ? '<button class="primary" data-act="end">Start next season</button>' : `<button class="primary" data-act="play">Continue</button> <span class="dim">${dateLabel(s.days[s.next].day)}</span>`}</div>`;
}
const UNEMPLOYED = ['Inbox', 'Money', 'Table', 'Cup'];
const navButton = t => `<button data-act="tab" data-tab="${t}" class="${t === tab ? 'on' : ''}">${t === 'Inbox' && unread() ? `Inbox (${unread()})` : t}</button>`;

const actions = {
  start(id) { startCareer(s, id); tab = 'Squad'; tableDiv = s.clubs[id].div; },
  acceptJob(id) { msg = acceptJob(s, id) || `Welcome to ${clubName(id)}.`; if (s.me === id) { tab = 'Board'; tableDiv = s.clubs[id].div; sel = viewing = null; } },
  declineJob(id) { declineJob(s, id); msg = 'Offer declined.'; },
  ask(_, el) { msg = askBoard(s, el.dataset.field); },
  reset() { if ((s.me === null && !s.career) || confirm('Abandon this career and start a new game?')) { stopClock(); s = newWorld(); sel = viewing = null; tableDiv = 0; } },
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
  load(id, el) { msg = setLoad(s, id, el.value || null) || ''; },
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
  end() { endSeason(s); tab = s.me === null ? 'Inbox' : 'History'; if (s.me !== null) tableDiv = myClub(s).div; },
  buy(id) { msg = buy(s, id, ownPay) || 'Signed.'; },
  ownPay(_, el) { ownPay = el.checked; },
  browse(id) { filters = { club: String(id) }; tab = 'Transfers'; },
  search() {
    const v = id => $(id).value, n = id => +v(id) || null;
    filters = { pos: v('f-pos'), div: v('f-div'), club: v('f-club'), maxAge: n('f-age'), minOvr: n('f-ovr'), maxValue: n('f-val') && n('f-val') * 1e6,
      listed: $('f-listed').checked, loan: $('f-loan').checked, name: v('f-name') };
  },
  clearSearch() { filters = {}; },
  shortlist(id) { toggleShortlist(s, id); },
  assign(k, el) {
    if (!el.value) { recall(s, k); msg = 'Scout recalled.'; return; }
    const [kind, id] = el.value.split(':');
    msg = assign(s, k, id === undefined ? { kind } : { kind, id: +id }) || 'Scout sent.';
  },
  staff(_, el) { msg = setStaff(s, el.dataset.field, +el.value) || 'Staff changed.'; },
  promote(id) { msg = promote(s, id, MAX_SQUAD) || 'Promoted to the first team.'; },
  releaseYouth(id) { msg = release(s, id) || 'Released.'; if (viewing === id) viewing = null; },
  scoutPlayer(id) { const k = s.scouts.findIndex(x => !x.task); msg = k < 0 ? 'Every scout is busy.' : assign(s, k, { kind: 'player', id }) || `Scout ${k + 1} sent: report in ${TASKS.player.days} days.`; },
  bid(id) { msg = bid(s, id, feeOf(id), ownPay) || 'Bid accepted: he has signed.'; },
  counter(id) { msg = acceptCounter(s, id, ownPay) || 'Deal done: he has signed.'; },
  shares(id, el) { const n = Math.round(+$('pct').value) || 0; msg = trade(s, +$('share-club').value, el.dataset.field === 'sell' ? -n : n) || 'Done.'; },
  loan(id) { msg = loanIn(s, id) || 'He joins on loan.'; },
  listing(id, el) { msg = setListing(s, id, el.value || null) || (el.value ? 'Listed.' : 'Taken off the list.'); },
  acceptOffer(id) { msg = acceptOffer(s, id) || 'Sold.'; },
  rejectOffer(id) { msg = rejectOffer(s, id) || 'Offer rejected.'; },
  counterOffer(id) { msg = counterOffer(s, id, feeOf(id)) || 'They agreed: sold.'; },
  renew(id) { msg = renewContract(s, id) || 'Contract agreed.'; },
  sell(id) { msg = sell(s, id) || 'Sold.'; if (viewing === id) viewing = null; },
};

function render() {
  if (s.me === null && s.career) {
    if (!UNEMPLOYED.includes(tab)) tab = 'Inbox';
    $('info').textContent = `Out of work · reputation ${s.career.rep} · Season ${s.season}`;
    const main = `<div class="msg" role="status">${msg}</div>` + outOfWork() + views[tab](); // first: the inbox marks what it shows as read
    $('nav').innerHTML = UNEMPLOYED.map(navButton).join('') + '<button data-act="reset">New game</button>';
    $('main').innerHTML = main;
    msg = '';
    return;
  }
  if (s.me === null) {
    $('info').textContent = 'Pick a club to manage';
    $('nav').innerHTML = '';
    $('main').innerHTML = s.divisions.map(d => `<h2>${esc(d.name)}</h2><div class="grid">${d.clubIds.map(id => `<button data-act="start" data-id="${id}">${badge(id, 24)}${clubName(id)}</button>`).join('')}</div>`).join('');
    return;
  }
  $('info').innerHTML = `${badge(s.me, 22)}${clubName(s.me)} · ${esc(s.divisions[myClub(s).div].name)} · Season ${s.season} · ${s.done ? 'season over' : dateLabel(s.days[s.next].day)} · Transfers ${money(s.budget)} · Wages ${perWeek(wageBill(myClub(s)))} of ${perWeek(s.wageBudget)}`;
  if (s.live) tab = 'Match'; // the other screens wait for the final whistle
  const main = `<div class="msg" role="status">${msg}</div>` + profile() + views[tab](); // first: the inbox marks what it shows as read
  $('nav').innerHTML = (s.live ? ['Match'] : Object.keys(views)).map(navButton).join('') + '<button data-act="reset">New game</button>';
  $('main').innerHTML = main;
  msg = '';
}

function dispatch(e) {
  const el = e.target.closest('[data-act]');
  if (!el || (e.type === 'click') === (el.tagName === 'SELECT')) return; // selects act on change, everything else on click
  actions[el.dataset.act](+el.dataset.id, el);
  render(); // before save: the Inbox marks items read as it draws
  save();
}
document.addEventListener('click', dispatch);
document.addEventListener('change', dispatch);
render();
