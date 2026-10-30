import { expect, test, type Page } from '@playwright/test';
import { dist, openApp, pixelStats, settle, state } from './helpers';

/** Real touch drag through the Chrome DevTools protocol (Playwright only offers taps). */
async function touchDrag(page: Page, from: [number, number], to: [number, number], holdMs = 0) {
  const cdp = await page.context().newCDPSession(page);
  const point = ([x, y]: [number, number]) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from) });
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const p: [number, number] = [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(p) });
  }
  if (holdMs) await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('mobile layout renders the map with a collapsible bottom sheet', async ({ page }) => {
  const { errors } = await openApp(page);
  const stats = await pixelStats(page);
  expect(stats.std).toBeGreaterThan(20);

  const panel = page.locator('#panel');
  const box = (await panel.boundingBox())!;
  const viewport = page.viewportSize()!;
  // Docked to the bottom edge, full width, and compact while collapsed.
  expect(Math.round(box.y + box.height)).toBe(viewport.height);
  expect(box.width).toBe(viewport.width);
  expect(box.height).toBeLessThan(viewport.height * 0.3);
  await expect(page.locator('#landmarks')).toBeHidden();

  await page.getByRole('button', { name: 'Show controls' }).tap();
  await expect(page.locator('#landmarks')).toBeVisible();
  await page.locator('#landmarks button', { hasText: 'Weltzeituhr' }).tap();
  // Choosing a landmark collapses the sheet so the map is visible again.
  await expect(page.locator('#landmarks')).toBeHidden();
  await settle(page);
  const landmarks = await page.evaluate(() => window.__alex!.landmarks());
  const clock = landmarks.find((l) => l.key === 'weltzeituhr')!;
  expect(dist((await state(page)).target, clock.focus)).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('touch drag orbits the camera', async ({ page }) => {
  await openApp(page);
  await settle(page);
  const s0 = await state(page);
  await touchDrag(page, [120, 300], [320, 300]);
  await settle(page);
  const s1 = await state(page);
  expect(Math.abs(s1.heading - s0.heading)).toBeGreaterThan(10);
});

test('street mode shows a joystick that walks the camera at eye height', async ({ page }) => {
  await openApp(page);
  await page.getByRole('radio', { name: 'Street' }).tap();
  const joystick = page.locator('#joystick');
  await expect(joystick).toBeVisible();
  const s0 = await state(page);
  expect(s0.position[1]).toBeCloseTo(1.7, 5);

  const box = (await joystick.boundingBox())!;
  const c: [number, number] = [box.x + box.width / 2, box.y + box.height / 2];
  await touchDrag(page, c, [c[0], c[1] - 50], 1200);
  const s1 = await state(page);
  expect(dist(s1.position, s0.position)).toBeGreaterThan(3);
  expect(s1.position[1]).toBeCloseTo(1.7, 5);
  // Pushing the stick forward walks the way the camera faces.
  const moved = [s1.position[0] - s0.position[0], s1.position[2] - s0.position[2]];
  expect(moved[0] * s0.direction[0] + moved[1] * s0.direction[2]).toBeGreaterThan(0);

  // Dragging elsewhere on the map looks around.
  await touchDrag(page, [250, 300], [100, 300]);
  const s2 = await state(page);
  expect(Math.abs(s2.heading - s1.heading)).toBeGreaterThan(5);
});
