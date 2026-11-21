import { expect, test } from "@playwright/test";
import { diveButton, open, summary } from "./play";

test("the live region says something for every spin and for the result, and it is the only one", async ({ page }) => {
  await page.addInitScript(() => {
    const heard: string[] = [];
    (window as any).heard = heard;
    new MutationObserver(() => {
      const text = document.querySelector('[aria-live="polite"]')?.textContent?.trim();
      if (text && heard.at(-1) !== text) heard.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });

  await open(page, "/?seed=11");
  await page.keyboard.press("2");
  await diveButton(page).click();
  await expect(summary(page)).toBeVisible({ timeout: 20_000 });

  const spinsRow = summary(page).locator("div").filter({ has: page.getByText("Spins", { exact: true }) });
  const spins = Number(await spinsRow.locator("dd").textContent());
  const heard: string[] = await page.evaluate(() => (window as any).heard);

  expect(heard).toHaveLength(spins + 1);
  for (let spin = 1; spin <= spins; spin++) expect(heard[spin - 1]).toMatch(new RegExp(`^Spin ${spin}\\. `));
  expect(heard[spins]).toMatch(new RegExp(`^Round over after ${spins} spins\\. `));
  await expect(page.locator("[aria-live]")).toHaveCount(1);
});

// Seed 4 is the first Tank seed whose first spin lands two air tanks (+1 and +2), found with
// "lab play --dive tank --seed 4". Its second spin lands a +2, and the round pays 0.45 over 9 spins.
test("a Tank round that lands tanks shows the +n effect and counts the spare tanks down", async ({ page }) => {
  await open(page, "/?seed=4");
  await page.keyboard.press("3");
  await diveButton(page).click();

  await expect(page.getByTestId("gain")).toHaveText("+3");
  await expect(page.getByRole("img", { name: /air tank, plus 1 breath$/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /air tank, plus 2 breaths$/ })).toBeVisible();
  await expect(page.getByText("Spare tanks 1 of 3", { exact: true })).toBeVisible();
  await expect(page.locator(".clock-text", { hasText: "Air 6" })).toBeVisible();

  await expect(page.getByTestId("gain")).toHaveText("+2");
  await expect(page.getByText("Spare tanks 0 of 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /air tank/ })).toHaveCount(1);

  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
  await expect(page.getByTestId("win")).toHaveText("0.45");
});
