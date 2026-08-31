# REQUIREMENTS TRACEABILITY

Maps the requirement identifiers used throughout the codebase and commit history (they come from
`docs/product-requirements.md`) to what actually exists. Requirement IDs appear in source comments,
so `grep -rn "FR-PI" services/api/src` finds the implementation of a requirement family.

Legend: ✅ implemented · 🟡 partial · ⬜ not started · 🚫 deliberately excluded

---

## Functional requirement families

| ID | Requirement | Status | Implementation | Tests | Missing |
|---|---|---|---|---|---|
| **FR-ID-1** | Investor registration + authentication | ✅ | `application/identity/register-investor.ts`, `authenticate-investor.ts`, `http/investors.controller.ts`, `auth.controller.ts` | `investors-api.e2e`, unit | — |
| **FR-ID-4** | Role-gated KYC review | ✅ | `start-kyc-review.ts`, `approve-kyc.ts`, `reject-kyc.ts`; admin `kyc` page | `kyc-use-cases`, `investors-api.e2e` | — |
| **FR-ID (identity claims)** | On-chain identity + claim on approval | ✅ | `chain/onchainid-claim-issuer.ts` | `onchainid-claim-issuer.test.ts` (devnet) | Chain outage fails the approval request |
| **FR-AO-1..5** | Asset onboarding: propose → structure → dossier → checklist → approve | ✅ | `domain/assets/*`, `application/assets/*`, `http/assets.controller.ts`, admin `assets/[id]` | domain + `assets-api.e2e` + web | — |
| **FR-AO-2** | Immutable legal-document storage | ✅ | `infrastructure/documents/ipfs-document-store.ts` | `ipfs-document-store.test.ts` | Anyone with the CID can fetch (intended, legal docs only) |
| **FR-PI** | Primary issuance: offerings, subscriptions, pro-rata close, minting | ✅ | `application/offerings/*`, `chain/trex-asset-token-issuer.ts` | `offerings-api.e2e`, `journey.spec.ts` | — **Settlement order corrected 2026-08-25 (K-34):** money is captured only once an allocation's tokens exist, so a refused mint leaves the Rial held rather than taken. **Residue:** an allocation whose mint never succeeds holds the money indefinitely — visible on the health probe and the escrow screen, returnable by a manual treasury lever, but there is deliberately NO automatic release because the duration is an unanswered owner question |
| **FR-YD** | Yield distribution, pro-rata payout | ✅ | `application/distributions/*` | `distributions-api.e2e` | Pre-`paid_at` rows excluded from income |
| **FR-OR** | Oracle: signed attestations, freshness, on-chain anchor | ✅ | `application/attestations/*`, `chain/attestation-chain.ts`, `contracts/src/AttestationRegistry.sol` | `attestations-api.e2e`, `AttestationRegistry.t.sol` | No valuation review/dispute lifecycle |
| **FR-TR-1** | Compliant token transfers | ✅ | `application/transfers/*`, `chain/trex-asset-token-mover.ts` | `transfers-redemptions-api.e2e` | Operator-approved only (OD-9a) |
| **FR-TR-2** | Redemption at attested value | ✅ | `application/redemptions/*` | `transfers-redemptions-api.e2e` | Refused without a fresh valuation |
| **FR-RA-1** | Holder registry from chain events + CSV | ✅ | `domain/registry/holder-registry.ts`, `chain/ethers-token-event-source.ts` | `registry-audit-api.e2e` | No persistent indexer; rebuilt on demand |
| **FR-RA-2** | Queryable audit trail | ✅ | `application/reporting/*`, `AssetEvent` | `registry-audit-api.e2e` + a coverage test | Audit covers asset events + approvals; **not** every mutation platform-wide |
| **FR-PT-2** | Issuer portal: dossier status, offering config, **holder registry**, distribution runs, reports | 🟡 | `components/issuer/issuer-assets.tsx`, `issuer-holders.tsx`, `application/issuers/*` | `issuer-asset-holders.test.ts`, `issuer-holders-api.e2e`, `issuer-assets.test.tsx` | Dossier status and the holder registry exist; **offering configuration, distribution runs and reports are NOT built for issuers** — they remain admin-only surfaces (P1-3) |
| **FR-PT-3** | Admin investor directory + chain footprint | ✅ | `application/identity/investor-directory.ts` | `investor-directory.test.ts` | — |
| **NFR-2** | Registry integrity — never a blank failure | ✅ | corrupt-stream/wallet errors surface as 409 with the reason | `registry-audit-api.e2e` | — |
| **NFR-5** | PII minimisation and erasure | 🟡 | Encrypted evidence + `erase()`; role-gated reads | `prisma-evidence-store.test.ts` | **No retention policy, no key rotation, no PII log redaction**. **Improved 2026-08-31:** recipient addresses removed from the application log (the production mail adapter wrote one on every send) and a static guard now fails the build if a new `log.*` call interpolates an identity or a credential |

## Requirements arising from user instructions during development

| Requirement (as stated) | Source | Status | Where | Gap |
|---|---|---|---|---|
| "Both individually and company should have KYC" | user, 2026-08-15 | ✅ | `require-verified-person.ts` + the organisation lifecycle | What individual verification of a company officer must *consist of* is jurisdiction-specific and unasserted |
| "All necessary information" (what an issuer sees about investors) | user, 2026-08-15 | 🟡 | `application/issuers/issuer-asset-holders.ts`, `GET /issuers/:id/assets/:assetId/holders`, the issuer portal Holders screen | **Implemented on the assistant's recommendation, NOT on an owner decision.** The field list was proposed in `docs/proposals/issuer-investor-visibility.md` and went unanswered, so the conservative reading shipped: a pseudonymous per-asset holder reference, tokens, share, holder since, tokens allocated, amount invested, allocation date, amount refunded. **Email, raw wallet and investor id are withheld.** Still 🟡 rather than ✅ because the owner has not struck or extended the list, and "all necessary information" is their phrase to define |
| Documents centre = curated subset, hidden by default | user (AskUserQuestion), 2026-08-09 | ✅ | `set-document-visibility.ts`, portfolio documents | No access log, watermarking or versioning |
| High UI/UX bar; hand-rolled design system; zero new deps | user mandate | ✅ | `apps/web/components/ui/**` | — |
| "Make the chain invisible" to end users | user mandate (PRD P2) | ✅ | No addresses/gas/wallets in investor-facing flows | Admin surfaces still show token addresses (intended) |
| English default and demo language always | user mandate | ✅ | `lib/i18n.ts`, `[locale]` routing with `en` populated | `fa`/RTL pack unbuilt (OD-13 unapproved) |
| Never claim a feature exists unless implemented + tested + visible | standing order | ✅ | Enforced by this handoff's status vocabulary | Issuer API is explicitly labelled "API only, no UI" |
| Record major decisions in `docs/open-product-decisions.md` | standing order | ✅ | 40+ rows | — |
| Commit format + `Co-Authored-By` trailer | standing order | ✅ | 123 commits | — |

## Roadmap phases → status

| Phase | Scope | Status |
|---|---|---|
| 0 | Audit + 10 docs + open decisions | ✅ complete |
| 1.1–1.8 | CI, tenancy, auth hardening, RBAC+approvals, state machine, async spine, notifications, ops shell | ✅ complete **except** 1.6's "move chain submission to workers" and the `ChainTransaction` lifecycle entity, which are **not built** |
| 2.1–2.6 | Public marketplace, publication, onboarding wizard, checkout, dashboard/portfolio, mobile | ✅ complete, exit journey automated |
| 3.1 | Real-estate profile + rights matrix + Asset 360 | ✅ complete |
| 3.2 | Issuer org onboarding, team & roles | 🟡 **API complete, no UI** |
| 3.3 | 13-step tokenization wizard | ⬜ |
| 3.4 | Document versioning / data-room v1 | ⬜ |
| 3.5 | TokenizationProject entity | ⬜ |
| 4 | Case management, screening, review workspaces, external portal | ⬜ |
| 5 | Token Design Studio | ⬜ |
| 6 | Double-entry accounting, payments, treasury, reconciliation | ⬜ |
| 7 | Corporate actions, voting, valuation lifecycle | ⬜ |
| 8 | Reports, security hardening, observability, DR, production readiness | ⬜ |
