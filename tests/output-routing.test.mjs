import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { availableChannelCount, validateRouting, buildHardwareGraph } from '../src/output-routing.js';
import { AudioEngine } from '../src/audio.js';

class Param { constructor(value = 1) { this.value = value; } setTargetAtTime(value) { this.value = value; } }
class Node {
  constructor(kind = 'gain') { this.kind = kind; this.connections = []; this.gain = new Param(); this.pan = new Param(0); this.channelCount = 2; this.channelCountMode = 'max'; this.channelInterpretation = 'speakers'; }
  connect(target, output = 0, input = 0) { if (target.rejectConnection) throw new Error('Connection rejected'); if (!this.connections.some(edge => edge.target === target && edge.output === output && edge.input === input)) this.connections.push({ target, output, input }); return target; }
  disconnect(target) { this.connections = target ? this.connections.filter(edge => edge.target !== target) : []; }
}
class Context {
  constructor(maximum = 6) { this.destination = new Node('destination'); this.destination.maxChannelCount = maximum; this.destination.channelCountMode = 'explicit'; this.currentTime = 0; this.state = 'running'; this.sinkId = ''; this.nodes = []; }
  createGain() { const node = new Node(); this.nodes.push(node); return node; }
  createChannelMerger(count) { const node = new Node('merger'); node.numberOfInputs = count; this.nodes.push(node); return node; }
  createChannelSplitter(count) { const node = new Node('splitter'); node.numberOfOutputs = count; this.nodes.push(node); return node; }
  createDynamicsCompressor() { const node = new Node('compressor'); for (const param of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[param] = new Param(); this.nodes.push(node); return node; }
  async setSinkId(id) { if (id === 'denied') throw new Error('Output permission denied'); this.sinkId = id; this.destination.maxChannelCount = id === 'stereo-device' ? 2 : 6; }
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([0,97,115,109,1,0,0,0]) });
after(() => { globalThis.fetch = originalFetch; });
function createEngine(maximum = 6) {
  const events = [], engine = new AudioEngine(event => events.push(event));
  engine.context = new Context(maximum); engine.node = new Node(); engine.ensure = async () => {};
  engine.master = new Node(); engine.limiter = new Node('limiter'); engine.gains = [new Node(), new Node()]; engine.panners = [new Node(), new Node()];
  engine.gains.forEach((gain, index) => gain.connect(engine.panners[index]).connect(engine.master));
  engine.master.connect(engine.limiter).connect(engine.context.destination); engine.mix();
  return { engine, events };
}

test('routing validates real channel capacity, adjacent stereo pairs, and overlaps', () => {
  assert.deepEqual(validateRouting({ mode: 'mono' }, 2), { mode: 'mono', a: 0, b: 1 });
  assert.deepEqual(validateRouting({ mode: 'stereo' }, 4), { mode: 'stereo', a: 0, b: 2 });
  assert.throws(() => validateRouting({ mode: 'stereo', a: 0, b: 1 }, 6), /non-overlapping/);
  assert.throws(() => validateRouting({ mode: 'mono', a: 1, b: 1 }, 6), /non-overlapping/);
  assert.throws(() => validateRouting({ mode: 'stereo', a: 0, b: 5 }, 6), /available outputs/);
  assert.throws(() => validateRouting({ mode: 'stereo' }, 2), /at least 4/);
  assert.throws(() => validateRouting({ mode: 'mono', a: .5, b: 2 }, 6), /available outputs/);
  assert.throws(() => validateRouting({ mode: 'stereo', a: 0, b: 32 }, 100), /available outputs/);
  assert.equal(availableChannelCount({ maxChannelCount: 64, channelCount: 2 }), 32);
});

test('hardware graph uses per-deck stereo compressors and explicit discrete merger slots', () => {
  const context = new Context(), inputs = [new Node(), new Node()];
  const graph = buildHardwareGraph(context, inputs, { mode: 'stereo', a: 4, b: 0 }, .75);
  assert.equal(inputs[0].connections.length, 0);
  assert.equal(graph.channelCount, 6);
  graph.attach();
  const splitters = graph.nodes.filter(node => node.kind === 'splitter');
  assert.deepEqual(splitters.map(node => node.connections.map(edge => edge.input)), [[4, 5], [0, 1]]);
  assert.equal(graph.master.channelCount, 6);
  assert.equal(graph.master.channelInterpretation, 'discrete');
  assert.equal(graph.master.gain.value, .75);
  assert.ok(graph.nodes.filter(node => node.kind === 'compressor').every(node => node.channelCount === 2));
  graph.disconnect();
  assert.equal(inputs[0].connections.length, 0);
  assert.ok(graph.nodes.every(node => node.connections.length === 0));
});

test('mono hardware routing explicitly averages both stereo channels into each selected slot', () => {
  const context = new Context(), inputs = [new Node(), new Node()];
  const graph = buildHardwareGraph(context, inputs, { mode: 'mono', a: 1, b: 4 });
  const halves = graph.nodes.filter(node => node.kind === 'gain' && node !== graph.master);
  assert.equal(halves.length, 4);
  assert.ok(halves.every(node => node.gain.value === .5 && node.channelCount === 1));
  assert.deepEqual(halves.map(node => node.connections[0].input), [1, 1, 4, 4]);
});

test('hardware mode bypasses crossfade and split cue while retaining deck/master gains; mix restores them', async () => {
  const { engine } = createEngine();
  engine.crossfade = 0; engine.splitCue = false; engine.volumes = [.6, .4]; engine.masterVolume = .5; engine.mix();
  assert.equal(engine.gains[1].gain.value, 0);
  await engine.setRouting({ mode: 'stereo', a: 0, b: 2 });
  assert.deepEqual(engine.gains.map(node => node.gain.value), [.6, .4]);
  assert.equal(engine.hardwareGraph.master.gain.value, .5);
  assert.equal(engine.context.destination.channelCount, 4);
  assert.equal(engine.context.destination.channelInterpretation, 'discrete');
  assert.equal(engine.limiter.connections.length, 0);
  engine.splitCue = true; engine.mix();
  assert.deepEqual(engine.panners.map(node => node.pan.value), [0, 0]);
  await engine.setRouting({ mode: 'mix' });
  assert.equal(engine.context.destination.channelCount, 2);
  assert.equal(engine.context.destination.channelInterpretation, 'speakers');
  assert.deepEqual(engine.panners.map(node => node.pan.value), [-1, 1]);
  assert.equal(engine.limiter.connections[0].target, engine.context.destination);
  assert.equal(engine.gains[0].connections.length, 1);
});

test('invalid or unsupported graph change preserves the previously connected route', async () => {
  const { engine } = createEngine();
  await engine.setRouting({ mode: 'stereo', a: 0, b: 2 });
  const previous = engine.hardwareGraph;
  await assert.rejects(engine.setRouting({ mode: 'stereo', a: 0, b: 1 }), /non-overlapping/);
  assert.equal(engine.hardwareGraph, previous);
  assert.equal(previous.master.connections[0].target, engine.context.destination);
  engine.context.destination.rejectConnection = true;
  await assert.rejects(engine.setRouting({ mode: 'mono', a: 2, b: 4 }), /Connection rejected/);
  assert.equal(engine.hardwareGraph, previous);
  assert.deepEqual(engine.routing, { mode: 'stereo', a: 0, b: 2 });
  assert.equal(engine.context.destination.channelCount, 4);
  assert.equal(previous.master.connections[0].target, engine.context.destination);
});

test('device capacity loss falls back to stereo mix, and denied selection preserves current device/route', async () => {
  const { engine, events } = createEngine();
  await engine.setRouting({ mode: 'stereo', a: 0, b: 2 });
  await assert.rejects(engine.chooseOutput('denied'), /permission denied/);
  assert.equal(engine.routing.mode, 'stereo');
  assert.equal(engine.context.sinkId, '');
  await engine.chooseOutput('stereo-device');
  assert.equal(engine.routing.mode, 'mix');
  assert.equal(engine.context.destination.channelCount, 2);
  const status = events.filter(event => event.type === 'routing').at(-1);
  assert.equal(status.maxChannels, 2);
  assert.equal(status.deviceId, 'stereo-device');
  assert.ok(events.some(event => event.type === 'notice' && event.message.includes('fewer')));
});

test('device picker runs inside the explicit gesture; listing never requests microphone access', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const order = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
    selectAudioOutput() { order.push('picker'); return Promise.resolve({ deviceId: 'external-interface' }); },
    async enumerateDevices() { return [{ kind: 'audioinput', deviceId: 'microphone', label: 'Mic' }, { kind: 'audiooutput', deviceId: 'external-interface', label: 'External interface' }]; },
    getUserMedia() { throw new Error('Microphone permission must not be requested'); }
  } } });
  try {
    const { engine, events } = createEngine();
    engine.ensure = async () => { order.push('ensure'); };
    await engine.chooseOutput('');
    assert.equal(order[0], 'picker');
    assert.equal(engine.context.sinkId, 'external-interface');
    const status = events.filter(event => event.type === 'routing').at(-1);
    assert.equal(status.canPickOutput, true);
    assert.equal(status.canChooseOutput, true);
    assert.deepEqual(status.devices.map(device => device.id), ['default', 'external-interface']);
  } finally { if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else delete globalThis.navigator; }
});

test('device enumeration refusal still resets routes that exceed new hardware capacity', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { async enumerateDevices() { throw new Error('Device names are not permitted'); } } } });
  try {
    const { engine, events } = createEngine();
    await engine.setRouting({ mode: 'stereo' });
    engine.context.destination.maxChannelCount = 2;
    await engine.refreshOutputs();
    assert.equal(engine.routing.mode, 'mix');
    const status = events.filter(event => event.type === 'routing').at(-1);
    assert.equal(status.maxChannels, 2);
    assert.equal(status.mode, 'mix');
    assert.deepEqual(status.devices, [{ id: 'default', label: 'System default' }]);
  } finally { if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else delete globalThis.navigator; }
});
