# Target Product Architecture

## 1. Shape: modular monolith, evolved in place

Keep one NestJS API and one Next.js app as the spine (matches team size, self-hosted constraint, and the working codebase). Extract services only when a seam proves it needs independent scaling. The Clean Architecture layering (domain → application → infrastructure) is retained verbatim; the transformation adds **new bounded modules** beside the existing ones and **hardens the edges**.

```
services/api/src/
  domain|application|infrastructure/   ← existing modules stay
    tenancy/        Tenant, Organization, Membership, ServiceProvider
    access/         Role, Permission, policy evaluation, maker-checker Approval
    work/           Task, Queue, SLA, Comment, assignment
    parties/        Investor(→Party), BeneficialOwner, BankAccount, KYB
    realestate/     Property profile, rights matrix, performance
    projects/       TokenizationProject, Token, TokenClass, deploy pipeline
    corporate/      CorporateAction engine (absorbs distributions)
    payments/       Payment, import adapters, matching, reconciliation
    ledger2/        Double-entry Journal/Posting (wraps existing rail)
    compliance/     ComplianceCase, screening ports, risk scoring
    notifications/  Event → template → channel adapters, preferences, log
    documents/      Versioned data-room layer over IPFS store
    reports/        Report definitions, generation, history
    workflows/      Outbox, job runner port, tx lifecycle, reconciliation jobs
```

## 2. Multi-tenancy (pending OD-1)

Recommended: **single-database, tenant-scoped rows**. `tenant_id` on every tenant-owned table; a request-scoped `TenantContext` resolved from the authenticated principal; repository base enforces the tenant predicate (never trusted from client input); cross-tenant access is impossible by construction and covered by dedicated isolation tests. Platform-level rows (staff of the operator tenant) use the root tenant. Organizations (issuers, service providers) nest under a tenant; users attach via **Memberships** carrying roles.

## 3. Identity, access, approvals

- **Principals**: User (person) with credentials (argon2id + MFA TOTP) → Memberships (tenant/org, role[]) → resolved PermissionSet per request.
- **RBAC**: permissions are strings (`asset.approve`, `payment.match`, `case.decide`, …) grouped by role templates (see role-permission-matrix.md). Guards check permission + tenant + object ownership (object-level authz in repositories/use-cases, not controllers).
- **Maker-checker**: a generic `Approval` aggregate — sensitive use-cases don't execute directly; they create an `Approval(action, payload, maker)` that a distinct checker with the counter-permission executes. Four-eyes enforced in the application layer; every approval is an audit event. Sensitive set initially: tokenize/deploy, offering open/close overrides, manual ledger adjustment, payout batch, forced transfer, freeze, wallet recovery, case decisions above risk threshold, valuation approval.
- **Sessions**: httpOnly secure cookies, short-lived access + rotating refresh, device list, revocation; CSRF token for state-changing routes; rate limiting + lockout at the auth edge.

## 4. State machines as first-class code

A tiny shared `StateMachine<TState, TEvent>` helper in the domain layer (declarative transitions, guard hooks, emitted domain events). Each lifecycle from the mandate gets a machine in its aggregate; transitions are the *only* way state changes (constructors private, `restore` for persistence). Every machine ships with an exhaustive transition-table test. Existing aggregates (KYC, Asset, Offering, Redemption, FollowUp) are already shaped this way — they get migrated onto the helper without behavior change.

## 5. Asynchrony and consistency (Part 18)

- **Transactional outbox**: domain events written in the same DB transaction as state; a dispatcher job publishes to handlers (notifications, projections, chain workers).
- **Job runner**: `pg-boss` recommended (Postgres-backed — no new infra; OD-3). Queues: `chain.tx`, `notify`, `reconcile`, `reports`, `screening`.
- **Chain tx lifecycle**: `ChainTransaction` entity (prepared → awaiting_approval → submitted → pending → confirmed | failed | replaced | reverted | reconciliation_required). HTTP handlers *request* chain work; a worker submits, watches confirmations, and advances the owning aggregate. Devnet keeps a fast path; the states exist everywhere. Nothing is "done" at submission.
- **Idempotency**: client idempotency keys on money/token mutations; natural keys + upserts in workers; retries with backoff → DLQ → operator exception queue.
- **Reconciliation jobs**: chain-vs-registry, ledger-vs-journal, payments-vs-bank, supply-vs-holders; breaks create RiskAlerts + tasks.

## 6. Payments & ledger (Part 7)

Double-entry core: `JournalEntry` (balanced postings, immutable) over `LedgerAccount` (typed: customer_cash, escrow, issuer_payable, distribution_payable, platform_revenue, refunds_payable, fees_receivable, settlement, bank_clearing, adjustment). The existing `PrismaSettlementRail` becomes a **facade** that writes journal entries; its conservation tests keep passing throughout (parallel-run: old `ledger_entries` reconciled against journal until cutover). `Payment` aggregate with the 13 mandated states; bank-import port with a labeled dev adapter (replaces the raw credit endpoint, which survives only as `DevBankAdapter`).

## 7. Chain abstraction (Part 5)

`TokenPlatformPort` (deploySuite, mint, burn, transfer, freeze, forceTransfer, recover, pause, registryOps) with the ERC-3643/ethers adapter as implementation #1. Compliance policy is authored as **versioned, human-readable JSON policy documents** rendered to module configuration at deploy; the policy document (not the chain) is the reviewable artifact. Key management behind `SignerProvider` (dev: env mnemonic, clearly labeled; prod target: encrypted keystore/KMS + threshold approval — OD-10/16).

## 8. Portals & routing (pending OD-2)

One Next.js app, four route groups sharing the design system:
```
/(public)         marketing + marketplace (SSG/ISR, SEO, no auth)
/(investor)       current portal grows to 13 sections
/(issuer)         new issuer portal
/(ops)            current admin grows into ops console
/(external)       auditor/regulator/provider scoped views
```
Session cookie carries membership context; middleware guards groups by portal permission. RSC for public/read-heavy pages; client components where interactive. Existing pages map 1:1 into their groups (no rewrite of working screens — they get redesigned within the system).

## 9. Notifications, documents, reporting

- **Notifications**: outbox events → notification service → channel adapters (in-app table + WS/poll, email via SMTP port with dev sink, SMS/push ports stubbed+labeled). Templates versioned + localized; per-user preferences; delivery log with retry/failed states.
- **Documents**: `Document` + `DocumentVersion` (status machine, access policy, hash, CID, acknowledgment requirements) layered over the existing IPFS store; investor UX shows titles/status, technical proof in expandable detail.
- **Reports**: definition registry (query + shape + renderer), CSV first-class, PDF via headless Chromium (already proven in this repo for screenshots), generation history + scheduled runs via job runner.

## 10. Observability & ops

Structured JSON logs with PII redaction; request ids; audit events remain domain-level. Metrics endpoint (Prometheus text) for queues, tx lifecycle, reconciliation breaks. Health endpoint stays. Backup: nightly `pg_dump` + IPFS pin-set export; restore runbook tested. CI (GitHub Actions or self-hosted runner — OD-19): lint, typecheck, unit, integration (dockerized pg/ipfs/anvil), web, forge, build, migration check.

## 11. What explicitly does not change

Domain purity rules · bigint integer Rial · TDD red→green→refactor · on-chain compliance as ultimate authority · IPFS immutability for legal docs · English-default localized UI · hand-rolled design system (extended, not replaced) · ERC-3643 as token standard #1.
