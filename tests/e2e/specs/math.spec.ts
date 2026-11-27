import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { diveButton, open, summary } from "./play";

const root = join(__dirname, "..", "..", "..");
const reports = join(root, "reports");
const repository = "https://github.com/walidelkersh/last-breath";
const read = (file: string) => JSON.parse(readFileSync(join(reports, file), "utf8"));
const solved = ["classic", "static", "tank"].map((slug) => ({
  exact: read(`solve-${slug}.json`),
  simulated: read(`simulate-${slug}.json`),
}));

const percent = (share: number, digits: number) => `${(share * 100).toFixed(digits)}%`;

test("M opens the Math panel with the frozen figures, and Escape closes it", async ({ page }) => {
  await open(page);
  const panel = page.getByRole("dialog", { name: "Math" });
  await expect(panel).toBeHidden();

  await page.keyboard.press("m");
  await expect(panel).toBeVisible();

  const row = (name: RegExp) => panel.getByRole("row", { name }).getByRole("cell");
  await expect(row(/^RTP, exact/)).toHaveText(solved.map(({ exact }) => percent(exact.rtp, 4)));
  await expect(row(/^SD, in bets/)).toHaveText(solved.map(({ exact }) => exact.sd.toFixed(2)));
  await expect(row(/^Hit frequency/)).toHaveText(solved.map(({ exact }) => percent(exact.hit_frequency, 2)));
  await expect(row(/^Mean spins/)).toHaveText(solved.map(({ exact }) => exact.mean_spins.toFixed(2)));
  await expect(row(/^Grand, 1 in/)).toHaveText(
    solved.map(({ exact }) => Math.round(1 / exact.grand_probability).toLocaleString("en-US")),
  );
  await expect(row(/^RTP, simulated/)).toHaveText(
    solved.map(({ simulated }) => new RegExp(`^${percent(simulated.mean_award.simulated, 4).replace(".", "\\.")}`)),
  );
  await expect(panel.getByText("no round yet")).toBeVisible();

  const links = {
    "Math in full": "math.md",
    "PAR sheet": "par-sheet.md",
    "Game design": "game-design.md",
  };
  for (const [name, file] of Object.entries(links)) {
    await expect(panel.getByRole("link", { name })).toHaveAttribute("href", `${repository}/blob/main/docs/${file}`);
    expect(existsSync(join(root, "docs", file)), `docs/${file} exists`).toBe(true);
  }
  await expect(panel.getByRole("link", { name: "Source on GitHub" })).toHaveAttribute("href", repository);

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("in the player view the switch is the one maths control, the Math button comes with the maths view, and M opens the panel in both", async ({ page }) => {
  await open(page);
  const panel = page.getByRole("dialog", { name: "Math" });
  await expect(page.locator("header button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Math", exact: true })).toHaveCount(0);
  await page.keyboard.press("m");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await page.getByRole("switch", { name: "Show the maths" }).click();
  await expect(page.getByRole("button", { name: "Math", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Math", exact: true }).click();
  await expect(panel).toBeVisible();
});

test("the Math button opens it on both screens and a round carries on behind it", async ({ page }) => {
  await open(page, "/?seed=7", { maths: true });
  const panel = page.getByRole("dialog", { name: "Math" });

  await page.getByRole("button", { name: "Math" }).click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await diveButton(page).click();
  await page.keyboard.press("m");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("seed")).toHaveText("7");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
});

test("the panel is wide on a desktop, keeps its header while the sections scroll, and limits the length of a line of prose", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  await open(page);
  await page.keyboard.press("m");
  const panel = page.getByRole("dialog", { name: "Math" });
  await expect(panel).toBeVisible();

  for (const name of ["Figures for each dive", "Session seed", "Read more"]) await expect(panel.getByRole("heading", { name })).toBeVisible();
  expect((await panel.boundingBox())!.width).toBeGreaterThan(880);
  expect((await panel.locator(".math-body > p").boundingBox())!.width).toBeLessThan(640);

  const header = panel.locator(".math-head");
  await panel.evaluate((dialog) => (dialog.scrollTop = dialog.scrollHeight));
  expect(await panel.evaluate((dialog) => dialog.scrollTop)).toBeGreaterThan(0);
  expect(Math.abs((await header.boundingBox())!.y - (await panel.boundingBox())!.y)).toBeLessThan(3);
  await expect(panel.getByRole("button", { name: "Close" })).toBeInViewport();
});

test("the replay command is whole and uses the name of the dive on the page, and the seed is the only large code", async ({ page }) => {
  for (const { key, name, word, seed } of [{ key: "1", name: "Classic Dive", word: "classic", seed: 5 }, { key: "2", name: "Drift Dive", word: "drift", seed: 11 }, { key: "3", name: "Tank Dive", word: "tank", seed: 4 }]) {
    await open(page, `/?seed=${seed}`);
    await page.keyboard.press(key);
    await diveButton(page).click();
    await page.keyboard.press("m");
    const panel = page.getByRole("dialog", { name: "Math" });

    await expect(panel.getByTestId("command")).toHaveText(`play --dive ${word} --seed ${seed}`);
    await expect(panel.getByText(`a ${name}`)).toBeVisible();
    const sizes = await panel.evaluate((dialog) => ({
      seed: parseFloat(getComputedStyle(dialog.querySelector("[data-testid=seed]")!).fontSize),
      command: parseFloat(getComputedStyle(dialog.querySelector("[data-testid=command]")!).fontSize),
    }));
    expect(sizes.command).toBeLessThan(sizes.seed);
  }
});

test("on a phone the command does not break in the middle, it scrolls, and Close is a plain button", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page, "/?seed=1234567890123", { maths: true });
  await page.keyboard.press("2");
  await diveButton(page).click();
  await page.getByRole("button", { name: "Math" }).click();
  const panel = page.getByRole("dialog", { name: "Math" });

  const command = panel.getByTestId("command");
  await command.scrollIntoViewIfNeeded();
  const found = await command.evaluate((element) => {
    const style = getComputedStyle(element);
    const range = document.createRange();
    range.selectNodeContents(element);
    return { whiteSpace: style.whiteSpace, overflowX: style.overflowX, lines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size, fitsOrScrolls: element.scrollWidth <= element.clientWidth || style.overflowX === "auto", tab: element.tabIndex };
  });
  expect(found.whiteSpace).toBe("nowrap");
  expect(found.overflowX).toBe("auto");
  expect(found.lines).toBe(1);
  expect(found.fitsOrScrolls).toBe(true);
  expect(found.tab).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  const close = panel.getByRole("button", { name: "Close" });
  const paint = await close.evaluate((button) => ({ fill: getComputedStyle(button).backgroundColor, primary: button.classList.contains("primary") }));
  expect(paint.primary).toBe(false);
  expect(paint.fill).not.toBe("rgb(224, 169, 74)");
  expect(await close.evaluate((button) => getComputedStyle(button).borderTopColor)).not.toBe("rgba(0, 0, 0, 0)");
});

test("closing the Math panel gives focus back to the Math button, in every engine, with the Close button and with Escape", async ({ page }) => {
  await open(page, "/", { maths: true });
  const panel = page.getByRole("dialog", { name: "Math" });
  const mathButton = page.getByRole("button", { name: "Math", exact: true });

  await mathButton.click();
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toBeHidden();
  await expect(mathButton).toBeFocused();

  await mathButton.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(mathButton).toBeFocused();
});

test("opened with M, the panel gives focus back to what had it", async ({ page }) => {
  await open(page);
  await expect(diveButton(page)).toBeFocused();

  await page.keyboard.press("m");
  await expect(page.getByRole("dialog", { name: "Math" })).toBeVisible();
  await page.getByRole("dialog", { name: "Math" }).getByRole("button", { name: "Close" }).click();

  await expect(diveButton(page)).toBeFocused();
});
