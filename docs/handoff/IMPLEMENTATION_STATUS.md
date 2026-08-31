# IMPLEMENTATION STATUS (verified 2026-08-31 @ `0cfe976`)

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

Test counts at this commit, each observed rather than carried forward: **974 API unit · 440 API
integration (67 files, no skips, on a FRESH anvil) · 541 web unit · 9 Foundry**. Playwright: **17
tests declared** across `layout` (10), `a11y` (4) and `journey` (3) — declared, not run locally;
they are verified on CI, which is green on `0cfe976`.

> Rows below dated 2026-08-16 were verified at `9e63980` and have not been individually re-checked
> since; rows added or edited later carry their own date. This distinction is the point of the
> document — an inventory that quietly implies everything was re-verified today would be worth less
> than one that says which parts were.

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
| Screening / sanctions provider | **BUILT AS A LABELLED MOCK** (OD-11) | browser: 201 with disclaimer, 409 refusal | `domain/screening/screening-result.ts`, `application/screening/*`, `infrastructure/screening/mock-sanctions-screening.ts`, `components/admin/screening-card.tsx` | `screening-repository-contract` (fake+Prisma), `screen-investor.test`, `screenings-api.e2e`, `screening-card.test.tsx` | The adapter checks **nothing**: `simulated: true` is hard-coded and the result carries a disclaimer the officer sees beside the outcome. Results are **append-only** and decide nothing on their own. **Choosing a real provider is an open owner decision.** |
| Customer risk rating (4.2) | **BUILT — advisory only** | browser: model rendered, low + high rated, partial refused 409 | `domain/risk/risk-rating.ts`, `application/risk/{risk-model,assess-risk,risk-views}.ts`, `components/admin/risk-card.tsx` | `risk-rating.test`, `assess-risk.test`, `risk-assessment-repository-contract` (fake+Prisma), `investors-api.e2e`, `risk-card.test.tsx` | **The factors and weights are a PROVISIONAL generic set, not a methodology — they REQUIRE LOCAL LEGAL VALIDATION**, and the officer reads that on the card. The rating is advisory: nothing in the platform reads a band and approves, refuses or limits anybody. An unrated file is `unrated`, never `low` — the domain refuses an empty assessment. Append-only; the band is stored as DECIDED, never recomputed. **Periodic review scheduling (the third part of roadmap 4.2) is NOT built.** |
| Periodic review scheduling (4.2) | **BUILT — a work list, not enforcement** | browser: 15 approved customers listed never-reviewed, rating one dropped it to 14 | `domain/risk/review-schedule.ts`, `application/risk/list-due-reviews.ts`, `components/admin/due-reviews-panel.tsx`, `/[locale]/admin/reviews` | `review-schedule.test`, `list-due-reviews.test`, `investors-api.e2e`, `due-reviews-panel.test.tsx` | **The cadence (high 12 / medium 24 / low 36 months) is PROVISIONAL and REQUIRES LOCAL LEGAL VALIDATION** — shown to the officer above the list. A lapsed review **restricts nobody**: nothing suspends, freezes or limits a customer. A never-rated approved customer ranks FIRST, not omitted. Deliberately its own screen, NOT a fourth item in the ops work queue, whose contents were settled as a product decision. **No scheduler runs**: the list is computed on read, and no reminder or notification is sent — wiring it to pg-boss is a follow-up. |

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
| Documents centre (holder-visible subset) | **COMPLETE** — K-33 fixed 2026-08-19 (`75cde21`); real files attach | e2e + both UIs | `set-document-visibility.ts`, `get-my-asset-documents.ts`, `asset-detail-page.tsx`, `issuer-assets.tsx` | `assets-api.e2e`, `portfolio-api.e2e` | Both the admin and issuer screens have a real file picker (10 MB client limit, 16 MB server body limit). **Transport is still base64 in a JSON body**, not multipart as the KYC evidence path uses — which inflates a payload ~33% and is why the body limit is 16 MB for a 10 MB file. No per-holder access log, no watermarking, no versioning. Malware scanning deferred to 3.4 (threat model T17) |
| Document review + approval gate (4.3) | **COMPLETE** | browser: queue rendered, empty rejection blocked client-side, rejection reason shown to the next reviewer | `domain/assets/legal-dossier.ts` (DocumentReview), `asset.ts` (approve gate), `application/assets/review-dossier-document.ts`, `list-documents-awaiting-review.ts`, `components/admin/document-review-queue.tsx`, `/[locale]/admin/documents` | `document-review.test`, `review-dossier-document.test`, `list-documents-awaiting-review.test`, asset repository contract (fake+Prisma), `assets-api.e2e`, `document-review-queue.test.tsx` | **Approval now REFUSES while any required document is unreviewed or rejected**, naming which. A document arrives `pending`; a rejection requires a reason; a rejected document stays outstanding; replacing a document returns it to pending. Both decisions are written to the asset event log. **Consequence:** an asset still IN STRUCTURING with documents already attached needs each reviewed before approval; already-approved assets are unaffected (frozen dossier). **Not built:** no four-eyes on a document decision, and no SLA/ageing on the queue. |
| Investor 360 (4.3) | **PARTIAL BY DESIGN — 7 of the IA's 10 tabs** | browser: 7 tabs, one panel in the DOM at a time, cash shows declared → arrived | `components/admin/investor-360-tabs.ts`, `investor-detail-page.tsx`, `investor-cash-card.tsx`, `GET /funding/investors/:id` | `investor-360-tabs.test.tsx`, `investor-cash-card.test.tsx`, `investor-detail-page.test.tsx`, `funding-api.e2e` | Tabs: Overview · Identity & compliance · Investments · Portfolio · Cash & payments · Transfers · Communications. **Deliberately ABSENT (no dead nav): Documents** (a person's documents ARE their identity evidence, already in the compliance tab), **Cases** (`/ops/cases` is not built), **Audit** (no per-investor audit trail — `asset_events` is asset-scoped by design). Only the active panel renders, so a tab's cards fetch when opened rather than five panels loading at once. The header, KYC badge and figures stay fixed above the tabs so an officer cannot act on the wrong file. |
| Investor & org review workspaces (4.3) | **COMPLETE** | browser: submitted → start review → approve/reject with the gaps warning; approved org offers only suspend | `components/admin/kyc-decision-card.tsx`, `issuer-decision-card.tsx`, `issuer-review-actions.ts` | `kyc-decision-card.test.tsx` (12), `issuer-decision-card.test.tsx` (13) | **The decision now sits WITH the evidence.** Before this an officer approved from a queue row showing an email and a badge, while the identity file, screening and risk rating were on another screen. Actions mirror each domain state machine exactly, so no button exists that the server would answer 409. Rejections and suspensions are refused client-side without a reason. The KYC card WARNS when the applicant was never screened or rated — **advisory, not a gate**: whether that should block approval is an open owner decision. The org state predicates are ONE definition shared by the queue and the workspace. |
| Auditor distribution reconciliation (4.4, FR-RA-4) | **COMPLETE — the read-only auditor role's second check** | e2e: declare → pay → GET reconciliation returns `agrees` with exact figures; live: a real pre-existing distribution correctly reports `not_reconcilable` | `application/reporting/reconcile-distributions.ts`, `infrastructure/persistence/prisma-ledger-credit-reader.ts`, `GET /reporting/distributions/reconciliation` | `distribution-reconciliation.test` (6, 2 mutation-checked), `prisma-ledger-credit-reader.test` (integration), `distributions-api.e2e` | FR-RA-4 needs a paid distribution's declared total checked against what actually reached holders' ledgers. That link **did not exist**: a ledger entry recorded only `kind: "distribution"`, with nothing naming WHICH distribution. Fixed at the source — `DistributionLedger.payout` now takes a required `reference` (the distribution id), carried through a new nullable `LedgerEntry.reference` column. **Rows written before this column existed report `not_reconcilable`, never a false agreement or a false alarm** — verified against real historical data in the dev database. Reached via the EXISTING `auditor` role and `REPORTING_READ` permission — no new endpoint surface, no new identity. **Auditor login now exists** (`OFFICER3_EMAIL`, default `auditor@platform.local`) — verified live: logs in, reads both FR-RA-4 surfaces, refused 403 on every write. |
| Auditor console + reconciliation screen (4.4) | **COMPLETE** | browser, signed in AS the auditor: scoped nav, the reconciliation screen, "Signed in as auditor" | `components/admin/reconciliation-panel.tsx`, `/[locale]/admin/reconciliation`, `auth.controller.ts` session roles | `reconciliation-panel.test.tsx` (10, 2 mutation-checked), `admin-shell.test.tsx`, `auth-cookie-csrf-api.e2e` | **No separate `/external` portal was built** — with external parties reusing StaffUser (owner decision 2026-08-23), the admin nav is already permission-filtered, so an auditor logging in gets a read-only console automatically: Work queue, Overview, Investors, Distribution reconciliation, Holder Registry, Audit Log, Security — and nothing that writes. The reconciliation screen never shows an untraceable payout as agreeing, never renders a missing credited figure as zero, and never renders a failed load as clean books. **Fixed on the way:** the shell hard-coded "Signed in as officer" for every staff member, which with four roles told a checker nothing about whether they were maker or checker. |
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
| Maker-checker on ledger credit **and distribution payout** (4.1) | **COMPLETE** | e2e, transactional | `approvals/*`, `prisma-approval-commit.ts` | `approvals-api.e2e`, `prisma-approval-commit.test.ts` | Threshold `LEDGER_CREDIT_APPROVAL_THRESHOLD_RIAL` is a **placeholder requiring local policy validation**. A payout has **no threshold — every one takes two people**, because the amount that makes one worth a second look is unanswered and "all of them" is the safe reading of the threat model's "four-eyes on the sensitive-action set" (T3). **Owner's call if a threshold is wanted.** Still single-role, per T3's own list: tokenize, and forced transfer once it exists |
| Distributions (declare → pay pro-rata) | **COMPLETE** | e2e | `declare-distribution.ts`, `pay-distribution.ts` | `distributions-api.e2e` | Rows paid before the `paid_at` migration are **excluded** from the income statement rather than shown undated |
| Transfers (compliance-checked) | **COMPLETE** | devnet e2e | `application/transfers/*`, `chain/trex-asset-token-mover.ts` | `transfers-redemptions-api.e2e` | Operator-approved model only (OD-9(a)) |
| Redemption at attested value | **COMPLETE** | devnet e2e | `application/redemptions/*` | `transfers-redemptions-api.e2e` | Refused without a fresh valuation (`NoFreshValuationError`) |
| Settlement order: mint THEN capture (P0-2 step 3, closes K-34) | **COMPLETE** (2026-08-25) | unit + integration through real Postgres | `application/offerings/settle-allocation.ts`, `close-offering.ts` | `settle-allocation.test.ts`, `settle-retry-through-outbox`, `concurrent-settlement-drain` | Money is captured only once an allocation's tokens exist. A refused mint leaves the Rial HELD rather than taken; the queued retry completes both halves. Capture is exactly-once via a unique index on `ledger_entries (investor_id, kind, reference)` |
| Stranded escrow is visible | **COMPLETE** (2026-08-25) | admin console | `application/reporting/allocations-awaiting-mint.ts`, `components/admin/escrow-awaiting-mint-panel.tsx` | `allocations-awaiting-mint.test.ts`, `platform-health-probe`, `allocations-awaiting-mint-api.e2e` | Count + total on the health probe, per-allocation list on `/admin/escrow`: who, how much, since when, and the last retry error. `unresolved` is kept visibly apart from `not_minted` |
| Return stranded escrow (manual lever) | **COMPLETE BUT NEEDS A POLICY** (2026-08-31) | e2e over real HTTP | `application/offerings/release-stranded-escrow.ts`, `offerings.controller.ts` | `release-stranded-escrow.test.ts`, `release-escrow-api.e2e` (7, gate mutation-checked) | MANUAL only — **there is no timer**, because the release duration is an unanswered owner question. Gated on LEDGER_CREDIT (treasury) **by assistant decision, reversible**. Requires a reason, audits actor+reason before the money moves, exactly-once, and REFUSES a minted or unresolved allocation |
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
| Issuer memberships + roles | **COMPLETE** | domain tests | `issuer-membership.ts` | `issuer-membership.test.ts` | `IssuerMembership.canWorkOnAssets()` **now has its caller** (3.3h): `IssuerTeamAccess.assertCanWorkOnAssets`, reached when an issuer brings an asset. The *organisation*-level gate `IssuerOrganisation.canSubmitAssets()` is live in `propose-asset.ts` (3.3b) |
| Persistence + tenant isolation | **COMPLETE** | contract + isolation tests | `persistence/prisma-issuer-repository.ts` | `prisma-issuer-repository.test.ts`, `tenant-isolation.test.ts` | — |
| Individual-verification gate | **COMPLETE** | e2e + **mutation-checked** | `application/issuers/require-verified-person.ts`, `investor-person-verification.ts` | `issuers-api.e2e`, `prisma-person-verification.test.ts` | Fails closed for unknown people |
| Issuer HTTP API (apply/review/decide/team) | **COMPLETE** | `issuers-api.e2e` 18 tests | `http/issuers.controller.ts` | `issuers-api.e2e` | — |
| Issuer **review screen** (staff) | **COMPLETE** (3.2f) | 14 web tests + a layout contract + a live browser walk of both decision paths | `apps/web/app/[locale]/admin/issuers/`, `components/admin/issuers-panel.tsx` | `issuers-panel.test.tsx`, `layout.spec.ts` | Names the deciding officer, not their account id (K-19 fixed 2026-08-17) |
| Issuer **team** management UI | **NOT STARTED** | — | endpoints exist | — | Add/list/remove members is HTTP-only |
| Issuer portal (issuer-facing) | **PARTIALLY IMPLEMENTED** | web tests + layout contract + `issuers-api.e2e` | `apps/web/app/[locale]/issuer/`, `http/issuers.controller.ts` | `issuer-landing.test.tsx`, `use-browser-session.test.ts`, `layout.spec.ts`, `issuers-api.e2e` | Shipped: the portal shell, the landing page, "which organisations are mine" (3.3d/3.3e), the read of **the assets an organisation brought** (3.3f, `GET /issuers/:id/assets`, membership-authorised + mutation-checked), and **the screen for it** (3.3g) — the organisation's name on the landing page leads to its assets, browser-verified across four cases including a guessed id, which is refused rather than shown an empty list. Also 3.3h: an issuer **brings its own asset** (`POST /issuers/:id/assets`), which is where `IssuerMembership.canWorkOnAssets()` finally decides something — mutation-checked, and the organisation-level gate still refuses one that may not submit. And 3.3i: the issuer **files its own dossier** (`POST /issuers/:id/assets/:assetId/documents`) — TWO gates, membership at the door and ownership in the use case, because holding a membership somewhere is not permission to file against a rival's asset (mutation-checked). The screen offers only the kinds still missing and refuses to send without a real file. Verified in a browser by **sha256 identity** between the chosen file and what the platform stored. **Not built:** the rest of the submission wizard — drafts, completeness %, validation rules, review comments, status history. That scope is the owner's call |
| What an issuer may see about investors | **DISCUSSED, ANSWERED IN PRINCIPLE, NOT IMPLEMENTED** | decision log | — | — | User answered "all necessary information"; the concrete field list must be proposed and approved before anything is exposed |

| Issuer holder registry (P1-2, FR-PT-2) | **COMPLETE, on a REVERSIBLE assistant decision** (2026-08-25) | e2e over real HTTP + web build | `application/issuers/issuer-asset-holders.ts`, `components/issuer/issuer-holders.tsx` | `issuer-asset-holders.test.ts` (8, 4 mutation-checked), `issuer-holders-api.e2e` | An issuer sees a PSEUDONYMOUS cap table for assets they brought: per-asset holder reference, tokens, share, holder since, tokens allocated, amount invested, allocation date, amount refunded. **Withheld:** email, raw wallet, investor id, KYC state, risk, screening. The owner never struck or extended the field list — see `docs/proposals/issuer-investor-visibility.md` |

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
