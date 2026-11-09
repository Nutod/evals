import { defineConfig, devices } from '@playwright/test';

const PORT = 4317;
// headless Chromium renders WebGL on the GPU where there is one and falls back to SwiftShader in CI
const gpu = ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=default'];

/** Browser tests always run against the production build served by `vite preview`. */
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', launchOptions: { args: gpu } },
  webServer: {
    command: 'npm run build && npm run preview',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile|rendering/ },
  ],
});
