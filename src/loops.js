// Named generated loops for the Loop builder (and By ear / Star mode). Each one is made by the
// app's own rhythm model from a fixed seed, so every note comes from the model, on your device.
// What makes each loop its own is the pick: which instruments play, which of their sounds, at what
// level and where in the stereo field, and its home tempo.
//
// A voice is a sound name, or [sound, level 0–1.5, pan -1…1]. Every loop plays the kick.
import { voiceIndex, soundIndex } from './instruments.js';

const RAW_LOOPS = [
  { id: 'lemon-haze', name: 'Lemon Haze', vibe: 'Dusty lo-fi house, warm sub and vinyl crackle', bpm: 112, seed: 0x5a17c3e1,
    voices: { kick: 'Dusty Tape', closedHat: ['Dusty', .75], rim: ['Wood Rim', .9, -.2], bass: 'Warm Sub', chord: ['Dreamy', .8], noise: ['Vinyl', .7] } },
  { id: 'sunday-driver', name: 'Sunday Driver', vibe: 'Easy deep house with soft keys', bpm: 120, seed: 0x2c0ffee5,
    voices: { kick: 'Velvet', closedHat: ['Crisp', .7, .15], clap: ['Warm', .8], bass: 'Round', synth: ['Soft Keys', .85], shaker: ['Egg', .6, -.35] } },
  { id: 'low-tide', name: 'Low Tide', vibe: 'Dub techno, washed out and slow', bpm: 118, seed: 0x7e1de001,
    voices: { kick: 'Velvet', openHat: ['Dusty', .6, .2], bass: 'Dub', chord: ['Sus Haze', .75], noise: ['Ocean', .8] } },
  { id: 'palm-shade', name: 'Palm Shade', vibe: 'Balearic sway with congas and a cloud pad', bpm: 114, seed: 0x0a1b5ade,
    voices: { kick: 'Pillow', conga: ['Open', .9, -.3], shaker: ['Sand', .6, .35], bass: 'Round', synth: ['Cloud Pad', .9], perc: ['Hand Drum', .7, .2] } },
  { id: 'velvet-hour', name: 'Velvet Hour', vibe: 'Late-night groove, jazzy ride and sunrise chords', bpm: 116, seed: 0x3e1fe7a2,
    voices: { kick: 'Velvet', rim: ['Click', .7, .25], closedHat: ['Silk', .7], bass: 'Warm Sub', chord: ['Sunrise', .8], ride: ['Jazz', .7, -.2] } },
  { id: 'midnight-laundromat', name: 'Midnight Laundromat', vibe: 'Minimal and tidy, little bloops in the spin cycle', bpm: 122, seed: 0x6d1d4a7e,
    voices: { kick: 'Knock', closedHat: ['Tick', .8], perc: ['Wood', .8, -.3], bass: 'Pluck', zap: ['Bloop', .6, .4], noise: ['Static', .35] } },
  { id: 'cloud-nine-cafe', name: 'Cloud Nine Café', vibe: 'Brushed snare, jazz ride and keys over a soft kick', bpm: 108, seed: 0x1cafe009,
    voices: { kick: 'Pillow', snare: ['Brush', .9], ride: ['Jazz', .7, .2], bass: 'Round', synth: ['Soft Keys', .8], noise: ['Vinyl', .6] } },
  { id: 'slow-motion-sunset', name: 'Slow Motion Sunset', vibe: 'Downtempo boom with lo-fi snare and a swelling crash', bpm: 106, seed: 0x5e75e7a1,
    voices: { kick: '808 Boom', snare: ['Lo-Fi', .85], closedHat: ['Dusty', .65, -.15], chord: ['Dreamy', .75], bass: 'Warm Sub', crash: ['Swell', .55] } },
  { id: 'neon-rain', name: 'Neon Rain', vibe: 'Glowing synth, plucked bass and a light drizzle', bpm: 118, seed: 0x4e0a7a11,
    voices: { kick: 'Club Punch', clap: ['Snappy', .75], openHat: ['Airy', .65, .2], bass: 'Pluck', synth: ['Glow', .8], shaker: ['Drizzle', .7, -.4] } },
  { id: 'kombucha-club', name: 'Kombucha Club', vibe: 'Playful percussion with a mellow acid line', bpm: 121, seed: 0x0b0cc4a5,
    voices: { kick: 'Club Punch', cowbell: ['Agogo', .6, .35], conga: ['Slap', .75, -.3], closedHat: ['Crisp', .7], bass: 'Round', acid: ['Mellow', .7] } },
  { id: 'paper-lanterns', name: 'Paper Lanterns', vibe: 'Soft and sparkly, made for floating', bpm: 110, seed: 0x1a7e4115,
    voices: { kick: 'Pillow', rim: ['Tock', .8, -.2], shaker: ['Egg', .55, .3], synth: ['Sparkle', .7], chord: ['Sus Haze', .75], bass: 'Warm Sub' } },
  { id: 'hammock-theory', name: 'Hammock Theory', vibe: 'Barely trying: tumba, sand and a breeze', bpm: 104, seed: 0x4a3d0c42,
    voices: { kick: 'Velvet', conga: ['Tumba', .85, -.25], shaker: ['Sand', .55, .3], bass: 'Warm Sub', noise: ['Wind', .7], chord: ['Dreamy', .7] } },
  { id: 'polaroid-summer', name: 'Polaroid Summer', vibe: 'Faded nu-disco with shimmering hats and disco toms', bpm: 117, seed: 0x9013a1d5,
    voices: { kick: 'Dusty Tape', clap: ['Warm', .8], openHat: ['Shimmer', .6, .25], bass: 'Pluck', synth: ['Glow', .75], highTom: ['Disco', .55, -.35] } },
  { id: 'moss-and-marble', name: 'Moss & Marble', vibe: 'Organic wood, skin and a ringing ride', bpm: 115, seed: 0x3055a2b1,
    voices: { kick: 'Velvet', perc: ['Wood', .75, .3], conga: ['Open', .8, -.3], rim: ['Wood Rim', .75], bass: 'Round', ride: ['Ping', .55, .15] } },
  { id: 'satellite-lounge', name: 'Satellite Lounge', vibe: 'Spacey dub with a passing UFO', bpm: 119, seed: 0x5a7e1173,
    voices: { kick: 'Knock', closedHat: ['Silk', .7, .2], zap: ['UFO', .5, -.45], synth: ['Cloud Pad', .85], bass: 'Dub', crash: ['Swell', .5] } },
  { id: 'tangerine-tape', name: 'Tangerine Tape', vibe: 'Crunchy tape loop with a mellow acid hum', bpm: 113, seed: 0x7a9e7a9e,
    voices: { kick: 'Dusty Tape', snare: ['Lo-Fi', .8], closedHat: ['Dusty', .7, -.2], bass: 'Round', acid: ['Mellow', .6], noise: ['Vinyl', .65] } },
  { id: 'blue-hour-ferry', name: 'Blue Hour Ferry', vibe: 'Sidestick, sunrise chords and the sea', bpm: 116, seed: 0x0b1e0f37,
    voices: { kick: 'Velvet', rim: ['Sidestick', .75, .2], shaker: ['Sand', .55, -.2], bass: 'Warm Sub', chord: ['Sunrise', .8], noise: ['Ocean', .75] } },
  { id: 'rooftop-garden', name: 'Rooftop Garden', vibe: 'Sunny house: claps, bongos and soft keys', bpm: 122, seed: 0x6a2de4f0,
    voices: { kick: 'Club Punch', clap: ['Handclap', .75], shaker: ['Egg', .6, .35], conga: ['Bongo', .7, -.35], bass: 'Round', synth: ['Soft Keys', .8] } },
  { id: 'static-bloom', name: 'Static Bloom', vibe: 'Glitchy minimal with drips and fuzz', bpm: 124, seed: 0x57a71cb1,
    voices: { kick: 'Knock', rim: ['Click', .7, .3], closedHat: ['Tick', .8, -.15], zap: ['Drip', .6, -.35], bass: 'Pluck', noise: ['Static', .4] } },
  { id: 'honey-drip', name: 'Honey Drip', vibe: 'Slow and sticky: 808 boom and raindrops', bpm: 109, seed: 0x40e7d219,
    voices: { kick: '808 Boom', snare: ['Brush', .85], perc: ['Raindrop', .7, .3], bass: 'Warm Sub', chord: ['Dreamy', .75], shaker: ['Drizzle', .6, -.3] } },
  { id: 'night-bus-home', name: 'Night Bus Home', vibe: 'Dub bass, a soft glow and wind at the windows', bpm: 120, seed: 0x0b05f00d,
    voices: { kick: 'Velvet', closedHat: ['Dusty', .7, .15], rim: ['Click', .65, -.25], bass: 'Dub', synth: ['Glow', .7], noise: ['Wind', .6] } },
  { id: 'coconut-telephone', name: 'Coconut Telephone', vibe: 'Cowbell calls, congas answer', bpm: 118, seed: 0xc0c0a7e1,
    voices: { kick: 'Pillow', cowbell: ['808 Bell', .55, .3], conga: ['Open', .8, -.3], perc: ['Wood', .7, .15], bass: 'Pluck', closedHat: ['Crisp', .65] } },
  { id: 'pastel-arcade', name: 'Pastel Arcade', vibe: 'Bloops and sparkles from a quiet arcade', bpm: 123, seed: 0x9a57e1a7,
    voices: { kick: 'Club Punch', zap: ['Bloop', .55, .3], closedHat: ['Tick', .75], synth: ['Sparkle', .7], bass: 'Round', clap: ['Snappy', .7, -.15] } },
  { id: 'afterglow', name: 'Afterglow', vibe: 'Wide wash of cymbals and sunrise chords', bpm: 117, seed: 0xa47e9104,
    voices: { kick: 'Velvet', openHat: ['Sizzle', .55, .2], ride: ['Wash', .5, -.2], chord: ['Sunrise', .8], bass: 'Warm Sub', crash: ['Swell', .5] } },
];

// Resolves names to the engine's voice and sound numbers; a misspelled name fails loudly here.
function resolve(loop) {
  const voices = {};
  let elements = 0;
  for (const [key, spec] of Object.entries(loop.voices)) {
    const [soundName, gain = 1, pan = 0] = Array.isArray(spec) ? spec : [spec];
    const voice = voiceIndex(key), sound = soundIndex(voice, soundName);
    if (voice < 0 || sound < 0) throw new Error(`Loop ${loop.id}: unknown sound ${key} / ${soundName}`);
    voices[voice] = { sound, gain, pan };
    elements |= 1 << voice;
  }
  return Object.freeze({ id: loop.id, name: loop.name, vibe: loop.vibe, bpm: loop.bpm, seed: loop.seed >>> 0, elements, voices: Object.freeze(voices) });
}

export const LOOPS = Object.freeze(RAW_LOOPS.map(resolve));

export const findLoop = id => LOOPS.find(loop => loop.id === id) || null;
