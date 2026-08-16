# DECISION LOG (consolidated for handoff)

> **This file is a curated, categorised view.** The **append-only original** — with full wording,
> dates and consequences — is `docs/open-product-decisions.md`, which also holds the numbered
> open decisions OD-1 … OD-23. When they disagree, the original wins; this file exists so a fresh
> reader can absorb the decision history without reading 40 long rows.
>
> Every decision below is marked **ACTIVE** unless stated otherwise. Decisions marked
> *(user decision)* were made by the product owner and **must not be reversed by an assistant**.

---

## A. Governance and process

| # | Decision | Why | Rejected alternative | Status |
|---|---|---|---|---|
| A1 | **TDD is mandatory; red must be observed** *(user decision)* | The whole project runs on it; tests are the regression floor | "Write tests after" | ACTIVE, enforced by hooks |
| A2 | **Clean Architecture with ports/adapters and one composition root** | Domain testable without I/O; adapters swappable | Framework-coupled services | ACTIVE |
| A3 | **No solo business decisions** *(user decision)* | Scope/regulatory/product calls are the owner's | Assistant deciding and reporting | ACTIVE |
| A4 | **One verified slice at a time, each CI-green** | Keeps every step reversible | Big-bang phases | ACTIVE |
| A5 | **Mutation-checking for security-critical rules** | A test that passes when the rule is broken is decoration. Used for allocation math, the disclosure seam, tenant isolation, the issuer verification gate, and email normalisation | Trusting green tests | ACTIVE practice |
| A6 | **Repository *contract* tests shared between in-memory and Prisma implementations** | Caught silently-dropped fields **twice** (`investorVisible`; `realEstate`/`rights`) | Testing each impl separately | ACTIVE |
| A7 | **English default/demo language always** *(user decision)* | Demos and docs stay legible | Persian-first | ACTIVE (supersedes an earlier Persian requirements source, now **void**) |
| A8 | **Decisions recorded in `docs/open-product-decisions.md`** | Survives context loss | Chat-only memory | ACTIVE |

## B. Architecture and stack

| # | Decision | Why | Rejected | Status |
|---|---|---|---|---|
| B1 | **NestJS + Prisma + PostgreSQL; Next.js App Router; Solidity/Foundry** | PRD §10 recommendation, confirmed | — | ACTIVE |
| B2 | **OD-2(a): one Next.js app with five route groups** *(user decision)* | Shared design system, simpler ops | Separate apps per portal | ACTIVE |
| B3 | **OD-1(a): single-tenant install with a tenant-ready schema** *(user decision)* | Retrofitting tenancy later is far costlier | Full SaaS multi-tenancy now | ACTIVE |
| B4 | **Tenant scoping via AsyncLocalStorage + a Prisma Proxy that forbids by-id operations** | Fail-closed: a repository *cannot* accidentally escape the tenant | Passing tenantId by hand | ACTIVE |
| B5 | **Zero new UI dependencies; hand-rolled design system; hand-written SVG charts** *(user decision)* | Institutional look without a template feel; no supply-chain surface | Component library | ACTIVE |
| B6 | **OD-3(a)/OD-4: pg-boss for scheduled jobs (no Redis)** *(user decision)* | Self-hosted posture, one fewer service | BullMQ + Redis | ACTIVE |
| B7 | **Transactional outbox for side effects; pg-boss only for cron** | The outbox is the durability mechanism regardless of trigger; a queue is not needed to drain a local email outbox | pg-boss for everything | ACTIVE |
| B8 | **Shared `StateMachine<S>` helper; all lifecycles migrated behaviour-frozen** | One definition of "legal transition" | Ad-hoc if/else per aggregate | ACTIVE |
| B9 | **`exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`** | Absent facts stay absent; "" never reads as "decided by nobody" | Loose optionals | ACTIVE |

## C. Blockchain, tokens and custody

| # | Decision | Why | Rejected | Status |
|---|---|---|---|---|
| C1 | **ERC-3643 (T-REX) + ONCHAINID, one token per asset** | Compliance-native standard; per-asset isolation | ERC-20 with off-chain allowlist | ACTIVE |
| C2 | **anvil as the dev chain; Besu stand-up is a pre-pilot gate** | Fast local iteration | Running Besu now | ACTIVE (Besu **not done**) |
| C3 | **Chain writes stay synchronous for now** | Async chain lifecycle is a whole slice (roadmap 1.6) | Workers now | ACTIVE, flagged as debt |
| C4 | **Nonce handling: shared promise lane per account, fresh `NonceManager` per send** | Two other designs were **tried and reverted**: (i) a shared `NonceManager` allocates optimistically, so a send that never lands leaves a gap and the queue wedges (measured: a chain suite hung ~900 s); (ii) forcing a nonce re-read per send hits ethers' 250 ms RPC cache and the second rapid send returns "nonce too low" | Both alternatives above | ACTIVE, integration-tested |
| C5 | **OD-16: encrypted keystore on an isolated signer service (interim) → HSM/MPC (production)** | Procurement is a business decision | Keys in the app forever | **Interim target only — NOT implemented.** Today one mnemonic in env signs everything |
| C6 | **OD-10: chain governance target (multisig+timelock vs MPC) — undecided** | Needs discussion before Phase 8 | — | OPEN |
| C7 | **Money never moves on chain; Rial stays on the internal ledger** | Closed-loop domestic posture | Stablecoin settlement | ACTIVE |

## D. Identity, KYC and privacy

| # | Decision | Why | Rejected | Status |
|---|---|---|---|---|
| D1 | **KYC evidence in a private encrypted store, explicitly NOT IPFS** *(user decision, strong assistant recommendation)* | IPFS is content-addressed and effectively permanent: anyone with the CID could fetch a passport scan and erasure would be impossible | IPFS for everything | ACTIVE. Asset **legal** documents stay on IPFS |
| D2 | **What shipped: AES-256-GCM sealed bytes in Postgres, tenant-scoped, with a real `erase()`** | Plaintext never reaches the DB; listings return metadata only | — | ACTIVE. **Key management and retention policy remain unsolved** |
| D3 | **OD-22: email verification stays informational — nothing is gated** *(user decision; assistant had recommended gating KYC submission)* | Owner's call | Gating submission or login | ACTIVE. **Accepted consequence:** a decision can be undeliverable |
| D4 | **The evidence-free KYC submit endpoint was REMOVED** *(user decision)* | An application must not reach a reviewer with nothing attached | Keeping it as a convenience | ACTIVE (six e2e suites now seed queue state directly) |
| D5 | **Onboarding field set is provisional and marked "REQUIRES LOCAL LEGAL VALIDATION"**, defined in ONE server-side file so it can change without a client release | Nothing in code asserts compliance | Hardcoding a legal field set | ACTIVE |
| D6 | **An issuer's person IS a verified platform user** *(assistant decision, reversible)* | Reuses the proven wizard/review/evidence pipeline instead of a second KYC stack | A separate issuer identity with its own verification | ACTIVE. **Consequence:** issuer staff hold investor-capable accounts; barring them from investing would be a separate rule |
| D7 | **Both the company AND each of its people must be verified** *(user decision, 2026-08-15)* | Owner's answer to a direct question | Company-only KYB | ACTIVE, enforced and mutation-checked |
| D8 | **What an issuer may see about investors: "all necessary information"** *(user decision)* — recorded, **not implemented** | "Necessary" is the whole question; wrong exposure leaks PII to a third party | Reading "all" as everything the platform knows | PENDING implementation: a concrete field list must be proposed and approved |
| D9 | **OD-11: screening providers are ports + a clearly-labelled mock** *(user decision)* | Vendor choice is procurement | Fake "screening passed" | ACTIVE |

## E. Product and market

| # | Decision | Why | Rejected | Status |
|---|---|---|---|---|
| E1 | **OD-5(a): a truly public catalogue; registration+KYC gates subscription only** *(user decision)* | Enables SEO/ISR and real marketing | Fully login-gated | ACTIVE. **A public catalogue is a financial promotion in most jurisdictions — content REQUIRES LOCAL LEGAL VALIDATION** |
| E2 | **OD-21: no projected yield, ever, in this phase** *(user-accepted)* | A projection is a regulated promotion and no methodology would be honest | Showing an estimate | ACTIVE |
| E3 | **OD-20: no platform fee in this phase** *(user decision)* | Inventing a percentage would put a fabricated number in front of an investor | A placeholder fee | ACTIVE |
| E4 | **OD-6(a): manual bank transfer with treasury confirmation** *(user decision)* | Matches the closed-loop Rial posture; fully auditable; no third party | PSP integration | ACTIVE. **Accepted costs:** hours/days to fund, manual statement reconciliation |
| E5 | **OD-9(a): operator-approved transfers + a redemption queue only** | Honest-liquidity principle — do not imply a market that does not exist | Bulletin board / RFQ | ACTIVE |
| E6 | **OD-14(a): operator-mediated issuers in Phase 3** *(user decision)* | Safer review loop first | Full self-service | ACTIVE |
| E7 | **Documents centre: a curated subset, hidden by default** *(user decision)* | The dossier was assembled for the operator and the regulator; what an investor is *given* is itself a regulated disclosure | Publishing the whole dossier | ACTIVE |
| E8 | **Portfolio is strictly factual and backward-looking** | A stale valuation must never read as a current profit | Server-computed "gain" | ACTIVE |
| E9 | **Issuer organisations exist and the platform approves them** | Resolved **from the approved roadmap** (3.2) after four unanswered questions, superseding an earlier assistant assumption of "no issuer orgs" | Staff-onboarded assets with no organisations (the earlier 3.1 assumption) | ACTIVE — **supersedes the 3.1 assumption** |
| E10 | **Two issuer roles only: `issuer_admin`, `issuer_contributor`** | Split on the one line that matters — inviting colleagues vs preparing an asset | A richer role set invented up front | ACTIVE |
| E11 | **OD-17: no promotional codes for the pilot** | Legally sensitive | Building them | ACTIVE |
| E12 | **OD-18: token studio (P5) before payments (P6)**, swappable | Roadmap as written | — | ACTIVE, revisitable |

## F. Security and operations

| # | Decision | Why | Status |
|---|---|---|---|
| F1 | **Deny-by-default RBAC; the exact role→permission matrix is pinned by a test** | A privilege change must be a deliberate, reviewed edit | ACTIVE |
| F2 | **Maker-checker on ledger credit, threshold-based** *(user decision)* | Highest-risk money-in path; preserves the golden path below the threshold | ACTIVE. Threshold default is a **placeholder requiring local policy validation** |
| F3 | **Approve+execute is transactionally atomic** | A checker's approval and its effect must not diverge | ACTIVE |
| F4 | **`issuer.manage` granted to compliance_analyst as well as the two admin roles** *(assistant decision)* | Vetting an entity is the same discipline as vetting a person | ACTIVE |
| F5 | **Unmapped errors return an opaque 500 to the client but are logged server-side** | An operator must be able to diagnose; a client must learn nothing | ACTIVE |
| F6 | **CI attaches API/web log tails to the GitHub *step summary* on failure** | Job **logs** need admin rights; the step summary does not | ACTIVE |
| F7 | **OD-19(a): GitHub Actions** *(user decision)* | — | ACTIVE (revisit if the repo must be fully self-hosted) |
| F8 | **OD-15: the dev database is disposable; reseeding is allowed** *(user decision)* | No production data exists | ACTIVE — production-grade migrations are still written from P1 onward |

## G. Superseded / abandoned

| Decision | Fate |
|---|---|
| "No issuer organisations; assets are staff-onboarded" (3.1 assumption) | **SUPERSEDED** 2026-08-11 by E9, from the approved roadmap |
| Shared `NonceManager` across adapters | **REVERTED** — wedges the account (C4) |
| Reset-nonce-on-failure, and retry-on-collision | **REVERTED** — 250 ms RPC cache defeats both (C4) |
| A dedicated `PrismaPersonVerification` adapter re-implementing investor mapping | **DELETED** before commit in favour of composing over `InvestorRepository` |
| Evidence-free `POST /investors/me/kyc/submit` | **REMOVED** (D4) |
| Persian-language requirements source | **VOID** (A7) |
| pg-boss for the outbox drain | **NOT ADOPTED** — the interval drainer stays (B7) |
