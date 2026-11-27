import { expect, test, type Page } from "@playwright/test";
import { diveButton, open, summary } from "./play";

// Depth is the clock. The round sets --air, the air left over the most the dive can have, and the water darkens as it falls: a layer under
// the tiles, and on a large screen one behind the whole round. At the end the dive surfaces. Seed 33 is a sparse Classic round that runs
// down to its last breath several times, seed 11 a Drift round and seed 4 a Tank round that lands two air tanks on its first spin.

type Step = { n: number; air: number; clock: number; gain: number };

async function record(page: Page) {
  await page.addInitScript(() => {
    const log: { n: number; air: string; text: string; gain: string }[] = [];
    (window as any).depthLog = log;
    new MutationObserver(() => {
      const round = document.querySelector(".round");
      const label = document.querySelector(".meta .spin")?.textContent ?? "";
      const n = Number(label.replace("Spin ", ""));
      if (!round || !(n > 0) || log.at(-1)?.n === n) return;
      log.push({
        n,
        air: (round as HTMLElement).style.getPropertyValue("--air"),
        text: document.querySelector(".clock-text")?.textContent ?? "",
        gain: document.querySelector("[data-testid=gain]")?.textContent ?? "",
      });
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["style"] });
  });
}

// The spin number is read from the side panel, so these rounds are played in the maths view. The depth is the same in both views.
async function playOut(page: Page, path: string, key: string) {
  await record(page);
  await open(page, path, { maths: true });
  await page.keyboard.press(key);
  await diveButton(page).click();
  await expect(summary(page)).toBeVisible({ timeout: 40_000 });
  const raw: { n: number; air: string; text: string; gain: string }[] = await page.evaluate(() => (window as any).depthLog);
  return raw.map((entry): Step => ({
    n: entry.n,
    air: Number(entry.air),
    clock: Number(/(\d+)/.exec(entry.text.replace(/^[^\d]*/, ""))?.[1]),
    gain: Number(entry.gain.replace("+", "")) || 0,
  }));
}

test.describe.configure({ timeout: 60_000 });

test("Classic: the air is the clock over the refill, and it is zero on the dead spin that ends the round", async ({ page }) => {
  const steps = await playOut(page, "/?seed=33", "1");

  expect(steps.length).toBeGreaterThan(10);
  for (const step of steps) expect(step.air, `spin ${step.n}`).toBeCloseTo(step.clock / 3, 2);
  expect(steps.at(-1)!.air).toBe(0);
  expect(new Set(steps.map((step) => step.air.toFixed(2)))).toEqual(new Set(["1.00", "0.67", "0.33", "0.00"]));
  // A crate refills the air, so the water opens again: some spin has more air than the one before it.
  expect(steps.some((step, index) => index > 0 && step.air > steps[index - 1].air)).toBe(true);
  expect(Number(await page.locator(".round").evaluate((round) => getComputedStyle(round).getPropertyValue("--air")))).toBe(1);
});

test("Drift: the air is the spins left over six", async ({ page }) => {
  const steps = await playOut(page, "/?seed=11", "2");

  for (const step of steps) expect(step.air, `spin ${step.n}`).toBeCloseTo(step.clock / 6, 2);
  expect(steps[0].air).toBeCloseTo(5 / 6, 2);
});

test("Tank: the air is what is left over the starting air plus every breath the tanks have added, and stays between 0 and 1", async ({ page }) => {
  const steps = await playOut(page, "/?seed=4", "3");

  let added = 0;
  for (const step of steps) {
    added += step.gain;
    expect(step.air, `spin ${step.n}`).toBeGreaterThanOrEqual(0);
    expect(step.air, `spin ${step.n}`).toBeLessThanOrEqual(1);
    expect(step.air, `spin ${step.n}`).toBeCloseTo(Math.min(1, step.clock / (4 + added)), 2);
  }
  // Two tanks on the first spin add 1 and 2 breaths: 4 - 1 + 3 = 6 of 7.
  expect(steps[0].gain).toBe(3);
  expect(steps[0].air).toBeCloseTo(6 / 7, 2);
});

test("the water darkens by about a half of what is lost, under the tiles and behind the round, and clears at the end", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "/?seed=33");
  await page.keyboard.press("1");
  await diveButton(page).click();
  await expect(page.locator(".breath-band")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);

  const dark = () =>
    page.evaluate(() => ({
      air: Number(getComputedStyle(document.querySelector(".round")!).getPropertyValue("--air")),
      board: Number(getComputedStyle(document.querySelector(".board")!, "::before").opacity),
      page: Number(getComputedStyle(document.querySelector(".round")!, "::before").opacity),
      boardLayer: getComputedStyle(document.querySelector(".board")!, "::before").position,
      pageLayer: getComputedStyle(document.querySelector(".round")!, "::before").position,
    }));
  const last = await dark();
  expect(last.air).toBeCloseTo(1 / 3, 2);
  expect(last.board).toBeCloseTo((1 - last.air) * 0.55, 2);
  expect(last.page).toBeCloseTo((1 - last.air) * 0.55, 2);
  expect(last.boardLayer).toBe("absolute");
  expect(last.pageLayer).toBe("fixed");

  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  await expect.poll(async () => (await dark()).board, { timeout: 3000 }).toBe(0);
  expect((await dark()).page).toBe(0);
});

test("the layer sits between the water and the tiles, and takes no clicks", async ({ page }) => {
  await open(page, "/?seed=33");
  await page.keyboard.press("1");
  await diveButton(page).click();
  await expect(page.locator(".tile-crate").first()).toBeVisible();

  const order = await page.evaluate(() => {
    const board = document.querySelector(".board")!;
    return {
      isolate: getComputedStyle(board).isolation,
      water: getComputedStyle(board.querySelector(".panel")!).zIndex,
      pointer: getComputedStyle(board, "::before").pointerEvents,
      position: getComputedStyle(board, "::before").position,
    };
  });
  expect(order).toEqual({ isolate: "isolate", water: "-1", pointer: "none", position: "absolute" });
});

test("the fade lasts 600 ms through the round and 1.2 s when the dive surfaces", async ({ page }) => {
  await open(page, "/?seed=33");
  await page.keyboard.press("1");
  await diveButton(page).click();
  await expect(page.locator(".tile-crate").first()).toBeVisible();
  const duration = () => page.evaluate(() => getComputedStyle(document.querySelector(".board")!, "::before").transitionDuration);

  expect(await duration()).toBe("0.6s");
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  expect(await duration()).toBe("1.2s");
});

test.describe("with prefers-reduced-motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the steps stay and nothing fades", async ({ page }) => {
    await open(page, "/?seed=33");
    await page.keyboard.press("1");
    await diveButton(page).click();
    await expect(page.locator(".breath-band")).toBeVisible({ timeout: 30_000 });

    const look = await page.evaluate(() => {
      const layer = getComputedStyle(document.querySelector(".board")!, "::before");
      return { opacity: Number(layer.opacity), duration: layer.transitionDuration, running: document.getAnimations().length };
    });
    expect(look.opacity, "the darkness still steps with the air").toBeGreaterThan(0.3);
    expect(look.duration).toBe("0s");
    expect(look.running).toBe(0);
  });
});

test("the in-game Reduce motion setting also keeps the steps and drops the fade", async ({ page }) => {
  await open(page, "/?seed=33");
  await page.getByLabel("Reduce motion").check();
  await page.keyboard.press("1");
  await diveButton(page).click();
  await expect(page.locator(".breath-band")).toBeVisible({ timeout: 30_000 });

  const look = await page.evaluate(() => {
    const layer = getComputedStyle(document.querySelector(".board")!, "::before");
    return { opacity: Number(layer.opacity), duration: layer.transitionDuration };
  });
  expect(look.opacity).toBeGreaterThan(0.3);
  expect(look.duration).toBe("0s");
});

// The contrast of text over the darkest step. The text is made transparent, the box behind it is photographed, and the worst pixel is held
// against the colour of the text, so that whatever is drawn behind it counts: the layers, the plates, the surfaces and the backing of the bar.
async function worstContrast(page: Page, selectors: string[]) {
  // The box of each run of text, so that a round corner or an icon beside the text is not photographed with it.
  const items: { sel: string; x: number; y: number; w: number; h: number; color: string }[] = await page.evaluate((list) =>
    list.flatMap((sel) =>
      [...document.querySelectorAll(sel)].slice(0, 3).flatMap((element) => {
        const found: { sel: string; x: number; y: number; w: number; h: number; color: string }[] = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node && found.length < 2; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const box = range.getBoundingClientRect();
          // The middle of the run: its edge can touch the border of a plate, which is drawn in the colour of the text.
          found.push({ sel, x: box.x + box.width * 0.12, y: box.y + box.height * 0.2, w: box.width * 0.76, h: box.height * 0.6, color: getComputedStyle(node.parentElement!).color });
        }
        return found;
      }),
    ).filter((item) => item.w > 4 && item.h > 4 && item.y >= 0 && item.y + item.h <= innerHeight && item.x >= 0 && item.x + item.w <= innerWidth),
    selectors);
  await page.addStyleTag({ content: "*, *::before, *::after { color: transparent !important; text-shadow: none !important; -webkit-text-fill-color: transparent !important; caret-color: transparent !important; }" });
  // One photograph of the page serves every box. The round keeps playing, and an engine that is slow to photograph would otherwise find the next screen under a later box.
  const png = await page.screenshot({ type: "png" });
  return page.evaluate(async ({ b64, boxes }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const luminance = (r: number, g: number, b: number) => {
      const [R, G, B] = [r, g, b].map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * R + 0.7152 * G + 0.0722 * B;
    };
    return boxes.map((item) => {
      const pixels = context.getImageData(Math.round(item.x), Math.round(item.y), Math.max(1, Math.round(item.w)), Math.max(1, Math.round(item.h))).data;
      const numbers = (item.color.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
      const text = luminance(...(item.color.startsWith("color(") ? numbers.map((n) => n * 255) : numbers) as [number, number, number]);
      let worst = Infinity;
      for (let i = 0; i < pixels.length; i += 4) {
        const back = luminance(pixels[i], pixels[i + 1], pixels[i + 2]);
        worst = Math.min(worst, (Math.max(text, back) + 0.05) / (Math.min(text, back) + 0.05));
      }
      return { sel: item.sel, ratio: worst };
    });
  }, { b64: png.toString("base64"), boxes: items });
}

const playerText = [
  ".tile-value", ".breath-band", ".total", ".prize-name", ".prize-value", ".top .brand", ".balance", ".bet", ".switch-text", "footer > p", "footer .toggle",
  ".board-foot button", ".top button", "footer button",
];
const mathsText = [...playerText, ".round-name", ".meta", ".clock-text", ".ticker-what", ".ticker-spin"];

// The player view is checked at every size, and the maths view, which adds the side panel, where it has one beside the board.
const contrastRuns = [
  ...[{ width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 844, height: 390 }, { width: 390, height: 844 }].map((viewport) => ({ viewport, maths: false })),
  ...[{ width: 1280, height: 800 }, { width: 1920, height: 1080 }].map((viewport) => ({ viewport, maths: true })),
];

for (const colorScheme of ["dark", "light"] as const) {
  for (const { viewport, maths } of contrastRuns) {
    test(`all text keeps 4.5 to 1 at the darkest step, ${maths ? "maths" : "player"} view, ${viewport.width} by ${viewport.height}, ${colorScheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize(viewport);
      await open(page, "/?seed=33", { maths });
      await page.keyboard.press("1");
      await diveButton(page).click();
      await expect(page.locator(".breath-band")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".tile-value").first()).toBeVisible();
      // The darkest step, held still.
      await page.addStyleTag({ content: ".round { --air: 0 !important; } *, *::before, *::after { transition: none !important; }" });
      await page.waitForTimeout(100);

      const opacity = await page.evaluate(() => Number(getComputedStyle(document.querySelector(".board")!, "::before").opacity));
      expect(opacity).toBeCloseTo(0.55, 2);
      const results = await worstContrast(page, maths ? mathsText : playerText);
      expect(results.length).toBeGreaterThan(10);
      for (const result of results) expect(result.ratio, `${result.sel} at ${viewport.width} by ${viewport.height}`).toBeGreaterThanOrEqual(4.5);
    });
  }
}

test("the last breath moves nothing: the tiles, the board and the total stay where they were on the spin before", async ({ page }) => {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await open(page, "/?seed=33");
    await page.keyboard.press("1");
    await diveButton(page).click();
    const geometry = () =>
      page.evaluate(() => {
        const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON();
        return {
          board: rect(".board"), total: rect(".total"), clock: rect(".clock"), foot: rect(".board-foot"), prizes: rect(".prizes"),
          tiles: [...document.querySelectorAll(".tile")].map((tile) => tile.getBoundingClientRect().toJSON()),
        };
      });

    // The spin before the last breath is the first one that leaves 2 of 3.
    await expect(page.locator(".clock-text strong")).toHaveText("2 of 3", { timeout: 30_000 });
    await expect(page.locator(".breath-band")).toBeHidden();
    const before = await geometry();
    await expect(page.locator(".clock-text strong")).toHaveText("1 of 3", { timeout: 30_000 });
    await expect(page.locator(".breath-band")).toBeVisible();
    const during = await geometry();

    const label = `${viewport.width} by ${viewport.height}`;
    expect(during.board, label).toEqual(before.board);
    expect(during.tiles, label).toEqual(before.tiles);
    expect(during.total, label).toEqual(before.total);
    expect(during.clock, label).toEqual(before.clock);
    expect(during.foot, label).toEqual(before.foot);
    expect(during.prizes, label).toEqual(before.prizes);

    const edge = await page.locator(".board").evaluate((board) => ({ before: getComputedStyle(board).borderTopColor, width: getComputedStyle(board).borderTopWidth }));
    expect(edge.before, "the rim is amber").toBe("rgb(224, 169, 74)");
    expect(parseFloat(edge.width)).toBeGreaterThanOrEqual(4);
  }
});
