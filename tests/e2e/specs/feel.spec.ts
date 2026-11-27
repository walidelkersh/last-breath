import { expect, test, type Page } from "@playwright/test";
import { diveButton, open, sawAnimation, summary, watchAnimations } from "./play";

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

test("on the last breath the last bottle breathes and the rim beats twice and rests, slower than three flashes a second", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, "/?seed=33");
  await diveButton(page).click();
  await expect(page.locator(".breath-band")).toBeVisible({ timeout: 30_000 });

  await expect(page.locator(".bottle.pulse")).toHaveCount(1);
  const found = await page.evaluate(() => {
    const running = document.getAnimations().filter((animation) => animation instanceof CSSAnimation) as CSSAnimation[];
    const of = (name: string) => running.find((animation) => animation.animationName === name);
    const beat = of("heartbeat")!;
    const peaks = (beat.effect as KeyframeEffect).getKeyframes().filter((frame) => Number(frame.opacity) > 0.6).length;
    return {
      breathe: Number(of("breathe")?.effect?.getTiming().duration),
      beat: Number(beat.effect!.getTiming().duration),
      peaks,
      on: (beat.effect as KeyframeEffect).pseudoElement,
      band: getComputedStyle(document.querySelector(".breath-band")!).animationName,
    };
  });
  expect(found.breathe).toBe(1600);
  expect(found.beat).toBe(1600);
  expect(found.on).toBe("::after");
  expect(found.band, "the tab itself does not move").toBe("none");
  expect(found.peaks / (found.beat / 1000), "peaks a second").toBeLessThan(3);
});

test("a big win that plays out lights each coin once, one after another, counts the number up from nothing, and sends bubbles up", async ({ page }) => {
  test.setTimeout(60_000);
  await watchNames(page);
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as any).winTexts = seen;
    const sample = () => {
      const text = document.querySelector("[data-testid=win]")?.textContent;
      if (text && seen.at(-1) !== text) seen.push(text);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await expect(page.locator(".round.celebrate")).toBeVisible({ timeout: 40_000 });

  await expect(page.locator(".burst i")).toHaveCount(8);
  await expect(page.getByTestId("win")).toHaveText("21.65", { timeout: 5_000 });
  await page.waitForTimeout(1200);
  const lights = (await named(page)).filter((animation) => animation.name === "light");
  const coins = await page.locator(".tile-drawn").count();
  expect(lights.length).toBe(coins);
  expect(lights.every((light) => light.iterations === 1)).toBe(true);
  expect(new Set(lights.map((light) => light.delay)).size, "each coin in its turn").toBe(coins);
  const texts: string[] = await page.evaluate(() => (window as any).winTexts);
  const values = texts.map((text) => Number(text.replace(/,/g, "")));
  expect(values[0]).toBeLessThan(5);
  expect(values.length).toBeGreaterThan(10);
  expect(values).toEqual([...values].sort((a, b) => a - b));
  expect(values.at(-1)).toBe(21.65);
});

test("a big win that was skipped shows its number at once and keeps the lights", async ({ page }) => {
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();

  expect(await page.getByTestId("win").textContent()).toBe("21.65");
  await expect(page.locator(".round.celebrate")).toBeVisible();
});

test("the result rises into the console when the dive surfaces, and Dive again follows it", async ({ page }) => {
  await watchNames(page);
  await open(page, "/?seed=2");
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  await page.waitForTimeout(300);

  const surfaced = (await named(page)).filter((animation) => animation.name === "surface");
  expect(surfaced.map((animation) => animation.target).sort()).toEqual(["actions", "summary"]);
  expect(surfaced.find((animation) => animation.target === "actions")!.delay).toBeGreaterThan(0);
});

// Every new effect is left out with reduced motion, from the system or from the setting in the game, and the result still reads in full.
for (const how of ["system", "setting"] as const) {
  test.describe(`with reduced motion from the ${how}`, () => {
    if (how === "system") test.use({ contextOptions: { reducedMotion: "reduce" } });

    test("a big win and a last breath play with no effect at all, and the result is all there", async ({ page }) => {
      test.setTimeout(90_000);
      if (how === "setting") await page.addInitScript(() => localStorage.setItem("lastbreath.reduce", "1"));
      await watchAnimations(page);
      await open(page, "/?seed=154");
      await diveButton(page).click();
      await expect(summary(page)).toBeVisible({ timeout: 40_000 });
      await expect(page.getByTestId("win")).toHaveText("21.65");
      await expect(page.locator(".result-plate .big-win")).toHaveText("Big win");
      await expect(page.locator(".result-plate .plate-medal")).toBeVisible();

      await open(page, "/?seed=33");
      await diveButton(page).click();
      await expect(page.locator(".breath-band")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".board.last-breath")).toHaveCount(1);

      for (const effect of [".splash", ".sparkle", ".burst", ".celebrate", ".pulse", ".moves"]) await expect(page.locator(effect), effect).toHaveCount(0);
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      expect(await sawAnimation(page)).toBe(false);
    });
  });
}
