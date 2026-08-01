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
// BROWSER: Playwright's CDN is unreachable from this location (HTTP 403), so
// locally the tests drive the system Google Chrome via the "chrome" channel.
// CI installs Playwright's own Chromium and overrides the channel with
// PLAYWRIGHT_CHANNEL="" so it uses the bundled build.
const channel = process.env.PLAYWRIGHT_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "./e2e",
  // Layout is deterministic; a retry would only hide a real flake.
  retries: 0,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
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
