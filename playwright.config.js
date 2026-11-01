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

// Headless Chromium's screen is its --window-size (800 × 600 unless set). Fullscreen (Focus session)
// shrinks the window to that screen while the page stays laid out at the viewport, and wheel input
// outside the window never reaches the page, so the screen must be as large as the viewport.
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
    launchOptions: {
      executablePath: executablePath(),
      args: ['--autoplay-policy=no-user-gesture-required', `--window-size=${viewport.width},${viewport.height}`],
    },
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --port 5173',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: true,
        timeout: 20000,
      },
});
