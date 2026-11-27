import { expect, test, type Page } from "@playwright/test";
import { diveButton, open, summary } from "./play";

// After the round the spins fold into a line that opens on request. On the staged layout the opened log has the room: the strip, its legend and
// its note step aside, at least six rows show, and a shadow says that there are more. Seed 154 is a Classic round of 18 spins and 14 rows.
// The log is part of the maths view.

async function finish(page: Page) {
  await open(page, "/?seed=154", { maths: true });
  await page.keyboard.press("1");
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
}

const log = (page: Page) => page.locator(".spinlog");

const rows = (page: Page) =>
  page.evaluate(() => {
    const scroller = document.querySelector(".spinlog")!;
    const line = document.querySelector(".spinlog summary")!.getBoundingClientRect();
    const bottom = scroller.getBoundingClientRect().bottom;
    const all = [...scroller.querySelectorAll(".ticker li")];
    const whole = all.filter((row) => {
      const box = row.getBoundingClientRect();
      return box.top >= line.bottom - 1 && box.bottom <= bottom + 1;
    });
    return { all: all.length, whole: whole.length, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight };
  });

for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
  test(`at ${viewport.width} by ${viewport.height} the opened log shows at least six rows, the strip steps aside, and a shadow says there are more`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await finish(page);
    const bars = page.locator(".session .bars");
    await expect(bars).toBeVisible();

    await log(page).locator("summary").click();
    for (const part of [".bars", ".legend", ".note"]) await expect(page.locator(`.session ${part}`), `${part} steps aside`).toBeHidden();
    await expect(page.locator(".session .stats")).toBeVisible();

    const shown = await rows(page);
    expect(shown.whole, "rows in view").toBeGreaterThanOrEqual(6);
    expect(shown.all).toBe(14);
    if (viewport.height < 1000) {
      expect(shown.scrollHeight, "there are more rows than show").toBeGreaterThan(shown.clientHeight);
      const cue = await log(page).evaluate((element) => getComputedStyle(element).backgroundImage);
      expect(cue.match(/radial-gradient/g)?.length, "a shadow at each end").toBe(2);
    }

    // The line stays where it is while the rows scroll under it, and the actions stay at the foot.
    const before = await log(page).locator("summary").boundingBox();
    await log(page).evaluate((element) => (element.scrollTop = element.scrollHeight));
    const after = await log(page).locator("summary").boundingBox();
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(1.5);
    const fit = await page.evaluate(() => ({
      actions: document.querySelector(".actions")!.getBoundingClientRect().bottom,
      footer: document.querySelector("footer")!.getBoundingClientRect().top,
      scroll: document.documentElement.scrollHeight <= innerHeight,
    }));
    expect(fit.actions).toBeLessThanOrEqual(fit.footer);
    expect(fit.scroll).toBe(true);
    await expect(page.getByRole("button", { name: "Dive again" })).toBeInViewport();

    // Closed again, the strip is back.
    await log(page).locator("summary").click();
    await expect(bars).toBeVisible();
  });
}
