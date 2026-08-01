import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalPageScroll,
  expectNothingOverflowsItsContainer,
  expectReachable,
  registerInvestor,
  signIn,
} from "./layout.js";

// Guards the 2.6 mobile pass. Every assertion here corresponds to a defect
// that was actually found by hand at 375px — so a regression fails the build
// instead of reaching someone's phone.

test.describe("public pages", () => {
  for (const path of ["/en", "/en/browse"]) {
    test(`${path} fits its viewport`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("link", { name: /open offerings/i })).toBeVisible();

      await expectNoHorizontalPageScroll(page);
      await expectNothingOverflowsItsContainer(page);
    });
  }

  test("the header keeps its navigation on one row", async ({ page }) => {
    // The brand name used to wrap to three lines and crowd the nav out of the
    // bar on a phone.
    await page.goto("/en");
    await expectReachable(page.getByRole("link", { name: /open offerings/i }), "the browse link");
    await expectReachable(page.getByRole("link", { name: /sign in/i }), "the sign-in link");
  });
});

test.describe("investor portal", () => {
  test("a signed-in holder can always reach log out", async ({ page }) => {
    // The regression this exists for: the sidebar footer was display:none below
    // 860px, so a phone user had no way to sign out at all.
    const { email, password } = await registerInvestor(page);
    await page.goto("/en/portfolio");
    await signIn(page, email, password);

    const logout = page.getByRole("button", { name: /log out/i });
    await expectReachable(logout, "log out");
  });

  test("every navigation item stays on screen", async ({ page }) => {
    const { email, password } = await registerInvestor(page);
    await page.goto("/en/portfolio");
    await signIn(page, email, password);
    await expect(page.getByRole("link", { name: /portfolio/i }).first()).toBeVisible();

    for (const name of [/portfolio/i, /offerings/i, /verification/i, /profile/i]) {
      await expectReachable(page.getByRole("link", { name }).first(), `the ${String(name)} link`);
    }
    await expectNoHorizontalPageScroll(page);
    await expectNothingOverflowsItsContainer(page);
  });

  test("the verification wizard shows its form without scrolling past a wall of chrome", async ({
    page,
  }) => {
    const { email, password } = await registerInvestor(page);
    await page.goto("/en/onboarding");
    await signIn(page, email, password);

    await page.getByRole("button", { name: /start verification/i }).click();
    const firstField = page.getByLabel("Full legal name");
    await expect(firstField).toBeVisible();

    // The card header used to run to nine lines on a phone, pushing the first
    // field below the fold.
    const box = await firstField.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    if (box && viewport) {
      expect(box.y, "the first field starts below the fold").toBeLessThan(viewport.height);
    }
    await expectNoHorizontalPageScroll(page);
  });
});

test.describe("admin console", () => {
  test("navigation is disclosed on demand, and content starts near the top", async ({ page }) => {
    await page.goto("/en/admin/kyc");
    await signIn(page, "officer@platform.local", "officer-dev-pass");
    await expect(page.getByRole("heading", { name: /pending kyc/i })).toBeVisible();

    const menu = page.getByRole("button", { name: /menu/i });
    const heading = page.getByRole("heading", { name: /pending kyc/i });
    const viewport = page.viewportSize();
    const box = await heading.boundingBox();

    if (viewport && viewport.width < 860) {
      // Twelve wrapped nav items used to fill the whole screen first.
      await expect(menu).toBeVisible();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      expect(box?.y ?? Number.POSITIVE_INFINITY, "content starts below the fold").toBeLessThan(
        viewport.height / 2,
      );
    } else {
      // At desktop widths the nav is always there and the toggle does not exist.
      await expect(menu).toBeHidden();
      await expect(page.getByRole("link", { name: /investors/i }).first()).toBeVisible();
    }

    await expectNoHorizontalPageScroll(page);
    await expectNothingOverflowsItsContainer(page);
  });

  test("an officer can always reach log out", async ({ page }) => {
    await page.goto("/en/admin/kyc");
    await signIn(page, "officer@platform.local", "officer-dev-pass");
    await expect(page.getByRole("heading", { name: /pending kyc/i })).toBeVisible();

    await expectReachable(page.getByRole("button", { name: /log out/i }), "log out");
  });
});
