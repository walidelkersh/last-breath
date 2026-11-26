import { expect, test, type Locator, type Page } from "@playwright/test";
import { diveButton, open, summary } from "./play";

// Each seed gives its dive the tallest screen it can show. Seed 154 is a Classic round that lands a Minor and
// pays 21.65 times the bet. Seed 4 is a Tank round with two air tanks on the first spin, so the clock has two lines.
const rounds = [
  { name: "Classic", key: "1", seed: 154 },
  { name: "Drift", key: "2", seed: 11 },
  { name: "Tank", key: "3", seed: 4 },
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

async function playToTheEnd(page: Page, round: (typeof rounds)[number]) {
  await open(page, `/?seed=${round.seed}`);
  await page.keyboard.press(round.key);
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 700 }]) {
  test.describe(`${viewport.width} by ${viewport.height}`, () => {
    test.use({ viewport });

    for (const round of rounds) {
      test(`${round.name}: the end summary and both buttons are on screen and the page does not scroll`, async ({ page }) => {
        await playToTheEnd(page, round);

        await expectInside(page, summary(page), "the summary");
        await expectInside(page, page.getByRole("button", { name: "Dive again" }), "Dive again");
        await expectInside(page, page.getByRole("button", { name: "Change dive" }), "Change dive");
        const { scrollHeight, innerHeight } = await page.evaluate(() => ({ scrollHeight: document.documentElement.scrollHeight, innerHeight }));
        expect(scrollHeight).toBeLessThanOrEqual(innerHeight);
      });
    }
  });
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Skip stays in view while a round plays, and Dive again and Change dive stay in view at the end", async ({ page }) => {
    await open(page, "/?seed=4");
    await page.keyboard.press("3");
    await diveButton(page).click();
    await expectInside(page, page.getByRole("button", { name: "Skip" }), "Skip");

    await page.keyboard.press("s");
    await expect(summary(page)).toBeVisible();
    await page.evaluate(() => scrollTo(0, 0));
    await expectInside(page, page.getByRole("button", { name: "Dive again" }), "Dive again");
    await expectInside(page, page.getByRole("button", { name: "Change dive" }), "Change dive");
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await expectInside(page, page.getByRole("button", { name: "Dive again" }), "Dive again at the foot of the page");
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

test("the status column names the spin and what it landed", async ({ page }) => {
  await open(page, "/?seed=4");
  await page.keyboard.press("3");
  await diveButton(page).click();

  const landing = page.locator(".landing");
  await expect(landing).toContainText("Spin 0");
  await expect(landing).toContainText("Nothing has landed yet.");
  await expect(landing).toContainText("Spin 1");
  await expect(landing).toContainText("Air tanks, plus 1 and plus 2 breaths.");
  await expect(landing).not.toContainText("Nothing landed");
});
