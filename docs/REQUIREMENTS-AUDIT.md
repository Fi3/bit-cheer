# Requirements audit

Audit date: 26 October 2026. Scope: the original Bit Cheer request, the subsequent
physical-output request, and the clarified independent deck actions and mode
distinctions. This records observable acceptance criteria, source locations, and
limits; it does not treat a passing build as evidence that every product behavior
is correct.

The latest expansion additionally requests a large focused pitch/jog control,
single-deck fullscreen, twenty individually controllable instruments with
sixteen-step sequences, gain/pan/solo per voice, and per-deck CHAOS generation.
The acceptance criteria for that expansion appear separately below; earlier
seven-voice evidence is not evidence for the expanded bank.

## Original request

| Requirement | Implementation and evidence | Acceptance check |
| --- | --- | --- |
| Efficient, usable Rust/WASM audio player | `engine/src/lib.rs`, `public/audio-worklet.js`, `src/audio.js`; 128-frame DSP, two stereo decks, no heap allocation in the render loop, compilation outside the audio thread. Native Rust and compiled-WASM tests exercise the real engine. | Both decks produce finite, nonzero samples through a real AudioWorklet; transport, pitch, PCM playback, EQ and looping work independently. The documented benchmark measures actual render cost rather than claiming a device-independent guarantee. |
| Elm frontend | `src/Main.elm`, ports in `src/main.js`; optimized Elm build drives application state and controls. | `npm run build:elm` succeeds; real controls send commands and display confirmed engine state. |
| Several modes with a beginner-to-expert path | `modeElements`, `practiceView`, `lessons`, `learningView`, `trainingView` in `src/Main.elm`; scoring in `src/training.js`. Four practice modes, eight sequential lessons, four drills, persisted completion/history. | Foundation remains kick-only; Builder exposes layering; By ear hides visual timing aids; Pro plays PCM. Completing an eligible lesson unlocks the next and survives reload. See the curriculum observations below. |
| Very simple AI-generated kick tracks, with richer generated tracks | `engine/src/rhythm_model.rs`, `engine/src/rhythm_weights.rs`, `docs/rhythm-corpus.json`, `scripts/train-rhythm-model.py`. A reproducible local learned statistical model generates rhythms; Rust synthesizes voices. | Seeded output is reproducible, different seeds vary audible material, and the beginner kick remains a steady quarter-note reference. No remote neural model is implied. |
| Add instruments such as kick and hi-hat | Twenty instrument bits in `engine/src/lib.rs`; per-deck composer controls in `src/Main.elm`. | Builder starts with kick/closed hat and can independently add/remove any of the twenty voices. Every active voice has a sixteen-step sequence, gain, pan and solo. A convenience action can add to both; Foundation stays kick-only. |
| Separate tempo randomization and track changes | Browser bridge `src/main.js`, engine methods `src/audio.js`, deck actions in `src/Main.elm`. Mirrored A/B browser acceptance passes for generated and PCM sources. | Random tempo changes only the selected deck's audible playback tempo; Change track changes selected material while preserving effective BPM. Neither action changes the other deck. |
| Pro mode with real tracks and genre selection | `libraryView` and `referenceCrate` in `src/Main.elm`; `loadTrack` in `src/main.js`; `public/catalog.json`, `public/tracks/`. Four playable CC BY excerpts across House/Techno, local import, 574 original catalog links with genre filters. | Play real decoded PCM; filter library/discovery by genre; import a local file; change one deck to a different eligible track in the selected genre. Audio unavailable for redistribution is linked, not represented as bundled. |
| Reuse the Beatmatch PRO practice selection | Original public catalog retained in `public/catalog.json` under `referenceTracks`; provenance in `docs/REFERENCES.md`. | Discovery links lead to the original artist pages and retain genre membership. Direct streaming of Beatmatch PRO's protected recordings is an explicit limit below. |
| Two pitch sliders and rich player instrumentation | `deckView`, `vuMeter`, `mixerView`, `focusView` in `src/Main.elm`; Rust DSP and browser graph. Includes pitch ranges/fine steps, actual peak meters, waveform seek/zoom, jog, nudge, cue, EQ, volume, crossfader, split cue and deck focus/fullscreen. | Real analyser samples respond to playback/mixing; pitch changes actual tempo; cue returns to the saved position paused; waveform/jog/wheel interactions alter only their deck. The fader range expands when preserving a new recording's effective BPM requires more than 16% pitch. |
| DJcompanion-inspired training features | Reviewed [DJcompanion's published feature list](https://www.djcompanion.app/): dual decks, waveform navigation, vertical pitch/ranges, temporary rate adjustment, EQ, microphone BPM and local import. Implementations are in `src/Main.elm`, `src/main.js`, `src/audio.js`, `src/training.js`, `public/mic-worklet.js`. | Exercise transport, pitch, seek/zoom, jog bend, EQ, tap tempo and local import. Unit/worker tests verify continuous local microphone capture and tempo estimation; microphone use requires an explicit click. |
| Early-2000s interchangeable skins, including supplied image | `src/skins.js`, `src/winamp.css`, `src/skin-variants.css`, original assets in `public/skins/`. Four museum designs plus Headspace / Alien Lime. Exact image identification and author credits in `docs/REFERENCES.md`. | Select all five themes; confirm their respective original previews, materials, structural layouts and graphics/palettes; selection survives reload. These are native two-deck adaptations rather than pixel-for-pixel Winamp window replicas. |
| Implement the museum's first four skins | Snapshot identifiers and original `.wsz` archives in `public/skins/museum.json`, `public/skins/`, `docs/REFERENCES.md`. | Classic 2.91, Winamp 3 Classified, Winamp 5 Classified and Bento Classified have their original preview/titlebar assets and separate selectable themes. Museum ordering is a dated snapshot. |
| User-defined skin files with graphic elements | `validateSkin`, `importSkin`, `applySkin`, `skinTemplate`, `downloadTemplate` in `src/skins.js`; TOML supports five structural bases and eight artwork slots: panel, titlebar, background, frame, buttons, numbers, platter and pitch. | Import standalone TOML, TOML+PNG ZIP, and classic WSZ. Assert colors, structural inheritance and actual rendered graphics apply and persist; every base honors every custom slot. Invalid colors/paths/oversized archives fail without replacing the active skin. |
| Tap tempo | `tapTempo` in `src/training.js`, `tapView` in `src/Main.elm`. | Repeated taps approximately 500 ms apart produce approximately 120 BPM; stale tap sessions reset. |
| Implement/test/review/fix loop | `docs/VALIDATION.md`, native/worker/unit tests, `tests/e2e.spec.js`; source/build and browser regression evidence. | The final optimized production build passes appropriate unit and browser checks, and desktop/mobile screenshots are visually reviewed. |

## Clarified independent deck actions

Browser acceptance uses paused decks, avoiding ordinary playback drift being
mistaken for cross-deck mutation. Snapshots include seed, source BPM, pitch,
effective BPM, element mask, position, source type, track name, and waveform.

1. **Random tempo A/B:** change only the selected deck's effective tempo. Keep its
   source, seed, instrument mask, name, material and the complete other-deck
   snapshot unchanged. Generated loops retain musical beat position while source
   seconds rescale with source BPM; PCM retains exact source seconds/cue and its
   loaded waveform, changing playback rate rather than just relabeling source BPM.
2. **Change track A/B, generated:** change the selected deck's seed and audible
   waveform/material; retain its effective BPM. Builder/By-ear changes may vary
   the selected instrument combination; Foundation remains kick-only. The other
   deck's complete snapshot must remain unchanged.
3. **Change track A/B, Pro:** choose a different eligible real recording from the
   current genre, retain effective BPM via playback rate, and leave the other deck
   unchanged. A genre with no playable recording reports that state without
   silently loading a different genre or replacing PCM with generated audio.
4. **Foundation versus Builder:** Foundation exposes only kick practice and no
   layer controls; Builder starts with a richer loop and allows independent
   instrument selection/addition. Returning to Foundation restores kick-only
   material on both decks.
5. **Asynchronous safety:** a stale fetch/decode cannot replace a newer deck
   selection or generated material after leaving Pro. Rejected operations retain
   the previously usable material and confirmed UI state.

At audit start, the existing global Randomize combined material and tempo changes,
and Foundation exposed the same seven instrument controls as Builder. These were
actual gaps relative to the clarified behavior. Their replacements now pass
mirrored deck-isolation browser acceptance. The old test asserting global
Randomize and Foundation layering was replaced with the revised contract.

## Physical audio outputs

`src/output-routing.js` validates non-overlapping, in-range physical mappings and
constructs a discrete graph. `src/audio.js` changes routes transactionally and
reports the selected device's real channel capacity. `routingView` in
`src/Main.elm` provides mono channel or stereo pair selection and device choice
where supported.

Acceptance: actual four/six-channel `OfflineAudioContext` rendering must place A
and B in the selected channel(s), preserve stereo sides, average stereo for mono,
and leave unused outputs silent. Invalid changes must preserve the current graph.
Live stereo output must support separate mono decks, bypass the software
crossfader in external mixing modes, and restore the normal stereo mix. A denied
device change must restore the confirmed native select value and retain playback.
These checks passed in the prior 15-case production suite.

## Expanded instrument and focus requirements

The twenty-voice engine, bridge and Elm controls are implemented. The expanded
production suite passed all 22 browser cases in 44.8 seconds, including actual
voice audio, independent deck actions, CHAOS, mode reset, enlarged focus and the
expert handover. Thirty views across all five skins at desktop/mobile sizes had
no horizontal overflow or uncaught browser errors. All six affected regressions
passed again after the final artwork-slot and visual fixes, in 12.3 seconds.
All forty base/artwork-slot combinations now pass actual rendered-style checks.
These checks are distinct from the previously tested seven-voice UI.

| Requested behavior | Concrete acceptance |
| --- | --- |
| Large wheel/control when focused | Focusing the appropriate deck control visibly enlarges its usable interaction area; drag/wheel/keyboard interaction continues controlling only that deck. A return action restores the normal two-deck layout. |
| Fullscreen per deck, hiding the rest of the app | Either A or B can enter deck focus/fullscreen. Only that selected deck and its controls remain visible; navigation, other deck and unrelated app panels are hidden. Exit/Escape restores the app without changing playback or source material. |
| Twenty instruments | Builder exposes twenty distinct named instrument controls for each deck. Every voice has a corresponding real DSP implementation, rather than being a label or alias for a muted channel. Native/WASM tests render each enabled voice to finite, nonzero audio. |
| Sixteen-step sequencer per voice | Each selected instrument has sixteen independently togglable steps. Editing A changes A's corresponding pattern only, is reflected in the UI, and changes the rendered rhythm. An all-off sequence silences that voice; restoring a step restores its hit. |
| Per-instrument gain and pan | Gain and pan controls affect the selected voice only. Gain zero silences it; hard left/right affects the appropriate stereo channel. Deck/master controls retain their documented effect. |
| Per-instrument solo | Soloing a voice excludes other enabled voices in that deck without changing the other deck. Turning solo off restores the previous enabled combination. |
| Per-deck CHAOS | CHAOS A/B activates between twelve and twenty voices and varies their material on the selected deck. The other deck retains its full state. Effective tempo is preserved unless the user invokes the separate tempo action. |
| Beginner mode distinction | Foundation is one kick; Builder defaults to exactly two voices. Foundation does not expose the expanded editing bank or CHAOS. Moving between modes updates both audio and visible controls consistently. |
| Online skin comparison | Compare rendered Classic/Classified3/Classified5/Bento/Alien with their original museum/HeadAMP previews, checking actual materials, palette, bitmap graphics and controls. Capture all five at desktop and mobile sizes, plus deck focus. Preserve before captures for comparison. |

Before screenshots were taken from the existing production app on port 8080 at
`/tmp/bit-cheer-audit-before/`. The original previews used for comparison are
`public/skins/{classic,classified3,classified5,bento,alien}.png`. The prior design
used authentic strips and palettes but retained a predominantly modern charcoal
shell; Classic lacked the original strong violet/gold trim, while Alien used
forest green rather than its reference's vivid lime and made the head very small.

## Additional curriculum consistency observations

These observations concern the implementation's own lesson promises, rather than
inventing an expanded list of professional-DJ features:

- **Expert handover gate:** lesson 8 says to practice a smooth crossfade, but its
  completion originally used the same BPM/phase score threshold as other lessons
  (`Incoming` result handling in `src/Main.elm`). A user could complete it without
  moving the crossfader. Testable resolution: a valid matching score plus a
  recorded handover from one deck to the other is required for lesson 8; ordinary
  tempo/phase lessons retain their existing completion rules.
- **Audible phrase reference:** the phrase drill scores modulo 16 beats, while
  the learned generator originally sampled only modulo a single bar's 16
  sixteenth-note steps (`engine/src/rhythm_model.rs`). The sequence has variation
  but no guaranteed audible four-bar beginning. Testable resolution: add a
  repeatable audible phrase accent/fill anchored to the four-bar boundary and
  demonstrate that shifting by four beats differs from matching the 16-beat
  phrase, both in audio output and score.

The audio implementation subsequently added an audible 16-beat phrase accent,
with native Rust evidence. Lesson 8 now requires a crossfader handover lasting at
least three seconds while both decks play before accepting a score of 85 or more.
The browser suite checks both refusal before this handover and completion after
it. The review also found that carrying a muted/panned
kick from Builder into Foundation could make the beginner exercise silent;
mode initialization now restores default voice levels/pans, clears solo and
manual patterns, while independent tempo changes retain the current mix. The
expanded browser suite checks this mode round trip with actual output samples.

## Findings from the expanded production review

- The initial focused layout enlarged the jog from 110 to 140 pixels and the
  pitch fader from 310 to 410 pixels. The test's explicit enlargement criterion
  was 1.5 times the normal size, so that case failed. The final desktop layout
  uses a 220-pixel jog and 500-pixel fader and passes the focus interaction test.
- Screenshot review found that numeric text content was correct but the bitmap
  BPM display visibly showed zeros. Elm's `style "--digit"` assignment did not
  create a CSS custom property: computed `--digit` was empty and every sprite
  offset was zero. The Elm fix uses data attributes and CSS selectors. Existing
  desktop/audio tests now pass computed sprite-offset assertions both initially
  and after a tempo change, rather than relying on text content alone.
- The full custom-artwork matrix caught three layout rules resetting imported
  frame borders and an Alien rule hiding the imported titlebar. The final CSS
  keeps explicit user artwork above the structural defaults. All eight slots
  render on every base, and imported number sheets retain correct sprite offsets.
- Final visual review confirmed the Add instrument placeholder remains visible,
  silver coach/tap/mixer labels have readable contrast, titlebar bitmaps retain
  their aspect ratio, and built-in pitch/platter decoration no longer tiles
  unrelated graphics. Headspace's original forehead controls now operate the
  actual transport and focus view. No outstanding implementation issue remains
  from this audit; the external verification limits below still apply.

## Explicit limits

- **Protected catalog audio:** the public Beatmatch PRO track links are reused;
  its gated/proxied audio is not mirrored. No redistribution license was available.
  Four separately licensed recordings are bundled and personal import is usable.
  See [reference evidence](REFERENCES.md).
- **Hardware verification:** real Web Audio graph rendering and browser audio
  analysis are tested. No physical multichannel USB interface, cable, external
  mixer or acoustic microphone setup was connected here. Available output count
  depends on browser/OS/device support and is reported honestly in the UI.
- **Visual adaptation:** the five themes retain original previews, palettes and
  graphics but adapt them to the large two-deck interface. Classic WSZ imports
  retain the original MAIN, CBUTTONS, NUMBERS and TITLEBAR graphics and derive
  a compatible palette; arbitrary modern WAL/WAC execution is not
  implemented. The supplied green face is a Windows Media Player Headspace design
  adapted through HeadAMP, as credited.
- **Learning feedback:** tempo/phase are measured from playback and beat grids;
  musical taste is not automatically graded. Imported BPM is an estimate and can
  be corrected with source BPM/grid controls. Playback uses varispeed, without
  independent key lock or time stretching; neither was requested.
