import test from 'node:test';
import assert from 'node:assert/strict';

// Just enough ImageData for the pixel math (browsers have the real one).
globalThis.ImageData ??= class {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
};
const { scale2x, scaleBits, hdScale, comfortColor, comfortPalette } = await import('../src/skin-enhance.js');
const { contrast } = await import('../src/skin-kit.js');

// A picture from rows of characters: '#' ink, '.' paper.
const INK = [20, 20, 30],
  PAPER = [230, 230, 220];
function picture(rows, colors = { '#': INK, '.': PAPER }) {
  const img = new ImageData(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => img.data.set([...colors[ch], 255], (y * img.width + x) * 4)));
  return img;
}
const isInk = (img, x, y) => img.data[(y * img.width + x) * 4] < 128;
const nearest = (img, k) => {
  const out = new ImageData(img.width * k, img.height * k);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++)
      out.data.set(
        img.data.subarray(
          (((y / k) | 0) * img.width + ((x / k) | 0)) * 4,
          (((y / k) | 0) * img.width + ((x / k) | 0)) * 4 + 4,
        ),
        (y * out.width + x) * 4,
      );
  return out;
};
const changed = (a, b) => {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i]) n++;
  return n;
};

test('HD smooths staircases on filled shapes and slanted lines', () => {
  const stair = picture(['#.....', '##....', '###...', '####..', '#####.', '######']);
  const out = scale2x(stair);
  assert.ok(changed(out, nearest(stair, 2)) > 0, 'a filled 45° staircase gets diagonal corners');
  // The outer corner of each step is cut and the inner corner filled.
  assert.equal(isInk(out, 3, 2), false, 'the step corner is cut');
  const line = picture(['#.....', '.#....', '..#...', '...#..', '....#.', '.....#']);
  assert.ok(changed(scale2x(line), nearest(line, 2)) > 0, 'a 1-pixel diagonal line gets joined');
});

test('HD keeps square corners and the arms of +, T and L sharp', () => {
  for (const rows of [
    ['......', '.####.', '.####.', '.####.', '.####.', '......'], // a square
    ['..#..', '..#..', '#####', '..#..', '..#..'], // a plus
    ['#####', '..#..', '..#..', '..#..', '..#..'], // a T
    ['#....', '#....', '#....', '#....', '#####'], // an L
  ]) {
    const img = picture(rows);
    assert.equal(changed(scale2x(img), nearest(img, 2)), 0, rows.join('/'));
  }
});

test('HD lettering: same rules on glyph bits, staircases smooth and crossings stay', () => {
  const bits = rows =>
    Uint8Array.from(
      rows
        .join('')
        .split('')
        .map(c => (c === '#' ? 1 : 0)),
    );
  const plus = scaleBits(bits(['.....', '..#..', '.###.', '..#..', '.....', '.....']), 5, 6);
  const blocky = scaleBits(bits(['.....', '.....', '.....', '.....', '.....', '.....']), 5, 6);
  assert.equal(
    plus.reduce((a, b) => a + b, 0),
    5 * 4,
    'a plus keeps exactly its five pixels',
  );
  assert.equal(
    blocky.reduce((a, b) => a + b, 0),
    0,
  );
  const slash = scaleBits(bits(['....#', '...#.', '..#..', '.#...', '#....', '.....']), 5, 6);
  assert.ok(slash.reduce((a, b) => a + b, 0) > 5 * 4, 'a slash gets its joints filled');
});

test('HD interpolates soft gradients smoothly, without a sawtooth', () => {
  const ramp = new ImageData(8, 8);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const v = 100 + (x + y) * 10;
      ramp.data.set([v, v, v, 255], (y * 8 + x) * 4);
    }
  const out = hdScale(ramp);
  for (let y = 8; y < 24; y++)
    for (let x = 8; x < 23; x++) {
      assert.ok(out.data[(y * 32 + x + 1) * 4] >= out.data[(y * 32 + x) * 4], `row ${y} rises left to right at ${x}`);
    }
});

test('HD tiles wrap around, so a repeated piece has no seams', () => {
  const tile = picture(['#..#..', '.#..#.', '..#..#', '#..#..', '.#..#.', '..#..#']);
  const strip = picture([
    '#..#..#..#..#..#..',
    '.#..#..#..#..#..#.',
    '..#..#..#..#..#..#',
    '#..#..#..#..#..#..',
    '.#..#..#..#..#..#.',
    '..#..#..#..#..#..#',
  ]);
  const alone = hdScale(tile, { wrapX: true, wrapY: true }),
    middle = hdScale(strip, { wrapY: true });
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      assert.equal(alone.data[(y * 24 + x) * 4], middle.data[(y * 72 + 24 + x) * 4], `pixel ${x},${y}`);
    }
});

// The HD rules written out plainly, one sub-pixel at a time, with no lookup tables or shortcuts. The
// page's own code must give exactly these pixels: every look the decks wear depends on them.
const edge = (n, size, wrap) => (wrap ? ((n % size) + size) % size : Math.max(0, Math.min(size - 1, n)));
function plainScale2x(src, { wrapX = false, wrapY = false } = {}) {
  const { width: w, height: h } = src,
    s = new Uint32Array(src.data.buffer, 0, w * h),
    out = new ImageData(w * 2, h * 2),
    o = new Uint32Array(out.data.buffer);
  const eq = (p, q) =>
    p === q ||
    (p >>> 24 === q >>> 24 &&
      (!(p >>> 24) ||
        Math.abs((p & 255) - (q & 255)) +
          Math.abs(((p >>> 8) & 255) - ((q >>> 8) & 255)) +
          Math.abs(((p >>> 16) & 255) - ((q >>> 16) & 255)) <=
          24));
  const at = (x, y) => s[edge(y, h, wrapY) * w + edge(x, w, wrapX)];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [E, B, H, D, F] = [at(x, y), at(x, y - 1), at(x, y + 1), at(x - 1, y), at(x + 1, y)];
      const bends = (dx, dy, K) =>
        !eq(at(x + dx, y + dy), K) ||
        (eq(at(x + dx, y - dy), E) && eq(at(x + 2 * dx, y - dy), K)) ||
        (eq(at(x - dx, y + dy), E) && eq(at(x - dx, y + 2 * dy), K));
      const diagonals = !eq(B, H) && !eq(D, F);
      const r = y * 4 * w + x * 2;
      o[r] = diagonals && eq(D, B) && bends(-1, -1, D) ? D : E;
      o[r + 1] = diagonals && eq(B, F) && bends(1, -1, F) ? F : E;
      o[r + w * 2] = diagonals && eq(D, H) && bends(-1, 1, D) ? D : E;
      o[r + w * 2 + 1] = diagonals && eq(H, F) && bends(1, 1, F) ? F : E;
    }
  return out;
}
function plainHdScale(src, { soft = true, wrapX = false, wrapY = false } = {}) {
  const { width: w, height: h, data: s } = src,
    out = plainScale2x(plainScale2x(src, { wrapX, wrapY }), { wrapX, wrapY }),
    o = out.data,
    OFF = [-0.375, -0.125, 0.125, 0.375];
  if (!soft) return out;
  const idx = (x, y) => (edge(y, h, wrapY) * w + edge(x, w, wrapX)) * 4;
  const near = (i, j) =>
    s[j + 3] === 255 && Math.abs(s[i] - s[j]) + Math.abs(s[i + 1] - s[j + 1]) + Math.abs(s[i + 2] - s[j + 2]) <= 42;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const e = idx(x, y);
      if (s[e + 3] !== 255) continue;
      const inSoft =
        near(e, idx(x, y - 1)) && near(e, idx(x, y + 1)) && near(e, idx(x - 1, y)) && near(e, idx(x + 1, y));
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
          const p = ((y * 4 + j) * w * 4 + x * 4 + i) * 4;
          if (!inSoft && (o[p] !== s[e] || o[p + 1] !== s[e + 1] || o[p + 2] !== s[e + 2] || o[p + 3] !== 255))
            continue;
          const [u, v] = [Math.abs(OFF[i]), Math.abs(OFF[j])],
            [dx, dy] = [Math.sign(OFF[i]), Math.sign(OFF[j])];
          const [nh, nv, nd] = [idx(x + dx, y), idx(x, y + dy), idx(x + dx, y + dy)];
          const wE = (1 - u) * (1 - v),
            wH = near(e, nh) ? u * (1 - v) : 0,
            wV = near(e, nv) ? (1 - u) * v : 0,
            wD = wH && wV && near(e, nd) ? u * v : 0;
          for (let c = 0; c < 3; c++)
            o[p + c] = (s[e + c] * wE + s[nh + c] * wH + s[nv + c] * wV + s[nd + c] * wD) / (wE + wH + wV + wD);
          o[p + 3] = 255;
        }
    }
  return out;
}

test('HD gives exactly the pixels of its plain rules, on every kind of skin art', () => {
  let seed = 2024;
  const random = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
  const pick = list => list[Math.floor(random() * list.length)];
  // Pixel art: flat blocks and their edges, slanted lines and staircases (where Scale2x bends corners),
  // colors a hair apart, gradients, holes and half-transparent spots.
  function art(w, h) {
    const img = new ImageData(w, h),
      palette = Array.from({ length: 2 + Math.floor(random() * 4) }, () => [0, 0, 0].map(() => random() * 256));
    const fill = (x0, y0, x1, y1, color) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.data.set([...color, 255], (y * w + x) * 4);
    };
    fill(0, 0, w, h, pick(palette));
    for (let n = Math.floor(random() * 6); n > 0; n--) {
      const x = Math.floor(random() * w),
        y = Math.floor(random() * h);
      fill(x, y, x + 1 + Math.floor(random() * (w - x)), y + 1 + Math.floor(random() * (h - y)), pick(palette));
    }
    for (let n = Math.floor(random() * 4); n > 0; n--) {
      const color = pick(palette),
        dx = random() < 0.5 ? 1 : -1,
        step = 1 + Math.floor(random() * 2);
      let x = Math.floor(random() * w),
        y = Math.floor(random() * h);
      for (let k = 0; x >= 0 && x < w && y < h; k++, x += dx) {
        fill(x, y, x + 1, y + 1, color);
        if (k % step === step - 1) y++;
      }
    }
    for (let i = 0; i < w * h; i++) {
      const roll = random(),
        p = i * 4;
      if (roll < 0.15) for (let c = 0; c < 3; c++) img.data[p + c] += (random() - 0.5) * 30;
      else if (roll < 0.2) img.data.set([(i % w) * 9, ((i / w) | 0) * 7, 128], p);
      else if (roll < 0.23) img.data[p + 3] = 0;
      else if (roll < 0.25) img.data[p + 3] = 128;
    }
    return img;
  }
  const copy = img => {
    const c = new ImageData(img.width, img.height);
    c.data.set(img.data);
    return c;
  };
  for (let n = 0; n < 250; n++) {
    const img = art(1 + Math.floor(random() * 20), 1 + Math.floor(random() * 20));
    for (const options of [{}, { wrapX: true }, { wrapY: true }, { wrapX: true, wrapY: true }, { soft: false }])
      assert.deepEqual(
        hdScale(copy(img), options).data,
        plainHdScale(copy(img), options).data,
        `${img.width}×${img.height}`,
      );
  }
});

test('Comfort: no pure black or white, loud colors calmer, hue and gray kept', () => {
  assert.equal(comfortColor('#000000'), '#0f0f0f');
  assert.equal(comfortColor('#ffffff'), '#eeeeee');
  assert.equal(comfortColor('#808080'), '#808080', 'the middle is untouched');
  const [r, g, b] = [1, 3, 5].map(i => parseInt(comfortColor('#ff0000').slice(i, i + 2), 16));
  assert.ok(r > g + 100 && Math.abs(g - b) < 20 && r < 255, 'red stays red, only softer');
  const mute = comfortColor('#7a8a7a');
  assert.ok(Math.abs(parseInt(mute.slice(1, 3), 16) - 0x7a) <= 3, 'muted colors stay as they are');
});

test('Comfort keeps every text pair readable, even when one color is both text and background', () => {
  const palette = {
    desk: '#757b0e',
    accent: '#000000',
    accentText: '#757b0e',
    accentDim: '#000000',
    deskDim: '#000000',
    listBg: '#101010',
    listFg: '#202020',
    face: '#c0c0c0',
    faceText: '#b0b0b0',
  };
  const c = comfortPalette(palette);
  for (const [fg, bg] of [
    ['accentText', 'accent'],
    ['accent', 'desk'],
    ['deskDim', 'desk'],
    ['listFg', 'listBg'],
    ['faceText', 'face'],
  ]) {
    assert.ok(contrast(c[fg], c[bg]) >= 4.5, `${fg} on ${bg}: ${contrast(c[fg], c[bg]).toFixed(2)}`);
  }
});
