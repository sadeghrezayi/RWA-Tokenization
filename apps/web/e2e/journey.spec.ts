import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  PIXEL_PNG,
  approveKyc,
  asInvestor,
  asOfficer,
  closeWhenWindowEnds,
  fundInvestor,
  investorIdOf,
  registerInvestorVia,
  seedOpenOffering,
  submitOnboarding,
  seedTokenizedAsset,
  subscribe,
} from "./seed.js";
import { signIn } from "./layout.js";

// PHASE 2 EXIT: browse → register → verify → KYC → invest → pay → allocation
// visible, and a failed offering returning the money.
//
// This is the one test that proves the SCREENS connect. Everything an investor
// cannot do for themselves is seeded through the API as the operator would;
// every step the investor or the officer performs happens in a real browser.
const PRICE = "5000000";
const DEPOSIT = "40000000";

const uniqueEmail = (prefix: string): string =>
  `${prefix}-${String(Date.now())}-${String(Math.floor(Math.random() * 100000))}@example.com`;

const registerThroughTheUi = async (page: Page, email: string, password: string): Promise<void> => {
  await page.goto("/en/portfolio");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Register" }).click();
  // Register signs you straight in. Waiting for the shell matters: navigating
  // while that request is in flight aborts it and leaves you anonymous.
  await expect(page.getByRole("link", { name: "Portfolio" })).toBeVisible();
};

const completeVerificationWizard = async (page: Page): Promise<void> => {
  await page.goto("/en/onboarding");
  await page.getByRole("button", { name: "Start verification" }).click();

  await page.getByLabel("Full legal name").fill("Journey Test Holder");
  await page.getByLabel("National ID number").fill("0012345678");
  await page.getByLabel("Date of birth").fill("1990-05-05");
  await page.getByLabel("Residential address").fill("12 Vanak Street");
  await page.getByLabel("City").fill("Tehran");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await page.setInputFiles('input[type="file"]', {
    name: "identity.png",
    mimeType: "image/png",
    buffer: PIXEL_PNG,
  });
  await expect(page.getByText("identity.png")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Account holder name").fill("Journey Test Holder");
  await page.getByLabel("Bank", { exact: true }).fill("Bank Melli Iran");
  await page.getByLabel("IBAN").fill("IR820540102680020817909002");
  await page.getByRole("button", { name: "Save and continue" }).click();

  for (const label of ["Investment experience", "Risk tolerance", "Source of funds"]) {
    await page.getByLabel(label).selectOption({ index: 1 });
  }
  await page.getByRole("button", { name: "Save and continue" }).click();

  const checkboxes = page.getByRole("checkbox");
  await checkboxes.first().check();
  await checkboxes.nth(1).check();
  await page.getByRole("button", { name: "Save and continue" }).click();

  await page.getByRole("button", { name: "Submit for review" }).click();
};

test.describe("Phase 2 exit journey", () => {
  // The journey is about whether the screens connect, not about layout, and it
  // is expensive. The mobile project already re-runs every layout contract;
  // running this a second time there would buy nothing.
  test.skip(({ isMobile }) => isMobile, "the journey runs once, on desktop");

  // Serial, not parallel: tokenizing deploys a contract from the platform
  // operator's single account, and two deployments at once collide on the
  // nonce. The journey is sequential in real life too.
  test.describe.configure({ mode: "serial" });

  // A real person's path through five screens plus two officer decisions, on a
  // cold start. It is slow because it is honest.
  test.setTimeout(240_000);

  test("a visitor becomes a holder, and the allocation shows up after the close", async ({
    page,
    browser,
    playwright,
  }) => {
    const officer = await asOfficer(playwright);
    const assetName = `Journey Tower ${String(Date.now())}`;
    const assetId = await seedTokenizedAsset(officer, assetName);
    await seedOpenOffering(officer, {
      assetId,
      supply: "1000",
      priceRial: PRICE,
      minPerInvestor: "2",
      maxPerInvestor: "50",
      minimumRaise: "2",
      closesInSeconds: 3600,
      publish: true,
    });

    const email = uniqueEmail("journey");
    const password = "Passw0rd-journey-1";

    await test.step("an anonymous visitor can see what is on offer", async () => {
      await page.goto("/en/browse");
      await expect(page.getByText(assetName)).toBeVisible();
    });

    await test.step("registering and completing verification", async () => {
      await registerThroughTheUi(page, email, password);
      await completeVerificationWizard(page);
      await expect(page.getByText(/under review/i).first()).toBeVisible();
    });

    const officerContext = await browser.newContext();
    const officerPage = await officerContext.newPage();

    await test.step("an officer approves the application", async () => {
      await officerPage.goto("/en/admin/kyc");
      await signIn(officerPage, "officer@platform.local", "officer-dev-pass");
      const row = officerPage.getByRole("row", { name: new RegExp(email) });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: /approve/i }).click();
      await expect(officerPage.getByText(email)).toBeHidden();
    });

    await test.step("the holder declares a deposit and treasury confirms it", async () => {
      await page.goto("/en/funds");
      await page.getByLabel(/amount to transfer/i).fill(DEPOSIT);
      await page.getByRole("button", { name: /get payment details/i }).click();
      // The reference is the whole point of the manual rail.
      await expect(page.getByText(/^TP-/).first()).toBeVisible();

      await officerPage.goto("/en/admin/deposits");
      const row = officerPage.getByRole("row", { name: new RegExp(email) });
      await row.getByRole("button", { name: /confirm/i }).click();
      await officerPage.getByRole("button", { name: /credit the investor/i }).click();
      await expect(officerPage.getByText(/nothing waiting/i)).toBeVisible();
    });

    await test.step("the holder checks out against their balance", async () => {
      await page.goto("/en/offerings");
      await page.getByRole("button", { name: "Subscribe" }).first().click();
      await page.getByLabel("Number of tokens").fill("4");
      // 4 × 5,000,000 = 20,000,000 against a 40,000,000 balance.
      await expect(page.getByTestId("checkout-cost")).toContainText("20,000,000");
      await page.getByRole("button", { name: "Confirm subscription" }).click();
      await expect(page.getByText(/Held in escrow: 20,000,000/)).toBeVisible();
    });

    await test.step("the allocation is visible once the offering closes", async () => {
      // The holder registered in the browser; open an API session as them.
      const holder = await asInvestor(playwright, email, password);
      const shortOffering = await seedOpenOffering(officer, {
        assetId,
        supply: "100",
        priceRial: PRICE,
        minPerInvestor: "1",
        maxPerInvestor: "50",
        minimumRaise: "1",
        closesInSeconds: 10,
      });
      await subscribe(holder, shortOffering, "2");

      const closed = await closeWhenWindowEnds(officer, shortOffering);
      expect(closed.state).toBe("closed_success");

      // Ask the API first, and say so in the failure message. "The link is not
      // on the page" cannot distinguish a backend that never granted the
      // holding from a page that did not show one it was given — and this
      // assertion has failed in CI while passing locally, so the difference is
      // exactly what needs naming (KNOWN_ISSUES K-24).
      await expect
        .poll(
          async () => {
            const response = await holder.api.get("/portfolio/me");
            if (!response.ok()) return `GET /portfolio/me -> ${String(response.status())}`;
            const portfolio = (await response.json()) as {
              holdings: { assetName: string; tokens: string }[];
            };
            return portfolio.holdings.map((h) => `${h.assetName}=${h.tokens}`).join(",") || "none";
          },
          {
            timeout: 30_000,
            message: `the API never reported a holding in ${assetName} after the close`,
          },
        )
        .toContain(assetName);

      await page.goto("/en/portfolio");
      // The API has already confirmed the holding above, so anything failing
      // here is the PAGE failing to show what it was given — and "the link is
      // not there" does not say whether the page errored, is still loading, or
      // rendered a portfolio without it. So report what the page IS showing.
      await expect
        .poll(
          async () => {
            // This probe must never throw: a predicate that throws reports
            // only "timeout exceeded", which is how the last round told me
            // nothing at all.
            try {
              const alerts = await page.getByRole("alert").allInnerTexts();
              const spoken = alerts.map((text) => text.trim()).filter(Boolean);
              if (spoken.length > 0) return `ALERT: ${spoken.join(" | ").slice(0, 70)}`;
              // Not `main`: the portal shell does not always render that
              // landmark, and innerText on a missing element never resolves —
              // which reports "timeout" and no value, the least useful outcome.
              const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
              const marker = "self-hosted";
              const at = body.indexOf(marker);
              const content = at === -1 ? body : body.slice(at + marker.length).trim();
              // The WHOLE content, not a slice: this string is what the
              // assertion matches against, and truncating it here would make
              // the test unpassable no matter what the page showed.
              const empty = alerts.length > 0 ? `EMPTY-ALERTx${String(alerts.length)} ` : "";
              // The portal shows its sign-in panel whenever /auth/session does
              // not answer. Which of the two reasons it is — the browser has no
              // cookie, or the API rejected the one it has — cannot be told
              // apart from outside, so ask from INSIDE the page.
              if (/sign in/i.test(content)) {
                const probe = await page.evaluate(async () => {
                  const res = await fetch("http://localhost:3001/auth/session", {
                    credentials: "include",
                  });
                  return { status: res.status, csrf: document.cookie.includes("tk_csrf") };
                });
                return `SIGNED OUT: /auth/session -> ${String(probe.status)}, csrf-cookie=${String(probe.csrf)}`;
              }
              return `${empty}CONTENT: ${content}`;
            } catch (probeFailure) {
              return `PROBE FAILED: ${String(probeFailure).slice(0, 80)}`;
            }
          },
          {
            timeout: 15_000,
            message: "the API reported the holding but the page did not show it",
          },
        )
        .toContain(assetName);

      const holdingLink = page.getByRole("link", { name: new RegExp(assetName) });
      await holdingLink.click();

      // The position page: what went in, and what came of it.
      await expect(page.getByTestId("position-tokens")).toContainText("2");
      await expect(page.getByTestId("position-invested")).toContainText("10,000,000");
    });

    await test.step("a document an officer publishes reaches the holder", async () => {
      // The seam this guards: the admin toggle and the holder's documents list
      // are tested separately on both sides, so only a run through BOTH
      // browsers proves they meet.
      await expect(page.getByText(/no documents have been published/i)).toBeVisible();

      await officerPage.goto(`/en/admin/assets/${assetId}`);
      const row = officerPage.getByRole("row", { name: /valuation_report/ });
      await expect(row.getByText(/hidden from holders/i)).toBeVisible();
      await row.getByRole("button", { name: /show to holders/i }).click();
      await expect(row.getByText(/visible to holders/i)).toBeVisible();

      await page.reload();
      const documents = page.getByRole("listitem").filter({ hasText: "valuation_report" });
      await expect(documents).toBeVisible();
      // Only the published one: the other five dossier documents stay invisible.
      await expect(page.getByRole("listitem").filter({ hasText: "counsel_signoff" })).toHaveCount(
        0,
      );
    });

    await officerContext.close();
  });

  test("a failed offering gives the money back", async ({ page, playwright }) => {
    const officer = await asOfficer(playwright);
    const assetName = `Undersubscribed SPV ${String(Date.now())}`;
    const assetId = await seedTokenizedAsset(officer, assetName);

    const email = uniqueEmail("refund");
    const password = "Passw0rd-refund-1";
    const holder = await registerInvestorVia(playwright, email, password);
    await submitOnboarding(holder);
    await approveKyc(officer, await investorIdOf(holder));
    await fundInvestor(holder, officer, DEPOSIT);

    // A minimum nobody will reach: the offering must fail.
    const offeringId = await seedOpenOffering(officer, {
      assetId,
      supply: "1000",
      priceRial: PRICE,
      minPerInvestor: "1",
      maxPerInvestor: "50",
      minimumRaise: "900",
      closesInSeconds: 10,
    });
    await subscribe(holder, offeringId, "2");

    const closed = await closeWhenWindowEnds(officer, offeringId);
    expect(closed.state).toBe("closed_failed");

    await page.goto("/en/offerings");
    await signIn(page, email, password);
    // Every Rial is back on the balance and nothing is held against a dead
    // offering — the two facts a holder checks after a raise falls through.
    await expect(page.getByText("40,000,000 ﷼").first()).toBeVisible();
    await expect(page.getByText(/Held in escrow: 0/)).toBeVisible();
  });

  test("an over-subscribed offering scales everyone down and refunds the rest", async ({
    page,
    playwright,
  }) => {
    // The case a holder is most likely to misread: they asked for 8 tokens and
    // got 4. The pro-rata maths is unit-tested; what was never checked is
    // whether the SCREEN tells them what happened to the other half of their
    // money.
    const officer = await asOfficer(playwright);
    const assetName = `Oversubscribed SPV ${String(Date.now())}`;
    const assetId = await seedTokenizedAsset(officer, assetName);

    const holders = [];
    for (const prefix of ["prorata-a", "prorata-b"]) {
      const email = uniqueEmail(prefix);
      const password = "Passw0rd-prorata-1";
      const holder = await registerInvestorVia(playwright, email, password);
      await submitOnboarding(holder);
      await approveKyc(officer, await investorIdOf(holder));
      await fundInvestor(holder, officer, DEPOSIT);
      holders.push({ email, password, holder });
    }

    // Supply 8, two holders asking for 8 each: each can be given half.
    const offeringId = await seedOpenOffering(officer, {
      assetId,
      supply: "8",
      priceRial: PRICE,
      minPerInvestor: "1",
      maxPerInvestor: "8",
      minimumRaise: "1",
      closesInSeconds: 10,
    });
    for (const { holder } of holders) {
      await subscribe(holder, offeringId, "8");
    }

    const closed = await closeWhenWindowEnds(officer, offeringId);
    expect(closed.state).toBe("closed_success");

    const first = holders[0];
    expect(first).toBeDefined();
    if (!first) return;

    await page.goto("/en/portfolio");
    await signIn(page, first.email, first.password);
    await page.getByRole("link", { name: new RegExp(assetName) }).click();

    // Asked for 8, allocated 4: the position states both, and the 20,000,000 ﷼
    // that did not buy anything is named as a refund rather than vanishing.
    // Per cell, not "somewhere in the row": a loose match here would pass on a
    // stray digit and prove nothing.
    // Columns: when | status | requested | allocated | cost | refund.
    const cells = page.getByTestId(`subscription-${offeringId}`).getByRole("cell");
    await expect(cells.nth(2)).toHaveText("8");
    await expect(cells.nth(3)).toHaveText("4");
    await expect(cells.nth(4)).toContainText("20,000,000");
    await expect(cells.nth(5)).toContainText("20,000,000");
    await expect(page.getByTestId("position-tokens")).toContainText("4");
  });
});
