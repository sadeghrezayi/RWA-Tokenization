# SESSION RECOVERY SUMMARY

> **Purpose.** This file exists so that a Claude instance with no access to the original ~45-day
> development conversation can pick the project up without losing what was decided, tried,
> rejected, or learned along the way. It is written for an AI reader: dense, specific, and
> organised so that any section can be read on its own.
>
> **Reconstructed from:** the repository at commit `e26f60f` (branch `main`, clean tree,
> 123 commits spanning 2026-07-10 → 2026-08-16), the append-only decision log
> `docs/open-product-decisions.md`, the roadmap, the test suites, and the working conversation.
>
> **Where repository reality and conversation memory conflicted, repository reality won**, and the
> discrepancy is called out.

---

## 1. What this project is, in one paragraph

A **self-hosted, permissioned, closed-loop real-world-asset tokenization platform**, real-estate
first, settling exclusively in **Iranian Rial** on an internal ledger, with compliant asset tokens
(**ERC-3643 / T-REX**) and on-chain identity (**ONCHAINID**) on a private EVM chain. Three
audiences share one Next.js application: an anonymous public marketplace, an investor portal, and
a staff admin console. A fourth — issuer organisations — exists in the backend but has no user
interface yet. The governing idea, repeated in `CLAUDE.md` and honoured throughout: **a token is
only as good as the off-chain enforceable right behind it**, so every feature must trace to one of
three legs — legal right, on-chain token, oracle/attestation.

## 2. How the work is organised (and why it looks the way it does)

The user's operating model, enforced by `.claude/core-invariants.md` and by hooks:

- **TDD, with the red observed.** Every commit in the history follows a failing test.
- **Clean Architecture**, one composition root (`services/api/src/app.module.ts`).
- **One verified slice at a time**, each ending lint/typecheck/format clean, all suites green,
  committed, pushed, and **CI watched to green** before the next slice starts.
- **The assistant does not make business decisions.** When a product question arises, the pattern
  is: surface options, give a recommendation, wait. Several times the user simply said "continue",
  and the correct handling — established the hard way — was to re-read the **approved roadmap**
  rather than proceed on the assistant's own narrower assumption (see §6, "the issuer reversal").
- **Nothing is claimed as done that has not been run.** The phrase used repeatedly is "verify
  before done"; the Definition of Done has six items and a slice with an unmet item is reported
  as in-progress with the gap named.

The user drove ~45 days largely by typing **"continue"**, with occasional direct answers to
specific questions. That makes the recorded decisions unusually important: they are the only place
the user's intent is captured.

## 3. Chronology and milestones (verified against git)

### 2026-07-10 — Governance and the walking skeleton
`CLAUDE.md`, `.claude/core-invariants.md`, hooks, and `docs/engineering/*` came first — before any
product code. Then a walking skeleton: register an investor → KYC → issue an **ONCHAINID claim on
chain**, end to end, plus authentication and a role-gated officer review screen.

### 2026-07-11 → 07-13 — The core engine (FR-AO, FR-PI, FR-YD, FR-OR)
- **FR-AO asset onboarding**: lifecycle (`proposed → structuring → approved → tokenized`), legal
  dossier with required document kinds, an onboarding checklist gate, custody, an audit event log,
  and **IPFS** document storage. Then per-asset **ERC-3643 deployment**.
- **FR-PI primary issuance**: offerings, subscriptions, **pro-rata close**, an internal **Rial
  ledger**, chain minting.
- **FR-YD yield distribution**: declare → pay, pro-rata payouts at a holder snapshot.
- **Design system**: hand-rolled tokens and components, then both portals redesigned onto it;
  browser `prompt()` calls replaced with modals (and the orphaned i18n keys deleted).
- **FR-OR oracle**: signed attestations with freshness rules, an ECDSA signer, and an on-chain
  `AttestationRegistry` anchor.

### 2026-07-18 → 07-21 — Secondary market, registry, CRM
- **FR-TR**: compliance-checked transfers, and redemption at an attested value.
- **FR-RA**: holder registry rebuilt from chain events, CSV exports, a queryable audit trail with
  a coverage test.
- **Investor directory**, then a **CRM** (stage, tags, notes, follow-ups) and a sales read model.

### 2026-07-22 — Information architecture, then the Phase-0 audit
Every entity became a **page** (asset, offering, distribution, investor) behind left-sidebar
shells for both portals — "no popups" was an explicit UX direction. Then the assistant produced
the **Phase-0 audit**: ten documents (current-state audit, gap analysis, target architecture,
domain model, information architecture, role-permission matrix, threat model, data-migration plan,
test strategy, roadmap) plus `open-product-decisions.md` with OD-1…OD-19, and the user confirmed a
set of decisions that still govern the project.

### 2026-07-22 → 07-28 — Phase 1, the foundation
In order: **CI** (the full battery); **tenancy** (tenant-ready schema, AsyncLocalStorage context,
a fail-closed scoped Prisma proxy, isolation tests); **auth hardening** (lockout + rate limit,
httpOnly cookie sessions + CSRF, password reset, email verification, officer TOTP MFA);
**RBAC + maker-checker** (deny-by-default permissions, a threshold-based four-eyes ledger credit,
a User/Membership model with distinct staff roles, role-aware navigation); a **shared state
machine**; **atomic approve+execute**; the **transactional outbox** with durable at-least-once
emails; the **notification** domain, API, triggers and in-app centre; **pg-boss** for cron; and an
**ops work queue** dashboard.

### 2026-07-31 → 08-10 — Phase 2, public marketplace and investor experience
Publication state and an anonymous catalogue; a server-rendered public route group with SEO/**ISR**;
the **onboarding wizard** with an encrypted evidence store and an officer review side; the
**portfolio** read model and page; a **mobile pass** and a Playwright **layout-regression
harness**; **funding** (declare → treasury confirms the actual amount) and a **checkout** step with
affordability; **position detail**; the **documents centre**; and finally the **Phase-2 exit
journey** — a real-browser test from anonymous visitor to visible allocation, plus a failed-offering
refund test.

### 2026-08-10 → 08-11 — The nonce war and the observability fix
Three days were spent on a chain defect that only failed in CI and only on the *second* chain write
of a run. Along the way the assistant discovered it could not *see* failures at all, and fixed
that first. Both stories are in §7 because they are the most transferable lessons in the project.

### 2026-08-11 → 08-16 — Phase 3
- **3.1**: `RealEstateProfile` + `RightsMatrix` (domain → persistence → HTTP → Asset 360 UI).
- **3.2a–e**: issuer organisations and their people — domain, persistence, tenant-isolation proof,
  use cases with the **individual-verification gate**, the adapter binding that gate to the
  existing KYC pipeline, and finally (this session) the **HTTP API, team management and DI
  wiring**, with the gate proven through HTTP and mutation-checked.

## 4. The current state, precisely

- **Branch** `main`, **commit** `e26f60f`, **working tree clean**, CI run 31932519987 = success.
- **725** API unit tests · **319** API integration tests · **329** web unit tests · **22**
  Playwright tests · Foundry contract tests. Lint, format, typecheck and both builds clean.
- **28 Prisma migrations**, 43 models/enums.
- **18 HTTP controllers**; full route list in `REPOSITORY_MAP.md`.
- Phase 0, 1 and 2 are complete; **3.1 complete**; **3.2 is API-complete with no UI**.
- The immediate next slice, as stated at the end of the last session: **an ops review screen so an
  officer can decide issuer applications in a browser**.

## 5. Decisions the user made personally (never reverse these without asking)

1. **Governance scope and hook strictness** (2026-07-10) — two enforcing hooks, three advisory.
2. **Project rename** to the Tokenization Platform; **English PRD is the source of truth**; the
   older Persian requirements source is **void**.
3. **English is always the default and demo language**, even though the architecture is
   multilingual.
4. **High UI/UX bar with a hand-rolled design system and zero new dependencies**; "make the chain
   invisible" to end users.
5. **OD-1(a)** single-tenant install with a tenant-ready schema; **OD-2(a)** one Next.js app with
   five route groups; **OD-3(a)** pg-boss; **OD-4** approved Playwright + axe-core, pg-boss,
   otplib, nodemailer, with charts staying hand-rolled SVG; **OD-19(a)** GitHub Actions.
6. **OD-5(a)** a truly public catalogue with registration+KYC gating subscription only.
7. **OD-6(a)** manual bank transfer with treasury confirmation as the payment rail.
8. **OD-20** no platform fee in this phase. **OD-21** no projected yield, ever, in this phase.
9. **OD-22** email verification stays **informational** — the assistant had recommended gating KYC
   submission and was overruled; the accepted consequence is that a decision can be undeliverable.
10. **KYC evidence must not go on IPFS** — a private encrypted store instead. Asset *legal*
    documents stay on IPFS.
11. **The evidence-free KYC submit endpoint was removed** so no application can reach a reviewer
    with nothing attached.
12. **Phase 1.4 was to be built comprehensively** ("all features"), delivered as verified
    sub-slices; the first maker-checker action is the **ledger credit**; gating is
    **threshold-based**.
13. **Phase 1.4c is staff-first** — investor credentials stay on `Investor`; migrating them onto
    `User` is deferred.
14. **Phase 1.7 surface = in-app centre in both portals + email for important notifications**
    ("both").
15. **Phase 1.8 work-queue contents = pending KYC + pending approvals + pending redemptions.**
16. **Phase 2 scope = the whole of 2.1–2.6**, in verified slices.
17. **Documents centre = a curated subset, hidden by default** (chosen from an explicit options
    prompt).
18. **Issuer KYC = BOTH the company and each of its people** (2026-08-15, verbatim: "1- both,
    individualy and company should have kyc").
19. **What an issuer may see about investors = "all necessary information"** (2026-08-15, verbatim:
    "2- all necesery information") — **recorded but deliberately not implemented**, because
    "necessary" is the whole question and a wrong reading would expose national ID, address, bank
    details and KYC evidence to a third party. The agreed handling is to propose a concrete field
    list for the user to strike or extend.
20. **The dev database is disposable** (OD-15); reseeding is allowed while production-grade
    migrations are still written.

## 6. Decisions the assistant made (engineering-internal, all reversible, all recorded)

These were reported to the user rather than asked about, per the working agreement. Each is in
`docs/open-product-decisions.md` with its reasoning.

- **Clean-Architecture mechanics**: string DI tokens with `useFactory` in one composition root;
  use cases constructed by factories so they carry no decorators.
- **Tenant scoping via a Prisma Proxy that forbids by-id operations** — chosen over passing
  `tenantId` by hand because it fails closed.
- **Shared `StateMachine<S>`** with all lifecycles migrated behaviour-frozen.
- **Repository contract tests** shared between the in-memory fake and Prisma.
- **`exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`**, so an absent fact stays absent
  (`decidedBy` is missing, not `""` — "not decided yet" must never read as "decided by nobody").
- **Portfolio content is strictly factual and backward-looking**; no server-computed "gain".
- **Position detail deliberately omits the asset's legal documents** until a decision existed
  (which then became the documents-centre question the user answered).
- **The onboarding field set is provisional, server-defined, and encrypted at rest.**
- **The rights catalogue is provisional** and a conveyed right requires the wording it was granted
  in; an empty matrix means "not established", not "conveys nothing".
- **`issuer.manage` is granted to `compliance_analyst`** as well as the two admin roles.
- **The issuer applicant becomes the organisation's first `issuer_admin`**; colleagues are invited
  by **email**; an organisation must keep at least one administrator.
- **An issuer's person IS a verified platform user** — the single most consequential modelling
  call of Phase 3.2. Alternatives considered: a separate issuer identity with its own verification
  (rejected: duplicates a proven pipeline and doubles the surface where verification could be got
  wrong). **Known consequence:** an issuer's employee therefore holds an investor-capable account;
  barring issuer staff from investing would be a separate rule.

### The issuer reversal (an important process lesson)

During 3.1 the assistant asked twice whether issuers self-onboard and proceeded on its own
narrower assumption ("staff-onboarded assets, no issuer organisations") when the answer was
"continue". At 3.2 it asked twice more, got "continue" again, and then **re-read the approved
roadmap**, which already answered the question: *3.2 is "Issuer org onboarding (ops-approved),
team & roles"*. The narrower assumption was **superseded**. The lesson, now standing practice:
when the user says "continue" and a product question is open, **check the approved roadmap and the
PRD before assuming** — the answer is often already there, and the roadmap outranks an assistant's
convenience.

## 7. Failures, misdiagnoses and what actually fixed them

These are the highest-value entries for a future session, because each cost days.

### 7.1 The nonce war (three wrong fixes before the right one)

**Symptom:** the chain integration suite hung for ~900 s in one variant; in another, CI failed on
the **second** KYC approval of a run and never the first; a browser journey passed test 1 and
failed test 2.

**Wrong attempt 1 — one shared `NonceManager` across all adapters.** Reverted: ethers' manager
allocates **optimistically**, so a send that never reaches the chain leaves a permanent gap and
everything behind it queues forever.

**Wrong attempt 2 — shared manager with reset-on-failure.** Reverted: the setup hook timed out.

**Wrong attempt 3 — retry-on-collision.** Reverted: both properties still failed.

**Actual root cause:** `OnchainidClaimIssuer` held **one long-lived** `NonceManager` for the whole
process while every other chain adapter took **one per call**. A manager only advances when *it*
sends — so a tokenization elsewhere moved the chain forward while the claim issuer's counter stood
still, and the *next* KYC approval was rejected. That is exactly why the second write of a run
failed and the first never did.

**The fix that works** (`services/api/src/infrastructure/chain/custodial-wallets.ts`): a
`LanedOperatorSigner` that shares **only a promise lane per account** to serialise sends, while
**each send gets its own manager**. Forcing a nonce re-read per send is *also* wrong — it hits
ethers' **250 ms RPC cache** and the second of two rapid sends returns "nonce too low". Both
properties (concurrent senders get distinct nonces; a failed send does not block the queue) are
now integration-tested.

**Process note the assistant recorded:** three fixes were built on an unverified hypothesis. What
finally resolved it was making the failure **legible**, not guessing harder.

### 7.2 A CI failure that was invisible for six runs

Three compounding causes: (1) GitHub **job logs require admin rights** on this repository, so the
assistant could not read them; (2) Node **block-buffers stdout** when it is a file, so the log tail
attached to the failure was empty (fixed with `stdbuf -oL -eL`); and (3) the real one —
`DomainErrorFilter` returned early for `HttpException` **without logging**, so a 500 that arrived
as an `HttpException` produced "internal server error" with **nothing in the log to explain it**.
Fixes: log 5xx regardless of exception type, line-buffer, and attach only ERROR lines to the
**GitHub step summary** (which does *not* need admin rights).

### 7.3 Two silently-dropped columns, both caught by the same test

`investorVisible` (2.5d) and later `realEstate`/`rights` (3.1b) were saved by the domain but not
mapped by the Prisma repository. The **shared repository contract test** caught both. Rule now:
adding a persisted field means extending that contract test.

### 7.4 Test-harness traps

- **Cookie beats Bearer.** A Playwright `APIRequestContext` stored a cookie, so seeded API calls
  ran as the officer and CSRF refused them. Fix: one request context per actor, plus
  `x-csrf-token`.
- **Parallel devnet writes raced** → `test.describe.configure({ mode: "serial" })`.
- **ISR hid a freshly published offering** because `REVALIDATE_SECRET` was set nowhere, so that
  purge path had never run in any environment.
- **Register-then-navigate** aborted the in-flight login; wait for a post-login element instead.
- **A mutation check polluted the database**: a mis-wired scoped client wrote rows under the
  `default` tenant while cleanup keyed on tenants A/B, so even the restored run failed. Fix: key
  cleanup on a prefix you control.
- **Loose selectors of the assistant's own making**: `/address/i` matched both the property address
  and the token-address label; `/2,000,000/` matched `12,000,000`.

### 7.5 Duplication caught before commit

A `PrismaPersonVerification` adapter was written that re-implemented investor row mapping. It was
deleted in favour of composing over `InvestorRepository`, so "how an investor is loaded" has one
definition.

## 8. Techniques that became standing practice

1. **Mutation checking.** Break the rule on purpose; confirm the *specific* expected tests fail;
   restore. Applied to pro-rata allocation, the disclosure seam, tenant isolation, the issuer
   verification gate (a permissive DI stub failed exactly two e2e tests), email normalisation, and
   the fail-closed unknown-person default. A test that still passes when the rule is broken is
   decoration.
2. **Shared repository contract tests** (see 7.3).
3. **Live verification in a real browser** for anything user-facing. It caught things tests never
   would: a cut-off actions column, a wrong currency glyph.
4. **Distinguishing "empty" from "failed to load"**, and **"not established" from "none"**.
5. **Naming the gap.** Every completion report ends with what is *not* done. The last session's
   report said plainly: "The gate still isn't reachable… The rule exists; the door doesn't."

## 9. What is deliberately NOT built (so nobody rebuilds it by mistake)

- **No projected yield, expected return, or derived gain figure** — anywhere, ever, in this phase.
- **No platform fee.**
- **No PSP or payment-provider integration**; the rail is a manual bank transfer.
- **No promotional codes** (OD-17, legally sensitive).
- **No entity/company investor onboarding** — explicitly refused with
  `EntityOnboardingNotAvailableError` rather than half-built.
- **No `GET /issuers/mine`**, and **no invitation for someone without an account** — both YAGNI
  until the issuer portal exists.
- **No real screening vendor** — a labelled mock, by decision.
- **No fa/RTL locale pack** until OD-13 is approved.
- **No bulletin board or RFQ liquidity** (OD-9a, honest-liquidity principle).

## 10. Open questions the user still owes an answer to

1. The **concrete field list** an issuer may see about investors (answer 2 above).
2. Should an asset be **blocked from approval until its rights matrix is established**?
3. Should **issuer staff be barred from investing**?
4. **OD-23** — mandatory MFA for privileged roles?
5. **OD-7** — email/SMS provider.
6. **OD-10 / OD-16** — chain governance target and custody hardening.
7. **OD-13** — locale pack.
8. Queue semantics: should an application **waiting on the applicant** leave the officer's queue?
9. Should a **KYC-rejected applicant** be able to re-apply?
10. Should **draft (unopened) offerings** be visible to signed-in investors?

## 11. Discrepancies between conversation memory and repository reality

Recorded honestly, per the handoff instruction:

- The conversation at one point counted "706 unit / 296 integration / 329 web / 19 Playwright".
  The repository at `e26f60f` measures **725 / 319 / 329 / 22**. The repository is authoritative;
  the difference is the 3.2e work plus the two-project Playwright count.
- An earlier session assumed **no issuer organisations**; the repository now contains them, per
  the approved roadmap. The assumption is **superseded** (see §6).
- A "documents center" was described in Phase 2.5 as not built at position-detail time; it **was**
  subsequently built (2.5d) after the user's decision.
- The web dev server has been referred to as port **3100** at least once; `.claude/launch.json`,
  the Playwright config and `TEST_SCENARIOS.md` all use **3000**. Use **3000**.

## 12. If you do exactly one thing next

Build **P0-1: the ops review screen for issuer applications**
(`apps/web/app/[locale]/admin/issuers/`), against the endpoints that already exist and are tested:

```
GET  /issuers                      → IssuerOrganisationView[]  (staff, issuer.manage)
POST /issuers/:id/start-review     → 204
POST /issuers/:id/approve          → 204
POST /issuers/:id/reject   {reason}→ 204   (blank reason ⇒ 400)
POST /issuers/:id/suspend  {reason}→ 204
POST /issuers/:id/reinstate        → 204
GET  /issuers/:id/members          → IssuerMemberView[]  (staff, or a member of that org)
POST /issuers/:id/members {email, role} → 204  (unverified person ⇒ 403; unknown email ⇒ 404)
DELETE /issuers/:id/members/:userId     → 204  (last administrator ⇒ 409)
```

Follow the existing admin pages for structure (`admin/kyc`, `admin/deposits` are the closest
analogues), write the web tests first, add a Playwright layout contract, and verify it in a real
browser before calling it done. Then the **asset ↔ organisation link** (backlog P1-1), which is
the project's identified data-migration point and needs the user's input on what existing assets
belong to.
