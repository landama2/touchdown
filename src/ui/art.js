// Touchline's own artwork. Badges and kits are drawn only from a club's colours, a simple
// shape or pattern and its three-letter code; they are not copies of any real crest or kit.

const hash = str => { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };
const luminance = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const ink = hex => (luminance(hex) > 0.6 ? '#111111' : '#ffffff');

const CREST_SHAPES = [
  'M4 3H36V20Q36 35 20 43Q4 35 4 20Z',                        // shield
  'M20 3A19 19 0 1 1 19.99 3Z',                                // roundel
  'M8 3H32Q37 3 37 8V35Q37 40 32 40H8Q3 40 3 35V8Q3 3 8 3Z',   // rounded square
];
const CREST_DEVICES = [
  '',                                   // plain field
  'M0 31L40 19V26L0 38Z',               // diagonal band
  'M0 28L20 36L40 28V34L20 42L0 34Z',   // chevron
];

export function crestSvg(club, size = 32) {
  const h = hash(club.short), [main, second] = club.colours, id = `crest-${club.short}`;
  const shape = CREST_SHAPES[h % CREST_SHAPES.length], device = CREST_DEVICES[(h >>> 4) % CREST_DEVICES.length];
  return `<svg class="crest" width="${size}" height="${Math.round(size * 46 / 40)}" viewBox="0 0 40 46" aria-hidden="true">`
    + `<defs><clipPath id="${id}"><path d="${shape}"/></clipPath></defs>`
    + `<path d="${shape}" fill="${main}"/>`
    + (device ? `<path d="${device}" fill="${second}" clip-path="url(#${id})"/>` : '')
    + `<path d="${shape}" fill="none" stroke="${second}" stroke-width="2.5"/>`
    + `<text x="20" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="${ink(main)}">${club.short}</text>`
    + '</svg>';
}

const SHIRT = 'M18 6L26 3Q30 8 34 3L42 6L55 16L49 25L44 21V45H16V21L11 25L5 16Z';
const SLEEVES = 'M18 6L5 16L11 25L16 21ZM42 6L55 16L49 25L44 21Z';
const bars = vertical => {
  let out = '';
  for (let i = 2; i < 60; i += 8) out += vertical ? `<rect x="${i}" y="0" width="4" height="48"/>` : `<rect x="0" y="${i + 4}" width="60" height="4"/>`;
  return out;
};
const PATTERN_SHAPES = {
  plain: '',
  stripes: bars(true),
  hoops: bars(false),
  halves: '<rect x="30" y="0" width="30" height="48"/>',
  sash: '<path d="M12 3H22L50 48H40Z"/>',
  sleeves: `<path d="${SLEEVES}"/>`,
};

export function kitSvg(kit, size = 48) {
  const id = `kit-${hash(JSON.stringify(kit)).toString(36)}`;
  return `<svg class="kit" width="${size}" height="${Math.round(size * 72 / 60)}" viewBox="0 0 60 72" aria-hidden="true">`
    + `<defs><clipPath id="${id}"><path d="${SHIRT}"/></clipPath></defs>`
    + `<path d="${SHIRT}" fill="${kit.shirt}"/>`
    + `<g fill="${kit.trim}" clip-path="url(#${id})">${PATTERN_SHAPES[kit.pattern]}</g>`
    + `<path d="M26 3Q30 8 34 3" fill="none" stroke="${kit.trim}" stroke-width="2"/>`
    + `<path d="${SHIRT}" fill="none" stroke="#00000040" stroke-width="1"/>`
    + `<path d="M16 47H44L46 59H32L30 53L28 59H14Z" fill="${kit.shorts}" stroke="#00000040" stroke-width="1"/>`
    + `<rect x="17" y="61" width="8" height="10" rx="1" fill="${kit.socks}"/><rect x="35" y="61" width="8" height="10" rx="1" fill="${kit.socks}"/>`
    + '</svg>';
}
