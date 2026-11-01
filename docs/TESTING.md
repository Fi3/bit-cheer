# Testing

How bit.cheer is checked, what each suite covers, and what the checks can't prove.

## Run the checks

| Command | Runs |
| --- | --- |
| `npm run lint` | rustfmt and clippy (native and wasm32, warnings are errors), elm-format and elm-review, Prettier and ESLint. |
| `npm test` | The rhythm-model check, the WASM build, the Rust tests, and every Node test (`tests/*.test.mjs`, `engine/tests/*.test.cjs`). |
| `npm run test:e2e` | The browser suite (`tests/e2e.spec.js`) in Chromium. It builds WASM and Elm first and starts the dev server on port 5173 unless one is already running there. |
| `npm run test:e2e:firefox` | The same suite in Firefox, run locally (CI doesn't run it, see below). Install it once with `npx playwright install firefox`. Firefox's Web Audio needs a sound server, which every desktop has; its output is scaled to near silence. |
| `npm run check` | `lint`, then `test`. |

One at a time:

```sh
node --test tests/keyboard.test.mjs                        # one Node test file
cargo test --manifest-path engine/Cargo.toml phrase        # Rust tests whose names contain "phrase"
npm run test:e2e -- -g "keyboard control"                  # browser tests whose titles match
```

The browser suite runs against any server when `PLAYWRIGHT_BASE_URL` is set, for example a production build served under a GitHub Pages subpath:

```sh
VITE_BASE_PATH=/bit-cheer/ npm run build
VITE_BASE_PATH=/bit-cheer/ npm run preview -- --port 4174
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4174/bit-cheer/ npx playwright test --project=chromium
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE` picks a specific Chromium; otherwise `playwright.config.js` uses Playwright's own, or the newest one in `~/.cache/ms-playwright`. Install it with `npx playwright install chromium`. If Chromium crashes ("Target crashed"), point `TMPDIR` to a folder on disk: a full temp folder is the usual cause.

## In CI

`.github/workflows/ci.yml` runs on every pull request, with two jobs: **Lint and unit tests** (`npm run lint`, `npm test`) and **Browser tests (Chromium)** (`npm run test:e2e`; screenshots and traces of failures are kept as an artifact for a week). Firefox isn't in CI: a CI machine has no sound server, and with a PulseAudio null sink Firefox's AudioContext sometimes never starts, so a few tests time out waiting for playback (Chromium falls back to a silent output by itself). Every push to `main` runs the same workflow again inside `.github/workflows/deploy.yml`, and the site deploys only when it passes. In CI, Playwright retries a failed browser test once and reports it as flaky if the retry passes.

## The suites

### Rhythm model

`python3 scripts/train-rhythm-model.py --check`, the first step of `npm test`, retrains the model from `docs/rhythm-corpus.json` and fails unless `engine/src/rhythm_weights.rs` matches the result byte for byte. It also checks that training is deterministic and that changing one pattern changes the weights.

### Rust engine

The tests at the bottom of `engine/src/lib.rs` run the real DSP natively: silence when paused, independent decks, beats advancing with BPM and pitch, stereo PCM interpolation and looping, stopping at the end, cue, seek and nudge in source time, bounded output with all voices and extreme EQ, invalid parameters, deterministic randomization, EQ energy, bend and drift without touching the saved pitch, the beat-grid offset, distinct and reproducible kicks, every sound of every voice audible and its own, tempo changes keeping the musical position, one deck's changes never touching the other, the sixteen-beat phrase accent, per-voice gain, pan and patterns, and manual patterns that survive a track change.

`render_benchmark` is ignored by default: `cargo test --manifest-path engine/Cargo.toml --release -- --ignored render_benchmark --nocapture` prints how long 40 seconds of both decks with every voice takes to render.

### Compiled WASM

These load `public/engine.wasm`, the release build that `npm test` makes first.

| File | Covers |
| --- | --- |
| `engine/tests/worklet.test.cjs` | The real WASM inside the worklet adapter: two independent stereo outputs and telemetry, PCM transfer across WASM memory growth, recoverable load errors, a rendering benchmark (printed as a test diagnostic, with the WASM size), manual patterns, panning and previews, and every instrument offering the sound versions named in `src/instruments.js`. |
| `engine/tests/waveform-worker.test.cjs` | The waveform worker renders real kicks into 640 peaks, drops superseded jobs, renders a muted synth as silence, and follows each voice's chosen sound. |

### JavaScript modules

Each module's logic runs under `node:test` without a browser, with small fakes for the Web Audio and DOM parts.

| File | Covers |
| --- | --- |
| `tests/assets.test.mjs` | Asset URLs at the root and under a GitHub Pages subpath; external and inline URLs untouched; catalog tracks fetched once from the right path. |
| `tests/audio.test.mjs` | `AudioEngine`: WASM compiled before the worklet starts, coalesced seeks, loads announced only after the worklet confirms, load failures, the PCM frame cap, stale decodes, tempo and track actions that touch only their own deck, Foundation kicks, named loops and the loop picker. |
| `tests/docs.test.mjs` | The docs: links and anchors resolve, paths in backticks exist, `npm run` scripts exist, every source file is named in `AGENTS.md` and every test file here, and engine/README.md's parameter and voice tables match the code. |
| `tests/folder-browser.test.mjs` | Audio file detection, the folder-input fallback tree, lazy directory handles, folder tracks read from disk each time, and the 300 MB folder-track limit. |
| `tests/keyboard.test.mjs` | The key map against docs/KEYBOARD.md's key table, key labels, the two-hand layout, where each key works, key repeat, the `?` key, focus rules, and hold-to-bend. |
| `tests/layout.test.mjs` | Module layouts survive storage per mode, invalid stored layouts are cleaned, and old layouts migrate. |
| `tests/library.test.mjs` | Imports reusable on both decks, catalog refreshes keeping imports, shared downloads with independent buffers, Next/Previous/random by genre, retries and memory limits, and stale-load cancelling per deck. |
| `tests/loops.test.mjs` | Every named loop is complete, playable and unique; sound names are unique per instrument and kick names title the Foundation decks. |
| `tests/mic-worklet.test.mjs` | Continuous, silent microphone capture, its true sample rate, a 120 BPM pulse, and releasing the microphone. |
| `tests/output-routing.test.mjs` | Hardware route validation, the discrete multichannel graph, mono downmix, bypassing the crossfader in hardware modes, rollback on errors, device loss, and the device picker. |
| `tests/pitch-control.test.mjs` | Wheel and key pitch steps for every sensitivity and wheel unit, Shift + wheel (including sideways scrolling), fractional trackpad motion, and clamping. |
| `tests/pixel-font.test.mjs` | Every character the app writes has a glyph in the skin's pixel font, including symbols such as 📁. |
| `tests/skin-enhance.test.mjs` | The HD redraw (smooth diagonals, sharp corners, lettering, gradients, seamless tiles) and Comfort (no pure black or white, calmer loud colors, readable text). |
| `tests/skins.test.mjs` | Skin bases and palettes, the artwork contract, built-in kits, safe skin switching, ZIP and WSZ imports, kit building from odd skins, text-file parsing, import limits, museum links, and safe kit images. |
| `tests/training.test.mjs` | Tap tempo, match scoring (tempo, phase, phrase, wrap-around, held history), BPM detection, waveform peaks, the skin template round trip, archive limits, and Star mode drift and scoring. |

### Browser suite

`tests/e2e.spec.js` drives the real app in Chromium, and locally in Firefox (the `chromium` and `firefox` projects in `playwright.config.js`: one worker, 1440 × 1100, autoplay allowed) and listens to real audio through the app's telemetry. Where the browsers differ, the tests check each one's own path: Firefox has no Keyboard Lock (so Esc in fullscreen leaves Focus session at once), no output-device picker, and no folder picker (so folders come in through the upload fallback). `window.bitCheer` gives the tests read-only access to the engine state, telemetry, mode, library and Focus state; `deckSnapshots` compares both decks so every action can prove it left the other deck alone. It covers:

- rendering, waveforms and accessible controls; no horizontal scrolling;
- keyboard control: both hands, focus rules, digits, Focus session and the help;
- real audio: samples, pitch changing tempo, instruments and the mixer; jog, scrubbing and CUE;
- skins: Skin studio, TOML, ZIP and WSZ imports, invalid skins, skins with controls painted on a picture, the three looks, and every word in the skin's lettering;
- modes: Foundation's two named kicks, the Loop builder's named loops and sounds, the twenty-voice composer, CHAOS!, tempo and track actions per deck;
- Pro decks: track pickers, local imports on either deck, folder browsing and its fallback, stale downloads, native tempo on track changes;
- practice: lessons and their unlocking, drills, Star mode and ★ Star runs, the lesson 8 handover, tap tempo;
- output routing: real multichannel graphs, mono decks, and a denied device change;
- workspace: hiding, removing and restoring modules per mode and deck, pitch sensitivity, and Focus session;
- hosting: the engine, catalog, skins and credits under the configured base path, and every bundled recording decoding to audible stereo of the right length.

## What the checks can't prove

- **Audio hardware.** The browser tests use Chromium's audio path without a sound card. Four- and six-channel routing is checked by rendering an `OfflineAudioContext`, and live two-channel routing with analysers; no physical multichannel interface or external mixer is involved. A browser can expose fewer channels than the operating system's driver, and the app offers only what the browser reports.
- **Microphone.** Capture and BPM detection are tested with synthetic signals; real microphones and rooms vary.
- **Codecs and tempo estimates.** Decoding follows the browser. Bundled BPMs and beat grids are estimates, flagged in `public/catalog.json` where a manual grid is recommended.
- **Looks.** Tests check measurable rules (the skin font everywhere, sprite offsets, no overflow, real images in every artwork slot), not taste. Visual changes still need a look with human eyes.
- **Speed.** Benchmarks measure this machine, not every device.
- **Other browsers.** CI runs Chromium; Firefox runs locally with `npm run test:e2e:firefox`. WebKit, Safari's engine, isn't run, so Safari-specific behavior is checked by hand.
