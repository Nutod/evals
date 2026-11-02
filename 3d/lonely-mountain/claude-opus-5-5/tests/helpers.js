import { expect } from '@playwright/test';

/** Loads the valley, failing on page errors, console errors or unexpected network use. */
export async function openApp(page, query = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  // Only the pinned three.js modules may come from outside; everything else is procedural.
  const external = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (['localhost', '127.0.0.1'].includes(url.hostname) || url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/three@0.180.0/')) return;
    external.push(r.url());
  });
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__lm?.ready || window.__lm?.error, null, { timeout: 90_000 });
  expect(await page.evaluate(() => window.__lm.error), 'WebGL should be available').toBeUndefined();
  await page.waitForFunction(() => window.__lm.frames() > 10);
  return { errors, external };
}

export const stats = (page) => page.evaluate(() => window.__lm.pixelStats());

/** Jumps the slider to an hour and waits for streamed content to settle. */
export async function atHour(page, t, wait = 1200) {
  await page.evaluate((t) => window.__lm.setHour(t), t);
  await page.waitForTimeout(wait);
}
