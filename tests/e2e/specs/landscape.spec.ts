import { expect, test } from "@playwright/test";
import { diveButton, open } from "./play";

// The Last breath tab grows with the board, and a phone on its side leaves room above the board for it and at the sides of the bet chips.

test("the Last breath tab grows with the board, as the plates do", async ({ page }) => {
  const size = async (viewport: { width: number; height: number }) => {
    await page.setViewportSize(viewport);
    await open(page, "/?seed=33");
    await page.keyboard.press("1");
    await diveButton(page).click();
    await expect(page.locator(".breath-band")).toBeVisible({ timeout: 30_000 });
    return page.evaluate(() => ({ tab: parseFloat(getComputedStyle(document.querySelector(".breath-band")!).fontSize), plate: parseFloat(getComputedStyle(document.querySelector(".tile-value")!).fontSize) }));
  };
  const small = await size({ width: 1024, height: 700 });
  const large = await size({ width: 2560, height: 1440 });

  expect(large.tab).toBeGreaterThan(small.tab * 1.4);
  expect(large.tab).toBeGreaterThanOrEqual(16);
  expect(large.tab / large.plate, "in proportion to the plates").toBeGreaterThan(0.4);
});

for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test.describe(`a phone on its side, ${viewport.width} by ${viewport.height}`, () => {
    test.use({ viewport });

    test("the Last breath tab and the top of the board are clear of the header rule", async ({ page }) => {
      test.setTimeout(60_000);
      await open(page, "/?seed=33");
      await page.keyboard.press("1");
      await diveButton(page).click();
      await expect(page.locator(".breath-band")).toBeVisible({ timeout: 30_000 });

      const found = await page.evaluate(() => ({
        header: document.querySelector("header")!.getBoundingClientRect().bottom,
        tab: document.querySelector(".breath-band")!.getBoundingClientRect().top,
        board: document.querySelector(".board")!.getBoundingClientRect().top,
        scroll: document.documentElement.scrollHeight <= innerHeight,
        stage: document.querySelector(".stage")!.getBoundingClientRect().bottom,
        footer: document.querySelector("footer")!.getBoundingClientRect().top,
      }));
      expect(found.tab - found.header, "the tab is clear of the rule").toBeGreaterThanOrEqual(4);
      expect(found.board - found.header, "the board is clear of the rule").toBeGreaterThanOrEqual(8);
      expect(found.scroll).toBe(true);
      expect(found.stage).toBeLessThanOrEqual(found.footer);
    });

    test("every bet chip has room at its sides, 10.00 included", async ({ page }) => {
      await open(page);

      const chips = await page.evaluate(() =>
        [...document.querySelectorAll(".chip span")].map((chip) => {
          const range = document.createRange();
          range.selectNodeContents(chip);
          return { text: chip.textContent, side: (chip.getBoundingClientRect().width - range.getBoundingClientRect().width) / 2 };
        }),
      );
      expect(chips.map((chip) => chip.text)).toContain("10.00");
      for (const chip of chips) expect(chip.side, `${chip.text} has room at its sides`).toBeGreaterThanOrEqual(6);
    });
  });
}
