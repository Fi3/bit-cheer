import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BINDINGS, shortcutFor, controlKeeps, heldBend, label, NUDGE } from '../src/keyboard.js';

const press = (code, context, extra = {}) => shortcutFor({ code, key: '', ...extra }, context);

test('the spec\'s complete key table and the key map agree, key by key', () => {
  // docs/KEYBOARD.md is the specification of record; this keeps it and src/keyboard.js in step.
  const spec = readFileSync(new URL('../docs/KEYBOARD.md', import.meta.url), 'utf8');
  const section = spec.slice(spec.indexOf('## 11. Complete key table'), spec.indexOf('## 12.'));
  const rows = section.split('\n').filter(line => /^\| `/.test(line)).map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
  const fromSpec = rows.filter(([, position]) => /^`\w+`$/.test(position)).map(([, position, contexts, action, deck, direction]) => {
    const [id, ...rest] = action.split(' ');
    const row = { code: position.slice(1, -1), action: id, in: contexts.split(' ').sort() };
    if (deck) row.deck = deck === 'A' ? 0 : 1;
    if (direction) row.dir = /^(down|back|toward A)$/.test(direction) ? -1 : 1;
    if (rest.join(' ') === '(ten steps)') row.big = true;
    return row;
  });
  const modes = ['Foundation', 'Loop builder', 'By ear', 'Star mode', 'Pro decks'];
  for (const row of fromSpec) {
    const name = rows.find(([, position]) => position === `\`${row.code}\``)[3].match(/\((.*)\)/)?.[1];
    if (row.action === 'mode') row.value = modes.indexOf(name) + 1;
  }
  const fromCode = BINDINGS.map(({ in: contexts, ...binding }) => ({ ...binding, in: [...contexts].sort() }));
  const key = row => row.code;
  assert.deepEqual(fromSpec.map(key).sort(), fromCode.map(key).sort(), 'the same keys in the spec and in src/keyboard.js');
  for (const row of fromCode) assert.deepEqual(fromSpec.find(item => item.code === row.code), row, `${row.code} as the spec says`);
  assert.ok(rows.some(([keyCell, , , action]) => keyCell === '`?`' && action === 'help'), 'the help key is in the table');
});

test('every key in the map has a readable label', () => {
  for (const { code } of BINDINGS) assert.ok(label(code).length >= 1 && !/^(Key|Digit)/.test(label(code)), code);
  assert.equal(label('Semicolon'), ';');
  assert.equal(label('KeyF'), 'F');
  assert.equal(label('Digit3'), '3');
});

test('each hand plays its own deck with the same shape', () => {
  assert.deepEqual(press('KeyF', 'practice'), { action: 'play', deck: 0, shift: false });
  assert.deepEqual(press('KeyJ', 'practice'), { action: 'play', deck: 1, shift: false });
  // Top row: outer keys move ten steps, inner keys one; left is down, right is up, on both hands.
  for (const [deck, codes] of [[0, ['KeyQ', 'KeyW', 'KeyE', 'KeyR']], [1, ['KeyU', 'KeyI', 'KeyO', 'KeyP']]]) {
    assert.deepEqual(codes.map(code => press(code, 'practice')).map(a => [a.action, a.deck, a.dir, !!a.big]),
      [['pitch', deck, -1, true], ['pitch', deck, -1, false], ['pitch', deck, 1, false], ['pitch', deck, 1, true]]);
  }
  // Home row: the middle keys are back / forward on both hands; the ends mirror (index plays, little finger cues).
  assert.deepEqual(['KeyA', 'KeyS', 'KeyD', 'KeyF'].map(code => press(code, 'practice').action), ['cue', 'nudge', 'nudge', 'play']);
  assert.deepEqual(['KeyJ', 'KeyK', 'KeyL', 'Semicolon'].map(code => press(code, 'practice').action), ['play', 'nudge', 'nudge', 'cue']);
  assert.deepEqual([press('KeyS', 'practice').dir, press('KeyD', 'practice').dir, press('KeyK', 'practice').dir, press('KeyL', 'practice').dir], [-1, 1, -1, 1]);
  assert.deepEqual(['KeyZ', 'KeyX', 'KeyC', 'KeyV'].map(code => press(code, 'practice').action), ['pitchZero', 'volume', 'volume', 'track']);
  assert.deepEqual(['KeyM', 'Comma', 'Period', 'Slash'].map(code => press(code, 'practice').action), ['track', 'volume', 'volume', 'pitchZero']);
  // The arrows are deck B's.
  assert.deepEqual(press('ArrowUp', 'practice'), { action: 'pitch', deck: 1, dir: 1, shift: false });
  assert.deepEqual(press('ArrowLeft', 'practice', { shiftKey: true }), { action: 'nudge', deck: 1, dir: -1, shift: true });
});

test('keys only work where the spec says', () => {
  assert.equal(press('KeyF', 'page'), null, 'no deck keys on Learning path, Training or Skin studio');
  assert.equal(press('Space', 'page'), null);
  assert.equal(press('Digit2', 'page').action, 'mode');
  assert.equal(press('Digit2', 'focus'), null, 'Focus session keeps its mode');
  assert.equal(press('KeyF', 'focus').action, 'play');
  assert.equal(press('KeyV', 'focus'), null, 'the track key stays on the practice page');
  for (const code of ['Enter', 'KeyN', 'KeyB', 'KeyT', 'Equal']) assert.equal(press(code, 'focus'), null, code);
  for (const code of ['KeyF', 'Space', 'Enter', 'ArrowUp', 'Digit1']) assert.equal(press(code, 'help'), null, `${code} belongs to the help dialog`);
  assert.equal(press('Escape', 'help').action, 'escape');
  assert.equal(press('KeyF', 'practice', { ctrlKey: true }).action, 'play', 'modifiers are filtered by the page, before the map');
});

test('only pitch and volume repeat; other held keys are swallowed once', () => {
  assert.equal(press('KeyI', 'practice', { repeat: true }).action, 'pitch');
  assert.equal(press('Comma', 'practice', { repeat: true }).action, 'volume');
  for (const code of ['Space', 'KeyF', 'KeyK', 'KeyG', 'Enter', 'KeyN', 'Digit1']) assert.deepEqual(press(code, 'practice', { repeat: true }), { action: 'none' }, code);
});

test('? opens the help by character, except where Shift means something on that key', () => {
  assert.equal(shortcutFor({ code: 'Slash', key: '?', shiftKey: true }, 'practice').action, 'help', 'US: Shift+/');
  assert.equal(shortcutFor({ code: 'Minus', key: '?', shiftKey: true }, 'practice').action, 'help', 'Italian: Shift+\'');
  assert.equal(shortcutFor({ code: 'Slash', key: '?', shiftKey: true }, 'help').action, 'help', 'closes it again');
  assert.equal(shortcutFor({ code: 'Slash', key: '?', shiftKey: true }, 'page').action, 'help');
  assert.equal(shortcutFor({ code: 'KeyM', key: '?', shiftKey: true }, 'practice').action, 'track', 'AZERTY: Shift on deck B\'s track key');
  assert.equal(shortcutFor({ code: 'Slash', key: '/' }, 'practice').action, 'pitchZero');
});

test('a focused control keeps only the keys it needs', () => {
  const text = { tag: 'INPUT', type: 'search' }, select = { tag: 'SELECT' }, range = { tag: 'INPUT', type: 'range' };
  const clicked = { tag: 'BUTTON' }, tabbed = { tag: 'BUTTON', tabbed: true };
  for (const code of ['KeyF', 'Space', 'Enter', 'ArrowUp', 'Digit1']) {
    assert.equal(controlKeeps(text, code), true, `typing keeps ${code}`);
    assert.equal(controlKeeps(select, code), true, `a dropdown keeps ${code}`);
  }
  assert.equal(controlKeeps(text, 'Escape'), false, 'Esc lets go of a field');
  assert.equal(controlKeeps(range, 'ArrowUp'), true);
  assert.equal(controlKeeps(range, 'PageDown'), true);
  assert.equal(controlKeeps(range, 'KeyF'), false);
  assert.equal(controlKeeps(range, 'Space'), false);
  assert.equal(controlKeeps({ tag: 'DIV', role: 'slider' }, 'ArrowLeft'), true, 'the jog wheel');
  assert.equal(controlKeeps(clicked, 'Space'), false, 'after a mouse click Space plays both decks');
  assert.equal(controlKeeps(clicked, 'Enter'), false);
  assert.equal(controlKeeps(tabbed, 'Space'), true, 'a button reached with Tab is pressed with Space');
  assert.equal(controlKeeps(tabbed, 'Enter'), true);
  assert.equal(controlKeeps(tabbed, 'KeyF'), false);
  assert.equal(controlKeeps({ tag: 'INPUT', type: 'checkbox', tabbed: true }, 'Space'), true);
  assert.equal(controlKeeps({ tag: 'INPUT', type: 'checkbox' }, 'Space'), false, 'a toggle clicked with the mouse');
  assert.equal(controlKeeps({ tag: 'INPUT', type: 'checkbox', tabbed: true }, 'Enter'), false);
  assert.equal(controlKeeps({ tag: 'A', tabbed: true }, 'Enter'), true);
  assert.equal(controlKeeps({ tag: 'A', tabbed: true }, 'Space'), false);
  assert.equal(controlKeeps({}, 'Space'), false, 'the page itself keeps nothing');
});

test('held nudge keys bend their own deck and cancel each other out', () => {
  const held = [
    { deck: 1, dir: 1, fine: false, bending: true },
    { deck: 0, dir: -1, fine: true, bending: true },
    { deck: 1, dir: -1, fine: false, bending: false },
  ];
  assert.equal(heldBend(held, 1), NUDGE.bend);
  assert.equal(heldBend(held, 0), -NUDGE.fineBend);
  held[2].bending = true;
  assert.equal(heldBend(held, 1), 0);
  assert.equal(heldBend([], 0), 0);
});
