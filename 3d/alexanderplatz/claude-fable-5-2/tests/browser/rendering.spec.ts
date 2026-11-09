import { expect, test } from '@playwright/test';
import { frameStats, open, settle, stats } from './helpers';

test.describe('rendering', () => {
  test('builds the city and draws a real picture without errors or outside requests', async ({ page, baseURL }) => {
    const session = await open(page);
    const s = await stats(page);
    expect(s.build).toBe('production');
    expect(Number(s.drawCalls)).toBeGreaterThan(60);
    expect(Number(s.triangles)).toBeGreaterThan(300_000);

    const image = await frameStats(page);
    // a blank or single-colour canvas would have almost no spread or palette
    expect(image.spread).toBeGreaterThan(18);
    expect(image.colours).toBeGreaterThan(150);
    // sky above, city below
    expect(Math.abs(image.topMean - image.bottomMean)).toBeGreaterThan(4);

    expect(session.errors).toEqual([]);
    const outside = session.requests.filter((u) => !u.startsWith(baseURL!) && !u.startsWith('data:') && !u.startsWith('blob:'));
    expect(outside).toEqual([]);
  });

  test('models all six landmarks at their published heights', async ({ page }) => {
    await open(page);
    const landmarks = await page.evaluate(() => window.__alex!.landmarks.map((l) => ({ id: l.id, height: l.height, anchor: l.anchor })));
    expect(landmarks.map((l) => l.id)).toEqual(['fernsehturm', 'park-inn', 'weltzeituhr', 'station', 'rathaus', 'marienkirche']);
    expect(Object.fromEntries(landmarks.map((l) => [l.id, l.height]))).toMatchObject({ fernsehturm: 368, 'park-inn': 125, weltzeituhr: 10, rathaus: 74, marienkirche: 90 });

    // measure the built geometry, not the constants
    const measured = await page.evaluate(() => {
      const app = window.__alex!;
      const out: Record<string, number> = {};
      for (const name of ['fernsehturm', 'park-inn', 'weltzeituhr', 'station', 'rathaus', 'marienkirche']) {
        const group = app.scene.getObjectByName(name)!;
        let top = 0;
        group.updateWorldMatrix(true, true);
        group.traverse((o) => {
          const mesh = o as import('three').Mesh;
          if (!mesh.isMesh || (mesh as unknown as { isSprite?: boolean }).isSprite) return;
          mesh.geometry.computeBoundingBox();
          const box = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
          top = Math.max(top, box.max.y);
        });
        out[name] = top;
      }
      return out;
    });
    expect(measured.fernsehturm).toBeCloseTo(368, 0);
    expect(measured['park-inn']).toBeGreaterThan(125);
    expect(measured['park-inn']).toBeLessThan(151);
    expect(measured.weltzeituhr).toBeCloseTo(10, 0);
    expect(measured.rathaus).toBeGreaterThan(74);
    expect(measured.rathaus).toBeLessThan(92);
    expect(measured.marienkirche).toBeGreaterThan(88);
    expect(measured.marienkirche).toBeLessThan(92);
    expect(measured.station).toBeGreaterThan(18);
  });

  test('daylight, golden hour and blue hour look different', async ({ page }) => {
    await open(page, 'labels=0');
    const day = await frameStats(page);
    await page.evaluate(() => window.__alex!.setLighting('golden', true));
    await page.waitForTimeout(300);
    const golden = await frameStats(page);
    await page.evaluate(() => window.__alex!.setLighting('blue', true));
    await page.waitForTimeout(300);
    const blue = await frameStats(page);
    expect(day.mean).toBeGreaterThan(golden.mean);
    expect(golden.mean).toBeGreaterThan(blue.mean + 15);
    expect((await stats(page)).night).toBe(1);
    // lit windows and lamps keep the night frame from going flat
    expect(blue.spread).toBeGreaterThan(12);
  });

  test('keeps attribution and the accuracy note on screen and in the about dialog', async ({ page }) => {
    await open(page);
    await expect(page.locator('#attribution')).toBeVisible();
    await expect(page.locator('#attribution')).toContainText('OpenStreetMap contributors');
    await expect(page.locator('#attribution')).toContainText('approximate');
    await expect(page.locator('#attribution a')).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    if (page.viewportSize()!.width <= 760) await page.getByRole('tab', { name: 'View' }).click();
    await page.getByRole('button', { name: 'About, data and accuracy' }).click();
    const about = page.locator('#about');
    await expect(about).toBeVisible();
    await expect(about).toContainText('Open Database License');
    await expect(about).toContainText('simplified');
    await about.getByRole('button', { name: 'Close' }).click();
    await expect(about).toBeHidden();
    await settle(page);
  });
});
