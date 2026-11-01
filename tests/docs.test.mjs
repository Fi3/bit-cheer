// Keeps the docs honest. Links and anchors resolve, the paths and npm scripts the docs name exist,
// every source file is on the map in AGENTS.md (and every test file in docs/TESTING.md), and the
// tables in engine/README.md match the engine. docs/KEYBOARD.md's key table is checked by
// tests/keyboard.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTRUMENTS } from '../src/instruments.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(ROOT, file), 'utf8');
const exists = file => existsSync(path.join(ROOT, file));
const filesIn = (dir, pattern) =>
  readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .filter(entry => entry.isFile() && pattern.test(entry.name))
    .map(entry => `${dir}/${entry.name}`);

const MARKDOWN = ['README.md', 'AGENTS.md', 'engine/README.md', ...filesIn('docs', /\.md$/)];
const PAGES = filesIn('public', /\.html$/);
// Build output that a fresh checkout doesn't have yet.
const BUILD_OUTPUT = /^(?:dist\/|engine\/target\/|public\/elm\.js$|public\/engine\.wasm$)/;

/** Markdown with its fenced code blocks blanked out, so `# comments` and sample links are ignored. */
const prose = text => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');

/** GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens, repeats numbered. */
function markdownAnchors(text) {
  const anchors = new Set(),
    seen = new Map();
  for (const [, heading] of prose(text).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = heading
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    anchors.add(count ? `${base}-${count}` : base);
  }
  for (const [, id] of text.matchAll(/\bid="([^"]+)"/g)) anchors.add(id);
  return anchors;
}

const htmlAnchors = text => new Set([...text.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
const anchorsOf = file => (file.endsWith('.html') ? htmlAnchors(read(file)) : markdownAnchors(read(file)));
const external = target => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target);

function checkLink(from, target, resolve) {
  const [file, anchor] = target.split('#');
  const destination = file ? resolve(file) : from;
  if (destination === null) return null; // the app itself
  if (!exists(destination)) return `${from}: ${target} → ${destination} does not exist`;
  if (anchor && /\.(md|html)$/.test(destination) && !anchorsOf(destination).has(decodeURIComponent(anchor)))
    return `${from}: ${target} → no #${anchor} in ${destination}`;
  return null;
}

test('every relative link and anchor in the Markdown docs resolves', () => {
  const broken = [];
  for (const doc of MARKDOWN) {
    for (const [, target] of prose(read(doc)).matchAll(/\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)) {
      if (external(target)) continue;
      broken.push(checkLink(doc, target, file => path.posix.normalize(path.posix.join(path.posix.dirname(doc), file))));
    }
  }
  assert.deepEqual(broken.filter(Boolean), []);
});

test('every relative link and anchor in the served pages resolves', () => {
  // The pages are served from public/ next to the app, whose own address is ./ (index.html).
  const resolve = file => {
    if (['', '.', './', '/', 'index.html', './index.html'].includes(file)) return null;
    return path.posix.join('public', file.replace(/^\.?\//, ''));
  };
  const broken = [];
  for (const page of PAGES)
    for (const [, target] of read(page).matchAll(/\b(?:href|src)="([^"]*)"/g))
      if (!external(target) && target !== '#') broken.push(checkLink(page, target, resolve));
  assert.deepEqual(broken.filter(Boolean), []);
});

test('every repository path the Markdown docs write in backticks exists', () => {
  const missing = [];
  for (const doc of MARKDOWN)
    for (const [, file] of prose(read(doc)).matchAll(
      /`((?:src|engine|public|scripts|tests|docs|review|\.github)\/[\w./-]*)`/g,
    ))
      if (!BUILD_OUTPUT.test(file) && !exists(file)) missing.push(`${doc}: ${file}`);
  assert.deepEqual(missing, []);
});

test('every npm script the docs and workflows mention exists', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  const sources = [...MARKDOWN, ...PAGES, ...filesIn('.github/workflows', /\.ya?ml$/)];
  const unknown = sources.flatMap(file =>
    [...read(file).matchAll(/npm run ([\w:-]+)/g)]
      .filter(([, name]) => !scripts[name])
      .map(([match]) => `${file}: ${match}`),
  );
  assert.deepEqual(unknown, []);
});

const mentions = (text, file) =>
  new RegExp(`(^|[^\\w./-])${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w-])`, 'm').test(text);

test('AGENTS.md names every source file, so its architecture map stays complete', () => {
  const agents = read('AGENTS.md');
  const sources = [
    ...filesIn('src', /./),
    ...filesIn('engine/src', /\.rs$/),
    ...filesIn('public', /\.(js|html)$/).filter(file => !BUILD_OUTPUT.test(file)),
    ...filesIn('scripts', /./),
    ...filesIn('.github/workflows', /\.ya?ml$/),
    'index.html',
    'package.json',
    'elm.json',
    'engine/Cargo.toml',
    'rust-toolchain.toml',
    'vite.config.js',
    'playwright.config.js',
    'eslint.config.js',
    '.prettierrc.json',
    'review/src/ReviewConfig.elm',
  ];
  assert.deepEqual(
    sources.filter(file => !mentions(agents, file)),
    [],
  );
});

test('docs/TESTING.md names every test file', () => {
  const testing = read('docs/TESTING.md');
  const tests = [...filesIn('tests', /\.(test\.mjs|spec\.js)$/), ...filesIn('engine/tests', /\.test\.cjs$/)];
  assert.deepEqual(
    tests.filter(file => !mentions(testing, file)),
    [],
  );
});

/** The rows of the Markdown table that follows `marker` in `text`, as arrays of trimmed cells. */
function tableAfter(text, marker) {
  const lines = text.slice(text.indexOf(marker)).split('\n');
  const start = lines.findIndex(line => line.startsWith('|'));
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break;
    rows.push(
      line
        .split('|')
        .slice(1, -1)
        .map(cell => cell.trim()),
    );
  }
  return rows;
}

test("engine/README.md's parameter table matches the worklet and the engine", () => {
  const documented = {};
  for (const cells of tableAfter(read('engine/README.md'), 'Parameters:')) {
    const names = [...cells[0].matchAll(/`(\w+)`/g)].map(match => match[1]);
    const ids = cells.at(-1).split(',').map(Number);
    assert.equal(names.length, ids.length, `one ID per name in: ${cells[0]}`);
    names.forEach((name, index) => (documented[name] = ids[index]));
  }
  const worklet = read('public/audio-worklet.js').match(/const PARAMS = Object\.freeze\(\{([\s\S]*?)\}\)/)[1];
  const params = Object.fromEntries([...worklet.matchAll(/(\w+):\s*(\d+)/g)].map(([, name, id]) => [name, Number(id)]));
  assert.deepEqual(documented, params);
  // Deck::set in the engine handles exactly these IDs.
  const engine = read('engine/src/lib.rs');
  const body = engine.slice(engine.indexOf('fn set(&mut self, param: u32'), engine.indexOf('_ => {}'));
  const handled = [...body.matchAll(/^\s*(\d+)(?:\.\.=(\d+))? =>/gm)].flatMap(([, from, to]) =>
    Array.from({ length: Number(to ?? from) - Number(from) + 1 }, (_, offset) => Number(from) + offset),
  );
  assert.deepEqual(
    handled.sort((a, b) => a - b),
    Object.values(params).sort((a, b) => a - b),
  );
});

test("engine/README.md's voice bank lists the instruments in engine order", () => {
  const voices = [];
  for (const cells of tableAfter(read('engine/README.md'), 'The bank has twenty'))
    for (let column = 0; column + 1 < cells.length; column += 2) voices[Number(cells[column])] = cells[column + 1];
  assert.deepEqual(
    voices,
    INSTRUMENTS.map(instrument => instrument.name),
  );
});
