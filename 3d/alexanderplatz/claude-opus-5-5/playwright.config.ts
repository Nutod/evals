import { defineConfig, devices } from '@playwright/test';

// WebGL in headless Chromium: use the GPU where available, fall back to SwiftShader on CI.
const launchOptions = { args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=default', '--enable-unsafe-swiftshader'] };

export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    launchOptions,
  },
  // Tests run against the production bundle, so the build itself is exercised.
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
});
