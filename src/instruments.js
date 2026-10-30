// The twenty-voice bank and each voice's named sound versions, in the engine's voice order.
// engine/src/sounds.rs holds how every sound is synthesized; its SOUND_COUNTS must match these lists
// (the worklet tests check). Sound 0 is the one a voice starts with.
export const INSTRUMENTS = [
  { key: 'kick', name: 'Kick', sounds: ['Velvet', 'Club Punch', '808 Boom', 'Dusty Tape', 'Knock', 'Pillow'] },
  { key: 'closedHat', name: 'Closed hat', sounds: ['Crisp', 'Dusty', 'Tick', 'Silk'] },
  { key: 'snare', name: 'Snare', sounds: ['Crack', 'Brush', 'Snap', 'Lo-Fi'] },
  { key: 'clap', name: 'Clap', sounds: ['Handclap', 'Warm', 'Snappy', 'Big Room'] },
  { key: 'bass', name: 'Bass', sounds: ['Round', 'Warm Sub', 'Pluck', 'Dub'] },
  { key: 'perc', name: 'Perc', sounds: ['Blip', 'Wood', 'Hand Drum', 'Raindrop'] },
  { key: 'synth', name: 'Synth', sounds: ['Glow', 'Cloud Pad', 'Soft Keys', 'Sparkle'] },
  { key: 'openHat', name: 'Open hat', sounds: ['Airy', 'Sizzle', 'Dusty', 'Shimmer'] },
  { key: 'shaker', name: 'Shaker', sounds: ['Sand', 'Egg', 'Cabasa', 'Drizzle'] },
  { key: 'ride', name: 'Ride', sounds: ['Bell', 'Jazz', 'Ping', 'Wash'] },
  { key: 'crash', name: 'Crash', sounds: ['Wide', 'Splash', 'Swell', 'Trashy'] },
  { key: 'rim', name: 'Rim', sounds: ['Click', 'Wood Rim', 'Sidestick', 'Tock'] },
  { key: 'lowTom', name: 'Low tom', sounds: ['Floor', 'Canyon', 'Tight', 'Disco'] },
  { key: 'highTom', name: 'High tom', sounds: ['Rack', 'Pop', 'Roto', 'Disco'] },
  { key: 'cowbell', name: 'Cowbell', sounds: ['808 Bell', 'Agogo', 'Muted', 'Clank'] },
  { key: 'conga', name: 'Conga', sounds: ['Open', 'Slap', 'Tumba', 'Bongo'] },
  { key: 'acid', name: 'Acid', sounds: ['Squelch', 'Mellow', 'Rubber', 'Fizz'] },
  { key: 'chord', name: 'Chord', sounds: ['Stab', 'Dreamy', 'Sunrise', 'Sus Haze'] },
  { key: 'noise', name: 'Noise', sounds: ['Static', 'Vinyl', 'Ocean', 'Wind'] },
  { key: 'zap', name: 'Zap', sounds: ['Laser', 'Bloop', 'Drip', 'UFO'] },
];

export const KICK_SOUNDS = INSTRUMENTS[0].sounds.length;

/** A voice's index from its key, or -1. */
export const voiceIndex = key => INSTRUMENTS.findIndex(instrument => instrument.key === key);

/** A sound's index within its voice from its name, or -1. */
export const soundIndex = (voice, name) => INSTRUMENTS[voice]?.sounds.indexOf(name) ?? -1;

/** Foundation's deck title, which names its kick. */
export const kickStudyName = sound => `KICK STUDY · ${INSTRUMENTS[0].sounds[sound].toUpperCase()}`;
