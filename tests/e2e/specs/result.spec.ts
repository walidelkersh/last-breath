import { expect, test, type Page } from "@playwright/test";
import { atRest, diveButton, open, summary } from "./play";
import { expectedLine } from "./odds";

// Seeds, found with "lab play": Classic 154 lands a Minor and returns 21.65 times the bet, Classic 1 returns 2.5,
// Classic 5 returns 0.6 and Classic 2 returns nothing. Drift 11 and Tank 4 are the seeds the other specs use for those dives.
// The multiple, the odds line and the counts of the round are part of the maths view, so most of these tests turn it on.

async function finish(page: Page, seed: number, key = "1", maths = true) {
  await open(page, `/?seed=${seed}`, { maths });
  await page.keyboard.press(key);
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  await atRest(page);
}

const plate = (page: Page) => page.locator(".board .result-plate");

test("a Big win puts the win, the multiple and Big win on the board, with the Major medal beside the number", async ({ page }) => {
  await finish(page, 154);

  await expect(plate(page)).toBeVisible();
  const win = plate(page).locator(".plate-win");
  await expect(win).toContainText("21.65");
  await expect(plate(page).locator(".plate-times")).toHaveText("21.65× bet");
  await expect(plate(page).locator(".big-win")).toHaveText("Big win");
  const boxes = await Promise.all([win.boundingBox(), plate(page).locator(".plate-times").boundingBox(), plate(page).locator(".plate-medal").boundingBox(), plate(page).locator(".big-win").boundingBox()]);
  expect(boxes[1]!.y, "the multiple is under the win").toBeGreaterThan(boxes[0]!.y + boxes[0]!.height - 2);
  expect(boxes[2]!.x + boxes[2]!.width, "the medal is beside the number").toBeLessThanOrEqual(boxes[0]!.x + 2);
  expect(boxes[3]!.y + boxes[3]!.height, "Big win is over the number").toBeLessThanOrEqual(boxes[0]!.y + 4);
  const style = await win.evaluate((element) => ({
    size: parseFloat(getComputedStyle(element).fontSize),
    root: parseFloat(getComputedStyle(document.documentElement).fontSize),
  }));
  expect(style.size).toBeGreaterThanOrEqual(style.root * 2);
  expect(await plate(page).locator(".plate-medal use").getAttribute("href")).toBe("#medal-major");
});

test("the number on the plate is set in the sans face with lining, tabular figures, and the word credits is not smaller than the smallest text size", async ({ page }) => {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await finish(page, 154);
    // WebKit writes a computed font-family without the quotes round a name, so both sides are read without them.
    const found = await plate(page).locator(".plate-win").evaluate((element) => {
      const style = getComputedStyle(element);
      const root = getComputedStyle(document.documentElement);
      const plain = (value: string) => value.replace(/["']/g, "");
      return {
        family: plain(style.fontFamily),
        sans: plain(root.getPropertyValue("--sans").trim()),
        figures: style.fontVariantNumeric,
        weight: Number(style.fontWeight),
        credits: parseFloat(getComputedStyle(element.querySelector("span")!).fontSize),
      };
    });
    const label = `${viewport.width} by ${viewport.height}`;
    expect(found.family, label).toBe(found.sans);
    expect(found.family, label).not.toContain("Georgia");
    expect(found.figures, label).toContain("lining-nums");
    expect(found.figures, label).toContain("tabular-nums");
    expect(found.weight, label).toBeGreaterThanOrEqual(800);
    expect(found.credits, `${label}: credits`).toBeGreaterThanOrEqual(11);
  }
});

// Seeds: Classic 5 returns 0.6 times the bet, 1 returns 2.5, 154 returns 21.65 and 2 returns nothing.
test("the plate has four states: nothing, under the bet, the bet or more, and a big win", async ({ page }) => {
  const looks: Record<string, { text: string; colour: string; edge: string; kind: string; medal: number }> = {};
  for (const [name, seed] of [["zero", 2], ["under", 5], ["over", 1], ["big", 154]] as const) {
    await finish(page, seed);
    looks[name] = await plate(page).evaluate((element) => ({
      kind: element.className,
      text: (element.querySelector(".plate-times")?.textContent ?? element.querySelector(".plate-zero")!.textContent ?? "").trim(),
      colour: element.querySelector(".plate-win") ? getComputedStyle(element.querySelector(".plate-win")!).color : "",
      edge: getComputedStyle(element).boxShadow,
      medal: element.querySelectorAll(".plate-medal").length,
    }));
  }
  expect(looks.zero.text).toBe("Surfaced with nothing");
  expect(looks.under.text).toBe("Returned 0.60 of your 1.00 bet");
  expect(looks.over.text).toBe("2.5× bet");
  expect(looks.big.text).toBe("21.65× bet");
  expect(looks.under.kind).toContain("under");
  expect(looks.over.kind).toContain("over");
  expect(looks.big.kind).toContain("big");

  const amber = "rgb(224, 169, 74)";
  expect(looks.over.colour, "the number at or over the bet is amber").toBe(amber);
  expect(looks.big.colour).toBe(amber);
  expect(looks.under.colour, "the number under the bet is muted").not.toBe(amber);
  expect(looks.over.edge).not.toContain(amber);
  expect(looks.big.edge, "a big win has an amber edge").toContain(amber);
  expect(looks.big.edge).toContain("3px");
  expect([looks.zero.medal, looks.under.medal, looks.over.medal, looks.big.medal]).toEqual([0, 0, 0, 1]);
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`the foot of the board is in the colours of the board in the ${colorScheme} theme, and the text reads on it`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await finish(page, 154);

    const found = await page.evaluate(() => {
      // A mixed colour comes back as color(srgb r g b) with each channel from 0 to 1.
      const channels = (value: string) => {
        const numbers = (value.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
        return value.startsWith("color(") ? numbers.map((n) => n * 255) : numbers;
      };
      const plate = document.querySelector(".result-plate")!;
      return {
        win: channels(getComputedStyle(plate.querySelector(".plate-win")!).color),
        times: channels(getComputedStyle(plate.querySelector(".plate-times")!).color),
        odds: channels(getComputedStyle(plate.querySelector(".odds")!).color),
        background: channels(getComputedStyle(plate).backgroundColor),
      };
    });
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map((channel) => (channel / 255 <= 0.03928 ? channel / 255 / 12.92 : ((channel / 255 + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: number[], b: number[]) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    expect(luminance(found.background), "the plate is dark water, not a white field").toBeLessThan(0.08);
    for (const [name, colour] of [["number", found.win], ["multiple", found.times], ["odds", found.odds]] as const) expect(ratio(colour, found.background), name).toBeGreaterThanOrEqual(4.5);
  });
}

test("the console at the foot of the board has the same height during the round and at the end, so no tile moves", async ({ page }) => {
  for (const maths of [false, true]) {
    await open(page, "/?seed=154", { maths });
    await diveButton(page).click();
    await expect(page.locator(".board-foot.console .total strong")).not.toHaveText("0.00", { timeout: 15_000 });
    const geometry = () => page.evaluate(() => ({
      board: document.querySelector(".board")!.getBoundingClientRect().toJSON(),
      tiles: [...document.querySelectorAll(".tile")].map((tile) => tile.getBoundingClientRect().toJSON()),
      foot: document.querySelector(".board-foot")!.getBoundingClientRect().toJSON(),
      prizes: document.querySelector(".prizes")!.getBoundingClientRect().toJSON(),
    }));
    const during = await geometry();

    await page.keyboard.press("s");
    await expect(summary(page)).toBeVisible();
    const after = await geometry();
    const label = maths ? "maths view" : "player view";
    expect(after.board, label).toEqual(during.board);
    expect(after.tiles, label).toEqual(during.tiles);
    expect(after.foot, label).toEqual(during.foot);
    expect(after.prizes, label).toEqual(during.prizes);
  }
});

test("a round under ten times the bet has no Big win on the plate", async ({ page }) => {
  await finish(page, 1, "1", false);

  await expect(plate(page).locator(".plate-win")).toContainText("2.50");
  await expect(plate(page).locator(".big-win")).toHaveCount(0);
});

test("a round that returns nothing says so in one plain line, and the maths view adds how often that happens", async ({ page }) => {
  await finish(page, 2, "1", false);
  await expect(plate(page).locator(".plate-zero")).toHaveText("Surfaced with nothing");
  await expect(plate(page).locator(".plate-win")).toHaveCount(0);
  await expect(plate(page).locator(".odds")).toHaveCount(0);

  await finish(page, 2);
  await expect(plate(page).locator(".plate-zero")).toHaveText("Surfaced with nothing");
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
        await atRest(page);
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

test("the empty wells are dimmed and the counts of the round keep only the rows that say something", async ({ page }) => {
  await finish(page, 154);
  const facts = page.locator(".round-facts");

  await expect(page.locator(".tile-empty .well").first()).toHaveCSS("opacity", "0.4");
  await expect(facts.getByText("Spins", { exact: true })).toBeVisible();
  await expect(facts.getByText("Crates", { exact: true })).toBeVisible();
  await expect(facts.getByText("Jackpots", { exact: true })).toBeVisible();
  await expect(facts.getByText("Minor")).toBeVisible();
  await expect(facts.getByText("Grand", { exact: true })).toHaveCount(0);
  await expect(facts.getByText("Not won")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dive again" })).toBeVisible();

  // The next round takes seed 155, which returns nothing and lands nothing.
  await page.getByRole("button", { name: "Dive again" }).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  await expect(facts.getByText("Jackpots", { exact: true })).toHaveCount(0);
  await expect(facts.getByText("None")).toHaveCount(0);
  await expect(page.locator(".tile-drawn")).toHaveCount(0);
  await expect(page.locator(".tile-empty .well").first(), "a board with nothing on it keeps its wells in full").toHaveCSS("opacity", "1");
});

for (const dive of [
  { name: "Classic Dive", slug: "classic" as const, key: "1", seeds: [2, 5, 1, 154] },
  { name: "Drift Dive", slug: "static" as const, key: "2", seeds: [11, 12] },
  { name: "Tank Dive", slug: "tank" as const, key: "3", seeds: [4, 5] },
]) {
  test(`${dive.name}: the odds line is the chance of doing at least this well, worked out again from the report and the config`, async ({ page }) => {
    test.setTimeout(60_000);
    const kind = dive.name.replace(" Dive", "");
    for (const seed of dive.seeds) {
      await finish(page, seed, dive.key);
      const win = await page.getByTestId("win").textContent();
      const units = Math.round(Number(win!.replace(/,/g, "")) * 1000);

      await expect(plate(page).locator(".odds"), `${kind} seed ${seed}, ${units} units`).toHaveText(expectedLine(dive.slug, kind, units));
      expect(await plate(page).textContent()).not.toContain("!");
      expect(await plate(page).textContent()).not.toMatch(/crate/i);
    }
  });
}

test("a jackpot is not counted as a crate, and two rounds that paid very differently do not get the same line", async ({ page }) => {
  await finish(page, 154);
  // Seed 154 fills 10 cells: 9 crates and a Minor. The counts say so, and the plate does not count the Minor as a crate.
  await expect(page.locator(".round-facts").getByText("Crates", { exact: true })).toBeVisible();
  await expect(page.locator(".round-facts").locator("div", { hasText: /^Crates9$/ })).toHaveCount(1);
  await expect(plate(page).locator(".odds")).not.toContainText("10 crates");
  const big = await plate(page).locator(".odds").textContent();

  await page.getByRole("button", { name: "Dive again" }).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  const next = await plate(page).locator(".odds").textContent();
  expect(next).not.toBe(big);
  expect(big).toMatch(/^A win of 21\.65× or more comes in about 1 Classic dive in [\d,]+\.$/);
});

test("while the round runs the console holds the clock, the board total and Skip, and none of it is a live region", async ({ page }) => {
  await open(page, "/?seed=1");
  await diveButton(page).click();

  const foot = page.locator(".board-foot.console");
  await expect(foot.locator(".pips .bottle")).toHaveCount(3);
  await expect(foot.locator(".total strong")).toHaveText("0.00");
  await expect(foot.getByRole("button", { name: "Skip" })).toBeVisible();
  await expect(foot.locator(".total strong")).not.toHaveText("0.00");
  await expect(page.locator("[aria-live] .board-foot")).toHaveCount(0);
  await expect(page.locator(".board-foot [aria-live]")).toHaveCount(0);
});
