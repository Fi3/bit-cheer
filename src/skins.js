import { assetUrl } from './assets.js';
import { parse } from 'smol-toml';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';

const COLORS = ['background', 'panel', 'panelLight', 'text', 'muted', 'accent', 'secondary', 'screen', 'border'];
export const SKIN_BASES = ['millennium', 'classic', 'classified3', 'classified5', 'bento', 'alien'];
// Skins offered in the app. The others stay in code for later, but are not selectable.
export const SELECTABLE_SKINS = ['millennium'];
export const DEFAULT_SKIN = 'millennium';
// Some skins reuse another skin's structural layout (CSS) with their own art.
const LAYOUTS = { millennium: 'classified5' };
const layoutOf = base => LAYOUTS[base] || base;
export const SKIN_ASSETS = ['panel', 'titlebar', 'background', 'frame', 'buttons', 'numbers', 'platter', 'pitch'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const HEX_COLOR = /^#[a-f0-9]{6}$/i;
const IMAGE_PATH = /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(png|jpg|jpeg|webp|bmp)$/i;
const IMAGE_DATA = /^data:image\/(?:png|jpeg|bmp|webp);base64,[a-zA-Z0-9+/=]+$/;

// Colors complement the real archive bitmaps: navy/lime, gray/gold,
// chrome/blue, charcoal/teal, and Headspace's green/purple respectively.
export const themes = {
  // Original bit.cheer skin, drawn by scripts/make-millennium-skin.mjs.
  millennium: { name: 'Millennium Chrome', background: '#121b2a', panel: '#41597a', panelLight: '#d6e0ec', text: '#f2f8ff', muted: '#c9d8e8', accent: '#eaf6ff', secondary: '#b8ee75', screen: '#1f56a0', border: '#c4d0e0' },
  classic: { name: 'base-2.91', background: '#15151e', panel: '#2c2d46', panelLight: '#595a73', text: '#e4e4f0', muted: '#b1b3ca', accent: '#44ff55', secondary: '#d8bb63', screen: '#050608', border: '#77788d' },
  classified3: { name: 'Winamp3_Classified_v5.5', background: '#222221', panel: '#62625e', panelLight: '#c8c7b8', text: '#fffef1', muted: '#deddd0', accent: '#f0d16d', secondary: '#d9ddc3', screen: '#060706', border: '#b9b8ab' },
  classified5: { name: 'Winamp5_Classified_v5.5', background: '#192332', panel: '#48627d', panelLight: '#d8dfe7', text: '#f2f8ff', muted: '#d3e1ed', accent: '#d9edff', secondary: '#f5ca67', screen: '#164884', border: '#c4d0e0' },
  bento: { name: 'Bento_Classified', background: '#151819', panel: '#272d2f', panelLight: '#6c7476', text: '#e2e9e9', muted: '#a7b9ba', accent: '#b8dbdc', secondary: '#e8aa61', screen: '#070c0e', border: '#687577' },
  alien: { name: 'Headspace · Alien Lime', background: '#10170c', panel: '#29551b', panelLight: '#6c9f27', text: '#f1ffdb', muted: '#bed49a', accent: '#aeef29', secondary: '#ce9aef', screen: '#081204', border: '#7fa53a' }
};

const builtinAssets = base => base === 'millennium' ? {
  titlebar: '/skins/millennium/titlebar.png',
  frame: null,
  buttons: '/skins/millennium/cbuttons.png',
  numbers: '/skins/millennium/numbers.png',
  platter: null,
  pitch: null
} : ({
  titlebar: base === 'alien' ? null : `/skins/${base}-titlebar.png`,
  frame: base === 'alien' ? '/skins/alien-bg_drawer_left.png' : `/skins/${base}/main.png`,
  buttons: base === 'alien' ? '/skins/classic/cbuttons.png' : `/skins/${base}/cbuttons.png`,
  numbers: base === 'alien' ? '/skins/classic/numbers.png' : `/skins/${base}/${base === 'bento' ? 'nums_ex' : 'numbers'}.png`,
  platter: null,
  pitch: null
});

export function validateSkin(parsed) {
  if (!parsed || parsed.version !== 1) throw new Error('skin.toml needs version = 1.');
  if (typeof parsed.name !== 'string' || !parsed.name.trim() || parsed.name.length > 60) throw new Error('Choose a skin name from 1 to 60 characters.');
  // Older skin files without a base keep the classic layout they were made for.
  const base = parsed.base === undefined ? 'classic' : parsed.base;
  if (!SKIN_BASES.includes(base)) throw new Error(`Skin base must be one of: ${SKIN_BASES.join(', ')}.`);
  const colors = parsed.colors || {}, clean = { name: parsed.name.trim() };
  for (const key of COLORS) {
    if (colors[key] !== undefined && (typeof colors[key] !== 'string' || !HEX_COLOR.test(colors[key]))) throw new Error(`Color ${key} must be a six-digit hex color, such as #b8ee75.`);
    clean[key] = colors[key] || themes[base][key];
  }
  const assets = {};
  for (const key of Object.keys(parsed.assets || {})) {
    if (!SKIN_ASSETS.includes(key)) throw new Error(`Unknown skin asset ${key}. Supported assets: ${SKIN_ASSETS.join(', ')}.`);
    const value = parsed.assets[key];
    if (typeof value !== 'string' || !IMAGE_PATH.test(value) || value.includes('..')) throw new Error(`Asset ${key} must be a relative image path inside the ZIP.`);
    assets[key] = value;
  }
  return { base, theme: clean, assets };
}

export function readArchive(bytes) {
  let expanded = 0, count = 0;
  return unzipSync(bytes, { filter: entry => {
    expanded += entry.originalSize; count++;
    if (expanded > 24 * 1024 * 1024 || count > 120) throw new Error('Skin archive is too large (24 MB expanded, 120 files maximum).');
    if (/^(?:\/|[A-Za-z]:)|(?:^|\/)\.\.(?:\/|$)|\\/.test(entry.name)) throw new Error('Skin archive contains an unsafe file path.');
    return true;
  } });
}

function mimeType(path) {
  return /\.bmp$/i.test(path) ? 'image/bmp' : /\.jpe?g$/i.test(path) ? 'image/jpeg' : /\.webp$/i.test(path) ? 'image/webp' : 'image/png';
}
function dataUrl(bytes, path) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return `data:${mimeType(path)};base64,${btoa(binary)}`;
}
function checkImageSize(bytes) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Each skin image must contain data and be smaller than 2 MB.');
}
async function imageBitmap(bytes, path) {
  checkImageSize(bytes);
  let bitmap;
  try { bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType(path) })); }
  catch { throw new Error(`Cannot decode skin image: ${path}`); }
  if (!bitmap.width || !bitmap.height || bitmap.width > 4096 || bitmap.height > 4096 || bitmap.width * bitmap.height > 16_777_216) {
    bitmap.close(); throw new Error('Skin images must be no larger than 4096 × 4096 pixels.');
  }
  return bitmap;
}
function numberWidth(bitmap) {
  if (![99, 108].includes(bitmap.width) || bitmap.height !== 13) throw new Error('Number sheets must use the Winamp layout: 99 × 13 or 108 × 13 pixels.');
  return bitmap.width * 3;
}


// Classic Winamp 2 sprite positions (x, y, w, h) we reuse around the app.
// Missing files or sheets that are too small are skipped, never fatal.
const WSZ_SPRITES = {
  cbuttons: { prev: [0, 0, 23, 18], prevDown: [0, 18, 23, 18], stop: [69, 0, 23, 18], stopDown: [69, 18, 23, 18], next: [92, 0, 22, 18], nextDown: [92, 18, 22, 18], eject: [114, 0, 22, 16], ejectDown: [114, 16, 22, 16] },
  pledit: { plTopLeft: [0, 0, 25, 20], plTitle: [26, 0, 100, 20], plTopFill: [127, 0, 25, 20], plTopRight: [153, 0, 25, 20], plLeft: [0, 42, 12, 29], plRight: [31, 42, 20, 29], plBottomFill: [179, 0, 25, 38], plBottomLeft: [0, 72, 125, 38], plBottomRight: [126, 72, 150, 38] },
  volume: { volTrack: [0, 405, 68, 13], volThumb: [15, 422, 14, 11], volThumbDown: [0, 422, 14, 11] },
  balance: { balTrack: [9, 0, 38, 13], balThumb: [15, 422, 14, 11], balThumbDown: [0, 422, 14, 11] },
  eqmain: { eqBar: [13, 229, 14, 63], eqThumb: [0, 164, 11, 11], eqThumbDown: [0, 176, 11, 11], eqTitle: [0, 134, 275, 14] },
  posbar: { posTrack: [0, 0, 248, 10], posThumb: [248, 0, 29, 10], posThumbDown: [278, 0, 29, 10] },
  titlebar: { tbClose: [18, 0, 9, 9], tbCloseDown: [18, 9, 9, 9], tbShade: [0, 18, 9, 9], tbShadeDown: [9, 18, 9, 9], tbInactive: [27, 15, 275, 14] },
  shufrep: { shuffle: [28, 0, 47, 15], shuffleDown: [28, 15, 47, 15] },
};
export const LIVE_SHEETS = ['main', 'titlebar', 'cbuttons', 'posbar', 'volume', 'balance', 'numbers', 'nums_ex', 'text', 'playpaus', 'monoster', 'shufrep'];
export const WSZ_SPRITE_KEYS = Object.values(WSZ_SPRITES).flatMap(group => Object.keys(group));

async function wszExtras(files, find, mainCanvas, hex) {
  const sprites = {};
  for (const [sheet, crops] of Object.entries(WSZ_SPRITES)) {
    const path = find(`${sheet}.bmp`);
    if (!path) continue;
    let bitmap;
    try { bitmap = await imageBitmap(files[path], path); } catch { continue; }
    for (const [key, [x, y, w, h]] of Object.entries(crops)) {
      if (x + w > bitmap.width || y + h > bitmap.height) continue;
      const crop = document.createElement('canvas'); crop.width = w; crop.height = h;
      crop.getContext('2d').drawImage(bitmap, x, y, w, h, 0, 0, w, h);
      sprites[key] = crop.toDataURL('image/png');
    }
    bitmap.close();
  }
  // Playlist colors are the skin author's own text palette.
  const colors = {}, pledit = {};
  const pleditPath = find('pledit.txt');
  if (pleditPath) {
    const read = name => strFromU8(files[pleditPath]).match(new RegExp(`^\\s*${name}\\s*=\\s*#?([0-9a-f]{6})`, 'im'))?.[1];
    const normal = read('Normal'), current = read('Current'), bg = read('NormalBG'), selected = read('SelectedBG');
    pledit.normal = normal && `#${normal}`; pledit.current = current && `#${current}`; pledit.bg = bg && `#${bg}`; pledit.selected = selected && `#${selected}`;
  }
  // Darkest main.bmp tone for the page behind the decks.
  const data = mainCanvas.getContext('2d').getImageData(0, 0, mainCanvas.width, mainCanvas.height).data;
  let dark = [255, 255, 255], lum = 765;
  for (let i = 0; i < data.length; i += 64) { const l = data[i] + data[i + 1] + data[i + 2]; if (l > 30 && l < lum) { lum = l; dark = [data[i], data[i + 1], data[i + 2]]; } }
  colors.background = hex(dark[0] * 0.6, dark[1] * 0.6, dark[2] * 0.6);
  return { sprites, colors, pledit };
}

// Draws the skin's main window and equalizer the way Winamp shows them (275 × 232),
// so Skin studio can show a real picture of the skin at its true proportions.
async function renderWindowPreview(files, find) {
  const sheets = {};
  for (const name of ['main', 'titlebar', 'cbuttons', 'posbar', 'volume', 'balance', 'shufrep', 'monoster', 'playpaus', 'numbers', 'nums_ex', 'text', 'eqmain']) {
    const path = find(`${name}.bmp`);
    if (!path) continue;
    try { sheets[name] = await imageBitmap(files[path], path); } catch { /* skip broken sheets */ }
  }
  if (!sheets.main) return null;
  const out = document.createElement('canvas'); out.width = 275; out.height = sheets.eqmain ? 232 : 116;
  const ctx = out.getContext('2d');
  const draw = (sheet, sx, sy, w, h, dx, dy) => {
    const img = sheets[sheet];
    if (img && sx + w <= img.width && sy + h <= img.height) ctx.drawImage(img, sx, sy, w, h, dx, dy, w, h);
  };
  // Main window.
  draw('main', 0, 0, 275, 116, 0, 0);
  draw('titlebar', 27, 0, 275, 14, 0, 0);
  draw('playpaus', 0, 0, 9, 9, 26, 28);
  const digits = sheets.numbers ? 'numbers' : 'nums_ex', time = [0, 1, 2, 8];
  [48, 60, 78, 90].forEach((x, i) => draw(digits, time[i] * 9, 0, 9, 13, x, 26));
  const title = 'BIT CHEER  BEATMATCH SCHOOL';
  [...title].forEach((ch, i) => { const c = ch.charCodeAt(0) - 65; if (c >= 0 && c < 26) draw('text', c * 5, 0, 5, 6, 111 + i * 5, 27); });
  ['1', '2', '8'].forEach((d, i) => draw('text', Number(d) * 5, 6, 5, 6, 111 + i * 5, 43));
  ['4', '4'].forEach((d, i) => draw('text', Number(d) * 5, 6, 5, 6, 156 + i * 5, 43));
  draw('monoster', 0, 0, 29, 12, 212, 41);
  draw('monoster', 29, 12, 27, 12, 239, 41);
  draw('volume', 0, 20 * 15, 68, 13, 107, 57); draw('volume', 15, 422, 14, 11, 147, 58);
  draw('balance', 9, 0, 38, 13, 177, 57); draw('balance', 15, 422, 14, 11, 189, 58);
  draw('shufrep', 0, 61, 23, 12, 219, 58); draw('shufrep', 23, 61, 23, 12, 242, 58);
  draw('posbar', 0, 0, 248, 10, 16, 72); draw('posbar', 248, 0, 29, 10, 76, 72);
  [[0, 16], [23, 39], [46, 62], [69, 85]].forEach(([sx, dx]) => draw('cbuttons', sx, 0, 23, 18, dx, 88));
  draw('cbuttons', 92, 0, 22, 18, 108, 88); draw('cbuttons', 114, 0, 22, 16, 136, 89);
  draw('shufrep', 28, 0, 47, 15, 164, 89); draw('shufrep', 0, 0, 28, 15, 210, 89);
  // Equalizer, with a gentle smile curve on its sliders.
  if (sheets.eqmain) {
    draw('eqmain', 0, 0, 275, 116, 0, 116);
    draw('eqmain', 0, 134, 275, 14, 0, 116);
    const curve = [20, 12, 16, 19, 22, 24, 22, 19, 15, 12, 9];
    curve.forEach((level, i) => {
      const x = i === 0 ? 21 : 78 + (i - 1) * 18, frame = Math.min(27, level);
      draw('eqmain', 13 + (frame % 14) * 15, frame < 14 ? 164 : 229, 14, 63, x, 116 + 38);
      draw('eqmain', 0, 164, 11, 11, x + 1, 116 + 38 + Math.round((27 - level) / 27 * 51));
    });
  }
  for (const img of Object.values(sheets)) img.close();
  return out.toDataURL('image/png');
}

// ---------- readable colors ----------
const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => toHex(rgbOf(a).map((v, i) => v + (rgbOf(b)[i] - v) * t));
const luminance = h => { const [r, g, b] = rgbOf(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
// Push a color toward white or black until it reads well on the background.
function readable(fg, bg, min) {
  const target = luminance(bg) > 0.35 ? '#000000' : '#ffffff';
  let color = fg;
  for (let t = 0.1; contrast(color, bg) < min && t <= 1; t += 0.1) color = mix(fg, target, t);
  return color;
}
// One palette for the whole app, built from the skin's playlist colors,
// the same pair Winamp itself uses for readable text.
function readablePalette(theme, pledit) {
  const valid = c => typeof c === 'string' && HEX_COLOR.test(c);
  const bg = valid(pledit.bg) ? pledit.bg.toLowerCase() : '#000000';
  const normal = readable(valid(pledit.normal) ? pledit.normal.toLowerCase() : '#00ff00', bg, 7);
  const current = readable(valid(pledit.current) ? pledit.current.toLowerCase() : '#ffffff', bg, 7);
  let selected = valid(pledit.selected) ? pledit.selected.toLowerCase() : mix(bg, normal, 0.35);
  if (contrast(selected, bg) < 1.6) selected = mix(bg, normal, 0.35);
  const panel = mix(bg, normal, 0.1), panelLight = mix(bg, normal, 0.2);
  return {
    background: bg, screen: bg, panel, panelLight,
    text: readable(current, panel, 7), muted: readable(mix(normal, bg, 0.25), panel, 4.5),
    accent: current, secondary: normal, border: selected,
  };
}

async function fromWsz(files, filename) {
  const paths = Object.keys(files);
  const find = name => paths.find(path => path.split('/').at(-1).toLowerCase() === name.toLowerCase());
  const main = find('main.bmp');
  if (!main) throw new Error('This WSZ is missing main.bmp. Only classic Winamp 2 skins are supported.');
  const bitmap = await imageBitmap(files[main], main);
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
  const rgb = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < rgb.length; i += 16) {
    const luminance = (rgb[i] + rgb[i + 1] + rgb[i + 2]) / 3;
    if (luminance > 25 && luminance < 200) { r += rgb[i]; g += rgb[i + 1]; b += rgb[i + 2]; n++; }
  }
  const hex = (red, green, blue) => '#' + [red, green, blue].map(value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('');
  const theme = { ...themes.classic, name: filename.replace(/\.(wsz|zip)$/i, '').slice(0, 60) || 'Imported Winamp skin',
    panel: n ? hex(r / n, g / n, b / n) : themes.classic.panel,
    panelLight: n ? hex(r / n * 1.3, g / n * 1.3, b / n * 1.3) : themes.classic.panelLight };
  const extra = await wszExtras(files, find, canvas, hex);
  const windowPreview = await renderWindowPreview(files, find);
  Object.assign(theme, extra.colors, readablePalette(theme, extra.pledit));
  const images = { frame: dataUrl(files[main], main) }, originals = { main: images.frame };
  let numbersWidth = 297;
  for (const [key, name] of [['buttons', 'cbuttons.bmp'], ['numbers', 'numbers.bmp'], ['pitch', 'posbar.bmp']]) {
    const path = find(name) || (key === 'numbers' ? find('nums_ex.bmp') : null);
    if (!path) continue;
    const image = await imageBitmap(files[path], path);
    try { if (key === 'numbers') numbersWidth = numberWidth(image); } finally { image.close(); }
    images[key] = dataUrl(files[path], path); originals[key] = images[key];
  }
  const titlePath = find('titlebar.bmp');
  const titleBitmap = titlePath ? await imageBitmap(files[titlePath], titlePath) : null;
  if (titlePath) originals.titlebar = dataUrl(files[titlePath], titlePath);
  const titleSource = titleBitmap || canvas;
  const title = document.createElement('canvas');
  const x = titleBitmap && titleBitmap.width >= 302 ? 27 : 0;
  title.width = Math.min(275, titleSource.width - x); title.height = Math.min(14, titleSource.height);
  title.getContext('2d').drawImage(titleSource, x, 0, title.width, title.height, 0, 0, title.width, title.height);
  titleBitmap?.close(); images.titlebar = title.toDataURL('image/png');
  // Full sheets for the live Winamp window on each deck.
  const sheets = {};
  for (const name of LIVE_SHEETS) {
    const path = find(`${name}.bmp`);
    if (path && files[path].length <= MAX_IMAGE_BYTES) sheets[name] = dataUrl(files[path], path);
  }
  const visPath = find('viscolor.txt');
  const viscolor = visPath ? strFromU8(files[visPath]).split(/\r?\n/).map(line => line.match(/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)).filter(Boolean).slice(0, 24).map(m => hex(+m[1], +m[2], +m[3])) : [];
  // The skin's main color, for borders and frames (never behind text).
  const tone = n ? hex(r / n, g / n, b / n) : null;
  return { base: 'classic', theme, assets: {}, images, originals, numbersWidth, preview: windowPreview || images.frame, sprites: extra.sprites, sheets, viscolor, tone };
}

export async function importSkin(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Skins must be smaller than 10 MB.');
  if (/\.toml$/i.test(file.name)) {
    const result = validateSkin(parse(await file.text()));
    if (Object.keys(result.assets).length) throw new Error('This skin includes images. Put skin.toml and its images together in a ZIP.');
    return { ...result, images: {} };
  }
  if (!/\.(zip|wsz)$/i.test(file.name)) throw new Error('Choose a .toml, .zip, or classic Winamp .wsz file.');
  const files = readArchive(new Uint8Array(await file.arrayBuffer()));
  const path = Object.keys(files).find(name => /(^|\/)skin.toml$/i.test(name));
  if (!path) return fromWsz(files, file.name);
  const root = path.slice(0, -'skin.toml'.length), result = validateSkin(parse(strFromU8(files[path]))), images = {};
  let numbersWidth = result.base === 'bento' ? 324 : 297;
  for (const [key, path] of Object.entries(result.assets)) {
    const data = files[root + path];
    if (!data) throw new Error(`Missing skin asset: ${path}`);
    const bitmap = await imageBitmap(data, path);
    try { if (key === 'numbers') numbersWidth = numberWidth(bitmap); } finally { bitmap.close(); }
    images[key] = dataUrl(data, path);
  }
  return { ...result, images, numbersWidth };
}

// Accepts a Winamp Skin Museum link, e.g.
// https://skins.webamp.org/skin/5ea2d974dad5507b83a6ddff7003a8ee/Yufo06.wsz
// The museum page itself is HTML, so we download the .wsz from its file server.
const MUSEUM_FILES = 'https://r2.webampskins.org/skins/';
export function museumSkinUrl(input) {
  let url;
  try { url = new URL(String(input).trim()); } catch { throw new Error('That doesn’t look like a link. Copy the full address from skins.webamp.org and paste it here.'); }
  const md5 = url.pathname.match(/[a-f0-9]{32}/i)?.[0]?.toLowerCase();
  const museum = /(^|\.)webamp\.org$|(^|\.)webampskins\.org$/i.test(url.hostname);
  if (!museum || !md5) throw new Error('Paste a skin link from skins.webamp.org, like https://skins.webamp.org/skin/5ea2d974dad5507b83a6ddff7003a8ee/Yufo06.wsz');
  const name = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || '');
  return { download: `${MUSEUM_FILES}${md5}.wsz`, filename: /\.wsz$/i.test(name) ? name : `${md5}.wsz` };
}

export async function importSkinFromUrl(input) {
  const { download, filename } = museumSkinUrl(input);
  let response;
  try { response = await fetch(download); } catch { throw new Error('Couldn’t reach the Winamp Skin Museum. Check your connection and try again.'); }
  if (!response.ok) throw new Error(response.status === 404 ? 'The museum doesn’t have a file for that skin. Try another one.' : `The museum answered with error ${response.status}. Try again in a moment.`);
  const blob = await response.blob();
  const skin = await importSkin(new File([blob], filename));
  return { ...skin, source: museumPage(input) };
}

function museumPage(input) {
  const md5 = String(input).match(/[a-f0-9]{32}/i)?.[0]?.toLowerCase();
  return md5 ? `https://skins.webamp.org/skin/${md5}/` : '';
}

// What Skin studio shows as "Now wearing".
export function skinPicture(id, custom) {
  if (id === 'custom') return typeof custom?.preview === 'string' && IMAGE_DATA.test(custom.preview) ? custom.preview : '';
  return Object.hasOwn(themes, id) ? assetUrl(`/skins/${id}.png`) : '';
}

export function applySkin(id, custom = null) {
  const builtin = Object.hasOwn(themes, id) ? id : DEFAULT_SKIN;
  const base = custom ? (SKIN_BASES.includes(custom.base) ? custom.base : 'classic') : builtin;
  const theme = { ...themes[base], name: custom?.theme?.name || themes[base].name };
  for (const key of COLORS) if (custom?.theme?.[key] && HEX_COLOR.test(custom.theme[key])) theme[key] = custom.theme[key];
  const root = document.documentElement;
  root.dataset.skin = custom ? 'custom' : builtin;
  root.dataset.layout = layoutOf(base);
  for (const key of COLORS) root.style.setProperty(`--${key.replace(/[A-Z]/g, match => '-' + match.toLowerCase())}`, theme[key]);
  const inherited = builtinAssets(base), urls = {}, artwork = [];
  for (const key of SKIN_ASSETS) {
    const supplied = custom?.images?.[key];
    const valid = typeof supplied === 'string' && IMAGE_DATA.test(supplied);
    if (valid) artwork.push(key);
    const asset = valid ? supplied : inherited[key] ? assetUrl(inherited[key]) : null;
    urls[key] = asset ? `url("${asset}")` : 'none';
    root.style.setProperty(`--skin-${key}`, urls[key]);
  }
  root.dataset.artwork = artwork.join(' ');
  const sprites = [];
  for (const key of WSZ_SPRITE_KEYS) {
    const value = custom?.sprites?.[key];
    const ok = typeof value === 'string' && IMAGE_DATA.test(value);
    if (ok) sprites.push(key);
    root.style.setProperty(`--wsz-${key}`, ok ? `url("${value}")` : 'none');
  }
  // Main window art doubles as the deck backdrop for imported Winamp skins.
  const main = custom?.originals?.main;
  if (sprites.length && typeof main === 'string' && IMAGE_DATA.test(main)) { sprites.push('main'); root.style.setProperty('--wsz-main', `url("${main}")`); }
  else root.style.setProperty('--wsz-main', 'none');
  root.dataset.wsz = sprites.join(' ');
  const tone = custom?.tone;
  root.style.setProperty('--skin-tone', typeof tone === 'string' && HEX_COLOR.test(tone) ? tone : 'var(--border)');
  root.style.setProperty('--number-sheet', urls.numbers);
  root.style.setProperty('--transport-sheet', urls.buttons);
  const width = custom?.numbersWidth === 297 || custom?.numbersWidth === 324 ? custom.numbersWidth : base === 'bento' ? 324 : 297;
  root.style.setProperty('--numbers-width', `${width}px`);
  return theme.name;
}

export function skinTemplate() {
  return `# Bit Cheer skin v1\n# Keep skin.toml and optional raster assets together inside a ZIP.\nversion = 1\nname = "My midnight session"\n# Start from: millennium (recommended), classic, classified3, classified5, bento, or alien.\nbase = "millennium"\n\n# Omitted colors and assets inherit your chosen base.\n[colors]\n${COLORS.map(key => `${key} = "${themes.millennium[key]}"`).join('\n')}\n\n# Raster formats: PNG, JPG, WebP, BMP. Relative paths only.\n# [assets]\n# panel = "graphics/panel.png"          # Repeating panel texture\n# titlebar = "graphics/titlebar.png"    # Active title strip, ideally 275x14\n# background = "graphics/background.jpg" # Page background\n# frame = "graphics/main.png"          # Main player frame, traditionally 275x116\n# buttons = "graphics/cbuttons.png"    # Original transport sprite, 136x36\n# numbers = "graphics/numbers.png"     # 99x13 (NUMBERS) or 108x13 (NUMS_EX)\n# platter = "graphics/platter.png"     # Jog-wheel artwork\n# pitch = "graphics/pitch.png"         # Pitch panel texture or artwork\n`;
}

export function downloadTemplate() {
  const readme = `BIT CHEER SKIN FORMAT v1\n\nEdit skin.toml; import it alone for a color/layout skin, or zip it with images.\nbase selects the starting skin: millennium, classic, classified3, classified5, bento, alien.\nOmitting base keeps older skins on classic. Missing colors and artwork inherit that base.\nAll nine colors use #rrggbb. Artwork can replace the panel, titlebar, page background,\nframe, transport buttons, number glyphs, platter, and pitch fader. Paths are relative\nto skin.toml. PNG/JPG/WebP/BMP only; no scripts, SVG, remote URLs, or parent paths.\n\nSprite conventions: buttons uses the classic Winamp 136x36 CBUTTONS sheet.\nNumber sheets are 99x13 NUMBERS or 108x13 NUMS_EX; the UI scales glyphs 3x.\nTitle strips are normally 275x14; frame artwork is normally MAIN 275x116.\nOther raster artwork may use different dimensions, up to 4096x4096 pixels.\nEach image must be below 2MB; archive below 10MB compressed and 24MB expanded;\n120 files maximum.\n\nClassic Winamp 2 .wsz archives can be imported directly. Bit Cheer preserves MAIN,\nCBUTTONS, NUMBERS/NUMS_EX, POSBAR, and TITLEBAR artwork. The active title strip is\ncropped from the original TITLEBAR at x27,y0,275x14 when the full sheet is present.\nThese archives use the classic structural layout; use a TOML base to choose another.\nModern .wal/.wms skin scripts are not executed.\n`;
  const bytes = zipSync({ 'skin.toml': strToU8(skinTemplate()), 'README.txt': strToU8(readme) });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' })), a = document.createElement('a');
  a.href = url; a.download = 'bit-cheer-skin-template.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
