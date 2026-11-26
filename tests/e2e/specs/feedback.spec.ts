import { expect, test, type Page } from "@playwright/test";
import { diveButton, open, sawAnimation, summary, watchAnimations } from "./play";

// Found with "lab play --dive classic --seed N", where amounts are units and 1,000 units are one bet.
// Seed 154 lands a Minor (20,000) and ends on a board worth 21,650, so it is a jackpot round and a Big win.
// Seed 1 ends on a board worth 2,500, which is 2.5 times the bet and not a Big win.
const bigWin = 154;
const smallWin = 1;

async function playClassic(page: Page, seed: number) {
  await open(page, `/?seed=${seed}`);
  await diveButton(page).click();
}

// Samples what the board total shows on every frame, so a count-up shows as many values and a jump as one.
async function watchTotal(page: Page) {
  await page.addInitScript(() => {
    const seen: { text: string; at: number }[] = [];
    (window as any).seenTotals = seen;
    const sample = (at: number) => {
      const text = document.querySelector(".total strong")?.textContent;
      if (text && seen.at(-1)?.text !== text) seen.push({ text, at });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

const totals = (page: Page) => page.evaluate(() => (window as any).seenTotals as { text: string; at: number }[]);

async function skipAndWaitForTheTotal(page: Page, final: string) {
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  await expect.poll(async () => (await totals(page)).at(-1)?.text).toBe(final);
  await page.waitForTimeout(400);
}

test("a jackpot that lands marks its card as landed with a badge, and no other card", async ({ page }) => {
  await playClassic(page, bigWin);
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();

  const hit = page.locator(".prize.hit");
  await expect(hit).toHaveCount(1);
  await expect(hit).toContainText("Minor");
  await expect(hit.locator(".badge")).toHaveText("1 landed");
  await expect(page.getByRole("listitem", { name: /^Minor, 20.00 credits, 20 times the bet, 1 landed$/ })).toBeVisible();
  await expect(page.locator(".prize:not(.hit) .badge")).toHaveCount(0);
  expect(await hit.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("2px");
});

test("a jackpot pops in on the spin that lands it", async ({ page }) => {
  await playClassic(page, bigWin);

  await expect(page.locator(".prize.hit")).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator(".prize.hit")).toHaveClass(/anim-in/);
  await expect.poll(() => page.evaluate(() => document.getAnimations().some((animation) => (animation as CSSAnimation).animationName === "tile-in"))).toBe(true);
});

test("a round of ten times the bet or more says Big win, and a smaller one does not", async ({ page }) => {
  await playClassic(page, bigWin);
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  await expect(page.locator(".result-plate").getByText("Big win")).toBeVisible();
  await expect(page.getByTestId("win")).toHaveText("21.65");

  // The next round takes seed 155, a Classic round that pays nothing.
  await page.getByRole("button", { name: "Dive again" }).click();
  await page.keyboard.press("s");
  await expect(page.getByTestId("win")).toHaveText("0.00");
  await expect(page.locator(".result-plate").getByText("Big win")).toHaveCount(0);
});

test("a round under ten times the bet has no Big win line", async ({ page }) => {
  await playClassic(page, smallWin);
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();

  await expect(page.getByTestId("win")).toHaveText("2.50");
  await expect(page.locator(".result-plate").getByText("Big win")).toHaveCount(0);
});

test("the board total counts up to its new value over about 300 ms", async ({ page }) => {
  await watchTotal(page);
  await playClassic(page, smallWin);
  await skipAndWaitForTheTotal(page, "2.50");

  const seen = await totals(page);
  const values = seen.map(({ text }) => Number(text));
  expect(seen[0].text).toBe("0.00");
  expect(seen.length).toBeGreaterThan(4);
  expect(values).toEqual([...values].sort((a, b) => a - b));
  const span = seen.at(-1)!.at - seen[1].at;
  expect(span).toBeGreaterThan(150);
  expect(span).toBeLessThan(600);
});

test("a new crate pops in", async ({ page }) => {
  await playClassic(page, smallWin);

  await expect(page.locator(".tile-crate .coin.anim-in").first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.getAnimations().some((animation) => (animation as CSSAnimation).animationName === "tile-in"))).toBe(true);
});

test.describe("with prefers-reduced-motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the board total jumps straight to its value and nothing pops", async ({ page }) => {
    await watchAnimations(page);
    await watchTotal(page);
    await playClassic(page, smallWin);
    // The empty board's 0.00 is on screen for a frame or two, so the test waits to have seen it, and the skip cannot beat the sampler.
    await expect.poll(async () => (await totals(page)).map(({ text }) => text)).toEqual(["0.00"]);
    await skipAndWaitForTheTotal(page, "2.50");

    expect((await totals(page)).map(({ text }) => text)).toEqual(["0.00", "2.50"]);
    await expect(page.locator(".anim-in, .anim-fly")).toHaveCount(0);
    expect(await sawAnimation(page)).toBe(false);
  });

  test("a jackpot still shows as landed, with no pop", async ({ page }) => {
    await watchAnimations(page);
    await playClassic(page, bigWin);
    await page.keyboard.press("s");
    await expect(summary(page)).toBeVisible();

    await expect(page.locator(".prize.hit .badge")).toHaveText("1 landed");
    await expect(page.locator(".result-plate").getByText("Big win")).toBeVisible();
    await expect(page.locator(".anim-in, .anim-fly")).toHaveCount(0);
    expect(await sawAnimation(page)).toBe(false);
  });
});

test("the in-game toggle also makes the board total jump", async ({ page }) => {
  await watchTotal(page);
  await open(page, `/?seed=${smallWin}`);
  await page.getByLabel("Reduce motion").check();
  await diveButton(page).click();
  await skipAndWaitForTheTotal(page, "2.50");

  expect((await totals(page)).map(({ text }) => text)).toEqual(["0.00", "2.50"]);
});
