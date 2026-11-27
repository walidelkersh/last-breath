import { expect, test, type Page } from "@playwright/test";
import { diveButton, open } from "./play";

// How the board feels. Seed 154 is a Classic round that lands crates on its first spin and a Minor on its fourth. Seed 33 is a sparse Classic
// round that reaches its last breath several times. Every effect here plays once and only with motion, and none of them moves the layout.

// Every CSS animation that has run, by name, with its timing, so a test can ask what played and for how long.
async function watchNames(page: Page) {
  await page.addInitScript(() => {
    const seen: { name: string; target: string; duration: number; iterations: number; delay: number }[] = [];
    const known = new Set<Animation>();
    const frame = () => {
      for (const animation of document.getAnimations()) {
        if (known.has(animation) || !(animation instanceof CSSAnimation)) continue;
        known.add(animation);
        const effect = animation.effect as KeyframeEffect;
        const target = effect.target as Element;
        const timing = effect.getTiming();
        seen.push({ name: animation.animationName, target: `${target.className.baseVal ?? target.className}${effect.pseudoElement ?? ""}`, duration: Number(timing.duration), iterations: Number(timing.iterations), delay: Number(timing.delay) });
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    (window as any).namedAnimations = seen;
  });
}

const named = (page: Page) => page.evaluate(() => (window as any).namedAnimations as { name: string; target: string; duration: number; iterations: number; delay: number }[]);

test("a coin drops into its well and settles, with a ring on the water and bubbles, and a jackpot also catches the light", async ({ page }) => {
  test.setTimeout(60_000);
  await watchNames(page);
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await expect(page.locator(".prize.hit")).toHaveCount(1, { timeout: 30_000 });
  await page.waitForTimeout(1000);

  const seen = await named(page);
  const by = (name: string) => seen.filter((animation) => animation.name === name);
  expect(by("tile-in").length, "every new coin drops in").toBeGreaterThan(3);
  expect(by("ripple").length).toBe(by("tile-in").filter((animation) => animation.target.includes("coin")).length);
  expect(by("fizz").length).toBe(by("ripple").length * 3);
  expect(by("glint").length, "the Minor catches the light").toBeGreaterThanOrEqual(1);
  for (const animation of seen.filter((item) => ["tile-in", "ripple", "fizz", "glint"].includes(item.name))) {
    expect(animation.iterations, animation.name).toBe(1);
    expect(animation.duration + animation.delay, `${animation.name} is over within a second`).toBeLessThanOrEqual(1000);
  }
  // The splash goes with the spin that made it.
  await expect(page.locator(".splash")).toHaveCount(0, { timeout: 5_000 });
});

test("a coin that lands moves no other tile and no part of the board", async ({ page }) => {
  await open(page, "/?seed=154");
  await diveButton(page).click();
  const before = await page.evaluate(() => [...document.querySelectorAll(".tile, .board, .board-foot, .prizes")].map((element) => element.getBoundingClientRect().toJSON()));
  await expect(page.locator(".splash").first()).toBeAttached({ timeout: 10_000 });
  const during = await page.evaluate(() => [...document.querySelectorAll(".tile, .board, .board-foot, .prizes")].map((element) => element.getBoundingClientRect().toJSON()));
  expect(during).toEqual(before);
});
