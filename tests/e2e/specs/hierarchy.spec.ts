import { expect, test } from "@playwright/test";
import { atRest, diveButton, open, summary } from "./play";

// The serif face belongs to the wordmark and to the result plate and nowhere else, and headings are sans. The board is the one thing to
// look at: its buttons are on the console at its foot in both views, and the side panel of the maths view stands beside it.

test.use({ viewport: { width: 1280, height: 800 } });

test("the serif face is on the wordmark and the result plate only, and the headings are bold sans", async ({ page }) => {
  // WebKit writes a computed font-family without the quotes round a name, so both sides are read without them.
  const serifElements = () =>
    page.evaluate(() => {
      const plain = (value: string) => value.replace(/["']/g, "");
      const serif = plain(getComputedStyle(document.documentElement).getPropertyValue("--serif").trim());
      return [...document.body.querySelectorAll("*")]
        .filter((element) => plain(getComputedStyle(element).fontFamily) === serif)
        .map((element) => ({ tag: element.tagName.toLowerCase(), where: element.closest(".brand") ? "brand" : element.closest(".result-plate") ? "plate" : "elsewhere" }));
    });
  const headings = () =>
    page.evaluate(() => {
      const plain = (value: string) => value.replace(/["']/g, "");
      const sans = plain(getComputedStyle(document.documentElement).getPropertyValue("--sans").trim());
      return [...document.querySelectorAll("h2, h3")].map((heading) => ({ text: heading.textContent!.trim(), sans: plain(getComputedStyle(heading).fontFamily) === sans, weight: Number(getComputedStyle(heading).fontWeight) }));
    });

  await open(page, "/?seed=154");
  const onSelection = await serifElements();
  expect(onSelection.length).toBeGreaterThan(0);
  expect(onSelection.every((found) => found.where === "brand")).toBe(true);
  for (const heading of await headings()) expect(heading.sans, `${heading.text} is set in the sans face`).toBe(true);

  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  const afterRound = await serifElements();
  expect(afterRound.filter((found) => found.where === "plate").length).toBeGreaterThan(0);
  expect(afterRound.filter((found) => found.where === "elsewhere")).toEqual([]);
  const roundHeadings = await headings();
  expect(roundHeadings.length).toBeGreaterThan(1);
  for (const heading of roundHeadings) {
    expect(heading.sans, `${heading.text} is set in the sans face`).toBe(true);
    expect(heading.weight, `${heading.text} is bold`).toBeGreaterThanOrEqual(700);
  }
});

test("the prizes are one slim row of four, with Grand wider and tinted, and the medal beside its figures", async ({ page }) => {
  await open(page, "/?seed=154");
  await diveButton(page).click();

  const row = await page.evaluate(() => {
    const strip = document.querySelector(".prizes")!;
    const cards = [...strip.querySelectorAll(".prize")];
    const widths = getComputedStyle(strip).gridTemplateColumns.split(" ").map(parseFloat);
    const grand = cards.find((card) => card.classList.contains("grand"))!;
    const plain = cards.find((card) => !card.classList.contains("grand"))!;
    const medal = plain.querySelector(".medal")!.getBoundingClientRect();
    const text = plain.querySelector(".prize-text")!.getBoundingClientRect();
    return {
      count: cards.length,
      widths,
      height: strip.getBoundingClientRect().height,
      board: document.querySelector(".stage")!.getBoundingClientRect().width,
      grandBackground: getComputedStyle(grand).backgroundColor,
      plainBackground: getComputedStyle(plain).backgroundColor,
      medalRight: medal.right,
      textLeft: text.left,
      medalCentre: (medal.top + medal.bottom) / 2,
      textCentre: (text.top + text.bottom) / 2,
    };
  });
  expect(row.count).toBe(4);
  expect(row.widths).toHaveLength(4);
  expect(row.widths[0]).toBeCloseTo(row.widths[1], 0);
  expect(row.widths[1]).toBeCloseTo(row.widths[2], 0);
  expect(row.widths[3] / row.widths[0]).toBeCloseTo(1.5, 1);
  expect(row.grandBackground).not.toBe(row.plainBackground);
  expect(row.medalRight).toBeLessThanOrEqual(row.textLeft + 1);
  expect(Math.abs(row.medalCentre - row.textCentre)).toBeLessThan(4);
  expect(row.height / row.board, "the strip is a slim row").toBeLessThan(0.14);
});

test("the board stands alone in the player view, and in the maths view the side panel stands beside it as tall as the row", async ({ page }) => {
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await expect(page.locator(".side")).toHaveCount(0);
  const alone = await page.evaluate(() => {
    const stage = document.querySelector(".stage")!.getBoundingClientRect();
    return { left: stage.left, right: innerWidth - stage.right };
  });
  expect(Math.abs(alone.left - alone.right), "the board is in the middle").toBeLessThan(2);

  await open(page, "/?seed=154", { maths: true });
  await diveButton(page).click();
  await expect(page.locator(".session")).toHaveCount(0);
  const during = await page.evaluate(() => {
    const side = document.querySelector(".side")!.getBoundingClientRect();
    const stage = document.querySelector(".stage")!.getBoundingClientRect();
    const skip = document.querySelector(".board-foot .actions button")!.getBoundingClientRect();
    const board = document.querySelector(".board")!.getBoundingClientRect();
    const name = document.querySelector(".round-name")!;
    const style = getComputedStyle(name);
    const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();
    const probe = document.createElement("i");
    probe.style.color = muted;
    document.body.append(probe);
    const mutedColour = getComputedStyle(probe).color;
    probe.remove();
    return {
      sideTop: side.top, stageTop: stage.top, sideBottom: side.bottom, stageBottom: stage.bottom, sideLeft: side.left, stageRight: stage.right,
      skipInside: skip.left >= board.left && skip.right <= board.right && skip.bottom <= board.bottom,
      nameColour: style.color, mutedColour, nameSize: parseFloat(style.fontSize), rootSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
      skipClass: document.querySelector(".board-foot .actions button")!.className,
    };
  });
  expect(during.sideTop).toBeLessThanOrEqual(during.stageTop + 1);
  expect(during.sideBottom).toBeGreaterThanOrEqual(during.stageBottom - 2);
  expect(during.sideLeft).toBeGreaterThanOrEqual(during.stageRight);
  expect(during.skipInside, "Skip is on the console of the board").toBe(true);
  expect(during.skipClass).not.toContain("primary");
  expect(during.nameColour).toBe(during.mutedColour);
  expect(during.nameSize).toBeLessThan(during.rootSize * 1.5);

  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  await atRest(page);
  const after = await page.evaluate(() => {
    const board = document.querySelector(".board")!.getBoundingClientRect();
    const buttons = [...document.querySelectorAll(".board-foot .actions button")].map((button) => ({ box: button.getBoundingClientRect(), primary: button.classList.contains("primary"), text: button.textContent }));
    return { inside: buttons.every(({ box }) => box.left >= board.left && box.right <= board.right && box.bottom <= board.bottom), names: buttons.map((button) => button.text), primary: buttons.map((button) => button.primary) };
  });
  expect(after.inside).toBe(true);
  expect(after.names).toEqual(["Dive again", "Change dive"]);
  expect(after.primary).toEqual([true, false]);
  await expect(page.locator(".session")).toBeVisible();
});

for (const viewport of [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1024, height: 700 }, { width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`the landed badge never lies over the name or the value of its prize at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page, "/?seed=154");
    await diveButton(page).click();
    await page.keyboard.press("s");
    await expect(summary(page)).toBeVisible();
    await atRest(page);

    const found = await page.evaluate(() => {
      const badge = document.querySelector(".prize.hit .badge")!.getBoundingClientRect();
      const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return [".prize-name", ".prize-value", ".medal"].map((selector) => ({ selector, over: overlap(badge, document.querySelector(`.prize.hit ${selector}`)!.getBoundingClientRect()) }));
    });
    expect(found.filter((item) => item.over)).toEqual([]);
  });
}

for (const viewport of [{ width: 1024, height: 700 }, { width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`the clock is at the left of the console and the board total at its right, before Skip, in a Drift round at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page, "/?seed=11");
    await page.keyboard.press("2");
    await diveButton(page).click();
    await expect(page.locator(".segment.on")).toHaveCount(5, { timeout: 15_000 });

    const found = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const foot = box(".board-foot"), clock = box(".clock"), total = box(".total"), skip = box(".board-foot .actions");
      return { foot, clock, total, skip, segments: document.querySelectorAll(".segment").length };
    });
    expect(found.segments).toBe(6);
    expect(found.clock.left - found.foot.left, "the clock starts at the left").toBeLessThan(30);
    expect(found.clock.right).toBeLessThanOrEqual(found.total.left);
    expect(found.total.right).toBeLessThanOrEqual(found.foot.right);
    if (found.skip.top < found.total.bottom) expect(found.total.right, "the total comes before Skip").toBeLessThanOrEqual(found.skip.left);
    else expect(Math.abs(found.total.right - found.skip.right), "on a narrow board the total keeps to the right edge, over Skip").toBeLessThan(2);
  });
}
