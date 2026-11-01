import { defineConfig, chromium } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// Use Playwright's matching install when available; a supplied/cached Chromium
// also makes this suite usable in development containers without a redownload.
function executablePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (existsSync(chromium.executablePath())) return undefined;
  const cache = path.join(homedir(), '.cache', 'ms-playwright');
  if (!existsSync(cache)) return undefined;
  return readdirSync(cache)
    .filter(name => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    .map(name => path.join(cache, name, 'chrome-linux64', 'chrome'))
    .find(file => existsSync(file));
}

// A headless browser's screen is 800 × 600 (Chromium) or 1366 × 768 (Firefox) unless set. Fullscreen (Focus
// session) shrinks the window to that screen while the page stays laid out at the viewport, and wheel input
// outside the window never reaches the page, so each browser's screen is made as large as the viewport.
const viewport = { width: 1440, height: 1100 };

export default defineConfig({
  testDir: './tests',
  testMatch: 'e2e.spec.js',
  fullyParallel: false,
  workers: 1,
  // In CI: no stray test.only, one retry (a test that passes on retry is reported as flaky).
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 35000,
  expect: { timeout: 8000 },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173',
    viewport,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // `npm run test:e2e` runs Chromium (as CI does) and `npm run test:e2e:firefox` Firefox.
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          executablePath: executablePath(),
          args: ['--autoplay-policy=no-user-gesture-required', `--window-size=${viewport.width},${viewport.height}`],
        },
      },
    },
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        launchOptions: {
          firefoxUserPrefs: {
            // Web Audio may start without a click, as with Chromium's autoplay flag.
            'media.autoplay.default': 0,
            'media.autoplay.blocking_policy': 0,
            // Near-silent output: the audio graph runs, but its stream is scaled to (almost) zero.
            'media.volume_scale': '0.0',
          },
          // Firefox's AudioContext only starts with a sound server, which a desktop has and a CI machine lacks.
          env: { ...process.env, MOZ_HEADLESS_WIDTH: `${viewport.width}`, MOZ_HEADLESS_HEIGHT: `${viewport.height}` },
        },
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --port 5173',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: true,
        timeout: 20000,
      },
});
