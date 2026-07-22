# Platform Test Scenarios — Asset Tokenization Pilot

A guided, end-to-end tour of every business flow. Run top-to-bottom: later scenarios
reuse what earlier ones create. By the end, admin and investor both understand the whole system.

## Access
- Investor app: http://localhost:3000/en
- Admin console: http://localhost:3000/en/admin
- **Officer (admin):** `officer@platform.local` / `officer-dev-pass` — use **Log in**
- **Investor:** register your own on the investor page (**Register** button). Example: `investor@test.local` / `investor-dev-pass`

## The golden path (how the flows connect)
Asset onboarding → tokenize → offering → investor KYC → fund wallet → invest → distributions → transfer/redeem → oversight.

---

# PART A — Admin sets up an asset

## Scenario 1 — Onboard & tokenize a building (Officer)
**Goal:** turn a real villa into on-chain tokens.
1. Log into the Admin Console → **Asset Onboarding** tab.
2. Create a new asset: name **"Villa Mazandaran"**, choose its kind/type, location **Mazandaran**. → appears in state `proposed`.
3. Open it → **Start structuring**. → state `structuring`.
4. **Upload the legal dossier** documents (the panel lists the required kinds — e.g. title deed, valuation report).
5. **Record custody** (who legally holds the asset).
6. Add a **valuation** (attestation) — e.g. 10,000,000,000 ﷼. This becomes the asset's "latest valuation".
7. **Complete the onboarding checklist** (tick each required item).
8. **Approve** the asset. → state `approved`.
9. **Tokenize.** → the system mints the token; state `tokenized`.
- ✅ **Expect:** Overview tab "Tokenized" count increases; System health shows a new block; asset now tokenized.

## Scenario 2 — Publish an offering (Officer)
**Goal:** make the tokens available to buy.
1. **Offerings** tab → **Create offering** for Villa Mazandaran.
2. Set **supply** (e.g. 1,000 tokens) and **price per token** (e.g. 500,000 ﷼).
3. **Open** the offering. → state `open`.
- ✅ **Expect:** offering shows as open; it now appears on the investor side.

---

# PART B — Investor participates

## Scenario 3 — Register & submit KYC (Investor)
**Goal:** create an account and start verification.
1. Investor app → **Register** with your email/password. → logged in.
2. Note your **KYC status: not submitted** and **wallet balance: 0** (correct for a new account).
3. **Submit KYC** (fill the KYC form/card). → status moves to `submitted` / `in review`.
- ✅ **Expect:** KYC status card updates; you cannot invest yet.

## Scenario 4 — Review & approve KYC (Officer)
**Goal:** compliance approves the investor.
1. Admin Console → **Pending KYC applications**. → your investor is listed.
2. **Start review**, then **Approve** (try **Reject** with a different test investor to see that path too).
- ✅ **Expect:** investor KYC = `approved`; on the investor side the status flips to approved.

## Scenario 5 — Fund the investor wallet (Officer)
**Goal:** record the investor's bank deposit as spendable balance.
1. Admin Console → **Investors** → open your investor → **Credit** the ledger (e.g. 1,000,000 ﷼).
- ✅ **Expect:** investor's wallet balance increases by that amount (pilot stands in for a real bank rail).

## Scenario 6 — Invest / subscribe (Investor)
**Goal:** buy tokens in the offering.
1. Investor app → **Offerings** → open **Villa Mazandaran**.
2. Enter a token quantity (e.g. 1 token). Cost = quantity × price is debited from your wallet.
3. Confirm.
- ✅ **Expect:** a **holding** appears; wallet balance drops by the cost; Admin "Total Raised" rises.
- 🔎 **Edge checks:** try to buy more than your balance allows, or more than remaining supply — should be blocked.

---

# PART C — Ongoing operations

## Scenario 7 — Declare & pay income distribution (Officer)
**Goal:** pay rental income to token holders.
1. Admin Console → **Income Distributions** → **Declare** a distribution on Villa Mazandaran (e.g. 50,000,000 ﷼ total).
2. **Pay** the distribution. → each holder credited pro-rata to their token share.
- ✅ **Expect:** Admin "Total Distributed" increases; investor's income/wallet reflects their share.

## Scenario 8 — See portfolio & income (Investor)
**Goal:** understand holdings and returns.
1. Investor app → **Overview / Distributions**.
2. Review: tokens held, current value (tokens × latest valuation), distributions received.
- ✅ **Expect:** holdings + income are visible.
- ℹ️ **Note:** there's no single "profit/loss %" figure yet — value and income are shown separately (a PnL summary is a candidate enhancement).

## Scenario 9 — Transfer tokens to another investor (Investor)
**Goal:** move tokens peer-to-peer.
1. Register (or reuse) a **second** investor and get them KYC-approved (Scenarios 3–4).
2. As the first investor → **Holdings** → **Transfer** some tokens to the second investor.
- ✅ **Expect:** sender's holding decreases, receiver's increases; the event lands in the Holder Registry.
- 🔎 **Edge check:** transfer to a **non-approved** investor should be blocked (compliance rule).

## Scenario 10 — Redemption request & fulfillment (Investor → Officer)
**Goal:** cash out tokens.
1. Investor app → request a **redemption** for some tokens.
2. Admin Console → **Redemption Requests** → **Fulfill** it (try **Reject** on another to see that path).
- ✅ **Expect:** on fulfill, holding reduces and the request closes; registry records it.

---

# PART D — Oversight & relationship management (Officer)

## Scenario 11 — Holder registry, audit trail & CSV export
**Goal:** prove the system is auditable.
1. Admin Console → **Holder Registry** for Villa Mazandaran → see every holder and balance.
2. **Audit** tab → see the full event trail (create, tokenize, subscribe, transfer, distribute, redeem).
3. **Export CSV** (registry / transfers) for reconciliation.
- ✅ **Expect:** registry balances reconcile with the actions you took; audit shows a complete history.

## Scenario 12 — Manage the investor relationship (CRM)
**Goal:** operate the sales/support relationship (note: this is staff-side, not investor chat).
1. Admin Console → open an investor's detail → set a **relationship stage** (lead → onboarding → active).
2. Add a **note**, add/remove a **tag**, and create a **follow-up** task; then mark it complete.
- ✅ **Expect:** notes/tags/stages/follow-ups persist on the investor record.

## Scenario 13 — System overview & health
**Goal:** the operator's at-a-glance dashboard.
1. Admin Console → **Overview**: System health (API, Postgres, IPFS, Chain), assets, tokenized count, total raised, total distributed.
- ✅ **Expect:** numbers match everything you did above; all health chips green.

---

## Coverage map (features → scenarios)
| Feature | Scenario |
|---|---|
| Asset onboarding lifecycle (dossier, custody, checklist, approve) | 1 |
| Tokenization | 1 |
| Valuation / attestation | 1 |
| Offering create / open / close | 2, 13 |
| Investor registration | 3 |
| KYC submit / review / approve / reject | 3, 4 |
| Wallet / ledger funding & balance | 5, 6 |
| Investment / subscription | 6 |
| Income distribution declare / pay | 7 |
| Portfolio & income view | 8 |
| Peer transfer + compliance block | 9 |
| Redemption request / fulfill / reject | 10 |
| Holder registry + audit + CSV export | 11 |
| CRM (stages, notes, tags, follow-ups) | 12 |
| System health / overview | 13 |

## Not yet built (out of scope for testing)
- Investor↔support **chat/ticketing** (only staff-side CRM exists).
- Explicit **profit/loss (PnL) %** summary (holdings value and distributions are shown separately).
