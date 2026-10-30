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

For a GitHub Pages project site, follow [the deployment guide](docs/GITHUB-PAGES.md). The included workflow builds the static app with the repository subpath; audio, workers, tracks, skins and credits use that same base path. Adding the workflow does not publish or push a repository automatically.

## Practice

- **Foundation:** two kick drums, initially 120 and 124 BPM. Play both; move a pitch fader until drift stops, then nudge the beats together.
- **Loop builder:** start with kick and closed hat, then independently compose twenty instruments: kick, closed/open hats, snare, clap, bass, percussion, synth, shaker, ride, crash, rim, low/high toms, cowbell, conga, acid, chord, noise, and zap. Every active voice has level, pan, solo, and an editable sixteen-step pattern. **CHAOS!** builds a dense twelve-to-twenty-voice arrangement on that deck only.
- **By ear:** hide tempo, elapsed time, waveforms, and beat lights. Adjust pitch using your hearing.
- **Pro decks:** two independent track pickers sit below the decks. Choose a genre and playable recording for each deck, then load it explicitly; option labels show track titles without BPM hints. Forty licensed practice recordings span House, Techno, Trance, Drum & Bass, Breakbeat, Electro, Dubstep, Hip Hop, Downtempo and Hardcore. Each is a 128-beat stereo excerpt, with an estimated BPM and source credit. Import your own audio once and reuse it from either deck's library during the session. **📁 Browse folder** opens a music folder on your device: walk its subfolders, filter by name and click an audio file to load it into that deck. The other deck reuses the same folder without asking again. Folder tracks are read from disk each time they load, so they never fill the session's 256 MB import memory. Chromium browsers read files lazily through the folder picker; other browsers fall back to a folder upload dialog. Nothing is uploaded anywhere. Optional controls provide source BPM, cue points, beat-grid calibration, looping and waveform navigation. The secondary discovery section links to 574 original Beatmatch PRO catalog entries; obtain those recordings from their artists before importing them.
- **Learning path:** eight sequential lessons from clean kicks through layered rhythms, hidden-BPM practice, and real-track transitions. A score of 85 unlocks the next lesson; the final lesson additionally requires a crossfader handover lasting at least three seconds while both decks play. Completion and the last 50 checks persist locally.
- **Training:** tempo-only, phase, blind, and 16-beat phrase drills. Phase/phrase challenges begin at equal tempos with a deliberate offset. Scores use recent playback history rather than a single coincidental alignment.
- **Star mode:** session 04, a 60-second endurance run on generated loops. Like real turntables, each deck's speed drifts slightly on its own (up to ±1%, hidden from the pitch faders and BPM readouts), so a match never stays put. The BPM screen and pitch fader do not change when a deck drifts: you hear it, you don't see it. Keep correcting with pitch and nudge; a live meter in the Coach panel shows whether you are locked. The rating combines how long the decks stayed in sync (within 25 ms and 0.3 BPM) with how close they were overall. The clock and drift pause whenever a deck stops; **Finish the run** ends it early after 10 seconds, and **New run** starts over. In **Pro decks**, the **★ Star run** button starts the same run on your loaded tracks.

Scores measure BPM and beat-grid alignment; they do not evaluate musical taste or transition quality. Imported-track BPM is an estimate and may be half/double time: correct it and mark the first downbeat with **SET GRID** before relying on scores.

### Deck controls

Each deck has permanently integrated transport controls: play/pause, cue and the other deck actions remain available even when every optional module is removed. Each deck also has separate **Randomize tempo** and **Change track** buttons. Tempo changes keep its material and musical position. Change track, Next, Previous, Load and import reset pitch to 0%, so the new track plays at its own native BPM. Neither action alters the other deck. In Pro, Change track selects another recording in the chosen genre; Next/Previous browse the same genre. Change/Next/Previous retain playing or paused state, while explicit Load/import starts paused. Fixed-tempo drills disable tempo randomization and provide a separate New challenge action.

Each deck supports a large vertical pitch fader with ±2/4/8/16/32/50% ranges, fine adjustment, temporary nudging, a jog wheel, play/pause, saved cue, volume, three-band EQ, waveform zoom, and actual signal-level meters. Foundation remains a kick-only exercise. Optional master modules provide an equal-power crossfader, volume, and split cue (A left, B right); the audio output includes a limiter.

Hover or focus a pitch fader and scroll to adjust it. Fine, Normal and Coarse sensitivity use 0.01, 0.05 and 0.25 percentage-point wheel/key increments. Pixel, line and page wheel events are normalized; fractional trackpad movement is retained. Shift always uses a 0.01-point increment. Arrow keys adjust by one increment and Page Up/Down by ten. **Focus** shows both decks with only pitch, volume and separate, clearly labeled Play and Pause buttons, and requests native fullscreen where supported. Escape or Exit restores the normal workspace without resetting playback or the saved module layout.

### Build your workspace

The initial layout keeps the essentials visible. Use each module's **Hide/Open** control to collapse or expand it, **×** to remove it, and the **Add** menu to restore it. Each deck has separate screen, pitch, waveform, jog, volume, VU, composer, EQ, loop and track picker modules where appropriate to its mode. Crossfader, master, monitor, audio outputs, coach, tap tempo and external discovery are shared modules. Each mode remembers its own collapsed/removed choices on this device. Transport stays fixed; Foundation starts with screen, pitch and volume modules on each deck; Builder/By ear add the composer, and Pro adds its track picker. Crossfader, master and coach are the shared defaults. Hiding or removing a control changes the layout without resetting its settings or stopping its audio.

**Scroll a jog wheel** to temporarily accelerate/decelerate its deck. It returns to the pitch setting after 160 ms. **Drag a jog wheel** to scrub in source time; horizontal/right or upward movement moves forward. Arrow keys nudge a focused jog wheel; Home/End move to the start/end. Click/drag a waveform to seek; wheel or ± buttons zoom. Audio uses classic varispeed, so changing tempo also changes musical pitch.

Keyboard: Space plays/pauses both decks, including in Focus; A/B control a deck; left/right nudge B; T taps tempo. Input fields, native controls, modifier combinations, and focused jog wheels keep their own keyboard behavior. The help dialog supports Tab/Shift+Tab and Escape.

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

File decoding and onset analysis happen outside the render callback. Imported files are limited to 100 MB and folder tracks to 300 MB (enough for hi-res FLAC), and every track to 28.8 million decoded frames per deck (10 minutes at 48 kHz, 5 minutes at 96 kHz). Copying a large decoded track into WASM can briefly interrupt audio, so this app is a trainer rather than a live-performance promise. Format support follows your browser; MP3, WAV, FLAC (including 24-bit/96 kHz), Ogg/Opus and AAC/M4A decode in current Chromium, Firefox and Safari. A failed decode/load shows an error instead of announcing success.

See [engine/README.md](engine/README.md) for the complete ABI and performance benchmark command. Benchmarks are machine-specific, not a guarantee for every device.

## Separate hardware outputs

Choose **Audio outputs** from **Add session module** to inspect the channel count reported by the current browser/audio device. Choose:

- **Stereo mix:** the usual software crossfader, stereo master, and optional split cue.
- **Separate mono channels:** choose one physical channel for A and a different channel for B (two or more exposed outputs). Each stereo deck is downmixed to mono.
- **Separate stereo pairs:** choose a separate pair for each deck, such as A → 1–2 and B → 3–4 (four or more exposed outputs). Each deck retains its left/right audio.

Hardware routing keeps deck volume, master volume, and EQ active; software crossfading and split cue are bypassed so you can mix on an external mixer. Routes cannot overlap or exceed the reported channel count. If a device change makes a route invalid, the app returns to the stereo mix.

Where supported, choose an output device in the panel or use the browser's device picker. Otherwise select the device in your OS audio settings and refresh outputs. Physical availability depends on what Web Audio exposes: an OS driver may have eight channels while a browser exposes only two. Bit Cheer reports the browser's real capacity and does not pretend to access unavailable channels. The app never requests microphone access just to enumerate outputs.

## Skins

The default skin is **Millennium Chrome**, an original bit.cheer skin: brushed chrome, cobalt LCDs and a lime glow. It is a complete classic Winamp 2 skin (`public/skins/millennium.wsz`: main window, title bars, transport, digits, lettering, sliders, equalizer, playlist frame, generic buttons, colors and window shape), drawn pixel by pixel by `scripts/make-millennium-skin.mjs` with no third-party art. Skin studio offers it for download; it also loads in Winamp and Webamp. For now it is the only built-in skin. A previously chosen custom skin is restored on reload; older built-in choices switch to Millennium Chrome.

**Any skin from the [Winamp Skin Museum](https://skins.webamp.org/)** can be loaded from Skin studio: copy the skin's address, for example `https://skins.webamp.org/skin/5ea2d974dad5507b83a6ddff7003a8ee/Yufo06.wsz`, paste it and press **Load skin**. The app reads the skin id from the link and downloads the `.wsz` from the museum's file server (`r2.webampskins.org`, which allows cross-origin requests), so bit.cheer never hosts those skins.

Winamp skins (Millennium Chrome and imports alike) dress every control through a *kit* built at import time (`src/skin-kit.js`):

- The page sits on Winamp's own grid: each deck is the skin's live main window docked on a playlist-style console of the same 275-pixel width, and the header, mixer and footer span exactly the two decks. In the console, the screen (BPM, source tempo and pitch), transport and volume sit beside the pitch fader; extra modules span the console below. Modules wear the playlist's "shaded" bar as a header; its two little buttons fold and remove the module, and the add-module menu sits at the foot of each window. "Play both decks" is at the top of the page, and the coach (with the Foundation steps) lives in the mixer window.
- Controls use the skin's own sprites at whole-pixel scale: transport (CBUTTONS), the pitch fader and EQ bands (equalizer sliders), volume (VOLUME), crossfader (seek bar), toggles (equalizer ON button, REPEAT for loop), digits (NUMBERS), window frames (PLEDIT) and generic buttons (the playlist's own menu buttons when they are real rectangular buttons, else GENEX, else a bevel in the skin's colors). When a skin's ON button is a picture rather than a light, toggles become a small switch in the skin's colors.
- The skin's TEXT.BMP becomes a real web font (`src/pixel-font.js`), so labels are set in its own pixel lettering. Colors come from `pledit.txt`, `viscolor.txt` and the bitmaps, with contrast checks.
- The main window is live: time, scrolling title, BPM and pitch, a real spectrum analyser or oscilloscope from the deck's audio (click it to switch), and `region.txt` window shapes. Its buttons work: play/pause/stop, previous/next nudge, eject changes track (imports a file in Pro), shuffle randomizes tempo, repeat toggles loop, EQ opens the equalizer module, PL shows or hides the console, and clicking the time shows remaining time.
- Skins drawn for Winamp's main window don't always survive being cut into separate controls, so the importer adapts them:
  - Some skins paint their transport icons straight onto a picture in the main window (Excel Saga). For those, the console's buttons become the skin's own generic button with the skin's icon or label, or a clear symbol when the icon doesn't read.
  - Look-alike buttons (orbs, domes) get a symbol.
  - Volume and seek bars that are only a piece of the picture become a plain groove in the skin's colors.
  - Lettering drawn in two inks (red letters, white digits) keeps both.

  The live main window always shows the skin's original art.
- Like Winamp, the importer accepts real-world variations (odd sheet sizes, nested folders, RLE bitmaps, upper/lower case names). As in Winamp, a skin without a balance slider uses its volume slider; anything else a skin leaves out comes from Millennium Chrome.

The earlier museum-based themes (base-2.91, Classified 3/5, Bento, Headspace) are still in the code and `public/skins/`, but are not selectable.

A user-facing guide lives at [public/skin-guide.html](public/skin-guide.html) (linked from Skin studio).

Download the template ZIP in Skin studio, edit `skin.toml`, and optionally add graphics:

```toml
version = 1
name = "My midnight session"
base = "millennium" # millennium (recommended) | classic | classified3 | classified5 | bento | alien

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

Import a standalone `.toml`, a ZIP containing `skin.toml` plus PNG/JPEG/WebP/BMP assets, or a classic Winamp 2 `.wsz`. The optional `base` selects the housing and control shapes; omitted colors inherit that base. A `.wsz` builds a full kit as described above. Modern `.wal`/`.wac` files are not supported as arbitrary imports; the included Headspace theme is integrated explicitly. Imports validate colors, paths, image dimensions and number atlases, reject remote image URLs, and limit archive expansion. No custom script or CSS executes. The last selected/custom skin persists in local storage subject to the browser's quota.

## Reference materials and licenses

See [docs/REFERENCES.md](docs/REFERENCES.md) and the app's [credits page](public/credits.html) for sources, authors, track licenses, excerpt changes, and the exact skin selection. Beatmatch PRO recordings are not redistributed: its catalog links are reused, while the forty included playable excerpts are separately licensed CC BY 3.0 recordings. Each excerpt is phase-aligned where possible and re-encoded to 160 kbps stereo MP3. BPMs and beat grids are estimates, with confidence/manual-calibration flags in the catalog; they are not artist-verified tempo guarantees. Original skin assets retain their original copyrights. Bundled Google Fonts use the SIL Open Font License; license texts are in `public/fonts/`.

Original application code is MIT licensed. Imported media belongs to its respective owner.
