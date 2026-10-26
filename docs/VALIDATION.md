# Validation

Validated on 26 October 2026 with Node 26, Rust 1.94, Elm 0.19.1, and Chromium on Linux.

## Implementation / test / review / fix loop

1. Built the Rust/WASM transport, DSP, learned rhythm generator, Elm application, and browser bridge.
2. Tested native DSP and the compiled WASM ABI/worklet. Reviewed source loading, memory growth, real processor readiness, and jog-control sequencing; added acknowledgements, frame limits, and stale-load cancellation.
3. Tested the browser UI with actual Web Audio samples and imported MP3s. Fixed waveform drawing, cue pause behavior, drill reset constraints, modifier shortcuts, and mode-change download races.
4. Verified all five skins and standalone TOML, graphic ZIP, and original WSZ imports. Reviewed desktop/mobile screenshots and fixed skin-preview layout.
5. Added requested physical-channel routing. Tested discrete four- and six-channel rendering, mono downmix, pair assignment, unused-channel silence, software mixer bypass/restoration, invalid-route rollback, and output-device failure handling.

## Automated checks

- `python3 scripts/train-rhythm-model.py --check`: verifies exact reproduction of trained weights from the 20 original authored patterns and verifies that changing the corpus changes the learned model.
- `npm test`: 17 Rust tests and 31 JavaScript/compiled-WASM tests passed.
- `npm run build`: optimized Elm, release WASM, and Vite static build passed.
- Production Chromium: 15 browser tests passed against the optimized build in 20.3 seconds. The suite covers actual waveform drawing and audio signal, tempo/pitch and mixer controls, turntable wheel/drag, saved cue and pause, instrument changes, real-track imports, original catalog filtering, learning progression and reload persistence, tempo tapping, all skin formats, keyboard accessibility, mobile layout, and hardware channel isolation.

An initial jog/CUE browser assertion sampled an intermediate coalesced drag position. The test now waits for the exact final 45-pixel seek before setting a cue, with a tighter tolerance. The app correctly returned to the saved cue. Multichannel tests account for the browser compressor's makeup gain while asserting exact channel ratios and remapping, with unused channels silent.

## Performance observation

The release WASM is 76,468 bytes. On this machine, rendering 10 seconds of both decks with all seven voices took approximately 153 ms (1.53% of the real-time budget) in the compiled-WASM benchmark. The Rust render path allocates no heap memory. Generated waveform previews run in a separate worker using the same Rust DSP; microphone samples use a separate silent capture worklet.

This is a local benchmark, not a device-independent latency or CPU guarantee.

## Practical verification limits

The browser tests use Chromium software audio. Four- and six-channel isolation is verified using actual `OfflineAudioContext` rendering, and live two-channel routing is tested with analyzers. No physical multichannel USB interface, analog cabling, or external mixer was connected in this environment. Browser/device combinations can expose fewer channels than the OS driver; the app reports the real browser limit and disables unavailable routes.

Microphone capture continuity, downsampling, silence, and BPM estimation are exercised with synthetic input. Physical microphone quality and room acoustics remain device-dependent. Browser codec support and estimated BPM/beat-grid accuracy also vary. Pro mode provides manual BPM/grid correction.

Beatmatch PRO's discovery links are reused; its protected audio is not mirrored. Bundled playable excerpts have separate CC BY 3.0 licenses. The five skins are native two-deck adaptations, with original previews and attribution retained.
