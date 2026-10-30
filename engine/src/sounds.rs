//! The instrument bank's sound versions: every voice has a few named sounds.
//! Their names live in `src/instruments.js`; this file only holds how they sound.
//! Sound 0 of every voice except the kick is the original Bit Cheer sound.
use crate::VOICE_COUNT;

pub(crate) const MAX_SOUNDS: usize = 6;

/// How many sound versions each voice has, in voice order.
pub(crate) const SOUND_COUNTS: [usize; VOICE_COUNT] =
    [6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

/// Decay time in seconds of each voice's sounds (unused slots repeat the first).
#[rustfmt::skip]
pub(crate) const DECAY_SECONDS: [[f64; MAX_SOUNDS]; VOICE_COUNT] = [
    [0.24, 0.13, 0.50, 0.17, 0.085, 0.20], // kick: Velvet, Club Punch, 808 Boom, Dusty Tape, Knock, Pillow
    [0.035, 0.05, 0.018, 0.06, 0.035, 0.035], // closed hat: Crisp, Dusty, Tick, Silk
    [0.12, 0.22, 0.07, 0.15, 0.12, 0.12], // snare: Crack, Brush, Snap, Lo-Fi
    [0.085, 0.11, 0.05, 0.26, 0.085, 0.085], // clap: Handclap, Warm, Snappy, Big Room
    [0.23, 0.38, 0.12, 0.42, 0.23, 0.23], // bass: Round, Warm Sub, Pluck, Dub
    [0.10, 0.05, 0.13, 0.08, 0.10, 0.10], // perc: Blip, Wood, Hand Drum, Raindrop
    [0.40, 0.90, 0.30, 0.12, 0.40, 0.40], // synth: Glow, Cloud Pad, Soft Keys, Sparkle
    [0.24, 0.36, 0.20, 0.30, 0.24, 0.24], // open hat: Airy, Sizzle, Dusty, Shimmer
    [0.055, 0.08, 0.035, 0.12, 0.055, 0.055], // shaker: Sand, Egg, Cabasa, Drizzle
    [0.45, 0.80, 0.25, 0.65, 0.45, 0.45], // ride: Bell, Jazz, Ping, Wash
    [0.85, 0.35, 0.90, 0.50, 0.85, 0.85], // crash: Wide, Splash, Swell, Trashy
    [0.025, 0.04, 0.03, 0.05, 0.025, 0.025], // rim: Click, Wood Rim, Sidestick, Tock
    [0.22, 0.35, 0.12, 0.20, 0.22, 0.22], // low tom: Floor, Canyon, Tight, Disco
    [0.14, 0.09, 0.10, 0.16, 0.14, 0.14], // high tom: Rack, Pop, Roto, Disco
    [0.12, 0.09, 0.05, 0.18, 0.12, 0.12], // cowbell: 808 Bell, Agogo, Muted, Clank
    [0.15, 0.06, 0.20, 0.09, 0.15, 0.15], // conga: Open, Slap, Tumba, Bongo
    [0.20, 0.15, 0.25, 0.12, 0.20, 0.20], // acid: Squelch, Mellow, Rubber, Fizz
    [0.65, 1.10, 1.10, 1.30, 0.65, 0.65], // chord: Stab, Dreamy, Sunrise, Sus Haze
    [0.30, 1.20, 0.80, 0.60, 0.30, 0.30], // noise: Static, Vinyl, Ocean, Wind
    [0.16, 0.10, 0.06, 0.30, 0.16, 0.16], // zap: Laser, Bloop, Drip, UFO
];

/// Kick sounds: resting pitch (Hz), pitch sweep (Hz), transient noise and drive (0 = clean).
pub(crate) const KICKS: [(f64, f64, f64, f64); 6] = [
    (44.0, 95.0, 0.02, 0.0),  // Velvet: deep and round
    (55.0, 185.0, 0.16, 0.0), // Club Punch: tight, with a click
    (41.0, 65.0, 0.0, 1.3),   // 808 Boom: long, low boom
    (50.0, 115.0, 0.05, 2.4), // Dusty Tape: warm and saturated
    (66.0, 260.0, 0.12, 0.0), // Knock: short techno knock
    (47.0, 38.0, 0.0, 0.0),   // Pillow: soft attack, gentle
];

/// Chord intervals (frequency ratios) for the smooth chord sounds 1–3; sound 0 is the classic stab.
pub(crate) const CHORDS: [[f64; 4]; 4] = [
    [1.0, 1.2599, 1.4983, 2.0],
    [1.0, 1.1892, 1.4983, 1.7818], // Dreamy: minor seventh
    [1.0, 1.2599, 1.4983, 1.8877], // Sunrise: major seventh
    [1.0, 1.1225, 1.4983, 2.0],    // Sus Haze: suspended second
];

/// One sample's shared sources: white noise, its bright (high-passed) and soft (low-passed) shades.
pub(crate) struct Sources {
    pub noise: f64,
    pub bright: f64,
    pub soft: f64,
    /// The bass line's current note, which the melodic voices follow.
    pub bass: f64,
}

/// A voice's oscillator frequency for its sound, given its envelope.
#[inline(always)]
pub(crate) fn frequency(voice: usize, sound: usize, env: f64, bass: f64) -> f64 {
    let square = env * env;
    match voice {
        0 => {
            let (base, sweep, _, _) = KICKS[sound];
            base + sweep * square * square
        }
        1 => [8350.0, 6100.0, 9800.0, 7400.0][sound],
        2 => [185.0, 160.0, 230.0, 170.0][sound],
        3 => 1100.0,
        4 => bass,
        5 => match sound {
            1 => 520.0 + 80.0 * env,
            2 => 260.0 + 140.0 * env,
            3 => 220.0 + 900.0 * square,
            _ => 340.0 + 300.0 * env,
        },
        6 => bass * if sound == 3 { 8.0 } else { 4.0 },
        7 => [7100.0, 8800.0, 5600.0, 6400.0][sound],
        8 => 9200.0,
        9 => [3100.0, 2700.0, 4200.0, 3400.0][sound],
        10 => 4300.0,
        11 => [1800.0, 1300.0, 2100.0, 900.0][sound],
        12 => match sound {
            1 => 70.0 + 45.0 * env,
            2 => 120.0 + 80.0 * env,
            3 => 80.0 + 260.0 * square,
            _ => 92.0 + 60.0 * env,
        },
        13 => match sound {
            1 => 200.0 + 100.0 * env,
            2 => 240.0 + 40.0 * env,
            3 => 150.0 + 300.0 * square,
            _ => 155.0 + 90.0 * env,
        },
        14 => [540.0, 800.0, 560.0, 420.0][sound],
        15 => match sound {
            1 => 260.0 + 60.0 * env,
            2 => 160.0 + 30.0 * env,
            3 => 330.0 + 50.0 * env,
            _ => 205.0 + 35.0 * env,
        },
        16 => bass * if sound == 3 { 4.0 } else { 2.0 },
        17 => bass * 4.0,
        18 => {
            if sound == 3 {
                3.0 // Wind: a slow gust
            } else {
                1200.0
            }
        }
        _ => match sound {
            1 => 300.0 + 700.0 * square,
            2 => 500.0 + 2500.0 * square * square,
            3 => 520.0 + 260.0 * (env * 25.0).sin(),
            _ => 180.0 + 2200.0 * square,
        },
    }
}

/// A voice's waveform for its sound before the envelope: `phase` is its oscillator (0–1),
/// `chord` the four chord partials' phases.
#[inline(always)]
pub(crate) fn tone(
    voice: usize,
    sound: usize,
    phase: f64,
    env: f64,
    s: &Sources,
    chord: &[f64; 4],
) -> f64 {
    let p = std::f64::consts::TAU * phase;
    // Rises from silence, peaks halfway down the envelope, then fades: a swell.
    let swell = || (1.0 - env) * 4.0;
    match voice {
        0 => {
            let (_, _, punch, drive) = KICKS[sound];
            let body = if drive > 0.0 {
                (p.sin() * drive).tanh() / drive.tanh()
            } else {
                p.sin()
            };
            let square = env * env;
            body * 0.68 + s.noise * punch * square * square * square
        }
        1 => match sound {
            1 => (s.noise * 0.5 + s.bright * 0.3) * 0.12,
            2 => (s.bright * 0.8 + p.sin() * 0.2) * 0.16,
            3 => (s.bright * 0.45 + p.sin() * 0.25 + (p * 2.0).sin() * 0.15) * 0.11,
            _ => (s.bright * 0.7 + p.sin() * 0.3) * 0.13,
        },
        2 => match sound {
            1 => (s.soft * 1.5 + s.noise * 0.1) * 0.2,
            2 => (s.bright * 0.55 + p.sin() * 0.45) * 0.26,
            3 => ((s.soft * 1.2 + p.sin() * 0.4) * 6.0).round() / 6.0 * 0.24,
            _ => (s.noise * 0.7 + p.sin() * 0.3) * 0.24,
        },
        3 => match sound {
            1 => s.soft * 1.4 * 0.2,
            2 => s.bright * 0.28,
            3 => s.noise * 0.11,
            _ => s.noise * 0.18,
        },
        4 => match sound {
            1 => p.sin() * 0.3,
            2 => (p.sin() + 0.5 * (p * 2.0).sin() + 0.25 * (p * 3.0).sin()) * 0.19,
            3 => (p.sin() * 2.2).tanh() * 0.2,
            _ => (p.sin() + 0.25 * (p * 2.0).sin()) * 0.23,
        },
        5 => match sound {
            1 => (p.sin() + 0.3 * (p * 2.0).sin()) * 0.19,
            2 => p.sin() * 0.2,
            3 => p.sin() * 0.17,
            _ => p.sin() * 0.18,
        },
        6 => match sound {
            1 => (p.sin() + 0.4 * (p * 2.0).sin()) * 0.08,
            2 => (p.sin() + 0.3 * (p * 3.0).sin() + 0.1 * (p * 4.0).sin()) * 0.11,
            3 => (p.sin() + 0.2 * (p * 2.0).sin()) * 0.10,
            _ => (p.sin() + 0.35 * (p * 1.5).sin()) * 0.10,
        },
        7 => match sound {
            1 => s.bright * 0.15,
            2 => (s.noise * 0.5 + s.bright * 0.3) * 0.14,
            3 => (s.bright * 0.5 + p.sin() * 0.25 + (p * 2.0).sin() * 0.15) * 0.13,
            _ => (s.bright * 0.8 + p.sin() * 0.2) * 0.16,
        },
        8 => match sound {
            1 => (s.noise * 0.4 + s.bright * 0.4) * 0.15,
            2 => s.bright * 0.22,
            3 => s.bright * (0.5 + 0.5 * (p * 0.31).sin()) * 0.11,
            _ => s.bright * (0.65 + 0.35 * (p * 0.17).sin()) * 0.18,
        },
        9 => {
            let metal = || p.sin() + (p * 1.417).sin() * 0.7 + (p * 1.923).sin() * 0.45;
            match sound {
                1 => metal() * 0.055 + s.bright * 0.04,
                2 => (p.sin() + (p * 2.0).sin() * 0.3) * 0.09,
                3 => (s.bright * 0.6 + (p * 1.417).sin() * 0.2) * 0.09,
                _ => metal() * 0.075,
            }
        }
        10 => {
            let wash = || s.bright * 0.8 + (p * 1.731).sin() * 0.2;
            match sound {
                1 => wash() * 0.16,
                2 => (s.bright * 0.6 + (p * 1.731).sin() * 0.15) * 0.2 * swell(),
                3 => (s.bright * 0.5 + s.noise * 0.4) * 0.15,
                _ => wash() * 0.18,
            }
        }
        11 => match sound {
            1 => (p.sin() + (p * 2.0).sin() * 0.4) * 0.15,
            2 => (p.sin() * 0.6 + s.bright * 0.4) * 0.17,
            3 => p.sin() * 0.19,
            _ => (p.sin() + (p * 1.333).sin() * 0.55) * 0.14,
        },
        12 => {
            if sound == 3 {
                p.sin() * 0.22
            } else {
                p.sin() * 0.27
            }
        }
        13 => match sound {
            1 => p.sin() * 0.22,
            2 | 3 => p.sin() * 0.2,
            _ => (p.sin() + (p * 1.8).sin() * 0.12) * 0.23,
        },
        14 => {
            let bell = || p.sin().signum() * 0.6 + (p * 1.48148).sin().signum() * 0.4;
            match sound {
                1 => (p.sin() + (p * 1.5).sin() * 0.4) * 0.13,
                2 => bell() * 0.12,
                3 => (p.sin() + (p * 2.76).sin() * 0.5) * 0.12,
                _ => bell() * 0.13,
            }
        }
        15 => match sound {
            1 => (p.sin() * 0.7 + s.bright * 0.3) * 0.22,
            2 => p.sin() * 0.24,
            3 => p.sin() * 0.2,
            _ => (p.sin() + (p * 2.19).sin() * 0.14) * 0.22,
        },
        16 => {
            let saw = phase * 2.0 - 1.0;
            match sound {
                1 => (saw * 1.1).tanh() * 0.15,
                2 => (p.sin() * 4.0).tanh() * 0.15,
                3 => (saw * 3.5).tanh() * 0.11,
                _ => (saw * 2.4).tanh() * 0.18,
            }
        }
        17 => {
            if sound == 0 {
                (p.sin() + (p * 1.2599).sin() * 0.65 + (p * 1.4983).sin() * 0.6) * 0.09
            } else {
                let tau = std::f64::consts::TAU;
                ((tau * chord[0]).sin()
                    + (tau * chord[1]).sin() * 0.8
                    + (tau * chord[2]).sin() * 0.7
                    + (tau * chord[3]).sin() * 0.5)
                    * 0.07
            }
        }
        18 => match sound {
            1 => {
                // Vinyl: rare crackles over a soft hiss.
                let crackle = if s.noise > 0.998 {
                    0.8
                } else if s.noise < -0.999 {
                    -0.5
                } else {
                    0.0
                };
                (crackle * 0.5 + s.soft * 0.35) * 0.2
            }
            2 => s.soft * 1.4 * 0.2 * swell(),
            3 => s.soft * (0.6 + 0.4 * p.sin()) * 0.25,
            _ => s.noise * (0.5 + 0.5 * (p * 0.013).sin()) * 0.16,
        },
        _ => match sound {
            1 => p.sin() * 0.18,
            2 => p.sin() * 0.16,
            3 => p.sin() * 0.14,
            _ => p.sin() * 0.20,
        },
    }
}
