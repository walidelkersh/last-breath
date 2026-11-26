import { expect, test, type Page } from "@playwright/test";
import { diveButton, open, sawAnimation, summary, watchAnimations } from "./play";

const contrast = (foreground: string, background: string) => {
  const rgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const luminance = (hex: string) => {
    const [r, g, b] = rgb(hex).map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};

test("the water scene is one small SVG that sits behind the page and is not in the way", async ({ page }) => {
  const failed: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(`${response.url()} ${response.status()}`);
  });
  await open(page);

  const scene = await page.request.get(new URL("art/scene.svg", page.url()).href);
  expect(scene.ok()).toBe(true);
  expect(scene.headers()["content-type"]).toContain("image/svg+xml");
  expect((await scene.body()).length).toBeLessThan(8000);

  const behind = await page.evaluate(() => {
    const style = getComputedStyle(document.body, "::before");
    return { image: style.backgroundImage, position: style.position, layer: style.zIndex, events: style.pointerEvents };
  });
  expect(behind.image).toContain("art/scene.svg");
  expect([behind.position, behind.layer, behind.events]).toEqual(["fixed", "-1", "none"]);
  expect(failed).toEqual([]);
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`every tone of the scene keeps the page text and the muted text above 4.5 to 1 in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await open(page);
    const text = await page.request.get(new URL("art/scene.svg", page.url()).href).then((response) => response.text());

    // The file holds the dark tokens in :root and the light ones in the media query that follows.
    const [dark, light] = text.split("@media");
    const tones = [...(colorScheme === "dark" ? dark : light).matchAll(/--art-(deep|seabed|rock|kelp)-[bsh]:(#[0-9a-f]{6})/g)].map((match) => match[2]);
    expect(tones).toHaveLength(12);

    const ink = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return { text: root.getPropertyValue("--text").trim(), muted: root.getPropertyValue("--muted").trim() };
    });
    for (const tone of tones) {
      expect(contrast(ink.text, tone), `${tone} under the page text`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ink.muted, tone), `${tone} under the muted text`).toBeGreaterThanOrEqual(4.5);
    }
  });
}

async function startAClassicRound(page: Page) {
  await open(page, "/?seed=1");
  await diveButton(page).click();
  await expect(page.locator(".tile-empty").first()).toBeVisible();
}

const running = (page: Page, name: string) =>
  page.evaluate((wanted) => document.getAnimations().some((animation) => (animation as CSSAnimation).animationName === wanted), name);

test("with motion allowed a few faint bubbles climb behind the page", async ({ page }) => {
  await startAClassicRound(page);

  const bubbles = page.locator(".bubbles span");
  expect(await bubbles.count()).toBeLessThanOrEqual(8);
  expect(await bubbles.count()).toBeGreaterThan(3);
  expect(await running(page, "rise")).toBe(true);
  expect(await page.locator(".bubbles").evaluate((layer) => [getComputedStyle(layer).pointerEvents, layer.getAttribute("aria-hidden"), getComputedStyle(layer).zIndex])).toEqual(["none", "true", "-1"]);
});

test.describe("with prefers-reduced-motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("there are no bubbles, and nothing is animated anywhere", async ({ page }) => {
    await watchAnimations(page);
    await startAClassicRound(page);
    await page.keyboard.press("s");
    await expect(summary(page)).toBeVisible();

    await expect(page.locator(".bubbles")).toHaveCount(0);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(await sawAnimation(page)).toBe(false);
  });
});

test("the in-game toggle takes the bubbles away at once", async ({ page }) => {
  await startAClassicRound(page);
  await expect(page.locator(".bubbles")).toHaveCount(1);

  await page.getByLabel("Reduce motion").check();

  await expect(page.locator(".bubbles")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => (animation as CSSAnimation).animationName === "rise").length)).toBe(0);
});
