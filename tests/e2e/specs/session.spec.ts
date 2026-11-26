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

async function playRounds(page: Page, count: number) {
  await diveButton(page).click();
  await skipRound(page);
  for (let round = 2; round <= count; round++) {
    await page.getByRole("button", { name: "Dive again" }).click();
    await skipRound(page);
  }
}

test("there is no session block before the first round, and the note carries the exact figure from the report after it", async ({ page }) => {
  await open(page);
  await diveButton(page).click();
  await expect(page.locator(".round")).toBeVisible();
  await expect(page.locator(".session")).toHaveCount(0);

  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  await expect(page.locator(".session")).toBeVisible();
  const rtp = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "reports", "solve-classic.json"), "utf8")).rtp as number;
  await expect(page.locator(".session .note")).toHaveText(`The Classic Dive returns ${(rtp * 100).toFixed(2)}% over millions of rounds. A short session says little.`);
});

test("after two scripted rounds the panel has the exact rounds, bet and returned, and no percentage yet", async ({ page }) => {
  await open(page, "/?seed=154");
  const { rounds, bet, returned, share } = tally(page);

  await diveButton(page).click();
  await skipRound(page);
  await expect(rounds).toHaveText("1");
  await expect(bet).toHaveText("1.00");
  await expect(returned).toHaveText("21.65");
  await expect(share).toHaveText(/^—\s*from round 10$/);
  await expect(share).not.toContainText("%");

  await page.getByRole("button", { name: "Dive again" }).click();
  await skipRound(page);
  await expect(rounds).toHaveText("2");
  await expect(bet).toHaveText("2.00");
  await expect(returned).toHaveText("21.65");
  await expect(share).toHaveText(/^—\s*from round 10$/);
});

test("the percentage returned appears from the tenth round, with the number of rounds it stands on", async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, "/?seed=1");
  const { rounds, returned, share } = tally(page);

  await playRounds(page, 9);
  await expect(rounds).toHaveText("9");
  await expect(share).toHaveText(/^—\s*from round 10$/);

  await page.getByRole("button", { name: "Dive again" }).click();
  await skipRound(page);
  // The first ten seeds pay 7.55 on a bet of 10.00.
  await expect(returned).toHaveText("7.55");
  await expect(share).toHaveText(/^75\.5%\s*over 10 rounds$/);

  for (let round = 11; round <= 13; round++) {
    await page.getByRole("button", { name: "Dive again" }).click();
    await skipRound(page);
  }
  await expect(share).toHaveText(/^88\.8%\s*over 13 rounds$/);
});

test("rounds at different bets add up by their bets", async ({ page }) => {
  await open(page, "/?seed=1");
  const { rounds, bet, returned } = tally(page);

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
});

test("the strip holds the last twelve rounds, oldest out, each bar named and set by its tier", async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, "/?seed=1");
  const bars = page.locator(".bars .bar");

  await playRounds(page, 1);
  await expect(page.locator(".bars .bar-empty")).toHaveCount(11);
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

test("ten bets fill the strip, one bet reaches under half, a round with nothing is a thin tick, and the bet is a dashed line with a label", async ({ page }) => {
  await open(page, "/?seed=1");
  await playRounds(page, 2);

  const measured = await page.evaluate(() => {
    const strip = document.querySelector(".bars")!.getBoundingClientRect();
    const spans = [...document.querySelectorAll(".bars .bar span")].map((span) => ({ height: span.getBoundingClientRect().height, bottom: span.getBoundingClientRect().bottom }));
    const before = getComputedStyle(document.querySelector(".bars")!, "::before");
    const after = getComputedStyle(document.querySelector(".bars")!, "::after");
    const bet = parseFloat(getComputedStyle(document.querySelector(".bars")!).getPropertyValue("--bet-line"));
    return { strip: { height: strip.height, bottom: strip.bottom }, spans, dash: before.borderTopStyle, label: after.content, bet };
  });
  // A bar is a share of the strip, less the room kept above it for a medal: 0.74 of the strip.
  const room = 0.74;
  const expectOf = (multiple: number) => Math.min(1, Math.log10(1 + 4 * multiple) / Math.log10(41)) * room * measured.strip.height;
  expect(measured.spans[0].height).toBeCloseTo(expectOf(2.5), 0);
  expect(measured.spans[1].height).toBe(3);
  expect(measured.spans[0].bottom).toBeCloseTo(measured.strip.bottom, 0);
  expect(measured.dash).toBe("dashed");
  expect(measured.label).toBe('"bet"');
  expect(measured.bet).toBeGreaterThan(40);
  expect(measured.bet).toBeLessThan(50);
});

test("a Big win bar fills the strip to the room under its medal, and has the medal above it", async ({ page }) => {
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await skipRound(page);

  const bar = page.locator(".bars .bar");
  await expect(bar).toHaveClass(/bar-big/);
  await expect(bar).toHaveAttribute("aria-label", "Round 1, Classic Dive, 21.65 credits returned on a bet of 1.00, 21.65 times the bet, big win");
  const found = await bar.evaluate((item) => {
    const span = item.querySelector("span")!;
    const medal = item.querySelector(".bar-medal")!.getBoundingClientRect();
    const strip = document.querySelector(".bars")!.getBoundingClientRect();
    const style = getComputedStyle(span);
    return { cap: parseFloat(style.borderTopWidth), fill: style.backgroundColor, height: span.getBoundingClientRect().height, top: span.getBoundingClientRect().top, medalBottom: medal.bottom, medalTop: medal.top, strip: strip.height, stripTop: strip.top };
  });
  expect(found.height).toBeCloseTo(0.74 * found.strip, 0);
  expect(found.cap).toBeGreaterThanOrEqual(2);
  expect(found.fill).toBe("rgb(224, 169, 74)");
  expect(found.medalBottom).toBeLessThanOrEqual(found.top + 1);
  expect(found.medalTop).toBeGreaterThanOrEqual(found.stripTop - 1);
  await expect(page.locator(".legend li")).toHaveCount(3);
  await expect(page.locator(".legend")).toContainText("Under the bet");
  await expect(page.locator(".legend")).toContainText("Bet or more");
  await expect(page.locator(".legend")).toContainText("Big win, 10");
});

test("the four kinds of bar differ by shape and not only by colour", async ({ page }) => {
  await open(page, "/?seed=1");
  await playRounds(page, 1);

  const looks = await page.evaluate(() => {
    const bars = document.querySelector(".bars")!;
    return ["nothing", "under", "over", "big"].map((tier) => {
      const item = document.createElement("li");
      item.className = `bar bar-${tier}`;
      item.style.setProperty("--h", "0.5");
      item.innerHTML = "<span></span>";
      bars.append(item);
      const style = getComputedStyle(item.querySelector("span")!);
      const result = { tier, height: item.querySelector("span")!.getBoundingClientRect().height, cap: parseFloat(style.borderTopWidth), fill: style.backgroundColor };
      item.remove();
      return result;
    });
  });
  const by = Object.fromEntries(looks.map((look) => [look.tier, look]));
  expect(by.nothing.height).toBe(3);
  expect(by.nothing.cap).toBe(0);
  expect(by.under.cap).toBeGreaterThanOrEqual(2);
  expect(by.over.cap).toBeGreaterThanOrEqual(2);
  expect(by.under.fill).not.toBe(by.over.fill);
  expect(by.under.fill).toMatch(/^(rgba\(.*, 0\.\d+\)|color\(srgb .* \/ 0\.\d+\))$/);
  expect(by.over.fill).toBe("rgb(224, 169, 74)");
});

for (const viewport of [{ width: 1024, height: 700 }, { width: 1280, height: 800 }, { width: 1366, height: 768 }]) {
  test(`the labels of the tally stay on one line at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page, "/?seed=154");
    await playRounds(page, 1);

    const labels = await page.evaluate(() =>
      [...document.querySelectorAll(".stats dt")].map((label) => {
        const style = getComputedStyle(label);
        return { text: label.textContent, lines: Math.round(label.getBoundingClientRect().height / (parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.45)) };
      }),
    );
    expect(labels.map((label) => label.text)).toEqual(["Rounds", "Total bet", "Total returned", "Returned so far"]);
    for (const label of labels) expect(label.lines, `${label.text} is on one line`).toBe(1);
  });
}

test("Reset balance clears the session", async ({ page }) => {
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await skipRound(page);
  await expect(tally(page).rounds).toHaveText("1");

  await page.getByRole("button", { name: "Reset balance" }).click();

  await expect(page.locator(".session")).toHaveCount(0);
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
  await expect(page.locator(".session")).toHaveCount(0);
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
  test(`the bars stand out from the panel by at least 3 to 1 in the ${colorScheme} theme, and the text of the panel meets AA`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await open(page, "/?seed=1");
    await playRounds(page, 1);

    const found: { name: string; paint: number[]; surface: number[] }[] = await page.evaluate(() => {
      const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
      const surface = channels(getComputedStyle(document.querySelector(".side")!).backgroundColor);
      const bars = document.querySelector(".bars")!;
      const out: { name: string; paint: number[]; surface: number[] }[] = [];
      for (const tier of ["nothing", "under", "over", "big"]) {
        const item = document.createElement("li");
        item.className = `bar bar-${tier}`;
        item.innerHTML = "<span></span>";
        bars.append(item);
        const style = getComputedStyle(item.querySelector("span")!);
        // A bar is outlined, and the outline is what has to stand out from the panel, as it does on the pale panel of the light theme where amber alone is about 2 to 1.
        if (tier === "nothing") out.push({ name: tier, paint: channels(style.backgroundColor), surface });
        else {
          out.push({ name: `${tier} top edge`, paint: channels(style.borderTopColor), surface });
          out.push({ name: `${tier} side edge`, paint: channels(style.borderLeftColor), surface });
        }
        item.remove();
      }
      return out;
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
