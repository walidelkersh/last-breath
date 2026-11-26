import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { diveButton, open, summary } from "./play";

// Wins of Classic rounds at a bet of 1.00, found with "lab play --dive classic --seed N" (units, 1,000 to the bet):
// seed 1 pays 2,500, 2 pays 0, 3 pays 1,250, 4 pays 0, 5 pays 600, 6 pays 500, 7 pays 150, 8 pays 750, 9 pays 400,
// 10 pays 1,400, 11 pays 1,600, 12 pays 2,400, 13 pays 0, and seed 154 pays 21,650 with a Minor.
// A page opened with ?seed=N plays seed N first and then N + 1, so the rounds below are those.

const tally = (page: Page) => ({
  rounds: page.getByTestId("session-rounds"),
  bet: page.getByTestId("session-bet"),
  returned: page.getByTestId("session-returned"),
  share: page.getByTestId("session-return"),
});

async function skipRound(page: Page) {
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
}

test("before the first round the panel says so, and the note carries the exact figure from the report", async ({ page }) => {
  await open(page);
  await diveButton(page).click();

  const { rounds, bet, returned, share } = tally(page);
  await expect(rounds).toHaveText("0");
  await expect(bet).toHaveText("0.00");
  await expect(returned).toHaveText("0.00");
  await expect(share).toHaveText("none yet");
  await expect(page.locator(".bars .bar")).toHaveCount(0);

  const rtp = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "reports", "solve-classic.json"), "utf8")).rtp as number;
  await expect(page.locator(".session .note")).toHaveText(`The Classic Dive returns ${(rtp * 100).toFixed(2)}% over millions of rounds. A short session says little.`);
});

test("after two scripted rounds the panel has the exact rounds, bet, returned and return", async ({ page }) => {
  await open(page, "/?seed=154");
  const { rounds, bet, returned, share } = tally(page);

  await diveButton(page).click();
  await skipRound(page);
  await expect(rounds).toHaveText("1");
  await expect(bet).toHaveText("1.00");
  await expect(returned).toHaveText("21.65");
  await expect(share).toHaveText(/^2165\.0%\s*over 1 round$/);

  await page.getByRole("button", { name: "Dive again" }).click();
  await skipRound(page);
  await expect(rounds).toHaveText("2");
  await expect(bet).toHaveText("2.00");
  await expect(returned).toHaveText("21.65");
  await expect(share).toHaveText(/^1082\.5%\s*over 2 rounds$/);
});

test("rounds at different bets add up by their bets", async ({ page }) => {
  await open(page, "/?seed=1");
  const { rounds, bet, returned, share } = tally(page);

  await page.getByRole("radio", { name: "4.00", exact: true }).check({ force: true });
  await diveButton(page).click();
  await skipRound(page);
  await page.getByRole("button", { name: "Change dive" }).click();
  await page.getByRole("radio", { name: "0.20", exact: true }).check({ force: true });
  await diveButton(page).click();
  await skipRound(page);

  // Seed 1 pays 2.5 times 4.00, and seed 2 pays nothing on 0.20.
  await expect(rounds).toHaveText("2");
  await expect(bet).toHaveText("4.20");
  await expect(returned).toHaveText("10.00");
  await expect(share).toHaveText(/^238\.1%\s*over 2 rounds$/);
});

test("the strip holds the last twelve rounds, oldest out, each bar named and set by its tier", async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, "/?seed=1");
  const bars = page.locator(".bars .bar");

  await diveButton(page).click();
  await skipRound(page);
  for (let round = 2; round <= 12; round++) {
    await page.getByRole("button", { name: "Dive again" }).click();
    await skipRound(page);
  }
  await expect(bars).toHaveCount(12);
  await expect(bars.first()).toHaveAttribute("aria-label", /^Round 1, Classic Dive, 2\.50 credits returned on a bet of 1\.00, 2\.5 times the bet, over the bet$/);

  await page.getByRole("button", { name: "Dive again" }).click();
  await skipRound(page);
  await expect(bars).toHaveCount(12);
  await expect(bars.first()).toHaveAttribute("aria-label", /^Round 2, Classic Dive, 0\.00 credits returned on a bet of 1\.00, 0 times the bet, nothing$/);
  await expect(bars.last()).toHaveAttribute("aria-label", /^Round 13, .*, 0 times the bet, nothing$/);
  await expect(page.getByRole("listitem", { name: /^Round 1,/ })).toHaveCount(0);

  // Seed 5 pays 0.6, seed 3 pays 1.25 and seed 12 pays 2.4 times the bet, which are rounds 5, 3 and 12.
  await expect(page.getByRole("listitem", { name: /^Round 5, .*under the bet$/ })).toHaveClass(/bar-under/);
  await expect(page.getByRole("listitem", { name: /^Round 3, .*over the bet$/ })).toHaveClass(/bar-over/);
  const height = async (name: RegExp) => (await page.getByRole("listitem", { name }).locator("span").boundingBox())!.height;
  expect(await height(/^Round 12,/)).toBeGreaterThan(await height(/^Round 3,/));
  expect(await height(/^Round 3,/)).toBeGreaterThan(await height(/^Round 5,/));
  expect(await height(/^Round 5,/)).toBeGreaterThan(await height(/^Round 2,/));
  await expect(page.locator(".bars .bar-empty")).toHaveCount(0);
  await expect(page.locator("[aria-live] .session")).toHaveCount(0);
  await expect(page.locator("[aria-live]")).toHaveCount(1);
});

test("a Big win bar is tall, capped and named", async ({ page }) => {
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await skipRound(page);

  const bar = page.locator(".bars .bar");
  await expect(bar).toHaveClass(/bar-big/);
  await expect(bar).toHaveAttribute("aria-label", "Round 1, Classic Dive, 21.65 credits returned on a bet of 1.00, 21.65 times the bet, big win");
  const style = await bar.locator("span").evaluate((span) => ({ cap: getComputedStyle(span).borderTopWidth, height: span.getBoundingClientRect().height }));
  expect(parseFloat(style.cap)).toBeGreaterThan(2);
  expect(style.height).toBeGreaterThan(30);
});

test("Reset balance clears the session", async ({ page }) => {
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await skipRound(page);
  await expect(tally(page).rounds).toHaveText("1");

  await page.getByRole("button", { name: "Reset balance" }).click();

  await expect(tally(page).rounds).toHaveText("0");
  await expect(tally(page).share).toHaveText("none yet");
  await expect(page.locator(".bars .bar")).toHaveCount(0);
});

test("the session is kept in memory only", async ({ page }) => {
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await skipRound(page);

  const stored = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  expect(stored).not.toMatch(/session|round|21\.65/i);
  await page.reload();
  await diveButton(page).click();
  await expect(tally(page).rounds).toHaveText("0");
});

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

for (const colorScheme of ["dark", "light"] as const) {
  test(`the four kinds of bar stand out from the panel by at least 3 to 1 in the ${colorScheme} theme, and the text of the panel meets AA`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await open(page, "/?seed=1");
    await diveButton(page).click();
    await expect(page.locator(".ticker-spin").first()).toBeVisible();

    const found: { name: string; paint: number[]; surface: number[] }[] = await page.evaluate(() => {
      const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
      const surface = channels(getComputedStyle(document.querySelector(".side")!).backgroundColor);
      const bars = document.querySelector(".bars")!;
      return ["nothing", "under", "over", "big"].map((tier) => {
        const item = document.createElement("li");
        item.className = `bar bar-${tier}`;
        item.innerHTML = "<span></span>";
        bars.append(item);
        const style = getComputedStyle(item.querySelector("span")!);
        const paint = tier === "under" ? style.borderTopColor : style.backgroundColor;
        const result = { name: tier, paint: channels(paint), surface };
        item.remove();
        return result;
      });
    });
    for (const { name, paint, surface } of found) expect(contrast(paint, surface), `the ${name} bar`).toBeGreaterThanOrEqual(3);

    const text: { name: string; foreground: number[]; background: number[] }[] = await page.evaluate(() => {
      const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
      const surface = channels(getComputedStyle(document.querySelector(".side")!).backgroundColor);
      return [".stats dt", ".stats dd", ".legend li", ".session .note", ".session h3", ".ticker-spin", ".ticker-what"].map((selector) => ({
        name: selector,
        foreground: channels(getComputedStyle(document.querySelector(selector)!).color),
        background: surface,
      }));
    });
    for (const { name, foreground, background } of text) expect(contrast(foreground, background), name).toBeGreaterThanOrEqual(4.5);
  });
}
