import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { dist, openApp, pixelStats, settle, state } from './helpers';

test.describe('rendering', () => {
  test('draws a detailed city without errors or network calls', async ({ page }) => {
    const { errors, external } = await openApp(page);
    const stats = await pixelStats(page);
    expect(stats.width).toBeGreaterThan(1000);
    // A blank or single-colour canvas would have near-zero variance and few colours.
    expect(stats.std).toBeGreaterThan(20);
    expect(stats.colors).toBeGreaterThan(150);
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });

  test('every landmark is modelled and reachable', async ({ page }) => {
    await openApp(page);
    const landmarks = await page.evaluate(() => window.__alex!.landmarks());
    expect(landmarks.map((l) => l.key).sort()).toEqual(['fernsehturm', 'marienkirche', 'parkinn', 'rathaus', 'station', 'weltzeituhr']);
    for (const name of ['Fernsehturm', 'Park Inn', 'Weltzeituhr', 'Bahnhof Alexanderplatz', 'Rotes Rathaus', 'Marienkirche']) {
      await expect(page.locator('#landmarks button', { hasText: name })).toBeVisible();
    }
  });

  test('lighting presets produce visibly different images', async ({ page }) => {
    await openApp(page);
    const shots: Record<string, Awaited<ReturnType<typeof pixelStats>>> = {};
    for (const [label, key] of [['Daylight', 'day'], ['Golden hour', 'golden'], ['Blue hour', 'blue']] as const) {
      await page.getByRole('radio', { name: label }).click();
      await page.waitForTimeout(2200); // preset transition is 1.6 s
      expect(await page.evaluate(() => window.__alex!.lighting())).toBe(key);
      shots[key] = await pixelStats(page);
    }
    const warmth = (s: (typeof shots)['day']) => s.mean[0] / s.mean[2];
    expect(warmth(shots.golden)).toBeGreaterThan(warmth(shots.day) * 1.1);
    expect(shots.blue.luminance).toBeLessThan(shots.day.luminance * 0.75);
    expect(warmth(shots.blue)).toBeLessThan(warmth(shots.day));
  });

  test('layer toggles hide and restore scene content', async ({ page }) => {
    await openApp(page);
    const before = await pixelStats(page);
    const toggle = page.locator('label.toggle', { hasText: 'Buildings' });
    await toggle.click();
    expect(await page.evaluate(() => window.__alex!.layerVisible('buildings'))).toBe(false);
    const hidden = await pixelStats(page);
    expect(Math.abs(hidden.luminance - before.luminance) + Math.abs(hidden.colors - before.colors) / 10).toBeGreaterThan(2);
    await toggle.click();
    expect(await page.evaluate(() => window.__alex!.layerVisible('buildings'))).toBe(true);

    await page.locator('label.toggle', { hasText: 'Labels' }).click();
    await expect(page.locator('.map-label').first()).toBeHidden();
  });
});

test.describe('cameras', () => {
  test('landmark navigation flies to each landmark', async ({ page }) => {
    await openApp(page);
    const landmarks = await page.evaluate(() => window.__alex!.landmarks());
    for (const [name, key] of [['Rotes Rathaus', 'rathaus'], ['Weltzeituhr', 'weltzeituhr'], ['Park Inn', 'parkinn']] as const) {
      await page.locator('#landmarks button', { hasText: name }).click();
      await settle(page);
      const s = await state(page);
      const l = landmarks.find((x) => x.key === key)!;
      expect(dist(s.target, [l.focus[0], 0, l.focus[2]])).toBeLessThan(l.focus[1] + 2);
      expect(Math.abs(s.distance! - l.distance) / l.distance).toBeLessThan(0.15);
      await expect(page.locator(`#landmarks button[data-landmark="${key}"]`)).toHaveAttribute('aria-current', 'true');
    }
  });

  test('orbit: drag rotates, right-drag pans, wheel zooms', async ({ page }) => {
    await openApp(page);
    await settle(page);
    const canvas = page.locator('#viewport canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width * 0.6, cy = box.y + box.height * 0.5;

    const s0 = await state(page);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 220, cy, { steps: 12 });
    await page.mouse.up();
    await settle(page);
    const s1 = await state(page);
    expect(Math.abs(s1.heading - s0.heading)).toBeGreaterThan(15);

    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -600);
    await settle(page);
    const s2 = await state(page);
    expect(s2.distance!).toBeLessThan(s1.distance! * 0.9);

    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(cx - 200, cy + 80, { steps: 10 });
    await page.mouse.up({ button: 'right' });
    await settle(page);
    const s3 = await state(page);
    expect(dist(s3.target, s2.target)).toBeGreaterThan(5);
  });

  test('orbit pivots around what is under the screen centre, even after panning', async ({ page }) => {
    await openApp(page);
    await settle(page);
    const box = (await page.locator('#viewport canvas').boundingBox())!;
    const cx = box.x + box.width * 0.6, cy = box.y + box.height * 0.5;
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(cx - 200, cy + 150, { steps: 10 });
    await page.mouse.up({ button: 'right' });
    await settle(page);
    const before = await state(page);

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 250, cy, { steps: 12 });
    await page.mouse.up();
    await settle(page);
    const after = await state(page);
    // The pivot dropped from mid-air onto the city surface, and the camera circled it at a constant range.
    expect(after.target[1]).toBeLessThan(before.target[1] - 50);
    expect(after.target[1]).toBeLessThan(130);
    expect(Math.abs(after.heading - before.heading)).toBeGreaterThan(20);
    const range = (s: typeof after) => dist(s.position, s.target);
    const pivotAt = after.target;
    expect(Math.abs(range(after) - dist(before.position, pivotAt)) / range(after)).toBeLessThan(0.05);
  });

  test('circle mode orbits around the view like a fly-around and stops on drag', async ({ page }) => {
    await openApp(page);
    await settle(page);
    const circle = page.getByRole('button', { name: 'Circle' });
    await circle.click();
    await expect(circle).toHaveAttribute('aria-pressed', 'true');
    const s0 = await state(page);
    await page.waitForTimeout(2000);
    const s1 = await state(page);
    expect(s1.circling).toBe(true);
    expect(Math.abs(s1.heading - s0.heading)).toBeGreaterThan(5);
    expect(dist(s1.target, s0.target)).toBeLessThan(0.5);
    expect(Math.abs(s1.distance! - s0.distance!)).toBeLessThan(s0.distance! * 0.01);

    // Choosing a landmark keeps circling around the new view.
    await page.locator('#landmarks button', { hasText: 'Rotes Rathaus' }).click();
    await settle(page);
    const s2 = await state(page);
    await page.waitForTimeout(1500);
    expect(Math.abs((await state(page)).heading - s2.heading)).toBeGreaterThan(3);

    // Any drag stops it, as in Google Earth.
    const box = (await page.locator('#viewport canvas').boundingBox())!;
    await page.mouse.move(box.x + 900, box.y + 450);
    await page.mouse.down();
    await page.mouse.move(box.x + 940, box.y + 450, { steps: 4 });
    await page.mouse.up();
    await expect(circle).toHaveAttribute('aria-pressed', 'false');
    await settle(page);
    const s3 = await state(page);
    await page.waitForTimeout(1000);
    // Circling turns ~7°/s; only the drag's damping glide may remain.
    expect(Math.abs((await state(page)).heading - s3.heading)).toBeLessThan(2);

    // From another camera mode it switches back to orbit.
    await page.getByRole('radio', { name: 'Top-down' }).click();
    await circle.click();
    expect((await state(page)).mode).toBe('orbit');
    await expect(page.getByRole('radio', { name: 'Orbit' })).toHaveAttribute('aria-checked', 'true');
  });

  test('top-down: looks straight down with north up, drag pans', async ({ page }) => {
    await openApp(page);
    await page.getByRole('radio', { name: 'Top-down' }).click();
    await page.waitForTimeout(300);
    const s0 = await state(page);
    expect(s0.mode).toBe('top');
    expect(s0.direction[1]).toBeLessThan(-0.999);
    expect(s0.heading).toBe(0);

    const box = (await page.locator('#viewport canvas').boundingBox())!;
    await page.mouse.move(box.x + 900, box.y + 450);
    await page.mouse.down();
    await page.mouse.move(box.x + 700, box.y + 300, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const s1 = await state(page);
    // Dragging the map up-left moves the view centre down-right (south-east).
    expect(s1.target[0]).toBeGreaterThan(s0.target[0] + 5);
    expect(s1.target[2]).toBeGreaterThan(s0.target[2] + 5);
    expect(s1.direction[1]).toBeLessThan(-0.999);

    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(400);
    expect((await state(page)).zoom).toBeGreaterThan(s1.zoom);
  });

  test('street: fixed eye height, keyboard walking and drag-to-look', async ({ page }) => {
    await openApp(page);
    await page.getByRole('radio', { name: 'Street' }).click();
    await page.waitForTimeout(300);
    const s0 = await state(page);
    expect(s0.mode).toBe('street');
    expect(s0.position[1]).toBeCloseTo(1.7, 5);

    await page.locator('#viewport canvas').click({ position: { x: 900, y: 450 } });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1000);
    await page.keyboard.up('KeyW');
    const s1 = await state(page);
    expect(dist(s1.position, s0.position)).toBeGreaterThan(2);
    expect(s1.position[1]).toBeCloseTo(1.7, 5);

    await page.mouse.move(900, 450);
    await page.mouse.down();
    await page.mouse.move(700, 450, { steps: 8 });
    await page.mouse.up();
    const s2 = await state(page);
    expect(Math.abs(s2.heading - s1.heading)).toBeGreaterThan(5);

    // Landmark buttons move the street camera to a viewpoint, still at eye height.
    await page.locator('#landmarks button', { hasText: 'Rotes Rathaus' }).click();
    await settle(page);
    const s3 = await state(page);
    expect(s3.position[1]).toBeCloseTo(1.7, 5);
    expect(dist(s3.position, s2.position)).toBeGreaterThan(20);
  });
});

test.describe('controls', () => {
  test('animation can be paused, resumed and sped up', async ({ page }) => {
    await openApp(page);
    const sim = () => page.evaluate(() => window.__alex!.simTime());
    const t0 = await sim();
    await page.waitForTimeout(800);
    expect(await sim()).toBeGreaterThan(t0 + 0.3);

    await page.getByRole('button', { name: 'Pause' }).click();
    const p0 = await sim();
    await page.waitForTimeout(800);
    expect(await sim()).toBe(p0);

    await page.getByRole('button', { name: 'Play' }).click();
    await page.getByRole('radio', { name: '4×' }).click();
    const f0 = await sim();
    await page.waitForTimeout(1000);
    expect((await sim()) - f0).toBeGreaterThan(2.5);
  });

  test('exports the current view as a PNG with attribution', async ({ page }) => {
    await openApp(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save view as PNG' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^alexanderplatz-day-.*\.png$/);
    const bytes = await readFile((await download.path())!);
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    expect(width).toBeGreaterThan(1000);
    expect(height).toBeGreaterThan(600);
    expect(bytes.length).toBeGreaterThan(100_000);
  });

  test('attribution and approximation disclosure are always available', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('.attribution')).toContainText('OpenStreetMap contributors');
    await expect(page.locator('.attribution')).toContainText('approximate');
    await page.getByRole('button', { name: 'About this model' }).click();
    const dialog = page.getByRole('dialog', { name: 'About this model' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Open Database License');
    await expect(dialog).toContainText('simplified or invented');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });
});
