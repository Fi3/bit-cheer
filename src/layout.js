import { pitchSensitivity } from './pitch-control.js';
export const DECK_MODULES = ['screen', 'pitch', 'volume', 'jog', 'waveform', 'eq', 'vu', 'loop', 'composer', 'picker'];
export const GLOBAL_MODULES = ['crossfader', 'master', 'monitor', 'outputs', 'coach', 'tap', 'discovery'];
export function validateLayout(layout) {
  if (!layout || typeof layout !== 'object' || !layout.modes || typeof layout.modes !== 'object') return null;
  const modules = (items, allowed) => {
    if (!Array.isArray(items)) return null;
    const seen = new Set(), clean = [];
    for (const item of items) {
      if (!item || !allowed.includes(item.id) || seen.has(item.id)) continue;
      seen.add(item.id); clean.push({ id: item.id, collapsed: item.collapsed === true });
    }
    return clean;
  };
  const modes = {};
  for (const mode of ['foundation', 'builder', 'blind', 'star', 'pro']) {
    const value = layout.modes[mode];
    if (!value || !Array.isArray(value.decks) || value.decks.length !== 2) continue;
    const decks = value.decks.map(items => modules(items, DECK_MODULES));
    const global = modules(value.global, GLOBAL_MODULES);
    if (decks.some(items => items === null) || global === null) continue;
    modes[mode] = { decks, global };
  }
  if (!Object.keys(modes).length) return null;
  return { modes, sensitivity: [0, 1].map(index => pitchSensitivity(layout.sensitivity?.[index])) };
}
