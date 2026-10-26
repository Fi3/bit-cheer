export const PITCH_SENSITIVITIES = [0.01, 0.05, 0.25];
export function pitchSensitivity(value, shift = false) {
  if (shift) return 0.01;
  const parsed = Number(value);
  return PITCH_SENSITIVITIES.includes(parsed) ? parsed : 0.05;
}
export function wheelPitchDelta(event, sensitivity = 0.05) {
  const delta = Number(event.deltaY);
  if (!Number.isFinite(delta) || !delta) return 0;
  // Typical mouse detents are 100 CSS pixels, three lines, or one page.
  // Preserve fractional trackpad movement instead of rounding every event away.
  const ticks = delta / (event.deltaMode === 1 ? 3 : event.deltaMode === 2 ? 1 : 100);
  return -Math.max(-8, Math.min(8, ticks)) * pitchSensitivity(sensitivity, event.shiftKey);
}
export function keyPitchDelta(event, sensitivity = 0.05) {
  const step = pitchSensitivity(sensitivity, event.shiftKey);
  if (['ArrowUp', 'ArrowRight'].includes(event.code)) return step;
  if (['ArrowDown', 'ArrowLeft'].includes(event.code)) return -step;
  if (event.code === 'PageUp') return step * 10;
  if (event.code === 'PageDown') return -step * 10;
  return null;
}
export function adjustedPitch(current, delta, minimum = -8, maximum = 8) {
  return Math.round(Math.max(minimum, Math.min(maximum, current + delta)) * 1000000) / 1000000;
}
