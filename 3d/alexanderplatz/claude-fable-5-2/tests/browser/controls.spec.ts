import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { open, stats } from './helpers';

test.describe('controls', () => {
  test('layer toggles show and hide their content', async ({ page }) => {
    await open(page);
    const ids = await page.locator('#layers input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).dataset.layer!));
    expect(ids).toEqual(['landmarks', 'buildings', 'streets', 'trees', 'furniture', 'trams', 'trains', 'cars', 'people', 'labels']);
    const base = Number((await stats(page)).triangles);
    for (const id of ids) {
      const box = page.locator(`#layers input[data-layer="${id}"]`);
      await box.uncheck();
      expect(await page.evaluate((layer) => window.__alex!.world.layers[layer as 'trams'].visible, id)).toBe(false);
      await page.waitForTimeout(120);
      if (id !== 'labels') expect(Number((await stats(page)).triangles)).toBeLessThan(base);
      await box.check();
      expect(await page.evaluate((layer) => window.__alex!.world.layers[layer as 'trams'].visible, id)).toBe(true);
    }
    await page.locator('#layers input[data-layer="labels"]').uncheck();
    await expect(page.locator('#labels')).toBeHidden();
  });

  test('trams, trains, cars and people move; pause and speed control them', async ({ page }) => {
    await open(page);
    const snapshot = () =>
      page.evaluate(() => {
        const app = window.__alex!;
        return { time: Number(app.stats().simTime), sims: Object.fromEntries(Object.entries(app.world.sims).map(([k, v]) => [k, { count: v.count, positions: v.positions() }])) };
      });
    const travel = (a: [number, number][], b: [number, number][]): number => a.reduce((s, p, i) => s + (b[i] ? Math.hypot(b[i][0] - p[0], b[i][1] - p[1]) : 0), 0);

    const a = await snapshot();
    expect(a.sims.trams.count).toBeGreaterThanOrEqual(4);
    expect(a.sims.trains.count).toBeGreaterThanOrEqual(4);
    expect(a.sims.cars.count).toBeGreaterThanOrEqual(40);
    expect(a.sims.people.count).toBeGreaterThanOrEqual(90);
    await page.waitForTimeout(1500);
    const b = await snapshot();
    for (const kind of ['trams', 'trains', 'cars', 'people']) expect(travel(a.sims[kind].positions, b.sims[kind].positions), kind).toBeGreaterThan(1);
    const rate1 = (b.time - a.time) / 1.5;

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'false');
    const c = await snapshot();
    await page.waitForTimeout(600);
    const d = await snapshot();
    expect(d.time).toBe(c.time);
    for (const kind of ['trams', 'trains', 'cars', 'people']) expect(travel(c.sims[kind].positions, d.sims[kind].positions), kind).toBe(0);
    // rendering continues while paused
    const frames = Number((await stats(page)).frames);
    await page.waitForTimeout(300);
    expect(Number((await stats(page)).frames)).toBeGreaterThan(frames);

    await page.locator('#speed button[data-speed="4"]').click();
    await page.getByRole('button', { name: 'Play' }).click();
    const e = await snapshot();
    await page.waitForTimeout(1500);
    const f = await snapshot();
    expect((f.time - e.time) / 1.5).toBeGreaterThan(rate1 * 2.5);

    await page.keyboard.press('Space');
    expect((await stats(page)).playing).toBe(false);
  });

  test('trams and trains stay on the mapped tracks', async ({ page }) => {
    await open(page);
    const osm = JSON.parse(readFileSync(new URL('../../src/data/osm.json', import.meta.url), 'utf8')) as { tram: { p: number[] }[]; rail: { s: number[][]; r: number[][] } };
    const offTrack = (p: [number, number], lines: number[][]): number => {
      let best = Infinity;
      for (const l of lines) {
        for (let i = 2; i < l.length; i += 2) {
          const ax = l[i - 2];
          const az = l[i - 1];
          const dx = l[i] - ax;
          const dz = l[i + 1] - az;
          const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / (dx * dx + dz * dz || 1)));
          best = Math.min(best, Math.hypot(ax + dx * t - p[0], az + dz * t - p[1]));
        }
      }
      return best;
    };
    for (let round = 0; round < 3; round++) {
      const sims = await page.evaluate(() => ({ trams: window.__alex!.world.sims.trams.positions(), trains: window.__alex!.world.sims.trains.positions() }));
      expect(sims.trams.length).toBeGreaterThan(0);
      for (const p of sims.trams) expect(offTrack(p, osm.tram.map((t) => t.p))).toBeLessThan(1.2);
      for (const p of sims.trains) expect(offTrack(p, [...osm.rail.s, ...osm.rail.r])).toBeLessThan(1.2);
      await page.waitForTimeout(700);
    }
  });

  test('lighting buttons switch the preset', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Blue hour' }).click();
    await expect(page.getByRole('button', { name: 'Blue hour' })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForFunction(() => window.__alex!.stats().night === 1);
    expect((await stats(page)).lighting).toBe('blue');
    await expect(page.locator('#clock')).toHaveText(/^22:/);
    await page.getByRole('button', { name: 'Golden hour' }).click();
    await page.waitForFunction(() => Math.abs(Number(window.__alex!.stats().night) - 0.22) < 0.01);
    await page.getByRole('button', { name: 'Daylight' }).click();
    await page.waitForFunction(() => window.__alex!.stats().night === 0);
  });

  test('PNG export downloads the current view with the attribution drawn in', async ({ page }) => {
    await open(page);
    const canvas = await page.evaluate(() => ({ w: window.__alex!.canvas.width, h: window.__alex!.canvas.height }));

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save PNG' }).click()]);
    expect(download.suggestedFilename()).toBe(`alexanderplatz-day-${canvas.w}x${canvas.h}.png`);
    const file = readFileSync((await download.path())!);
    expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(file.readUInt32BE(16)).toBe(canvas.w);
    expect(file.readUInt32BE(20)).toBe(canvas.h);
    expect(file.length).toBeGreaterThan(100_000);
    await expect(page.locator('#export-status')).toHaveText(`Saved ${canvas.w} × ${canvas.h} px`);

    // the attribution strip is the dark green box in the bottom-right corner
    const corner = await page.evaluate(async () => {
      const bitmap = await createImageBitmap(await window.__alex!.exportPng(1));
      const c = document.createElement('canvas');
      c.width = bitmap.width;
      c.height = bitmap.height;
      const g = c.getContext('2d')!;
      g.drawImage(bitmap, 0, 0);
      return [...g.getImageData(bitmap.width - 4, bitmap.height - 4, 1, 1).data];
    });
    expect(corner[1]).toBeGreaterThan(corner[0]);
    expect(corner[0]).toBeLessThan(80);

    await page.locator('#export-scale button[data-scale="2"]').click();
    const [big] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save PNG' }).click()]);
    const bigFile = readFileSync((await big.path())!);
    expect(bigFile.readUInt32BE(16)).toBe(canvas.w * 2);
    expect(bigFile.readUInt32BE(20)).toBe(canvas.h * 2);
    // the live canvas goes back to its normal resolution afterwards
    expect(await page.evaluate(() => window.__alex!.canvas.width)).toBe(canvas.w);
  });
});
