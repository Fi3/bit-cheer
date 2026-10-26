import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wheelPitchDelta, keyPitchDelta, adjustedPitch, pitchSensitivity } from '../src/pitch-control.js';

test('fine, normal and coarse wheel steps agree across pixel, line and page units', () => {
  for(const sensitivity of [.01,.05,.25])for(const [deltaY,deltaMode] of [[-100,0],[-3,1],[-1,2]])assert.equal(wheelPitchDelta({deltaY,deltaMode},sensitivity),sensitivity);
  assert.equal(wheelPitchDelta({deltaY:100,deltaMode:0},.25),-.25);
  assert.equal(wheelPitchDelta({deltaY:-100,deltaMode:0,shiftKey:true},.25),.01);
  assert.equal(pitchSensitivity('0.25'),.25);assert.equal(pitchSensitivity('unsafe'),.05);
});

test('fractional trackpad motion accumulates and clamps without losing fine changes', () => {
  let pitch=0;
  for(let i=0;i<100;i++)pitch=adjustedPitch(pitch,wheelPitchDelta({deltaY:-1,deltaMode:0},.01));
  assert.equal(pitch,.01);
  assert.equal(adjustedPitch(7.99,.25,-8,8),8);assert.equal(adjustedPitch(-7.99,-.25,-8,8),-8);
  assert.equal(wheelPitchDelta({deltaY:NaN,deltaMode:0},.05),0);
});

test('keyboard controls follow sensitivity with Shift fine override and page increments', () => {
  assert.equal(keyPitchDelta({code:'ArrowUp'},.25),.25);
  assert.equal(keyPitchDelta({code:'ArrowDown',shiftKey:true},.25),-.01);
  assert.equal(keyPitchDelta({code:'PageUp'},.05),.5);
  assert.equal(keyPitchDelta({code:'PageDown'},.25),-2.5);
  assert.equal(keyPitchDelta({code:'KeyA'},.05),null);
});
