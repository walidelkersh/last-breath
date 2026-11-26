import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The first frame is in index.html, so the page has something to show while the game downloads: the mark, an empty
// board and one line, in the colours of the page. It asks for nothing, and it does not move.

const html = readFileSync(join(__dirname, "..", "..", "..", "src", "LastBreath.Web", "wwwroot", "index.html"), "utf8");

const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
const contrast = (foreground: number[], background: number[]) => {
  const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};

test("the first frame in index.html is inline markup that asks for nothing", () => {
  const frame = html.slice(html.indexOf('<div id="app">'), html.indexOf('<div id="blazor-error-ui">'));
  expect(frame).toContain("Salvage what you can before your air runs out.");
  expect(frame.match(/<svg/g)).toHaveLength(2);
  expect(frame).not.toMatch(/<img|<image|<use|<script|<link|<iframe|src=|href=|url\(|@import|https?:|xlink/i);
  expect(frame).not.toMatch(/animation|<animate|<set/i);
  expect(Buffer.byteLength(frame)).toBeLessThan(2500);
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`before the game starts the page shows the mark, an empty board and the line, still and legible, in the ${colorScheme} theme`, async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (request) => requested.push(request.url()));
    // Nothing from the framework arrives, so the game never starts and the first frame stays.
    await page.route("**/_framework/**", (route) => route.abort());
    await page.emulateMedia({ colorScheme });
    await page.goto("/");

    const frame = page.locator("#app .first");
    await expect(frame).toBeVisible();
    await expect(frame.locator(".first-line")).toHaveText("Salvage what you can before your air runs out.");
    await expect(frame.locator(".first-name")).toHaveText("Last Breath");
    await expect(frame.locator("svg")).toHaveCount(2);
    await expect(frame.locator(".first-board .cells rect")).toHaveCount(15);
    await expect(frame.locator(".loading")).toHaveText("Loading the game");

    const found = await page.evaluate(() => {
      const bg = getComputedStyle(document.body).backgroundColor;
      const line = getComputedStyle(document.querySelector(".first-line")!).color;
      const loading = getComputedStyle(document.querySelector(".first .loading")!).color;
      const board = getComputedStyle(document.querySelector(".first-board .frame")!).fill;
      const outline = getComputedStyle(document.querySelector(".first-board .frame")!).stroke;
      const box = document.querySelector(".first-board")!.getBoundingClientRect();
      return { bg, line, loading, board, outline, boardWidth: box.width, animations: document.getAnimations().length, scrollWidth: document.documentElement.scrollWidth, innerWidth };
    });
    expect(found.animations, "nothing moves").toBe(0);
    expect(found.scrollWidth).toBeLessThanOrEqual(found.innerWidth);
    expect(found.boardWidth).toBeGreaterThan(150);
    expect(contrast(channels(found.line), channels(found.bg)), "the line").toBeGreaterThanOrEqual(4.5);
    expect(contrast(channels(found.loading), channels(found.bg)), "the loading line").toBeGreaterThanOrEqual(4.5);
    expect(contrast(channels(found.board), channels(found.bg)), "the board stands off the page").toBeGreaterThanOrEqual(1.3);

    const origin = new URL(page.url()).origin;
    const outside = requested.filter((url) => !url.startsWith(origin) && !url.startsWith("data:"));
    expect(outside, "nothing outside the site is asked for").toEqual([]);
  });
}
