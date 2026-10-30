const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const wasmModule = new WebAssembly.Module(fs.readFileSync(path.join(__dirname, '../target/wasm32-unknown-unknown/release/bit_cheer_audio.wasm')));
const source = fs.readFileSync(path.join(__dirname, '../../public/waveform-worker.js'), 'utf8');

function create() {
  const messages = [], waiting = [];
  const context = vm.createContext({ WebAssembly, Float32Array, Math, Number, Map, Promise, setTimeout,
    postMessage(data, transfer) {
      messages.push({ data, transfer });
      for (const waiter of [...waiting]) if (waiter.predicate(data)) { waiting.splice(waiting.indexOf(waiter), 1); clearTimeout(waiter.timer); waiter.resolve(data); }
    }
  });
  vm.runInContext(source, context);
  const send = data => context.onmessage({ data });
  const wait = predicate => {
    const found = messages.find(message => predicate(message.data));
    if (found) return Promise.resolve(found.data);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => reject(new Error('Waveform worker timed out')), 3000) };
      waiting.push(waiter);
    });
  };
  send({ type: 'init', wasmModule });
  return { send, wait, messages };
}

test('waveform worker renders real Rust kicks on all 32 beats into 640 transferred peaks', async () => {
  const worker = create();
  worker.send({ type: 'render', deck: 0, version: 1, bpm: 120, seed: 17, elements: 1 });
  const result = await worker.wait(data => data.type === 'waveform');
  assert.equal(result.peaks.length, 640);
  assert.ok(result.peaks.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  for (let beat = 0; beat < 32; beat++) {
    assert.ok(result.peaks[beat * 20] > .3, `Kick missing on beat ${beat}`);
    assert.ok(result.peaks[beat * 20] > result.peaks[beat * 20 + 15] * 2, `Kick envelope missing on beat ${beat}`);
  }
  const posted = worker.messages.find(message => message.data.type === 'waveform');
  assert.equal(posted.transfer[0], result.peaks.buffer);
});

test('newer worker jobs cancel superseded rendering and muted synth produces actual silence', async () => {
  const worker = create();
  worker.send({ type: 'render', deck: 1, version: 1, bpm: 30, seed: 17, elements: 127 });
  worker.send({ type: 'render', deck: 1, version: 2, bpm: 120, seed: 18, elements: 0 });
  const result = await worker.wait(data => data.type === 'waveform' && data.version === 2);
  assert.equal(result.deck, 1);
  assert.ok(result.peaks.every(value => value === 0));
  assert.equal(worker.messages.some(message => message.data.type === 'waveform' && message.data.version === 1), false);
});

test('waveform previews follow each voice\'s chosen sound', async () => {
  const worker = create();
  const render = async (version, sound) => {
    worker.send({ type: 'render', deck: 0, version, bpm: 120, seed: 17, elements: 1, voices: [{ gain: 1, pan: 0, pattern: -1, sound }] });
    return worker.wait(data => data.type === 'waveform' && data.version === version);
  };
  const boom = await render(1, 2), knock = await render(2, 4);
  // 808 Boom rings long after the beat; Knock is gone by then.
  assert.ok(boom.peaks[10] > knock.peaks[10] * 2);
});
