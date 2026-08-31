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
  // Every test here loads a page and then runs a FULL axe scan, which is
  // seconds of work on its own. Playwright's default test budget is 30s, and
  // an assertion timeout of 30s inside a 30s test can never be reached — the
  // test dies first. That is exactly how this failed on CI (`9862d4c`: "Test
  // timeout of 30000ms exceeded") while passing locally in 17s. The budget
  // must exceed the patience it contains, so it is set once here rather than
  // leaving the same trap in each new test someone adds.
  // 120s per test, and the LANE runs with --workers=1 (see package.json).
  //
  // Not belt-and-braces: an axe scan is CPU-heavy and the signed-in test does
  // an argon2 registration AND login, so two of these on a two-core runner
  // starve each other. On 2026-08-31 that showed as
  // `expect(getByLabel("Email")).toBeHidden()` consuming its full 30s and
  // failing on a DOCUMENTATION-ONLY commit, while the identical code had
  // passed minutes earlier (KNOWN_ISSUES K-40).
  //
  // The timeout was deliberately NOT raised. If the app is too slow under
  // load, a larger number moves the threshold and buys a quieter build that
  // fails later and means less; removing the contention addresses the cause.
  // If this recurs with the lane already serial, THEN the 30s assertion is
  // genuinely too tight and that is the evidence to change it on.
  test.describe.configure({ timeout: 120_000 });

  for (const path of ["/en", "/en/browse"]) {
    test(`${path} has no detectable violations`, async ({ page }) => {
      await page.goto(path);
      // Readiness, not the assertion under test — the scan below is. This spec
      // added ten tests to a run that already saturates its workers, and the
      // default 5s patience was not always enough for the first paint under
      // that load. Same distinction K-24 drew: check the subject is right,
      // then be patient about waiting for it.
      await expect(page.getByRole("link", { name: /open offerings/i })).toBeVisible({
        timeout: 30_000,
      });

      expectNoViolations(await scan(page), path);
    });
  }

  test("the investor sign-in form is reachable and labelled", async ({ page }) => {
    // A login nobody can operate with a keyboard or a screen reader locks the
    // person out of the whole platform, so this page matters more than most.
    await page.goto("/en/portfolio");
    await expect(page.getByLabel("Email")).toBeVisible({ timeout: 30_000 });

    expectNoViolations(await scan(page), "the investor sign-in form");
  });

  test("the officer sign-in form is reachable and labelled", async ({ page }) => {
    await page.goto("/en/admin");
    await expect(page.getByLabel("Email")).toBeVisible({ timeout: 30_000 });

    expectNoViolations(await scan(page), "the officer sign-in form");
  });

  test("a signed-in investor's portal has no detectable violations", async ({ page }) => {
    // Past the login is where the real screens are — tables, badges, empty
    // states — and none of them had ever been checked.
    //
    // The slowest test here: register over HTTP, load, sign in, then scan.
    const { email, password } = await registerInvestor(page);
    await page.goto("/en/portfolio");
    await signIn(page, email, password);
    // The sign-in form is replaced by the portal shell once the session lands.
    await expect(page.getByLabel("Email")).toBeHidden({ timeout: 30_000 });

    expectNoViolations(await scan(page), "the investor portal");
  });
});
