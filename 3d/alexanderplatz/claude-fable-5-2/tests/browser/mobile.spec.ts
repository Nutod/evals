import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { camera, open, settle, viewCentre } from './helpers';

const angleDiff = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

type Point = { x: number; y: number };

/** Real multi-touch through the DevTools protocol, so the page sees genuine touch pointers. */
async function gesture(cdp: CDPSession, from: Point[], to: Point[], steps = 10): Promise<void> {
  const points = (t: number) => from.map((p, i) => ({ x: p.x + (to[i].x - p.x) * t, y: p.y + (to[i].y - p.y) * t, id: i }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(0) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(i / steps) });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const cdpFor = (page: Page): Promise<CDPSession> => page.context().newCDPSession(page);

test.describe('mobile', () => {
  test('lays out as a bottom sheet with no overflow and thumb-sized controls', async ({ page }) => {
    await open(page);
    const size = page.viewportSize()!;
    expect(size.width).toBeLessThan(760);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(size.width);

    const panel = page.locator('#panel');
    const closed = (await panel.boundingBox())!;
    expect(closed.y + closed.height).toBeCloseTo(size.height, 0);
    expect(closed.height).toBeLessThan(size.height * 0.25);
    await expect(page.locator('.panel-body')).toHaveCSS('max-height', '0px');

    await page.getByRole('tab', { name: 'Places' }).tap();
    await expect(panel).toHaveClass(/open/);
    await expect(page.locator('#landmarks')).toBeVisible();
    await expect(page.locator('#mode')).toBeHidden();
    // the sheet slides open
    await expect.poll(async () => (await panel.boundingBox())!.height).toBeGreaterThan(closed.height + 150);
    const opened = (await panel.boundingBox())!;
    // the map keeps more than half the screen
    expect(opened.y).toBeGreaterThan(size.height * 0.35);

    for (const target of await page.locator('#tabs button, #landmarks button, #hud button').all()) {
      const box = (await target.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
    // tapping the active tab folds the sheet away again
    await page.getByRole('tab', { name: 'Places' }).tap();
    await expect(panel).not.toHaveClass(/open/);
    await expect(page.locator('#attribution')).toBeVisible();
  });

  test('touch: one finger orbits, two fingers pinch-zoom', async ({ page }) => {
    await open(page, 'labels=0');
    const cdp = await cdpFor(page);
    const c = await viewCentre(page);
    const before = await settle(page);

    await gesture(cdp, [{ x: c.x - 60, y: c.y }], [{ x: c.x + 90, y: c.y + 10 }]);
    const turned = await settle(page);
    expect(angleDiff(turned.bearing, before.bearing)).toBeGreaterThan(10);

    // spread two fingers apart: zoom in
    await gesture(cdp, [{ x: c.x - 30, y: c.y }, { x: c.x + 30, y: c.y }], [{ x: c.x - 130, y: c.y }, { x: c.x + 130, y: c.y }]);
    const zoomed = await settle(page);
    expect(zoomed.distance).toBeLessThan(turned.distance * 0.7);
  });

  test('tabs drive camera, landmarks and layers by touch', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Places' }).tap();
    await page.locator('#landmarks button[data-id="rathaus"]').tap();
    const at = await settle(page);
    const target = await page.evaluate(() => window.__alex!.landmarks.find((l) => l.id === 'rathaus')!.orbit.target);
    expect(Math.hypot(at.target[0] - target[0], at.target[2] - target[2])).toBeLessThan(1);
    await expect(page.locator('#landmark-card')).toBeVisible();

    await page.getByRole('tab', { name: 'View' }).tap();
    await page.getByRole('button', { name: 'Top-down' }).tap();
    const top = await settle(page);
    expect(top.mode).toBe('top');
    expect(top.tilt).toBeLessThan(0.5);

    const cdp = await cdpFor(page);
    const c = await viewCentre(page);
    await gesture(cdp, [{ x: c.x, y: c.y }], [{ x: c.x + 80, y: c.y + 60 }]);
    const panned = await settle(page);
    expect(Math.hypot(panned.target[0] - top.target[0], panned.target[2] - top.target[2])).toBeGreaterThan(15);
    expect(panned.tilt).toBeLessThan(0.5);

    await page.getByRole('tab', { name: 'Layers' }).tap();
    await page.locator('#layers label', { hasText: 'Trams' }).tap();
    expect(await page.evaluate(() => window.__alex!.world.layers.trams.visible)).toBe(false);

    await page.getByRole('tab', { name: 'Motion' }).tap();
    await page.getByRole('button', { name: 'Pause' }).tap();
    expect(await page.evaluate(() => window.__alex!.playing)).toBe(false);
  });

  test('street mode: drag to look, stick to walk, eye height fixed', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Places' }).tap();
    await page.locator('#landmarks button[data-id="weltzeituhr"]').tap();
    await settle(page);
    await page.getByRole('tab', { name: 'View' }).tap();
    await expect(page.locator('#stick')).toBeHidden();
    await page.getByRole('button', { name: 'Street' }).tap();
    const start = await settle(page);
    expect(start.mode).toBe('street');
    expect(start.position[1]).toBeCloseTo(1.7, 5);
    await page.getByRole('tab', { name: 'View' }).tap();
    await expect(page.locator('#panel')).not.toHaveClass(/open/);

    const stick = page.locator('#stick');
    await expect(stick).toBeVisible();
    // the stick rides on top of the sheet; wait for the sheet to finish folding
    await page.waitForTimeout(450);
    const panel = (await page.locator('#panel').boundingBox())!;
    const box = (await stick.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(panel.y);

    const cdp = await cdpFor(page);
    const c = await viewCentre(page);
    await gesture(cdp, [{ x: c.x + 40, y: c.y - 80 }], [{ x: c.x - 80, y: c.y - 90 }]);
    const looked = await camera(page);
    expect(angleDiff(looked.bearing, start.bearing)).toBeGreaterThan(10);

    // hold the stick forward for a second
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...centre, id: 0 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: centre.x, y: centre.y - 44, id: 0 }] });
    await page.waitForTimeout(1100);
    expect(await page.evaluate(() => window.__alex!.rig.stick.y)).toBeGreaterThan(0.5);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const walked = await camera(page);
    expect(Math.hypot(walked.position[0] - looked.position[0], walked.position[2] - looked.position[2])).toBeGreaterThan(1.5);
    expect(walked.position[1]).toBeCloseTo(1.7, 5);
    expect(await page.evaluate(() => window.__alex!.rig.stick.length())).toBe(0);
  });
});
