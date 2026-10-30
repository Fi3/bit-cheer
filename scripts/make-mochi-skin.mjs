// Draws "Strawberry Mochi", bit.cheer's second original skin: strawberry-milk pink, mint, butter yellow
// and a tiny mochi friend, as a complete classic Winamp 2 skin. Same painter as Millennium Chrome
// (scripts/skin-painter.mjs), recolored and dressed with its own motifs; no third-party art.
// Outputs:
//   public/skins/mochi.wsz   a real Winamp 2 skin (BMP sheets), loadable in Winamp/Webamp
//   public/skins/mochi.png   Skin studio's picture
// Run: node scripts/make-mochi-skin.mjs   (add --png=<directory> to preview the sheets as PNG)
import { writeFileSync, mkdirSync } from 'node:fs';
import { paintSkin, png, wsz, col } from './skin-painter.mjs';

const ROOT = new URL('../public/skins/', import.meta.url);

// ---------- color: Millennium Chrome's colors, made of strawberry milk ----------
// OKLab keeps the lightness steps of the original drawing while the hues move.
const toLinear = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const toByte = v => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
function oklch([r, g, b]) {
  const [R, G, B] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, bb), (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360];
}
function rgb(L, C, h) {
  const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
// The closest color the screen can show: less saturated, same lightness and hue.
function inGamut(L, C, h) {
  for (let c = C; c >= 0; c -= 0.002) { const v = rgb(L, c, h); if (v.every(x => x >= -0.0005 && x <= 1.0005)) return v.map(x => toByte(Math.min(1, Math.max(0, x)))); }
  return rgb(L, 0, h).map(x => toByte(Math.min(1, Math.max(0, x))));
}
// The colors that matter most, chosen by hand.
const NAMED = {
  '#0b1630': '#6a2c5c', // ink → plum
  '#14284a': '#8a4677', // navy → mulberry
  '#1f56a0': '#ff6fa5', // cobalt → strawberry
  '#eaf6ff': '#fff3f8', // ice → milk
  '#a9c8ec': '#ffc7dd', // frost → blush
  '#b8ee75': '#8fe6c3', // lime → mint
  '#5f8f2c': '#3fa985', // lime shadow → leaf
  '#ffc861': '#ffd98a', // amber → butter
  '#142038': '#b0587f', // edge → rose outline
  '#0c1d3a': '#4b1f47', // LCD → berry jam
  '#1d3a66': '#6d3166',
  '#cde4ff': '#ffd6ea', // glow → candy
};
function strawberryMilk(color) {
  const [r, g, b, a] = col(color), key = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  if (NAMED[key]) return [...col(NAMED[key]).slice(0, 3), a];
  let [L, C, h] = oklch([r, g, b]);
  if (C < 0.012) return [r, g, b, a]; // white, black and true grays stay
  if (h >= 95 && h < 170) h = 166; // greens become mint
  else if (h >= 170 && h < 300) { h = 352; C = Math.min(0.15, C * 1.5 + 0.025); } // blues and chrome become pink
  if (L > 0.6) L += (1 - L) * 0.18; // lights get a little milkier
  return [...inGamut(L, C, h), a];
}

// ---------- little pixel stickers ----------
const sprite = (c, x, y, rows, palette) => rows.forEach((row, j) => [...row].forEach((p, i) => { if (palette[p]) c.set(x + i, y + j, palette[p]); }));
const HEART = ['.#.#.', '#####', '#####', '.###.', '..#..'];
const SMALL_HEART = ['#.#', '###', '.#.'];
const SPARKLE = ['..#..', '..#..', '##o##', '..#..', '..#..'];
const MOCHI = {
  milk: '#fffafc', blush: '#ff9ec4', plum: '#6a2c5c', shade: '#f6d8e6', outline: '#c97c9f', leaf: '#5fcf9f', leafDark: '#3fa985', berry: '#ff6fa5',
};

// ---------- the theme ----------
const theme = {
  color: strawberryMilk,
  // Soft pink cream with white polka dots and, now and then, a little heart.
  texture(c, x, y, w, h, stops, { gradient, K }) {
    for (let j = 0; j < h; j++) { const base = gradient(stops, j / Math.max(1, h - 1)); for (let i = 0; i < w; i++) c.set(x + i, y + j, base); }
    const dot = K('#ffffffa8'), heart = K('#ff9ec470');
    for (let j = 3, row = 0; j < h - 2; j += 8, row++) for (let i = (row % 2) * 6 + 2, n = 0; i < w - 2; i += 12, n++) {
      if ((n + row * 3) % 7 === 3) sprite(c, x + i - 1, y + j - 1, SMALL_HEART, { '#': heart });
      else { c.set(x + i, y + j, dot); c.set(x + i + 1, y + j, dot); c.set(x + i, y + j + 1, dot); c.set(x + i + 1, y + j + 1, dot); }
    }
  },
  // Title grooves become a sewn seam: little stitches, like a plush toy.
  groove(c, x, row, dark, light) { if ((x + row) % 4 < 2) { c.set(x, row, dark); c.set(x, row + 1, light); } },
  // A mochi face on a strawberry tile.
  badge(c, x, y, dull, K) {
    c.rect(x, y, 9, 9, dull ? K('#d9a3bb') : MOCHI.berry);
    c.rect(x, y + 8, 9, 1, dull ? K('#b98299') : '#e0558b');
    sprite(c, x + 1, y + 1, ['.WWWWW.', 'WWWWWWW', 'WEWWWEW', 'BWWMWWB', 'WWWWWWW', '.WWWWW.'], { W: MOCHI.milk, E: MOCHI.plum, B: MOCHI.blush, M: MOCHI.plum });
  },
  // Where Winamp's logo sits: the mochi friend itself, with a strawberry leaf.
  logo(c, x, y, { raised, CHROME }) {
    raised(c, x, y, 19, 19, CHROME);
    sprite(c, x + 2, y + 2, [
      '......LG.......',
      '.....LGG.......',
      '....OOOOOOO....',
      '..OOWWWWWWWOO..',
      '.OWWWWWWWWWWWO.',
      'OWWWWWWWWWWWWWO',
      'OWWEWWWWWWWEWWO',
      'OWWEWWWWWWWEWWO',
      'OWBBWWWWWWWBBWO',
      'OWWWWWMWMWWWWWO',
      '.OSWWWWMWWWWSO.',
      '..OOOOOOOOOOO..',
    ], { O: MOCHI.outline, W: MOCHI.milk, E: MOCHI.plum, B: MOCHI.blush, M: MOCHI.plum, S: MOCHI.shade, L: MOCHI.leafDark, G: MOCHI.leaf });
  },
  // Stickers in the free corners of the main window.
  decorate(c) {
    sprite(c, 188, 43, HEART, { '#': MOCHI.berry });
    sprite(c, 197, 41, SPARKLE, { '#': '#ffffff', o: '#ffe7a3' });
    sprite(c, 204, 47, SMALL_HEART, { '#': MOCHI.leaf });
    sprite(c, 3, 72, SPARKLE, { '#': '#ffffff', o: '#ffe7a3' });
  },
  // A heart on each side of the title plate.
  titleOrnament(c, plateX, plateW, dull, K) {
    const color = dull ? K('#d9a3bb') : MOCHI.berry;
    sprite(c, plateX - 9, 4, HEART, { '#': color });
    sprite(c, plateX + plateW + 4, 4, HEART, { '#': color });
  },
  pledit: '[Text]\r\nNormal=#7A3A68\r\nCurrent=#E8467F\r\nNormalBG=#FFF1F7\r\nSelectedBG=#FFC7DD\r\nFont=Arial\r\n',
  readme: 'Strawberry Mochi\r\nA soft, sweet skin for bit.cheer, drawn pixel by pixel by scripts/make-mochi-skin.mjs.\r\nA classic Winamp 2 skin: it also loads in Winamp and Webamp.\r\n',
};

const skin = paintSkin(theme);
writeFileSync(new URL('mochi.png', ROOT), png(skin.preview));
writeFileSync(new URL('mochi.wsz', ROOT), wsz(skin.files, 'Strawberry_Mochi'));
const previewDir = process.argv.find(a => a.startsWith('--png='))?.slice(6);
if (previewDir) { mkdirSync(previewDir, { recursive: true }); for (const [name, [c]] of Object.entries(skin.sheets)) writeFileSync(`${previewDir}/${name.replace('.bmp', '.png')}`, png(c)); }
console.log('Strawberry Mochi written: public/skins/mochi.wsz and public/skins/mochi.png');
