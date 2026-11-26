import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { diveButton, open, summary } from "./play";

// Seeds, found with "lab play": Classic 154 lands a Minor and returns 21.65 times the bet, Classic 1 returns 2.5,
// and Classic 2 returns nothing. Drift 11 and Tank 4 are the seeds the other specs use for those dives.

const reports = join(__dirname, "..", "..", "..", "reports");
const chances = (slug: string) => JSON.parse(readFileSync(join(reports, `solve-${slug}.json`), "utf8")).final_crate_probabilities as number[];

// The same wording as the page, written again from the rule: a whole number below ten, two significant digits from ten up.
function rounded(every: number) {
  const scale = every < 10 ? 1 : 10 ** (Math.floor(Math.log10(every)) - 1);
  return (Math.round(every / scale) * scale).toLocaleString("en-US");
}

async function finish(page: Page, seed: number, key = "1") {
  await open(page, `/?seed=${seed}`);
  await page.keyboard.press(key);
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
}

const plate = (page: Page) => page.locator(".board .result-plate");

test("a Big win puts the win, the multiple and Big win on the board in the display face", async ({ page }) => {
  await finish(page, 154);

  await expect(plate(page)).toBeVisible();
  const win = plate(page).locator(".plate-win");
  await expect(win).toContainText("21.65");
  await expect(plate(page).locator(".plate-times")).toHaveText("21.65× bet");
  await expect(plate(page).locator(".big-win")).toHaveText("Big win");
  const boxes = await Promise.all([win.boundingBox(), plate(page).locator(".plate-times").boundingBox()]);
  expect(boxes[1]!.y, "the multiple is under the win").toBeGreaterThan(boxes[0]!.y + boxes[0]!.height - 2);
  const style = await win.evaluate((element) => ({
    family: getComputedStyle(element).fontFamily,
    size: parseFloat(getComputedStyle(element).fontSize),
    root: parseFloat(getComputedStyle(document.documentElement).fontSize),
  }));
  expect(style.family).toContain("Georgia");
  expect(style.size).toBeGreaterThanOrEqual(style.root * 2);
});

test("a round under ten times the bet has no Big win on the plate", async ({ page }) => {
  await finish(page, 1);

  await expect(plate(page).locator(".plate-win")).toContainText("2.50");
  await expect(plate(page).locator(".big-win")).toHaveCount(0);
});

test("a round that returns nothing says so in one plain line", async ({ page }) => {
  await finish(page, 2);

  await expect(plate(page).locator(".plate-zero")).toHaveText("Surfaced with nothing");
  await expect(plate(page).locator(".plate-win")).toHaveCount(0);
  await expect(plate(page).locator(".odds")).toHaveText("About 1 in 5 Classic dives surfaces with nothing, and that is part of the 96%.");
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 1920, height: 1080 }]) {
  test(`the plate never covers a landed coin at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await finish(page, 154);

    const found = await page.evaluate(() => {
      const plate = document.querySelector(".result-plate")!.getBoundingClientRect();
      const board = document.querySelector(".board")!.getBoundingClientRect();
      const tiles = [...document.querySelectorAll(".tile")].map((tile) => ({ landed: tile.classList.contains("tile-drawn"), box: tile.getBoundingClientRect() }));
      const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return {
        inside: plate.left >= board.left && plate.right <= board.right && plate.bottom <= board.bottom + 1,
        covers: tiles.filter((tile) => overlap(plate, tile.box)).length,
        landed: tiles.filter((tile) => tile.landed).length,
      };
    });

    expect(found.landed).toBeGreaterThan(5);
    expect(found.inside, "the plate is inside the board").toBe(true);
    expect(found.covers, "no tile, landed or empty, lies under the plate").toBe(0);
  });
}

const sizes = [{ width: 1024, height: 700 }, { width: 1280, height: 800 }, { width: 1366, height: 768 }, { width: 1600, height: 900 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }];

for (const colorScheme of ["dark", "light"] as const) {
  for (const seed of [154, 2]) {
    test(`the text on the plate stays inside it at every size, ${seed === 154 ? "Big win" : "nothing"}, ${colorScheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      for (const viewport of sizes) {
        await page.setViewportSize(viewport);
        await finish(page, seed);
        const found = await page.evaluate(() => {
          const plate = document.querySelector(".result-plate")!;
          const box = plate.getBoundingClientRect();
          return {
            clipped: plate.scrollHeight > plate.clientHeight + 1 || plate.scrollWidth > plate.clientWidth + 1,
            outside: [...plate.querySelectorAll("p")]
              .filter((line) => {
                const rect = line.getBoundingClientRect();
                return rect.top < box.top - 0.5 || rect.bottom > box.bottom + 0.5 || rect.left < box.left - 0.5 || rect.right > box.right + 0.5;
              })
              .map((line) => line.className),
          };
        });
        expect(found.outside, `${viewport.width} by ${viewport.height}`).toEqual([]);
        expect(found.clipped, `${viewport.width} by ${viewport.height}`).toBe(false);
      }
    });
  }
}

test("the empty wells are dimmed and the summary keeps only the rows that say something", async ({ page }) => {
  await finish(page, 154);

  await expect(page.locator(".tile-empty .well").first()).toHaveCSS("opacity", "0.4");
  await expect(summary(page).getByText("Spins", { exact: true })).toBeVisible();
  await expect(summary(page).getByText("Crates", { exact: true })).toBeVisible();
  await expect(summary(page).getByText("Jackpots", { exact: true })).toBeVisible();
  await expect(summary(page).getByText("Minor")).toBeVisible();
  await expect(summary(page).getByText("Grand", { exact: true })).toHaveCount(0);
  await expect(summary(page).getByText("Not won")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dive again" })).toBeVisible();

  // The next round takes seed 155, which returns nothing and lands nothing.
  await page.getByRole("button", { name: "Dive again" }).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  await expect(summary(page).getByText("Jackpots", { exact: true })).toHaveCount(0);
  await expect(summary(page).getByText("None")).toHaveCount(0);
  await expect(page.locator(".tile-drawn")).toHaveCount(0);
  await expect(page.locator(".tile-empty .well").first(), "a board with nothing on it keeps its wells in full").toHaveCSS("opacity", "1");
});

for (const dive of [
  { name: "Classic Dive", slug: "classic", key: "1", seed: 154 },
  { name: "Drift Dive", slug: "static", key: "2", seed: 11 },
  { name: "Tank Dive", slug: "tank", key: "3", seed: 4 },
]) {
  test(`${dive.name}: the odds line uses the figure of that dive from its report for the cells the board ended with`, async ({ page }) => {
    await finish(page, dive.seed, dive.key);

    const filled = await page.locator(".tile-drawn:not(.tile-tank)").count();
    const kind = dive.name.replace(" Dive", "");
    const every = 1 / chances(dive.slug)[filled];
    const expected =
      filled === 0
        ? `About 1 in ${rounded(every)} ${kind} dives surfaces with nothing, and that is part of the 96%.`
        : `A ${kind} dive ends with exactly ${filled} ${filled === 1 ? "crate" : "crates"} about 1 time in ${rounded(every)}.`;
    await expect(plate(page).locator(".odds")).toHaveText(expected);
    expect(await plate(page).textContent()).not.toContain("!");
  });
}

test("before the end the foot of the board shows the last landing, and it is not a live region", async ({ page }) => {
  await open(page, "/?seed=1");
  await diveButton(page).click();

  await expect(page.locator(".board-foot.status .foot-what")).toHaveText("Nothing has landed yet");
  await expect(page.locator(".board-foot.status .foot-spin")).toHaveText("Spin 0");
  await expect(page.locator(".board-foot.status .foot-spin")).toHaveText(/^Spin [1-9]/);
  await expect(page.locator(".board-foot.status .foot-what")).not.toHaveText("Nothing has landed yet");
  await expect(page.locator("[aria-live] .board-foot")).toHaveCount(0);
});
