# DEMO GUIDE

The full, narrated manual script lives in **`TEST_SCENARIOS.md`** at the repository root — it is
the authoritative walkthrough and is kept in sync with the product. This file is the short version
plus the parts a fresh operator needs to know.

---

## Surfaces and URLs (local)

| Surface | URL | Audience |
|---|---|---|
| Public site | `http://localhost:3000/en` | Anonymous visitor |
| Browse offerings | `http://localhost:3000/en/browse` | Anonymous |
| Investor portal | `http://localhost:3000/en` (after login) → `/en/portfolio`, `/en/offerings`, `/en/funds`, `/en/onboarding`, `/en/profile` | Investor |
| Admin console | `http://localhost:3000/en/admin` | Staff |
| API | `http://localhost:3001` | — |

## Accounts

- **Officer / staff:** configured by `OFFICER_EMAIL` + `OFFICER_PASSWORD_HASH` in
  `services/api/.env`. `TEST_SCENARIOS.md` uses `officer@platform.local` with a local dev
  password; the **hash** is what lives in the env file, never the password itself, and the value
  is local-only. A second officer (`OFFICER2_*`) can be configured to demonstrate real
  two-person maker-checker.
- **Investor:** register one through the UI (Register on the investor page). There are no
  pre-seeded investor accounts and no seed script.
- **No shared or production credentials exist anywhere in this repository.**

## End-to-end demo flow (only steps the product actually supports)

1. **Officer signs in** at `/en/admin`.
2. **Asset onboarding** (`admin/assets`): propose an asset → start structuring → upload the
   required dossier documents → record custody → record the real-estate profile → state which
   rights the token conveys (each with the wording it was granted in) → confirm every checklist
   item → **approve** (this freezes the dossier and rights) → **tokenize** (deploys a per-asset
   ERC-3643 token on the devnet).
3. **Reveal documents to holders** (optional): on the asset page, publish individual dossier
   documents. They are hidden by default; each reveal/withdraw is written to the audit log.
4. **Publish a valuation** (`admin/overview`): a signed attestation with a value and date.
5. **Create and open an offering** (`admin/offerings`): price, size, min/max per investor,
   window; **publish** it to make it visible on the public site.
6. **Investor journey** (`/en`): register → complete the **onboarding wizard** (profile, identity
   evidence upload, bank account, suitability, agreements) → submit.
7. **Officer reviews KYC** (`admin/kyc`): approve — which issues the on-chain ONCHAINID claim,
   making the investor eligible to hold, and notifies them in-app and by email (dev sink).
8. **Investor funds their balance** (`/en/funds`): declares a bank transfer and receives a
   payment reference like `TP-ABC12XYZ`.
9. **Treasury confirms the deposit** (`admin/deposits`): enters **the amount that actually
   arrived**. Above the configured threshold this creates a maker-checker approval that a second
   officer decides in `admin/approvals`.
10. **Investor subscribes** (`/en/offerings`): the checkout prices the order live, shows the
    balance and what is left, and refuses an unaffordable order with the exact shortfall.
11. **Officer closes the offering**: allocation is **pro-rata**, tokens are minted to the
    investor's custodial wallet, and any unallocated money is returned in full.
12. **Investor sees the position** (`/en/portfolio` → a holding): tokens held, value at the date
    it was attested (with a stale flag), what was invested, what it has paid, and the published
    documents.
13. **Distribution** (`admin/distributions`): declare an amount → pay → each holder is credited
    pro-rata at the snapshot and notified.
14. **Transfer / redeem** (`/en/portfolio`): a compliance-checked holder-to-holder transfer, or a
    redemption request that an officer fulfils at the attested value (`admin/redemptions`).
15. **Oversight**: `admin/registry` (cap table + CSV), `admin/audit` (queryable trail),
    `admin/ops` (work queue of everything waiting on a human), `admin/overview` (portfolio and
    system health).

## What is NOT demonstrable today

- **Issuer flows have no UI.** Applying as an issuer, reviewing an application, and managing an
  issuer's team exist **only as HTTP endpoints** (`POST /issuers`, `GET /issuers`,
  `POST /issuers/:id/{start-review,approve,reject,suspend,reinstate}`,
  `GET|POST /issuers/:id/members`, `DELETE /issuers/:id/members/:userId`). They can be shown with
  curl but not in a browser.
- **No email actually arrives** — delivery goes to a dev sink.
- **Assets are not owned by issuer organisations yet**; everything is staff-onboarded.
- **Entity (company) investor onboarding** is explicitly refused.
- Everything runs on a **local anvil devnet**, not a production chain.

## Automated demo

The Playwright journey (`apps/web/e2e/journey.spec.ts`) performs the investor half of the flow in
a real browser — browse → register → wizard → officer approval → declare deposit → treasury
confirm → checkout → allocation visible — plus a second test proving a **failed** offering returns
every Rial. Operator-only setup is seeded through the API (`apps/web/e2e/seed.ts`). It runs in CI.
