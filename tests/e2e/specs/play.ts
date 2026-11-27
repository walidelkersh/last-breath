import { expect, type Page } from "@playwright/test";

export const dives = [
  { name: "Classic Dive", key: "1" },
  { name: "Drift Dive", key: "2" },
  { name: "Tank Dive", key: "3" },
];

// The page waits for the game to load before it shows the Dive button. The player view is the default; { maths: true } opens the page with the
// maths view on, as a visitor who turned the switch on earlier would find it.
export async function open(page: Page, path = "/", { maths = false } = {}) {
  if (maths) await page.addInitScript(() => localStorage.setItem("lastbreath.maths", "1"));
  await page.goto(path);
  await expect(diveButton(page)).toBeVisible({ timeout: 60_000 });
}

export const mathsSwitch = (page: Page) => page.getByRole("switch", { name: "Show the maths" });

export const diveButton = (page: Page) => page.getByRole("button", { name: "Dive", exact: true });

export const summary = (page: Page) => page.getByRole("region", { name: "Round over" });

// The result rises into the console when a round ends. A test that measures the console waits for it to come to rest.
export const atRest = (page: Page) =>
  expect.poll(() => page.evaluate(() => document.querySelector(".board-foot")?.getAnimations({ subtree: true }).length ?? 0)).toBe(0);

export const cents = (text: string | null) => Math.round(Number((text ?? "").replace(/,/g, "")) * 100);

export const credits = (amount: number) =>
  (amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function balance(page: Page) {
  return cents(await page.getByTestId("balance").textContent());
}

// Tab until the target has focus, so a test that says keyboard only really never clicks. Chromium wraps round through the browser's toolbar, but
// Firefox and WebKit under test stop at the last control, so when a press moves nothing the helper goes back the other way.
export async function tabTo(page: Page, target: ReturnType<Page["locator"]>) {
  let key = "Tab";
  for (let presses = 0; presses < 15; presses++) {
    await page.keyboard.press(key);
    if (await target.evaluate((element) => element === document.activeElement)) return;
    const stuck = await page.evaluate(() => {
      const before = (window as any).lastFocus;
      (window as any).lastFocus = document.activeElement;
      return before === document.activeElement;
    });
    if (stuck) key = "Shift+Tab";
  }
  throw new Error("the target never received focus by Tab");
}

// Chooses a bet by clicking its chip, as a visitor does. The radio itself is a one pixel input that sits just outside the chip.
export const chooseBet = (page: Page, amount: string) => page.locator(".chips").getByText(amount, { exact: true }).click();

// Records whether an animation class or a running animation ever existed, so a test can assert "never" and not just "not now".
export async function watchAnimations(page: Page) {
  await page.addInitScript(() => {
    (window as any).sawAnimation = false;
    new MutationObserver(() => {
      if (document.querySelector(".anim-in, .anim-fly, .splash, .sparkle, .burst, .celebrate, .pulse") || document.getAnimations().length > 0) (window as any).sawAnimation = true;
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}

export const sawAnimation = (page: Page) => page.evaluate(() => (window as any).sawAnimation as boolean);
