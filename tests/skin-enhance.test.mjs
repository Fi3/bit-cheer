import test from 'node:test';
import assert from 'node:assert/strict';

// Just enough ImageData for the pixel math (browsers have the real one).
globalThis.ImageData ??= class { constructor(width, height) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4); } };
const { scale2x, scaleBits, hdScale, comfortColor, comfortPalette } = await import('../src/skin-enhance.js');
const { contrast } = await import('../src/skin-kit.js');

// A picture from rows of characters: '#' ink, '.' paper.
const INK = [20, 20, 30], PAPER = [230, 230, 220];
function picture(rows, colors = { '#': INK, '.': PAPER }) {
  const img = new ImageData(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => img.data.set([...colors[ch], 255], (y * img.width + x) * 4)));
  return img;
}
const isInk = (img, x, y) => img.data[(y * img.width + x) * 4] < 128;
const nearest = (img, k) => { const out = new ImageData(img.width * k, img.height * k); for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) out.data.set(img.data.subarray(((y / k | 0) * img.width + (x / k | 0)) * 4, ((y / k | 0) * img.width + (x / k | 0)) * 4 + 4), (y * out.width + x) * 4); return out; };
const changed = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i]) n++; return n; };

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
  const bits = rows => Uint8Array.from(rows.join('').split('').map(c => c === '#' ? 1 : 0));
  const plus = scaleBits(bits(['.....', '..#..', '.###.', '..#..', '.....', '.....']), 5, 6);
  const blocky = scaleBits(bits(['.....', '.....', '.....', '.....', '.....', '.....']), 5, 6);
  assert.equal(plus.reduce((a, b) => a + b, 0), 5 * 4, 'a plus keeps exactly its five pixels');
  assert.equal(blocky.reduce((a, b) => a + b, 0), 0);
  const slash = scaleBits(bits(['....#', '...#.', '..#..', '.#...', '#....', '.....']), 5, 6);
  assert.ok(slash.reduce((a, b) => a + b, 0) > 5 * 4, 'a slash gets its joints filled');
});

test('HD interpolates soft gradients smoothly, without a sawtooth', () => {
  const ramp = new ImageData(8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = 100 + (x + y) * 10; ramp.data.set([v, v, v, 255], (y * 8 + x) * 4); }
  const out = hdScale(ramp);
  for (let y = 8; y < 24; y++) for (let x = 8; x < 23; x++) {
    assert.ok(out.data[(y * 32 + x + 1) * 4] >= out.data[(y * 32 + x) * 4], `row ${y} rises left to right at ${x}`);
  }
});

test('HD tiles wrap around, so a repeated piece has no seams', () => {
  const tile = picture(['#..#..', '.#..#.', '..#..#', '#..#..', '.#..#.', '..#..#']);
  const strip = picture(['#..#..#..#..#..#..', '.#..#..#..#..#..#.', '..#..#..#..#..#..#', '#..#..#..#..#..#..', '.#..#..#..#..#..#.', '..#..#..#..#..#..#']);
  const alone = hdScale(tile, { wrapX: true, wrapY: true }), middle = hdScale(strip, { wrapY: true });
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    assert.equal(alone.data[(y * 24 + x) * 4], middle.data[(y * 72 + 24 + x) * 4], `pixel ${x},${y}`);
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
  const palette = { desk: '#757b0e', accent: '#000000', accentText: '#757b0e', accentDim: '#000000', deskDim: '#000000', listBg: '#101010', listFg: '#202020', face: '#c0c0c0', faceText: '#b0b0b0' };
  const c = comfortPalette(palette);
  for (const [fg, bg] of [['accentText', 'accent'], ['accent', 'desk'], ['deskDim', 'desk'], ['listFg', 'listBg'], ['faceText', 'face']]) {
    assert.ok(contrast(c[fg], c[bg]) >= 4.5, `${fg} on ${bg}: ${contrast(c[fg], c[bg]).toFixed(2)}`);
  }
});
