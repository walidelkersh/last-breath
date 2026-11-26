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
  test(`text on every tile, on the cards, on the chosen controls and on the page meets WCAG AA in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await open(page);
    // The plate colours come from the art sprite, which the page loads after the game starts.
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--art-plate") !== "");

    const pairs: { name: string; foreground: number[]; background: number[]; opaque: boolean }[] = await page.evaluate(() => {
      const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
      const pair = (name: string, text: Element, surface: Element) => {
        const background = channels(getComputedStyle(surface).backgroundColor);
        return { name, foreground: channels(getComputedStyle(text).color).slice(0, 3), background: background.slice(0, 3), opaque: (background[3] ?? 1) === 1 };
      };
      const probe = (classes: string, parent: Element, surface?: Element, tag = "div") => {
        const element = document.createElement(tag);
        element.className = classes;
        parent.append(element);
        const result = pair(classes, element, surface ?? element);
        element.remove();
        return result;
      };
      const plate = (kind: string) => {
        const tile = document.createElement("div");
        tile.className = `tile tile-${kind} tile-drawn`;
        tile.innerHTML = '<span class="tile-plate"></span>';
        document.body.append(tile);
        const result = pair(`plate on tile-${kind}`, tile.firstElementChild!, tile.firstElementChild!);
        tile.remove();
        return result;
      };
      const card = document.querySelector(".card-body")!;
      const chosen = document.querySelector(".card input:checked + .card-body")!;
      const chip = document.querySelector(".chip input:checked + span")!;
      const box = document.createElement("section");
      box.className = "summary";
      document.body.append(box);
      const bigWin = probe("big-win", box, box);
      box.remove();
      return [
        ...["crate", "tank", "mini", "minor", "major"].map(plate),
        probe("rule", card, card),
        pair("body text on the page", document.body, document.body),
        probe("last", document.body, document.body),
        probe("rule", chosen, chosen),
        probe("key", chosen),
        pair("chosen bet chip", chip, chip),
        probe("primary", document.body, undefined, "button"),
        probe("bet", document.body, document.body),
        bigWin,
      ];
    });

    expect(pairs).toHaveLength(14);
    for (const { name, foreground, background, opaque } of pairs) {
      expect(opaque, `${name} sits on a solid colour`).toBe(true);
      expect(contrast(foreground, background), name).toBeGreaterThanOrEqual(4.5);
    }
  });
}
