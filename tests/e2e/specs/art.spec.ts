import { expect, test } from "@playwright/test";
import { diveButton, open } from "./play";

test("the art loads on a round with no failed request, and every symbol a tile uses is in the sprite, which no longer holds the air tank", async ({ page }) => {
  const failed: string[] = [];
  page.on("requestfailed", (request) => failed.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(`${response.url()} ${response.status()}`);
  });

  await open(page, "/?seed=4");
  await page.keyboard.press("3");
  await diveButton(page).click();
  await expect(page.locator(".tile-tank")).toHaveCount(2);

  const { tiles, plates } = await page.evaluate(() => {
    const plates = [...document.querySelectorAll(".tile-tank .tile-plate")].map((plate) => plate.textContent!.replace(/\s+/g, " ").trim());
    const targets = [...document.querySelectorAll<SVGUseElement>(".round use")].map((use) => use.getAttribute("href")!);
    const tiles = targets.map((href) => {
      const symbol = document.querySelector(`symbol${href}`);
      return { href, drawn: symbol !== null && symbol.querySelectorAll("path").length > 0 };
    });
    return { tiles, plates };
  });

  expect(failed).toEqual([]);
  expect(tiles.map((tile) => tile.href)).toContain("#panel");
  expect(tiles.map((tile) => tile.href)).not.toContain("#air-tank");
  expect(await page.evaluate(() => document.querySelectorAll("symbol#air-tank").length)).toBe(0);
  expect(await page.locator(".tile-tank picture img").count()).toBe(2);
  expect(tiles.filter((tile) => tile.href.startsWith("#well-")).length).toBeGreaterThan(0);
  expect(tiles.map((tile) => tile.href)).toContain("#bottle-full");
  expect(tiles.map((tile) => tile.href)).toContain("#medal-grand");
  expect(tiles.every((tile) => tile.drawn)).toBe(true);
  expect(plates).toEqual(["+1", "+2"]);
});

const phone = { width: 390, height: 844 };

// The picture picks its file when the page loads, so the theme is set for the whole context and not after the page opens.
for (const colorScheme of ["dark", "light"] as const) {
  for (const [where, viewport] of [["on a desktop", { width: 1280, height: 800 }], ["on a phone", phone]] as const) {
    test.describe(`${where} in the ${colorScheme} theme`, () => {
      test.use({ colorScheme, viewport });

      test("the air tanks of a Tank round are the render of this theme, whole, upright and inside their tiles", async ({ page }) => {
        const loaded: string[] = [];
        const failed: string[] = [];
        page.on("response", (response) => {
          if (response.status() >= 400) failed.push(`${response.url()} ${response.status()}`);
          if (response.url().includes("/art/air-tank")) {
            loaded.push(`${new URL(response.url()).pathname.split("/").pop()} ${response.headers()["content-type"]}`);
          }
        });
        page.on("requestfailed", (request) => failed.push(`${request.url()} ${request.failure()?.errorText}`));

        await open(page, "/?seed=4");
        // The pop of a new coin overshoots its cell for a moment, so the geometry is read with the pop switched off.
        await page.addStyleTag({ content: ".coin { animation: none !important; }" });
        await page.keyboard.press("3");
        await diveButton(page).click();
        await expect(page.locator(".tile-tank")).toHaveCount(2);

        // One call reads everything, because the tanks leave the board when the next spin lands.
        const tanks = await page.evaluate(() =>
          Promise.all([...document.querySelectorAll(".tile-tank")].map(async (tile) => {
            const picture = tile.querySelector("picture")!;
            const image = picture.querySelector("img")!;
            await image.decode().catch(() => undefined);
            const [outer, inner] = [tile, image].map((element) => element.getBoundingClientRect());
            return {
              source: new URL(image.currentSrc).pathname.split("/").pop(),
              natural: [image.naturalWidth, image.naturalHeight],
              inside: inner.left >= outer.left - 0.5 && inner.top >= outer.top - 0.5 && inner.right <= outer.right + 0.5 && inner.bottom <= outer.bottom + 0.5,
              visible: inner.width > 20 && inner.height > 20,
              alt: image.getAttribute("alt"),
              hidden: image.getAttribute("aria-hidden"),
              transform: getComputedStyle(picture).transform,
              plate: tile.querySelector(".tile-plate")!.textContent!.replace(/\s+/g, " ").trim(),
            };
          })),
        );

        expect(failed).toEqual([]);
        expect(new Set(loaded)).toEqual(new Set([`air-tank-${colorScheme}.webp image/webp`]));
        expect(tanks).toHaveLength(2);
        for (const tank of tanks) {
          expect(tank.source).toBe(`air-tank-${colorScheme}.webp`);
          expect(tank.natural).toEqual([256, 256]);
          expect(tank.inside, "the picture is inside its tile").toBe(true);
          expect(tank.visible, "the picture has a size").toBe(true);
          expect([tank.alt, tank.hidden]).toEqual(["", "true"]);
          expect(["none", "matrix(1, 0, 0, 1, 0, 0)"], "the render is not turned again").toContain(tank.transform);
        }
        expect(tanks.map((tank) => tank.plate)).toEqual(["+1", "+2"]);
      });
    });
  }
}

test("the sprite follows the theme through the page's variables", async ({ page }) => {
  const plate = async (colorScheme: "dark" | "light") => {
    await page.emulateMedia({ colorScheme });
    return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--art-plate"));
  };
  await open(page);
  await page.waitForFunction(() => document.querySelector("symbol#crate-low-a") !== null);
  expect(await plate("dark")).not.toEqual(await plate("light"));
});

test("the title, the favicon and the mark in the header all come from the game", async ({ page }) => {
  await open(page);
  await page.waitForFunction(() => document.querySelector("symbol#mark") !== null);

  await expect(page).toHaveTitle("Last Breath, a hold-and-spin game");
  await expect(page.locator("header .logo use")).toHaveAttribute("href", "#mark");
  expect(await page.evaluate(() => document.querySelectorAll("symbol#mark path").length)).toBeGreaterThan(0);

  const href = await page.locator('link[rel="icon"]').evaluate((link) => (link as HTMLLinkElement).href);
  const icon = await page.request.get(href);
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
  expect(await icon.text()).toContain("<path");
});
