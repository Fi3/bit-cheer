# bit.cheer — Beatmatch Lab

An Elm beatmatching school with an efficient Rust/WebAssembly audio core and interchangeable early-2000s player skins. Everything needed for practice runs in the browser; personal tracks, microphone audio, progress, and custom skins stay on your device.

## Run locally

Requirements: Node.js 22.12+ (tested with 26), npm, Python 3 (model training/verification), and stable Rust.

```sh
rustup target add wasm32-unknown-unknown
npm ci
npm run dev
```

Open the local URL printed by Vite. `predev` compiles Elm and Rust/WASM first. After editing Elm, run `npm run build:elm`; after editing Rust, run `npm run build:wasm` and reload. Vite handles JavaScript and CSS updates.

```sh
npm run build       # production static site in dist/
npm run preview     # serve the production build
npm test            # native Rust, compiled WASM, workers, audio bridge, training, skins
npm run test:e2e     # real Chromium interaction and audio tests
```

Install Chromium with `npx playwright install chromium` if needed. The test config also accepts `PLAYWRIGHT_CHROMIUM_EXECUTABLE` and detects an existing local Playwright Chromium. To run browser tests against a production server, set `PLAYWRIGHT_BASE_URL` to its URL.

Serve `dist/` on HTTPS or localhost. AudioWorklet and optional microphone access require a secure context. Double-clicking `index.html` is insufficient. No server API or account is needed for local use.

## Practice

- **Foundation:** two kick drums, initially 120 and 124 BPM. Play both; move a pitch fader until drift stops, then nudge the beats together.
- **Loop builder:** start with kick and closed hat, then independently compose twenty instruments: kick, closed/open hats, snare, clap, bass, percussion, synth, shaker, ride, crash, rim, low/high toms, cowbell, conga, acid, chord, noise, and zap. Every active voice has level, pan, solo, and an editable sixteen-step pattern. **CHAOS!** builds a dense twelve-to-twenty-voice arrangement on that deck only.
- **By ear:** hide tempo, elapsed time, waveforms, and beat lights. Adjust pitch using your hearing.
- **Pro decks:** four licensed House/Techno practice recordings, local audio imports, editable source BPM, cue points, manual downbeat grid, looping, waveform seeking and zoom. Browse 574 original Beatmatch PRO catalog links by genre and obtain tracks from their artists before importing them.
- **Learning path:** eight sequential lessons from clean kicks through layered rhythms, hidden-BPM practice, and real-track transitions. A score of 85 unlocks the next lesson; the final lesson additionally requires a crossfader handover lasting at least three seconds while both decks play. Completion and the last 50 checks persist locally.
- **Training:** tempo-only, phase, blind, and 16-beat phrase drills. Phase/phrase challenges begin at equal tempos with a deliberate offset. Scores use recent playback history rather than a single coincidental alignment.

Scores measure BPM and beat-grid alignment; they do not evaluate musical taste or transition quality. Imported-track BPM is an estimate and may be half/double time: correct it and mark the first downbeat with **SET GRID** before relying on scores.

### Deck controls

Each deck has separate **Randomize tempo** and **Change track** buttons. Tempo changes keep its material and musical position; track changes preserve its effective BPM. Neither action alters the other deck. In Pro, Change track selects another eligible recording in the chosen genre. Fixed-tempo drills disable tempo randomization and provide a separate New challenge action.

Each deck has a large vertical pitch fader with ±2/4/8/16/32/50% ranges, 0.01% fine adjustment, temporary nudging, a jog wheel, play/pause, saved cue, volume, optional three-band EQ, waveform zoom, and actual signal-level meters. Foundation deliberately hides the composer and EQ. Master output has an equal-power crossfader, volume, a limiter, and split cue (A left, B right).

Hover or focus the pitch fader and scroll to adjust it; hold Shift for fine increments. **Focus deck A/B** opens only that deck with enlarged controls and requests native fullscreen where supported. Escape or Exit deck focus returns to both decks without resetting playback.

**Scroll a jog wheel** to temporarily accelerate/decelerate its deck. It returns to the pitch setting after 160 ms. **Drag a jog wheel** to scrub in source time; horizontal/right or upward movement moves forward. Arrow keys nudge a focused jog wheel; Home/End move to the start/end. Click/drag a waveform to seek; wheel or ± buttons zoom. Audio uses classic varispeed, so changing tempo also changes musical pitch.

Keyboard: Space plays/pauses both decks, or just the selected deck in focus view; A/B control a deck; left/right nudge B; T taps tempo. Input fields, native controls, modifier combinations, and focused jog wheels keep their own keyboard behavior. The help dialog supports Tab/Shift+Tab and Escape.

Tap tempo uses recent tap intervals and resets after a long pause. Optional microphone BPM uses continuous, downsampled audio captured by a separate AudioWorklet, analyzed locally in six-second windows. It never monitors the microphone to speakers, uploads audio, or starts without a click and browser permission.

## Audio architecture

```text
Elm model / view / update
        │ ports
        ▼
JavaScript browser bridge ── decodeAudioData / local files / storage
        │ controls + transferred PCM
        ▼
AudioWorklet → Rust/WASM dual-deck DSP → two stereo outputs
        │                                  │
        └─ telemetry → Elm                 └─ gain / cue routing / master limiter

Separate Worker → same Rust synth → accurate generated waveform previews
Microphone → silent capture worklet → local BPM analysis
```

Rust handles synthesis, stereo PCM interpolation and looping, cue/seek, tempo/pitch/bend, EQ, smoothing, and peak measurement. Its 128-frame render callback allocates no heap memory. WASM compilation occurs before the module enters the AudioWorklet. The UI receives telemetry about 19 times/second; waveforms draw at approximately 30 fps and skip hidden tabs. Audio rendering continues independently of the UI.

The generated rhythm model and its reproducible training corpus are included; run `npm run train:rhythms` to regenerate its probability tables. Sequence sampling happens when a loop is initialized, while Rust synthesizes sound during playback. This is a small local statistical model, not a neural music service or cloud API.

File decoding and onset analysis happen outside the render callback. Files are limited to 100 MB and 28.8 million decoded frames per deck (10 minutes at 48 kHz, 5 minutes at 96 kHz). Copying a large decoded track into WASM can briefly interrupt audio, so this app is a trainer rather than a live-performance promise. Format support follows your browser. A failed decode/load shows an error instead of announcing success.

See [engine/README.md](engine/README.md) for the complete ABI and performance benchmark command. Benchmarks are machine-specific, not a guarantee for every device.

## Separate hardware outputs

Open **Audio outputs** below the mixer to inspect the channel count reported by the current browser/audio device. Choose:

- **Stereo mix:** the usual software crossfader, stereo master, and optional split cue.
- **Separate mono channels:** choose one physical channel for A and a different channel for B (two or more exposed outputs). Each stereo deck is downmixed to mono.
- **Separate stereo pairs:** choose a separate pair for each deck, such as A → 1–2 and B → 3–4 (four or more exposed outputs). Each deck retains its left/right audio.

Hardware routing keeps deck volume, master volume, and EQ active; software crossfading and split cue are bypassed so you can mix on an external mixer. Routes cannot overlap or exceed the reported channel count. If a device change makes a route invalid, the app returns to the stereo mix.

Where supported, choose an output device in the panel or use the browser's device picker. Otherwise select the device in your OS audio settings and refresh outputs. Physical availability depends on what Web Audio exposes: an OS driver may have eight channels while a browser exposes only two. Bit Cheer reports the browser's real capacity and does not pretend to access unavailable channels. The app never requests microphone access just to enumerate outputs.

## Skins

The five native themes include the museum's first four entries as observed on 26 October 2026: **base-2.91**, **Winamp3_Classified_v5.5**, **Winamp5_Classified_v5.5**, and **Bento_Classified**. **Headspace · Alien Lime** recreates the supplied green-face reference using the HeadAMP adaptation's graphics. It was originally a Windows Media Player design.

The skins use original bitmap number fonts, transport buttons and title strips, with distinct native housings: Classic violet/gold bevels, square champagne Classified 3, rounded chrome/blue Classified 5, compact charcoal Bento, and Headspace's large green face with purple controls. These are functional two-deck adaptations. Skin studio shows the original previews and keeps author credits.

Download the template ZIP in Skin studio, edit `skin.toml`, and optionally add graphics:

```toml
version = 1
name = "My midnight session"
base = "classic" # classic | classified3 | classified5 | bento | alien

[colors]
background = "#151719"
panel = "#292c32"
panelLight = "#41464f"
text = "#e4e6e3"
muted = "#969c9c"
accent = "#b8ee75"
secondary = "#e3aa60"
screen = "#10160f"
border = "#555a62"

# Optional images inside the same ZIP:
# [assets]
# panel = "graphics/panel.png"
# titlebar = "graphics/titlebar.png"
# background = "graphics/background.png"
# frame = "graphics/frame.png"
# buttons = "graphics/cbuttons.png" # Winamp 136 x 36 transport atlas
# numbers = "graphics/numbers.png" # Winamp 99 x 13 or 108 x 13 atlas
# platter = "graphics/platter.png"
# pitch = "graphics/pitch-panel.png"
```

Import a standalone `.toml`, a ZIP containing `skin.toml` plus PNG/JPEG/WebP/BMP assets, or a classic Winamp 2 `.wsz`. The optional `base` selects the housing and control shapes; omitted colors inherit that base. WSZ import preserves original MAIN, CBUTTONS, NUMBERS and TITLEBAR graphics and derives a matching palette. Modern `.wal`/`.wac` files are not supported as arbitrary imports; the included Headspace theme is integrated explicitly. Imports validate colors, paths, image dimensions and number atlases, reject remote image URLs, and limit archive expansion. No custom script or CSS executes. The last selected/custom skin persists in local storage subject to the browser's quota.

## Reference materials and licenses

See [docs/REFERENCES.md](docs/REFERENCES.md) and the app's [credits page](public/credits.html) for sources, authors, track licenses, excerpt changes, and the exact skin selection. Beatmatch PRO recordings are not redistributed: its catalog links are reused, while the four included playable excerpts are separately licensed CC BY 3.0 recordings. Original skin assets retain their original copyrights. Bundled Google Fonts use the SIL Open Font License; license texts are in `public/fonts/`.

Original application code is MIT licensed. Imported media belongs to its respective owner.
