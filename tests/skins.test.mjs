import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { parse } from 'smol-toml';
import { validateSkin, importSkin, applySkin, readArchive, skinTemplate, themes, SKIN_ASSETS, museumSkinUrl } from '../src/skins.js';

const originalDocument = globalThis.document, originalBitmap = globalThis.createImageBitmap;
const properties = new Map(), draws = [];
const root = { dataset: {}, style: { setProperty(key, value) { properties.set(key, value); } } };
globalThis.document = { documentElement: root, createElement(tag) {
  assert.equal(tag, 'canvas');
  return { width: 0, height: 0, getContext() { return { drawImage(...args) { draws.push(args); }, getImageData() { return { data: new Uint8ClampedArray([80, 90, 100, 255]) }; } }; }, toDataURL() { return 'data:image/png;base64,AA=='; } };
} };
globalThis.createImageBitmap = async blob => {
  const bytes = new Uint8Array(await blob.arrayBuffer()), view = new DataView(bytes.buffer);
  return { width: view.getUint32(18, true), height: view.getUint32(22, true), close() {} };
};
after(() => { if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument; if (originalBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = originalBitmap; });
function bmp(width, height, marker = 0) { const bytes = new Uint8Array(58), view = new DataView(bytes.buffer); bytes.set([66, 77]); view.setUint32(18, width, true); view.setUint32(22, height, true); bytes[57] = marker; return bytes; }
function file(files, name = 'test.zip') { const bytes = zipSync(files); return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }; }

// These are format/adapter tests; real browser decode and rendered skin checks
// are exercised by the browser suite using the actual archived bitmaps.
test('old skin files retain classic structure while explicit bases inherit their own palette', () => {
  const old = validateSkin({ version: 1, name: 'Old skin' });
  assert.equal(old.base, 'classic'); assert.equal(old.theme.panel, themes.classic.panel);
  for (const base of ['classic', 'classified3', 'classified5', 'bento', 'alien']) {
    const result = validateSkin({ version: 1, name: 'Custom', base, colors: { accent: '#123456' } });
    assert.equal(result.base, base); assert.equal(result.theme.panel, themes[base].panel); assert.equal(result.theme.accent, '#123456');
  }
  for (const base of ['../../alien', 'url(evil)', null, {}, 'unknown']) assert.throws(() => validateSkin({ version: 1, name: 'Bad', base }), /Skin base/);
});

test('full artwork contract accepts only packaged raster paths and rejects unknown asset keys', () => {
  const assets = Object.fromEntries(SKIN_ASSETS.map(key => [key, `graphics/${key}.png`]));
  assert.deepEqual(validateSkin({ version: 1, name: 'Complete', base: 'classified5', assets }).assets, assets);
  for (const path of ['../outside.png', '/absolute.png', 'https://outside/image.png', 'data:image/png;base64,AA==', 'graphics\\main.bmp', 'script.svg', 'bad.png)url(evil)']) assert.throws(() => validateSkin({ version: 1, name: 'Bad', assets: { frame: path } }), /relative image/);
  assert.throws(() => validateSkin({ version: 1, name: 'Bad', assets: { script: 'file.png' } }), /Unknown skin asset/);
  assert.throws(() => readArchive(zipSync({ '../main.bmp': bmp(275, 116) })), /unsafe/);
});

test('built-in skins bind their real frame, transport and number atlases with separate layout identity', () => {
  for (const base of ['classic', 'classified3', 'classified5', 'bento']) {
    applySkin(base);
    assert.equal(root.dataset.skin, base); assert.equal(root.dataset.layout, base);
    assert.equal(properties.get('--skin-frame'), `url("/skins/${base}/main.png")`);
    assert.equal(properties.get('--transport-sheet'), `url("/skins/${base}/cbuttons.png")`);
    assert.equal(properties.get('--number-sheet'), `url("/skins/${base}/${base === 'bento' ? 'nums_ex' : 'numbers'}.png")`);
    assert.equal(properties.get('--numbers-width'), base === 'bento' ? '324px' : '297px');
    assert.equal(properties.get('--skin-platter'), 'none'); assert.equal(properties.get('--skin-pitch'), 'none');
    assert.equal(root.dataset.artwork, '');
  }
  const custom = validateSkin({ version: 1, name: 'Blue Bento', base: 'bento', colors: { accent: '#123456' } });
  applySkin('custom', { ...custom, images: { platter: 'data:image/png;base64,AA==' } });
  assert.equal(root.dataset.skin, 'custom'); assert.equal(root.dataset.layout, 'bento');
  assert.equal(root.dataset.artwork, 'platter');
  assert.equal(properties.get('--accent'), '#123456'); assert.equal(properties.get('--skin-platter'), 'url("data:image/png;base64,AA==")');
  assert.equal(properties.get('--number-sheet'), 'url("/skins/bento/nums_ex.png")');
});

test('applying a different skin clears stale custom images and ignores unsafe stored URLs', () => {
  applySkin('custom', { ...validateSkin({ version: 1, name: 'Texture' }), images: { panel: 'data:image/png;base64,AA==', numbers: 'https://remote/tracker.png' } });
  assert.equal(properties.get('--skin-panel'), 'url("data:image/png;base64,AA==")');
  assert.equal(properties.get('--number-sheet'), 'url("/skins/classic/numbers.png")');
  assert.equal(root.dataset.artwork, 'panel');
  applySkin('classified3'); assert.equal(root.dataset.artwork, ''); assert.equal(properties.get('--skin-panel'), 'none'); assert.equal(root.dataset.layout, 'classified3');
  applySkin('unknown'); assert.equal(root.dataset.skin, 'millennium'); assert.equal(root.dataset.layout, 'classified5');
  assert.equal(properties.get('--skin-titlebar'), 'url("/skins/millennium/titlebar.png")');
  applySkin('alien'); assert.equal(properties.get('--skin-platter'), 'none'); assert.equal(properties.get('--skin-pitch'), 'none'); assert.equal(root.dataset.artwork, '');
});

test('custom ZIP imports all artwork and detects extended number sprite width', async () => {
  const manifest = 'version=1\nname="Custom chrome"\nbase="classified5"\n[assets]\nframe="gfx/main.bmp"\nbuttons="gfx/buttons.bmp"\nnumbers="gfx/numbers.bmp"\nplatter="gfx/platter.bmp"\npitch="gfx/pitch.bmp"\n';
  const result = await importSkin(file({ 'package/skin.toml': strToU8(manifest), 'package/gfx/main.bmp': bmp(275, 116), 'package/gfx/buttons.bmp': bmp(136, 36), 'package/gfx/numbers.bmp': bmp(108, 13), 'package/gfx/platter.bmp': bmp(128, 128), 'package/gfx/pitch.bmp': bmp(307, 10) }));
  assert.equal(result.base, 'classified5'); assert.equal(result.numbersWidth, 324);
  assert.deepEqual(Object.keys(result.images).sort(), ['buttons','frame','numbers','pitch','platter']);
  assert.ok(Object.values(result.images).every(value => value.startsWith('data:image/bmp;base64,')));
  applySkin('custom', result); assert.equal(properties.get('--numbers-width'), '324px'); assert.equal(properties.get('--transport-sheet'), `url("${result.images.buttons}")`);
});

test('WSZ preserves original MAIN/CBUTTONS/NUMBERS/TITLEBAR and crops the real active title strip', async () => {
  draws.length = 0;
  const main = bmp(275, 116, 1), buttons = bmp(136, 36, 2), numbers = bmp(99, 13, 3), titlebar = bmp(344, 87, 4);
  const result = await importSkin(file({ 'MAIN.BMP': main, 'CBUTTONS.BMP': buttons, 'NUMBERS.BMP': numbers, 'TITLEBAR.BMP': titlebar, 'POSBAR.BMP': bmp(307, 10) }, 'Original classic.wsz'));
  assert.equal(result.base, 'classic'); assert.equal(result.theme.name, 'Original classic');
  assert.equal(result.images.frame, `data:image/bmp;base64,${Buffer.from(main).toString('base64')}`);
  assert.equal(result.images.buttons, `data:image/bmp;base64,${Buffer.from(buttons).toString('base64')}`);
  assert.equal(result.images.numbers, `data:image/bmp;base64,${Buffer.from(numbers).toString('base64')}`);
  assert.equal(result.originals.titlebar, `data:image/bmp;base64,${Buffer.from(titlebar).toString('base64')}`);
  assert.equal(result.images.titlebar, 'data:image/png;base64,AA=='); assert.equal(result.preview, result.images.frame);
  const crop = draws.at(-1); assert.deepEqual(crop.slice(1), [27, 0, 275, 14, 0, 0, 275, 14]);
});

test('skin import rejects missing assets, oversized raster dimensions, and incompatible number sheets', async () => {
  const manifest = '[assets]\nnumbers="numbers.bmp"\n';
  const config = 'version=1\nname="Invalid"\n' + manifest;
  await assert.rejects(importSkin(file({ 'skin.toml': strToU8(config) })), /Missing skin asset/);
  await assert.rejects(importSkin(file({ 'skin.toml': strToU8(config), 'numbers.bmp': bmp(5000, 13) })), /4096/);
  await assert.rejects(importSkin(file({ 'skin.toml': strToU8(config), 'numbers.bmp': bmp(200, 13) })), /99 × 13/);
  await assert.rejects(importSkin(file({ 'skin.toml': strToU8(config), 'numbers.bmp': bmp(99, 14) })), /99 × 13/);
  const template = parse(skinTemplate()); assert.equal(template.base, 'millennium'); assert.equal(validateSkin(template).theme.name, 'My midnight session');
  for (const key of SKIN_ASSETS) assert.ok(skinTemplate().includes(`# ${key} =`));
});

test('museum links resolve to the museum file server', () => {
  const page = museumSkinUrl('https://skins.webamp.org/skin/5ea2d974dad5507b83a6ddff7003a8ee/Yufo06.wsz');
  assert.deepEqual(page, { download: 'https://r2.webampskins.org/skins/5ea2d974dad5507b83a6ddff7003a8ee.wsz', filename: 'Yufo06.wsz' });
  assert.equal(museumSkinUrl(' https://skins.webamp.org/skin/5EA2D974DAD5507B83A6DDFF7003A8EE/ ').filename, '5ea2d974dad5507b83a6ddff7003a8ee.wsz');
  assert.equal(museumSkinUrl('https://r2.webampskins.org/skins/5ea2d974dad5507b83a6ddff7003a8ee.wsz').download, page.download);
  for (const bad of ['hello', 'https://evil.example/skin/5ea2d974dad5507b83a6ddff7003a8ee/x.wsz', 'https://skins.webamp.org/', 'https://skins.webamp.org.evil.com/skin/5ea2d974dad5507b83a6ddff7003a8ee/']) {
    assert.throws(() => museumSkinUrl(bad));
  }
});
