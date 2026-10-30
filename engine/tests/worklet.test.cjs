const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

const wasm = fs.readFileSync(path.join(__dirname, '../target/wasm32-unknown-unknown/release/bit_cheer_audio.wasm'));
function create() {
  let Processor;
  const context = vm.createContext({
    WebAssembly, Float32Array, Number, Math, Array, Object, sampleRate: 48000,
    AudioWorkletProcessor: class { constructor() { this.port = { messages: [], postMessage(message) { this.messages.push(message); } }; } },
    registerProcessor(name, constructor) { assert.equal(name, 'bit-cheer-engine'); Processor = constructor; }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public/audio-worklet.js'), 'utf8'), context);
  const processor = new Processor({ processorOptions: { wasmBytes: wasm } });
  const outputs = [[new Float32Array(128), new Float32Array(128)], [new Float32Array(128), new Float32Array(128)]];
  return { processor, outputs };
}

test('compiled WASM worklet renders two independent stereo outputs and telemetry', () => {
  const { processor, outputs } = create();
  assert.equal(processor.port.messages[0].type, 'ready');
  processor.message({ type: 'set', deck: 0, param: 'play', value: true });
  processor.process([], outputs);
  assert.ok(outputs[0][0].some(v => Math.abs(v) > 0.01));
  assert.ok(outputs[1][0].every(v => v === 0));
  for (let i = 0; i < 19; i++) processor.process([], outputs);
  const status = processor.port.messages.find(m => m.type === 'telemetry');
  assert.ok(status.positions[0] > 0);
  assert.equal(status.positions[1], 0);
  assert.ok(status.peaks[0] > 0);
  assert.equal(status.playing[0], true);
  assert.equal(status.bpms[0], 120);
});

test('PCM transfer survives WASM memory growth, preserves stereo, and acknowledges load', () => {
  const { processor, outputs } = create();
  const left = new Float32Array(480000).fill(0.4);
  const right = new Float32Array(480000).fill(-0.2);
  processor.message({ type: 'load', id: 'track-a', deck: 1, left, right, sampleRate: 48000, bpm: 125, beatOffset: 0.2 });
  const loaded = processor.port.messages.find(m => m.type === 'loaded');
  assert.equal(loaded.id, 'track-a');
  assert.equal(loaded.duration, 10);
  processor.message({ type: 'set', deck: 1, param: 'play', value: 1 });
  processor.process([], outputs);
  assert.ok(outputs[1][0][127] > 0.3);
  assert.ok(outputs[1][1][127] < -0.15);
  assert.equal(processor.failed, false);
  assert.ok(outputs[0][0].every(v => v === 0));
});

test('invalid track reports a recoverable error', () => {
  const { processor, outputs } = create();
  processor.message({ type: 'load', deck: 0, left: new Float32Array(2), right: new Float32Array(3), sampleRate: 48000, bpm: 120 });
  assert.ok(processor.port.messages.some(m => m.type === 'error'));
  assert.equal(processor.failed, false);
  processor.message({ type: 'set', deck: 0, param: 'play', value: 1 });
  processor.process([], outputs);
  assert.ok(outputs[0][0].some(v => v !== 0));
});

test('rendering benchmark: both decks, all twenty voices, real WASM', t => {
  const { processor, outputs } = create();
  for (const deck of [0, 1]) {
    processor.message({ type: 'set', deck, param: 'elements', value: 1048575 });
    processor.message({ type: 'set', deck, param: 'play', value: 1 });
  }
  const blocks = 3750; // Ten seconds at 48 kHz.
  const start = performance.now();
  for (let i = 0; i < blocks; i++) processor.process([], outputs);
  const elapsed = performance.now() - start;
  t.diagnostic(`Rendered 10 seconds of two-deck audio in ${elapsed.toFixed(1)} ms (${(elapsed / 100).toFixed(2)}% of realtime budget; WASM ${wasm.length} bytes).`);
  assert.equal(processor.failed, false);
  for (const output of outputs) for (const channel of output) assert.ok(channel.every(v => Number.isFinite(v) && Math.abs(v) <= 1));
  assert.ok(elapsed < 10000, 'WASM rendering must sustain real time on this host');
});

test('twenty-voice worklet supports actual manual pattern playback, panning and preview', () => {
  const { processor, outputs } = create();
  assert.equal(processor.engine.engine_voice_count(), 20);
  processor.message({ type: 'set', deck: 0, param: 'elements', value: 1 << 19 });
  processor.message({ type: 'voice', deck: 0, voice: 19, param: 'pattern', value: 1 });
  processor.message({ type: 'voice', deck: 0, voice: 19, param: 'pan', value: 1 });
  processor.message({ type: 'set', deck: 0, param: 'play', value: 1 });
  processor.process([], outputs);
  assert.ok(outputs[0][1].some(value => Math.abs(value) > .01));
  assert.ok(outputs[0][0].every(value => Math.abs(value) < 1e-7));
  const preview = processor.port.messages.filter(message => message.type === 'patterns').at(-1);
  assert.equal(preview.patterns.length, 20); assert.equal(preview.patterns[19], 1);
  processor.message({ type: 'voice', deck: 0, voice: 19, param: 'pattern', value: 0 });
  processor.message({ type: 'set', deck: 0, param: 'seek', value: 0 });
  processor.process([], outputs);
  assert.ok(outputs[0][1].every(value => value === 0));
});

test('every instrument offers the sound versions named in src/instruments.js, and a sound change is heard', async () => {
  const { INSTRUMENTS } = await import('../../src/instruments.js');
  const { processor, outputs } = create();
  const e = processor.engine;
  assert.equal(INSTRUMENTS.length, e.engine_voice_count());
  INSTRUMENTS.forEach((instrument, voice) => assert.equal(e.engine_voice_sounds(voice), instrument.sounds.length, `${instrument.name} sound count`));
  const take = sound => {
    processor.message({ type: 'reset' });
    processor.message({ type: 'voice', deck: 0, voice: 0, param: 'sound', value: sound });
    processor.message({ type: 'set', deck: 0, param: 'play', value: 1 });
    const samples = [];
    for (let i = 0; i < 40; i++) { processor.process([], outputs); samples.push(...outputs[0][0]); }
    return samples;
  };
  const velvet = take(0), punch = take(1);
  assert.ok(velvet.some(value => Math.abs(value) > .05));
  assert.notDeepEqual(velvet, punch);
  const before = processor.port.messages.filter(message => message.type === 'patterns').length;
  processor.message({ type: 'voice', deck: 0, voice: 3, param: 'sound', value: 2 });
  assert.equal(processor.port.messages.filter(message => message.type === 'patterns').length, before, 'A sound change keeps the pattern, so no new preview');
});
