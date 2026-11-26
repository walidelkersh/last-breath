import { expect, test, type Locator, type Page } from "@playwright/test";
import { diveButton, open, summary } from "./play";

// Each seed gives its dive the tallest screen it can show. Seed 154 is a Classic round that lands a Minor and
// pays 21.65 times the bet. Seed 4 is a Tank round with two air tanks on the first spin, so the clock has two lines.
const rounds = [
  { name: "Classic", key: "1", seed: 154 },
  { name: "Drift", key: "2", seed: 11 },
  { name: "Tank", key: "3", seed: 4 },
];

const screens = [
  { width: 1024, height: 700 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

async function expectInside(page: Page, target: Locator, what: string) {
  const box = await target.boundingBox();
  const view = page.viewportSize()!;
  expect(box, `${what} is on the page`).not.toBeNull();
  expect(box!.x, `${what} starts inside the left edge`).toBeGreaterThanOrEqual(0);
  expect(box!.y, `${what} starts inside the top edge`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${what} ends inside the right edge`).toBeLessThanOrEqual(view.width);
  expect(box!.y + box!.height, `${what} ends inside the bottom edge`).toBeLessThanOrEqual(view.height);
}

// Nothing may run under the footer and the page must not scroll, so the stage fills the height and no more.
async function expectTheStageToFit(page: Page) {
  const fit = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight,
    stageBottom: document.querySelector(".stage")!.getBoundingClientRect().bottom,
    sideBottom: document.querySelector(".side")!.getBoundingClientRect().bottom,
    footerTop: document.querySelector("footer")!.getBoundingClientRect().top,
  }));
  expect(fit.scrollHeight, "the page does not scroll").toBeLessThanOrEqual(fit.innerHeight);
  expect(fit.stageBottom, "the stage ends above the footer").toBeLessThanOrEqual(fit.footerTop);
  expect(fit.sideBottom, "the side panel ends above the footer").toBeLessThanOrEqual(fit.footerTop);
}

async function playToTheEnd(page: Page, round: (typeof rounds)[number]) {
  await open(page, `/?seed=${round.seed}`);
  await page.keyboard.press(round.key);
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
}

for (const viewport of screens) {
  test.describe(`${viewport.width} by ${viewport.height}`, () => {
    test.use({ viewport });

    for (const round of rounds) {
      test(`${round.name}: the end summary and both buttons are on screen and the page does not scroll`, async ({ page }) => {
        await playToTheEnd(page, round);

        await expectInside(page, summary(page), "the summary");
        await expectInside(page, page.getByRole("button", { name: "Dive again" }), "Dive again");
        await expectInside(page, page.getByRole("button", { name: "Change dive" }), "Change dive");
        await expectTheStageToFit(page);
      });
    }

    test("a round in play fits too, with the tallest clock the game has", async ({ page }) => {
      await open(page, "/?seed=4");
      await page.keyboard.press("3");
      await diveButton(page).click();
      await expect(page.locator(".tile-tank")).toHaveCount(2);

      await expectInside(page, page.getByRole("button", { name: "Skip" }), "Skip");
      await expectTheStageToFit(page);
    });
  });
}

test("the board grows with the window: at 1920 by 1080 it is more than 55% wider than at 1280 by 800", async ({ browser }) => {
  const widthAt = async (width: number, height: number) => {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await open(page, "/?seed=4");
    await page.keyboard.press("3");
    await diveButton(page).click();
    const box = (await page.locator(".board").boundingBox())!;
    await context.close();
    return box.width;
  };
  const small = await widthAt(1280, 800);
  const large = await widthAt(1920, 1080);
  const huge = await widthAt(2560, 1440);

  expect(small).toBeGreaterThan(690);
  expect(large).toBeGreaterThan(small * 1.55);
  expect(huge).toBeGreaterThan(large);
});

test("the tiles, their plates and the outlines grow with the board", async ({ browser }) => {
  const measure = async (width: number, height: number) => {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await open(page, "/?seed=1");
    await diveButton(page).click();
    await expect(page.locator(".tile-crate").first()).toBeVisible();
    const result = await page.evaluate(() => {
      const tile = document.querySelector(".tile-crate")!;
      return {
        tile: tile.getBoundingClientRect().width,
        text: parseFloat(getComputedStyle(tile.querySelector(".tile-value")!).fontSize),
        outline: parseFloat(getComputedStyle(tile.querySelector(".tile-plate")!).borderTopWidth),
      };
    });
    await context.close();
    return result;
  };
  const small = await measure(1280, 800);
  const large = await measure(2560, 1440);

  expect(large.tile).toBeGreaterThan(small.tile * 1.8);
  expect(large.text).toBeGreaterThan(small.text * 1.5);
  expect(large.outline).toBeGreaterThan(small.outline * 1.5);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Skip stays in view while a round plays, and Dive again and Change dive stay in view at the end", async ({ page }) => {
    await open(page, "/?seed=4");
    await page.keyboard.press("3");
    await diveButton(page).click();
    await expectInside(page, page.getByRole("button", { name: "Skip" }), "Skip");

    await page.keyboard.press("s");
    await expect(summary(page)).toBeFocused();
    const shown = (await summary(page).boundingBox())!;
    const again = (await page.getByRole("button", { name: "Dive again" }).boundingBox())!;
    expect(shown.y + shown.height, "the summary ends above the bar").toBeLessThanOrEqual(again.y);
    await page.evaluate(() => scrollTo(0, 0));
    await expectInside(page, page.getByRole("button", { name: "Dive again" }), "Dive again");
    await expectInside(page, page.getByRole("button", { name: "Change dive" }), "Change dive");
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await expectInside(page, page.getByRole("button", { name: "Dive again" }), "Dive again at the foot of the page");
  });

  test("a round starts at the top of the page even when the selection screen was scrolled", async ({ page }) => {
    await open(page);
    await page.evaluate(() => scrollTo(0, 800));
    await diveButton(page).click();

    await expect(page.getByRole("button", { name: "Skip" })).toBeFocused();
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });

  test("the header is two short lines: the title and Math, then the balance and Reset balance", async ({ page }) => {
    await open(page);
    const box = async (target: Locator) => (await target.boundingBox())!;
    const middle = (b: { y: number; height: number }) => b.y + b.height / 2;
    const title = await box(page.getByRole("heading", { name: "Last Breath" }));
    const math = await box(page.getByRole("button", { name: "Math" }));
    const balance = await box(page.locator(".balance"));
    const reset = await box(page.getByRole("button", { name: "Reset balance" }));

    expect(Math.abs(middle(title) - middle(math))).toBeLessThan(10);
    expect(Math.abs(middle(balance) - middle(reset))).toBeLessThan(10);
    expect(balance.y).toBeGreaterThan(title.y + title.height - 4);
    expect((await box(page.locator("header"))).height).toBeLessThan(125);
  });

  test("a tile shows only its value on the plate, and the word stays in its name and tooltip", async ({ page }) => {
    await open(page, "/?seed=1");
    await diveButton(page).click();
    const tile = page.locator(".tile-crate").first();
    await expect(tile).toBeVisible();

    await expect(tile.locator(".tile-label")).toBeHidden();
    await expect(tile.locator(".tile-value")).toBeVisible();
    await expect(tile).toHaveAttribute("aria-label", /: Crate, \d+\.\d\d credits, [\d.]+ times the bet$/);
    await expect(tile).toHaveAttribute("title", /^[\d.]+× bet$/);
  });
});

test("the head counts the spin and the ticker names what each spin landed, newest first", async ({ page }) => {
  await open(page, "/?seed=4");
  await page.keyboard.press("3");
  await diveButton(page).click();

  await expect(page.locator(".spin")).toHaveText("Spin 0");
  await expect(page.locator(".ticker-empty")).toHaveText("No spin yet.");
  await expect(page.locator(".spin")).toHaveText("Spin 1");
  const newest = page.locator(".ticker li").first();
  await expect(newest).toContainText("Spin 1");
  await expect(newest).toContainText("Air tanks, plus 1 and plus 2 breaths");
  await expect(newest).not.toContainText("Nothing landed");
  await expect(page.locator("[aria-live] .ticker")).toHaveCount(0);
});

test("after a skip the ticker still holds every spin, newest on top, and shows only whole rows", async ({ page }) => {
  await playToTheEnd(page, rounds[0]);

  const items = page.locator(".ticker li");
  await expect(items).toHaveCount(18);
  await expect(items.first()).toContainText("Spin 18");
  await expect(items.last()).toContainText("Spin 1");
  const rows = await page.evaluate(() => {
    const ticker = document.querySelector(".ticker")!.getBoundingClientRect();
    const shown = [...document.querySelectorAll(".ticker li")].filter((row) => row.getBoundingClientRect().left < ticker.right - 2);
    return { count: shown.length, whole: shown.every((row) => row.getBoundingClientRect().bottom <= ticker.bottom + 1) };
  });
  expect(rows.count).toBeGreaterThan(0);
  expect(rows.whole).toBe(true);
});
