import { expect, test, type Locator, type Page } from "@playwright/test";
import { atRest, diveButton, open, summary } from "./play";

// Each seed gives its dive the tallest screen it can show. Seed 154 is a Classic round that lands a Minor and
// pays 21.65 times the bet. Seed 4 is a Tank round with two air tanks on the first spin, so the clock has two lines.
const rounds = [
  { name: "Classic", key: "1", seed: 154 },
  { name: "Drift", key: "2", seed: 11 },
  { name: "Tank", key: "3", seed: 4 },
];

// The last of these is a phone on its side, which also gets the stage, with a smaller board.
const screens = [
  { width: 667, height: 375 },
  { width: 844, height: 390 },
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
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth,
    innerHeight,
    stageTop: document.querySelector(".stage")!.getBoundingClientRect().top,
    stageBottom: document.querySelector(".stage")!.getBoundingClientRect().bottom,
    headerBottom: document.querySelector("header")!.getBoundingClientRect().bottom,
    footerTop: document.querySelector("footer")!.getBoundingClientRect().top,
  }));
  expect(fit.scrollHeight, "the page does not scroll").toBeLessThanOrEqual(fit.innerHeight);
  expect(fit.scrollWidth, "the page does not scroll sideways").toBeLessThanOrEqual(fit.innerWidth);
  expect(fit.stageTop, "the stage starts below the header").toBeGreaterThanOrEqual(fit.headerBottom);
  expect(fit.stageBottom, "the stage ends above the footer").toBeLessThanOrEqual(fit.footerTop);
}

async function playToTheEnd(page: Page, round: (typeof rounds)[number], maths = false) {
  await open(page, `/?seed=${round.seed}`, { maths });
  await page.keyboard.press(round.key);
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  await atRest(page);
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
      await expect(page.getByTestId("gain")).toBeVisible();

      await expectInside(page, page.getByRole("button", { name: "Skip" }), "Skip");
      await expectTheStageToFit(page);
    });
  });
}

test("the board grows with the window: at 1920 by 1080 it is more than 35% wider than at 1280 by 800", async ({ browser }) => {
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
  expect(large).toBeGreaterThan(small * 1.35);
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
        tile: (tile as HTMLElement).offsetWidth,
        text: parseFloat(getComputedStyle(tile.querySelector(".tile-value")!).fontSize),
        outline: parseFloat(getComputedStyle(tile.querySelector(".tile-plate")!).borderTopWidth),
        grain: parseFloat(getComputedStyle(tile).getPropertyValue("--grain")),
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
  expect(large.grain).toBe(1);
  expect(small.grain, "a smaller tile quiets the wood grain").toBeLessThan(large.grain);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Skip stays in view while a round plays, and Dive again and Change dive are in view at the end, with nothing to scroll", async ({ page }) => {
    await open(page, "/?seed=4");
    await page.keyboard.press("3");
    await diveButton(page).click();
    await expectInside(page, page.getByRole("button", { name: "Skip" }), "Skip");

    await page.keyboard.press("s");
    await expect(summary(page)).toBeFocused();
    await atRest(page);
    await expectInside(page, page.getByRole("button", { name: "Dive again" }), "Dive again");
    await expectInside(page, page.getByRole("button", { name: "Change dive" }), "Change dive");
    expect(await page.evaluate(() => document.querySelector("main")!.scrollHeight <= document.querySelector("main")!.clientHeight + 1)).toBe(true);
  });

  test("at the end the plate takes focus without a jump, draws no ring, and the whole board is in view", async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
      await page.setViewportSize(viewport);
      await open(page, "/?seed=154");
      await diveButton(page).click();
      await page.keyboard.press("s");
      await expect(summary(page)).toBeFocused();

      const found = await page.evaluate(() => {
        const board = document.querySelector(".board")!.getBoundingClientRect();
        return { top: board.top, bottom: board.bottom, header: document.querySelector("header")!.getBoundingClientRect().bottom, footer: document.querySelector("footer")!.getBoundingClientRect().top, ring: getComputedStyle(document.querySelector(".summary")!).outlineStyle, scrolled: scrollY };
      });
      const label = `${viewport.width} by ${viewport.height}`;
      expect(found.ring, label).toBe("none");
      expect(found.scrolled, label).toBe(0);
      expect(found.top, `${label}: the top of the board is not cut off`).toBeGreaterThanOrEqual(found.header);
      expect(found.bottom, `${label}: the foot of the board is in view`).toBeLessThanOrEqual(found.footer);
    }
  });

  test("in the maths view a round that ended while the panel under the board was scrolled brings the board back whole", async ({ page }) => {
    await open(page, "/?seed=154", { maths: true });
    await diveButton(page).click();
    await page.keyboard.press("s");
    await expect(summary(page)).toBeFocused();
    await page.getByRole("button", { name: "Dive again" }).click();
    await page.evaluate(() => document.querySelector("main")!.scrollTo(0, document.querySelector("main")!.scrollHeight));
    await page.keyboard.press("s");
    await expect(summary(page)).toBeFocused();

    const board = await page.evaluate(() => ({ top: document.querySelector(".board")!.getBoundingClientRect().top, header: document.querySelector("header")!.getBoundingClientRect().bottom }));
    expect(board.top).toBeGreaterThanOrEqual(board.header - 1);
  });

  test("a round starts at the top even when the selection was scrolled", async ({ page }) => {
    await open(page, "/", { maths: true });
    await page.evaluate(() => document.querySelector("main")!.scrollTo(0, 800));
    await diveButton(page).click();

    await expect(page.getByRole("button", { name: "Skip" })).toBeFocused();
    expect(await page.evaluate(() => [scrollY, document.querySelector("main")!.scrollTop])).toEqual([0, 0]);
  });

  test("the header is one row, with the title, the balance and Math, and Reset balance is in the footer", async ({ page }) => {
    await open(page);
    const box = async (target: Locator) => (await target.boundingBox())!;
    const middle = (b: { y: number; height: number }) => b.y + b.height / 2;
    const title = await box(page.getByRole("heading", { name: "Last Breath" }));
    const balance = await box(page.locator(".balance"));
    const math = await box(page.getByRole("button", { name: "Math" }));

    expect(Math.abs(middle(title) - middle(balance))).toBeLessThan(10);
    expect(Math.abs(middle(title) - middle(math))).toBeLessThan(10);
    const switchBox = await box(page.getByRole("switch", { name: "Show the maths" }));
    expect(Math.abs(middle(title) - middle(switchBox))).toBeLessThan(10);
    expect(balance.x + balance.width).toBeLessThanOrEqual(switchBox.x);
    expect(switchBox.x + switchBox.width).toBeLessThanOrEqual(math.x);
    expect((await box(page.locator("header"))).height).toBeLessThan(75);
    await expect(page.locator("footer").getByRole("button", { name: "Reset balance" })).toBeVisible();
    await expect(page.locator("header").getByRole("button", { name: "Reset balance" })).toHaveCount(0);
  });

  test("a tile shows only its value on the plate, and the word stays in its name and tooltip", async ({ page }) => {
    await open(page, "/?seed=1");
    await diveButton(page).click();
    const tile = page.locator(".tile-crate").first();
    await expect(tile).toBeVisible();

    await expect(tile.locator(".tile-label")).toHaveCount(0);
    await expect(tile.locator(".tile-value")).toBeVisible();
    await expect(tile).toHaveAttribute("aria-label", /: Crate, \d+\.\d\d credits, [\d.]+ times the bet$/);
    await expect(tile).toHaveAttribute("title", /^[\d.]+× bet$/);
    expect(await tile.evaluate((element) => getComputedStyle(element).getPropertyValue("--grain").trim())).toBe("0.3");
  });
});

test("in the maths view the side panel counts the spin and the ticker names what each spin landed, newest first", async ({ page }) => {
  await open(page, "/?seed=4", { maths: true });
  await page.keyboard.press("3");
  await diveButton(page).click();

  await expect(page.locator(".spin")).toHaveText("Spin 0");
  await expect(page.locator(".ticker-empty")).toHaveText("No spin yet.");
  await expect(page.locator(".spin")).toHaveText("Spin 1");
  const newest = page.locator(".ticker li").first();
  await expect(newest).toContainText("Spin 1");
  await expect(newest).toContainText("Air tanks, +1 and +2 breaths");
  await expect(newest).not.toContainText("Nothing landed");
  await expect(page.locator("[aria-live] .ticker")).toHaveCount(0);
});

// The ticker lists only what landed, and folds a run of empty spins into one row. Seed 33 is a sparse Classic round with long runs of nothing.
// The ticker is part of the maths view.
test.describe("the ticker", () => {
  const rows = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll(".ticker li:not(.ticker-empty)")].map((row) => ({
        label: row.querySelector(".ticker-spin")!.textContent!.trim(),
        what: row.querySelector(".ticker-what")!.textContent!.trim(),
      })),
    );

  test("has one row for each spin that landed something and one for each run of empty spins", async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, "/?seed=33", { maths: true });
    await page.keyboard.press("1");
    await diveButton(page).click();
    await expect(page.locator(".spin")).toHaveText(/^Spin ([6-9]|\d\d)$/, { timeout: 30_000 });

    const list = await rows(page);
    const spins = Number((await page.locator(".spin").textContent())!.replace("Spin ", ""));
    expect(list.length).toBeLessThan(spins);
    for (let index = 1; index < list.length; index++)
      expect(list[index].what === "Nothing landed" && list[index - 1].what === "Nothing landed", `rows ${index - 1} and ${index} are both empty runs`).toBe(false);
    // Every spin is in some row: the rows cover 1 to the spin on show, once each.
    const covered: number[] = [];
    for (const row of list) {
      const match = /^Spins? (\d+)(?: to (\d+))?$/.exec(row.label)!;
      for (let n = Number(match[1]); n <= Number(match[2] ?? match[1]); n++) covered.push(n);
    }
    expect(covered.sort((a, b) => a - b)).toEqual(Array.from({ length: spins }, (_, index) => index + 1));
    expect(list.filter((row) => row.what === "Nothing landed").some((row) => row.label.includes(" to "))).toBe(true);
    expect(list.filter((row) => row.what !== "Nothing landed").every((row) => /^Spin \d+$/.test(row.label))).toBe(true);
  });

  test("shows no half row when the window is short", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1024, height: 700 });
    await open(page, "/?seed=33", { maths: true });
    await page.keyboard.press("1");
    await diveButton(page).click();
    await expect(page.locator(".spin")).toHaveText(/^Spin ([8-9]|\d\d)$/, { timeout: 30_000 });

    const shown = await page.evaluate(() => {
      const ticker = document.querySelector(".ticker")!.getBoundingClientRect();
      const visible = [...document.querySelectorAll<HTMLElement>(".ticker li")].filter((row) => row.offsetParent !== null && row.getBoundingClientRect().left < ticker.right - 2);
      return visible.every((row) => row.getBoundingClientRect().bottom <= ticker.bottom + 1);
    });
    expect(shown).toBe(true);
  });

  test("after the round it folds into a line, closed, that says how many spins and opens on request", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await playToTheEnd(page, rounds[0], true);

    const log = page.locator(".spinlog");
    await expect(log.locator("summary")).toHaveText("Spin by spin (18)");
    expect(await log.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(false);
    await expect(log.locator(".ticker")).toBeHidden();
    await expect(page.locator("main .ticker")).toHaveCount(1);

    await log.locator("summary").click();
    await expect(log.locator(".ticker")).toBeVisible();
    const list = await rows(page);
    expect(list.length).toBeLessThan(18);
    expect(list[0].label).toMatch(/^Spins? 1[0-8]/);
    // The panel keeps its actions at the foot and the opened list scrolls inside it.
    const fit = await page.evaluate(() => ({
      actions: document.querySelector(".actions")!.getBoundingClientRect().bottom,
      footer: document.querySelector("footer")!.getBoundingClientRect().top,
      scroll: document.documentElement.scrollHeight <= innerHeight,
    }));
    expect(fit.actions).toBeLessThanOrEqual(fit.footer);
    expect(fit.scroll).toBe(true);
  });
});

test("after the round the win is on the plate and the console total is gone, and the maths view keeps the counts beside the board", async ({ page }) => {
  await playToTheEnd(page, rounds[0], true);

  await expect(page.locator(".result-plate").getByTestId("win")).toHaveText("21.65");
  await expect(page.locator(".total")).toHaveCount(0);
  await expect(summary(page).getByText("Spins", { exact: true })).toHaveCount(0);
  await expect(page.locator(".round-facts").getByText("Spins", { exact: true })).toBeVisible();
  await expect(page.locator(".round-facts").getByText("Crates", { exact: true })).toBeVisible();
});

test("the list on the page writes a tank as +1 and +2 and the live region says plus 1 and plus 2", async ({ page }) => {
  await open(page, "/?seed=4", { maths: true });
  await page.keyboard.press("3");
  await diveButton(page).click();

  await expect(page.locator(".ticker li").first()).toContainText("Air tanks, +1 and +2 breaths");
  await expect(page.locator("[aria-live]")).toContainText("Air tanks, plus 1 and plus 2 breaths");
  expect(await page.locator(".ticker").textContent()).not.toContain("plus");
});
