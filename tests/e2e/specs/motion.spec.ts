import { expect, test } from "@playwright/test";
import { diveButton, dives, open, sawAnimation, summary, watchAnimations } from "./play";

const animated = ".anim-in, .anim-fly";

// Seeds that put crates on the board early in each dive, so the round has something to animate.
const seeds: Record<string, number> = { "Classic Dive": 1, "Drift Dive": 11, "Tank Dive": 4 };

test.describe("with prefers-reduced-motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });
  test.setTimeout(45_000);

  for (const dive of dives) {
    test(`${dive.name} is played start to finish with no animation class and no running animation`, async ({ page }) => {
      await watchAnimations(page);
      await open(page, `/?seed=${seeds[dive.name]}`);
      await page.keyboard.press(dive.key);
      await diveButton(page).click();

      await expect(summary(page)).toBeVisible({ timeout: 30_000 });
      expect(await page.locator(".tile:not(.tile-empty)").count()).toBeGreaterThan(0);
      expect(await page.locator(animated).count()).toBe(0);
      expect(await sawAnimation(page)).toBe(false);
    });
  }

  test("the +n effect and the tiles still show, and the pacing stays", async ({ page }) => {
    await open(page, "/?seed=4");
    await page.keyboard.press("3");
    await diveButton(page).click();

    await expect(page.getByTestId("gain")).toHaveText("+3");
    await expect(page.locator(".tile-tank")).toHaveCount(2);
    const shownAt = Date.now();
    await expect(page.getByTestId("gain")).toHaveText("+2");
    expect(Date.now() - shownAt).toBeGreaterThan(300);

    const toggle = page.getByLabel("Reduce motion");
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeDisabled();
  });
});

test("the in-game toggle turns the animation classes off and is remembered", async ({ page }) => {
  await watchAnimations(page);
  await open(page, "/?seed=4");
  await page.keyboard.press("3");
  await diveButton(page).click();

  await expect(page.getByTestId("gain")).toHaveText("+3");
  await expect(page.locator(".tile-tank.anim-in")).toHaveCount(2);
  await expect(page.getByTestId("gain")).toHaveClass(/anim-fly/);
  expect(await sawAnimation(page)).toBe(true);

  await page.getByLabel("Reduce motion").check();
  await expect(page.locator(animated)).toHaveCount(0);

  await page.reload();
  await expect(diveButton(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel("Reduce motion")).toBeChecked();
});
