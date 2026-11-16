// Builds the deployable site into dist/: the page, manifest, icons and src/, plus a service worker
// that precaches every one of those files under a version derived from their contents.
//   node scripts/build-pwa.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const out = process.argv[2] || 'dist';
const INCLUDE = ['index.html', 'manifest.webmanifest', 'icons', 'src'];

const files = [];
const walk = p => {
  if (fs.statSync(p).isDirectory()) for (const f of fs.readdirSync(p).sort()) walk(path.join(p, f));
  else files.push(p.split(path.sep).join('/'));
};
INCLUDE.forEach(walk);

fs.rmSync(out, { recursive: true, force: true });
const hash = crypto.createHash('sha256');
for (const f of files) {
  const dest = path.join(out, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f, dest);
  hash.update(f).update(fs.readFileSync(f));
}
const version = hash.digest('hex').slice(0, 12);
const precache = ['./', ...files.map(f => './' + f)];
const sw = fs.readFileSync('scripts/sw-template.js', 'utf8')
  .replace('__VERSION__', JSON.stringify(version))
  .replace('__PRECACHE__', JSON.stringify(precache, null, 2));
fs.writeFileSync(path.join(out, 'sw.js'), sw);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`Built ${out}/ — ${files.length} files, cache version ${version}`);
