// Builds a tiny TrueType font from a bitmap font (a Winamp TEXT.BMP), so any text in the
// app can be set in the skin's own pixel lettering. Each lit pixel becomes a square; at
// font-size 12px one font pixel is exactly 2 CSS pixels.

const UNIT = 100; // font units per bitmap pixel

// Glyph cells in TEXT.BMP as [row, column], 5 × 6 pixels each (the Winamp/Webamp layout).
export const TEXT_GLYPHS = (() => {
  const map = {};
  'abcdefghijklmnopqrstuvwxyz'.split('').forEach((c, i) => { map[c] = [0, i]; map[c.toUpperCase()] = [0, i]; });
  Object.assign(map, { '"': [0, 26], '@': [0, 27], ' ': [0, 30] });
  '0123456789'.split('').forEach((c, i) => { map[c] = [1, i]; });
  Object.assign(map, {
    '…': [1, 10], '.': [1, 11], ':': [1, 12], '(': [1, 13], ')': [1, 14], '-': [1, 15], "'": [1, 16], '!': [1, 17],
    _: [1, 18], '+': [1, 19], '\\': [1, 20], '/': [1, 21], '[': [1, 22], ']': [1, 23], '^': [1, 24], '&': [1, 25],
    '%': [1, 26], ',': [1, 27], '=': [1, 28], $: [1, 29], '#': [1, 30],
    Å: [2, 0], Ö: [2, 1], Ä: [2, 2], '?': [2, 3], '*': [2, 4],
    '<': [1, 13], '>': [1, 14], '{': [1, 13], '}': [1, 14], '·': [1, 11], '•': [1, 11], '−': [1, 15], '–': [1, 15], '—': [1, 15],
    '×': [0, 23], '’': [1, 16], '‘': [1, 16], '“': [0, 26], '”': [0, 26], '|': [1, 12], ';': [1, 12], '~': [1, 15], '`': [1, 16],
    å: [2, 0], ö: [2, 1], ä: [2, 2],
  });
  return map;
})();

// Symbols the app uses that TEXT.BMP doesn't have, drawn once here so every skin's font gets
// them in its own style instead of falling back to a system font. 5 × 5 inside the 5 × 6 cell.
export const SYMBOL_GLYPHS = {
  '·': ['.....', '.....', '.##..', '.....', '.....'],
  '•': ['.....', '.##..', '.##..', '.....', '.....'],
  '±': ['..#..', '.###.', '..#..', '.....', '.###.'],
  '→': ['..#..', '...#.', '#####', '...#.', '..#..'],
  '←': ['..#..', '.#...', '#####', '.#...', '..#..'],
  '↑': ['..#..', '.###.', '#.#.#', '..#..', '..#..'],
  '↓': ['..#..', '..#..', '#.#.#', '.###.', '..#..'],
  '↕': ['..#..', '.###.', '..#..', '.###.', '..#..'],
  '↗': ['.####', '...##', '..#.#', '.#...', '#....'],
  '↥': ['#####', '..#..', '.###.', '#.#.#', '..#..'],
  '↺': ['.##.#', '#..##', '#...#', '#...#', '.###.'],
  '✓': ['....#', '...#.', '#.#..', '.#...', '.....'],
  '✕': ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  '▶': ['#....', '##...', '###..', '##...', '#....'],
  '◀': ['..#..', '.##..', '###..', '.##..', '..#..'],
  '▸': ['.....', '.#...', '.##..', '.#...', '.....'],
  '◂': ['.....', '..#..', '.##..', '..#..', '.....'],
  'Ⅱ': ['##.##', '##.##', '##.##', '##.##', '##.##'],
  '■': ['.....', '####.', '####.', '####.', '####.'],
  '●': ['.###.', '#####', '#####', '#####', '.###.'],
  '♫': ['.####', '.#..#', '.#..#', '##.##', '##.##'],
  '♩': ['..#..', '..##.', '..#.#', '###..', '###..'],
  '⌑': ['.###.', '.#.#.', '#####', '##.##', '#####'],
  '⛶': ['##.##', '#...#', '.....', '#...#', '##.##'],
  '◎': ['.###.', '#...#', '#.#.#', '#...#', '.###.'],
  '◒': ['.###.', '#...#', '#####', '#####', '.###.'],
  '▥': ['#####', '#.#.#', '#.#.#', '#.#.#', '#####'],
  '⌨': ['#####', '#.#.#', '#####', '#...#', '#####'],
};
export function symbolBits(rows, width = 5, height = 6) {
  const bits = new Uint8Array(width * height);
  rows.forEach((row, y) => [...row].forEach((p, x) => { if (p === '#' && x < width && y < height) bits[y * width + x] = 1; }));
  return bits;
}

// glyphs: { char: Uint8Array(w*h) of 0/1 } — all cells share width × height. scale: how many cells
// make one TEXT.BMP pixel (a smoothed 4× redraw of the lettering has 20 × 24 cells and scale 4).
export function buildPixelFont(glyphs, { width = 5, height = 6, family = 'Kit Pixel', scale = 1 } = {}) {
  const chars = Object.keys(glyphs).filter(c => c.length === 1 && c.codePointAt(0) <= 0xffff && c !== ' ');
  // Deduplicate identical bitmaps so upper/lower case share a glyph.
  const glyphIds = new Map(), shapes = [[]], keyToId = new Map();
  shapes.push([]); // 1: space
  for (const ch of chars) {
    const bits = glyphs[ch], key = Array.from(bits).join('');
    if (!keyToId.has(key)) { keyToId.set(key, shapes.length); shapes.push(rectangles(bits, width, height)); }
    glyphIds.set(ch.charCodeAt(0), keyToId.get(key));
  }
  glyphIds.set(32, 1); glyphIds.set(0xa0, 1);
  // The bottom row hangs below the baseline: TEXT.BMP letters stand on the row above it, as in
  // ordinary type, so pixel lettering lines up with other fonts and with itself at other sizes.
  const advance = width * UNIT, descent = height > 1 ? UNIT * scale : 0, ascent = height * UNIT - descent;
  const glyf = [], loca = [0];
  let maxPoints = 0, maxContours = 0, offset = 0;
  for (const rects of shapes) {
    const data = glyphData(rects, height, descent);
    maxPoints = Math.max(maxPoints, rects.length * 4); maxContours = Math.max(maxContours, rects.length);
    glyf.push(data); offset += data.length; loca.push(offset);
  }
  const numGlyphs = shapes.length;
  const tables = {
    'OS/2': os2(advance, ascent, descent, Math.min(...glyphIds.keys()), Math.max(...glyphIds.keys())),
    cmap: cmap(glyphIds),
    glyf: concat(glyf),
    head: head(advance, ascent, descent, height * UNIT),
    hhea: hhea(advance, ascent, descent, numGlyphs),
    hmtx: hmtx(shapes, advance),
    loca: u32s(loca),
    maxp: maxp(numGlyphs, maxPoints, maxContours),
    name: name(family),
    post: post(),
  };
  return sfnt(tables);
}

// Merge lit pixels into rectangles: horizontal runs, extended down while identical.
function rectangles(bits, w, h) {
  const used = new Uint8Array(w * h), rects = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!bits[y * w + x] || used[y * w + x]) continue;
      let x1 = x; while (x1 + 1 < w && bits[y * w + x1 + 1] && !used[y * w + x1 + 1]) x1++;
      let y1 = y;
      for (;;) {
        const ny = y1 + 1; if (ny >= h) break;
        let ok = true; for (let i = x; i <= x1; i++) if (!bits[ny * w + i] || used[ny * w + i]) { ok = false; break; }
        if (!ok || (x > 0 && bits[ny * w + x - 1] && !used[ny * w + x - 1]) || (x1 + 1 < w && bits[ny * w + x1 + 1] && !used[ny * w + x1 + 1])) break;
        y1 = ny;
      }
      for (let j = y; j <= y1; j++) for (let i = x; i <= x1; i++) used[j * w + i] = 1;
      rects.push([x, y, x1 + 1, y1 + 1]);
    }
  }
  return rects;
}

function glyphData(rects, h, descent) {
  if (!rects.length) return new Uint8Array(0);
  // Bitmap rows run downward; font y runs upward from the baseline, one row above the cell bottom.
  const pts = [];
  for (const [x0, y0, x1, y1] of rects) {
    const X0 = x0 * UNIT, X1 = x1 * UNIT, Ytop = (h - y0) * UNIT - descent, Ybot = (h - y1) * UNIT - descent;
    pts.push([X0, Ybot], [X0, Ytop], [X1, Ytop], [X1, Ybot]); // clockwise
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const n = pts.length, out = new DataView(new ArrayBuffer(10 + rects.length * 2 + 2 + n + n * 4 + 1));
  let o = 0;
  const i16 = v => { out.setInt16(o, v); o += 2; }, u16 = v => { out.setUint16(o, v); o += 2; }, u8 = v => { out.setUint8(o, v); o += 1; };
  i16(rects.length); i16(Math.min(...xs)); i16(Math.min(...ys)); i16(Math.max(...xs)); i16(Math.max(...ys));
  rects.forEach((_, i) => u16(i * 4 + 3));
  u16(0); // no instructions
  for (let i = 0; i < n; i++) u8(1); // on-curve, 16-bit deltas
  let px = 0; for (const x of xs) { i16(x - px); px = x; }
  let py = 0; for (const y of ys) { i16(y - py); py = y; }
  const bytes = new Uint8Array(out.buffer, 0, o);
  return o % 4 ? concat([bytes, new Uint8Array(4 - (o % 4))]) : bytes;
}

function hmtx(shapes, advance) {
  const view = new DataView(new ArrayBuffer(shapes.length * 4));
  shapes.forEach((rects, i) => { view.setUint16(i * 4, advance); view.setInt16(i * 4 + 2, rects.length ? Math.min(...rects.map(r => r[0])) * UNIT : 0); });
  return new Uint8Array(view.buffer);
}

function cmap(glyphIds) {
  const codes = [...glyphIds.keys()].sort((a, b) => a - b);
  const segs = codes.map(c => ({ start: c, end: c, delta: (glyphIds.get(c) - c) & 0xffff }));
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const segCount = segs.length, sub = new DataView(new ArrayBuffer(16 + segCount * 8));
  const log = Math.floor(Math.log2(segCount)), searchRange = 2 * 2 ** log;
  let o = 0; const u16 = v => { sub.setUint16(o, v); o += 2; };
  u16(4); u16(sub.byteLength); u16(0); u16(segCount * 2); u16(searchRange); u16(log); u16(segCount * 2 - searchRange);
  segs.forEach(s => u16(s.end)); u16(0); segs.forEach(s => u16(s.start)); segs.forEach(s => u16(s.delta)); segs.forEach(() => u16(0));
  const header = new DataView(new ArrayBuffer(12));
  header.setUint16(0, 0); header.setUint16(2, 1); header.setUint16(4, 3); header.setUint16(6, 1); header.setUint32(8, 12);
  return concat([new Uint8Array(header.buffer), new Uint8Array(sub.buffer)]);
}

function head(advance, ascent, descent, em) {
  const v = new DataView(new ArrayBuffer(54));
  v.setUint32(0, 0x10000); v.setUint32(4, 0x10000); v.setUint32(8, 0); v.setUint32(12, 0x5f0f3cf5);
  v.setUint16(16, 0x000b); v.setUint16(18, em); // unitsPerEm: the whole cell
  v.setUint32(24, 0xe0000000); v.setUint32(32, 0xe0000000); // created / modified (any date)
  v.setInt16(36, 0); v.setInt16(38, -descent); v.setInt16(40, advance); v.setInt16(42, ascent);
  v.setUint16(44, 0); v.setUint16(46, 6); v.setInt16(48, 2); v.setInt16(50, 1); v.setInt16(52, 0);
  return new Uint8Array(v.buffer);
}

function hhea(advance, ascent, descent, numGlyphs) {
  const v = new DataView(new ArrayBuffer(36));
  v.setUint32(0, 0x10000); v.setInt16(4, ascent); v.setInt16(6, -descent); v.setInt16(8, 0);
  v.setUint16(10, advance); v.setInt16(12, 0); v.setInt16(14, 0); v.setInt16(16, advance);
  v.setInt16(18, 1); v.setInt16(20, 0); v.setInt16(22, 0); v.setUint16(34, numGlyphs);
  return new Uint8Array(v.buffer);
}

function maxp(numGlyphs, maxPoints, maxContours) {
  const v = new DataView(new ArrayBuffer(32));
  v.setUint32(0, 0x10000); v.setUint16(4, numGlyphs); v.setUint16(6, Math.max(1, maxPoints)); v.setUint16(8, Math.max(1, maxContours));
  v.setUint16(14, 2); // maxZones
  return new Uint8Array(v.buffer);
}

function os2(advance, ascent, descent, first, last) {
  const v = new DataView(new ArrayBuffer(96));
  v.setUint16(0, 4); v.setInt16(2, advance); v.setUint16(4, 400); v.setUint16(6, 5); v.setUint16(8, 0);
  v.setInt16(10, ascent / 2); v.setInt16(12, ascent / 2); v.setInt16(14, 0); v.setInt16(16, ascent / 8);
  v.setInt16(18, ascent / 2); v.setInt16(20, ascent / 2); v.setInt16(22, 0); v.setInt16(24, ascent / 2);
  v.setInt16(26, UNIT / 2); v.setInt16(28, ascent / 2); v.setInt16(30, 0);
  v.setUint32(42, 1); // Basic Latin
  [66, 84, 67, 72].forEach((c, i) => v.setUint8(58 + i, c)); // vendor "BTCH"
  v.setUint16(62, 0x00c0); v.setUint16(64, first); v.setUint16(66, Math.min(last, 0xffff));
  v.setInt16(68, ascent); v.setInt16(70, -descent); v.setInt16(72, 0); v.setUint16(74, ascent); v.setUint16(76, descent);
  v.setUint32(78, 1); v.setUint32(82, 0); v.setInt16(86, ascent); v.setInt16(88, ascent);
  v.setUint16(90, 0); v.setUint16(92, 32); v.setUint16(94, 1);
  return new Uint8Array(v.buffer);
}

function name(family) {
  const clean = family.replace(/[^\x20-\x7e]/g, '').slice(0, 40) || 'Kit Pixel';
  const ps = clean.replace(/[^A-Za-z0-9-]/g, '') || 'KitPixel';
  const records = [[1, clean], [2, 'Regular'], [3, `${ps}-Regular`], [4, clean], [6, ps]];
  const strings = records.map(([, s]) => { const b = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { b[i * 2] = 0; b[i * 2 + 1] = s.charCodeAt(i); } return b; });
  const header = new DataView(new ArrayBuffer(6 + records.length * 12));
  header.setUint16(0, 0); header.setUint16(2, records.length); header.setUint16(4, header.byteLength);
  let offset = 0;
  records.forEach(([id], i) => {
    const o = 6 + i * 12;
    header.setUint16(o, 3); header.setUint16(o + 2, 1); header.setUint16(o + 4, 0x409); header.setUint16(o + 6, id);
    header.setUint16(o + 8, strings[i].length); header.setUint16(o + 10, offset); offset += strings[i].length;
  });
  return concat([new Uint8Array(header.buffer), ...strings]);
}

function post() {
  const v = new DataView(new ArrayBuffer(32));
  v.setUint32(0, 0x30000); v.setInt16(8, -UNIT / 2); v.setInt16(10, UNIT / 2); v.setUint32(12, 1);
  return new Uint8Array(v.buffer);
}

function u32s(values) {
  const v = new DataView(new ArrayBuffer(values.length * 4));
  values.forEach((value, i) => v.setUint32(i * 4, value));
  return new Uint8Array(v.buffer);
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function checksum(bytes) {
  const padded = new Uint8Array((bytes.length + 3) & ~3); padded.set(bytes);
  const v = new DataView(padded.buffer); let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
  return sum;
}

function sfnt(tables) {
  const tags = Object.keys(tables).sort();
  const n = tags.length, log = Math.floor(Math.log2(n));
  const headerSize = 12 + n * 16;
  let offset = headerSize;
  const records = tags.map(tag => { const data = tables[tag]; const rec = { tag, data, offset, sum: checksum(data) }; offset += (data.length + 3) & ~3; return rec; });
  const out = new Uint8Array(offset), v = new DataView(out.buffer);
  v.setUint32(0, 0x10000); v.setUint16(4, n); v.setUint16(6, 16 * 2 ** log); v.setUint16(8, log); v.setUint16(10, n * 16 - 16 * 2 ** log);
  records.forEach((r, i) => {
    const o = 12 + i * 16;
    for (let k = 0; k < 4; k++) v.setUint8(o + k, r.tag.charCodeAt(k));
    v.setUint32(o + 4, r.sum); v.setUint32(o + 8, r.offset); v.setUint32(o + 12, r.data.length);
    out.set(r.data, r.offset);
  });
  const headRecord = records.find(r => r.tag === 'head');
  v.setUint32(headRecord.offset + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out;
}
