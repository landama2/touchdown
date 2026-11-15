// For players still unresolved, read link targets from each club's Wikipedia squad template and write scripts/age-titles.json.
import fs from 'node:fs';
const UA = { 'User-Agent': 'touchline-data-script/1.0' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const c = JSON.parse(fs.readFileSync('scripts/.ages-cache.json', 'utf8'));
const out = {};
const fetchRaw = async (t) => { for (let i = 0; i < 6; i++) { try { const r = await fetch('https://en.wikipedia.org/w/index.php?action=raw&title=' + encodeURIComponent(t), { headers: UA, redirect: 'follow' }); if (r.ok) { await sleep(1200); return await r.text(); } if (r.status === 404) return null; if (r.status === 429) await sleep(30000); } catch {} await sleep(3000); } return null; };
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim();
for (const f of ['premier-league', 'championship', 'league-one']) {
  const d = (await import(`../src/data/england/${f}.js`)).default;
  for (const cl of d.clubs) {
    const miss = cl.players.filter(p => !c[`${cl.name}|${p[0]}`]);
    if (!miss.length) continue;
    let txt = null;
    for (const t of [cl.name + ' F.C.', cl.name, cl.name + ' A.F.C.', cl.name + ' (football club)']) { txt = await fetchRaw(t); if (txt && /Fs player|fs player/i.test(txt)) break; txt = null; }
    if (!txt) { console.log('NO PAGE', cl.name); continue; }
    const links = [];
    for (const m of txt.matchAll(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g)) links.push([m[1].trim(), (m[2] || m[1]).trim()]);
    for (const p of miss) {
      const n = norm(p[0]);
      const hit = links.find(([t, disp]) => norm(disp) === n) || links.find(([t]) => norm(t.replace(/\(.*\)/, '')) === n);
      if (hit) out[`${cl.name}|${p[0]}`] = hit[0];
    }
    console.log(cl.name, miss.length, 'missing;', Object.keys(out).filter(k => k.startsWith(cl.name + '|')).length, 'titles found');
  }
}
fs.writeFileSync('scripts/age-titles.json', JSON.stringify(out));
