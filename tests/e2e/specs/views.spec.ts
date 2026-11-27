import { expect, test, type Page } from "@playwright/test";
import { atRest, diveButton, mathsSwitch, open, summary, tabTo } from "./play";

// The player view is the default: the board, the clock, the total and the result, and no figures for an analyst. The switch in the header turns on
// the maths view, which shows the odds line, the session tally and strip, the spin log and the figures on the cards. Seed 154 is a Classic round that
// pays 21.65 times the bet.

const analyst = [".odds", ".session", ".bars", ".legend", ".spinlog", ".side", ".ticker", ".facts", ".steps", ".plate-times", ".round-facts"];

async function finishRound(page: Page) {
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
}

const shownText = (page: Page) => page.evaluate(() => document.body.innerText);

test("the player view is the default, and it shows no odds, tally, strip, spin log or percentages", async ({ page }) => {
  await open(page, "/?seed=154");

  await expect(mathsSwitch(page)).toHaveAttribute("aria-checked", "false");
  await expect(mathsSwitch(page)).not.toBeChecked();
  for (const selector of analyst) await expect(page.locator(selector), selector).toHaveCount(0);
  await expect(page.locator(".card .waves")).toHaveCount(3);
  expect(await shownText(page)).not.toContain("%");

  await finishRound(page);
  for (const selector of analyst) await expect(page.locator(selector), selector).toHaveCount(0);
  await expect(page.locator(".result-plate").getByText("Big win")).toBeVisible();
  await expect(page.getByTestId("win")).toHaveText("21.65");
  expect(await shownText(page)).not.toContain("%");
  expect(await shownText(page)).not.toMatch(/×/);
  await expect(page.locator("[aria-live]")).toHaveCount(1);
});

test("the switch shows the maths on the cards, on the plate and beside the board, and takes it away again", async ({ page }) => {
  await open(page, "/?seed=154");

  await mathsSwitch(page).click();
  await expect(mathsSwitch(page)).toBeChecked();
  await expect(page.locator(".card .facts")).toHaveCount(3);
  await expect(page.locator(".card .facts").first()).toContainText("RTP");
  await expect(page.locator(".card .facts").first()).toContainText("%");
  await expect(page.locator(".steps")).toBeVisible();

  await finishRound(page);
  for (const selector of [".odds", ".session", ".bars", ".legend", ".spinlog", ".side", ".plate-times", ".round-facts"]) await expect(page.locator(selector), selector).toBeVisible();
  await expect(page.locator(".plate-times")).toHaveText("21.65× bet");
  await expect(page.locator("[aria-live]")).toHaveCount(1);

  await mathsSwitch(page).click();
  await expect(mathsSwitch(page)).not.toBeChecked();
  for (const selector of [".odds", ".session", ".side", ".plate-times"]) await expect(page.locator(selector), selector).toHaveCount(0);
  await expect(page.getByTestId("win")).toHaveText("21.65");
});

test("the switch is remembered after a reload", async ({ page }) => {
  await open(page);
  await mathsSwitch(page).click();
  await expect(page.locator(".card .facts")).toHaveCount(3);

  await page.reload();
  await expect(diveButton(page)).toBeVisible({ timeout: 60_000 });
  await expect(mathsSwitch(page)).toBeChecked();
  await expect(page.locator(".card .facts")).toHaveCount(3);

  await mathsSwitch(page).click();
  await page.reload();
  await expect(diveButton(page)).toBeVisible({ timeout: 60_000 });
  await expect(mathsSwitch(page)).not.toBeChecked();
  await expect(page.locator(".card .facts")).toHaveCount(0);
});

test("with storage blocked the switch still works for the visit, and nothing fails", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await open(page, "/?seed=154");
  await expect(mathsSwitch(page)).not.toBeChecked();
  await mathsSwitch(page).click();
  await expect(mathsSwitch(page)).toBeChecked();
  await finishRound(page);
  await expect(page.locator(".odds")).toBeVisible();
  await expect(page.locator("#blazor-error-ui")).toBeHidden();
  expect(errors).toEqual([]);
});

test("the switch is reached and turned with the keyboard, and says its state", async ({ page }) => {
  await open(page);

  await tabTo(page, mathsSwitch(page));
  await expect(mathsSwitch(page)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(mathsSwitch(page)).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".card .facts")).toHaveCount(3);
  await page.keyboard.press("Enter");
  await expect(mathsSwitch(page)).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".card .facts")).toHaveCount(0);

  const ring = await mathsSwitch(page).evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(ring).toBe("solid");
  // The name stays whole on every screen, and it contains the word that is shown.
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(mathsSwitch(page)).toHaveAccessibleName("Show the maths");
    expect((await mathsSwitch(page).innerText()).trim()).toMatch(/maths$/);
  }
});

const screens = [
  { width: 2560, height: 1440 },
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1024, height: 700 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
  { width: 390, height: 844 },
];

// Every control that is meant to be on the screen is wholly inside it, and the page does not scroll either way. In the player view nothing scrolls at
// all. The maths view on a phone held upright has the side panel under the board, so the part between the header and the footer scrolls there.
async function expectFit(page: Page, controls: string[], label: string, player: boolean) {
  const found = await page.evaluate((selectors) => {
    const main = document.querySelector("main")!;
    const boxes = selectors.flatMap((selector) =>
      [...document.querySelectorAll(selector)]
        .filter((element) => (element as HTMLElement).offsetParent !== null)
        .map((element) => {
          const box = element.getBoundingClientRect();
          return { selector, left: box.left, top: box.top, right: box.right, bottom: box.bottom };
        }),
    );
    return {
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      inner: [innerWidth, innerHeight],
      mainOver: main.scrollHeight - main.clientHeight,
      mainWide: main.scrollWidth - main.clientWidth,
      boxes,
    };
  }, controls);
  const [width, height] = found.inner;
  expect(found.scrollHeight, `${label}: the page does not scroll`).toBeLessThanOrEqual(height);
  expect(found.scrollWidth, `${label}: the page does not scroll sideways`).toBeLessThanOrEqual(width);
  expect(found.mainWide, `${label}: nothing scrolls sideways`).toBeLessThanOrEqual(0);
  if (player) expect(found.mainOver, `${label}: everything fits without scrolling`).toBeLessThanOrEqual(1);
  expect(found.boxes.length, `${label}: controls found`).toBeGreaterThanOrEqual(controls.length);
  for (const box of found.boxes) {
    const where = `${label}: ${box.selector} at ${Math.round(box.left)},${Math.round(box.top)} to ${Math.round(box.right)},${Math.round(box.bottom)}`;
    expect(box.left, where).toBeGreaterThanOrEqual(-0.5);
    expect(box.top, where).toBeGreaterThanOrEqual(-0.5);
    expect(box.right, where).toBeLessThanOrEqual(width + 0.5);
    expect(box.bottom, where).toBeLessThanOrEqual(height + 0.5);
  }
}

const always = ["header .switch", "header button[aria-keyshortcuts=M]", "footer button", "footer .toggle"];

for (const maths of [false, true]) {
  for (const viewport of screens) {
    test(`${maths ? "maths" : "player"} view at ${viewport.width} by ${viewport.height}: no scroll and no control cut off, from the selection to the end of a round`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page, "/?seed=4", { maths });
      const label = `${maths ? "maths" : "player"} ${viewport.width} by ${viewport.height}`;
      await expectFit(page, [...always, ".chip span", ".dive"], `${label}, selection`, !maths);
      const cards = await page.evaluate(() => [...document.querySelectorAll(".card-body")].map((card) => [card.getBoundingClientRect().left, card.getBoundingClientRect().right]));
      for (const [left, right] of cards) {
        expect(left, `${label}: a card starts on the screen`).toBeGreaterThanOrEqual(0);
        expect(right, `${label}: a card ends on the screen`).toBeLessThanOrEqual(viewport.width);
      }
      const outside = await page.evaluate(() =>
        [...document.querySelectorAll(".card-body")].flatMap((card) => {
          const edge = card.getBoundingClientRect().right;
          return [...card.querySelectorAll(".wave, .rule, .name, .fact")].filter((part) => part.getBoundingClientRect().right > edge + 0.5).map((part) => part.className.baseVal ?? part.className);
        }),
      );
      expect(outside, `${label}: nothing runs past the edge of its card`).toEqual([]);

      // Seed 4 is a Tank round, whose clock has the most to draw.
      await page.keyboard.press("3");
      await diveButton(page).click();
      await expect(page.getByTestId("gain")).toBeVisible();
      await expectFit(page, [...always, ".board-foot button"], `${label}, in play`, !maths);

      await page.keyboard.press("s");
      await expect(summary(page)).toBeVisible();
      await atRest(page);
      await expectFit(page, [...always, ".board-foot button"], `${label}, at the end`, !maths);
      await expect(page.getByRole("button", { name: "Dive again" })).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("button", { name: "Change dive" })).toBeInViewport({ ratio: 1 });
    });
  }
}
