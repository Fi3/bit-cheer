//! Two independent stereo decks; all audio is rendered inside Rust/WASM.
//! The C ABI is single-threaded and intended for an AudioWorkletGlobalScope.
mod rhythm_model;
mod rhythm_weights;

use std::f64::consts::PI;

const BLOCK: usize = 128;
const VOICE_COUNT: usize = 20;
const ELEMENT_MASK: u32 = (1 << VOICE_COUNT) - 1;
const MAX_PCM_FRAMES: usize = 28_800_000; // Ten minutes at 48 kHz.
const TAU: f64 = PI * 2.0;

#[derive(Clone, Copy, Debug)]
struct Biquad {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    z1: [f64; 2],
    z2: [f64; 2],
}
impl Default for Biquad {
    fn default() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            z1: [0.0; 2],
            z2: [0.0; 2],
        }
    }
}
impl Biquad {
    fn configure(&mut self, band: usize, db: f64, rate: f64) {
        let a = 10.0_f64.powf(db / 40.0);
        let frequency: f64 = [200.0, 1200.0, 6000.0][band];
        let w = TAU * frequency.min(rate * 0.4) / rate;
        let c = w.cos();
        let s = w.sin();
        let alpha = s / (2.0 * 0.707);
        let root = 2.0 * a.sqrt() * alpha;
        let (b0, b1, b2, a0, a1, a2) = match band {
            0 => (
                a * ((a + 1.0) - (a - 1.0) * c + root),
                2.0 * a * ((a - 1.0) - (a + 1.0) * c),
                a * ((a + 1.0) - (a - 1.0) * c - root),
                (a + 1.0) + (a - 1.0) * c + root,
                -2.0 * ((a - 1.0) + (a + 1.0) * c),
                (a + 1.0) + (a - 1.0) * c - root,
            ),
            1 => (
                1.0 + alpha * a,
                -2.0 * c,
                1.0 - alpha * a,
                1.0 + alpha / a,
                -2.0 * c,
                1.0 - alpha / a,
            ),
            _ => (
                a * ((a + 1.0) + (a - 1.0) * c + root),
                -2.0 * a * ((a - 1.0) + (a + 1.0) * c),
                a * ((a + 1.0) + (a - 1.0) * c - root),
                (a + 1.0) - (a - 1.0) * c + root,
                2.0 * ((a - 1.0) - (a + 1.0) * c),
                (a + 1.0) - (a - 1.0) * c - root,
            ),
        };
        self.b0 = b0 / a0;
        self.b1 = b1 / a0;
        self.b2 = b2 / a0;
        self.a1 = a1 / a0;
        self.a2 = a2 / a0;
    }
    #[inline]
    fn sample(&mut self, x: f64, ch: usize) -> f64 {
        let y = self.b0 * x + self.z1[ch];
        self.z1[ch] = self.b1 * x - self.a1 * y + self.z2[ch];
        self.z2[ch] = self.b2 * x - self.a2 * y;
        // Prevent denormals during long pauses.
        if self.z1[ch].abs() < 1e-24 {
            self.z1[ch] = 0.0;
        }
        if self.z2[ch].abs() < 1e-24 {
            self.z2[ch] = 0.0;
        }
        y
    }
    fn clear(&mut self) {
        self.z1 = [0.0; 2];
        self.z2 = [0.0; 2];
    }
}

struct Synth {
    last_step: i64,
    env: [f64; VOICE_COUNT],
    phase: [f64; VOICE_COUNT],
    decay: [f64; VOICE_COUNT],
    gain: [f64; VOICE_COUNT],
    pan: [f64; VOICE_COUNT],
    left: [f64; VOICE_COUNT],
    right: [f64; VOICE_COUNT],
    overrides: [i32; VOICE_COUNT],
    bass_frequency: f64,
    kick_base: f64,
    kick_sweep: f64,
    kick_punch: f64,
    kick_level: f64,
    noise: u32,
    previous_noise: f64,
    pattern: [u32; rhythm_model::STEPS],
}
impl Synth {
    fn new(rate: f64, seed: u32) -> Self {
        let mut synth = Self {
            last_step: -1,
            env: [0.0; VOICE_COUNT],
            phase: [0.0; VOICE_COUNT],
            decay: [
                0.19, 0.035, 0.12, 0.085, 0.23, 0.10, 0.4, 0.24, 0.055, 0.45, 0.85, 0.025, 0.22,
                0.14, 0.12, 0.15, 0.20, 0.65, 0.30, 0.16,
            ]
            .map(|seconds| (-1.0 / (rate * seconds)).exp()),
            gain: [1.0; VOICE_COUNT],
            pan: [0.0; VOICE_COUNT],
            left: [1.0; VOICE_COUNT],
            right: [1.0; VOICE_COUNT],
            overrides: [-1; VOICE_COUNT],
            bass_frequency: 55.0,
            kick_base: 45.0,
            kick_sweep: 115.0,
            kick_punch: 0.0,
            kick_level: 0.85,
            noise: seed.max(1),
            previous_noise: 0.0,
            pattern: [0; rhythm_model::STEPS],
        };
        synth.apply_seed(rate, seed);
        synth
    }
    fn apply_seed(&mut self, rate: f64, seed: u32) {
        // Coefficients and model sampling change off the render path.
        let palettes = [
            (40.0, 80.0, 0.22, 0.03),
            (55.0, 155.0, 0.15, 0.08),
            (70.0, 95.0, 0.10, 0.14),
            (48.0, 220.0, 0.13, 0.10),
            (44.0, 110.0, 0.26, 0.02),
            (62.0, 180.0, 0.095, 0.18),
            (52.0, 75.0, 0.18, 0.06),
            (58.0, 260.0, 0.12, 0.12),
        ];
        let (base, sweep, seconds, punch) = palettes[(seed & 7) as usize];
        self.kick_base = base;
        self.kick_sweep = sweep;
        self.kick_punch = punch;
        self.decay[0] = (-1.0 / (rate * seconds)).exp();
        self.noise = seed.max(1);
        self.previous_noise = 0.0;
        let original = rhythm_model::generate(seed);
        for (step, mask) in original.iter().enumerate() {
            self.pattern[step] = *mask as u32;
        }
        // New timbres reuse the seven learned instrument-family priors with
        // independently seeded draws. They are not falsely advertised as new
        // independently trained models. Sparse cymbals retain phrase structure.
        let families = [1, 1, 1, 6, 2, 5, 5, 5, 5, 4, 6, 1, 5];
        for voice in 7..VOICE_COUNT {
            let sampled =
                rhythm_model::generate(seed.wrapping_add((voice as u32).wrapping_mul(0x9e3779b9)));
            for (step, mask) in sampled.iter().enumerate() {
                let hit = (*mask & (1 << families[voice - 7])) != 0;
                let spacing = match voice {
                    7 => step % 4 == 2,
                    9 => step % 4 == 0,
                    10 => step % 64 == 0,
                    18 => step % 16 == 14,
                    _ => true,
                };
                if hit && spacing {
                    self.pattern[step] |= 1 << voice;
                }
            }
        }
        self.overrides = [-1; VOICE_COUNT];
    }
    fn set_voice(&mut self, voice: usize, param: u32, value: f64) {
        if voice >= VOICE_COUNT || !value.is_finite() {
            return;
        }
        match param {
            0 => self.gain[voice] = value.clamp(0.0, 1.5),
            1 => self.pan[voice] = value.clamp(-1.0, 1.0),
            2 => {
                self.overrides[voice] = if value < 0.0 {
                    -1
                } else {
                    (value as i32) & 65535
                }
            }
            3 => self.overrides[voice] = -1,
            _ => return,
        }
        let pan = self.pan[voice];
        self.left[voice] = self.gain[voice]
            * if pan > 0.0 {
                (pan * PI / 2.0).cos()
            } else {
                1.0
            };
        self.right[voice] = self.gain[voice]
            * if pan < 0.0 {
                (-pan * PI / 2.0).cos()
            } else {
                1.0
            };
    }
    fn preview(&self, voice: usize) -> u32 {
        if voice >= VOICE_COUNT {
            return 0;
        }
        if self.overrides[voice] >= 0 {
            return self.overrides[voice] as u32;
        }
        let mut mask = 0;
        for step in 0..16 {
            if self.pattern[step] & (1 << voice) != 0 {
                mask |= 1 << step;
            }
        }
        mask
    }
    fn reset(&mut self) {
        self.last_step = -1;
        self.env = [0.0; VOICE_COUNT];
        self.phase = [0.0; VOICE_COUNT];
    }
    #[inline]
    fn render(&mut self, beat: f64, elements: u32, seed: u32, rate: f64) -> [f64; 2] {
        let step = (beat * 4.0).floor() as i64;
        if step != self.last_step {
            self.last_step = step;
            let phrase_step = step.rem_euclid(64);
            let mut triggers = self.pattern[step.rem_euclid(rhythm_model::STEPS as i64) as usize];
            if phrase_step >= 60 {
                triggers |= 1 << 1;
                if phrase_step % 2 == 0 || phrase_step == 63 {
                    triggers |= (1 << 2) | (1 << 5);
                }
            }
            for voice in 0..VOICE_COUNT {
                let hit = if self.overrides[voice] >= 0 {
                    self.overrides[voice] & (1 << step.rem_euclid(16)) != 0
                } else {
                    triggers & (1 << voice) != 0
                };
                if hit && elements & (1 << voice) != 0 {
                    self.env[voice] = 1.0;
                    if voice == 0 {
                        self.kick_level = if phrase_step == 0 { 1.2 } else { 0.85 };
                    }
                    if voice == 0 || voice == 5 || (voice >= 7 && voice != 16 && voice != 17) {
                        self.phase[voice] = 0.0;
                    }
                }
            }
            let notes = [0.0, 0.0, 7.0, 3.0, 0.0, 10.0, 7.0, 5.0];
            self.bass_frequency = 49.0
                * 2.0_f64
                    .powf((notes[(step.rem_euclid(32) / 4) as usize] + (seed % 5) as f64) / 12.0);
        }
        self.noise ^= self.noise << 13;
        self.noise ^= self.noise >> 17;
        self.noise ^= self.noise << 5;
        let noise = (self.noise as f64 / u32::MAX as f64) * 2.0 - 1.0;
        let bright = (noise - self.previous_noise) * 0.5;
        self.previous_noise = noise;
        let square = self.env[0] * self.env[0];
        let fourth = square * square;
        let frequencies = [
            self.kick_base + self.kick_sweep * fourth,
            8350.0,
            185.0,
            1100.0,
            self.bass_frequency,
            340.0 + 300.0 * self.env[5],
            self.bass_frequency * 4.0,
            7100.0,
            9200.0,
            3100.0,
            4300.0,
            1800.0,
            92.0 + 60.0 * self.env[12],
            155.0 + 90.0 * self.env[13],
            540.0,
            205.0 + 35.0 * self.env[15],
            self.bass_frequency * 2.0,
            self.bass_frequency * 4.0,
            1200.0,
            180.0 + 2200.0 * self.env[19] * self.env[19],
        ];
        let mut voices = [0.0; VOICE_COUNT];
        for voice in 0..VOICE_COUNT {
            self.phase[voice] = (self.phase[voice] + frequencies[voice] / rate).fract();
            if self.env[voice] > 1e-7 && self.gain[voice] > 0.0 {
                let p = TAU * self.phase[voice];
                let tone = match voice {
                    0 => {
                        (p.sin() * 0.68 + noise * self.kick_punch * fourth * square)
                            * self.kick_level
                    }
                    1 => (bright * 0.7 + p.sin() * 0.3) * 0.13,
                    2 => (noise * 0.7 + p.sin() * 0.3) * 0.24,
                    3 => noise * 0.18,
                    4 => (p.sin() + 0.25 * (p * 2.0).sin()) * 0.23,
                    5 => p.sin() * 0.18,
                    6 => (p.sin() + 0.35 * (p * 1.5).sin()) * 0.10,
                    7 => (bright * 0.8 + p.sin() * 0.2) * 0.16,
                    8 => bright * (0.65 + 0.35 * (p * 0.17).sin()) * 0.18,
                    9 => (p.sin() + (p * 1.417).sin() * 0.7 + (p * 1.923).sin() * 0.45) * 0.075,
                    10 => (bright * 0.8 + (p * 1.731).sin() * 0.2) * 0.18,
                    11 => (p.sin() + (p * 1.333).sin() * 0.55) * 0.14,
                    12 => p.sin() * 0.27,
                    13 => (p.sin() + (p * 1.8).sin() * 0.12) * 0.23,
                    14 => (p.sin().signum() * 0.6 + (p * 1.48148).sin().signum() * 0.4) * 0.13,
                    15 => (p.sin() + (p * 2.19).sin() * 0.14) * 0.22,
                    16 => ((self.phase[voice] * 2.0 - 1.0) * 2.4).tanh() * 0.18,
                    17 => (p.sin() + (p * 1.2599).sin() * 0.65 + (p * 1.4983).sin() * 0.6) * 0.09,
                    18 => noise * (0.5 + 0.5 * (p * 0.013).sin()) * 0.16,
                    19 => p.sin() * 0.20,
                    _ => 0.0,
                };
                voices[voice] = tone * self.env[voice];
            }
            self.env[voice] *= self.decay[voice];
            if elements & (1 << voice) == 0 {
                self.env[voice] *= 0.97;
            }
            if self.env[voice] < 1e-12 {
                self.env[voice] = 0.0;
            }
        }
        let mut output = [0.0; 2];
        for (voice, sample) in voices.iter().enumerate() {
            output[0] += sample * self.left[voice];
            output[1] += sample * self.right[voice];
        }
        output
    }
}

struct Deck {
    rate: f64,
    bpm: f64,
    pitch: f64,
    bend: f64,
    position: f64,
    playing: bool,
    elements: u32,
    seed: u32,
    gain: f64,
    smooth_gain: f64,
    pcm: Vec<f32>,
    source_rate: f64,
    pcm_active: bool,
    looping: bool,
    cue: f64,
    beat_offset: f64,
    synth: Synth,
    eq: [Biquad; 3],
    peak: f64,
}
impl Deck {
    fn new(rate: f64, bpm: f64, seed: u32) -> Self {
        Self {
            rate,
            bpm,
            pitch: 0.0,
            bend: 0.0,
            position: 0.0,
            playing: false,
            elements: 1,
            seed,
            gain: 1.0,
            smooth_gain: 0.0,
            pcm: Vec::new(),
            source_rate: rate,
            pcm_active: false,
            looping: true,
            cue: 0.0,
            beat_offset: 0.0,
            synth: Synth::new(rate, seed),
            eq: [Biquad::default(); 3],
            peak: 0.0,
        }
    }
    fn duration(&self) -> f64 {
        if self.pcm_active {
            (self.pcm.len() / 2) as f64 / self.source_rate
        } else {
            32.0 * 60.0 / self.bpm
        }
    }
    fn beat(&self) -> f64 {
        (self.position - self.beat_offset) * self.bpm / 60.0
    }
    fn effective_bpm(&self) -> f64 {
        self.bpm * (1.0 + (self.pitch + self.bend) / 100.0)
    }
    fn seek(&mut self, seconds: f64) {
        self.position = seconds.max(0.0).min(self.duration());
        self.synth.reset();
        for eq in &mut self.eq {
            eq.clear();
        }
    }
    fn set(&mut self, param: u32, value: f64) {
        if !value.is_finite() {
            return;
        }
        match param {
            0 => self.playing = value != 0.0,
            1 => {
                let bpm = value.clamp(30.0, 300.0);
                if !self.pcm_active {
                    // A generated loop is defined in beats: preserve its playhead,
                    // saved cue, and grid beats when changing only the tempo.
                    let ratio = self.bpm / bpm;
                    self.position *= ratio;
                    self.cue *= ratio;
                    self.beat_offset *= ratio;
                }
                self.bpm = bpm;
            }
            2 => self.pitch = value.clamp(-50.0, 50.0),
            3 => self.elements = (value as u32) & ELEMENT_MASK,
            4 => {
                self.position = (self.position + value * 60.0 / self.bpm)
                    .rem_euclid(self.duration().max(0.001));
                self.synth.reset();
            }
            5 => self.seek(value),
            6 => self.seek(self.cue),
            7 => self.cue = self.position,
            8..=10 => self.eq[(param - 8) as usize].configure(
                (param - 8) as usize,
                value.clamp(-24.0, 12.0),
                self.rate,
            ),
            11 => self.gain = value.clamp(0.0, 2.0),
            12 => {
                if value == 0.0 {
                    self.pcm_active = false;
                    self.seek(0.0);
                }
            }
            13 => self.looping = value != 0.0,
            14 => self.beat_offset = value.clamp(0.0, self.duration()),
            15 => self.bend = value.clamp(-20.0, 20.0),
            _ => {}
        }
    }
    fn randomize(&mut self, seed: u32, bpm: f64) {
        self.seed = seed.max(1);
        self.synth.apply_seed(self.rate, self.seed);
        self.pcm_active = false;
        self.set(1, bpm);
        self.pitch = 0.0;
        self.bend = 0.0;
        self.cue = 0.0;
        self.beat_offset = 0.0;
        self.seek(0.0);
    }
    fn reserve(&mut self, frames: usize, source_rate: f64, bpm: f64) -> *mut f32 {
        if !(2..=MAX_PCM_FRAMES).contains(&frames)
            || !source_rate.is_finite()
            || !(8000.0..=192000.0).contains(&source_rate)
        {
            return std::ptr::null_mut();
        }
        let mut new_pcm = Vec::new();
        if new_pcm.try_reserve_exact(frames * 2).is_err() {
            return std::ptr::null_mut();
        }
        new_pcm.resize(frames * 2, 0.0);
        self.playing = false;
        self.pcm_active = false;
        self.pcm = new_pcm;
        self.source_rate = source_rate;
        self.set(1, bpm);
        self.pitch = 0.0;
        self.bend = 0.0;
        self.cue = 0.0;
        self.beat_offset = 0.0;
        self.position = 0.0;
        self.pcm.as_mut_ptr()
    }
    fn commit(&mut self) {
        if self.pcm.len() >= 4 {
            self.pcm_active = true;
            self.seek(0.0);
        }
    }
    #[inline]
    fn sample(&mut self) -> [f32; 2] {
        let target = if self.playing { self.gain } else { 0.0 };
        self.smooth_gain += (target - self.smooth_gain) * 0.02;
        if !self.playing && self.smooth_gain < 0.00001 {
            self.smooth_gain = 0.0;
            return [0.0; 2];
        }
        let mut sample = if self.pcm_active {
            let frames = self.pcm.len() / 2;
            let index = self.position * self.source_rate;
            let current = if self.looping {
                index.floor() as usize % frames
            } else {
                (index.floor() as usize).min(frames - 1)
            };
            let next = if current + 1 < frames {
                current + 1
            } else if self.looping {
                0
            } else {
                current
            };
            let frac = index.fract();
            [
                self.pcm[current * 2] as f64 * (1.0 - frac) + self.pcm[next * 2] as f64 * frac,
                self.pcm[current * 2 + 1] as f64 * (1.0 - frac)
                    + self.pcm[next * 2 + 1] as f64 * frac,
            ]
        } else {
            self.synth
                .render(self.beat(), self.elements, self.seed, self.rate)
        };
        for (ch, value) in sample.iter_mut().enumerate() {
            for eq in &mut self.eq {
                *value = eq.sample(*value, ch);
            }
            let v = *value * self.smooth_gain;
            // Soft safety limiter, unity below 0.8, asymptotically bounded at 1.
            *value = if v.abs() > 0.8 {
                v.signum() * (0.8 + 0.2 * ((v.abs() - 0.8) / 0.2).tanh())
            } else {
                v
            };
            if !value.is_finite() {
                *value = 0.0;
            }
            self.peak = self.peak.max(value.abs());
        }
        if self.playing {
            self.position += (1.0 + (self.pitch + self.bend) / 100.0) / self.rate;
            if self.position >= self.duration() {
                if self.looping {
                    self.position %= self.duration().max(0.001);
                } else {
                    self.position = self.duration();
                    self.playing = false;
                }
            }
        }
        [sample[0] as f32, sample[1] as f32]
    }
}

struct Engine {
    decks: [Deck; 2],
    output: [f32; BLOCK * 4],
}
impl Engine {
    fn new(rate: f64) -> Self {
        let rate = if rate.is_finite() {
            rate.clamp(8000.0, 192000.0)
        } else {
            48000.0
        };
        Self {
            decks: [Deck::new(rate, 120.0, 17), Deck::new(rate, 124.0, 53)],
            output: [0.0; BLOCK * 4],
        }
    }
    fn render(&mut self, frames: usize) -> *const f32 {
        let count = frames.min(BLOCK);
        for d in 0..2 {
            self.decks[d].peak = 0.0;
            for i in 0..count {
                let s = self.decks[d].sample();
                self.output[d * BLOCK * 2 + i] = s[0];
                self.output[d * BLOCK * 2 + BLOCK + i] = s[1];
            }
            for i in count..BLOCK {
                self.output[d * BLOCK * 2 + i] = 0.0;
                self.output[d * BLOCK * 2 + BLOCK + i] = 0.0;
            }
        }
        self.output.as_ptr()
    }
}

// AudioWorklet invokes the ABI exclusively on its one render thread. Each WASM
// instance has isolated globals; the native tests instantiate Engine directly.
static mut ENGINE: Option<Box<Engine>> = None;
fn with_engine<T>(default: T, f: impl FnOnce(&mut Engine) -> T) -> T {
    unsafe {
        let ptr = std::ptr::addr_of_mut!(ENGINE);
        match (*ptr).as_mut() {
            Some(e) => f(e),
            None => default,
        }
    }
}
#[no_mangle]
pub extern "C" fn engine_init(rate: f64) {
    unsafe {
        ENGINE = Some(Box::new(Engine::new(rate)));
    }
}
#[no_mangle]
pub extern "C" fn engine_render(frames: u32) -> *const f32 {
    with_engine(std::ptr::null(), |e| e.render(frames as usize))
}
#[no_mangle]
pub extern "C" fn engine_set(deck: u32, param: u32, value: f64) {
    with_engine((), |e| {
        if let Some(d) = e.decks.get_mut(deck as usize) {
            d.set(param, value);
        }
    });
}
#[no_mangle]
pub extern "C" fn engine_randomize(deck: u32, seed: u32, bpm: f64) {
    with_engine((), |e| {
        if let Some(d) = e.decks.get_mut(deck as usize) {
            d.randomize(seed, bpm);
        }
    });
}
#[no_mangle]
pub extern "C" fn engine_reserve(deck: u32, frames: u32, rate: f64, bpm: f64) -> *mut f32 {
    with_engine(std::ptr::null_mut(), |e| {
        e.decks
            .get_mut(deck as usize)
            .map_or(std::ptr::null_mut(), |d| {
                d.reserve(frames as usize, rate, bpm)
            })
    })
}
#[no_mangle]
pub extern "C" fn engine_commit(deck: u32) {
    with_engine((), |e| {
        if let Some(d) = e.decks.get_mut(deck as usize) {
            d.commit();
        }
    });
}
#[no_mangle]
pub extern "C" fn engine_position(deck: u32) -> f64 {
    with_engine(0.0, |e| {
        e.decks.get(deck as usize).map_or(0.0, |d| d.position)
    })
}
#[no_mangle]
pub extern "C" fn engine_beat(deck: u32) -> f64 {
    with_engine(0.0, |e| e.decks.get(deck as usize).map_or(0.0, Deck::beat))
}
#[no_mangle]
pub extern "C" fn engine_bpm(deck: u32) -> f64 {
    with_engine(0.0, |e| {
        e.decks.get(deck as usize).map_or(0.0, Deck::effective_bpm)
    })
}
#[no_mangle]
pub extern "C" fn engine_peak(deck: u32) -> f64 {
    with_engine(0.0, |e| e.decks.get(deck as usize).map_or(0.0, |d| d.peak))
}
#[no_mangle]
pub extern "C" fn engine_duration(deck: u32) -> f64 {
    with_engine(0.0, |e| {
        e.decks.get(deck as usize).map_or(0.0, Deck::duration)
    })
}
#[no_mangle]
pub extern "C" fn engine_playing(deck: u32) -> u32 {
    with_engine(0, |e| {
        e.decks.get(deck as usize).map_or(0, |d| d.playing as u32)
    })
}

#[no_mangle]
pub extern "C" fn engine_voice_count() -> u32 {
    VOICE_COUNT as u32
}
#[no_mangle]
pub extern "C" fn engine_voice(deck: u32, voice: u32, param: u32, value: f64) {
    with_engine((), |e| {
        if let Some(d) = e.decks.get_mut(deck as usize) {
            d.synth.set_voice(voice as usize, param, value);
        }
    });
}
#[no_mangle]
pub extern "C" fn engine_voice_pattern(deck: u32, voice: u32) -> u32 {
    with_engine(0, |e| {
        e.decks
            .get(deck as usize)
            .map_or(0, |d| d.synth.preview(voice as usize))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn advance(e: &mut Engine, frames: usize) {
        for _ in 0..frames / BLOCK {
            e.render(BLOCK);
        }
        e.render(frames % BLOCK);
    }
    #[test]
    fn paused_is_silent() {
        let mut e = Engine::new(48000.0);
        e.render(128);
        assert!(e.output.iter().all(|v| *v == 0.0));
        assert_eq!(e.decks[0].position, 0.0);
    }
    #[test]
    fn synth_produces_signal_on_independent_decks() {
        let mut e = Engine::new(48000.0);
        e.decks[0].set(0, 1.0);
        e.render(128);
        assert!(e.output[..256].iter().any(|v| v.abs() > 0.01));
        assert!(e.output[256..].iter().all(|v| *v == 0.0));
    }
    #[test]
    fn bpm_and_pitch_advance_beats_correctly() {
        let mut e = Engine::new(48000.0);
        e.decks[0].set(0, 1.0);
        e.decks[0].set(2, 10.0);
        advance(&mut e, 48000);
        assert!((e.decks[0].position - 1.1).abs() < 1e-8);
        assert!((e.decks[0].beat() - 2.2).abs() < 1e-8);
        assert!((e.decks[0].effective_bpm() - 132.0).abs() < 1e-8);
    }
    #[test]
    fn stereo_pcm_is_interpolated_and_looped() {
        let mut e = Engine::new(8000.0);
        let d = &mut e.decks[0];
        d.reserve(4, 8000.0, 120.0);
        d.pcm = vec![0.2, -0.2, 0.4, -0.4, 0.6, -0.6, 0.0, 0.0];
        d.commit();
        d.smooth_gain = 1.0;
        d.set(0, 1.0);
        d.set(2, -50.0);
        let a = d.sample();
        let b = d.sample();
        assert!((a[0] - 0.2).abs() < 1e-6);
        assert!((b[0] - 0.3).abs() < 1e-6);
        assert_eq!(a[0], -a[1]);
        for _ in 0..30 {
            d.sample();
        }
        assert!(d.position < d.duration());
        assert!(d.playing);
    }
    #[test]
    fn non_looping_pcm_stops_at_end() {
        let mut e = Engine::new(8000.0);
        let d = &mut e.decks[0];
        d.reserve(4, 8000.0, 120.0);
        d.commit();
        d.set(13, 0.0);
        d.set(0, 1.0);
        for _ in 0..5 {
            d.sample();
        }
        assert!(!d.playing);
        assert_eq!(d.position, d.duration());
    }
    #[test]
    fn cue_seek_and_nudge_are_source_time() {
        let mut e = Engine::new(48000.0);
        let d = &mut e.decks[0];
        d.set(5, 3.0);
        d.set(7, 1.0);
        d.set(4, 0.5);
        assert_eq!(d.position, 3.25);
        d.set(6, 1.0);
        assert_eq!(d.position, 3.0);
    }
    #[test]
    fn all_elements_and_extreme_eq_stay_finite_and_bounded() {
        let mut e = Engine::new(48000.0);
        for d in &mut e.decks {
            d.set(3, ELEMENT_MASK as f64);
            d.set(0, 1.0);
            for p in 8..=10 {
                d.set(p, 12.0);
            }
            d.set(11, 2.0);
        }
        for _ in 0..1000 {
            e.render(128);
            assert!(e.output.iter().all(|v| v.is_finite() && v.abs() <= 1.0));
        }
    }
    #[test]
    fn invalid_parameters_do_not_poison_dsp() {
        let mut e = Engine::new(f64::NAN);
        let d = &mut e.decks[0];
        d.set(1, f64::NAN);
        d.set(2, f64::INFINITY);
        assert_eq!(d.bpm, 120.0);
        assert_eq!(d.pitch, 0.0);
        assert!(d.reserve(1, 48000.0, 120.0).is_null());
        assert!(d.reserve(usize::MAX, 48000.0, 120.0).is_null());
        assert!(d.reserve(8, f64::NAN, 120.0).is_null());
    }
    #[test]
    fn randomization_is_deterministic() {
        let mut a = Engine::new(48000.0);
        let mut b = Engine::new(48000.0);
        for e in [&mut a, &mut b] {
            e.decks[0].randomize(927, 128.0);
            e.decks[0].set(3, 127.0);
            e.decks[0].set(0, 1.0);
        }
        for _ in 0..100 {
            a.render(128);
            b.render(128);
            assert_eq!(a.output, b.output);
        }
    }
    #[test]
    fn eq_changes_audio_energy() {
        let mut flat = Engine::new(48000.0);
        let mut cut = Engine::new(48000.0);
        flat.decks[0].set(0, 1.0);
        cut.decks[0].set(0, 1.0);
        cut.decks[0].set(8, -24.0);
        let mut ef = 0.0;
        let mut ec = 0.0;
        for _ in 0..100 {
            flat.render(128);
            cut.render(128);
            ef += flat.output[..128].iter().map(|v| v * v).sum::<f32>();
            ec += cut.output[..128].iter().map(|v| v * v).sum::<f32>();
        }
        assert!(ec < ef * 0.6);
    }
    #[test]
    fn bend_changes_transport_without_modifying_pitch() {
        let mut e = Engine::new(48000.0);
        e.decks[0].set(0, 1.0);
        e.decks[0].set(2, 5.0);
        e.decks[0].set(15, 10.0);
        advance(&mut e, 48000);
        assert!((e.decks[0].position - 1.15).abs() < 1e-8);
        assert_eq!(e.decks[0].pitch, 5.0);
        assert!((e.decks[0].effective_bpm() - 138.0).abs() < 1e-8);
        e.decks[0].set(15, 0.0);
        assert_eq!(e.decks[0].effective_bpm(), 126.0);
    }
    #[test]
    fn beat_offset_changes_grid_without_seeking() {
        let mut e = Engine::new(48000.0);
        e.decks[0].set(5, 3.0);
        e.decks[0].set(14, 0.25);
        assert_eq!(e.decks[0].position, 3.0);
        assert_eq!(e.decks[0].beat(), 5.5);
    }
    #[test]
    fn kick_only_seeds_have_reproducible_distinct_timbres() {
        fn sound(seed: u32) -> Vec<f32> {
            let mut deck = Deck::new(48000.0, 120.0, seed);
            deck.set(0, 1.0);
            (0..12000).map(|_| deck.sample()[0]).collect()
        }
        let a = sound(1);
        let repeat = sound(1);
        let b = sound(2);
        assert_eq!(a, repeat);
        let difference: f32 =
            a.iter().zip(&b).map(|(x, y)| (x - y).abs()).sum::<f32>() / a.len() as f32;
        assert!(
            difference > 0.08,
            "Changing a kick palette must be clearly audible"
        );
        for seed in 1..=8 {
            assert!(sound(seed)
                .iter()
                .all(|value| value.is_finite() && value.abs() <= 1.0));
        }
    }
    #[test]
    fn generated_tempo_change_keeps_pattern_playhead_and_cue_beats() {
        let mut deck = Deck::new(48000.0, 120.0, 927);
        deck.set(5, 3.0);
        deck.set(7, 1.0);
        deck.set(14, 0.25);
        deck.set(0, 1.0);
        let pattern = deck.synth.pattern;
        let beat = deck.beat();
        let cue_beat = deck.cue * deck.bpm / 60.0;
        deck.set(1, 130.0);
        assert!((deck.beat() - beat).abs() < 1e-12);
        assert!((deck.cue * deck.bpm / 60.0 - cue_beat).abs() < 1e-12);
        assert_eq!(deck.seed, 927);
        assert_eq!(deck.synth.pattern, pattern);
        assert!(deck.playing);
    }
    #[test]
    fn changing_one_deck_material_or_tempo_leaves_other_deck_audio_identical() {
        let mut changed = Engine::new(48000.0);
        let mut control = Engine::new(48000.0);
        for engine in [&mut changed, &mut control] {
            engine.decks[0].set(0, 1.0);
            engine.decks[1].set(3, 127.0);
            engine.decks[1].set(0, 1.0);
            engine.decks[1].set(5, 2.0);
            engine.decks[1].set(7, 1.0);
        }
        changed.decks[0].randomize(928, 120.0);
        changed.decks[0].set(1, 127.0);
        for _ in 0..100 {
            changed.render(128);
            control.render(128);
            assert_eq!(changed.output[256..], control.output[256..]);
        }
        assert_eq!(changed.decks[1].cue, control.decks[1].cue);
        assert_eq!(changed.decks[1].position, control.decks[1].position);
        assert_eq!(changed.decks[1].bpm, control.decks[1].bpm);
        assert_eq!(changed.decks[1].seed, control.decks[1].seed);
    }
    #[test]
    fn pcm_pitch_changes_preserve_samples_metadata_position_and_cue() {
        let mut deck = Deck::new(48000.0, 120.0, 53);
        deck.reserve(48000, 48000.0, 126.0);
        deck.pcm[100] = 0.45;
        deck.commit();
        deck.set(5, 0.25);
        deck.set(7, 1.0);
        deck.set(0, 1.0);
        let pointer = deck.pcm.as_ptr();
        deck.set(2, 4.5);
        assert_eq!(deck.bpm, 126.0);
        assert_eq!(deck.position, 0.25);
        assert_eq!(deck.cue, 0.25);
        assert_eq!(deck.pcm.as_ptr(), pointer);
        assert_eq!(deck.pcm[100], 0.45);
        assert!(deck.pcm_active);
        assert!(deck.playing);
    }
    #[test]
    fn phrase_downbeat_kick_is_audibly_accented_every_sixteen_beats() {
        for seed in 1..=8 {
            let mut deck = Deck::new(12000.0, 120.0, seed);
            deck.set(0, 1.0);
            deck.smooth_gain = 1.0;
            let mut energy = [0.0_f64; 32];
            for frame in 0..192000 {
                let sample = deck.sample()[0] as f64;
                if frame % 6000 < 4800 {
                    energy[frame / 6000] += sample * sample;
                }
            }
            assert!(
                energy[0] > energy[1] * 1.5,
                "First phrase accent missing for seed {seed}"
            );
            assert!(
                energy[16] > energy[17] * 1.5,
                "Second phrase accent missing for seed {seed}"
            );
            assert!((energy[16] / energy[0] - 1.0).abs() < 0.1);
        }
    }
    #[test]
    fn every_voice_can_be_composed_panned_and_silenced_independently() {
        for voice in 0..VOICE_COUNT {
            let mut deck = Deck::new(12000.0, 120.0, 927);
            deck.set(3, (1 << voice) as f64);
            deck.set(0, 1.0);
            deck.synth.set_voice(voice, 2, 1.0); // A single step on the bar downbeat.
            deck.synth.set_voice(voice, 1, -1.0);
            let mut energy = [0.0; 2];
            for _ in 0..2048 {
                let s = deck.sample();
                energy[0] += s[0].abs();
                energy[1] += s[1].abs();
            }
            assert!(
                energy[0] > 0.1,
                "Voice {voice} must produce its own audible signal"
            );
            assert!(
                energy[1] < 1e-5,
                "Voice {voice} pan must isolate the right channel"
            );
            deck.synth.set_voice(voice, 0, 0.0);
            assert!(deck.sample().iter().all(|x| x.abs() < 1e-6));
            deck.synth.set_voice(voice, 0, 1.0);
            deck.synth.set_voice(voice, 2, 0.0);
            deck.seek(0.0);
            for _ in 0..512 {
                assert_eq!(deck.sample(), [0.0, 0.0]);
            }
        }
    }
    #[test]
    fn manual_patterns_override_model_and_track_change_keeps_voice_mix() {
        let mut deck = Deck::new(48000.0, 120.0, 927);
        deck.synth.set_voice(19, 0, 0.4);
        deck.synth.set_voice(19, 1, 0.8);
        deck.synth.set_voice(19, 2, 0x8421 as f64);
        assert_eq!(deck.synth.preview(19), 0x8421);
        deck.randomize(928, 120.0);
        assert_eq!(deck.synth.overrides[19], -1);
        assert_eq!(deck.synth.gain[19], 0.4);
        assert_eq!(deck.synth.pan[19], 0.8);
        assert_eq!(deck.synth.preview(0), 0x1111);
        deck.synth.set_voice(0, 2, 1.0);
        assert_eq!(deck.synth.preview(0), 1);
        deck.synth.set_voice(0, 3, 0.0);
        assert_eq!(deck.synth.preview(0), 0x1111);
    }
}
