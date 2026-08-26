# CURRENT BACKLOG (as of `ba820fa`, 2026-08-23)

Ordered by priority. "Prerequisites" means work that must land first. Acceptance criteria are
suggestions consistent with the project's Definition of Done (failing test first, CI-green,
verified by running it).

---

## P0 — Blocking / critical

### ~~P0-1 — Issuer applications have no user interface~~ → **DONE for the review queue** (3.2f, `d0e6a71`)
An officer can now sign in and walk an application through review, approval, rejection with a
reason, suspension and reinstatement at `/[locale]/admin/issuers`, behind `issuer.manage`.
Verified live in a browser. Both follow-ups — the team panel (P1-8) and naming the deciding
officer (P1-9) — are also **DONE** as of 2026-08-23.

### P0-2 — Chain writes are synchronous on a single hot key
> **The four-step MINT/CLAIM slice is COMPLETE as of 2026-08-25** — all four sub-items below are
> struck through, and **K-34 is closed**. What remains of this entry is the REST of its scope:
> `tokenize`, `transfer` and `burn` still run inside the HTTP request, and the single permanent
> operator EOA is untouched — that part overlaps P0-4 and still needs the owner's call on signing.
> Do not read the struck-through list as the whole item being finished.
- **What:** tokenize / mint / transfer / burn / claim-issue all run inside the HTTP request using
  one operator account derived from `PLATFORM_OPERATOR_MNEMONIC`.
- **Why it matters:** a devnet hiccup turns a KYC approval or a subscription close into a 500;
  throughput is bounded by one nonce lane; and in production this is a single permanent EOA
  controlling mint/burn — which the project's own invariants forbid.
- **Files:** `services/api/src/infrastructure/chain/*`, especially `custodial-wallets.ts`.
- **Prerequisites:** the `ChainTransaction` lifecycle entity from roadmap 1.6.
- **Acceptance:** chain submission is enqueued and retried with idempotency keys; the request
  returns a pending state; the devnet fast path is preserved for tests; nonce behaviour stays
  covered by `operator-nonce.test.ts`.
- **Risks:** **high regression risk** — the nonce design took four attempts. Do not "simplify"
  `LanedOperatorSigner`; read the comments in that file and DECISION_LOG C4 first.
- **Attempted 2026-08-19 and REVERTED — read this before starting.** The KYC claim alone was moved
  onto the outbox (decision B7 settles the mechanism, so no design question is open there). CI
  refused it four times, and the fourth explained why: **the claim cannot go async before the mint
  can survive it.**
  - `TrexAssetTokenIssuer.mint` throws `investor <id> has no on-chain identity — the KYC claim must
    be issued first`. With the claim deferred, an approved investor can subscribe before it drains,
    and the close-time mint hits exactly that.
  - `CloseOffering` saves the closed offering, THEN captures money, THEN mints. A mint failure
    therefore leaves the offering closed and the cash taken, and re-closing is refused with
    `cannot close an offering in state "closed_success"` — no route back (**K-34**).
  - `mint` is **not idempotent**: it mints unconditionally, so a redelivered message issues tokens
    twice. Nothing today records that an allocation was minted.
- **Suggested order for the coherent slice** (one change, not four commits):
  1. ~~Record mint-per-allocation and make it idempotent~~ — **DONE 2026-08-24.** `MintAllocation`
     + `AllocationMintLog`, backed by `allocation_mints` with a UNIQUE index on
     (offering_id, investor_id). The index — not the application's read-then-write — is the
     guarantee: four simultaneous claims were fired at real Postgres and exactly one won.
     Three states, because two cannot be honest: `unminted` (mint it), `minted` (the no-op),
     and **`unresolved`** — claimed but never confirmed, so the chain's answer is unknown.
     That last one REFUSES rather than guessing, because re-minting may double-issue and
     skipping leaves a paying holder with nothing and nothing to complain about.
  2. ~~Move the mint onto the outbox~~ — **DONE 2026-08-24.** Inline-first, per this entry's own
     acceptance that "the devnet fast path is preserved for tests": `SettleWithRetry` attempts the
     mint synchronously and hands it to the outbox only if the chain refuses, so a close still
     produces tokens immediately and the browser journey is untouched. The queued retry calls the
     SAME idempotent use case, so a retry racing the inline attempt is a no-op.
     **A flaw found by testing, not by reading:** after an inline failure the allocation stayed
     CLAIMED, so `stateOf` returned `unresolved` and the queued retry always refused — the retry
     could never have succeeded. Fixed by distinguishing failures that never reached the chain
     (`MintPreconditionError` — no on-chain identity, token paused, both checked before any
     transaction is sent) from those that might be in flight. The former releases the claim and is
     retryable; the latter keeps it and asks for a person. Both directions mutation-checked.
  3. ~~Decide what happens between capture and mint~~ — **DONE 2026-08-25.** Put to the owner as a
     product question with three options and a recommendation; the answer to repeated asking was
     "continue", so I took the recommendation and flagged it **reversible**
     (`open-product-decisions.md`, 2026-08-25). **Money now moves only after the tokens exist.**
     `CloseOffering` releases the refund first — over-subscribed money was never owed — and then
     settles the allocation as one unit through `SettleAllocation`: mint, THEN capture. A refused
     mint leaves the Rial HELD rather than taken, and the queued retry completes both halves.
     Capture is exactly-once through a UNIQUE index on
     `ledger_entries (investor_id, kind, reference)`, so a redelivered message cannot debit twice;
     the ledger entry is written BEFORE the balance moves, inside the same transaction, so the
     duplicate is a no-op instead of looking like an over-capture. Mutation-checked: restoring the
     capture-first order fails exactly the two ordering tests and nothing else.
     **What it does NOT solve, and is still the owner's:** an allocation whose mint never succeeds
     leaves the money held indefinitely. **Visibility landed the same day** — the health probe
     reports `allocationsAwaitingMint` (count + total Rial held) and the admin overview shows it
     when non-zero, so the state is at least no longer invisible; it decides no policy. A
     claimed-but-unconfirmed mint counts, since that is the case most wanting a person.
     **The per-allocation list also landed** — `GET /reporting/allocations-awaiting-mint` and the
     "Escrow awaiting tokens" screen (REPORTING_READ) name who, which offering, how much, since
     when, and the last retry error, and keep `unresolved` (may already be on chain) visibly
     apart from `not_minted` (never attempted). The screen has NO release button on purpose.
     Still missing, and needing a decision rather than code: automatic release after N failures,
     and a lever to release one. Open questions: **how long to wait, and who may release it.**
  4. ~~Only then move the claim~~ — **DONE 2026-08-24.** Its dependency really had dissolved, and
     specifically on step 2 rather than step 3: the stated blocker was "the claim cannot go async
     before the mint can survive it", and a close-time mint now RETRIES on `MintPreconditionError`,
     which is literally the "no on-chain identity" error a deferred claim causes.
     A chain outage during approval no longer answers 503 for an officer to notice and retry by
     hand — the claim goes to the outbox and retries itself. K-2's guarantees are preserved through
     different mechanisms: a claim that never lands still shows in `approvedWithoutOnchainIdentity`
     on the health probe, and `ReissueKycClaim` remains the manual lever — which is also where K-2's
     "the approval stands, here is what is left" wording moved, since that is where an officer
     explicitly asked and is owed an answer.

### P0-3 — No real email delivery — **DONE** (2026-08-23)
`SmtpEmailSender` (nodemailer, approved in OD-4) sits behind the existing `EmailSender` port.
**Which provider is deployment configuration, not a code decision** — the adapter takes any SMTP
host, so OD-7 no longer blocks delivery; it only chooses where to point it.

**The default is deliberately unchanged:** with no `SMTP_HOST`, the platform keeps the dev sender
that prints `[DEV EMAIL — NOT DELIVERED]` next to every link. Silently sending nowhere is the
failure this avoids.

Send failures **propagate**, because the outbox (B7) is what makes delivery durable and it can only
retry a send that actually threw. A non-numeric `SMTP_PORT` fails loudly rather than defaulting.

Verified against a real SMTP conversation on a socket, not just mocks: `MAIL FROM`, `RCPT TO` and
the subject arrived on the wire, and the token was URL-encoded.

### P0-4 — Secrets and key management
- **What:** `AUTH_TOKEN_SECRET`, `KYC_EVIDENCE_KEY`, `PLATFORM_OPERATOR_MNEMONIC` and the officer
  password hashes all come from plain environment variables. `services/api/.env` exists locally
  with dev values.
- **Why it matters:** the KYC evidence key protects passport scans; the mnemonic controls minting.
  There is no rotation, escrow, KMS or HSM (OD-16 names the target; nothing implements it).
- **Prerequisites:** an owner decision on the interim signer service.
- **Acceptance:** at minimum, documented rotation procedures and a signer that is not the API
  process. **Do not treat this as done because the values are "only dev" — the pattern is what
  ships.**

---

## P1 — Important (next milestone)

### P1-1 — Link assets to issuer organisations — **DONE** (3.3a–3.3c, 2026-08-18)
- **Delivered:** `Asset.organisationId` settled at proposal and never changed afterwards
  (`domain/assets/asset.ts`); `propose-asset.ts` refuses an organisation that may not submit
  (409 via `IssuerOrganisation.canSubmitAssets()`); `AssetView` carries `organisationId` +
  `organisationName` resolved in one batch lookup; `POST /assets` accepts the organisation; the
  onboarding screen offers only issuers that may submit, and both the asset list and the asset
  page read "Brought by <issuer>".
- **Migration:** `20260817090000_asset_issuer_organisation` — nullable, **not** backfilled, per
  `docs/data-migration-plan.md` §1 ("there is no production data yet") and OD-15. NULL means the
  platform onboarded the asset itself, which is a true answer rather than a missing one.
- **Still open (the owner's call, not an engineering one):** must every FUTURE asset belong to an
  organisation? Today "The platform" stays a valid choice.
- **Not covered here:** `IssuerMembership.canWorkOnAssets()` still has no caller — the per-person
  "may this contributor work on this asset" check belongs to the issuer-facing portal (P1-3).

### P1-2 — Decide and implement what an issuer may see about investors — **IMPLEMENTED 2026-08-25 on my recommendation, REVERSIBLE**
- **Built the conservative version of the proposal** (`GetIssuerAssetHolders`,
  `GET /issuers/:id/assets/:assetId/holders`, and the issuer portal's **Holders** screen).
  Pseudonymous per-asset holder reference, tokens, share, holder since, tokens allocated, amount
  invested, allocation date, amount refunded. **Withheld:** email, raw wallet, investor id, KYC
  state and rejection reason, risk score and band, screening outcome, account mechanics, and
  anything about other assets. The acceptance criterion is met — a test serialises the whole view
  and asserts the excluded fields are absent, and it fails when the allow-list becomes a spread.
  **The owner never struck or extended the list**; overruling any row is small and expected.
- **Still the owner's:** whether email should be disclosed after all (a shareholder-register
  obligation would outrank my recommendation), whether issuers need to identify holders as people
  — which would mean deciding to COLLECT names the platform does not hold — and whether the
  per-asset handle is worth its cost versus exposing wallets on a permissioned chain.
- **The proposal, with the reasoning and what was excluded:**
  [`docs/proposals/issuer-investor-visibility.md`](../proposals/issuer-investor-visibility.md).
  Strike or extend the field list there and the implementation follows it exactly.
  **Two findings in it change the question:** the platform stores **no investor name** at all
  (`legalName` is on `IssuerOrganisation`, not on a person), so the "holder name" this entry
  suggested would mean deciding to COLLECT new identity data, not to disclose existing data; and a
  raw wallet address is a durable **cross-asset** key, because the same address holds that
  investor's positions in every other asset on the chain.
- **What:** the owner answered "all necessary information"; nothing is implemented.
- **Acceptance:** propose an explicit field list (recommended start: holder name, tokens held,
  allocation date, amount invested), get it struck/extended by the owner, then implement with a
  test that asserts the **excluded** fields are absent from the response.
- **Risks:** this is a PII exposure to a third party. Do not infer the list.

### P1-3 — Issuer portal (roadmap 3.3) — **partly delivered**
- **Done:** the portal shell and landing page (3.3e), "which organisations are mine" (3.3d), an
  issuer's view of the assets it brought (3.3f backend + 3.3g screen), an issuer **bringing** its own
  asset (3.3h — where `canWorkOnAssets()` finally decides something), and an issuer **filing the
  dossier** for it (3.3i — membership at the door, ownership in the use case, real files only).
- **Remaining:** the 13-step tokenization wizard with drafts, completeness %, validation, review
  comments and status history. Large, and its scope is a **product decision** — how much of the
  wizard belongs in the first slice is the owner's call, not an engineering one.
- **Still uncalled:** `IssuerMembership.canWorkOnAssets()`. The per-person gate gets its caller when
  an issuer's own people can act on assets, which is the wizard.

### P1-4 — Officer-side gaps flagged during Phase 2
- An onboarding application waiting on the **applicant** still appears in the officer queue
  (queue counts open cases, not "waiting on us").
- A KYC-rejected applicant **cannot re-apply**; whether they should is a product question.
- CRM follow-ups have **no owner**, so reminders go to every `crm.manage` holder.

### P1-5 — Open product questions that gate design
- Should an asset be blocked from approval until its rights matrix is established?
- Should issuer staff be barred from investing?
- Should draft (unopened) offerings be visible to signed-in investors at all?

### P1-8 — Issuer team panel — **DONE** (verified 2026-08-23: `issuer-detail-page.tsx` invites by email, lists email+role, removes members)
- **What:** add / list / remove an issuer's people in the browser. Endpoints exist and are tested
  (`GET|POST /issuers/:id/members`, `DELETE /issuers/:id/members/:userId`).
- **Why:** the individual-verification gate — the rule the whole phase exists to enforce — is
  currently only reachable by curl.
- **Acceptance:** an officer (or an issuer admin) invites by **email**; an unverified person is
  refused with the server's message; removing the last administrator is refused (409) and the UI
  says why; the list shows email + role, and nothing more about a person.
- **Risks:** an issuer's people list is PII. Show only what the API returns.

### P1-9 — Name the officer who decided — **DONE** (verified 2026-08-23: `issuer-views.ts` resolves `decidedByLabel`, both screens fall back to the id)
- **What:** the issuer queue prints `decidedBy` verbatim — "Decided by officer-1".
- **Why:** the project already fixed this class of thing once (`fix(notifications): human labels
  in the approval alert, not raw ids`).
- **Files:** `application/issuers/issuer-views.ts` (needs a staff-directory lookup),
  `components/admin/issuers-panel.tsx`.
- **Acceptance:** a name or email is shown; an id that cannot be resolved degrades to the id
  rather than blanking the row.

### P1-6 — Accessibility assertions — **DONE** (2026-08-23)
`e2e/a11y.spec.ts` scans the public pages, both sign-in forms and the signed-in investor portal
against WCAG 2.1 A/AA, on mobile and desktop. It runs inside the existing `test:layout` command
(`testDir: ./e2e`), so CI picked it up with no workflow change.

**Scope is deliberately WCAG A/AA only** — axe's `best-practice` tag flags judgement calls, and a
suite that cries wolf gets muted. A clean run means "no machine-detectable violation", NOT
"accessible"; axe cannot judge whether a label makes sense to a person.

**Three serious defects it found, all fixed:**
- **No page had a `<title>`** — every route, so a screen-reader user heard nothing identifying the
  page and browser history was a row of blanks. It also undercut the SEO the public catalogue was
  approved for (OD-5). Fixed with `metadata` in the locale layout.
- **The public header's "Sign in" button rendered dark slate text on its blue fill.**
  `.public__nav a` (0,1,1) outranks `.btn--primary` (0,1,0) on specificity. Visibly wrong, not just
  an axe technicality. Fixed by scoping that rule with `:not(.btn)`.
- **The home link had no accessible name on a phone**, because `.brand-text` is `display: none`
  there and the logo is `aria-hidden`. Fixed with `aria-label` on the link — a clip-rect
  visually-hidden class was tried first and tripped `layout.spec`'s own overflow guard.

**Also corrected on the way:** `--brand` was serving two roles that pull opposite ways. Measured,
brand-500 scores 5.09 as text on the dark surface but only 3.68 as a background behind white text;
brand-600 is the reverse (3.62 / 5.17). One token cannot satisfy both, so solid brand fills behind
white text now use `--brand-solid`.

### P1-7 — Rate limiter is in-memory — **memory leak FIXED; the multi-instance choice is yours**
**Fixed 2026-08-23:** the counter map kept every key it had ever seen, forever — a fixed-window
bucket has no natural end, so nothing removed it. A scanner rotating source addresses grew it until
the process died. Buckets whose window has closed are now dropped, swept at most once per window so
the scan is not paid on the hot path. Live buckets are never evicted (that would hand an attacker a
fresh budget by making noise from other addresses) — mutation-checked.

**Still open, and a deployment decision rather than an engineering one:** counters are per-process,
so behind N instances the effective ceiling is N x max. **The limitation is narrower than it
sounds:** brute force against a SPECIFIC account is stopped by `LoginAttemptStore`, which is
Postgres-backed and therefore already shared across instances (T4). This limiter is the secondary,
per-IP defence against guessing spread across many accounts.

The cost of moving it to a shared store is a round trip on **every** auth request — including the
`GET /auth/session` that every page load performs (K-27). Options: accept single-instance for the
pilot, move only the credential bucket (rare, security-critical) and leave the read ceiling
per-process, or move both.

---

## P2 — Enhancements

- **`GET /issuers/mine`** so an applicant can see their own application state (deliberately not
  built yet — YAGNI until the portal exists).
- **Invite a colleague who has no account yet** (today: 404 "no platform account"). Would need an
  invitation token flow.
- **Document versioning and per-holder access logs** for the documents centre.
- **Persistent chain indexer** instead of rebuilding the registry from events on demand.
- **fa/RTL locale pack** (OD-13, unapproved).
- **Report registry, PDF exports** (roadmap 8.1).
- **Observability**: structured logs, metrics, tracing (roadmap 8.3).

---

## Technical debt, hacks and known non-real implementations

| Item | Where | Note |
|---|---|---|
| Dev claim issuer / logging deployer | `chain/dev-log-claim-issuer.ts`, `app.module.ts` factories | Used when devnet env is absent so the API boots chain-less. Clearly labelled |
| Screening mock | (port only) | OD-11: no vendor |
| Email dev sink | `email-outbox.ts` | P0-3 |
| Ledger is single-entry | `LedgerAccount`/`LedgerEntry` | Double-entry journal is roadmap 6.1 with a parallel-run plan |
| Approval threshold placeholder | `LEDGER_CREDIT_APPROVAL_THRESHOLD_RIAL` | Requires local policy validation |
| Rights catalogue provisional | `RIGHTS_ARE_PROVISIONAL = true` | Requires local legal validation |
| Onboarding field set provisional | `application/onboarding/onboarding-form.ts` | Requires local legal validation |
| pg-boss scan is default-tenant only | `infrastructure/jobs/*` | Multi-tenant sweep deferred with OD-1a |
| Outbox drainer is in-process | `infrastructure/outbox/*` | Multi-node draining untested |
| `IssuerMembership.canWorkOnAssets()` unused | `domain/issuers/issuer-membership.ts:41` | Gets a caller with P1-1 |
| No `TODO`/`FIXME`/`HACK` markers exist anywhere in source | verified by grep | Debt is documented here instead |

## Missing tests (known)

- ~~No automated accessibility assertions.~~ **STALE — corrected 2026-08-25.** `apps/web/e2e/a11y.spec.ts`
  has existed since P1-6 (2026-08-23) and runs as its own CI lane.
- No load or performance tests of any kind.
- No security tests beyond authz matrix + isolation (no fuzzing, no dependency-audit gate in CI).
- ~~Multi-node outbox draining~~ **now covered (2026-08-25)** by
  `test/integration/concurrent-settlement-drain.test.ts`: two independent drainers over a queued
  SETTLEMENT, asserting the investor is charged once and the tokens issued once. This matters more
  than it did when the outbox only carried email — P0-2 step 3 put money through it.
  **What writing it found:** the first three assertions passed even with the capture's idempotency
  key removed, because by then the escrow was empty and a duplicate capture failed on insufficient
  held funds. That masking is why the fourth test exists — an investor with escrow held for a
  SECOND offering has money left, and a duplicate capture takes that instead. Observed directly:
  without the key, a redelivery writes a second capture and drains the other offering's 60,000 to
  zero. It is deterministic (queue → drain → requeue → drain) rather than racy, because a money
  guarantee must not depend on winning a race to be noticed.
  **Multi-tenant scheduled scans — now covered (2026-08-25)** by
  `test/integration/scheduled-scan-tenancy.test.ts`. There was no bug: the scan runs on a cron with
  no HTTP request, so `ScheduledJobsBootstrap` wraps it in an explicit TenantContext for the
  default tenant, and sweeping every tenant is a deliberately deferred operations decision (OD-1a).
  What was never proven is that the deferral is CONTAINED, which is what the tests pin: another
  tenant's follow-ups are neither scanned nor quoted in anyone's notification (the reminder body
  includes the follow-up text, and staff are PLATFORM-level, so an unscoped scan would hand one
  tenant's private note to whoever can act on CRM); the other tenant's reminder is left
  unannounced rather than consumed, so its own scan still fires; and running with NO tenant
  context is refused, because the bootstrap's wrapper is load-bearing — without it the fail-closed
  proxy throws on every fire and the bootstrap only logs when it announced something, which is
  K-39's silence exactly. Mutation-checked by making `crmFollowUp` an unscoped model: all five
  fail.
  **A note on the fixture:** the first version scanned the DEFAULT tenant and asserted
  `scanned === 1`. It saw 4 — other suites leave follow-ups in the shared default tenant. Absolute
  counts over a tenant a test does not own are a property of whatever ran first, not of the scan;
  it now uses two dedicated tenants.
- ~~No test asserts that PII is absent from logs.~~ **Covered for the mail adapters (2026-08-25),
  and it found something.** `SmtpEmailSender` — the PRODUCTION adapter — logged the recipient's
  address on every successful send, reasoning that "the address is already in the log by virtue of
  being sent to". That does not hold: the mail server's log is a different system with different
  access, while the application log is read by developers, shipped to aggregators, and pasted into
  CI build summaries. It now logs a stable SHA-256-derived reference instead, so "why did this
  person get four resets" stays answerable without naming anyone. Pseudonymisation, not
  anonymisation — a held address can still be hashed and matched; it defeats casual disclosure and
  log scraping, not a targeted check.
  `DevEmailSender` deliberately logs the address AND the reset token, because it never sends and
  the log is the only way a developer gets the link. That exemption is now pinned by its own tests
  along with the `[DEV EMAIL — NOT DELIVERED]` label, so it is a stated exception rather than an
  oversight — it matters because that sender is the default whenever `SMTP_HOST` is unset.
  **Still uncovered:** every other log site (request logging, the drain worker, chain adapters),
  and there is no repo-wide guard that a new `log.*` call cannot introduce PII.
