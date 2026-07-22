# Information Architecture

Five experiences, one Next.js app (route groups, shared design system), locale-prefixed (`/en/...`). Existing routes noted with ✅ (they migrate, not rebuild).

## A. Public website & marketplace `/(public)`
```
/                      Homepage (value prop, featured offerings, how-it-works, trust)
/invest                Browse investments (cards, filters: type/status/yield/min)
/invest/[slug]         Offering detail (full investment page — see below)
/invest/upcoming       Upcoming offerings
/invest/funded         Funded assets
/invest/exited         Exited assets
/learn                 Knowledge center (articles)
/learn/how-tokenization-works
/learn/investor-protection
/risk-disclosures      Risk disclosures (jurisdiction-configurable content)
/fees                  Fee disclosure
/faq                   FAQs
/about                 About
/contact               Contact & support
/legal/terms  /legal/privacy  /legal/notices
```
Public offering detail sections (in order): hero gallery → headline metrics strip (funding progress, min investment, token price, valuation, target raise, holding period, projected yield*, distribution frequency) → sticky CTA panel → investment thesis → asset overview + location/map → structure (SPV/issuer, rights in plain language) → timeline → use of proceeds → financial highlights → valuation info → fees → risk factors → key documents → issuer & asset manager → FAQs. (*always labeled "projected, not guaranteed").

## B. Investor portal `/(investor)` — grows from ✅ portfolio/offerings/profile
```
/app                   Dashboard (value, invested, income, returns, cash, charts, actions required)
/app/marketplace       Authenticated marketplace (eligibility-aware)
/app/watchlist         Watchlist
/app/orders            Orders & subscriptions (status, payment instructions)
/app/invest/[id]/checkout   10-step checkout wizard
/app/portfolio         ✅ extended: analytics header + asset cards
/app/portfolio/[id]    Position detail (tokens, cost, value, P&L, history, rights, exits)
/app/income            Income & distributions
/app/transactions      Transactions
/app/transfers         Transfers & exit (modes per token class)
/app/documents         Documents & statements (data-room view)
/app/notifications     Notification center
/app/support           Support
/app/profile           ✅ extended: profile & verification (onboarding wizard, progress)
/app/security          Security settings (password, MFA, sessions, devices)
```

## C. Issuer portal `/(issuer)`
```
/issuer                Dashboard (raise progress, tasks, SLAs, next actions)
/issuer/organization   Org profile · /issuer/team  Team & permissions
/issuer/assets         Assets · /issuer/assets/new  13-step tokenization wizard
/issuer/assets/[id]    Asset workspace (tabs: overview, data, docs, review feedback, history)
/issuer/projects       Tokenization projects (config → simulate → approve → deploy)
/issuer/offerings      Offerings (+ creation wizard + investor-page preview)
/issuer/investors      Investors & capital raised
/issuer/operations     Asset operations (performance periods)
/issuer/financials     Financial reporting
/issuer/distributions  Distributions (propose)
/issuer/actions        Corporate actions
/issuer/documents      Documents
/issuer/tasks          Tasks & messages
/issuer/reports        Reports · /issuer/billing  Billing & fees
```

## D. Operations & compliance console `/(ops)` — grows from ✅ /admin
```
/ops                   Work-queue dashboard (replaces ✅ overview; queues, SLAs, alerts, health)
/ops/kyc               ✅ KYC/KYB queues → case-centric
/ops/cases             Compliance cases · /ops/cases/[id]
/ops/investors         ✅ directory · /ops/investors/[id]  ✅ → 10-tab Investor 360
/ops/organizations     Org onboarding & review
/ops/assets            ✅ review pipeline · /ops/assets/[id]  ✅ → 13-tab Asset 360
/ops/projects          Token deployments (simulate/approve/receipts)
/ops/offerings         ✅ + approval workflow
/ops/payments          Matching, unmatched queue, reconciliation
/ops/treasury          Payout batches (maker-checker)
/ops/distributions     ✅ → corporate actions console
/ops/transfers         Transfer exceptions, freezes, forced, recovery
/ops/redemptions       ✅ queue
/ops/registry          ✅ holder registry + snapshots + cap table
/ops/valuations        Valuation review
/ops/documents         Document review
/ops/tasks             My tasks / team queues
/ops/approvals         Pending approvals (checker inbox)
/ops/reports           Reports · /ops/audit  ✅ audit log · /ops/health  System health
```
Investor 360 tabs: Overview · Identity & Compliance · Investments · Portfolio · Cash & Payments · Transfers · Documents · Communications · Cases · Audit.
Asset 360 tabs: Overview · Property · Ownership & SPV · Financials · Valuations · Documents · Tokenization · Offerings · Holders · Income · Corporate Actions · Compliance · Audit.

## E. External portal `/(external)`
```
/external              Scoped landing per provider role
/external/assets/[id]  Assigned-asset view (valuer/custodian/manager/counsel scopes)
/external/reports      Scoped reports (auditor/regulator)
/external/audit        Read-only audit access (auditor/regulator)
```

## Shell & navigation rules
Public: top navigation + footer (marketing). Authenticated portals: existing left-sidebar shell pattern (✅) with portal-specific nav groups, breadcrumbs on detail pages, global search/command later. Every screen: loading/empty/error/permission-denied states; mobile layouts; chain artifacts only inside "Technical details" expanders.
