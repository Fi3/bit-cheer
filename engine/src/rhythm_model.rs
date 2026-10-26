//! A tiny learned generative rhythm model, trained on Bit Cheer's authored corpus.
//!
//! Transition probabilities depend on instrument, sixteenth-note phase and the
//! previous event. Sampling runs only when creating/randomizing a deck. The audio
//! callback reads a 128-byte pattern and performs no model training or allocation.
//! The kick remains a strict quarter-note teaching reference by design.
use crate::rhythm_weights::PROBABILITIES;

pub(crate) const STEPS: usize = 128;

fn next_random(state: &mut u32) -> u32 {
    *state ^= *state << 13;
    *state ^= *state >> 17;
    *state ^= *state << 5;
    *state
}

pub(crate) fn generate(seed: u32) -> [u8; STEPS] {
    let mut random = seed.max(1);
    let mut previous = [false; 7];
    let mut pattern = [0_u8; STEPS];
    // One unrecorded bar warms up the first-order state before the recorded loop.
    for step in 0..(16 + STEPS) {
        let phase = step % 16;
        let mut mask = 0_u8;
        for instrument in 0..7 {
            let chance = PROBABILITIES[instrument][phase][usize::from(previous[instrument])];
            let sample = (next_random(&mut random) >> 16) as u16;
            let hit = if instrument == 0 {
                phase.is_multiple_of(4)
            } else {
                sample < chance
            };
            previous[instrument] = hit;
            if hit {
                mask |= 1 << instrument;
            }
        }
        if step >= 16 {
            pattern[step - 16] = mask;
        }
    }
    pattern
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn same_seed_reproduces_every_note() {
        for seed in [1, 2, 927, 0xdead_beef, u32::MAX] {
            assert_eq!(generate(seed), generate(seed));
        }
        assert_eq!(generate(0), generate(1));
    }

    #[test]
    fn independently_sampled_seeds_make_distinct_rhythms() {
        let variants: HashSet<_> = (1..=64).map(generate).collect();
        assert!(variants.len() >= 60);
        let pattern = generate(927);
        assert_ne!(pattern[..16], pattern[16..32]);
    }

    #[test]
    fn beginner_kicks_are_always_on_quarter_notes() {
        for seed in 1..=128 {
            for (step, mask) in generate(seed).iter().enumerate() {
                assert_eq!(mask & 1 != 0, step.is_multiple_of(4));
                assert_eq!(mask & 128, 0);
            }
        }
    }

    #[test]
    fn training_learns_phase_and_previous_note_dependence() {
        let hats = PROBABILITIES[1];
        assert!(hats[2][0] > hats[0][0]); // Authored hats prefer offbeats.
        assert!(hats.iter().any(|phase| phase[0] != phase[1]));
        let snare = PROBABILITIES[2];
        assert!(snare[4][0] > 60000); // Backbeat retained statistically.
        assert!(snare[0][0] < 2000);
    }

    #[test]
    fn samples_follow_learned_backbeat_distribution() {
        let mut backbeat = 0;
        let mut other = 0;
        for seed in 1..=256 {
            for (step, mask) in generate(seed).iter().enumerate() {
                if mask & 4 != 0 {
                    if step % 16 == 4 || step % 16 == 12 {
                        backbeat += 1;
                    } else {
                        other += 1;
                    }
                }
            }
        }
        assert!(backbeat > 3800);
        assert!(other < 800);
    }
}
