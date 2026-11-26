import { expect, test } from "@playwright/test";
import { diveButton, open } from "./play";

test("the art loads on a round with no failed request, and every symbol a tile uses is in the sprite", async ({ page }) => {
  const failed: string[] = [];
  page.on("requestfailed", (request) => failed.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(`${response.url()} ${response.status()}`);
  });

  await open(page, "/?seed=4");
  await page.keyboard.press("3");
  await diveButton(page).click();
  await expect(page.locator(".tile-tank")).toHaveCount(2);

  const { tiles, plates } = await page.evaluate(() => {
    const plates = [...document.querySelectorAll(".tile-tank .tile-plate")].map((plate) => plate.textContent!.replace(/\s+/g, " ").trim());
    const targets = [...document.querySelectorAll<SVGUseElement>(".board use")].map((use) => use.getAttribute("href")!);
    const tiles = targets.map((href) => {
      const symbol = document.querySelector(`symbol${href}`);
      return { href, drawn: symbol !== null && symbol.querySelectorAll("path").length > 0 };
    });
    return { tiles, plates };
  });

  expect(failed).toEqual([]);
  expect(tiles.map((tile) => tile.href)).toContain("#panel");
  expect(tiles.map((tile) => tile.href)).toContain("#air-tank");
  expect(tiles.filter((tile) => tile.href.startsWith("#well-")).length).toBeGreaterThan(0);
  expect(tiles.every((tile) => tile.drawn)).toBe(true);
  expect(plates).toEqual(["Air +1", "Air +2"]);
});

test("the sprite follows the theme through the page's variables", async ({ page }) => {
  const plate = async (colorScheme: "dark" | "light") => {
    await page.emulateMedia({ colorScheme });
    return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--art-plate"));
  };
  await open(page);
  await page.waitForFunction(() => document.querySelector("symbol#crate-low") !== null);
  expect(await plate("dark")).not.toEqual(await plate("light"));
});
