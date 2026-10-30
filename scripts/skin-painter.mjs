// Paints a complete classic Winamp 2 skin, pixel by pixel: every sheet, its colors and window shape.
// bit.cheer's own skins (Millennium Chrome, Strawberry Mochi) are drawn with it; no third-party art.
// A theme recolors the drawing (theme.color maps each of Millennium Chrome's colors to the skin's own)
// and can swap a few motifs: the body texture, the title grooves, the badge, the logo and decorations.
import { deflateSync } from 'node:zlib';
import { zipSync, strToU8 } from 'fflate';

// ---------- tiny RGBA canvas ----------
export function canvas(w, h) {
  const px = new Uint8ClampedArray(w * h * 4);
  const set = (x, y, color) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const [r, g, b, a] = col(color), i = (y * w + x) * 4, sa = a / 255, da = px[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (!oa) return;
    px[i] = (r * sa + px[i] * da * (1 - sa)) / oa;
    px[i + 1] = (g * sa + px[i + 1] * da * (1 - sa)) / oa;
    px[i + 2] = (b * sa + px[i + 2] * da * (1 - sa)) / oa;
    px[i + 3] = oa * 255;
  };
  const get = (x, y) => { const i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2], px[i + 3]]; };
  const rect = (x, y, rw, rh, color) => { for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) set(i, j, color); };
  const clear = (x, y, rw = 1, rh = 1) => { for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) if (i >= 0 && j >= 0 && i < w && j < h) px.fill(0, (j * w + i) * 4, (j * w + i) * 4 + 4); };
  const blit = (src, sx, sy, sw, sh, dx, dy) => { for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) { const p = src.get(sx + i, sy + j); if (p[3]) set(dx + i, dy + j, p); } };
  return { w, h, px, set, get, rect, clear, blit };
}
export const col = c => typeof c === 'string' ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), c.length > 7 ? parseInt(c.slice(7, 9), 16) : 255] : c.length === 3 ? [...c, 255] : c;
const lerp = (a, b, t) => col(a).map((v, i) => Math.round(v + (col(b)[i] - v) * t));
function gradient(stops, t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [p0, c0] = stops[i - 1], [p1, c1] = stops[i]; return lerp(c0, c1, (t - p0) / (p1 - p0 || 1)); }
  return col(stops.at(-1)[1]);
}

// ---------- encoders ----------
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
export function png({ w, h, px }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(px.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// 24-bit BMP, as Winamp expects. Transparent pixels become the given matte color.
function bmp({ w, h, px }, matte = '#000000') {
  const stride = (w * 3 + 3) & ~3, size = 54 + stride * h, b = Buffer.alloc(size), m = col(matte);
  b.write('BM'); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(stride * h, 34);
  b.writeInt32LE(2835, 38); b.writeInt32LE(2835, 42);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, a = px[i + 3] / 255, o = 54 + (h - 1 - y) * stride + x * 3;
    b[o] = Math.round(px[i + 2] * a + m[2] * (1 - a)); b[o + 1] = Math.round(px[i + 1] * a + m[1] * (1 - a)); b[o + 2] = Math.round(px[i] * a + m[0] * (1 - a));
  }
  return b;
}


export function paintSkin(theme = {}) {
  const K = theme.color || (c => c);
  // ---------- palette ----------
  const P = {
    ink: K('#0b1630'), navy: K('#14284a'), cobalt: K('#1f56a0'), ice: K('#eaf6ff'), frost: K('#a9c8ec'),
    lime: K('#b8ee75'), limeDark: K('#5f8f2c'), amber: K('#ffc861'), edge: K('#142038'),
    lcd: K('#0c1d3a'), lcdDim: K('#1d3a66'), glow: K('#cde4ff'),
  };
  const CHROME = [[0, K('#f6fbff')], [0.46, K('#aebfd2')], [0.5, K('#5d7591')], [1, K('#c8d6e7')]];
  const CHROME_DULL = [[0, K('#c9d3de')], [0.46, K('#8e9cad')], [0.5, K('#56677d')], [1, K('#a3b0bf')]];
  const PRESSED = [[0, K('#2a63a3')], [0.55, K('#0b2a55')], [1, K('#1a4277')]];
  const BODY = [[0, K('#dfe8f2')], [0.18, K('#c5d3e2')], [0.62, K('#a8b9cc')], [1, K('#93a6bc')]];
  const BODY_DULL = [[0, K('#b6c1cd')], [0.5, K('#98a6b6')], [1, K('#86959f')]];

  // Deterministic brushed-metal streaks.
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  // Two-pixel grooves (a dark line over a light one) run along the title bars.
  const groove = theme.groove ? (c, x, row, dark, light) => theme.groove(c, x, row, dark, light) : (c, x, row, dark, light) => { c.set(x, row, dark); c.set(x, row + 1, light); };
  // The body of the main and equalizer windows: brushed metal, unless the theme has its own texture.
  const texture = (c, x, y, w, h, stops = BODY) => theme.texture ? theme.texture(c, x, y, w, h, stops, { rand, gradient, K }) : brushed(c, x, y, w, h, stops);
  function brushed(c, x, y, w, h, stops = BODY) {
    const streaks = Array.from({ length: h }, () => (rand() - 0.5) * 10);
    for (let j = 0; j < h; j++) {
      const base = gradient(stops, j / Math.max(1, h - 1));
      for (let i = 0; i < w; i++) {
        const n = streaks[j] + Math.sin((i + j * 7) * 0.13) * 2 + (rand() - 0.5) * 3;
        c.set(x + i, y + j, [base[0] + n, base[1] + n, base[2] + n * 1.1, 255]);
      }
    }
  }
  function vgrad(c, x, y, w, h, stops) { for (let j = 0; j < h; j++) { const color = gradient(stops, j / Math.max(1, h - 1)); for (let i = 0; i < w; i++) c.set(x + i, y + j, color); } }
  // A raised chrome panel: dark outline, light top-left, shaded bottom-right.
  function raised(c, x, y, w, h, stops = CHROME, round = true) {
    // Rounded corners keep whatever is behind them (BMP has no transparency).
    const corner = (i, j) => round && (i === 0 || i === w - 1) && (j === 0 || j === h - 1);
    for (let j = 0; j < h; j++) { const color = gradient(stops, j / Math.max(1, h - 1)); for (let i = 0; i < w; i++) if (!corner(i, j)) c.set(x + i, y + j, color); }
    for (let i = 0; i < w; i++) { if (!corner(i, 0)) c.set(x + i, y, P.edge); if (!corner(i, h - 1)) c.set(x + i, y + h - 1, P.edge); }
    for (let j = 0; j < h; j++) { if (!corner(0, j)) c.set(x, y + j, P.edge); if (!corner(w - 1, j)) c.set(x + w - 1, y + j, P.edge); }
    for (let i = 1; i < w - 1; i++) c.set(x + i, y + 1, K('#ffffffb0'));
    for (let j = 1; j < h - 1; j++) c.set(x + 1, y + j, K('#ffffff50'));
    for (let i = 1; i < w - 1; i++) c.set(x + i, y + h - 2, K('#20304860'));
  }
  // A recessed well: dark top-left, light bottom-right, flat fill.
  function sunken(c, x, y, w, h, fill = P.lcd) {
    c.rect(x, y, w, h, fill);
    for (let i = 0; i < w; i++) { c.set(x + i, y, K('#0a142a')); c.set(x + i, y + h - 1, K('#eef5fcd0')); }
    for (let j = 0; j < h; j++) { c.set(x, y + j, K('#0a142a')); c.set(x + w - 1, y + j, K('#eef5fcd0')); }
    for (let i = 1; i < w - 1; i++) c.set(x + i, y + 1, K('#00000050'));
  }

  // ---------- the skin's lettering: TEXT.BMP layout, 5 × 6 cells ----------
  const GLYPHS = {
    A: ['.##.', '#..#', '####', '#..#', '#..#'], B: ['###.', '#..#', '###.', '#..#', '###.'], C: ['.###', '#...', '#...', '#...', '.###'],
    D: ['###.', '#..#', '#..#', '#..#', '###.'], E: ['####', '#...', '###.', '#...', '####'], F: ['####', '#...', '###.', '#...', '#...'],
    G: ['.###', '#...', '#.##', '#..#', '.###'], H: ['#..#', '#..#', '####', '#..#', '#..#'], I: ['###', '.#.', '.#.', '.#.', '###'],
    J: ['..##', '...#', '...#', '#..#', '.##.'], K: ['#..#', '#.#.', '##..', '#.#.', '#..#'], L: ['#...', '#...', '#...', '#...', '####'],
    M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
    P: ['###.', '#..#', '###.', '#...', '#...'], Q: ['.##.', '#..#', '#..#', '#.#.', '.#.#'], R: ['###.', '#..#', '###.', '#.#.', '#..#'],
    S: ['.###', '#...', '.##.', '...#', '###.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#..#', '#..#', '#..#', '#..#', '.##.'],
    V: ['#...#', '#...#', '.#.#.', '.#.#.', '..#..'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#..#', '#..#', '.##.', '#..#', '#..#'],
    Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'], Z: ['####', '...#', '.##.', '#...', '####'],
    0: ['.##.', '#..#', '#..#', '#..#', '.##.'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###.', '...#', '.##.', '#...', '####'],
    3: ['###.', '...#', '.##.', '...#', '###.'], 4: ['#..#', '#..#', '####', '...#', '...#'], 5: ['####', '#...', '###.', '...#', '###.'],
    6: ['.##.', '#...', '###.', '#..#', '.##.'], 7: ['####', '...#', '..#.', '.#..', '.#..'], 8: ['.##.', '#..#', '.##.', '#..#', '.##.'],
    9: ['.##.', '#..#', '.###', '...#', '.##.'],
    '"': ['#.#', '#.#', '...', '...', '...'], '@': ['.##.', '#.##', '#.##', '#...', '.##.'], ' ': ['....'],
    '…': ['.....', '.....', '.....', '.....', '#.#.#'], '.': ['.', '.', '.', '.', '#'], ':': ['.', '#', '.', '#', '.'],
    '(': ['.#', '#.', '#.', '#.', '.#'], ')': ['#.', '.#', '.#', '.#', '#.'], '-': ['...', '...', '###', '...', '...'], "'": ['#', '#', '.', '.', '.'],
    '!': ['#', '#', '#', '.', '#'], _: ['....', '....', '....', '....', '####'], '+': ['...', '.#.', '###', '.#.', '...'],
    '\\': ['#..', '#..', '.#.', '..#', '..#'], '/': ['..#', '..#', '.#.', '#..', '#..'], '[': ['##', '#.', '#.', '#.', '##'], ']': ['##', '.#', '.#', '.#', '##'],
    '^': ['.#.', '#.#', '...', '...', '...'], '&': ['.#..', '#.#.', '.#..', '#.#.', '.#.#'], '%': ['#..#', '..#.', '.#..', '#...', '#..#'],
    ',': ['..', '..', '..', '.#', '#.'], '=': ['...', '###', '...', '###', '...'], $: ['.###', '##..', '.##.', '..##', '###.'],
    '#': ['.#.#.', '#####', '.#.#.', '#####', '.#.#.'], Å: ['.##.', '#..#', '####', '#..#', '#..#'], Ö: ['#..#', '.##.', '#..#', '#..#', '.##.'],
    Ä: ['#..#', '.##.', '#..#', '####', '#..#'], '?': ['###.', '...#', '.##.', '....', '.#..'], '*': ['#.#', '.#.', '#.#', '...', '...'],
  };
  // Where each glyph sits in TEXT.BMP: [row, column].
  const TEXT_MAP = {};
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => { TEXT_MAP[c] = [0, i]; });
  Object.assign(TEXT_MAP, { '"': [0, 26], '@': [0, 27], ' ': [0, 30] });
  '0123456789'.split('').forEach((c, i) => { TEXT_MAP[c] = [1, i]; });
  Object.assign(TEXT_MAP, { '…': [1, 10], '.': [1, 11], ':': [1, 12], '(': [1, 13], ')': [1, 14], '-': [1, 15], "'": [1, 16], '!': [1, 17], _: [1, 18], '+': [1, 19], '\\': [1, 20], '/': [1, 21], '[': [1, 22], ']': [1, 23], '^': [1, 24], '&': [1, 25], '%': [1, 26], ',': [1, 27], '=': [1, 28], $: [1, 29], '#': [1, 30], Å: [2, 0], Ö: [2, 1], Ä: [2, 2], '?': [2, 3], '*': [2, 4] });

  const CONDENSED = { C: ['###', '#..', '#..', '#..', '###'], S: ['###', '#..', '###', '..#', '###'], E: ['###', '#..', '##.', '#..', '###'], R: ['##.', '#.#', '##.', '#.#', '#.#'], O: ['###', '#.#', '#.#', '#.#', '###'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'] };
  function glyphWidth(ch) { return (GLYPHS[ch] || GLYPHS[' '])[0].length; }
  // Proportional label text (used inside the artwork), with an optional 1px shadow.
  function label(c, str, x, y, color, shadow = null, condensed = false) {
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const g = (condensed && CONDENSED[ch]) || GLYPHS[ch] || GLYPHS[' '];
      g.forEach((row, j) => [...row].forEach((p, i) => { if (p === '#') { if (shadow) c.set(cx + i + 1, y + j + 1, shadow); c.set(cx + i, y + j, color); } }));
      cx += g[0].length + 1;
    }
    return cx - x - 1;
  }
  const labelWidth = (str, condensed = false) => [...str.toUpperCase()].reduce((n, ch) => n + ((condensed && CONDENSED[ch]) || GLYPHS[ch] || GLYPHS[' '])[0].length + 1, -1);

  // ---------- NUMBERS.BMP: 7-segment digits, 9 × 13 ----------
  function numbers() {
    const c = canvas(99, 13);
    c.rect(0, 0, 99, 13, P.lcd);
    const SEG = { a: [[2, 0, 5, 2]], g: [[2, 6, 5, 1]], d: [[2, 11, 5, 2]], f: [[1, 1, 2, 5]], b: [[6, 1, 2, 5]], e: [[1, 7, 2, 5]], c: [[6, 7, 2, 5]] };
    const MAP = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
    for (let n = 0; n < 10; n++) for (const [key, rects] of Object.entries(SEG)) for (const [x, y, w, h] of rects) c.rect(n * 9 + x, y, w, h, MAP[n].includes(key) ? P.ice : K('#eaf6ff1e'));
    return c;
  }

  // ---------- TEXT.BMP ----------
  function textSheet() {
    const c = canvas(155, 18);
    c.rect(0, 0, 155, 18, P.lcd);
    for (const [ch, [row, column]] of Object.entries(TEXT_MAP)) {
      const g = GLYPHS[ch]; if (!g) continue;
      const ox = column * 5 + Math.floor((4 - Math.min(4, g[0].length)) / 2), oy = row * 6;
      g.forEach((r, j) => [...r].forEach((p, i) => { if (p === '#') c.set(ox + i, oy + j, j < 2 ? K('#f2f9ff') : P.glow); }));
    }
    return c;
  }

  // ---------- CBUTTONS.BMP: transport, 136 × 36 ----------
  function cbuttons(main) {
    const c = canvas(136, 36);
    const cells = [['prev', 0, 23, 18, 16], ['play', 23, 23, 18, 39], ['pause', 46, 23, 18, 62], ['stop', 69, 23, 18, 85], ['next', 92, 22, 18, 108], ['eject', 114, 22, 16, 136]];
    for (const [name, x, w, h, mx] of cells) for (const pressed of [false, true]) {
      const y = pressed ? h : 0;
      c.blit(main, mx, name === 'eject' ? 89 : 88, w, h, x, y); // the window behind the rounded corners
      raised(c, x, y, w, h, pressed ? PRESSED : CHROME);
      transportIcon(c, name, x, y, w, h, pressed);
    }
    return c;
  }
  function transportIcon(c, name, x, y, w, h, pressed) {
    const fg = pressed ? P.ice : P.ink, glow = pressed ? K('#00000060') : K('#ffffffa0');
    const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
    const draw = pts => { for (const [i, j] of pts) c.set(i, j + 1, glow); for (const [i, j] of pts) c.set(i, j, fg); };
    const tri = (left, dir, size) => { const pts = []; for (let i = 0; i < size; i++) { const span = dir > 0 ? size - 1 - i : i; for (let j = -span; j <= span; j++) pts.push([left + i, cy + j]); } return pts; };
    const bar = (bx, by, bw, bh) => { const pts = []; for (let i = 0; i < bw; i++) for (let j = 0; j < bh; j++) pts.push([bx + i, by + j]); return pts; };
    if (name === 'play') draw(tri(cx - 3, 1, 6));
    if (name === 'pause') draw([...bar(cx - 3, cy - 4, 2, 9), ...bar(cx + 1, cy - 4, 2, 9)]);
    if (name === 'stop') draw(bar(cx - 4, cy - 4, 8, 8));
    if (name === 'prev') draw([...bar(cx - 5, cy - 4, 2, 9), ...tri(cx - 3, -1, 5), ...tri(cx + 1, -1, 5)]);
    if (name === 'next') draw([...tri(cx - 5, 1, 5), ...tri(cx - 1, 1, 5), ...bar(cx + 4, cy - 4, 2, 9)]);
    if (name === 'eject') { const pts = []; for (let j = 0; j < 4; j++) for (let i = -j; i <= j; i++) pts.push([cx + i, cy - 4 + j]); draw([...pts, ...bar(cx - 3, cy + 2, 7, 2)]); }
  }

  // ---------- TITLEBAR.BMP: 344 × 87 ----------
  const BIG = {
    B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'], I: ['111', '010', '010', '010', '010', '010', '111'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'], '.': ['00', '00', '00', '00', '00', '11', '11'],
    C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'], H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  };
  // The 9 × 9 badge on title bars: bit.cheer's lime "b." unless the theme draws its own.
  const badge = (c, x, y, dull = false) => theme.badge ? theme.badge(c, x, y, dull, K) : limeBadge(c, x, y, dull);
  function limeBadge(c, x, y, dull = false) {
    c.rect(x, y, 9, 9, dull ? K('#8fb46a') : P.lime);
    c.rect(x, y + 8, 9, 1, dull ? K('#55703a') : P.limeDark);
    ['.......', '#......', '#......', '#.##...', '##..#..', '#...#..', '#...#..', '####..#'].forEach((row, j) => [...row].forEach((p, i) => { if (p === '#') c.set(x + 1 + i, y + j, K('#17200d')); }));
  }
  // The 275 × 14 title strip: grooves running out of a recessed "b. BIT.CHEER" plate.
  function titleStrip(dull = false, transparent = false) {
    const c = canvas(275, 14);
    if (!transparent) { vgrad(c, 0, 0, 275, 14, dull ? CHROME_DULL : [[0, K('#e9f1f9')], [0.5, K('#b4c4d6')], [1, K('#97a9be')]]); for (let i = 0; i < 275; i++) { c.set(i, 0, K('#ffffff')); c.set(i, 13, K('#55667c')); } }
    const text = 'BIT.CHEER', textWidth = [...text].reduce((sum, ch) => sum + BIG[ch][0].length + 1, -1);
    const plateW = 4 + 9 + 5 + textWidth + 5, plateX = Math.floor((275 - plateW) / 2), plateY = 1, plateH = 12;
    for (let x = 0; x < 275; x++) {
      if (x >= plateX - 2 && x < plateX + plateW + 2) continue;
      if (!transparent && (x < 20 || x > 238)) continue; // room for the window buttons
      const dist = x < plateX ? plateX - x : x - (plateX + plateW), fade = transparent ? Math.max(0, 1 - dist / 95) : Math.max(0.25, 1 - dist / 140);
      for (const row of [4, 8]) groove(c, x, row, K([6, 14, 30, Math.round(200 * fade)]), K([255, 255, 255, Math.round(150 * fade)]));
    }
    for (let j = 0; j < plateH; j++) { const color = gradient(dull ? [[0, K('#202a3a')], [1, K('#3a4658')]] : [[0, K('#050c1c')], [0.5, K('#0f2244')], [1, K('#1b3864')]], j / (plateH - 1)); for (let i = 1; i < plateW - 1; i++) c.set(plateX + i, plateY + j, color); }
    for (let j = 1; j < plateH - 1; j++) { c.set(plateX, plateY + j, K('#050c1c')); c.set(plateX + plateW - 1, plateY + j, K('#050c1c')); }
    for (let i = 1; i < plateW - 1; i++) c.set(plateX + i, plateY + plateH, K('#d7e6f7a0'));
    theme.titleOrnament?.(c, plateX, plateW, dull, K);
    let x = plateX + 4;
    badge(c, x, 3, dull); x += 9 + 5;
    for (const ch of text) {
      const glyph = BIG[ch];
      for (let j = 0; j < 7; j++) for (let i = 0; i < glyph[j].length; i++) if (glyph[j][i] === '1') { c.set(x + i + 1, 4 + j + 1, K('#000000c0')); c.set(x + i, 4 + j, ch === '.' ? (dull ? K('#8fb46a') : P.lime) : dull ? K('#b9c6d4') : j < 3 ? K('#ffffff') : P.ice); }
      x += glyph[0].length + 1;
    }
    return c;
  }
  function windowButton(c, x, y, kind, pressed) {
    vgrad(c, x, y, 9, 9, pressed ? PRESSED : CHROME);
    for (let i = 0; i < 9; i++) { c.set(x + i, y, P.edge); c.set(x + i, y + 8, P.edge); c.set(x, y + i, P.edge); c.set(x + 8, y + i, P.edge); }
    const ink = pressed ? P.ice : P.ink;
    if (kind === 'min') c.rect(x + 2, y + 5, 5, 2, ink);
    if (kind === 'shade') { c.rect(x + 2, y + 2, 5, 1, ink); c.rect(x + 2, y + 4, 5, 1, ink); c.rect(x + 2, y + 6, 5, 1, ink); }
    if (kind === 'unshade') { c.rect(x + 2, y + 2, 5, 5, ink); c.rect(x + 3, y + 3, 3, 3, pressed ? P.cobalt : K('#c8d6e7')); }
    if (kind === 'close') for (let k = 0; k < 5; k++) { c.set(x + 2 + k, y + 2 + k, ink); c.set(x + 6 - k, y + 2 + k, ink); }
    if (kind === 'menu') { c.rect(x + 2, y + 2, 5, 1, ink); c.rect(x + 2, y + 4, 3, 1, ink); c.rect(x + 2, y + 6, 4, 1, ink); }
  }
  // Winamp's windowshade bar (275 × 14): the title chrome with a mini analyser window, the time display
  // (digits drawn at 130/135 and 145/150), a mini transport and the position groove, where Winamp puts them.
  function shadeStrip(dull = false) {
    const c = canvas(275, 14), ink = dull ? K('#4a5b72') : P.ink;
    vgrad(c, 0, 0, 275, 14, dull ? CHROME_DULL : [[0, K('#e9f1f9')], [0.5, K('#b4c4d6')], [1, K('#97a9be')]]);
    for (let i = 0; i < 275; i++) { c.set(i, 0, K('#ffffff')); c.set(i, 13, K('#55667c')); }
    for (let x = 18; x < 75; x++) { const fade = Math.max(0.25, 1 - (x - 18) / 80); for (const row of [4, 8]) groove(c, x, row, K([6, 14, 30, Math.round(200 * fade)]), K([255, 255, 255, Math.round(150 * fade)])); }
    sunken(c, 78, 4, 40, 7, dull ? K('#202a3a') : P.lcd);
    sunken(c, 123, 2, 34, 10, dull ? K('#202a3a') : P.lcd);
    c.set(141, 5, P.frost); c.set(141, 8, P.frost);
    const icon = (x, rows) => rows.forEach((row, j) => [...row].forEach((px, i) => { if (px === '#') c.set(x + i, 3 + j, ink); }));
    icon(170, ['#..#', '#.##', '####', '####', '#.##', '#..#']);  // previous
    icon(178, ['#...', '##..', '###.', '###.', '##..', '#...']);  // play
    icon(188, ['##.##', '##.##', '##.##', '##.##', '##.##', '##.##']); // pause
    icon(198, ['.....', '#####', '#####', '#####', '#####', '.....']); // stop
    icon(207, ['#..#', '##.#', '####', '####', '##.#', '#..#']);  // next
    icon(217, ['..#..', '.###.', '#####', '.....', '#####', '.....']); // eject
    return c;
  }
  function titlebar() {
    const c = canvas(344, 87);
    c.rect(0, 0, 344, 87, K('#8a9bb0'));
    windowButton(c, 0, 0, 'menu', false); windowButton(c, 0, 9, 'menu', true);
    windowButton(c, 9, 0, 'min', false); windowButton(c, 9, 9, 'min', true);
    windowButton(c, 18, 0, 'close', false); windowButton(c, 18, 9, 'close', true);
    windowButton(c, 0, 18, 'shade', false); windowButton(c, 9, 18, 'shade', true);
    windowButton(c, 0, 27, 'unshade', false); windowButton(c, 9, 27, 'unshade', true);
    const active = titleStrip(false), inactive = titleStrip(true);
    for (const [strip, y] of [[active, 0], [inactive, 15], [shadeStrip(false), 29], [shadeStrip(true), 42], [active, 57], [inactive, 72]]) c.blit(strip, 0, 0, 275, 14, 27, y);
    // The windowshade position groove and its thumb (at the start, in between, at the end).
    sunken(c, 0, 36, 17, 7);
    for (const x of [17, 20, 23]) { vgrad(c, x, 36, 3, 7, CHROME); c.set(x, 36, P.edge); c.set(x, 42, P.edge); }
    // Clutter bar: O A I D V in a slim recessed column, plus its disabled look.
    for (const [x, dim] of [[304, false], [312, true]]) {
      sunken(c, x, 0, 8, 43, dim ? K('#3a4a60') : P.navy);
      'OAIDV'.split('').forEach((ch, i) => label(c, ch, x + 2, 3 + i * 8, dim ? K('#6b7f99') : P.frost));
    }
    return c;
  }

  // ---------- MAIN.BMP: 275 × 116 ----------
  function mainWindow() {
    const c = canvas(275, 116);
    texture(c, 0, 0, 275, 116);
    c.blit(titleStrip(false), 0, 0, 275, 14, 0, 0);
    // Window edge.
    for (let i = 0; i < 275; i++) { c.set(i, 115, P.edge); c.set(i, 114, K('#5d7591')); }
    for (let j = 0; j < 116; j++) { c.set(0, j, P.edge); c.set(274, j, P.edge); c.set(1, j, K('#ffffff90')); c.set(273, j, K('#5d759190')); }
    // Clutter bar slot and the display.
    sunken(c, 9, 21, 10, 45, P.navy);
    sunken(c, 21, 21, 84, 42);
    for (let y = 23; y < 61; y += 2) for (let x = 22; x < 104; x++) c.set(x, y, K('#ffffff05'));
    // The colon between minutes and seconds lives in the window art, like in Winamp.
    c.rect(72, 29, 2, 2, P.ice); c.rect(72, 34, 2, 2, P.ice);
    // Song title, kbps / khz windows.
    sunken(c, 108, 23, 159, 13);
    sunken(c, 108, 40, 21, 11); label(c, 'KBPS', 131, 43, P.ink, K('#ffffff80'));
    sunken(c, 152, 40, 16, 11); label(c, 'KHZ', 170, 43, P.ink, K('#ffffff80'));
    // Slots behind volume / balance and the seek bar.
    sunken(c, 106, 56, 70, 15, K('#7d90a8')); sunken(c, 176, 56, 40, 15, K('#7d90a8'));
    sunken(c, 15, 71, 250, 12, K('#6f839c'));
    // A recessed deck for the transport.
    sunken(c, 12, 85, 230, 24, K('#8b9db3'));
    for (let i = 13; i < 241; i++) c.set(i, 86, K('#00000030'));
    // bit.cheer badge where the Winamp logo would sit.
    if (theme.logo) theme.logo(c, 248, 88, { raised, CHROME, K });
    else { raised(c, 248, 88, 19, 19, CHROME); badge(c, 253, 93); }
    theme.decorate?.(c, { K });
    return c;
  }

  // ---------- PLAYPAUS.BMP: 42 × 9 ----------
  function playpaus() {
    const c = canvas(42, 9);
    c.rect(0, 0, 42, 9, P.lcd);
    for (let i = 0; i < 5; i++) for (let j = -(4 - i); j <= 4 - i; j++) c.set(2 + i, 4 + j, P.lime);
    c.rect(11, 1, 2, 7, P.amber); c.rect(15, 1, 2, 7, P.amber);
    c.rect(20, 1, 6, 6, P.frost);
    c.rect(36, 0, 3, 9, K('#5a1c22')); c.rect(37, 1, 1, 7, K('#a33a44'));
    c.rect(39, 0, 3, 9, K('#24420f')); c.rect(40, 1, 1, 7, P.lime);
    return c;
  }

  // ---------- MONOSTER.BMP: 58 × 24 ----------
  function monoster(main) {
    const c = canvas(58, 24);
    c.blit(main, 239, 41, 29, 12, 0, 0); c.blit(main, 239, 41, 29, 12, 0, 12);
    c.blit(main, 212, 41, 27, 12, 29, 0); c.blit(main, 212, 41, 27, 12, 29, 12);
    for (const [x, w, text] of [[0, 29, 'STEREO'], [29, 27, 'MONO']]) for (const lit of [true, false]) {
      const y = lit ? 0 : 12;
      const tw = labelWidth(text, true);
      label(c, text, x + Math.floor((w - tw) / 2), y + 4, lit ? P.cobalt : K('#7f90a6'), lit ? K('#ffffffa0') : null, true);
      if (lit) { c.rect(x + 1, y + 10, w - 2, 1, P.lime); }
    }
    return c;
  }

  // ---------- SHUFREP.BMP: 92 × 85 ----------
  function led(c, x, y, on) { c.rect(x, y, 3, 3, on ? P.lime : K('#2d4a1c')); if (on) { c.set(x, y, K('#e6ffc8')); c.set(x - 1, y + 1, K('#b8ee7550')); c.set(x + 3, y + 1, K('#b8ee7550')); } c.set(x + 2, y + 2, on ? P.limeDark : K('#1c2e12')); }
  function toggleButton(c, x, y, w, h, text, on, pressed) {
    raised(c, x, y, w, h, pressed ? PRESSED : CHROME);
    const tw = labelWidth(text), lx = x + Math.floor((w - tw - 5) / 2);
    led(c, lx, y + Math.floor(h / 2) - 1, on);
    label(c, text, lx + 5, y + Math.floor((h - 5) / 2), pressed ? P.ice : P.ink, pressed ? null : K('#ffffff90'));
  }
  function shufrep(main) {
    const c = canvas(92, 85);
    c.rect(0, 0, 92, 85, K('#9fb1c6'));
    for (const [state, y] of [[[false, false], 0], [[false, true], 15], [[true, false], 30], [[true, true], 45]]) {
      c.blit(main, 210, 89, 28, 15, 0, y); c.blit(main, 164, 89, 47, 15, 28, y);
      toggleButton(c, 0, y, 28, 15, 'REP', state[0], state[1]);
      toggleButton(c, 28, y, 47, 15, 'SHUFFLE', state[0], state[1]);
    }
    for (const [x, text, pressed] of [[0, 'EQ', false], [23, 'PL', false], [46, 'EQ', true], [69, 'PL', true]]) for (const [y, on] of [[61, false], [73, true]]) {
      c.blit(main, text === 'EQ' ? 219 : 242, 58, 23, 12, x, y);
      toggleButton(c, x, y, 23, 12, text, on, pressed);
    }
    return c;
  }

  // ---------- POSBAR.BMP: 307 × 10 ----------
  function capsule(c, x, y, w, h, pressed) {
    raised(c, x, y, w, h, pressed ? PRESSED : CHROME);
    const mid = x + Math.floor(w / 2);
    for (const dx of [-3, 0, 3]) { c.rect(mid + dx, y + 2, 1, h - 4, pressed ? P.ice : K('#3c4f69')); c.rect(mid + dx + 1, y + 2, 1, h - 4, pressed ? K('#0b2a55') : K('#ffffffb0')); }
  }
  function posbar() {
    const c = canvas(307, 10);
    c.rect(0, 0, 248, 10, K('#6f839c'));
    sunken(c, 0, 0, 248, 10, K('#1a2c48'));
    for (let x = 2; x < 246; x++) { c.set(x, 4, K('#0b1630')); c.set(x, 5, K('#2a4a76')); }
    for (let x = 12; x < 246; x += 24) c.set(x, 7, K('#5b79a3'));
    capsule(c, 248, 0, 29, 10, false);
    capsule(c, 278, 0, 29, 10, true);
    return c;
  }

  // ---------- VOLUME.BMP / BALANCE.BMP: 28 frames + knob ----------
  function knob(c, x, y, pressed) {
    raised(c, x, y, 14, 11, pressed ? PRESSED : CHROME);
    for (const dx of [4, 6, 8]) { c.rect(x + dx, y + 3, 1, 5, pressed ? P.ice : K('#3c4f69')); c.rect(x + dx + 1, y + 3, 1, 5, pressed ? K('#0b2a55') : K('#ffffffa0')); }
  }
  function volume() {
    const c = canvas(68, 433);
    c.rect(0, 0, 68, 433, K('#7d90a8'));
    for (let i = 0; i < 28; i++) {
      const y = i * 15;
      sunken(c, 0, y, 68, 13, K('#13243f'));
      const fill = Math.round(62 * i / 27), color = gradient([[0, P.cobalt], [0.6, K('#5fb3d9')], [1, P.lime]], i / 27);
      for (let x = 0; x < fill; x++) { const glow = lerp(color, K('#ffffff'), 0.25); c.set(3 + x, y + 5, glow); c.set(3 + x, y + 6, color); c.set(3 + x, y + 7, lerp(color, K('#000000'), 0.3)); }
      for (let x = 3 + fill; x < 65; x++) c.set(x, y + 6, K('#25406a'));
    }
    knob(c, 15, 422, false); knob(c, 0, 422, true);
    return c;
  }
  function balance() {
    const c = canvas(68, 433);
    c.rect(0, 0, 68, 433, K('#7d90a8'));
    for (let i = 0; i < 28; i++) {
      const y = i * 15;
      sunken(c, 9, y, 38, 13, K('#13243f'));
      c.rect(27, y + 3, 2, 7, K('#3a5a86'));
      const spread = Math.round(16 * i / 27), color = gradient([[0, P.frost], [1, P.amber]], i / 27);
      for (let x = 0; x < spread; x++) for (const side of [-1, 1]) { const px = side < 0 ? 27 - x - 1 : 28 + x + 1; c.set(px, y + 5, lerp(color, K('#ffffff'), 0.25)); c.set(px, y + 6, color); c.set(px, y + 7, lerp(color, K('#000000'), 0.3)); }
    }
    knob(c, 15, 422, false); knob(c, 0, 422, true);
    return c;
  }

  // ---------- EQMAIN.BMP: 275 × 315 ----------
  function eqSliderBar(c, x, y, frame) {
    c.rect(x, y, 14, 63, K('#9fb1c6'));
    sunken(c, x + 3, y, 8, 63, K('#0f1f38'));
    const color = gradient([[0, P.cobalt], [0.55, K('#4fa3d6')], [1, P.lime]], frame / 27);
    for (let j = 2; j < 61; j++) { c.set(x + 5, y + j, lerp(color, K('#ffffff'), 0.3)); c.set(x + 6, y + j, color); c.set(x + 7, y + j, lerp(color, K('#000000'), 0.35)); }
  }
  function eqmain() {
    const c = canvas(275, 315);
    c.rect(0, 0, 275, 315, K('#9fb1c6'));
    // Window background.
    texture(c, 0, 0, 275, 116);
    for (let i = 0; i < 275; i++) { c.set(i, 115, P.edge); c.set(i, 114, K('#5d7591')); }
    for (let j = 0; j < 116; j++) { c.set(0, j, P.edge); c.set(274, j, P.edge); c.set(1, j, K('#ffffff90')); c.set(273, j, K('#5d759190')); }
    sunken(c, 85, 16, 115, 21);
    for (let x = 87; x < 198; x += 11) for (let y = 18; y < 35; y++) c.set(x, y, K('#ffffff10'));
    for (let x = 87; x < 198; x++) c.set(x, 26, K('#ffffff1a'));
    sunken(c, 18, 36, 20, 67, K('#8b9db3'));
    sunken(c, 74, 36, 186, 67, K('#8b9db3'));
    label(c, '+12', 51, 39, P.ink, K('#ffffff80')); label(c, '0', 61, 67, P.ink, K('#ffffff80')); label(c, '-12', 51, 96, P.ink, K('#ffffff80'));
    label(c, 'PRE', 22, 105, P.ink, K('#ffffff80'));
    ['60', '170', '310', '600', '1K', '3K', '6K', '12K', '14K', '16K'].forEach((f, i) => { const w = labelWidth(f); label(c, f, 78 + i * 18 + Math.floor((14 - w) / 2), 105, P.ink, K('#ffffff80')); });
    // Title bars.
    for (const [y, dull] of [[134, false], [149, true]]) {
      const strip = canvas(275, 14);
      vgrad(strip, 0, 0, 275, 14, dull ? CHROME_DULL : [[0, K('#e9f1f9')], [0.5, K('#b4c4d6')], [1, K('#97a9be')]]);
      for (let i = 0; i < 275; i++) { strip.set(i, 0, K('#ffffff')); strip.set(i, 13, K('#55667c')); }
      const text = 'EQUALIZER', w = labelWidth(text) + 10, px = Math.floor((275 - w) / 2);
      for (let x = 6; x < 262; x++) if (x < px - 3 || x > px + w + 3) for (const row of [4, 8]) groove(strip, x, row, K('#0a142ab0'), K('#ffffff90'));
      sunken(strip, px, 2, w, 10, dull ? K('#2a3546') : K('#0f2244'));
      label(strip, text, px + 5, 4, dull ? K('#a9b6c6') : P.ice);
      c.blit(strip, 0, 0, 275, 14, 0, y);
    }
    // Slider bars: 28 frames.
    for (let f = 0; f < 28; f++) eqSliderBar(c, 13 + (f % 14) * 15, f < 14 ? 164 : 229, f);
    // Knob.
    for (const [y, pressed] of [[164, false], [176, true]]) {
      raised(c, 0, y, 11, 11, pressed ? PRESSED : CHROME);
      c.rect(2, y + 5, 7, 1, pressed ? P.ice : K('#3c4f69')); c.rect(2, y + 6, 7, 1, pressed ? K('#0b2a55') : K('#ffffffb0'));
    }
    // ON / AUTO / PRESETS.
    toggleButton(c, 10, 119, 26, 12, 'ON', false, false); toggleButton(c, 128, 119, 26, 12, 'ON', false, true);
    toggleButton(c, 69, 119, 26, 12, 'ON', true, false); toggleButton(c, 187, 119, 26, 12, 'ON', true, true);
    toggleButton(c, 36, 119, 32, 12, 'AUTO', false, false); toggleButton(c, 154, 119, 32, 12, 'AUTO', false, true);
    toggleButton(c, 95, 119, 32, 12, 'AUTO', true, false); toggleButton(c, 213, 119, 32, 12, 'AUTO', true, true);
    for (const [y, pressed] of [[164, false], [176, true]]) { raised(c, 224, y, 44, 12, pressed ? PRESSED : CHROME); label(c, 'PRESETS', 225 + Math.floor((44 - labelWidth('PRESETS')) / 2), y + 4, pressed ? P.ice : P.ink); }
    // Close buttons and the response graph.
    windowButton(c, 0, 116, 'close', false); windowButton(c, 0, 125, 'close', true);
    sunken(c, 0, 294, 113, 19);
    for (let j = 0; j < 19; j++) c.set(115, 294 + j, gradient([[0, P.lime], [0.5, K('#5fb3d9')], [1, P.cobalt]], j / 18));
    for (let x = 0; x < 113; x++) c.set(x, 314, K('#5fb3d9'));
    return c;
  }

  // ---------- PLEDIT.BMP: 280 × 186 ----------
  function plTop(c, y, dull) {
    const strip = canvas(280, 20);
    vgrad(strip, 0, 0, 280, 20, dull ? CHROME_DULL : [[0, K('#eef4fa')], [0.45, K('#bccbdc')], [0.55, K('#a8b9cc')], [1, K('#93a6bc')]]);
    for (let i = 0; i < 280; i++) { strip.set(i, 0, K('#ffffff')); strip.set(i, 19, P.edge); strip.set(i, 18, K('#5d759180')); }
    for (const row of [6, 11]) for (let x = 0; x < 280; x++) groove(strip, x, row, dull ? K('#2a3546a0') : K('#0a142ab0'), K('#ffffff90'));
    // Left corner: window edge and a lime badge sitting on the bar's own gradient.
    strip.rect(0, 0, 1, 20, P.edge); strip.rect(1, 1, 1, 18, K('#ffffffa0'));
    raised(strip, 4, 4, 13, 12, dull ? CHROME_DULL : CHROME);
    badge(strip, 6, 5, dull);
    // Title plate "PLAYLIST" over the grooves.
    const text = 'PLAYLIST', w = labelWidth(text) + 12, px = 26 + Math.floor((100 - w) / 2);
    vgrad(strip, px - 3, 2, w + 6, 16, dull ? CHROME_DULL : [[0, K('#eef4fa')], [0.45, K('#bccbdc')], [0.55, K('#a8b9cc')], [1, K('#93a6bc')]]);
    sunken(strip, px, 4, w, 12, dull ? K('#2a3546') : K('#0f2244'));
    label(strip, text, px + 6, 7, dull ? K('#a9b6c6') : P.ice);
    // Right corner: shade and close buttons on the same bar, window edge.
    vgrad(strip, 156, 2, 21, 16, dull ? CHROME_DULL : [[0, K('#eef4fa')], [0.45, K('#bccbdc')], [0.55, K('#a8b9cc')], [1, K('#93a6bc')]]);
    windowButton(strip, 157, 3, 'shade', false); windowButton(strip, 167, 3, 'close', false);
    strip.rect(177, 0, 1, 20, P.edge);
    c.blit(strip, 0, 0, 25, 20, 0, y); c.blit(strip, 26, 0, 100, 20, 26, y); c.blit(strip, 153, 0, 25, 20, 153, y);
    // The tile repeats across any width: grooves only.
    c.blit(strip, 200, 0, 25, 20, 127, y);
  }
  function pledit() {
    const c = canvas(280, 186);
    c.rect(0, 0, 280, 186, K('#9fb1c6'));
    plTop(c, 0, false); plTop(c, 21, true);
    // Left and right sides (the right one holds the scroll groove).
    const side = (x, w, groove) => {
      for (let j = 42; j < 71; j++) for (let i = 0; i < w; i++) c.set(x + i, j, gradient([[0, K('#dfe8f2')], [0.5, K('#b4c4d6')], [1, K('#93a6bc')]], i / (w - 1)));
      if (!groove) { c.rect(x, 42, 1, 29, P.edge); c.rect(x + 1, 42, 1, 29, K('#ffffffa0')); c.rect(x + w - 2, 42, 1, 29, K('#5d7591')); c.rect(x + w - 1, 42, 1, 29, K('#0a142a')); }
      else { c.rect(x, 42, 1, 29, K('#0a142a')); c.rect(x + 1, 42, 1, 29, K('#5d7591')); sunken(c, x + 5, 42, 8, 29, K('#13243f')); c.rect(x + 5, 42, 8, 1, K('#13243f')); c.rect(x + 5, 70, 8, 1, K('#13243f')); c.rect(x + w - 1, 42, 1, 29, P.edge); c.rect(x + w - 2, 42, 1, 29, K('#5d7591')); }
    };
    side(0, 12, false); side(31, 20, true);
    // Pressed window buttons and the scroll handle.
    windowButton(c, 52, 42, 'close', true); windowButton(c, 62, 42, 'shade', true); windowButton(c, 150, 42, 'unshade', true);
    for (const [x, pressed] of [[52, false], [61, true]]) { raised(c, x, 53, 8, 18, pressed ? PRESSED : CHROME); for (const dy of [6, 8, 10]) { c.rect(x + 2, 53 + dy, 4, 1, pressed ? P.ice : K('#3c4f69')); c.rect(x + 2, 54 + dy, 4, 1, pressed ? K('#0b2a55') : K('#ffffffb0')); } }
    // Shade bars: a slim chrome title bar with two grooves, like the main window's.
    // Winamp prints the title over it in TEXT.BMP cells, which bring their own dark plate.
    const shade = () => {
      const s = canvas(150, 14);
      vgrad(s, 0, 0, 150, 14, [[0, K('#eef4fa')], [0.45, K('#bccbdc')], [0.55, K('#a8b9cc')], [1, K('#93a6bc')]]);
      for (let i = 0; i < 150; i++) { s.set(i, 0, K('#ffffff')); s.set(i, 13, P.edge); s.set(i, 12, K('#5d759180')); }
      for (const row of [4, 8]) for (let x = 3; x < 127; x++) groove(s, x, row, K('#0a142ab0'), K('#ffffff90'));
      s.rect(0, 0, 1, 14, P.edge); s.rect(1, 1, 1, 12, K('#ffffffa0'));
      windowButton(s, 100 + 29, 3, 'unshade', false); windowButton(s, 100 + 39, 3, 'close', false);
      s.rect(149, 0, 1, 14, P.edge);
      return s;
    };
    // Winamp has no focused left piece or tile, so the focused right piece matches them.
    const sh = shade();
    c.blit(sh, 0, 0, 25, 14, 72, 42);
    c.blit(sh, 30, 0, 25, 14, 72, 57);
    c.blit(sh, 100, 0, 50, 14, 99, 57);
    c.blit(sh, 100, 0, 50, 14, 99, 42);
    // Bottom bar: tile, corners with buttons, displays and resize grip, at Winamp's standard positions
    // (Winamp prints the running time and the mini time into the empty displays itself).
    const BAR = [[0, K('#dfe8f2')], [0.3, K('#c3d1e0')], [1, K('#93a6bc')]];
    const barEdges = (t, x, w) => { for (let i = x; i < x + w; i++) { t.set(i, 0, P.edge); t.set(i, 1, K('#ffffffb0')); t.set(i, 37, P.edge); t.set(i, 36, K('#5d7591')); } };
    const bottom = canvas(276, 38);
    vgrad(bottom, 0, 0, 276, 38, BAR); barEdges(bottom, 0, 276);
    bottom.rect(0, 0, 1, 38, P.edge); bottom.rect(275, 0, 1, 38, P.edge); bottom.rect(1, 2, 1, 34, K('#ffffffa0'));
    // Labels sit on a soft gradient (chrome's dark horizon would strike through them), condensed to fit.
    const SOFT = [[0, K('#f6fbff')], [0.5, K('#cbd8e6')], [1, K('#a3b5ca')]];
    ['ADD', 'REM', 'SEL', 'MISC'].forEach((t, i) => { raised(bottom, 12 + i * 29, 9, 23, 18, SOFT); label(bottom, t, 12 + i * 29 + Math.floor((23 - labelWidth(t, true)) / 2), 16, P.ink, K('#ffffffa0'), true); });
    const R = 126; // the right corner starts here
    sunken(bottom, R + 5, 8, 92, 10, P.lcd); // running time
    const mini = { prev: ['#..#', '#.##', '####', '#.##', '#..#'], play: ['#...', '##..', '###.', '##..', '#...'], pause: ['#.#.', '#.#.', '#.#.', '#.#.', '#.#.'], stop: ['####', '####', '####', '####', '####'], next: ['#..#', '##.#', '####', '##.#', '#..#'], eject: ['.##.', '####', '....', '####', '....'] };
    const miniX = { prev: 7, play: 15, pause: 26, stop: 35, next: 44, eject: 53 };
    Object.entries(mini).forEach(([name, rows]) => rows.forEach((row, j) => [...row].forEach((p, k) => { if (p === '#') bottom.set(R + miniX[name] + k, 24 + j, P.ink); })));
    sunken(bottom, R + 63, 22, 34, 8, P.lcd); // mini time (Winamp prints "mm:ss" into it)
    raised(bottom, R + 103, 9, 23, 18, SOFT); label(bottom, 'LIST', R + 103 + Math.floor((23 - labelWidth('LIST', true)) / 2), 16, P.ink, K('#ffffffa0'), true);
    for (let k = 0; k < 4; k++) for (let i = 0; i <= k * 3; i++) bottom.set(272 - k * 3 + i, 34 - i + k * 0, K('#3c4f69'));
    c.blit(bottom, 0, 0, 125, 38, 0, 72);
    c.blit(bottom, R, 0, 150, 38, R, 72);
    // The tile repeats between the corners: the same bar, nothing on it.
    vgrad(c, 179, 0, 25, 38, BAR); barEdges(c, 179, 25);
    sunken(c, 205, 0, 75, 38, P.lcd);
    // Menu buttons (ADD URL … LOAD LIST), normal and pressed.
    const menus = [['URL', 'DIR', 'FILE'], ['ALL', 'CROP', 'SEL', 'MISC'], ['INV', 'NONE', 'ALL'], ['SORT', 'INFO', 'OPTS'], ['NEW', 'SAVE', 'LOAD']];
    menus.forEach((col, ci) => col.forEach((t, ri) => [false, true].forEach(pressed => {
      const x = [0, 54, 104, 154, 204][ci] + (pressed ? 23 : 0), y = 111 + ri * 19;
      raised(c, x, y, 22, 18, pressed ? PRESSED : CHROME, false); label(c, t, x + Math.floor((22 - labelWidth(t)) / 2), y + 7, pressed ? P.ice : P.ink);
    })));
    return c;
  }

  // ---------- GENEX.BMP: generic buttons and colors ----------
  function genex() {
    const c = canvas(112, 59);
    c.rect(0, 0, 112, 59, K('#b4c4d6'));
    // Text sits on these buttons: a soft gradient without chrome's hard middle line.
    raised(c, 0, 0, 47, 15, [[0, K('#f6fbff')], [0.5, K('#cbd8e6')], [1, K('#a3b5ca')]]); raised(c, 0, 16, 47, 15, PRESSED);
    const colors = [P.lcd, P.frost, K('#c3d1e0'), P.ink, P.ink, K('#5d7591'), P.cobalt, K('#aebfd2'), P.ink, K('#f6fbff'), K('#5d7591'), K('#2a63a3'), K('#9fb1c6'), K('#c8d6e7'), K('#aebfd2'), K('#2a63a3'), K('#0b2a55'), K('#8b9db3'), K('#ffffff'), P.cobalt, P.frost, K('#14284a')];
    colors.forEach((color, i) => c.set(48 + i * 2, 0, color));
    return c;
  }

  // ---------- the 275 × 14 strip, cbuttons and digits that TOML skins use (unchanged look) ----------
  function legacyNumbers() {
    const c = canvas(99, 13);
    const SEG = { a: [[2, 0, 5, 2]], g: [[2, 6, 5, 1]], d: [[2, 11, 5, 2]], f: [[1, 1, 2, 5]], b: [[6, 1, 2, 5]], e: [[1, 7, 2, 5]], c: [[6, 7, 2, 5]] };
    const MAP = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
    for (let n = 0; n < 10; n++) for (const [key, rects] of Object.entries(SEG)) for (const [x, y, w, h] of rects) c.rect(n * 9 + x, y, w, h, MAP[n].includes(key) ? P.ice : K('#eaf6ff26'));
    return c;
  }
  function legacyBevel(c, x, y, w, h, pressed) {
    for (let j = 0; j < h; j++) { const color = gradient(pressed ? PRESSED : CHROME, j / (h - 1)); for (let i = 0; i < w; i++) c.set(x + i, y + j, color); }
    for (let i = 1; i < w - 1; i++) { c.set(x + i, y, P.edge); c.set(x + i, y + h - 1, P.edge); }
    for (let j = 1; j < h - 1; j++) { c.set(x, y + j, P.edge); c.set(x + w - 1, y + j, P.edge); }
    for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) c.clear(x + cx, y + cy);
    for (let i = 2; i < w - 2; i++) c.set(x + i, y + 1, pressed ? K('#ffffff30') : K('#ffffffc0'));
    for (let i = 2; i < w - 2; i++) c.set(x + i, y + h - 2, pressed ? K('#00000040') : K('#5d759180'));
  }
  function legacyButtons() {
    const c = canvas(136, 36);
    const cells = [['prev', 0, 23, 18], ['play', 23, 23, 18], ['pause', 46, 23, 18], ['stop', 69, 23, 18], ['next', 92, 22, 18], ['eject', 114, 22, 16]];
    for (const [name, x, w, h] of cells) for (const pressed of [false, true]) { const y = pressed ? h : 0; legacyBevel(c, x, y, w, h, pressed); transportIcon(c, name, x, y, w, h, pressed); }
    return c;
  }
  function legacyTitle() {
    const c = canvas(275, 14);
    const text = 'BIT.CHEER';
    const textWidth = [...text].reduce((sum, ch) => sum + BIG[ch][0].length + 1, -1);
    const plateW = 4 + 9 + 5 + textWidth + 6 + 3 * 7 + 2 + 4, plateX = Math.floor((275 - plateW) / 2), plateY = 1, plateH = 12;
    for (let x = 0; x < 275; x++) {
      if (x >= plateX - 2 && x < plateX + plateW + 2) continue;
      const dist = x < plateX ? plateX - x : x - (plateX + plateW), fade = Math.max(0, 1 - dist / 95);
      for (const row of [4, 8]) { c.set(x, row, K([6, 14, 30, Math.round(200 * fade)])); c.set(x, row + 1, K([196, 214, 236, Math.round(150 * fade)])); }
    }
    for (let j = 0; j < plateH; j++) { const color = gradient([[0, K('#050c1c')], [0.5, K('#0f2244')], [1, K('#1b3864')]], j / (plateH - 1)); for (let i = 1; i < plateW - 1; i++) c.set(plateX + i, plateY + j, color); }
    for (let j = 1; j < plateH - 1; j++) { c.set(plateX, plateY + j, K('#050c1c')); c.set(plateX + plateW - 1, plateY + j, K('#050c1c')); }
    for (let i = 1; i < plateW - 1; i++) c.set(plateX + i, plateY + plateH, K('#d7e6f7a0'));
    let x = plateX + 4;
    c.rect(x, 3, 9, 9, P.lime); c.rect(x, 11, 9, 1, P.limeDark);
    ['.......', '#......', '#......', '#.##...', '##..#..', '#...#..', '#...#..', '####..#'].forEach((row, j) => [...row].forEach((p, i) => { if (p === '#') c.set(x + 1 + i, 3 + j, K('#17200d')); }));
    x += 9 + 5;
    for (const ch of text) {
      const glyph = BIG[ch];
      for (let j = 0; j < 7; j++) for (let i = 0; i < glyph[j].length; i++) if (glyph[j][i] === '1') { c.set(x + i + 1, 4 + j + 1, K('#000000c0')); c.set(x + i, 4 + j, ch === '.' ? P.lime : j < 3 ? K('#ffffff') : P.ice); }
      x += glyph[0].length + 1;
    }
    x += 5;
    for (const kind of ['min', 'shade', 'close']) {
      for (let j = 0; j < 7; j++) { const color = gradient(CHROME, j / 6); for (let i = 0; i < 7; i++) c.set(x + i, 3 + j, color); }
      for (let i = 0; i < 7; i++) { c.set(x + i, 3, P.edge); c.set(x + i, 9, P.edge); }
      for (let j = 3; j < 10; j++) { c.set(x, j, P.edge); c.set(x + 6, j, P.edge); }
      if (kind === 'min') c.rect(x + 2, 7, 3, 1, P.ink);
      if (kind === 'shade') { c.rect(x + 2, 5, 3, 1, P.ink); c.rect(x + 2, 7, 3, 1, P.ink); }
      if (kind === 'close') for (let k = 0; k < 3; k++) { c.set(x + 2 + k, 5 + k, P.ink); c.set(x + 4 - k, 5 + k, P.ink); }
      x += 8;
    }
    return c;
  }

  // ---------- the skin ----------
  const main = mainWindow();
  const sheets = {
    'main.bmp': [main], 'titlebar.bmp': [titlebar()], 'cbuttons.bmp': [cbuttons(main)], 'numbers.bmp': [numbers()], 'text.bmp': [textSheet()],
    'playpaus.bmp': [playpaus()], 'monoster.bmp': [monoster(main)], 'shufrep.bmp': [shufrep(main)], 'posbar.bmp': [posbar()],
    'volume.bmp': [volume()], 'balance.bmp': [balance()], 'eqmain.bmp': [eqmain()], 'pledit.bmp': [pledit()], 'genex.bmp': [genex()],
  };
  const viscolor = [P.lcd, K('#16305a'), K('#eaf6ff'), K('#dff4ff'), K('#cdeefa'), K('#bce7f0'), K('#b8ee75'), K('#a8e66c'), K('#94dc66'), K('#7fd062'), K('#6cc06a'), K('#5fb3d9'), K('#4b9fd4'), K('#3b8ccc'), K('#2f78bf'), K('#2867b0'), K('#2159a3'), K('#1f4f94'), K('#eaf6ff'), K('#c3dcf5'), K('#93bde6'), K('#5f97cf'), K('#2f6bb0'), P.amber]
    .map(h => col(h).slice(0, 3).join(',')).join('\r\n');
  const files = {
    ...Object.fromEntries(Object.entries(sheets).map(([name, [c]]) => [name, new Uint8Array(bmp(c))])),
    'pledit.txt': strToU8(theme.pledit),
    'viscolor.txt': strToU8(viscolor + '\r\n'),
    'region.txt': strToU8('[Normal]\r\nNumPoints=4,4\r\nPointList=1,0 274,0 274,116 1,116 0,1 275,1 275,115 0,115\r\n'),
    'readme.txt': strToU8(theme.readme),
  };
  // Skin studio's picture: the main window as Winamp draws it, at double size.
  function preview() {
    const c = canvas(275, 116), at = name => sheets[name][0];
    c.blit(main, 0, 0, 275, 116, 0, 0);
    c.blit(at('titlebar.bmp'), 27, 0, 275, 14, 0, 0);
    for (const [sx, dx] of [[0, 6], [9, 244], [0, 254], [18, 264]]) c.blit(at('titlebar.bmp'), sx, sx === 0 && dx === 254 ? 18 : 0, 9, 9, dx, 3);
    c.blit(at('titlebar.bmp'), 304, 0, 8, 43, 10, 22);
    c.blit(at('playpaus.bmp'), 0, 0, 9, 9, 26, 28); c.blit(at('playpaus.bmp'), 39, 0, 3, 9, 24, 28);
    [[0, 48], [1, 60], [2, 78], [8, 90]].forEach(([d, x]) => c.blit(at('numbers.bmp'), d * 9, 0, 9, 13, x, 26));
    const text = (str, x, y) => [...str].forEach((ch, i) => { const [row, column] = TEXT_MAP[ch] || TEXT_MAP[' ']; c.blit(at('text.bmp'), column * 5, row * 6, 5, 6, x + i * 5, y); });
    text('1. BIT.CHEER - BEATMATCH SCHOOL', 111, 27); text('128', 111, 43); text('44', 156, 43);
    const vis = [P.lcd, K('#16305a'), K('#eaf6ff'), K('#dff4ff'), K('#cdeefa'), K('#bce7f0'), K('#b8ee75'), K('#a8e66c'), K('#94dc66'), K('#7fd062'), K('#6cc06a'), K('#5fb3d9'), K('#4b9fd4'), K('#3b8ccc'), K('#2f78bf'), K('#2867b0'), K('#2159a3'), K('#1f4f94')];
    c.rect(24, 43, 76, 16, vis[0]);
    for (let y = 1; y < 16; y += 2) for (let x = 1; x < 76; x += 2) c.set(24 + x, 43 + y, vis[1]);
    [9, 13, 15, 12, 10, 11, 14, 9, 7, 8, 10, 6, 5, 7, 4, 3, 4, 2, 2].forEach((h, i) => { for (let r = 0; r < h; r++) c.rect(24 + i * 4, 58 - r, 3, 1, vis[17 - r]); });
    c.blit(at('monoster.bmp'), 29, 12, 27, 12, 212, 41); c.blit(at('monoster.bmp'), 0, 0, 29, 12, 239, 41);
    c.blit(at('volume.bmp'), 0, 20 * 15, 68, 13, 107, 57); c.blit(at('volume.bmp'), 15, 422, 14, 11, 147, 58);
    c.blit(at('balance.bmp'), 9, 0, 38, 13, 177, 57); c.blit(at('balance.bmp'), 15, 422, 14, 11, 189, 58);
    c.blit(at('shufrep.bmp'), 0, 73, 23, 12, 219, 58); c.blit(at('shufrep.bmp'), 23, 73, 23, 12, 242, 58);
    c.blit(at('posbar.bmp'), 0, 0, 248, 10, 16, 72); c.blit(at('posbar.bmp'), 248, 0, 29, 10, 60, 72);
    [[0, 16], [23, 39], [46, 62], [69, 85]].forEach(([sx, dx]) => c.blit(at('cbuttons.bmp'), sx, 0, 23, 18, dx, 88));
    c.blit(at('cbuttons.bmp'), 92, 0, 22, 18, 108, 88); c.blit(at('cbuttons.bmp'), 114, 0, 22, 16, 136, 89);
    c.blit(at('shufrep.bmp'), 28, 0, 47, 15, 164, 89); c.blit(at('shufrep.bmp'), 0, 30, 28, 15, 210, 89);
    const big = canvas(550, 232);
    for (let y = 0; y < 232; y++) for (let x = 0; x < 550; x++) big.set(x, y, c.get(x >> 1, y >> 1));
    for (const [x, y] of [[0, 0], [549, 0], [0, 231], [549, 231], [1, 0], [548, 0], [0, 1], [549, 1], [0, 230], [549, 230], [1, 231], [548, 231]]) big.clear(x, y);
    return big;
  }

  // The title strip, transport and digits that TOML skins built on Millennium Chrome use.
  const legacy = () => ({ numbers: legacyNumbers(), buttons: legacyButtons(), title: legacyTitle() });
  return { sheets, files, preview: preview(), legacy };
}

// A .wsz archive; a fixed timestamp keeps it byte-for-byte reproducible.
export const wsz = (files, folder) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [`${folder}/${k}`, v])), { level: 9, mtime: new Date('2001-01-01T00:00:00Z') });
