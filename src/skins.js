import { assetUrl } from './assets.js';
import { parse } from 'smol-toml';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';
import { buildKit, renderPreview, mix, KIT_PART_KEYS, KIT_COLOR_KEYS, KIT_VERSION } from './skin-kit.js';

const COLORS = ['background', 'panel', 'panelLight', 'text', 'muted', 'accent', 'secondary', 'screen', 'border'];
export const SKIN_BASES = ['millennium', 'classic', 'classified3', 'classified5', 'bento', 'alien'];
// Skins offered in the app. The others stay in code for later, but are not selectable.
export const SELECTABLE_SKINS = ['millennium', 'mochi'];
export const DEFAULT_SKIN = 'millennium';
// Some skins reuse another skin's structural layout (CSS) with their own art.
const LAYOUTS = { millennium: 'classified5', mochi: 'classified5' };
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
  // bit.cheer's cute skin, drawn by scripts/make-mochi-skin.mjs.
  mochi: { name: 'Strawberry Mochi', background: '#3a1a35', panel: '#a8557f', panelLight: '#ffd3e5', text: '#fff3f8', muted: '#ffc7dd', accent: '#fff3f8', secondary: '#8fe6c3', screen: '#4b1f47', border: '#f0b3cc' },
  classic: { name: 'base-2.91', background: '#15151e', panel: '#2c2d46', panelLight: '#595a73', text: '#e4e4f0', muted: '#b1b3ca', accent: '#44ff55', secondary: '#d8bb63', screen: '#050608', border: '#77788d' },
  classified3: { name: 'Winamp3_Classified_v5.5', background: '#222221', panel: '#62625e', panelLight: '#c8c7b8', text: '#fffef1', muted: '#deddd0', accent: '#f0d16d', secondary: '#d9ddc3', screen: '#060706', border: '#b9b8ab' },
  classified5: { name: 'Winamp5_Classified_v5.5', background: '#192332', panel: '#48627d', panelLight: '#d8dfe7', text: '#f2f8ff', muted: '#d3e1ed', accent: '#d9edff', secondary: '#f5ca67', screen: '#164884', border: '#c4d0e0' },
  bento: { name: 'Bento_Classified', background: '#151819', panel: '#272d2f', panelLight: '#6c7476', text: '#e2e9e9', muted: '#a7b9ba', accent: '#b8dbdc', secondary: '#e8aa61', screen: '#070c0e', border: '#687577' },
  alien: { name: 'Headspace · Alien Lime', background: '#10170c', panel: '#29551b', panelLight: '#6c9f27', text: '#f1ffdb', muted: '#bed49a', accent: '#aeef29', secondary: '#ce9aef', screen: '#081204', border: '#7fa53a' }
};

const builtinAssets = base => base === 'millennium' || base === 'mochi' ? {
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
  try {
    return unzipSync(bytes, { filter: entry => {
      expanded += entry.originalSize; count++;
      if (expanded > 24 * 1024 * 1024 || count > 120) throw new Error('Skin archive is too large (24 MB expanded, 120 files maximum).');
      if (/^(?:\/|[A-Za-z]:)|(?:^|\/)\.\.(?:\/|$)|\\/.test(entry.name)) throw new Error('Skin archive contains an unsafe file path.');
      return true;
    } });
  } catch (error) {
    // fflate's own errors carry a numeric code ("invalid zip data"…); ours above already read well.
    if (typeof error?.code === 'number') throw new Error('This file isn’t a readable skin archive: it may be damaged or only partly downloaded. Skins are .wsz (ZIP) files.');
    throw error;
  }
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


// ---------- classic Winamp 2 skins (.wsz) ----------
// The archive becomes a "kit" (see skin-kit.js): pieces, palette, font and window shape.
const IMAGE_PNG = /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/;
// Images the look settings prepare on this page (skin-enhance.js): blob URLs of this origin only.
const ownBlob = v => typeof v === 'string' && typeof location !== 'undefined' && v.startsWith(`blob:${location.origin}/`) && /^blob:[^\s"'()\\]+$/.test(v);
const kitImage = v => typeof v === 'string' && (IMAGE_PNG.test(v) || ownBlob(v));
const FONT_DATA = /^data:font\/ttf;base64,[a-zA-Z0-9+/=]+$/;
export { contrast } from './skin-kit.js';

// bit.cheer's own Millennium Chrome (an original Winamp 2 skin) fills in anything an
// imported skin leaves out, the way Winamp falls back to its default skin.
let baseArchive = null;
function fetchBaseSkin() {
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(8000) : undefined;
  baseArchive ||= fetch(assetUrl('/skins/millennium.wsz'), { signal }).then(async response => {
    if (!response.ok) throw new Error('Base skin unavailable');
    return readArchive(new Uint8Array(await response.arrayBuffer()));
  });
  // A failed download is retried next time instead of being remembered.
  baseArchive.catch(() => { baseArchive = null; });
  return baseArchive;
}

// Built-in skins drawn as Winamp skins get the same kit as imports, each built once, when first needed.
// Strawberry Mochi's windows sit on soft lavender; the others keep the page color drawn from their art.
const BUILTIN_DESKS = { mochi: '#7d63a8' };
const builtinKits = {}, builtinBuilds = {};
async function buildBuiltin(id) {
  const files = id === 'millennium' ? await fetchBaseSkin() : await fetch(assetUrl(`/skins/${id}.wsz`)).then(async response => {
    if (!response.ok) throw new Error(`Built-in skin ${id} unavailable`);
    return readArchive(new Uint8Array(await response.arrayBuffer()));
  });
  const kit = await buildKit(files, { fetchBase: fetchBaseSkin, desk: BUILTIN_DESKS[id] });
  const preview = renderPreview(kit, kit._pledit);
  delete kit._sheets; delete kit._pledit;
  builtinKits[id] = { base: 'classic', theme: { name: themes[id].name }, images: {}, kit, preview };
}
/** Builds a built-in skin's kit (once); resolves to whether it is ready. */
export function prepareBuiltinSkin(id) {
  if (!SELECTABLE_SKINS.includes(id)) return Promise.resolve(false);
  builtinBuilds[id] ||= buildBuiltin(id).then(() => true, () => { delete builtinBuilds[id]; return false; }); // the classic CSS look still works without it
  return builtinBuilds[id];
}
/** Builds the skin the page starts with first (the default when none is saved); the others follow. */
export async function prepareBuiltinSkins(first = DEFAULT_SKIN) {
  const start = SELECTABLE_SKINS.includes(first) ? first : DEFAULT_SKIN;
  const ready = await prepareBuiltinSkin(start);
  for (const id of SELECTABLE_SKINS) if (id !== start) prepareBuiltinSkin(id);
  return ready;
}
export const builtinKit = id => builtinKits[id] || null;

async function fromWsz(files, filename) {
  const kit = await buildKit(files, { fetchBase: fetchBaseSkin });
  const preview = renderPreview(kit, kit._pledit);
  delete kit._sheets; delete kit._pledit;
  const c = kit.colors;
  const name = filename.replace(/\.(wsz|zip)$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 60) || 'Imported Winamp skin';
  // Classic palette names stay filled for anything that still reads them.
  const theme = { name, background: c.desk, panel: c.listBg, panelLight: c.listSel, text: c.listFg, muted: mix(c.listFg, c.listBg, 0.3), accent: c.listHi, secondary: c.lcdFg, screen: c.lcdBg, border: c.frame };
  return { base: 'classic', theme, assets: {}, images: { titlebar: kit.parts.titleStrip }, kit, preview };
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
// https://skins.webamp.org/skin/2a0453c5c41414a4e359f0797f47a830/cuteamp.wsz
// The museum page itself is HTML, so we download the .wsz from its file server.
const MUSEUM_FILES = 'https://r2.webampskins.org/skins/';
export function museumSkinUrl(input) {
  let url;
  try { url = new URL(String(input).trim()); } catch { throw new Error('That doesn’t look like a link. Copy the full address from skins.webamp.org and paste it here.'); }
  const md5 = url.pathname.match(/[a-f0-9]{32}/i)?.[0]?.toLowerCase();
  const museum = /(^|\.)webamp\.org$|(^|\.)webampskins\.org$/i.test(url.hostname);
  if (!museum || !md5) throw new Error('Paste a skin link from skins.webamp.org, like https://skins.webamp.org/skin/2a0453c5c41414a4e359f0797f47a830/cuteamp.wsz');
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
  if (!md5) return '';
  // Keep the skin's file name, so a later refresh still knows what it is called.
  let name = '';
  try { name = decodeURIComponent(new URL(String(input).trim()).pathname.split('/').filter(Boolean).at(-1) || ''); } catch { /* not a URL */ }
  return /^[^/?#]{1,80}\.wsz$/i.test(name) ? `https://skins.webamp.org/skin/${md5}/${encodeURIComponent(name)}` : `https://skins.webamp.org/skin/${md5}/`;
}

// What Skin studio shows as "Now wearing".
export function skinPicture(id, custom) {
  if (id === 'custom') return typeof custom?.preview === 'string' && IMAGE_DATA.test(custom.preview) ? custom.preview : '';
  if (builtinKits[id]?.preview) return builtinKits[id].preview;
  return Object.hasOwn(themes, id) ? assetUrl(`/skins/${id}.png`) : '';
}

const kebab = key => key.replace(/[A-Z]/g, match => '-' + match.toLowerCase());
const KIT_SHEET_NAMES = ['main', 'titlebar', 'cbuttons', 'posbar', 'volume', 'balance', 'numbers', 'nums_ex', 'text', 'playpaus', 'monoster', 'shufrep', 'eqmain'];
// A stored kit is only used when it is current and made of safe, generated images.
export function validKit(kit) {
  return !!kit && typeof kit === 'object' && kit.version === KIT_VERSION && typeof kit.sheets?.main === 'string' && IMAGE_PNG.test(kit.sheets.main);
}

let kitFont = null, kitFontSource = '';
function loadKitFont(source) {
  if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') return;
  if (source === kitFontSource) return;
  if (kitFont) { document.fonts.delete(kitFont); kitFont = null; }
  kitFontSource = typeof source === 'string' ? source : '';
  if (!kitFontSource || !FONT_DATA.test(kitFontSource)) return;
  let bytes;
  try { const binary = atob(kitFontSource.slice(kitFontSource.indexOf(',') + 1)); bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); }
  catch { return; } // a damaged stored font: the labels fall back to the monospace font
  const face = new FontFace('Kit Pixel', bytes.buffer);
  kitFont = face; document.fonts.add(face);
  face.load().catch(() => { if (kitFont === face) { document.fonts.delete(face); kitFont = null; } });
}

// Kit variables carry hundreds of KB of images: keep them in one stylesheet rather than in
// the root element's style attribute. Every value is validated before it gets here.
function writeKitVars(root, vars) {
  const canStyle = typeof document.getElementById === 'function' && typeof document.createElement === 'function' && document.head;
  if (canStyle) {
    let style = document.getElementById('bit-cheer-kit');
    if (!style) { style = document.createElement('style'); style.id = 'bit-cheer-kit'; document.head.append(style); }
    // One :root rule, filled property by property, so no value can ever add rules of its own.
    style.textContent = ':root{}';
    const rule = style.sheet?.cssRules?.[0];
    if (vars && rule) for (const [key, value] of Object.entries(vars)) rule.style.setProperty(key, value);
    return;
  }
  if (vars) for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
}

function applyKit(root, kit) {
  const colors = kit.colors || {}, vars = {};
  // Colors added after a kit was saved fall back to their closest older relative.
  const relative = { numBg: 'lcdBg', numFg: 'lcdFg', numDim: 'lcdDim' };
  for (const key of KIT_COLOR_KEYS) {
    const value = HEX_COLOR.test(colors[key] || '') ? colors[key] : colors[relative[key]];
    vars[`--k-${kebab(key)}`] = HEX_COLOR.test(value || '') ? value : '#808080';
  }
  (Array.isArray(kit.vis) ? kit.vis : []).slice(0, 24).forEach((color, i) => { vars[`--k-vis-${i}`] = HEX_COLOR.test(color) ? color : '#00ff00'; });
  const present = [];
  for (const key of KIT_PART_KEYS) {
    const value = kit.parts?.[key], ok = kitImage(value);
    if (ok) present.push(key);
    vars[`--k-${kebab(key)}`] = ok ? `url("${value}")` : 'none';
  }
  for (const name of KIT_SHEET_NAMES) {
    const value = kit.sheets?.[name], ok = kitImage(value);
    if (ok) present.push(`sheet-${name}`);
    vars[`--k-sheet-${kebab(name)}`] = ok ? `url("${value}")` : 'none';
  }
  // Kits from before the cleaned transport sheet keep the plain one.
  if (vars['--k-cb-clean'] === 'none') vars['--k-cb-clean'] = vars['--k-sheet-cbuttons'];
  // Window corners without the buttons a window can't honour fall back to the skin's own corner.
  const corner = vars['--k-pl-tr'], cornerI = vars['--k-pl-tr-i'] !== 'none' ? vars['--k-pl-tr-i'] : corner;
  for (const [key, fallback] of [['--k-pl-tr-plain', corner], ['--k-pl-tr-shade', corner], ['--k-pl-tr-close', corner], ['--k-pl-tr-plain-i', cornerI], ['--k-pl-tr-shade-i', cornerI]]) if (vars[key] === 'none') vars[key] = fallback;
  vars['--k-numbers-w'] = kit.numbersWidth === 108 ? '108' : '99';
  vars['--k-gen-slice'] = String(Number.isInteger(kit.genSlice) && kit.genSlice >= 2 && kit.genSlice <= 8 ? kit.genSlice : 3);
  // The 9-slice cut is measured in image pixels: finer (HD) images need a proportionally deeper cut.
  vars['--k-gen-slice-img'] = String(Number(vars['--k-gen-slice']) * ([1, 2, 3, 4].includes(kit.scale) ? kit.scale : 1));
  vars['--k-bottom-edge'] = String(Number.isInteger(kit.bottomEdge) && kit.bottomEdge >= 2 && kit.bottomEdge <= 14 ? kit.bottomEdge : 6);
  vars['--k-number-sheet'] = kitImage(kit.sheets?.numbers) ? `url("${kit.sheets.numbers}")` : kitImage(kit.sheets?.nums_ex) ? `url("${kit.sheets.nums_ex}")` : 'none';
  const font = typeof kit.bodyFont === 'string' && /^[A-Za-z ]{2,40}$/.test(kit.bodyFont) ? `"${kit.bodyFont}", ` : '';
  vars['--k-body-font'] = `${font}Tahoma, Verdana, "DM Sans", Arial, sans-serif`;
  writeKitVars(root, vars);
  root.dataset.kit = present.join(' ');
  root.dataset.kitFont = kit.font && FONT_DATA.test(kit.font) ? 'on' : '';
  loadKitFont(kit.font);
}

export function applySkin(id, custom = null) {
  const builtin = Object.hasOwn(themes, id) ? id : DEFAULT_SKIN;
  const kit = custom ? (validKit(custom.kit) ? custom.kit : null) : builtinKits[builtin]?.kit || null;
  const base = custom ? (SKIN_BASES.includes(custom.base) ? custom.base : 'classic') : builtin;
  const theme = { ...themes[base], name: custom?.theme?.name || themes[base].name };
  for (const key of COLORS) if (custom?.theme?.[key] && HEX_COLOR.test(custom.theme[key])) theme[key] = custom.theme[key];
  if (kit && !custom) { const c = kit.colors; Object.assign(theme, { background: c.desk, panel: c.listBg, panelLight: c.listSel, text: c.listFg, muted: c.lcdDim, accent: c.listHi, secondary: c.lcdFg, screen: c.lcdBg, border: c.frame }); }
  const root = document.documentElement;
  root.dataset.skin = custom ? 'custom' : builtin;
  root.dataset.layout = kit ? 'kit' : layoutOf(base);
  for (const key of COLORS) root.style.setProperty(`--${kebab(key)}`, theme[key]);
  const inherited = kit ? {} : builtinAssets(base), urls = {}, artwork = [];
  for (const key of SKIN_ASSETS) {
    const supplied = custom?.images?.[key];
    const valid = typeof supplied === 'string' && IMAGE_DATA.test(supplied);
    if (valid) artwork.push(key);
    const asset = valid ? supplied : inherited[key] ? assetUrl(inherited[key]) : null;
    urls[key] = asset ? `url("${asset}")` : 'none';
    root.style.setProperty(`--skin-${key}`, urls[key]);
  }
  root.dataset.artwork = artwork.join(' ');
  root.dataset.render = 'original';
  if (kit) applyKit(root, kit);
  else { writeKitVars(root, null); root.dataset.kit = ''; root.dataset.kitFont = ''; loadKitFont(''); }
  root.style.setProperty('--number-sheet', kit ? 'var(--k-number-sheet)' : urls.numbers);
  root.style.setProperty('--transport-sheet', kit ? 'var(--k-sheet-cbuttons)' : urls.buttons);
  const width = kit ? (kit.numbersWidth === 108 ? 324 : 297) : custom?.numbersWidth === 297 || custom?.numbersWidth === 324 ? custom.numbersWidth : base === 'bento' ? 324 : 297;
  root.style.setProperty('--numbers-width', `${width}px`);
  return theme.name;
}

// Shows a kit prepared for the chosen look (skin-enhance.js): the same variables, gentler colors and
// finer images. The stored kit is untouched, so the original look is always one switch away.
export function applyRenderedKit(kit, mode) {
  const root = document.documentElement;
  applyKit(root, kit);
  root.dataset.render = mode;
}

export function skinTemplate() {
  return `# Bit Cheer skin v1\n# Keep skin.toml and optional raster assets together inside a ZIP.\nversion = 1\nname = "My midnight session"\n# Start from: millennium (recommended), classic, classified3, classified5, bento, or alien.\nbase = "millennium"\n\n# Omitted colors and assets inherit your chosen base.\n[colors]\n${COLORS.map(key => `${key} = "${themes.millennium[key]}"`).join('\n')}\n\n# Raster formats: PNG, JPG, WebP, BMP. Relative paths only.\n# [assets]\n# panel = "graphics/panel.png"          # Repeating panel texture\n# titlebar = "graphics/titlebar.png"    # Active title strip, ideally 275x14\n# background = "graphics/background.jpg" # Page background\n# frame = "graphics/main.png"          # Main player frame, traditionally 275x116\n# buttons = "graphics/cbuttons.png"    # Original transport sprite, 136x36\n# numbers = "graphics/numbers.png"     # 99x13 (NUMBERS) or 108x13 (NUMS_EX)\n# platter = "graphics/platter.png"     # Jog-wheel artwork\n# pitch = "graphics/pitch.png"         # Pitch panel texture or artwork\n`;
}

export function downloadTemplate() {
  const readme = `BIT CHEER SKIN FORMAT v1\n\nEdit skin.toml; import it alone for a color/layout skin, or zip it with images.\nbase selects the starting skin: millennium, classic, classified3, classified5, bento, alien.\nOmitting base keeps older skins on classic. Missing colors and artwork inherit that base.\nAll nine colors use #rrggbb. Artwork can replace the panel, titlebar, page background,\nframe, transport buttons, number glyphs, platter, and pitch fader. Paths are relative\nto skin.toml. PNG/JPG/WebP/BMP only; no scripts, SVG, remote URLs, or parent paths.\n\nSprite conventions: buttons uses the classic Winamp 136x36 CBUTTONS sheet.\nNumber sheets are 99x13 NUMBERS or 108x13 NUMS_EX; the UI scales glyphs 3x.\nTitle strips are normally 275x14; frame artwork is normally MAIN 275x116.\nOther raster artwork may use different dimensions, up to 4096x4096 pixels.\nEach image must be below 2MB; archive below 10MB compressed and 24MB expanded;\n120 files maximum.\n\nClassic Winamp 2 .wsz archives can be imported directly: every control is drawn\nfrom the skin's own sheets (main window, buttons, sliders, equalizer, playlist frame,\nlettering and colors). Modern .wal/.wms skin scripts are not executed.\n`;
  const bytes = zipSync({ 'skin.toml': strToU8(skinTemplate()), 'README.txt': strToU8(readme) });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' })), a = document.createElement('a');
  a.href = url; a.download = 'bit-cheer-skin-template.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
