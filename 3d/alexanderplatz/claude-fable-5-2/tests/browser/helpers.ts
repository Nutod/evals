import { expect, type Page } from '@playwright/test';
import type { App } from '../../src/app';
import type { CameraState } from '../../src/camera/rig';

declare global {
  interface Window {
    __alex?: App;
  }
}

export interface Session {
  errors: string[];
  requests: string[];
}

/** Opens the app and waits until the city is built and frames are rendering. */
export async function open(page: Page, query = ''): Promise<Session> {
  const session: Session = { errors: [], requests: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') session.errors.push(m.text());
  });
  page.on('pageerror', (e) => session.errors.push(e.message));
  page.on('request', (r) => session.requests.push(r.url()));
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => window.__alex?.ready && window.__alex.frames > 3, null, { timeout: 100_000 });
  await expect(page.locator('#loading')).toHaveClass(/done/);
  return session;
}

export const camera = (page: Page): Promise<CameraState> => page.evaluate(() => window.__alex!.rig.getState());

export const stats = (page: Page): Promise<Record<string, number | string | boolean>> => page.evaluate(() => window.__alex!.stats());

/** Waits for a camera flight to finish. */
export async function settle(page: Page): Promise<CameraState> {
  await page.waitForFunction(() => !window.__alex!.rig.flying, null, { timeout: 15_000 });
  // let damping run out
  await page.waitForTimeout(1000);
  return camera(page);
}

export interface ImageStats {
  width: number;
  height: number;
  /** Mean luminance, 0..255. */
  mean: number;
  /** Standard deviation of luminance. */
  spread: number;
  /** Distinct colours after quantising to 4 bits per channel. */
  colours: number;
  topMean: number;
  bottomMean: number;
}

/** Renders a frame through the export path and measures it, so tests judge real pixels. */
export const frameStats = (page: Page): Promise<ImageStats> =>
  page.evaluate(async () => {
    const blob = await window.__alex!.exportPng(1);
    const bitmap = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bitmap.width;
    c.height = bitmap.height;
    const g = c.getContext('2d')!;
    g.drawImage(bitmap, 0, 0);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    const seen = new Set<number>();
    let sum = 0;
    let sq = 0;
    let top = 0;
    let bottom = 0;
    let n = 0;
    const half = c.height / 2;
    for (let y = 0; y < c.height; y += 3) {
      for (let x = 0; x < c.width; x += 3) {
        const i = (y * c.width + x) * 4;
        const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        sum += l;
        sq += l * l;
        if (y < half) top += l;
        else bottom += l;
        n++;
        seen.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
      }
    }
    const mean = sum / n;
    return { width: c.width, height: c.height, mean, spread: Math.sqrt(sq / n - mean * mean), colours: seen.size, topMean: top / (n / 2), bottomMean: bottom / (n / 2) };
  });

/** Centre of the canvas area not covered by the control panel. */
export async function viewCentre(page: Page): Promise<{ x: number; y: number }> {
  const size = page.viewportSize()!;
  const panel = await page.locator('#panel').boundingBox();
  const desktop = size.width > 760;
  return desktop ? { x: (panel!.x + panel!.width + size.width) / 2, y: size.height / 2 } : { x: size.width / 2, y: (panel!.y + 60) / 2 };
}
