// Makes any classic Winamp skin a little easier on the eyes and sharper, automatically, without
// changing what makes it that skin: every shape, position and hue stays where the author put it.
//
// - Comfort: no pure black or pure white, loud colors calmed (muted ones stay), calmer fine texture
//   (dithering, grain), softer bevels, and text colors that stay readable without glaring or shimmering.
// - HD: every picture redrawn at four times its resolution. Hard pixel edges follow a style-preserving
//   pixel-art scaler (the AdvMAME/Scale2x rules, twice), so staircases become diagonals without blur;
//   painted areas (portraits, shading) are interpolated smoothly instead of showing blocks. The skin's
//   lettering is rebuilt the same way, so labels get smooth diagonals.
//
// It runs on the stored kit when a skin is shown; the stored kit itself never changes, so switching
// back to "Original pixels" is always exact.
import { buildPixelFont } from './pixel-font.js';
import { hex, rgb, mix, readable, textGlyphs, fontDataUrl } from './skin-kit.js';

export const RENDER_MODES = ['original', 'comfort', 'hd'];
export const HD_SCALE = 4;
const HEX = /^#[0-9a-f]{6}$/i;

// ---------- color (OKLab) ----------
const toLinear = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = v => Math.round(Math.max(0, Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)) * 255);
function oklab(r, g, b) {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function fromOklab(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
}
// The comfort curve, in OKLab so every step looks even. Hue never moves.
// - Lightness: the darkest tones lift a little (pure black becomes #0f0f0f) and the brightest come
//   down a little (pure white becomes #eeeeee); the middle is untouched.
// - Chroma: muted colors stay as they are; loud ones calm the most (pure red becomes a softer red),
//   so a skin keeps its colors without glaring.
function comfortRgb(r, g, b) {
  const [L, A, B] = oklab(r, g, b), C = Math.hypot(A, B);
  const l = L + 0.17 * Math.max(0, 1 - L / 0.45) ** 2 - 0.05 * Math.max(0, (L - 0.7) / 0.3) ** 2;
  const c = (C <= 0.07 ? C : 0.07 + (C - 0.07) * 0.6) * 0.95, k = C ? c / C : 0;
  return fromOklab(l, A * k, B * k);
}
export const comfortColor = h => hex(...comfortRgb(...rgb(h)));
const chroma = h => { const [, a, b] = oklab(...rgb(h)); return Math.hypot(a, b); };
const hue = h => { const [, a, b] = oklab(...rgb(h)); return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360; };

// Text over its background, for the readability pass (foreground first).
const TEXT_PAIRS = [['listFg', 'listBg'], ['listHi', 'listBg'], ['listSelFg', 'listSel'], ['listDim', 'listBg'], ['lcdFg', 'lcdBg'], ['lcdDim', 'lcdBg'],
  ['numFg', 'numBg'], ['numDim', 'numBg'], ['faceText', 'face'], ['accentText', 'accent'], ['title', 'titleBg'], ['titleDim', 'titleBg'],
  ['deskDim', 'desk'], ['accent', 'desk'], ['accentDim', 'desk']];

export function comfortPalette(colors) {
  const c = {};
  for (const [key, value] of Object.entries(colors || {})) c[key] = HEX.test(value || '') ? comfortColor(value) : value;
  // Bevels: the same light and shade, a little gentler.
  if (c.face) { c.faceLight = mix(c.face, '#ffffff', 0.3); c.faceDark = mix(c.face, '#000000', 0.4); }
  if (c.frame) { c.frameLight = mix(c.frame, '#ffffff', 0.28); c.frameDark = mix(c.frame, '#000000', 0.5); }
  // Saturated text on a saturated background of a far-off hue (red on blue) seems to vibrate:
  // lean the text toward white, which keeps its hue but stops the shimmer.
  for (const [fg, bg] of TEXT_PAIRS) {
    if (!HEX.test(c[fg] || '') || !HEX.test(c[bg] || '')) continue;
    const gap = Math.abs(hue(c[fg]) - hue(c[bg])), far = Math.min(gap, 360 - gap) > 100;
    if (far && chroma(c[fg]) > 0.12 && chroma(c[bg]) > 0.1) c[fg] = mix(c[fg], '#ffffff', 0.35);
  }
  // Then every pair readable. A color can be text in one pair and background in another (the accent),
  // so the pass repeats until nothing moves.
  for (let round = 0; round < 4; round++) {
    let moved = false;
    for (const [fg, bg] of TEXT_PAIRS) {
      if (!HEX.test(c[fg] || '') || !HEX.test(c[bg] || '')) continue;
      const next = readable(c[fg], c[bg], 4.5);
      if (next !== c[fg]) { c[fg] = next; moved = true; }
    }
    if (!moved) break;
  }
  return c;
}

// ---------- images ----------
async function load(src) {
  const img = new Image(); img.src = src; await img.decode();
  const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  return { canvas, data: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}
async function save(data) {
  const canvas = document.createElement('canvas'); canvas.width = data.width; canvas.height = data.height;
  canvas.getContext('2d').putImageData(data, 0, 0);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return URL.createObjectURL(blob);
}

// The comfort curve on every opaque pixel (skins use few colors, so each is converted once).
function comfortImage(data) {
  const d = data.data, cache = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const key = d[i] << 16 | d[i + 1] << 8 | d[i + 2];
    let c = cache.get(key);
    if (!c) { c = comfortRgb(d[i], d[i + 1], d[i + 2]); cache.set(key, c); }
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  return data;
}

// A neighbour's index: clamped at the edges, or wrapped around for pieces the page repeats as tiles
// (title bar fill, window sides), so their seams stay invisible.
const edge = (n, size, wrap) => wrap ? ((n % size) + size) % size : Math.max(0, Math.min(size - 1, n));

// Calmer fine texture (dithering, grain, noisy gradients) with every edge kept: each pixel takes the
// average of its neighbours that are already close to it in color; anything farther (an edge, a
// letter, an icon) is left out of the average.
function calmTexture(data, { range = 30, wrapX = false, wrapY = false } = {}) {
  const { width: w, height: h } = data, src = data.data, out = new Uint8ClampedArray(src);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3] < 255) continue;
    let r = src[i] * 2, g = src[i + 1] * 2, b = src[i + 2] * 2, n = 2;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || (!wrapX && (x + dx < 0 || x + dx >= w)) || (!wrapY && (y + dy < 0 || y + dy >= h))) continue;
      const j = (edge(y + dy, h, wrapY) * w + edge(x + dx, w, wrapX)) * 4;
      if (src[j + 3] < 255 || Math.abs(src[j] - src[i]) + Math.abs(src[j + 1] - src[i + 1]) + Math.abs(src[j + 2] - src[i + 2]) > range) continue;
      r += src[j]; g += src[j + 1]; b += src[j + 2]; n++;
    }
    out[i] = r / n; out[i + 1] = g / n; out[i + 2] = b / n;
  }
  data.data.set(out);
  return data;
}

// Style-preserving pixel-art magnification, the AdvMAME2x / Scale2x rules: each pixel becomes 2 × 2,
// and where two neighbours meet on a diagonal the corner takes their color, so staircases become
// smooth diagonals. One rule is added so square corners (window frames, buttons) and crossings
// (+, T, L) stay sharp: a corner changes only where the pixel across it differs from the color coming
// in (an outline's bend: the top of an A, an O), or where the staircase carries on for another step
// (a slanted edge or line). Colors that differ by a hair count as equal, so noisy art scales cleanly.
export function scale2x(src, { tolerance = 24, wrapX = false, wrapY = false } = {}) {
  const w = src.width, h = src.height, s = new Uint32Array(src.data.buffer, src.data.byteOffset, w * h);
  const out = new ImageData(w * 2, h * 2), o = new Uint32Array(out.data.buffer), W = w * 2;
  const eq = (p, q) => {
    if (p === q) return true;
    const pa = p >>> 24, qa = q >>> 24;
    if (pa !== qa) return false;
    if (!pa) return true;
    return Math.abs((p & 255) - (q & 255)) + Math.abs((p >>> 8 & 255) - (q >>> 8 & 255)) + Math.abs((p >>> 16 & 255) - (q >>> 16 & 255)) <= tolerance;
  };
  const at = (x, y) => s[edge(y, h, wrapY) * w + edge(x, w, wrapX)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const E = s[y * w + x], B = at(x, y - 1), H = at(x, y + 1), D = at(x - 1, y), F = at(x + 1, y);
    let e0 = E, e1 = E, e2 = E, e3 = E;
    if (!eq(B, H) && !eq(D, F)) {
      // The corner toward (dx, dy), where `K` comes in from both sides.
      const bends = (dx, dy, K) => !eq(at(x + dx, y + dy), K)
        || (eq(at(x + dx, y - dy), E) && eq(at(x + 2 * dx, y - dy), K)) || (eq(at(x - dx, y + dy), E) && eq(at(x - dx, y + 2 * dy), K));
      if (eq(D, B) && bends(-1, -1, D)) e0 = D;
      if (eq(B, F) && bends(1, -1, F)) e1 = F;
      if (eq(D, H) && bends(-1, 1, D)) e2 = D;
      if (eq(H, F) && bends(1, 1, F)) e3 = F;
    }
    const r = y * 2 * W + x * 2;
    o[r] = e0; o[r + 1] = e1; o[r + W] = e2; o[r + W + 1] = e3;
  }
  return out;
}

// HD: four times the pixels. Hard edges follow the Scale2x rules (twice), so staircases become clean
// diagonals and nothing blurs; soft areas (painted pictures, shading, gradients) are interpolated
// smoothly between neighbours that are already close in color, so they stop showing as blocks.
// `soft: false` keeps the pure pixel-art result (lettering, digits).
export function hdScale(src, { soft = true, softRange = 42, wrapX = false, wrapY = false } = {}) {
  const w = src.width, h = src.height, s = src.data, wrap = { wrapX, wrapY };
  const out = scale2x(scale2x(src, wrap), wrap), o = out.data, W = w * 4;
  if (!soft) return out;
  const OFF = [-0.375, -0.125, 0.125, 0.375];
  const idx = (x, y) => (edge(y, h, wrapY) * w + edge(x, w, wrapX)) * 4;
  const near = (i, j) => s[j + 3] === 255 && Math.abs(s[i] - s[j]) + Math.abs(s[i + 1] - s[j + 1]) + Math.abs(s[i + 2] - s[j + 2]) <= softRange;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = idx(x, y);
    if (s[e + 3] !== 255) continue;
    // A pixel whose four neighbours are all close to it lies in a soft area (a painted picture, a
    // gradient) and is interpolated through and through; elsewhere the Scale2x diagonals stay and only
    // the spots they left alone lean toward close neighbours.
    const inSoft = near(e, idx(x, y - 1)) && near(e, idx(x, y + 1)) && near(e, idx(x - 1, y)) && near(e, idx(x + 1, y));
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const p = ((y * 4 + j) * W + x * 4 + i) * 4;
      if (!inSoft && (o[p] !== s[e] || o[p + 1] !== s[e + 1] || o[p + 2] !== s[e + 2] || o[p + 3] !== 255)) continue;
      const u = Math.abs(OFF[i]), v = Math.abs(OFF[j]), dx = OFF[i] < 0 ? -1 : 1, dy = OFF[j] < 0 ? -1 : 1;
      const nh = idx(x + dx, y), nv = idx(x, y + dy), nd = idx(x + dx, y + dy);
      const wE = (1 - u) * (1 - v), wH = near(e, nh) ? u * (1 - v) : 0, wV = near(e, nv) ? (1 - u) * v : 0;
      const wD = wH && wV && near(e, nd) ? u * v : 0, sum = wE + wH + wV + wD;
      for (let c = 0; c < 3; c++) o[p + c] = (s[e + c] * wE + s[nh + c] * wH + s[nv + c] * wV + s[nd + c] * wD) / sum;
      o[p + 3] = 255;
    }
  }
  return out;
}

// The same rules on a 1-bit glyph (ink 1, paper 0), where everything outside the cell is paper.
export function scaleBits(bits, w, h) {
  const out = new Uint8Array(w * 2 * h * 2), W = w * 2, at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : bits[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const E = at(x, y), B = at(x, y - 1), H = at(x, y + 1), D = at(x - 1, y), F = at(x + 1, y);
    let e0 = E, e1 = E, e2 = E, e3 = E;
    if (B !== H && D !== F) {
      const bends = (dx, dy, K) => at(x + dx, y + dy) !== K
        || (at(x + dx, y - dy) === E && at(x + 2 * dx, y - dy) === K) || (at(x - dx, y + dy) === E && at(x - dx, y + 2 * dy) === K);
      if (D === B && bends(-1, -1, D)) e0 = D;
      if (B === F && bends(1, -1, F)) e1 = F;
      if (D === H && bends(-1, 1, D)) e2 = D;
      if (H === F && bends(1, 1, F)) e3 = F;
    }
    const r = y * 2 * W + x * 2;
    out[r] = e0; out[r + 1] = e1; out[r + W] = e2; out[r + W + 1] = e3;
  }
  return out;
}

// The skin's lettering, four times finer: same letters, smooth diagonals. The stored sheet is padded
// to Winamp's size with transparent pixels; only the skin's own part (`size`) is read, as at import.
function smoothFont(textCanvas, size) {
  let source = textCanvas;
  if (Array.isArray(size) && size[0] > 0 && size[1] > 0 && (size[0] < textCanvas.width || size[1] < textCanvas.height)) {
    source = document.createElement('canvas'); source.width = Math.min(size[0], textCanvas.width); source.height = Math.min(size[1], textCanvas.height);
    source.getContext('2d').drawImage(textCanvas, 0, 0);
  }
  const glyphs = textGlyphs(source);
  if (!glyphs) return null;
  const fine = {};
  for (const [ch, bits] of Object.entries(glyphs)) fine[ch] = scaleBits(scaleBits(bits, 5, 6), 10, 12);
  return fontDataUrl(buildPixelFont(fine, { width: 20, height: 24, scale: 4, family: 'Kit Pixel' }));
}

// Sheets and parts whose pixels are lettering or digits: comfort colors and HD, but no texture calming.
const CRISP = new Set(['text', 'numbers', 'nums_ex', 'cbClean', 'playpaus', 'monoster']);
// Parts the page repeats as tiles, and the direction they repeat in (kit.css).
const TILES = { plT: 'x', plTI: 'x', plB: 'x', plBEdge: 'x', shT: 'x', plL: 'y', plR: 'y' };

// The kit as the page should show it in the given mode. Returns the kit (same shape, images as blob
// URLs, each already decoded so swapping looks never shows an empty frame) and a dispose() that frees
// those images once they are no longer shown. If any image fails, the ones made so far are freed.
export async function enhanceKit(kit, { hd = true } = {}) {
  const urls = [], decoded = [];
  const dispose = () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.length = 0; decoded.length = 0; };
  const scale = hd ? HD_SCALE : 1;
  const work = async (src, name) => {
    let { data } = await load(src);
    const tile = TILES[name] || '', wrap = { wrapX: tile.includes('x'), wrapY: tile.includes('y') };
    comfortImage(data);
    if (!CRISP.has(name)) calmTexture(data, wrap);
    if (hd) data = hdScale(data, { ...wrap, soft: !CRISP.has(name) });
    const url = await save(data);
    urls.push(url);
    const img = new Image(); img.src = url; await img.decode(); decoded.push(img);
    return url;
  };
  const image = value => typeof value === 'string' && /^data:image\/png;base64,/.test(value);
  const settle = async jobs => {
    const results = await Promise.allSettled(jobs);
    const failed = results.find(r => r.status === 'rejected');
    if (failed) throw failed.reason;
    return results.map(r => r.value);
  };
  const map = async source => {
    const entries = Object.entries(source || {}).filter(([, v]) => image(v));
    const made = await settle(entries.map(([k, v]) => work(v, k)));
    return Object.fromEntries(entries.map(([k], i) => [k, made[i]]));
  };
  try {
    const [parts, sheets] = await settle([map(kit.parts), map(kit.sheets)]);
    let font = kit.font;
    if (hd && image(kit.sheets?.text)) { try { font = smoothFont((await load(kit.sheets.text)).canvas, kit.sizes?.text) || kit.font; } catch { font = kit.font; } }
    return {
      kit: { ...kit, parts, sheets, colors: comfortPalette(kit.colors), vis: (kit.vis || []).map(v => HEX.test(v) ? comfortColor(v) : v), font, scale },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
