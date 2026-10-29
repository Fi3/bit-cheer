// Browse a folder on the user's device and read audio files from it on demand.
// Chromium uses the File System Access API (lazy, nothing read until a track loads).
// Other browsers fall back to a folder <input>, whose file list we turn into a tree.
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'oga', 'opus', 'flac', 'm4a', 'aac', 'aif', 'aiff', 'webm'];
export const isAudioName = name => AUDIO_EXTENSIONS.includes(String(name).split('.').pop().toLowerCase()) && String(name).includes('.');
const visible = name => !name.startsWith('.');
const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const cleanPath = path => (Array.isArray(path) ? path : []).map(String).filter(part => part && part !== '.' && part !== '..');

let serial = 0;
export class FolderSource {
  constructor(name, root, kind) { this.name = name; this.root = root; this.kind = kind; this.id = ++serial; }

  static fromHandle(handle) { return new FolderSource(handle.name, handle, 'handle'); }

  // Files come from <input webkitdirectory>; webkitRelativePath starts with the chosen folder's name.
  static fromFiles(files) {
    const list = [...files];
    const name = list[0]?.webkitRelativePath?.split('/')[0] || 'Folder';
    const root = { folders: new Map(), files: new Map() };
    for (const file of list) {
      const parts = (file.webkitRelativePath || file.name).split('/').slice(1);
      if (!parts.length) parts.push(file.name);
      const fileName = parts.pop();
      if (!parts.every(visible) || !visible(fileName) || !isAudioName(fileName)) continue;
      let node = root;
      for (const part of parts) {
        if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), files: new Map() });
        node = node.folders.get(part);
      }
      node.files.set(fileName, file);
    }
    return new FolderSource(name, root, 'files');
  }

  key(path, name) { return `${this.id}/${[...cleanPath(path), name].join('/')}`; }

  async directory(path) {
    let node = this.root;
    for (const part of cleanPath(path)) {
      node = this.kind === 'handle' ? await node.getDirectoryHandle(part) : node.folders.get(part);
      if (!node) throw new Error('That folder is no longer available. Choose the folder again.');
    }
    return node;
  }

  // Folders that hold no audio anywhere are still listed for handles: checking would mean reading the whole tree.
  async list(path) {
    const node = await this.directory(path);
    const folders = [], files = [];
    if (this.kind === 'handle') {
      for await (const [name, entry] of node.entries()) {
        if (!visible(name)) continue;
        if (entry.kind === 'directory') folders.push(name);
        else if (isAudioName(name)) files.push(name);
      }
    } else {
      folders.push(...node.folders.keys()); files.push(...node.files.keys());
    }
    return { path: cleanPath(path), folders: folders.sort(byName), files: files.sort(byName) };
  }

  async file(path, name) {
    const node = await this.directory(path);
    const file = this.kind === 'handle' ? await (await node.getFileHandle(name)).getFile() : node.files.get(name);
    if (!file) throw new Error(`${name} is no longer in that folder.`);
    return file;
  }
}

// Resolves to a FolderSource, or null when the user cancels.
export function pickFolder(win = window) {
  if (typeof win.showDirectoryPicker === 'function') {
    return win.showDirectoryPicker({ id: 'bit-cheer-tracks', mode: 'read' })
      .then(handle => FolderSource.fromHandle(handle))
      .catch(error => { if (error?.name === 'AbortError') return null; throw error; });
  }
  return new Promise(resolve => {
    const input = win.document.createElement('input');
    input.type = 'file'; input.multiple = true; input.webkitdirectory = true; input.style.display = 'none';
    win.document.body.append(input);
    input.addEventListener('change', () => { const files = input.files; input.remove(); resolve(files?.length ? FolderSource.fromFiles(files) : null); }, { once: true });
    input.addEventListener('cancel', () => { input.remove(); resolve(null); }, { once: true });
    input.click();
  });
}
