import { expect, type Page } from "@playwright/test";

export const dives = [
  { name: "Classic Dive", key: "1" },
  { name: "Drift Dive", key: "2" },
  { name: "Tank Dive", key: "3" },
];

// The page waits for the game to load before it shows the Dive button.
export async function open(page: Page, path = "/") {
  await page.goto(path);
  await expect(diveButton(page)).toBeVisible({ timeout: 60_000 });
}

export const diveButton = (page: Page) => page.getByRole("button", { name: "Dive", exact: true });

export const summary = (page: Page) => page.getByRole("region", { name: "Round over" });

export const cents = (text: string | null) => Math.round(Number((text ?? "").replace(/,/g, "")) * 100);

export const credits = (amount: number) =>
  (amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function balance(page: Page) {
  return cents(await page.getByTestId("balance").textContent());
}

// Tab until the target has focus, so a test that says keyboard only really never clicks.
export async function tabTo(page: Page, target: ReturnType<Page["locator"]>) {
  for (let presses = 0; presses < 15; presses++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error("the target never received focus by Tab");
}

// Records whether an animation class or a running animation ever existed, so a test can assert "never" and not just "not now".
export async function watchAnimations(page: Page) {
  await page.addInitScript(() => {
    (window as any).sawAnimation = false;
    new MutationObserver(() => {
      if (document.querySelector(".anim-in, .anim-fly") || document.getAnimations().length > 0) (window as any).sawAnimation = true;
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}

export const sawAnimation = (page: Page) => page.evaluate(() => (window as any).sawAnimation as boolean);
