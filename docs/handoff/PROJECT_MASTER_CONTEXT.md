# PROJECT MASTER CONTEXT

> Canonical high-level description of the project. Written 2026-08-16 at commit `e26f60f`
> (branch `main`, clean tree) as part of the continuity handoff package.
> Status vocabulary used throughout the handoff: **VERIFIED IMPLEMENTED · PARTIALLY
> IMPLEMENTED · PLANNED · DISCUSSED BUT NOT APPROVED · DEPRECATED · UNKNOWN**.

---

## 1. Project identity

| Field | Value |
|---|---|
| Working name | **Tokenization Platform** (repository `RWA-Tokenization`; renamed from an earlier "Positron" 2026-07-10) |
| Purpose | Represent the ownership or economic rights of **real-world assets** (real estate first) as blockchain tokens, so those claims become transferable, divisible and programmable |
| Primary users | (a) **Platform staff / operators** — onboard assets, review KYC, run offerings, decide approvals; (b) **Investors** — browse, verify identity, fund, subscribe, hold, transfer, redeem; (c) **Issuers** — organisations bringing assets to the platform (portal not built yet, API exists) |
| Deployment model | **Self-hosted, permissioned, closed-loop** — no dependency on global commercial oracles, custodians, or USD stablecoins |
| Settlement | **Iranian Rial only**, as an integer minor unit, on an internal ledger. No crypto payment rail |
| Regulatory posture | The codebase asserts **no** compliance with any regime. Jurisdiction-specific rules are *configuration* marked "REQUIRES LOCAL LEGAL VALIDATION" |
| Business model | **NOT DECIDED** — OD-20 answered "no platform fee in this phase"; a real fee model is an open business decision |

### The central truth of the domain (stated in `CLAUDE.md`, honoured throughout)

> A token is only as good as the **off-chain enforceable right** behind it. Every feature must
> trace back to one of three legs — **legal right**, **on-chain token**, **oracle/attestation** —
> or it does not belong.

---

## 2. Product vision

### Current pilot scope (what the system is being built to do now)

A single deployment, one tenant, run by a small operations team:

1. An asset (a building) is onboarded with a **legal dossier**, custody arrangement, a
   **real-estate profile** and an explicit **rights matrix** describing what the token conveys.
2. Once every checklist item is confirmed and the dossier is complete, the asset is **approved**
   (which freezes the dossier and the rights) and **tokenized** — a per-asset ERC-3643 token is
   deployed on the devnet.
3. An **offering** is created against that token, published to a **public catalogue**, and opened.
4. An investor registers, completes an **onboarding/KYC wizard** with encrypted evidence, and an
   officer approves them — which issues an **ONCHAINID claim** making them eligible to hold.
5. The investor declares a bank transfer, **treasury confirms what actually arrived**, and the
   internal Rial ledger is credited (through maker-checker above a threshold).
6. The investor subscribes; money is held; at close, allocation is **pro-rata** and tokens are
   minted to their custodial wallet. Unallocated money is returned.
7. The operator publishes **signed valuation attestations**; holders see value with the date it
   was attested and a stale flag.
8. **Distributions** are declared and paid pro-rata to holders at a snapshot.
9. Holders may **transfer** (compliance-checked) or **redeem** at an attested value.
10. Everything is observable through a **holder registry**, **audit trail** and CSV exports.

### Near-term production scope (phases 3–8 of the approved roadmap)

Issuer portal and 13-step tokenization wizard; case management and screening; a token design
studio; double-entry accounting and real payment rails; corporate actions and voting; a report
registry and a security/observability hardening pass. See `docs/implementation-roadmap.md`.

### Long-term vision

A permissioned tokenization platform an institution can self-host: issuers onboard assets under
a reviewed workflow, investors are onboarded and screened, tokens are issued under versioned
compliance policy, and every financial movement reconciles against a double-entry journal, bank
statements and the chain.

---

## 3. Core domain model (as actually implemented)

Aggregates live in `services/api/src/domain/<context>/`. They are framework-free and have no I/O.

| Aggregate / entity | File | What it is |
|---|---|---|
| **Investor** | `domain/identity/investor.ts` | A registered person: email, password hash, `KycStatus`, email-verified flag. `isEligibleForClaims()` is the single definition of "verified" |
| **KycStatus** | `domain/identity/kyc-status.ts` | State machine `draft → submitted → in_review → approved/rejected` (rejection is terminal) |
| **StaffUser** | `domain/identity/staff-user.ts` | A platform employee; roles come from `StaffMembership` |
| **Asset** | `domain/assets/asset.ts` | The real-world thing: lifecycle `proposed → structuring → approved → tokenized`, holding a `LegalDossier`, `OnboardingChecklist`, `CustodyArrangement`, `RealEstateProfile`, `RightsMatrix` |
| **LegalDossier** | `domain/assets/legal-dossier.ts` | Required document kinds; **freezes at approval**; each document carries an `investorVisible` flag (default false) |
| **RightsMatrix** | `domain/assets/rights-matrix.ts` | What the token conveys. Each conveyed right REQUIRES the wording it was granted in. "Not established" ≠ "conveys nothing" |
| **RealEstateProfile** | `domain/assets/real-estate-profile.ts` | Address, city, property type, area, title reference, optional build year |
| **Offering** | `domain/offerings/offering.ts` | `draft → open → closed/failed`, with publication state, price, min/max, subscription window |
| **Distribution** | `domain/distributions/distribution.ts` | Declared → paid, pro-rata payout math at a holder snapshot, `paidAt` |
| **Redemption** | `domain/redemptions/redemption.ts` | Requested → fulfilled/rejected at an attested value |
| **TokenTransfer** | `domain/transfers/token-transfer.ts` | Compliance-checked holder-to-holder transfer |
| **Attestation** | `domain/attestations/attestation.ts` | Signed off-chain fact (valuation, etc.) with freshness rules |
| **Approval** | `domain/approvals/approval.ts` | Maker-checker record; four-eyes enforced (`SelfApprovalError`) |
| **Notification** | `domain/notifications/notification.ts` | In-app message; important ones fan out to email |
| **OnboardingApplication** | `domain/onboarding/onboarding-application.ts` | The KYC wizard's progress, steps and resubmission loop |
| **FundingRequest** | `domain/funding/funding-request.ts` | Declared bank deposit with a human-typable reference `TP-XXXXXXXX` |
| **HolderRegistry** | `domain/registry/holder-registry.ts` | Cap table rebuilt from chain events |
| **CrmProfile / CrmNote / FollowUp** | `domain/crm/*` | Sales pipeline over investors |
| **IssuerOrganisation** | `domain/issuers/issuer-organisation.ts` | The legal entity bringing assets: `applied → in_review → approved/rejected`, `approved ↔ suspended` |
| **IssuerMembership** | `domain/issuers/issuer-membership.ts` | A person acting for an issuer, as `issuer_admin` or `issuer_contributor` |
| **StateMachine\<S\>** | `domain/shared/state-machine.ts` | Shared transition helper used by every lifecycle above |

### Relationships that matter

- An **Asset** has one token address once tokenized; **Offerings** reference an asset; an
  **OfferingAllocation** is what an investor ends up owning; **Distributions** pay the holders of
  an asset's token; a **Redemption** burns tokens at an attested value.
- **Money never moves on chain.** Rial lives in `LedgerAccount` / `LedgerEntry` rows. Tokens live
  on chain. The two are joined by the offering/allocation and distribution logic.
- An **IssuerOrganisation** is *not* a user. People act for it through **IssuerMembership**.
  An issuer's person is a **platform user who completed the same individual verification as an
  investor** (see DECISION_LOG, 2026-08-15).
- **Assets are not yet linked to issuer organisations.** That link is the next structural step
  and is a data-migration point.

---

## 4. Important product rules (established during development — do not casually change)

1. **An asset's dossier and rights freeze at approval.** What a holder owns must not change
   quietly after they own it. Document *visibility* is deliberately still changeable.
2. **An empty rights matrix means "nobody has established what this conveys"** — deliberately not
   the same as "conveys nothing".
3. **A conveyed right requires the wording it was granted in.** A bare yes/no claims more
   precision than the underlying document supports.
4. **Nothing forward-looking is ever displayed** — no projected yield, no expected return, no
   derived "gain" figure. Value is shown with the date it was attested and a stale flag.
5. **Income means money actually paid.** A declared distribution is a promise, not income.
6. **Every person acting for an issuer must be individually verified** (user decision
   2026-08-15), on top of the organisation's own review.
7. **A rejection must carry a reason.** Applies to KYC, issuer applications, funding, redemptions.
8. **Approval requires a review step** — nothing may slip from "applied" straight to "approved".
9. **Suspension bites immediately**, not at the next submission.
10. **Holder documents are hidden by default**; an operator reveals them one at a time and every
    reveal/withdraw is written to the asset event log with the actor's name.
11. **A hidden document is not listed at all**, so its existence is not disclosed either.
12. **Treasury confirms the amount that actually arrived**, not the amount declared.
13. **Unallocated subscription money is returned in full** when an offering closes or fails.
14. **An organisation must keep at least one administrator.**
15. **Colleagues are invited by email, never by user id.**
16. **No fake features.** No button that does nothing, no mock workflow in a production route.
    A feature is only claimed when it is implemented, tested and visible in the UI.

---

## 5. Non-negotiable assumptions (a future session MUST NOT change these casually)

These come from `CLAUDE.md` and `.claude/core-invariants.md`, which are re-injected into every
Claude session and are canonical.

1. **TDD is mandatory.** Red → green → refactor. No production code before a failing test that
   justifies it, and the red must be *observed*.
2. **Clean Architecture.** Dependencies point inward: `domain → application → infrastructure`.
   The domain knows nothing about NestJS, Prisma, HTTP or chains.
3. **SOLID / DRY / YAGNI** at every boundary. One authoritative definition per concept.
4. **No solo business decisions.** Scope, asset choice, tokenomics, regulatory posture, product
   trade-offs and stack lock-in are the *user's* calls. Surface options + a recommendation, wait.
5. **Verify before "done".** Never report success that was not observed by running it.
6. **Never settle for "good enough"** while a concrete improvement remains.
7. **One verified step at a time**, each ending CI-green.
8. **Existing tests are a regression floor** — never edited to pass except as a deliberate,
   documented behaviour change.
9. **Never fabricate regulatory compliance.** Jurisdiction rules are configuration marked
   "requires local legal validation".
10. **No production private keys in plaintext to app processes**; no single permanent EOA
    controller of mint/burn/freeze (target state — see risks, this is NOT yet true in dev).
11. **Never expose PII beyond role permissions.**
12. **English is the default and demo language, always.** The architecture is multilingual
    (`app/[locale]/…`), but `en` is what ships and demos.
13. **Zero new UI dependencies.** The design system is hand-rolled; charts are hand-written SVG.
14. **Conventional Commits**, each commit ending with the `Co-Authored-By:` trailer used
    throughout the history.

---

## 6. Where the other sources of truth live

| Topic | File |
|---|---|
| Product requirements (source of truth for **what** to build) | `docs/product-requirements.md` |
| How we build (source of truth for **how**) | `CLAUDE.md` |
| Non-negotiables re-injected every session | `.claude/core-invariants.md` |
| Phase plan | `docs/implementation-roadmap.md` |
| Open + decided product decisions, append-only log | `docs/open-product-decisions.md` |
| Architecture, principles, TDD, stack, glossary | `docs/engineering/*.md` |
| Threat model | `docs/security-threat-model.md` |
| Role → permission matrix | `docs/role-permission-matrix.md` |
| Data migration plan | `docs/data-migration-plan.md` |
| Manual demo script | `TEST_SCENARIOS.md` |
| Feature inventory + screenshots deliverable | `platform-overview/` |
