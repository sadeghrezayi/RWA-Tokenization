# Data Migration Plan

## 1. Context & stance
Environment today: development only (single dev DB, reseedable by standing user authorization; anvil chain state is disposable). There is **no production data yet** — but every migration from Phase 1 onward is written as if production existed, because the pilot DB becomes the template and the discipline must be proven before real data arrives (OD-15 confirms this stance).

## 2. Principles
- **Expand → backfill → contract**: add nullable/new structures, backfill in the same migration (SQL) or a labeled script, enforce constraints in a follow-up migration; drop old columns only after a parallel-run window.
- Prisma Migrate remains the tool; every migration is forward-only + reviewed; destructive steps require an explicit `-- DESTRUCTIVE` header and checker sign-off (maker-checker applies to migrations too, via PR review once CI exists).
- Every migration lands with a **migration test**: apply to a snapshot of the previous schema with representative seed data, assert row-level expectations.
- bigint money columns never change type; amounts never pass through floats in backfill scripts.

## 3. Major planned migrations by phase

| Phase | Migration | Strategy |
|---|---|---|
| 1.2 | `tenants`, `organizations`, `memberships`, `users` | Create; backfill: 1 default Tenant, platform Organization; each `investors` row → `users` (credentials move) + Investor profile keeps FK to user; officer env → seeded role users. `tenant_id` added to all 19 existing tables, backfilled to default tenant, then NOT NULL + composite indexes |
| 1.4 | `roles`, `permissions` (template tables), `approvals` | Create; seed role templates |
| 1.6 | `outbox_events`, `chain_transactions`, `jobs` (pg-boss schema) | Create; historical chain ops NOT backfilled (marked pre-lifecycle) — documented gap, registry remains chain-derived so no loss |
| 1.7 | `tasks`, `notifications` | Create |
| 2.3 | investor onboarding fields (verification states, suitability, agreements), `bank_accounts` | Expand `investors`/new tables; existing approved investors backfilled as `legacy_verified=true` with re-verification task generated |
| 3.1 | `real_estate_profiles`, `spvs`, `asset_ownerships`, `rights_matrices` | Create; existing pilot assets get skeleton profiles flagged incomplete (issuer/ops task) |
| 3.4 | `document_versions` + document status | Expand: each `asset_documents` row becomes version 1, status=approved (they passed the old checklist), hash/CID carried |
| 3.5 | `tokenization_projects`, `tokens`, `token_classes` | Expand-and-move: for each tokenized asset, synthesize project (state=deployed) + token (addresses from `assets.token_address`) + default class; `assets.token_address` kept during parallel-run, dropped in contract step |
| 5.1 | `compliance_policy_versions` | Create; synthesize v1 "default KYC-only policy" for existing tokens (honest description of deployed config) |
| 6.1 | `journal_entries`, `postings`, ledger account typing | Create; **backfill: replay `ledger_entries` history into balanced journal entries** (each existing kind has a deterministic double-entry mapping, e.g. credit → dr bank_clearing / cr customer_cash payable…); parallel-run: nightly reconciliation ledger↔journal until cutover; `ledger_entries` then becomes a view or is archived |
| 6.2 | `payments`, `payout_batches` | Create; historical credits represented as `payment(kind=dev_credit, state=confirmed)` clearly labeled |
| 7.1 | `corporate_actions` (+snapshots) | Expand-and-move: each `distributions` row → corporate_action(type=income_distribution) with payouts preserved; `distributions` kept as view during transition |
| 8 | PII encryption at rest | Column-level encryption for identity evidence/bank details: add encrypted columns, dual-write, backfill-encrypt, drop plaintext (DESTRUCTIVE, staged) |

## 4. Chain/data consistency during migration
On-chain state is never migrated — it is *reconciled*: after any schema move touching tokens/holdings, the Phase-1 reconciliation job (registry vs chain) must run clean before the migration is declared done. Dev-chain resets (anvil) follow the existing runbook: redeploy, update env, truncate chain-linked tables, reseed — this remains dev-only and is retired for any persistent network (Besu+).

## 5. Rollback
Forward-only migrations + DB snapshot before each phase's migration batch (`pg_dump` archived). Rollback = restore snapshot + revert deploy. Parallel-run periods (ledger, distributions, token_address) mean the old read-path stays correct throughout the window, so rollback risk concentrates in the short contract steps, which are scheduled separately from feature deploys.

## 6. Verification checklist per migration
applies cleanly on empty DB · applies on seeded previous-schema snapshot · row counts + invariants asserted · full test suite green after · reconciliation jobs clean · documented in phase completion report.
