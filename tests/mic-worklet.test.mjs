import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { estimateTempo } from '../src/training.js';
const source = await readFile(new URL('../public/mic-worklet.js', import.meta.url), 'utf8');

function capture(rate = 48000) {
  let Processor;
  vm.runInNewContext(source, {
    sampleRate: rate, Float32Array, Math,
    AudioWorkletProcessor: class { constructor() { this.port = { messages: [], postMessage(data, transfers) { this.messages.push({ data, transfers }); } }; } },
    registerProcessor(name, constructor) { assert.equal(name, 'bit-cheer-mic'); Processor = constructor; }
  });
  const processor = new Processor();
  const output = [[new Float32Array(128).fill(1)]];
  function feed(seconds, signal) {
    const total = Math.round(seconds * rate);
    for (let start = 0; start < total; start += 128) {
      const input = new Float32Array(Math.min(128, total - start));
      for (let i = 0; i < input.length; i++) input[i] = signal(start + i);
      processor.process([[input]], output);
    }
  }
  return { processor, output, feed };
}

test('microphone captures continuous source samples across render blocks and silences output', () => {
  const { processor, output, feed } = capture();
  feed(6, sample => sample % 71 / 71);
  assert.equal(processor.port.messages.length, 1);
  const { data, transfers } = processor.port.messages[0];
  assert.equal(data.type, 'samples');
  assert.equal(data.sampleRate, 8000);
  assert.equal(data.pcm.length, 48000);
  assert.equal(transfers[0], data.pcm.buffer);
  for (const index of [0, 20, 21, 22, 23999, 47999]) {
    let expected = 0;
    for (let j = 0; j < 6; j++) expected += ((index * 6 + j) % 71) / 71 / 6;
    assert.ok(Math.abs(data.pcm[index] - expected) < 1e-6);
  }
  assert.ok(output[0][0].every(value => value === 0));
});

test('44.1kHz capture reports its true sample rate and preserves a 120 BPM pulse', () => {
  const { processor, feed } = capture(44100);
  feed(6, sample => {
    const phase = (sample % 22050) / 44100;
    return phase < .06 ? Math.sin(sample / 44100 * Math.PI * 2 * 100) * Math.exp(-phase * 70) : 0;
  });
  const { data } = processor.port.messages[0];
  assert.equal(data.sampleRate, 8820);
  assert.equal(data.pcm.length, 52920);
  const result = estimateTempo(data.pcm, data.sampleRate);
  assert.ok(result);
  assert.ok(Math.abs(result.bpm - 120) < 1);
});

test('separate capture windows use independent buffers and stop releases the microphone processor', () => {
  const { processor, output, feed } = capture();
  feed(6, () => .25);
  feed(6, () => -.5);
  const [a, b] = processor.port.messages.map(message => message.data.pcm);
  assert.notEqual(a.buffer, b.buffer);
  assert.ok(a.every(sample => sample === .25));
  assert.ok(b.every(sample => sample === -.5));
  processor.port.onmessage({ data: { type: 'stop' } });
  assert.equal(processor.process([[new Float32Array(128)]], output), false);
  assert.equal(processor.pcm, null);
});
