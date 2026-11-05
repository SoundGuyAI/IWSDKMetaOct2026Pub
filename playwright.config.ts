import { defineConfig, devices } from '@playwright/test';

/**
 * Desktop E2E config for Wall Tones. See docs/WALL_TONES_DESKTOP_TEST_PLAN.md.
 *
 * The game runs its flat (non-XR) path in a plain desktop browser, driven
 * through the window.__wallTonesDebug bridge published by WallTonesSystem.
 * Tests are serial: gameplay timing and audio are global to a page.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 60_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: 'https://localhost:4173',
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        // Deterministic audio in headless: let Web Audio start without a
        // real gesture, and render WebGL through SwiftShader.
        '--autoplay-policy=no-user-gesture-required',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'https://localhost:4173',
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
