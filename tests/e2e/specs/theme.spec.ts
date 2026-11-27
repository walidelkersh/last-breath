import { expect, test, type Page } from "@playwright/test";
import { diveButton, open, summary } from "./play";

// Amber is the accent in both themes. On the dark page it is a fill, an edge and text at once. On the light page it is a
// fill with dark text on it, and its edge and its text are the deeper brown, because amber alone is about 2 to 1 on white.
// The board is deep water in both themes, so the things drawn on it do not change with the page.

const channels = (value: string) => {
  const numbers = (value.match(/[\d.]+/g) ?? []).map(Number);
  return value.startsWith("color(") ? numbers.slice(0, 3).map((n) => Math.round(n * 255)) : numbers.slice(0, 3);
};

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

async function readColours(page: Page) {
  return page.evaluate(() => {
    const paint = (property: string, token: string) => {
      const probe = document.createElement("i");
      probe.style.setProperty(property, `var(${token})`);
      document.body.append(probe);
      const value = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      return value;
    };
    const button = document.createElement("button");
    button.className = "primary";
    document.body.append(button);
    const primary = { fill: getComputedStyle(button).backgroundColor, text: getComputedStyle(button).color, edge: getComputedStyle(button).borderTopColor };
    button.remove();
    return {
      primary,
      accent: paint("color", "--accent"),
      edge: paint("color", "--accent-edge"),
      text: paint("color", "--accent-text"),
      surface: paint("color", "--surface"),
      surface2: paint("color", "--surface-2"),
      page: paint("color", "--bg"),
    };
  });
}

for (const colorScheme of ["dark", "light"] as const) {
  test(`amber is the accent in the ${colorScheme} theme, with dark text on its fill and an edge and text that stand off the surfaces`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await open(page);
    const found = await readColours(page);

    expect(found.primary.fill).toBe("rgb(224, 169, 74)");
    expect(found.primary.text).toBe("rgb(26, 18, 4)");
    expect(contrast(channels(found.primary.text), channels(found.primary.fill)), "text on an amber fill").toBeGreaterThanOrEqual(7);
    for (const [name, surface] of [["surface", found.surface], ["surface-2", found.surface2], ["page", found.page]] as const) {
      expect(contrast(channels(found.text), channels(surface)), `amber text on the ${name}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(channels(found.edge), channels(surface)), `the amber edge on the ${name}`).toBeGreaterThanOrEqual(3);
    }
    if (colorScheme === "light") {
      expect(found.edge).toBe("rgb(138, 82, 0)");
      expect(found.text).toBe("rgb(138, 82, 0)");
      expect(contrast(channels(found.accent), channels(found.surface)), "the fill alone is not enough on white, which is why it has an edge").toBeLessThan(3);
    }
  });
}

test("the board, its wells and what is drawn on it are the same deep water in both themes", async ({ browser }) => {
  const read = async (colorScheme: "dark" | "light") => {
    const page = await browser.newPage({ colorScheme });
    await open(page, "/?seed=4");
    await page.keyboard.press("3");
    await diveButton(page).click();
    await page.locator(".tile-tank").first().waitFor();
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--art-plate") !== "");
    const found = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const tokens = ["water", "well", "empty", "wood-low", "wood-mid", "wood-high", "tank", "gold"].flatMap((material) => ["b", "s", "h"].map((tone) => root.getPropertyValue(`--art-${material}-${tone}`).trim()));
      return { board: getComputedStyle(document.querySelector(".board")!).backgroundColor, tokens, plate: root.getPropertyValue("--art-plate").trim() };
    });
    await page.close();
    return found;
  };
  const dark = await read("dark");
  const light = await read("light");

  expect(light.board).toBe(dark.board);
  expect(light.tokens).toEqual(dark.tokens);
  expect(light.tokens.every((token) => /^#[0-9a-f]{6}$/i.test(token))).toBe(true);
  const [red, green, blue] = channels(dark.board);
  expect(blue, "mid-deep blue, with more blue than red").toBeGreaterThan(red + 20);
  expect(Math.max(red, green, blue), "deep, not pale").toBeLessThan(100);
  // The plate is what changes with the page: it is pale in the light theme and dark in the dark one.
  expect(light.plate).not.toBe(dark.plate);
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`the prize cards, the landed card and the legend read in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await open(page, "/?seed=154", { maths: true });
    await diveButton(page).click();
    await page.keyboard.press("s");
    await expect(summary(page)).toBeVisible();
    await expect(page.locator(".prize.hit")).toHaveCount(1);

    const found = await page.evaluate(() => {
      const channels = (value: string) => {
        const numbers = (value.match(/[\d.]+/g) ?? []).map(Number);
        return value.startsWith("color(") ? numbers.slice(0, 3).map((n) => Math.round(n * 255)) : numbers.slice(0, 3);
      };
      const card = (selector: string) => document.querySelector(selector)!;
      const text = (element: Element, inner: string) => channels(getComputedStyle(element.querySelector(inner)!).color);
      const grand = card(".prize.grand");
      const hit = card(".prize.hit");
      const badge = hit.querySelector(".badge")!;
      const side = channels(getComputedStyle(card(".side")).backgroundColor);
      const swatch = getComputedStyle(card(".legend-under"), "::before");
      return {
        grand: { name: text(grand, ".prize-name"), value: text(grand, ".prize-value"), surface: channels(getComputedStyle(grand).backgroundColor) },
        hit: { name: text(hit, ".prize-name"), value: text(hit, ".prize-value"), surface: channels(getComputedStyle(hit).backgroundColor) },
        badge: { text: channels(getComputedStyle(badge).color), fill: channels(getComputedStyle(badge).backgroundColor) },
        swatch: { edge: channels(swatch.borderTopColor), fill: swatch.backgroundColor, side },
        medal: card(".legend-big svg").getBoundingClientRect().width,
      };
    });

    for (const [name, group] of [["Grand", found.grand], ["landed", found.hit]] as const) {
      expect(contrast(group.name, group.surface), `the ${name} name`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(group.value, group.surface), `the ${name} value`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(found.badge.text, found.badge.fill), "the badge").toBeGreaterThanOrEqual(4.5);
    expect(contrast(found.swatch.edge, found.swatch.side), "the under-the-bet swatch edge").toBeGreaterThanOrEqual(3);
    expect(found.swatch.fill).not.toBe("rgba(0, 0, 0, 0)");
    expect(found.medal, "the Big win legend has a medal and not a colour").toBeGreaterThan(10);
  });
}

for (const colorScheme of ["dark", "light"] as const) {
  test(`the arrow in the Classic card is light on the deep water in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await open(page);
    const found = await page.evaluate(() => {
      const arrow = document.querySelector(".card .pic-arrow")!;
      const pic = document.querySelector(".card .pic")!;
      return { stroke: getComputedStyle(arrow).stroke, board: getComputedStyle(pic).backgroundColor };
    });
    expect(contrast(channels(found.stroke), channels(found.board))).toBeGreaterThanOrEqual(7);
  });
}
