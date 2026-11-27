import { expect, test } from "@playwright/test";
import { diveButton, open, sawAnimation, summary, watchAnimations } from "./play";

// How long each spin stays, by what it held: 450 ms for nothing, 800 for crates, 1,300 for a jackpot, and 1,100 on the
// last breath. Seed 154 is a Classic round of 18 spins that lands a Minor, so it has all four kinds. Seed 33 is a sparse
// Classic round whose clock runs down to its last breath more than once.

const tolerance = 160;

// Each spin is read from the live region, which says it as "Spin 5. Landed: ... . Board ... . Oxygen 1 of 3. Last breath."
async function recordSpins(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const spins: { n: number; at: number; what: string; last: boolean }[] = [];
    (window as any).spinLog = spins;
    new MutationObserver(() => {
      const said = document.querySelector("[aria-live]")?.textContent ?? "";
      const n = Number(/^Spin (\d+)\./.exec(said)?.[1] ?? 0);
      if (n > 0 && spins.at(-1)?.n !== n) {
        spins.push({ n, at: performance.now(), what: said.includes("Nothing landed.") ? "Nothing landed" : said, last: said.includes("Last breath.") });
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}

test("each spin stays for as long as what it held deserves", async ({ page }) => {
  test.setTimeout(60_000);
  await recordSpins(page);
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await expect(summary(page)).toBeVisible({ timeout: 40_000 });

  const log: { n: number; at: number; what: string; last: boolean }[] = await page.evaluate(() => (window as any).spinLog);
  expect(log).toHaveLength(18);
  const expected = (what: string, last: boolean) => {
    const base = /Mini|Minor|Major/.test(what) ? 1300 : what === "Nothing landed" ? 450 : 800;
    return last ? Math.max(base, 1100) : base;
  };
  const kinds = new Set<number>();
  for (let index = 0; index + 1 < log.length; index++) {
    const pause = log[index + 1].at - log[index].at;
    const want = expected(log[index].what, log[index].last);
    kinds.add(want);
    expect(Math.abs(pause - want), `spin ${log[index].n} (${log[index].what}${log[index].last ? ", last breath" : ""}) stayed ${Math.round(pause)} ms, not about ${want}`).toBeLessThan(tolerance);
  }
  expect([...kinds].sort((a, b) => a - b)).toEqual([450, 800, 1100, 1300]);
});

test("on the last breath the rim of the board turns amber and the band shows, and neither is animated", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, "/?seed=33");
  await diveButton(page).click();

  await expect(page.locator(".breath-band")).toBeHidden();
  await expect(page.locator(".breath-band")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".breath-band")).toHaveText("Last breath");
  await expect(page.locator(".board")).toHaveClass(/last-breath/);

  const look = await page.locator(".board").evaluate((board) => {
    const amber = getComputedStyle(document.documentElement).getPropertyValue("--amber").trim();
    const band = board.querySelector(".breath-band")!;
    return {
      edge: getComputedStyle(board).borderTopColor,
      ring: getComputedStyle(board).boxShadow,
      amber,
      bandAnimation: getComputedStyle(band).animationName,
      boardAnimation: getComputedStyle(board).animationName,
      // The fade of the depth is a transition and is allowed. No keyframe animation runs on the board or in it.
      running: board.getAnimations({ subtree: true }).filter((animation) => animation instanceof CSSAnimation).length,
    };
  });
  expect(look.amber).toBe("#e0a94a");
  expect(look.edge).toBe("rgb(224, 169, 74)");
  expect([look.bandAnimation, look.boardAnimation, look.running].toString()).toBe(["none", "none", 0].toString());

  // The band goes with the last breath: a spin later the clock has gone or been refilled, and the board is plain again.
  await expect(page.locator(".breath-band")).toBeHidden({ timeout: 15_000 });
  await expect(page.locator(".board")).not.toHaveClass(/last-breath/);
});

for (const viewport of [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1024, height: 700 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
  test(`the Last breath tab lies over no tile and stays on the screen at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await open(page, "/?seed=33");
    await diveButton(page).click();
    await expect(page.locator(".breath-band")).toBeVisible({ timeout: 30_000 });

    const found = await page.evaluate(() => {
      const band = document.querySelector(".breath-band")!.getBoundingClientRect();
      const board = document.querySelector(".board")!.getBoundingClientRect();
      const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top + 0.5;
      return {
        covered: [...document.querySelectorAll(".tile")].filter((tile) => overlap(band, tile.getBoundingClientRect())).length,
        top: band.top,
        centred: Math.abs((band.left + band.right) / 2 - (board.left + board.right) / 2),
      };
    });
    expect(found.covered, "tiles under the tab").toBe(0);
    expect(found.top, "the tab is on the screen").toBeGreaterThanOrEqual(0);
    expect(found.centred).toBeLessThan(2);
  });
}

test.describe("with prefers-reduced-motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the band is still there, with no animation at all", async ({ page }) => {
    test.setTimeout(60_000);
    await watchAnimations(page);
    await open(page, "/?seed=33");
    await diveButton(page).click();

    await expect(page.locator(".breath-band")).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(await sawAnimation(page)).toBe(false);
  });
});

test("Skip still resolves the rest of a slow round at once", async ({ page }) => {
  await open(page, "/?seed=154");
  await diveButton(page).click();
  const started = Date.now();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();

  expect(Date.now() - started).toBeLessThan(3000);
  await expect(page.locator(".board-foot.result-plate")).toBeVisible();
});
