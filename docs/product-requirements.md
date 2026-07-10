# Product Requirements — Tokenization Platform

**Real-World Asset & Utility Tokenization Platform**

| | |
|---|---|
| Status | Draft for review |
| Audience | Product owner, engineers, legal/compliance advisors |
| Language of record | English |
| Companion documents | `CLAUDE.md` (how we build), `docs/engineering/` (architecture, principles, TDD, stack, glossary) |

Requirement keywords **MUST / SHOULD / MAY** follow RFC-2119 meaning. Every requirement has
an ID (`FR-xx-n` functional, `NFR-n` non-functional) so tests, code, and commits can trace to
it. Items marked **[BUSINESS]** need explicit product-owner confirmation before they are
treated as final.

---

## 1. Purpose of this document

This PRD defines **what** the Tokenization Platform must do and **why**. It is the single
source of truth for product decisions. How we build (TDD, Clean Architecture, SOLID/DRY/YAGNI,
Definition of Done) is defined in `CLAUDE.md` and `docs/engineering/` and is not repeated here
(DRY).

---

## 2. Vision, problem, and goals

### 2.1 Vision

A platform that represents the **ownership or economic rights of real-world assets** — and
**utility/access rights** — as tokens on a blockchain, making those claims **transferable,
divisible, and programmable**, for issuers and investors operating in a domestic, regulated,
closed-loop environment.

### 2.2 The problem

High-value assets (real estate, gold, commodity quotas, energy) are illiquid, indivisible, and
expensive to transact: multi-day settlement, high minimums, manual yield distribution, opaque
ownership records. Tokenization removes those frictions — **but only when the token is bound
to an off-chain enforceable right**. Existing global platforms are unavailable in our
deployment context (§3), so a self-hosted equivalent is required.

### 2.3 The central domain truth (governs every feature)

> A token is only as good as the off-chain enforceable right behind it.

Every tokenization stands on three legs; weakness in any leg invalidates the whole:

1. **Legal leg** — a document/structure (typically an SPV or fund) making the token holder's
   right court-enforceable.
2. **Technical leg** — the on-chain token and contracts enforcing transfer, compliance, and
   distribution rules.
3. **Attestation leg** — oracle/attestation feeds binding real-world state (valuation, NAV,
   rent, production, legal status) to the chain.

Every feature in this PRD MUST trace to one of these legs. A corollary that shapes scope
honestly: **tokenizing an illiquid asset does not make it liquid** ("liquidity illusion").
The platform must never present cosmetic liquidity as real.

### 2.4 Goals (v1)

- G1. Tokenize a **single pilot asset** end-to-end with a clear, transferable legal right, at
  the smallest possible scale, proving the full party chain before heavy investment.
  (Decided: **real-estate SPV** — §16 D1.)
- G2. Enforce compliance **in the token itself** (permissioned transfers), not only in the UI.
- G3. Make the blockchain **invisible to non-crypto users** (email/password onboarding,
  custodial wallet by default).
- G4. Operate fully **self-hosted** with no dependency on unavailable global services.
- G5. Automate yield distribution pro-rata to token holders with full auditability.

### 2.5 Non-goals (v1)

- NG1. Public, permissionless DeFi composability.
- NG2. Cross-border investors or foreign-currency settlement.
- NG3. An open secondary exchange / order book (planned later — §15 Phase 3; transfer-level
  liquidity comes first).
- NG4. Multi-tenant white-label operation (single operator first; see YAGNI deferrals in
  `docs/engineering/tech-stack.md`).
- NG5. Building a custom blockchain. We deploy on existing, proven networks.

---

## 3. Deployment context and binding constraints

The platform launches in a sanctions-constrained, domestically regulated environment (Iran).
These constraints are **binding architecture inputs**, not preferences:

- **C1 — Self-hosted everything.** No reliance on global commercial oracles (Chainlink
  enterprise), hosted custodians (Fireblocks et al.), or international payment rails. All
  critical services run on infrastructure we control.
- **C2 — Permissioned, closed-loop network by default.** Deploying on a global public chain
  exposes tokens to surveillance and blocklisting risk. Default posture: a self-hosted
  permissioned EVM network with validator governance we control. (Decided: **Hyperledger
  Besu, self-hosted** — §16 D2.)
- **C3 — Domestic settlement.** No USDC/USDT assumption. Settlement uses the Rial rail and/or
  a domestically backed settlement token. [BUSINESS: settlement unit design — §16]
- **C4 — Domestic regulatory ambiguity.** A clear domestic framework for tokenized securities
  is still forming. Consequently v1 favors the lower-risk models: **closed-loop utility
  tokens** and **asset-backed tokens with a clear legal right** (e.g. gold), over
  yield-promising securities structures. Legal counsel review is mandatory before any public
  offering.
- **C5 — Closed loop.** Tokens circulate only among KYC-verified users inside the platform.
  No withdrawal to external wallets in v1.
- **C6 — Multilingual UX, English default.** End-user interfaces MUST be built on a
  localization architecture (locale-scoped routing, per-locale dictionaries and text
  direction, RTL-capable). The default and demo locale is **English (en-US)**; additional
  locales are added only by explicit business decision. Engineering artifacts are English.

---

## 4. Token taxonomy and classification

The platform supports two token families with **different regulatory and architectural
treatment**. Misclassification is the largest regulatory risk; classification is decided per
asset at onboarding and recorded.

| Family | Represents | Backing | Regulatory weight | Standard |
|---|---|---|---|---|
| **Asset token** (security-like) | Ownership/economic right in a real asset | Yes (deed, gold, quota, receivable) | Heavy: KYC/AML, transfer restrictions, holder registry | ERC-3643 (T-REX) |
| **Utility token** | Access/usage right inside the platform ecosystem | No (value from platform demand) | Lighter, **if** no profit promise | ERC-20 (closed-loop) |

Rules:

- **T1.** Every issued token MUST be classified (asset vs utility) before issuance, with the
  rationale recorded in the asset's legal dossier. Classification uses a Howey-style test: if
  purchasers invest money in a common enterprise expecting profit from others' efforts, treat
  it as an asset/security token — with full compliance treatment.
- **T2.** A utility token MUST NOT promise or imply yield/return. Any yield feature
  automatically reclassifies the token as an asset token.
- **T3.** Asset-token subtypes supported over time: asset-backed (v1), fund share, debt,
  equity, revenue-share (later phases). Each subtype maps to a contract template (§7 FR-SC).
- **T4.** The settlement unit (§3 C3) is a **payment token**, not an investment product, and
  is kept architecturally separate from both families.

---

## 5. Actors and roles

Platform roles (each maps to RBAC in §7 FR-AC and, where on-chain, to contract roles):

| Role | Description |
|---|---|
| **Asset Owner** | Brings the real-world asset; contracts with the Issuer. |
| **Issuer** | Legal entity (typically via SPV) issuing tokens against the asset. |
| **Platform Operator** | Runs the platform: onboarding, issuance tooling, registry, compliance ops. |
| **Investor** | KYC-verified end user who subscribes, holds, transfers, and redeems tokens. |
| **Compliance Officer** | Human reviewer for KYC escalations, transfer exceptions, freezes. |
| **Custodian** | Holds the underlying asset (qualified custodian/trust company) — off-chain role, on-platform records. |
| **Attestor (Oracle Operator)** | Signs attestations of real-world state (valuation, reserves, NAV, rent received). |
| **Auditor** | Read-only access to registries, attestations, and audit trails (technical + financial audits). |
| **Regulator (future)** | Read-only reporting interface when a domestic framework requires it. |

The full 9-party value chain (owner → issuer → tokenization provider → custodian → transfer
agent → digital custodian → secondary market → distributor → investor) is documented in
`docs/engineering/glossary.md`. In v1 the Platform Operator plays several of these roles;
the seams MUST still exist in the domain model so roles can be externalized later.

---

## 6. Product principles (bind design decisions)

- **P1 — Legal layer before token layer.** No token is issued before its legal dossier
  (§7 FR-AO) is complete and the enforceable right is documented.
- **P2 — Blockchain is infrastructure, not the interface.** A non-crypto investor signs up
  with email/password, passes KYC, and sees a portfolio — never a seed phrase. Web3 wallets
  are an optional power-user feature, not the default.
- **P3 — Compliance in the token.** Transfer restrictions execute on-chain (ERC-3643 +
  ONCHAINID); the backend and UI are additional layers, not the only enforcement.
- **P4 — Honest liquidity.** The UI MUST NOT imply tradability that does not exist. Show
  actual transfer/redemption options and their real timelines.
- **P5 — Verifiability.** Every material claim shown to an investor (backing, valuation,
  yield) traces to a signed attestation or document hash.

---

## 7. Functional requirements

Modules are listed in rough dependency order. Priorities: **M** = Must (MVP), **S** = Should
(fast follow), **C** = Could (later phase).

### FR-ID — Identity, KYC/AML, and eligibility

| ID | Requirement | Priority |
|---|---|---|
| FR-ID-1 | Users MUST register with email/phone + password and complete profile before any investment action. | M |
| FR-ID-2 | The platform MUST run a KYC flow (identity document + liveness + national-ID verification via available domestic providers) with states: `draft → submitted → in_review → approved / rejected / expired`. | M |
| FR-ID-3 | Each approved investor MUST receive an on-chain identity (ONCHAINID) holding signed claims (KYC status, investor category, jurisdiction). Claims are issued by the platform's claim-issuer key(s). | M |
| FR-ID-4 | Compliance officers MUST be able to review escalations, approve/reject with reason, and revoke claims (with automatic effect on transferability). | M |
| FR-ID-5 | AML screening (domestic watchlists) MUST run at onboarding and on a recurring schedule; hits freeze investment actions pending review. | M |
| FR-ID-6 | Investor categories (retail / qualified) with per-category limits (max exposure, per-asset caps) MUST be enforceable. Category definitions are [BUSINESS]. | S |
| FR-ID-7 | Claim issuance MUST support key rotation and at least two redundant claim-issuer keys (an offline claim issuer must not halt transfers). | S |

### FR-AO — Asset onboarding and legal structuring

| ID | Requirement | Priority |
|---|---|---|
| FR-AO-1 | Each asset MUST have a **legal dossier** before issuance: ownership evidence, SPV/custody structure, the token-holder right definition, valuation report, and counsel sign-off. | M |
| FR-AO-2 | Dossier documents MUST be stored immutably (IPFS, self-hosted) with hashes anchored in the asset's on-chain record; PostgreSQL stores metadata. | M |
| FR-AO-3 | The platform MUST record the custody arrangement (who holds the asset, where, under what agreement) and its supporting documents. | M |
| FR-AO-4 | An asset MUST pass a structured onboarding checklist (legal right clear? transferable? custodian engaged? valuation dated?) gated by an operator approval step before token configuration is allowed. | M |
| FR-AO-5 | Asset lifecycle states: `proposed → in_structuring → approved → tokenized → suspended → retired`, with audit-logged transitions. | M |

### FR-SC — Smart contracts

| ID | Requirement | Priority |
|---|---|---|
| FR-SC-1 | Asset tokens MUST implement ERC-3643 (T-REX reference) with ONCHAINID-based transfer gating: transfers execute only when both parties' claims and the offering's rules pass. | M |
| FR-SC-2 | Compliance rules MUST be modular contracts (holder caps, jurisdiction gates, lock-ups, per-investor limits) composable per offering without modifying the token core. | M |
| FR-SC-3 | Utility tokens MUST implement ERC-20 with platform-controlled mint/burn and closed-loop restrictions (v1: transfers restricted to platform-known addresses). | S |
| FR-SC-4 | A yield-distribution contract MUST distribute a deposited amount pro-rata to a holder snapshot, with claim/push semantics decided per offering. | M |
| FR-SC-5 | Recovery and forced-transfer functions (lost wallet, court order) MUST exist behind multisig + timelock, with every use audit-logged and reported. | M |
| FR-SC-6 | Sensitive operations (mint, burn, freeze, registry updates, rule changes) MUST require multisig (e.g. 3-of-5) and a timelock long enough for human review. | M |
| FR-SC-7 | Contracts MUST be pausable per-token and platform-wide (circuit breaker), behind the same multisig governance. | M |
| FR-SC-8 | Contract upgradeability policy: prefer immutable + migration; if proxies are used, upgrades sit behind multisig + timelock and are announced to holders. | S |

### FR-CU — Custody and wallets

| ID | Requirement | Priority |
|---|---|---|
| FR-CU-1 | Default: **custodial wallets** — keys generated and held server-side in an MPC/HSM setup; users never see keys or gas. | M |
| FR-CU-2 | Platform treasury and admin keys MUST use self-hosted MPC with quorum signing; no single machine or person can sign alone. | M |
| FR-CU-3 | Key ceremonies (generation, rotation, recovery) MUST be documented, rehearsed, and logged. | M |
| FR-CU-4 | Optional self-custody (user-provided address) MAY be added later; it requires the same ONCHAINID gating and is [BUSINESS] to enable. | C |

### FR-OR — Oracle and attestation

| ID | Requirement | Priority |
|---|---|---|
| FR-OR-1 | An internal **signed-attestation service** MUST publish real-world facts (valuation, NAV, reserve confirmation, rent received) as signed messages anchored on-chain. | M |
| FR-OR-2 | Every attestation MUST carry: attestor identity, timestamp, validity window, payload hash, and reference documents (IPFS hash). | M |
| FR-OR-3 | Consumers (contracts, backend, UI) MUST treat expired attestations as stale and degrade honestly (show "valuation as of DATE", block actions that require fresh data). | M |
| FR-OR-4 | The design MUST allow multiple independent attestors per feed (quorum) even if v1 launches with one — the seam exists at the port level. | S |

### FR-PI — Primary issuance (offering / subscription)

| ID | Requirement | Priority |
|---|---|---|
| FR-PI-1 | Operators MUST be able to configure an offering: token supply, price, min/max per investor, offering window, eligibility rules, and the linked legal dossier. | M |
| FR-PI-2 | Investors MUST be able to subscribe during the window; funds are collected via the domestic settlement rail (§3 C3) into a segregated account, held in escrow state until allocation. | M |
| FR-PI-3 | On successful close: tokens mint to subscribers atomically with settlement confirmation; on failed close (< minimum raise): full refunds, no minting. Both paths MUST be tested end-to-end. | M |
| FR-PI-4 | Oversubscription handling (pro-rata cut or first-come): configurable per offering. [BUSINESS default] | S |

### FR-TR — Transfers and redemption (secondary, v1 scope)

| ID | Requirement | Priority |
|---|---|---|
| FR-TR-1 | Holders MUST be able to transfer tokens to other eligible platform users; every transfer passes on-chain compliance checks (FR-SC-1/2) and updates the holder registry. | M |
| FR-TR-2 | Redemption (burn against the underlying right — e.g. gold delivery or cash-out at attested value) MUST be supported where the offering defines it, with an operator fulfillment workflow. | M |
| FR-TR-3 | A simple bulletin-board / RFQ mechanism for holders to signal buy/sell interest MAY precede a real order book. | C |
| FR-TR-4 | Order-book secondary market (internal ATS-style venue with a market-maker role) is a Phase-3 goal (§15), not v1. | C |

### FR-YD — Yield and distribution

| ID | Requirement | Priority |
|---|---|---|
| FR-YD-1 | Operators MUST be able to run a distribution: declare amount + record-date snapshot → contract computes pro-rata shares → payout in the settlement unit; full reconciliation report generated. | M |
| FR-YD-2 | Failed/unclaimed payouts MUST have a defined, tested handling path (retry, escheat after N days [BUSINESS]). | M |
| FR-YD-3 | Distribution schedules (e.g. monthly rent) SHOULD be automatable with operator approval per run. | S |

### FR-PT — Portals

| ID | Requirement | Priority |
|---|---|---|
| FR-PT-1 | **Investor portal** (web + mobile): portfolio (holdings, valuations per latest attestation, distribution history), offering discovery + subscription, KYC status, document access, statements. Localized per §3 C6 (English default). | M |
| FR-PT-2 | **Issuer portal** (web): asset dossier status, offering configuration, holder registry view, distribution runs, reports. | M |
| FR-PT-3 | **Admin console**: user/KYC management, asset onboarding workflow, offering approval, compliance actions (freeze, force-transfer requests), attestation publishing, system health. | M |
| FR-PT-4 | All portals speak to the backend API; **no portal talks to the chain directly** in v1 (P2, C5). | M |

### FR-RA — Registry, reporting, and audit

| ID | Requirement | Priority |
|---|---|---|
| FR-RA-1 | The platform MUST maintain a **transfer-agent-grade holder registry**: who holds what, from when, with full transfer history — reconstructible from chain events and exportable (CSV/PDF). | M |
| FR-RA-2 | Every privileged action (mint, burn, freeze, claim change, attestation, config change) MUST append to an immutable audit log with actor, timestamp, and justification. | M |
| FR-RA-3 | Investor tax/holding statements and issuer reports MUST be generatable per period. | S |
| FR-RA-4 | A read-only auditor role MUST be able to verify: total supply vs registry, distributions vs bank records, attestation trails. | M |

### FR-NT — Notifications

| ID | Requirement | Priority |
|---|---|---|
| FR-NT-1 | Investors MUST receive notifications (in-app + SMS/email as available domestically) for: KYC results, subscription confirmations, distributions, transfers, and material asset events (new attestation, suspension). | M |

---

## 8. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | **Security.** Independent smart-contract audit before mainnet issuance; staged deployment (devnet → testnet → limited mainnet); bug-bounty program at public scale. RBAC everywhere; least privilege; secrets never in code (enforced by repo guard hooks). Sensitive documents encrypted at rest; TLS in transit. |
| NFR-2 | **Auditability.** Every financial state change is reconstructible from on-chain events + audit log + bank records. No silent mutations. |
| NFR-3 | **Availability.** Core investor actions (view portfolio, subscribe) target 99.5% monthly; planned chain maintenance windows are acceptable in v1 with notice. |
| NFR-4 | **Performance.** Portal reads < 500 ms p95 (server time). On-chain finality per the chosen network (§16); UI communicates realistic settlement times honestly (P4). |
| NFR-5 | **Data protection.** PII minimized on-chain (only hashes/claims, never raw identity data). Domestic data-residency respected; right-to-erasure applies to off-chain PII while preserving the on-chain audit substrate. |
| NFR-6 | **Localization.** Localization architecture across all investor surfaces (locale routing, dictionaries, RTL-capable direction handling); **en-US is the default and demo locale**. Additional locales are configuration added on business decision (§3 C6). |
| NFR-7 | **Testability.** Every FR is acceptance-testable; domain/application layers testable without I/O (see `docs/engineering/tdd.md` — binding). |
| NFR-8 | **Operability.** Fully self-hostable stack (§3 C1); documented runbooks for node ops, key ceremonies, backup/restore; disaster-recovery target RPO ≤ 24h, RTO ≤ 24h for v1. |
| NFR-9 | **Capacity (v1).** Sized for the pilot: ≤ 10k registered users, ≤ 5 tokenized assets, ≤ 100 tx/min sustained. Scale-out is a later concern (YAGNI), but nothing in the design may preclude horizontal API scaling. |

---

## 9. Architecture requirements (summary — detail in `docs/engineering/architecture.md`)

- **A1.** Clean Architecture with the Dependency Rule is binding. The chain, DB, and IPFS are
  adapters behind ports; the domain (compliance rules, entitlement math, lifecycle states) is
  framework-free and I/O-free.
- **A2.** The network choice (§16) MUST be swappable at the adapter layer — the same use-cases
  run against a permissioned EVM or a public EVM L2 without domain changes.
- **A3.** Modular contract architecture mirrors this: token core / compliance modules /
  identity registry / distribution are separate contracts with narrow interfaces (FR-SC-2).
- **A4.** Every external dependency (KYC provider, SMS gateway, bank rail) sits behind a port
  with at least one fake for testing and a documented failure mode.

---

## 10. Technology stack

Working set (rationale and decision status per item in `docs/engineering/tech-stack.md`):

| Layer | Choice |
|---|---|
| Smart contracts | Solidity on EVM; ERC-3643 (T-REX) + ONCHAINID for asset tokens; ERC-20 for utility; Foundry for testing |
| Network | Self-hosted permissioned **Hyperledger Besu** (decided — §16 D2) |
| Backend | NestJS + PostgreSQL; TypeScript strict |
| Web | Next.js (investor portal, issuer portal, admin console) |
| Mobile | Flutter (investor app) |
| Documents | Self-hosted IPFS (immutable legal docs) + PostgreSQL metadata |
| Custody | Self-hosted MPC + multisig; HSM where available |
| Oracle | Internal signed-attestation service (FR-OR) |
| Settlement | Domestic rail / domestically backed settlement unit [BUSINESS] §16 |

---

## 11. Regulatory posture

- **R1.** v1 operates as a **closed-loop domestic platform** for KYC-verified users (§3 C4/C5),
  prioritizing token models with the least regulatory ambiguity: asset-backed tokens with
  clear legal rights, and non-yield utility tokens.
- **R2.** Legal counsel review is a **hard gate** in asset onboarding (FR-AO-1) and before any
  change to offering structures. This PRD is not legal advice.
- **R3.** The compliance engine (claims, transfer rules, registries) is designed to satisfy a
  future domestic tokenized-securities framework with configuration — not re-architecture —
  when one crystallizes.
- **R4.** International expansion (MiCA-style regimes, etc.) is out of scope for v1 and MUST
  NOT drive v1 complexity (YAGNI).

---

## 12. Risk register (top items; owned and revisited each phase)

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Liquidity illusion** — investors assume tradability that doesn't exist | P4 honest-liquidity UI; redemption paths defined per offering (FR-TR-2); no implied markets |
| 2 | **Custodian/counterparty failure** — claim quality depends on legal structure | Bankruptcy-remote structuring gate (FR-AO-1/4); custody documentation (FR-AO-3); auditor role (FR-RA-4) |
| 3 | **Oracle manipulation/staleness** | Signed attestations with validity windows (FR-OR-2/3); multi-attestor seam (FR-OR-4) |
| 4 | **Smart-contract vulnerability** | TDD + Foundry fuzz/invariant tests; independent audit; staged rollout; pause + timelock (FR-SC-6/7); NFR-1 |
| 5 | **Key compromise / insider action** | MPC quorum (FR-CU-2), multisig + timelock (FR-SC-6), ceremonies (FR-CU-3), audit log (FR-RA-2) |
| 6 | **Regulatory shift (domestic)** | R1 low-ambiguity models first; R3 config-over-rearchitecture; counsel gates |
| 7 | **Sanctions/blocklist exposure** | C1/C2 self-hosted permissioned default; no dependence on blockable third parties |
| 8 | **Settlement-unit peg/trust risk** | [BUSINESS] settlement design (§16) with reserve attestations via FR-OR if a backed token is used |
| 9 | **UX failure for non-crypto users** | P2 custodial default; no seed phrases; localized UX (C6) |
| 10 | **Single-operator concentration** (we play many chain roles in v1) | Role seams in the domain model (§5); auditor transparency (FR-RA-4); externalize roles over time |

---

## 13. Revenue model (options — activation is [BUSINESS])

Candidate streams, to be selected/priced at pilot review: issuance/listing fee per
tokenization; annual AUM fee; transaction fee on transfers/redemptions; distribution-run fee;
later: white-label/Compliance-as-a-Service licensing. v1 instruments the metering for all of
these (events exist in the audit log) without committing to pricing.

---

## 14. MVP acceptance (Definition of Done for v1)

The MVP is accepted when this **golden path runs end-to-end on the target network, under
test, witnessed**:

1. An asset completes onboarding with a full legal dossier (FR-AO) →
2. an offering is configured and approved (FR-PI-1) →
3. investors register, pass KYC, receive ONCHAINID claims (FR-ID) →
4. subscriptions settle; tokens mint atomically (FR-PI-3) →
5. a distribution run pays all holders pro-rata and reconciles to the bank record (FR-YD-1) →
6. a compliant transfer succeeds between two verified users AND a non-compliant transfer is
   rejected **on-chain** (FR-TR-1) →
7. a redemption completes per the offering's terms (FR-TR-2) →
8. the holder registry export matches on-chain state exactly (FR-RA-1) →
9. every step above is covered by automated tests written test-first, and the audit log
   captures every privileged action (FR-RA-2).

Plus: contract audit report addressed (NFR-1); runbooks exist (NFR-8); localized investor UI
with English default (C6).

---

## 15. Roadmap (phases; each ends with a user-reviewed gate)

| Phase | Content | Exit gate |
|---|---|---|
| **0 — Foundations** (done) | Governance, engineering standards, this PRD | User verification |
| **1 — Walking skeleton** | Monorepo scaffold; identity + KYC + investor dashboard (FR-ID, FR-PT-1 subset); devnet with ERC-3643 reference deployment | Golden-path demo of registration→KYC→claim on devnet |
| **2 — Pilot issuance** | Full FR-AO, FR-SC, FR-CU, FR-OR, FR-PI, FR-YD for ONE pilot asset; admin console; audit | §14 golden path on target network |
| **3 — Liquidity & scale** | FR-TR-3/4 secondary venue, more asset subtypes (T3), issuer self-service, mobile app GA | [BUSINESS] review of pilot results |

Principle: **legal/service layer before token layer** in every phase.

---

## 16. Open business decisions (owner: product; blocking for Phase 1–2)

| # | Decision | Status |
|---|---|---|
| D1 | Pilot asset | **DECIDED 2026-07-10: Real-estate SPV.** Rental-yield distribution becomes the flagship demo; legal structuring (SPV setup, title binding, tenant cash-flow attestation) is the pilot's critical path — FR-AO and counsel engagement lead Phase 2. |
| D2 | Target network | **DECIDED 2026-07-10: Self-hosted permissioned Hyperledger Besu.** Public-EVM use limited to local/test tooling; production posture per §3 C2. |
| D3 | Settlement unit | Off-chain Rial ledger vs Rial-backed on-platform token (reserve-attested) |
| D4 | Investor categories & limits | Definitions and caps (FR-ID-6) |
| D5 | Oversubscription & unclaimed-payout policies | FR-PI-4, FR-YD-2 defaults |
| D6 | Revenue activation | Which §13 streams at pilot, at what rates |

Engineering choices confirmed with user visibility 2026-07-10: **pnpm** (package manager),
**Prisma** (ORM). Rationale in `docs/engineering/tech-stack.md`.

---

## 17. References

- Domain vocabulary: `docs/engineering/glossary.md` (binding ubiquitous language).
- Engineering standards: `CLAUDE.md`, `.claude/core-invariants.md`, `docs/engineering/`.
