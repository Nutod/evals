import { test as base, expect, type Page } from '@playwright/test';
import type { Atlas } from '../src/atlas';

declare global {
  interface Window {
    atlas: Atlas;
  }
}
export const test = base.extend<{ district: Page }>({
  district: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.protocol.startsWith('http') && url.origin !== 'http://127.0.0.1:4792') {
        errors.push('External request ' + url.origin);
        return route.abort();
      }
      return route.continue();
    });
    await page.goto('/?inspect');
    await page.waitForFunction(() => window.atlas?.frames > 3);
    await use(page);
    expect(errors).toEqual([]);
  },
});
export const state = (page: Page) => page.evaluate(() => window.atlas.rig.getState());
export async function settled(page: Page) {
  await page.waitForFunction(() => !window.atlas.rig.flying);
  return state(page);
}
export const pixels = (page: Page) =>
  page.evaluate(async () => {
    const image = await createImageBitmap(await window.atlas.exportPng());
    const c = document.createElement('canvas');
    c.width = 180;
    c.height = 125;
    const g = c.getContext('2d')!;
    g.drawImage(image, 0, 0, c.width, c.height);
    image.close();
    const rgba = g.getImageData(0, 0, c.width, c.height).data;
    const colours = new Set<number>();
    let sum = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      colours.add((rgba[i] >> 4) * 256 + (rgba[i + 1] >> 4) * 16 + (rgba[i + 2] >> 4));
      sum += (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
    }
    return { colours: colours.size, mean: sum / (c.width * c.height) };
  });
