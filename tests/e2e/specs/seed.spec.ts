import { expect, test, type Page } from "@playwright/test";
import { diveButton, open, summary } from "./play";

async function playOneRound(page: Page) {
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
}

async function seedShown(page: Page) {
  await page.keyboard.press("m");
  const seed = await page.getByTestId("seed").textContent();
  await page.keyboard.press("Escape");
  return seed;
}

test("without ?seed= every page load takes a fresh random seed", async ({ browser }) => {
  const seeds: (string | null)[] = [];
  for (let visit = 0; visit < 2; visit++) {
    const page = await (await browser.newContext()).newPage();
    await open(page);
    await playOneRound(page);
    seeds.push(await seedShown(page));
  }

  expect(seeds[0]).toMatch(/^\d{1,20}$/);
  expect(seeds[1]).toMatch(/^\d{1,20}$/);
  expect(seeds[0]).not.toBe(seeds[1]);
});

test("?seed= fixes the first round, and the next round uses the seed plus one", async ({ page }) => {
  await open(page, "/?seed=4");
  await playOneRound(page);
  expect(await seedShown(page)).toBe("4");

  await page.getByRole("button", { name: "Dive again" }).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  expect(await seedShown(page)).toBe("5");
});

test("a seed that is not a number is ignored", async ({ page }) => {
  await open(page, "/?seed=abc");
  await playOneRound(page);

  expect(await seedShown(page)).toMatch(/^\d{1,20}$/);
});
