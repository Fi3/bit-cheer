# Bit Cheer audio core

The dual-deck transport, generated percussion and melodic voices, interpolating PCM player, gain smoothing, three-band equalizer, and output limiter run in Rust compiled to WebAssembly. `public/audio-worklet.js` is the small transport adapter: it copies two stereo outputs into Web Audio render buffers and posts status roughly 19 times a second. The 128-frame render path allocates no Rust heap memory and never calls back into JavaScript. Track decoding and beat analysis belong on the main thread or an analysis worker, outside the audio callback.

## Build and verify

```sh
rustup target add wasm32-unknown-unknown
cargo test --manifest-path engine/Cargo.toml
cargo build --manifest-path engine/Cargo.toml --target wasm32-unknown-unknown --release
node --test engine/tests/worklet.test.cjs
```

Build output: `engine/target/wasm32-unknown-unknown/release/bit_cheer_audio.wasm`.
The application's build script copies this to its public assets.

The benchmark in the worklet tests renders ten seconds of both decks with all seven voices. Its reported wall-clock percentage is host-specific, not a latency promise. Actual output latency depends on the browser, operating system, and audio device.

## Worklet interface

Register `public/audio-worklet.js` with `audioContext.audioWorklet.addModule(url)`. Create `AudioWorkletNode(context, 'bit-cheer-engine', { numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [2, 2], processorOptions: { wasmModule } })`, where `wasmModule` is compiled by `WebAssembly.compile(bytes)` before creating the node. `processorOptions.wasmBytes` is also supported. Output 0 is deck A stereo; output 1 is deck B stereo. Connect each output through an independent gain node for crossfading or cue monitoring.

Messages into the worklet:

- `{type: 'set', deck: 0|1, param: string, value: number|boolean}`.
- `{type: 'randomize', deck, seed: uint32, bpm}` resets the deck to a deterministic generated loop, resets pitch, bend, cue, and grid offset, and retains element toggles and playback state.
- `{type: 'load', deck, left: Float32Array, right: Float32Array, sampleRate, bpm, beatOffset?: seconds, id?: string}` loads decoded stereo PCM and pauses that deck. Transfer the channel buffers when possible. Right channel can be omitted for mono. The engine supports at most 28,800,000 frames per deck; reject overly long tracks before decoding where feasible.
- `{type: 'reset'}` resets both decks to their original paused state.

Parameters:

| Name | Value | Raw ABI ID |
| --- | --- | --- |
| `play` | Boolean; play or pause | 0 |
| `bpm` | Source BPM, 30–300; edits the grid for PCM | 1 |
| `pitch` | Playback-rate offset in percent, −50 to +50 | 2 |
| `elements` | Bit mask: kick=1, hat=2, snare=4, clap=8, bass=16, percussion=32, synth=64 | 3 |
| `nudge` | Move playhead by this many beats; wraps around loop | 4 |
| `seek` | Source seconds, clamped to duration | 5 |
| `cue` | Return to saved cue (value ignored) | 6 |
| `setCue` | Store current source position (value ignored) | 7 |
| `low`, `mid`, `high` | EQ gain in dB, −24 to +12 | 8, 9, 10 |
| `gain` | Linear deck gain, 0–2 | 11 |
| `source` | 0 returns to generated audio | 12 |
| `loop` | Boolean | 13 |
| `beatOffset` | Source seconds to first grid beat, 0–duration | 14 |
| `bend` | Temporary playback-rate offset, −20 to +20 percent; does not alter saved pitch; UI must return it to zero | 15 |

Output messages:

- `{type:'ready', sampleRate, engine}` after initialization.
- `{type:'loaded', deck, duration, bpm, id}` acknowledges successful PCM load.
- `{type:'error', message, deck?, id?}` for load or engine errors. A load validation error is recoverable; a render error silences output.
- `{type:'telemetry', positions, beats, peaks, bpms, durations, playing}` contains arrays of two values. Positions and durations are source seconds; `beats = (position − beatOffset) × sourceBpm / 60`. BPM includes pitch and temporary bend. Peaks are measured from the actual DSP output, accumulated over the telemetry interval. `playing` also reflects end-of-track stopping when loop is disabled.

Playback-rate changes naturally change musical pitch; this engine does not implement time stretching or key lock. Generated music is procedural synthesis with seeded rhythm and note variation, not a remote generative-AI model.

## Raw WASM ABI

`engine_init(sample_rate: f64)` initializes one instance. `engine_render(frames: u32)` accepts 0–128 frames and returns a pointer to 512 `f32` samples arranged as four planes of 128 samples: A-left, A-right, B-left, B-right. Unused frames are zero. Memory is exported as `memory`.

`engine_set(deck: u32, parameter: u32, value: f64)` uses the table above. `engine_randomize(deck, seed: u32, bpm: f64)` sets generated material. `engine_reserve(deck, frames: u32, source_rate: f64, bpm: f64)` returns a writable interleaved stereo PCM pointer, or zero on validation/allocation failure; copy the PCM then call `engine_commit(deck)`. Memory growth invalidates previous JavaScript typed-array views, so the worklet refreshes them after load.

`engine_position`, `engine_beat`, `engine_bpm`, `engine_peak`, and `engine_duration` accept a deck index and return `f64`. `engine_playing` returns `u32` 0 or 1. An instance must only be called from one thread; each worklet gets its own isolated instance.
