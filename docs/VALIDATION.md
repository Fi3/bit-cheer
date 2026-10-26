# Validation

Validated on 26 October 2026 with Node 26, Rust 1.94.1, Elm 0.19.1, and Chromium on Linux.

## Automated checks

- `python3 scripts/train-rhythm-model.py --check`: reproduces trained weights from the 20 original authored patterns and confirms that changing the corpus changes the learned model.
- `npm test`: **24 Rust tests and 61 JavaScript/compiled-WASM tests passed**. These include real DSP and worklet behavior, audio transactions, local-library byte reuse, independent selections, pitch normalization, layout migration/persistence, base paths, training and skin validation.
- `npm run build`: optimized Elm, release WASM and Vite production builds passed for both the root path and `/bit-cheer/` GitHub Pages path.
- Production Chromium: **26 browser tests passed in 1.3 minutes** against the root production build. The suite exercises actual audio and waveform samples; independent generated/PCM tempo and material actions; native 0% pitch on track changes; cue, jog, EQ and mixer behavior; twenty-voice gain/pan/solo/step edits and CHAOS; learning persistence and timed expert handovers; custom skins and actual bitmap digits; module persistence; permanent transport; two-deck focus; pitch sensitivity; local file reuse; and hardware channel isolation.
- After the final compact player-housing and transport-placement changes, **all 8 affected browser cases passed again in 26.2 seconds**: desktop/mobile layout, all skins and forty custom artwork combinations, Pro pickers/local reuse, focus, modules and pitch sensitivity.
- Project Pages Chromium: **2 additional checks passed in 14.9 seconds** against `http://127.0.0.1:4174/bit-cheer/`. The real engine/worklet, five skins, PCM recordings and credits work under the subpath. All same-origin assets and credits links stay under that prefix, with no HTTP failures. Every bundled recording is independently decoded again on this build.

Run the full browser suite with `npm run test:e2e`, or set `PLAYWRIGHT_BASE_URL` to an existing production server. The suite uses relative navigation so the same tests work at a repository subpath. Chromium does not expose AudioWorklet module loads in its ordinary request events or Resource Timing: the hosting check transparently observes successful calls to the real `AudioWorklet.addModule`, while separately measuring actual audio output.

## Current acceptance coverage

The forty recordings span ten genres. Every file is fetched and decoded sequentially with a real browser `AudioContext`, checked for two channels, finite/nonzero samples in **all four quarters of each channel**, accurate manifest duration, and 128-beat length at its estimated BPM. IDs and URLs are unique; recordings are served locally. This checks all files, not merely whichever two happen to load initially.

Pro tests verify separate pickers below the decks, title-only options without BPM suffixes, visible catalog counts, filter preservation, explicit loading, Next/Previous/Change, and a local file imported once and reused on either deck. Selecting/filtering an option alone leaves audio untouched. New tracks start at their own native BPM with pitch at 0%; source changes preserve the peer deck. Delayed downloads cannot replace material after a mode switch.

Module tests distinguish Hide/Open from removal, restore every optional module type through Add, retain playback and settings, and preserve independent per-mode layouts through reloads. Transport is permanently integrated: it has no Hide/Remove/Add entry and remains usable after every optional deck module is removed. Focus shows both decks with four range sliders and separate labeled Play/Pause buttons; navigation, screens, module chrome, jogs, composers and shared mixer panels are absent. Space works while a pitch range retains focus; Escape restores the normal layout without interrupting playback.

Pitch tests exercise pixel-, line- and page-mode wheel events; Fine/Normal/Coarse selection; Shift's 0.01-point adjustment; fractional trackpad deltas; Arrow/Page keys; native value/DSP agreement; handle position; and peer-deck isolation. Fresh sessions use Winamp 5 Classified; explicit saved themes and custom skins survive reload. The artwork matrix verifies all eight imported graphic slots on each of five structural bases, in addition to standalone TOML, graphic ZIP and original WSZ imports.

## Implementation / test / review / fix loop

1. Built and exercised the Rust/WASM engine, local learned generator, Elm frontend and real browser audio graph. Reviewed processor readiness, PCM memory, stale loads, waveform drawing, cue behavior and modifier shortcuts; fixed the observed failures.
2. Added real physical-channel routing and tested four/six-channel `OfflineAudioContext` output, mono downmix, pair selection, unused-channel silence, invalid-route rollback and rejected-device UI recovery. Live two-channel routing is measured with analyzers.
3. Separated tempo and track actions, expanded the composer to twenty voices, and checked actual channel output and peer-deck snapshots. Foundation resets arbitrary composer settings to an audible kick. The expert lesson now requires a three-second handover, and phrase practice has an audible sixteen-beat reference.
4. Compared the five themes with their original previews, corrected numeric bitmap offsets and custom-artwork specificity, and reviewed desktop/mobile rendering. The latest interface uses fixed transport, configurable compact window strips, a minimal two-deck focus and separate Pro pickers. Source styles are `src/winamp.css`, `src/skin-variants.css`, `src/session.css` and `src/module-skins.css`.
5. Expanded the licensed library to forty 128-beat recordings. Whole-catalog browser decoding exposed eighteen silent excerpts caused by fade filters using source timestamps after a seek. The encoder now resets timestamps before applying edge fades. Independent file checks and both production browser audits confirm nonzero signal throughout every channel's four quarters.
6. Built the actual GitHub Pages subpath. Corrected credits links that initially escaped to the origin root, then checked loaded graphics, audio, downloads and the return link. The workflow and setup guide prepare deployment; no external GitHub repository creation, push or hosted workflow execution is claimed.

Browser synchronization waits for confirmed telemetry and rendered Elm state. Paused peer snapshots are taken after the preceding seek/track reset completes, and removed modules are confirmed absent before restoration. This avoids interpreting a prior queued update as cross-deck mutation or a failed Add action; assertions retain strict value/isolation requirements.

The final visual audit captured all five skins in normal and focus views at desktop and 390-pixel mobile widths, plus Pro desktop/mobile: **22 views with no horizontal overflow**. The native pitch input and visible rail have identical geometry in every capture; normal rails remain 340/320 pixels on desktop/mobile. These captures and measurements are in `/tmp/bit-cheer-final-visual/`.

Production browser screenshots are preserved locally at `/tmp/bit-cheer-production-browser/`. Earlier reference comparisons and all-theme review captures are in `/tmp/bit-cheer-audit-before/`, `/tmp/bit-cheer-audit-after/` and `/tmp/bit-cheer-modules/`; those directories document their respective review stages rather than all representing the final interface.

## Performance observation

The release WASM is **80,096 bytes**. On this machine, rendering ten seconds of both decks with all twenty voices took approximately **557 ms (5.57% of the real-time budget)** in the compiled-WASM benchmark. The Rust render callback allocates no heap memory. Generated waveform previews use a separate worker running the same Rust DSP; microphone capture uses a separate silent worklet.

This is a local benchmark, not a device-independent latency or CPU guarantee.

## Practical verification limits

The browser tests use Chromium software audio. Four- and six-channel isolation is verified with actual offline rendering, and live two-channel routing is tested with analyzers. No physical multichannel USB interface, analog cabling or external mixer was connected. Browser/device combinations can expose fewer channels than the OS driver; unavailable routes are disabled according to the real reported limit.

Microphone continuity, downsampling, silence and BPM estimation are exercised with synthetic input. Physical microphone quality and room acoustics remain device-dependent. Browser codecs and estimated BPM/beat-grid accuracy also vary. The catalog retains confidence/manual-calibration guidance; tempos are not claimed as artist-verified exact values. Pro provides manual source BPM and grid correction.

Beatmatch PRO discovery links are reused; its protected audio is not mirrored. The forty playable excerpts carry separate CC BY 3.0 licenses and source credits. Skins are native two-deck adaptations, with original previews and attribution retained. See [the requirements audit](REQUIREMENTS-AUDIT.md), [source evidence](REFERENCES.md) and [GitHub Pages guide](GITHUB-PAGES.md).
