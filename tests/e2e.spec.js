import { test, expect } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const asset = name => path.join(root, 'public', name);

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
    name: deck.name, playing: deck.playing, solo: deck.solo,
    voices: deck.voices?.map(voice => ({ ...voice })),
  })));
}

async function seekPausedDeck(page, letter, fraction) {
  const waveform = page.locator(`#waveform-${letter.toLowerCase()}`);
  const box = await waveform.boundingBox();
  await waveform.click({ position: { x: box.width * fraction, y: box.height / 2 } });
  await expect.poll(() => page.evaluate(deck => window.bitCheer.audio.state[deck].position, letter === 'A' ? 0 : 1)).toBeGreaterThan(.5);
}

async function assertLcdSprites(page) {
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
  page.on('pageerror', error => page.__errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your rhythm.' })).toBeVisible();
  await expect(page.locator('.deck')).toHaveCount(2);
});

test.afterEach(async ({ page }) => {
  expect(page.__errors, 'The browser must not report uncaught JavaScript errors').toEqual([]);
});

test('desktop renders real waveform canvases and accessible two-deck controls', async ({ page }, testInfo) => {
  await expect(page.getByRole('slider', { name: 'Deck A pitch', exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Deck B pitch', exact: true })).toBeVisible();
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
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Back to the groove', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close help', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Back to the groove', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Keyboard shortcuts and help', exact: true })).toBeFocused();
});

test('browser modifier shortcuts do not start playback but plain A still plays deck A', async ({ page }) => {
  await page.getByRole('heading', { name: 'Find your rhythm.' }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Meta+a');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => window.bitCheer.audio.context)).toBeNull();
  await expect(page.getByRole('button', { name: 'Play deck A', exact: true })).toBeVisible();
  await page.keyboard.press('a');
  await expect.poll(() => page.evaluate(() => window.bitCheer.telemetry[0]?.playing)).toBe(true);
  expect(await page.evaluate(() => window.bitCheer.telemetry[1].playing)).toBe(false);
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
  await page.getByText('Show EQ', { exact: true }).click();
  await expect(page.getByLabel('Show EQ', { exact: true })).toBeChecked();
  await setRange(page, 'Deck A low EQ', -12);
});

test('jog bends temporarily, dragging seeks, and CUE returns to saved position paused', async ({ page }) => {
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

test('skin studio applies all five designs and imports persistent TOML and original WSZ', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  for (const [id, name] of [['classic', 'Classic 2.91'], ['classified3', 'Winamp 3 Classified'], ['classified5', 'Winamp 5 Classified'], ['bento', 'Bento Classified'], ['alien', 'Headspace · Alien Lime']]) {
    await page.locator('.skin-card').filter({ has: page.locator('.skin-card-copy strong', { hasText: name }) }).click();
    await expect(page.locator('html')).toHaveAttribute('data-skin', id);
  }
  await page.screenshot({ path: testInfo.outputPath('skin-studio.png'), fullPage: true });
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Headspace play/pause deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.telemetry[0]?.playing)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].position)).toBeGreaterThan(.1);
  await page.getByRole('button', { name: 'Stop to cue deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].playing)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].position)).toBeCloseTo(0, 3);
  await page.getByRole('button', { name: 'Headspace focus deck A', exact: true }).click();
  await expect(page.locator('.deck')).toHaveCount(1);
  await page.getByRole('button', { name: 'Headspace exit focus', exact: true }).click();
  await expect(page.locator('.deck')).toHaveCount(2);
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  await importFile(page, page.getByRole('button', { name: /Import a skin/ }), asset('skins/electric-blue.toml'));
  await expect(page.locator('.active-skin')).toContainText('Electric Blue 2001');
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'custom');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'custom');
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  await expect(page.locator('.active-skin')).toContainText('Electric Blue 2001');
  await importFile(page, page.getByRole('button', { name: /Import a skin/ }), asset('skins/classified3.wsz'));
  await expect(page.locator('.active-skin')).toContainText('classified3');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--skin-titlebar'))).toContain('data:image/png');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download template/ }).click();
  expect((await download).suggestedFilename()).toBe('bit-cheer-skin-template.zip');
});

test('invalid skins report an error and preserve the current design', async ({ page }) => {
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  await importFile(page, page.getByRole('button', { name: /Import a skin/ }), { name: 'bad.toml', mimeType: 'text/plain', buffer: Buffer.from('version = 1\nname = "Bad"\n[colors]\naccent = "url(https://example.com/x)"') });
  await expect(page.getByText(/Color accent must be a six-digit hex color/)).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'classic');
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
  await expect(page.locator('.active-skin')).toContainText('Pixel Harbor Test');
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
  await expect(page.locator('.active-skin')).toContainText('Pixel Harbor Test');

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

test('Pro mode loads real audio, filters original catalog genres, and imports local tracks', async ({ page }) => {
  await page.getByRole('button', { name: /Pro decks/ }).click();
  await expect(page.getByRole('heading', { name: 'Make the mix yours.' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(d => d.source === 'pcm'))).toBe(true);
  await page.getByLabel('Track genre', { exact: true }).selectOption('House');
  await expect(page.locator('.track-row')).toHaveCount(2);
  await expect(page.locator('.reference-track')).toHaveCount(8);
  expect(await page.locator('.reference-track').first().getAttribute('href')).toContain('bandcamp.com/track/');
  await page.getByLabel('Track genre', { exact: true }).selectOption('Techno');
  await expect(page.locator('.track-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Load Robowalk into deck B', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[1].name)).toContain('Robowalk');
  await importFile(page, page.getByRole('button', { name: /Load a track into A/ }), asset('tracks/selection.mp3'));
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].name)).toBe('selection.mp3');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].duration)).toBeGreaterThan(20);
  await playBoth(page);
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
  await expect(page.locator('.track-row')).toHaveCount(4);
  // Also covers a fast click before the public catalog finished loading.
  if (!requested) await page.getByRole('button', { name: 'Load Selection into deck A', exact: true }).click();
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

test('tap tempo measures human tapping and mobile layout remains usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('slider', { name: 'Deck A pitch', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-390.png'), fullPage: true });
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
    const { buildHardwareGraph, validateRouting } = await import('/__bitcheer_test__/output-routing.js');
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
  await page.getByRole('button', { name: 'Audio outputs', exact: true }).click();
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
  await page.getByRole('button', { name: 'Audio outputs', exact: true }).click();
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
  await expect(page.locator('.foundation-deck-note')).toHaveCount(2);
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
    const afterTrack = await deckSnapshots(page);
    expect(afterTrack[1 - index]).toEqual(beforeTrack[1 - index]);
    expect(afterTrack[index].effectiveBpm).toBeCloseTo(beforeTrack[index].effectiveBpm, 3);
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
    const afterTrack = await deckSnapshots(page);
    expect(afterTrack[1 - index]).toEqual(beforeTrack[1 - index]);
    expect(afterTrack[index].effectiveBpm).toBeCloseTo(beforeTrack[index].effectiveBpm, 3);
    expect(afterTrack[index].elements).not.toBe(beforeTrack[index].elements);
    expect(afterTrack[index].elements & 1).toBe(1);
    expect(afterTrack[index].elements).toBeGreaterThan(1);
    expect(afterTrack[index].source).toBe('generated');
  }

  await page.getByRole('button', { name: /01 Foundation/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.map(deck => deck.elements))).toEqual([1, 1]);
  await expect(page.locator('button.element')).toHaveCount(0);
});

test('Pro tempo preserves PCM and independent genre track changes preserve effective tempo', async ({ page }) => {
  await page.getByRole('button', { name: /Pro decks/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(deck => deck.source === 'pcm'))).toBe(true);
  // Techno has a different pair from the initial House recordings, proving the
  // current genre drives Change track instead of falling back to a global pool.
  await page.getByLabel('Track genre', { exact: true }).selectOption('Techno');
  await page.getByRole('button', { name: 'Load 21seiki Techno Shonen into deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].name)).toContain('21seiki Techno Shonen');
  await page.getByRole('button', { name: 'Load Robowalk into deck B', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[1].name)).toContain('Robowalk');
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
    const expectedTitle = beforeTrack[index].name.includes('Robowalk') ? '21seiki Techno Shonen' : 'Robowalk';
    await page.getByRole('button', { name: `Change track deck ${letter}`, exact: true }).click();
    await expect.poll(async () => (await deckSnapshots(page))[index].name).toContain(expectedTitle);
    const afterTrack = await deckSnapshots(page);
    expect(afterTrack[1 - index]).toEqual(beforeTrack[1 - index]);
    expect(afterTrack[index].effectiveBpm).toBeCloseTo(beforeTrack[index].effectiveBpm, 3);
    expect(afterTrack[index].source).toBe('pcm');
    expect(afterTrack[index].playing).toBe(false);
    expect(await page.evaluate(deck => Array.from(window.bitCheer.audio.waveforms[deck]), index)).not.toEqual(oldWaveform);
    expect(Number(await page.getByRole('slider', { name: `Deck ${letter} pitch`, exact: true }).inputValue())).toBeCloseTo(afterTrack[index].pitch, 2);
  }
  // A new recording can require a wider fader range to retain the old audible
  // tempo. The confirmed UI must not silently clamp the engine's correct rate.
  await page.getByRole('button', { name: 'Load 21seiki Techno Shonen into deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].name)).toContain('21seiki Techno Shonen');
  await setRange(page, 'Deck A pitch', 8);
  const beforeWideChange = await deckSnapshots(page);
  await page.getByRole('button', { name: 'Change track deck A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].name)).toContain('Robowalk');
  const afterWideChange = await deckSnapshots(page);
  expect(afterWideChange[0].effectiveBpm).toBeCloseTo(beforeWideChange[0].effectiveBpm, 3);
  expect(afterWideChange[0].pitch).toBeGreaterThan(16);
  await expect(page.getByLabel('Deck A pitch range', { exact: true })).toHaveValue('32');
  expect(Number(await page.getByRole('slider', { name: 'Deck A pitch', exact: true }).inputValue())).toBeCloseTo(afterWideChange[0].pitch, 2);
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

test('deck focus hides the app and enlarges usable controls while wheel pitch stays independent', async ({ page }, testInfo) => {
  await playBoth(page);
  await pauseBoth(page);
  const normalWheel = await page.getByRole('slider', { name: 'Deck A jog wheel', exact: true }).boundingBox();
  const normalPitch = await page.getByRole('slider', { name: 'Deck A pitch', exact: true }).boundingBox();
  for (const [index, letter] of ['A', 'B'].entries()) {
    const before = await deckSnapshots(page);
    await page.getByRole('button', { name: `Focus deck ${letter}`, exact: true }).click();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-focused', String(index));
    await expect(page.locator('.deck')).toHaveCount(1);
    await expect(page.getByRole('region', { name: `Deck ${letter}`, exact: true })).toBeVisible();
    await expect(page.locator('.topbar, .sidebar, .coach-panel, .tap-panel')).toHaveCount(0);
    const wheel = await page.getByRole('slider', { name: `Deck ${letter} jog wheel`, exact: true }).boundingBox();
    const pitch = page.getByRole('slider', { name: `Deck ${letter} pitch`, exact: true });
    const pitchBox = await pitch.boundingBox();
    expect(wheel.width).toBeGreaterThan(normalWheel.width * 1.5);
    expect(pitchBox.height).toBeGreaterThan(normalPitch.height * 1.5);
    await pitch.hover();
    await pitch.focus();
    await page.mouse.wheel(0, -120);
    await expect.poll(async () => (await deckSnapshots(page))[index].pitch).not.toBe(before[index].pitch);
    const after = await deckSnapshots(page);
    expect(after[1 - index]).toEqual(before[1 - index]);
    expect(after[index].source).toBe(before[index].source);
    expect(after[index].seed).toBe(before[index].seed);
    expect(Number(await pitch.inputValue())).toBeCloseTo(after[index].pitch, 2);
    await page.screenshot({ path: testInfo.outputPath(`focus-${letter.toLowerCase()}-desktop.png`), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(page.locator('.deck')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Skin studio', exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Focus deck B', exact: true }).click();
  await expect(page.locator('.deck')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('focus-b-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Exit deck focus', exact: true }).click();
  await expect(page.locator('.deck')).toHaveCount(2);
});

test('the expert lesson requires a timed handover before a matched real-track mix completes', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('bit-cheer-progress', JSON.stringify({ progress: [1, 2, 3, 4, 5, 6, 7], history: [] })));
  await page.reload();
  await page.getByRole('button', { name: 'Learning path', exact: true }).click();
  await page.locator('.lesson-card').last().getByRole('button', { name: /Start lesson/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(deck => deck.source === 'pcm'))).toBe(true);
  await page.getByRole('button', { name: 'Load Selection into deck B', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[1].name)).toContain('Selection');
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
