import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPixelFont, symbolBits, TEXT_GLYPHS, SYMBOL_GLYPHS } from '../src/pixel-font.js';

test('every character the app writes has a pixel glyph in the skin font', () => {
  // Skinned pages set all text in the skin's lettering; a character without a glyph would show in a
  // system font (or as a color emoji) in the middle of it.
  const source = readFileSync(new URL('../src/Main.elm', import.meta.url), 'utf8');
  const covered = new Set([...Object.keys(TEXT_GLYPHS), ...Object.keys(SYMBOL_GLYPHS)]);
  const missing = new Set();
  for (const literal of source.match(/"(?:[^"\\]|\\.)*"/g) || []) {
    for (const ch of literal.slice(1, -1)) if (ch.codePointAt(0) >= 32 && !covered.has(ch) && !covered.has(ch.toLowerCase())) missing.add(ch);
  }
  assert.deepEqual([...missing], [], 'draw these in SYMBOL_GLYPHS (src/pixel-font.js)');
});

test('the font maps symbols beyond the basic plane (📁) as well as ordinary letters', () => {
  const font = buildPixelFont({ A: symbolBits(['.###.', '#...#', '#####', '#...#', '#...#']), '📁': symbolBits(SYMBOL_GLYPHS['📁']) });
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const tables = Object.fromEntries(Array.from({ length: view.getUint16(4) }, (_, i) => {
    const o = 12 + i * 16;
    return [String.fromCharCode(...font.subarray(o, o + 4)), view.getUint32(o + 8)];
  }));
  const cmap = tables.cmap, records = view.getUint16(cmap + 2), maps = {};
  for (let i = 0; i < records; i++) {
    const r = cmap + 4 + i * 8, sub = cmap + view.getUint32(r + 4);
    maps[`${view.getUint16(r)}/${view.getUint16(r + 2)}`] = { format: view.getUint16(sub), sub };
  }
  assert.equal(maps['3/1']?.format, 4, 'a Windows BMP map');
  assert.equal(maps['3/10']?.format, 12, 'a Windows full-repertoire map');
  const groups = [], { sub } = maps['3/10'];
  for (let i = 0; i < view.getUint32(sub + 12); i++) groups.push([view.getUint32(sub + 16 + i * 12), view.getUint32(sub + 24 + i * 12)]);
  const glyph = code => groups.find(([c]) => c === code)?.[1];
  assert.ok(glyph(0x41) > 1, 'A has a glyph');
  assert.ok(glyph(0x1f4c1) > 1, '📁 has a glyph');
  assert.notEqual(glyph(0x41), glyph(0x1f4c1));
});
