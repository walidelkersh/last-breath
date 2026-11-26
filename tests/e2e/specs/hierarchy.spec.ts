import { expect, test } from "@playwright/test";
import { diveButton, open, summary } from "./play";

// The serif face belongs to the wordmark and to the result plate and nowhere else, headings are sans, and the round
// screen reads in order: the board, then its side panel, with the actions at its foot.

test.use({ viewport: { width: 1280, height: 800 } });

test("the serif face is on the wordmark and the result plate only, and the headings are bold sans", async ({ page }) => {
  const serifElements = () =>
    page.evaluate(() => {
      const serif = getComputedStyle(document.documentElement).getPropertyValue("--serif").trim();
      return [...document.body.querySelectorAll("*")]
        .filter((element) => getComputedStyle(element).fontFamily === serif)
        .map((element) => ({ tag: element.tagName.toLowerCase(), where: element.closest(".brand") ? "brand" : element.closest(".result-plate") ? "plate" : "elsewhere" }));
    });
  const headings = () =>
    page.evaluate(() => {
      const sans = getComputedStyle(document.documentElement).getPropertyValue("--sans").trim();
      return [...document.querySelectorAll("h2, h3")].map((heading) => ({ text: heading.textContent!.trim(), sans: getComputedStyle(heading).fontFamily === sans, weight: Number(getComputedStyle(heading).fontWeight) }));
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

test("the side panel is as tall as the board, with its actions pinned at the foot and full width", async ({ page }) => {
  await open(page, "/?seed=154");
  await diveButton(page).click();
  await expect(page.locator(".session")).toHaveCount(0);

  const during = await page.evaluate(() => {
    const side = document.querySelector(".side")!.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(document.querySelector(".side")!).paddingBottom);
    const stage = document.querySelector(".stage")!.getBoundingClientRect();
    const actions = document.querySelector(".actions")!.getBoundingClientRect();
    const skip = document.querySelector(".actions button")!.getBoundingClientRect();
    const name = document.querySelector(".round-head h2")!;
    const style = getComputedStyle(name);
    const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();
    const probe = document.createElement("i");
    probe.style.color = muted;
    document.body.append(probe);
    const mutedColour = getComputedStyle(probe).color;
    probe.remove();
    return {
      pad, sideTop: side.top, stageTop: stage.top, sideBottom: side.bottom, stageBottom: stage.bottom,
      actionsBottom: actions.bottom, skipWidth: skip.width, actionsWidth: actions.width,
      nameColour: style.color, mutedColour, nameSize: parseFloat(style.fontSize), rootSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
      skipClass: document.querySelector(".actions button")!.className,
    };
  });
  expect(during.sideTop).toBeLessThanOrEqual(during.stageTop + 1);
  expect(during.sideBottom).toBeGreaterThanOrEqual(during.stageBottom - 2);
  expect(during.actionsBottom).toBeGreaterThanOrEqual(during.sideBottom - during.pad - 2);
  expect(during.skipWidth).toBeCloseTo(during.actionsWidth, 0);
  expect(during.skipClass).not.toContain("primary");
  expect(during.nameColour).toBe(during.mutedColour);
  expect(during.nameSize).toBeLessThan(during.rootSize * 1.5);

  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  const after = await page.evaluate(() => {
    const side = document.querySelector(".side")!.getBoundingClientRect();
    const buttons = [...document.querySelectorAll(".actions button")].map((button) => button.getBoundingClientRect());
    const actions = document.querySelector(".actions")!.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(document.querySelector(".side")!).paddingBottom);
    return { pad, sideBottom: side.bottom, actionsBottom: actions.bottom, widths: buttons.map((box) => box.width), actionsWidth: actions.width, gap: buttons[1].left - buttons[0].right };
  });
  expect(after.actionsBottom).toBeGreaterThanOrEqual(after.sideBottom - after.pad - 2);
  expect(after.widths[0] + after.widths[1] + after.gap).toBeCloseTo(after.actionsWidth, 0);
  await expect(page.locator(".session")).toBeVisible();
});

for (const viewport of [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1024, height: 700 }, { width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`the landed badge never lies over the name or the value of its prize at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page, "/?seed=154");
    await diveButton(page).click();
    await page.keyboard.press("s");
    await expect(summary(page)).toBeVisible();

    const found = await page.evaluate(() => {
      const badge = document.querySelector(".prize.hit .badge")!.getBoundingClientRect();
      const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return [".prize-name", ".prize-value", ".medal"].map((selector) => ({ selector, over: overlap(badge, document.querySelector(`.prize.hit ${selector}`)!.getBoundingClientRect()) }));
    });
    expect(found.filter((item) => item.over)).toEqual([]);
  });
}

for (const viewport of [{ width: 1024, height: 700 }, { width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`the Board total of a Drift round keeps to the right edge even when the segments wrap, at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page, "/?seed=11");
    await page.keyboard.press("2");
    await diveButton(page).click();
    await expect(page.locator(".spin")).toHaveText(/^Spin [1-9]/, { timeout: 15_000 });

    const found = await page.evaluate(() => {
      const hud = document.querySelector(".hud")!.getBoundingClientRect();
      const total = document.querySelector(".total")!.getBoundingClientRect();
      const clock = document.querySelector(".clock")!.getBoundingClientRect();
      return { hud: hud.right, total: total.right, wrapped: total.top >= clock.bottom - 1, margin: getComputedStyle(document.querySelector(".total")!).marginLeft };
    });
    expect(Math.abs(found.total - found.hud), "flush with the right edge of the head").toBeLessThan(1.5);
    expect(found.margin).not.toBe("0px");
  });
}
