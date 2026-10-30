// Turns a classic Winamp 2 skin (.wsz) into a "kit": the pieces, colors, font and window
// shape bit.cheer needs to dress every control in the skin's own pixel art.
// Like Winamp and Webamp, it never rejects a skin for unusual sheet sizes: whatever is
// missing comes from the bundled base skin, and sprites outside a sheet stay transparent.
import { buildPixelFont, TEXT_GLYPHS, SYMBOL_GLYPHS, symbolBits } from './pixel-font.js';

export const KIT_VERSION = 5;
export const KIT_SHEETS = ['main', 'titlebar', 'cbuttons', 'posbar', 'volume', 'balance', 'numbers', 'nums_ex', 'text', 'playpaus', 'monoster', 'shufrep', 'eqmain', 'pledit', 'genex'];
// Sheets the live windows draw from at runtime (the rest only feed pieces and colors).
export const LIVE_SHEETS = ['main', 'titlebar', 'cbuttons', 'posbar', 'volume', 'balance', 'numbers', 'nums_ex', 'text', 'playpaus', 'monoster', 'shufrep', 'eqmain'];
// Classic sheet sizes. Exported sheets are cropped or padded to them, so sprite math in CSS stays exact
// when a skin ships an odd size (a 99×14 NUMBERS.BMP must not be squeezed into 13 rows).
const SHEET_SIZES = {
  main: [275, 116], titlebar: [344, 87], cbuttons: [136, 36], posbar: [307, 10], volume: [68, 433], balance: [68, 433],
  numbers: [99, 13], nums_ex: [108, 13], text: [155, 18], playpaus: [42, 9], monoster: [58, 24], shufrep: [92, 85], eqmain: [275, 315],
};

// Single sprites cut out as their own images, so CSS can tile or scale them cleanly.
// [sheet, x, y, w, h] in skin pixels (Webamp's sprite map).
export const KIT_PARTS = {
  plTl: ['pledit', 0, 0, 25, 20], plT: ['pledit', 127, 0, 25, 20], plTr: ['pledit', 153, 0, 25, 20],
  plTlI: ['pledit', 0, 21, 25, 20], plTI: ['pledit', 127, 21, 25, 20], plTrI: ['pledit', 153, 21, 25, 20],
  plTitle: ['pledit', 26, 0, 100, 20],
  plL: ['pledit', 0, 42, 12, 29], plR: ['pledit', 31, 42, 20, 29],
  plBl: ['pledit', 0, 72, 125, 38], plB: ['pledit', 179, 0, 25, 38], plBr: ['pledit', 126, 72, 150, 38],
  shL: ['pledit', 72, 42, 25, 14], shT: ['pledit', 72, 57, 25, 14], shR: ['pledit', 99, 57, 50, 14], shRa: ['pledit', 99, 42, 50, 14],
  plScroll: ['pledit', 52, 53, 8, 18], plScrollDown: ['pledit', 61, 53, 8, 18],
  plCloseDown: ['pledit', 52, 42, 9, 9], plShadeDown: ['pledit', 62, 42, 9, 9], plExpandDown: ['pledit', 150, 42, 9, 9],
  eqThumb: ['eqmain', 0, 164, 11, 11], eqThumbDown: ['eqmain', 0, 176, 11, 11],
  eqOn: ['eqmain', 10, 119, 26, 12], eqOnDown: ['eqmain', 128, 119, 26, 12], eqOnLit: ['eqmain', 69, 119, 26, 12], eqOnLitDown: ['eqmain', 187, 119, 26, 12],
  eqTitle: ['eqmain', 0, 134, 275, 14], eqTitleI: ['eqmain', 0, 149, 275, 14],
  posBg: ['posbar', 0, 0, 248, 10], posThumb: ['posbar', 248, 0, 29, 10], posThumbDown: ['posbar', 278, 0, 29, 10],
  volThumb: ['volume', 15, 422, 14, 11], volThumbDown: ['volume', 0, 422, 14, 11],
  balThumb: ['balance', 15, 422, 14, 11], balThumbDown: ['balance', 0, 422, 14, 11],
  titleStrip: ['titlebar', 27, 0, 275, 14], titleStripI: ['titlebar', 27, 15, 275, 14],
  genBtn: ['genex', 0, 0, 47, 15], genBtnDown: ['genex', 0, 16, 47, 15],
};
export const KIT_PART_KEYS = [...Object.keys(KIT_PARTS), 'eqBars', 'volStrip', 'balStrip', 'deskGlow', 'plBEdge', 'plBlEdge', 'plBrEdge', 'shLm', 'jogPlatter', 'cbClean'];
export const KIT_COLOR_KEYS = ['desk', 'deskLight', 'deskDim', 'listBg', 'listFg', 'listHi', 'listSel', 'listSelFg', 'listDim', 'lcdBg', 'lcdFg', 'lcdDim', 'num', 'numBg', 'numFg', 'numDim', 'face', 'faceLight', 'faceDark', 'faceText', 'accent', 'accentText', 'accentDim', 'frame', 'frameLight', 'frameDark', 'title', 'titleBg', 'titleDim'];
const SAFE_FONTS = ['Arial', 'Arial Narrow', 'Tahoma', 'Verdana', 'Trebuchet MS', 'Courier New', 'Lucida Console', 'Lucida Sans Unicode', 'Georgia', 'Times New Roman', 'Comic Sans MS', 'Impact', 'Segoe UI', 'MS Sans Serif', 'Microsoft Sans Serif', 'Century Gothic', 'Franklin Gothic Medium', 'Palatino Linotype', 'Book Antiqua', 'Small Fonts', 'Terminal', 'Fixedsys'];
const DEFAULT_VIS = ['#000000', '#181818', '#ef3110', '#ce2910', '#d65a00', '#d66600', '#d67300', '#c67b08', '#dea518', '#d6b521', '#bdde29', '#94de21', '#29ce10', '#32be10', '#39b510', '#319c08', '#298c10', '#188408', '#ffffff', '#d6d6de', '#adadc6', '#8c8ca5', '#6b6b8c', '#ffffff'];

// ---------- color helpers ----------
const HEX = /^#[0-9a-f]{6}$/i;
export const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(...x.map((v, i) => v + (y[i] - v) * t)); };
const channel = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const luminance = h => { const [r, g, b] = rgb(h).map(channel); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const saturation = h => { const [r, g, b] = rgb(h); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
const distance = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const hsl = h => {
  const [r, g, b] = rgb(h).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const hue = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hue * 60, s, l];
};
// Two colors from the same family: close in lightness and, when both are colorful, in hue.
const akin = (a, b) => {
  const [ha, sa, la] = hsl(a), [hb, sb, lb] = hsl(b);
  if (Math.abs(la - lb) > 0.25) return false;
  if (sa < 0.18 || sb < 0.18) return true;
  const dh = Math.abs(ha - hb); return Math.min(dh, 360 - dh) <= 40;
};
// Push a color toward white or black until it reads on the background.
export function readable(fg, bg, min) {
  if (contrast(fg, bg) >= min) return fg;
  const lighter = mix(fg, '#ffffff', 1), darker = mix(fg, '#000000', 1);
  const target = contrast(lighter, bg) >= contrast(darker, bg) ? '#ffffff' : '#000000';
  for (let t = 0.08; t <= 1.001; t += 0.08) { const c = mix(fg, target, t); if (contrast(c, bg) >= min) return c; }
  return target;
}

// ---------- sheets ----------
class Sheet {
  constructor(name, bitmap) {
    this.name = name; this.width = bitmap.width; this.height = bitmap.height;
    this.canvas = document.createElement('canvas'); this.canvas.width = bitmap.width; this.canvas.height = bitmap.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.ctx.drawImage(bitmap, 0, 0);
  }
  get data() {
    if (this._data === undefined) {
      let data = null;
      try { data = this.ctx.getImageData(0, 0, this.width, this.height).data; } catch { data = null; }
      this._data = data && data.length >= this.width * this.height * 4 ? data : null; // test doubles: no pixels
    }
    return this._data;
  }
  px(x, y) {
    if (!this.data || x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    const i = (y * this.width + x) * 4; return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }
  has(x, y, w, h) { return x + w <= this.width && y + h <= this.height; }
  pngUrl(size) {
    if (!size || (size[0] === this.width && size[1] === this.height)) return this.canvas.toDataURL('image/png');
    const out = document.createElement('canvas'); out.width = size[0]; out.height = size[1];
    out.getContext('2d').drawImage(this.canvas, 0, 0);
    return out.toDataURL('image/png');
  }
}

// Cut [x, y, w, h] from a sheet; parts that fall outside it stay transparent.
function crop(sheet, x, y, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const sw = Math.min(w, sheet.width - x), sh = Math.min(h, sheet.height - y);
  if (sw > 0 && sh > 0) ctx.drawImage(sheet.canvas, x, y, sw, sh, 0, 0, sw, sh);
  return c;
}
const url = canvas => canvas.toDataURL('image/png');

// Most common colors in a set of rectangles, bucketed to 4 bits per channel.
function histogram(sheet, rects) {
  const buckets = new Map(); let total = 0;
  for (const [x0, y0, w, h] of rects) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const p = sheet.px(x, y); if (!p) continue;
    const key = (p[0] >> 4) << 8 | (p[1] >> 4) << 4 | (p[2] >> 4);
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += p[0]; b.g += p[1]; b.b += p[2]; buckets.set(key, b); total++;
  }
  return [...buckets.values()].sort((a, b) => b.n - a.n).map(b => ({ color: hex(b.r / b.n, b.g / b.n, b.b / b.n), share: b.n / Math.max(1, total) }));
}

// TEXT.BMP: split the glyph area into background and ink with two-means clustering, so
// textured backgrounds (denim, stone…) don't leak into the letters.
function textClusters(sheet) {
  const pts = [];
  for (let y = 0; y < Math.min(18, sheet.height); y++) for (let x = 0; x < Math.min(155, sheet.width); x++) { const p = sheet.px(x, y); if (p) pts.push(p); }
  if (pts.length < 50) return null;
  const mean = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map(v => v / pts.length);
  let a = mean, b = pts.reduce((best, p) => distance(p, mean) > distance(best, mean) ? p : best, pts[0]);
  let na = 0, nb = 0;
  for (let iter = 0; iter < 10; iter++) {
    const sa = [0, 0, 0], sb = [0, 0, 0]; na = 0; nb = 0;
    for (const p of pts) { if (distance(p, a) <= distance(p, b)) { sa[0] += p[0]; sa[1] += p[1]; sa[2] += p[2]; na++; } else { sb[0] += p[0]; sb[1] += p[1]; sb[2] += p[2]; nb++; } }
    if (!na || !nb) break;
    a = sa.map(v => v / na); b = sb.map(v => v / nb);
  }
  const [bg, ink] = na >= nb ? [a, b] : [b, a];
  if (distance(bg, ink) < 40) return null;
  // The most common real color of each side, so solid fonts keep their exact palette.
  const pick = side => { const counts = new Map(); for (const p of pts) { const isInk = distance(p, ink) < distance(p, bg); if (isInk !== side) continue; const k = p.join(','); counts.set(k, (counts.get(k) || 0) + 1); } const top = [...counts.entries()].sort((m, n) => n[1] - m[1])[0]; return top ? top[0].split(',').map(Number) : null; };
  return { bg, ink, bgColor: hex(...(pick(false) || bg)), inkColor: hex(...(pick(true) || ink)), isInk: p => distance(p, ink) < distance(p, bg) };
}

// ---------- text files ----------
const MAX_TEXT = 64 * 1024;
const textLines = text => typeof text === 'string' && text.length <= MAX_TEXT ? text.split(/\r?\n/) : [];
// "Key = value" on one line; spaces and tabs only, so hostile files can't make the parser backtrack.
function keyValue(line) {
  const eq = line.indexOf('=');
  return eq < 0 ? null : [line.slice(0, eq).replace(/^[ \t]+|[ \t]+$/g, '').toLowerCase(), line.slice(eq + 1).replace(/^[ \t]+|[ \t]+$/g, '')];
}

export function parsePledit(text) {
  const out = {};
  for (const line of textLines(text)) {
    const kv = keyValue(line); if (!kv) continue;
    const [key, value] = kv;
    const color = value.match(/^#?([0-9a-f]{6})/i)?.[1];
    if (key === 'normal' && color) out.normal = `#${color.toLowerCase()}`;
    else if (key === 'current' && color) out.current = `#${color.toLowerCase()}`;
    else if (key === 'normalbg' && color) out.normalBg = `#${color.toLowerCase()}`;
    else if (key === 'selectedbg' && color) out.selectedBg = `#${color.toLowerCase()}`;
    else if (key === 'font') { const font = value.split(';')[0].trim().toLowerCase(); out.font = SAFE_FONTS.find(f => f.toLowerCase() === font); }
  }
  for (const key of ['normal', 'current', 'normalBg', 'selectedBg']) if (!(key in out)) out[key] = undefined;
  if (!('font' in out)) out.font = undefined;
  return out;
}

export function parseViscolor(text) {
  return textLines(text).map(line => line.match(/^[ \t]*(\d{1,3})[ \t]*,[ \t]*(\d{1,3})[ \t]*,[ \t]*(\d{1,3})/)).filter(Boolean).slice(0, 24).map(m => hex(+m[1], +m[2], +m[3]));
}

// region.txt [Normal]: polygons that shape the main window.
export function parseRegion(text) {
  let inNormal = false, counts = null, points = null;
  for (const line of textLines(text)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) { if (inNormal) break; inNormal = trimmed.toLowerCase() === '[normal]'; continue; }
    if (!inNormal) continue;
    const kv = keyValue(line); if (!kv) continue;
    const numbers = kv[1].split(/[ \t,]+/).filter(Boolean).map(Number);
    if (kv[0] === 'numpoints') counts = numbers; else if (kv[0] === 'pointlist') points = numbers;
  }
  if (!counts?.length || !points?.length || counts.some(n => !Number.isInteger(n) || n < 3 || n > 500) || points.some(v => !Number.isFinite(v))) return null;
  const polygons = []; let i = 0;
  for (const n of counts.slice(0, 200)) {
    if (i + n * 2 > points.length) break;
    polygons.push(points.slice(i, i + n * 2).map(v => Math.max(0, Math.min(400, Math.round(v))))); i += n * 2;
  }
  return polygons.length ? polygons : null;
}

// ---------- base skin (fallback for missing sheets) ----------
async function loadBaseSkin(fetchBase) {
  if (!fetchBase) return {};
  try { return await fetchBase(); } catch { return {}; }
}

async function decode(bytes, path) {
  const type = /\.png$/i.test(path) ? 'image/png' : 'image/bmp';
  return createImageBitmap(new Blob([bytes], { type }));
}

// files: { path: Uint8Array } from the archive. fetchBase: () => Promise<files of the base skin>.
export async function buildKit(files, { fetchBase } = {}) {
  const paths = Object.keys(files);
  const find = (name, list = paths) => list.find(p => p.split('/').at(-1).toLowerCase() === name) ;
  const findSheet = (name, list = paths) => find(`${name}.bmp`, list) || find(`${name}.png`, list);
  const sheets = {}, borrowed = [];
  const tryLoad = async (store, name, path) => {
    if (!path || !store[path]?.length || store[path].length > 2 * 1024 * 1024) return null;
    try {
      const bitmap = await decode(store[path], path);
      if (!bitmap.width || !bitmap.height || bitmap.width > 2048 || bitmap.height > 2048) { bitmap.close?.(); return null; }
      const sheet = new Sheet(name, bitmap); bitmap.close?.(); return sheet;
    } catch { return null; }
  };
  for (const name of KIT_SHEETS) sheets[name] = await tryLoad(files, name, findSheet(name));
  if (!sheets.main) throw new Error(findSheet('main')
    ? 'This skin’s main window (main.bmp) can’t be read: it may be damaged or larger than 2048 pixels.'
    : 'This skin has no main window (main.bmp). Only classic Winamp 2 skins (.wsz) are supported.');
  // Like Winamp: no BALANCE.BMP means the balance slider is drawn from VOLUME.BMP.
  if (!sheets.balance && sheets.volume) sheets.balance = sheets.volume;
  // Winamp falls back to its default skin for anything else a skin leaves out; so do we.
  const needed = KIT_SHEETS.filter(n => !sheets[n] && n !== 'nums_ex' && n !== 'genex' && !(n === 'numbers' && sheets.nums_ex));
  if (needed.length) {
    const base = await loadBaseSkin(fetchBase), basePaths = Object.keys(base);
    for (const name of needed) { sheets[name] = await tryLoad(base, name, findSheet(name, basePaths)); if (sheets[name]) borrowed.push(name); }
  }
  const textFile = name => { const p = find(name); return p ? new TextDecoder('latin1').decode(files[p]) : null; };
  const pledit = parsePledit(textFile('pledit.txt'));
  const vis = parseViscolor(textFile('viscolor.txt'));
  const region = parseRegion(textFile('region.txt'));

  // Pieces.
  const parts = {};
  for (const [key, [sheetName, x, y, w, h]] of Object.entries(KIT_PARTS)) {
    const sheet = sheets[sheetName];
    if (!sheet || x >= sheet.width || y >= sheet.height) continue;
    parts[key] = url(crop(sheet, x, y, w, h));
  }
  // All 28 EQ slider bars side by side (frame i at x = 14i), for a value-driven bar.
  if (sheets.eqmain) {
    const bars = document.createElement('canvas'); bars.width = 14 * 28; bars.height = 63;
    const ctx = bars.getContext('2d');
    for (let i = 0; i < 28; i++) ctx.drawImage(crop(sheets.eqmain, 13 + (i % 14) * 15, i < 14 ? 164 : 229, 14, 63), i * 14, 0);
    parts.eqBars = url(bars);
  }
  // Mirrored left ends close bars that have no buttons (cards, panels), so no fake close boxes.
  for (const [key, [sheetName, x, y, w, h]] of [['shLm', KIT_PARTS.shL]]) {
    const sheet = sheets[sheetName]; if (!sheet) continue;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(crop(sheet, x, y, w, h), 0, 0);
    parts[key] = url(c);
  }
  // The playlist's bottom bar carries buttons; only its outer edge closes our windows.
  let bottomEdge = 6;
  if (sheets.pledit) {
    bottomEdge = measureBottomEdge(sheets.pledit);
    parts.plBEdge = url(crop(sheets.pledit, 179, 38 - bottomEdge, 25, bottomEdge));
    parts.plBlEdge = url(crop(sheets.pledit, 0, 110 - bottomEdge, 12, bottomEdge));
    parts.plBrEdge = url(crop(sheets.pledit, 256, 110 - bottomEdge, 20, bottomEdge));
  }
  // Volume and balance backgrounds: 28 frames stacked every 15 pixels.
  if (sheets.volume) parts.volStrip = url(crop(sheets.volume, 0, 0, 68, 420));
  if (sheets.balance) parts.balStrip = url(crop(sheets.balance, 9, 0, 38, 420));
  // A soft glow of the main window for the page behind the decks.
  {
    const glow = document.createElement('canvas'); glow.width = 22; glow.height = 10;
    const ctx = glow.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sheets.main.canvas, 0, 0, Math.min(275, sheets.main.width), Math.min(116, sheets.main.height), 0, 0, 22, 10);
    parts.deskGlow = url(glow);
  }

  // Generic buttons: the playlist's own menu buttons when the skin draws them as real rectangular
  // buttons (GENEX wins when it looks the same), else GENEX, else a bevel in the skin's colors.
  let menu = !borrowed.includes('pledit') ? menuButton(sheets.pledit) : null;
  if (menu && sheets.genex && distance(rgb(genexFace(sheets.genex)), rgb(menu.face)) <= 60) menu = null;
  // GENEX is a Winamp 5 sheet that many classic skins never styled: keep it only when its buttons
  // belong to the skin's own palette (playlist frame or menu buttons), else use a bevel in those colors.
  let genex = !!sheets.genex && !menu;
  if (genex && sheets.pledit) {
    const face = genexFace(sheets.genex), frame = playlistFrame(sheets.pledit), popup = menuPopupFace(sheets.pledit);
    genex = (frame && akin(face, frame)) || (popup && akin(face, popup));
  }
  if (menu) { parts.genBtn = url(menu.up); parts.genBtnDown = url(menu.down); }
  else if (!genex) { delete parts.genBtn; delete parts.genBtnDown; }
  const genSlice = menu ? 3 : genex ? measureButtonSlice(sheets.genex) : 3;
  // Transport sprites are cut at fixed sizes, so some carry bits of the window art around them
  // (Garfield's teddy bear): keep only the part of each button that changes when pressed.
  if (sheets.cbuttons) parts.cbClean = url(cleanTransport(sheets.cbuttons));

  const colors = derivePalette({ sheets, pledit, vis, menu, genex });
  parts.jogPlatter = url(jogPlatter(colors));
  // Toggles light the EQ's ON button, unless lit and unlit are different pictures (some skins draw
  // a scene there): then a small switch in the skin's colors keeps the state readable.
  if (!sheets.eqmain || pictorial(sheets.eqmain, [10, 119], [69, 119], 26, 12)) {
    parts.eqOn = url(switchToggle(colors, false, false)); parts.eqOnDown = url(switchToggle(colors, false, true));
    parts.eqOnLit = url(switchToggle(colors, true, false)); parts.eqOnLitDown = url(switchToggle(colors, true, true));
  }
  const font = sheets.text ? textFont(sheets.text) : null;
  const live = {};
  for (const name of LIVE_SHEETS) if (sheets[name]) live[name] = sheets[name].pngUrl(SHEET_SIZES[name]);
  return {
    version: KIT_VERSION, parts, colors, vis: vis.length >= 18 ? vis.concat(DEFAULT_VIS.slice(vis.length)) : DEFAULT_VIS,
    sheets: live, font: font?.dataUrl || null, fontInk: font?.ink, region,
    numbersWidth: sheets.numbers ? 99 : 108, bodyFont: pledit.font || null, borrowed, bottomEdge, genSlice, _pledit: pledit,
    sizes: Object.fromEntries(Object.entries(sheets).filter(([, s]) => s).map(([k, s]) => [k, [s.width, s.height]])),
    _sheets: sheets,
  };
}

// Rows at the bottom of the playlist's bottom bar that differ from its middle: the window edge.
function measureBottomEdge(sheet) {
  if (!sheet.data || !sheet.has(179, 0, 25, 38)) return 6;
  const row = y => { let r = 0, g = 0, b = 0; for (let x = 179; x < 204; x++) { const p = sheet.px(x, y); r += p[0]; g += p[1]; b += p[2]; } return [r / 25, g / 25, b / 25]; };
  const middle = row(19);
  let edge = 0;
  for (let y = 37; y > 24; y--) { if (distance(row(y), middle) > 24) edge = 38 - y; else if (edge && 38 - y > edge + 1) break; }
  return Math.max(4, Math.min(10, edge + 1));
}

// The playlist's "add URL" menu button (22×18, pressed copy beside it) as a generic button.
// Accepted only when it is a real rectangular button: steady edges that stand out from one face
// color. Drawn, textured or text-only buttons fail and the skin keeps GENEX or a bevel.
function menuButton(sheet) {
  const W = 22, H = 18, S = 3;
  if (!sheet?.data || !sheet.has(0, 111, 45, H)) return null;
  const read = ox => {
    const at = (x, y) => sheet.px(ox + x, 111 + y);
    const span = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
    const edges = [span(S, W - S).map(x => at(x, 0)), span(S, W - S).map(x => at(x, H - 1)), span(S, H - S).map(y => at(0, y)), span(S, H - S).map(y => at(W - 1, y))];
    const steady = points => { const mid = points[points.length >> 1]; return points.filter(p => distance(p, mid) <= 40).length >= points.length * 0.85; };
    if (!edges.every(steady)) return null;
    const inside = histogram(sheet, [[ox + S, 111 + S, W - 2 * S, H - 2 * S]]);
    if (!inside[0] || inside[0].share < 0.4) return null;
    const face = inside[0].color, faceRgb = rgb(face);
    if (edges.filter(e => distance(e[e.length >> 1], faceRgb) > 36).length < 2) return null; // no visible frame
    const ink = inside.slice(1).filter(c => c.share > 0.03).sort((a, b) => contrast(b.color, face) - contrast(a.color, face))[0]?.color;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(sheet.canvas, ox, 111, W, H, 0, 0, W, H);
    g.fillStyle = face; g.fillRect(S, S, W - 2 * S, H - 2 * S); // its label goes: our text takes its place
    return { canvas: c, face, ink };
  };
  const up = read(0), down = read(23);
  if (!up) return null;
  return { up: up.canvas, down: (down || up).canvas, face: up.face, ink: up.ink };
}

// The playlist window's border color (its left edge and title tile), as the skin draws it.
function playlistFrame(sheet) { return sheet ? histogram(sheet, [[0, 42, 12, 29], [127, 0, 25, 20]])[0]?.color || null : null; }
// The overall tone of the playlist's popup menu buttons (ADD URL … LOAD LIST): their mean color,
// so a gradient face isn't mistaken for its label (the single most common color can be the text).
function menuPopupFace(sheet) {
  if (!sheet?.data || !sheet.has(0, 111, 250, 56)) return null;
  let sum = [0, 0, 0], n = 0;
  for (const x of [0, 54, 104, 154, 204]) for (const y of [111, 130, 149]) for (let j = 2; j < 16; j++) for (let i = 2; i < 20; i++) {
    const p = sheet.px(x + i, y + j); if (!p) continue; sum = sum.map((v, k) => v + p[k]); n++;
  }
  return n ? hex(...sum.map(v => v / n)) : null;
}

// CBUTTONS with each button cut down to the area that changes between normal and pressed (+2px):
// art around a button (part of the window picture) goes transparent.
function cleanTransport(sheet) {
  const out = document.createElement('canvas'); out.width = 136; out.height = 36;
  const g = out.getContext('2d'); g.drawImage(sheet.canvas, 0, 0);
  if (!sheet.data) return out;
  for (const [x, w, h] of [[0, 23, 18], [23, 23, 18], [46, 23, 18], [69, 23, 18], [92, 22, 18], [114, 22, 16]]) {
    if (!sheet.has(x, 0, w, h * 2)) continue;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
      if (distance(sheet.px(x + i, y), sheet.px(x + i, y + h)) <= 40) continue;
      x0 = Math.min(x0, i); y0 = Math.min(y0, y); x1 = Math.max(x1, i); y1 = Math.max(y1, y);
    }
    if (x1 < 0 || (x1 - x0 + 1) * (y1 - y0 + 1) > 0.85 * w * h) continue; // whole button changes: keep it
    x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(w - 1, x1 + 2); y1 = Math.min(h - 1, y1 + 2);
    for (const top of [0, h]) {
      g.clearRect(x, top, w, y0); g.clearRect(x, top + y1 + 1, w, h - y1 - 1);
      g.clearRect(x, top + y0, x0, y1 - y0 + 1); g.clearRect(x + x1 + 1, top + y0, w - x1 - 1, y1 - y0 + 1);
    }
  }
  return out;
}

// A GENEX button's face: averaged, since gradient (chrome) buttons have no single color.
function genexFace(sheet) {
  let sum = [0, 0, 0], n = 0;
  for (let y = 3; y < 12; y++) for (let x = 4; x < 43; x++) { const p = sheet.px(x, y); if (!p) continue; sum = sum.map((v, i) => v + p[i]); n++; }
  return n ? hex(...sum.map(v => v / n)) : '#808080';
}

// How far a GENEX button's rounded corners reach, so 9-slicing never cuts through a curve.
function measureButtonSlice(sheet) {
  if (!sheet.data || !sheet.has(0, 0, 47, 15)) return 3; // too small for a button: keep the default
  // Compare within rows, so vertical gradients (chrome) don't read as corners.
  const sameRow = (x, y) => distance(sheet.px(x, y), sheet.px(23, y)) <= 30;
  let x = 0; while (x < 12 && !sameRow(x, 7)) x++;
  // Corners curve inward: walk the top-left diagonal until it reaches the face of its row.
  let d = 0; while (d < 7 && !sameRow(d, d)) d++;
  return Math.max(2, Math.min(7, Math.max(x, d) + 1));
}

// Whether two states of a button are different pictures rather than a light coming on: an LED or a
// lit label changes a few pixels in one spot; a scene changes many pixels all over (Zelda's Zora).
function pictorial(sheet, [ax, ay], [bx, by], w, h) {
  if (!sheet.data || !sheet.has(Math.max(ax, bx), Math.max(ay, by), w, h)) return false;
  let changed = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (distance(sheet.px(ax + x, ay + y), sheet.px(bx + x, by + y)) <= 48) continue;
    changed++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const area = changed ? (x1 - x0 + 1) * (y1 - y0 + 1) : 0;
  return changed / (w * h) > 0.22 || area / (w * h) > 0.45;
}

// A 26 × 12 switch in the skin's colors: a raised knob that slides right and lights the track.
function switchToggle(c, lit, pressed) {
  const out = document.createElement('canvas'); out.width = 26; out.height = 12;
  const g = out.getContext('2d');
  const box = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  box(0, 0, 26, 12, c.frameLight); box(1, 1, 24, 10, c.frameDark);
  box(2, 2, 22, 8, lit ? c.accent : c.lcdBg);
  const kx = lit ? 13 : 3, ky = pressed ? 3 : 2;
  box(kx, ky, 10, 8, c.frameDark);
  box(kx + 1, ky + 1, 8, 6, pressed ? c.faceDark : c.face);
  box(kx + 1, ky + 1, 8, 1, c.faceLight); box(kx + 1, ky + 1, 1, 6, c.faceLight);
  box(kx + 1, ky + 6, 8, 1, c.faceDark); box(kx + 8, ky + 1, 1, 6, c.faceDark);
  return out;
}

// A turntable platter as 56 × 56 pixel art in the skin's colors: rim, grooved vinyl, label.
function jogPlatter(c) {
  const n = 56, r = n / 2, out = document.createElement('canvas'); out.width = n; out.height = n;
  const ctx = out.getContext('2d'), img = ctx.createImageData(n, n);
  const vinyl = mix(c.lcdBg, '#000000', 0.35), groove = mix(vinyl, c.lcdFg, 0.12), shine = mix(vinyl, '#ffffff', 0.18);
  const rimLight = mix(c.face, '#ffffff', 0.45), rimDark = mix(c.face, '#000000', 0.45), label = c.listSel, labelEdge = mix(c.listSel, '#000000', 0.45);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x + 0.5 - r, dy = y + 0.5 - r, d = Math.hypot(dx, dy), light = (-dx - dy) / (d || 1); // lit from the top left
    let color = null;
    if (d > r) continue;
    else if (d > r - 1.5) color = c.frameDark;
    else if (d > r - 4) color = light > 0.35 ? rimLight : light < -0.35 ? rimDark : c.face;
    else if (d > r - 5) color = c.frameDark;
    else if (d > 11) color = Math.floor(d) % 2 ? groove : vinyl;
    else if (d > 10) color = labelEdge;
    else color = label;
    if (d > 11 && d <= r - 5 && Math.abs(dx + dy) < 2.2 && dx < 0) color = shine; // a highlight glint
    const [R, G, B] = rgb(color), i = (y * n + x) * 4;
    img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

// ---------- palette ----------
function derivePalette({ sheets, pledit, vis, menu, genex }) {
  const valid = c => typeof c === 'string' && HEX.test(c);
  const main = sheets.main;
  const mainColors = histogram(main, [[0, 0, Math.min(275, main.width), Math.min(116, main.height)]]);
  const avg = mainColors.length ? mainColors.slice(0, 12).reduce((acc, c) => acc.map((v, i) => v + rgb(c.color)[i] * c.share), [0, 0, 0]) : [40, 40, 50];
  const shareSum = mainColors.slice(0, 12).reduce((n, c) => n + c.share, 0) || 1;
  const tone = hex(...avg.map(v => v / shareSum));

  // TEXT.BMP: background and ink of the skin's own lettering.
  let lcdBg = '#000000', lcdFg = '#00e800';
  const clusters = sheets.text ? textClusters(sheets.text) : null;
  if (clusters) { lcdBg = clusters.bgColor; lcdFg = clusters.inkColor; }
  const listBg = valid(pledit.normalBg) ? pledit.normalBg : lcdBg;
  let listFg = valid(pledit.normal) ? pledit.normal : lcdFg;
  let listHi = valid(pledit.current) ? pledit.current : '#ffffff';
  let listSel = valid(pledit.selectedBg) ? pledit.selectedBg : mix(listBg, listFg, 0.3);
  if (contrast(listSel, listBg) < 1.25) listSel = mix(listBg, listFg, 0.28);
  listFg = readable(listFg, listBg, 4.6);
  listHi = readable(listHi, listBg, 4.6);
  // Selected rows: Winamp prints them in the Normal color; the current color when that reads better.
  const listSelFg = readable(contrast(listFg, listSel) > contrast(listHi, listSel) ? listFg : listHi, listSel, 4.5);
  lcdFg = readable(lcdFg, lcdBg, 4.5);

  // NUMBERS: the lit digit color.
  let num = lcdFg;
  const digits = sheets.numbers || sheets.nums_ex;
  if (digits) {
    const h = histogram(digits, [[72, 0, 9, 13]]).filter(c => c.share > 0.06); // the "8" lights every segment
    const lit = h.sort((a, b) => contrast(b.color, lcdBg) - contrast(a.color, lcdBg))[0];
    if (lit && contrast(lit.color, lcdBg) > 1.6) num = lit.color;
  }
  num = readable(num, lcdBg, 3.2);
  // Screens that show NUMBERS digits take the digits' own cell color, so the digits don't sit in tiles.
  let numBg = lcdBg;
  if (digits) {
    const cell = histogram(digits, [[9, 0, 9, 13]])[0]; // the "1" lights the fewest segments
    if (cell && cell.share > 0.4 && contrast(cell.color, num) > 1.6) numBg = cell.color;
  }
  const numFg = readable(lcdFg, numBg, 4.5);

  // Button face from the playlist's own menu buttons (or GENEX when the skin has it).
  let face, faceText;
  if (menu) {
    face = menu.face; faceText = menu.ink;
  } else if (genex && sheets.genex.has(0, 0, 92, 12) && sheets.genex.px(10, 7)) {
    face = genexFace(sheets.genex); faceText = hex(...sheets.genex.px(54, 0));
  } else if (sheets.pledit?.has(0, 111, 250, 56)) {
    const rects = [];
    for (const x of [0, 54, 104, 154, 204]) for (const y of [111, 130, 149]) rects.push([x + 2, y + 2, 18, 14]);
    const h = histogram(sheets.pledit, rects);
    // Flat buttons have one dominant face color; gradient or textured ones take their mean tone.
    face = h[0] && h[0].share >= 0.3 ? h[0].color : menuPopupFace(sheets.pledit) || h[0]?.color;
    faceText = h.slice(1).filter(c => c.share > 0.02).sort((a, b) => contrast(b.color, face) - contrast(a.color, face))[0]?.color;
  }
  if (!face || contrast(face, listBg) < 1.12 && saturation(face) < 0.1) face = mix(listBg, listFg, 0.32);
  faceText = readable(faceText && contrast(faceText, face) > 2 ? faceText : listHi, face, 4.5);

  // Frame colors from the playlist's left edge (the window border the skin draws).
  let frame = tone;
  if (sheets.pledit) { const h = histogram(sheets.pledit, [[0, 42, 12, 29], [127, 0, 25, 20]]); if (h[0]) frame = h[0].color; }
  const frameLight = mix(frame, '#ffffff', 0.35), frameDark = mix(frame, '#000000', 0.6);
  // Plain near-white menu buttons on a darker skin look unstyled: dress them in the frame color.
  if (!menu && !genex && luminance(face) > 0.75 && luminance(frame) < 0.45) {
    face = mix(frame, '#ffffff', 0.28);
    faceText = readable(listHi, face, 4.5);
  }
  const faceLight = mix(face, '#ffffff', 0.42), faceDark = mix(face, '#000000', 0.55);

  // A vivid highlight: the most saturated, readable color the skin already uses.
  const candidates = [listHi, lcdFg, num, ...vis.slice(2, 18), listFg].filter(valid);
  const desk = mix(mix(mix(tone, '#000000', 0.78), frame, 0.08), listBg, 0.32);
  const accent = readable(candidates.sort((a, b) => saturation(b) * (0.4 + luminance(b)) - saturation(a) * (0.4 + luminance(a)))[0] || listHi, desk, 4.5);
  const accentText = readable(desk, accent, 4.5);
  const title = readable(lcdFg, lcdBg, 4.5);
  // Quieter text still has to read: every "dim" color keeps 4.5:1 on its background.
  const dim = (fg, bg, t) => readable(mix(fg, bg, t), bg, 4.5);
  return {
    desk, deskLight: mix(desk, tone, 0.35), deskDim: dim(readable(listFg, desk, 4.5), desk, 0.3),
    listBg, listFg, listHi, listSel, listSelFg, listDim: dim(listFg, listBg, 0.3),
    lcdBg, lcdFg, lcdDim: dim(lcdFg, lcdBg, 0.5), num, numBg, numFg, numDim: dim(numFg, numBg, 0.5),
    face, faceLight, faceDark, faceText, accent, accentText, accentDim: dim(accent, desk, 0.3),
    frame, frameLight, frameDark, title, titleBg: lcdBg, titleDim: dim(title, lcdBg, 0.4),
  };
}

// ---------- TEXT.BMP → font ----------
function textFont(sheet) {
  const clusters = textClusters(sheet);
  if (!clusters) return null;
  const glyphs = {};
  let lit = 0;
  for (const [ch, [row, col]] of Object.entries(TEXT_GLYPHS)) {
    const bits = new Uint8Array(30);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 5; x++) {
      const p = sheet.px(col * 5 + x, row * 6 + y);
      if (p && clusters.isInk(p)) { bits[y * 5 + x] = 1; lit++; }
    }
    glyphs[ch] = bits;
  }
  if (lit < 80) return null; // an empty or broken text sheet
  for (const [ch, rows] of Object.entries(SYMBOL_GLYPHS)) glyphs[ch] = symbolBits(rows);
  const ttf = buildPixelFont(glyphs, { family: 'Kit Pixel' });
  let binary = '';
  for (let i = 0; i < ttf.length; i += 32768) binary += String.fromCharCode(...ttf.subarray(i, i + 32768));
  return { dataUrl: `data:font/ttf;base64,${btoa(binary)}` };
}

// ---------- preview: main window, equalizer and playlist, like the Skin Museum ----------
export function renderPreview(kit, pledit) {
  const sheets = kit._sheets, c = kit.colors;
  const out = document.createElement('canvas'); out.width = 275; out.height = 348;
  const ctx = out.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const draw = (name, sx, sy, w, h, dx, dy) => { const s = sheets[name]; if (!s || sx >= s.width || sy >= s.height) return false; const cw = Math.min(w, s.width - sx), ch = Math.min(h, s.height - sy); ctx.drawImage(s.canvas, sx, sy, cw, ch, dx, dy, cw, ch); return true; };
  const text = (str, x, y) => [...str.toLowerCase()].forEach((ch, i) => { const g = TEXT_GLYPHS[ch] || TEXT_GLYPHS[' ']; draw('text', g[1] * 5, g[0] * 6, 5, 6, x + i * 5, y); });
  // Main window.
  draw('main', 0, 0, 275, 116, 0, 0);
  draw('titlebar', 27, 0, 275, 14, 0, 0);
  draw('titlebar', 0, 0, 9, 9, 6, 3); draw('titlebar', 9, 0, 9, 9, 244, 3); draw('titlebar', 0, 18, 9, 9, 254, 3); draw('titlebar', 18, 0, 9, 9, 264, 3);
  draw('titlebar', 304, 0, 8, 43, 10, 22);
  draw('playpaus', 0, 0, 9, 9, 26, 28);
  const digits = sheets.numbers ? 'numbers' : 'nums_ex';
  [[0, 48], [1, 60], [2, 78], [8, 90]].forEach(([d, x]) => draw(digits, d * 9, 0, 9, 13, x, 26));
  text('1. bit.cheer - beatmatch school', 111, 27);
  text('128', 111, 43); text('44', 156, 43);
  draw('monoster', 29, 12, 27, 12, 212, 41); draw('monoster', 0, 0, 29, 12, 239, 41);
  for (let i = 0; i < 19; i++) { const h = [9, 13, 15, 12, 10, 11, 14, 9, 7, 8, 10, 6, 5, 7, 4, 3, 4, 2, 2][i]; for (let r = 0; r < h; r++) { ctx.fillStyle = kit.vis[17 - Math.min(15, r)] || '#0f0'; ctx.fillRect(24 + i * 4, 58 - r, 3, 1); } }
  draw('volume', 0, 20 * 15, 68, 13, 107, 57); draw('volume', 15, 422, 14, 11, 147, 58);
  draw('balance', 9, 0, 38, 13, 177, 57); draw('balance', 15, 422, 14, 11, 189, 58);
  draw('shufrep', 0, 73, 23, 12, 219, 58); draw('shufrep', 23, 73, 23, 12, 242, 58);
  draw('posbar', 0, 0, 248, 10, 16, 72); draw('posbar', 248, 0, 29, 10, 60, 72);
  [[0, 16], [23, 39], [46, 62], [69, 85]].forEach(([sx, dx]) => draw('cbuttons', sx, 0, 23, 18, dx, 88));
  draw('cbuttons', 92, 0, 22, 18, 108, 88); draw('cbuttons', 114, 0, 22, 16, 136, 89);
  draw('shufrep', 28, 0, 47, 15, 164, 89); draw('shufrep', 0, 0, 28, 15, 210, 89);
  // The window's shape from region.txt, as Winamp cuts it.
  if (Array.isArray(kit.region) && kit.region.length) {
    const mask = document.createElement('canvas'); mask.width = 275; mask.height = 116;
    const m = mask.getContext('2d'); m.fillStyle = '#000';
    for (const poly of kit.region) { if (poly.length < 6) continue; m.beginPath(); m.moveTo(poly[0], poly[1]); for (let i = 2; i + 1 < poly.length; i += 2) m.lineTo(poly[i], poly[i + 1]); m.closePath(); m.fill(); }
    const main = document.createElement('canvas'); main.width = 275; main.height = 116;
    const mc = main.getContext('2d'); mc.drawImage(out, 0, 0, 275, 116, 0, 0, 275, 116); mc.globalCompositeOperation = 'destination-in'; mc.drawImage(mask, 0, 0);
    ctx.clearRect(0, 0, 275, 116); ctx.drawImage(main, 0, 0);
  }
  // Equalizer, unfocused like in the Skin Museum's pictures.
  draw('eqmain', 0, 0, 275, 116, 0, 116);
  draw('eqmain', 0, 149, 275, 14, 0, 116);
  draw('eqmain', 69, 119, 26, 12, 14, 116 + 18); draw('eqmain', 36, 119, 32, 12, 40, 116 + 18);
  draw('eqmain', 224, 164, 44, 12, 217, 116 + 18);
  const curve = [20, 14, 17, 19, 22, 24, 22, 19, 15, 12, 9];
  // Response graph: background, then the curve in the skin's own line colors.
  if (draw('eqmain', 0, 294, 113, 19, 86, 116 + 17) !== false && sheets.eqmain?.has(115, 294, 1, 19)) {
    const colorAt = y => { const p = sheets.eqmain.px(115, 294 + y); return p ? hex(...p) : '#00ff00'; };
    const bands = curve.slice(1), points = bands.map((level, i) => [i * 12.2, 18 - Math.round(level / 27 * 18)]);
    for (let x = 0; x < 113; x++) {
      const seg = Math.min(points.length - 2, Math.floor(x / 12.2)), [x0, y0] = points[seg], [x1, y1] = points[seg + 1];
      const t = Math.max(0, Math.min(1, (x - x0) / (x1 - x0))), y = Math.round(y0 + (y1 - y0) * (0.5 - Math.cos(t * Math.PI) / 2));
      ctx.fillStyle = colorAt(Math.max(0, Math.min(18, y))); ctx.fillRect(86 + x, 116 + 17 + Math.max(0, Math.min(18, y)), 1, 1);
    }
  }
  curve.forEach((level, i) => {
    const x = i === 0 ? 21 : 78 + (i - 1) * 18, frame = Math.min(27, level);
    draw('eqmain', 13 + (frame % 14) * 15, frame < 14 ? 164 : 229, 14, 63, x, 116 + 38);
    draw('eqmain', 0, 164, 11, 11, x + 1, 116 + 38 + Math.round((27 - level) / 27 * 51));
  });
  // Playlist.
  const y0 = 232;
  ctx.fillStyle = c.listBg; ctx.fillRect(12, y0 + 20, 243, 58);
  draw('pledit', 0, 21, 25, 20, 0, y0);
  for (let x = 25; x < 250; x += 25) draw('pledit', 127, 21, 25, 20, x, y0);
  draw('pledit', 26, 21, 100, 20, 87, y0);
  draw('pledit', 153, 21, 25, 20, 250, y0);
  for (let y = y0 + 20; y < y0 + 78; y += 29) { draw('pledit', 0, 42, 12, Math.min(29, y0 + 78 - y), 0, y); draw('pledit', 31, 42, 20, Math.min(29, y0 + 78 - y), 255, y); }
  draw('pledit', 0, 72, 125, 38, 0, y0 + 78);
  draw('pledit', 179, 0, 25, 38, 125, y0 + 78);
  draw('pledit', 126, 72, 150, 38, 125, y0 + 78);
  // Winamp prints the running time (selection/total) and the mini time into the bar's displays.
  text('3:16/10:28', 125 + 7, y0 + 78 + 10);
  text('01:28', 125 + 71, y0 + 78 + 23);
  draw('pledit', 52, 53, 8, 18, 260, y0 + 20);
  const rows = [['1. Foundation', '1:04'], ['2. Loop builder', '2:08'], ['3. By ear', '3:16'], ['4. Pro decks', '4:00']];
  ctx.font = `9px ${pledit?.font ? `"${pledit.font}", ` : ''}Arial, sans-serif`; ctx.textBaseline = 'top';
  rows.forEach(([name, time], i) => {
    const y = y0 + 23 + i * 13;
    if (i === 2) { ctx.fillStyle = c.listSel; ctx.fillRect(12, y - 1, 243, 13); }
    ctx.fillStyle = i === 0 ? c.listHi : c.listFg; ctx.fillText(name, 16, y + 1); ctx.fillText(time, 252 - ctx.measureText(time).width, y + 1);
  });
  return out.toDataURL('image/png');
}
