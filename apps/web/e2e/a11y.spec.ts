import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { registerInvestor, signIn } from "./layout.js";

// P1-6: automated accessibility assertions. axe-core was approved in OD-4 on
// 2026-07-22 and then never wired up, so nothing checked.
//
// Scope, deliberately narrow: WCAG 2 A and AA rules only. axe's "best-practice"
// tag flags things that are judgement calls rather than failures, and a suite
// that cries wolf gets muted — which is worse than no suite. Widen the tags
// when someone is prepared to act on what they report.
//
// axe finds a subset of real barriers. A clean run means "no machine-detectable
// violation", NOT "accessible" — it cannot judge whether a label makes sense to
// a person. Do not let a green run here stand in for using the thing.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const scan = async (page: Page) => new AxeBuilder({ page }).withTags(WCAG).analyze();

// Reported violations are useless as a bare count — the fix needs the rule and
// the element. This prints both, so a CI failure names what to change.
const expectNoViolations = (results: Awaited<ReturnType<typeof scan>>, where: string): void => {
  const summary = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? "unknown"}): ${violation.help}\n` +
      violation.nodes.map((node) => `      ${node.target.join(" ")}`).join("\n"),
  );
  expect(summary, `accessibility violations on ${where}`).toEqual([]);
};

test.describe("accessibility (WCAG 2.1 A/AA, machine-detectable)", () => {
  for (const path of ["/en", "/en/browse"]) {
    test(`${path} has no detectable violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("link", { name: /open offerings/i })).toBeVisible();

      expectNoViolations(await scan(page), path);
    });
  }

  test("the investor sign-in form is reachable and labelled", async ({ page }) => {
    // A login nobody can operate with a keyboard or a screen reader locks the
    // person out of the whole platform, so this page matters more than most.
    await page.goto("/en/portfolio");
    await expect(page.getByLabel("Email")).toBeVisible();

    expectNoViolations(await scan(page), "the investor sign-in form");
  });

  test("the officer sign-in form is reachable and labelled", async ({ page }) => {
    await page.goto("/en/admin");
    await expect(page.getByLabel("Email")).toBeVisible();

    expectNoViolations(await scan(page), "the officer sign-in form");
  });

  test("a signed-in investor's portal has no detectable violations", async ({ page }) => {
    // Past the login is where the real screens are — tables, badges, empty
    // states — and none of them had ever been checked.
    const { email, password } = await registerInvestor(page);
    await page.goto("/en/portfolio");
    await signIn(page, email, password);
    // The sign-in form is replaced by the portal shell once the session lands.
    await expect(page.getByLabel("Email")).toBeHidden({ timeout: 30_000 });

    expectNoViolations(await scan(page), "the investor portal");
  });
});
