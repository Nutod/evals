import { test, expect, type Page } from '@playwright/test';

type DebugState = {
  lighting: string;
  view: string;
  landmark: string | null;
  paused: boolean;
  orbit: boolean;
  labels: boolean;
  vegetation: boolean;
  traffic: boolean;
};
declare global {
  interface Window {
    __ATLAS__: {
      getState(): DebugState;
      getMetrics(): { frames: number; time: number; buildings: number; drawCalls: number; triangles: number };
      isTravelling(): boolean;
      getLandmarkDiagnostics(id: string): { height: number; blockedByBuilding: boolean };
      scene: { getObjectByName(name: string): unknown };
      renderer: { getContext(): WebGLRenderingContext };
      camera: { position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void } };
      controls: { target: { set(x: number, y: number, z: number): void }; update(delta: number): void };
    };
  }
}

async function load(page: Page) {
  await page.goto('/');
  await expect(page.locator('#loader')).toHaveClass(/loaded/, { timeout: 60_000 });
  await page.waitForFunction(() => window.__ATLAS__?.getMetrics().frames > 2);
}

test('renders the geographic scene and all landmark destinations without browser errors', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('requestfailed', (req) => errors.push(`${req.url()} ${req.failure()?.errorText}`));
  await load(page);
  const metrics = await page.evaluate(() => window.__ATLAS__.getMetrics());
  expect(metrics.buildings).toBeGreaterThan(300);
  expect(metrics.triangles).toBeGreaterThan(10_000);
  expect(metrics.drawCalls).toBeLessThan(1000);
  await page.screenshot({ path: testInfo.outputPath('overview-golden.png') });
  for (const [key, id] of [
    ['1', 'tower'],
    ['2', 'park-inn'],
    ['3', 'clock'],
    ['4', 'station'],
    ['5', 'rathaus'],
    ['6', 'church'],
  ]) {
    await page.locator('canvas').focus();
    await page.keyboard.press(key);
    await expect.poll(() => page.evaluate(() => window.__ATLAS__.getState().landmark)).toBe(id);
    await expect(page.locator('#detail-card')).toBeVisible();
    await page.waitForFunction(() => !window.__ATLAS__.isTravelling());
    const diagnostics = await page.evaluate((id) => window.__ATLAS__.getLandmarkDiagnostics(id), id);
    expect(diagnostics.blockedByBuilding, `${id} camera must not hide behind another building`).toBe(false);
    expect(diagnostics.height).toBeGreaterThan(9);
  }
  await page.locator('canvas').focus();
  await page.keyboard.press('3');
  await page.waitForFunction(() => !window.__ATLAS__.isTravelling());
  await page.screenshot({ path: testInfo.outputPath('world-clock.png') });
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__ATLAS__.getState().landmark)).toBe(null);
  expect(errors).toEqual([]);
});

test('lighting, layers, views, orbit, pause and image capture work', async ({ page }, testInfo) => {
  await load(page);
  await page.getByRole('button', { name: 'Daylight', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__ATLAS__.getState().lighting)).toBe('day');
  await page.getByRole('button', { name: 'Blue hour', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Blue hour', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({ path: testInfo.outputPath('overview-blue.png') });
  for (const label of ['Place labels', 'Urban greenery', 'City life']) {
    await page.getByLabel(label, { exact: true }).uncheck();
    await expect(page.getByLabel(label, { exact: true })).not.toBeChecked();
    await page.getByLabel(label, { exact: true }).check();
  }
  for (const view of ['Top down view', 'Street view', 'Perspective view']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await expect(page.getByRole('button', { name: view, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
  await page.getByRole('button', { name: 'Toggle camera orbit', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__ATLAS__.getState().orbit)).toBe(true);
  await page.getByRole('button', { name: 'Pause city animation', exact: true }).click();
  const start = await page.evaluate(() => window.__ATLAS__.getMetrics().time);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__ATLAS__.getMetrics().time)).toBe(start);
  await page.getByRole('button', { name: 'Resume city animation', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__ATLAS__.getMetrics().time)).toBeGreaterThan(start);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save a scene image', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('alexanderplatz-blue.png');
  await page.getByRole('button', { name: 'About this model and controls', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('reduced motion and mobile controls remain usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page);
  expect(await page.evaluate(() => window.__ATLAS__.getState().paused)).toBe(true);
  const markerHits = await page.locator('.map-label:visible').evaluateAll((elements) =>
    elements.every((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }),
  );
  expect(markerHits).toBe(true);
  await page.getByRole('combobox', { name: 'Choose a landmark' }).selectOption('clock');
  await expect(page.locator('#detail-card')).toBeVisible();
  await page.locator('.layers-panel summary').click();
  await expect(page.locator('#detail-card')).not.toBeVisible();
  await expect(page.getByText('Urban greenery', { exact: true })).toBeVisible();
  await page.locator('.layers-panel summary').click();
  await expect(page.locator('#detail-card')).toBeVisible();
  await page.getByRole('combobox', { name: 'Choose a landmark' }).selectOption('');
  await page.getByRole('button', { name: 'Blue hour', exact: true }).click();
  await page.getByRole('button', { name: 'Top down view', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Top down view', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Perspective view', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('mobile.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload();
  await expect(page.locator('#loader')).toHaveClass(/loaded/, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__ATLAS__.getState().lighting)).toBe('golden');
});

test('shows a clear recovery path when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.startsWith('webgl')) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto('/');
  await expect(page.locator('#loader')).toHaveClass(/error/);
  await expect(page.getByRole('link', { name: 'Try again', exact: true })).toBeVisible();
});

test('street-level height, compass and shortcuts remain correct after using controls', async ({
  page,
}, testInfo) => {
  await load(page);
  await page.getByRole('button', { name: 'Street view', exact: true }).click();
  await page.waitForFunction(() => !window.__ATLAS__.isTravelling());
  expect(await page.evaluate(() => window.__ATLAS__.camera.position.y)).toBeCloseTo(3.5, 1);
  await page.screenshot({ path: testInfo.outputPath('street-eye-level.png') });
  await page.getByRole('button', { name: 'Daylight', exact: true }).click();
  await page.keyboard.press('t');
  expect(await page.evaluate(() => window.__ATLAS__.getState().lighting)).toBe('golden');
  await page.keyboard.press('3');
  await page.waitForFunction(() => !window.__ATLAS__.isTravelling());
  await page.getByRole('button', { name: 'Street view', exact: true }).click();
  await page.waitForFunction(() => !window.__ATLAS__.isTravelling());
  expect(await page.evaluate(() => window.__ATLAS__.camera.position.y)).toBeCloseTo(2.2, 1);
  await page.locator('#detail-card h2').evaluate((el) => el.setAttribute('data-preserved', 'true'));
  await page.getByRole('button', { name: 'Blue hour', exact: true }).click();
  await expect(page.locator('#detail-card h2')).toHaveAttribute('data-preserved', 'true');
  await page.keyboard.press('l');
  expect(await page.evaluate(() => window.__ATLAS__.getState().labels)).toBe(false);
  await page.keyboard.press('h');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  await page.waitForFunction(() => !window.__ATLAS__.isTravelling());
  expect(await page.evaluate(() => window.__ATLAS__.getState().landmark)).toBe(null);
  await page.evaluate(() => {
    window.__ATLAS__.controls.target.set(0, 0, 0);
    window.__ATLAS__.camera.position.set(600, 200, 0);
    window.__ATLAS__.controls.update(0);
  });
  await expect
    .poll(() => page.locator('#compass').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).b))
    .toBeGreaterThan(0.99);
});

test('orbit moves the camera, pause freezes it and manual interaction cancels travel', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: 'Toggle camera orbit', exact: true }).click();
  const z = await page.evaluate(() => window.__ATLAS__.camera.position.z);
  await page.waitForFunction((z) => Math.abs(window.__ATLAS__.camera.position.z - z) > 0.2, z);
  await page.getByRole('button', { name: 'Pause city animation', exact: true }).click();
  const stopped = await page.evaluate(() => ({
    x: window.__ATLAS__.camera.position.x,
    z: window.__ATLAS__.camera.position.z,
  }));
  const frames = await page.evaluate(() => window.__ATLAS__.getMetrics().frames);
  await page.waitForFunction((frames) => window.__ATLAS__.getMetrics().frames > frames + 3, frames);
  const after = await page.evaluate(() => ({
    x: window.__ATLAS__.camera.position.x,
    z: window.__ATLAS__.camera.position.z,
  }));
  expect(Math.hypot(stopped.x - after.x, stopped.z - after.z)).toBeLessThan(0.001);
  await page.getByRole('button', { name: /01.*Fernsehturm/ }).click();
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.move(760, 470, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__ATLAS__.isTravelling())).toBe(false);
});

test('landscape keeps attribution on screen and context loss offers recovery', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await load(page);
  const footer = await page.locator('footer').boundingBox();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(390);
  await expect(page.getByRole('combobox', { name: 'Choose a landmark' })).toBeVisible();
  await page.locator('.layers-panel summary').click();
  for (const label of ['Place labels', 'Urban greenery', 'City life']) {
    const checkbox = page.getByLabel(label, { exact: true });
    const reachable = await checkbox.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return element === hit || element.contains(hit);
    });
    expect(reachable, `${label} must not be intercepted by a transparent HUD`).toBe(true);
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
  }
  await page.keyboard.press('t');
  expect(await page.evaluate(() => window.__ATLAS__.getState().lighting)).toBe('blue');
  await page.locator('.layers-panel summary').click();
  await page.screenshot({ path: testInfo.outputPath('landscape.png') });
  await page.evaluate(() =>
    window.__ATLAS__.renderer.getContext().getExtension('WEBGL_lose_context')!.loseContext(),
  );
  await expect(page.locator('#loader')).toHaveClass(/error/);
  await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
});

test('street navigation preserves eye height and return flights do not jump', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: 'Street view', exact: true }).click();
  await page.waitForFunction(() => !window.__ATLAS__.isTravelling());
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, 650);
  let frame = await page.evaluate(() => window.__ATLAS__.getMetrics().frames);
  await page.waitForFunction((frame) => window.__ATLAS__.getMetrics().frames > frame + 4, frame);
  expect(await page.evaluate(() => window.__ATLAS__.camera.position.y)).toBeCloseTo(3.5, 4);
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.move(700, 560, { steps: 5 });
  await page.mouse.up();
  frame = await page.evaluate(() => window.__ATLAS__.getMetrics().frames);
  await page.waitForFunction((frame) => window.__ATLAS__.getMetrics().frames > frame + 3, frame);
  expect(await page.evaluate(() => window.__ATLAS__.camera.position.y)).toBeCloseTo(3.5, 4);
  for (const view of ['perspective', 'top']) {
    const jump = await page.evaluate((view) => {
      const before = window.__ATLAS__.camera.position.y;
      document.querySelector<HTMLButtonElement>(`[data-view="${view}"]`)!.click();
      return Math.abs(window.__ATLAS__.camera.position.y - before);
    }, view);
    expect(jump).toBeLessThan(0.001);
    await page.waitForFunction(() => !window.__ATLAS__.isTravelling());
    await page.getByRole('button', { name: 'Street view', exact: true }).click();
    await page.waitForFunction(() => !window.__ATLAS__.isTravelling());
  }
});
