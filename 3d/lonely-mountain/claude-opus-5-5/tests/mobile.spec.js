import { expect, test } from '@playwright/test';
import { openApp, stats } from './helpers.js';

test('on a phone the valley renders and the slider works by touch', async ({ page }) => {
  const { errors } = await openApp(page);
  expect(await page.evaluate(() => window.__lm.app.quality)).toBe('low');
  const box = await page.locator('#track').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  await page.locator('#track').tap({ position: { x: box.width * 0.75, y: box.height - 10 } });
  await page.waitForFunction(() => Math.abs(window.__lm.hour() - 3) < 0.15);
  expect((await stats(page)).std).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});
