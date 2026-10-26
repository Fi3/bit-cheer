export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function tapTempo(times, now) {
  const taps = [...times.filter(t => now - t < 4000), now].slice(-9);
  if (taps.length < 2) return { times: taps, bpm: 0, taps: taps.length };
  const intervals = taps.slice(1).map((t, i) => t - taps[i]).filter(n => n > 180 && n < 2000).sort((a, b) => a - b);
  if (!intervals.length) return { times: [now], bpm: 0, taps: 1 };
  const middle = intervals[Math.floor(intervals.length / 2)];
  const clean = intervals.filter(x => Math.abs(x - middle) < middle * .25);
  return { times: taps, bpm: Math.round(60000 / (clean.reduce((a, b) => a + b, 0) / clean.length) * 10) / 10, taps: taps.length };
}
export function matchScore(decks, history = [], drill = '') {
  const tempoError = Math.abs(decks[0].bpm - decks[1].bpm);
  const phase = Math.abs(((decks[0].beat - decks[1].beat) % 1 + 1) % 1);
  let phaseError = Math.min(phase, 1 - phase) * 60000 / Math.max(1, decks[0].bpm);
  if (history.length) phaseError = history.reduce((sum, frame) => {
    const p = Math.abs(((frame[0].beat - frame[1].beat) % 1 + 1) % 1);
    return sum + Math.min(p, 1 - p) * 60000 / Math.max(1, frame[0].bpm);
  }, 0) / history.length;
  const period = drill === 'phrase' ? 16 : 1;
  if(period===16){
    const frames=history.length?history:[decks];
    phaseError=frames.reduce((sum,frame)=>{const p=((frame[0].beat-frame[1].beat)%period+period)%period;return sum+Math.min(p,period-p)*60000/Math.max(1,frame[0].bpm);},0)/frames.length;
  }
  const score = Math.round(clamp(100 - tempoError * 16 - (drill === 'tempo' ? 0 : phaseError * .24), 0, 100));
  let message = score >= 85 ? 'Locked in. Your tempos and beats are sitting together.' : tempoError > .6 ? 'Listen for drift. Adjust the pitch until the distance between kicks stops changing.' : 'Your tempos are close. Nudge the late deck forward until the kicks sound like one.';
  if(drill==='phrase' && phaseError>100)message='The kicks may agree, but the phrases differ. Align beat one of both 16-beat phrases with cue and the jog wheel.';
  if(drill==='tempo')message=score>=85?'The speeds match. Now try the phase drill to line up the beats.':'Listen for drift and adjust the pitch. This drill scores tempo only.';
  return { type: 'result', score, tempoError: Math.round(tempoError * 100) / 100, phaseError: Math.round(phaseError), message };
}
// Offline onset-envelope autocorrelation. Returns an estimate, never authoritative metadata.
export function estimateTempo(pcm, sampleRate) {
  const hop = Math.max(1, Math.floor(sampleRate / 200));
  const length = Math.min(Math.floor(pcm.length / hop), 200 * 90);
  if (length < 600) return null;
  const envelope = new Float64Array(length);
  let previous = 0, max = 0;
  for (let i = 0; i < length; i++) {
    let energy = 0;
    for (let j = 0; j < hop; j++) energy += Math.abs(pcm[i * hop + j] || 0);
    energy /= hop;
    envelope[i] = Math.max(0, energy - previous * .95);
    max = Math.max(max, envelope[i]); previous = energy;
  }
  if (max < .00005) return null;
  const rate = sampleRate / hop;
  let best = 0, bestLag = 0;
  for (let lag = Math.floor(rate * 60 / 180); lag <= Math.ceil(rate * 60 / 70); lag++) {
    let sum = 0, norm = 0;
    for (let i = lag; i < length; i++) { sum += envelope[i] * envelope[i-lag]; norm += envelope[i] * envelope[i]; }
    const score = sum / (norm || 1) - .025 * Math.abs(Math.log((rate * 60 / lag) / 120));
    if (score > best) { best = score; bestLag = lag; }
  }
  if (best < .08) return null;
  let first = 0;
  for (let i = 0; i < Math.min(length, bestLag * 4); i++) if (envelope[i] > max * .5) { first = i / rate; break; }
  return { bpm: Math.round(rate * 60 / bestLag * 10) / 10, offset: first, confidence: Math.min(1, best) };
}
export function waveformPeaks(pcm, count = 640) {
  const out = new Float32Array(count), stride = Math.max(1, Math.floor(pcm.length / count));
  for (let i = 0; i < count; i++) {
    let peak = 0;
    for (let j = i * stride; j < Math.min(pcm.length, (i + 1) * stride); j++) peak = Math.max(peak, Math.abs(pcm[j]));
    out[i] = peak;
  }
  return out;
}
export function generatedWaveform(mask, seed, count = 640) {
  return Float32Array.from({ length: count }, (_, i) => {
    const beat = i / count * 32, phase = beat % 1;
    const kick = mask & 1 ? Math.exp(-phase * 19) * .8 : 0;
    const hat = mask & 2 ? Math.exp(-(beat * 2 % 1) * 25) * .3 : 0;
    const snare = mask & 4 && Math.floor(beat) % 2 ? Math.exp(-phase * 14) * .45 : 0;
    const other = mask & 120 ? .08 * Math.abs(Math.sin(i * (seed % 7 + 1) * .34)) : 0;
    return Math.min(1, kick + hat + snare + other);
  });
}
