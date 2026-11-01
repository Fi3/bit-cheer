# bit.cheer: guide for agents

bit.cheer is a two-deck beatmatching school that runs entirely in the browser: an Elm UI, a JavaScript bridge to the browser's APIs, and a Rust/WebAssembly audio engine inside an AudioWorklet, all dressed in real Winamp 2 skins. It is a static site, live at <https://bit-cheer.com>, deployed from `main` by GitHub Actions.

Read this file before changing anything. It holds the rules, the commands, the architecture, and a map from tasks to the files and docs they touch.

## Ground rules

- **Branches** use CamelCase names (`KeyboardControl`, `ChillSoundsAndLoops`). Start each one from a fresh `main`: `git fetch origin && git switch -c MyBranch origin/main`.
- **Never use git worktrees, for any reason.** Don't run `git worktree`, and don't use any tool or agent option that creates a worktree (such as an isolated-worktree mode for subagents). All work happens in this checkout, on a branch.
- **Grounding.** When you describe or change behavior, name the files and symbols, and follow the chain that makes it true (button → `Msg` → `update` → port command → `src/main.js` → `src/audio.js` → worklet → engine). If you are not sure, read more code; don't guess.
- **Keep the vibe: cool, chill and cute.** Generated things get short, evocative names, never numbers ("Lemon Haze", "Low Tide", kicks "Velvet" and "Pillow"). Default tempos and sounds stay mellow. App copy and notices are warm and a little playful ("Easy, superstar…"). Strawberry Mochi is the cute skin: pastel and playful.
- **The skin owns everything.** The Winamp-skinned layout is the design baseline. Every word on a skinned page uses the skin's pixel font (`var(--k-pixel)` at `var(--k-text)`, whole-pixel line heights). Every button the page draws must work; if it can't, don't draw it. Dropdowns open the skin's own list (`src/skin-select.js`). Confirm any large visual change with the owner before building it.
- **Reuse and keep it small.** Use the existing module for a job before writing a new one. Keep functions small and module interfaces simple. Formatters own the layout; otherwise follow the conventions of the file you're in.
- **Local first.** No server, accounts or analytics. The app fetches only its own assets and, when the user asks, a Winamp Skin Museum skin. Imported tracks, microphone audio, progress and custom skins never leave the device. Runtime dependencies are `fflate` and `smol-toml`; add another only for a strong reason.

## Commands

Node.js 22.12+ (CI uses 22), Python 3, and rustup. rustup reads `rust-toolchain.toml` and installs Rust 1.94.1 with rustfmt, clippy and the `wasm32-unknown-unknown` target by itself.

| Command | What it does |
| --- | --- |
| `npm ci` | Install the locked dependencies, including the Elm compiler and the linters. |
| `npm run dev` | Build the WASM engine and the Elm app, then start Vite. JS and CSS reload live; after editing Elm run `npm run build:elm`, after Rust `npm run build:wasm`, then reload. |
| `npm run build` | Production site in `dist/`. `VITE_BASE_PATH` sets the base path ([docs/GITHUB-PAGES.md](docs/GITHUB-PAGES.md)). |
| `npm run preview` | Serve the production build. |
| `npm run fmt` | Format everything: `fmt:rust` (rustfmt), `fmt:elm` (elm-format), `fmt:js` (Prettier). |
| `npm run lint` | `lint:rust` (rustfmt check, clippy for native and wasm32 with warnings denied), `lint:elm` (elm-format check, elm-review), `lint:js` (Prettier check, ESLint). |
| `npm test` | Rhythm-model check, WASM build, Rust tests, and the Node unit tests, including the docs checks. |
| `npm run test:e2e` | The Playwright suite in Chromium against the dev server. |
| `npm run test:e2e:firefox` | The same suite in Firefox, locally only (install it once with `npx playwright install firefox`). |
| `npm run check` | `lint` and `test` together: the gate for every commit. |
| `npm run train:rhythms` | Retrain `engine/src/rhythm_weights.rs` from `docs/rhythm-corpus.json`. |

## Before every commit

1. Run `npm run fmt`, then `npm run check`. Both must pass with no warnings. Fix any warning or lint finding you meet, including old ones; don't silence a rule without a comment that says why.
2. Run `npm run test:e2e` when the change affects anything the browser does: UI, audio, skins, keys, layout or storage. CI runs it on every pull request anyway.
3. Update the docs in the same commit ([Documentation](#documentation)).

If Chromium crashes locally with "Target crashed" or "Page crashed", the usual cause is a full temp folder, not the app: run Playwright with `TMPDIR` pointing to a folder on disk.

## Architecture

```text
index.html ─ public/elm.js (compiled Elm, classic script) + src/boot.js (module)
                │
                ├─ phone? ──► src/mobile-gate.js ("PC only" screen; "Load anyway (no refunds)" loads the app)
                ▼
src/main.js ── applies the saved skin, starts Elm with flags, owns every browser API
   ▲   │ ports: Elm `command` ──► handle(command)        (src/main.js)
   │   │        Elm `incoming` ◄── send({ type, … })      (src/main.js, src/audio.js)
   │   ▼
src/Main.elm ── the UI and the rules (modes, lessons, modules, help, key actions)

src/audio.js (AudioEngine) ── AudioContext graph: deck gains, crossfader, split cue, master, limiter, hardware routes
   │ postMessage: set / randomize / load / voice / reset          ▲ ready, loaded, telemetry (~19/s), patterns, error
   ▼                                                              │
public/audio-worklet.js ── AudioWorkletNode 'bit-cheer-engine', 2 stereo outputs
   └─ public/engine.wasm (Rust, engine/src) ── both decks: synth voices, PCM player, EQ, limiter
public/waveform-worker.js ── its own engine instance renders generated-loop waveforms
public/mic-worklet.js ── silent microphone capture for local BPM detection (src/training.js)
```

### Startup

1. `index.html` loads `public/elm.js` (the compiled Elm program) and the module `src/boot.js`. `boot.js` sends phones to `src/mobile-gate.js` (`?mobile=1` previews it, `?mobile=0` skips it) and imports `src/main.js` otherwise.
2. `src/main.js` imports all CSS, restores the saved skin and look from storage, builds the kit of the built-in skin it starts on (`prepareBuiltinSkin`, waiting at most 2.5 s), applies the skin, installs the skinned dropdowns, and starts Elm with flags: `basePath`, `kit` (whether a Winamp kit is active), `render` (the look), and the instrument and loop names from `src/instruments.js` and `src/loops.js`.
3. It then subscribes to Elm's `command` port, fetches `public/catalog.json`, restores the module layout and learning progress, and installs the global keyboard, wheel and pointer handlers, the waveform draw loop and the live Winamp windows. Two seconds after the page shows its look, it builds the other built-in skins (`prepareBuiltinSkins`); choosing one sooner builds it on the spot.
4. The `AudioEngine` constructor fetches and compiles `public/engine.wasm` right away (and starts the waveform worker with it). The `AudioContext` itself starts lazily, on the first user action that needs audio (`AudioEngine.ensure`): it adds the worklet with the compiled module and builds the graph.

### Elm app: `src/Main.elm`

One module. `Model` holds the page (`Page`: Practice, Learning, Training, Skins), the mode (`foundation`, `builder`, `blind`, `star`, `pro`), a mirror of each `Deck`, mixer and routing state, the per-mode module layouts, lesson progress and history, the Star run, the skin and look, the track catalogs, folder listings, and the help dialog.

- `update` handles every `Msg`. Commands to the bridge go through `send "<type>" [fields]` (and `set` for deck parameters); persistence goes through `persist`.
- `receive` decodes the bridge's events by `type`. Anything the audio side decides (track names, BPMs after a change, telemetry, voice patterns, load results, routing) arrives as an event, and Elm applies it: a track load or track change counts only once its event arrives.
- `keyAction` turns a key event into the same `Msg` as the button it stands for, under the same rules. `keyContext` renders `data-keys` on the app shell (`practice`, `focus`, `page`, `help`), which tells `src/main.js` which keys are live.
- Views: `view` → `normalView` / `focusView`; `practiceView` lays out `deckView` per deck (the live Winamp window, the console with permanent `transportView`, and `playerModule` windows) plus `globalModulesView` (crossfader, master, monitor, outputs, coach, tap, discovery). `trackPickerView` and `loopPickerView` sit under the decks. Other pages: `learningView` (the eight `lessons`), `trainingView` (drills), `skinsView` (Skin studio), and `helpView` / `keyboardMap` (keyboard help).
- Modules: `deckModuleNames`, `globalModuleNames`, `defaultModuleLayout`, `availableModules` and `changeModules` define which windows each mode has and how Hide / × / Add change them; `persistLayout` sends the layout to the bridge for storage.

### The ports

Elm sends JSON commands on `command`; `handle(command)` in `src/main.js` switches on `type` (`set`, `cue`, `nudge`, `mode`, `lesson`, `drill`, `changeTrack`, `loadTrack`, `loadLoop`, `voice`, `chaos`, `check`, `skin`, `importSkin`, `routing`, `layout`, `persist`, …). The bridge sends events on `incoming` through `send({ type, … })`: `telemetry`, `deckChanged`, `track`, `randomized`, `voices`, `catalog`, `referenceCatalog`, `folderListing`, `result`, `star`, `skin`, `notice`, `error`, `key`, and so on; `receive` in Elm decodes each one. Every type has exactly one sender and one reader: when you add a message, add both sides in the same change; when you remove one, remove both.

### JavaScript bridge: `src/main.js` and its modules

`src/main.js` is the glue. It holds the browser-side session (telemetry history for scoring, the Star run timer, held keys, drag state, the folder in use), executes Elm's commands, and draws the waveforms (about 30 fps, skipped in hidden tabs). `window.bitCheer` exposes read-only state (`audio`, `telemetry`, `mode`, `library`, `focus`) for the browser tests. Storage goes through `store` / `restore`, which never throw.

| Module | Job |
| --- | --- |
| `src/audio.js` | `AudioEngine`: the AudioContext graph, the worklet and waveform worker, each deck's state (`state`), generated material (seeds, voices, named loops, CHAOS), PCM loading (fetch or file → `decodeAudioData` → transferred `load`), tempo and track actions, and hardware output routing. |
| `src/training.js` | Pure logic: `matchScore` (tempo, phase and phrase from playback history), `tapTempo`, `estimateTempo` (BPM for imports and the microphone), waveform peaks, and Star mode (`STAR`, `createStar`, `stepDrift`, `stepScore`, `starResult`). |
| `src/instruments.js` | The twenty voices in engine order and each one's named sounds; `engine/src/sounds.rs` must offer the same counts. |
| `src/loops.js` | The 24 named chill loops (`LOOPS`): seed, voices, sounds, levels, pans, home tempo. |
| `src/library.js` | `SessionLibrary` (bundled tracks plus session imports, 100 MB per import, 256 MB per session, folder tracks up to 300 MB and never cached) and `DeckSelections` (stale-load protection per deck). |
| `src/folder-browser.js` | Folder browsing: the File System Access API where available, a folder `<input>` elsewhere. |
| `src/output-routing.js` | Validates hardware channel routes and builds the discrete multichannel graph. |
| `src/layout.js` | Validates and migrates stored module layouts (`DECK_MODULES`, `GLOBAL_MODULES`, `LAYOUT_VERSION`). |
| `src/pitch-control.js` | Wheel and key pitch steps (Fine 0.01, Normal 0.05, Coarse 0.25 points; Shift always 0.01). |
| `src/keyboard.js` | The key map (`BINDINGS`), focus rules (`controlKeeps`), `shortcutFor`, and the hold-to-bend and crossfader-glide constants. |
| `src/assets.js` | `assetUrl` and `BASE_PATH`, so every asset URL works under a GitHub Pages subpath. |
| `src/boot.js`, `src/mobile-gate.js` | Phone detection and the retro "PC only" screen (with its little game). |

### Audio: Rust engine, worklet and worker

- `engine/src/lib.rs`: `Engine` holds two `Deck`s. Each deck plays either a generated loop (`Synth`: twenty voices driven by the rhythm model) or decoded stereo PCM (interpolated, looped or stopping at the end), then applies gain smoothing, a three-band `Biquad` EQ, and a soft safety limiter (smooth above 0.8, never past 1). The Web Audio graph in `src/audio.js` adds a master limiter (a `DynamicsCompressorNode`) after the mix. `Deck::set` maps parameter IDs (play, bpm, pitch, elements, nudge, seek, cue, setCue, EQ, gain, source, loop, beatOffset, bend, drift). The `engine_*` functions are the C ABI the worklet calls.
- `engine/src/sounds.rs`: every voice's sound versions (`SOUND_COUNTS`, `CHORDS`, `tone`, `frequency`). `engine/src/rhythm_model.rs` samples sixteen-step patterns from `engine/src/rhythm_weights.rs`, the Markov tables that `scripts/train-rhythm-model.py` learns from `docs/rhythm-corpus.json`.
- The 128-frame render path allocates nothing and never calls JavaScript. Release builds use `panic = "abort"`, so clamp and validate inputs instead of panicking.
- `public/audio-worklet.js` validates messages, calls the ABI, copies four output planes into two stereo outputs, and posts telemetry every 20 render quanta. Parameter names map to IDs in `PARAMS`.
- [engine/README.md](engine/README.md) is the full ABI: messages, parameters, telemetry, raw exports, and the voice bank.

### Music

- **Generated loops.** A loop is a seed, a BPM, an element mask and per-voice settings (gain, pan, sound, optional sixteen-step pattern). The engine generates the rhythm from the seed when the loop starts and synthesizes it live. Foundation is kick-only, with two different kicks on the two decks. The Loop builder, By ear and Star mode use the named loops in `src/loops.js` and the composer.
- **Real tracks.** `public/catalog.json` lists the 40 bundled CC BY 3.0 excerpts (`tracks`, files in `public/tracks/`) and 574 Beatmatch PRO discovery links (`referenceTracks`). Imports and folder files go through `SessionLibrary`; decoding happens on the main thread, and the PCM is transferred to the worklet. `scripts/prepare-library.py` rebuilds the excerpts from their sources.

### Skins

- `src/skins.js` holds the themes. `SELECTABLE_SKINS` (the picker) lists only the two original skins, Millennium Chrome (`DEFAULT_SKIN`) and Strawberry Mochi. Both are real Winamp 2 skins (`public/skins/millennium.wsz`, `public/skins/mochi.wsz`) painted by `scripts/skin-painter.mjs` through `scripts/make-millennium-skin.mjs` and `scripts/make-mochi-skin.mjs`. The museum themes (`classic`, `classified3`, `classified5`, `bento`) and Headspace (`alien`) are legacy: they stay in `themes` and `public/skins/`, and a `skin.toml` can still name them as its `base`, but the picker doesn't offer them.
- **Imports.** `importSkin` accepts a `.toml`, a `.zip` with `skin.toml` and images, or a classic `.wsz`. `importSkinFromUrl` loads museum links through `museumSkinUrl`. Validation rejects unsafe colors, paths, sizes and archives; no imported script or CSS ever runs. The TOML reader (`smol-toml`) loads only when a skin file is imported.
- **Kits.** `buildKit` in `src/skin-kit.js` turns a `.wsz` into a kit: sprite sheets, cut pieces, colors (`pledit.txt`, `viscolor.txt`, contrast-checked), the `region.txt` window shape, and a pixel font built from `TEXT.BMP` by `src/pixel-font.js`. `applySkin` sets `data-skin` and `data-layout` on `<html>` (`kit` when a kit is active, otherwise the legacy layout of the theme's base) and the theme colors as CSS custom properties. For a kit, `applyKit` writes every kit color and image as a `--k-*` property into `<style id="bit-cheer-kit">`, and `src/kit.css` draws the page from those properties.
- **Looks.** `src/skin-enhance.js` prepares Original pixels, Comfort (gentler colors in OKLab, calmer texture) and Comfort + HD (Scale2x-based 4× art and smoother lettering) from the stored kit each time a skin appears; `applyRenderedKit` shows the result. The stored kit never changes. Nothing waits for a look: `refineSkin` in `src/main.js` puts the skin's own pixels on screen first, the live windows included, starts the look only once those windows show, and swaps it in when it's ready. The pixel loops read neighbours from lookup tables and skip spots that a blend would leave unchanged; `tests/skin-enhance.test.mjs` holds them to the plain rules pixel for pixel.
- **Live windows.** `src/winamp-live.js` draws each deck's working Winamp main window on a canvas (time, title, BPM, spectrum or oscilloscope, buttons, shade mode). Its sheets are decoded off the page's thread before they're drawn, and `setSkin` resolves once every window shows the new skin. `src/skin-select.js` draws every open dropdown in the skin.
- **CSS**, imported in this order by `src/main.js`: `src/style.css` (base, variables, pages; imports `src/fonts.css`), `src/winamp.css` (legacy native chrome), `src/skin-variants.css` (legacy Classified, Bento and Headspace layouts), `src/session.css` (module grid, two-deck session, Focus session), `src/module-skins.css` (module windows docked on the player), `src/lcd.css` (deck screens), `src/skin-studio.css` (Skin studio), `src/kit.css` (everything under `data-layout="kit"`, the look the app normally runs in). `src/mobile-gate.css` belongs to the phone screen. The CSS is hand-written in a compact style and isn't run through a formatter; scope new rules by `data-layout` and `data-skin`.

### Keyboard

Keys are matched by position (`KeyboardEvent.code`). The `keydown` handler in `src/main.js` reads `data-keys`, asks `controlKeeps` whether the focused control keeps the key, maps it with `shortcutFor`, and sends `{ type: 'key', action, … }` to Elm, where `keyAction` runs the button's own `Msg`. Held nudges (bend) and crossfader glides run in `src/main.js` straight on the engine. [docs/KEYBOARD.md](docs/KEYBOARD.md) is the specification, and its key table is tested against `BINDINGS`.

### Practice logic

- **Checking a match:** Elm sends `check`; the bridge needs at least three seconds of both decks playing, scores the recent telemetry with `matchScore` (with the drill's rules), and sends `result`. Lessons pass at 85; lesson 8 also needs a crossfader handover of at least three seconds.
- **Star mode:** `startStar` ticks every 100 ms. While both decks play, each tick advances the run clock, drifts each deck's speed through the engine's hidden `drift` parameter (`stepDrift`), scores held sync (`stepScore`), and sends a `star` update.
- **Learning and training:** `lessons` and the drills live in Elm; `lesson`, `drill`, `mode` and `newChallenge` commands reconfigure both decks in `configure` (`src/main.js`). Progress and the last 50 checks are saved with `persist`.

### What the app stores

`localStorage`, always through `store` / `restore` or a `try` block: `bit-cheer-skin` (chosen or custom skin, with its kit), `bit-cheer-render` (look), `bit-cheer-layout` (module layouts and pitch sensitivity), `bit-cheer-progress` (lessons and history), `bit-cheer-console-hidden`, `bit-cheer-main-shade`, `bit-cheer-vis`, `bit-cheer-time` (live window preferences), and `bit-cheer-snake-high` (the phone screen's game). `sessionStorage`: `bit-cheer-mobile-bypass`. A new key needs a validating reader and an entry in [docs/UI.md](docs/UI.md) ("What the app remembers") and in the manual.

### Build, CI and deployment

- `npm run build:wasm` compiles the engine for `wasm32-unknown-unknown` and `scripts/copy-wasm.mjs` copies it to `public/engine.wasm`; `npm run build:elm` writes `public/elm.js`; Vite bundles `src/` and copies `public/` into `dist/`. `vite.config.js` reads `VITE_BASE_PATH` and `BUILD_OUT_DIR`, minifies the copied `elm.js`, and adds preload hints to `index.html` for `src/main.js`, its CSS and `public/skins/millennium.wsz`, so they download alongside `elm.js` instead of one after another.
- `.github/workflows/ci.yml` runs on every pull request: `npm run lint` and `npm test` in one job, the Playwright suite in Chromium in another. Firefox runs locally only (docs/TESTING.md explains why).
- `.github/workflows/deploy.yml` runs on every push to `main` (a merged pull request): it calls the same CI, builds the site for the Pages base path, and deploys it to GitHub Pages. A failing check stops the deploy. `.github/workflows/pages-diagnostics.yml` is a manual check of the custom domain's DNS and HTTPS.
- `.github/dependabot.yml` opens one grouped update pull request a month for the GitHub Actions and one for npm; CI checks them like any other.
- `.editorconfig` gives editors the formatters' basics (UTF-8, LF, final newline, 2 spaces, 4 for Elm, Rust and Python). `.git-blame-ignore-revs` lets `git blame` skip the Prettier formatting commit; run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once to use it locally.
- Tool configuration: `rust-toolchain.toml`, `engine/Cargo.toml` (release profile: LTO, `panic = "abort"`), `eslint.config.js`, `.prettierrc.json`, `review/src/ReviewConfig.elm` (elm-review rules), `elm.json`, `package.json`, `playwright.config.js`.

### Tests

[docs/TESTING.md](docs/TESTING.md) lists every suite and what it covers. In short: Rust unit tests at the bottom of `engine/src/lib.rs`; Node tests for each module in `tests/*.test.mjs` and for the compiled WASM in `engine/tests/*.test.cjs`; `tests/docs.test.mjs` for the docs; and `tests/e2e.spec.js`, which drives the real app with real audio in Chromium (and in Firefox on request).

## Where to change what

| Task | Code | Also update |
| --- | --- | --- |
| A new control or behavior on screen | `src/Main.elm` (`Msg`, `update`, the view), the bridge if it needs the browser or audio | docs/UI.md, public/manual.html, an e2e test |
| A new port message | `send` + `receive` in `src/Main.elm`, `handle` + `send` in `src/main.js` | the architecture notes above if it adds a concept |
| A key | `BINDINGS` in `src/keyboard.js`, `keyAction` (and `helpView` / `keyboardMap`) in `src/Main.elm`, `flashTargets` (the glow) in `src/main.js` | docs/KEYBOARD.md (prose and key table), public/manual.html |
| An engine parameter | `Deck::set` in `engine/src/lib.rs`, `PARAMS` in `public/audio-worklet.js`, `src/audio.js` | engine/README.md parameter table (tested) |
| An instrument sound | `engine/src/sounds.rs` (`SOUND_COUNTS`), `src/instruments.js` | docs/UI.md, public/manual.html |
| A named loop | `src/loops.js` | the loop count in README.md, docs/UI.md, public/manual.html |
| A deck or session module | `deckModuleNames` / `globalModuleNames`, `defaultModuleLayout`, the module's view in `src/Main.elm`; `DECK_MODULES` / `GLOBAL_MODULES` in `src/layout.js` | docs/UI.md, public/manual.html |
| Scoring, lessons, drills, Star mode | `src/training.js`, `lessons` / `trainingView` in `src/Main.elm`, `configure` in `src/main.js` | docs/UI.md, public/manual.html |
| A bundled track | `public/catalog.json`, `public/tracks/`, `scripts/prepare-library.py` | docs/REFERENCES.md, public/credits.html |
| A built-in skin's art | `scripts/make-*-skin.mjs` / `scripts/skin-painter.mjs`, then run the script | public/credits.html if the credits change |
| Skin import or kit rules | `src/skins.js`, `src/skin-kit.js`, `src/skin-enhance.js`, `src/kit.css` | public/skin-guide.html, docs/UI.md |
| Something stored on the device | `store` / `restore` in `src/main.js` | docs/UI.md, public/manual.html, the list above |
| A build, test or CI step | `package.json`, `.github/workflows/`, configs | README.md, this file, docs/TESTING.md, docs/GITHUB-PAGES.md |
| A new source file | anywhere | this file (the docs tests require every source file to be named here) |

## Generated and third-party files

Never edit these by hand:

- `engine/src/rhythm_weights.rs`: generated by `npm run train:rhythms`; `npm test` checks that it matches the corpus.
- `public/skins/millennium.wsz`, `public/skins/millennium.png`, `public/skins/millennium/*.png`, `public/skins/mochi.wsz`, `public/skins/mochi.png`: generated by the skin scripts.
- `public/tracks/*.mp3`: made by `scripts/prepare-library.py`; their hashes and grids live in `public/catalog.json`.
- The other files in `public/skins/` (museum archives, previews, Headspace) and `public/fonts/` are third-party originals kept unchanged under their own licenses.
- Build output (git-ignored): `public/elm.js`, `public/engine.wasm`, `dist/`, `engine/target/`. Lockfiles change only through npm and cargo.

## Documentation

| Doc | For | Covers |
| --- | --- | --- |
| [README.md](README.md) | everyone | What the app is, how to run it, where the docs are. Keep it short. |
| [AGENTS.md](AGENTS.md) | contributors and agents | Rules, commands, architecture, the change map. |
| [docs/UI.md](docs/UI.md) | specification | Every screen and control, from the user's side. |
| [docs/KEYBOARD.md](docs/KEYBOARD.md) | specification | Every key, per view; its key table is tested. |
| [engine/README.md](engine/README.md) | specification | The audio engine's ABI; its tables are tested. |
| [docs/TESTING.md](docs/TESTING.md) | contributors | The test suites, what they cover, and their limits. |
| [docs/GITHUB-PAGES.md](docs/GITHUB-PAGES.md) | maintainers | CI, deployment, base paths, custom domain. |
| [docs/REFERENCES.md](docs/REFERENCES.md) | everyone | Sources, licenses and credits of bundled media and skins. |
| [public/manual.html](public/manual.html) | players | The friendly manual, served with the app. |
| [public/skin-guide.html](public/skin-guide.html) | players | How to make a skin. |
| [public/credits.html](public/credits.html) | players | Credits, served with the app. |

Rules:

- **Docs change with the code.** A change isn't done until every doc that describes the touched behavior describes the new behavior, in the same commit. Use the change map above to find them. The pull request says which docs changed, or why none needed to.
- **Describe the current state**, as if the reader sees the project for the first time. No change-log wording ("now", "no longer", "new", "was changed", "this adds"): history belongs in commit messages and pull requests.
- **Write plainly**: short sentences, common words, and a definition before any new term (docs/UI.md starts with a glossary). User-facing text (the manual, the skin guide, app copy) keeps the chill, friendly voice. Specs describe what things do, not how they look.
- **Keep the tested contracts in sync**: the key table in docs/KEYBOARD.md, the parameter and voice tables in engine/README.md, and the file lists in this file and docs/TESTING.md. `tests/docs.test.mjs` also checks that every relative link and `#anchor` resolves, that every repository path written in backticks exists, and that every `npm run` script named in the docs exists.

## Code rules

- **Elm:** elm-format and elm-review clean. Every top-level definition has a type annotation; no `Debug`. `update` and views stay pure; browser work goes through a port command. Prefer extending the existing `Msg` and view helpers over parallel ones.
- **JavaScript:** ES modules, Prettier and ESLint clean. Keep logic that can be tested without a browser in small modules with pure functions (like `src/training.js`, `src/layout.js`, `src/keyboard.js`) and test them with `node:test`. Never do decoding, allocation-heavy work or blocking calls on the audio thread; keep the worklet thin. Wrap storage access so a full or blocked storage never breaks a session.
- **Rust:** rustfmt and clippy clean (warnings are errors). The render path stays allocation-free and panic-free; clamp every input from JavaScript. New DSP behavior gets a native test in `engine/src/lib.rs`, and a worklet test in `engine/tests/` when it crosses the ABI.
- **CSS:** scope rules by `data-layout` / `data-skin`, use the kit variables on skinned pages, and keep whole-pixel sizes for skin art and lettering.
- **Security:** treat imported files, skins and museum downloads as hostile: validate sizes, paths, colors and image data before use, and never inject imported markup, script or CSS.

## Bug fixes, tests and reviews

- **Bug fix:** first write a test that reproduces the bug and check that it fails; then fix it. Put unit-level tests in `tests/*.test.mjs` or `engine/src/lib.rs`, and browser-level ones in `tests/e2e.spec.js`.
- Tests check behavior a user or caller can observe, not private structure. Reuse the e2e helpers at the top of `tests/e2e.spec.js` (`playBoth`, `deckSnapshots`, `setRange`, `openModule`…).
- A change that makes an algorithm O(n²) or worse must be flagged in the pull request.

## Commits and pull requests

Every commit message says what was done and why. For a new feature, it describes the underlying logic. Don't list what a diff already shows (which files or functions changed) unless that is needed to explain why.

The first line is imperative and reads as if the commit performs the action. It starts with exactly one of these verbs:

- `ADD`: a new feature or something new
- `FIX`: a bug fix
- `UPDATE`: an improvement to something that exists, backward compatible
- `UPGRADE`: an improvement or change that is not backward compatible
- `DELETE`: removal of something

The first line is specific and concise and gives the reason when possible, for example `ADD loop picker so a deck can load any named loop`, `FIX deck B pitch ignoring the wheel in Focus session`. Never `update code`, `misc fixes`, `refactor` or `FIX bug`. Add a body for the rationale, constraints or implementation notes.

A pull request description explains what and why, lists the docs it updated (or why none needed to change), and notes anything the reviewer should try by hand.
