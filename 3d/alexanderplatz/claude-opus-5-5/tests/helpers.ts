import { expect, type Page } from '@playwright/test';

export type CameraState = {
  mode: 'orbit' | 'top' | 'street';
  position: number[];
  direction: number[];
  target: number[];
  heading: number;
  zoom: number;
  distance: number | null;
  eyeHeight: number | null;
  flying: boolean;
  circling: boolean;
};

/** Loads the app, failing on any page error or console error. */
export async function openApp(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  // The app must not reach out to any external service at runtime.
  const external: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && !url.protocol.startsWith('data') && !url.protocol.startsWith('blob')) external.push(r.url());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__alex?.ready || window.__alex?.error, null, { timeout: 90_000 });
  const error = await page.evaluate(() => window.__alex?.error);
  expect(error, 'WebGL should be available').toBeUndefined();
  await expect(page.locator('#loader')).toHaveClass(/done/);
  await page.waitForFunction(() => window.__alex!.frames() > 5);
  return { errors, external };
}

export const state = (page: Page) => page.evaluate(() => window.__alex!.state() as CameraState);

export async function settle(page: Page) {
  await page.waitForFunction(() => !window.__alex!.state().flying, null, { timeout: 15_000 });
  // Let orbit damping come to rest.
  await page.waitForTimeout(600);
}

export const pixelStats = (page: Page) => page.evaluate(() => window.__alex!.pixelStats());

export const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
