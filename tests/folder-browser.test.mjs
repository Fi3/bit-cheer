import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FolderSource, isAudioName } from '../src/folder-browser.js';
import { SessionLibrary } from '../src/library.js';

const file = (path, bytes = [1, 2, 3]) => ({ name: path.split('/').pop(), webkitRelativePath: path, size: bytes.length, arrayBuffer: async () => new Uint8Array(bytes).buffer });

test('audio names are recognized by extension only', () => {
  assert.ok(isAudioName('Track 01.MP3'));assert.ok(isAudioName('a.flac'));
  assert.ok(!isAudioName('cover.jpg'));assert.ok(!isAudioName('mp3'));assert.ok(!isAudioName('notes.txt'));
});

test('a folder input becomes a browsable tree of audio files, sorted naturally', async () => {
  const source = FolderSource.fromFiles([
    file('Crate/track 10.mp3'), file('Crate/track 2.mp3'), file('Crate/cover.jpg'), file('Crate/.hidden.mp3'),
    file('Crate/House/deep.wav'), file('Crate/.git/x.mp3'), file('Crate/Techno/Peak/hard.flac')
  ]);
  assert.equal(source.name, 'Crate');
  assert.deepEqual(await source.list([]), { path: [], folders: ['House', 'Techno'], files: ['track 2.mp3', 'track 10.mp3'] });
  assert.deepEqual(await source.list(['Techno', 'Peak']), { path: ['Techno', 'Peak'], folders: [], files: ['hard.flac'] });
  assert.equal((await source.file(['House'], 'deep.wav')).name, 'deep.wav');
  await assert.rejects(source.list(['Missing']), /no longer available/);
  assert.deepEqual((await source.list(['..', 'House'])).path, ['House']);
});

test('directory handles are listed lazily without reading files', async () => {
  let reads = 0;
  const fileHandle = name => ({ kind: 'file', getFile: async () => { reads++; return file(`x/${name}`); } });
  const dir = (name, children) => ({ kind: 'directory', name,
    async *entries() { yield* Object.entries(children); },
    async getDirectoryHandle(child) { if (children[child]?.kind !== 'directory') throw new Error('NotFound'); return children[child]; },
    async getFileHandle(child) { return children[child]; } });
  const root = dir('Music', { 'b.mp3': fileHandle('b.mp3'), 'a.ogg': fileHandle('a.ogg'), 'readme.md': fileHandle('readme.md'), Sets: dir('Sets', { 'set.m4a': fileHandle('set.m4a') }) });
  const source = FolderSource.fromHandle(root);
  assert.deepEqual(await source.list([]), { path: [], folders: ['Sets'], files: ['a.ogg', 'b.mp3'] });
  assert.equal(reads, 0);
  assert.equal((await source.file(['Sets'], 'set.m4a')).name, 'set.m4a');assert.equal(reads, 1);
});

test('folder tracks reread from disk, reuse one library entry and skip the session cache', async () => {
  const library = new SessionLibrary({ limit: 4 });
  let reads = 0;
  const open = async () => { reads++; return { size: 3, arrayBuffer: async () => new Uint8Array([9, 9, 9]).buffer }; };
  const first = library.addLinked('1/House/deep.wav', 'deep.wav', open);
  const again = library.addLinked('1/House/deep.wav', 'deep.wav', open);
  assert.equal(first.id, again.id);assert.equal(library.list('Local files').length, 1);
  await library.audioBytes(first.id);await library.audioBytes(first.id);
  assert.equal(reads, 2);assert.equal(library.totalBytes, 0);
  library.setBundled([]);assert.ok(library.find(first.id));
  library.addLinked('1/empty.mp3', 'empty.mp3', async () => ({ size: 0, arrayBuffer: async () => new ArrayBuffer(0) }));
  await assert.rejects(library.audioBytes('folder:1/empty.mp3'), /empty/);
});

test('folder tracks may exceed the 100 MB import cap but are size-checked before reading', async () => {
  const MB = 1024 * 1024;
  assert.equal(new SessionLibrary().folderLimit, 300 * MB);
  const library = new SessionLibrary({ folderLimit: 300 * MB });
  let read = false;
  const file = size => async () => ({ size, arrayBuffer: async () => { read = true; return new Uint8Array([1]).buffer; } });
  library.addLinked('1/hires.flac', 'hires.flac', file(150 * MB));
  assert.equal((await library.audioBytes('folder:1/hires.flac')).byteLength, 1);
  read = false;
  library.addLinked('1/huge.flac', 'huge.flac', file(301 * MB));
  await assert.rejects(library.audioBytes('folder:1/huge.flac'), /huge\.flac is 301 MB\. Folder tracks can be up to 300 MB/);
  assert.equal(read, false);
});
