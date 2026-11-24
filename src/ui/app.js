import { POS, ATTRS, ALL_ATTRS, overall, value, RETIRE_AGE, displayName, declineAge, SIG_MAX } from '../player.js';
import { TIERS, STAR, OWN_DISCOUNT, available as legendsOnOffer, signLegend, projectStar } from '../legends.js';
import { available, formAvg, moraleLabel, YELLOW_LIMIT } from '../squad.js';
import { FOCUS, INTENSITY, LOADS, setTraining, setFocus, setLoad } from '../training.js';
import { createWorld } from '../world.js';
import { FORMATIONS, BENCH, slots, autoPick, fixLineup, swap } from '../lineup.js';
import { takeClub, myClub, myFixture, upcoming, kickOff, playDay, table, zone, endSeason, forceRetire } from '../season.js';
import { dateLabel } from '../calendar.js';
import { CUP_NAME, cupRoundName, aggregate } from '../cup.js';
import { ranking, SAVE_PRIOR } from '../awards.js';
import { stepMinute, substitute, swapPositions, emptySlots, moveTo, setFormation, setLiveTactic, preview, subLimit } from '../match.js';
import { TEAM, TEAM_KEYS, TEAM_NAMES, ROLES, DUTIES, INSTR, TAKERS, setTeam, setSlot, setTaker } from '../tactics.js';
import { line } from './commentary.js';
import { buy, sell, bid, acceptCounter, talksOn, loanIn, setListing, acceptOffer, rejectOffer, counterOffer, MAX_SQUAD } from '../transfers.js';
import { SUMMER_END, JANUARY, QUICK_SALE, inWindow, windowOpen, justJoined, asking, signingFee, refusal, loanable, loanPay } from '../market.js';
import { KEY, SLOTS, slotKey, serialize, deserialize } from '../save.js';
import { TASKS, taskDays, estimate, ranges, assign, recall, toggleShortlist, searchPlayers } from '../scouting.js';
import { AREAS, COACHING, MEDICAL, SCOUTS, SCOUT_SPEED, setStaff } from '../staff.js';
import { YOUTH_MAX, LEAVE_AGE, ceilingRange, promote, release } from '../youth.js';
import { rankPrize, PAID_RANKS, wage, wageBill, projection, staffBill, STAFF_COST, STANDARD, SHARE, clubValue, stake, gate, STADIUM, stadiumCost, buildStadium } from '../finance.js';
import { terms, canRenew, autoRenewOn, renew as renewContract } from '../contracts.js';
import { MIN_GAMES, ASK, REP, BONUS, SEVERANCE, bands, leagueTarget, cupTarget, level, startCareer, acceptJob, declineJob, openOffer, askBoard, sackLine, salaryFor, trade } from '../career.js';
import { crestSvg, kitSvg } from './art.js';
import { sortRows, nextSort, sortHead } from './table.js';
import { pitchLayout, ballAt, awayKit, W as PW, H as PH } from './pitch.js';

// The UI is the only place allowed to touch Date, localStorage and the DOM.
const newWorld = () => createWorld(Date.now() >>> 0);
// Stored saves are gzipped (about 7x smaller: a save is ~1 MB of JSON, browsers allow ~5 MB per site) and kept as
// base64 behind a 'gz:' mark. Text without the mark is an older plain save and loads as it is. Exports stay plain JSON.
const stream = (data, t) => new Response(new Blob([data]).stream().pipeThrough(t));
const toB64 = bytes => { let b = ''; for (let i = 0; i < bytes.length; i += 0x8000) b += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(b); };
const pack = async text => 'gz:' + toB64(new Uint8Array(await stream(text, new CompressionStream('gzip')).arrayBuffer()));
const unpack = async stored => stored?.startsWith('gz:') ? stream(Uint8Array.from(atob(stored.slice(3)), c => c.charCodeAt(0)), new DecompressionStream('gzip')).text() : stored;
const readSave = async key => { try { return deserialize(await unpack(localStorage.getItem(key))); } catch { return null; } };
const STORAGE_FAIL = 'Could not save: browser storage is full or blocked. Export the game from the Menu to keep it.';
// The state is captured now; writes run one after another, so an older save never lands last.
// ponytail: an action in the last ~50 ms before the tab closes can miss the autosave (compression is async).
let writing = Promise.resolve();
const write = (key, text) => { const p = writing.then(async () => localStorage.setItem(key, await pack(text))); writing = p.catch(() => {}); return p; };
export const save = () => write(KEY, serialize(s)).catch(() => { msg = STORAGE_FAIL; render(); });

let s = (await readSave(KEY)) || newWorld();
let tab = 'Squad', tableView = 'Table', legendPos = 'All', sel = null, viewing = null, clubOpen = null, savesOpen = false, tableDiv = s.me === null ? 0 : s.clubs[s.me].div, msg = '', filters = {}; // filters: the player search on Transfers
let ownPay = false; // Transfers: pay fees from the manager's own money
let timer = null, speed = 400, subOut = null, subIn = null; // live match: clock, ms per match minute, player picked to come off / to come on
let tacticsOpen = false; // live match on a phone: formation and team instructions folded away until asked for
const SPEEDS = [['Slow', 1000], ['Normal', 400], ['Fast', 100], ['Very fast', 25]];

const $ = id => document.getElementById(id);
// Real names contain characters such as & and ' — escape everything taken from data.
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '€' + (n / 1e6).toFixed(2) + 'M';
const perWeek = n => `€${n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n < 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n / 1e3) + 'k'}/wk`;
const termsText = t => `${perWeek(t.wage)} for ${t.years ? `${t.years} season${t.years > 1 ? 's' : ''}` : 'the rest of this season'}${t.clause ? ` · release clause ${money(t.clause)}` : ''}`;
const untilText = p => !p.contract ? '–' : p.loan ? `on loan from ${clubName(p.loan.from)}` : p.contract.until === s.season ? '<span class="oop">ends this season</span>' : `season ${p.contract.until}`;
const byPos = list => [...list].sort((a, b) => POS.indexOf(a.pos) - POS.indexOf(b.pos) || overall(b) - overall(a));
// Column sorts for the squad lists. Each table keeps its own sort in the UI (not in the career); none means the default order.
const sorts = {};
const order = (table, cols, list, dflt) => sorts[table] && cols[sorts[table].key] ? sortRows(list, { get: cols[sorts[table].key] }, sorts[table].dir) : dflt(list);
// heads(table, [[label, key, class]]): a column without a key is a plain header.
const heads = (table, cols) => cols.map(([l, k, c = '']) => k ? sortHead(l, table, k, sorts[table], c) : `<th class="${c}">${l}</th>`).join('');
// Own players: true values are known. Ceiling sorts on the coaches' shown range.
const SORT_COLS = { name: p => p.name, pos: p => POS.indexOf(p.pos), age: p => p.age, ovr: p => overall(p), value: p => value(p), gain: p => p.gain ?? 0, wage: p => p.contract?.wage ?? 0, until: p => p.contract?.until ?? 0, clause: p => p.contract?.clause ?? 0, ceil: p => ceilingRange(s, p).reduce((a, b) => a + b) };
const squadOrder = (table, list) => order(table, SORT_COLS, list, byPos);
// Other clubs' players, as { p, c, e }: sort on the estimate shown, never the true values (the fog rule).
const EST_COLS = { name: x => x.p.name, pos: x => POS.indexOf(x.p.pos), age: x => x.p.age, ovr: x => x.e.ovr[0] + x.e.ovr[1], value: x => x.e.value[0] + x.e.value[1], known: x => x.e.k, club: x => x.c?.name ?? '' };
const estOrder = (table, list) => order(table, EST_COLS, list, l => l);
const estHead = (table, club) => heads(table, [['Name', 'name'], ...(club ? [['Club', 'club']] : []), ['Pos', 'pos'], ['Age', 'age', 'n'], ['Ovr', 'ovr', 'n'], ['Value', 'value', 'n'], ['Known', 'known', 'n']]);
const squadHead = table => heads(table, [['Name', 'name'], ['Pos', 'pos'], ['Age', 'age', 'n'], ['Ovr', 'ovr', 'n'], ['Value', 'value', 'n']]);
// "tackling +2, pace −1": what he improved and lost this season (p.gains and p.losses, training.js).
const gainsText = p => [...Object.entries(p.gains || {}).map(([k, n]) => `${label(k)} +${n}`), ...Object.entries(p.losses || {}).map(([k, n]) => `${label(k)} −${n}`)].join(', ');
const netChange = (p, k) => (p.gains?.[k] || 0) - (p.losses?.[k] || 0);
const label = k => k.replace(/[A-Z]/g, c => ' ' + c.toLowerCase());
const clubName = id => esc(s.clubs[id].name);
const badge = (id, size = 20) => crestSvg(s.clubs[id], size);
const HEAD = '<th>Name</th><th>Pos</th><th class="n">Age</th><th class="n">Ovr</th><th class="n">Value</th>';
// Retirement: at the end of a season he is RETIRE_AGE or older in; flagged a season ahead.
const retires = p => p.age >= RETIRE_AGE ? 'retires at the end of this season' : p.age === RETIRE_AGE - 1 ? 'retires at the end of next season' : '';
// Star points he would earn when he retires from your club (see Legends): '' if none.
const starNote = p => { const n = retires(p) ? projectStar(s, p, p.age >= RETIRE_AGE ? 0 : 1) : 0; return n ? `gives ${n} Star point${n === 1 ? '' : 's'}` : ''; };
// Star points for retiring your player p right now (Retire him): a star's projectStar, any other player STAR.retiree; 0 with no career.
const retireNow = p => !s.career || !myClub(s)?.players.includes(p) || p.loan ? 0 : projectStar(s, p, 0) || STAR.retiree;
const starPts = n => `${n} Star point${n === 1 ? '' : 's'}`;
const ageCell = p => retires(p) ? `<span class="${p.age >= RETIRE_AGE ? 'oop' : 'dim'}" title="${retires(p)}${starNote(p) ? ' · ' + starNote(p) : ''}">${p.age} ⏳${starNote(p) ? ` ★${starNote(p).match(/\d+/)[0]}` : ''}</span>` : p.age;
const cells = p => `<td>${p.pos}</td><td class="n">${ageCell(p)}</td><td class="n">${overall(p)}</td><td class="n">${money(value(p))}</td>`;
const nameBtn = (p, act) => `<td><button class="link" data-act="${act}" data-id="${p.id}">${esc(displayName(p))}</button>${p.mine ? ' <span role="img" title="yours: bought with your own money" aria-label="yours">💼</span>' : ''}</td>`;
const outFor = d => d === 1 ? '1 day' : d < 14 ? `${d} days` : `${Math.round(d / 7)} weeks`;
const status = p => p.inj ? `${esc(p.inj.name)}, ${outFor(p.inj.days)}` : p.ban ? `banned for ${p.ban} match${p.ban > 1 ? 'es' : ''}`
  : p.yc % YELLOW_LIMIT === YELLOW_LIMIT - 1 ? '🟨 one more yellow is a ban' : '';
const SQUAD_HEAD = '<th class="n" title="condition, and its change since your last match">Cond</th><th>Morale</th><th class="n">Form</th><th>Status</th>';
// Condition gained (or lost) since the end of your last match: how fast each player recovers.
const condDelta = p => { const was = s.condAt?.[p.id], d = was === undefined ? 0 : Math.round(p.cond - was);
  return d ? ` <span class="delta ${d > 0 ? 'gain' : 'loss'}" title="since your last match">${d > 0 ? '+' : '−'}${Math.abs(d)}</span>` : ''; };
const squadCells = p => `<td class="n">${p.cond}%${condDelta(p)}</td><td>${moraleLabel(p.morale)}</td><td class="n">${formAvg(p) ?? '–'}</td><td class="${available(p) ? 'dim' : 'oop'}">${status(p)}</td>`;
// The human club's new injuries and bans from the day just played.
const cupGoal = k => { const r = cupRoundName(k, s.clubs.length); return /^Round/.test(r) ? `${CUP_NAME} ${r.toLowerCase()}` : `the ${CUP_NAME} ${r.toLowerCase()}`; };
// The paid rankings: as named in a sentence, and as a title in History.
const RANK_NAME = { goals: 'scorers', assists: 'assists', points: 'goals + assists', cs: 'clean sheets', save: 'save %' };
const RANK_TITLE = { goals: 'Scorers', assists: 'Assists', points: 'Goals + assists', cs: 'Clean sheets', save: 'Save %' };
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
  ranking: n => `${n.place ? '🥈' : '🏆'} ${esc(n.name)} finished ${ordinal(n.place + 1)} in the ${esc(s.divisions[n.div]?.name ?? '')} ${RANK_NAME[n.key] ?? n.key} ranking (${n.v}${n.key === 'save' ? '%' : ''}). ${clubName(n.club)} receive ${money(n.amount)}; your bonus is ${money(n.bonus)}.`,
  retired: n => `🎖️ ${esc(n.name)} retires from ${clubName(n.club)}: ${n.seasons} season${n.seasons === 1 ? '' : 's'} at the club, ${n.awards} award${n.awards === 1 ? '' : 's'}. +${n.points} Star points (see Legends).`,
  renewed: n => `📝 Contracts renewed automatically: ${n.names.map(esc).join(', ')}.`,
  aiLegend: n => `⭐ ${clubName(n.club)} have signed a young ${esc(n.name)} ★ from their academy.`,
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
// The rules of a screen, folded away until wanted.
const help = (text, title = 'How it works') => `<details class="help"><summary>${title}</summary><p>${text}</p></details>`;
// Two clubs either side of a big middle (score, or 'v'), with a line underneath.
const scoreboard = (h, a, mid, sub = '') => `<div class="scoreboard" role="group" aria-label="${esc(`${s.clubs[h].name} ${mid === 'v' ? 'versus' : mid.replace('–', 'to')} ${s.clubs[a].name}${sub ? ', ' + sub.replace(/<[^>]+>/g, '').replace(/(\d+)'/, 'minute $1') : ''}`)}"><div>${badge(h, 40)}<b>${clubName(h)}</b></div>
  <div><span class="big">${mid}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div><div>${badge(a, 40)}<b>${clubName(a)}</b></div></div>`;
// A [lo, hi] estimate as text: one number when known exactly.
const span = ([lo, hi], f = String) => lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`;
const moneySpan = ([lo, hi]) => lo === hi ? money(lo) : `€${(lo / 1e6).toFixed(2)}–${(hi / 1e6).toFixed(2)}M`;
const scale = (x, [lo, hi], v) => [lo, hi].map(e => Math.round(x * e / v / 1e4) * 1e4); // a price that moves with value, over the value estimate
// Cells for a player you may not know fully: position, age, overall and value as estimates, knowledge.
const estCells = (p, e) => `<td>${p.pos}</td><td class="n">${ageCell(p)}</td><td class="n">${span(e.ovr)}</td><td class="n">${moneySpan(e.value)}</td><td class="n dim">${e.k}%</td>`;
// A club in a narrow column: badge and three-letter code (full name on hover).
const clubCell = c => c ? `<button class="link" data-act="club" data-id="${c.id}" title="${esc(c.name)}" aria-label="${esc(c.name)}">${badge(c.id, 16)} ${esc(c.short)}</button>` : '<span class="dim">free</span>';
const star = (id, name = '') => `<button class="link" data-act="shortlist" data-id="${id}" title="shortlist" aria-label="shortlist ${esc(name)}" aria-pressed="${s.shortlist.includes(id)}">${s.shortlist.includes(id) ? '★' : '☆'}</button>`;
const taskText = t => t.kind === 'free' ? 'the free agents' : t.kind === 'division' ? esc(s.divisions[t.id].name) : t.kind === 'club' ? clubName(t.id)
  : esc(allPlayers().find(p => p.id === t.id)?.name ?? 'a player who has gone');
const options = (pairs, current) => pairs.map(([v, text]) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(text)}</option>`).join('');
const fieldSelect = (act, field, pairs, current, id = '') => `<select data-act="${act}" data-field="${field}"${id === '' ? '' : ` data-id="${id}"`}>${options(pairs, current)}</select>`;
const levels = key => TEAM[key].map((text, k) => [k - (TEAM[key].length >> 1), text]);
// One select per team instruction; t is s.tactics or a live side's tac.
const teamSelects = (act, t) => TEAM_KEYS.map(k => `<label>${TEAM_NAMES[k]} ${fieldSelect(act, k, levels(k), t[k])}</label>`).join('');
const formationSelect = (act, current) => `<select data-act="${act}">${Object.keys(FORMATIONS).map(f => `<option${f === current ? ' selected' : ''}>${f}</option>`).join('')}</select>`;

// Live feed: what matters stands out (goals, cards, injuries, substitutions); shots are background.
const FEED = { goal: ['⚽', 'goal'], yellow: ['🟨', 'big'], red: ['🟥', 'big sent'], injury: ['🚑', 'big'], sub: ['🔁', 'big'], extra: ['⏱️', 'big'], save: ['🧤', 'dim'], miss: ['💨', 'dim'] };
// The live pitch: both teams in their shape, the ball with the player in the latest event. Club colours come
// from the data; the away side wears its second colour when the first looks like the home side's.
// ponytail: redrawn each minute, so the ball jumps rather than glides; dots are not clickable (the table below is).
function pitchSvg(m, i) {
  const dots = pitchLayout(m.sides), ball = ballAt(dots, m.ev, m.min);
  const [hc, ac] = m.sides.map(S => s.clubs[S.club].colours), kit = [hc, awayKit(hc, ac)];
  const box = x => `<rect x="${x}" y="${(PH - 40.3) / 2}" width="16.5" height="40.3"/><rect x="${x ? x + 11 : 0}" y="${(PH - 18.3) / 2}" width="5.5" height="18.3"/>`;
  const dot = d => { const p = m.pl[d.id], [fill, rim] = kit[d.side];
    return `<g><circle cx="${d.x}" cy="${d.y}" r="2.4" fill="${fill}" stroke="${d.id === subOut ? 'var(--accent)' : rim}" stroke-width="${d.id === subOut ? 0.9 : 0.5}"/>
      <text x="${d.x}" y="${d.y + 4.8}" class="pn${d.side === i ? ' mine' : ''}">${esc(p.name.split(' ').at(-1))}</text><title>${esc(p.name)} (${d.pos})</title></g>`; };
  const holder = ball.id === null ? 'the centre spot' : esc(m.pl[ball.id].name);
  return `<svg class="pitch" viewBox="-2 -2 ${PW + 4} ${PH + 4}" role="img" aria-label="Pitch. Ball: ${holder}">
    <g class="lines"><rect x="0" y="0" width="${PW}" height="${PH}"/><line x1="${PW / 2}" y1="0" x2="${PW / 2}" y2="${PH}"/><circle cx="${PW / 2}" cy="${PH / 2}" r="9.15"/>${box(0)}${box(PW - 16.5)}</g>
    ${dots.map(dot).join('')}<circle class="ball" cx="${ball.x + (ball.id === null ? 0 : 2)}" cy="${ball.y - (ball.id === null ? 0 : 2)}" r="1.1"/></svg>`;
}

function liveView() {
  const m = s.live, i = mySide(), S = m.sides[i], [H, A] = m.sides;
  const feed = [...m.ev].reverse().map(e => { const [icon, cls] = FEED[e.type] ?? ['', 'dim'], mine = e.side === i ? ' mine' : '';
    return `<div class="${cls}${mine}">${icon} ${esc(line(e, s.clubs[m.sides[e.side].club].short))}</div>`; }).join('');
  const btn = (act, id, text) => m.done ? '' : `<button data-act="${act}" data-id="${id}">${text}</button>`;
  const name = id => m.done ? esc(m.pl[id].name) : `<button class="link" data-act="pickOn" data-id="${id}">${esc(m.pl[id].name)}</button>`;
  // A picked player lights up the other side's players for his position: the bench's for a player on the pitch, the slots for a sub.
  const want = subOut !== null ? S.on.find(o => o.id === subOut)?.pos : subIn !== null ? m.pl[subIn].pos : null;
  const onRow = o => { const p = m.pl[o.id]; return `<tr class="${subOut === o.id ? 'sel' : subIn !== null && o.pos === want ? 'fits' : ''}"><td class="${o.pos !== p.pos ? 'oop' : ''}">${o.pos}</td><td>${name(o.id)}${p.yc ? ' 🟨' : ''}${p.inj ? ' <span class="oop">🚑 injured</span>' : ''}</td><td class="n">${overall(p)}</td><td class="n">${Math.round(p.fit)}%</td><td class="n">${p.rt.toFixed(1)}</td><td>${btn('off', o.id, 'Off')}</td></tr>`; };
  const sentRow = id => { const p = m.pl[id]; return `<tr class="out"><td>–</td><td>${esc(p.name)} <span class="oop">🟥 sent off</span></td><td class="n">${overall(p)}</td><td></td><td class="n">${p.rt.toFixed(1)}</td><td></td></tr>`; };
  const emptyRow = pos => `<tr class="out"><td>${pos}</td><td class="dim">empty</td><td></td><td></td><td></td><td>${m.done ? '' : `<button data-act="moveTo" data-field="${pos}">Move here</button>`}</td></tr>`;
  const benchRow = id => { const p = m.pl[id]; return `<tr class="${subIn === id ? 'sel' : subOut !== null && p.pos === want ? 'fits' : ''}"><td class="dim">${p.pos}</td><td>${m.done ? esc(p.name) : `<button class="link" data-act="on" data-id="${id}">${esc(p.name)}</button>`}</td><td class="n">${overall(p)}</td><td class="n">${Math.round(p.fit)}%</td><td></td><td>${btn('on', id, 'On')}</td></tr>`; };
  const hint = subIn !== null ? `${esc(m.pl[subIn].name)} picked: click the player he replaces.`
    : subOut === null ? 'Click a player, then another to swap positions, or a sub to bring on.' : `${esc(m.pl[subOut].name)} picked: click another player to swap positions, Move here to fill an empty slot, or a sub to replace him.`;
  const controls = m.done ? '<button class="primary" data-act="play">Continue</button>'
    : `<button class="primary" id="clock" data-act="${timer ? 'pause' : 'go'}">${timer ? 'Pause' : m.min ? 'Resume' : 'Kick off'}</button>
      <label>Speed <select data-act="speed">${SPEEDS.map(([t, ms]) => `<option value="${ms}"${ms === speed ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <button data-act="play">Skip to result</button>
      <button class="tac-toggle" data-act="tactics" aria-expanded="${tacticsOpen}">Tactics ${tacticsOpen ? '▴' : '▾'}</button></div>
      <div class="bar tactics${tacticsOpen ? ' open' : ''}"><label>Formation ${formationSelect('liveFormation', S.formation)}</label>${teamSelects('liveTeam', S.tac)}`;
  return `${scoreboard(H.club, A.club, `${H.st.goals} – ${A.st.goals}`, m.done ? (m.min > 90 ? 'Full time (aet)' : 'Full time') : m.min > 90 ? `ET ${m.min}'` : m.min ? `${m.min}'` : 'Kick-off')}<div class="bar">${controls}</div>
    <div class="live"><div>${pitchSvg(m, i)}<div class="feed" aria-live="polite">${feed || '<div class="dim">The teams are walking out.</div>'}</div></div>
    <div>${m.done ? '' : `<p class="dim">${hint}</p>`}<div class="wrap"><table><tr><th>Pos</th><th>On the pitch</th><th class="n">Ovr</th><th class="n">Fit</th><th class="n">Rating</th><th></th></tr>${S.on.map(onRow).join('')}${emptySlots(m, i).map(emptyRow).join('')}${(S.sent ?? []).map(sentRow).join('')}
    <tr><th colspan="6">Bench · substitutions ${S.subs}/${subLimit(m)}</th></tr>${S.bench.map(benchRow).join('')}</table></div></div></div>`;
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
  return agg + (r.aet ? ' · after extra time' : '') + (r.pens ? ` · ${r.pens[0]}–${r.pens[1]} on penalties` : '');
}
const scoreLine = r => `${clubName(r.h)} ${r.hg} – ${r.ag} ${clubName(r.a)}${koNote(r) ? `<span class="dim">${koNote(r)}</span>` : ''}`;

function report(r) {
  const icon = { goal: '⚽', yellow: '🟨', red: '🟥' }, key = r.ev.filter(e => icon[e.type]);
  const total = r.stats[0].poss + r.stats[1].poss;
  const stat = (name, f) => `<tr><td class="n">${f(r.stats[0])}</td><td>${name}</td><td class="n">${f(r.stats[1])}</td></tr>`;
  const mine = r.ratings.filter(x => x.side === (r.h === s.me ? 0 : 1)), best = r.ratings[0];
  return `<h2>Last match</h2>${scoreboard(r.h, r.a, `${r.hg} – ${r.ag}`, esc(compLabel(r.item)) + koNote(r))}
    ${key.map(e => `<div>${e.min}' ${icon[e.type]} ${esc(e.name)}${e.kind === 'pen' ? ' (pen)' : ''}${e.assistName ? ` <span class="dim">(assist ${esc(e.assistName)})</span>` : ''} <span class="dim">— ${clubName(e.side ? r.a : r.h)}</span></div>`).join('') || '<div class="dim">No goals or cards.</div>'}
    <div class="wrap"><table class="stats"><tr><th class="n">${esc(s.clubs[r.h].short)}</th><th></th><th class="n">${esc(s.clubs[r.a].short)}</th></tr>
    ${stat('Possession', st => Math.round(st.poss / total * 100) + '%')}${stat('Shots', st => st.shots)}${stat('On target', st => st.on)}${stat('Fouls', st => st.fouls)}${stat('Yellow cards', st => st.yc)}${stat('Red cards', st => st.rc)}</table></div>
    <p>Player of the match: <b>${esc(best.name)}</b> (${best.rt.toFixed(1)}, ${clubName(best.side ? r.a : r.h)})</p>
    <h3>Your ratings</h3><div class="wrap"><table class="narrow">${mine.map(x => `<tr><td>${esc(x.name)}</td><td class="n">${x.rt.toFixed(1)}</td></tr>`).join('')}</table></div>`;
}

const stopClock = () => { clearInterval(timer); timer = null; };
const startClock = () => { stopClock(); timer = setInterval(tick, speed); };
function tick() {
  const m = s.live;
  if (!m || m.done) return stopClock();
  const seen = m.ev.length, i = mySide();
  stepMinute(m);
  if (subOut !== null && !m.sides[i].on.some(o => o.id === subOut)) subOut = null;
  if (subIn !== null && !m.sides[i].bench.includes(subIn)) subIn = null;
  if (m.done) stopClock();
  if (m.ev.slice(seen).some(e => e.side === i && (e.type === 'injury' || e.type === 'red'))) { stopClock(); msg = 'Play paused: make a change if you need one.'; }
  if (m.ev.slice(seen).some(e => e.type === 'extra')) { stopClock(); msg = 'All square after 90 minutes: extra time, with one more substitution.'; }
  if (!timer || m.min % 5 === 0) save();
  const news = m.ev.slice(seen).filter(e => FEED[e.type] && FEED[e.type][1] !== 'dim').map(e => esc(line(e, s.clubs[m.sides[e.side].club].short)));
  if (m.done) news.push(`Full time: ${esc(s.clubs[m.sides[0].club].name)} ${m.sides[0].st.goals}, ${esc(s.clubs[m.sides[1].club].name)} ${m.sides[1].st.goals}.`);
  if (news.length) pendingSay = news.join(' ');
  if (!timer || document.activeElement?.tagName !== 'SELECT') render(); // ponytail: routine ticks skip a redraw so an open dropdown survives; a tick that stopped the clock (full time, pause) always renders
  else if (pendingSay) { say(pendingSay); pendingSay = ''; }
}

// Rounds of knockout ties: [[title, ties], ...].
const knockout = rounds => rounds.map(([title, ties]) => `<h3>${esc(title)}</h3><div class="wrap"><table>${ties.map(t => `<tr class="${t.h === s.me || t.a === s.me ? 'me' : ''}">
  <td class="${t.w === t.h ? 'win' : ''}">${clubName(t.h)}</td><td class="n">${t.legs.length ? aggregate(t).join(' – ') : 'v'}</td><td class="${t.w === t.a ? 'win' : ''}">${clubName(t.a)}</td>
  <td class="dim">${t.pens ? `${t.aet ? 'aet, ' : ''}${t.pens[0]}–${t.pens[1]} pens` : t.aet ? 'aet' : t.legs.length > 1 ? 'agg.' : ''}</td></tr>`).join('')}</table></div>`).join('');

// Potential: the overall he could reach (see ceiling in youth.js), as your coaches judge it; only for
// players you know fully, and never below what he is now.
const potential = (p, e) => {
  if (e.k < 100 || s.me === null) return '<b>?</b>';
  const [lo, hi] = ceilingRange(s, p), now = overall(p);
  const txt = span([Math.max(lo, now), Math.max(hi, now)]);
  return p.age >= declineAge(p) ? `<s style="opacity:.6" title="past his peak: he declines from here, so this is out of reach">${txt}</s>` : `<b>${txt}</b>`;
};
// The player's league season so far, with his place in his division's top 20 of scorers and assists.
function seasonLine(p, c) {
  if (!p.stats || !c) return '';
  const place = key => { const k = ranking(s, c.div, key).findIndex(x => x.id === p.id); return k < 0 ? '' : ` <span class="dim">(${ordinal(k + 1)})</span>`; };
  return `<p>This season: ${p.stats.apps} league game${p.stats.apps === 1 ? '' : 's'} · ${p.stats.goals} goal${p.stats.goals === 1 ? '' : 's'}${place('goals')} · ${p.stats.assists} assist${p.stats.assists === 1 ? '' : 's'}${place('assists')}</p>`;
}
// A club name that opens its profile.
const clubLink = (id, size = 16) => `<button class="link" data-act="club" data-id="${id}">${badge(id, size)} ${clubName(id)}</button>`;

// Player profile: a screen of its own, opened from any name. Read-only: actions live on their screens, linked from here.
// ponytail: season stats only; career totals need a field kept across seasons (a save migration), add if wanted.
export function playerView(id) {
  const p = allPlayers().find(x => x.id === id);
  if (!p) { viewing = null; return '<p class="dim">That player has gone.</p>'; }
  const c = clubOfPlayer(p), e = estimate(s, p, c), r = e.k < 100 ? ranges(s, p, c) : null, mine = c?.id === s.me;
  const shown = k => r ? span(r[k]) : p.attrs[k], high = k => (r ? r[k][0] : p.attrs[k]) >= 15;
  const group = ([title, keys]) => `<h3>${title}</h3>` + keys.map(k => `<div><span>${label(k)}${p.sig?.includes(k) ? ' <span title="signature attribute: grows to ' + SIG_MAX + '">★</span>' : ''}</span><b class="${high(k) ? 'hi' : ''}">${shown(k)}</b>${netChange(p, k) && c?.id === s.me ? ` <span class="dim" title="net change from training and ageing this season">${netChange(p, k) > 0 ? '+' : '−'}${Math.abs(netChange(p, k))}</span>` : ''}</div>`).join('');
  const known = e.k < 100 ? ` · <span class="dim">known ${e.k}%</span> ${e.ovr[0] < e.ovr[1] && s.scouts.some(x => !x.task) ? `<button data-act="scoutPlayer" data-id="${p.id}">Scout him</button>` : ''}` : '';
  const go = (t, text) => `<button data-act="tab" data-tab="${t}">${text}</button>`;
  const now = retireNow(p), isStar = now && projectStar(s, p, 0);
  const later = isStar && projectStar(s, p, 1); // a season more at the club, if he is still a star then
  const starLine = now ? `<p>${isStar ? `★ <b>A star</b>: retiring from your club now he gives <b>${starPts(now)}</b>${later > now ? `, after another season here ${later}` : ''}.`
    : `<span class="dim">Not a star (the top 10% of his division by overall, or an award winner): retiring he gives ${starPts(now)}.</span>`}</p>` : '';
  const sigLine = p.sig ? `<p>★ Signature attributes: <b>${p.sig.map(label).join(', ')}</b>, growing to ${SIG_MAX} where anyone else stops at 20.</p>` : '';
  const links = s.youth.includes(p) ? go('Youth', 'Youth squad') : mine ? go('Contracts', 'Contract') + go('Transfers', 'Sell or list') + go('Training', 'Training')
    : `<button data-act="findPlayer" data-id="${p.id}">${c ? 'Bid on Transfers' : 'Sign on Transfers'}</button>`;
  return `<div class="attrs"><div class="ph">${mine ? '' : star(p.id, p.name)}<b class="pname">${esc(displayName(p))}</b><span class="dim">${p.pos} · age ${p.age}${retires(p) ? ` <span class="oop">⏳ ${retires(p)}${starNote(p) ? ` · ★ ${starNote(p)}` : ''}</span>` : ''} · ${c ? clubLink(c.id) : 'free agent'} · overall <b>${span(e.ovr)}</b> · potential ${potential(p, e)} · ${moneySpan(e.value)}${known}</span>
    ${mine && !p.loan && !s.youth.includes(p) ? `<button data-act="retire" data-id="${p.id}" title="end his career now">Retire him</button> ` : ''}<button data-act="close">Close</button></div>
    ${sigLine}${starLine}${seasonLine(p, c)}<p>Condition ${p.cond}% · sharpness ${Math.round(p.sharp)}% · morale ${moraleLabel(p.morale)} · form ${formAvg(p) ?? '–'} · ${p.yc} league yellow${p.yc === 1 ? '' : 's'}${status(p) ? ` · <span class="oop">${status(p)}</span>` : ''}${p.contract ? ` · contract ${perWeek(p.contract.wage)} until season ${p.contract.until}${p.contract.clause ? `, release clause ${money(p.contract.clause)}` : ''}` : ''}</p>
    <div class="bar" style="grid-column:1/-1">${links}</div>${Object.entries(ATTRS).map(group).join('')}</div>`;
}

// Honours a club has won, from the season history.
const honoursOf = id => s.history.flatMap(h => [
  ...h.divs.flatMap((x, d) => [x.champion === id && `${esc(s.divisions[d].name)} champions ${h.season}`, x.playoff === id && `${esc(s.divisions[d].name)} play-off winners ${h.season}`]),
  h.cup?.winner === id && `${CUP_NAME} winners ${h.season}`]).filter(Boolean);

// Club profile: badge, league record, finances, squad (estimates for other clubs: the fog rule), deals and honours.
export function clubView(id) {
  const c = s.clubs[id], t = c.st, mine = id === s.me, pos = table(s, c.div).indexOf(id) + 1;
  const last = s.last?.find(r => r.h === id || r.a === id);
  const deals = s.deals.filter(d => d.from === id || d.to === id).slice(-8).reverse().map(d => `<div>${dealText(d)}</div>`).join('');
  const squad = mine ? squadOrder('club', c.players).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}</tr>`).join('')
    : estOrder('club', byPos(c.players).map(p => ({ p, c, e: estimate(s, p, c) }))).map(({ p, e }) => `<tr>${nameBtn(p, 'view')}${estCells(p, e)}</tr>`).join('');
  const honours = honoursOf(id);
  return `<div class="ph club">${crestSvg(c, 56)}${kitSvg(c.kit, 56)}<b>${esc(c.name)}</b><button data-act="close" style="margin-left:auto">Close</button></div>
    <p>${esc(s.divisions[c.div].name)} · ${ordinal(pos)} · P ${t.p} W ${t.w} D ${t.d} L ${t.l} · goals ${t.gf}–${t.ga} · ${t.pts} pts${last ? ` · latest: ${scoreLine(last)}` : ''}</p>
    <p>Balance ${money(c.fin.balance)} · wage bill ${perWeek(wageBill(c))} · expected income ${money(projection(s, c))} a season · club value ${money(clubValue(s, c))}</p>
    ${mine ? '' : `<div class="bar"><button data-act="browse" data-id="${id}">Browse their players on Transfers</button></div>`}
    <h2>Squad (${c.players.length})</h2><div class="wrap"><table><tr>${mine ? squadHead('club') : estHead('club')}</tr>${squad}</table></div>
    <h2>Honours</h2>${honours.map(x => `<div>🏆 ${x}</div>`).join('') || '<p class="dim">None in this save yet.</p>'}
    <h2>Deals this season</h2>${deals || '<p class="dim">None yet.</p>'}`;
}

const views = {
  Squad() {
    fixLineup(s);
    const club = myClub(s), pos = slots(s.formation), find = id => club.players.find(p => p.id === id);
    const st = preview({ club, ids: s.lineup, formation: s.formation, bench: s.bench, tactics: s.tactics, fam: s.fam });
    const row = (p, slot) => `<tr class="${sel === p.id ? 'sel' : ''}"><td class="${slot && slot !== p.pos ? 'oop' : 'dim'}">${slot && slot !== p.pos ? '<span class="sr">out of position: </span>' : ''}${slot || (s.bench.includes(p.id) ? 'Sub' : '–')}</td>${nameBtn(p, 'pick')}${cells(p)}${squadCells(p)}<td><button data-act="view" data-id="${p.id}">Profile</button></td></tr>`;
    const reserves = byPos(club.players.filter(p => !s.lineup.includes(p.id) && !s.bench.includes(p.id)));
    return `<div class="club">${crestSvg(club, 56)}${kitSvg(club.kit, 56)}<b>${esc(club.name)}</b></div>
      <div class="bar"><label>Formation ${formationSelect('formation', s.formation)}</label>
      <button data-act="auto">Auto-pick best XI</button><span class="dim">Attack ${st.att.toFixed(1)} · Defence ${st.def.toFixed(1)} · Control ${st.ctrl.toFixed(1)} · knows ${s.formation} ${Math.round(s.fam[s.formation] * 100)}%</span></div>
      ${help(`Click two names to swap them between the XI, the bench and the reserves. Orange slot = playing out of position. Injured and banned players cannot play: the assistant puts someone else in their place, and puts them back once they are fit, unless you move them yourself. Auto-pick picks as if everyone were fit, so the same goes for its choices.`)}
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
      <h2>Formation familiarity</h2><p class="dim">Each match teaches the formations it was played in, by minutes (switching mid-match counts); an unfamiliar one costs up to 3% of the team's strength.</p>
      <div class="bar">${Object.keys(FORMATIONS).map(f => `<span>${f} ${Math.round(s.fam[f] * 100)}%</span>`).join(' · ')}</div>`;
  },
  Training() {
    const t = s.training, pairs = o => Object.keys(o).map(k => [k, k]);
    const focus = p => fieldSelect('focus', 'attr', [['', 'With the team'], ...ALL_ATTRS.map(k => [k, label(k)])], t.ind[p.id] ?? '', p.id);
    const load = p => fieldSelect('load', 'load', [['', 'With the team'], ...LOADS.map(k => [k, k])], t.load[p.id] ?? '', p.id);
    return `<h2>Weekly schedule</h2><div class="bar"><label>Focus ${fieldSelect('trainField', 'focus', pairs(FOCUS), t.focus)}</label>
      <label>Intensity ${fieldSelect('trainField', 'intensity', pairs(INTENSITY), t.intensity)}</label></div>
      ${help(`Each week a player may improve one attribute, never beyond his hidden potential: about four a season at Normal for players aged 23 or under, less with every year after that (about two at 26, one at 29, almost nothing from 31).
      Hard trains faster, but players recover less between matches and get hurt more often; Light is the reverse. Rest stops improvement and speeds recovery.
      Each player can train at his own intensity; a personal Rest means no improvement and no training injuries.
      Keepers always work on goalkeeping. An individual focus takes half of a player's improvement. Players aged 31 and over slowly lose pace, stamina, strength and agility whatever you do.`)}
      <div class="wrap"><table><tr>${sortHead('Name', 'train', 'name', sorts.train)}${sortHead('Pos', 'train', 'pos', sorts.train)}${sortHead('Age', 'train', 'age', sorts.train, 'n')}${sortHead('Ovr', 'train', 'ovr', sorts.train, 'n')}${sortHead('Changed this season', 'train', 'gain', sorts.train, 'n')}<th>Individual focus</th><th>Intensity</th></tr>
      ${squadOrder('train', myClub(s).players).map(p => `<tr>${nameBtn(p, 'view')}<td>${p.pos}</td><td class="n">${ageCell(p)}</td><td class="n">${overall(p)}</td><td>${p.gain || p.losses ? `<b>${p.gain ? '+' + p.gain : ''}</b> <span class="dim">${gainsText(p)}</span>` : ''}</td><td>${focus(p)}</td><td>${load(p)}</td></tr>`).join('')}</table></div>`;
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
        ? scoreboard(f.h, f.a, 'v', `${esc(compLabel(f.item))} · ${venue(f)}`)
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
    // tab name: [ranking key, column head, note]. Keepers' stats count only the league matches played in goal; a clean sheet is one with no goal against.
    const BOARDS = { Scorers: ['goals', 'Goals', ''], Assists: ['assists', 'Assists', ''], 'Goals + assists': ['points', 'G + A', ''],
      'Clean sheets': ['cs', 'Clean sheets', 'Only matches played in goal count; Games is games in goal.'], 'Save %': ['save', 'Rating', `Only matches played in goal count; Games is games in goal. Save % is shots on target saved out of saved plus conceded; keepers are ranked by it weighed with ${SAVE_PRIOR} shots at the league's average, so one great game cannot beat a great season. Keepers with at least half the games played so far.`] };
    const ZONE_TEXT = { up: 'promotion place', playoff: 'play-off place', down: 'relegation place' };
    const cols = ['P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'];
    // Sorting reorders the rows; # and the zone colours stay the real league position.
    const st = id => s.clubs[id].st, LEAGUE_COLS = { pos: x => x.k, club: x => s.clubs[x.id].name, p: x => st(x.id).p, w: x => st(x.id).w, d: x => st(x.id).d, l: x => st(x.id).l, gf: x => st(x.id).gf, ga: x => st(x.id).ga, gd: x => st(x.id).gf - st(x.id).ga, pts: x => st(x.id).pts };
    const row = ({ id, k }) => { const t = s.clubs[id].st; return `<tr class="${id === s.me ? 'me' : ''} ${zone(s, tableDiv, k) || ''}"><td class="n">${k + 1}${ZONE_TEXT[zone(s, tableDiv, k)] ? `<span class="sr"> (${ZONE_TEXT[zone(s, tableDiv, k)]})</span>` : ''}</td><td>${clubLink(id, 18)}</td>${[t.p, t.w, t.d, t.l, t.gf, t.ga, t.gf - t.ga, t.pts].map(v => `<td class="n">${v}</td>`).join('')}</tr>`; };
    const bar = `<div class="bar">${s.divisions.map((d, i) => `<button data-act="div" data-id="${i}" class="${i === tableDiv ? 'on' : ''}">${esc(d.name)}</button>`).join('')}</div>
      <div class="bar">${['Table', ...Object.keys(BOARDS)].map(v => `<button data-act="tableView" data-v="${v}" class="${v === tableView ? 'on' : ''}">${v}</button>`).join('')}</div>`;
    if (tableView !== 'Table') {
      const [key, head, note] = BOARDS[tableView], list = ranking(s, tableDiv, key), paid = PAID_RANKS.includes(key), save = key === 'save';
      const rows = list.map((x, k) => `<tr class="${x.club === s.me ? 'me' : ''}"><td class="n">${k + 1}</td><td><button class="link" data-act="view" data-id="${x.id}">${esc(x.name)}</button></td><td>${badge(x.club, 18)}${clubName(x.club)}</td><td class="n">${x.apps}</td><td class="n"><b>${x.v}${save ? '%' : ''}</b></td><td class="n">${save ? `${x.pct}% <span class="dim">(${x.sv} / ${x.ga})</span>` : (x.v / x.apps).toFixed(2)}</td>${paid ? `<td class="n dim">${k < 3 ? money(rankPrize(key, tableDiv, k)) : ''}</td>` : ''}</tr>`).join('');
      return `${bar}<h2>${tableView} · season ${s.season}</h2>${list.length ? `<div class="wrap"><table><tr><th class="n">#</th><th>Player</th><th>Club</th><th class="n">Games</th><th class="n">${head}</th><th class="n">${save ? 'Save % (saved / conceded)' : 'Per game'}</th>${paid ? '<th class="n">Prize</th>' : ''}</tr>${rows}</table></div>
        <p class="dim">League matches only. ${save ? 'Ties go to the keeper who faced more shots.' : 'Ties go to the player with fewer games.'} ${note}${paid ? ' The top 3 win prize money for their club when the season ends, and you get a bonus for each of yours.' : ' The winner gets an award in History; no prize money.'}</p>` : '<p class="dim">Nobody yet this season.</p>'}`;
    }
    return `${bar}
      <h2>Season ${s.season}</h2><div class="wrap"><table><tr>${heads('league', [['#', 'pos', 'n'], ['Club', 'club'], ...cols.map(c => [c, c.toLowerCase(), 'n'])])}</tr>${order('league', LEAGUE_COLS, table(s, tableDiv).map((id, k) => ({ id, k })), l => l).map(row).join('')}</table></div>
      <p class="dim">${[['up', 'promoted'], ['playoff', 'play-offs'], ['down', 'relegated']].filter(([z]) => s.divisions[tableDiv].clubIds.some((_, k) => zone(s, tableDiv, k) === z)).map(([z, text]) => `<span class="key ${z}"></span>${text}`).join(' ')}</p>
      ${s.playoffs[tableDiv] ? `<h2>Play-offs</h2>${knockout(s.playoffs[tableDiv].rounds.map((rd, k) => [k ? 'Final' : 'Semi-finals', rd.ties]))}` : ''}`;
  },
  Cup() {
    return `<h2>${CUP_NAME} · season ${s.season}</h2>${s.cup ? knockout(s.cup.rounds.map((rd, k) => [cupRoundName(k, s.clubs.length), rd.ties]).reverse()) : '<p class="dim">No cup this season.</p>'}`;
  },
  History() {
    const name = id => id === null ? '—' : clubName(id), names = ids => ids.map(name).join(', ') || '—';
    const podium = (title, list) => list.length ? `<div class="dim">${title}: ${list.map((x, k) => `${ordinal(k + 1)} ${esc(x.name)} (${name(x.club)}, ${x.pct ?? x.v}${x.pct === undefined ? '' : '%'})`).join(' · ')}</div>` : '';
    const award = (title, a, unit) => a ? `<div>${title}: <b>${esc(a.name)}</b> <span class="dim">(${name(a.club)}, ${a.v}${unit})</span></div>` : '';
    const seasons = [...s.history].reverse().map(h => `<h3>Season ${h.season}</h3>
      ${h.pos ? `<p>You finished ${h.pos} in the ${esc(s.divisions[h.div].name)} (prize ${money(h.prize)}).</p>` : ''}
      ${h.fin ? `<div class="dim">Books: income ${money(h.fin.broadcast + h.fin.sponsor + h.fin.gate + h.fin.prize + h.fin.sales)}, wages ${money(h.fin.wages)}, fees ${money(h.fin.fees)} · balance ${money(h.fin.balance)}</div>` : ''}
      ${h.left?.length ? `<div class="dim">Left when their contracts ended: ${h.left.map(esc).join(', ')}</div>` : ''}
      ${h.deals?.length ? `<div class="dim">Your deals: ${h.deals.map(dealText).join(' · ')}</div>` : ''}
      ${h.youthLeft?.length ? `<div class="dim">Left the youth squad at ${LEAVE_AGE}: ${h.youthLeft.map(esc).join(', ')}</div>` : ''}
      ${h.cup ? `<div>${CUP_NAME}: <b>${name(h.cup.winner)}</b> <span class="dim">beat ${name(h.cup.runnerUp)} in the final</span></div>` : ''}
      ${h.divs.map((x, d) => `<div><b>${esc(s.divisions[d].name)}</b> champions: ${name(x.champion)}${x.up.length ? ` · promoted: ${names(x.up)}` : ''}${x.down.length ? ` · relegated: ${names(x.down)}` : ''}</div>
        ${x.awards ? award('Player of the season', x.awards.player, ' avg') + award('Top scorer', x.awards.scorer, ' goals') + award('Top assists', x.awards.assists, ' assists') + award('Goals + assists', x.awards.points, ' G + A') + award('Golden Glove', x.awards.glove, ' clean sheets') + award('Best save %', x.awards.saves, '%') + award('Young player', x.awards.young, ' avg') : ''}
        ${h.ranks?.[d] ? PAID_RANKS.map(key => podium(RANK_TITLE[key], h.ranks[d][key] || [])).join('') : ''}`).join('')}`).join('');
    const rec = (title, r, f) => r ? `<div>${title}: ${f(r)} <span class="dim">(season ${r.season})</span></div>` : '';
    const win = r => `${name(r.h)} ${r.hg} – ${r.ag} ${name(r.a)}`;
    const records = s.divisions.map((dv, d) => `<h3>${esc(dv.name)}</h3>${rec('Most points', s.records[d].points, r => `${r.v}, ${name(r.club)}`)}${rec('Most goals', s.records[d].goals, r => `${r.v}, ${esc(r.name)} (${name(r.club)})`)}${rec('Most assists', s.records[d].assists, r => `${r.v}, ${esc(r.name)} (${name(r.club)})`)}${rec('Biggest win', s.records[d].win, win)}`).join('');
    const club = myClub(s), honours = [];
    for (const h of s.history) {
      h.divs.forEach((x, d) => { if (x.champion === s.me) honours.push(`${esc(s.divisions[d].name)} champions ${h.season}`); if (x.playoff === s.me) honours.push(`${esc(s.divisions[d].name)} play-off winners ${h.season}`); });
      if (h.cup?.winner === s.me) honours.push(`${CUP_NAME} winners ${h.season}`);
    }
    return `<h2>${esc(club.name)}</h2>${honours.map(x => `<div>🏆 ${x}</div>`).join('') || '<p class="dim">No honours yet.</p>'}
      ${rec('Biggest win', club.rec.win, win)}${rec('Most goals in a season', club.rec.goals, r => `${r.v}, ${esc(r.name)}`)}${rec('Most assists in a season', club.rec.assists, r => `${r.v}, ${esc(r.name)}`)}
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
    const found = estOrder('find', searchPlayers(s, filters).map(({ p, c, est: e }) => ({ p, c, e }))).map(({ p, c, e }) => `<tr><td>${star(p.id, p.name)}</td>${nameBtn(p, 'view')}<td>${clubCell(c)}</td>${estCells(p, e)}
      <td class="n">${c ? moneySpan(askSpan(p, c, e)) : moneySpan(scale(signingFee(p), e.value, value(p)))}</td><td>${deal(p, c, e)}</td></tr>`);
    const listed = estOrder('listed', s.clubs.filter(x => x !== me).flatMap(c => c.players.filter(p => p.listed === 'sale').map(p => ({ p, c, e: estimate(s, p, c) }))))
      .map(({ p, c: x, e }) => `<tr>${nameBtn(p, 'view')}<td>${clubLink(x.id)}</td>${estCells(p, e)}<td class="n">${moneySpan(askSpan(p, x, e))}</td></tr>`);
    const listing = p => `<select data-act="listing" data-id="${p.id}">${options([['', 'Not listed'], ['sale', 'For sale'], ...(p.age <= 23 ? [['loan', 'For loan']] : [])], p.listed ?? '')}</select>`;
    const mine = squadOrder('sell', me.players).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td>${p.loan ? `<span class="dim">on loan from ${clubName(p.loan.from)}</span>` : listing(p)}</td>
      <td>${p.loan || justJoined(s, p) ? '' : `<button data-act="sell" data-id="${p.id}">Quick sale ${money(Math.round(QUICK_SALE * value(p) / 1e4) * 1e4)}</button>`}</td></tr>`);
    const away = s.clubs.flatMap(x => x.players.filter(p => p.loan?.from === s.me).map(p => `<tr>${nameBtn(p, 'view')}${cells(p)}<td>at ${clubName(x.id)} until the end of season ${p.loan.until}</td></tr>`));
    const free = order('free', EST_COLS, s.market.map(p => ({ p, c: null, e: estimate(s, p, null) })), l => [...l].sort((a, b) => POS.indexOf(a.p.pos) - POS.indexOf(b.p.pos) || overall(b.p) - overall(a.p))).map(({ p, e }) => { return `<tr><td>${star(p.id, p.name)}</td>${nameBtn(p, 'view')}${estCells(p, e)}<td class="n">${moneySpan(scale(signingFee(p), e.value, value(p)))}</td><td class="dim">${termsText(terms(s, p))}</td><td><button data-act="buy" data-id="${p.id}">Sign</button></td></tr>`; });
    const biggest = s.deals.filter(d => !d.loan && d.from !== null && d.to !== null).sort((a, b) => b.fee - a.fee).slice(0, 10).map(d => `<div>${dealText(d)}</div>`).join('');
    const f = filters, pick = (id, pairs, v) => `<select id="${id}" aria-label="${esc(pairs[0][1].replace('Any ', ''))}">${options(pairs, v ?? '')}</select>`;
    const divPairs = [['', 'Any division'], ...s.divisions.map((d, i) => [String(i), d.name]), ['free', 'Free agents']];
    const clubPairs = [['', 'Any club'], ...s.clubs.filter(c => c.id !== s.me).map(c => [String(c.id), c.name])];
    const num = (id, v, label, w = 5) => `<label>${label} <input type="number" id="${id}" min="0" value="${v ?? ''}" style="width:${w}em"></label>`;
    const search = `<div class="bar">${pick('f-pos', [['', 'Any position'], ...POS.map(x => [x, x])], f.pos)}${pick('f-div', divPairs, f.div)}${pick('f-club', clubPairs, f.club)}
      ${num('f-age', f.maxAge, 'Age ≤')}${num('f-ovr', f.minOvr, 'Ovr ≥')}${num('f-val', f.maxValue ? f.maxValue / 1e6 : '', 'Value ≤ €M')}
      <label><input type="checkbox" id="f-listed"${f.listed ? ' checked' : ''}> listed</label><label><input type="checkbox" id="f-loan"${f.loan ? ' checked' : ''}> loan</label>
      <input type="text" id="f-name" placeholder="name" aria-label="name" value="${esc(f.name ?? '')}" style="width:9em"><button class="primary" data-act="search">Search</button> <button data-act="clearSearch">Clear</button></div>`;
    return `<p><b>${windowText()}</b> · transfer budget ${money(s.budget)} · wage bill ${perWeek(wageBill(me))}</p>
      <p><label><input type="checkbox" data-act="ownPay"${ownPay ? ' checked' : ''}> Pay fees from your own money (${money(s.career?.money ?? 0)})</label> <span class="dim">A player you pay for is yours 💼: the club pays his wages, he follows you to every new job, and when he is sold the fee is yours.</span></p>
      ${help(`Bid for players at other clubs while a window is open: a club takes ${Math.round(0.9 * 100)}% of its asking price or counters, and talks stop after three rounds. Players under 24 who are not regulars can come on loan for half their wage. Free agents sign at any time for a signing-on fee of half their value.`)}
      <h2>Offers for your players</h2>${table(`${HEAD}<th>From</th><th class="n">Fee</th><th></th>`, offers)}
      <h2>Find players</h2><p class="dim">Premier League players are well known. Elsewhere you see estimates until your scouts report (Scouting); ☆ adds a player to your shortlist. Best 60 shown.</p>${search}
      ${table(`<th></th>${estHead('find', true)}<th class="n">Price</th><th>Deal</th>`, found)}
      <h2>Transfer list</h2><p class="dim">Clubs in debt put their best-paid players up for sale, cheaper.</p>${table(`${estHead('listed', true)}<th class="n">Asking</th>`, listed)}
      <h2>Your squad (${me.players.length}/${MAX_SQUAD})</h2><p class="dim">List a player and clubs bid for him during a window. A quick sale gets ${QUICK_SALE * 100}% of his value at once.</p>${table(`${squadHead('sell')}<th>Listing</th><th></th>`, mine)}
      <h2>Out on loan</h2>${table(`${HEAD}<th></th>`, away)}
      <h2>Free agents</h2>${table(`<th></th>${estHead('free')}<th class="n">Signing fee</th><th>Asks</th><th></th>`, free)}
      <h2>Biggest deals this season</h2>${biggest || '<p class="dim">None yet.</p>'}`;
  },
  Contracts() {
    const club = myClub(s);
    const row = p => {
      const t = canRenew(s, p) ? terms(s, p) : null;
      return `<tr>${nameBtn(p, 'view')}<td>${p.pos}</td><td class="n">${ageCell(p)}</td><td class="n">${overall(p)}</td><td class="n">${perWeek(p.contract.wage)}</td><td>${untilText(p)}</td>
        <td class="n">${p.contract.clause ? money(p.contract.clause) : ''}</td><td>${t ? `<span class="dim">asks ${termsText(t)}</span> <button data-act="renew" data-id="${p.id}">Accept</button>` : ''}</td></tr>`;
    };
    return `<h2>Contracts</h2><p>Wage bill ${perWeek(wageBill(club))}.</p>
      <label><input type="checkbox" data-act="autoRenew"${autoRenewOn(s) ? ' checked' : ''}> Renew expiring contracts automatically</label>
      ${help(`A player whose contract ends this season or next names his terms for a new one. With automatic renewal on, he is re-signed on those terms when the season ends (retiring players aside). With it off, accept them yourself or he leaves when his contract ends. If too many leave, academy players fill the squad.`)}
      <div class="wrap"><table><tr>${sortHead('Name', 'contracts', 'name', sorts.contracts)}${sortHead('Pos', 'contracts', 'pos', sorts.contracts)}${sortHead('Age', 'contracts', 'age', sorts.contracts, 'n')}${sortHead('Ovr', 'contracts', 'ovr', sorts.contracts, 'n')}${sortHead('Wage', 'contracts', 'wage', sorts.contracts, 'n')}${sortHead('Until', 'contracts', 'until', sorts.contracts)}${sortHead('Clause', 'contracts', 'clause', sorts.contracts, 'n')}<th>New contract</th></tr>${squadOrder('contracts', club.players).map(row).join('')}</table></div>`;
  },
  Finances() {
    const c = myClub(s), L = c.fin.season, line = (name, v) => `<tr><td>${name}</td><td class="n">${money(v)}</td></tr>`;
    return `<h2>Finances · season ${s.season}</h2>
      <p>Balance <b>${money(c.fin.balance)}</b> · transfer budget ${money(s.budget)} · wage bill ${perWeek(wageBill(c))}</p>
      <div class="wrap"><table><tr><th>Income this season</th><th></th></tr>${line('Broadcasting', L.broadcast)}${line('Sponsorship', L.sponsor)}${line('Gate receipts', L.gate)}${line('Prize money', L.prize)}${line('Player sales', L.sales)}
      <tr><th>Costs this season</th><th></th></tr>${line('Wages', L.wages)}${line('Transfer fees', L.fees)}${line('Staff beyond the standard', L.staff)}${line('Stadium building', L.build)}</table></div>
      <p>Stadium level ${c.stadium} of ${STADIUM.max} · gate ${money(gate(c))} a home match${c.stadium < STADIUM.max ? ` <button data-act="build">Build a stand: ${money(stadiumCost(s, c))}, +${Math.round(STADIUM.boost * 100)}% gate for good</button>` : ''}</p>
      ${help(`Expected income for a mid-table season: ${money(projection(s, c))}. The board sets each season's transfer budget: three quarters of the balance (none in debt). Wages are small and have no limit: they come out of the balance every week, so keep an eye on debt, which the board does not like. You may ask the board for more transfer budget once a season (Board). A bigger stadium earns more at every home game; a stand is paid from the transfer budget and pays for itself in about ${STADIUM.payback} seasons. Each summer the owners take out anything above five seasons of expected income.`)}`;
  },
};

views.Scouting = () => {
  const taskPairs = [['', 'Idle'], ['free', 'Free agents'], ...s.divisions.map((d, i) => ['division:' + i, 'Division: ' + d.name]),
    ...s.clubs.filter(c => c.id !== s.me).map(c => ['club:' + c.id, 'Club: ' + c.name]), ...s.shortlist.map(id => ['player:' + id, 'Player: ' + (allPlayers().find(p => p.id === id)?.name ?? '?')])];
  const taskValue = sc => sc.task ? sc.task.kind === 'free' ? 'free' : `${sc.task.kind}:${sc.task.id}` : '';
  const scouts = s.scouts.map((sc, k) => `<tr><td>Scout ${k + 1}</td><td>${sc.task ? `${taskText(sc.task)} · reports in ${outFor(sc.days)}` : '<span class="dim">idle</span>'}</td>
    <td><select data-act="assign" data-id="${k}">${options(taskPairs.some(([v]) => v === taskValue(sc)) ? taskPairs : [...taskPairs, [taskValue(sc), 'Player: ' + taskText(sc.task)]], taskValue(sc))}</select></td></tr>`).join('');
  const list = estOrder('short', s.shortlist.map(id => allPlayers().find(p => p.id === id)).filter(Boolean).map(p => { const c = clubOfPlayer(p); return { p, c, e: estimate(s, p, c) }; })).map(({ p, c, e }) => {
    return `<tr><td>${star(p.id, p.name)}</td>${nameBtn(p, 'view')}<td>${clubCell(c)}</td>${estCells(p, e)}<td>${e.ovr[0] < e.ovr[1] && s.scouts.some(x => !x.task) ? `<button data-act="scoutPlayer" data-id="${p.id}">Scout</button>` : ''}</td></tr>`;
  });
  const days = Object.entries(TASKS).map(([k, t]) => `${k === 'free' ? 'the free agents' : 'a ' + k}: ${taskDays(s, k)} days, to ${t.level}%`).join(' · ');
  return `<h2>Scouts</h2>${help(`Send a scout to watch a player, a club, a division or the free agents. When he reports, you know everyone he watched: ${days}. What you know fades over two seasons, and Premier League players are always known. Your scouting staff level (Staff) sets how many scouts you have and how fast they work.`)}
    <div class="wrap"><table>${scouts}</table></div>
    <h2>Shortlist</h2>${list.length ? `<div class="wrap"><table><tr><th></th>${estHead('short', true)}<th></th></tr>${list.join('')}</table></div>` : '<p class="dim">Empty: add players with ☆ on Transfers or a profile.</p>'}`;
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
  return `<h2>Staff</h2>${help(`Your club's budget already pays for level ${std} staff in every area (the ${esc(s.divisions[c.div].name)} standard). Each area above it costs the difference every week, and below it saves it; the difference is paid every week.`)}
    <div class="wrap"><table>${AREAS.map(row).join('')}</table></div>
    <p>Beyond the standard: <b>${extra < 0 ? 'saving ' + perWeek(-extra) : perWeek(extra)}</b> · wage bill ${perWeek(wageBill(c))}</p>`;
};

views.Youth = () => {
  const leaving = p => p.legend && p.age >= LEAVE_AGE - 1 ? ` <span class="oop" title="leaves the youth squad at ${LEAVE_AGE} when the season ends">⏳ promote him this season</span>` : '';
  const rows = squadOrder('youth', s.youth).map(p => { const [lo, hi] = ceilingRange(s, p); return `<tr>${nameBtn(p, 'view')}<td>${p.pos}</td><td class="n">${ageCell(p)}${leaving(p)}</td><td class="n">${overall(p)}</td><td class="n">${span([lo, hi])}</td>
    <td><button data-act="promote" data-id="${p.id}">Promote (${perWeek(wage(p))})</button> <button data-act="releaseYouth" data-id="${p.id}">Release</button></td></tr>`; }).join('');
  return `<h2>Youth squad (${s.youth.length}/${YOUTH_MAX})</h2>${help(`Youngsters train every week but play no matches and earn nothing. A new intake arrives each summer; at ${LEAVE_AGE} those still here leave. Ceiling: the overall your coaches think he can reach (better coaching, a closer guess). When contracts end and the first team runs short, the best youth player in the position steps up. Legends ★ (bought with Star points on Legends) know their ceiling and come with you when you change club.`)}
    ${rows ? `<div class="wrap"><table><tr>${heads('youth', [['Name', 'name'], ['Pos', 'pos'], ['Age', 'age', 'n'], ['Ovr', 'ovr', 'n'], ['Ceiling', 'ceil', 'n'], ['']])}</tr>${rows}</table></div>` : '<p class="dim">Empty until the summer intake.</p>'}`;
};

// When a news item happened: 'Season 2, Sat 8 Aug', or 'Season 2, pre-season'.
const when = n => `Season ${n.season}, ${n.day < 0 ? 'pre-season' : dateLabel(n.day)}`;
const unread = () => s.inbox.filter(n => !n.read).length;
const confText = c => `<meter min="0" max="100" low="35" high="60" optimum="100" value="${c.conf}"></meter> ${Math.round(c.conf)}`;

const TIER_NAME = { icon: 'Icon', great: 'Great', star: 'Star' };
views.Legends = () => {
  const c = s.career, pts = c?.stars ?? 0, list = legendsOnOffer(s).filter(e => legendPos === 'All' || e.pos === legendPos)
    .sort((a, b) => TIERS[b.tier].ovr - TIERS[a.tier].ovr || a.cost - b.cost || a.name.localeCompare(b.name));
  const sign = e => s.me === null ? '' : `<button data-act="signLegend" data-name="${esc(e.name)}" ${e.cost > pts || s.youth.length >= YOUTH_MAX ? 'disabled' : ''}>Sign (${e.cost})</button>`;
  const rows = list.map(e => `<tr><td><b>${esc(e.name)} ★</b>${e.own ? ` <span class="dim" title="retired from your club: ${OWN_DISCOUNT} points off">yours</span>` : ''}</td><td>${e.pos}</td><td>${TIER_NAME[e.tier]}</td><td class="dim">${e.sig.map(label).join(', ')}</td><td class="n">${TIERS[e.tier].ovr}</td><td class="n">${e.cost}</td><td>${sign(e)}</td></tr>`).join('');
  const hall = c?.hall?.length ? `<div class="wrap"><table><tr><th>Season</th><th>Name</th><th>Pos</th><th>Club</th><th class="n">Seasons</th><th class="n">Games</th><th class="n">Goals</th><th class="n">Awards</th><th class="n">Ovr</th><th class="n">Points</th></tr>
    ${[...c.hall].reverse().map(h => `<tr><td>${h.season}</td><td><b>${esc(h.name)}</b></td><td>${h.pos}</td><td>${badge(h.club, 18)}${clubName(h.club)}</td><td class="n">${h.seasons}</td><td class="n">${h.apps}</td><td class="n">${h.goals}</td><td class="n">${h.awards}</td><td class="n">${h.ovr}</td><td class="n">+${h.points}</td></tr>`).join('')}</table></div>`
    : '<p class="dim">Nobody yet. When a star retires from a club you manage, he goes in here.</p>';
  return `<h2>Legends · ${pts} Star point${pts === 1 ? '' : 's'}</h2>
    ${help(`A star who retires from your club earns Star points: 2, plus 1 for each season at the club after his first, 1 for each season award he ever won and 1 for retiring in the Premier League. A star: the top 10% of his division by overall, or any award winner. Points stay with you from job to job. Spend them on a 17-year-old young version of a legend: he joins your youth squad with a ceiling above 100, as his three signature attributes go on to ${SIG_MAX} where anyone else stops at 20. He grows twice as fast as anyone else and declines two years later. Promote him before ${LEAVE_AGE} or he leaves. Each legend exists once: AI clubs now and then sign one too.`)}
    <div class="bar">${['All', ...POS].map(x => `<button data-act="legendPos" data-v="${x}" class="${x === legendPos ? 'on' : ''}">${x}</button>`).join('')}</div>
    ${s.me === null ? '<p class="dim">You can sign legends again once you have a club.</p>' : s.youth.length >= YOUTH_MAX ? `<p class="oop">The youth squad is full (${YOUTH_MAX}).</p>` : ''}
    <div class="wrap"><table><tr><th>Legend</th><th>Pos</th><th>Tier</th><th>Signature</th><th class="n">Ovr at 17</th><th class="n">Cost</th><th></th></tr>${rows || '<tr><td colspan="7" class="dim">None on offer.</td></tr>'}</table></div>
    <h2>Hall of fame</h2>${hall}`;
};

views.Board = () => {
  const c = myClub(s), b = bands(s, c.div), k = leagueTarget(s, c.id), pos = table(s, c.div).indexOf(c.id) + 1, line = Math.max(0, sackLine(s));
  const spell = x => `<tr><td>${clubName(x.club)}</td><td>season ${x.from}${x.to === null ? ' – now' : x.to === x.from ? '' : ` – ${x.to}`}</td><td class="n">${x.salary ? money(x.salary) + ' a year' : ''}</td><td class="dim">${x.how === 'sacked' ? 'sacked' : x.how === 'left' ? 'left for another job' : ''}</td></tr>`;
  const asked = s.career.asked === s.season;
  return `<h2>The board</h2><p>Confidence ${confText(c)} <span class="dim">· below ${Math.round(line)} you are sacked (after ${MIN_GAMES} league games)</span></p>
    <div class="wrap"><table><tr><th>Target</th><th>Now</th></tr>
    <tr><td>League: ${esc(b[k][0])} (${b[k][1] === 1 ? '1st' : `top ${b[k][1]}`})</td><td>${c.st.p ? ordinal(pos) : '–'}</td></tr>
    <tr><td>Cup: reach ${cupGoal(cupTarget(s, c.id))}</td><td></td></tr></table></div>
    ${help(`Every league result is weighed against what a squad like yours should get; the board also watches the table each week and does not like debt. Going out of the cup early costs, cup wins from the target round on help. At the end of the season the target is judged, and promotion and relegation count.`)}
    <h2>Budget</h2><p>Transfer budget ${money(s.budget)} · wages and staff ${perWeek(wageBill(c) + staffBill(s, c))}</p>
    ${help(`Once a season you may ask for more. The board agrees while its confidence is ${ASK.conf} or more and the club is out of debt (always, if you own ${SHARE.say}% of the club); otherwise it says no and thinks less of you for asking.`)}
    <div class="bar">${asked ? '<span class="dim">You have asked this season.</span>' : `<button data-act="ask" data-field="transfer">Ask for ${Math.round((ASK.transfer - 1) * 100)}% more transfer budget</button>`}</div>
    <h2>Your reputation: ${s.career.rep}</h2>${help(`Your club's size is ${level(s, c.id)} on the same scale. Reputation follows where you finish and the trophies you win, and drops when you are sacked. Clubs up to ${REP.gate} above it may offer you their job when they sack their manager; it buys a little patience from the board and persuades players to join.`)}
    <h2>Career</h2><div class="wrap"><table>${s.career.spells.map(spell).join('')}</table></div>`;
};

// The manager's own money: salary, bonuses, severance; players of his own; shares in clubs.
views.Money = () => {
  const spell = s.career.spells.at(-1), own = s.me !== null && spell.to === null;
  const pay = own ? spell.salary ?? salaryFor(s, s.me) : 0;
  const rows = Object.entries(s.career.shares).map(([id, pct]) => { const c = s.clubs[id], v = clubValue(s, c);
    return `<tr><td>${clubName(c.id)}</td><td class="n">${pct}%</td><td class="n">${money(v)}</td><td class="n">${money(pct * v / 100)}</td></tr>`; }).join('');
  const mine = s.clubs.flatMap(c => c.players.filter(p => p.mine).map(p => `<tr>${nameBtn(p, 'view')}<td>${p.pos}</td><td class="n">${ageCell(p)}</td><td>${clubName(c.id)}</td><td class="n">${money(value(p))}</td></tr>`)).join('');
  const clubs = [...s.clubs].sort((a, b) => a.div - b.div || a.name.localeCompare(b.name)).map(c => [String(c.id), `${c.name} · ${money(clubValue(s, c) / 100)} per 1%${stake(s, c.id) ? ` · you own ${stake(s, c.id)}%` : ''}`]);
  return `<h2>Your money: ${money(s.career.money)}</h2>
    <p>${own ? `Salary at ${clubName(s.me)}: ${money(pay)} a year, paid week by week through the season.` : 'Out of work: no salary.'}</p>
    ${help(`The salary is set by the size of the club when you take the job. Each season the club pays a bonus of ${BONUS.target * 100}% of a year's salary for meeting the board's target, ${BONUS.up * 100}% for promotion and ${BONUS.trophy * 100}% for each trophy. If you are sacked you get a quarter's salary (${SEVERANCE * 100}%); if you leave for another job, nothing.`)}
    <h2>Your players</h2>${mine ? `<div class="wrap"><table><tr><th>Name</th><th>Pos</th><th class="n">Age</th><th>At</th><th class="n">Value</th></tr>${mine}</table></div>` : '<p class="dim">None. Tick "Pay fees from your own money" on Transfers to buy one.</p>'}
    <h2>Shares</h2>${rows ? `<div class="wrap"><table><tr><th>Club</th><th class="n">Stake</th><th class="n">Club value</th><th class="n">Your part</th></tr>${rows}</table></div>` : '<p class="dim">You own no shares.</p>'}
    <div class="bar"><select id="share-club" aria-label="club">${options(clubs, String(s.me ?? clubs[0][0]))}</select>
      <label><input type="number" id="pct" min="1" max="${SHARE.max}" value="1" style="width:4em" aria-label="percent"> %</label>
      <button data-act="shares" data-field="buy">Buy</button> <button data-act="shares" data-field="sell">Sell</button></div>
    ${help(`A club is worth ${SHARE.value}× its expected season income, so promotion raises its value. You can own up to ${SHARE.max}% of a club; selling costs ${SHARE.sellCut * 100}%.
    Each summer every club you own part of pays you your share of half its season's profit. In your own club, ${SHARE.patient}% makes the board more patient (the sacking line drops by ${SHARE.patience}), and ${SHARE.say}% gives you a say: every budget request is granted and the transfer budget is ${Math.round(SHARE.sayTransfer * 100)} points more of the balance.`)}`;
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
const UNEMPLOYED = ['Inbox', 'Money', 'Legends', 'Table', 'Cup'];
const NEW_GAME = '<button data-act="reset">New game</button>';

// Save slots: a full save under slotKey(n), plus a small meta record (name, time saved, the player's own name for it)
// so the list never parses whole saves.
const metaKey = n => slotKey(n) + ':meta';
const inGame = () => s.me !== null || !!s.career;
const gameName = () => s.me !== null ? `${s.clubs[s.me].name} · season ${s.season}` : `Out of work · season ${s.season}`;
const readMeta = n => { try { return JSON.parse(localStorage.getItem(metaKey(n)) || '{}'); } catch { return {}; } };
export const current = () => s;
export const slotList = () => Array.from({ length: SLOTS }, (_, k) => {
  let text = null;
  try { text = localStorage.getItem(slotKey(k + 1)); } catch {}
  if (text === null) return null;
  const m = readMeta(k + 1);
  return { name: m.label || m.name || `Slot ${k + 1}`, at: m.at ?? null, size: text.length };
});
export async function saveSlot(n) {
  try { await write(slotKey(n), serialize(s)); localStorage.setItem(metaKey(n), JSON.stringify({ name: gameName(), at: Date.now() })); return ''; }
  catch { return STORAGE_FAIL; }
}
const replaceGame = next => {
  stopClock(); s = next; tab = s.live ? 'Match' : s.me === null ? 'Inbox' : 'Squad';
  sel = viewing = clubOpen = null; savesOpen = false; tableDiv = s.me === null ? 0 : s.clubs[s.me].div; return save();
};
export async function loadSlot(n) {
  const next = await readSave(slotKey(n));
  if (!next) return 'That slot cannot be read: it is empty or damaged.';
  await replaceGame(next); return '';
}
export const exportText = () => serialize(s);
export async function importText(text) { const next = deserialize(text); if (!next) return 'That file is not a Touchline save.'; await replaceGame(next); return ''; }

function savesView() {
  const kb = n => `${Math.max(1, Math.round(n / 1024))} KB`, act = (a, n, text) => `<button data-act="${a}" data-id="${n}" aria-label="${text} slot ${n}">${text}</button>`;
  const row = (x, k) => `<tr><td>Slot ${k + 1}</td><td>${x ? `<b>${esc(x.name)}</b>` : '<span class="dim">empty</span>'}</td><td class="dim">${x?.at ? new Date(x.at).toLocaleString() : ''}</td><td class="n dim">${x ? kb(x.size) : ''}</td>
    <td>${inGame() ? act('slotSave', k + 1, 'Save here') : ''} ${x ? act('slotLoad', k + 1, 'Load') + ' ' + act('slotRename', k + 1, 'Rename') + ' ' + act('slotDelete', k + 1, 'Delete') : ''}</td></tr>`;
  return `<div class="club"><b>Saved games</b><button data-act="close" style="margin-left:auto">Close</button></div>
    ${help('The game saves itself after everything you do (the autosave). A slot keeps a copy you can go back to. Slots live in this browser only: export a game to keep it somewhere else or to play it on another device.')}
    <div class="wrap"><table>${slotList().map(row).join('')}</table></div>
    <div class="bar">${inGame() ? '<button data-act="exportSave">Export current game</button>' : ''}<button data-act="importSave">Import a save file</button></div>`;
}
const SAVE_BUTTONS = '<button data-act="saves">Saved games</button><button data-act="exportSave">Export save</button><button data-act="importSave">Import save</button>';
// One Tab stop for the strip (the current screen); arrow keys move along it (see the keydown handler).
const navButton = t => `<button data-act="tab" data-tab="${t}" class="${t === tab ? 'on' : ''}"${t === tab ? ' aria-current="page"' : ' tabindex="-1"'}>${t === 'Inbox' && unread() ? `Inbox (${unread()})` : t}</button>`;

const actions = {
  start(id) { startCareer(s, id); tab = 'Squad'; tableDiv = s.clubs[id].div; },
  acceptJob(id) { msg = acceptJob(s, id) || `Welcome to ${clubName(id)}.`; if (s.me === id) { tab = 'Board'; tableDiv = s.clubs[id].div; sel = viewing = null; } },
  declineJob(id) { declineJob(s, id); msg = 'Offer declined.'; },
  ask(_, el) { msg = askBoard(s, el.dataset.field); },
  reset() { if ((s.me === null && !s.career) || confirm('Abandon this career and start a new game?')) { stopClock(); s = newWorld(); sel = viewing = clubOpen = null; savesOpen = false; tableDiv = 0; } },
  exportSave() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportText()], { type: 'application/json' }));
    a.download = `touchline-${s.me === null ? 'career' : s.clubs[s.me].short}-season-${s.season}.json`.replace(/[^\w.-]+/g, '_');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  importSave() {
    const f = document.createElement('input');
    f.type = 'file'; f.accept = '.json,application/json';
    f.onchange = async () => {
      const text = await f.files[0]?.text();
      if (!deserialize(text)) msg = 'That file is not a Touchline save.'; // refused before anything is replaced
      else if (inGame() && !confirm('Replace the current game with this save?')) return;
      else msg = (await importText(text)) || 'Save imported.';
      render(); save();
    };
    f.click();
  },
  tab(_, el) { tab = el.dataset.tab; sel = viewing = clubOpen = null; savesOpen = false; },
  div(id) { tableDiv = id; },
  tableView(_, el) { tableView = el.dataset.v; },
  view(id) { viewing = id; },
  club(id) { clubOpen = id; viewing = null; },
  close() { if (savesOpen) savesOpen = false; else if (viewing !== null) viewing = null; else clubOpen = null; },
  saves() { savesOpen = true; },
  async slotSave(n) { if (slotList()[n - 1] && !confirm(`Overwrite slot ${n} (${slotList()[n - 1].name})?`)) return; msg = (await saveSlot(n)) || `Saved to slot ${n}.`; },
  async slotLoad(n) { if (inGame() && !confirm(`Replace the current game with slot ${n}?`)) return; msg = (await loadSlot(n)) || `Loaded slot ${n}.`; },
  slotDelete(n) { if (!confirm(`Delete slot ${n} (${slotList()[n - 1]?.name})? This cannot be undone.`)) return; try { localStorage.removeItem(slotKey(n)); localStorage.removeItem(metaKey(n)); msg = `Slot ${n} deleted.`; } catch { msg = 'Could not delete: browser storage is blocked.'; } },
  slotRename(n) {
    const name = prompt(`Name slot ${n}`, slotList()[n - 1]?.name ?? '');
    if (!name?.trim()) return;
    try { localStorage.setItem(metaKey(n), JSON.stringify({ ...readMeta(n), label: name.trim().slice(0, 60) })); } catch { msg = STORAGE_FAIL; }
  }, // a player opened from a club profile closes back to the club
  findPlayer(id) { const p = allPlayers().find(x => x.id === id); filters = { name: p?.name ?? '' }; tab = 'Transfers'; viewing = clubOpen = null; },
  auto() { autoPick(s); sel = null; },
  formation(_, el) { s.formation = el.value; autoPick(s); sel = null; },
  pick(id) {
    if (sel === null || sel === id) { sel = sel === id ? null : id; return; }
    swap(s, sel, id);
    sel = null;
  },
  team(_, el) { msg = setTeam(s.tactics, el.dataset.field, +el.value) || ''; },
  slot(k, el) { const f = el.dataset.field; msg = setSlot(s.tactics.slots[k], slots(s.formation)[k], f, f === 'role' || f === 'duty' ? el.value : +el.value) || ''; },
  taker(_, el) { msg = setTaker(s.tactics, el.dataset.field, el.value === '' ? null : +el.value, myClub(s).players) || ''; },
  liveTeam(_, el) { msg = setLiveTactic(s.live, mySide(), el.dataset.field, +el.value) || ''; },
  play() { stopClock(); playDay(s); subOut = subIn = null; msg = newsText(); const r = s.last?.find(x => x.h === s.me || x.a === s.me); if (r) pendingSay = `Result: ${scoreLine(r)}.`; },
  trainField(_, el) { msg = setTraining(s, el.dataset.field, el.value) || ''; },
  focus(id, el) { msg = setFocus(s, id, el.value || null) || ''; },
  load(id, el) { msg = setLoad(s, id, el.value || null) || ''; },
  live() { kickOff(s); subOut = subIn = null; },
  go() { startClock(); },
  tactics() { tacticsOpen = !tacticsOpen; },
  pause() { stopClock(); },
  speed(_, el) { speed = +el.value; if (timer) startClock(); },
  liveFormation(_, el) { msg = setFormation(s.live, mySide(), el.value) || ''; subOut = subIn = null; },
  off(id) { if (subIn !== null) return actions.on(subIn, null, id); subOut = subOut === id ? null : id; },
  pickOn(id) {
    if (subIn !== null) return actions.on(subIn, null, id);
    if (subOut === null || subOut === id) { subOut = subOut === id ? null : id; return; }
    const a = s.live.pl[subOut].name, b = s.live.pl[id].name;
    msg = swapPositions(s.live, mySide(), subOut, id) || `${esc(a)} and ${esc(b)} swap positions.`;
    subOut = null;
  },
  moveTo(_, el) {
    if (subOut === null) { msg = 'Click the name of the player to move first.'; return; }
    msg = moveTo(s.live, mySide(), subOut, el.dataset.field) || `${esc(s.live.pl[subOut].name)} moves to ${el.dataset.field}.`;
    subOut = subIn = null;
  },
  on(id, _, out = subOut) { // a sub, picked first or after the player he replaces
    if (out === null) { subIn = subIn === id ? null : id; return; }
    msg = substitute(s.live, mySide(), out, id) || 'Substitution made.';
    subOut = subIn = null;
  },
  end() { endSeason(s); tab = s.me === null ? 'Inbox' : 'History'; if (s.me !== null) tableDiv = myClub(s).div; },
  buy(id) { msg = buy(s, id, ownPay) || 'Signed.'; },
  ownPay(_, el) { ownPay = el.checked; },
  browse(id) { filters = { club: String(id) }; tab = 'Transfers'; viewing = clubOpen = null; },
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
  build() { msg = buildStadium(s) || 'The new stand is open: gate receipts are up for good.'; },
  promote(id) { msg = promote(s, id, MAX_SQUAD) || 'Promoted to the first team.'; },
  signLegend(_, el) { const n = el.dataset.name; msg = signLegend(s, n) || `${esc(n)} ★ joins your youth squad.`; },
  legendPos(_, el) { legendPos = el.dataset.v; },
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
  autoRenew(_, el) { s.autoRenew = el.checked; msg = s.autoRenew ? 'Expiring contracts will be renewed automatically.' : 'Expiring contracts will no longer be renewed automatically.'; },
  renew(id) { msg = renewContract(s, id) || 'Contract agreed.'; },
  retire(id) { const p = myClub(s).players.find(x => x.id === id); if (!p || !confirm(`Force ${displayName(p)} to retire now? He leaves your club for good and this can't be undone.${retireNow(p) ? ` You get ${starPts(retireNow(p))}.` : ''}`)) return; msg = forceRetire(s, id) || `${esc(displayName(p))} has retired.`; if (viewing === id) viewing = null; },
  sell(id) { msg = sell(s, id) || 'Sold.'; if (viewing === id) viewing = null; },
  sortBy(_, el) { sorts[el.dataset.table] = nextSort(sorts[el.dataset.table], el.dataset.key); },
};

// A screen that covers the tab until closed: saved games, or a profile (never during a live match).
const overlay = () => savesOpen ? savesView() : s.live ? null : viewing !== null ? playerView(viewing) : clubOpen !== null ? clubView(clubOpen) : null;

// After each redraw (the screen is rebuilt as HTML): focus goes back to the control that had it, or to the
// content when that control is gone (a profile opened, say); tables and in-table controls get names; and the
// message, plus live-match news, is read out from a region outside the redraw.
const FOCUS_ATTRS = ['data-act', 'data-id', 'data-tab', 'data-table', 'data-key', 'data-field'];
const focusKey = el => !el || el === document.body || !el.closest?.('#main, #nav, #sys, #menu') ? null
  : el.id ? '#' + CSS.escape(el.id) : FOCUS_ATTRS.filter(a => el.hasAttribute(a)).map(a => `[${a}="${CSS.escape(el.getAttribute(a))}"]`).join('') || '#main'; // an id wins: it survives a change of action (Kick off, Pause, Resume)
let pendingSay = '';
const say = html => { $('say').innerHTML = html; };
// ponytail: names come from the page itself (heading above a table; column header and row for a control in a table)
// rather than being written into every template; a control the rule cannot name gets its label in the markup.
function nameThings(main) {
  for (const t of main.querySelectorAll('table:not([aria-label])')) {
    let h = t.closest('.wrap') ?? t;
    while ((h = h.previousElementSibling) && !/^H[23]$/.test(h.tagName));
    t.setAttribute('aria-label', h ? h.textContent.trim() : tab);
  }
  for (const el of main.querySelectorAll('td select, td input')) {
    if (el.labels?.length || el.hasAttribute('aria-label')) continue;
    const td = el.closest('td'), tr = td.parentElement, head = tr.closest('table').rows[0];
    const col = head.cells[td.cellIndex]?.tagName === 'TH' ? head.cells[td.cellIndex].textContent.trim() : '';
    const link = [...tr.cells].find(c => c.querySelector('.link')), who = (link ? [link] : [...tr.cells].slice(0, 2)).map(c => c.textContent.trim()).join(' ');
    el.setAttribute('aria-label', [col, who].filter(Boolean).join(', '));
  }
}
function render() {
  const keep = focusKey(document.activeElement), said = msg;
  draw();
  const main = $('main');
  if (main.querySelectorAll) nameThings(main);
  if (keep) { const back = document.querySelector(keep), shown = back?.offsetParent != null; (shown ? back : main).focus?.({ preventScroll: shown }); } // hidden: in the closed menu
  const text = [said, pendingSay].filter(Boolean).join(' ');
  pendingSay = '';
  if (text) say(text);
}

function draw() {
  if (s.me === null && s.career) {
    if (!UNEMPLOYED.includes(tab)) tab = 'Inbox';
    $('info').textContent = `Out of work · reputation ${s.career.rep} · Season ${s.season}`;
    const main = `<div class="msg" role="status">${msg}</div>` + (overlay() ?? outOfWork() + views[tab]()); // first: the inbox marks what it shows as read
    $('nav').innerHTML = UNEMPLOYED.map(navButton).join('');
    $('sys').innerHTML = NEW_GAME + SAVE_BUTTONS;
    $('main').innerHTML = main;
    msg = '';
    return;
  }
  if (s.me === null) {
    $('info').textContent = 'Pick a club to manage';
    $('nav').innerHTML = '';
    $('sys').innerHTML = '<button data-act="saves">Saved games</button><button data-act="importSave">Import save</button>';
    if (savesOpen) { $('main').innerHTML = `<div class="msg" role="status">${msg}</div>` + savesView(); msg = ''; return; }
    $('main').innerHTML = s.divisions.map(d => `<h2>${esc(d.name)}</h2><div class="grid">${d.clubIds.map(id => `<button data-act="start" data-id="${id}">${badge(id, 24)}${clubName(id)}</button>`).join('')}</div>`).join('');
    return;
  }
  $('info').innerHTML = `${badge(s.me, 22)}<b>${clubName(s.me)}</b><span>${esc(s.divisions[myClub(s).div].name)} · Season ${s.season} · ${s.done ? 'season over' : dateLabel(s.days[s.next].day)}</span>
    <span class="chip" title="transfer budget">Transfers ${money(s.budget)}</span><span class="chip" title="wage bill">Wages ${perWeek(wageBill(myClub(s)))}</span>`;
  if (s.live) tab = 'Match'; // the other screens wait for the final whistle
  document.body?.classList.toggle('in-match', !!s.live); // a phone gives the match the whole screen
  // A profile replaces the screen until closed; never during a live match.
  const screen = overlay() ?? views[tab]();
  const main = `<div class="msg" role="status">${msg}</div>` + screen; // first: the inbox marks what it shows as read
  $('nav').innerHTML = (s.live ? ['Match'] : Object.keys(views)).map(navButton).join('');
  $('sys').innerHTML = NEW_GAME + SAVE_BUTTONS;
  $('main').innerHTML = main;
  $('nav').querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // the strip scrolls sideways on a phone
  msg = '';
}

async function dispatch(e) {
  const el = e.target.closest('[data-act]');
  if (!el || (e.type === 'click') === (el.tagName === 'SELECT')) return; // selects act on change, everything else on click
  const fromMenu = !!el.closest('#menu');
  $('menu').open = false; // the browser drops focus from inside the closed menu, so a menu action hands it to the content
  await actions[el.dataset.act](+el.dataset.id, el); // slot actions are async (compression)
  render(); // before save: the Inbox marks items read as it draws
  if (fromMenu) $('main').focus();
  save();
}
document.addEventListener('click', dispatch);
// The tab strip: arrow keys, Home and End move along it.
document.addEventListener('keydown', e => {
  const b = e.target.closest?.('#nav button'), all = b && [...$('nav').querySelectorAll('button')], k = all?.indexOf(b);
  const to = b && { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: all.length - 1 }[e.key];
  if (to === undefined || !b) return;
  e.preventDefault();
  all[(to + all.length) % all.length].focus();
});
document.addEventListener('change', dispatch);
render();
