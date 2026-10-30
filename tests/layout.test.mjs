import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLayout } from '../src/layout.js';

test('mode-specific module ordering, removals, collapse state and sensitivity survive serialization', () => {
  const layout={version:2,modes:{foundation:{decks:[[{id:'pitch',collapsed:false},{id:'volume',collapsed:true}],[]],global:[{id:'master',collapsed:true}]},pro:{decks:[[{id:'picker',collapsed:false}],[{id:'picker',collapsed:true}]],global:[]},builder:{decks:[[{id:'composer',collapsed:false}],[]],global:[]}},sensitivity:[.01,.25]};
  assert.deepEqual(validateLayout(JSON.parse(JSON.stringify(layout))),layout);
});

test('invalid persisted layout fields cannot introduce arbitrary module IDs or pitch values', () => {
  const clean=validateLayout({modes:{foundation:{decks:[[{id:'pitch',collapsed:1},{id:'pitch',collapsed:true},{id:'script'}],[]],global:[{id:'outputs',collapsed:true},{id:'unknown'}]},other:{decks:[[],[]],global:[]}},sensitivity:[999,'0.01']});
  assert.deepEqual(clean,{version:2,modes:{foundation:{decks:[[{id:'pitch',collapsed:false}],[]],global:[{id:'outputs',collapsed:true}]}},sensitivity:[.05,.01]});
  for(const value of [null,[],{},'bad',{modes:{foundation:{decks:[[]],global:[]}}}])assert.equal(validateLayout(value),null);
});

test('legacy optional transport entries are discarded while other module preferences survive', () => {
  const clean=validateLayout({modes:{foundation:{decks:[[{id:'transport',collapsed:true},{id:'screen',collapsed:true}],[{id:'transport',collapsed:false}]],global:[]}},sensitivity:[.05,.05]});
  assert.deepEqual(clean.modes.foundation.decks,[[{id:'screen',collapsed:true}],[]]);
});

test('layouts saved before the loop picker existed get it once in the Loop builder, and keep a later removal', () => {
  const old=validateLayout({modes:{builder:{decks:[[{id:'screen',collapsed:false}],[{id:'picker',collapsed:true}]],global:[]},pro:{decks:[[],[]],global:[]}},sensitivity:[.05,.05]});
  assert.deepEqual(old.modes.builder.decks,[[{id:'screen',collapsed:false},{id:'picker',collapsed:false}],[{id:'picker',collapsed:true}]]);
  assert.deepEqual(old.modes.pro.decks,[[],[]]);
  const removed=validateLayout({version:2,modes:{builder:{decks:[[{id:'screen',collapsed:false}],[]],global:[]}},sensitivity:[.05,.05]});
  assert.deepEqual(removed.modes.builder.decks,[[{id:'screen',collapsed:false}],[]]);
});
