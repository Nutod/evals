import { test, expect } from '@playwright/test';

test('production build renders locally with working controls and attributed image export', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (request) => errors.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on('request', (request) => {
    if (!request.url().startsWith('http://localhost:5174') && !request.url().startsWith('blob:'))
      external.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('#loader')).toHaveClass(/loaded/, { timeout: 60_000 });
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute(
    'content',
    'Alexanderplatz Atlas',
  );
  await page.getByRole('button', { name: 'Daylight', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('production-day.png') });
  await page.getByRole('button', { name: /03.*Weltzeituhr/ }).click();
  await expect(page.locator('#detail-card h2')).toHaveText('Weltzeituhr');
  await page.getByRole('button', { name: 'Blue hour', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('production-blue.png') });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save a scene image', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(testInfo.outputPath(download.suggestedFilename()));
  expect(
    await page
      .locator('canvas')
      .evaluate((canvas) => (canvas instanceof HTMLCanvasElement ? canvas.width * canvas.height : 0)),
  ).toBeGreaterThan(100_000);
  expect(await page.evaluate(() => '__ATLAS__' in window)).toBe(false);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
