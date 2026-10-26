# Validation

Validated on 26 October 2026 with Node 26, Rust 1.94, Elm 0.19.1, and Chromium on Linux.

## Implementation / test / review / fix loop

1. Built the Rust/WASM transport, DSP, learned rhythm generator, Elm application, and browser bridge.
2. Tested native DSP and the compiled WASM ABI/worklet. Reviewed source loading, memory growth, real processor readiness, and jog-control sequencing; added acknowledgements, frame limits, and stale-load cancellation.
3. Tested the browser UI with actual Web Audio samples and imported MP3s. Fixed waveform drawing, cue pause behavior, drill reset constraints, modifier shortcuts, and mode-change download races.
4. Verified all five skins and standalone TOML, graphic ZIP, and original WSZ imports. Reviewed desktop/mobile screenshots and fixed skin-preview layout.
5. Added requested physical-channel routing. Tested discrete four- and six-channel rendering, mono downmix, pair assignment, unused-channel silence, software mixer bypass/restoration, invalid-route rollback, and output-device failure handling.
6. Separated each deck's tempo and material actions; made Foundation kick-only and Builder start with two voices. Verified paused peer-deck snapshots, preserved effective PCM tempo, automatic pitch-range expansion, and safe source/mode changes.
7. Expanded the DSP to twenty voices with gain, pan, solo and sixteen-step editing; tested actual channel samples, silent patterns and solo isolation. Verified independent CHAOS generation with twelve to twenty active voices and a usable Foundation reset after arbitrary composer settings.
8. Added fullscreen deck focus and wheel-adjusted pitch. Compared all five skins with their original previews, rebuilt their materials/graphics, fixed bitmap digits that had displayed zero despite correct text, and enlarged focused controls. Captured thirty desktop/mobile Foundation, CHAOS and focus views without horizontal overflow or uncaught browser errors.

## Automated checks

- `python3 scripts/train-rhythm-model.py --check`: verifies exact reproduction of trained weights from the 20 original authored patterns and verifies that changing the corpus changes the learned model.
- `npm test`: 24 Rust tests and 46 JavaScript/compiled-WASM tests passed.
- `npm run build`: optimized Elm, release WASM, and Vite static build passed.
- Production Chromium: 22 browser tests passed against the optimized build in 44.8 seconds. The suite covers actual waveform drawing and audio signal, independent tempo/material actions, source and peer-deck preservation, gain/pan/solo/step edits, twenty-voice CHAOS, turntable wheel/drag, saved cue and pause, PCM imports, genre filtering, learning progression and reload persistence, timed expert crossfades, tempo tapping, all skin formats, rendered number sprites, enlarged deck focus, keyboard accessibility, mobile layout, and hardware channel isolation.
- After the final artwork/contrast/selector changes, all six affected browser cases passed again in 12.3 seconds. This includes forty custom artwork combinations (eight slots on each of five structural bases), Headspace forehead transport/focus buttons, the Add instrument placeholder before/after selection, PCM pitch preservation, and fullscreen focus. Variant border resets and the Alien titlebar override found by this matrix were fixed.

The final thirty screenshot captures cover Foundation, CHAOS and deck focus at 1440-pixel desktop and 390-pixel mobile widths for all five themes. No capture had horizontal overflow or an uncaught page error. Original previews were compared against the rendered themes; final review confirmed distinct violet/gold, gray/gold, silver/blue, charcoal, and lime/purple treatments, corrected numeric sprites, readable silver panels, and preserved bitmap aspect ratios. Local review artifacts are in `/tmp/bit-cheer-audit-before/` and `/tmp/bit-cheer-audit-after/`.

An initial jog/CUE browser assertion sampled an intermediate coalesced drag position. The test now waits for the exact final 45-pixel seek before setting a cue, with a tighter tolerance. The app correctly returned to the saved cue. Multichannel tests account for the browser compressor's makeup gain while asserting exact channel ratios and remapping, with unused channels silent.

## Performance observation

The release WASM is 80,096 bytes. On this machine, rendering 10 seconds of both decks with all twenty voices took approximately 561 ms (5.61% of the real-time budget) in the compiled-WASM benchmark. The Rust render path allocates no heap memory. Generated waveform previews run in a separate worker using the same Rust DSP; microphone samples use a separate silent capture worklet.

This is a local benchmark, not a device-independent latency or CPU guarantee.

## Practical verification limits

The browser tests use Chromium software audio. Four- and six-channel isolation is verified using actual `OfflineAudioContext` rendering, and live two-channel routing is tested with analyzers. No physical multichannel USB interface, analog cabling, or external mixer was connected in this environment. Browser/device combinations can expose fewer channels than the OS driver; the app reports the real browser limit and disables unavailable routes.

Microphone capture continuity, downsampling, silence, and BPM estimation are exercised with synthetic input. Physical microphone quality and room acoustics remain device-dependent. Browser codec support and estimated BPM/beat-grid accuracy also vary. Pro mode provides manual BPM/grid correction.

Beatmatch PRO's discovery links are reused; its protected audio is not mirrored. Bundled playable excerpts have separate CC BY 3.0 licenses. The five skins are native two-deck adaptations, with original previews and attribution retained.
