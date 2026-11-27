import { expect, test, type Page } from "@playwright/test";
import { diveButton, open, sawAnimation, summary, watchAnimations } from "./play";

// How the board feels. Seed 154 is a Classic round that lands crates on its first spin and a Minor on its fourth. Seed 33 is a sparse Classic
// round that reaches its last breath several times. Every effect here plays once and only with motion, and none of them moves the layout.

// Every CSS animation that has run, by name, with its timing, so a test can ask what played and for how long.
async function watchNames(page: Page) {
  await page.addInitScript(() => {
    const seen: { name: string; target: string; duration: number; iterations: number; delay: number }[] = [];
    const known = new Set<Animation>();
    const frame = () => {
      for (const animation of document.getAnimations()) {
        if (known.has(animation) || !(animation instanceof CSSAnimation)) continue;
        known.add(animation);
        const effect = animation.effect as KeyframeEffect;
        const target = effect.target as Element;
        const timing = effect.getTiming();
        seen.push({ name: animation.animationName, target: `${target.className.baseVal ?? target.className}${effect.pseudoElement ?? ""}`, duration: Number(timing.duration), iterations: Number(timing.iterations), delay: Number(timing.delay) });
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    (window as any).namedAnimations = seen;
  });
}

const named = (page: Page) => page.evaluate(() => (window as any).namedAnimations as { name: string; target: string; duration: number; iterations: number; delay: number }[]);

test("a coin drops into its well and settles, with a ring on the water and bubbles, and a jackpot also catches the light", async ({ page }) => {
  test.setTimeout(60_000);
  await watchNames(page);
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await expect(page.locator(".prize.hit")).toHaveCount(1, { timeout: 30_000 });
  await page.waitForTimeout(1000);

  const seen = await named(page);
  const by = (name: string) => seen.filter((animation) => animation.name === name);
  expect(by("tile-in").length + by("shine").length, "every new coin drops or shines in").toBeGreaterThan(3);
  // A jackpot coin shines in on its moment instead of dropping, and its water rings all the same.
  const coins = [...by("tile-in"), ...by("shine")].filter((animation) => animation.target.includes("coin")).length;
  expect(by("ripple").length).toBe(coins);
  expect(by("fizz").length).toBe(by("ripple").length * 3);
  expect(by("glint").length, "the Minor catches the light").toBeGreaterThanOrEqual(1);
  for (const animation of seen.filter((item) => ["tile-in", "ripple", "fizz", "glint"].includes(item.name))) {
    expect(animation.iterations, animation.name).toBe(1);
    expect(animation.duration + animation.delay, `${animation.name} is over within a second`).toBeLessThanOrEqual(1000);
  }
  // The splash goes with the spin that made it.
  await expect(page.locator(".splash")).toHaveCount(0, { timeout: 5_000 });
});

test("a coin that lands moves no other tile and no part of the board", async ({ page }) => {
  await open(page, "/?seed=154");
  await diveButton(page).click();
  const before = await page.evaluate(() => [...document.querySelectorAll(".tile, .board, .board-foot, .prizes")].map((element) => element.getBoundingClientRect().toJSON()));
  await expect(page.locator(".splash").first()).toBeAttached({ timeout: 10_000 });
  const during = await page.evaluate(() => [...document.querySelectorAll(".tile, .board, .board-foot, .prizes")].map((element) => element.getBoundingClientRect().toJSON()));
  expect(during).toEqual(before);
});

test("on the last breath the last bottle breathes and the rim beats twice and rests, slower than three flashes a second", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, "/?seed=33");
  await diveButton(page).click();
  await expect(page.locator(".breath-band")).toBeVisible({ timeout: 30_000 });

  await expect(page.locator(".bottle.pulse")).toHaveCount(1);
  const found = await page.evaluate(() => {
    const running = document.getAnimations().filter((animation) => animation instanceof CSSAnimation) as CSSAnimation[];
    const of = (name: string) => running.find((animation) => animation.animationName === name);
    const beat = of("heartbeat")!;
    const peaks = (beat.effect as KeyframeEffect).getKeyframes().filter((frame) => Number(frame.opacity) > 0.6).length;
    return {
      breathe: Number(of("breathe")?.effect?.getTiming().duration),
      beat: Number(beat.effect!.getTiming().duration),
      peaks,
      on: (beat.effect as KeyframeEffect).pseudoElement,
      band: getComputedStyle(document.querySelector(".breath-band")!).animationName,
    };
  });
  expect(found.breathe).toBe(1600);
  expect(found.beat).toBe(1600);
  expect(found.on).toBe("::after");
  expect(found.band, "the tab itself does not move").toBe("none");
  expect(found.peaks / (found.beat / 1000), "peaks a second").toBeLessThan(3);
});

test("a big win that plays out lights each coin once, one after another, counts the number up from nothing under its title, and sends bubbles up", async ({ page }) => {
  test.setTimeout(60_000);
  await watchNames(page);
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as any).winTexts = seen;
    const sample = () => {
      const text = document.querySelector(".moment-figure strong")?.textContent;
      if (text && seen.at(-1) !== text) seen.push(text);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await expect(page.locator(".round.celebrate")).toBeVisible({ timeout: 40_000 });

  await expect(page.locator(".burst i")).toHaveCount(8);
  await expect(page.locator(".moment.big .moment-title")).toHaveText("Big win");
  await expect(page.locator(".moment-figure strong")).toHaveText("21.65", { timeout: 5_000 });
  await page.waitForTimeout(1200);
  const lights = (await named(page)).filter((animation) => animation.name === "light");
  const coins = await page.locator(".tile-drawn").count();
  expect(lights.length).toBe(coins);
  expect(lights.every((light) => light.iterations === 1)).toBe(true);
  expect(new Set(lights.map((light) => light.delay)).size, "each coin in its turn").toBe(coins);
  const texts: string[] = await page.evaluate(() => (window as any).winTexts);
  const values = texts.map((text) => Number(text.replace(/,/g, "")));
  expect(values[0]).toBeLessThan(5);
  expect(values.length).toBeGreaterThan(10);
  expect(values).toEqual([...values].sort((a, b) => a - b));
  expect(values.at(-1)).toBe(21.65);
});

test("a big win that was skipped shows its number at once and keeps the lights", async ({ page }) => {
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();

  expect(await page.getByTestId("win").textContent()).toBe("21.65");
  await expect(page.locator(".round.celebrate")).toBeVisible();
});

test("the result rises into the console when the dive surfaces, and Dive again follows it", async ({ page }) => {
  await watchNames(page);
  await open(page, "/?seed=2");
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  await page.waitForTimeout(300);

  const surfaced = (await named(page)).filter((animation) => animation.name === "surface");
  expect(surfaced.map((animation) => animation.target).sort()).toEqual(["actions", "summary"]);
  expect(surfaced.find((animation) => animation.target === "actions")!.delay).toBeGreaterThan(0);
});

// Every new effect is left out with reduced motion, from the system or from the setting in the game, and the result still reads in full.
for (const how of ["system", "setting"] as const) {
  test.describe(`with reduced motion from the ${how}`, () => {
    if (how === "system") test.use({ contextOptions: { reducedMotion: "reduce" } });

    test("a big win and a last breath play with no effect at all, and the result is all there", async ({ page }) => {
      test.setTimeout(90_000);
      if (how === "setting") await page.addInitScript(() => localStorage.setItem("lastbreath.reduce", "1"));
      await watchAnimations(page);
      await open(page, "/?seed=154");
      await diveButton(page).click();
      await expect(summary(page)).toBeVisible({ timeout: 40_000 });
      await expect(page.getByTestId("win")).toHaveText("21.65");
      await expect(page.locator(".result-plate .big-win")).toHaveText("Big win");
      await expect(page.locator(".result-plate .plate-medal")).toBeVisible();

      await open(page, "/?seed=33");
      await diveButton(page).click();
      await expect(page.locator(".breath-band")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".board.last-breath")).toHaveCount(1);

      for (const effect of [".splash", ".sparkle", ".burst", ".celebrate", ".pulse", ".moves"]) await expect(page.locator(effect), effect).toHaveCount(0);
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      expect(await sawAnimation(page)).toBe(false);
    });
  });
}

// Seed 154 starts on a balance of 999.00 after its bet and pays 21.65. The balance in the header counts up with the number of the result and
// starts just after it, so at no frame does it show more than 999.00 plus the win on show.
test("on a big win that plays out the balance counts up with the result and never runs ahead of it", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const seen: { balance: number; win: number | null }[] = [];
    (window as any).pairs = seen;
    const number = (selector: string) => {
      const text = document.querySelector(selector)?.textContent;
      return text ? Number(text.replace(/,/g, "")) : null;
    };
    const sample = () => {
      const balance = number("[data-testid=balance]");
      if (balance !== null) seen.push({ balance, win: number(".moment-figure strong") ?? number("[data-testid=win]") });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await expect(page.locator(".round.celebrate")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("balance")).toHaveText("1,020.65", { timeout: 5_000 });
  await expect(page.getByTestId("win")).toHaveText("21.65");

  const pairs: { balance: number; win: number | null }[] = await page.evaluate(() => (window as any).pairs);
  const atTheEnd = pairs.filter((pair) => pair.win !== null);
  const counting = atTheEnd.filter((pair) => pair.balance < 1020.65);
  expect(counting.length, "the balance counted up over several frames").toBeGreaterThan(5);
  for (const pair of atTheEnd) expect(pair.balance, `the balance at a win of ${pair.win}`).toBeLessThanOrEqual(Math.round((999 + pair.win!) * 100) / 100 + 0.001);
  const balances = atTheEnd.map((pair) => pair.balance);
  expect(balances).toEqual([...balances].sort((a, b) => a - b));
});

test("on Skip the result and the balance are both final at once", async ({ page }) => {
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();

  expect(await page.getByTestId("win").textContent()).toBe("21.65");
  expect(await page.getByTestId("balance").textContent()).toBe("1,020.65");
});

// Seed 154 lands a Minor on its fourth spin. The jackpot takes the board for about a second: a band names it, the other tiles step back and
// the Minor shines. Then play goes on.
test("a jackpot that lands takes the board for a moment under its name, and play goes on", async ({ page }) => {
  test.setTimeout(60_000);
  await watchNames(page);
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await expect(page.locator(".moment .moment-title")).toHaveText("Minor jackpot", { timeout: 30_000 });

  await expect(page.locator(".board.spotlit")).toHaveCount(1);
  await expect(page.locator(".tile.spotlight")).toHaveCount(1);
  await expect(page.locator(".tile.spotlight")).toHaveClass(/tile-minor/);
  const band = await page.locator(".moment").evaluate((moment) => {
    const box = moment.getBoundingClientRect();
    const foot = document.querySelector(".board-foot")!.getBoundingClientRect();
    return { clearOfConsole: box.bottom <= foot.top, hidden: moment.getAttribute("aria-hidden"), face: getComputedStyle(moment.querySelector(".moment-title")!).fontFamily };
  });
  expect(band.clearOfConsole, "Skip can still be pressed").toBe(true);
  expect(band.hidden).toBe("true");
  expect(band.face).toContain("Georgia");

  // The next spin takes the moment away.
  await expect(page.locator(".moment")).toHaveCount(0, { timeout: 5_000 });
  await expect(page.locator(".board.spotlit")).toHaveCount(0);
  const seen = await named(page);
  for (const name of ["moment", "dim", "shine"]) {
    const run = seen.find((animation) => animation.name === name)!;
    expect(run, name).toBeTruthy();
    expect(run.iterations, name).toBe(1);
    expect(run.duration, name).toBe(1200);
  }
  await expect(page.locator("[aria-live]")).toHaveCount(1);
});

test("a click ends the moment of a jackpot at once", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await expect(page.locator(".moment")).toBeVisible({ timeout: 30_000 });
  await page.locator(".moment").click();
  await expect(page.locator(".moment")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
});

test("a big win takes the board under its title while the number counts, then settles into the plate with Dive again", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await expect(page.locator(".moment.big")).toBeVisible({ timeout: 40_000 });

  const early = await page.locator(".summary").evaluate((summary) => Number(getComputedStyle(summary).opacity));
  expect(early, "the plate waits for the moment").toBeLessThan(0.5);
  await expect(page.locator(".moment")).toHaveCount(0, { timeout: 4_000 });
  await expect(page.locator(".result-plate .big-win")).toBeVisible();
  await expect(page.getByTestId("win")).toHaveText("21.65");
  await expect(page.getByRole("button", { name: "Dive again" })).toBeInViewport({ ratio: 1 });
});

for (const how of ["key", "click"] as const) {
  test(`a big win can be cut short with ${how === "key" ? "S" : "a click"}: the title goes, and the number, the balance and Dive again are there at once`, async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, "/?seed=154");
    await diveButton(page).click();
    await expect(page.locator(".moment.big")).toBeVisible({ timeout: 40_000 });
    if (how === "key") await page.keyboard.press("s");
    else await page.locator(".moment").click();

    await expect(page.locator(".moment")).toHaveCount(0);
    expect(await page.getByTestId("balance").textContent()).toBe("1,020.65");
    expect(await page.getByTestId("win").textContent()).toBe("21.65");
    await expect(page.locator(".round.cut")).toHaveCount(1);
    await expect.poll(() => page.locator(".summary").evaluate((summary) => Number(getComputedStyle(summary).opacity))).toBe(1);
  });
}

test.describe("with reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the jackpot and the big win show their titles still, for a moment, and nothing moves", async ({ page }) => {
    test.setTimeout(60_000);
    await watchAnimations(page);
    await open(page, "/?seed=154");
    await diveButton(page).click();
    await expect(page.locator(".moment .moment-title")).toHaveText("Minor jackpot", { timeout: 30_000 });
    await expect(page.locator(".moment.big .moment-title")).toHaveText("Big win", { timeout: 40_000 });
    await expect(page.locator(".moment-figure strong")).toHaveText("21.65");
    await expect(page.locator(".moment")).toHaveCount(0, { timeout: 4_000 });
    await expect(page.getByTestId("balance")).toHaveText("1,020.65");
    expect(await sawAnimation(page)).toBe(false);
  });
});

// The last breath holds for 1,500 ms before the spin that can end the round, and in the last part of that the empty wells catch a shimmer.
test("on the last breath the empty wells shimmer once before the next spin shows, and only with motion", async ({ page }) => {
  test.setTimeout(60_000);
  await watchNames(page);
  await open(page, "/?seed=33");
  await diveButton(page).click();
  await expect(page.locator(".breath-band")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1600);

  const shimmer = (await named(page)).filter((animation) => animation.name === "shimmer");
  expect(shimmer.length, "every empty well").toBeGreaterThan(5);
  for (const run of shimmer) {
    expect(run.target).toContain("::after");
    expect(run.iterations).toBe(1);
    expect(run.delay + run.duration, "it ends before the next spin shows").toBeLessThanOrEqual(1500);
  }
});

