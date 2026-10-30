// Keyboard control mode: the one map from keys to actions. The specification is docs/KEYBOARD.md,
// and tests/keyboard.test.mjs keeps this file and the spec in step.
//
// Keys are matched by position (KeyboardEvent.code), so the two deck blocks stay under the hands on
// AZERTY, QWERTZ or Italian keyboards too. Labels are the US key caps. The page tells us where we are
// through the app shell's data-keys attribute: practice, focus, page (Learning path, Training, Skin
// studio) or help (the keyboard dialog is open).

const DECKS = ['practice', 'focus'];
const PRACTICE = ['practice'];
const ANYWHERE = ['practice', 'focus', 'page', 'help'];

// Each deck has the same three rows under one hand: pitch on top, transport in the middle,
// volume and the deck's track key below. The index finger plays; the little finger cues.
const deckKeys = (deck, [top, home, bottom]) => [
  { code: top[0], action: 'pitch', deck, dir: -1, big: true },
  { code: top[1], action: 'pitch', deck, dir: -1 },
  { code: top[2], action: 'pitch', deck, dir: 1 },
  { code: top[3], action: 'pitch', deck, dir: 1, big: true },
  // Home row: the outer key cues and the inner key plays, so both index fingers play.
  { code: home[deck ? 3 : 0], action: 'cue', deck },
  { code: home[1], action: 'nudge', deck, dir: -1 },
  { code: home[2], action: 'nudge', deck, dir: 1 },
  { code: home[deck ? 0 : 3], action: 'play', deck },
  { code: bottom[deck ? 3 : 0], action: 'pitchZero', deck },
  { code: bottom[1], action: 'volume', deck, dir: -1 },
  { code: bottom[2], action: 'volume', deck, dir: 1 },
  // The track key changes what you hear, so it stays on the practice page, where the deck's screen shows it.
  { code: bottom[deck ? 0 : 3], action: 'track', deck, in: PRACTICE },
].map(binding => ({ in: DECKS, ...binding }));

export const BINDINGS = [
  ...deckKeys(0, [['KeyQ', 'KeyW', 'KeyE', 'KeyR'], ['KeyA', 'KeyS', 'KeyD', 'KeyF'], ['KeyZ', 'KeyX', 'KeyC', 'KeyV']]),
  ...deckKeys(1, [['KeyU', 'KeyI', 'KeyO', 'KeyP'], ['KeyJ', 'KeyK', 'KeyL', 'Semicolon'], ['KeyM', 'Comma', 'Period', 'Slash']]),
  // The arrows match deck B, the deck the lessons ask you to move.
  { code: 'ArrowUp', action: 'pitch', deck: 1, dir: 1, in: DECKS },
  { code: 'ArrowDown', action: 'pitch', deck: 1, dir: -1, in: DECKS },
  { code: 'ArrowLeft', action: 'nudge', deck: 1, dir: -1, in: DECKS },
  { code: 'ArrowRight', action: 'nudge', deck: 1, dir: 1, in: DECKS },
  { code: 'Space', action: 'playBoth', in: DECKS },
  // The mixer sits between the hands.
  { code: 'KeyG', action: 'crossfade', dir: -1, in: DECKS },
  { code: 'KeyH', action: 'crossfade', dir: 1, in: DECKS },
  { code: 'KeyY', action: 'crossfadeCenter', in: DECKS },
  { code: 'Backquote', action: 'focus', in: DECKS },
  { code: 'Enter', action: 'check', in: PRACTICE },
  { code: 'NumpadEnter', action: 'check', in: PRACTICE },
  { code: 'KeyN', action: 'new', in: PRACTICE },
  { code: 'KeyB', action: 'hideBpm', in: PRACTICE },
  { code: 'KeyT', action: 'tap', in: PRACTICE },
  { code: 'Equal', action: 'addElement', in: PRACTICE },
  ...[1, 2, 3, 4, 5].map(mode => ({ code: `Digit${mode}`, action: 'mode', value: mode, in: ['practice', 'page'] })),
  { code: 'Escape', action: 'escape', in: ANYWHERE },
];

// US key cap for each position, for the help dialog and the spec.
export const LABELS = {
  Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Backquote: '`', Equal: '=', Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter',
  Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};
export const label = code => LABELS[code] || code.replace(/^(Key|Digit)/, '');

// Only these keep firing while held (the operating system's key repeat); every other key acts once per press.
const REPEATS = new Set(['pitch', 'volume']);
// These are held: the page acts on the press and again on the release.
export const HELD = new Set(['nudge', 'crossfade']);
// Shift changes what these do (finer, or the key's second function).
const SHIFTED = new Set(['pitch', 'nudge', 'volume', 'cue', 'track', 'crossfade']);

const byCode = new Map();
for (const binding of BINDINGS) {
  if (!byCode.has(binding.code)) byCode.set(binding.code, []);
  byCode.get(binding.code).push(binding);
}

/**
 * The action a key press asks for, or null when the key isn't a shortcut here.
 * A held key's repeats come back as { action: 'none' }: the page swallows them so it doesn't scroll.
 */
export function shortcutFor({ code, key, shiftKey = false, repeat = false }, context) {
  const binding = byCode.get(code)?.find(item => item.in.includes(context));
  // The help key is a character (Shift+/ on a US keyboard, Shift+' on an Italian one), not a position.
  // Where ? shares its key with a deck key that has a Shift meaning (M on AZERTY), the deck key wins.
  if (key === '?' && !(binding && shiftKey && SHIFTED.has(binding.action))) return repeat ? { action: 'none' } : { action: 'help', shift: false };
  if (!binding) return null;
  if (repeat && !REPEATS.has(binding.action)) return { action: 'none' };
  const { in: _contexts, code: _code, ...action } = binding;
  return { ...action, shift: shiftKey };
}

// Which keys a focused control keeps for itself. Everything else is a shortcut, so after clicking
// a button with the mouse the deck keys still work. Space and Enter press a button only when you
// moved to it with Tab; after a mouse click (or when the page moved the focus) they are shortcuts.
// (Not :focus-visible: browsers turn that on for any focused button as soon as a key is pressed.)
const ADJUST = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
const TYPED = new Set(['', 'text', 'search', 'number', 'url', 'email', 'password', 'tel', 'date', 'time', 'datetime-local', 'month', 'week', 'color', 'file']);

/** element: { tag, type, role, editable, tabbed } for the focused element; tabbed: focus came by Tab. */
export function controlKeeps({ tag = '', type = '', role = '', editable = false, tabbed = false } = {}, code) {
  tag = tag.toUpperCase(); type = type.toLowerCase();
  if (code === 'Escape') return false;
  if (editable || tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && TYPED.has(type))) return true;
  if ((tag === 'INPUT' && type === 'range') || role === 'slider') return ADJUST.has(code);
  if (!tabbed) return false;
  if (tag === 'INPUT' && type === 'radio') return code === 'Space' || ADJUST.has(code);
  if (tag === 'INPUT' && type === 'checkbox') return code === 'Space';
  if (tag === 'BUTTON' || tag === 'SUMMARY' || role === 'button' || (tag === 'INPUT' && ['button', 'submit', 'reset', 'image'].includes(type))) return code === 'Space' || code === 'Enter' || code === 'NumpadEnter';
  if (tag === 'A') return code === 'Enter' || code === 'NumpadEnter';
  return false;
}

// Nudge keys: a tap moves the beat by a hair; held longer, the deck speeds up or slows down until released.
export const NUDGE = { beats: 0.04, fineBeats: 0.01, holdMs: 250, bend: 4, fineBend: 1 };
// Crossfader keys glide while held: end to end in two seconds, or six with Shift.
export const GLIDE = { seconds: 2, fineSeconds: 6 };

/** The deck's bend (in percent) for the nudge keys being held on it. */
export function heldBend(held, deck) {
  let bend = 0;
  for (const item of held) if (item.deck === deck && item.bending) bend += item.dir * (item.fine ? NUDGE.fineBend : NUDGE.bend);
  return bend;
}
