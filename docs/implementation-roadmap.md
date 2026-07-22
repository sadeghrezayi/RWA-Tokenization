# Implementation Roadmap

Phases follow the mandate (0–8). Each phase = multiple reviewed slices (domain TDD → infra → UI → live verification), ends with the Part-21 completion report. Nothing ships with dead buttons: portals/pages appear only when their workflow is real. Baseline entering Phase 1: 616 tests green, lint/tc clean.

## Phase 0 — Audit & architecture (THIS PHASE)
Deliverables: the 10 docs + open-product-decisions.md, summary, user decision round. Exit: user confirms decisions OD-1…OD-19 (or defaults accepted).

## Phase 1 — Foundation (largest risk-reduction per week)
| Slice | Content | Touches existing |
|---|---|---|
| 1.1 CI | Pipeline running all suites + build + migration check on every push | none |
| 1.2 Tenancy & orgs | Tenant/Organization/Membership/User schema; investors→users backfill; TenantContext + scoped repos; isolation tests | investors, auth |
| 1.3 AuthN hardening | httpOnly cookie sessions + refresh rotation, email verification, password reset, TOTP MFA, rate limits, lockout | auth, both shells |
| 1.4 RBAC + approvals | Permission service, role templates, re-annotate all 57 endpoints, Approval aggregate + checker inbox API, four-eyes tests | every controller |
| 1.5 State-machine helper | Shared machine; migrate KYC/Asset/Offering/Redemption aggregates onto it (behavior-frozen — existing tests must not change) | domain |
| 1.6 Async spine | Outbox table + dispatcher, pg-boss queues, ChainTransaction lifecycle entity; move tokenize/mint/transfer/burn submission to workers (devnet fast-path preserved); idempotency keys | chain adapters |
| 1.7 Task/notification foundation | Task + Notification schema, in-app feed, event wiring from outbox | — |
| 1.8 Design-system growth + ops shell v2 | Stepper, drawer, timeline, charts (SVG, no dep unless OD-4b), skeletons, metric cards, filter bar; `/ops` work-queue dashboard replacing overview | admin shell |
Exit: all portals still fully functional; officer replaced by seeded role users; every prior test green + new suites (isolation, authz matrix, machine tables, outbox, tx lifecycle).

## Phase 2 — Public marketplace & investor experience
2.1 Public route group: homepage, browse (published offerings only), offering detail page (full Part-16 layout), education/legal pages (jurisdiction-configurable content blocks).
2.2 Offering publication flow: publish → public listing; terms versioning; SEO/ISR.
2.3 Investor onboarding wizard (individual first, entity behind KYB flag): email verify → profile → identity evidence upload → bank account → suitability → agreements → progress view; resubmission loop.
2.4 Checkout (10 steps) over existing subscription/escrow engine; payment instructions screen (manual rail).
2.5 Dashboard + portfolio analytics (charts, allocation, actions required); position detail; documents center v1; notification center v1.
2.6 Mobile pass + screenshots.
Exit E2E: browse→register→verify→KYC→invest→pay(dev rail)→allocation visible; failed-offering refund visible.

## Phase 3 — Issuer portal & real-estate onboarding
3.1 RealEstateProfile + rights matrix schema; Asset 360 (ops) tabs.
3.2 Issuer org onboarding (ops-approved), team & roles.
3.3 13-step tokenization wizard with drafts, completeness %, validation, review comments, tasks, status history, SLA indicators.
3.4 Document versioning + review states (data-room v1).
3.5 TokenizationProject entity wrapping existing deploy (config snapshot → approval → deploy via worker → receipts → verification).
Exit E2E: issuer submits real-estate asset → analyst review loop → approval → project → deployed token.

## Phase 4 — Operations & compliance depth
4.1 Case management (queues, SLAs, evidence, decisions, four-eyes on high-risk).
4.2 Screening adapter ports + labeled dev mock; risk scoring; periodic review scheduling.
4.3 Document review queue; investor/org review workspaces; Investor 360 completion.
4.4 External portal v1 (auditor/regulator read-only, valuer submission).
Exit: all sensitive ops actions flow through tasks/approvals; audit coverage test extended.

## Phase 5 — Token Design Studio
5.1 TokenClass + CompliancePolicyVersion (human-readable, versioned).
5.2 Config wizard → policy rendering to ERC-3643 module config; eligibility/limit/lockup/window options mapped; unsupported combos rejected honestly.
5.3 Simulation (fork/dry-run) + deployment approval + receipts + post-deploy verification checks.
5.4 Transfer-agent upgrades: preflight endpoint, freeze/partial freeze, forced transfer, wallet replacement/recovery — each maker-checker + audited; holder snapshots + historical cap table + PDF exports.
Exit E2E: configure class → simulate → approve → deploy → rejected transfer shows human reason; recovery flow.

## Phase 6 — Payments & accounting
6.1 Double-entry journal (parallel-run with existing ledger; conservation tests ×2 until cutover).
6.2 Payment aggregate (13 states), bank-import port + dev adapter (replaces credit endpoint UI; endpoint demoted to labeled dev tool), matching + unmatched queue.
6.3 Treasury: payout batches, maker-checker, failed-payout handling, receipts/invoices (PDF).
6.4 Reconciliation jobs (ledger/journal/bank/chain) + break alerts.
Exit: invariants suite (debits=credits, held/available, captured+refunded) green; reconciliation-break E2E.

## Phase 7 — Post-issuance
7.1 CorporateAction engine; migrate distributions onto it (payout math reused verbatim; regression suite frozen).
7.2 Record-date snapshots, announcement→execution→reconciliation, notifications, reports.
7.3 Voting/consent v1; redemption queue + liquidity modes (per OD-9); valuation lifecycle (review/approve/supersede/dispute) + performance reporting.
Exit E2E: full corporate action with record date; valuation expiry blocks dependent actions (existing behavior generalized).

## Phase 8 — Reports, hardening, production readiness
8.1 Report registry (~24 reports), CSV+PDF, scheduling, history; regulator/auditor scoped exports.
8.2 Security: CSP, dependency audit gate, PII encryption at rest, log redaction, secrets management, key-management target (OD-16), threshold/multisig chain governance + timelock (OD-10), pause runbooks.
8.3 Observability (metrics, structured logs), backup/restore drills, DR + incident docs, performance pass, accessibility audit.
8.4 Production-readiness assessment vs threat model; penetration-test prep.

## Cross-phase rules
- TDD for every behavior; existing tests are a regression floor — never edited to pass except for deliberate, documented behavior changes.
- Every phase ends: lint, typecheck, unit, integration, web, forge, migration test, build, desktop+mobile screenshots, docs update, honest completion report (failures never hidden).
- Feature flags gate half-built portals out of production routes; no fake buttons.
- Jurisdiction-sensitive logic lands as configurable policy marked "requires local legal validation" — never hardcoded legal claims.

## Sequencing rationale
Foundation (P1) precedes everything because tenancy/RBAC/async retrofits get costlier with each new module. Public+investor (P2) before issuer (P3) because it exercises the full existing engine with real UX early. Payments (P6) after ops (P4) so treasury lands with maker-checker already proven. Studio (P5) before payments is swappable with P6 if user prefers revenue-side first — flagged in OD-18.
