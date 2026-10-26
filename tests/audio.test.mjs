import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/audio.js';

const original = Object.fromEntries(['window', 'AudioContext', 'AudioWorkletNode', 'fetch', 'requestAnimationFrame'].map(k => [k, globalThis[k]]));
const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
let frameCallbacks = [], worklets = [];
class Param { value = 0; setTargetAtTime(value) { this.value = value; } }
class Node { gain = new Param(); pan = new Param(); connect() { return this; } disconnect() {} }
class Context {
  state = 'suspended'; resumeCalls = 0; currentTime = 0; sampleRate = 48000; baseLatency = .005;
  destination = new Node(); audioWorklet = { addModule: async () => {} };
  resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createGain() { return new Node(); }
  createStereoPanner() { return new Node(); }
  createAnalyser() { return new Node(); }
  createDynamicsCompressor() { return { threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param(), connect() { return this; } }; }
  decodeAudioData() { return Promise.resolve(this.decoded || audioBuffer()); }
}
function audioBuffer(length = 48000, sampleRate = 48000) {
  const data = new Float32Array(Math.min(length, 48000)).fill(.2);
  return { length, sampleRate, duration: length / sampleRate, numberOfChannels: 2, getChannelData: () => data };
}
class Worklet extends Node {
  messages = []; port = { postMessage: message => this.messages.push(message) };
  constructor(context, name, options) { super(); this.options = options; worklets.push(this); queueMicrotask(() => this.receive({ type: 'ready' })); }
  receive(data) { this.port.onmessage?.({ data }); }
}
globalThis.window = { AudioContext: Context, AudioWorkletNode: Worklet };
globalThis.AudioContext = Context; globalThis.AudioWorkletNode = Worklet;
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => wasm });
globalThis.requestAnimationFrame = callback => { frameCallbacks.push(callback); return frameCallbacks.length; };
after(() => { for (const [key, value] of Object.entries(original)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value; });

async function create() { const events = []; const engine = new AudioEngine(event => events.push(event)); await engine.ensure(); return { engine, events, worklet: worklets.at(-1) }; }
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function frame() { const callbacks = frameCallbacks; frameCallbacks = []; for (const callback of callbacks) callback(); }

test('WASM is compiled before construction; readiness is acknowledged once', async () => {
  const { engine, events, worklet } = await create();
  assert.ok(worklet.options.processorOptions.wasmModule instanceof WebAssembly.Module);
  assert.equal(worklet.options.processorOptions.wasmBytes, undefined);
  assert.equal(events.filter(event => event.type === 'ready').length, 1);
  await engine.ensure(); await engine.set(0, 'pitch', 1); await engine.set(1, 'pitch', 2);
  assert.equal(engine.context.resumeCalls, 1);
  assert.equal(engine.state[0].duration, 16);
});

test('dragging coalesces seeks, while bend release executes without waiting for animation frames', async () => {
  const { engine, worklet } = await create();
  worklet.messages.length = 0;
  await Promise.all(Array.from({ length: 40 }, (_, i) => engine.set(0, 'seek', i / 10)));
  assert.equal(worklet.messages.length, 0);
  frame();
  assert.equal(worklet.messages.length, 1);
  assert.equal(worklet.messages[0].value, 3.9);
  await engine.set(0, 'bend', 10);
  await engine.set(0, 'bend', 0);
  assert.equal(worklet.messages.at(-1).param, 'bend');
  assert.equal(worklet.messages.at(-1).value, 0);
  frame();
  assert.equal(worklet.messages.filter(message => message.param === 'bend' && message.value === 10).length, 0);
});

test('track is announced only after matching WASM acknowledgement', async () => {
  const { engine, events, worklet } = await create();
  engine.state[0].trackId = 'previous-catalog-track';
  const loading = engine.load(0, new ArrayBuffer(8), 'Stereo study', 128);
  await settle();
  const command = worklet.messages.find(message => message.type === 'load');
  assert.ok(command.id);
  assert.equal(events.some(event => event.type === 'track'), false);
  worklet.receive({ type: 'loaded', deck: 0, id: command.id, duration: 1, bpm: 128 });
  assert.equal(await loading, true);
  assert.equal(engine.state[0].source, 'pcm');
  assert.equal(engine.state[0].trackId, null, 'a personal import must clear the previous catalog identity');
  assert.equal(events.find(event => event.type === 'track').name, 'Stereo study');
});

test('WASM load rejection propagates without announcing false success', async () => {
  const { engine, events, worklet } = await create();
  const loading = engine.load(0, new ArrayBuffer(8), 'Oversized study', 128);
  const rejected = assert.rejects(loading, /memory exhausted/);
  await settle();
  const command = worklet.messages.find(message => message.type === 'load');
  worklet.receive({ type: 'error', deck: 0, id: command.id, message: 'memory exhausted' });
  await rejected;
  assert.equal(events.some(event => event.type === 'track'), false);
  assert.equal(engine.state[0].source, 'generated');
});

test('PCM frame cap accounts for 96 kHz rather than assuming a fixed duration', async () => {
  const { engine, worklet } = await create();
  engine.context.decoded = audioBuffer(28_800_001, 96000);
  await assert.rejects(engine.load(0, new ArrayBuffer(8), 'Long study'), /shorter than 5 minutes/);
  assert.equal(worklet.messages.some(message => message.type === 'load'), false);
});

test('randomization invalidates an earlier decode and keeps correct 32-beat durations', async () => {
  const { engine, worklet } = await create();
  let resolveDecode;
  engine.context.decodeAudioData = () => new Promise(resolve => { resolveDecode = resolve; });
  const loading = engine.load(0, new ArrayBuffer(8), 'Stale track');
  await settle();
  engine.state[0].playing = true;
  await engine.randomize('foundation', 1);
  resolveDecode(audioBuffer());
  assert.equal(await loading, false);
  assert.equal(worklet.messages.some(message => message.type === 'load'), false);
  assert.equal(engine.state[0].playing, true);
  assert.equal(engine.state[0].duration, 32 * 60 / engine.state[0].bpm);
});

test('generated overview requests coalesce and stale or PCM-source results are ignored', async () => {
  const { engine } = await create();
  const previousWorker = globalThis.Worker;
  let worker;
  globalThis.Worker = class {
    messages = [];
    constructor() { worker = this; }
    postMessage(message) { this.messages.push(message); }
    terminate() {}
    receive(data) { this.onmessage({ data }); }
  };
  try {
    engine.startWaveformWorker(new WebAssembly.Module(wasm));
    assert.equal(worker.messages[0].type, 'init');
    worker.receive({ type: 'ready' });
    frame();
    const first = worker.messages.find(message => message.type === 'render' && message.deck === 0);
    await engine.set(0, 'elements', 3);
    await engine.set(0, 'elements', 7);
    frame();
    const requests = worker.messages.filter(message => message.type === 'render' && message.deck === 0);
    assert.equal(requests.length, 2);
    assert.equal(requests.at(-1).elements, 7);
    const before = engine.waveforms[0];
    worker.receive({ type: 'waveform', deck: 0, version: first.version, peaks: new Float32Array(640).fill(.1) });
    assert.equal(engine.waveforms[0], before);
    const actual = new Float32Array(640).fill(.4);
    worker.receive({ type: 'waveform', deck: 0, version: requests.at(-1).version, peaks: actual });
    assert.equal(engine.waveforms[0], actual);
    engine.state[0].source = 'pcm';
    worker.receive({ type: 'waveform', deck: 0, version: requests.at(-1).version, peaks: new Float32Array(640).fill(.9) });
    assert.equal(engine.waveforms[0], actual);
    engine.cancelWaveform(0);
    assert.equal(worker.messages.at(-1).type, 'cancel');
  } finally {
    if (previousWorker === undefined) delete globalThis.Worker; else globalThis.Worker = previousWorker;
  }
});

test('randomizing one generated tempo preserves material, musical position, and the other deck', async () => {
  const { engine, worklet, events } = await create();
  engine.state[0].playing = true; engine.state[0].position = 4; engine.state[0].beat = 8;
  engine.state[1].playing = true; engine.state[1].pitch = 1;
  const selected = structuredClone(engine.state[0]), other = structuredClone(engine.state[1]);
  worklet.messages.length = 0;
  await engine.randomizeTempo(0, 'foundation');
  const changed = engine.state[0], reference = other.bpm * (1 + other.pitch / 100);
  assert.deepEqual(engine.state[1], other);
  assert.equal(changed.name, selected.name); assert.equal(changed.seed, selected.seed); assert.equal(changed.elements, selected.elements);
  assert.equal(changed.source, selected.source); assert.equal(changed.playing, true);
  assert.ok(Math.abs(changed.bpm - selected.bpm) >= 1 - 1e-8);
  assert.ok(Math.abs(reference / changed.bpm - 1) <= .08);
  assert.ok(Math.abs(changed.position * changed.bpm - selected.position * selected.bpm) < 1e-8);
  assert.ok(worklet.messages.every(message => message.deck === 0 && message.type === 'set'));
  assert.equal(events.at(-1).type, 'deckChanged'); assert.equal(events.at(-1).deck, 0);
});

test('randomizing a PCM tempo only changes playback rate and rejects impossible ranges unchanged', async () => {
  const { engine, worklet } = await create();
  Object.assign(engine.state[1], { source: 'pcm', name: 'Imported track', position: 17, playing: true, duration: 120 });
  const before = structuredClone(engine.state[1]), other = structuredClone(engine.state[0]);
  worklet.messages.length = 0;
  await engine.randomizeTempo(1, 'pro');
  const changed = engine.state[1];
  assert.deepEqual(engine.state[0], other);
  for (const property of ['source','name','bpm','seed','elements','position','duration','playing']) assert.equal(changed[property], before[property]);
  assert.ok(Math.abs(changed.pitch) <= 8 + 1e-8);
  assert.ok(Math.abs(changed.bpm * (1 + changed.pitch / 100) - before.bpm) >= 1 - 1e-8);
  assert.ok(worklet.messages.every(message => message.deck === 1 && ['pitch', 'bend'].includes(message.param)));
  engine.state[1].bpm = 220; engine.state[1].pitch = 0;
  const impossible = structuredClone(engine.state); worklet.messages.length = 0;
  await assert.rejects(engine.randomizeTempo(1, 'pro'), /too far apart/);
  assert.deepEqual(engine.state, impossible); assert.equal(worklet.messages.length, 0);
});

test('changing only one foundation track changes its kick palette but preserves effective tempo and playback', async () => {
  const { engine, worklet } = await create();
  engine.state[0].pitch = 5; engine.state[0].playing = true; engine.state[0].position = 3;
  engine.state[0].voices[0] = { gain: .7, pan: -.4, pattern: 5, preview: 5 };
  const before = structuredClone(engine.state[0]), other = structuredClone(engine.state[1]);
  worklet.messages.length = 0;
  await engine.changeGeneratedTrack(0, 'foundation');
  const changed = engine.state[0];
  assert.deepEqual(engine.state[1], other);
  assert.notEqual(changed.seed, before.seed); assert.notEqual(changed.seed & 7, before.seed & 7);
  assert.equal(changed.elements, 1); assert.equal(changed.playing, true); assert.equal(changed.position, 0);
  assert.ok(Math.abs(changed.bpm * (1 + changed.pitch / 100) - 126) < 1e-8);
  assert.equal(changed.voices[0].gain, .7); assert.equal(changed.voices[0].pan, -.4); assert.equal(changed.voices[0].pattern, -1);
  assert.ok(worklet.messages.every(message => message.deck === 0));
});

test('builder track changes choose a different enabled combination without touching the reference deck', async () => {
  const { engine, worklet } = await create();
  engine.state[1].elements = 7;
  const other = structuredClone(engine.state[0]);
  for (let i = 0; i < 8; i++) {
    const previous = engine.state[1].elements; worklet.messages.length = 0;
    await engine.changeGeneratedTrack(1, 'builder');
    const mask = engine.state[1].elements, count = mask.toString(2).replaceAll('0', '').length;
    assert.notEqual(mask, previous); assert.equal(mask & 1, 1); assert.ok(count >= 3 && count <= 6);
    assert.deepEqual(engine.state[0], other); assert.ok(worklet.messages.every(message => message.deck === 1));
  }
});

test('all twenty voice controls and solo preserve the enabled mask and other deck', async () => {
  const { engine, worklet } = await create();
  engine.state[0].elements = 3;
  const other = structuredClone(engine.state[1]); worklet.messages.length = 0;
  await engine.setVoice(0, 19, 'gain', .45); await engine.setVoice(0, 19, 'pan', -.8); await engine.setVoice(0, 19, 'pattern', 0x8421);
  assert.deepEqual(engine.state[0].voices[19], { gain: .45, pan: -.8, pattern: 0x8421, preview: 0x8421 });
  await engine.setSolo(0, 19);
  assert.equal(worklet.messages.at(-1).value, 1 << 19); assert.equal(engine.state[0].elements, 3);
  await engine.set(0, 'elements', 7);
  assert.equal(worklet.messages.at(-1).value, 1 << 19); assert.equal(engine.state[0].elements, 7);
  await engine.setSolo(0, -1);
  assert.equal(worklet.messages.at(-1).value, 7);
  assert.deepEqual(engine.state[1], other);
  assert.ok(worklet.messages.every(message => message.deck === 0));
});

test('CHAOS creates a bounded dense composition on only the chosen deck at the same tempo', async () => {
  const { engine, worklet, events } = await create();
  engine.state[1].pitch = -3; engine.state[1].playing = true; engine.state[1].solo = 2;
  const tempo = engine.state[1].bpm * .97, other = structuredClone(engine.state[0]);
  worklet.messages.length = 0;
  await engine.chaos(1);
  const state = engine.state[1], count = state.elements.toString(2).replaceAll('0', '').length;
  assert.ok(count >= 12 && count <= 20); assert.equal(state.voices.length, 20); assert.equal(state.solo, -1);
  assert.ok(state.voices.every(voice => voice.pattern > 0 && voice.pattern <= 65535 && voice.gain >= .2 && voice.gain <= .7 && Math.abs(voice.pan) <= .8));
  assert.ok(Math.abs(state.bpm * (1 + state.pitch / 100) - tempo) < 1e-8); assert.equal(state.playing, true);
  assert.deepEqual(engine.state[0], other); assert.ok(worklet.messages.every(message => message.deck === 1));
  assert.equal(events.at(-1).type, 'deckChanged'); assert.equal(events.at(-1).voices.length, 20);
});

test('new mode or drill resets voice mixes so a muted builder kick cannot silence foundation', async () => {
  const { engine, worklet } = await create();
  engine.state[0].voices[0] = { gain: 0, pan: -1, pattern: 0, preview: 0 };
  engine.state[0].solo = 19;
  worklet.messages.length = 0;
  await engine.randomize('foundation', 1);
  for (const state of engine.state) {
    assert.equal(state.solo, -1); assert.equal(state.elements, 1);
    assert.ok(state.voices.every(voice => voice.gain === 1 && voice.pan === 0 && voice.pattern === -1));
  }
  assert.ok(worklet.messages.some(message => message.type === 'voice' && message.deck === 0 && message.voice === 0 && message.param === 'gain' && message.value === 1));
});
