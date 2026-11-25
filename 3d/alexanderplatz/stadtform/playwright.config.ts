import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4792',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: [
        '--enable-gpu',
        '--ignore-gpu-blocklist',
        ...(process.platform === 'darwin' ? ['--use-angle=metal'] : ['--enable-unsafe-swiftshader']),
      ],
    },
  },
  webServer: {
    command: 'npm run build && vite preview --host 127.0.0.1 --port 4792 --strictPort',
    url: 'http://127.0.0.1:4792',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: 'touch', use: { ...devices['Pixel 7'], deviceScaleFactor: 1.25 }, testMatch: /mobile/ },
  ],
});
