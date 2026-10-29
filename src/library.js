import { assetUrl, BASE_PATH } from './assets.js';
const MB = 1024 * 1024;
const MAX_FILE = 100 * MB;
const MAX_SESSION = 256 * MB;
// Folder tracks are never cached, so they can be larger: enough for 24-bit/96 kHz FLAC up to the decode length limit.
export const MAX_FOLDER_FILE = 300 * MB;
export class SessionLibrary {
  constructor({ fetcher = (...args) => fetch(...args), id = () => crypto.randomUUID(), limit = MAX_SESSION, folderLimit = MAX_FOLDER_FILE, basePath = BASE_PATH } = {}) {
    this.fetcher = fetcher; this.createId = id; this.limit = limit; this.folderLimit = folderLimit; this.basePath = basePath;
    this.tracks = []; this.cache = new Map(); this.pending = new Map(); this.readers = new Map(); this.totalBytes = 0;
  }
  setBundled(records) {
    const local = this.tracks.filter(track => track.local);
    const seen = new Set(local.map(track => track.id));
    const bundled = [];
    for (const record of records || []) {
      if (!record || typeof record.id !== 'string' || seen.has(record.id) || typeof record.url !== 'string' || !record.url) continue;
      seen.add(record.id);
      bundled.push({ ...record, url: assetUrl(record.url, this.basePath), name: record.title || record.name || 'Practice track', title: record.title || record.name || 'Practice track', artist: record.artist || 'Practice library', genre: record.genre || 'Electronic', bpm: Number(record.bpm) || 0, duration: Number(record.duration) || 0, local: false });
    }
    this.tracks = [...bundled, ...local];
    return this.list();
  }
  list(genre = 'All genres') { return this.tracks.filter(track => genre === 'All genres' || track.genre === genre).map(track => ({ ...track })); }
  find(id) { return this.tracks.find(track => track.id === id); }
  cacheBytes(id, bytes) {
    if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength) throw new Error('The audio file is empty.');
    if (bytes.byteLength > MAX_FILE) throw new Error('Choose an audio file smaller than 100 MB.');
    const previous = this.cache.get(id)?.byteLength || 0;
    if (this.totalBytes - previous + bytes.byteLength > this.limit) throw new Error('The session library is full (256 MB). Reload to clear its files, or use smaller tracks.');
    this.cache.set(id, bytes); this.totalBytes += bytes.byteLength - previous;
  }
  addLocal(file, bytes) {
    let id = `local:${this.createId()}`;
    while (this.find(id)) id += '-next';
    this.cacheBytes(id, bytes.slice(0));
    const track = { id, name: file.name, title: file.name, artist: 'Your files', genre: 'Local files', bpm: 0, duration: 0, local: true };
    this.tracks.push(track); return { ...track };
  }
  // Folder tracks stay on disk: each load reopens the file, so they never fill the session cache.
  // open() resolves to a File (or anything with size and arrayBuffer()).
  addLinked(key, name, open) {
    const id = `folder:${key}`;
    let track = this.find(id);
    if (!track) { track = { id, name, title: name, artist: 'Your folder', genre: 'Local files', bpm: 0, duration: 0, local: true }; this.tracks.push(track); }
    this.readers.set(id, open); return { ...track };
  }
  update(id, metadata) {
    const track = this.find(id); if (!track) return;
    if (Number.isFinite(metadata.bpm) && metadata.bpm > 0) track.bpm = metadata.bpm;
    if (Number.isFinite(metadata.duration) && metadata.duration >= 0) track.duration = metadata.duration;
  }
  async audioBytes(id) {
    const track = this.find(id); if (!track) throw new Error('Track not found in your session library.');
    if (this.readers.has(id)) {
      const file = await this.readers.get(id)();
      if (file.size > this.folderLimit) throw new Error(`${track.name} is ${Math.round(file.size / MB)} MB. Folder tracks can be up to ${Math.round(this.folderLimit / MB)} MB.`);
      const bytes = await file.arrayBuffer();
      if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength) throw new Error('The audio file is empty.');
      return bytes;
    }
    if (!this.cache.has(id)) {
      if (!this.pending.has(id)) {
        const fetching = (async () => {
          const response = await this.fetcher(track.url);
          if (!response.ok) throw new Error('Track download failed. Please try again.');
          const declared = Number(response.headers?.get('content-length'));
          if (declared > MAX_FILE) throw new Error('Choose an audio file smaller than 100 MB.');
          this.cacheBytes(id, await response.arrayBuffer());
        })();
        this.pending.set(id, fetching);
        fetching.finally(() => this.pending.delete(id)).catch(() => {});
      }
      await this.pending.get(id);
    }
    // decodeAudioData may detach its input. Each deck gets its own disposable copy.
    return this.cache.get(id).slice(0);
  }
  choose(currentId, genre, direction) {
    const pool = this.list(genre);
    if (!pool.length) return null;
    if (direction === 'random') {
      const others = pool.filter(track => track.id !== currentId);
      return others.length ? others[Math.floor(Math.random() * others.length)] : null;
    }
    const current = pool.findIndex(track => track.id === currentId);
    if (pool.length === 1 && current === 0) return null;
    const index = current < 0 ? (direction < 0 ? pool.length - 1 : 0) : (current + direction + pool.length) % pool.length;
    return pool[index];
  }
}

// Tokens invalidate in-flight file reads/downloads independently for each deck.
export class DeckSelections {
  constructor() { this.epoch = 0; this.versions = [0, 0]; }
  begin(deck) { return { deck, epoch: this.epoch, version: ++this.versions[deck] }; }
  valid(token) { return token.epoch === this.epoch && token.version === this.versions[token.deck]; }
  invalidate() { this.epoch++; }
}
