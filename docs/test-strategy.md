# Test Strategy

## 1. Verified baseline (2026-07-22)
616 passing: 358 API unit · 123 API integration (real Postgres + anvil + IPFS: LSP contract suites, devnet chain tests incl. on-chain compliance rejection, HTTP e2e per module) · 126 web component · 9 Foundry. Lint + strict typecheck clean. **These are the regression floor: existing tests are never weakened to make new code pass; behavior changes that require editing a test are called out in the phase report.**

## 2. Standing method
TDD is mandatory (red → green → refactor, honest observed red). New aggregates ship with exhaustive state-machine transition tables. Fakes and Prisma adapters stay pinned by shared LSP contract suites. Every bug fix starts with a failing reproduction test.

## 3. Test layers (target)

| Layer | Tooling | Status → plan |
|---|---|---|
| Domain unit | Vitest | Strong → continues per module |
| Application service | Vitest + fakes | Strong → continues |
| API integration / HTTP e2e | Vitest + supertest + docker deps | Strong → continues; every new controller gets one |
| Database / repository | LSP contract suites | Strong → every new repo pair |
| Authorization | New: role × endpoint matrix suite | Phase 1.4 — generated table asserting allow/deny per permission; four-eyes tests (maker≠checker, self-approval rejected) |
| Tenant isolation | New | Phase 1.2 — cross-tenant read/write attempts must 404/403 at repository level |
| Ledger conservation | Exists (holds/capture/refund, distribution reconcile) | Extends to journal: debits=credits property test on every flow; parallel-run ledger↔journal reconciliation test |
| State machines | Exists per aggregate | Standardized exhaustive transition-table helper (legal + illegal transitions) |
| Contract unit | Foundry | Extend with governance/pause/recovery paths as they land (P5/8) |
| Chain integration | Vitest + anvil | Extend: tx lifecycle worker tests (submit→confirm, failure→retry→DLQ, reorg simulation via anvil snapshots) |
| Browser E2E | **New: Playwright (OD-4)** | Phase 1.1 CI slot; flows below |
| Accessibility | Playwright + axe-core | Phase 2+ on investor/public pages; keyboard-nav checks |
| Responsive | Playwright viewports (390px / 768px / 1440px) + screenshot artifacts | Phase 2+ |
| Migration | New harness: apply migration to seeded previous-schema snapshot, assert data | Phase 1.2 onward, per migration |
| Failure-recovery / idempotency | New: fault-injection at ports (reject once → retry) | Phase 1.6 — duplicate-suppression proofs for payments/mints |
| Reconciliation | New: seeded divergence → job detects → alert + exception | Phase 6.4 |

## 4. High-risk E2E flows (Playwright unless noted) → phase
1. Investor onboarding → on-chain eligibility (2) · 2. Issuer onboarding (3) · 3. Asset onboarding & approval (3) · 4. Token config & deployment (5; chain integration) · 5. Offering publication (2) · 6. Subscription & payment (2) · 7. Successful close (2; exists as API e2e, add browser) · 8. Failed offering full refund (2; exists as API e2e) · 9. Token issuance (2) · 10. Controlled transfer (5) · 11. Rejected non-compliant transfer (exists at chain layer; browser layer P5) · 12. Income distribution (7; exists as API e2e) · 13. Redemption (7; exists as API e2e) · 14. Wallet recovery (5) · 15. Corporate action (7) · 16. Valuation expiry blocks actions (7; exists as API e2e) · 17. Reconciliation break (6) · 18. Maker-checker rejection (1) · 19. Tenant isolation (1; API layer) · 20. Role permission enforcement (1; API matrix + browser spot checks).

## 5. Financial invariants (named suites, run in CI)
`invariants/journal` debits=credits per entry & per period · `invariants/balances` held+available reconcile; no negative available unless flagged · `invariants/subscriptions` captured+refunded = funded · `invariants/supply` Σallocations ≤ approved supply; chain supply = Σ holder balances (existing registry reconciliation as test) · `invariants/actions` payouts reconcile to declared (exists) · `invariants/ordering` no pay without confirmed burn; no mint without confirmed allocation+settlement (exists, extended to async) · `invariants/idempotency` retried commands produce exactly-once effects.

## 6. CI (Phase 1.1, blocking)
On every push/PR: install → lint → typecheck → api unit → web unit → forge → build (api+web) → migration check (apply all to empty DB) → integration (dockerized pg/ipfs/anvil) → Playwright smoke (once present) → artifact: screenshots + coverage summary. Full E2E suite nightly. A red pipeline blocks merge — no exceptions, failures reported verbatim in phase reports.

## 7. Reporting
Each phase report includes: suite counts before/after, new suites added, any deliberately changed tests with justification, known flakes (tracked, not ignored), coverage of the phase's DoD checklist.
