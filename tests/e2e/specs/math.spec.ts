import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { diveButton, open, summary } from "./play";

const reports = join(__dirname, "..", "..", "..", "reports");
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

  const link = panel.getByRole("link", { name: "Source on GitHub" });
  await expect(link).toHaveAttribute("href", "https://github.com/walidelkersh/last-breath");

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("the Math button opens it on both screens and a round carries on behind it", async ({ page }) => {
  await open(page, "/?seed=7");
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
