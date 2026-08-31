# TEST AND QUALITY STATUS

Measured at commit `0cfe976` on 2026-08-31 by actually running the suites on the development
machine (macOS, Node 22, Postgres 16 in Docker, IPFS in Docker, anvil with freshly deployed
contracts).

> **Run anvil FRESH before the integration suite.** A long-lived node degrades until the four
> chain-backed files time out, which looks exactly like a regression and is not one (K-23). It cost
> a diagnosis three separate times in one session; `pkill -f anvil` then restart takes two seconds.
>
> **Do not reduce an integration run to its counts.** Piping through `grep -E "Tests "` keeps the
> totals and throws away the failing name — the mistake K-20 records, made again on 2026-08-25.

---

## 1. Suite inventory and last observed result

| Suite | Command | Files | Tests | Result |
|---|---|---|---|---|
| API unit | `pnpm --filter @tokenization/api test` | 120 | **974** | ✅ all passed |
| API integration (real Postgres + IPFS + anvil) | `pnpm --filter @tokenization/api test:integration` | 67 | **440** | ✅ all passed, no skips, on a FRESH anvil |
| Web unit (Vitest + Testing Library) | `pnpm --filter @tokenization/web test` | 59 | **541** | ✅ all passed |
| Playwright (layout + a11y + exit journey) | `test:layout` and `test:a11y` | 3 | **17 declared** (×2 projects) | Verified on CI; NOT run locally at this commit — stated as declared rather than observed |
| Contracts (Foundry) | `cd contracts && forge test` | 2 | **9** | ✅ all passed |
| Lint | `pnpm lint` | — | — | ✅ clean |
| Format | `pnpm format` | — | — | ✅ clean |
| Typecheck | `pnpm -r typecheck` | — | — | ✅ clean |
| Builds | API `tsc -p tsconfig.build.json`, web `next build` | — | — | ✅ clean |

**CI:** green on `0cfe976`, with a dependency-audit gate (`pnpm audit --audit-level high`) now among the steps.

## 2. What the tests actually assert (quality, not just count)

- **Domain tests** are behavioural: state-machine legality, invariants ("a rejection needs a
  reason", "an empty rights matrix is not 'conveys nothing'"), and value-object validation.
- **Repository contract tests** run the *same* suite against the in-memory fake and the Prisma
  implementation. This has caught silently-dropped columns **twice** (`investorVisible`, then
  `realEstate`/`rights`).
- **e2e tests** drive the real NestJS HTTP stack with supertest against **real Postgres** — status
  codes, authorization, and persisted effects.
- **Tenant isolation** is proven by writing under two tenants and asserting neither can see the
  other, including for issuer organisations.
- **Playwright** asserts *layout contracts* (no pixel baselines — a macOS render would never match
  the CI runner) plus a full user journey in a real browser, on desktop and mobile viewports.
- **Mutation checking** is used for rules where a passing test could still be decoration. Verified
  by deliberately breaking the code and observing the *specific* expected failures:
  - pro-rata allocation assertions,
  - the document-disclosure seam,
  - tenant isolation,
  - the issuer **individual-verification gate** (permissive stub ⇒ exactly two e2e failures),
  - email normalisation in the person directory,
  - the fail-closed default for an unknown person.

## 3. Known environment-dependent failures (NOT regressions)

Running the integration suite **without anvil** while `DEVNET_RPC_URL` is set produces:

- 6 chain suites **self-skip** (`trex-*`, `onchainid-claim-issuer`, `ethers-token-event-source`,
  `attestation-chain`), and
- **2 real failures**: `notification-triggers-api.e2e` ("notifies the investor … when their KYC is
  approved") and `work-queue-api.e2e`, both `expected 204, got 500`, because approving KYC issues
  an on-chain claim synchronously and the RPC is unreachable.

Start anvil and deploy the contracts (RUNBOOK §6) and both pass. This was observed and confirmed
during this handoff.

Two further environment traps, both observed on 2026-08-16 and both documented in KNOWN_ISSUES:

- **Playwright's bundled Chromium cannot be downloaded on this machine** (`cdn.playwright.dev`
  returns 403 for this location). Run locally with `PLAYWRIGHT_CHANNEL` **unset** so the config's
  default `chrome` channel uses the installed Google Chrome. CI sets it to `""` on purpose.
- **A corrupt `apps/web/.next/prerender-manifest.json`** makes every server-rendered page return
  500 with an opaque JSON parse error, which looks exactly like an application bug. `rm -rf
  apps/web/.next`.

## 4. Flaky tests

- `trex-asset-token-issuer` integration test was flaky in the full suite and was **fixed**
  (backlog item #26 in the historical task list). No flakiness observed since.
- The Playwright journey is configured `test.describe.configure({ mode: "serial" })` because
  parallel devnet writes raced on the operator nonce.
- No currently-known flaky tests.

## 5. Coverage

**No coverage tooling is configured** and no coverage number exists. Coverage is asserted
qualitatively instead: every use case has unit tests, every repository has a contract test, every
controller family has an e2e suite. Treat any coverage claim beyond that as UNKNOWN.

## 6. Untested / weakly tested critical paths

| Path | Risk |
|---|---|
| Multi-node outbox draining | Duplicate or stalled email delivery under >1 instance |
| Multi-tenant scheduled jobs | The pg-boss scan only runs for the default tenant |
| Rate limiting under multiple processes | In-memory counters make the limit per-process |
| PII in logs | Nothing asserts that personal data never reaches the log |
| Chain reorg / failed transaction recovery | Chain writes are synchronous with no lifecycle entity |
| Key rotation for `KYC_EVIDENCE_KEY` | No rotation path exists, so nothing tests one |
| Accessibility | axe-core approved (OD-4) but **no a11y assertions exist** |
| Load / performance | None at all |
| Dependency vulnerability gate | Not in CI |

## 7. Quality practices in force

- **TDD, red observed first** — enforced culturally and by the `verify-before-stop.sh` hook.
- **Existing tests are a regression floor**; they are never edited to make new code pass, except
  as a deliberate, documented behaviour change (which happened, for example, when the
  evidence-free KYC submit endpoint was removed).
- **Definition of Done** (from `CLAUDE.md`): failing test first → passing; lint/typecheck/format
  clean; edge and error paths covered; no dead code or unexplained TODO; behaviour verified by
  running it; decisions reported. A slice that misses any item is reported as in-progress with
  the gap named.
- **No `TODO`, `FIXME`, `HACK` or `XXX:` markers exist in the source** (verified by grep across
  `services/api/src`, `apps/web/{app,components,lib}`, `contracts/{src,script}`).

---

## 8. Structural guards (added 2026-08-25 → 2026-08-31)

These are not feature tests. Each one exists because a property was quietly regressing and nothing
noticed, and each is **mutation-checked** — a guard that cannot fail is worse than none, because it
reads as coverage.

| Guard | Protects | How it was proven to work |
|---|---|---|
| `test/support/no-pii-in-logs.test.ts` | No `log.*` call interpolates an identity or credential | Found a leak a manual grep had missed — `StaffBootstrap` printed the dev password in three warnings. Checked for PRECISION too: `${tokenAddress}` must NOT be flagged, or the rule gets switched off |
| `test/support/e2e-env-hygiene.test.ts` | Integration suites restore any `process.env` they set (K-41) | Its first version accepted a file that merely MENTIONED `scopedEnv`; mutation caught that, and it is now structural — a compliant file has no bare assignment at all |
| `.github/scripts/verify-ci-diagnostics.mjs` | The two failure-diagnostic CI steps still publish what they claim (K-25, K-31, K-40) | Reads each step's script OUT OF `ci.yml` and runs it; four mutations (rename, context, stack frame, flattened walk) each fail it distinctly |
| `pnpm audit --audit-level high` | New high-severity advisories | Removing any accepted GHSA id from `pnpm.auditConfig` turns it red |

Two of these assert **that they actually read something** (a file count, a known filename). A guard
that walks the filesystem fails OPEN when its path is wrong: it finds nothing, reports nothing, and
passes forever.
