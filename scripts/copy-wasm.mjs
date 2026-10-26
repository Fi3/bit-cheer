import { readdir, copyFile } from 'node:fs/promises';
const dir = 'engine/target/wasm32-unknown-unknown/release';
const files = (await readdir(dir)).filter(f => f.endsWith('.wasm'));
if (files.length !== 1) throw new Error('Expected exactly one engine WASM build');
await copyFile(`${dir}/${files[0]}`, 'public/engine.wasm');
