import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Mesh } from 'three';
import { test, settled, state, pixels } from './browser';

test('production draws detailed metre-scale landmarks, distinct lighting and a downloadable PNG', async ({
  district: page,
}, info) => {
  const day = await pixels(page);
  expect(day.colours).toBeGreaterThan(75);
  const heights = await page.evaluate(() =>
    window.atlas.landmarks.map((place) => {
      const group = window.atlas.scene.getObjectByName(place.id)!;
      let top = 0;
      group.traverse((node) => {
        const mesh = node as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
        top = Math.max(top, box.max.y);
      });
      return Math.round(top);
    }),
  );
  expect(heights.length).toBe(6);
  // Roof and antenna count separately at Park Inn. The Rathaus flagpole rises 13 m above its 74 m tower.
  for (const [i, [min, max]] of [
    [367, 370],
    [148, 152],
    [9, 12],
    [20, 27],
    [86, 88],
    [87, 92],
  ].entries()) {
    expect(heights[i], JSON.stringify(heights)).toBeGreaterThanOrEqual(min);
    expect(heights[i]).toBeLessThanOrEqual(max);
  }
  await page.screenshot({ path: info.outputPath('overview.png') });
  for (const id of ['golden', 'blue']) {
    await page.locator('button[data-light="' + id + '"]').click();
    const sample = await pixels(page);
    expect(sample.colours).toBeGreaterThan(55);
    expect(Math.abs(day.mean - sample.mean)).toBeGreaterThan(2);
    if (id === 'blue') expect(sample.mean).toBeLessThan(day.mean - 30);
  }
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export PNG' }).click(),
  ]);
  const png = await readFile((await download.path())!);
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.readUInt32BE(16)).toBe(
    await page.locator('#scene').evaluate((c) => (c as HTMLCanvasElement).width),
  );
  expect(png.length).toBeGreaterThan(60000);
  await page.getByRole('button', { name: 'Model info' }).click();
  await expect(page.getByRole('dialog')).toContainText('approximate');
  await expect(page.getByRole('dialog').getByText('Open Database License 1.0')).toBeVisible();
});

test('drag, pan, wheel, north-up plan and fixed-height walking change the camera', async ({
  district: page,
}) => {
  await page.getByRole('button', { name: 'Visit Fernsehturm' }).click();
  await expect(page.locator('#focus-title')).toHaveText('Fernsehturm');
  await page.getByRole('button', { name: 'Return to district overview' }).click();
  const before = await settled(page);
  await page.mouse.move(650, 180);
  await page.mouse.down();
  await page.mouse.move(805, 205, { steps: 9 });
  await page.mouse.up();
  expect(Math.abs((await state(page)).bearing - before.bearing)).toBeGreaterThan(5);
  const target = (await state(page)).target;
  await page.mouse.move(700, 190);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(800, 220, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  expect((await state(page)).target).not.toEqual(target);
  const radius = (await state(page)).distance;
  await page.mouse.wheel(0, -430);
  await expect.poll(async () => (await state(page)).distance).toBeLessThan(radius * 0.94);
  await page.getByRole('button', { name: 'Top-down', exact: true }).click();
  const north = await settled(page);
  expect(north.tilt).toBeLessThan(0.1);
  await page.mouse.move(660, 250);
  await page.mouse.down();
  await page.mouse.move(760, 300, { steps: 6 });
  await page.mouse.up();
  const plan = await state(page);
  expect(plan.target).not.toEqual(north.target);
  expect(plan.tilt).toBeLessThan(0.1);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  expect((await settled(page)).distance).toBeLessThan(north.distance * 0.85);
  const list = page.getByRole('navigation', { name: 'Landmarks' }).getByRole('button');
  for (let i = 0; i < 6; i++) {
    await list.nth(i).click();
    const pose = await settled(page);
    const expected = await page.evaluate(() => window.atlas.selected!.orbit.target);
    expect(Math.hypot(pose.target[0] - expected[0], pose.target[2] - expected[2])).toBeLessThan(0.1);
    expect(pose.tilt).toBeLessThan(0.1);
  }
  await page.locator('.place[data-id=weltzeituhr]').click();
  await page.getByRole('button', { name: 'Street', exact: true }).click();
  const street = await settled(page);
  expect(street.position[1]).toBeCloseTo(1.7);
  await page.locator('#scene').focus();
  await page.keyboard.down('w');
  await page.waitForTimeout(750);
  await page.keyboard.up('w');
  const walked = await state(page);
  expect(walked.position[1]).toBeCloseTo(1.7);
  expect(
    Math.hypot(walked.position[0] - street.position[0], walked.position[2] - street.position[2]),
  ).toBeGreaterThan(1);
  await page.mouse.move(780, 300);
  await page.mouse.down();
  await page.mouse.move(850, 310, { steps: 6 });
  await page.mouse.up();
  expect(Math.abs((await state(page)).bearing - walked.bearing)).toBeGreaterThan(8);
  await page.getByRole('button', { name: 'District overview', exact: true }).click();
  expect((await settled(page)).mode).toBe('orbit');
});

test('orbit circles the current target and a drag takes over during a camera flight', async ({ district: page }) => {
  const toggle = page.locator('#modes [data-mode="orbit"]');
  await page.getByRole('button', { name: 'Pause animation' }).click();
  await page.locator('.place[data-id="rathaus"]').click();
  const initial = await settled(page);
  await toggle.click();
  await expect(toggle).toHaveText('Stop orbit');
  await expect.poll(async () => Math.abs((await state(page)).bearing - initial.bearing)).toBeGreaterThan(1);
  await toggle.click();
  const stopped = await state(page);
  await page.waitForTimeout(200);
  expect((await state(page)).bearing).toBeCloseTo(stopped.bearing, 5);
  expect(stopped.target).toEqual(initial.target);

  await page.getByRole('button', { name: 'Top-down', exact: true }).click();
  await settled(page);
  await toggle.click();
  await page.mouse.move(750, 300);
  await page.mouse.down();
  const grabbed = await state(page);
  expect(grabbed.flying).toBe(false);
  await expect(toggle).toHaveText('Orbit');
  await page.mouse.move(915, 350, { steps: 8 });
  await page.mouse.up();
  const turned = await state(page);
  expect(Math.abs(((turned.bearing - grabbed.bearing + 540) % 360) - 180)).toBeGreaterThan(5);
  expect(turned.target).toEqual(grabbed.target);
});

test('simulation advances four populations, pauses, changes speed and respects layers', async ({
  district: page,
}) => {
  const snapshot = () =>
    page.evaluate(() =>
      Object.fromEntries(
        Object.entries(window.atlas.world.sims).map(([name, sim]) => [name, sim.positions()]),
      ),
    );
  const before = await snapshot();
  await page.waitForTimeout(900);
  const after = await snapshot();
  for (const kind of ['trams', 'trains', 'cars', 'people']) {
    expect(after[kind].length).toBeGreaterThan(2);
    expect(
      after[kind].some((p, i) => Math.hypot(p[0] - before[kind][i][0], p[1] - before[kind][i][1]) > 0.05),
    ).toBe(true);
  }
  await page.getByRole('button', { name: 'Pause animation' }).click();
  const paused = await snapshot();
  await page.waitForTimeout(250);
  expect(await snapshot()).toEqual(paused);
  await page.getByRole('button', { name: 'Change animation speed' }).click();
  expect(await page.evaluate(() => window.atlas.motion.speed)).toBe(2);
  await page.getByRole('button', { name: 'Play animation' }).click();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const boxes = page.locator('#layers input');
  expect(await boxes.count()).toBe(10);
  for (const box of await boxes.all()) {
    const id = await box.getAttribute('data-layer');
    await box.uncheck();
    expect(await page.evaluate((id) => window.atlas.world.layers[id as 'labels'].visible, id)).toBe(false);
    if (id === 'labels') await expect(page.locator('#markers')).toBeHidden();
    await box.check();
  }
});
