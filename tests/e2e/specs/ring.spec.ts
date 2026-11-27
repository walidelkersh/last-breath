import { expect, test, type Page } from "@playwright/test";
import { diveButton, open, summary } from "./play";

// A jackpot lands like no crate. Seed 154 is a Classic round that lands a Minor on its fourth spin: its tile and its card each give one
// ring, 700 ms and not repeated, and the board total counts up over 900 ms where a crate takes 300. With reduced motion the ring is still
// and the total does not count. The spin is read from the side panel, so the rounds are played in the maths view.

async function watch(page: Page) {
  await page.addInitScript(() => {
    const rings: { on: string; pseudo: string | null; duration: number; iterations: number }[] = [];
    const seen = new Set<Animation>();
    const frame = () => {
      for (const animation of document.getAnimations()) {
        if ((animation as CSSAnimation).animationName !== "ring-pulse" || seen.has(animation)) continue;
        seen.add(animation);
        const effect = animation.effect as KeyframeEffect;
        rings.push({ on: (effect.target as Element).className, pseudo: effect.pseudoElement, duration: Number(effect.getTiming().duration), iterations: Number(effect.getTiming().iterations) });
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    (window as any).rings = rings;

    const writes: { at: number; spin: string; hit: boolean; text: string }[] = [];
    (window as any).writes = writes;
    new MutationObserver(() => {
      const total = document.querySelector(".total strong");
      if (!total) return;
      const text = total.textContent ?? "";
      const spin = document.querySelector(".meta .spin")?.textContent ?? "";
      if (writes.at(-1)?.text !== text || writes.at(-1)?.spin !== spin)
        writes.push({ at: performance.now(), spin, hit: document.querySelector(".prize.hit") !== null, text });
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}

async function play(page: Page) {
  await watch(page);
  await open(page, "/?seed=154", { maths: true });
  await page.keyboard.press("1");
  await diveButton(page).click();
  await expect(summary(page)).toBeVisible({ timeout: 40_000 });
}

test("a jackpot gives one ring of 700 ms on its tile and one on its card, and a crate gives none", async ({ page }) => {
  test.setTimeout(60_000);
  await play(page);

  const rings: { on: string; pseudo: string | null; duration: number; iterations: number }[] = await page.evaluate(() => (window as any).rings);
  expect(rings).toHaveLength(2);
  expect(rings.map((ring) => ring.pseudo)).toEqual(["::after", "::after"]);
  expect(rings.map((ring) => ring.duration)).toEqual([700, 700]);
  expect(rings.map((ring) => ring.iterations)).toEqual([1, 1]);
  expect(rings.find((ring) => ring.on.includes("tile-minor"))).toBeTruthy();
  expect(rings.find((ring) => ring.on.includes("prize"))).toBeTruthy();
  expect(await page.evaluate(() => document.getAnimations().filter((animation) => (animation as CSSAnimation).animationName === "ring-pulse").length), "nothing keeps ringing").toBe(0);
});

test("the board total counts up over 900 ms when a jackpot lands and over 300 ms for crates", async ({ page }) => {
  test.setTimeout(60_000);
  await play(page);

  const writes: { at: number; spin: string; hit: boolean; text: string }[] = await page.evaluate(() => (window as any).writes);
  const spans = new Map<string, { first: number; last: number; hit: boolean; count: number }>();
  for (const write of writes) {
    const span = spans.get(write.spin) ?? { first: write.at, last: write.at, hit: write.hit, count: 0 };
    span.last = write.at;
    span.count++;
    spans.set(write.spin, span);
  }
  const jackpot = [...spans.entries()].find(([, span]) => span.hit)!;
  const crate = [...spans.entries()].find(([spin, span]) => !span.hit && spin !== "Spin 0" && span.count > 3);

  expect(jackpot[0]).toBe("Spin 4");
  expect(jackpot[1].last - jackpot[1].first, "the jackpot spin").toBeGreaterThan(780);
  expect(jackpot[1].last - jackpot[1].first, "the jackpot spin").toBeLessThan(1100);
  expect(crate, "a crate spin counted up as well").toBeTruthy();
  expect(crate![1].last - crate![1].first, `${crate![0]}`).toBeLessThan(450);
});

test.describe("with prefers-reduced-motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the ring is still, on the tile and on the card, and the total does not count", async ({ page }) => {
    test.setTimeout(60_000);
    await play(page);

    const rings: unknown[] = await page.evaluate(() => (window as any).rings);
    expect(rings).toHaveLength(0);
    const still = await page.evaluate(() => {
      const ring = (selector: string) => {
        const style = getComputedStyle(document.querySelector(selector)!, "::after");
        return { width: style.borderTopWidth, colour: style.borderTopColor, animation: style.animationName, content: style.content };
      };
      return { tile: ring(".tile-minor"), card: ring(".prize.hit"), crate: getComputedStyle(document.querySelector(".tile-crate")!, "::after").content };
    });
    expect(still.tile).toEqual({ width: "3px", colour: "rgb(224, 169, 74)", animation: "none", content: '""' });
    expect(still.card.width).toBe("3px");
    expect(still.card.animation).toBe("none");
    expect(still.crate, "a crate has no ring").toBe("none");

    const writes: { spin: string }[] = await page.evaluate(() => (window as any).writes);
    const bySpin = new Map<string, number>();
    for (const write of writes) bySpin.set(write.spin, (bySpin.get(write.spin) ?? 0) + 1);
    expect(Math.max(...bySpin.values()), "one write for each spin and no counting").toBeLessThanOrEqual(2);
  });
});

test("the in-game Reduce motion setting gives the still ring too", async ({ page }) => {
  await watch(page);
  await open(page, "/?seed=154", { maths: true });
  await page.getByLabel("Reduce motion").check();
  await page.keyboard.press("1");
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();

  expect(await page.evaluate(() => (window as any).rings.length)).toBe(0);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".tile-minor")!, "::after").borderTopWidth)).toBe("3px");
});
