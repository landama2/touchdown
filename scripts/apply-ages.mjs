// Rewrites age (and, for League One, rating) in src/data/england/*.js from scripts/.ages-cache.json
// and an optional ratings file (lines "Club: r r r ..." in squad order).  node scripts/apply-ages.mjs [--report] [ratings.txt]
import fs from 'node:fs';
const report = process.argv.includes('--report');
const rfile = process.argv.find(a => a.endsWith('.txt'));
const cache = JSON.parse(fs.readFileSync('scripts/.ages-cache.json', 'utf8'));
const manual = fs.existsSync('scripts/age-manual.json') ? JSON.parse(fs.readFileSync('scripts/age-manual.json', 'utf8')) : {};
const ratings = {};
if (rfile) for (const l of fs.readFileSync(rfile, 'utf8').split(/\r?\n/).filter(Boolean)) { const i = l.indexOf(':'); ratings[l.slice(0, i)] = l.slice(i + 1).trim().split(/\s+/).map(Number); }
const ageOn = (b) => { const [y, m, d] = b.split('-').map(Number); let a = 2026 - y; if (m > 8 || (m === 8 && d > 1)) a--; return a; };
const stats = {};
for (const f of ['premier-league', 'championship', 'league-one']) {
  const path = `src/data/england/${f}.js`;
  const lines = fs.readFileSync(path, 'utf8').split('\n');
  let club = null, idx = 0, res = 0, est = 0, tot = 0; const flags = [];
  const re = /^(\s*\['(?:[^'\\]|\\.)*', '[A-Z]{2}', )(\d+), (\d+)(.*)$/;
  for (let i = 0; i < lines.length; i++) {
    const cm = lines[i].match(/^\s*name: '((?:[^'\\]|\\.)*)', short:/);
    if (cm) { club = cm[1].replace(/\\'/g, "'"); idx = 0; continue; }
    const m = lines[i].match(re); if (!m) continue;
    const name = lines[i].match(/^\s*\['((?:[^'\\]|\\.)*)'/)[1].replace(/\\'/g, "'");
    const key = `${club}|${name}`; tot++;
    let age = +m[2], rating = +m[3];
    const born = key in manual ? manual[key] : cache[key]?.born; // manual[key] === '' excludes a name collision
    if (born) { const a = ageOn(born); if (a >= 15 && a <= 45) { if (report && Math.abs(a - age) >= (f === 'premier-league' ? 2 : 4) ) flags.push(`${key} ${born} new ${a} old ${age}`); age = a; res++; } else { est++; flags.push(`REJECT ${key} ${born}`); } } else est++;
    if (f === 'league-one' && rfile) { const r = ratings[club]; if (!r) throw new Error('no ratings ' + club); if (r[idx] === undefined) throw new Error(`short ${club} ${idx}`); rating = r[idx]; }
    idx++;
    if (!report) lines[i] = `${m[1]}${age}, ${rating}${m[4]}`;
  }
  stats[f] = { tot, res, est };
  if (report) console.log(f, flags.join('\n'));
  else fs.writeFileSync(path, lines.join('\n'));
}
console.log(JSON.stringify(stats));
if (rfile) for (const [c, r] of Object.entries(ratings)) { /* length check */ }
