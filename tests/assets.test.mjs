import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_PATH, assetUrl, normalizeBase } from '../src/assets.js';
import { SessionLibrary } from '../src/library.js';

test('asset URLs work at root and GitHub repository paths without duplicate prefixes', () => {
  assert.equal(BASE_PATH, '/');
  assert.equal(normalizeBase('bit-cheer'), '/bit-cheer/');
  for (const path of ['/engine.wasm', 'audio-worklet.js', '/waveform-worker.js', '/mic-worklet.js', '/catalog.json', '/skins/classic/main.png', '/tracks/study.mp3', '/credits.html']) {
    const root = assetUrl(path, '/'), project = assetUrl(path, '/bit-cheer/');
    assert.equal(root, '/' + path.replace(/^\//, ''));
    assert.equal(project, '/bit-cheer/' + path.replace(/^\//, ''));
    assert.equal(assetUrl(project, '/bit-cheer/'), project);
    assert.equal(assetUrl(project.slice(1), '/bit-cheer/'), project);
  }
  assert.equal(assetUrl('/catalog.json?version=2#tracks', '/nested/project/'), '/nested/project/catalog.json?version=2#tracks');
});

test('external, inline, object and anchor URLs are preserved', () => {
  for (const url of ['https://example.org/track.mp3', '//cdn.example.org/skin.png', 'data:image/png;base64,AA==', 'blob:https://example.org/123', '#main-content', '?view=studio']) assert.equal(assetUrl(url, '/bit-cheer/'), url);
  assert.equal(assetUrl('/skins/example.png', './'), './skins/example.png');
});

test('project-scoped catalog tracks fetch the correct project URL exactly once', async () => {
  const requested = [];
  const library = new SessionLibrary({ basePath: '/bit-cheer/', fetcher: async url => { requested.push(url); return { ok: true, arrayBuffer: async () => new Uint8Array([1,2,3]).buffer }; } });
  library.setBundled([
    { id:'a',name:'Root path',url:'/tracks/a.mp3',bpm:120 },
    { id:'b',name:'Already scoped',url:'/bit-cheer/tracks/b.mp3',bpm:125 },
    { id:'c',name:'External',url:'https://cdn.example.org/c.mp3',bpm:128 }
  ]);
  assert.equal(library.find('a').url, '/bit-cheer/tracks/a.mp3');
  assert.equal(library.find('b').url, '/bit-cheer/tracks/b.mp3');
  await library.audioBytes('a'); await library.audioBytes('a'); await library.audioBytes('b'); await library.audioBytes('c');
  assert.deepEqual(requested, ['/bit-cheer/tracks/a.mp3', '/bit-cheer/tracks/b.mp3', 'https://cdn.example.org/c.mp3']);
});
