import { defineConfig, devices } from "@playwright/test";

// Layout-regression harness (2.6 follow-up).
//
// These are ASSERTION-based layout contracts, not screenshot baselines. Pixel
// diffs would compare a macOS render against a CI Linux one — different font
// rasterisation, permanently red or permanently regenerated. The defects the
// mobile pass actually found (a log-out button off-screen, nav running past the
// viewport, an element overflowing its container) are all measurable exactly,
// on any platform.
//
// BROWSER: the "chrome" channel everywhere. Playwright's CDN is unreachable
// from this location (HTTP 403) and proved unreliable from the CI runner too
// (K-22: three failed builds in two days), so neither side downloads a
// browser — both drive an installed Google Chrome. PLAYWRIGHT_CHANNEL still
// overrides it, for anyone who does have the bundled Chromium and wants it.
const channel = process.env.PLAYWRIGHT_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "./e2e",
  // Layout is deterministic; a retry would only hide a real flake.
  retries: 0,
  fullyParallel: true,
  // The JSON report is what makes a CI-only failure legible: job logs and
  // artifacts both need admin rights to read, so the workflow publishes the
  // failing test names through this file instead (KNOWN_ISSUES K-25).
  reporter: process.env.CI
    ? [["github"] as const, ["json", { outputFile: "playwright-report.json" }] as const]
    : "list",
  use: {
    baseURL: process.env.WEB_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    ...(channel === "" ? {} : { channel }),
  },
  projects: [
    {
      // A phone-sized Chromium rather than the iPhone preset: that preset
      // implies WebKit, which cannot take the Chrome channel this machine has
      // to use. The viewport is what these assertions are about.
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        ...(channel === "" ? {} : { channel }),
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        ...(channel === "" ? {} : { channel }),
      },
    },
  ],
});
