/* Render accurate synth overviews in an isolated worker, never on the audio thread. */
const RATE = 12000;
const POINTS = 640;
const BLOCK = 128;
let engine = null;
let running = false;
const pending = new Map();
const latest = new Map();

async function render(request) {
  const { deck, version, bpm, seed, elements, voices } = request;
  engine.engine_init(RATE);
  engine.engine_randomize(0, seed, bpm);
  engine.engine_set(0, 3, elements);
  if (Array.isArray(voices)) voices.slice(0, engine.engine_voice_count()).forEach((voice, index) => {
    for (const [param, key] of [[0, 'gain'], [1, 'pan'], [2, 'pattern'], [4, 'sound']]) if (Number.isFinite(voice[key])) engine.engine_voice(0, index, param, voice[key]);
  });
  engine.engine_set(0, 0, 1);
  const frames = Math.ceil(engine.engine_duration(0) * RATE);
  const peaks = new Float32Array(POINTS);
  let view = null;
  let buffer = null;
  for (let start = 0; start < frames; start += BLOCK) {
    if (latest.get(deck) !== version) return;
    const count = Math.min(BLOCK, frames - start);
    const pointer = engine.engine_render(count);
    if (buffer !== engine.memory.buffer) {
      buffer = engine.memory.buffer;
      view = new Float32Array(buffer, pointer, BLOCK * 2);
    }
    for (let i = 0; i < count; i++) {
      const bin = Math.min(POINTS - 1, Math.floor((start + i) / frames * POINTS));
      const amplitude = Math.max(Math.abs(view[i]), Math.abs(view[BLOCK + i]));
      if (amplitude > peaks[bin]) peaks[bin] = amplitude;
    }
    // Let newer requests cancel stale work without blocking the UI or audio thread.
    if ((start / BLOCK + 1) % 256 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (latest.get(deck) === version) postMessage({ type: 'waveform', deck, version, peaks }, [peaks.buffer]);
}

async function drain() {
  if (running || !engine) return;
  running = true;
  try {
    while (pending.size) {
      const [deck, request] = pending.entries().next().value;
      pending.delete(deck);
      try { await render(request); }
      catch (error) { postMessage({ type: 'error', deck, version: request.version, message: error.message }); }
    }
  } finally { running = false; }
}

globalThis.onmessage = ({ data }) => {
  if (data?.type === 'init') {
    try {
      engine = new WebAssembly.Instance(data.wasmModule, {}).exports;
      postMessage({ type: 'ready' });
      void drain();
    } catch (error) { postMessage({ type: 'error', message: error.message }); }
  } else if (data?.type === 'render') {
    const { deck, version, bpm, seed, elements } = data;
    if ((deck !== 0 && deck !== 1) || !Number.isInteger(version) || !Number.isFinite(bpm) || bpm < 30 || bpm > 300) return;
    const request = { deck, version, bpm, seed: Number(seed) >>> 0, elements: Number(elements) & 1048575, voices: data.voices };
    latest.set(deck, version);
    pending.set(deck, request);
    void drain();
  } else if (data?.type === 'cancel' && (data.deck === 0 || data.deck === 1)) {
    latest.set(data.deck, data.version);
    pending.delete(data.deck);
  }
};
