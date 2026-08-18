# IMPLEMENTATION STATUS (verified 2026-08-16 @ `9e63980`)

Status vocabulary:

| Status | Meaning |
|---|---|
| **COMPLETE** | The intended workflow works end to end, is tested, and is reachable by a person through the UI (or is an API-only feature where that is the agreed scope) |
| **COMPLETE BUT NEEDS HARDENING** | Works and is tested, but has a named production gap (keys, scale, ops) |
| **PARTIAL** | Some of the workflow exists; a named part is missing |
| **STUB/MOCK** | Deliberately labelled non-real implementation |
| **PLANNED** | On the roadmap, no code |
| **NOT STARTED** | No code, not scheduled soon |
| **UNKNOWN** | Needs verification |

Test counts at this commit: **725 API unit · 319 API integration · 343 web unit · 24 Playwright ·
Foundry contract tests**. CI green on `9e63980`.

---

## Identity, authentication, authorization

| Feature | Status | Evidence | Key files | Tests | Limitations / next action |
|---|---|---|---|---|---|
| Investor registration + login | **COMPLETE** | e2e + browser journey | `application/identity/register-investor.ts`, `authenticate-investor.ts` | `test/application/identity/*`, `investors-api.e2e` | — |
| Officer/staff login (multi-role) | **COMPLETE** | e2e | `authenticate-staff.ts`, `StaffUser`, `StaffMembership` | `staff-rbac-api.e2e` | Staff users are seeded from env, not manageable in the UI |
| httpOnly cookie sessions + CSRF | **COMPLETE** | e2e | `http/session.ts`, `cookies.ts`, `csrf.guard.ts` | `auth-cookie-csrf-api.e2e` | — |
| Password reset (self-service) | **COMPLETE** | e2e | `request-password-reset.ts`, `reset-password.ts` | `auth-password-reset-api.e2e` | Email goes to the dev sink, not SMTP |
| Email verification | **COMPLETE** (informational) | e2e | `verify-email.ts` | `auth-email-verification-api.e2e` | **By decision OD-22 nothing is gated on it** — an unverified/mistyped address can reach a KYC decision that cannot be delivered |
| Login throttle / lockout / rate limit | **COMPLETE** | e2e | `login-throttle-service.ts`, `rate-limit.guard.ts` | `auth-throttle-api.e2e` | Edge limiter is **in-memory** → per-process, resets on restart, useless behind >1 instance |
| Officer TOTP MFA | **COMPLETE** (opt-in) | e2e | `start-mfa-enrollment.ts`, `otplib-totp-service.ts` | `auth-officer-mfa-api.e2e`, `otplib-totp-service` | Opt-in by decision; mandatory-for-privileged is OD-23, still open |
| RBAC (16 permissions, 7 roles, deny-by-default) | **COMPLETE** | matrix pinned by test | `application/identity/authorization.ts`, `http/auth.guard.ts` | `authorization.test.ts`, `staff-rbac-api.e2e` | — |
| Investor auth on `Investor`, staff on `StaffUser` | **PARTIAL by decision** | schema | `prisma/schema.prisma` | — | Migrating investor auth onto `User` was **deferred** in 1.4c; two auth tables remain |

## KYC / onboarding

| Feature | Status | Evidence | Key files | Tests | Limitations / next action |
|---|---|---|---|---|---|
| Onboarding wizard (individual) | **COMPLETE** | browser journey | `application/onboarding/*`, `components/investor/onboarding-wizard` | `onboarding-api.e2e`, `onboarding-wizard.test.tsx` | Field set is **provisional**, marked "REQUIRES LOCAL LEGAL VALIDATION" in `onboarding-form.ts` |
| Encrypted KYC evidence store | **COMPLETE BUT NEEDS HARDENING** | integration | `infrastructure/crypto/aes-gcm-cipher.ts`, `persistence/prisma-evidence-store.ts` | `prisma-evidence-store.test.ts` | AES-256-GCM in Postgres with a real `erase()`. **Key comes from `KYC_EVIDENCE_KEY` config** — no rotation, escrow or KMS. Retention/erasure **policy** does not exist |
| Officer KYC review + decision | **COMPLETE** | e2e + journey | `approve-kyc.ts`, `reject-kyc.ts`, admin `kyc` page | `kyc-use-cases`, `notification-triggers-api.e2e` | Approval issues the ONCHAINID claim synchronously; a chain outage fails the request |
| Resubmission loop ("request changes") | **COMPLETE** | e2e | `request-onboarding-changes.ts` | `onboarding-api.e2e` | **Flagged:** an application waiting on the *applicant* still shows in the officer queue |
| KYC rejection is terminal | **COMPLETE (by design)** | domain | `kyc-status.ts` | domain tests | A rejected applicant **cannot re-apply**. Whether they should is an open product question |
| Entity/company onboarding (KYB for investors) | **NOT STARTED** | explicit refusal | `EntityOnboardingNotAvailableError` | — | Deliberately refused with a clear error rather than half-built |
| Screening / sanctions provider | **STUB/MOCK** by decision (OD-11) | — | — | — | Port + clearly-labelled dev mock only; officers review manually |

## Assets

| Feature | Status | Evidence | Key files | Tests | Limitations |
|---|---|---|---|---|---|
| Asset lifecycle + checklist + dossier | **COMPLETE** | e2e + admin UI | `domain/assets/asset.ts`, `legal-dossier.ts` | `assets-api.e2e`, domain tests | — |
| Legal documents on IPFS | **COMPLETE** | integration | `infrastructure/documents/ipfs-document-store.ts` | `ipfs-document-store.test.ts` | Content is public to anyone with the CID (intended for legal docs only) |
| Custody arrangement | **COMPLETE** | e2e | `custody-arrangement.ts`, `record-custody.ts` | domain + e2e | Free-text record; no custodian integration |
| Real-estate profile (3.1) | **COMPLETE** | e2e + Asset 360 UI | `real-estate-profile.ts`, `record-real-estate-profile.ts` | domain + e2e + web | — |
| Rights matrix (3.1) | **COMPLETE** | e2e + Asset 360 UI | `rights-matrix.ts`, `set-conveyed-right.ts` | domain + e2e + web | Catalogue is `RIGHTS_ARE_PROVISIONAL = true`. **Open:** should approval be blocked until rights are established? |
| Approval freezes dossier + rights | **COMPLETE** | domain tests | `asset.ts` (`assertDossierEditable`) | domain | Document **visibility** is deliberately still changeable after approval |
| Tokenization (per-asset ERC-3643) | **COMPLETE BUT NEEDS HARDENING** | devnet integration | `chain/trex-asset-token-deployer.ts` | `trex-asset-token-deployer.test.ts` | Synchronous; single operator key; anvil only |
| Documents centre (holder-visible subset) | **COMPLETE** | e2e + both UIs | `set-document-visibility.ts`, `get-my-asset-documents.ts` | `assets-api.e2e`, `portfolio-api.e2e` | No per-holder access log, no watermarking, no versioning |
| Asset ↔ issuer organisation link | **COMPLETE** (3.3a–3.3c) | domain + repository-contract + `assets-api.e2e` + 7 web tests + a live browser walk | `domain/assets/asset.ts` (`organisationId`), `application/assets/propose-asset.ts`, `get-asset.ts`, `apps/web/components/assets-panel.tsx`, `asset-detail-page.tsx` | `asset.test.ts`, `asset-repository.contract.ts`, `assets-api.e2e`, `assets-panel.test.tsx`, `asset-detail-page.test.tsx` | Nullable and **not** backfilled: NULL is the true answer for a staff-onboarded asset. Settled at proposal and never changed afterwards. **Open (user's call):** must every FUTURE asset belong to an organisation? |

## Offerings, money and settlement

| Feature | Status | Evidence | Key files | Tests | Limitations |
|---|---|---|---|---|---|
| Offering lifecycle + publication | **COMPLETE** | e2e + journey | `domain/offerings/offering.ts`, `publish-offering.ts` | `offerings-api.e2e`, `public-catalog-api.e2e` | — |
| Public catalogue (ISR) | **COMPLETE** | Playwright | `application/public/*`, `app/[locale]/(public)` | `public-catalog-api.e2e`, `public-catalog.test.tsx` | ISR purge needs `REVALIDATE_SECRET` on **both** API and web or a published offering stays invisible for the whole window |
| Subscription + escrow hold | **COMPLETE** | journey | `subscribe-to-offering.ts` | `offerings-api.e2e` | — |
| Pro-rata close + full refund of unallocated | **COMPLETE** | e2e (incl. over-subscribed + failed cases) | `close-offering.ts` | `offerings-api.e2e`, `journey.spec.ts` | — |
| Internal Rial ledger | **COMPLETE** | e2e | `LedgerAccount`/`LedgerEntry`, `infrastructure/settlement/prisma-settlement-rail.ts` | `funding-api.e2e`, ledger tests | **Single-entry**, not double-entry. Double-entry journal is roadmap 6.1 |
| Funding (declare → treasury confirms actual amount) | **COMPLETE** | e2e | `application/funding/*` | `funding-api.e2e` | Manual reconciliation by a human; no bank import |
| Maker-checker on ledger credit | **COMPLETE** | e2e, transactional | `approvals/*`, `prisma-approval-commit.ts` | `approvals-api.e2e`, `prisma-approval-commit.test.ts` | Threshold `LEDGER_CREDIT_APPROVAL_THRESHOLD_RIAL` is a **placeholder requiring local policy validation** |
| Distributions (declare → pay pro-rata) | **COMPLETE** | e2e | `declare-distribution.ts`, `pay-distribution.ts` | `distributions-api.e2e` | Rows paid before the `paid_at` migration are **excluded** from the income statement rather than shown undated |
| Transfers (compliance-checked) | **COMPLETE** | devnet e2e | `application/transfers/*`, `chain/trex-asset-token-mover.ts` | `transfers-redemptions-api.e2e` | Operator-approved model only (OD-9(a)) |
| Redemption at attested value | **COMPLETE** | devnet e2e | `application/redemptions/*` | `transfers-redemptions-api.e2e` | Refused without a fresh valuation (`NoFreshValuationError`) |
| Fees | **NOT STARTED by decision (OD-20)** | — | — | — | Checkout charges exactly price × tokens |
| Payment provider / PSP | **NOT STARTED by decision (OD-6)** | — | — | — | Manual bank rail only |
| Digital Rial / CBDC | **NOT STARTED** | — | — | — | Never scoped; mentioned only as a possible future rail |

## Oracle / valuation

| Feature | Status | Evidence | Key files | Tests | Limitations |
|---|---|---|---|---|---|
| Signed attestations + freshness | **COMPLETE** | integration | `domain/attestations/attestation.ts`, `publish-attestation.ts` | `attestations-api.e2e` | Internal signer; single key |
| On-chain anchoring | **COMPLETE** | devnet | `chain/attestation-chain.ts`, `contracts/src/AttestationRegistry.sol` | `attestation-chain.test.ts`, `AttestationRegistry.t.sol` | Anchoring is best-effort in the same request |
| Valuation lifecycle (review/approve/supersede/dispute) | **PLANNED** (roadmap 7.3) | — | — | — | Today a publish is final |

## Registry, audit, reporting

| Feature | Status | Evidence | Key files | Tests |
|---|---|---|---|---|
| Holder registry rebuilt from chain events | **COMPLETE** | devnet | `domain/registry/holder-registry.ts`, `chain/ethers-token-event-source.ts` | `registry-audit-api.e2e`, `ethers-token-event-source.test.ts` |
| CSV exports (registry, transfers) | **COMPLETE** | e2e | `http/reporting.controller.ts` | `registry-audit-api.e2e` |
| Audit trail (queryable) | **COMPLETE** | e2e + coverage test | `application/reporting/*`, `AssetEvent` | `registry-audit-api.e2e` |
| Ops work queue (`/reporting/work-queue`) | **COMPLETE** | e2e + admin UI | `application/ops/*` | `work-queue-api.e2e`, `ops-panel.test.tsx` |
| System health probe | **COMPLETE** | e2e | `application/reporting/ports.ts` (`HealthProbe`) | `system-health.test.ts` |
| Report registry (~24 reports), PDF | **NOT STARTED** (roadmap 8.1) | — | — | — |

## Notifications

| Feature | Status | Evidence | Key files | Tests |
|---|---|---|---|---|
| In-app notification centre (both portals) | **COMPLETE** | web tests | `notifications.controller.ts`, `components/notification-bell.tsx` | `notifications-api.e2e`, `notification-bell.test.tsx` |
| Triggers: approval-pending, KYC decided, distribution paid, follow-up due | **COMPLETE** | e2e | `application/notifications/notify-*.ts` | `notification-triggers-api.e2e`, `follow-up-due-scan.test.ts` |
| Email delivery | **STUB/MOCK (dev sink)** | — | `application/identity/email-outbox.ts` | outbox tests | **No SMTP adapter exists.** OD-7 defers provider choice; nothing reaches a real inbox |
| SMS | **NOT STARTED** | — | — | — |

## Issuers (Phase 3.2 — newest work)

| Feature | Status | Evidence | Key files | Tests | Limitations |
|---|---|---|---|---|---|
| Issuer organisation domain + lifecycle | **COMPLETE** | domain tests | `domain/issuers/issuer-organisation.ts` | `issuer-organisation.test.ts` | — |
| Issuer memberships + roles | **COMPLETE** | domain tests | `issuer-membership.ts` | `issuer-membership.test.ts` | `IssuerMembership.canWorkOnAssets()` still has **no production caller** — it is the per-person check the issuer-facing portal will need. The *organisation*-level gate `IssuerOrganisation.canSubmitAssets()` is live in `propose-asset.ts` (3.3b) |
| Persistence + tenant isolation | **COMPLETE** | contract + isolation tests | `persistence/prisma-issuer-repository.ts` | `prisma-issuer-repository.test.ts`, `tenant-isolation.test.ts` | — |
| Individual-verification gate | **COMPLETE** | e2e + **mutation-checked** | `application/issuers/require-verified-person.ts`, `investor-person-verification.ts` | `issuers-api.e2e`, `prisma-person-verification.test.ts` | Fails closed for unknown people |
| Issuer HTTP API (apply/review/decide/team) | **COMPLETE** | `issuers-api.e2e` 18 tests | `http/issuers.controller.ts` | `issuers-api.e2e` | — |
| Issuer **review screen** (staff) | **COMPLETE** (3.2f) | 14 web tests + a layout contract + a live browser walk of both decision paths | `apps/web/app/[locale]/admin/issuers/`, `components/admin/issuers-panel.tsx` | `issuers-panel.test.tsx`, `layout.spec.ts` | Names the deciding officer, not their account id (K-19 fixed 2026-08-17) |
| Issuer **team** management UI | **NOT STARTED** | — | endpoints exist | — | Add/list/remove members is HTTP-only |
| Issuer portal (issuer-facing) | **PARTIALLY IMPLEMENTED** | web tests + layout contract + `issuers-api.e2e` | `apps/web/app/[locale]/issuer/`, `http/issuers.controller.ts` | `issuer-landing.test.tsx`, `use-browser-session.test.ts`, `layout.spec.ts`, `issuers-api.e2e` | Shipped: the portal shell, the landing page, "which organisations are mine" (3.3d/3.3e), the read of **the assets an organisation brought** (3.3f, `GET /issuers/:id/assets`, membership-authorised + mutation-checked), and **the screen for it** (3.3g) — the organisation's name on the landing page leads to its assets, browser-verified across four cases including a guessed id, which is refused rather than shown an empty list. **Not built:** the submission wizard — that scope is the owner's call |
| What an issuer may see about investors | **DISCUSSED, ANSWERED IN PRINCIPLE, NOT IMPLEMENTED** | decision log | — | — | User answered "all necessary information"; the concrete field list must be proposed and approved before anything is exposed |

## CRM

| Feature | Status | Key files | Tests |
|---|---|---|---|
| Stage, tags, notes, follow-ups | **COMPLETE** | `application/crm/*`, admin investor detail page | `prisma-crm-repositories.test.ts`, `crm-*.test.tsx` |
| Follow-up ownership | **NOT STARTED** | — | Reminders go to *all* staff holding `crm.manage` because follow-ups have no owner field |

## Cross-cutting

| Feature | Status | Notes |
|---|---|---|
| Multi-tenancy (schema + scoping + isolation tests) | **COMPLETE** for OD-1a scope | SaaS ops (billing, tenant self-service, cross-tenant job sweeps) deliberately deferred |
| Transactional outbox | **COMPLETE** | In-process drainer; multi-node draining untested |
| pg-boss scheduled jobs | **COMPLETE** | Runs against the **default tenant only** |
| i18n | **PARTIAL** | Route structure + dictionary exist; **`en` only** is populated (fa/RTL is OD-13, unapproved) |
| Mobile responsiveness | **COMPLETE** | Playwright mobile project asserts layout contracts |
| Accessibility | **PARTIAL** | axe-core approved in OD-4 but **no automated a11y assertions are in the suite** |
| Observability / metrics / structured logs | **NOT STARTED** | Roadmap 8.3 |
| Backups / DR | **NOT STARTED** | — |
| Deployment (staging/production) | **NOT STARTED** | No hosting, no reverse proxy, no secrets manager |
