import { expect, test } from "@playwright/test";
import { diveButton, open, summary } from "./play";

test("the published site also works from the /last-breath/ sub-path", async ({ page }) => {
  await open(page, "/last-breath/");
  await expect(page.getByRole("heading", { name: "Choose a dive" })).toBeVisible();
  await page.keyboard.press("3");
  await diveButton(page).click();
  await page.keyboard.press("s");
  await expect(summary(page)).toBeVisible();
});

const contrast = (foreground: number[], background: number[]) => {
  const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};

for (const colorScheme of ["dark", "light"] as const) {
  test(`text on every tile and on the card rule meets WCAG AA in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await open(page);

    const pairs: { name: string; foreground: number[]; background: number[] }[] = await page.evaluate(() => {
      const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const probe = (classes: string, parent: Element) => {
        const element = document.createElement("div");
        element.className = classes;
        parent.append(element);
        const style = getComputedStyle(element);
        const pair = { name: classes, foreground: rgb(style.color), background: rgb(style.backgroundColor) };
        element.remove();
        return pair;
      };
      const tiles = ["tile tile-crate", "tile tile-mini", "tile tile-minor", "tile tile-major", "tile tile-tank"];
      const card = document.querySelector(".card-body")!;
      const rule = probe("rule", card);
      return [...tiles.map((classes) => probe(classes, document.body)), { ...rule, background: rgb(getComputedStyle(card).backgroundColor) }];
    });

    expect(pairs).toHaveLength(6);
    for (const { name, foreground, background } of pairs) {
      expect(contrast(foreground, background), name).toBeGreaterThanOrEqual(4.5);
    }
  });
}
