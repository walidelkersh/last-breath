import { expect, test, type Page } from "@playwright/test";
import { diveButton, open, summary } from "./play";

// The list of keys is a popover over the page, anchored above its control, so opening it never changes the height of the footer or the layout
// of the stage, which is sized from the footer. Seed 33 is a sparse Classic round that lasts long enough to open the list in the middle of it.

const geometry = (page: Page) =>
  page.evaluate(() => {
    // In the coordinates of the page, so that scrolling to reach a control does not count as a move.
    const place = (box: DOMRect) => ({ top: box.top + scrollY, bottom: box.bottom + scrollY, left: box.left + scrollX, right: box.right + scrollX, width: box.width, height: box.height });
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      return element ? place(element.getBoundingClientRect()) : null;
    };
    return {
      title: rect("h1.brand"),
      header: rect("header"),
      footer: rect("footer"),
      board: rect(".board"),
      prizes: rect(".prizes"),
      side: rect(".side"),
      actions: [...document.querySelectorAll(".board-foot .actions button")].map((button) => place(button.getBoundingClientRect())),
      hero: rect(".select h2"),
      cards: rect(".cards"),
      stake: rect(".stake"),
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });

const keys = (page: Page) => page.locator("details.keys");
const toggle = (page: Page) => keys(page).locator("summary");
const popover = (page: Page) => keys(page).locator("p");

async function popoverLooks(page: Page) {
  return page.evaluate(() => {
    const list = document.querySelector("details.keys p")!;
    const control = document.querySelector("details.keys summary")!.getBoundingClientRect();
    const box = list.getBoundingClientRect();
    const style = getComputedStyle(list);
    const probe = document.createElement("div");
    probe.style.width = "var(--measure)";
    list.parentElement!.append(probe);
    const measure = probe.getBoundingClientRect().width;
    probe.remove();
    return {
      position: style.position,
      zIndex: Number(style.zIndex),
      background: style.backgroundColor,
      border: style.borderTopWidth,
      radius: parseFloat(style.borderTopLeftRadius),
      inside: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
      above: box.bottom <= control.top,
      left: box.left,
      controlLeft: control.left,
      wide: box.width,
      measure,
    };
  });
}

// Nothing that belongs to the layout lies over anything else. The popover itself is meant to lie over the page, so it is not in the list.
function expectNoOverlap(found: Awaited<ReturnType<typeof geometry>>, label: string) {
  const { header, footer, board, prizes, side, actions } = found;
  if (board) {
    expect(board.top, `${label}: the board starts below the header`).toBeGreaterThanOrEqual(header!.bottom - 0.5);
    expect(prizes!.bottom, `${label}: the prizes end above the footer`).toBeLessThanOrEqual(footer!.top + 0.5);
    for (const button of actions) {
      expect(button.left, `${label}: a button is on the board`).toBeGreaterThanOrEqual(board.left - 0.5);
      expect(button.right, `${label}: a button is on the board`).toBeLessThanOrEqual(board.right + 0.5);
      expect(button.bottom, `${label}: a button is on the board`).toBeLessThanOrEqual(board.bottom + 0.5);
    }
    if (side) {
      expect(side.bottom, `${label}: the side panel ends above the footer`).toBeLessThanOrEqual(footer!.top + 0.5);
      expect(board.right, `${label}: the board is left of the side panel`).toBeLessThanOrEqual(side.left + 0.5);
    }
  }
}

for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test.describe(`${viewport.width} by ${viewport.height}`, () => {
    test.use({ viewport });

    test("on the selection screen the open list is a popover and moves nothing", async ({ page }) => {
      await open(page);
      const closed = await geometry(page);

      await toggle(page).click();
      await expect(popover(page)).toBeVisible();
      const opened = await geometry(page);
      expect(opened, "every box on the page stays where it was").toEqual(closed);

      const looks = await popoverLooks(page);
      expect(looks.position).toBe("absolute");
      expect(looks.zIndex).toBeGreaterThan(2);
      expect(looks.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(looks.border).toBe("1px");
      expect(looks.radius).toBeGreaterThan(0);
      expect(looks.inside, "the popover is on the screen").toBe(true);
      expect(looks.above, "the popover is above its control").toBe(true);
      expect(looks.wide).toBeLessThanOrEqual(looks.measure + 1);
    });

    for (const maths of [false, true]) test(`through a round in the ${maths ? "maths" : "player"} view, in the middle of it and at the end, the open list moves no part of the stage and nothing lies over anything`, async ({ page }) => {
      test.setTimeout(60_000);
      await open(page, "/?seed=33", { maths });
      await page.keyboard.press("1");
      await diveButton(page).click();
      await expect(page.locator("[aria-live]")).toHaveText(/^Spin [2-9]\./, { timeout: 15_000 });

      const middle = await geometry(page);
      expectNoOverlap(middle, "before");
      await toggle(page).click();
      await expect(popover(page)).toBeVisible();
      const middleOpen = await geometry(page);
      expect(middleOpen.board).toEqual(middle.board);
      expect(middleOpen.title).toEqual(middle.title);
      expect(middleOpen.prizes).toEqual(middle.prizes);
      expect(middleOpen.side).toEqual(middle.side);
      expect(middleOpen.footer).toEqual(middle.footer);
      expect(middleOpen.actions).toEqual(middle.actions);
      expectNoOverlap(middleOpen, "open in the middle");
      expect(middleOpen.scrollHeight, "the page does not scroll").toBeLessThanOrEqual(viewport.height);
      expect((await popoverLooks(page)).inside).toBe(true);

      await toggle(page).click();
      await page.keyboard.press("s");
      await expect(summary(page)).toBeVisible();
      await expect(page.locator(".result-plate")).toBeVisible();
      const end = await geometry(page);
      await toggle(page).click();
      await expect(popover(page)).toBeVisible();
      const endOpen = await geometry(page);
      expect(endOpen.board).toEqual(end.board);
      expect(endOpen.title).toEqual(end.title);
      expect(endOpen.side).toEqual(end.side);
      expect(endOpen.footer).toEqual(end.footer);
      expect(endOpen.actions, "Dive again and Change dive stay where they were").toEqual(end.actions);
      expect(endOpen.actions).toHaveLength(2);
      expectNoOverlap(endOpen, "open at the end");
      expect(endOpen.scrollHeight, "the page does not scroll").toBeLessThanOrEqual(viewport.height);
    });
  });
}

test("Escape closes the list and gives focus back to its control, a second click closes it, and a click anywhere else does", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page);

  await toggle(page).click();
  await expect(popover(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popover(page)).toBeHidden();
  await expect(toggle(page)).toBeFocused();

  await toggle(page).click();
  await expect(popover(page)).toBeVisible();
  await toggle(page).click();
  await expect(popover(page)).toBeHidden();

  await toggle(page).click();
  await expect(popover(page)).toBeVisible();
  await page.locator(".select h2").click();
  await expect(popover(page)).toBeHidden();
});

test("a click on Dive closes the list, so that it does not stay open over the round", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page);
  await toggle(page).click();
  await expect(popover(page)).toBeVisible();

  await diveButton(page).click();

  await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
  await expect(popover(page)).toBeHidden();
  expect(await keys(page).evaluate((element) => (element as HTMLDetailsElement).open)).toBe(false);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
  test(`on a phone, ${viewport.width} by ${viewport.height}, the list stays on the screen and does not make the page wider or the footer taller`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await toggle(page).scrollIntoViewIfNeeded();
    const closed = await geometry(page);

    await toggle(page).click();
    await expect(popover(page)).toBeVisible();
    const opened = await geometry(page);
    const looks = await popoverLooks(page);

    expect(opened.footer!.height, "the footer keeps its height").toBe(closed.footer!.height);
    expect(opened.scrollWidth).toBeLessThanOrEqual(viewport.width);
    expect(looks.left).toBeGreaterThanOrEqual(0);
    expect(looks.inside, "the popover is on the screen").toBe(true);
    expect(looks.above).toBe(true);
    await page.keyboard.press("Escape");
    await expect(popover(page)).toBeHidden();
  });
}

test("on a phone on its side there is no list of keys to open", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await open(page);

  await expect(keys(page)).toBeHidden();
  expect((await geometry(page)).scrollWidth).toBeLessThanOrEqual(844);
});
