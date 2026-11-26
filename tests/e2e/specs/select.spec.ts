import { expect, test } from "@playwright/test";
import { open } from "./play";

test("each card draws its rule from symbols that are in the sprite", async ({ page }) => {
  await open(page);
  await page.waitForFunction(() => document.querySelector("symbol#panel") !== null);

  const drawn = await page.evaluate(() =>
    [...document.querySelectorAll(".card")].map((card) => {
      const hrefs = [...card.querySelectorAll<SVGUseElement>(".pic use")].map((use) => use.getAttribute("href")!);
      return {
        hrefs,
        renders: card.querySelectorAll("picture img").length,
        missing: hrefs.filter((href) => (document.querySelector(`symbol${href}`)?.querySelectorAll("path").length ?? 0) === 0),
      };
    }),
  );
  const count = (hrefs: string[], prefix: string) => hrefs.filter((href) => href.startsWith(prefix)).length;

  expect(drawn.flatMap((card) => card.missing)).toEqual([]);
  expect(drawn).toHaveLength(3);
  expect([count(drawn[0].hrefs, "#crate"), count(drawn[0].hrefs, "#bottle")]).toEqual([1, 3]);
  expect(count(drawn[1].hrefs, "#well")).toBe(6);
  expect([count(drawn[2].hrefs, "#air-tank"), count(drawn[2].hrefs, "#crate")]).toEqual([0, 1]);
  expect(drawn.map((card) => card.renders)).toEqual([0, 0, 1]);
});

for (const colorScheme of ["dark", "light"] as const) {
  test.describe(`in the ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test("the Tank card shows the render of this theme, inside the drawing", async ({ page }) => {
      const loaded: string[] = [];
      page.on("response", (response) => {
        if (response.url().includes("/art/air-tank")) loaded.push(new URL(response.url()).pathname.split("/").pop()!);
      });
      await open(page);

      const picture = page.locator(".card", { has: page.getByText("Tank Dive", { exact: true }) }).locator(".pic-tank img");
      await expect(picture).toBeVisible();
      const box = await picture.evaluate(async (element) => {
        const image = element as HTMLImageElement;
        await image.decode().catch(() => undefined);
        const frame = image.closest(".pic-frame")!.getBoundingClientRect();
        const own = image.getBoundingClientRect();
        return {
          source: new URL(image.currentSrc).pathname.split("/").pop(),
          natural: [image.naturalWidth, image.naturalHeight],
          inside: own.left >= frame.left && own.right <= frame.right && own.top >= frame.top && own.bottom <= frame.bottom,
          size: [own.width, own.height],
        };
      });

      expect(box.source).toBe(`air-tank-${colorScheme}.webp`);
      expect(box.natural).toEqual([256, 256]);
      expect(box.inside).toBe(true);
      expect(box.size.every((side) => side > 40)).toBe(true);
      expect(new Set(loaded)).toEqual(new Set([`air-tank-${colorScheme}.webp`]));
    });
  });
}

test("the chosen card and the hovered card differ from the others by more than colour", async ({ page }) => {
  await open(page);
  await page.keyboard.press("2");
  const body = (name: string) => page.locator(".card", { has: page.getByText(name, { exact: true }) }).locator(".card-body");

  const chosen = await body("Drift Dive").evaluate((element) => {
    const style = getComputedStyle(element);
    return { shadow: style.boxShadow, mark: getComputedStyle(element.querySelector(".mark")!).backgroundImage, key: getComputedStyle(element.querySelector(".key")!).fontWeight };
  });
  const other = await body("Classic Dive").evaluate((element) => {
    const style = getComputedStyle(element);
    return { shadow: style.boxShadow, mark: getComputedStyle(element.querySelector(".mark")!).backgroundImage, key: getComputedStyle(element.querySelector(".key")!).fontWeight };
  });
  expect(chosen.shadow).not.toBe("none");
  expect(other.shadow).toBe("none");
  expect(chosen.mark).toContain("radial-gradient");
  expect(other.mark).toBe("none");
  expect(chosen.key).not.toBe(other.key);

  await body("Tank Dive").hover();
  await expect.poll(() => body("Tank Dive").evaluate((element) => getComputedStyle(element).transform)).not.toBe("none");
  expect(await body("Classic Dive").evaluate((element) => getComputedStyle(element).transform)).toBe("none");
});

test("keyboard focus on a card shows a ring that stands off the card", async ({ page }) => {
  await open(page);
  await page.getByRole("radio", { name: "Classic Dive" }).focus();
  await page.keyboard.press("ArrowRight");

  await expect(page.getByRole("radio", { name: "Drift Dive" })).toBeFocused();
  const ring = await page.locator(".card", { has: page.getByText("Drift Dive", { exact: true }) }).locator(".card-body").evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: style.outlineWidth, offset: style.outlineOffset, style: style.outlineStyle };
  });
  expect(ring).toEqual({ width: "3px", offset: "4px", style: "solid" });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the bet chips and Dive are in view on load and stay in view while the cards scroll", async ({ page }) => {
    await open(page);
    const dive = page.getByRole("button", { name: "Dive", exact: true });
    const chips = page.locator(".chips");

    for (const position of [0, 600, 1200]) {
      await page.evaluate((top) => scrollTo(0, top), position);
      for (const [name, target] of [["Dive", dive], ["the bet chips", chips]] as const) {
        const box = (await target.boundingBox())!;
        expect(box.y, `${name} at scroll ${position}`).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, `${name} at scroll ${position}`).toBeLessThanOrEqual(844);
        expect(box.x + box.width, `${name} at scroll ${position}`).toBeLessThanOrEqual(390);
      }
    }
  });

  test("a card that takes keyboard focus is scrolled clear of the bar", async ({ page }) => {
    await open(page);
    await page.getByRole("radio", { name: "Tank Dive" }).focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");

    const card = (await page.locator(".card", { has: page.getByText("Tank Dive", { exact: true }) }).locator(".card-body").boundingBox())!;
    const bar = (await page.locator(".stake").boundingBox())!;
    expect(card.y + card.height).toBeLessThanOrEqual(bar.y);
  });

  test("a bet can be chosen from the bar and a round started from it", async ({ page }) => {
    await open(page);
    await page.getByRole("radio", { name: "2.00", exact: true }).check({ force: true });
    await page.getByRole("button", { name: "Dive", exact: true }).click();

    await expect(page.getByText("Bet 2.00")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
