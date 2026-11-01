import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, normalizePath, transformWithEsbuild } from 'vite';

// public/elm.js, the compiled Elm app, is copied into the site as it is; the site gets it minified
// (a third of the size), as Elm's own guide recommends for production.
const minifyElm = {
  name: 'bit-cheer-minify-elm',
  apply: 'build',
  async writeBundle({ dir }) {
    const file = path.join(dir, 'elm.js');
    const { code } = await transformWithEsbuild(await readFile(file, 'utf8'), file, { minify: true });
    await writeFile(file, code);
  },
};

// src/boot.js imports the decks (src/main.js and its styles) only once elm.js has run, and src/main.js
// then fetches Millennium Chrome, the skin every other skin falls back to. These hints let the page
// download them alongside elm.js instead of one after another. They match the requests the page makes
// later (same address, CORS mode), so nothing is fetched twice.
function preloadDecks() {
  let base = '/',
    entry = '';
  return {
    name: 'bit-cheer-preload-decks',
    apply: 'build',
    configResolved(config) {
      base = config.base;
      entry = normalizePath(path.resolve(config.root, 'src/main.js'));
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, { bundle }) {
        const main = Object.values(bundle).find(chunk => chunk.type === 'chunk' && chunk.facadeModuleId === entry);
        if (!main) throw new Error('src/main.js is missing from the bundle.');
        const link = attrs => ({ tag: 'link', attrs: { ...attrs, crossorigin: true }, injectTo: 'head' });
        return [
          ...[main.fileName, ...main.imports].map(file => link({ rel: 'modulepreload', href: base + file })),
          ...[...main.viteMetadata.importedCss].map(file => link({ rel: 'preload', as: 'style', href: base + file })),
          link({ rel: 'preload', as: 'fetch', href: `${base}skins/millennium.wsz` }),
        ];
      },
    },
  };
}

// Project Pages lives below /<repository>/; local development and account Pages
// use /. CLI --base remains available for other static hosts.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    outDir: process.env.BUILD_OUT_DIR || 'dist',
  },
  plugins: [minifyElm, preloadDecks()],
});
