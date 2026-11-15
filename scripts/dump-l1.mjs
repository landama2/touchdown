// Prints League One squads with a dataset ranking score (0-99, only for ranking) for rating review.
import fs from 'node:fs';
import l from '../src/data/england/league-one.js';
import { normName } from '../src/data/attrmap.js';
const hd = fs.readFileSync('data/player_stats.csv','utf8').split(/\r?\n/);
const cols = hd[0].split(',');
const rows = hd.slice(1).filter(Boolean).map(r => Object.fromEntries(r.split(',').map((v,i)=>[cols[i],v])));
const by = new Map(); for (const r of rows) { const k = normName(r.player); by.set(k,[...(by.get(k)||[]),r]); }
const K = { GK:['gk_positioning','gk_diving','gk_handling','gk_reflexes'], DF:['marking','stand_tackle','interceptions','heading','strength','short_pass'], MF:['short_pass','ball_control','vision','stamina','interceptions','long_pass'], FW:['finishing','att_position','ball_control','dribbling','acceleration','shot_power'] };
const ages = fs.existsSync('scripts/.ages-cache.json') ? JSON.parse(fs.readFileSync('scripts/.ages-cache.json','utf8')) : {};
const only = process.argv[2];
for (const c of l.clubs) {
  if (only && !c.name.toLowerCase().includes(only.toLowerCase())) continue;
  console.log('## ' + c.name);
  c.players.forEach((p, i) => {
    const h = (by.get(normName(p[0])) || []).filter(r => (p[1]==='GK') === (+r.gk_diving > 40 && +r.gk_handling > 40));
    const r = h.length ? h[0] : null;
    const sc = r ? Math.round(K[p[1]].reduce((a,k)=>a+(+r[k]||0),0)/K[p[1]].length) : '';
    const a = ages[`${c.name}|${p[0]}`];
    console.log(`${i}\t${p[0]}\t${p[1]}\t${a ? a.born : p[2]+'?'}\tds=${sc}${r ? ' ('+r.club.trim()+','+r.age+')' : ''}`);
  });
}
