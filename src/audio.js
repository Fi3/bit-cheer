import { assetUrl } from './assets.js';
import { clamp, estimateTempo, generatedWaveform, waveformPeaks } from './training.js';
import { availableChannelCount, validateRouting, buildHardwareGraph } from './output-routing.js';

const MAX_PCM_FRAMES = 28_800_000;
export const VOICE_COUNT = 20;
export const MAX_ELEMENT_MASK = (1 << VOICE_COUNT) - 1;
const newVoices = () => Array.from({ length: VOICE_COUNT }, (_, voice) => ({ gain: 1, pan: 0, pattern: -1, preview: voice === 0 ? 0x1111 : 0 }));
const randomWord = () => crypto.getRandomValues(new Uint32Array(1))[0];
function seededRandom(seed) { let state = seed || 1; return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; }; }
function freshSeed(previous) { let seed = randomWord() || 1; if ((seed & 7) === (previous & 7)) seed = (seed ^ 1) >>> 0; return seed || 8; }
const COALESCED_CONTROLS = new Set(['seek', 'bend']);
const scheduleFrame = callback => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : setTimeout(callback, 16);

export class AudioEngine {
  constructor(send) {
    this.send = send; this.context = null; this.node = null; this.pending = null;
    this.state = [0, 1].map(i => ({ bpm: i ? 124 : 120, pitch: 0, playing: false, position: 0, beat: 0, peak: 0, duration: 32 * 60 / (i ? 124 : 120), elements: 1, seed: i + 1, source: 'generated', trackId: null, voices: newVoices(), solo: -1, name: i ? 'KICK STUDY · 02' : 'KICK STUDY · 01' }));
    this.waveforms = [generatedWaveform(1, 1), generatedWaveform(1, 2)];
    this.crossfade = .5; this.masterVolume = .75; this.volumes = [.8, .8]; this.splitCue = false;
    this.routing = { mode: 'mix', a: 0, b: 1 }; this.hardwareGraph = null;
    this.outputDevices = [{ id: 'default', label: 'System default' }]; this.outputChoiceVersion = 0; this.outputSwitch = null; this.outputListener = null;
    this.pendingLoads = new Map(); this.loadVersions = [0, 0]; this.loadSequence = 0;
    this.controls = new Map(); this.controlVersions = new Map(); this.controlFrame = null;
    this.waveformWorker = null; this.waveformReady = false; this.waveformVersions = [0, 0]; this.waveformPending = new Map(); this.waveformFrame = null;
    // Compilation is asynchronous and happens before the module reaches the audio thread.
    this.wasmModule = fetch(assetUrl('/engine.wasm')).then(r => {
      if (!r.ok) throw new Error('WASM engine could not be loaded. Run npm run build.');
      return r.arrayBuffer();
    }).then(bytes => WebAssembly.compile(bytes));
    this.wasmModule.then(module => this.startWaveformWorker(module)).catch(() => {});
  }


  startWaveformWorker(wasmModule) {
    if (typeof Worker !== 'function') return;
    try {
      const worker = new Worker(assetUrl('/waveform-worker.js'), { type: 'module' });
      this.waveformWorker = worker;
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') {
          this.waveformReady = true;
          for (let deck = 0; deck < 2; deck++) this.queueWaveform(deck);
        } else if (data.type === 'waveform' && (data.deck === 0 || data.deck === 1)
          && data.version === this.waveformVersions[data.deck] && this.state[data.deck].source === 'generated') {
          this.waveforms[data.deck] = data.peaks;
        }
      };
      worker.onerror = () => { worker.terminate(); this.waveformWorker = null; this.waveformReady = false; this.waveformPending.clear(); };
      worker.postMessage({ type: 'init', wasmModule });
    } catch { this.waveformWorker = null; }
  }

  queueWaveform(deck) {
    if (!this.waveformWorker || this.state[deck].source !== 'generated') return;
    const version = ++this.waveformVersions[deck];
    const { bpm, seed, voices } = this.state[deck];
    const elements = this.activeElements(deck);
    this.waveformPending.set(deck, { type: 'render', deck, version, bpm, seed, elements, voices: voices.map(voice => ({ ...voice })) });
    if (this.waveformReady && this.waveformFrame === null) this.waveformFrame = scheduleFrame(() => {
      this.waveformFrame = null;
      if (!this.waveformWorker || !this.waveformReady) return;
      for (const request of this.waveformPending.values()) this.waveformWorker.postMessage(request);
      this.waveformPending.clear();
    });
  }

  cancelWaveform(deck) {
    const version = ++this.waveformVersions[deck];
    this.waveformPending.delete(deck);
    this.waveformWorker?.postMessage({ type: 'cancel', deck, version });
  }

  async ensure() {
    if (this.pending) { await this.pending; if (this.context.state !== 'running') await this.context.resume(); return; }
    if (this.context && this.node) { if (this.context.state !== 'running') await this.context.resume(); return; }
    if (!window.AudioContext || !window.AudioWorkletNode) throw new Error('This browser needs AudioWorklet and WebAssembly support. Use a current browser on HTTPS or localhost.');
    this.context = new AudioContext({ latencyHint: 'interactive' });
    const context = this.context;
    // Resume synchronously inside the user gesture, before fetching/compiling modules.
    const resume = context.resume();
    resume.catch(() => {});
    this.pending = (async () => {
      const [wasmModule] = await Promise.all([this.wasmModule, context.audioWorklet.addModule(assetUrl('/audio-worklet.js'))]);
      this.node = new AudioWorkletNode(context, 'bit-cheer-engine', { numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [2, 2], processorOptions: { wasmModule } });
      let readyResolve, readyReject;
      const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
      const readyTimer = setTimeout(() => readyReject(new Error('The audio processor did not become ready. Please reload and try again.')), 10000);
      this.node.port.onmessage = ({ data }) => {
        if (data.type === 'ready') { readyResolve(); return; }
        if (data.type === 'loaded') {
          const waiting = this.pendingLoads.get(data.id);
          if (waiting) { clearTimeout(waiting.timer); this.pendingLoads.delete(data.id); waiting.resolve(data); }
          return;
        }
        if (data.type === 'error') {
          const waiting = this.pendingLoads.get(data.id);
          if (waiting) { clearTimeout(waiting.timer); this.pendingLoads.delete(data.id); waiting.reject(new Error(data.message)); return; }
          readyReject(new Error(data.message));
          this.send(data); return;
        }
        if (data.type === 'patterns' && (data.deck === 0 || data.deck === 1)) {
          const state = this.state[data.deck];
          state.voices = state.voices.map((voice, index) => ({ ...voice, preview: voice.pattern >= 0 ? voice.pattern : data.patterns[index] || 0 }));
          this.send({ type: 'voices', deck: data.deck, voices: state.voices, solo: state.solo });
          return;
        }
        if (data.type === 'telemetry') {
          const decks = this.state.map((s, i) => {
            Object.assign(s, { position: data.positions[i], beat: data.beats[i], peak: data.peaks[i], playing: data.playing[i], duration: data.durations[i] });
            return { ...s, bpm: data.bpms[i] };
          });
          this.send({ type: 'telemetry', decks, cpu: data.cpu || 0, latency: (context.baseLatency || 0) * 1000 });
        } else this.send(data);
      };
      this.node.onprocessorerror = () => {
        const error = new Error('Audio processor stopped. Reload to restart the engine.');
        readyReject(error);
        for (const waiting of this.pendingLoads.values()) { clearTimeout(waiting.timer); waiting.reject(error); }
        this.pendingLoads.clear();
        this.send({ type: 'error', message: error.message });
      };
      try {
        await ready;
      } finally { clearTimeout(readyTimer); }
      this.master = context.createGain(); this.master.gain.value = this.masterVolume;
      this.limiter = context.createDynamicsCompressor(); this.limiter.threshold.value = -3; this.limiter.knee.value = 0; this.limiter.ratio.value = 20; this.limiter.attack.value = .003; this.limiter.release.value = .1;
      this.master.connect(this.limiter).connect(context.destination);
      this.gains = []; this.panners = []; this.analysers = [];
      for (let i = 0; i < 2; i++) {
        const gain = context.createGain(), pan = context.createStereoPanner(), analyser = context.createAnalyser();
        analyser.fftSize = 256; this.node.connect(analyser, i); analyser.connect(gain).connect(pan).connect(this.master);
        this.gains.push(gain); this.panners.push(pan); this.analysers.push(analyser);
      }
      this.mix();
      for (let i = 0; i < 2; i++) { this.post({ type: 'randomize', deck: i, seed: this.state[i].seed, bpm: this.state[i].bpm }); this.post({ type: 'set', deck: i, param: 'elements', value: this.state[i].elements }); }
      await resume;
      this.send({ type: 'ready' });
      this.emitRouting();
      const media = globalThis.navigator?.mediaDevices;
      if (!this.outputListener && media?.addEventListener) {
        this.outputListener = () => { if (this.context && this.node) this.refreshOutputs().catch(error => this.send({ type: 'error', message: error.message })); };
        media.addEventListener('devicechange', this.outputListener);
      }
      if (context.addEventListener) context.addEventListener('sinkchange', () => this.refreshOutputs().catch(error => this.send({ type: 'error', message: error.message })));
      this.refreshOutputs().catch(() => {});
    })();
    try {
      await this.pending;
      this.pending = null;
    } catch (error) {
      this.node?.disconnect();
      if (context.state !== 'closed') await context.close();
      this.context = null; this.node = null; this.pending = null; this.gains = null;
      throw error;
    }
  }

  post(data, transfers = []) { this.node.port.postMessage(data, transfers); }

  flushControls(deck) {
    if (!this.node) return;
    for (const [key, command] of this.controls) if (deck === undefined || command.deck === deck) { this.post(command); this.controls.delete(key); }
  }

  async set(deck, param, value) {
    if (deck !== 0 && deck !== 1) throw new Error('Choose deck A or B.');
    if (!Number.isFinite(Number(value))) return;
    const key = `${deck}:${param}`;
    const coalesced = COALESCED_CONTROLS.has(param) && !(param === 'bend' && Number(value) === 0);
    const version = (this.controlVersions.get(key) || 0) + 1;
    if (COALESCED_CONTROLS.has(param)) this.controlVersions.set(key, version);
    if (param === 'bend' && Number(value) === 0) this.controls.delete(key);
    await this.ensure();
    if (coalesced && this.controlVersions.get(key) !== version) return;
    if (param === 'volume') { this.volumes[deck] = clamp(Number(value), 0, 1); this.mix(); return; }
    if (param === 'pitch') value = clamp(Number(value), -50, 50);
    if (param === 'bpm') value = clamp(Number(value), 30, 300);
    if (param === 'elements') value = Number(value) & MAX_ELEMENT_MASK;
    if (['pitch', 'bpm', 'elements'].includes(param)) this.state[deck][param] = value;
    if (param === 'play') this.state[deck].playing = !!value;
    if (param === 'source' && Number(value) === 0) { this.state[deck].source = 'generated'; this.state[deck].trackId = null; }
    if (this.state[deck].source === 'generated') {
      if (param === 'elements' || param === 'source') this.waveforms[deck] = generatedWaveform(this.state[deck].elements, this.state[deck].seed);
      if (param === 'bpm' || param === 'source') this.state[deck].duration = 32 * 60 / this.state[deck].bpm;
      if (['elements', 'bpm', 'source'].includes(param)) this.queueWaveform(deck);
    }
    const command = { type: 'set', deck, param, value: param === 'elements' ? this.activeElements(deck) : value };
    if (coalesced) {
      this.controls.set(key, command);
      if (this.controlFrame === null) this.controlFrame = scheduleFrame(() => { this.controlFrame = null; this.flushControls(); });
    } else { this.flushControls(); this.post(command); }
  }

  mix() {
    if (!this.gains) return;
    for (let i = 0; i < 2; i++) {
      const hardware = this.routing.mode !== 'mix';
      const blend = hardware || this.splitCue ? 1 : i ? Math.sin(this.crossfade * Math.PI / 2) : Math.cos(this.crossfade * Math.PI / 2);
      this.gains[i].gain.setTargetAtTime(this.volumes[i] * blend, this.context.currentTime, .012);
      this.panners[i].pan.setTargetAtTime(!hardware && this.splitCue ? (i ? 1 : -1) : 0, this.context.currentTime, .012);
    }
    this.master.gain.setTargetAtTime(this.masterVolume, this.context.currentTime, .012);
    this.hardwareGraph?.setMasterVolume(this.masterVolume);
  }


  emitRouting() {
    const media = globalThis.navigator?.mediaDevices;
    const canChooseOutput = typeof this.context?.setSinkId === 'function';
    const sink = this.context?.sinkId;
    this.send({ type: 'routing', maxChannels: this.context ? availableChannelCount(this.context.destination) : 0,
      ...this.routing, devices: this.outputDevices,
      deviceId: typeof sink === 'string' && sink ? sink : 'default',
      canChooseOutput, canPickOutput: canChooseOutput && typeof media?.selectAudioOutput === 'function' });
  }

  async setRouting(config) {
    await this.ensure();
    const destination = this.context.destination;
    const next = validateRouting(config, availableChannelCount(destination));
    const previous = this.routing;
    const oldGraph = this.hardwareGraph;
    if (next.mode === previous.mode && next.a === previous.a && next.b === previous.b) {
      const count = next.mode === 'mix' ? Math.min(2, availableChannelCount(destination)) : Math.max(next.a, next.b) + (next.mode === 'stereo' ? 2 : 1);
      if (destination.channelCount !== count) destination.channelCount = count;
      this.emitRouting(); return;
    }
    // Validate and construct in isolation before touching the currently audible graph.
    const graph = next.mode === 'mix' ? null : buildHardwareGraph(this.context, this.gains, next, 0);
    const settings = { channelCount: destination.channelCount, channelCountMode: destination.channelCountMode, channelInterpretation: destination.channelInterpretation };
    const detachMix = () => {
      this.gains.forEach((gain, index) => { try { gain.disconnect(this.panners[index]); } catch {} });
      try { this.limiter.disconnect(destination); } catch {}
    };
    const attachMix = () => { this.gains.forEach((gain, index) => gain.connect(this.panners[index])); this.limiter.connect(destination); };
    try {
      destination.channelCount = graph ? graph.channelCount : Math.min(2, availableChannelCount(destination));
      destination.channelCountMode = 'explicit';
      destination.channelInterpretation = graph ? 'discrete' : 'speakers';
      if (graph) graph.attach(); else attachMix();
    } catch (error) {
      graph?.disconnect();
      if (!graph && previous.mode !== 'mix') detachMix();
      for (const [key, value] of Object.entries(settings)) try { destination[key] = value; } catch {}
      throw new Error(`Output routing could not be changed: ${error.message}`);
    }
    if (oldGraph) oldGraph.disconnect(); else detachMix();
    this.routing = next; this.hardwareGraph = graph;
    this.mix();
    this.emitRouting();
  }

  async refreshOutputs() {
    await this.ensure();
    const maximum = availableChannelCount(this.context.destination);
    try { validateRouting(this.routing, maximum); }
    catch {
      await this.setRouting({ mode: 'mix' });
      this.send({ type: 'notice', message: 'This output has fewer available channels. Switched back to stereo mix.' });
    }
    if (this.routing.mode === 'mix' && this.context.destination.channelCount !== Math.min(2, maximum)) this.context.destination.channelCount = Math.min(2, maximum);
    const media = globalThis.navigator?.mediaDevices;
    if (media?.enumerateDevices) {
      try {
        const devices = await media.enumerateDevices();
        const outputs = devices.filter(device => device.kind === 'audiooutput' && device.deviceId);
        const unique = new Map([['default', { id: 'default', label: 'System default' }]]);
        outputs.forEach((device, index) => unique.set(device.deviceId, { id: device.deviceId, label: device.label || `Audio output ${index + 1}` }));
        this.outputDevices = [...unique.values()];
      } catch { /* Keep the last known devices; channel capability checks still apply. */ }
    }
    const currentSink = typeof this.context.sinkId === 'string' && this.context.sinkId ? this.context.sinkId : 'default';
    if (!this.outputDevices.some(device => device.id === currentSink)) this.outputDevices.push({ id: currentSink, label: 'Current audio output' });
    this.emitRouting();
  }

  async chooseOutput(deviceId) {
    const version = ++this.outputChoiceVersion;
    const media = globalThis.navigator?.mediaDevices;
    const sinkSupported = this.context ? typeof this.context.setSinkId === 'function' : typeof globalThis.window?.AudioContext?.prototype?.setSinkId === 'function';
    if (!sinkSupported) throw new Error('This browser cannot choose an output device. Select it in your operating system sound settings.');
    // The native picker must open directly from the explicit click, before awaits.
    const selection = deviceId === '' && typeof media?.selectAudioOutput === 'function'
      ? media.selectAudioOutput() : Promise.resolve({ deviceId: deviceId === 'default' ? '' : deviceId || '' });
    selection.catch(() => {});
    await this.ensure();
    const selected = await selection;
    this.outputSwitch = (this.outputSwitch || Promise.resolve()).catch(() => {}).then(async () => {
      if (version !== this.outputChoiceVersion) return;
      await this.context.setSinkId(selected.deviceId || '');
      await this.refreshOutputs();
    });
    await this.outputSwitch;
  }

  async mixer(param, value) { await this.ensure(); if (param === 'crossfade') this.crossfade = clamp(value, 0, 1); if (param === 'master') this.masterVolume = clamp(value, 0, 1); if (param === 'splitCue') this.splitCue = !!value; this.mix(); }


  activeElements(deck) { return this.state[deck].solo >= 0 ? 1 << this.state[deck].solo : this.state[deck].elements; }

  emitDeckChanged(deck) {
    const { name, bpm, pitch, elements, duration, source, position, playing, voices, solo } = this.state[deck];
    this.send({ type: 'deckChanged', deck, name, bpm, pitch, elements, duration, source, position, playing, voices, solo });
  }

  async setVoice(deck, voice, param, rawValue) {
    if ((deck !== 0 && deck !== 1) || !Number.isInteger(voice) || voice < 0 || voice >= VOICE_COUNT) throw new Error('Choose a valid deck and instrument.');
    if (!['gain', 'pan', 'pattern', 'reset'].includes(param)) throw new Error('Unknown instrument control.');
    await this.ensure();
    let value = Number(rawValue);
    if (param !== 'reset' && !Number.isFinite(value)) return;
    const settings = this.state[deck].voices[voice];
    if (param === 'gain') settings.gain = value = clamp(value, 0, 1.5);
    if (param === 'pan') settings.pan = value = clamp(value, -1, 1);
    if (param === 'pattern') settings.pattern = value = value < 0 ? -1 : Math.round(value) & 65535;
    if (param === 'reset') { settings.pattern = -1; value = 0; }
    if (settings.pattern >= 0) settings.preview = settings.pattern;
    this.post({ type: 'voice', deck, voice, param, value });
    this.queueWaveform(deck);
    this.send({ type: 'voices', deck, voices: this.state[deck].voices, solo: this.state[deck].solo });
  }

  async setSolo(deck, voice) {
    if ((deck !== 0 && deck !== 1) || !Number.isInteger(voice) || voice < -1 || voice >= VOICE_COUNT) throw new Error('Choose an instrument to solo, or clear solo.');
    await this.ensure();
    this.state[deck].solo = voice;
    this.post({ type: 'set', deck, param: 'elements', value: this.activeElements(deck) });
    this.queueWaveform(deck);
    this.send({ type: 'solo', deck, voice });
    this.send({ type: 'voices', deck, voices: this.state[deck].voices, solo: voice });
  }

  async randomizeTempo(deck, mode) {
    if (deck !== 0 && deck !== 1) throw new Error('Choose deck A or B.');
    await this.ensure();
    const selected = this.state[deck], reference = this.state[1 - deck];
    const current = selected.bpm * (1 + selected.pitch / 100);
    const referenceTempo = reference.bpm * (1 + reference.pitch / 100);
    const width = mode === 'foundation' ? .04 : .08;
    let low = referenceTempo / (1 + width), high = referenceTempo * (1 + width);
    if (selected.source === 'pcm') { low = Math.max(low, selected.bpm * .92); high = Math.min(high, selected.bpm * 1.08); }
    else { low = Math.max(30, low); high = Math.min(300, high); }
    const intervals = [[low, Math.min(high, current - 1)], [Math.max(low, current + 1), high]].filter(([a, b]) => b >= a);
    if (!intervals.length) throw new Error('These tracks are too far apart to randomize by at least 1 BPM within ±8% pitch. Choose a track with a tempo closer to the other deck.');
    const interval = intervals[Math.floor(Math.random() * intervals.length)];
    const target = interval[0] + Math.random() * (interval[1] - interval[0]);
    this.flushControls(deck);
    if (selected.source === 'pcm') {
      selected.pitch = (target / selected.bpm - 1) * 100;
      this.post({ type: 'set', deck, param: 'pitch', value: selected.pitch });
    } else {
      selected.position *= selected.bpm / target;
      selected.bpm = target; selected.pitch = 0; selected.duration = 32 * 60 / target;
      this.post({ type: 'set', deck, param: 'bpm', value: target });
      this.post({ type: 'set', deck, param: 'pitch', value: 0 });
      this.queueWaveform(deck);
    }
    this.post({ type: 'set', deck, param: 'bend', value: 0 });
    this.emitDeckChanged(deck);
  }

  async changeGeneratedTrack(deck, mode, elements) {
    if (deck !== 0 && deck !== 1) throw new Error('Choose deck A or B.');
    await this.ensure(); this.flushControls(deck);
    const selected = this.state[deck];
    const seed = freshSeed(selected.seed), random = seededRandom(seed);
    let mask = 1;
    if (mode !== 'foundation') {
      const instruments = Array.from({ length: VOICE_COUNT - 1 }, (_, i) => i + 1);
      for (let i = instruments.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [instruments[i], instruments[j]] = [instruments[j], instruments[i]]; }
      const count = 2 + Math.floor(random() * 4);
      for (const voice of instruments.slice(0, count)) mask |= 1 << voice;
      const previous = Number.isFinite(elements) ? elements : selected.elements;
      if (mask === previous || mask === selected.elements) mask = (mask ^ (1 << instruments[0])) | (1 << instruments[count]);
    }
    // A new source starts at its native tempo; only Randomize tempo changes tempo.
    const bpm = selected.bpm, pitch = 0;
    ++this.loadVersions[deck];
    Object.assign(selected, { seed, bpm, pitch, elements: mask, source: 'generated', trackId: null, position: 0, beat: 0, duration: 32 * 60 / bpm, solo: -1,
      name: `${mode === 'foundation' ? 'KICK STUDY' : 'RHYTHM STUDY'} · ${String(seed % 100000).padStart(5, '0')}`,
      voices: selected.voices.map(voice => ({ ...voice, pattern: -1, preview: 0 })) });
    this.post({ type: 'randomize', deck, seed, bpm });
    this.post({ type: 'set', deck, param: 'pitch', value: pitch });
    this.post({ type: 'set', deck, param: 'elements', value: mask });
    this.waveforms[deck] = generatedWaveform(mask, seed); this.queueWaveform(deck);
    this.emitDeckChanged(deck);
  }

  async chaos(deck) {
    if (deck !== 0 && deck !== 1) throw new Error('Choose deck A or B.');
    const previousPitch = this.state[deck].pitch;
    await this.changeGeneratedTrack(deck, 'builder');
    // CHAOS changes composition, so it retains its separate tempo/pitch contract.
    this.state[deck].pitch = previousPitch;
    this.post({ type: 'set', deck, param: 'pitch', value: previousPitch });
    const selected = this.state[deck], random = seededRandom(selected.seed ^ 0x6d2b79f5);
    const order = Array.from({ length: VOICE_COUNT - 1 }, (_, i) => i + 1);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const count = 12 + Math.floor(random() * 9);
    let elements = 1; for (const voice of order.slice(0, count - 1)) elements |= 1 << voice;
    selected.elements = elements; selected.name = `CHAOS STUDY · ${String(selected.seed % 100000).padStart(5, '0')}`;
    selected.voices = selected.voices.map((voice, index) => {
      let pattern = 0;
      for (let step = 0; step < 16; step++) if (random() < (index === 0 ? .38 : .45)) pattern |= 1 << step;
      if (index === 0) pattern |= 0x1111;
      if (!pattern) pattern = 1 << Math.floor(random() * 16);
      return { gain: Math.round((.2 + random() * .5) * 100) / 100, pan: index === 0 ? 0 : Math.round((random() * 1.6 - .8) * 100) / 100, pattern, preview: pattern };
    });
    this.post({ type: 'set', deck, param: 'elements', value: elements });
    selected.voices.forEach((voice, index) => {
      for (const param of ['gain', 'pan', 'pattern']) this.post({ type: 'voice', deck, voice: index, param, value: voice[param] });
    });
    this.queueWaveform(deck); this.emitDeckChanged(deck);
  }

  async randomize(mode, elements) {
    await this.ensure(); this.flushControls();
    const base = 100 + Math.floor(Math.random() * 31), delta = (2 + Math.random() * (mode === 'foundation' ? 3 : 6)) * (Math.random() < .5 ? -1 : 1);
    const bpms = [base, Math.round((base + delta) * 10) / 10], names = [];
    for (let i = 0; i < 2; i++) {
      ++this.loadVersions[i]; // An earlier, still-decoding import must not replace new generated material.
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      const name = `${elements === 1 ? 'KICK STUDY' : 'RHYTHM STUDY'} · ${String(seed % 99).padStart(2, '0')}`;
      Object.assign(this.state[i], { bpm: bpms[i], pitch: 0, seed, elements, name, source: 'generated', trackId: null, position: 0, beat: 0, duration: 32 * 60 / bpms[i], solo: -1, voices: newVoices() });
      this.waveforms[i] = generatedWaveform(elements, seed); names[i] = name; this.queueWaveform(i);
      this.post({ type: 'randomize', deck: i, seed, bpm: bpms[i] });
      for (let voice = 0; voice < VOICE_COUNT; voice++) {
        this.post({ type: 'voice', deck: i, voice, param: 'gain', value: 1 });
        this.post({ type: 'voice', deck: i, voice, param: 'pan', value: 0 });
      }
      this.post({ type: 'set', deck: i, param: 'elements', value: elements });
      this.post({ type: 'set', deck: i, param: 'pitch', value: 0 });
    }
    this.send({ type: 'randomized', bpms, names });
  }

  async load(deck, bytes, name, knownBpm) {
    if (deck !== 0 && deck !== 1) throw new Error('Choose deck A or B.');
    const version = ++this.loadVersions[deck];
    if (bytes.byteLength > 100 * 1024 * 1024) throw new Error('Choose an audio file smaller than 100 MB.');
    await this.ensure();
    const buffer = await this.context.decodeAudioData(bytes);
    if (version !== this.loadVersions[deck]) return false;
    if (buffer.length > MAX_PCM_FRAMES) {
      const minutes = Math.floor(MAX_PCM_FRAMES / buffer.sampleRate / 60 * 10) / 10;
      throw new Error(`Choose a track shorter than ${minutes} minutes at this audio sample rate (${Math.round(buffer.sampleRate / 1000)} kHz).`);
    }
    if (buffer.length < 2) throw new Error('The audio file has no playable samples.');
    const sourceLeft = buffer.getChannelData(0);
    const estimate = estimateTempo(sourceLeft, buffer.sampleRate);
    const bpm = Number.isFinite(Number(knownBpm)) && Number(knownBpm) >= 30 && Number(knownBpm) <= 300 ? Number(knownBpm) : estimate?.bpm || 120;
    const peaks = waveformPeaks(sourceLeft);
    const left = sourceLeft.slice(), right = buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1)).slice();
    const id = `track-${++this.loadSequence}`;
    this.flushControls();
    // Only report a loaded track once WASM has accepted its PCM buffer.
    const acknowledgement = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pendingLoads.delete(id); reject(new Error('Track loading timed out. Try a shorter track or reload the audio engine.')); }, 15000);
      this.pendingLoads.set(id, { resolve, reject, timer });
      try { this.post({ type: 'load', deck, left, right, sampleRate: buffer.sampleRate, bpm, beatOffset: estimate?.offset || 0, id }, [left.buffer, right.buffer]); }
      catch (error) { clearTimeout(timer); this.pendingLoads.delete(id); reject(error); }
    });
    const loaded = await acknowledgement;
    if (version !== this.loadVersions[deck]) return false;
    this.cancelWaveform(deck);
    this.waveforms[deck] = peaks;
    Object.assign(this.state[deck], { bpm, pitch: 0, playing: false, position: 0, beat: -(estimate?.offset || 0) * bpm / 60, duration: loaded.duration, source: 'pcm', name, trackId: null });
    this.send({ type: 'track', deck, name, bpm, duration: loaded.duration });
    this.send({ type: 'notice', message: knownBpm ? `${name} loaded. Use CUE to find your first downbeat.` : `${name} loaded. BPM ${estimate ? 'estimated' : 'defaults to'} ${bpm}; correct it with the track BPM field if needed.` });
    return true;
  }
}
