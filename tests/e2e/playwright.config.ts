import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The tests run against the published site, not the dev server, so the trimmed build is what gets tested.
// A Blazor publish puts the static site in its wwwroot folder.
const site = join(tmpdir(), "last-breath-e2e-site");
const port = 4173;

// Chromium only by default. To run the other engines too: E2E_BROWSERS=all npx playwright test --workers=2
// (or a list such as E2E_BROWSERS=firefox,webkit). The browsers come from: npx playwright install firefox webkit
const wanted = (process.env.E2E_BROWSERS ?? "chromium").split(",");
const engines = (["chromium", "firefox", "webkit"] as const).filter((name) => wanted.includes("all") || wanted.includes(name));

export default defineConfig({
  testDir: "./specs",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}` },
  projects: engines.map((name) => ({ name, use: { browserName: name } })),
  webServer: {
    command: `dotnet publish ../../src/LastBreath.Web -c Release -o "${site}" --nologo -v q && node serve.mjs "${join(site, "wwwroot")}" ${port}`,
    url: `http://localhost:${port}/`,
    timeout: 300_000,
    reuseExistingServer: false,
  },
});
