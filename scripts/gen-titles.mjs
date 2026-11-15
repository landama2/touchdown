// node scripts/gen-titles.mjs <variant>  variant: footballer | soccer | born
import fs from 'node:fs';
const v = process.argv[2];
const c = JSON.parse(fs.readFileSync('scripts/.ages-cache.json','utf8'));
const ov = fs.existsSync('scripts/age-titles.json') ? JSON.parse(fs.readFileSync('scripts/age-titles.json','utf8')) : {};
const files = ['premier-league','championship','league-one'];
const out = {};
for (const f of files) { const d = (await import(`../src/data/england/${f}.js`)).default;
  for (const cl of d.clubs) for (const p of cl.players) { const k = `${cl.name}|${p[0]}`;
    if (c[k]) continue; if (ov[k]) { out[k] = ov[k]; }
    if (v === 'footballer') out[k] = `${p[0]} (footballer)`;
    else if (v === 'soccer') out[k] = `${p[0]} (soccer)`;
  } }
fs.writeFileSync('scripts/age-titles.json', JSON.stringify(out));
console.log(Object.keys(out).length);
