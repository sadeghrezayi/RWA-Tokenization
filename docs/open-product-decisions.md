# Open Product Decisions

Decisions the assistant must NOT make alone. Each has options + a recommendation; **nothing below is implemented until confirmed**. Confirmed decisions move to the log at the bottom with date. Jurisdiction/legal items additionally require local counsel validation regardless of choice here.

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| OD-1 | Multi-tenancy depth | (a) single-tenant install, tenant-ready schema; (b) full SaaS multi-tenant now | **(a)** — schema + scoping + isolation tests now, SaaS ops (billing, tenant self-serve) deferred |
| OD-2 | Portal packaging | (a) one Next.js app, 5 route groups; (b) separate apps per portal | **(a)** — shared DS, simpler ops; split later if needed |
| OD-3 | Background-job tech | (a) pg-boss (Postgres, no new infra); (b) BullMQ + Redis | **(a)** — self-hosted constraint, one fewer service |
| OD-4 | New dev-dependencies approval | Playwright (+axe-core) for browser/a11y E2E; pg-boss (runtime); TOTP lib (e.g. otplib); nodemailer (SMTP port); charts stay hand-rolled SVG | **Approve all four**; charts remain dependency-free per UI mandate |
| OD-5 | Public marketplace exposure | (a) truly public catalog (marketing + gated subscription); (b) fully login-gated | **(a)**, with per-offering visibility flag; legal review of public solicitation rules required (jurisdiction policy) |
| OD-6 | Payment rails (pilot) | (a) manual bank transfer: instructions + statement-import matching (dev adapter now, file import later); (b) PSP integration | **(a)** — matches closed-loop Rial posture; PSP port defined for later |
| OD-7 | Email/SMS providers | Ports + dev sink now; real SMTP/SMS provider chosen at deploy | **Confirm approach**; name providers later |
| OD-8 | Jurisdiction policy pack | First pack = Iran (Rial, domestic KYC docs, RTL locale fa) as *configuration*, English default UI per standing language policy | **Confirm**: build policy-pack mechanism now, populate Iran pack with "requires local legal validation" markers |
| OD-9 | Pilot liquidity mode | (a) operator-approved transfers + redemption queue only; (b) + bulletin board; (c) + RFQ/windows | **(a)** for pilot — honest-liquidity principle; others behind config |
| OD-10 | Chain governance target | (a) contract multisig (deploy Safe-equivalent on private chain) + timelock; (b) threshold signing service (MPC) | Needs discussion — **(a)** simpler to audit on Besu; decide before Phase 8, design in Phase 5 |
| OD-11 | KYC/KYB screening providers | Ports + labeled mock now; provider selection is a business/legal choice | **Confirm approach** |
| OD-12 | Design direction | Extend existing hand-rolled DS (institutional/calm/premium; typography+density pass, no template look) vs adopt a component library | **Extend existing** — consistent with your zero-dep mandate; typography choice (self-hosted font) needs your pick |
| OD-13 | Locale set for pilot | en (default, exists) + fa (RTL) as first additional pack? | **Confirm**; en-only until pack approved (standing policy: English default/demo always) |
| OD-14 | Issuer self-service timing | (a) operator-mediated issuers in P3 (issuer portal drafts, ops finalizes); (b) full self-service | **(a)** — safer review loop first |
| OD-15 | Data stance | Treat current dev DB as disposable (reseed allowed, standing policy) while writing production-grade migrations from P1 | **Confirm** |
| OD-16 | Custody hardening target | Encrypted keystore on isolated signer service (interim) → HSM/MPC (production) | **Confirm interim target**; HSM/MPC procurement is a business decision |
| OD-17 | Promotional codes | Skip entirely for pilot (legally sensitive) | **Skip**; schema hook only |
| OD-18 | Phase 5 ↔ 6 order | Token studio before payments, or payments first | **Studio first** (roadmap as written); swap if fundraising reality demands |
| OD-19 | CI runner | (a) GitHub Actions; (b) self-hosted runner (C1 self-hosting posture) | **(b) if repo must stay fully self-hosted**, else (a); need your call |
| OD-20 | Fee model activation | PRD §13 fee options exist; which fees are real for pilot (platform fee? issuance fee? none)? | Business decision — needed before checkout fee-summary step (P2.4) copy is real |
| OD-21 | Projected-yield methodology | Who computes/approves projected yield shown publicly; display rules | Business+legal — required before public offering pages show yield |

## Standing assumptions carried into Phase 0 docs (flag if wrong)
A-1: Real estate is the first vertical; other asset types remain supported generically. · A-2: Rial integer minor-unit is the only settlement currency for pilot. · A-3: anvil stays the dev chain; Besu stand-up remains a pre-pilot gate (existing decision). · A-4: English remains default/demo language (standing policy). · A-5: The existing 616-test suite is the regression floor. · A-6: No production users/data exist today.

## Decision log
| Date | Decision | Outcome |
|---|---|---|
| 2026-07-22 | OD-1 | **(a) confirmed** — single-tenant install, tenant-ready schema with enforced scoping + isolation tests |
| 2026-07-22 | OD-2 | **(a) confirmed** — one Next.js app, five route groups |
| 2026-07-22 | OD-3 | **(a) confirmed** — pg-boss for background jobs |
| 2026-07-22 | OD-4 | **Approved all** — Playwright + axe-core (dev), otplib, nodemailer; charts remain hand-rolled SVG |
| 2026-07-22 | OD-19 | **(a) confirmed** — GitHub Actions CI |
