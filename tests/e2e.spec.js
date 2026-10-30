import { test, expect } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assetUrl } from '../src/assets.js';

const root = process.cwd();
const asset = name => path.join(root, 'public', name);
const playableTracks = JSON.parse(readFileSync(asset('catalog.json'), 'utf8')).tracks;
const moduleLabels = {
  screen: 'Screen', pitch: 'Pitch fader', volume: 'Volume', jog: 'Jog wheel',
  waveform: 'Waveform', eq: 'Equalizer', vu: 'VU meter', loop: 'Loop', composer: 'Composer', picker: 'Track picker',
  crossfader: 'Crossfader', master: 'Master volume', monitor: 'Monitor', outputs: 'Audio outputs',
  coach: 'Coach', tap: 'Tap tempo', discovery: 'External track discovery',
};

function moduleElement(page, id, owner = 'session') {
  return page.locator(`.player-module[data-module="${id}"][data-scope="${owner === 'session' ? owner : `deck-${owner.toLowerCase()}`}"]`);
}

async function openModule(page, id, owner = 'session') {
  const module = moduleElement(page, id, owner);
  const suffix = owner === 'session' ? 'session' : `deck ${owner}`;
  if (!await module.count()) {
    await page.getByLabel(owner === 'session' ? 'Add session module' : `Add module to deck ${owner}`, { exact: true }).selectOption(id);
  }
  await expect(module).toBeVisible();
  if (await module.getAttribute('class').then(value => value.includes('is-collapsed'))) {
    await page.getByRole('button', { name: `Open ${moduleLabels[id]} ${suffix}`, exact: true }).click();
  }
  await expect(module).not.toHaveClass(/is-collapsed/);
}

async function selectAndLoadTrack(page, letter, title, genre) {
  const track = playableTracks.find(track => (track.title || track.name) === title);
  if (!track) throw new Error(`Unknown test recording ${title}`);
  await openModule(page, 'picker', letter);
  if (genre) await page.getByLabel(`Deck ${letter} genre`, { exact: true }).selectOption(genre);
  await page.getByLabel(`Deck ${letter} track`, { exact: true }).selectOption(track.id);
  await page.getByRole('button', { name: `Load selected track deck ${letter}`, exact: true }).click();
  await expect.poll(() => page.evaluate(deck => window.bitCheer.audio.state[deck].name, letter === 'A' ? 0 : 1)).toContain(title);
}

async function setRange(page, name, value) {
  const slider = page.getByRole('slider', { name, exact: true });
  await slider.evaluate((input, next) => {
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await expect(slider).toHaveValue(String(value));
}

async function importFile(page, button, file) {
  const choosing = page.waitForEvent('filechooser');
  await button.click();
  await (await choosing).setFiles(file);
}

async function playBoth(page) {
  await page.getByRole('button', { name: /Play both decks/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.telemetry.length === 2 && window.bitCheer.telemetry.every(d => d.playing))).toBe(true);
}

async function pauseBoth(page) {
  await page.getByRole('button', { name: /Pause both decks/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.telemetry.every(deck => !deck.playing))).toBe(true);
}

async function deckSnapshots(page) {
  return page.evaluate(() => window.bitCheer.audio.state.map(deck => ({
    seed: deck.seed, bpm: deck.bpm, pitch: deck.pitch,
    effectiveBpm: deck.bpm * (1 + deck.pitch / 100),
    elements: deck.elements, position: deck.position, source: deck.source,
    name: deck.name, trackId: deck.trackId, playing: deck.playing, solo: deck.solo,
    voices: deck.voices?.map(voice => ({ ...voice })),
  })));
}

async function seekPausedDeck(page, letter, fraction) {
  await openModule(page, 'waveform', letter);
  const waveform = page.locator(`#waveform-${letter.toLowerCase()}`);
  const box = await waveform.boundingBox();
  await waveform.click({ position: { x: box.width * fraction, y: box.height / 2 } });
  await expect.poll(() => page.evaluate(deck => window.bitCheer.telemetry[deck].position, letter === 'A' ? 0 : 1)).toBeGreaterThan(.5);
}

async function assertLcdSprites(page) {
  await expect(page.locator('.lcd-digit').first()).toBeVisible();
  const digits = await page.locator('.lcd-digit').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return { digit: Number(element.textContent), cssDigit: style.getPropertyValue('--digit').trim(), x: parseFloat(style.backgroundPositionX), width: parseFloat(style.width) };
  }));
  expect(digits.length).toBeGreaterThan(0);
  for (const digit of digits) {
    expect(digit.cssDigit, 'The displayed bitmap must use its numeric character, not the default zero sprite').toBe(String(digit.digit));
    expect(digit.x).toBeCloseTo(-digit.digit * digit.width, 3);
  }
}

test.beforeEach(async ({ page }) => {
  page.__errors = [];
  page.__requests = [];
  page.__badResponses = [];
  page.on('pageerror', error => page.__errors.push(error.message));
  page.on('request', request => page.__requests.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) page.__badResponses.push({ url: response.url(), status: response.status() }); });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Find your rhythm.' })).toBeVisible();
  await expect(page.locator('.deck')).toHaveCount(2);
});

test.afterEach(async ({ page }) => {
  expect(page.__errors, 'The browser must not report uncaught JavaScript errors').toEqual([]);
});

test('desktop renders real waveform canvases and accessible two-deck controls', async ({ page }, testInfo) => {
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'millennium');
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'kit');
  await expect(page.getByRole('slider', { name: 'Deck A pitch', exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Deck B pitch', exact: true })).toBeVisible();
  await expect(page.locator('.player-module[data-scope="deck-a"]')).toHaveCount(3);
  await expect(page.locator('.player-module[data-scope="deck-b"]')).toHaveCount(3);
  await expect(page.locator('.player-module[data-scope="session"]')).toHaveCount(3);
  for (const letter of ['A', 'B']) {
    await expect(page.getByLabel(`Deck ${letter} transport`, { exact: true })).toBeVisible();
    await expect(page.getByLabel(`Add module to deck ${letter}`, { exact: true }).locator('option[value="transport"]')).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: /^(Hide|Open|Remove) Transport deck/ })).toHaveCount(0);
  await expect(page.locator('#waveform-a, #jog-a, .composer-rack')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('sparse-desktop-1440.png'), fullPage: true });
  await openModule(page, 'waveform', 'A');
  await expect.poll(() => page.locator('#waveform-a').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let green = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > 80 && pixels[i + 1] > pixels[i]) green++;
    return green;
  })).toBeGreaterThan(50);
  await assertLcdSprites(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('desktop-1440.png'), fullPage: true });
  await page.getByRole('button', { name: 'Keyboard shortcuts and help', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close help', exact: true })).toBeFocused();
  // Tab goes round the dialog's three buttons; Show more opens the full key list and keeps the focus.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Show more', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Show less', exact: true })).toBeFocused();
  await expect(page.getByRole('dialog')).toContainText('Pitch: match the tempo');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Back to the groove', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close help', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Back to the groove', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Show less', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Keyboard shortcuts and help', exact: true })).toBeFocused();
});

test('browser modifier shortcuts do not start playback but plain F still plays deck A', async ({ page }) => {
  await page.getByRole('heading', { name: 'Find your rhythm.' }).click();
  await page.keyboard.press('Control+f');
  await page.keyboard.press('Meta+f');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => window.bitCheer.audio.context)).toBeNull();
  await expect(page.getByRole('button', { name: 'Play deck A', exact: true })).toBeVisible();
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => window.bitCheer.telemetry[0]?.playing)).toBe(true);
  expect(await page.evaluate(() => window.bitCheer.telemetry[1].playing)).toBe(false);
});

// Records what the page asks of the audio engine, so tests can see nudges and bends.
async function spyEngine(page) {
  await page.evaluate(() => {
    const audio = window.bitCheer.audio, set = audio.set.bind(audio);
    window.__engineCalls = [];
    audio.set = (deck, param, value) => { window.__engineCalls.push([deck, param, value]); return set(deck, param, value); };
  });
  return {
    calls: () => page.evaluate(() => window.__engineCalls),
    clear: () => page.evaluate(() => { window.__engineCalls = []; }),
  };
}
const enginePitch = (page, deck) => page.evaluate(index => window.bitCheer.audio.state[index].pitch, deck);

test('keyboard control: each hand plays, pitches, nudges and mixes its own deck', async ({ page }) => {
  // docs/KEYBOARD.md, section 5: deck A under the left hand, deck B under the right.
  const engine = await spyEngine(page);
  await page.keyboard.press('j');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[1].playing)).toBe(true);
  expect(await page.evaluate(() => window.bitCheer.audio.state[0].playing)).toBe(false);
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].playing)).toBe(true);
  // Pitch: one step is the Wheel / keys setting (Normal, 0.05%), the outer keys ten steps, Shift 0.01%.
  for (const [key, expected] of [['o', .05], ['p', .55], ['Shift+I', .54], ['ArrowUp', .59], ['ArrowDown', .54], ['u', .04]]) {
    await page.keyboard.press(key);
    await expect.poll(() => enginePitch(page, 1)).toBeCloseTo(expected, 6);
  }
  await expect(page.locator('.pitch-section[data-deck="1"] .pitch-value')).toHaveText('+0.04%');
  await page.keyboard.press('w');
  await page.keyboard.press('r');
  await expect.poll(() => enginePitch(page, 0)).toBeCloseTo(.45, 6);
  await page.keyboard.press('Slash');
  await page.keyboard.press('z');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.pitch))).toEqual([0, 0]);
  // Holding a pitch key keeps going, and past the fader's end the range widens instead of sticking.
  await page.keyboard.down('KeyP');
  for (let i = 0; i < 20; i++) await page.keyboard.down('KeyP');
  await page.keyboard.up('KeyP');
  await expect.poll(() => enginePitch(page, 1)).toBeCloseTo(10.5, 6);
  await expect(page.getByLabel('Deck B pitch range', { exact: true })).toHaveValue('16');
  // Volume.
  await page.keyboard.press('Comma');
  await page.keyboard.press('Shift+Period');
  await page.keyboard.press('c');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.volumes)).toEqual([.85, .76]);
  // Nudge: a tap moves the beat; a hold bends the speed until the key comes up.
  await engine.clear();
  await page.keyboard.press('l');
  await expect.poll(engine.calls).toContainEqual([1, 'nudge', .04]);
  await page.keyboard.press('Shift+S');
  await expect.poll(engine.calls).toContainEqual([0, 'nudge', -.01]);
  expect((await engine.calls()).filter(([, param]) => param === 'bend')).toEqual([]);
  await page.keyboard.down('k');
  await expect.poll(engine.calls).toContainEqual([1, 'bend', -4]);
  await page.keyboard.up('k');
  await expect.poll(async () => (await engine.calls()).at(-1)).toEqual([1, 'bend', 0]);
  // Cue and set cue.
  await engine.clear();
  await page.keyboard.press('Shift+Semicolon');
  await expect.poll(engine.calls).toContainEqual([1, 'setCue', 1]);
  await page.keyboard.press('Semicolon');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[1].playing)).toBe(false);
  // The crossfader glides while G / H are held and Y centres it.
  const crossfade = () => page.evaluate(() => window.bitCheer.audio.crossfade);
  await page.keyboard.down('h');
  await page.waitForTimeout(500);
  await page.keyboard.up('h');
  await expect.poll(crossfade).toBeGreaterThan(.65);
  expect(await crossfade()).toBeLessThan(1);
  // The slider shows the glide snapped to its 0.01 step; the mixer keeps the exact value.
  await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Crossfader', exact: true }).inputValue())).toBeCloseTo(await crossfade(), 2);
  await page.keyboard.press('y');
  await expect.poll(crossfade).toBe(.5);
  // Space pauses both while either plays; Enter checks the match, with the button's own notice.
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.some(deck => deck.playing))).toBe(false);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Play both decks, match the pitch, then check your mix.' })).toBeVisible();
});

test('keyboard control: clicking a control never steals the keys, Tab and Space still press buttons', async ({ page }) => {
  // docs/KEYBOARD.md, section 4.
  const randomize = page.getByRole('button', { name: 'Randomize tempo deck A', exact: true });
  await randomize.click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].bpm)).not.toBe(120);
  const bpm = await page.evaluate(() => window.bitCheer.audio.state[0].bpm);
  await expect(randomize).toBeFocused();
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(deck => deck.playing))).toBe(true);
  expect(await page.evaluate(() => window.bitCheer.audio.state[0].bpm), 'Space played the decks instead of pressing the clicked button again').toBe(bpm);
  // A slider keeps its arrows, but letters still reach the decks; Esc lets go of it.
  const volume = page.getByRole('slider', { name: 'Deck B volume', exact: true });
  await volume.focus();
  await page.keyboard.press('ArrowRight');
  await expect(volume).toHaveValue('0.81');
  expect(await enginePitch(page, 1)).toBe(0);
  await page.keyboard.press('o');
  await expect.poll(() => enginePitch(page, 1)).toBeCloseTo(.05, 6);
  await page.keyboard.press('Escape');
  await expect(volume).not.toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => enginePitch(page, 1)).toBeCloseTo(.1, 6);
  // A button reached with Tab is pressed by Space as usual (and the decks keep playing).
  const change = page.getByRole('button', { name: 'Change track deck B', exact: true });
  const name = await page.evaluate(() => window.bitCheer.audio.state[1].name);
  await change.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(change).toBeFocused();
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[1].name)).not.toBe(name);
  expect(await page.evaluate(() => window.bitCheer.audio.state.every(deck => deck.playing))).toBe(true);
  // A dropdown keeps every key: typing in it never pauses a deck.
  await page.getByLabel('Deck A pitch sensitivity', { exact: true }).focus();
  await page.keyboard.press('f');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.bitCheer.audio.state[0].playing)).toBe(true);
});

test('keyboard control: digits switch views, ` and Esc enter and leave Focus session, ? shows the keys', async ({ page }) => {
  // docs/KEYBOARD.md, sections 6 and 7.
  await page.keyboard.press('2');
  await expect(page.getByRole('heading', { name: 'Build your groove.' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.name).join())).toMatch(/RHYTHM STUDY.*RHYTHM STUDY/);
  const names = await page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.name));
  await page.keyboard.press('2');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.name)), 'the current mode\'s digit doesn\'t start over').toEqual(names);
  // = adds an element to both decks; N deals a new challenge; B shows the BPM in By ear.
  const elements = await page.locator('.voice-row').count();
  await page.keyboard.press('Equal');
  await expect(page.locator('.voice-row')).toHaveCount(elements + 2);
  await page.keyboard.press('n');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.name))).not.toEqual(names);
  await page.keyboard.press('3');
  await expect(page.getByTestId('bpm-a')).toHaveAttribute('aria-label', 'BPM hidden');
  await page.keyboard.press('b');
  await expect(page.getByTestId('bpm-a')).not.toHaveAttribute('aria-label', 'BPM hidden');
  // The help opens on the essentials only: play, pitch, nudge.
  await page.keyboard.press('Shift+Slash');
  const dialog = page.getByRole('dialog');
  const more = () => dialog.getByRole('button', { name: 'Show more', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.help-essentials li')).toHaveText([/^Space/, /^F · J/, /^W E · I O.*Pitch down \/ up, 0\.05% a press/, /^S D · K L.*Nudge/, /^↓ ↑ · ← →/]);
  await expect(dialog.getByRole('group')).toHaveCount(0);
  // Show more: the key map and the keys of the view you're in.
  await more();
  await expect(dialog.getByRole('group', { name: 'Deck A keys' })).toContainText('Tempo');
  // Pitch leads the help, with the real step sizes of the decks' Wheel / keys setting.
  await expect(dialog.locator('.help-column').first()).toContainText('Pitch: match the tempo');
  await expect(dialog).toContainText('Down / up one step: 0.05%');
  await expect(dialog).toContainText('Down / up ten steps: 0.5%');
  await expect(dialog).toContainText('Add an element to both decks');
  await page.keyboard.press('f');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.bitCheer.audio.state[0].playing), 'deck keys rest while the help is open').toBe(false);
  await page.keyboard.press('Shift+Slash');
  await expect(dialog).toHaveCount(0);
  // Pro decks: the track key reads Next.
  await page.keyboard.press('5');
  await expect(page.getByRole('heading', { name: 'Make the mix yours.' })).toBeVisible();
  // A track that finishes loading starts paused, so wait for both before playing with the keys.
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(deck => deck.source === 'pcm'))).toBe(true);
  await page.keyboard.press('Shift+Slash');
  await expect(dialog.locator('.help-essentials')).toBeVisible();
  await more();
  await expect(dialog.getByRole('group', { name: 'Deck B keys' })).toContainText('Next');
  await expect(dialog).toContainText('Start or stop a ★ Star run');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  // Focus session: deck keys and Space work, the practice-only keys rest, ` or Esc leave.
  await page.keyboard.press('Backquote');
  await expect(page.locator('.focus-channel')).toHaveCount(2);
  await page.keyboard.press('j');
  await expect(page.getByRole('button', { name: 'Pause deck B', exact: true })).toBeEnabled();
  await page.keyboard.press('1');
  await expect(page.locator('.focus-channel')).toHaveCount(2);
  expect(await page.evaluate(() => window.bitCheer.mode)).toBe('pro');
  await page.keyboard.press('Shift+Slash');
  await more();
  await expect(dialog).toContainText('Leave Focus session');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.focus-channel')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.deck')).toHaveCount(2);
  await page.keyboard.press('Backquote');
  await expect(page.locator('.focus-channel')).toHaveCount(2);
  await page.keyboard.press('Backquote');
  await expect(page.locator('.deck')).toHaveCount(2);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.some(deck => deck.playing))).toBe(false);
  // Learning path, Training and Skin studio have no deck keys; digits bring you back, but not while typing.
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  const link = page.getByLabel('Winamp Skin Museum link', { exact: true });
  await link.fill('');
  await link.pressSequentially('https://skins.webamp.org/skin/12345 f');
  await expect(link).toHaveValue('https://skins.webamp.org/skin/12345 f');
  await page.keyboard.press('Escape');
  await page.keyboard.press('j');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.bitCheer.audio.state[1].playing)).toBe(false);
  await page.keyboard.press('5');
  await expect(page.getByRole('heading', { name: 'Make the mix yours.' })).toBeVisible();
});

test('keyboard control: N and Enter follow Star mode\'s rules', async ({ page }) => {
  await page.keyboard.press('4');
  await expect(page.getByRole('heading', { name: 'Hold it together.' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(deck => deck.playing))).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'at least 10 seconds' })).toBeVisible();
  // The track key's tempo change is refused, as the button is; Shift changes the loop instead.
  await page.keyboard.press('m');
  await expect(page.getByRole('status').filter({ hasText: 'keeps tempos equal' })).toBeVisible();
  const before = await page.evaluate(() => window.bitCheer.audio.state[1].name);
  await page.keyboard.press('Shift+M');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[1].name)).not.toBe(before);
  const names = await page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.name));
  await page.keyboard.press('n');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.name))).not.toEqual(names);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.some(deck => deck.playing)), 'a new run starts from stopped decks').toBe(false);
});

test('Rust audio produces samples, pitch changes tempo, instruments and mixer are wired', async ({ page }) => {
  await playBoth(page);
  await expect.poll(() => page.evaluate(() => {
    const samples = new Float32Array(256);
    window.bitCheer.audio.analysers[0].getFloatTimeDomainData(samples);
    return Math.max(...samples.map(Math.abs));
  })).toBeGreaterThan(.001);
  await setRange(page, 'Deck B pitch', 4);
  await expect.poll(() => page.evaluate(() => window.bitCheer.telemetry[1].bpm)).toBeCloseTo(128.96, 1);
  await expect(page.getByTestId('bpm-b')).toHaveText('128.96');
  await assertLcdSprites(page);
  await page.getByRole('button', { name: /02 Loop builder/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.map(d => d.elements))).toEqual([3, 3]);
  await page.getByRole('button', { name: 'Add an element to both decks' }).click();
  await expect(page.getByRole('button', { name: 'Deck A Snare', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.map(d => d.elements))).toEqual([7, 7]);
  await setRange(page, 'Crossfader', 1);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.gains[0].gain.value)).toBeLessThan(.002);
  await setRange(page, 'Master volume', .35);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.master.gain.value)).toBeCloseTo(.35, 2);
  await openModule(page, 'eq', 'A');
  await setRange(page, 'Deck A low EQ', -12);
});

test('jog bends temporarily, dragging seeks, and CUE returns to saved position paused', async ({ page }) => {
  await openModule(page, 'jog', 'A');
  await playBoth(page);
  const jog = page.getByRole('slider', { name: 'Deck A jog wheel', exact: true });
  await jog.hover();
  await page.mouse.wheel(0, -150);
  await expect.poll(() => page.evaluate(() => window.bitCheer.telemetry[0].bpm), { intervals: [10, 15, 20], timeout: 1000 }).toBeGreaterThan(120.1);
  await expect.poll(() => page.evaluate(() => window.bitCheer.telemetry[0].bpm)).toBe(120);
  await page.getByRole('button', { name: /Pause both decks/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.telemetry.every(d => !d.playing))).toBe(true);
  const before = await page.evaluate(() => window.bitCheer.audio.state[0].position);
  const box = await jog.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  // Seeking is coalesced to animation frames and telemetry arrives separately.
  // Wait for the final 45px drag, not an intermediate step, before saving CUE.
  const cue = before + 45 * .018;
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].position)).toBeCloseTo(cue, 2);
  await page.getByRole('button', { name: 'Set cue deck A', exact: true }).click();
  await page.getByRole('button', { name: 'Play deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].position)).toBeGreaterThan(cue + .3);
  await page.getByRole('region', { name: 'Deck A', exact: true }).getByRole('button', { name: 'CUE', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].playing)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].position)).toBeCloseTo(cue, 2);
});

test('skin studio applies Millennium Chrome and imports persistent TOML and original WSZ', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  await expect(page.locator('.skin-card')).toHaveCount(1);
  await page.locator('.skin-card').filter({ has: page.locator('.skin-card-copy strong', { hasText: 'Millennium Chrome' }) }).click();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'millennium');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'millennium');
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('skin-studio.png'), fullPage: true });
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  await importFile(page, page.getByRole('button', { name: /Import a skin/ }), asset('skins/electric-blue.toml'));
  await expect(page.locator('#now-wearing-title')).toContainText('Electric Blue 2001');
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'custom');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'custom');
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  await expect(page.locator('#now-wearing-title')).toContainText('Electric Blue 2001');
  await importFile(page, page.getByRole('button', { name: /Import a skin/ }), asset('skins/classified3.wsz'));
  await expect(page.locator('#now-wearing-title')).toContainText('classified3');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--skin-titlebar'))).toContain('data:image/png');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download template/ }).click();
  expect((await download).suggestedFilename()).toBe('bit-cheer-skin-template.zip');
});

test('invalid skins report an error and preserve the current design', async ({ page }) => {
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  await importFile(page, page.getByRole('button', { name: /Import a skin/ }), { name: 'bad.toml', mimeType: 'text/plain', buffer: Buffer.from('version = 1\nname = "Bad"\n[colors]\naccent = "url(https://example.com/x)"') });
  await expect(page.getByText(/Color accent must be a six-digit hex color/)).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'millennium');
});

// A 24-bit BMP from a pixel function, for synthetic skins.
function bmp(width, height, color) {
  const row = Math.ceil(width * 3 / 4) * 4, bytes = new Uint8Array(54 + row * height), view = new DataView(bytes.buffer);
  bytes.set([66, 77]); view.setUint32(2, bytes.length, true); view.setUint32(10, 54, true); view.setUint32(14, 40, true);
  view.setInt32(18, width, true); view.setInt32(22, height, true); view.setUint16(26, 1, true); view.setUint16(28, 24, true); view.setUint32(34, row * height, true);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b] = color(x, y), i = 54 + (height - 1 - y) * row + x * 3;
    bytes[i] = b; bytes[i + 1] = g; bytes[i + 2] = r;
  }
  return bytes;
}

test('skins that paint their controls on a picture still get usable console controls and lettering', async ({ page }) => {
  // A "picture" main window, transport icons painted straight onto it (all alike), a volume bar that is
  // only that picture, and lettering in two inks (red letters, white digits), like Excel Saga or SimCity.
  const art = (x, y) => [(x * 37 + y * 11) % 256, (x * 13 + y * 29) % 256, (x * 7 + y * 53) % 256];
  const transport = [[0, 16, 88], [23, 39, 88], [46, 62, 88], [69, 85, 88], [92, 108, 88], [114, 136, 89]];
  const icon = (x, y) => x >= 8 && x <= 13 && y >= 5 && y <= 12;
  const cbuttons = bmp(136, 36, (x, y) => {
    const cell = transport.findLast(([cx]) => x >= cx), [cx, mx, my] = cell, local = x - cx, top = y % 18;
    return icon(local, top) ? [60, 60, 70] : art(mx + local, my + top);
  });
  const volume = bmp(68, 433, (x, y) => art(107 + x, 57 + y % 15));
  const text = bmp(155, 18, (x, y) => (x % 5 < 4 && y % 6 < 5 && (x + y) % 2 === 0) ? (y < 6 ? [255, 0, 0] : [255, 255, 255]) : [0, 0, 0]);
  const files = { 'Painted/main.bmp': bmp(275, 116, art), 'Painted/cbuttons.bmp': cbuttons, 'Painted/volume.bmp': volume, 'Painted/text.bmp': text };
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  // The skin's own pixels, exactly as imported (Comfort and HD would recolor and enlarge them).
  await page.getByRole('button', { name: 'Original pixels', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-render', 'original');
  await importFile(page, page.getByRole('button', { name: /Import a skin/ }), { name: 'painted.wsz', mimeType: 'application/zip', buffer: Buffer.from(zipSync(files)) });
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'custom');
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'kit');
  const result = await page.evaluate(async () => {
    const style = getComputedStyle(document.documentElement);
    const image = async name => {
      const src = style.getPropertyValue(name).trim().match(/url\("?(.*?)"?\)$/)[1];
      const img = new Image(); img.src = src; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      return (x, y) => '#' + [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)].map(v => v.toString(16).padStart(2, '0')).join('');
    };
    const transportAt = await image('--k-cb-clean'), volumeAt = await image('--k-vol-strip');
    await document.fonts.load('12px "Kit Pixel"');
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 20;
    const ctx = canvas.getContext('2d'); ctx.font = '12px "Kit Pixel"'; ctx.fillStyle = '#000'; ctx.fillText('A', 4, 14);
    const ink = [...ctx.getImageData(0, 0, 40, 20).data].filter((v, i) => i % 4 === 3 && v > 0).length;
    return {
      // The play button's symbol (a triangle centered on the cell) in the button text color.
      playSymbol: transportAt(32, 8), faceText: style.getPropertyValue('--k-face-text').trim(),
      // An empty volume frame: the groove's inside, in the display color.
      groove: volumeAt(30, 6), lcdBg: style.getPropertyValue('--k-lcd-bg').trim(),
      letterInk: ink,
    };
  });
  expect(result.playSymbol, 'Look-alike icons on a picture become a clear play symbol on the skin button').toBe(result.faceText);
  expect(result.groove, 'A volume bar that is only the picture becomes a plain groove').toBe(result.lcdBg);
  expect(result.letterInk, 'Letters drawn in a second ink still make it into the skin font').toBeGreaterThan(5);
});

test('skin looks: Comfort and HD are prepared from the stored kit and Original pixels restores it exactly', async ({ page }) => {
  const root = page.locator('html');
  const look = () => page.evaluate(async () => {
    const rule = document.getElementById('bit-cheer-kit').sheet.cssRules[0].style;
    const src = rule.getPropertyValue('--k-sheet-main').match(/url\("?(.*?)"?\)/)[1];
    const img = new Image(); img.src = src; await img.decode();
    return { scheme: src.split(':')[0], width: img.naturalWidth, live: document.querySelector('.winamp-live canvas')?.width ?? null, face: rule.getPropertyValue('--k-face').trim() };
  });
  // The default look is Comfort + HD: the skin's pictures redrawn at four times their resolution.
  await expect(root).toHaveAttribute('data-render', 'hd');
  await expect.poll(async () => (await look()).width).toBe(275 * 4);
  const hd = await look();
  expect(hd.scheme, 'Prepared looks are page-made images, never remote ones').toBe('blob');
  // The live window picks the finer sheets up on its next frame.
  await expect.poll(async () => (await look()).live, { message: 'The live main window draws at the finer resolution' }).toBe(275 * 4);
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  await page.getByRole('button', { name: 'Original pixels', exact: true }).click();
  await expect(root).toHaveAttribute('data-render', 'original');
  const original = await look();
  expect(original.scheme, 'Original pixels shows the stored kit itself').toBe('data');
  expect(original.width).toBe(275);
  await page.getByRole('button', { name: 'Comfort', exact: true }).click();
  await expect(root).toHaveAttribute('data-render', 'comfort');
  await expect(page.getByRole('button', { name: 'Comfort', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const comfort = await look();
  expect(comfort.width, 'Comfort keeps the original resolution').toBe(275);
  expect(comfort.face, 'Comfort softens the palette').not.toBe(original.face);
  await page.reload();
  await expect(root).toHaveAttribute('data-render', 'comfort');
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  await page.getByRole('button', { name: 'Original pixels', exact: true }).click();
  await expect(root).toHaveAttribute('data-render', 'original');
  expect((await look()).face, 'Back to Original pixels gives back the exact palette').toBe(original.face);
});

test('the skin\'s Winamp window: every button it shows works, shade folds it to a working bar, balance pans the deck', async ({ page }) => {
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-winamp-live', 'on');
  const canvas = page.locator('.deck-a .winamp-live canvas');
  const at = async (target, x, y) => { const box = await target.boundingBox(), k = box.width / 275; return [box.x + x * k, box.y + y * k]; };
  // Windowshade: the title bar's shade button folds the window to its 14-pixel bar, and back.
  await page.mouse.click(...await at(canvas, 258, 7));
  await expect(root).toHaveAttribute('data-main-shaded', 'a');
  await expect.poll(async () => Math.round((await page.locator('.deck-a .winamp-live').boundingBox()).height / ((await canvas.boundingBox()).width / 275))).toBe(14);
  // The bar's mini transport and position bar work like the big ones.
  await page.mouse.click(...await at(canvas, 180, 6));
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].playing)).toBe(true);
  await page.mouse.click(...await at(canvas, 191, 6));
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].playing)).toBe(false);
  await page.mouse.click(...await at(canvas, 258, 7));
  await expect(root).toHaveAttribute('data-main-shaded', '');
  // Balance pans deck B: drag its thumb to the right end.
  const b = page.locator('.deck-b .winamp-live canvas');
  await page.mouse.move(...await at(b, 196, 63)); await page.mouse.down(); await page.mouse.move(...await at(b, 214, 63), { steps: 4 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.balances[1])).toBe(1);
  // Windows that can't fold or close wear the playlist corner without those buttons.
  const corners = await page.evaluate(() => {
    const style = sel => getComputedStyle(document.querySelector(sel)).backgroundImage;
    const rule = document.getElementById('bit-cheer-kit').sheet.cssRules[0].style;
    return { topbar: style('.topbar'), mixer: style('.session-modules'), plain: rule.getPropertyValue('--k-pl-tr-plain'), corner: rule.getPropertyValue('--k-pl-tr') };
  });
  expect(corners.plain).toMatch(/^url\(/);
  expect(corners.plain).not.toBe(corners.corner);
  for (const window of ['topbar', 'mixer']) expect(corners[window], `${window} must not show dead shade/close buttons`).not.toContain(corners.corner.slice(5, 60));
});

test('every word in a skinned page is set in the skin\'s lettering, dropdown lists included', async ({ page }) => {
  const offenders = () => page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.app-shell *')) {
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      const field = el.matches('input:not([type=range], [type=checkbox], [type=radio], [type=file]), select, textarea');
      const box = el.getBoundingClientRect(), style = getComputedStyle(el);
      if ((!own && !field) || !box.width || !box.height || style.visibility === 'hidden' || parseFloat(style.fontSize) === 0) continue;
      const size = parseFloat(style.fontSize);
      if (!/^"?Kit Pixel/.test(style.fontFamily) || Math.abs(size / 6 - Math.round(size / 6)) > 0.01) out.push(`${el.className || el.tagName}: ${style.fontFamily.split(',')[0]} ${style.fontSize}`);
    }
    return out;
  });
  for (const name of ['Practice', 'Learning path', 'Training', 'Skin studio']) {
    await page.getByRole('button', { name, exact: true }).click();
    expect(await offenders(), `${name}: text outside the skin's lettering`).toEqual([]);
  }
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByLabel('Add module to deck A', { exact: true }).click();
  const list = page.getByRole('listbox', { name: 'Add module to deck A choices' });
  await expect(list).toBeVisible();
  expect(await list.getByRole('option').first().evaluate(o => getComputedStyle(o).fontFamily), 'Dropdown entries use the skin lettering too').toMatch(/^"?Kit Pixel/);
});

test('dropdowns open the skin\'s own list in every browser, by pointer and by keyboard', async ({ page }) => {
  const list = page.getByRole('listbox');
  // Pointer: the field opens the skin's list; choosing an entry is the same as choosing it in the browser's.
  await page.getByLabel('Add module to deck A', { exact: true }).click();
  await expect(list).toBeVisible();
  await expect(list.getByRole('option', { name: 'Waveform', exact: true })).toBeVisible();
  await list.getByRole('option', { name: 'Waveform', exact: true }).click();
  await expect(list).toBeHidden();
  await expect(moduleElement(page, 'waveform', 'A')).toBeVisible();
  // Keyboard: Enter opens, arrows move, Enter chooses; the field keeps the focus afterwards.
  const range = page.getByLabel('Deck A pitch range', { exact: true });
  await range.focus();
  await page.keyboard.press('Enter');
  await expect(list).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(range).toHaveValue('16');
  await expect(range).toBeFocused();
  // Space opens the list (and doesn't start the decks); Escape leaves the value as it was.
  await page.keyboard.press('Space');
  await expect(list).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await expect(range).toHaveValue('16');
  expect(await page.evaluate(() => window.bitCheer.audio.state.some(deck => deck.playing))).toBe(false);
  // Typing jumps to an entry; a press outside closes the list without a change.
  const sensitivity = page.getByLabel('Deck A pitch sensitivity', { exact: true });
  await sensitivity.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('c');
  await page.keyboard.press('Enter');
  await expect(sensitivity).toHaveValue('0.25');
  await sensitivity.click();
  await expect(list).toBeVisible();
  await page.mouse.click(4, 300);
  await expect(list).toBeHidden();
  await expect(sensitivity).toHaveValue('0.25');
});

test('a custom TOML and graphic ZIP applies colors and image assets and survives reload', async ({ page }) => {
  const manifest = 'version = 1\nname = "Pixel Harbor Test"\nbase = "bento"\n[colors]\naccent = "#25c4ee"\n[assets]\npanel = "panel.png"\n';
  const bytes = zipSync({
    'skin.toml': strToU8(manifest),
    'panel.png': new Uint8Array(readFileSync(asset('skins/classic-titlebar.png'))),
  });
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  await importFile(page, page.getByRole('button', { name: /Import a skin/ }), {
    name: 'pixel-harbor.zip', mimeType: 'application/zip', buffer: Buffer.from(bytes),
  });
  await expect(page.locator('#now-wearing-title')).toContainText('Pixel Harbor Test');
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'custom');
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'bento');
  const applied = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return { accent: style.getPropertyValue('--accent').trim(), panel: style.getPropertyValue('--skin-panel') };
  });
  expect(applied.accent).toBe('#25c4ee');
  expect(applied.panel).toContain('data:image/png;base64,');
  const imageWidth = await page.evaluate(panel => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth);
    image.onerror = () => reject(new Error('Imported panel image cannot be decoded'));
    image.src = panel.match(/url\(["']?(.*?)["']?\)$/)[1];
  }), applied.panel);
  expect(imageWidth).toBe(275);
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  expect(await page.locator('.deck').first().evaluate(element => getComputedStyle(element).backgroundImage)).toContain('data:image/png;base64,');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'custom');
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'bento');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--skin-panel'))).toBe(applied.panel);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#25c4ee');
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  await expect(page.locator('#now-wearing-title')).toContainText('Pixel Harbor Test');

  // Every structural base must honor every documented graphic slot. Checking
  // computed styles catches a theme-specific override hiding an imported asset.
  const slotFiles = {
    panel: 'classic-titlebar.png', titlebar: 'classic-titlebar.png', background: 'classic-titlebar.png',
    frame: 'classic/main.png', buttons: 'classic/cbuttons.png', numbers: 'classic/numbers.png',
    platter: 'classic/main.png', pitch: 'classic/posbar.png',
  };
  const artworkFailures = [];
  for (const base of ['classic', 'classified3', 'classified5', 'bento', 'alien']) {
    const manifest = `version = 1\nname = "Artwork ${base}"\nbase = "${base}"\n[assets]\n${Object.keys(slotFiles).map(key => `${key} = "${key}.png"`).join('\n')}\n`;
    const files = { 'skin.toml': strToU8(manifest) };
    for (const [slot, file] of Object.entries(slotFiles)) files[`${slot}.png`] = new Uint8Array(readFileSync(asset(`skins/${file}`)));
    await importFile(page, page.getByRole('button', { name: /Import a skin/ }), {
      name: `artwork-${base}.zip`, mimeType: 'application/zip', buffer: Buffer.from(zipSync(files)),
    });
    await expect(page.locator('html')).toHaveAttribute('data-layout', base);
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await expect(page.locator('.deck')).toHaveCount(2);
    await openModule(page, 'jog', 'A');
    const renderedSlots = await page.evaluate(() => {
      const style = selector => getComputedStyle(document.querySelector(selector));
      return {
        panel: style('.deck').backgroundImage, titlebar: style('.rack-title').backgroundImage,
        background: getComputedStyle(document.body).backgroundImage, frame: style('.deck').borderImageSource,
        buttons: style('.transport-play').backgroundImage, numbers: style('.lcd-digit').backgroundImage,
        platter: style('.jog-wheel').backgroundImage, pitch: style('.pitch-section').backgroundImage,
      };
    });
    for (const [slot, value] of Object.entries(renderedSlots)) if (!value.includes('data:image/png;base64,')) artworkFailures.push({ base, slot, actual: value });
    await assertLcdSprites(page);
    await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  }
  expect(artworkFailures, 'Every base layout must display every custom artwork slot').toEqual([]);
});

test('Pro selectors load playable genres and reuse a local import on either deck', async ({ page }) => {
  await page.getByRole('button', { name: /Pro decks/ }).click();
  await expect(page.getByRole('heading', { name: 'Make the mix yours.' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(d => d.source === 'pcm'))).toBe(true);
  await expect(page.locator('.pro-track-pickers .module-picker')).toHaveCount(2);
  await expect(page.locator('.deck .module-picker')).toHaveCount(0);
  const pickerPosition = await page.evaluate(() => {
    const decks = document.querySelector('.decks');
    const pickers = document.querySelector('.pro-track-pickers');
    return { follows: !!(decks.compareDocumentPosition(pickers) & Node.DOCUMENT_POSITION_FOLLOWING), deckBottom: decks.getBoundingClientRect().bottom, pickerTop: pickers.getBoundingClientRect().top };
  });
  expect(pickerPosition.follows).toBe(true);
  expect(pickerPosition.pickerTop).toBeGreaterThanOrEqual(pickerPosition.deckBottom - 1);
  await expect(page.getByLabel('Deck A genre', { exact: true })).toHaveValue('All genres');
  await expect(page.getByLabel('Deck B genre', { exact: true })).toHaveValue('All genres');
  await expect(page.getByLabel('Deck A track', { exact: true }).locator('option:not([value=""])')).toHaveCount(playableTracks.length);
  const optionTitles = await page.getByLabel('Deck A track', { exact: true }).locator('option:not([value=""])').allTextContents();
  expect(optionTitles).toEqual(playableTracks.map(track => track.title));
  expect(optionTitles.some(title => /\bbpm\b/i.test(title))).toBe(false);
  await expect(page.getByLabel('Deck A library size', { exact: true })).toHaveText(`${playableTracks.length} playable tracks · ${new Set(playableTracks.map(track => track.genre)).size} genres`);
  await expect(page.locator('.reference-track:visible')).toHaveCount(0);
  const beforeSelection = await deckSnapshots(page);
  await page.getByLabel('Deck A genre', { exact: true }).selectOption('Techno');
  await expect(page.getByLabel('Deck A library size', { exact: true })).toHaveText(`${playableTracks.filter(track => track.genre === 'Techno').length} tracks shown · ${playableTracks.length} in library`);
  const selectorA = page.getByLabel('Deck A track', { exact: true });
  expect(await selectorA.locator('option:not([value=""])').count()).toBeGreaterThanOrEqual(2);
  await selectorA.selectOption(playableTracks.find(track => track.title === 'Robowalk').id);
  expect(await deckSnapshots(page)).toEqual(beforeSelection);
  await page.getByRole('button', { name: 'Load selected track deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].name)).toContain('Robowalk');
  await expect(page.getByLabel('Deck A genre', { exact: true })).toHaveValue('Techno');
  expect((await deckSnapshots(page))[1]).toEqual(beforeSelection[1]);
  await setRange(page, 'Deck A pitch', 3.25);
  const beforeNavigation = await deckSnapshots(page);
  const techno = playableTracks.filter(track => track.genre === 'Techno');
  const next = techno[(techno.findIndex(track => track.id === beforeNavigation[0].trackId) + 1) % techno.length];
  await page.getByRole('button', { name: 'Play deck A', exact: true }).click();
  for (const [direction, title] of [['Next', next.title], ['Previous', 'Robowalk']]) {
    await page.getByRole('button', { name: `${direction} track deck A`, exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].name)).toContain(title);
    const navigated = await deckSnapshots(page);
    expect(navigated[0].playing).toBe(true);
    expect(navigated[0].pitch).toBe(0);
    expect(navigated[0].effectiveBpm).toBe(navigated[0].bpm);
    expect(navigated[1]).toEqual(beforeNavigation[1]);
    await expect(page.getByLabel('Deck A genre', { exact: true })).toHaveValue('Techno');
    await expect(selectorA).toHaveValue(navigated[0].trackId);
  }
  await page.getByRole('button', { name: 'Pause deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].playing)).toBe(false);

  let fileChoosers = 0;
  page.on('filechooser', () => { fileChoosers++; });
  await importFile(page, page.getByRole('button', { name: 'Import track into deck A', exact: true }), {
    name: 'my-house-loop.mp3', mimeType: 'audio/mpeg', buffer: readFileSync(asset('tracks/selection.mp3')),
  });
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].name)).toBe('my-house-loop.mp3');
  await expect(page.getByLabel('Deck A genre', { exact: true })).toHaveValue('Local files');
  expect(await page.evaluate(() => window.bitCheer.audio.state[0].pitch)).toBe(0);
  const localId = await page.evaluate(() => window.bitCheer.audio.state[0].trackId);
  expect(localId).toMatch(/^local:/);
  await expect.poll(() => page.evaluate(id => window.bitCheer.library.some(track => track.id === id), localId)).toBe(true);
  const beforeReuse = await deckSnapshots(page);
  await page.getByLabel('Deck B genre', { exact: true }).selectOption('Local files');
  await page.getByLabel('Deck B track', { exact: true }).selectOption(localId);
  expect(await deckSnapshots(page)).toEqual(beforeReuse);
  await page.getByRole('button', { name: 'Load selected track deck B', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[1].trackId)).toBe(localId);
  expect((await deckSnapshots(page))[0]).toEqual(beforeReuse[0]);
  expect(fileChoosers).toBe(1);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(deck => deck.duration > 20))).toBe(true);
  const loaded = await deckSnapshots(page);
  await page.getByRole('button', { name: 'Hide Track picker deck B', exact: true }).click();
  await expect(page.getByLabel('Deck B track', { exact: true })).toHaveCount(0);
  await openModule(page, 'picker', 'B');
  await page.getByRole('button', { name: 'Remove Track picker deck B', exact: true }).click();
  await expect(moduleElement(page, 'picker', 'B')).toHaveCount(0);
  await openModule(page, 'picker', 'B');
  await expect(page.getByLabel('Deck B track', { exact: true })).toHaveValue(localId);
  expect(await deckSnapshots(page)).toEqual(loaded);
  await openModule(page, 'discovery');
  await expect(page.locator('.reference-track')).toHaveCount(8);
  expect(await page.locator('.reference-track').first().getAttribute('href')).toContain('bandcamp.com/track/');
  await playBoth(page);
  for (const deck of [0, 1]) await expect.poll(() => page.evaluate(index => window.bitCheer.telemetry[index].peak, deck)).toBeGreaterThan(.01);
});

test('Pro decks browse a chosen folder tree and load tracks from disk on either deck', async ({ page }) => {
  await page.getByRole('button', { name: /Pro decks/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(d => d.source === 'pcm'))).toBe(true);
  // Stand in for the native folder dialog with an in-memory directory tree backed by a bundled recording.
  await page.evaluate(() => {
    window.__folderReads = 0;
    const file = name => ({ kind: 'file', name, getFile: async () => {
      window.__folderReads++;
      const bytes = await (await fetch(new URL('tracks/selection.mp3', document.baseURI))).arrayBuffer();
      return new File([bytes], name, { type: 'audio/mpeg' });
    } });
    const dir = (name, children) => ({ kind: 'directory', name,
      async *entries() { yield* Object.entries(children); },
      async getDirectoryHandle(child) { return children[child]; },
      async getFileHandle(child) { return children[child]; } });
    const root = dir('My Crate', { 'cover.jpg': file('cover.jpg'), 'warmup.mp3': file('warmup.mp3'), House: dir('House', { 'deep cut.mp3': file('deep cut.mp3') }) });
    window.showDirectoryPicker = async () => root;
  });
  await openModule(page, 'picker', 'A');
  await page.getByRole('button', { name: 'Browse a folder for deck A', exact: true }).click();
  const browserA = page.getByLabel('Folder browser deck A', { exact: true });
  // The first browse explains that the system folder dialog greys out files before opening it.
  await expect(browserA).toContainText('greys out the files inside');
  await page.getByRole('button', { name: 'Choose music folder deck A', exact: true }).click();
  await expect(browserA.locator('.folder-entry')).toHaveText(['📁 House', '♪ warmup.mp3']);
  expect(await page.evaluate(() => window.__folderReads)).toBe(0);
  await browserA.getByRole('button', { name: 'Open House deck A', exact: true }).click();
  await expect(browserA.locator('.folder-path')).toContainText('My Crate/House');
  const before = await deckSnapshots(page);
  await page.getByRole('button', { name: 'Load deep cut.mp3 into deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].name)).toBe('deep cut.mp3');
  expect((await deckSnapshots(page))[1]).toEqual(before[1]);
  await expect(page.getByLabel('Deck A genre', { exact: true })).toHaveValue('Local files');
  await expect(browserA.getByRole('button', { name: 'Load deep cut.mp3 into deck A' })).toHaveClass(/is-loaded/);
  await page.getByRole('button', { name: 'Up one folder deck A', exact: true }).click();
  await page.getByLabel('Filter folder deck A', { exact: true }).fill('warm');
  await expect(browserA.locator('.folder-entry')).toHaveText(['♪ warmup.mp3']);

  // Deck B reuses the open folder without asking again, and its browser is independent.
  await page.evaluate(() => { window.showDirectoryPicker = async () => { throw new Error('must not prompt again'); }; });
  await openModule(page, 'picker', 'B');
  await page.getByRole('button', { name: 'Browse a folder for deck B', exact: true }).click();
  await page.getByRole('button', { name: 'Load warmup.mp3 into deck B', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[1].name)).toBe('warmup.mp3');
  expect(await page.evaluate(() => window.bitCheer.audio.state[0].name)).toBe('deep cut.mp3');
  const folderTracks = await page.evaluate(() => window.bitCheer.library.filter(track => track.id.startsWith('folder:')).length);
  expect(folderTracks).toBe(2);
  await page.getByRole('button', { name: 'Close folder browser deck B', exact: true }).click();
  await expect(page.getByLabel('Folder browser deck B', { exact: true })).toHaveCount(0);
  await playBoth(page);
  for (const deck of [0, 1]) await expect.poll(() => page.evaluate(index => window.bitCheer.telemetry[index].peak, deck)).toBeGreaterThan(.01);
});

test('browsers without the folder API fall back to a folder upload tree, including hi-res FLAC', async ({ page }, testInfo) => {
  const folder = testInfo.outputPath('Fallback Crate');
  const { mkdirSync, copyFileSync, writeFileSync } = await import('node:fs');
  mkdirSync(path.join(folder, 'Techno'), { recursive: true });
  copyFileSync(asset('tracks/robowalk.mp3'), path.join(folder, 'Techno', 'robo.mp3'));
  copyFileSync(path.join(root, 'tests/fixtures/kick-120-24bit-96k.flac'), path.join(folder, 'Techno', 'Kick 24-96.FLAC'));
  writeFileSync(path.join(folder, 'notes.txt'), 'not audio');
  await page.evaluate(() => { delete window.showDirectoryPicker; delete Window.prototype.showDirectoryPicker; });
  await page.getByRole('button', { name: /Pro decks/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(d => d.source === 'pcm'))).toBe(true);
  await openModule(page, 'picker', 'A');
  await page.getByRole('button', { name: 'Browse a folder for deck A', exact: true }).click();
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose music folder deck A', exact: true }).click();
  await (await choosing).setFiles(folder);
  const browserA = page.getByLabel('Folder browser deck A', { exact: true });
  await expect(browserA.locator('.folder-entry')).toHaveText(['📁 Techno']);
  await browserA.getByRole('button', { name: 'Open Techno deck A', exact: true }).click();
  await expect(browserA.locator('.folder-entry')).toHaveText(['↰ ..', '♪ Kick 24-96.FLAC', '♪ robo.mp3']);
  await page.getByRole('button', { name: 'Load robo.mp3 into deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].name)).toBe('robo.mp3');
  // A 24-bit/96 kHz FLAC decodes, is resampled to the audio context rate and plays.
  await page.getByRole('button', { name: 'Load Kick 24-96.FLAC into deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].name)).toBe('Kick 24-96.FLAC');
  expect(await page.evaluate(() => window.bitCheer.audio.state[0].duration)).toBeCloseTo(4, 1);
  await expect(page.locator('.notice.error')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.telemetry[0].peak)).toBeGreaterThan(.01);
});

test('a delayed Pro download cannot replace generated decks after switching to Foundation', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let requested = 0;
  let fulfilled = 0;
  await page.route('**/tracks/selection.mp3', async route => {
    requested++;
    await gate;
    const response = await route.fetch();
    await route.fulfill({ response });
    fulfilled++;
  });
  await page.getByRole('button', { name: /Pro decks/ }).click();
  const selection = playableTracks.find(track => track.title === 'Selection');
  await expect(page.getByLabel('Deck A track', { exact: true }).locator(`option[value="${selection.id}"]`)).toBeAttached();
  // Also covers a fast click before the public catalog finished loading.
  if (!requested) {
    await page.getByLabel('Deck A track', { exact: true }).selectOption(selection.id);
    await page.getByRole('button', { name: 'Load selected track deck A', exact: true }).click();
  }
  await expect.poll(() => requested).toBeGreaterThan(0);
  await page.getByRole('button', { name: /01 Foundation/ }).click();
  await expect(page.getByRole('heading', { name: 'Find your rhythm.' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].seed)).not.toBe(1);
  release();
  await expect.poll(() => fulfilled).toBe(requested);
  // Allow the late response's decode/message callbacks to run before this
  // negative assertion; a stale load must never win after the mode switch.
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.bitCheer.audio.state.map(d => d.source))).toEqual(['generated', 'generated']);
  expect(await page.evaluate(() => window.bitCheer.mode)).toBe('foundation');
  await expect(page.locator('.deck-a .track-title')).not.toContainText('Selection');
});

test('a completed beginner lesson persists and unlocks the next lesson', async ({ page }) => {
  await page.getByRole('button', { name: 'Learning path', exact: true }).click();
  await expect(page.locator('.lesson-card')).toHaveCount(8);
  await expect(page.locator('.lesson-card').nth(1).getByRole('button')).toBeDisabled();
  await page.locator('.lesson-card').first().getByRole('button', { name: /Start lesson/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.context?.state)).toBe('running');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].seed)).not.toBe(1);
  const pitch = await page.evaluate(() => Math.round((window.bitCheer.audio.state[0].bpm / window.bitCheer.audio.state[1].bpm - 1) * 10000) / 100);
  await setRange(page, 'Deck B pitch', pitch);
  await playBoth(page);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].position)).toBeGreaterThan(3.3);
  await page.getByRole('button', { name: /Check my match/ }).click();
  await expect(page.locator('.score-circle strong')).toBeVisible();
  expect(Number(await page.locator('.score-circle strong').textContent())).toBeGreaterThanOrEqual(85);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bit-cheer-progress'))?.progress)).toContain(1);
  await page.reload();
  await page.getByRole('button', { name: 'Learning path', exact: true }).click();
  await expect(page.locator('.lesson-card').first()).toHaveClass(/complete/);
  await expect(page.locator('.lesson-card').nth(1).getByRole('button')).toBeEnabled();
});

test('phase and blind drills configure distinct practice challenges', async ({ page }) => {
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await page.locator('.drill-card').filter({ has: page.getByRole('heading', { name: 'Lock the phase', exact: true }) }).getByRole('button').click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].bpm === window.bitCheer.audio.state[1].bpm)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[1].position)).toBeGreaterThan(.05);
  const seed = await page.evaluate(() => window.bitCheer.audio.state[0].seed);
  await expect(page.getByRole('button', { name: 'Randomize tempo deck A', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Randomize tempo deck B', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'New challenge', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].seed)).not.toBe(seed);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].bpm === window.bitCheer.audio.state[1].bpm)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.bitCheer.telemetry[1].beat - window.bitCheer.telemetry[0].beat)).toBeCloseTo(.28, 2);
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await page.locator('.drill-card').filter({ has: page.getByRole('heading', { name: 'Trust your ears', exact: true }) }).getByRole('button').click();
  await expect(page.getByTestId('bpm-a')).toHaveText('---.--');
  await expect(page.getByTestId('bpm-b')).toHaveText('---.--');
});

test('star mode drifts deck speeds behind the pitch faders and rates the held sync', async ({ page }) => {
  test.setTimeout(45000);
  await page.locator('.mode-card').filter({ hasText: 'Star mode' }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].bpm === window.bitCheer.audio.state[1].bpm)).toBe(true);
  await expect(page.locator('.star-meter')).toContainText('Drop the needle on both decks');
  await page.locator('.play-both-button').click();
  await expect(page.locator('.star-meter')).toContainText(/LOCKED IN|DRIFTING/);
  // Speeds wander while the pitch faders stay where the player left them.
  await expect.poll(() => page.evaluate(() => {
    const { telemetry, audio } = window.bitCheer;
    return Math.max(...telemetry.map((deck, i) => Math.abs(deck.bpm - audio.state[i].bpm)));
  }), { timeout: 10000 }).toBeGreaterThan(.05);
  expect(await page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.pitch))).toEqual([0, 0]);
  await page.getByRole('button', { name: /Finish the run/ }).click();
  await expect(page.locator('.notice')).toContainText('10 seconds');
  await page.waitForTimeout(8000);
  await page.getByRole('button', { name: /Finish the run/ }).click();
  await expect(page.locator('.match-result')).toContainText(/In sync \d+\.\d s of \d+ s · longest lock/);
});

test('pro decks can start and stop a star run on loaded tracks', async ({ page }) => {
  await page.locator('.mode-card').filter({ hasText: 'Pro decks' }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(deck => deck.source === 'pcm')), { timeout: 15000 }).toBe(true);
  await page.getByRole('button', { name: '★ Star run', exact: true }).click();
  await expect(page.locator('.star-meter')).toContainText('Drop the needle on both decks');
  await page.locator('.play-both-button').click();
  await expect.poll(() => page.evaluate(() => {
    const { telemetry, audio } = window.bitCheer;
    return Math.max(...telemetry.map((deck, i) => Math.abs(deck.bpm - audio.state[i].bpm * (1 + audio.state[i].pitch / 100))));
  }), { timeout: 10000 }).toBeGreaterThan(.05);
  await page.getByRole('button', { name: '★ Stop star run', exact: true }).click();
  await expect(page.locator('.star-meter')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const { telemetry, audio } = window.bitCheer;
    return Math.max(...telemetry.map((deck, i) => Math.abs(deck.bpm - audio.state[i].bpm * (1 + audio.state[i].pitch / 100))));
  })).toBeLessThan(.001);
});

test('tap tempo measures human tapping and mobile layout remains usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('slider', { name: 'Deck A pitch', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-390.png'), fullPage: true });
  await openModule(page, 'tap');
  const tap = page.getByRole('button', { name: 'Tap tempo', exact: true });
  for (let i = 0; i < 5; i++) {
    await tap.click();
    if (i < 4) await page.waitForTimeout(500);
  }
  const bpm = Number(await page.locator('.tap-readout strong').textContent());
  expect(bpm).toBeGreaterThan(100);
  expect(bpm).toBeLessThan(125);
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('actual Web Audio graph routes isolated stereo pairs and mono sums without channel bleed', async ({ page }) => {
  // Serve the real routing module as a test-only module so this checks identical
  // graph code against both the development server and the production bundle.
  await page.route('**/__bitcheer_test__/output-routing.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: readFileSync(path.join(root, 'src/output-routing.js'), 'utf8'),
  }));
  const results = await page.evaluate(async () => {
    const { buildHardwareGraph, validateRouting } = await import(new URL('__bitcheer_test__/output-routing.js', location.href).href);
    const cases = [
      { channels: 4, config: { mode: 'stereo', a: 0, b: 2 }, expected: [.1, .2, .3, .4] },
      { channels: 6, config: { mode: 'stereo', a: 4, b: 0 }, expected: [.3, .4, 0, 0, .1, .2] },
      { channels: 6, config: { mode: 'mono', a: 1, b: 4 }, expected: [0, .15, 0, 0, .35, 0] },
    ];
    const rendered = [];
    for (const entry of cases) {
      const context = new OfflineAudioContext(entry.channels, 8192, 48000);
      const sources = [[.1, .2], [.3, .4]].map(levels => {
        const buffer = context.createBuffer(2, 8192, 48000);
        levels.forEach((level, channel) => buffer.getChannelData(channel).fill(level));
        const source = context.createBufferSource();
        source.buffer = buffer;
        return source;
      });
      const graph = buildHardwareGraph(context, sources, entry.config, 1);
      context.destination.channelCount = graph.channelCount;
      context.destination.channelInterpretation = 'discrete';
      graph.attach();
      // Rejected overlapping outputs must not disconnect an already-valid
      // graph: the subsequent rendered samples verify it remains audible.
      let rejected = false;
      try { buildHardwareGraph(context, sources, { mode: 'stereo', a: 0, b: 1 }, 1); }
      catch { rejected = true; }
      sources.forEach(source => source.start());
      const buffer = await context.startRendering();
      const actual = Array.from({ length: entry.channels }, (_, channel) => {
        // Skip compressor look-ahead. Chromium may apply automatic makeup gain
        // even below threshold; compare subsequent layouts to this reference.
        const samples = buffer.getChannelData(channel).subarray(2048);
        let sum = 0;
        let peak = 0;
        for (const sample of samples) { sum += sample; peak = Math.max(peak, Math.abs(sample)); }
        return { mean: sum / samples.length, peak };
      });
      rendered.push({ actual, expected: entry.expected, rejected });
      graph.disconnect();
    }
    let unsupportedRejected = false;
    try { validateRouting({ mode: 'stereo', a: 0, b: 2 }, 2); }
    catch { unsupportedRejected = true; }
    return { rendered, unsupportedRejected };
  });
  expect(results.unsupportedRejected).toBe(true);
  const reference = results.rendered[0].actual.map(channel => channel.mean);
  expect(reference[0]).toBeGreaterThan(.05);
  expect(reference[2]).toBeGreaterThan(.15);
  // Each deck has a different L/R signature. These exact ratios identify
  // A and B and detect swaps, summed decks, missing channels, or channel bleed.
  expect(reference[1]).toBeCloseTo(reference[0] * 2, 5);
  expect(reference[3]).toBeCloseTo(reference[2] * 4 / 3, 5);
  const expectedLayouts = [
    reference,
    [reference[2], reference[3], 0, 0, reference[0], reference[1]],
    [0, (reference[0] + reference[1]) / 2, 0, 0, (reference[2] + reference[3]) / 2, 0],
  ];
  for (const [caseIndex, result] of results.rendered.entries()) {
    expect(result.rejected, 'Overlapping channel pairs must be rejected').toBe(true);
    result.actual.forEach((channel, index) => {
      expect(channel.mean).toBeCloseTo(expectedLayouts[caseIndex][index], 5);
      if (result.expected[index] === 0) expect(channel.peak, 'Unused output channels must remain silent').toBeLessThan(.000001);
    });
  }
});

test('stereo-device output controls route independent mono decks and restore the stereo mix', async ({ page }, testInfo) => {
  await playBoth(page);
  await setRange(page, 'Crossfader', 1);
  await openModule(page, 'monitor');
  await openModule(page, 'outputs');
  const capacity = await page.evaluate(() => window.bitCheer.audio.context.destination.maxChannelCount);
  await expect(page.getByText(`${capacity} channels exposed by browser`, { exact: true })).toBeVisible();
  // Headless Chromium exposes a stereo default device. On machines with more
  // outputs, the real offline graph test above covers the additional mappings.
  if (capacity < 4) await expect(page.getByRole('option', { name: 'Separate stereo pairs', exact: true })).toHaveJSProperty('disabled', true);
  await page.getByLabel('Output mode', { exact: true }).selectOption('mono');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.routing)).toEqual({ mode: 'mono', a: 0, b: 1 });
  await expect(page.getByLabel('Deck A output', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Deck B output', { exact: true })).toHaveValue('1');
  await expect(page.getByRole('slider', { name: 'Crossfader', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Split cue', { exact: true })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.gains.every(gain => Math.abs(gain.gain.value - .8) < .001))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('hardware-routing-desktop.png'), fullPage: true });
  await page.evaluate(() => {
    const engine = window.bitCheer.audio;
    const splitter = engine.context.createChannelSplitter(2);
    const silent = engine.context.createGain();
    silent.gain.value = 0;
    silent.connect(engine.context.destination);
    engine.hardwareGraph.master.connect(splitter);
    const analysers = [0, 1].map(channel => {
      const analyser = engine.context.createAnalyser();
      analyser.fftSize = 256;
      splitter.connect(analyser, channel);
      analyser.connect(silent);
      return analyser;
    });
    window.__routingProbe = { splitter, silent, analysers };
  });
  for (const channel of [0, 1]) {
    await expect.poll(() => page.evaluate(index => {
      const samples = new Float32Array(256);
      window.__routingProbe.analysers[index].getFloatTimeDomainData(samples);
      return Math.max(...samples.map(Math.abs));
    }, channel)).toBeGreaterThan(.001);
  }
  const failure = await page.evaluate(async () => {
    const engine = window.bitCheer.audio;
    const before = engine.hardwareGraph;
    let rejected = false;
    try { await engine.setRouting({ mode: 'mono', a: 0, b: 0 }); }
    catch { rejected = true; }
    return { rejected, unchanged: before === engine.hardwareGraph, routing: engine.routing };
  });
  expect(failure).toEqual({ rejected: true, unchanged: true, routing: { mode: 'mono', a: 0, b: 1 } });
  await page.evaluate(() => {
    const probe = window.__routingProbe;
    probe.splitter.disconnect();
    probe.analysers.forEach(analyser => analyser.disconnect());
    probe.silent.disconnect();
  });
  await page.getByRole('button', { name: 'Swap A / B', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.routing)).toEqual({ mode: 'mono', a: 1, b: 0 });
  await page.getByLabel('Output mode', { exact: true }).selectOption('mix');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.routing.mode)).toBe('mix');
  await expect(page.getByRole('slider', { name: 'Crossfader', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Split cue', { exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.gains[0].gain.value)).toBeLessThan(.002);
  await expect.poll(() => page.evaluate(() => window.bitCheer.telemetry.every(deck => deck.playing))).toBe(true);
  expect(await page.evaluate(() => window.bitCheer.audio.hardwareGraph)).toBeNull();
  await page.evaluate(() => {
    const engine = window.bitCheer.audio;
    const analyser = engine.context.createAnalyser();
    analyser.fftSize = 256;
    const silent = engine.context.createGain();
    silent.gain.value = 0;
    engine.limiter.connect(analyser);
    analyser.connect(silent).connect(engine.context.destination);
    window.__mixProbe = { analyser, silent };
  });
  await expect.poll(() => page.evaluate(() => {
    const samples = new Float32Array(256);
    window.__mixProbe.analyser.getFloatTimeDomainData(samples);
    return Math.max(...samples.map(Math.abs));
  })).toBeGreaterThan(.001);
  await page.evaluate(() => { window.__mixProbe.analyser.disconnect(); window.__mixProbe.silent.disconnect(); });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('hardware-routing-mobile.png'), fullPage: true });
});

test('a denied output-device change restores the confirmed selector and preserves the playing graph', async ({ page }) => {
  await playBoth(page);
  await openModule(page, 'outputs');
  await page.getByLabel('Output mode', { exact: true }).selectOption('mono');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.routing)).toEqual({ mode: 'mono', a: 0, b: 1 });
  await page.evaluate(() => {
    const engine = window.bitCheer.audio;
    window.__beforeDeniedOutput = engine.hardwareGraph;
    window.__deniedOutputCalls = [];
    engine.context.setSinkId = async deviceId => {
      window.__deniedOutputCalls.push(deviceId);
      throw new Error('Output permission denied');
    };
    engine.outputDevices.push({ id: 'denied', label: 'Denied test device' });
    engine.emitRouting();
  });
  const selector = page.getByLabel('Output device', { exact: true });
  await expect(selector).toHaveValue('default');
  await selector.selectOption('denied');
  await expect(page.getByText('Output permission denied', { exact: true })).toBeVisible();
  // Native selects change before Elm receives the result. A rejected choice
  // must render the confirmed value even though the model's deviceId is equal.
  await expect(selector).toHaveValue('default');
  expect(await page.evaluate(() => ({
    calls: window.__deniedOutputCalls,
    sameGraph: window.__beforeDeniedOutput === window.bitCheer.audio.hardwareGraph,
    routing: window.bitCheer.audio.routing,
    playing: window.bitCheer.telemetry.every(deck => deck.playing),
  }))).toEqual({ calls: ['denied'], sameGraph: true, routing: { mode: 'mono', a: 0, b: 1 }, playing: true });
});

test('Foundation stays kick-only and each deck has independent tempo and material actions', async ({ page }) => {
  await expect(page.locator('.deck-a .loop-badge')).toHaveText('KICK-ONLY');
  expect(await page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.elements))).toEqual([1, 1]);
  await expect(page.locator('.foundation-guide')).toBeVisible();
  await expect(page.locator('button.element')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Add an element/ })).toHaveCount(0);
  await expect(page.getByLabel('Show EQ', { exact: true })).toHaveCount(0);
  await playBoth(page);
  await pauseBoth(page);
  await setRange(page, 'Deck A pitch', 3);
  await setRange(page, 'Deck B pitch', -2);
  await seekPausedDeck(page, 'A', .25);
  await seekPausedDeck(page, 'B', .375);

  for (const [index, letter] of ['A', 'B'].entries()) {
    const beforeTempo = await deckSnapshots(page);
    await page.getByRole('button', { name: `Randomize tempo deck ${letter}`, exact: true }).click();
    await expect.poll(async () => Math.abs((await deckSnapshots(page))[index].effectiveBpm - beforeTempo[index].effectiveBpm)).toBeGreaterThan(.9);
    await expect.poll(() => page.evaluate(deck => {
      const state = window.bitCheer.audio.state[deck];
      return state.position * state.bpm / 60;
    }, index)).toBeCloseTo(beforeTempo[index].position * beforeTempo[index].bpm / 60, 2);
    const afterTempo = await deckSnapshots(page);
    expect(afterTempo[1 - index]).toEqual(beforeTempo[1 - index]);
    for (const key of ['seed', 'source', 'name', 'elements', 'playing']) expect(afterTempo[index][key]).toBe(beforeTempo[index][key]);
    expect(afterTempo[index].position * afterTempo[index].bpm / 60).toBeCloseTo(beforeTempo[index].position * beforeTempo[index].bpm / 60, 2);
    expect(afterTempo[index].elements).toBe(1);

    await setRange(page, `Deck ${letter} pitch`, 2.5);
    const beforeTrack = await deckSnapshots(page);
    const oldWaveform = await page.evaluate(deck => Array.from(window.bitCheer.audio.waveforms[deck]), index);
    await page.getByRole('button', { name: `Change track deck ${letter}`, exact: true }).click();
    await expect.poll(async () => (await deckSnapshots(page))[index].seed).not.toBe(beforeTrack[index].seed);
    await expect.poll(() => page.evaluate(deck => Array.from(window.bitCheer.audio.waveforms[deck]), index)).not.toEqual(oldWaveform);
    await expect.poll(() => page.evaluate(deck => window.bitCheer.telemetry[deck].position, index)).toBe(0);
    const afterTrack = await deckSnapshots(page);
    expect(afterTrack[1 - index]).toEqual(beforeTrack[1 - index]);
    expect(afterTrack[index].pitch).toBe(0);
    expect(afterTrack[index].effectiveBpm).toBe(afterTrack[index].bpm);
    expect(afterTrack[index].elements).toBe(1);
    expect(afterTrack[index].source).toBe('generated');
    expect(afterTrack[index].playing).toBe(false);
    await expect(page.getByRole('slider', { name: `Deck ${letter} pitch`, exact: true })).toHaveValue(String(afterTrack[index].pitch));
  }
});

test('Builder independently adds instruments and changes only the selected generated track', async ({ page }) => {
  await page.getByRole('button', { name: /02 Loop builder/ }).click();
  await expect(page.getByRole('heading', { name: 'Build your groove.', exact: true })).toBeVisible();
  await expect(page.locator('button.element')).toHaveCount(4);
  // Active rows plus eighteen addable voices expose the complete twenty-voice bank.
  await expect(page.getByLabel('Add instrument to deck A', { exact: true }).locator('option:not([value=""])')).toHaveCount(18);
  await expect(page.getByLabel('Add instrument to deck B', { exact: true }).locator('option:not([value=""])')).toHaveCount(18);
  await expect(page.getByLabel('Add instrument to deck A', { exact: true }).locator('option:checked')).toHaveText('+ Add instrument…');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.elements))).toEqual([3, 3]);
  await page.getByRole('button', { name: 'Add an element to deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.elements))).toEqual([7, 3]);
  await page.getByRole('button', { name: 'Add an element to deck B', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.elements))).toEqual([7, 7]);
  await page.getByLabel('Add instrument to deck A', { exact: true }).selectOption('19');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.elements))).toEqual([7 | (1 << 19), 7]);
  await expect(page.getByLabel('Add instrument to deck A', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Add instrument to deck A', { exact: true }).locator('option:checked')).toHaveText('+ Add instrument…');
  await playBoth(page);
  await pauseBoth(page);
  await seekPausedDeck(page, 'A', .25);
  await seekPausedDeck(page, 'B', .375);

  for (const [index, letter] of ['A', 'B'].entries()) {
    const beforeTempo = await deckSnapshots(page);
    await page.getByRole('button', { name: `Randomize tempo deck ${letter}`, exact: true }).click();
    await expect.poll(async () => Math.abs((await deckSnapshots(page))[index].effectiveBpm - beforeTempo[index].effectiveBpm)).toBeGreaterThan(.9);
    await expect.poll(() => page.evaluate(deck => {
      const state = window.bitCheer.audio.state[deck];
      return state.position * state.bpm / 60;
    }, index)).toBeCloseTo(beforeTempo[index].position * beforeTempo[index].bpm / 60, 2);
    const afterTempo = await deckSnapshots(page);
    expect(afterTempo[1 - index]).toEqual(beforeTempo[1 - index]);
    for (const key of ['seed', 'source', 'name', 'elements', 'playing']) expect(afterTempo[index][key]).toBe(beforeTempo[index][key]);
    expect(afterTempo[index].position * afterTempo[index].bpm / 60).toBeCloseTo(beforeTempo[index].position * beforeTempo[index].bpm / 60, 2);

    await setRange(page, `Deck ${letter} pitch`, 3.25);
    const beforeTrack = await deckSnapshots(page);
    const oldWaveform = await page.evaluate(deck => Array.from(window.bitCheer.audio.waveforms[deck]), index);
    await page.getByRole('button', { name: `Change track deck ${letter}`, exact: true }).click();
    await expect.poll(async () => (await deckSnapshots(page))[index].seed).not.toBe(beforeTrack[index].seed);
    await expect.poll(() => page.evaluate(deck => Array.from(window.bitCheer.audio.waveforms[deck]), index)).not.toEqual(oldWaveform);
    await expect.poll(() => page.evaluate(deck => window.bitCheer.telemetry[deck].position, index)).toBe(0);
    const afterTrack = await deckSnapshots(page);
    expect(afterTrack[1 - index]).toEqual(beforeTrack[1 - index]);
    expect(afterTrack[index].pitch).toBe(0);
    expect(afterTrack[index].effectiveBpm).toBe(afterTrack[index].bpm);
    expect(afterTrack[index].elements).not.toBe(beforeTrack[index].elements);
    expect(afterTrack[index].elements & 1).toBe(1);
    expect(afterTrack[index].elements).toBeGreaterThan(1);
    expect(afterTrack[index].source).toBe('generated');
  }

  await page.getByRole('button', { name: /01 Foundation/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.elements))).toEqual([1, 1]);
  await expect(page.locator('button.element')).toHaveCount(0);
});

test('Pro tempo preserves PCM while independent track changes reset to native tempo', async ({ page }) => {
  await page.getByRole('button', { name: /Pro decks/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(deck => deck.source === 'pcm'))).toBe(true);
  // Techno has a different pair from the initial House recordings, proving the
  // current genre drives Change track instead of falling back to a global pool.
  await selectAndLoadTrack(page, 'A', '21seiki Techno Shonen', 'Techno');
  await selectAndLoadTrack(page, 'B', 'Robowalk', 'Techno');
  await playBoth(page);
  await pauseBoth(page);
  await seekPausedDeck(page, 'A', .25);
  await seekPausedDeck(page, 'B', .375);

  for (const [index, letter] of ['A', 'B'].entries()) {
    const beforeTempo = await deckSnapshots(page);
    const oldWaveform = await page.evaluate(deck => Array.from(window.bitCheer.audio.waveforms[deck]), index);
    await page.getByRole('button', { name: `Randomize tempo deck ${letter}`, exact: true }).click();
    await expect.poll(async () => Math.abs((await deckSnapshots(page))[index].effectiveBpm - beforeTempo[index].effectiveBpm)).toBeGreaterThan(.9);
    const afterTempo = await deckSnapshots(page);
    expect(afterTempo[1 - index]).toEqual(beforeTempo[1 - index]);
    for (const key of ['seed', 'source', 'bpm', 'name', 'elements', 'position', 'playing']) expect(afterTempo[index][key]).toBe(beforeTempo[index][key]);
    expect(await page.evaluate(deck => Array.from(window.bitCheer.audio.waveforms[deck]), index)).toEqual(oldWaveform);

    const beforeTrack = await deckSnapshots(page);
    await page.getByRole('button', { name: `Change track deck ${letter}`, exact: true }).click();
    await expect.poll(async () => (await deckSnapshots(page))[index].trackId).not.toBe(beforeTrack[index].trackId);
    const afterTrack = await deckSnapshots(page);
    expect(playableTracks.find(track => track.id === afterTrack[index].trackId)?.genre).toBe('Techno');
    await expect(page.getByLabel(`Deck ${letter} genre`, { exact: true })).toHaveValue('Techno');
    expect(afterTrack[1 - index]).toEqual(beforeTrack[1 - index]);
    expect(afterTrack[index].pitch).toBe(0);
    expect(afterTrack[index].effectiveBpm).toBe(afterTrack[index].bpm);
    expect(afterTrack[index].source).toBe('pcm');
    expect(afterTrack[index].playing).toBe(false);
    expect(await page.evaluate(deck => Array.from(window.bitCheer.audio.waveforms[deck]), index)).not.toEqual(oldWaveform);
    expect(Number(await page.getByRole('slider', { name: `Deck ${letter} pitch`, exact: true }).inputValue())).toBeCloseTo(afterTrack[index].pitch, 2);
  }
  // A new recording starts at its own tempo, even after a large previous offset.
  await selectAndLoadTrack(page, 'A', '21seiki Techno Shonen', 'Techno');
  await page.getByLabel('Deck A pitch range', { exact: true }).selectOption('32');
  await setRange(page, 'Deck A pitch', 23.11);
  const beforeWideChange = await deckSnapshots(page);
  await page.getByRole('button', { name: 'Change track deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].trackId)).not.toBe(beforeWideChange[0].trackId);
  const afterWideChange = await deckSnapshots(page);
  expect(afterWideChange[0].pitch).toBe(0);
  expect(afterWideChange[0].effectiveBpm).toBe(afterWideChange[0].bpm);
  await expect(page.getByRole('slider', { name: 'Deck A pitch', exact: true })).toHaveValue('0');
  expect(afterWideChange[1]).toEqual(beforeWideChange[1]);
});

test('the twenty-voice composer routes real gain, pan, solo and sixteen-step edits independently', async ({ page }) => {
  await page.getByRole('button', { name: /02 Loop builder/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].elements)).toBe(3);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].voices[0].preview)).toBeGreaterThan(0);
  await page.getByLabel('Add instrument to deck A', { exact: true }).selectOption('19');
  await expect(page.getByRole('button', { name: 'Deck A Zap', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Deck A Zap step \d+$/ })).toHaveCount(16);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].elements & (1 << 19))).toBe(1 << 19);
  const otherDeck = (await deckSnapshots(page))[1];
  await page.getByRole('button', { name: 'Solo Kick deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].solo)).toBe(0);
  await expect(page.getByRole('button', { name: 'Solo Kick deck A', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Play deck A', exact: true }).click();
  await page.evaluate(() => {
    const engine = window.bitCheer.audio;
    const splitter = engine.context.createChannelSplitter(2);
    const silent = engine.context.createGain();
    silent.gain.value = 0;
    silent.connect(engine.context.destination);
    engine.node.connect(splitter, 0);
    const analysers = [0, 1].map(channel => {
      const analyser = engine.context.createAnalyser();
      analyser.fftSize = 256;
      splitter.connect(analyser, channel);
      analyser.connect(silent);
      return analyser;
    });
    window.__voiceProbe = { splitter, silent, analysers };
  });
  const peaks = () => page.evaluate(() => window.__voiceProbe.analysers.map(analyser => {
    const samples = new Float32Array(256);
    analyser.getFloatTimeDomainData(samples);
    return Math.max(...samples.map(Math.abs));
  }));
  const peakAcrossBeat = () => page.evaluate(async () => {
    const until = performance.now() + 700;
    let peak = 0;
    while (performance.now() < until) {
      for (const analyser of window.__voiceProbe.analysers) {
        const samples = new Float32Array(256);
        analyser.getFloatTimeDomainData(samples);
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      }
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return peak;
  });
  await setRange(page, 'Deck A Kick pan', -1);
  await expect.poll(async () => { const [left, right] = await peaks(); return left > .001 && right < .00001; }).toBe(true);
  await setRange(page, 'Deck A Kick pan', 1);
  await expect.poll(async () => { const [left, right] = await peaks(); return right > .001 && left < .00001; }).toBe(true);
  await setRange(page, 'Deck A Kick level', 0);
  await expect.poll(peakAcrossBeat).toBeLessThan(.00001);
  // The hat and Zap remain enabled, so silence also proves solo actually
  // excludes other voices from the DSP rather than only highlighting its row.
  expect(await page.evaluate(() => window.bitCheer.audio.state[0].elements)).toBe(3 | (1 << 19));
  await setRange(page, 'Deck A Kick level', 1);
  await expect.poll(async () => Math.max(...await peaks())).toBeGreaterThan(.001);
  const activeSteps = await page.getByRole('button', { name: /^Deck A Kick step \d+$/ }).evaluateAll(buttons => buttons.filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.getAttribute('aria-label')));
  for (const name of activeSteps) await page.getByRole('button', { name, exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].voices[0].pattern)).toBe(0);
  await expect.poll(peakAcrossBeat).toBeLessThan(.00001);
  await page.getByRole('button', { name: 'Deck A Kick step 1', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].voices[0].pattern)).toBe(1);
  await expect.poll(async () => Math.max(...await peaks())).toBeGreaterThan(.001);
  await page.getByRole('button', { name: 'Generate pattern for Kick deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].voices[0].pattern)).toBe(-1);
  await expect(page.locator('.deck-a .voice-row[data-voice="0"] .pattern-mode')).toHaveText('AUTO');
  await page.getByRole('button', { name: 'Solo Kick deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].solo)).toBe(-1);
  expect((await deckSnapshots(page))[1]).toEqual(otherDeck);
  await page.evaluate(() => {
    const { splitter, silent, analysers } = window.__voiceProbe;
    splitter.disconnect(); silent.disconnect(); analysers.forEach(analyser => analyser.disconnect());
  });
  // Mode entry must recover a usable beginner kick from arbitrary composer
  // settings, including a muted/panned kick and a soloed alternative voice.
  await setRange(page, 'Deck A Kick level', 0);
  await page.getByRole('button', { name: 'Solo Zap deck A', exact: true }).click();
  await page.getByRole('button', { name: /01 Foundation/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.map(deck => ({ elements: deck.elements, solo: deck.solo, gain: deck.voices[0].gain, pan: deck.voices[0].pan })))).toEqual([
    { elements: 1, solo: -1, gain: 1, pan: 0 },
    { elements: 1, solo: -1, gain: 1, pan: 0 },
  ]);
  await playBoth(page);
  for (const deck of [0, 1]) await expect.poll(() => page.evaluate(index => window.bitCheer.telemetry[index]?.peak || 0, deck)).toBeGreaterThan(.01);
});

test('CHAOS creates twelve to twenty actual voices on only the chosen deck without changing tempo', async ({ page }) => {
  await expect(page.getByRole('button', { name: /^Chaos deck/ })).toHaveCount(0);
  await page.getByRole('button', { name: /02 Loop builder/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.elements))).toEqual([3, 3]);
  await playBoth(page);
  await pauseBoth(page);
  await setRange(page, 'Deck A pitch', 2.5);
  await setRange(page, 'Deck B pitch', -1.5);
  for (const [index, letter] of ['A', 'B'].entries()) {
    const before = await deckSnapshots(page);
    await page.getByRole('button', { name: `Chaos deck ${letter}`, exact: true }).click();
    await expect.poll(async () => (await deckSnapshots(page))[index].name).toContain('CHAOS STUDY');
    const after = await deckSnapshots(page);
    const selected = after[index];
    const activeCount = selected.elements.toString(2).replace(/0/g, '').length;
    expect(activeCount).toBeGreaterThanOrEqual(12);
    expect(activeCount).toBeLessThanOrEqual(20);
    expect(selected.seed).not.toBe(before[index].seed);
    expect(selected.effectiveBpm).toBeCloseTo(before[index].effectiveBpm, 3);
    expect(selected.source).toBe('generated');
    expect(selected.voices).toHaveLength(20);
    expect(selected.voices.every(voice => voice.pattern > 0 && voice.pattern <= 65535 && voice.gain > 0 && voice.gain <= 1.5 && Math.abs(voice.pan) <= 1)).toBe(true);
    expect(after[1 - index]).toEqual(before[1 - index]);
    await expect(page.locator(`.deck-${letter.toLowerCase()} .voice-row`)).toHaveCount(activeCount);
  }
  await playBoth(page);
  for (const deck of [0, 1]) await expect.poll(() => page.evaluate(index => window.bitCheer.telemetry[index]?.peak || 0, deck)).toBeGreaterThan(.01);
});

test('session focus shows only both decks pitch volume and playback and restores the workspace', async ({ page }, testInfo) => {
  await playBoth(page);
  await pauseBoth(page);
  await openModule(page, 'jog', 'A');
  await page.getByRole('button', { name: 'Hide Screen deck B', exact: true }).click();
  await expect(moduleElement(page, 'screen', 'B')).toHaveClass(/is-collapsed/);
  const normalLayout = await page.locator('.player-module').evaluateAll(nodes => nodes.map(node => [node.dataset.scope, node.dataset.module, node.classList.contains('is-collapsed')]));
  await page.getByRole('button', { name: 'Focus session', exact: true }).click();
  await expect(page.locator('.session-focus-view')).toBeVisible();
  await expect(page.locator('.focus-channel')).toHaveCount(2);
  await expect(page.getByRole('slider')).toHaveCount(4);
  await expect(page.getByRole('button', { name: /^(Play|Pause) deck [AB]$/ })).toHaveCount(4);
  await expect(page.locator('.player-module, .deck, .topbar, .sidebar, .coach-panel, .tap-panel, canvas, .jog-wheel, .composer-rack, .deck-screen, .module-titlebar, .headspace-transport')).toHaveCount(0);
  const allowedButtons = await page.getByRole('button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label') || node.textContent.trim()));
  expect(allowedButtons.every(label => /^(Exit session focus|(Play|Pause) deck [AB]|Fine (increase|decrease) deck [AB] pitch|0)$/.test(label))).toBe(true);
  for (const [index, letter] of ['A', 'B'].entries()) {
    const before = await deckSnapshots(page);
    const pitch = page.getByRole('slider', { name: `Deck ${letter} pitch`, exact: true });
    await pitch.hover();
    await pitch.focus();
    await page.mouse.wheel(0, -100);
    await expect.poll(async () => (await deckSnapshots(page))[index].pitch).not.toBe(before[index].pitch);
    const after = await deckSnapshots(page);
    expect(after[1 - index]).toEqual(before[1 - index]);
    expect(after[index].source).toBe(before[index].source);
    expect(after[index].seed).toBe(before[index].seed);
    expect(Number(await pitch.inputValue())).toBeCloseTo(after[index].pitch, 2);
    await setRange(page, `Deck ${letter} volume`, index === 0 ? .43 : .67);
    await page.getByRole('button', { name: `Play deck ${letter}`, exact: true }).click();
    await expect.poll(() => page.evaluate(deck => window.bitCheer.audio.state[deck].playing, index)).toBe(true);
    await expect.poll(() => page.evaluate(deck => window.bitCheer.telemetry[deck].peak, index)).toBeGreaterThan(.001);
    expect(await page.evaluate(deck => window.bitCheer.audio.state[deck].playing, 1 - index)).toBe(false);
    await page.getByRole('button', { name: `Pause deck ${letter}`, exact: true }).click();
    await expect.poll(() => page.evaluate(deck => window.bitCheer.telemetry[deck].playing, index)).toBe(false);
  }
  expect(await page.evaluate(() => window.bitCheer.audio.volumes)).toEqual([.43, .67]);
  await page.screenshot({ path: testInfo.outputPath('focus-session-desktop.png'), fullPage: true });
  // The pitch input commonly retains focus after an adjustment; Space still
  // controls both transports in this dedicated session view.
  await page.getByRole('slider', { name: 'Deck A pitch', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(deck => deck.playing))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.deck')).toHaveCount(2);
  expect(await page.locator('.player-module').evaluateAll(nodes => nodes.map(node => [node.dataset.scope, node.dataset.module, node.classList.contains('is-collapsed')]))).toEqual(normalLayout);
  expect(await page.evaluate(() => window.bitCheer.audio.state.every(deck => deck.playing))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Focus session', exact: true }).click();
  await expect(page.locator('.focus-channel')).toHaveCount(2);
  const boxes = await page.locator('.focus-channel').evaluateAll(nodes => nodes.map(node => { const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width }; }));
  expect(boxes[0].y).toBe(boxes[1].y);
  expect(boxes[0].x + boxes[0].width).toBeLessThan(boxes[1].x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('focus-session-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Exit session focus', exact: true }).click();
  await expect(page.locator('.deck')).toHaveCount(2);
});

test('module hide remove and restore preserve audio and persist independently per mode and deck', async ({ page }) => {
  await playBoth(page);
  await setRange(page, 'Deck A volume', .37);
  const source = await page.evaluate(() => window.bitCheer.audio.state.map(deck => ({ seed: deck.seed, source: deck.source, name: deck.name, bpm: deck.bpm, pitch: deck.pitch })));
  await page.getByRole('button', { name: 'Hide Volume deck A', exact: true }).click();
  await expect(moduleElement(page, 'volume', 'A')).toHaveClass(/is-collapsed/);
  await expect(page.getByRole('slider', { name: 'Deck A volume', exact: true })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'Deck B volume', exact: true })).toBeVisible();
  await openModule(page, 'volume', 'A');
  await expect(page.getByRole('slider', { name: 'Deck A volume', exact: true })).toHaveValue('0.37');
  await page.getByRole('button', { name: 'Remove Volume deck A', exact: true }).click();
  await expect(moduleElement(page, 'volume', 'A')).toHaveCount(0);
  await openModule(page, 'volume', 'A');
  await expect(page.getByRole('slider', { name: 'Deck A volume', exact: true })).toHaveValue('0.37');
  await page.getByRole('button', { name: 'Hide Screen deck A', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Screen deck B', exact: true }).click();
  await page.getByRole('button', { name: 'Hide Coach session', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Crossfader session', exact: true }).click();
  await expect(moduleElement(page, 'coach')).toHaveClass(/is-collapsed/);
  await expect(moduleElement(page, 'crossfader')).toHaveCount(0);
  expect(await page.evaluate(() => window.bitCheer.audio.state.map(deck => ({ seed: deck.seed, source: deck.source, name: deck.name, bpm: deck.bpm, pitch: deck.pitch })))).toEqual(source);
  expect(await page.evaluate(() => window.bitCheer.audio.state.every(deck => deck.playing))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.bitCheer.telemetry[0].peak)).toBeGreaterThan(.001);
  await page.getByRole('button', { name: /02 Loop builder/ }).click();
  await expect(moduleElement(page, 'screen', 'A')).not.toHaveClass(/is-collapsed/);
  await expect(moduleElement(page, 'screen', 'B')).toBeVisible();
  await expect(moduleElement(page, 'composer', 'A')).toBeVisible();
  await page.getByRole('button', { name: 'Remove Composer deck A', exact: true }).click();
  await page.getByRole('button', { name: /01 Foundation/ }).click();
  await expect(moduleElement(page, 'screen', 'A')).toHaveClass(/is-collapsed/);
  await expect(moduleElement(page, 'screen', 'B')).toHaveCount(0);
  await expect(moduleElement(page, 'coach')).toHaveClass(/is-collapsed/);
  await expect(moduleElement(page, 'crossfader')).toHaveCount(0);
  await expect(page.getByLabel('Add module to deck A', { exact: true }).locator('option[value="composer"]')).toHaveCount(0);
  await page.reload();
  await expect(moduleElement(page, 'screen', 'A')).toHaveClass(/is-collapsed/);
  await expect(moduleElement(page, 'screen', 'B')).toHaveCount(0);
  await expect(moduleElement(page, 'coach')).toHaveClass(/is-collapsed/);
  await expect(moduleElement(page, 'crossfader')).toHaveCount(0);
  await openModule(page, 'crossfader');
  await expect(page.getByRole('slider', { name: 'Crossfader', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /02 Loop builder/ }).click();
  await expect(moduleElement(page, 'composer', 'A')).toHaveCount(0);
  await expect(moduleElement(page, 'composer', 'B')).toBeVisible();
  await openModule(page, 'composer', 'A');
  await expect(page.getByLabel('Add instrument to deck A', { exact: true })).toBeVisible();
  await playBoth(page);
  const builderSource = await page.evaluate(() => window.bitCheer.audio.state.map(deck => ({ seed: deck.seed, source: deck.source, name: deck.name, elements: deck.elements })));
  // Every optional module uses the same reversible window controls. Exercise
  // each actual body, including canvas/jog/routing bodies with event bindings.
  for (const [owner, ids] of [
    ['A', ['screen', 'pitch', 'volume', 'jog', 'waveform', 'eq', 'vu', 'loop', 'composer']],
    ['B', ['pitch', 'volume']],
    ['session', ['crossfader', 'master', 'monitor', 'outputs', 'coach', 'tap', 'discovery']],
  ]) {
    const suffix = owner === 'session' ? 'session' : `deck ${owner}`;
    for (const id of ids) {
      await openModule(page, id, owner);
      await page.getByRole('button', { name: `Hide ${moduleLabels[id]} ${suffix}`, exact: true }).click();
      await expect(moduleElement(page, id, owner)).toHaveClass(/is-collapsed/);
      await expect(moduleElement(page, id, owner).locator('.module-body')).toHaveCount(0);
      await openModule(page, id, owner);
      await page.getByRole('button', { name: `Remove ${moduleLabels[id]} ${suffix}`, exact: true }).click();
      await expect(moduleElement(page, id, owner)).toHaveCount(0);
      await openModule(page, id, owner);
      await expect(moduleElement(page, id, owner).locator('.module-body')).toBeVisible();
    }
  }
  expect(await page.evaluate(() => window.bitCheer.audio.state.map(deck => ({ seed: deck.seed, source: deck.source, name: deck.name, elements: deck.elements })))).toEqual(builderSource);
  expect(await page.evaluate(() => window.bitCheer.audio.state.every(deck => deck.playing))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.bitCheer.telemetry[0].peak)).toBeGreaterThan(.001);
  // Transport is permanently integrated into each deck, even when every
  // optional module has been removed from both sides.
  for (const letter of ['A', 'B']) {
    const modules = page.locator(`.player-module[data-scope="deck-${letter.toLowerCase()}"]`);
    for (const id of await modules.evaluateAll(nodes => nodes.map(node => node.dataset.module))) {
      await page.getByRole('button', { name: `Remove ${moduleLabels[id]} deck ${letter}`, exact: true }).click();
      await expect(moduleElement(page, id, letter)).toHaveCount(0);
    }
    await expect(page.getByLabel(`Deck ${letter} transport`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Pause deck ${letter}`, exact: true }).click();
    await expect.poll(() => page.evaluate(index => window.bitCheer.telemetry[index].playing, letter === 'A' ? 0 : 1)).toBe(false);
    await page.getByRole('button', { name: `Play deck ${letter}`, exact: true }).click();
    await expect.poll(() => page.evaluate(index => window.bitCheer.telemetry[index].playing, letter === 'A' ? 0 : 1)).toBe(true);
  }
});

test('pitch sensitivity normalizes wheel modes preserves fine fractions and synchronizes the handle', async ({ page }) => {
  await playBoth(page);
  await pauseBoth(page);
  const peer = (await deckSnapshots(page))[1];
  const pitch = page.getByRole('slider', { name: 'Deck A pitch', exact: true });
  const sensitivity = page.getByLabel('Deck A pitch sensitivity', { exact: true });
  let expected = 0;
  const assertPitch = async () => {
    await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].pitch)).toBeCloseTo(expected, 6);
    await expect.poll(async () => Number(await pitch.inputValue())).toBeCloseTo(expected, 6);
    const handle = await pitch.evaluate(input => {
      const track = input.closest('.pitch-track');
      const marker = track.querySelector('.pitch-handle');
      return { percent: parseFloat(getComputedStyle(track).getPropertyValue('--pitch-position')), expected: (Number(input.max) - Number(input.value)) / (Number(input.max) - Number(input.min)) * 100, top: marker.getBoundingClientRect().top, height: marker.getBoundingClientRect().height };
    });
    expect(handle.percent).toBeCloseTo(handle.expected, 6);
    expect(handle.height).toBeGreaterThan(15);
    expect((await deckSnapshots(page))[1]).toEqual(peer);
  };
  const wheel = async (deltaY, deltaMode, shiftKey = false, increment = .05) => {
    await pitch.dispatchEvent('wheel', { deltaY, deltaMode, shiftKey, bubbles: true, cancelable: true });
    expected = Math.round((expected + increment) * 1e6) / 1e6;
    await assertPitch();
  };
  await sensitivity.selectOption('0.05');
  for (const [delta, mode] of [[-100, 0], [-3, 1], [-1, 2]]) await wheel(delta, mode);
  await wheel(-100, 0, true, .01);
  await wheel(-20, 0, false, .01);
  await wheel(-10, 0, false, .005);
  await sensitivity.selectOption('0.25');
  await wheel(-100, 0, false, .25);
  await wheel(-100, 0, true, .01);
  await pitch.focus();
  await page.keyboard.press('ArrowUp'); expected += .25; await assertPitch();
  await page.keyboard.press('Shift+ArrowDown'); expected -= .01; await assertPitch();
  await page.keyboard.press('PageUp'); expected += 2.5; await assertPitch();
  await sensitivity.selectOption('0.01');
  await pitch.evaluate(input => { for (let i = 0; i < 100; i++) input.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, deltaMode: 0, bubbles: true, cancelable: true })); });
  expected += .01; await assertPitch();
  await page.reload();
  await expect(sensitivity).toHaveValue('0.01');
  await expect(page.getByLabel('Deck B pitch sensitivity', { exact: true })).toHaveValue('0.05');
});

test('the expert lesson requires a timed handover before a matched real-track mix completes', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('bit-cheer-progress', JSON.stringify({ progress: [1, 2, 3, 4, 5, 6, 7], history: [] })));
  await page.reload();
  await page.getByRole('button', { name: 'Learning path', exact: true }).click();
  await page.locator('.lesson-card').last().getByRole('button', { name: /Start lesson/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(deck => deck.source === 'pcm'))).toBe(true);
  await selectAndLoadTrack(page, 'B', 'Selection', 'House');
  await playBoth(page);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].position)).toBeGreaterThan(3.3);
  await page.getByRole('button', { name: /Check my match/ }).click();
  await expect(page.getByText(/Complete the handover: while both decks play/)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bit-cheer-progress')).progress)).not.toContain(8);
  await setRange(page, 'Crossfader', 0);
  for (const value of [.25, .5, .75, 1]) {
    await page.waitForTimeout(800);
    await setRange(page, 'Crossfader', value);
  }
  await page.getByRole('button', { name: /Check my match/ }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bit-cheer-progress')).progress)).toContain(8);
  expect(Number(await page.locator('.score-circle strong').textContent())).toBeGreaterThanOrEqual(85);
});

test('configured hosting path serves the actual engine catalog skin bitmaps and credits', async ({ page }) => {
  const hosting = new URL(page.url());
  const prefix = hosting.pathname.endsWith('/') ? hosting.pathname : hosting.pathname.slice(0, hosting.pathname.lastIndexOf('/') + 1);
  // Chromium omits AudioWorklet fetches from both Playwright request events and
  // Resource Timing. Observe the real loader while preserving its implementation.
  await page.evaluate(() => {
    window.__loadedWorklets = [];
    const addModule = AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule = function(url, options) {
      return addModule.call(this, url, options).then(result => {
        window.__loadedWorklets.push(new URL(url, location.href).href);
        return result;
      });
    };
  });
  await playBoth(page);
  await expect.poll(() => page.evaluate(() => window.bitCheer.telemetry.every(deck => deck.peak > .001))).toBe(true);
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  await expect.poll(() => page.locator('.skin-card img').evaluateAll(images => images.length === 1 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  for (const [id, name] of [['millennium', 'Millennium Chrome']]) {
    await page.locator('.skin-card').filter({ has: page.locator('.skin-card-copy strong', { hasText: name }) }).click();
    await expect(page.locator('html')).toHaveAttribute('data-skin', id);
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await assertLcdSprites(page);
    await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  }
  await page.getByRole('button', { name: /Pro decks/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(deck => deck.source === 'pcm'))).toBe(true);
  await playBoth(page);
  for (const deck of [0, 1]) await expect.poll(() => page.evaluate(index => window.bitCheer.telemetry[index].peak, deck)).toBeGreaterThan(.001);
  const creditsUrl = await page.getByRole('link', { name: /Credits & sources/ }).evaluate(link => link.href);
  expect(new URL(creditsUrl).pathname).toBe(`${prefix}credits.html`);
  const credits = await page.request.get(creditsUrl);
  expect(credits.ok()).toBe(true);
  expect(await credits.text()).toContain('creativecommons.org/licenses/by/3.0/');
  const worklets = await page.evaluate(() => window.__loadedWorklets);
  await page.goto(creditsUrl);
  await expect.poll(() => page.locator('img').evaluateAll(images => images.length >= 4 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  const creditPaths = await page.locator('a[href], img[src]').evaluateAll(nodes => nodes.map(node => node.href || node.src).filter(value => new URL(value).origin === location.origin).map(value => new URL(value).pathname));
  expect(creditPaths.filter(pathname => !pathname.startsWith(prefix)), 'Credits downloads, artwork and Back must retain the Pages base').toEqual([]);
  // blob: URLs (the skin's Comfort/HD images, made in the page) are memory, not requests to the host.
  const appRequests = [...page.__requests, ...worklets].map(url => new URL(url)).filter(url => url.origin === hosting.origin && url.protocol !== 'blob:');
  expect(appRequests.some(url => url.pathname.endsWith('/engine.wasm'))).toBe(true);
  expect(appRequests.some(url => url.pathname.endsWith('/audio-worklet.js'))).toBe(true);
  expect(appRequests.some(url => url.pathname.endsWith('/catalog.json'))).toBe(true);
  expect(appRequests.some(url => /\/tracks\/.+\.mp3$/.test(url.pathname))).toBe(true);
  expect(appRequests.filter(url => !url.pathname.startsWith(prefix)).map(url => url.pathname), 'Every same-origin asset must remain within the configured Pages subpath').toEqual([]);
  expect(page.__badResponses).toEqual([]);
});

test('every bundled recording decodes to finite audible stereo with accurate catalog duration', async ({ page }) => {
  test.setTimeout(120000);
  const base = new URL('./', page.url()).pathname;
  const response = await page.request.get(assetUrl('catalog.json', base));
  expect(response.ok()).toBe(true);
  const catalog = await response.json();
  expect(catalog.tracks.length).toBeGreaterThanOrEqual(30);
  expect(new Set(catalog.tracks.map(track => track.id)).size).toBe(catalog.tracks.length);
  expect(new Set(catalog.tracks.map(track => track.url)).size).toBe(catalog.tracks.length);
  expect(new Set(catalog.tracks.map(track => track.genre)).size).toBeGreaterThanOrEqual(8);
  const origin = new URL(page.url()).origin;
  const recordings = catalog.tracks.map(track => ({ ...track, url: new URL(assetUrl(track.url, base), origin).href }));
  for (const recording of recordings) {
    const url = new URL(recording.url);
    expect(url.origin).toBe(origin);
    expect(url.pathname.startsWith(base)).toBe(true);
    expect(recording.bpm).toBeGreaterThan(40);
    expect(recording.bpm).toBeLessThan(240);
    expect(recording.duration).toBeGreaterThan(20);
  }
  await playBoth(page);
  await pauseBoth(page);
  const decoded = await page.evaluate(async tracks => {
    const context = window.bitCheer.audio.context;
    const result = [];
    // Decode sequentially so forty full PCM buffers are never retained together.
    for (const track of tracks) {
      const response = await fetch(track.url);
      if (!response.ok) throw new Error(`${track.id}: HTTP ${response.status}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      const signal = Array.from({ length: buffer.numberOfChannels }, (_, channel) => {
        const data = buffer.getChannelData(channel);
        let sum = 0, peak = 0, count = 0, finite = true;
        const quarters = Array.from({ length: 4 }, () => ({ sum: 0, count: 0 }));
        for (let i = 0; i < data.length; i += 64) {
          finite &&= Number.isFinite(data[i]);
          sum += data[i] ** 2; peak = Math.max(peak, Math.abs(data[i])); count++;
          const quarter = quarters[Math.min(3, Math.floor(i / data.length * 4))];
          quarter.sum += data[i] ** 2; quarter.count++;
        }
        return { finite, peak, rms: Math.sqrt(sum / count), quarters: quarters.map(quarter => Math.sqrt(quarter.sum / quarter.count)) };
      });
      result.push({ id: track.id, duration: buffer.duration, channels: buffer.numberOfChannels, signal });
    }
    return result;
  }, recordings);
  const problems = [];
  for (const [index, audio] of decoded.entries()) {
    const record = recordings[index];
    if (audio.channels !== 2) problems.push({ id: audio.id, issue: 'channel count', actual: audio.channels });
    if (Math.abs(audio.duration - record.duration) >= .3) problems.push({ id: audio.id, issue: 'manifest duration', actual: audio.duration, expected: record.duration });
    if (Math.abs(audio.duration - 128 * 60 / record.bpm) >= .3) problems.push({ id: audio.id, issue: '128-beat length', actual: audio.duration, expected: 128 * 60 / record.bpm });
    for (const [index, channel] of audio.signal.entries()) {
      if (!channel.finite || channel.rms <= .00001 || channel.peak <= .001) problems.push({ id: audio.id, issue: 'inaudible/nonfinite channel', channel: index, ...channel });
      if (channel.quarters.some(rms => rms <= .00001)) problems.push({ id: audio.id, issue: 'silent section', channel: index, quarters: channel.quarters });
    }
  }
  expect(problems, 'All recordings must have accurate duration and audible finite samples on both channels').toEqual([]);
  expect(page.__badResponses).toEqual([]);
});
