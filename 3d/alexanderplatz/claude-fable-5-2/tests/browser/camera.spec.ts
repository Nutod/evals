import { expect, test } from '@playwright/test';
import { camera, open, settle, viewCentre } from './helpers';

const angleDiff = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

test.describe('camera', () => {
  test('orbit: drag turns, right-drag pans, wheel zooms', async ({ page }) => {
    // labels are clickable, so keep them out from under the pointer
    await open(page, 'labels=0');
    const c = await viewCentre(page);
    const before = await settle(page);
    expect(before.mode).toBe('orbit');

    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 220, c.y + 30, { steps: 12 });
    await page.mouse.up();
    const turned = await settle(page);
    expect(angleDiff(turned.bearing, before.bearing)).toBeGreaterThan(15);
    expect(Math.abs(turned.distance - before.distance)).toBeLessThan(before.distance * 0.05);

    await page.mouse.move(c.x, c.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(c.x - 160, c.y + 90, { steps: 10 });
    await page.mouse.up({ button: 'right' });
    const panned = await settle(page);
    expect(Math.hypot(panned.target[0] - turned.target[0], panned.target[2] - turned.target[2])).toBeGreaterThan(30);
    expect(angleDiff(panned.bearing, turned.bearing)).toBeLessThan(2);

    await page.mouse.move(c.x, c.y);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -240);
    const zoomed = await settle(page);
    expect(zoomed.distance).toBeLessThan(panned.distance * 0.75);
    // never below ground or tilted past the horizon
    expect(zoomed.position[1]).toBeGreaterThan(1.9);
    expect(zoomed.tilt).toBeLessThanOrEqual(87.5);
  });

  test('landmark navigation flies to each landmark', async ({ page }) => {
    await open(page);
    const landmarks = await page.evaluate(() => window.__alex!.landmarks.map((l) => ({ id: l.id, name: l.name, target: l.orbit.target })));
    for (const lm of landmarks) {
      await page.locator(`#landmarks button[data-id="${lm.id}"]`).click();
      expect((await camera(page)).flying).toBe(true);
      const state = await settle(page);
      expect(Math.hypot(state.target[0] - lm.target[0], state.target[2] - lm.target[2])).toBeLessThan(1);
      await expect(page.locator('#card-name')).toHaveText(lm.name);
      await expect(page.locator(`#landmarks button[data-id="${lm.id}"]`)).toHaveAttribute('aria-current', 'true');
    }
    // number keys do the same
    await page.keyboard.press('1');
    const state = await settle(page);
    expect(Math.hypot(state.target[0] - landmarks[0].target[0], state.target[2] - landmarks[0].target[2])).toBeLessThan(1);
  });

  test('top-down: looks straight down with north up and only pans or zooms', async ({ page }) => {
    await open(page, 'labels=0');
    await page.getByRole('button', { name: 'Top-down' }).click();
    const top = await settle(page);
    expect(top.mode).toBe('top');
    expect(top.tilt).toBeLessThan(0.5);
    expect(angleDiff(top.bearing, 0)).toBeLessThan(0.5);
    await expect(page.getByRole('button', { name: 'Top-down' })).toHaveAttribute('aria-pressed', 'true');

    const c = await viewCentre(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 180, c.y + 120, { steps: 10 });
    await page.mouse.up();
    const panned = await settle(page);
    // dragging the map right/down moves the view west/north; the camera stays vertical
    expect(panned.target[0]).toBeLessThan(top.target[0] - 20);
    expect(panned.target[2]).toBeLessThan(top.target[2] - 20);
    expect(panned.tilt).toBeLessThan(0.5);
    expect(angleDiff(panned.bearing, 0)).toBeLessThan(0.5);

    await page.mouse.wheel(0, 600);
    const out = await settle(page);
    expect(out.distance).toBeGreaterThan(panned.distance * 1.1);
    expect(out.tilt).toBeLessThan(0.5);

    await page.getByRole('button', { name: 'Orbit' }).click();
    const orbit = await settle(page);
    expect(orbit.mode).toBe('orbit');
    expect(orbit.tilt).toBeGreaterThan(40);
  });

  test('street: camera stays at 1.7 m while looking and walking', async ({ page }) => {
    await open(page);
    await page.locator('#landmarks button[data-id="weltzeituhr"]').click();
    await settle(page);
    await page.getByRole('button', { name: 'Street' }).click();
    const start = await settle(page);
    expect(start.mode).toBe('street');
    expect(start.position[1]).toBeCloseTo(1.7, 5);
    const blocked = await page.evaluate(([x, z]) => window.__alex!.world.collision.blocked(x, z), [start.position[0], start.position[2]]);
    expect(blocked).toBe(false);

    const c = await viewCentre(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x - 200, c.y - 40, { steps: 10 });
    await page.mouse.up();
    const looked = await camera(page);
    expect(angleDiff(looked.bearing, start.bearing)).toBeGreaterThan(20);
    expect(looked.position[1]).toBeCloseTo(1.7, 5);
    expect(Math.hypot(looked.position[0] - start.position[0], looked.position[2] - start.position[2])).toBeLessThan(0.01);

    await page.locator('#scene').focus();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1200);
    await page.keyboard.up('KeyW');
    const walked = await camera(page);
    const moved = Math.hypot(walked.position[0] - looked.position[0], walked.position[2] - looked.position[2]);
    expect(moved).toBeGreaterThan(2);
    expect(moved).toBeLessThan(9);
    expect(walked.position[1]).toBeCloseTo(1.7, 5);

    // landmark navigation walks to a street viewpoint, still at eye height
    await page.locator('#landmarks button[data-id="station"]').click();
    const at = await settle(page);
    expect(at.mode).toBe('street');
    expect(at.position[1]).toBeCloseTo(1.7, 5);
    const spot = await page.evaluate(() => window.__alex!.landmarks.find((l) => l.id === 'station')!.street);
    expect(Math.hypot(at.position[0] - spot.x, at.position[2] - spot.z)).toBeLessThan(0.5);
  });

  test('compass and zoom buttons', async ({ page }) => {
    await open(page);
    const before = await settle(page);
    expect(angleDiff(before.bearing, 0)).toBeGreaterThan(10);
    await page.getByRole('button', { name: 'Face north' }).click();
    const north = await settle(page);
    expect(angleDiff(north.bearing, 0)).toBeLessThan(0.5);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    const closer = await settle(page);
    expect(closer.distance).toBeLessThan(north.distance * 0.8);
    await page.getByRole('button', { name: 'Zoom out' }).click();
    const back = await settle(page);
    expect(back.distance).toBeGreaterThan(closer.distance * 1.2);
  });
});
