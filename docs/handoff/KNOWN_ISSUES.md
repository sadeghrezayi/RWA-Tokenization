# KNOWN ISSUES

Every issue established from the code, the test runs, or the development history. Issues that were
**found and fixed** are kept at the bottom, because their causes are traps a future session could
walk back into.

---

## Open issues

| # | Severity | Symptom | Likely cause | Component | Workaround | Next step |
|---|---|---|---|---|---|---|
| K-1 | ~~High~~ **FIXED** 2026-08-17 | Issuer team management had no browser flow | Delivered in slices; the review queue landed first (3.2f), the team panel second (3.2g) | `apps/web/components/admin/issuer-detail-page.tsx` | — | Remaining: the **issuer-facing** portal, where an issuer's own admin manages their team without staff (roadmap 3.3) |
| K-17 | **Medium** | Every server-rendered page returns **500** with `SyntaxError: Unexpected non-whitespace character after JSON at position 979`, including `/favicon.ico`. Client-rendered admin pages still work, which makes it look like a routing bug | `apps/web/.next/prerender-manifest.json` was written twice and ends with duplicated bytes (`…b53c95c38"}}b53c95c38"}}`). A corrupt Next dev-build artifact, not application code | `apps/web/.next` (git-ignored) | — | `rm -rf apps/web/.next` and restart the dev server. Observed 2026-08-16; the error message names nothing, so check this **first** when every route 500s at once |
| K-18 | **Medium** | `npx playwright install` fails with **403 "this service is not available in your location"** from `cdn.playwright.dev`, so the bundled Chromium cannot be downloaded on this machine | Geographic block on Playwright's CDN | Playwright | Run the suite against the **system Chrome**: leave `PLAYWRIGHT_CHANNEL` unset (the config defaults to the `chrome` channel) instead of setting it to `""`. CI sets it empty on purpose because the runner *does* have the bundled browser | Keep both paths working; do not "simplify" the channel logic in `playwright.config.ts` |
| K-20 | **Low** | One integration test failed once on 2026-08-17 and did not reproduce in three subsequent runs, including under the same chained build-then-test conditions | **Unknown.** The failing test's name was not captured. A plausible but UNPROVEN mechanism: the API preview server was running against the same Postgres while the suite ran, so live demo data and suite data shared tables | integration suite | — | If it recurs, capture the test name before re-running. Prefer stopping preview servers before a full integration run |
| K-19 | ~~Low~~ **FIXED** 2026-08-17 | The issuer queue showed **"Decided by officer-1"** — an internal account id, not a person | `IssuerOrganisationView.decidedBy` carries only the officer id; the read model has no staff-directory lookup | `application/issuers/issuer-views.ts`, `components/admin/issuers-panel.tsx` | — | Resolve the id to a name/email in the read model, exactly as the approval alert was fixed (`fix(notifications): human labels…, not raw ids`) |
| K-2 | **High** | Approving KYC returns 500 when the devnet is unreachable | The ONCHAINID claim is issued **synchronously** inside the request | `chain/onchainid-claim-issuer.ts` | Run anvil, or unset the three devnet vars to use the logging placeholder | Async chain lifecycle (backlog P0-2) |
| K-3 | **High** | No email ever arrives | No SMTP adapter; delivery goes to a dev sink | `application/identity/email-outbox.ts` | Read the sink | Implement a nodemailer adapter behind the existing port (P0-3) |
| K-4 | **Medium** | A published offering can stay invisible on the public site for the whole revalidate window | `REVALIDATE_SECRET` unset, or different between the API and web | `web-public-page-revalidator.ts`, `app/api/revalidate/route.ts` | Set the same value on both | Fail loudly at boot when it is unset in a non-test environment |
| K-5 | **Medium** | An onboarding application that is waiting **on the applicant** still appears in the officer's pending queue and the ops work queue | The queue counts "open cases", not "waiting on us" | `application/onboarding/*`, `application/ops/*` | — | Product decision: split the queue semantics |
| K-6 | **Medium** | A KYC-rejected applicant can never re-apply | `rejected` is a terminal state by design; resubmission is now explicitly refused rather than silently doing nothing | `domain/identity/kyc-status.ts` | — | Product decision |
| K-7 | **Medium** | CRM follow-up reminders go to **every** staff member holding `crm.manage` | A follow-up has no owner field | `domain/crm/follow-up.ts` | — | Schema + UX change if per-follow-up ownership is wanted |
| K-8 | **Medium** | An investor with an unverified or mistyped email can reach a KYC decision that cannot be delivered | Accepted consequence of OD-22 (nothing is gated on email verification) | identity | — | Revisit OD-22 if it bites |
| K-9 | **Medium** | Rate limiting is per-process and resets on restart | `AuthRateLimitGuard` uses an in-memory map | `http/rate-limit.guard.ts` | Single instance | Move counters to Postgres, or document single-instance deployment |
| K-10 | **Low** | A client sending **both** a session cookie and a Bearer token authenticates as the **cookie's** owner | Documented precedence in `auth.guard.ts` | auth | One request context per actor; send `x-csrf-token` | Keep as is; it is deliberate |
| K-11 | **Low** | Scheduled jobs only scan the **default tenant** | Multi-tenant sweeping deferred with OD-1a | `infrastructure/jobs/*` | — | Address when a second tenant exists |
| K-12 | **Low** | The outbox drainer is in-process; multi-node behaviour is untested | Deliberate (decision B7/1.6b) | `infrastructure/outbox/*` | — | Test or move to pg-boss if multi-node is needed |
| K-13 | **Low** | `IssuerMembership.canWorkOnAssets()` has no production caller | Assets are not linked to organisations yet | `domain/issuers/issuer-membership.ts:41` | — | It gets a caller with backlog P1-1 |
| K-14 | **Low** | Draft (unopened) offerings are listed to signed-in investors with a Draft badge and no action | Deliberate at the time, flagged for review | `apps/web` offerings panel | — | Product decision: should unopened inventory be visible? |
| K-15 | **Low** | Distributions paid before the `paid_at` migration have no date and are **excluded** from the income statement | Chosen over showing undated income | `application/portfolio/*` | — | None needed; documented |
| K-16 | **Informational** | Resetting anvil without resetting Postgres leaves `Asset.tokenAddress` values pointing at nothing | Chain and DB are independent | — | Reset both together | — |

## Open questions awaiting the product owner

1. **What exactly may an issuer see about the investors in their offering?** The answer given was
   "all necessary information". A concrete field list must be proposed and approved before
   anything is exposed. (Recommended starting list: holder name, tokens held, allocation date,
   amount invested. Explicitly **not**: national ID, address, bank details, KYC evidence.)
2. **Should an asset be blocked from approval until its rights matrix is established?** It follows
   from the platform's own central claim, but it is a product gate.
3. **Should issuer staff be barred from investing?** An issuer's person holds an
   investor-capable account by construction.
4. **OD-23** — should MFA become mandatory for privileged roles?
5. **OD-7** — which email/SMS provider?
6. **OD-10 / OD-16** — chain governance target and custody hardening.
7. **OD-13** — is the `fa`/RTL locale pack approved?
8. **OD-20** — is there a fee model?

---

## Resolved — kept because the causes are traps

| Issue | Root cause | Fix | Trap to avoid |
|---|---|---|---|
| Chain suite hung ~900 s; CI failed on the **second** KYC approval of a run, never the first | `OnchainidClaimIssuer` held **one** long-lived ethers `NonceManager` for the process while every other adapter took one per call, so a tokenization elsewhere left its counter stale | `LanedOperatorSigner`: a **shared promise lane per account** serialises sends, each send gets its **own** manager | **Do not "simplify" to a shared `NonceManager`** (optimistic allocation ⇒ a dropped send wedges the queue) and **do not force a nonce re-read per send** (ethers' 250 ms RPC cache ⇒ "nonce too low") |
| A CI failure was invisible for six runs | Three compounding causes: job logs need admin rights; Node block-buffers stdout to a file; and `DomainErrorFilter` returned early for `HttpException` **without logging** | Log 5xx that arrive as `HttpException`; `stdbuf -oL -eL` in CI; attach log tails to the **step summary** (which needs no admin rights) | Never assume a 500 is diagnosable — check that it is actually logged |
| `investorVisible`, then `realEstate`/`rights`, were silently dropped on save | The Prisma repository did not map the new fields | Migration + mapping both ways | The shared **repository contract test** is what caught both. Always extend it when adding a field |
| A mutation check polluted the database and the restored run still failed | Mis-wired scoped client wrote rows under the `default` tenant while cleanup keyed on tenants A/B | Key cleanup on the row id prefix | Clean up by a key you control, not by the tenant you assumed |
| Playwright seeded calls ran as the wrong actor | The API prefers the cookie over the Bearer header; the request context had stored a cookie | One `APIRequestContext` per actor + `x-csrf-token` | See K-10 |
| A newly published offering was invisible to the journey test | `REVALIDATE_SECRET` was set nowhere, so the ISR purge had never run | Set it in CI and locally | See K-4 |
| Register-then-navigate aborted the in-flight login | Navigation cancelled the request | Wait for a post-login element | — |
| Ambiguous test selectors (`/address/i` matched two labels; `/2,000,000/` matched `12,000,000`) | Loose regexes | Exact labels/cells | — |
| Duplicated row mapping in a new `PrismaPersonVerification` | Re-implemented the investor mapping | Deleted; composed over `InvestorRepository` instead | One authoritative mapping per concept |
