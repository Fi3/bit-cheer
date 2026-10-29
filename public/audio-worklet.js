/* Rust/WASM renders both decks on the audio thread; no JS audio synthesis. */
const PARAMS = Object.freeze({ play: 0, bpm: 1, pitch: 2, elements: 3, nudge: 4, seek: 5, cue: 6, setCue: 7, low: 8, mid: 9, high: 10, gain: 11, source: 12, loop: 13, beatOffset: 14, bend: 15, drift: 16 });

class BitCheerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.engine = null;
    this.views = null;
    this.buffer = null;
    this.blocks = 0;
    this.peaks = [0, 0];
    this.failed = false;
    try {
      const supplied = options.processorOptions || {};
      const module = supplied.wasmModule || new WebAssembly.Module(supplied.wasmBytes);
      this.engine = new WebAssembly.Instance(module, {}).exports;
      this.engine.engine_init(sampleRate);
      this.refreshViews();
      this.port.onmessage = ({ data }) => this.message(data);
      this.port.postMessage({ type: 'ready', sampleRate, engine: 'Rust / WebAssembly' });
    } catch (error) {
      this.failed = true;
      this.port.postMessage({ type: 'error', message: `WASM audio initialization failed: ${error.message}` });
    }
  }

  refreshViews() {
    const e = this.engine;
    const ptr = e.engine_render(0);
    this.buffer = e.memory.buffer;
    this.views = Array.from({ length: 4 }, (_, i) => new Float32Array(this.buffer, ptr + i * 128 * 4, 128));
  }

  message(message) {
    if (!this.engine || !message || typeof message !== 'object') return;
    const e = this.engine;
    const deck = Number(message.deck);
    try {
      if (message.type === 'reset') {
        e.engine_init(sampleRate);
        this.refreshViews();
        this.peaks[0] = this.peaks[1] = 0;
      } else if (message.type === 'voice' && (deck === 0 || deck === 1)) {
        const voice = Number(message.voice);
        const param = { gain: 0, pan: 1, pattern: 2, reset: 3 }[message.param];
        if (Number.isInteger(voice) && voice >= 0 && voice < e.engine_voice_count() && param !== undefined && Number.isFinite(Number(message.value))) {
          e.engine_voice(deck, voice, param, Number(message.value));
          if (param >= 2) this.patterns(deck);
        }
      } else if (message.type === 'set' && (deck === 0 || deck === 1)) {
        const param = PARAMS[message.param];
        const value = Number(message.value);
        if (param !== undefined && Number.isFinite(value)) e.engine_set(deck, param, value);
      } else if (message.type === 'randomize' && (deck === 0 || deck === 1)) {
        e.engine_randomize(deck, Number(message.seed) >>> 0, Number(message.bpm));
        this.patterns(deck);
      } else if (message.type === 'load' && (deck === 0 || deck === 1)) {
        const left = message.left instanceof Float32Array ? message.left : new Float32Array(message.left);
        const right = message.right ? (message.right instanceof Float32Array ? message.right : new Float32Array(message.right)) : left;
        if (left.length !== right.length || left.length < 2) throw new Error('Stereo channels must contain matching PCM frames.');
        const sourceRate = Number(message.sampleRate);
        const bpm = Number(message.bpm);
        if (!Number.isFinite(bpm) || bpm < 30 || bpm > 300) throw new Error('Track BPM must be between 30 and 300.');
        const pointer = e.engine_reserve(deck, left.length, sourceRate, bpm);
        if (!pointer) throw new Error('Track exceeds the audio memory limit (28.8 million frames), or its sample rate is unsupported.');
        const pcm = new Float32Array(e.memory.buffer, pointer, left.length * 2);
        for (let i = 0; i < left.length; i++) {
          pcm[i * 2] = Number.isFinite(left[i]) ? left[i] : 0;
          pcm[i * 2 + 1] = Number.isFinite(right[i]) ? right[i] : 0;
        }
        e.engine_commit(deck);
        if (Number.isFinite(message.beatOffset)) e.engine_set(deck, PARAMS.beatOffset, message.beatOffset);
        this.refreshViews();
        this.port.postMessage({ type: 'loaded', deck, duration: e.engine_duration(deck), bpm, id: message.id });
      }
    } catch (error) {
      this.port.postMessage({ type: 'error', deck, message: error.message, id: message.id });
    }
  }

  patterns(deck) {
    const count = this.engine.engine_voice_count();
    this.port.postMessage({ type: 'patterns', deck, patterns: Array.from({ length: count }, (_, voice) => this.engine.engine_voice_pattern(deck, voice)) });
  }

  process(_inputs, outputs) {
    if (this.failed || !this.engine) return true;
    try {
      const frames = outputs[0]?.[0]?.length || 128;
      if (frames > 128) throw new Error('Unsupported audio render quantum.');
      this.engine.engine_render(frames);
      if (this.buffer !== this.engine.memory.buffer) this.refreshViews();
      for (let deck = 0; deck < 2; deck++) {
        const output = outputs[deck];
        if (output) {
          for (let channel = 0; channel < output.length; channel++) {
            const view = this.views[deck * 2 + (channel % 2)];
            if (frames === 128) output[channel].set(view);
            else for (let i = 0; i < frames; i++) output[channel][i] = view[i];
          }
        }
        this.peaks[deck] = Math.max(this.peaks[deck], this.engine.engine_peak(deck));
      }
      if (++this.blocks >= 20) {
        this.blocks = 0;
        const e = this.engine;
        this.port.postMessage({
          type: 'telemetry',
          positions: [e.engine_position(0), e.engine_position(1)],
          beats: [e.engine_beat(0), e.engine_beat(1)],
          peaks: [this.peaks[0], this.peaks[1]],
          bpms: [e.engine_bpm(0), e.engine_bpm(1)],
          durations: [e.engine_duration(0), e.engine_duration(1)],
          playing: [!!e.engine_playing(0), !!e.engine_playing(1)]
        });
        this.peaks[0] = this.peaks[1] = 0;
      }
    } catch (error) {
      this.failed = true;
      for (const output of outputs) for (const channel of output) channel.fill(0);
      this.port.postMessage({ type: 'error', message: `Audio rendering stopped: ${error.message}` });
    }
    return true;
  }
}
registerProcessor('bit-cheer-engine', BitCheerProcessor);
