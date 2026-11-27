import { expect, test } from "@playwright/test";
import { diveButton, open, summary } from "./play";

// Seed 1 is a Classic round that puts a crate on the board in its first spins and pays 2.5 times the bet.

test("every cell is a well, a landed coin sits in it, and a plate shows only the value", async ({ page }) => {
  await open(page, "/?seed=1");
  await diveButton(page).click();
  await expect(page.locator(".tile-crate .coin").first()).toBeVisible();

  const cells = await page.evaluate(() =>
    [...document.querySelectorAll(".tile")].map((tile) => {
      const well = tile.querySelector(".well use")?.getAttribute("href") ?? null;
      const coin = tile.querySelector(".coin");
      const art = coin?.querySelector(".art");
      const own = tile.getBoundingClientRect();
      const inside = art ? art.getBoundingClientRect() : null;
      return {
        well,
        order: coin ? [...tile.children].indexOf(tile.querySelector(".well")!) < [...tile.children].indexOf(coin) : true,
        within: inside ? inside.left >= own.left - 1 && inside.right <= own.right + 1 && inside.top >= own.top - 1 && inside.bottom <= own.bottom + 1 : true,
        plate: tile.querySelector(".tile-plate")?.textContent?.trim() ?? null,
        name: tile.getAttribute("aria-label"),
      };
    }),
  );

  expect(cells).toHaveLength(15);
  for (const cell of cells) {
    expect(cell.well, "a well under the cell").toMatch(/^#well-[abc]$/);
    expect(cell.order, "the coin comes after the well").toBe(true);
    expect(cell.within, "the coin is inside the cell").toBe(true);
    if (cell.plate !== null) expect(cell.plate).toMatch(/^[+\d.,]+$/);
  }
  expect(cells.some((cell) => cell.plate !== null)).toBe(true);
  expect(cells.find((cell) => cell.plate !== null)!.name).toMatch(/: Crate, \d+\.\d\d credits, [\d.]+ times the bet$/);
  expect(await page.locator(".tile-label").count()).toBe(0);
});

test("a well has no pill and no side glint, and it is dimmed at the end of a round", async ({ page }) => {
  // The files are read straight from the server. Opening the page first only to leave it at once could leave WebKit with a game that never started.
  for (const variant of ["a", "b", "c"]) {
    const art = await page.request.get(`art/well-${variant}.svg`);
    expect(await art.text(), `well ${variant} has no glint`).not.toContain('<path class="g"');
  }

  await open(page, "/?seed=1");
  await diveButton(page).click();
  const live = await page.locator(".tile-empty").first().evaluate((tile) => ({ after: getComputedStyle(tile, "::after").content, opacity: getComputedStyle(tile.querySelector(".well")!).opacity }));
  expect(live).toEqual({ after: "none", opacity: "1" });

  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  await expect(page.locator(".tile-empty .well").first()).toHaveCSS("opacity", "0.4");
  await expect(page.locator(".tile-drawn .well").first()).toHaveCSS("opacity", "1");
});
