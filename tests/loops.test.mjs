import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOPS, findLoop } from '../src/loops.js';
import { INSTRUMENTS, kickStudyName } from '../src/instruments.js';

test('every named loop is complete, playable and its own', () => {
  assert.ok(LOOPS.length >= 20);
  for (const key of ['id', 'name', 'seed', 'elements']) assert.equal(new Set(LOOPS.map(loop => loop[key])).size, LOOPS.length, `${key} must be unique`);
  for (const loop of LOOPS) {
    assert.match(loop.id, /^[a-z0-9-]+$/);
    assert.ok(loop.name.length > 0 && loop.name.length <= 22, `${loop.name} fits the deck title`);
    assert.ok(loop.vibe.length > 10 && loop.vibe.length <= 60, `${loop.name} describes its vibe briefly`);
    assert.ok(loop.bpm >= 104 && loop.bpm <= 124, `${loop.name} stays in a matchable tempo band`);
    assert.equal(loop.elements & 1, 1, `${loop.name} plays the kick`);
    const count = Object.keys(loop.voices).length;
    assert.ok(count >= 4 && count <= 8, `${loop.name} layers four to eight instruments`);
    for (const [voice, spec] of Object.entries(loop.voices)) {
      assert.ok(spec.sound >= 0 && spec.sound < INSTRUMENTS[voice].sounds.length);
      assert.ok(spec.gain > 0 && spec.gain <= 1.5); assert.ok(Math.abs(spec.pan) <= 1);
    }
    assert.equal(findLoop(loop.id), loop);
  }
  assert.equal(findLoop('nope'), null);
});

test('instrument sound names are unique within each instrument and kick names title Foundation decks', () => {
  assert.equal(INSTRUMENTS.length, 20);
  for (const instrument of INSTRUMENTS) {
    assert.ok(instrument.sounds.length >= 3);
    assert.equal(new Set(instrument.sounds).size, instrument.sounds.length, instrument.name);
    for (const sound of instrument.sounds) assert.ok(sound.length <= 11, `${sound} fits the composer row`);
  }
  assert.equal(kickStudyName(1), 'KICK STUDY · CLUB PUNCH');
});
