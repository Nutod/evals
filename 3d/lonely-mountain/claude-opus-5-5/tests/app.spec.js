import { expect, test } from '@playwright/test';
import { atHour, openApp, stats } from './helpers.js';

test.describe('first frame', () => {
  test('opens on a detailed noon valley with the slider ready, no errors, no stray requests', async ({ page }) => {
    const { errors, external } = await openApp(page);
    expect(await page.evaluate(() => window.__lm.hour())).toBe(0);
    await expect(page.getByRole('slider', { name: 'Hour of the day' })).toBeVisible();
    for (const label of ['Noon', 'Shadow', 'Circling', 'Fire', 'Night']) await expect(page.getByRole('button', { name: new RegExp(`Go to ${label}`) })).toBeVisible();
    const s = await stats(page);
    expect(s.std).toBeGreaterThan(18);
    expect(s.colors).toBeGreaterThan(200);
    await expect(page.locator('#notes')).toBeHidden();
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
});

test.describe('the approach slider', () => {
  test('every hour is a distinct, complete world', async ({ page }) => {
    const { errors } = await openApp(page);
    const shot = {};
    for (const [i, key] of ['noon', 'shadow', 'circling', 'fire', 'night'].entries()) {
      await atHour(page, i, 1800);
      shot[key] = await stats(page);
      expect(shot[key].std, key).toBeGreaterThan(8);
    }
    const warmth = (s) => s.mean[0] / Math.max(1, s.mean[2]);
    expect(warmth(shot.shadow)).toBeGreaterThan(warmth(shot.noon) * 1.15);
    expect(warmth(shot.fire)).toBeGreaterThan(warmth(shot.noon) * 1.6);
    expect(shot.night.luminance).toBeLessThan(shot.noon.luminance * 0.4);
    expect(errors).toEqual([]);
  });

  test('clicking an hour label travels there; dragging scrubs freely and snaps near labels', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: /Go to Fire/ }).click();
    await page.waitForFunction(() => Math.abs(window.__lm.hour() - 3) < 1e-3, null, { timeout: 15_000 });
    await expect(page.locator('#readout-hour')).toHaveText('Fire');

    const track = (await page.locator('#track').boundingBox());
    const y = track.y + track.height - 14;
    await page.mouse.move(track.x + track.width * 0.25, y);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width * 0.6, y, { steps: 6 });
    expect(await page.evaluate(() => window.__lm.hour())).toBeCloseTo(2.4, 1);
    await page.mouse.up();
    // Released between hours: stays there.
    expect(await page.evaluate(() => window.__lm.hour())).toBeCloseTo(2.4, 1);
    await expect(page.locator('#readout-hour')).toHaveText('Circling → Fire');

    await page.mouse.move(track.x + track.width * 0.51, y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(() => window.__lm.hour() === 2, null, { timeout: 5000 });
  });

  test('keyboard: arrows nudge, PageUp jumps to the next hour, number keys pick an hour', async ({ page }) => {
    await openApp(page);
    const handle = page.getByRole('slider', { name: 'Hour of the day' });
    await handle.focus();
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => window.__lm.hour())).toBeCloseTo(0.02, 3);
    await page.keyboard.press('PageUp');
    await page.waitForFunction(() => window.__lm.hour() === 1, null, { timeout: 8000 });
    await expect(handle).toHaveAttribute('aria-valuetext', /Shadow/);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('5');
    await page.waitForFunction(() => window.__lm.hour() === 4, null, { timeout: 15_000 });
  });

  test('scrubbing back un-burns Dale: returning to noon gives back the same noon', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.__lm.preset('market'));
    await atHour(page, 0, 1500);
    const before = await stats(page);
    await atHour(page, 3.1, 1500);
    const burning = await stats(page);
    await atHour(page, 0, 1500);
    const after = await stats(page);
    expect(Math.abs(burning.luminance - before.luminance) + Math.abs(burning.mean[2] - before.mean[2])).toBeGreaterThan(15);
    // People keep walking, so frames are not identical, but the world is back.
    expect(Math.abs(after.luminance - before.luminance)).toBeLessThan(6);
    expect(Math.abs(after.mean[0] / after.mean[2] - before.mean[0] / before.mean[2])).toBeLessThan(0.08);
  });

  test('hour content streams: the active hour and its neighbours are resident, distant hours are not', async ({ page }) => {
    await openApp(page);
    await atHour(page, 0, 800);
    let resident = await page.evaluate(() => window.__lm.resident());
    expect(resident).toContain('townsfolk');
    expect(resident).toContain('kitchen-smoke');
    expect(resident).not.toContain('lantern-line');
    expect(resident).not.toContain('dale-burning');
    await atHour(page, 4, 1500);
    resident = await page.evaluate(() => window.__lm.resident());
    expect(resident).toContain('lantern-line');
    expect(resident).toContain('night-ash');
    expect(resident).not.toContain('kitchen-smoke');
    expect(resident).not.toContain('anvil-sparks');
  });

  test('the dragon: a speck at the shadow hour, aloft as he circles, on the Gate at dusk, gone by night', async ({ page }) => {
    await openApp(page);
    const dragon = () => page.evaluate(() => {
      const d = window.__lm.app.dragon;
      return { visible: d.group.visible, head: d.head.position.toArray() };
    });
    await atHour(page, 0, 300);
    expect((await dragon()).visible).toBe(false);
    await atHour(page, 1, 300);
    const speck = await dragon();
    expect(speck.visible).toBe(true);
    expect(speck.head[2]).toBeLessThan(-9000);
    await atHour(page, 2, 300);
    const aloft = await dragon();
    expect(aloft.head[1]).toBeGreaterThan(200);
    expect(Math.abs(aloft.head[2])).toBeLessThan(3000);
    await atHour(page, 3, 300);
    const perched = await dragon();
    expect(Math.hypot(perched.head[0] - 14, perched.head[2] + 660)).toBeLessThan(60);
    await atHour(page, 4, 300);
    expect((await dragon()).visible).toBe(false);
  });

  test('the Gate: open at noon, closing as he circles, burst by dusk', async ({ page }) => {
    await openApp(page);
    const door = () => page.evaluate(() => window.__lm.app.gate.doors[1].pivot.rotation.y);
    await atHour(page, 0, 200);
    const open = await door();
    await atHour(page, 2, 200);
    const closing = await door();
    await atHour(page, 2.6, 200);
    const shut = await door();
    expect(Math.abs(open)).toBeGreaterThan(1.4);
    expect(Math.abs(closing)).toBeLessThan(Math.abs(open));
    expect(Math.abs(closing)).toBeGreaterThan(Math.abs(shut));
    expect(Math.abs(shut)).toBeLessThan(0.05);
  });
});

test.describe('exploration and controls', () => {
  test('viewpoint presets fly the camera; the orbit stays in its bubble', async ({ page }) => {
    await openApp(page);
    for (const name of ['market', 'falls', 'gate', 'aerial', 'vantage']) {
      await page.locator('#views').selectOption(name);
      await page.waitForFunction(() => !window.__lm.app.rig.flight, null, { timeout: 10_000 });
      const cam = await page.evaluate(() => window.__lm.camera());
      expect(cam.preset).toBe(name);
    }
    const canvas = page.locator('#viewport canvas');
    const box = await canvas.boundingBox();
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
      await page.mouse.wheel(0, 4000);
    }
    await page.waitForTimeout(600);
    const cam = await page.evaluate(() => window.__lm.camera());
    expect(Math.hypot(cam.pos[0], cam.pos[2])).toBeLessThan(17_000);
    await expect(page.locator('#views')).toHaveValue('free');
  });

  test('hour notes are off by default and show the hour with its vignettes', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#notes')).toBeHidden();
    await page.getByRole('button', { name: 'Notes' }).click();
    await expect(page.locator('#notes')).toBeVisible();
    await expect(page.locator('#notes-title')).toContainText('Noon');
    await expect(page.locator('#notes-places button').first()).toBeVisible();
    await page.getByRole('button', { name: /Go to Night/ }).click();
    await expect(page.locator('#notes-title')).toContainText('Night', { timeout: 15_000 });
    await expect(page.locator('#notes-places button', { hasText: 'king' })).toBeVisible();
  });

  test('photo mode hides the interface and saves a PNG', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Photo' }).click();
    await expect(page.locator('#timeline')).toHaveCSS('opacity', '0');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save PNG' }).click();
    expect((await download).suggestedFilename()).toMatch(/^dale-noon-\d{4}\.png$/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#timeline')).toHaveCSS('opacity', '1');
  });

  test('quality and density change the population without errors', async ({ page }) => {
    const { errors } = await openApp(page, '?quality=high');
    await page.evaluate(() => window.__lm.preset('market'));
    await page.waitForTimeout(500);
    const count = () => page.evaluate(() => {
      let n = 0;
      window.__lm.app.scene.traverse((o) => {
        if (o.isInstancedMesh && /^townsfolk-(near|far)$/.test(o.name)) n += o.count;
      });
      return n;
    });
    const full = await count();
    await page.locator('#density').fill('0.3');
    await page.waitForTimeout(400);
    expect(await count()).toBeLessThan(full * 0.6);
    await page.locator('#quality').selectOption('low');
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.__lm.app.quality)).toBe('low');
    expect((await stats(page)).std).toBeGreaterThan(8);
    expect(errors).toEqual([]);
  });
});
