import { expect, type CDPSession } from '@playwright/test';
import { test, state, settled } from './browser';

type Point = { x: number; y: number };
async function gesture(cdp: CDPSession, from: Point[], to: Point[]) {
  const points = (t: number) =>
    from.map((p, i) => ({ x: p.x + (to[i].x - p.x) * t, y: p.y + (to[i].y - p.y) * t, id: i }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(0) });
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(i / 8) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('phone guide, touch orbit, pinch, two-finger pan, layers and walking stick', async ({
  district: page,
}, info) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  await expect(page.locator('#places')).toBeHidden();
  await page.screenshot({ path: info.outputPath('phone.png') });
  const cdp = await page.context().newCDPSession(page);
  await page.getByRole('button', { name: 'Orbit', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Stop orbit' })).toBeVisible();
  const start = await state(page);
  await gesture(cdp, [{ x: 100, y: 203 }], [{ x: 210, y: 209 }]);
  await expect(page.getByRole('button', { name: 'Orbit', exact: true })).toBeVisible();
  expect(Math.abs((await state(page)).bearing - start.bearing)).toBeGreaterThan(5);
  const prev = await state(page);
  await gesture(
    cdp,
    [
      { x: 115, y: 240 },
      { x: 215, y: 240 },
    ],
    [
      { x: 55, y: 240 },
      { x: 285, y: 240 },
    ],
  );
  await expect.poll(async () => (await state(page)).distance).toBeLessThan(prev.distance * 0.8);
  const target = (await state(page)).target;
  await gesture(
    cdp,
    [
      { x: 92, y: 212 },
      { x: 190, y: 212 },
    ],
    [
      { x: 142, y: 240 },
      { x: 240, y: 240 },
    ],
  );
  expect((await state(page)).target).not.toEqual(target);
  await page.getByRole('button', { name: 'District guide' }).tap();
  await expect(page.locator('#places')).toBeVisible();
  await page.locator('.place[data-id=weltzeituhr]').tap();
  await settled(page);
  await expect(page.locator('#places')).toBeHidden();
  await page.getByRole('button', { name: 'Street', exact: true }).tap();
  const street = await settled(page);
  await expect(page.locator('#walk')).toBeVisible();
  const b = (await page.locator('#walk').boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: b.x + b.width / 2, y: b.y + 7, id: 0 }],
  });
  await page.waitForTimeout(750);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const walked = await state(page);
  expect(walked.position[1]).toBeCloseTo(1.7);
  expect(
    Math.hypot(street.position[0] - walked.position[0], street.position[2] - walked.position[2]),
  ).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Layers', exact: true }).tap();
  await page.getByLabel('Trams', { exact: true }).tap();
  expect(await page.evaluate(() => window.atlas.world.layers.trams.visible)).toBe(false);
  await page.getByRole('button', { name: 'Close layers' }).tap();
  await page.getByRole('button', { name: 'District guide' }).tap();
  await page.getByRole('button', { name: 'Golden hour' }).tap();
  await expect(page.locator('#guide')).not.toHaveClass(/expanded/);
  await expect(page.locator('footer a')).toBeVisible();
});
