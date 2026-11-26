import { expect, test } from "@playwright/test";
import { balance, cents, chooseBet, credits, diveButton, dives, open, summary, tabTo } from "./play";

const screens = [
  { where: "", viewport: { width: 1280, height: 720 } },
  { where: " on a phone", viewport: { width: 390, height: 844 } },
];

for (const { where, viewport } of screens) for (const dive of dives) {
  test(`${dive.name} is played to the end by keyboard${where} and the balance moves by the win minus the bet`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    const before = await balance(page);

    await page.keyboard.press(dive.key);
    await expect(page.getByRole("radio", { name: dive.name })).toBeChecked();
    await tabTo(page, diveButton(page));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Skip" })).toBeFocused();

    await page.keyboard.press("s");
    await expect(summary(page)).toBeFocused();
    const win = cents(await page.getByTestId("win").textContent());
    const bet = 100;
    await expect(page.getByTestId("balance")).toHaveText(credits(before - bet + win));

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Dive again" })).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(diveButton(page)).toBeFocused();
  });
}

test("a round that is left alone plays out by itself and ends with the same accounting", async ({ page }) => {
  await open(page, "/?seed=11");
  const before = await balance(page);

  await page.keyboard.press("2");
  await diveButton(page).click();
  await expect(summary(page)).toBeVisible({ timeout: 20_000 });

  const win = cents(await page.getByTestId("win").textContent());
  await expect(page.getByTestId("balance")).toHaveText(credits(before - 100 + win));
});

test("the dive and the bet are remembered after a reload", async ({ page }) => {
  await open(page);
  await page.keyboard.press("2");
  await chooseBet(page, "4.00");

  await page.reload();
  await expect(diveButton(page)).toBeVisible({ timeout: 60_000 });

  await expect(page.getByRole("radio", { name: "Drift Dive" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "4.00", exact: true })).toBeChecked();
});

test("storage that throws does not stop the page from rendering or playing", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await open(page);
  const before = await balance(page);
  await page.keyboard.press("3");
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();

  const win = cents(await page.getByTestId("win").textContent());
  await expect(page.getByTestId("balance")).toHaveText(credits(before - 100 + win));
  await expect(page.locator("#blazor-error-ui")).toBeHidden();
  expect(errors).toEqual([]);
});
