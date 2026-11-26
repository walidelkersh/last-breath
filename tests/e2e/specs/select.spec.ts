import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chooseBet, diveButton, open } from "./play";

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

test("the heading says what the game is, and the line under it says what to do without saying it again", async ({ page }) => {
  await open(page);

  await expect(page.getByRole("heading", { name: "Salvage what you can before your air runs out." })).toBeVisible();
  await expect(page.locator(".lede")).toHaveText("Choose a dive. One bet buys one round.");
  await expect(page.getByRole("radiogroup", { name: "Choose a dive. One bet buys one round." })).toBeVisible();
});

test("the selection starts at the top of the page, under the header, and does not centre itself in a tall window", async ({ page }) => {
  for (const height of [800, 1440]) {
    await page.setViewportSize({ width: 1280, height });
    await open(page);
    const gap = await page.evaluate(() => document.querySelector(".select h2")!.getBoundingClientRect().top - document.querySelector(".top")!.getBoundingClientRect().bottom);
    expect(gap, `${height} high`).toBeLessThan(80);
  }
});

test("a strip of three steps explains the game, each drawn from symbols that are in the sprite", async ({ page }) => {
  await open(page);
  await page.waitForFunction(() => document.querySelector("symbol#panel") !== null);

  const steps = page.getByRole("list", { name: "How a round goes" }).getByRole("listitem");
  await expect(steps).toHaveText([
    /^\s*1\s*The board starts empty\s*$/,
    /^\s*2\s*Crates land and lock in their cell\s*$/,
    /^\s*3\s*When the breaths run out, you surface\s*$/,
  ]);
  const drawn = await page.evaluate(() =>
    [...document.querySelectorAll(".steps li")].map((step) => {
      const hrefs = [...step.querySelectorAll<SVGUseElement>("use")].map((use) => use.getAttribute("href")!);
      return { hrefs, missing: hrefs.filter((href) => (document.querySelector(`symbol${href}`)?.querySelectorAll("path").length ?? 0) === 0) };
    }),
  );
  expect(drawn.flatMap((step) => step.missing)).toEqual([]);
  expect(drawn[0].hrefs.filter((href) => href.startsWith("#well"))).toHaveLength(3);
  expect(drawn[1].hrefs.filter((href) => href.startsWith("#crate")).length).toBeGreaterThan(0);
  expect(drawn[2].hrefs).toEqual(expect.arrayContaining(["#bottle-full", "#bottle-low", "#bottle-empty"]));
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
  test(`Dive and the bet are on screen without scrolling at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);

    for (const target of [page.getByRole("button", { name: "Dive", exact: true }), page.locator(".chips")]) {
      const box = (await target.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    if (viewport.height !== 768) {
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height);
    }
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

test("on a first visit the Dive button has focus without the page having moved, so Enter starts a round", async ({ page }) => {
  await open(page);

  await expect(diveButton(page)).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
});

test("the Dive button does not take focus from a control that already has it", async ({ page }) => {
  await open(page);
  await page.getByRole("radio", { name: "4.00", exact: true }).focus();

  await page.evaluate(() => (window as any).lastBreath.focusIfIdle(document.querySelector(".dive")));

  await expect(page.getByRole("radio", { name: "4.00", exact: true })).toBeFocused();
});

test("keyboard focus on a card shows a ring that stands off the card", async ({ page, browserName }) => {
  await open(page);
  const ringOn = (name: string) =>
    page.locator(".card", { has: page.getByText(name, { exact: true }) }).locator(".card-body").evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.outlineWidth, offset: style.outlineOffset, style: style.outlineStyle };
    });
  const ring = { width: "3px", offset: "4px", style: "solid" };

  await page.getByRole("radio", { name: "Classic Dive" }).focus();
  expect(await ringOn("Classic Dive")).toEqual(ring);
  await page.keyboard.press("ArrowRight");

  await expect(page.getByRole("radio", { name: "Drift Dive" })).toBeFocused();
  // WebKit does not match :focus-visible on a radio that an arrow key has just focused. The choice still moves with the focus and the chosen card has its heavy edge.
  if (browserName !== "webkit") expect(await ringOn("Drift Dive")).toEqual(ring);
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
    // Back at the top, so that the Tank card is below the fold whatever the engine did when it took focus: WebKit scrolls to a card that is wholly out of view, but not to one that is partly in it.
    await page.evaluate(() => scrollTo(0, 0));
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");

    const card = (await page.locator(".card", { has: page.getByText("Tank Dive", { exact: true }) }).locator(".card-body").boundingBox())!;
    const bar = (await page.locator(".stake").boundingBox())!;
    expect(card.y + card.height).toBeLessThanOrEqual(bar.y);
  });

  test("a bet can be chosen from the bar and a round started from it", async ({ page }) => {
    await open(page);
    await chooseBet(page, "2.00");
    await page.getByRole("button", { name: "Dive", exact: true }).click();

    await expect(page.getByText("Bet 2.00")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`on a phone on its side at ${viewport.width} by ${viewport.height} the selection does not scroll sideways, and the Tank card, the bets and Dive are whole`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await page.getByRole("radio", { name: "Tank Dive" }).focus();

    const found = await page.evaluate(() => {
      const box = (selector: string) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      };
      const cards = [...document.querySelectorAll(".card-body")].map((card) => card.getBoundingClientRect());
      return { scrollWidth: document.documentElement.scrollWidth, tank: cards[2].right, tankLeft: cards[2].left, dive: box(".dive"), chips: box(".chips"), cards: cards.length };
    });
    expect(found.scrollWidth).toBeLessThanOrEqual(viewport.width);
    expect(found.cards).toBe(3);
    expect(found.tankLeft).toBeGreaterThan(0);
    expect(found.tank).toBeLessThanOrEqual(viewport.width);
    expect(found.dive.right).toBeLessThanOrEqual(viewport.width);
    expect(found.dive.width, "Dive is wide enough to press").toBeGreaterThan(140);
    expect(found.chips.right).toBeLessThanOrEqual(found.dive.left);

    const names = await page.evaluate(() => [...document.querySelectorAll(".name")].map((name) => Math.round(name.getBoundingClientRect().height / parseFloat(getComputedStyle(name).lineHeight || "0") || 1)));
    expect(names, "the three names are on one line each").toEqual([1, 1, 1]);
  });
}

test("the cards leave out about where the mean number of spins is a whole number within 0.01, as Drift is exactly six, and Tank says how many tanks a round", async ({ page }) => {
  await open(page);

  const length = async (name: string) =>
    (await page.locator(".card", { has: page.getByText(name, { exact: true }) }).locator(".fact", { hasText: "Typical length" }).locator(".fact-value").textContent())!.trim();
  // Written again from the reports: Classic 7.40, Drift 6.00 and Tank 5.01 rounded to a whole number, with about unless the mean is within 0.01 of it.
  const expected = (slug: string) => {
    const mean = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "reports", `solve-${slug}.json`), "utf8")).mean_spins as number;
    return `${Math.abs(mean - Math.round(mean)) <= 0.01 ? "" : "about "}${Math.round(mean)} spins`;
  };
  expect(await length("Classic Dive")).toBe(expected("classic"));
  expect(await length("Drift Dive")).toBe(expected("static"));
  expect(await length("Tank Dive")).toBe(expected("tank"));
  expect(await length("Drift Dive")).toBe("6 spins");
  expect(await length("Classic Dive")).toBe("about 7 spins");
  await expect(page.locator(".card", { has: page.getByText("Tank Dive", { exact: true }) }).locator(".rule")).toHaveText("Four breaths with no refill. Air tanks add breaths, up to three tanks a round.");
});
