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
  await page.getByRole('button', { name: 'Add an element to both decks' }).click();
  await expect(page.getByRole('button', { name: 'Deck A Hi-hat', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.map(d => d.elements))).toEqual([3, 3]);
  await setRange(page, 'Crossfader', 1);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.gains[0].gain.value)).toBeLessThan(.002);
  await setRange(page, 'Master volume', .35);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.master.gain.value)).toBeCloseTo(.35, 2);
  await page.getByText('Show EQ', { exact: true }).click();
  await expect(page.getByLabel('Show EQ', { exact: true })).toBeChecked();
  await setRange(page, 'Deck A low EQ', -12);
  const seed = await page.evaluate(() => window.bitCheer.audio.state[0].seed);
  await page.getByRole('button', { name: /Randomize/ }).click();
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state[0].seed)).not.toBe(seed);
  await expect.poll(() => page.evaluate(() => window.bitCheer.audio.state.every(d => d.pitch === 0))).toBe(true);
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
  const manifest = 'version = 1\nname = "Pixel Harbor Test"\n[colors]\naccent = "#25c4ee"\n[assets]\npanel = "panel.png"\n';
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
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'custom');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--skin-panel'))).toBe(applied.panel);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#25c4ee');
  await page.getByRole('button', { name: 'Skin studio', exact: true }).click();
  await expect(page.locator('.active-skin')).toContainText('Pixel Harbor Test');
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
  await page.getByRole('button', { name: /Randomize/ }).click();
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
