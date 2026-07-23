# Asset Tokenization Platform — Feature Reference

*Generated 2026-07-22 from the running system. Every screenshot in `screenshots/` was captured live from this build with real data — a real ERC-3643 token on the devnet, real signed valuations, and a real closed offering.*

---

## 1. What the platform is

A **Real-World Asset & Utility Tokenization platform**: it represents ownership or economic rights of real-world assets (real estate SPVs, commodity vaults, …) as compliant, transferable tokens on a permissioned blockchain.

Every feature stands on one of the platform's **three legs**:

| Leg | What it means | Where you see it |
|---|---|---|
| **Legal right** | A token is only as good as the enforceable off-chain right behind it | Legal dossier, custody record, onboarding checklist, counsel sign-off |
| **On-chain token** | ERC-3643 (T-REX) permissioned tokens with identity-gated transfers | Tokenize action, holder registry, on-chain compliance rejections |
| **Oracle / attestation** | Signed, on-chain-anchored statements of real-world facts | Valuations, freshness badges, redemption pricing |

**Deployment posture:** self-hosted, permissioned, closed-loop, domestic settlement in **Rial** (integer amounts, no floating point anywhere). No public exchange by design — liquidity is honest: peer transfers and operator-reviewed redemption at attested value.

**Stack:** NestJS + PostgreSQL API · Next.js web (both portals) · Solidity/Foundry contracts (ERC-3643 + ONCHAINID) · self-hosted IPFS for immutable documents · custodial HD wallets (users never see keys or gas) · internal ECDSA attestation signer anchored on-chain. Clean Architecture, ~500 automated tests written test-first.

**Roles:** `investor` (self-registered, KYC-gated) and `officer` (compliance operator). All privileged actions are officer-only and audit-logged.

---

## 2. Admin Console (`/en/admin`)

A left-sidebar application shell. Every section is its own URL (deep-linkable, browser history works); every entity (investor, asset, offering, distribution) has its **own page** — no popups for detail. Modals exist only for small action forms.

### 2.1 Overview — `admin-02-overview.png`
The operator's home dashboard.
- **System health strip**: live reachability of API, Postgres, IPFS, and the chain (with current block number), plus a paused-token count and an overall Healthy/Degraded badge.
- **Portfolio stats**: total assets, tokenized count, **total raised** and **total distributed** (Rial).
- **Assets table**: per asset — status badge, circulating supply, holder count, raised amount, and the **latest valuation with freshness** ("Fresh" green badge + "as of DATE"; stale valuations honestly show as stale).
- **Actions per asset**: *Attest* (publish a signed valuation via modal: kind, value, validity window, optional reference document) and *Details*.

### 2.2 Pending KYC applications — `admin-03-pending-kyc.png`
The compliance review queue (KYC states: draft → submitted → in review → approved/rejected).
- Lists every investor awaiting review with current state.
- **Start review / Approve / Reject (with mandatory reason)** actions.
- On approval the platform automatically deploys the investor's **ONCHAINID** identity contract and issues the signed KYC claim on-chain — this is what later lets the token itself enforce transfer compliance.

### 2.3 Investors (directory) — `admin-04-investors-directory.png`
The full user-management directory (CRM built in).
- **Summary strip**: investor count, total ledger balance, total invested, total portfolio value.
- **Table per investor**: email, KYC badge, **relationship stage** (lead / contacted / onboarding / active / dormant), tags, ledger balance, invested-to-date, portfolio value.
- **Follow-ups queue card**: all open follow-ups across investors with overdue highlighting.
- Every row opens the investor's own page.

### 2.4 Investor detail page — `admin-05-investor-detail-crm.png`
One page per investor (`/admin/investors/[id]`) — the complete client file:
- **Stat row**: ledger balance, escrow-held amount, invested-to-date, **portfolio value at the latest attested valuation** with a Fresh/Stale flag.
- **Relationship (CRM)**: stage selector and free-form tags (add/remove).
- **Sales**: full subscription history (offering, status, tokens, invested, date) and current portfolio per asset valued at the latest attestation.
- **Follow-ups**: create dated reminders, complete them; overdue ones are flagged.
- **Activity timeline**: officer notes (with author + timestamp) merged with the investor's own platform actions from the audit log, newest first.
- **Transfers & Redemptions**: the investor's history with counterparties shown by email.
- **On-chain**: the investor's ONCHAINID and custodial wallet addresses as truncated, copyable chips (never leading labels — the chain stays invisible).

### 2.5 Asset Onboarding — `admin-06-asset-onboarding.png`
The asset list + intake.
- **Propose asset** (name) — creates it in `proposed` state and opens its page.
- Table: name, lifecycle badge (Proposed → In structuring → Approved → Tokenized), token address chip, dossier completeness.

### 2.6 Asset detail page — `admin-07-asset-detail.png`
One page per asset (`/admin/assets/[id]`) — the entire onboarding workflow inline:
- **Legal dossier** card: the six required document kinds (ownership evidence, SPV structure, right definition, valuation report, counsel sign-off, custody agreement). Each upload is stored **immutably on self-hosted IPFS**; the table shows kind, title, and the IPFS content id (copyable). Missing kinds are listed until complete.
- **Custody** card: record the custodian and location of the underlying asset.
- **Onboarding checklist**: four gate questions (legal right clear? transferable? custodian engaged? valuation current?) each confirmed explicitly.
- **Approve asset**: refused with the exact reason if the dossier/checklist is incomplete.
- **Tokenize** (approved assets): enter a token symbol → the platform deploys a full **ERC-3643 (T-REX) suite** on the chain — token, identity registry, compliance — with the platform as trusted claim issuer. The token address appears as a chip.

### 2.7 Offerings — `admin-08-offerings.png`
Primary issuance management.
- **Create offering** (modal): pick a tokenized asset, supply, price (Rial), min/max per investor, minimum raise, open/close window.
- **Credit ledger** (modal): simulates the domestic bank deposit — credits an investor's Rial ledger.
- Table: asset name, status badge (Draft / Open / Closed—funded / Closed—refunded), price, subscription progress bar, **Open**/**Close** lifecycle actions.
- **Close semantics (both tested end-to-end)**: reaching minimum → funds captured, excess refunded, tokens **minted for real on-chain**, pro-rata allocation on oversubscription; below minimum → every hold released in full, nothing minted.

### 2.8 Offering detail page — `admin-09-offering-detail-allocations.png`
One page per offering (`/admin/offerings/[id]`):
- Stat row (supply, price, subscribed, minimum raise), progress bar, per-investor limits, window.
- Open/Close actions inline.
- **Allocations table** (officer-only): every participant **by email** with subscribed, allocated, cost, and refund — the full outcome of the pro-rata close. Investors never see each other's rows (their own portal shows only their numbers).

### 2.9 Income Distributions — `admin-10-distributions.png`
Rental/income yield runs (e.g. monthly rent).
- **Declare distribution** (modal): pick asset, total Rial amount. The platform snapshots **real on-chain balances** of every holder and computes pro-rata shares (floor division, remainder to the largest holder — total always reconciles exactly).
- Table: asset, status (Declared/Paid), amount, **reconciliation** (allocated vs declared with a Balanced badge), **Pay** action.
- Paying credits each holder's Rial ledger (credit-and-hold: nothing is ever forfeited).

### 2.10 Distribution detail page — `admin-11-distribution-detail-payouts.png`
One page per distribution: amount / allocated / reconciliation stats and the **full payout breakdown by investor email** (tokens held at snapshot, amount due), plus the Pay action while declared.

### 2.11 Redemption Requests — `admin-12-redemption-requests.png`
The operator side of cash-out.
- Queue of investor redemption requests (asset, investor, tokens, requested date).
- **Fulfill**: allowed only with a **fresh attested valuation** (stale/missing → refused with reason). On fulfill the tokens are **burned on-chain first**, then the pro-rata attested value is credited to the investor's ledger. Payout = valuation × tokens ÷ circulating supply.
- **Reject** with a mandatory reason, which the investor sees.

### 2.12 Holder Registry — `admin-13-holder-registry.png`
The transfer-agent-grade register (regulator-ready).
- Pick an asset → the registry is **rebuilt purely from the blockchain's own event log** (mints, transfers, burns) — never from internal bookkeeping.
- Holders table: **email** (people, not hex), wallet chip, tokens, ownership share %, holder-since date.
- **Reconciliation badge**: "Matches chain" when registry total equals live on-chain totalSupply; any mismatch is shown loudly with both numbers.
- **Full transfer history** with kind (mint/transfer/burn), parties by email, and the transaction hash of every event.
- **CSV downloads**: the holder registry and the complete transfer history.

### 2.13 Audit Log — `admin-14-audit-log.png`
Every privileged action across the platform in one queryable trail: timestamp, asset (by name), event kind, actor (resolved to email for investors), and structured details. Filterable per asset. This is the FR-RA-2 immutable audit substrate — nothing financial happens without a row here.

---

## 3. Investor Web App (`/en`)

Same sidebar shell, three sections. The blockchain is invisible: investors see names, Rial amounts, and status — never gas, keys, or raw addresses.

### 3.1 Access — `webapp-01-login.png`
- **Register** (email + password ≥ 8 chars, argon2id-hashed) or **Log in** (JWT session).
- No investment action is possible before KYC approval — buttons are gated, and the API enforces it independently of the UI.

### 3.2 Portfolio — `webapp-02-portfolio-holdings.png`
- **My Holdings**: per asset, the investor's live on-chain token balance (read from the chain — the source of truth).
- **Transfer** (modal): send tokens to another investor **by email**. The ERC-3643 token itself enforces compliance on-chain — a transfer to a non-KYC-approved recipient is rejected by the contract, not just the UI.
- **Redeem** (modal): request cash-out; the request goes to the officer queue, and the outcome (payout at attested value, or rejection with reason) shows here.
- **My redemptions**: status badges (Requested / Fulfilled with Rial payout / Rejected with reason).

### 3.3 Offerings — `webapp-03-offerings.png`
- Open offerings with asset name, price, progress, and the investor's **Rial ledger balance** (available vs held in escrow).
- **Subscribe**: the cost is held in escrow on the ledger until close. After close the investor sees **their own allocation only**: requested, allocated, cost captured, refund — never other participants.

### 3.4 Profile — `webapp-04-profile-kyc.png`
- KYC status card with a human status badge and the rejection reason when applicable.
- **Submit for review** starts the compliance process; approval triggers the on-chain identity + claim automatically.

---

## 4. Cross-cutting guarantees

- **Compliance enforced by the token, not the UI**: transfers between custodial wallets are signed by the *sender's* key and pass through the ERC-3643 compliance checks; an ineligible recipient reverts on-chain (proven in tests against the live devnet).
- **Money**: integer Rial everywhere (bigint end-to-end); formatted display (`60,000 ﷼`); conservation of funds is pinned by tests (holds + captures + refunds always sum exactly).
- **Verifiability (P5)**: every value traces to evidence — valuations to signed, on-chain-anchored attestations; documents to IPFS content ids; registry rows to transaction hashes.
- **Honest degradation (FR-OR-3)**: expired valuations display as stale and *block* actions that need fresh data (e.g. redemption pricing) instead of silently using old numbers.
- **Crash consistency**: ordering rules per flow (approve-then-claim; persist-then-settle; burn-then-pay) so a mid-flow crash can never pay without burning or mint without capturing.
- **Audit (FR-RA-2 / NFR-2)**: every privileged action appends actor + timestamp + details; financial state is reconstructible from chain events + audit log + ledger entries.
- **Localization-ready (C6)**: locale-routed UI (`/en/...`), RTL-capable architecture; English is the default and demo locale.
- **Security**: argon2id password hashing, role-guarded JWT sessions, repo guard-hooks against committed secrets, investors never exposed to keys or gas.

## 5. Feature → requirement map

| Area | PRD requirement |
|---|---|
| Registration, KYC queue, ONCHAINID claims | FR-ID-1…4 |
| Asset dossier, custody, checklist, lifecycle | FR-AO-1…5 |
| ERC-3643 suite deploy, identity-gated transfers | FR-SC-1/2 |
| Custodial HD wallets | FR-CU-1 |
| Signed anchored attestations + freshness | FR-OR-1…3 |
| Offerings, escrow, atomic close both paths | FR-PI-1…4 |
| Peer transfers, redemption workflow | FR-TR-1/2 |
| Distributions + reconciliation | FR-YD-1/2 |
| Investor portal, admin console | FR-PT-1/3 |
| Holder registry + CSV, audit trail | FR-RA-1/2 |
| Investor directory CRM/sales | FR-PT-3 (user-approved extension) |

**Not yet built (pilot scope):** notifications (FR-NT), issuer self-service portal (FR-PT-2), investor statements & auditor role (FR-RA-3/4), external KYC/AML providers, multisig+timelock governance (FR-SC-5…7), Besu network (devnet is anvil), mobile app.

---

## 6. Demo access (local)

| Portal | URL | Login |
|---|---|---|
| Admin console | http://localhost:3000/en/admin | officer@platform.local / officer-dev-pass |
| Investor app | http://localhost:3000/en | sara@demo.com / Demo12345 · bob@demo.com / Demo12345 |

*Screenshots index: `webapp-01…04` (investor app), `admin-01…14` (admin console) — filenames describe the page.*
