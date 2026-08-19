import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalPageScroll,
  expectNothingOverflowsItsContainer,
  expectReachable,
  registerInvestor,
  signIn,
} from "./layout.js";
import { asOfficer, seedIssuerWithAssets } from "./seed.js";

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

// 3.3e: the issuer portal is the third shell. A person with no issuer
// membership reaches it legitimately — the landing must say so and still be a
// usable screen, sign-out included, at every width.
test.describe("issuer portal", () => {
  test("a person with no membership gets a readable answer, not an empty shell", async ({
    page,
  }) => {
    const { email, password } = await registerInvestor(page);
    await page.goto("/en/issuer");
    await signIn(page, email, password);

    await expect(page.getByTestId("no-issuer-membership")).toBeVisible();
    await expectReachable(page.getByRole("button", { name: /log out/i }), "log out");
    await expectNoHorizontalPageScroll(page);
    await expectNothingOverflowsItsContainer(page);
  });

  // 3.3g/3.3h: the issuer's own assets screen — a three-column table plus the
  // form that brings one. The admin console's equivalent has had a contract
  // since 3.2f; this surface arrived after the mobile pass and had none, which
  // is the only reason it lacked one.
  test("the assets an issuer brought fit the screen they are read on", async ({
    page,
    playwright,
  }) => {
    const officer = await asOfficer(playwright);
    const { organisationId, email, password } = await seedIssuerWithAssets(playwright, officer, [
      "Vanak Tower Floor 7",
      "Elahiyeh Block C — a deliberately long name to push the widest column",
    ]);

    await page.goto(`/en/issuer/${organisationId}`);
    await signIn(page, email, password);

    // Measured against real rows: an empty table fits any viewport, so a
    // contract that passed on one would be proving nothing.
    await expect(page.getByText("Vanak Tower Floor 7")).toBeVisible();
    await expectReachable(page.getByRole("button", { name: /bring/i }), "the bring-asset button");
    await expectNoHorizontalPageScroll(page);
    await expectNothingOverflowsItsContainer(page);
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

  // 3.2f: the issuer queue is the widest table in the console — six columns,
  // one of them a wrapping decision reason. It must not push the page sideways.
  test("the issuer queue fits the screen it is read on", async ({ page }) => {
    await page.goto("/en/admin/issuers");
    await signIn(page, "officer@platform.local", "officer-dev-pass");
    await expect(page.getByRole("heading", { name: /issuer applications/i })).toBeVisible();

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
