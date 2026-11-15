// Resolves birth dates (Wikidata P569) for every player in the three England data files.
// Usage: node scripts/resolve-ages.mjs  -> writes scripts/.ages-cache.json (name -> {born, title} | null)
// Titles come from the player name; overrides in scripts/age-titles.json map "Club|Name" or "Name" to an exact enwiki title.
import fs from 'node:fs';
const UA = { 'User-Agent': 'touchline-data-script/1.0' };
const files = ['premier-league', 'championship', 'league-one'];
const cachePath = new URL('./.ages-cache.json', import.meta.url);
const ovPath = new URL('./age-titles.json', import.meta.url);
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
const ov = fs.existsSync(ovPath) ? JSON.parse(fs.readFileSync(ovPath, 'utf8')) : {};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const get = async (u) => { for (let i = 0; i < 8; i++) { try { const r = await fetch(u, { headers: UA }); if (r.ok) { await sleep(1200); return await r.json(); } if (r.status === 429) await sleep(30000 * (i + 1)); } catch {} await sleep(3000); } throw new Error('fail ' + u.slice(0, 120)); };
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const jobs = []; // {key, title}
for (const f of files) {
  const d = (await import(`../src/data/england/${f}.js`)).default;
  for (const c of d.clubs) for (const p of c.players) {
    const key = `${c.name}|${p[0]}`;
    const title = ov[key] || ov[p[0]] || p[0];
    if (!(key in cache) || (cache[key] && cache[key].title !== title) ) jobs.push({ key, title });
    else if (cache[key] === null && (ov[key] || ov[p[0]])) jobs.push({ key, title });
  }
}
console.log('to resolve', jobs.length);
const tmap = new Map(); // title -> qid|null|'disambig'
const titles = [...new Set(jobs.map(j => j.title))];
for (const ch of chunk(titles, 50)) {
  const u = 'https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item|disambiguation&redirects=1&format=json&titles=' + encodeURIComponent(ch.join('|'));
  const j = await get(u);
  const norm = {}; for (const n of j.query.normalized || []) norm[n.from] = n.to;
  const red = {}; for (const n of j.query.redirects || []) red[n.from] = n.to;
  const pages = {}; for (const p of Object.values(j.query.pages)) pages[p.title] = p;
  for (const t of ch) {
    let x = norm[t] || t; x = red[x] || x;
    const p = pages[x];
    tmap.set(t, !p || p.missing !== undefined ? null : (p.pageprops?.disambiguation !== undefined ? 'disambig' : p.pageprops?.wikibase_item || null));
  }
}
const qids = [...new Set([...tmap.values()].filter(v => v && v !== 'disambig'))];
const ent = {};
for (const ch of chunk(qids, 50)) {
  const j = await get('https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&ids=' + ch.join('|'));
  Object.assign(ent, j.entities);
}
for (const { key, title } of jobs) {
  const q = tmap.get(title); const e = q && q !== 'disambig' ? ent[q] : null;
  let r = null;
  if (e) {
    const occ = (e.claims?.P106 || []).map(c => c.mainsnak.datavalue?.value?.id);
    const b = e.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time;
    const prec = e.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.precision;
    if (b && occ.includes('Q937857') && prec >= 10) r = { born: b.slice(1, 11), title };
  }
  cache[key] = r;
}
fs.writeFileSync(cachePath, JSON.stringify(cache, null, 0));
console.log('resolved', Object.values(cache).filter(Boolean).length, 'of', Object.keys(cache).length);
