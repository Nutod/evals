import { test, expect } from "@playwright/test";

const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const failures = [];
  errors.set(page, failures);
  page.on("pageerror", (e) => failures.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") failures.push(m.text());
  });
  page.on("requestfailed", (r) =>
    failures.push(`${r.url()} ${r.failure()?.errorText}`),
  );
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__valley?.ready);
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
async function seek(page, value) {
  await page.locator("#approach").evaluate((el, value) => {
    el.value = String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  await expect
    .poll(() => page.evaluate(() => window.__valley.state.value))
    .toBe(value);
}
test("noon is rendered immediately with controls and notes off", async ({
  page,
}, info) => {
  await expect(page.locator("#hour-notes")).toBeHidden();
  await expect(page.locator("#clock")).toHaveText("12:00");
  await expect(page.locator("#failure")).toBeHidden();
  const state = await page.evaluate(() => window.__valley.state);
  expect(state.frames).toBeGreaterThan(0);
  expect(state.people).toBe(2400);
  expect(state.dragonVisible).toBe(false);
  await page.screenshot({ path: info.outputPath("noon.png") });
});
test("every hour, fractional scrubbing and reverse restore deterministic state", async ({
  page,
}, info) => {
  for (const value of [1, 2, 2.75, 3, 4, 2, 0]) {
    await seek(page, value);
    const s = await page.evaluate(() => window.__valley.state);
    expect(s.resident.length).toBeLessThanOrEqual(3);
    expect(s.resident).toContain(Math.round(value));
    if ([2, 3, 4].includes(value))
      await page.screenshot({ path: info.outputPath(`hour-${value}.png`) });
  }
  expect(await page.evaluate(() => window.__valley.state.gate)).toBe(0);
  expect(await page.evaluate(() => window.__valley.state.dragonVisible)).toBe(
    false,
  );
  expect(await page.evaluate(() => window.__valley.state.effects)).toEqual([
    "kitchen",
  ]);
  await page.locator("#approach").focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => page.evaluate(() => window.__valley.state.value))
    .toBe(0.001);
});
test("camera presets, secondary settings and photo mode remain operable", async ({
  page,
}, info) => {
  for (const view of ["market", "falls", "gate", "aerial", "valley"]) {
    await page.locator(`[data-view=${view}]`).click();
    await page.waitForTimeout(1900);
    await expect(page.locator(`[data-view=${view}]`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    if (view === "gate") {
      const camera = await page.evaluate(() => window.__valley.state.camera);
      expect(camera[1]).toBeCloseTo(18, 0);
    }
    await page.screenshot({ path: info.outputPath(`${view}.png`) });
  }
  await page.locator("#notes").click();
  await expect(page.locator("#hour-notes")).toBeVisible();
  await page.locator("#quality").selectOption("low");
  await expect
    .poll(() => page.evaluate(() => window.__valley.state.people))
    .toBe(960);
  await page.locator("#density").fill("0.5");
  await expect
    .poll(() => page.evaluate(() => window.__valley.state.people))
    .toBe(480);
  await page.locator("#photo").click();
  await expect(page.locator(".bottom-ui")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator(".bottom-ui")).toBeVisible();
  await page.locator("#play").click();
  await expect
    .poll(() => page.evaluate(() => window.__valley.state.value))
    .toBeGreaterThan(0);
  await page.locator("#play").click();
  await expect(page.locator("#play")).toHaveAttribute("aria-pressed", "false");
});
test("mobile layout exposes every hour and never overflows", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ["Noon", "Shadow", "Circling", "Fire", "Night"])
    await expect(
      page.getByRole("button", { name: `Go to ${name}`, exact: true }),
    ).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.locator("#approach").evaluate((el) => {
    el.value = "4";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#clock")).toHaveText("23:00");
  await page.screenshot({ path: info.outputPath("mobile.png") });
});
